import dotenv from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { normalizeUnit } from "../services/unitConversion.service.js";
import { GROUP_A_BEVERAGE_INGREDIENTS, GROUP_A_PROVENANCE } from "./groupABeverageIngredients.js";

const backendDir = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
dotenv.config({ path: resolve(backendDir, ".env"), quiet: true });

function requireCondition(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
const normalizedName = (name: string) => name.normalize("NFKC").toLowerCase().replace(/[^a-z0-9]/g, "");

async function hashQuery(client: pg.PoolClient, sql: string, values: unknown[] = []) {
  const result = await client.query<{ hash: string }>(
    `SELECT md5(COALESCE(jsonb_agg(to_jsonb(snapshot_row) ORDER BY to_jsonb(snapshot_row)::text)::text,'[]')) hash FROM (${sql}) snapshot_row`,
    values,
  );
  return result.rows[0]!.hash;
}

type SavedIngredient = { id: string; sku: string; name: string; category: string; unit: string; unitCost: string };

async function main() {
  const args = process.argv.slice(2);
  requireCondition(args.length <= 1 && (args.length === 0 || args[0] === "--apply"),
    "Usage: tsx src/database/importGroupABeverageIngredients.ts [--apply]");
  const apply = args[0] === "--apply";
  requireCondition(process.env.DATABASE_URL, "DATABASE_URL is required");

  const proposedNames = GROUP_A_BEVERAGE_INGREDIENTS.map((item) => normalizedName(item.name));
  requireCondition(new Set(proposedNames).size === 13, "Group A contains duplicate normalized names");
  for (const item of GROUP_A_BEVERAGE_INGREDIENTS) {
    requireCondition(normalizeUnit(item.unit) === item.unit, `Unsupported or noncanonical unit for ${item.name}`);
    requireCondition(/^\d+\.\d{4}$/.test(item.unitCost) && Number(item.unitCost) > 0, `Invalid cost for ${item.name}`);
  }

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  let open = false;
  try {
    await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
    open = true;
    await client.query("LOCK TABLE inventory_items IN SHARE ROW EXCLUSIVE MODE");

    const state = await client.query<{ products: number; variants: number; ingredients: number; recipes: number; recipeItems: number; posSources: number; posMappings: number; activeBranches: number }>(
      `SELECT (SELECT count(*)::int FROM menu_items) products,
              (SELECT count(*)::int FROM menu_item_variants) variants,
              (SELECT count(*)::int FROM inventory_items) ingredients,
              (SELECT count(*)::int FROM recipes) recipes,
              (SELECT count(*)::int FROM recipe_items) "recipeItems",
              (SELECT count(*)::int FROM pos_sources) "posSources",
              (SELECT count(*)::int FROM pos_product_variant_mappings) "posMappings",
              (SELECT count(*)::int FROM branches WHERE status='ACTIVE') "activeBranches"`,
    );
    const before = state.rows[0]!;
    requireCondition(before.products === 69 && before.variants === 81 && before.ingredients === 23 && before.recipes === 5 && before.recipeItems === 16 && before.posSources === 0 && before.posMappings === 0 && before.activeBranches === 5,
      `Unexpected baseline: ${JSON.stringify(before)}`);

    const existing = await client.query<{ id: string; name: string }>(`SELECT id,name FROM inventory_items ORDER BY id FOR SHARE`);
    const existingIds = existing.rows.map((row) => row.id);
    const existingNames = new Set(existing.rows.map((row) => normalizedName(row.name)));
    for (const item of GROUP_A_BEVERAGE_INGREDIENTS) {
      requireCondition(!existingNames.has(normalizedName(item.name)), `Ingredient name already exists: ${item.name}`);
    }

    const owner = await client.query<{ id: string }>(`SELECT id FROM users WHERE role='OWNER' AND status='ACTIVE' ORDER BY created_at LIMIT 1`);
    requireCondition(owner.rows.length === 1, "Exactly one active Owner is required for audit attribution");

    const snapshots = {
      existingInventory: await hashQuery(client, `SELECT * FROM inventory_items WHERE id=ANY($1::uuid[])`, [existingIds]),
      existingSettings: await hashQuery(client, `SELECT * FROM branch_inventory_settings WHERE inventory_item_id=ANY($1::uuid[])`, [existingIds]),
      allBalances: await hashQuery(client, `SELECT * FROM branch_inventory_balances`),
      allCounts: await hashQuery(client, `SELECT * FROM inventory_count_items`),
      iceRow: await hashQuery(client, `SELECT * FROM inventory_items WHERE sku='RM-004'`),
      iceSettings: await hashQuery(client, `SELECT bis.* FROM branch_inventory_settings bis JOIN inventory_items ii ON ii.id=bis.inventory_item_id WHERE ii.sku='RM-004'`),
      iceBalances: await hashQuery(client, `SELECT bib.* FROM branch_inventory_balances bib JOIN inventory_items ii ON ii.id=bib.inventory_item_id WHERE ii.sku='RM-004'`),
      iceCounts: await hashQuery(client, `SELECT ici.* FROM inventory_count_items ici JOIN inventory_items ii ON ii.id=ici.inventory_item_id WHERE ii.sku='RM-004'`),
      products: await hashQuery(client, `SELECT * FROM menu_items`),
      variants: await hashQuery(client, `SELECT * FROM menu_item_variants`),
      recipes: await hashQuery(client, `SELECT * FROM recipes`),
      recipeItems: await hashQuery(client, `SELECT * FROM recipe_items`),
      posSources: await hashQuery(client, `SELECT * FROM pos_sources`),
      posMappings: await hashQuery(client, `SELECT * FROM pos_product_variant_mappings`),
    };

    const iceReferences = await client.query<{ recipes: number; balances: number; settings: number; counts: number; movements: number; purchaseOrders: number; saleUsage: number; incidents: number; shrinkage: number }>(
      `SELECT
        (SELECT count(*)::int FROM recipe_items WHERE inventory_item_id=ii.id) recipes,
        (SELECT count(*)::int FROM branch_inventory_balances WHERE inventory_item_id=ii.id) balances,
        (SELECT count(*)::int FROM branch_inventory_settings WHERE inventory_item_id=ii.id) settings,
        (SELECT count(*)::int FROM inventory_count_items WHERE inventory_item_id=ii.id) counts,
        (SELECT count(*)::int FROM inventory_movements WHERE inventory_item_id=ii.id) movements,
        (SELECT count(*)::int FROM purchase_order_items WHERE inventory_item_id=ii.id) "purchaseOrders",
        (SELECT count(*)::int FROM pos_sale_ingredient_usage WHERE inventory_item_id=ii.id) "saleUsage",
        (SELECT count(*)::int FROM incident_reports WHERE inventory_item_id=ii.id) incidents,
        (SELECT count(*)::int FROM shrinkage_reports WHERE inventory_item_id=ii.id) shrinkage
       FROM inventory_items ii WHERE ii.id='088f7eab-544b-40a0-83b1-602d6168fe73' AND ii.sku='RM-004' AND ii.name='Ice' AND ii.unit='pc' AND ii.unit_cost=0.1000`,
    );
    requireCondition(iceReferences.rows.length === 1, "RM-004 no longer matches the reviewed ID/name/unit/cost");

    if (!apply) {
      await client.query("ROLLBACK");
      open = false;
      console.log(JSON.stringify({ transaction: "DRY_RUN_ROLLED_BACK", before, iceReferences: iceReferences.rows[0], approved: GROUP_A_BEVERAGE_INGREDIENTS,
        expectedAfter: { ...before, ingredients: 36 }, expectedBranchSettingsAdded: before.activeBranches * GROUP_A_BEVERAGE_INGREDIENTS.length }, null, 2));
      return;
    }

    const inserted: SavedIngredient[] = [];
    for (const item of GROUP_A_BEVERAGE_INGREDIENTS) {
      const code = await client.query<{ sku: string }>(`SELECT 'ING-'||lpad(nextval('inventory_item_code_seq')::text,5,'0') sku`);
      const result = await client.query<SavedIngredient>(
        `INSERT INTO inventory_items (sku,name,category,unit,unit_cost,reorder_level,status,item_scope,origin_branch_id,created_by)
         VALUES ($1,$2,$3,$4,$5,0,'ACTIVE','GLOBAL',NULL,$6)
         RETURNING id,sku,name,category,unit,unit_cost::text "unitCost"`,
        [code.rows[0]!.sku, item.name, item.category, item.unit, item.unitCost, owner.rows[0]!.id],
      );
      const saved = result.rows[0]!;
      await client.query(
        `INSERT INTO branch_inventory_settings (branch_id,inventory_item_id,current_unit_cost,reorder_level,reorder_days,updated_by)
         SELECT id,$1,$2,0,7,$3 FROM branches WHERE status='ACTIVE'`,
        [saved.id, item.unitCost, owner.rows[0]!.id],
      );
      await client.query(
        `INSERT INTO audit_logs (user_id,branch_id,action,entity_type,entity_id,description,metadata)
         VALUES ($1,NULL,'CREATE_SAMPLE_INGREDIENT','INVENTORY_ITEM',$2,$3,$4::jsonb)`,
        [owner.rows[0]!.id, saved.id, `Created Group A sample beverage ingredient ${saved.name}; ${GROUP_A_PROVENANCE}`,
          JSON.stringify({ source: "Beverage_Ingredient_Implementation_Plan.md", provenance: GROUP_A_PROVENANCE,
            unit: saved.unit, unitCost: saved.unitCost, openingBalanceCreated: false })],
      );
      inserted.push(saved);
    }

    requireCondition(await hashQuery(client, `SELECT * FROM inventory_items WHERE id=ANY($1::uuid[])`, [existingIds]) === snapshots.existingInventory, "An existing inventory item changed");
    requireCondition(await hashQuery(client, `SELECT * FROM branch_inventory_settings WHERE inventory_item_id=ANY($1::uuid[])`, [existingIds]) === snapshots.existingSettings, "An existing branch setting changed");
    requireCondition(await hashQuery(client, `SELECT * FROM branch_inventory_balances`) === snapshots.allBalances, "Inventory balances changed");
    requireCondition(await hashQuery(client, `SELECT * FROM inventory_count_items`) === snapshots.allCounts, "Historical inventory counts changed");
    requireCondition(await hashQuery(client, `SELECT * FROM inventory_items WHERE sku='RM-004'`) === snapshots.iceRow, "RM-004 changed");
    requireCondition(await hashQuery(client, `SELECT bis.* FROM branch_inventory_settings bis JOIN inventory_items ii ON ii.id=bis.inventory_item_id WHERE ii.sku='RM-004'`) === snapshots.iceSettings, "RM-004 settings changed");
    requireCondition(await hashQuery(client, `SELECT bib.* FROM branch_inventory_balances bib JOIN inventory_items ii ON ii.id=bib.inventory_item_id WHERE ii.sku='RM-004'`) === snapshots.iceBalances, "RM-004 balances changed");
    requireCondition(await hashQuery(client, `SELECT ici.* FROM inventory_count_items ici JOIN inventory_items ii ON ii.id=ici.inventory_item_id WHERE ii.sku='RM-004'`) === snapshots.iceCounts, "RM-004 historical counts changed");
    requireCondition(await hashQuery(client, `SELECT * FROM menu_items`) === snapshots.products && await hashQuery(client, `SELECT * FROM menu_item_variants`) === snapshots.variants, "Products or variants changed");
    requireCondition(await hashQuery(client, `SELECT * FROM recipes`) === snapshots.recipes && await hashQuery(client, `SELECT * FROM recipe_items`) === snapshots.recipeItems, "Recipes changed");
    requireCondition(await hashQuery(client, `SELECT * FROM pos_sources`) === snapshots.posSources && await hashQuery(client, `SELECT * FROM pos_product_variant_mappings`) === snapshots.posMappings, "POS source or mapping data changed");

    const insertedIds = inserted.map((item) => item.id);
    const verification = await client.query<{ ingredients: number; settings: number; balances: number; audits: number }>(
      `SELECT
        (SELECT count(*)::int FROM inventory_items WHERE id=ANY($1::uuid[])) ingredients,
        (SELECT count(*)::int FROM branch_inventory_settings WHERE inventory_item_id=ANY($1::uuid[])) settings,
        (SELECT count(*)::int FROM branch_inventory_balances WHERE inventory_item_id=ANY($1::uuid[])) balances,
        (SELECT count(*)::int FROM audit_logs WHERE action='CREATE_SAMPLE_INGREDIENT' AND entity_id=ANY($2::text[]) AND metadata->>'provenance'=$3) audits`,
      [insertedIds, insertedIds, GROUP_A_PROVENANCE],
    );
    const verified = verification.rows[0]!;
    requireCondition(verified.ingredients === 13 && verified.settings === 65 && verified.balances === 0 && verified.audits === 13,
      `Inserted data verification failed: ${JSON.stringify(verified)}`);
    const finalState = await client.query<{ products: number; variants: number; ingredients: number; recipes: number; recipeItems: number; posSources: number; posMappings: number }>(
      `SELECT (SELECT count(*)::int FROM menu_items) products,
              (SELECT count(*)::int FROM menu_item_variants) variants,
              (SELECT count(*)::int FROM inventory_items) ingredients,
              (SELECT count(*)::int FROM recipes) recipes,
              (SELECT count(*)::int FROM recipe_items) "recipeItems",
              (SELECT count(*)::int FROM pos_sources) "posSources",
              (SELECT count(*)::int FROM pos_product_variant_mappings) "posMappings"`,
    );
    const after = finalState.rows[0]!;
    requireCondition(after.products === 69 && after.variants === 81 && after.ingredients === 36 && after.recipes === 5 && after.recipeItems === 16 && after.posSources === 0 && after.posMappings === 0,
      `Final counts failed: ${JSON.stringify(after)}`);
    await client.query("COMMIT");
    open = false;
    console.log(JSON.stringify({ transaction: "COMMITTED", before, after, inserted, insertedBranchSettings: verified.settings,
      insertedBalances: verified.balances, provenanceAudits: verified.audits, iceUnchanged: true, existingInventoryUnchanged: true }, null, 2));
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
