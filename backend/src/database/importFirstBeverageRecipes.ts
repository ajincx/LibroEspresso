import dotenv from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { calculateIngredientCost, normalizeUnit } from "../services/unitConversion.service.js";
import { saveRecipeDefinition } from "../services/recipeVersion.service.js";
import { FIRST_BEVERAGE_RECIPE_BATCH, SAMPLE_RECIPE_BASIS } from "./firstBeverageRecipeBatch.js";

const backendDir = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
dotenv.config({ path: resolve(backendDir, ".env"), quiet: true });
const protectedTables = [
  "inventory_items", "branch_inventory_balances", "branch_inventory_settings", "menu_items",
  "menu_item_variants", "pos_sources", "pos_product_variant_mappings",
] as const;

function requireCondition(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

async function fingerprint(client: pg.PoolClient, table: typeof protectedTables[number]) {
  const result = await client.query<{ hash: string }>(
    `SELECT md5(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'[]')) hash FROM ${table} t`,
  );
  return result.rows[0]!.hash;
}

type ResolvedRecipe = {
  productId: string;
  variantId: string;
  product: string;
  variant: string;
  sellingPrice: number;
  ingredients: Array<{ inventoryItemId: string; sku: string; name: string; quantity: number; unit: string; inventoryUnit: string; unitCost: number }>;
  recipeCost: number;
  margin: number;
  marginRate: number;
};

async function resolveBatch(client: pg.PoolClient): Promise<ResolvedRecipe[]> {
  const resolved: ResolvedRecipe[] = [];
  for (const candidate of FIRST_BEVERAGE_RECIPE_BATCH) {
    const variant = await client.query<{ productId: string; variantId: string; sellingPrice: number }>(
      `SELECT mi.id "productId",v.id "variantId",v.selling_price::float8 "sellingPrice"
         FROM menu_items mi JOIN menu_categories mc ON mc.id=mi.category_id
         JOIN menu_item_variants v ON v.menu_item_id=mi.id
        WHERE mc.name=$1 AND mi.name=$2 AND v.name=$3
          AND mi.status='ACTIVE' AND mi.approval_status='APPROVED' AND v.status='ACTIVE'`,
      [candidate.category, candidate.product, candidate.variant],
    );
    requireCondition(variant.rows.length === 1, `Expected one active ${candidate.category} / ${candidate.product} / ${candidate.variant} variant`);
    const ingredientRows = [];
    for (const ingredient of candidate.ingredients) {
      const item = await client.query<{ id: string; name: string; unit: string; unitCost: number; branchCosts: number }>(
        `SELECT ii.id,ii.name,ii.unit,ii.unit_cost::float8 "unitCost",
                count(DISTINCT bis.current_unit_cost)::int "branchCosts"
           FROM inventory_items ii LEFT JOIN branch_inventory_settings bis ON bis.inventory_item_id=ii.id
          WHERE ii.sku=$1 AND ii.status='ACTIVE'
          GROUP BY ii.id`, [ingredient.sku],
      );
      requireCondition(item.rows.length === 1, `Missing or inactive ingredient ${ingredient.sku}`);
      const saved = item.rows[0]!;
      requireCondition(saved.branchCosts <= 1, `${ingredient.sku} currently has different branch costs; this verification requires one shared sample cost`);
      requireCondition(normalizeUnit(saved.unit) === normalizeUnit(ingredient.unit), `Unit mismatch for ${ingredient.sku}`);
      ingredientRows.push({ inventoryItemId: saved.id, sku: ingredient.sku, name: saved.name, quantity: ingredient.quantity,
        unit: ingredient.unit, inventoryUnit: saved.unit, unitCost: Number(saved.unitCost) });
    }
    requireCondition(new Set(ingredientRows.map((item) => item.inventoryItemId)).size === ingredientRows.length,
      `Duplicate ingredient in ${candidate.product} ${candidate.variant}`);
    const recipeCost = ingredientRows.reduce((sum, item) => sum + calculateIngredientCost({
      recipeQuantity: item.quantity, recipeUnit: item.unit, inventoryUnit: item.inventoryUnit, unitCost: item.unitCost,
    }), 0);
    const sellingPrice = Number(variant.rows[0]!.sellingPrice);
    resolved.push({ productId: variant.rows[0]!.productId, variantId: variant.rows[0]!.variantId,
      product: candidate.product, variant: candidate.variant, sellingPrice, ingredients: ingredientRows,
      recipeCost, margin: sellingPrice - recipeCost, marginRate: ((sellingPrice - recipeCost) / sellingPrice) * 100 });
  }
  return resolved;
}

async function main() {
  const args = process.argv.slice(2);
  requireCondition(args.length <= 1 && (args.length === 0 || args[0] === "--apply"),
    "Usage: tsx src/database/importFirstBeverageRecipes.ts [--apply]");
  const apply = args[0] === "--apply";
  requireCondition(process.env.DATABASE_URL, "DATABASE_URL is required");
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  let open = false;
  try {
    await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
    open = true;
    await client.query("LOCK TABLE recipes IN SHARE ROW EXCLUSIVE MODE");
    const state = await client.query<{ products: number; variants: number; ingredients: number; recipes: number; recipeItems: number; sources: number; mappings: number }>(
      `SELECT (SELECT count(*)::int FROM menu_items) products,
              (SELECT count(*)::int FROM menu_item_variants) variants,
              (SELECT count(*)::int FROM inventory_items) ingredients,
              (SELECT count(*)::int FROM recipes) recipes,
              (SELECT count(*)::int FROM recipe_items) "recipeItems",
              (SELECT count(*)::int FROM pos_sources) sources,
              (SELECT count(*)::int FROM pos_product_variant_mappings) mappings`,
    );
    const before = state.rows[0]!;
    requireCondition(before.products === 69 && before.variants === 81 && before.ingredients === 23 && before.recipes === 0 && before.recipeItems === 0 && before.sources === 0 && before.mappings === 0,
      `Unexpected database state: ${JSON.stringify(before)}`);
    const snapshots = new Map(await Promise.all(protectedTables.map(async (table) => [table, await fingerprint(client, table)] as const)));
    const owner = await client.query<{ id: string }>(`SELECT id FROM users WHERE role='OWNER' AND status='ACTIVE' ORDER BY created_at LIMIT 1`);
    requireCondition(owner.rows.length === 1, "Exactly one active Owner is required for sample recipe audit attribution");
    const batch = await resolveBatch(client);

    if (!apply) {
      await client.query("ROLLBACK");
      open = false;
      console.log(JSON.stringify({ transaction: "DRY_RUN_ROLLED_BACK", before, basis: SAMPLE_RECIPE_BASIS, recipes: batch }, null, 2));
      return;
    }

    const inserted = [];
    for (const recipe of batch) {
      const saved = await saveRecipeDefinition(client, {
        menuItemId: recipe.productId,
        menuItemVariantId: recipe.variantId,
        name: `${recipe.product} ${recipe.variant} Recipe`,
        yieldQuantity: 1,
        status: "ACTIVE",
        items: recipe.ingredients.map((item) => ({ inventoryItemId: item.inventoryItemId, quantity: item.quantity, unit: item.unit })),
        changeReason: SAMPLE_RECIPE_BASIS,
        createdBy: owner.rows[0]!.id,
      });
      await client.query(
        `INSERT INTO audit_logs (user_id,branch_id,action,entity_type,entity_id,description,metadata)
         VALUES ($1,NULL,'CREATE_SAMPLE_RECIPE','RECIPE',$2,$3,$4::jsonb)`,
        [owner.rows[0]!.id, saved.recipeId, `Created ${recipe.product} ${recipe.variant} sample recipe; ${SAMPLE_RECIPE_BASIS}`,
          JSON.stringify({ source: "firstBeverageRecipeBatch.ts", quantityBasis: SAMPLE_RECIPE_BASIS,
            category: "Warm Tales", product: recipe.product, variant: recipe.variant, recipeCost: recipe.recipeCost,
            sellingPrice: recipe.sellingPrice, margin: recipe.margin, marginRate: recipe.marginRate })],
      );
      inserted.push({ recipeId: saved.recipeId, version: saved.version, ...recipe });
    }

    for (const table of protectedTables) requireCondition(await fingerprint(client, table) === snapshots.get(table), `${table} changed unexpectedly`);
    const counts = await client.query<{ recipes: number; recipeItems: number }>(
      `SELECT (SELECT count(*)::int FROM recipes) recipes,(SELECT count(*)::int FROM recipe_items) "recipeItems"`,
    );
    requireCondition(counts.rows[0]!.recipes === 5 && counts.rows[0]!.recipeItems === 16, "Unexpected recipe or recipe-item count");
    const stored = await client.query<{ recipeId: string; variantId: string; version: number; changeReason: string; itemCount: number }>(
      `SELECT r.id "recipeId",r.menu_item_variant_id "variantId",r.version,r.change_reason "changeReason",count(ri.id)::int "itemCount"
         FROM recipes r JOIN recipe_items ri ON ri.recipe_id=r.id GROUP BY r.id ORDER BY r.id`,
    );
    requireCondition(stored.rows.length === 5 && stored.rows.every((row) => row.version === 1 && row.changeReason === SAMPLE_RECIPE_BASIS),
      "Stored recipes failed version or sample-quantity provenance verification");
    requireCondition(new Set(stored.rows.map((row) => row.variantId)).size === 5, "Recipes are not variant-specific");
    await client.query("COMMIT");
    open = false;
    console.log(JSON.stringify({ transaction: "COMMITTED", before, after: { ...before, recipes: 5, recipeItems: 16 }, basis: SAMPLE_RECIPE_BASIS,
      inserted, protectedTablesVerified: protectedTables }, null, 2));
  } catch (error) {
    if (open) await client.query("ROLLBACK");
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
