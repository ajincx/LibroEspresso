import dotenv from "dotenv";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { SUPPORTED_UNITS } from "../services/unitConversion.service.js";

const backendDir = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
dotenv.config({ path: resolve(backendDir, ".env"), quiet: true });
const proposalPath = resolve(backendDir, "../Ingredient_Master_Proposal.md");
const basis = "SAMPLE / ASSUMED COST — FOR SYSTEM DEMONSTRATION";
const expectedExisting = [
  { sku: "RM-001", id: "5479b577-b412-49f2-a142-cca0c726ff11", name: "Whole Milk" },
  { sku: "RM-002", id: "12dab4ea-9a75-4152-af36-47ed3424c451", name: "Espresso Blend Beans" },
  { sku: "RM-003", id: "dd44265c-1092-45f1-a6c2-4df9c4b880e7", name: "Condensed Milk" },
  { sku: "RM-004", id: "088f7eab-544b-40a0-83b1-602d6168fe73", name: "Ice" },
  { sku: "RM-005", id: "29c547b9-ab2f-4e5d-af2a-9fe0b06acbac", name: "Caramel Syrup" },
  { sku: "RM-006", id: "853af707-0dfb-4124-ba23-7d88388f1722", name: "Filtered Water" },
];
const expectedSkus = expectedExisting.map((row) => row.sku);

// A deliberately conservative subset of the reviewed 33 candidate rows.
const approved = new Set([
  "Granulated Sugar", "Whipping Cream", "Dry Spaghetti", "Uncooked Rice",
  "Garlic", "Salt", "Ground Black Pepper", "Sandwich Bread Slices",
  "Burger Bun", "Cheddar Cheese", "Sliced Ham", "Canned Tuna, Drained",
  "Chicken Eggs", "Nutella Hazelnut Spread", "Biscoff Spread", "Tomatoes", "Lettuce",
]);
const skipped = new Map<string, string>([
  ["Matcha Powder", "Powder versus premix form unconfirmed"],
  ["Carbonated Water", "Soda make/buy method unconfirmed"],
  ["Dry Lasagna Sheets", "Lasagna make/buy method unconfirmed"],
  ["Dry Asian Noodles", "Noodle stock identity unconfirmed"],
  ["Frozen French Fries", "Preparation and purchased form unconfirmed"],
  ["Tortilla Chips", "Nachos component make/buy method unconfirmed"],
  ["Cooking Oil", "Oil type and shared-frying treatment unconfirmed"],
  ["Butter", "Butter versus margarine identity unconfirmed"],
  ["Mozzarella Cheese", "Pizza make/buy method unconfirmed"],
  ["Pepperoni", "Pizza make/buy method unconfirmed"],
  ["Pineapple Pieces", "Fresh versus canned form unconfirmed"],
  ["Bacon", "Raw versus cooked stock basis unconfirmed"],
  ["Almonds", "Whole versus sliced versus crushed form unconfirmed"],
  ["Frozen Chicken Tenders", "MAKE/BUY METHOD TO BE CONFIRMED"],
  ["Frozen Lumpia", "MAKE/BUY METHOD TO BE CONFIRMED"],
  ["Purchased Beef Patty", "MAKE/BUY METHOD TO BE CONFIRMED"],
]);

