import dotenv from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { calculateIngredientCost, normalizeUnit } from "../services/unitConversion.service.js";
import { saveRecipeDefinition } from "../services/recipeVersion.service.js";
import {
  RECIPE_COVERAGE_BATCH3,
  RECIPE_COVERAGE_BATCH3_BASELINE,
  RECIPE_COVERAGE_BATCH3_EFFECTIVE_FROM,
  RECIPE_COVERAGE_BATCH3_PROVENANCE,
} from "./recipeCoverageBatch3.js";

const backendDir = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
dotenv.config({ path: resolve(backendDir, ".env"), quiet: true });
const protectedTables = ["inventory_items", "branch_inventory_balances", "branch_inventory_settings",
  "inventory_movements", "inventory_counts", "inventory_count_items", "menu_items", "menu_item_variants",
  "pos_sources", "pos_product_variant_mappings", "pos_imports", "pos_sale_items", "pos_sale_ingredient_usage"] as const;

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
type InventoryRow = { id: string; name: string; unit: string; unitCost: number; status: string };
type ResolvedRecipe = { productId: string; variantId: string; product: string; variant: string; sellingPrice: number;
  ingredients: Array<InventoryRow & { quantity: number; recipeUnit: string }>;
  recipeCost: number; margin: number; marginRate: number };

