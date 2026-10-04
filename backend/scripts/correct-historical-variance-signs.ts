import "dotenv/config";
import { pool } from "../src/config/database.js";
import { env } from "../src/config/env.js";
import { applyHistoricalVarianceSignCompatibility } from "../src/services/historicalVarianceCompatibility.service.js";

const databaseUrl = new URL(env.DATABASE_URL);
if (!(["localhost", "127.0.0.1", "::1"].includes(databaseUrl.hostname))
  || !(["", "5432"].includes(databaseUrl.port))
  || databaseUrl.pathname !== "/libro_cogs") {
  throw new Error("Historical variance correction is restricted to localhost/libro_cogs.");
}

const client = await pool.connect();
try {
  const environment = await client.query<{ databaseName: string; serverAddress: string | null; serverPort: number }>(
    `SELECT current_database() "databaseName",inet_server_addr()::text "serverAddress",inet_server_port() "serverPort"`,
  );
  if (environment.rows[0]?.databaseName !== "libro_cogs"
    || ![null, "127.0.0.1", "127.0.0.1/32", "::1", "::1/128"].includes(environment.rows[0]?.serverAddress ?? null)
    || environment.rows[0]?.serverPort !== 5432) {
    throw new Error("Connected database is not the approved local development database.");
  }

  const actorResult = await client.query<{ id: string }>(
    `SELECT id FROM users WHERE role='OWNER' AND status='ACTIVE' ORDER BY created_at LIMIT 1`,
  );
  const actorId = actorResult.rows[0]?.id;
  if (!actorId) throw new Error("No active Owner is available for the required audit actor.");

  await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
  const auditBefore = await client.query<{ count: number }>(
    `SELECT count(*)::int count FROM audit_logs WHERE action='HISTORICAL_VARIANCE_SIGN_COMPATIBILITY'`,
  );
  const corrected = await applyHistoricalVarianceSignCompatibility(
    client,
    { id: actorId, role: "OWNER", branchId: null },
  );
  const verified = await client.query<{
    countNo: string; sku: string; expectedQuantity: number; actualQuantity: number;
    varianceQuantity: number; varianceValue: number; isTestData: boolean;
  }>(
    `SELECT ic.count_no "countNo",ii.sku,ici.expected_quantity::float8 "expectedQuantity",
            ici.actual_quantity::float8 "actualQuantity",ici.variance_quantity::float8 "varianceQuantity",
            ici.variance_value::float8 "varianceValue",ic.is_test_data "isTestData"
       FROM inventory_counts ic
       JOIN inventory_count_items ici ON ici.inventory_count_id=ic.id
       JOIN inventory_items ii ON ii.id=ici.inventory_item_id
      WHERE (ic.count_no='IC-2026-00001' AND ii.sku='RM-002')
         OR (ic.count_no='IC-2026-00004' AND ii.sku='RM-005')
      ORDER BY ic.count_no`,
  );
  const auditAfter = await client.query<{ count: number }>(
    `SELECT count(*)::int count FROM audit_logs WHERE action='HISTORICAL_VARIANCE_SIGN_COMPATIBILITY'`,
  );
  if (verified.rows.length !== 2
    || Number(verified.rows[0]?.varianceQuantity) !== -262
    || Math.abs(Number(verified.rows[1]?.varianceQuantity) - (-0.02)) > 0.000001
    || Number(auditAfter.rows[0]?.count) - Number(auditBefore.rows[0]?.count) !== 2) {
    throw new Error("Post-correction verification failed; transaction will be rolled back.");
  }
  await client.query("COMMIT");
  console.log(JSON.stringify({
    database: `${databaseUrl.hostname}:5432/libro_cogs`,
    corrected: corrected.map((row) => ({
      countNo: row.countNo,
      sku: row.sku,
      countItemId: row.countItemId,
      previousVarianceQuantity: row.varianceQuantity,
      correctedVarianceQuantity: row.correctedVarianceQuantity,
    })),
    verified: verified.rows,
    auditEntriesCreated: 2,
  }, null, 2));
} catch (error) {
  await client.query("ROLLBACK").catch(() => undefined);
  throw error;
} finally {
  client.release();
  await pool.end();
}
