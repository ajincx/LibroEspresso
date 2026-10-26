import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const databaseUrl = process.env.HISTORICAL_ANOMALY_E2E_DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;

const countId = "4eb49c9b-31d5-4e2f-a9f4-516434306e95";
const countItemId = "84daf737-0660-4f67-95e7-574fdcac093a";

type ApiState = { status: number; body?: any };

function responseHarness() {
  const state: ApiState = { status: 200 };
  const response = {
    status(code: number) { state.status = code; return this; },
    json(body: unknown) { state.body = body; return this; },
  };
  return { state, response };
}

suite("targeted Espresso historical anomaly reconciliation", () => {
  let pool: pg.Pool;
  let reconciliationSql = "";
  let branchId = "";
  let managerId = "";
  let itemId = "";
  let listShrinkageReports: Awaited<typeof import("./inventoryWorkflow.controller.js")>["listShrinkageReports"];
  let beforeAccounting: Record<string, string>;

  beforeAll(async () => {
    if (!databaseUrl) throw new Error("HISTORICAL_ANOMALY_E2E_DATABASE_URL is required");
    const databaseName = decodeURIComponent(new URL(databaseUrl).pathname.slice(1));
    if (!/^libro_historical_anomaly_[a-z0-9_]*e2e$/i.test(databaseName)) {
      throw new Error("Refusing to run outside a disposable libro_historical_anomaly_*_e2e database");
    }

    process.env.NODE_ENV = "test";
    process.env.DATA_LIFECYCLE_ENV = "DEVELOPMENT";
    process.env.DATABASE_URL = databaseUrl;
    pool = new pg.Pool({ connectionString: databaseUrl });
    ({ listShrinkageReports } = await import("./inventoryWorkflow.controller.js"));
    reconciliationSql = await readFile(
      fileURLToPath(new URL("../../scripts/reconcile-espresso-ic-2026-00001-anomaly.sql", import.meta.url)),
      "utf8",
    );

    const identities = await pool.query<{ branchId: string; managerId: string; itemId: string }>(
      `SELECT gen_random_uuid() "branchId", gen_random_uuid() "managerId", gen_random_uuid() "itemId"`,
    );
    ({ branchId, managerId, itemId } = identities.rows[0]!);

    await pool.query(
      `INSERT INTO branches(id,code,name,location) VALUES($1,$2,'Lipa','Disposable reconciliation test')`,
      [branchId, `REC-${branchId.slice(0, 8)}`],
    );
    await pool.query(
      `INSERT INTO users(id,branch_id,first_name,last_name,email,username,password_hash,role,status)
       VALUES($1,$2,'Historical','Manager',$3,$4,'not-used','BRANCH_MANAGER','ACTIVE')`,
      [managerId, branchId, `historical-${managerId}@e2e.local`, `historical-${managerId}`],
    );
    await pool.query(
      `INSERT INTO inventory_items(id,sku,name,category,unit,unit_cost,reorder_level,status,item_scope,origin_branch_id)
       VALUES($1,$2,'Espresso Blend Beans','Disposable Fixture','g',0.50,0,'ACTIVE','GLOBAL',NULL)`,
      [itemId, `REC-${itemId.slice(0, 8)}`],
    );
    await pool.query(
      `INSERT INTO inventory_counts(id,count_no,branch_id,count_date,submitted_by,count_type,effective_at,is_test_data)
       VALUES($1,'IC-2026-00001',$2,DATE '2026-08-26',$3,'FULL',NULL,false)`,
      [countId, branchId, managerId],
    );
    await pool.query(
      `INSERT INTO inventory_count_items(
         id,inventory_count_id,inventory_item_id,previous_actual_quantity,stock_received,
         expected_consumption,approved_adjustments,expected_quantity,actual_quantity,
         variance_quantity,variance_value,unit)
       VALUES($1,$2,$3,388,0,0,0,388,126,-262,-131,'g')`,
      [countItemId, countId, itemId],
    );
    await pool.query(
      `INSERT INTO branch_inventory_balances(branch_id,inventory_item_id,actual_quantity,as_of,is_test_data)
       VALUES($1,$2,126,TIMESTAMPTZ '2026-08-26 23:59:59+08',false)`,
      [branchId, itemId],
    );
    await pool.query(
      `INSERT INTO inventory_movements(branch_id,inventory_item_id,movement_type,quantity,occurred_at,reference_no,notes,created_by)
       VALUES($1,$2,'APPROVED_ADJUSTMENT',1,TIMESTAMPTZ '2026-08-26 23:59:59+08',$3,'Disposable reconciliation fixture',$4)`,
      [branchId, itemId, `REC-${countId}`, managerId],
    );

    beforeAccounting = (await pool.query<Record<string, string>>(
      `SELECT
         (SELECT count(*)::text FROM inventory_counts) counts,
         (SELECT count(*)::text FROM inventory_count_items) count_items,
         (SELECT count(*)::text FROM inventory_movements) movements,
         (SELECT count(*)::text FROM branch_inventory_balances) balances,
         (SELECT coalesce(sum(actual_quantity),0)::text FROM branch_inventory_balances) balance_quantity,
         (SELECT count(*)::text FROM pos_imports) pos_imports,
         (SELECT count(*)::text FROM pos_sale_items) pos_sale_items,
         (SELECT count(*)::text FROM pos_sale_ingredient_usage) usage_rows,
         (SELECT coalesce(sum(quantity_consumed * unit_cost_snapshot),0)::text FROM pos_sale_ingredient_usage) cogs`,
    )).rows[0]!;
  });

  afterAll(async () => {
    if (pool) await pool.end();
  });

  it("starts with eligible authoritative evidence and no linked case", async () => {
    const result = await pool.query<{
      variance: number;
      threshold: number;
      linkedCases: number;
    }>(
      `SELECT ici.variance_quantity::float8 variance,
              greatest(cs.variance_tolerance_quantity,
                ici.expected_quantity * cs.variance_tolerance_percent / 100)::float8 threshold,
              (SELECT count(*)::int FROM shrinkage_reports sr
                WHERE sr.inventory_count_item_id=ici.id) "linkedCases"
         FROM inventory_count_items ici
         CROSS JOIN calculation_settings cs
        WHERE ici.id=$1 AND cs.singleton=true`,
      [countItemId],
    );
    expect(result.rows[0]).toEqual({ variance: -262, threshold: 7.76, linkedCases: 0 });
  });

  it("refuses test-linked and archived cases instead of creating around them", async () => {
    for (const conflict of [
      { reportNo: "SR-CONFLICT-TEST", isTestData: true, archived: false },
      { reportNo: "SR-CONFLICT-ARCHIVED", isTestData: false, archived: true },
    ]) {
      const inserted = await pool.query<{ id: string }>(
        `INSERT INTO shrinkage_reports(
           report_no,branch_id,inventory_item_id,inventory_count_item_id,
           expected_quantity,actual_quantity,variance_quantity,variance_value,unit,
           status,submitted_by,is_test_data,archived_at,archived_by,archive_reason)
         VALUES($1,$2,$3,$4,388,126,-262,-131,'g','DETECTED',$5::uuid,$6::boolean,
           CASE WHEN $7::boolean THEN now() ELSE NULL END,
           CASE WHEN $7::boolean THEN $5::uuid ELSE NULL END,
           CASE WHEN $7::boolean THEN 'Disposable archived conflict' ELSE NULL END)
         RETURNING id`,
        [conflict.reportNo, branchId, itemId, countItemId, managerId, conflict.isTestData, conflict.archived],
      );
      const client = await pool.connect();
      try {
        await expect(client.query(reconciliationSql)).rejects.toThrow(
          "A linked case already exists but does not match the approved DETECTED reconciliation",
        );
        await client.query("ROLLBACK");
      } finally {
        client.release();
      }
      await pool.query("DELETE FROM shrinkage_reports WHERE id=$1", [inserted.rows[0]!.id]);
    }

    const remaining = await pool.query<{ count: number }>(
      "SELECT count(*)::int count FROM shrinkage_reports WHERE inventory_count_item_id=$1",
      [countItemId],
    );
    expect(remaining.rows[0]?.count).toBe(0);
  });

  it("rolls back the case when its reconciliation audit cannot be written", async () => {
    await pool.query(`
      CREATE FUNCTION reject_disposable_reconciliation_audit() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.action='RECONCILE_HISTORICAL_ANOMALY' THEN
          RAISE EXCEPTION 'Disposable forced audit failure';
        END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER reject_disposable_reconciliation_audit
        BEFORE INSERT ON audit_logs
        FOR EACH ROW EXECUTE FUNCTION reject_disposable_reconciliation_audit();
    `);
    const client = await pool.connect();
    try {
      await expect(client.query(reconciliationSql)).rejects.toThrow("Disposable forced audit failure");
      await client.query("ROLLBACK");
    } finally {
      client.release();
    }
    await pool.query(`
      DROP TRIGGER reject_disposable_reconciliation_audit ON audit_logs;
      DROP FUNCTION reject_disposable_reconciliation_audit();
    `);

    const result = await pool.query<{ cases: number; audits: number }>(
      `SELECT
         (SELECT count(*)::int FROM shrinkage_reports WHERE inventory_count_item_id=$1) cases,
         (SELECT count(*)::int FROM audit_logs WHERE action='RECONCILE_HISTORICAL_ANOMALY'
           AND metadata->>'inventoryCountItemId'=$1::text) audits`,
      [countItemId],
    );
    expect(result.rows[0]).toEqual({ cases: 0, audits: 0 });
  });

  it("creates one unclassified DETECTED case and one reconciliation audit record", async () => {
    await pool.query(reconciliationSql);

    const cases = await pool.query(
      `SELECT sr.inventory_count_item_id "countItemId",sr.expected_quantity::float8 expected,
              sr.actual_quantity::float8 actual,sr.variance_quantity::float8 variance,sr.unit,
              sr.status,sr.classification,sr.explanation,sr.is_test_data "isTestData",
              sr.archived_at "archivedAt"
         FROM shrinkage_reports sr WHERE sr.inventory_count_item_id=$1`,
      [countItemId],
    );
    expect(cases.rows).toEqual([{
      countItemId,
      expected: 388,
      actual: 126,
      variance: -262,
      unit: "g",
      status: "DETECTED",
      classification: null,
      explanation: null,
      isTestData: false,
      archivedAt: null,
    }]);

    const audit = await pool.query<{ count: number }>(
      `SELECT count(*)::int count FROM audit_logs
        WHERE action='RECONCILE_HISTORICAL_ANOMALY'
          AND metadata->>'inventoryCountItemId'=$1`,
      [countItemId],
    );
    expect(audit.rows[0]?.count).toBe(1);
  });

  it("is idempotent when repeated and when two executions race", async () => {
    await pool.query(reconciliationSql);
    await Promise.all([pool.query(reconciliationSql), pool.query(reconciliationSql)]);

    const result = await pool.query<{ cases: number; audits: number }>(
      `SELECT
         (SELECT count(*)::int FROM shrinkage_reports WHERE inventory_count_item_id=$1) cases,
         (SELECT count(*)::int FROM audit_logs WHERE action='RECONCILE_HISTORICAL_ANOMALY'
           AND metadata->>'inventoryCountItemId'=$1::text) audits`,
      [countItemId],
    );
    expect(result.rows[0]).toEqual({ cases: 1, audits: 1 });
  });

  it("leaves inventory, ledger, sales, and COGS evidence unchanged", async () => {
    const after = (await pool.query<Record<string, string>>(
      `SELECT
         (SELECT count(*)::text FROM inventory_counts) counts,
         (SELECT count(*)::text FROM inventory_count_items) count_items,
         (SELECT count(*)::text FROM inventory_movements) movements,
         (SELECT count(*)::text FROM branch_inventory_balances) balances,
         (SELECT coalesce(sum(actual_quantity),0)::text FROM branch_inventory_balances) balance_quantity,
         (SELECT count(*)::text FROM pos_imports) pos_imports,
         (SELECT count(*)::text FROM pos_sale_items) pos_sale_items,
         (SELECT count(*)::text FROM pos_sale_ingredient_usage) usage_rows,
         (SELECT coalesce(sum(quantity_consumed * unit_cost_snapshot),0)::text FROM pos_sale_ingredient_usage) cogs`,
    )).rows[0]!;
    expect(after).toEqual(beforeAccounting);
  });

  it("does not affect other branches or ingredients", async () => {
    const unrelated = await pool.query<{ count: number }>(
      `SELECT count(*)::int count FROM shrinkage_reports
        WHERE inventory_count_item_id<>$1 OR branch_id<>$2 OR inventory_item_id<>$3`,
      [countItemId, branchId, itemId],
    );
    expect(unrelated.rows[0]?.count).toBe(0);
  });

  it("returns the reconciled case through the read API with the original count date", async () => {
    const state = responseHarness();
    await listShrinkageReports({
      query: { startDate: "2026-08-26", endDate: "2026-08-26", status: "DETECTED" },
      user: { id: managerId, role: "BRANCH_MANAGER", branchId },
    } as never, state.response as never, () => {});

    expect(state.state.body.data.reports).toEqual([
      expect.objectContaining({
        inventoryCountId: countId,
        inventoryCountItemId: countItemId,
        countNo: "IC-2026-00001",
        countDate: "2026-08-26",
        inventoryItemName: "Espresso Blend Beans",
        varianceQuantity: -262,
        status: "DETECTED",
        classification: null,
      }),
    ]);
  });
});
