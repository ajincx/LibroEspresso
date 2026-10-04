import { pool } from "../src/config/database.js";
import {
  MANUAL_INITIAL_CONFIGURATION_REASON,
  MANUAL_INITIAL_REORDER_MATRIX,
  REORDER_BRANCH_CODES,
} from "../src/database/manualInitialReorderMatrix.js";
import { configureBranchReorderPolicy } from "../src/services/branchInventorySettings.service.js";

const client = await pool.connect();
try {
  await client.query("BEGIN");
  const database = await client.query<{ database: string; host: string; port: number }>(
    `SELECT current_database() database,inet_server_addr()::text host,inet_server_port() port`,
  );
  const location = database.rows[0];
  if (location?.database !== "libro_cogs" || !["127.0.0.1", "::1/128", "::1"].includes(location.host) || location.port !== 5432) {
    throw new Error(`Refusing non-development target ${location?.host}:${location?.port}/${location?.database}`);
  }
  if (MANUAL_INITIAL_REORDER_MATRIX.length !== 76) throw new Error("Approved matrix must contain exactly 76 items");
  const duplicateSkus = MANUAL_INITIAL_REORDER_MATRIX.map((entry) => entry.sku).filter((sku, index, all) => all.indexOf(sku) !== index);
  if (duplicateSkus.length) throw new Error(`Duplicate approved SKUs: ${duplicateSkus.join(", ")}`);
  const branches = await client.query<{ id: string; code: string }>(
    `SELECT id,code FROM branches WHERE status='ACTIVE' AND code=ANY($1::text[]) ORDER BY code FOR SHARE`,
    [REORDER_BRANCH_CODES],
  );
  if (branches.rowCount !== 5 || branches.rows.some((branch) => !REORDER_BRANCH_CODES.includes(branch.code as never))) {
    throw new Error("The five approved active branches do not match the matrix");
  }
  const items = await client.query<{ id: string; sku: string }>(
    `SELECT id,sku FROM inventory_items
      WHERE status='ACTIVE' AND sku<>'ING-00073' AND item_scope='GLOBAL' ORDER BY sku FOR SHARE`,
  );
  const approvedSkus = [...MANUAL_INITIAL_REORDER_MATRIX].map((entry) => entry.sku).sort();
  const currentSkus = items.rows.map((item) => item.sku).sort();
  if (JSON.stringify(currentSkus) !== JSON.stringify(approvedSkus)) {
    throw new Error("Eligible active inventory items changed since the approved preflight");
  }
  const owner = await client.query<{ id: string }>(
    `SELECT id FROM users WHERE role='OWNER' AND status='ACTIVE' ORDER BY created_at LIMIT 1 FOR SHARE`,
  );
  if (!owner.rows[0]) throw new Error("No active Owner is available for the audited configuration");
  const user = { id: owner.rows[0].id, role: "OWNER" as const, branchId: null };
  const itemBySku = new Map(items.rows.map((item) => [item.sku, item.id]));
  let applied = 0;
  for (const branch of branches.rows) {
    for (const entry of MANUAL_INITIAL_REORDER_MATRIX) {
      await configureBranchReorderPolicy(client, user, {
        branchId: branch.id,
        inventoryItemId: itemBySku.get(entry.sku)!,
        category: entry.category,
        reorderLevel: entry.levels[branch.code as keyof typeof entry.levels],
        reorderDays: entry.coverageDays,
        reason: MANUAL_INITIAL_CONFIGURATION_REASON,
      });
      applied += 1;
    }
  }
  if (applied !== 380) throw new Error(`Expected 380 configurations, got ${applied}`);
  await client.query("COMMIT");
  console.log(JSON.stringify({ database: location, applied }));
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await pool.end();
}
