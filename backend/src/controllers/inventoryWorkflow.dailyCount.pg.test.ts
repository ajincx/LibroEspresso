import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Set PHASE_C_E2E_DATABASE_URL to a disposable database named libro_phasec_*_e2e.
// This suite deliberately refuses the normal application and production databases.
const databaseUrl = process.env.PHASE_C_E2E_DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;

suite("Opening Count PostgreSQL integration", () => {
  const runId = crypto.randomUUID().slice(0, 8);
  const branchId = crypto.randomUUID();
  const managerId = crypto.randomUUID();
  const baselineId = crypto.randomUUID();
  let inventoryItemId = "";
  let inventoryUnit = "";
  let countId = "";
  let pool: pg.Pool;
  let submitInventoryCount: Awaited<typeof import("./inventoryWorkflow.controller.js")>["submitInventoryCount"];

  beforeAll(async () => {
    if (!databaseUrl) throw new Error("PHASE_C_E2E_DATABASE_URL is required");
    const databaseName = decodeURIComponent(new URL(databaseUrl).pathname.slice(1));
    if (!/^libro_phasec_[a-z0-9_]*e2e$/i.test(databaseName)) {
      throw new Error("Refusing to run Phase C integration tests outside a dedicated libro_phasec_*_e2e database");
    }

    process.env.NODE_ENV = "test";
    process.env.DATABASE_URL = databaseUrl;
    pool = new pg.Pool({ connectionString: databaseUrl });
    ({ submitInventoryCount } = await import("./inventoryWorkflow.controller.js"));

    const item = (await pool.query<{ id: string; unit: string; unitCost: number }>(
      `SELECT id,unit,unit_cost::float8 "unitCost" FROM inventory_items WHERE status='ACTIVE' ORDER BY sku LIMIT 1`,
    )).rows[0]!;
    inventoryItemId = item.id;
    inventoryUnit = item.unit;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO branches(id,code,name,location) VALUES($1,$2,$3,'Disposable PostgreSQL integration test')`,
        [branchId, `PCE2E-${runId}`, `Phase C E2E ${runId}`],
      );
      await client.query(
        `INSERT INTO users(id,branch_id,first_name,last_name,email,username,password_hash,role,status)
         VALUES($1,$2,'Phase','C', $3,$4,'not-used','BRANCH_MANAGER','ACTIVE')`,
        [managerId, branchId, `phasec-${runId}@e2e.local`, `phasec-${runId}`],
      );
      await client.query(
        `INSERT INTO branch_inventory_settings(branch_id,inventory_item_id,current_unit_cost,reorder_level,reorder_days,reorder_category,updated_by)
         VALUES($1,$2,$3,0,7,'MEDIUM',$4)`,
        [branchId, inventoryItemId, item.unitCost, managerId],
      );
      await client.query(
        `INSERT INTO inventory_opening_baselines(id,baseline_no,branch_id,effective_at,designation,notes,created_by)
         VALUES($1,$2,$3,now()-interval '1 day','STARTING_STOCK','Disposable PostgreSQL integration test',$4)`,
        [baselineId, `OB-PCE2E-${runId}`, branchId, managerId],
      );
      await client.query(
        `INSERT INTO inventory_opening_baseline_items(opening_baseline_id,inventory_item_id,quantity,unit)
         VALUES($1,$2,5200,$3)`,
        [baselineId, inventoryItemId, inventoryUnit],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });

  afterAll(async () => {
    if (!pool) return;
    if (countId) await pool.query("DELETE FROM audit_logs WHERE entity_id=$1", [countId]);
    await pool.query("DELETE FROM branch_inventory_balances WHERE branch_id=$1", [branchId]);
    await pool.query("DELETE FROM inventory_count_items WHERE inventory_count_id IN (SELECT id FROM inventory_counts WHERE branch_id=$1)", [branchId]);
    await pool.query("DELETE FROM inventory_counts WHERE branch_id=$1", [branchId]);
    await pool.query("DELETE FROM inventory_opening_baseline_items WHERE opening_baseline_id=$1", [baselineId]);
    await pool.query("DELETE FROM inventory_opening_baselines WHERE id=$1", [baselineId]);
    await pool.query("DELETE FROM branch_inventory_settings WHERE branch_id=$1", [branchId]);
    await pool.query("DELETE FROM users WHERE id=$1", [managerId]);
    await pool.query("DELETE FROM branches WHERE id=$1", [branchId]);
    await pool.end();
  });

  it("preserves an Opening snapshot as a baseline without creating operational shrinkage", async () => {
    const state: { status: number; body?: unknown } = { status: 200 };
    const response = {
      status(code: number) { state.status = code; return this; },
      json(body: unknown) { state.body = body; return this; },
    };
    const businessDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit",
    }).format(new Date());

    await submitInventoryCount({
      body: {
        countDate: businessDate,
        countType: "OPENING",
        items: [{ inventoryItemId, quantity: 5000, enteredUnit: inventoryUnit }],
      },
      user: { id: managerId, role: "BRANCH_MANAGER", branchId },
    } as never, response as never, () => {});

    expect(state.status).toBe(201);
    const stored = await pool.query<{
      id: string;
      countType: string;
      effectiveAt: string | null;
      expectedQuantity: number;
      actualQuantity: number;
      varianceQuantity: number;
    }>(
      `SELECT ic.id,ic.count_type "countType",ic.effective_at "effectiveAt",
              ici.expected_quantity::float8 "expectedQuantity",
              ici.actual_quantity::float8 "actualQuantity",
              ici.variance_quantity::float8 "varianceQuantity"
       FROM inventory_counts ic
       JOIN inventory_count_items ici ON ici.inventory_count_id=ic.id
       WHERE ic.branch_id=$1`,
      [branchId],
    );
    countId = stored.rows[0]!.id;
    expect(stored.rows).toEqual([expect.objectContaining({
      countType: "OPENING",
      expectedQuantity: 5200,
      actualQuantity: 5000,
      varianceQuantity: -200,
    })]);
    expect(stored.rows[0]!.effectiveAt).not.toBeNull();

    const [balance, shrinkage, audit] = await Promise.all([
      pool.query<{ quantity: number }>(
        `SELECT actual_quantity::float8 quantity FROM branch_inventory_balances
         WHERE branch_id=$1 AND inventory_item_id=$2`,
        [branchId, inventoryItemId],
      ),
      pool.query<{ count: number }>(
        `SELECT count(*)::int count
         FROM shrinkage_reports sr
         JOIN inventory_count_items ici ON ici.id=sr.inventory_count_item_id
         WHERE ici.inventory_count_id=$1`,
        [countId],
      ),
      pool.query<{ count: number }>(
        `SELECT count(*)::int count FROM audit_logs WHERE entity_id=$1`,
        [countId],
      ),
    ]);
    expect(balance.rows[0]?.quantity).toBe(5000);
    expect(shrinkage.rows[0]?.count).toBe(0);
    expect(audit.rows[0]?.count).toBeGreaterThan(0);
  });
});
