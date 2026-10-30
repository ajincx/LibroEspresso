import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { calculateExpectedInventory } from "../services/inventoryCalculation.service.js";

const databaseUrl = process.env.PHASE_C_E2E_DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;

suite("Opening variance reconciliation PostgreSQL integration", () => {
  const runId = crypto.randomUUID().slice(0, 8);
  const createdBranches: string[] = [];
  const createdUsers: string[] = [];
  let pool: pg.Pool;
  let inventoryItemId = "";
  let inventoryUnit = "";
  let submitInventoryCount: Awaited<typeof import("./inventoryWorkflow.controller.js")>["submitInventoryCount"];
  let listInventoryVariances: Awaited<typeof import("./inventoryWorkflow.controller.js")>["listInventoryVariances"];

  const manilaDate = (offsetDays = 0) => {
    const now = new Date();
    now.setUTCDate(now.getUTCDate() + offsetDays);
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit",
    }).format(now);
  };

  const responseState = () => {
    const state: { status: number; body?: any } = { status: 200 };
    return {
      state,
      response: {
        status(code: number) { state.status = code; return this; },
        json(body: unknown) { state.body = body; return this; },
      },
    };
  };

  async function seedBranch(label: string, checkpointType: "CLOSING" | "FULL" | "OPENING", actual = 435) {
    const branchId = crypto.randomUUID();
    const managerId = crypto.randomUUID();
    createdBranches.push(branchId);
    createdUsers.push(managerId);
    await pool.query(
      `INSERT INTO branches(id,code,name,location) VALUES($1,$2,$3,'Disposable Opening variance test')`,
      [branchId, `OV-${runId}-${label.slice(0, 5)}`, `Opening variance ${label} ${runId}`],
    );
    await pool.query(
      `INSERT INTO users(id,branch_id,first_name,last_name,email,username,password_hash,role,status)
       VALUES($1,$2,'Opening','Manager',$3,$4,'not-used','BRANCH_MANAGER','ACTIVE')`,
      [managerId, branchId, `opening-${runId}-${label}@e2e.local`, `opening-${runId}-${label}`],
    );
    await pool.query(
      `INSERT INTO branch_inventory_settings(branch_id,inventory_item_id,current_unit_cost,reorder_level,reorder_days,reorder_category,updated_by)
       SELECT $1,$2,unit_cost,0,7,'MEDIUM',$3 FROM inventory_items WHERE id=$2`,
      [branchId, inventoryItemId, managerId],
    );
    const prior = await pool.query<{ id: string }>(
      `INSERT INTO inventory_counts(count_no,branch_id,count_date,submitted_by,count_type,effective_at)
       VALUES($1,$2,$3,$4,$5,$6::timestamptz) RETURNING id`,
      [`IC-OV-${runId}-${label}`, branchId, manilaDate(-1), managerId, checkpointType,
        `${manilaDate(-1)}T20:00:00+08:00`],
    );
    await pool.query(
      `INSERT INTO inventory_count_items(inventory_count_id,inventory_item_id,previous_actual_quantity,
        expected_quantity,actual_quantity,variance_quantity,variance_value,unit)
       VALUES($1,$2,$3,$3,$3,0,0,$4)`,
      [prior.rows[0]!.id, inventoryItemId, actual, inventoryUnit],
    );
    await pool.query(
      `INSERT INTO branch_inventory_balances(branch_id,inventory_item_id,actual_quantity,as_of,is_test_data)
       VALUES($1,$2,$3,$4::timestamptz,false)`,
      [branchId, inventoryItemId, actual, `${manilaDate(-1)}T20:00:00+08:00`],
    );
    return { branchId, managerId, priorCountId: prior.rows[0]!.id };
  }

  async function submit(branchId: string, managerId: string, countType: "OPENING" | "CLOSING", quantity: number) {
    const target = responseState();
    await submitInventoryCount({
      body: { countDate: manilaDate(), countType, items: [{ inventoryItemId, quantity, enteredUnit: inventoryUnit }] },
      user: { id: managerId, role: "BRANCH_MANAGER", branchId },
    } as never, target.response as never, () => {});
    expect(target.state.status).toBe(201);
    return target.state.body.data.count as { id: string; items: Array<{ id: string; expectedQuantity: number; actualQuantity: number; varianceQuantity: number; shrinkageReportId: string | null }> };
  }

  beforeAll(async () => {
    if (!databaseUrl) throw new Error("PHASE_C_E2E_DATABASE_URL is required");
    const databaseName = decodeURIComponent(new URL(databaseUrl).pathname.slice(1));
    if (!/^libro_phasec_[a-z0-9_]*e2e$/i.test(databaseName)) {
      throw new Error("Refusing to run Opening variance integration tests outside a disposable database");
    }
    process.env.NODE_ENV = "test";
    process.env.DATABASE_URL = databaseUrl;
    pool = new pg.Pool({ connectionString: databaseUrl });
    ({ submitInventoryCount, listInventoryVariances } = await import("./inventoryWorkflow.controller.js"));
    const item = (await pool.query<{ id: string; unit: string }>(
      `SELECT id,unit FROM inventory_items WHERE status='ACTIVE' ORDER BY sku LIMIT 1`,
    )).rows[0]!;
    inventoryItemId = item.id;
    inventoryUnit = item.unit;
  });

  afterAll(async () => {
    if (!pool) return;
    for (const branchId of createdBranches) {
      await pool.query("DELETE FROM notifications WHERE branch_id=$1", [branchId]);
      await pool.query("DELETE FROM audit_logs WHERE entity_id IN (SELECT id::text FROM inventory_counts WHERE branch_id=$1)", [branchId]);
      await pool.query("DELETE FROM shrinkage_reports WHERE branch_id=$1", [branchId]);
      await pool.query("DELETE FROM pos_daily_declarations WHERE branch_id=$1", [branchId]);
      await pool.query("DELETE FROM inventory_movements WHERE branch_id=$1", [branchId]);
      await pool.query("DELETE FROM branch_inventory_balances WHERE branch_id=$1", [branchId]);
      await pool.query("DELETE FROM inventory_count_items WHERE inventory_count_id IN (SELECT id FROM inventory_counts WHERE branch_id=$1)", [branchId]);
      await pool.query("DELETE FROM inventory_counts WHERE branch_id=$1", [branchId]);
      await pool.query("DELETE FROM branch_inventory_settings WHERE branch_id=$1", [branchId]);
    }
    for (const userId of createdUsers) await pool.query("DELETE FROM users WHERE id=$1", [userId]);
    for (const branchId of createdBranches) await pool.query("DELETE FROM branches WHERE id=$1", [branchId]);
    await pool.end();
  });

  it("reconciles Closing to Opening, exposes variances, and carries Opening actual into Closing exactly once", async () => {
    const excess = await seedBranch("excess", "CLOSING");
    const excessOpening = await submit(excess.branchId, excess.managerId, "OPENING", 3100);
    expect(excessOpening.items[0]).toMatchObject({ expectedQuantity: 435, actualQuantity: 3100, varianceQuantity: 2665, shrinkageReportId: null });

    const shortage = await seedBranch("shortage", "CLOSING");
    const shortageOpening = await submit(shortage.branchId, shortage.managerId, "OPENING", 400);
    expect(shortageOpening.items[0]).toMatchObject({ expectedQuantity: 435, actualQuantity: 400, varianceQuantity: -35 });
    expect(shortageOpening.items[0]!.shrinkageReportId).toBeTruthy();
    expect((await pool.query<{ count: number }>(
      `SELECT count(*)::int count FROM shrinkage_reports WHERE inventory_count_item_id=$1`,
      [shortageOpening.items[0]!.id],
    )).rows[0]!.count).toBe(1);

    await expect(submitInventoryCount({
      body: { countDate: manilaDate(), countType: "OPENING", items: [{ inventoryItemId, quantity: 400, enteredUnit: inventoryUnit }] },
      user: { id: shortage.managerId, role: "BRANCH_MANAGER", branchId: shortage.branchId },
    } as never, responseState().response as never, () => {})).rejects.toMatchObject({ code: "INVENTORY_COUNT_DUPLICATE" });
    expect((await pool.query<{ count: number }>(
      `SELECT count(*)::int count FROM shrinkage_reports WHERE inventory_count_item_id=$1`,
      [shortageOpening.items[0]!.id],
    )).rows[0]!.count).toBe(1);

    const matched = await seedBranch("matched", "CLOSING");
    expect((await submit(matched.branchId, matched.managerId, "OPENING", 435)).items[0])
      .toMatchObject({ varianceQuantity: 0, shrinkageReportId: null });
    const tolerance = await seedBranch("tolerance", "CLOSING");
    expect((await submit(tolerance.branchId, tolerance.managerId, "OPENING", 434)).items[0])
      .toMatchObject({ varianceQuantity: -1, shrinkageReportId: null });

    const movement = await seedBranch("movement", "CLOSING");
    await pool.query(
      `INSERT INTO inventory_movements(branch_id,inventory_item_id,movement_type,quantity,entered_quantity,entered_unit,occurred_at,created_by,is_test_data)
       VALUES($1,$2,'RECEIPT',999,999,$3,$4::timestamptz,$6,false),
             ($1,$2,'RECEIPT',777,777,$3,$8::timestamptz,$6,false),
             ($1,$2,'RECEIPT',20,20,$3,$5::timestamptz,$6,false),
             ($1,$2,'APPROVED_ADJUSTMENT_DECREASE',5,5,$3,$7::timestamptz,$6,false)`,
      [movement.branchId, inventoryItemId, inventoryUnit,
        `${manilaDate(-1)}T19:59:59+08:00`, `${manilaDate(-1)}T20:00:01+08:00`, movement.managerId,
        `${manilaDate(-1)}T20:00:02+08:00`, `${manilaDate(-1)}T20:00:00+08:00`],
    );
    const movementOpening = await submit(movement.branchId, movement.managerId, "OPENING", 450);
    expect(movementOpening.items[0]).toMatchObject({ expectedQuantity: 450, varianceQuantity: 0 });

    const alternative = await seedBranch("alternative", "FULL", 500);
    const alternativeExpected = await calculateExpectedInventory(
      pool, alternative.branchId, inventoryItemId, manilaDate(), "OPENING", new Date().toISOString(),
    );
    expect(alternativeExpected).toMatchObject({ previousActualQuantity: 500, expectedQuantity: 500, baselineSource: "PHYSICAL_COUNT" });
    expect(alternativeExpected.baselineAt).toBeTruthy();

    const varianceResponse = responseState();
    await listInventoryVariances({ query: { countDate: manilaDate(), varianceScope: "ALL" }, user: {
      id: shortage.managerId, role: "BRANCH_MANAGER", branchId: shortage.branchId,
    } } as never, varianceResponse.response as never, () => {});
    expect(varianceResponse.state.body.data.variances).toEqual([
      expect.objectContaining({ countType: "OPENING", varianceQuantity: -35, anomalyId: shortageOpening.items[0]!.shrinkageReportId }),
    ]);

    await pool.query(
      `INSERT INTO pos_daily_declarations(branch_id,business_date,declaration,declared_by)
       VALUES($1,$2,'NO_SALES_CLOSED',$3)`,
      [shortage.branchId, manilaDate(), shortage.managerId],
    );
    const closing = await submit(shortage.branchId, shortage.managerId, "CLOSING", 400);
    expect(closing.items[0]).toMatchObject({ expectedQuantity: 400, actualQuantity: 400, varianceQuantity: 0, shrinkageReportId: null });
    expect((await pool.query<{ quantity: number }>(
      `SELECT actual_quantity::float8 quantity FROM branch_inventory_balances WHERE branch_id=$1 AND inventory_item_id=$2`,
      [shortage.branchId, inventoryItemId],
    )).rows[0]!.quantity).toBe(400);
    expect((await pool.query<{ actual: number }>(
      `SELECT actual_quantity::float8 actual FROM inventory_count_items WHERE inventory_count_id=$1`,
      [shortage.priorCountId],
    )).rows[0]!.actual).toBe(435);
  });
});
