import dotenv from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { calculateIngredientCost, normalizeUnit, SUPPORTED_UNITS } from "../services/unitConversion.service.js";
import { saveRecipeDefinition } from "../services/recipeVersion.service.js";
import {
  FINAL_RECIPE_COVERAGE_BASELINE,
  FINAL_RECIPE_COVERAGE_BATCH,
  FINAL_RECIPE_COVERAGE_EFFECTIVE_FROM,
  FINAL_RECIPE_COVERAGE_PROVENANCE,
  FINAL_RECIPE_INGREDIENTS,
} from "./finalRecipeCoverageBatch.js";

const backendDir = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
dotenv.config({ path: resolve(backendDir, ".env"), quiet: true });
const protectedTables = ["branch_inventory_balances", "branch_inventory_settings", "inventory_movements",
  "inventory_counts", "inventory_count_items", "menu_items", "menu_item_variants", "pos_sources",
  "pos_product_variant_mappings", "pos_imports", "pos_sale_items", "pos_sale_ingredient_usage"] as const;
function requireCondition(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
const identity = (name: string) => name.normalize("NFKC").toLowerCase().replace(/[^a-z0-9]/g, "");
async function hashQuery(client: pg.PoolClient, sql: string, values: unknown[] = []) {
  return (await client.query<{ hash: string }>(
    `SELECT md5(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'[]')) hash FROM (${sql}) t`, values,
  )).rows[0]!.hash;
}
async function counts(client: pg.PoolClient) {
  return (await client.query<{ products: number; variants: number; ingredients: number; recipes: number;
    recipeItems: number; sources: number; mappings: number; imports: number; saleItems: number }>(`SELECT
      (SELECT count(*)::int FROM menu_items) products,(SELECT count(*)::int FROM menu_item_variants) variants,
      (SELECT count(*)::int FROM inventory_items) ingredients,(SELECT count(*)::int FROM recipes) recipes,
      (SELECT count(*)::int FROM recipe_items) "recipeItems",(SELECT count(*)::int FROM pos_sources) sources,
      (SELECT count(*)::int FROM pos_product_variant_mappings) mappings,(SELECT count(*)::int FROM pos_imports) imports,
      (SELECT count(*)::int FROM pos_sale_items) "saleItems"`)).rows[0]!;
}
type InventoryRow = { id: string; sku: string; name: string; unit: string; unitCost: number; status: string };
type ResolvedRecipe = { productId: string; variantId: string; product: string; variant: string; sellingPrice: number;
  ingredients: Array<InventoryRow & { quantity: number; recipeUnit: string }>;
  recipeCost: number; margin: number; marginRate: number };
async function resolveRecipes(client: pg.PoolClient, inventory: Map<string, InventoryRow>): Promise<ResolvedRecipe[]> {
  const resolved: ResolvedRecipe[] = [];
  for (const candidate of FINAL_RECIPE_COVERAGE_BATCH) {
    const target = await client.query<{ productId: string; variantId: string; sellingPrice: number }>(
      `SELECT mi.id "productId",v.id "variantId",v.selling_price::float8 "sellingPrice"
         FROM menu_items mi JOIN menu_categories mc ON mc.id=mi.category_id
         JOIN menu_item_variants v ON v.menu_item_id=mi.id
        WHERE mc.name=$1 AND mi.name=$2 AND v.name=$3 AND mi.status='ACTIVE'
          AND mi.approval_status='APPROVED' AND v.status='ACTIVE'`,
      [candidate.category, candidate.product, candidate.variant]);
    requireCondition(target.rows.length === 1, `Expected one active target for ${candidate.product}`);
    const variant = target.rows[0]!;
    requireCondition((await client.query(`SELECT id FROM recipes WHERE menu_item_variant_id=$1`, [variant.variantId])).rows.length === 0,
      `${candidate.product} already has a recipe history`);
    const ingredients = candidate.ingredients.map((requested) => {
      const saved = inventory.get(identity(requested.name));
      requireCondition(saved && saved.status === "ACTIVE", `Missing or inactive ingredient ${requested.name}`);
      requireCondition(normalizeUnit(saved.unit) === normalizeUnit(requested.unit), `Unit mismatch for ${requested.name}`);
      requireCondition(saved.unitCost > 0 && requested.quantity > 0, `Invalid cost or quantity for ${requested.name}`);
      return { ...saved, quantity: requested.quantity, recipeUnit: requested.unit };
    });
    requireCondition(new Set(ingredients.map(({ id, name }) => id || name)).size === ingredients.length,
      `Duplicate ingredient in ${candidate.product}`);
    const recipeCost = ingredients.reduce((sum, item) => sum + calculateIngredientCost({
      recipeQuantity: item.quantity, recipeUnit: item.recipeUnit, inventoryUnit: item.unit, unitCost: item.unitCost,
    }), 0);
    const sellingPrice = Number(variant.sellingPrice);
    requireCondition(recipeCost > 0 && recipeCost < sellingPrice, `Invalid demonstration cost for ${candidate.product}`);
    const margin = sellingPrice - recipeCost;
    resolved.push({ productId: variant.productId, variantId: variant.variantId, product: candidate.product,
      variant: candidate.variant, sellingPrice, ingredients, recipeCost, margin,
      marginRate: (margin / sellingPrice) * 100 });
  }
  return resolved;
}
async function main() {
  const args = process.argv.slice(2);
  requireCondition(args.length <= 1 && (args.length === 0 || args[0] === "--apply"),
    "Usage: tsx src/database/importFinalRecipeCoverage.ts [--apply]");
  const apply = args[0] === "--apply";
  requireCondition(process.env.DATABASE_URL, "DATABASE_URL is required");
  requireCondition(FINAL_RECIPE_INGREDIENTS.every(({ unit, unitCost }) =>
    SUPPORTED_UNITS.includes(unit) && unitCost > 0), "New ingredients require supported units and positive costs");
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  let open = false;
  try {
    await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE"); open = true;
    await client.query("LOCK TABLE inventory_items,recipes,recipe_items IN SHARE ROW EXCLUSIVE MODE");
    await client.query("LOCK TABLE branch_inventory_settings,branch_inventory_balances IN SHARE MODE");
    const before = await counts(client);
    requireCondition(before.products === 69 && before.variants === 81 &&
      before.ingredients === FINAL_RECIPE_COVERAGE_BASELINE.ingredients &&
      before.recipes === FINAL_RECIPE_COVERAGE_BASELINE.recipes &&
      before.recipeItems === FINAL_RECIPE_COVERAGE_BASELINE.recipeItems,
    `Unexpected database state: ${JSON.stringify(before)}`);
    const missingBefore = await client.query<{ count: number }>(`SELECT count(*)::int count
      FROM menu_item_variants v JOIN menu_items mi ON mi.id=v.menu_item_id
      WHERE v.status='ACTIVE' AND mi.status='ACTIVE' AND NOT EXISTS (
        SELECT 1 FROM recipes r WHERE r.menu_item_variant_id=v.id AND r.status='ACTIVE')`);
    requireCondition(missingBefore.rows[0]!.count === 7, "Expected exactly seven uncovered active variants");
    const protectedSnapshots = new Map(await Promise.all(protectedTables.map(async (table) =>
      [table, await hashQuery(client, `SELECT * FROM ${table}`)] as const)));
    const originalInventory = await client.query<InventoryRow>(
      `SELECT id,sku,name,unit,unit_cost::float8 "unitCost",status FROM inventory_items ORDER BY id`);
    const originalInventoryIds = originalInventory.rows.map(({ id }) => id);
    const inventoryHash = await hashQuery(client, `SELECT * FROM inventory_items WHERE id=ANY($1::uuid[])`, [originalInventoryIds]);
    const existingRecipeIds = (await client.query<{ id: string }>(`SELECT id FROM recipes ORDER BY id`)).rows.map(({ id }) => id);
    const recipesHash = await hashQuery(client, `SELECT * FROM recipes WHERE id=ANY($1::uuid[])`, [existingRecipeIds]);
    const itemsHash = await hashQuery(client, `SELECT * FROM recipe_items WHERE recipe_id=ANY($1::uuid[])`, [existingRecipeIds]);
    const inventory = new Map(originalInventory.rows.map((row) => [identity(row.name), row]));
    for (const proposed of FINAL_RECIPE_INGREDIENTS) {
      requireCondition(!inventory.has(identity(proposed.name)), `Ingredient already exists or conflicts: ${proposed.name}`);
      inventory.set(identity(proposed.name), { id: "", sku: "PENDING", name: proposed.name, unit: proposed.unit,
        unitCost: proposed.unitCost, status: "ACTIVE" });
    }
    const owner = await client.query<{ id: string }>(`SELECT id FROM users WHERE role='OWNER' AND status='ACTIVE' ORDER BY created_at LIMIT 1`);
    requireCondition(owner.rows.length === 1, "An active Owner is required for audit attribution");
    const preview = await resolveRecipes(client, inventory);
    requireCondition(preview.length === 7 && preview.reduce((sum, recipe) => sum + recipe.ingredients.length, 0) === 41,
      "Expected exactly seven recipes and 41 recipe items");
    if (!apply) {
      await client.query("ROLLBACK"); open = false;
      console.log(JSON.stringify({ transaction: "DRY_RUN_ROLLED_BACK", before,
        expectedAfter: { ...before, ingredients: 77, recipes: 81, recipeItems: 357 },
        ingredients: FINAL_RECIPE_INGREDIENTS, recipes: preview,
        provenance: FINAL_RECIPE_COVERAGE_PROVENANCE, effectiveFrom: FINAL_RECIPE_COVERAGE_EFFECTIVE_FROM }, null, 2));
      return;
    }
    const insertedIngredients: InventoryRow[] = [];
    for (const proposed of FINAL_RECIPE_INGREDIENTS) {
      const sku = (await client.query<{ sku: string }>(`SELECT 'ING-'||lpad(nextval('inventory_item_code_seq')::text,5,'0') sku`)).rows[0]!.sku;
      const saved = (await client.query<InventoryRow>(`INSERT INTO inventory_items
        (sku,name,category,unit,unit_cost,reorder_level,status,item_scope,origin_branch_id,created_by)
        VALUES ($1,$2,$3,$4,$5,0,'ACTIVE','GLOBAL',NULL,$6)
        RETURNING id,sku,name,unit,unit_cost::float8 "unitCost",status`,
      [sku, proposed.name, proposed.category, proposed.unit, proposed.unitCost, owner.rows[0]!.id])).rows[0]!;
      await client.query(`INSERT INTO audit_logs (user_id,branch_id,action,entity_type,entity_id,description,metadata)
        VALUES ($1,NULL,'CREATE_SAMPLE_INGREDIENT','INVENTORY_ITEM',$2,$3,$4::jsonb)`,
      [owner.rows[0]!.id, saved.id, `Created ${saved.name}; ${FINAL_RECIPE_COVERAGE_PROVENANCE}`,
        JSON.stringify({ source: "finalRecipeCoverageBatch.ts", provenance: FINAL_RECIPE_COVERAGE_PROVENANCE,
          unit: saved.unit, unitCost: saved.unitCost })]);
      inventory.set(identity(saved.name), saved); insertedIngredients.push(saved);
    }
    const resolved = await resolveRecipes(client, inventory);
    const insertedRecipes = [];
    for (const recipe of resolved) {
      const saved = await saveRecipeDefinition(client, { menuItemId: recipe.productId,
        menuItemVariantId: recipe.variantId, name: `${recipe.product} ${recipe.variant} Recipe`, yieldQuantity: 1,
        status: "ACTIVE", items: recipe.ingredients.map(({ id, quantity, recipeUnit }) =>
          ({ inventoryItemId: id, quantity, unit: recipeUnit })), effectiveFrom: FINAL_RECIPE_COVERAGE_EFFECTIVE_FROM,
        changeReason: FINAL_RECIPE_COVERAGE_PROVENANCE, createdBy: owner.rows[0]!.id });
      requireCondition(saved.version === 1 && !saved.createdVersion, `${recipe.product} was not created as version 1`);
      await client.query(`INSERT INTO audit_logs (user_id,branch_id,action,entity_type,entity_id,description,metadata)
        VALUES ($1,NULL,'CREATE_SAMPLE_RECIPE','RECIPE',$2,$3,$4::jsonb)`,
      [owner.rows[0]!.id, saved.recipeId, `Created ${recipe.product} Standard recipe; ${FINAL_RECIPE_COVERAGE_PROVENANCE}`,
        JSON.stringify({ source: "finalRecipeCoverageBatch.ts", provenance: FINAL_RECIPE_COVERAGE_PROVENANCE,
          effectiveFrom: FINAL_RECIPE_COVERAGE_EFFECTIVE_FROM, product: recipe.product, recipeCost: recipe.recipeCost,
          sellingPrice: recipe.sellingPrice, margin: recipe.margin, marginRate: recipe.marginRate })]);
      insertedRecipes.push({ recipeId: saved.recipeId, version: saved.version, ...recipe });
    }
    for (const table of protectedTables) requireCondition(
      await hashQuery(client, `SELECT * FROM ${table}`) === protectedSnapshots.get(table), `${table} changed unexpectedly`);
    requireCondition(await hashQuery(client, `SELECT * FROM inventory_items WHERE id=ANY($1::uuid[])`, [originalInventoryIds]) === inventoryHash,
      "An existing ingredient changed");
    requireCondition(await hashQuery(client, `SELECT * FROM recipes WHERE id=ANY($1::uuid[])`, [existingRecipeIds]) === recipesHash,
      "An existing recipe changed");
    requireCondition(await hashQuery(client, `SELECT * FROM recipe_items WHERE recipe_id=ANY($1::uuid[])`, [existingRecipeIds]) === itemsHash,
      "An existing recipe item changed");
    const createdStockRows = (await client.query<{ count: number }>(`SELECT (
      (SELECT count(*) FROM branch_inventory_balances WHERE inventory_item_id=ANY($1::uuid[]))+
      (SELECT count(*) FROM branch_inventory_settings WHERE inventory_item_id=ANY($1::uuid[])))::int count`,
      [insertedIngredients.map(({ id }) => id)])).rows[0]!.count;
    requireCondition(createdStockRows === 0, "New ingredients must not receive balances or branch settings");
    const after = await counts(client);
    requireCondition(after.products === before.products && after.variants === before.variants &&
      after.ingredients === 77 && after.recipes === 81 && after.recipeItems === 357 &&
      after.sources === before.sources && after.mappings === before.mappings &&
      after.imports === before.imports && after.saleItems === before.saleItems,
    `Unexpected final state: ${JSON.stringify(after)}`);
    const missingAfter = await client.query<{ count: number }>(`SELECT count(*)::int count
      FROM menu_item_variants v JOIN menu_items mi ON mi.id=v.menu_item_id
      WHERE v.status='ACTIVE' AND mi.status='ACTIVE' AND NOT EXISTS (
        SELECT 1 FROM recipes r WHERE r.menu_item_variant_id=v.id AND r.status='ACTIVE')`);
    requireCondition(missingAfter.rows[0]!.count === 0, "Every active variant must have an active recipe");
    const duplicates = await client.query<{ count: number }>(`SELECT count(*)::int count FROM (
      SELECT menu_item_variant_id,version FROM recipes GROUP BY menu_item_variant_id,version HAVING count(*)>1) duplicate_versions`);
    requireCondition(duplicates.rows[0]!.count === 0, "Duplicate recipe versions were created");
    await client.query("COMMIT"); open = false;
    console.log(JSON.stringify({ transaction: "COMMITTED", before, after, insertedIngredients, insertedRecipes,
      previousRecipesVerified: existingRecipeIds.length, missingVariantsAfter: missingAfter.rows[0]!.count,
      duplicateVersions: duplicates.rows[0]!.count, createdStockRows }, null, 2));
  } catch (error) { if (open) await client.query("ROLLBACK"); throw error; }
  finally { client.release(); await pool.end(); }
}
main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