type Candidate = { name: string; category: string; unit: string; cost: string; notes: string };
function requireCondition(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
const identity = (name: string) => name.normalize("NFKC").toLowerCase().replace(/[^a-z0-9]/g, "");

function parseProposal(markdown: string): Candidate[] {
  const section = markdown.split("## 2. Proposed Ingredients")[1]?.split("## 3. Sample/Assumed Cost Basis")[0];
  requireCondition(section, "Reviewed proposal table is missing");
  const lines = section.split(/\r?\n/).filter((line) => line.startsWith("| ") && !line.startsWith("| ---") && !line.startsWith("| Ingredient name"));
  requireCondition(lines.length === 33, `Expected 33 proposed rows; found ${lines.length}`);
  const identities = new Set<string>();
  const rows = lines.map((line) => {
    const fields = line.split("|").slice(1, -1).map((value) => value.trim());
    requireCondition(fields.length === 8, `Invalid proposal row: ${line}`);
    const [name, category, unit, price, costBasis, status, , notes] = fields;
    requireCondition(name && category && unit && price && costBasis && status && notes, `Incomplete proposal row: ${line}`);
    requireCondition(costBasis === "SAMPLE / ASSUMED" && status === "ACTIVE (PROPOSED ONLY)", `Unapproved basis/status for ${name}`);
    requireCondition(SUPPORTED_UNITS.some((supported) => supported === unit), `Unsupported unit for ${name}`);
    const match = /^₱(\d+\.\d{4})\/(g|kg|ml|L|pc)$/.exec(price);
    requireCondition(match && match[2] === unit && Number(match[1]) > 0, `Invalid sample cost for ${name}`);
    requireCondition(!identities.has(identity(name)), `Duplicate proposed name: ${name}`);
    identities.add(identity(name));
    requireCondition(approved.has(name) !== skipped.has(name), `Missing or conflicting review decision for ${name}`);
    return { name, category, unit, cost: match[1]!, notes };
  });
  requireCondition(rows.filter((row) => approved.has(row.name)).length === approved.size, "Approved list differs from proposal");
  requireCondition(rows.filter((row) => skipped.has(row.name)).length === skipped.size, "Skipped list differs from proposal");
  return rows;
}

const protectedTables = [
  "branch_inventory_settings", "branch_inventory_balances", "menu_items", "menu_item_variants",
  "recipes", "recipe_items", "pos_sources", "pos_product_variant_mappings",
] as const;

async function fingerprint(client: pg.PoolClient, table: typeof protectedTables[number]): Promise<string> {
  const result = await client.query<{ hash: string }>(
    `SELECT md5(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'[]')) hash FROM ${table} t`,
  );
  return result.rows[0]!.hash;
}

async function main() {
  const args = process.argv.slice(2);
  requireCondition(args.length <= 1 && (args.length === 0 || args[0] === "--apply"),
    "Usage: tsx src/database/importSampleIngredients.ts [--apply]");
  const apply = args[0] === "--apply";
  const candidates = parseProposal(await readFile(proposalPath, "utf8"));
  const toInsert = candidates.filter((row) => approved.has(row.name));
  const skippedRows = candidates.filter((row) => skipped.has(row.name))
    .map((row) => ({ name: row.name, reason: skipped.get(row.name)! }));
  requireCondition(process.env.DATABASE_URL, "DATABASE_URL is required");
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  let open = false;
  try {
    await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
    open = true;
    await client.query("LOCK TABLE inventory_items IN SHARE ROW EXCLUSIVE MODE");
    const original = await client.query<{ id: string; sku: string; name: string; row: unknown }>(
      `SELECT id,sku,name,to_jsonb(ii) "row" FROM inventory_items ii ORDER BY sku`,
    );
    requireCondition(original.rows.length === 6 && original.rows.every((row, index) =>
      row.sku === expectedExisting[index]?.sku && row.id === expectedExisting[index]?.id && row.name === expectedExisting[index]?.name),
      "Existing ingredient IDs, SKUs, or names differ from the six reviewed development records");
    requireCondition(new Set(original.rows.map((row) => row.id)).size === 6, "Existing ingredient IDs are not unique");
    const names = new Set(original.rows.map((row) => identity(row.name)));
    for (const row of toInsert) requireCondition(!names.has(identity(row.name)), `Existing ingredient collides with ${row.name}`);
    const state = await client.query<{ products: number; variants: number; recipes: number; sources: number; mappings: number }>(
      `SELECT (SELECT count(*)::int FROM menu_items) products,
        (SELECT count(*)::int FROM menu_item_variants) variants,
        (SELECT count(*)::int FROM recipes) recipes,
        (SELECT count(*)::int FROM pos_sources) sources,
        (SELECT count(*)::int FROM pos_product_variant_mappings) mappings`,
    );
    const before = state.rows[0]!;
    requireCondition(before.products === 69 && before.variants === 81 && before.recipes === 0 && before.sources === 0 && before.mappings === 0,
      `Unexpected menu/recipe/POS state: ${JSON.stringify(before)}`);
    const snapshots = new Map(await Promise.all(protectedTables.map(async (table) => [table, await fingerprint(client, table)] as const)));

    if (!apply) {
      await client.query("ROLLBACK");
      open = false;
      console.log(JSON.stringify({ transaction: "DRY_RUN_ROLLED_BACK", existing: original.rows.map(({ id, sku, name }) => ({ id, sku, name })),
        approved: toInsert, skipped: skippedRows, expectedTotal: original.rows.length + toInsert.length }, null, 2));
      return;
    }

    const inserted: Array<{ id: string; sku: string; name: string; unit: string; cost: string }> = [];
    for (const row of toInsert) {
      const code = await client.query<{ sku: string }>(`SELECT 'ING-'||lpad(nextval('inventory_item_code_seq')::text,5,'0') sku`);
      const saved = await client.query<{ id: string; sku: string; name: string; unit: string; cost: string }>(
        `INSERT INTO inventory_items (sku,name,category,unit,unit_cost,reorder_level,status,item_scope,origin_branch_id,created_by)
         VALUES ($1,$2,$3,$4,$5,0,'ACTIVE','GLOBAL',NULL,NULL)
         RETURNING id,sku,name,unit,unit_cost::text cost`,
        [code.rows[0]!.sku, row.name, row.category, row.unit, row.cost],
      );
      const item = saved.rows[0]!;
      await client.query(
        `INSERT INTO audit_logs (user_id,branch_id,action,entity_type,entity_id,description,metadata)
         VALUES (NULL,NULL,'CREATE_SAMPLE_INGREDIENT','INVENTORY_ITEM',$1,$2,$3::jsonb)`,
        [item.id, `Imported sample ingredient ${item.name}; ${basis}`,
          JSON.stringify({ source: "Ingredient_Master_Proposal.md", costBasis: basis, unit: row.unit, unitCost: row.cost, notes: row.notes })],
      );
      inserted.push(item);
    }

    const afterOriginal = await client.query<{ id: string; sku: string; name: string; row: unknown }>(
      `SELECT id,sku,name,to_jsonb(ii) "row" FROM inventory_items ii WHERE sku=ANY($1::text[]) ORDER BY sku`, [expectedSkus],
    );
    requireCondition(JSON.stringify(afterOriginal.rows) === JSON.stringify(original.rows), "Existing development ingredients changed");
    for (const table of protectedTables) requireCondition(await fingerprint(client, table) === snapshots.get(table), `${table} changed`);
    const count = await client.query<{ total: number }>(`SELECT count(*)::int total FROM inventory_items`);
    requireCondition(count.rows[0]!.total === original.rows.length + toInsert.length, "Unexpected final ingredient count");
    for (const item of inserted) {
      const source = toInsert.find((row) => row.name === item.name);
      requireCondition(source && item.unit === source.unit && item.cost === source.cost, `Sample cost/unit mismatch for ${item.name}`);
    }
    const audit = await client.query<{ total: number }>(
      `SELECT count(*)::int total FROM audit_logs WHERE action='CREATE_SAMPLE_INGREDIENT'
         AND entity_id=ANY($1::text[]) AND metadata->>'costBasis'=$2`,
      [inserted.map((item) => item.id), basis],
    );
    requireCondition(audit.rows[0]!.total === inserted.length, "Sample-cost audit provenance is incomplete");
    await client.query("COMMIT");
    open = false;
    console.log(JSON.stringify({ transaction: "COMMITTED", existingBefore: original.rows.map(({ id, sku, name }) => ({ id, sku, name })),
      existingAfter: afterOriginal.rows.map(({ id, sku, name }) => ({ id, sku, name })), inserted, skipped: skippedRows,
      totalInventoryItems: count.rows[0]!.total, protectedState: before, protectedTablesVerified: protectedTables }, null, 2));
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
