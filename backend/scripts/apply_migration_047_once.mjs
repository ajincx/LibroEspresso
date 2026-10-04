import "dotenv/config";
import { readFile } from "node:fs/promises";
import pg from "pg";

const migrationName = "047_direct_message_soft_deletion.sql";
const connectionString = process.env.DATABASE_URL;
const configured = new URL(connectionString);
const client = new pg.Client({ connectionString });
await client.connect();
const trackedTables = ["inventory_items", "inventory_counts", "inventory_movements", "pos_imports", "pos_sale_items", "pos_sale_ingredient_usage", "recipes", "recipe_items", "purchase_orders", "purchase_order_items", "shrinkage_reports", "incident_reports"];

async function snapshot() {
  const messages = await client.query(`SELECT count(*)::int AS count, md5(coalesce(string_agg(concat_ws(':', id::text, sender_user_id::text, recipient_user_id::text, body, created_at::text), '|' ORDER BY id::text), '')) AS digest FROM direct_messages`);
  const unrelatedCounts = {};
  for (const table of trackedTables) {
    const result = await client.query(`SELECT count(*)::int AS count FROM ${table}`);
    unrelatedCounts[table] = result.rows[0].count;
  }
  return { messages: messages.rows[0], unrelatedCounts };
}

try {
  const identity = await client.query(`SELECT current_database() AS database, coalesce(inet_server_addr()::text, 'localhost') AS host, inet_server_port() AS port`);
  const safeIdentity = { configuredHost: configured.hostname, configuredPort: configured.port || "5432", configuredDatabase: configured.pathname.slice(1), ...identity.rows[0] };
  if (!["localhost", "127.0.0.1", "::1"].includes(configured.hostname) || configured.pathname.slice(1) !== "libro_cogs" || String(configured.port || "5432") !== "5432") throw new Error(`Refusing non-target database: ${JSON.stringify(safeIdentity)}`);
  const prior = await client.query("SELECT EXISTS (SELECT 1 FROM schema_migrations WHERE filename = $1) AS applied", [migrationName]);
  const priorColumns = await client.query(`SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'direct_messages' AND column_name IN ('deleted_at', 'deleted_by_user_id') ORDER BY column_name`);
  const priorIndex = await client.query(`SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'direct_messages' AND indexname = 'direct_messages_active_conversation_idx'`);
  const before = await snapshot();
  console.log(JSON.stringify({ stage: "before", identity: safeIdentity, migrationApplied: prior.rows[0].applied, columns: priorColumns.rows.map((row) => row.column_name), indexes: priorIndex.rows.map((row) => row.indexname), ...before }));
  if (prior.rows[0].applied || priorColumns.rowCount || priorIndex.rowCount) throw new Error("Migration 047 is already applied or partially present; no changes made.");
  const sql = await readFile(new URL(`../migrations/${migrationName}`, import.meta.url), "utf8");
  await client.query("BEGIN");
  try {
    await client.query(sql);
    await client.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [migrationName]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
  const columns = await client.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'direct_messages' AND column_name IN ('deleted_at', 'deleted_by_user_id') ORDER BY column_name`);
  const index = await client.query(`SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'direct_messages' AND indexname = 'direct_messages_active_conversation_idx'`);
  const tracked = await client.query("SELECT applied_at FROM schema_migrations WHERE filename = $1", [migrationName]);
  const conversationLoad = await client.query(`SELECT count(*)::int AS count FROM direct_messages dm WHERE dm.deleted_at IS NULL AND dm.sender_user_id IS NOT NULL AND dm.recipient_user_id IS NOT NULL`);
  const after = await snapshot();
  console.log(JSON.stringify({ stage: "after", migrationRows: tracked.rowCount, columns: columns.rows, indexes: index.rows, loadableConversationRows: conversationLoad.rows[0].count, ...after }));
} finally {
  await client.end();
}
