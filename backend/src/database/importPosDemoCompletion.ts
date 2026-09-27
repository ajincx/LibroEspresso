import dotenv from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { calculateIngredientCost, normalizeUnit, SUPPORTED_UNITS } from "../services/unitConversion.service.js";
import { saveRecipeDefinition } from "../services/recipeVersion.service.js";
import {
  POS_DEMO_BASELINE,
  POS_DEMO_EFFECTIVE_FROM,
  POS_DEMO_INGREDIENTS,
  POS_DEMO_PROVENANCE,
  POS_DEMO_RECIPES,
} from "./posDemoCompletionBatch.js";

const backendDir = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
dotenv.config({ path: resolve(backendDir, ".env"), quiet: true });

const protectedTables = [
  "branch_inventory_balances", "branch_inventory_settings", "inventory_movements", "inventory_counts",
  "inventory_count_items", "menu_items", "menu_item_variants", "pos_sources", "pos_product_variant_mappings",
  "pos_imports", "pos_sale_items", "pos_sale_ingredient_usage",
] as const;

function requireCondition(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

const identity = (name: string) => name.normalize("NFKC").toLowerCase().replace(/[^a-z0-9]/g, "");

async function hashQuery(client: pg.PoolClient, sql: string, values: unknown[] = []) {
  const result = await client.query<{ hash: string }>(
    `SELECT md5(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'[]')) hash FROM (${sql}) t`, values,
  );
  return result.rows[0]!.hash;
}

type InventoryRow = { id: string; sku: string; name: string; unit: string; unitCost: number; status: string };
type ResolvedRecipe = {
  productId: string;
  variantId: string;
  category: string;
  product: string;
  variant: string;
  sellingPrice: number;
  ingredients: Array<InventoryRow & { quantity: number; recipeUnit: string }>;
  recipeCost: number;
  margin: number;
  marginRate: number;
};

async function resolveRecipes(client: pg.PoolClient, inventory: Map<string, InventoryRow>): Promise<ResolvedRecipe[]> {
  const resolved: ResolvedRecipe[] = [];
  for (const candidate of POS_DEMO_RECIPES) {
    const variant = await client.query<{ productId: string; variantId: string; sellingPrice: number }>(
      `SELECT mi.id "productId",v.id "variantId",v.selling_price::float8 "sellingPrice"
         FROM menu_items mi JOIN menu_categories mc ON mc.id=mi.category_id JOIN menu_item_variants v ON v.menu_item_id=mi.id
        WHERE mc.name=$1 AND mi.name=$2 AND v.name=$3 AND mi.status='ACTIVE'
          AND mi.approval_status='APPROVED' AND v.status='ACTIVE'`,
      [candidate.category, candidate.product, candidate.variant],
    );
    requireCondition(variant.rows.length === 1, `Expected one active target for ${candidate.product} ${candidate.variant}`);
    const savedVariant = variant.rows[0]!;
    const existing = await client.query(`SELECT id FROM recipes WHERE menu_item_variant_id=$1`, [savedVariant.variantId]);
    requireCondition(existing.rows.length === 0, `${candidate.product} ${candidate.variant} already has a recipe`);
    const ingredients = candidate.ingredients.map((requested) => {
      const saved = inventory.get(identity(requested.name));
      requireCondition(saved && saved.status === "ACTIVE", `Missing or inactive ingredient ${requested.name}`);
      requireCondition(normalizeUnit(saved.unit) === normalizeUnit(requested.unit), `Unit mismatch for ${requested.name}`);
      requireCondition(saved.unitCost > 0 && requested.quantity > 0, `Cost and quantity must be positive for ${requested.name}`);
      return { ...saved, quantity: requested.quantity, recipeUnit: requested.unit };
    });
    requireCondition(new Set(ingredients.map(({ id, name }) => id || name)).size === ingredients.length,
      `Duplicate ingredient in ${candidate.product}`);
    const recipeCost = ingredients.reduce((sum, item) => sum + calculateIngredientCost({
      recipeQuantity: item.quantity, recipeUnit: item.recipeUnit, inventoryUnit: item.unit, unitCost: item.unitCost,
    }), 0);
    const sellingPrice = Number(savedVariant.sellingPrice);
    requireCondition(recipeCost > 0 && recipeCost < sellingPrice, `Invalid demonstration cost for ${candidate.product}`);
    const margin = sellingPrice - recipeCost;
    resolved.push({ productId: savedVariant.productId, variantId: savedVariant.variantId, category: candidate.category,
      product: candidate.product, variant: candidate.variant, sellingPrice, ingredients, recipeCost, margin,
      marginRate: (margin / sellingPrice) * 100 });
  }
  return resolved;
}

async function databaseCounts(client: pg.PoolClient) {
  return (await client.query<{ products: number; variants: number; ingredients: number; recipes: number; recipeItems: number; sources: number; mappings: number; imports: number; saleItems: number }>(
    `SELECT (SELECT count(*)::int FROM menu_items) products,(SELECT count(*)::int FROM menu_item_variants) variants,
            (SELECT count(*)::int FROM inventory_items) ingredients,(SELECT count(*)::int FROM recipes) recipes,
            (SELECT count(*)::int FROM recipe_items) "recipeItems",(SELECT count(*)::int FROM pos_sources) sources,
            (SELECT count(*)::int FROM pos_product_variant_mappings) mappings,(SELECT count(*)::int FROM pos_imports) imports,
            (SELECT count(*)::int FROM pos_sale_items) "saleItems"`,
  )).rows[0]!;
}

async function main() {
  const args = process.argv.slice(2);
  requireCondition(args.length <= 1 && (args.length === 0 || args[0] === "--apply"),
    "Usage: tsx src/database/importPosDemoCompletion.ts [--apply]");
  const apply = args[0] === "--apply";
  requireCondition(process.env.DATABASE_URL, "DATABASE_URL is required");
  requireCondition(POS_DEMO_INGREDIENTS.every(({ unit, unitCost }) =>
    SUPPORTED_UNITS.includes(unit) && Number(unitCost) > 0), "Every proposed ingredient must use a supported unit and positive cost");
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  let transactionOpen = false;
  try {
    await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
    transactionOpen = true;
    await client.query("LOCK TABLE inventory_items,recipes,recipe_items IN SHARE ROW EXCLUSIVE MODE");
    const before = await databaseCounts(client);
    requireCondition(before.products === 69 && before.variants === 81 && before.ingredients === POS_DEMO_BASELINE.ingredients &&
      before.recipes === POS_DEMO_BASELINE.recipes && before.recipeItems === POS_DEMO_BASELINE.recipeItems &&
      before.sources === 1 && before.mappings === 29 && before.imports === 0 && before.saleItems === 0,
      `Unexpected database state: ${JSON.stringify(before)}`);

    const originalInventory = await client.query<InventoryRow>(
      `SELECT id,sku,name,unit,unit_cost::float8 "unitCost",status FROM inventory_items ORDER BY id`,
    );
    const originalInventoryIds = originalInventory.rows.map(({ id }) => id);
    const inventoryHash = await hashQuery(client, `SELECT * FROM inventory_items WHERE id=ANY($1::uuid[])`, [originalInventoryIds]);
    const inventory = new Map(originalInventory.rows.map((row) => [identity(row.name), row]));
    for (const proposed of POS_DEMO_INGREDIENTS) {
      requireCondition(!inventory.has(identity(proposed.name)), `Ingredient already exists or conflicts: ${proposed.name}`);
      inventory.set(identity(proposed.name), { id: "", sku: "PENDING", name: proposed.name, unit: proposed.unit,
        unitCost: Number(proposed.unitCost), status: "ACTIVE" });
    }
    requireCondition(inventory.size === originalInventory.rows.length + POS_DEMO_INGREDIENTS.length,
      "Proposed ingredient names are not unique");

    const protectedSnapshots = new Map(await Promise.all(protectedTables.map(async (table) =>
      [table, await hashQuery(client, `SELECT * FROM ${table}`)] as const)));
    const existingRecipes = await client.query<{ id: string }>(`SELECT id FROM recipes ORDER BY id`);
    const existingRecipeIds = existingRecipes.rows.map(({ id }) => id);
    const recipesHash = await hashQuery(client, `SELECT * FROM recipes WHERE id=ANY($1::uuid[])`, [existingRecipeIds]);
    const recipeItemsHash = await hashQuery(client, `SELECT * FROM recipe_items WHERE recipe_id=ANY($1::uuid[])`, [existingRecipeIds]);
    const owner = await client.query<{ id: string }>(`SELECT id FROM users WHERE role='OWNER' AND status='ACTIVE' ORDER BY created_at LIMIT 1`);
    requireCondition(owner.rows.length === 1, "An active Owner is required for audit attribution");
    const previewRecipes = await resolveRecipes(client, inventory);
    const expectedItems = POS_DEMO_RECIPES.reduce((sum, recipe) => sum + recipe.ingredients.length, 0);
    requireCondition(previewRecipes.length === 22 && expectedItems === 91, "Expected exactly 22 recipes and 91 recipe items");

    if (!apply) {
      await client.query("ROLLBACK");
      transactionOpen = false;
      console.log(JSON.stringify({ transaction: "DRY_RUN_ROLLED_BACK", before,
        expectedAfter: { ...before, ingredients: 60, recipes: 63, recipeItems: 253 },
        provenance: POS_DEMO_PROVENANCE, effectiveFrom: POS_DEMO_EFFECTIVE_FROM,
        ingredients: POS_DEMO_INGREDIENTS, recipes: previewRecipes.map(({ ingredients: items, ...recipe }) => ({
          ...recipe, ingredients: items.map(({ name, quantity, recipeUnit }) => ({ name, quantity, unit: recipeUnit })),
        })),
      }, null, 2));
      return;
    }

    const insertedIngredients: InventoryRow[] = [];
    for (const proposed of POS_DEMO_INGREDIENTS) {
      const code = await client.query<{ sku: string }>(`SELECT 'ING-'||lpad(nextval('inventory_item_code_seq')::text,5,'0') sku`);
      const inserted = await client.query<InventoryRow>(
        `INSERT INTO inventory_items (sku,name,category,unit,unit_cost,reorder_level,status,item_scope,origin_branch_id,created_by)
         VALUES ($1,$2,$3,$4,$5,0,'ACTIVE','GLOBAL',NULL,$6)
         RETURNING id,sku,name,unit,unit_cost::float8 "unitCost",status`,
        [code.rows[0]!.sku, proposed.name, proposed.category, proposed.unit, proposed.unitCost, owner.rows[0]!.id],
      );
      const saved = inserted.rows[0]!;
      await client.query(
        `INSERT INTO audit_logs (user_id,branch_id,action,entity_type,entity_id,description,metadata)
         VALUES ($1,NULL,'CREATE_SAMPLE_INGREDIENT','INVENTORY_ITEM',$2,$3,$4::jsonb)`,
        [owner.rows[0]!.id, saved.id, `Created ${saved.name}; ${POS_DEMO_PROVENANCE}`,
          JSON.stringify({ source: "posDemoCompletionBatch.ts", provenance: POS_DEMO_PROVENANCE,
            unit: saved.unit, unitCost: saved.unitCost })],
      );
      inventory.set(identity(saved.name), saved);
      insertedIngredients.push(saved);
    }

    const resolvedRecipes = await resolveRecipes(client, inventory);
    const insertedRecipes = [];
    for (const recipe of resolvedRecipes) {
      const saved = await saveRecipeDefinition(client, {
        menuItemId: recipe.productId, menuItemVariantId: recipe.variantId,
        name: `${recipe.product} ${recipe.variant} Recipe`, yieldQuantity: 1, status: "ACTIVE",
        items: recipe.ingredients.map(({ id, quantity, recipeUnit }) => ({ inventoryItemId: id, quantity, unit: recipeUnit })),
        effectiveFrom: POS_DEMO_EFFECTIVE_FROM, changeReason: POS_DEMO_PROVENANCE, createdBy: owner.rows[0]!.id,
      });
      requireCondition(saved.version === 1 && !saved.createdVersion, `${recipe.product} was not created as version 1`);
      await client.query(
        `INSERT INTO audit_logs (user_id,branch_id,action,entity_type,entity_id,description,metadata)
         VALUES ($1,NULL,'CREATE_SAMPLE_RECIPE','RECIPE',$2,$3,$4::jsonb)`,
        [owner.rows[0]!.id, saved.recipeId, `Created ${recipe.product} Standard recipe; ${POS_DEMO_PROVENANCE}`,
          JSON.stringify({ source: "posDemoCompletionBatch.ts", provenance: POS_DEMO_PROVENANCE,
            effectiveFrom: POS_DEMO_EFFECTIVE_FROM, product: recipe.product, variant: recipe.variant,
            recipeCost: recipe.recipeCost, sellingPrice: recipe.sellingPrice, margin: recipe.margin, marginRate: recipe.marginRate })],
      );
      insertedRecipes.push({ recipeId: saved.recipeId, version: saved.version, ...recipe });
    }

    for (const table of protectedTables) {
      requireCondition(await hashQuery(client, `SELECT * FROM ${table}`) === protectedSnapshots.get(table), `${table} changed unexpectedly`);
    }
    requireCondition(await hashQuery(client, `SELECT * FROM inventory_items WHERE id=ANY($1::uuid[])`, [originalInventoryIds]) === inventoryHash,
      "An existing inventory item changed");
    requireCondition(await hashQuery(client, `SELECT * FROM recipes WHERE id=ANY($1::uuid[])`, [existingRecipeIds]) === recipesHash,
      "An existing recipe changed");
    requireCondition(await hashQuery(client, `SELECT * FROM recipe_items WHERE recipe_id=ANY($1::uuid[])`, [existingRecipeIds]) === recipeItemsHash,
      "An existing recipe item changed");
    const createdBalances = await client.query<{ count: number }>(
      `SELECT ((SELECT count(*) FROM branch_inventory_balances WHERE inventory_item_id=ANY($1::uuid[]))+
               (SELECT count(*) FROM branch_inventory_settings WHERE inventory_item_id=ANY($1::uuid[])))::int count`,
      [insertedIngredients.map(({ id }) => id)],
    );
    requireCondition(createdBalances.rows[0]!.count === 0, "Opening balances or branch settings were created unexpectedly");
    const after = await databaseCounts(client);
    requireCondition(after.products === 69 && after.variants === 81 && after.ingredients === 60 && after.recipes === 63 &&
      after.recipeItems === 253 && after.sources === 1 && after.mappings === 29 && after.imports === 0 && after.saleItems === 0,
      `Unexpected final state: ${JSON.stringify(after)}`);
    const stored = await client.query<{ version: number; effectiveFrom: string; status: string; changeReason: string; itemCount: number }>(
      `SELECT r.version,r.effective_from::text "effectiveFrom",r.status,r.change_reason "changeReason",count(ri.id)::int "itemCount"
         FROM recipes r JOIN recipe_items ri ON ri.recipe_id=r.id WHERE r.id=ANY($1::uuid[])
        GROUP BY r.id,r.version,r.effective_from,r.status,r.change_reason`,
      [insertedRecipes.map(({ recipeId }) => recipeId)],
    );
    requireCondition(stored.rows.length === 22 && stored.rows.every((row) => row.version === 1 && row.status === "ACTIVE" &&
      row.effectiveFrom === POS_DEMO_EFFECTIVE_FROM && row.changeReason === POS_DEMO_PROVENANCE && row.itemCount > 0),
      "Stored recipes failed final validation");
    await client.query("COMMIT");
    transactionOpen = false;
    console.log(JSON.stringify({ transaction: "COMMITTED", before, after, provenance: POS_DEMO_PROVENANCE,
      effectiveFrom: POS_DEMO_EFFECTIVE_FROM, insertedIngredients,
      insertedRecipes: insertedRecipes.map(({ ingredients: items, ...recipe }) => ({ ...recipe,
        ingredients: items.map(({ id, sku, name, quantity, recipeUnit }) => ({ id, sku, name, quantity, unit: recipeUnit })) })),
      previousIngredientsVerified: originalInventoryIds.length, previousRecipesVerified: existingRecipeIds.length,
      createdBalances: createdBalances.rows[0]!.count, protectedTablesVerified: protectedTables }, null, 2));
  } catch (error) {
    if (transactionOpen) await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
