import dotenv from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { calculateIngredientCost, normalizeUnit } from "../services/unitConversion.service.js";
import { saveRecipeDefinition } from "../services/recipeVersion.service.js";
import { THIRD_BATCH_RECIPE_BASIS, THIRD_BEVERAGE_RECIPE_BATCH } from "./thirdBeverageRecipeBatch.js";

const backendDir = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
dotenv.config({ path: resolve(backendDir, ".env"), quiet: true });

const protectedTables = [
  "inventory_items", "branch_inventory_balances", "branch_inventory_settings", "inventory_movements",
  "inventory_counts", "inventory_count_items", "menu_items", "menu_item_variants", "pos_sources",
  "pos_product_variant_mappings", "pos_imports", "pos_sale_items", "pos_sale_ingredient_usage",
] as const;

function requireCondition(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

async function hashQuery(client: pg.PoolClient, sql: string, values: unknown[] = []) {
  const result = await client.query<{ hash: string }>(
    `SELECT md5(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'[]')) hash FROM (${sql}) t`, values,
  );
  return result.rows[0]!.hash;
}

type ResolvedRecipe = {
  productId: string;
  variantId: string;
  category: "Warm Tales" | "Cold Classics";
  product: string;
  variant: "Standard" | "Small" | "Large";
  sellingPrice: number;
  ingredients: Array<{ inventoryItemId: string; sku: string; name: string; quantity: number; unit: string; inventoryUnit: string; unitCost: number }>;
  recipeCost: number;
  margin: number;
  marginRate: number;
};

async function resolveBatch(client: pg.PoolClient): Promise<ResolvedRecipe[]> {
  const resolved: ResolvedRecipe[] = [];
  for (const candidate of THIRD_BEVERAGE_RECIPE_BATCH) {
    const variant = await client.query<{ productId: string; variantId: string; sellingPrice: number }>(
      `SELECT mi.id "productId",v.id "variantId",v.selling_price::float8 "sellingPrice"
         FROM menu_items mi JOIN menu_categories mc ON mc.id=mi.category_id
         JOIN menu_item_variants v ON v.menu_item_id=mi.id
        WHERE mc.name=$1 AND mi.name=$2 AND v.name=$3
          AND mi.status='ACTIVE' AND mi.approval_status='APPROVED' AND v.status='ACTIVE'`,
      [candidate.category, candidate.product, candidate.variant],
    );
    requireCondition(variant.rows.length === 1, `Expected one active ${candidate.category} / ${candidate.product} / ${candidate.variant} variant`);
    const variantRow = variant.rows[0]!;
    const existingRecipe = await client.query(`SELECT id FROM recipes WHERE menu_item_variant_id=$1`, [variantRow.variantId]);
    requireCondition(existingRecipe.rows.length === 0, `${candidate.product} ${candidate.variant} already has a recipe`);

    const ingredients: ResolvedRecipe["ingredients"] = [];
    for (const requested of candidate.ingredients) {
      const item = await client.query<{ id: string; name: string; unit: string; unitCost: number; branchCosts: number }>(
        `SELECT ii.id,ii.name,ii.unit,ii.unit_cost::float8 "unitCost",count(DISTINCT bis.current_unit_cost)::int "branchCosts"
           FROM inventory_items ii LEFT JOIN branch_inventory_settings bis ON bis.inventory_item_id=ii.id
          WHERE ii.sku=$1 AND ii.status='ACTIVE' GROUP BY ii.id`, [requested.sku],
      );
      requireCondition(item.rows.length === 1, `Missing or inactive ingredient ${requested.sku}`);
      const saved = item.rows[0]!;
      requireCondition(saved.branchCosts <= 1, `${requested.sku} has conflicting branch costs`);
      requireCondition(normalizeUnit(saved.unit) === normalizeUnit(requested.unit), `Unit mismatch for ${requested.sku}`);
      requireCondition(Number(saved.unitCost) > 0 && requested.quantity > 0, `Cost and quantity must be positive for ${requested.sku}`);
      ingredients.push({ inventoryItemId: saved.id, sku: requested.sku, name: saved.name, quantity: requested.quantity,
        unit: requested.unit, inventoryUnit: saved.unit, unitCost: Number(saved.unitCost) });
    }
    requireCondition(new Set(ingredients.map(({ inventoryItemId }) => inventoryItemId)).size === ingredients.length,
      `Duplicate ingredient in ${candidate.product} ${candidate.variant}`);
    const usesWeightedIce = ingredients.some(({ sku }) => sku === "ING-00018");
    requireCondition(usesWeightedIce === (candidate.category === "Cold Classics"),
      `${candidate.product} ${candidate.variant} has invalid weighted-Ice usage`);
    requireCondition(!ingredients.some(({ sku }) => sku === "RM-004"), `${candidate.product} ${candidate.variant} cannot use RM-004 Ice`);
    const recipeCost = ingredients.reduce((sum, item) => sum + calculateIngredientCost({
      recipeQuantity: item.quantity, recipeUnit: item.unit, inventoryUnit: item.inventoryUnit, unitCost: item.unitCost,
    }), 0);
    const sellingPrice = Number(variantRow.sellingPrice);
    const margin = sellingPrice - recipeCost;
    resolved.push({ productId: variantRow.productId, variantId: variantRow.variantId, category: candidate.category,
      product: candidate.product, variant: candidate.variant, sellingPrice, ingredients, recipeCost, margin,
      marginRate: (margin / sellingPrice) * 100 });
  }
  return resolved;
}

async function main() {
  const args = process.argv.slice(2);
  requireCondition(args.length <= 1 && (args.length === 0 || args[0] === "--apply"),
    "Usage: tsx src/database/importThirdBeverageRecipes.ts [--apply]");
  const apply = args[0] === "--apply";
  requireCondition(process.env.DATABASE_URL, "DATABASE_URL is required");
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  let transactionOpen = false;
  try {
    await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
    transactionOpen = true;
    await client.query("LOCK TABLE recipes,recipe_items IN SHARE ROW EXCLUSIVE MODE");
    await client.query("LOCK TABLE inventory_items,branch_inventory_settings,branch_inventory_balances IN SHARE MODE");
    const state = await client.query<{ products: number; variants: number; ingredients: number; recipes: number; recipeItems: number; sources: number; mappings: number }>(
      `SELECT (SELECT count(*)::int FROM menu_items) products,(SELECT count(*)::int FROM menu_item_variants) variants,
              (SELECT count(*)::int FROM inventory_items) ingredients,(SELECT count(*)::int FROM recipes) recipes,
              (SELECT count(*)::int FROM recipe_items) "recipeItems",(SELECT count(*)::int FROM pos_sources) sources,
              (SELECT count(*)::int FROM pos_product_variant_mappings) mappings`,
    );
    const before = state.rows[0]!;
    requireCondition(before.products === 69 && before.variants === 81 && before.ingredients === 36 && before.recipes === 13 &&
      before.recipeItems === 50 && before.sources === 0 && before.mappings === 0, `Unexpected database state: ${JSON.stringify(before)}`);

    const protectedSnapshots = new Map(await Promise.all(protectedTables.map(async (table) =>
      [table, await hashQuery(client, `SELECT * FROM ${table}`)] as const)));
    const existingRecipeIdsResult = await client.query<{ id: string }>(`SELECT id FROM recipes ORDER BY id`);
    const existingRecipeIds = existingRecipeIdsResult.rows.map(({ id }) => id);
    const existingRecipesHash = await hashQuery(client, `SELECT * FROM recipes WHERE id=ANY($1::uuid[])`, [existingRecipeIds]);
    const existingRecipeItemsHash = await hashQuery(client, `SELECT * FROM recipe_items WHERE recipe_id=ANY($1::uuid[])`, [existingRecipeIds]);
    const rm004Hash = await hashQuery(client, `SELECT * FROM inventory_items WHERE sku='RM-004'`);
    const owner = await client.query<{ id: string }>(`SELECT id FROM users WHERE role='OWNER' AND status='ACTIVE' ORDER BY created_at LIMIT 1`);
    requireCondition(owner.rows.length === 1, "An active Owner is required for audit attribution");
    const batch = await resolveBatch(client);
    requireCondition(batch.length === 8 && batch.reduce((sum, recipe) => sum + recipe.ingredients.length, 0) === 32,
      "Resolved batch does not contain exactly 8 recipes and 32 recipe items");

    if (!apply) {
      await client.query("ROLLBACK");
      transactionOpen = false;
      console.log(JSON.stringify({ transaction: "DRY_RUN_ROLLED_BACK", before,
        expectedAfter: { ...before, recipes: 21, recipeItems: 82 }, basis: THIRD_BATCH_RECIPE_BASIS, recipes: batch }, null, 2));
      return;
    }

    const inserted = [];
    for (const recipe of batch) {
      const saved = await saveRecipeDefinition(client, {
        menuItemId: recipe.productId, menuItemVariantId: recipe.variantId,
        name: `${recipe.product} ${recipe.variant} Recipe`, yieldQuantity: 1, status: "ACTIVE",
        items: recipe.ingredients.map(({ inventoryItemId, quantity, unit }) => ({ inventoryItemId, quantity, unit })),
        changeReason: THIRD_BATCH_RECIPE_BASIS, createdBy: owner.rows[0]!.id,
      });
      requireCondition(saved.version === 1 && !saved.createdVersion, `${recipe.product} ${recipe.variant} was not created as version 1`);
      await client.query(
        `INSERT INTO audit_logs (user_id,branch_id,action,entity_type,entity_id,description,metadata)
         VALUES ($1,NULL,'CREATE_SAMPLE_RECIPE','RECIPE',$2,$3,$4::jsonb)`,
        [owner.rows[0]!.id, saved.recipeId, `Created ${recipe.product} ${recipe.variant} sample recipe; ${THIRD_BATCH_RECIPE_BASIS}`,
          JSON.stringify({ source: "thirdBeverageRecipeBatch.ts", quantityBasis: THIRD_BATCH_RECIPE_BASIS,
            category: recipe.category, product: recipe.product, variant: recipe.variant, recipeCost: recipe.recipeCost,
            sellingPrice: recipe.sellingPrice, margin: recipe.margin, marginRate: recipe.marginRate })],
      );
      inserted.push({ recipeId: saved.recipeId, version: saved.version, ...recipe });
    }

    for (const table of protectedTables) {
      requireCondition(await hashQuery(client, `SELECT * FROM ${table}`) === protectedSnapshots.get(table), `${table} changed unexpectedly`);
    }
    requireCondition(await hashQuery(client, `SELECT * FROM recipes WHERE id=ANY($1::uuid[])`, [existingRecipeIds]) === existingRecipesHash,
      "An existing recipe changed");
    requireCondition(await hashQuery(client, `SELECT * FROM recipe_items WHERE recipe_id=ANY($1::uuid[])`, [existingRecipeIds]) === existingRecipeItemsHash,
      "An existing recipe item changed");
    requireCondition(await hashQuery(client, `SELECT * FROM inventory_items WHERE sku='RM-004'`) === rm004Hash, "RM-004 changed");

    const afterResult = await client.query<{ products: number; variants: number; ingredients: number; recipes: number; recipeItems: number; sources: number; mappings: number }>(
      `SELECT (SELECT count(*)::int FROM menu_items) products,(SELECT count(*)::int FROM menu_item_variants) variants,
              (SELECT count(*)::int FROM inventory_items) ingredients,(SELECT count(*)::int FROM recipes) recipes,
              (SELECT count(*)::int FROM recipe_items) "recipeItems",(SELECT count(*)::int FROM pos_sources) sources,
              (SELECT count(*)::int FROM pos_product_variant_mappings) mappings`,
    );
    const after = afterResult.rows[0]!;
    requireCondition(after.products === 69 && after.variants === 81 && after.ingredients === 36 && after.recipes === 21 &&
      after.recipeItems === 82 && after.sources === 0 && after.mappings === 0, `Unexpected final state: ${JSON.stringify(after)}`);
    const stored = await client.query<{ recipeId: string; version: number; changeReason: string; itemCount: number; usesRm004: boolean }>(
      `SELECT r.id "recipeId",r.version,r.change_reason "changeReason",count(ri.id)::int "itemCount",bool_or(ii.sku='RM-004') "usesRm004"
         FROM recipes r JOIN recipe_items ri ON ri.recipe_id=r.id JOIN inventory_items ii ON ii.id=ri.inventory_item_id
        WHERE r.id=ANY($1::uuid[]) GROUP BY r.id`, [inserted.map(({ recipeId }) => recipeId)],
    );
    requireCondition(stored.rows.length === 8 && stored.rows.every((row) => row.version === 1 &&
      row.changeReason === THIRD_BATCH_RECIPE_BASIS && !row.usesRm004), "Stored recipes failed version, provenance, or Ice verification");

    await client.query("COMMIT");
    transactionOpen = false;
    console.log(JSON.stringify({ transaction: "COMMITTED", before, after, basis: THIRD_BATCH_RECIPE_BASIS,
      inserted, existingRecipesVerified: existingRecipeIds.length, protectedTablesVerified: protectedTables }, null, 2));
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
