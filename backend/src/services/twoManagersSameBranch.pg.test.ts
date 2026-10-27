import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const databaseUrl = process.env.TWO_MANAGERS_E2E_DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;

suite("two managers assigned to one branch", () => {
  let pool: pg.Pool;
  let configureBranchReorderPolicy: Awaited<typeof import("./branchInventorySettings.service.js")>["configureBranchReorderPolicy"];
  const branchId = randomUUID();
  const otherBranchId = randomUUID();
  const managerA = randomUUID();
  const managerB = randomUUID();
  const itemId = randomUUID();

  beforeAll(async () => {
    if (!databaseUrl) throw new Error("Disposable database URL is required");
    const databaseName = decodeURIComponent(new URL(databaseUrl).pathname.slice(1));
    if (!/^libro_phase3fix12_managers_[a-z0-9_]*_e2e$/i.test(databaseName)) throw new Error("Refusing a non-disposable database");
    process.env.NODE_ENV = "test";
    process.env.DATA_LIFECYCLE_ENV = "DEVELOPMENT";
    process.env.DATABASE_URL = databaseUrl;
    process.env.JWT_SECRET = "phase3-fix12-manager-test-secret-at-least-32-characters";
    pool = new pg.Pool({ connectionString: databaseUrl });
    ({ configureBranchReorderPolicy } = await import("./branchInventorySettings.service.js"));
    const identity = await pool.query<{ database: string; address: string }>(`SELECT current_database() "database",split_part(inet_server_addr()::text,'/',1) "address"`);
    expect(identity.rows[0]?.database).toBe(databaseName);
    expect(["127.0.0.1", "::1"]).toContain(identity.rows[0]?.address);
    await pool.query(`INSERT INTO branches(id,code,name,location) VALUES($1,$2,'Shared Manager Branch','Disposable'),($3,$4,'Other Branch','Disposable')`, [branchId, `M-${branchId.slice(0, 8)}`, otherBranchId, `O-${otherBranchId.slice(0, 8)}`]);
    await pool.query(
      `INSERT INTO users(id,branch_id,first_name,last_name,email,username,password_hash,role,status) VALUES
       ($1,$3,'Manager','One',$4,$5,'unused','BRANCH_MANAGER','ACTIVE'),
       ($2,$3,'Manager','Two',$6,$7,'unused','BRANCH_MANAGER','ACTIVE')`,
      [managerA, managerB, branchId, `manager-a-${managerA}@example.test`, `manager-a-${managerA}`, `manager-b-${managerB}@example.test`, `manager-b-${managerB}`],
    );
    await pool.query(
      `INSERT INTO inventory_items(id,sku,name,category,unit,unit_cost,reorder_level,item_scope,origin_branch_id,created_by)
       VALUES($1,$2,'Shared Ingredient','Verification','g',0.10,5,'BRANCH',$3,$4)`,
      [itemId, `MGR-${itemId.slice(0, 8)}`, branchId, managerA],
    );
  });

  afterAll(async () => { if (pool) await pool.end(); });

  it("allows both managers to operate on shared branch data with separate audit identities", async () => {
    const clientA = await pool.connect();
    try {
      await clientA.query("BEGIN");
      await configureBranchReorderPolicy(clientA, { id: managerA, role: "BRANCH_MANAGER", branchId }, { branchId, inventoryItemId: itemId, category: "FAST", reorderLevel: 20, reorderDays: 7, reason: "Manager one verified the branch policy." });
      await clientA.query("COMMIT");
    } finally { clientA.release(); }
    const clientB = await pool.connect();
    try {
      await clientB.query("BEGIN");
      await configureBranchReorderPolicy(clientB, { id: managerB, role: "BRANCH_MANAGER", branchId }, { branchId, inventoryItemId: itemId, category: "MEDIUM", reorderLevel: 25, reorderDays: 9, reason: "Manager two reviewed the shared policy." });
      await clientB.query("COMMIT");
    } finally { clientB.release(); }
    const shared = await pool.query(`SELECT reorder_level::float8 "reorderLevel",reorder_days "reorderDays",updated_by "updatedBy" FROM branch_inventory_settings WHERE branch_id=$1 AND inventory_item_id=$2`, [branchId, itemId]);
    expect(shared.rows[0]).toMatchObject({ reorderLevel: 25, reorderDays: 9, updatedBy: managerB });
    const actors = await pool.query<{ userId: string }>(`SELECT DISTINCT user_id "userId" FROM audit_logs WHERE action='CONFIGURE_BRANCH_REORDER_POLICY' AND branch_id=$1 AND entity_id=$2::text ORDER BY user_id`, [branchId, itemId]);
    expect(actors.rows.map((row) => row.userId).sort()).toEqual([managerA, managerB].sort());
  });

  it("rejects either manager from operating on another branch", async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await expect(configureBranchReorderPolicy(client, { id: managerA, role: "BRANCH_MANAGER", branchId }, { branchId: otherBranchId, inventoryItemId: itemId, category: "SLOW", reorderLevel: 1, reorderDays: 1, reason: "This must remain branch isolated." })).rejects.toMatchObject({ code: "BRANCH_SCOPE_FORBIDDEN" });
      await client.query("ROLLBACK");
    } finally { client.release(); }
    expect((await pool.query(`SELECT count(*)::int count FROM branch_inventory_settings WHERE branch_id=$1`, [otherBranchId])).rows[0]?.count).toBe(0);
  });
});
