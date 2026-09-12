import { performance } from "node:perf_hooks";
import supertest from "supertest";

const normalDatabaseUrl = process.env.DATABASE_URL;
const benchmarkDatabaseUrl = process.env.BENCHMARK_DATABASE_URL;
if (!benchmarkDatabaseUrl || benchmarkDatabaseUrl === normalDatabaseUrl || !/(benchmark|test)/i.test(benchmarkDatabaseUrl)) {
  throw new Error("Set BENCHMARK_DATABASE_URL to a separate database whose name contains 'benchmark' or 'test'. Live application databases are refused.");
}
process.env.DATABASE_URL = benchmarkDatabaseUrl;
process.env.BENCHMARK_MODE = "true";

const [{ app }, { pool }] = await Promise.all([import("../src/app.js"), import("../src/config/database.js")]);
const fixture = await pool.query<{ username: string; branchId: string; menuItemId: string; code: string; name: string; price: number }>(
  `SELECT u.username,u.branch_id "branchId",mi.id "menuItemId",mi.code,mi.name,mi.selling_price::float8 price
     FROM users u
     CROSS JOIN LATERAL (SELECT candidate.* FROM menu_items candidate WHERE candidate.status='ACTIVE' AND candidate.approval_status='APPROVED' AND EXISTS (SELECT 1 FROM recipes r WHERE r.menu_item_id=candidate.id AND r.status='ACTIVE') ORDER BY candidate.name LIMIT 1) mi
    WHERE u.role='BRANCH_MANAGER' AND u.status='ACTIVE'
    ORDER BY u.created_at LIMIT 1`,
);
if (!fixture.rows[0]) throw new Error("A seeded Manager, active menu product, and recipe are required.");
const selected = fixture.rows[0];
await pool.query(`INSERT INTO menu_item_branches (menu_item_id,branch_id,is_active,availability_status) VALUES ($1,$2,true,'APPROVED') ON CONFLICT (menu_item_id,branch_id) DO UPDATE SET is_active=true,availability_status='APPROVED'`,[selected.menuItemId,selected.branchId]);
const stamp = Date.now();
const businessDate = "2099-01-01";
const header = "product_code,product_name,quantity_sold,selling_price,business_date,transaction_id,line_id";
const rows = Array.from({ length: 5_000 }, (_, index) => `${selected.code},"${selected.name.replaceAll('"','""')}",1,${selected.price},${businessDate},SPRINT9-${stamp}-${index + 1},1`);
const csvText = `${header}\n${rows.join("\n")}`;
const sourceFilename = `sprint9-benchmark-${stamp}.csv`;
const agent = supertest.agent(app);
const login = await agent.post("/api/auth/login").send({ identifier: selected.username, password: process.env.SEED_MANAGER_PASSWORD ?? "manager123" });
if (login.status !== 200) throw new Error(`Benchmark Manager login failed with HTTP ${login.status}.`);
const previewStartedAt = performance.now();
const preview = await agent.post("/api/pos-sales/preview").send({ sourceFilename, csvText });
const previewHttpMs = performance.now() - previewStartedAt;
if (preview.status !== 200 || !preview.body.data?.preview?.summary?.canImport) throw new Error(`POS preview failed with HTTP ${preview.status}: ${JSON.stringify(preview.body)}`);
const importStartedAt = performance.now();
const imported = await agent.post("/api/pos-sales/import").send({ sourceFilename, csvText, expectedContentHash: preview.body.data.preview.contentHash });
const endToEndImportMs = performance.now() - importStartedAt;
if (imported.status !== 201) throw new Error(`POS import failed with HTTP ${imported.status}: ${JSON.stringify(imported.body)}`);
const importId = imported.body.data.importId as string;
console.log(JSON.stringify({ test: "5,000-row complete POS database import", datasetSize: 5_000, targetMs: 30_000, previewHttpMs: Math.round(previewHttpMs * 100) / 100, endToEndImportMs: Math.round(endToEndImportMs * 100) / 100, status: endToEndImportMs <= 30_000 ? "PASS" : "FAIL", phases: imported.body.data.benchmark }, null, 2));

const client = await pool.connect();
try {
  await client.query("BEGIN");
  await client.query("DELETE FROM notifications WHERE entity_type='POS_IMPORT' AND entity_id=$1", [importId]);
  await client.query("DELETE FROM audit_logs WHERE (entity_type='POS_IMPORT' AND entity_id=$1) OR metadata->>'sourceFilename'=$2", [importId, sourceFilename]);
  await client.query("DELETE FROM pos_imports WHERE id=$1", [importId]);
  await client.query("COMMIT");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await pool.end();
}