async function resolveBatch(client: pg.PoolClient): Promise<ResolvedRecipe[]> {
  const inventoryRows = await client.query<InventoryRow>(
    `SELECT id,name,unit,unit_cost::float8 "unitCost",status FROM inventory_items`);
  const inventory = new Map(inventoryRows.rows.map((row) => [identity(row.name), row]));
  const resolved: ResolvedRecipe[] = [];
  for (const candidate of RECIPE_COVERAGE_BATCH3) {
    const result = await client.query<{ productId: string; variantId: string; sellingPrice: number }>(
      `SELECT mi.id "productId",v.id "variantId",v.selling_price::float8 "sellingPrice"
         FROM menu_items mi JOIN menu_categories mc ON mc.id=mi.category_id
         JOIN menu_item_variants v ON v.menu_item_id=mi.id
        WHERE mc.name=$1 AND mi.name=$2 AND v.name=$3 AND mi.status='ACTIVE'
          AND mi.approval_status='APPROVED' AND v.status='ACTIVE'`,
      [candidate.category, candidate.product, candidate.variant]);
    requireCondition(result.rows.length === 1, `Expected one active target for ${candidate.product}`);
    const variant = result.rows[0]!;
    requireCondition((await client.query(`SELECT id FROM recipes WHERE menu_item_variant_id=$1`, [variant.variantId])).rows.length === 0,
      `${candidate.product} already has a recipe history`);
    const ingredients = candidate.ingredients.map((requested) => {
      const saved = inventory.get(identity(requested.name));
      requireCondition(saved && saved.status === "ACTIVE", `Missing or inactive ingredient ${requested.name}`);
      requireCondition(normalizeUnit(saved.unit) === normalizeUnit(requested.unit), `Unit mismatch for ${requested.name}`);
      requireCondition(saved.unitCost > 0 && requested.quantity > 0, `Invalid cost or quantity for ${requested.name}`);
      return { ...saved, quantity: requested.quantity, recipeUnit: requested.unit };
    });
    requireCondition(new Set(ingredients.map(({ id }) => id)).size === ingredients.length,
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
    "Usage: tsx src/database/importRecipeCoverageBatch3.ts [--apply]");
  const apply = args[0] === "--apply";
  requireCondition(process.env.DATABASE_URL, "DATABASE_URL is required");
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  let open = false;
  try {
    await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE"); open = true;
    await client.query("LOCK TABLE recipes,recipe_items IN SHARE ROW EXCLUSIVE MODE");
    await client.query("LOCK TABLE inventory_items,branch_inventory_settings,branch_inventory_balances IN SHARE MODE");
    const before = await counts(client);
    requireCondition(before.products === 69 && before.variants === 81 &&
      before.ingredients === RECIPE_COVERAGE_BATCH3_BASELINE.ingredients &&
      before.recipes === RECIPE_COVERAGE_BATCH3_BASELINE.recipes &&
      before.recipeItems === RECIPE_COVERAGE_BATCH3_BASELINE.recipeItems,
    `Unexpected database state: ${JSON.stringify(before)}`);
    const protectedSnapshots = new Map(await Promise.all(protectedTables.map(async (table) =>
      [table, await hashQuery(client, `SELECT * FROM ${table}`)] as const)));
    const existingRecipeIds = (await client.query<{ id: string }>(`SELECT id FROM recipes ORDER BY id`)).rows.map(({ id }) => id);
    const recipesHash = await hashQuery(client, `SELECT * FROM recipes WHERE id=ANY($1::uuid[])`, [existingRecipeIds]);
    const itemsHash = await hashQuery(client, `SELECT * FROM recipe_items WHERE recipe_id=ANY($1::uuid[])`, [existingRecipeIds]);
    const owner = await client.query<{ id: string }>(`SELECT id FROM users WHERE role='OWNER' AND status='ACTIVE' ORDER BY created_at LIMIT 1`);
    requireCondition(owner.rows.length === 1, "An active Owner is required for audit attribution");
    const batch = await resolveBatch(client);
    requireCondition(batch.length === 3 && batch.reduce((sum, recipe) => sum + recipe.ingredients.length, 0) === 20,
      "Expected exactly three recipes and 20 recipe items");
    if (!apply) {
      await client.query("ROLLBACK"); open = false;
      console.log(JSON.stringify({ transaction: "DRY_RUN_ROLLED_BACK", before,
        expectedAfter: { ...before, recipes: 74, recipeItems: 316 },
        provenance: RECIPE_COVERAGE_BATCH3_PROVENANCE, effectiveFrom: RECIPE_COVERAGE_BATCH3_EFFECTIVE_FROM,
        recipes: batch }, null, 2));
      return;
    }
    const inserted = [];
    for (const recipe of batch) {
      const saved = await saveRecipeDefinition(client, { menuItemId: recipe.productId,
        menuItemVariantId: recipe.variantId, name: `${recipe.product} ${recipe.variant} Recipe`, yieldQuantity: 1,
        status: "ACTIVE", items: recipe.ingredients.map(({ id, quantity, recipeUnit }) =>
          ({ inventoryItemId: id, quantity, unit: recipeUnit })), effectiveFrom: RECIPE_COVERAGE_BATCH3_EFFECTIVE_FROM,
        changeReason: RECIPE_COVERAGE_BATCH3_PROVENANCE, createdBy: owner.rows[0]!.id });
      requireCondition(saved.version === 1 && !saved.createdVersion, `${recipe.product} was not created as version 1`);
      await client.query(`INSERT INTO audit_logs (user_id,branch_id,action,entity_type,entity_id,description,metadata)
        VALUES ($1,NULL,'CREATE_SAMPLE_RECIPE','RECIPE',$2,$3,$4::jsonb)`,
      [owner.rows[0]!.id, saved.recipeId, `Created ${recipe.product} Standard recipe; ${RECIPE_COVERAGE_BATCH3_PROVENANCE}`,
        JSON.stringify({ source: "recipeCoverageBatch3.ts", provenance: RECIPE_COVERAGE_BATCH3_PROVENANCE,
          effectiveFrom: RECIPE_COVERAGE_BATCH3_EFFECTIVE_FROM, product: recipe.product, recipeCost: recipe.recipeCost,
          sellingPrice: recipe.sellingPrice, margin: recipe.margin, marginRate: recipe.marginRate })]);
      inserted.push({ recipeId: saved.recipeId, version: saved.version, ...recipe });
    }
    for (const table of protectedTables) requireCondition(
      await hashQuery(client, `SELECT * FROM ${table}`) === protectedSnapshots.get(table), `${table} changed unexpectedly`);
    requireCondition(await hashQuery(client, `SELECT * FROM recipes WHERE id=ANY($1::uuid[])`, [existingRecipeIds]) === recipesHash,
      "An existing recipe changed");
    requireCondition(await hashQuery(client, `SELECT * FROM recipe_items WHERE recipe_id=ANY($1::uuid[])`, [existingRecipeIds]) === itemsHash,
      "An existing recipe item changed");
    const after = await counts(client);
    requireCondition(after.products === before.products && after.variants === before.variants &&
      after.ingredients === before.ingredients && after.recipes === 74 && after.recipeItems === 316 &&
      after.sources === before.sources && after.mappings === before.mappings &&
      after.imports === before.imports && after.saleItems === before.saleItems,
    `Unexpected final state: ${JSON.stringify(after)}`);
    const stored = await client.query<{ version: number; status: string; effectiveFrom: string; changeReason: string; itemCount: number }>(
      `SELECT r.version,r.status,r.effective_from::text "effectiveFrom",r.change_reason "changeReason",count(ri.id)::int "itemCount"
         FROM recipes r JOIN recipe_items ri ON ri.recipe_id=r.id WHERE r.id=ANY($1::uuid[]) GROUP BY r.id`,
      [inserted.map(({ recipeId }) => recipeId)]);
    requireCondition(stored.rows.length === 3 && stored.rows.every((row) => row.version === 1 && row.status === "ACTIVE" &&
      row.effectiveFrom === RECIPE_COVERAGE_BATCH3_EFFECTIVE_FROM && row.changeReason === RECIPE_COVERAGE_BATCH3_PROVENANCE),
      "Stored recipes failed final validation");
    await client.query("COMMIT"); open = false;
    console.log(JSON.stringify({ transaction: "COMMITTED", before, after, inserted,
      previousRecipesVerified: existingRecipeIds.length, protectedTablesVerified: protectedTables }, null, 2));
  } catch (error) { if (open) await client.query("ROLLBACK"); throw error; }
  finally { client.release(); await pool.end(); }
}
main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
