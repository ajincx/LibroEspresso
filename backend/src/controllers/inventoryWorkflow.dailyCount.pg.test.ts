import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { calculateExpectedInventory, calculateExpectedInventoryBatch } from "../services/inventoryCalculation.service.js";
import { inventoryLedgerKey, loadInventoryLedgerBalances } from "../services/inventoryLedger.service.js";
import { reportRequest } from "../validators/reports.js";

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
  let additionalItemId = "";
  let additionalItemUnit = "";
  let countId = "";
  let pool: pg.Pool;
  let submitInventoryCount: Awaited<typeof import("./inventoryWorkflow.controller.js")>["submitInventoryCount"];
  let updateInventoryCount: Awaited<typeof import("./inventoryWorkflow.controller.js")>["updateInventoryCount"];
  let getExpectedInventory: Awaited<typeof import("./inventoryWorkflow.controller.js")>["getExpectedInventory"];

  beforeAll(async () => {
    if (!databaseUrl) throw new Error("PHASE_C_E2E_DATABASE_URL is required");
    const databaseName = decodeURIComponent(new URL(databaseUrl).pathname.slice(1));
    if (!/^libro_phasec_[a-z0-9_]*e2e$/i.test(databaseName)) {
      throw new Error("Refusing to run Phase C integration tests outside a dedicated libro_phasec_*_e2e database");
    }

    process.env.NODE_ENV = "test";
    process.env.DATABASE_URL = databaseUrl;
    pool = new pg.Pool({ connectionString: databaseUrl });
    ({ submitInventoryCount, updateInventoryCount, getExpectedInventory } = await import("./inventoryWorkflow.controller.js"));

    const items = (await pool.query<{ id: string; unit: string; unitCost: number }>(
      `SELECT id,unit,unit_cost::float8 "unitCost" FROM inventory_items WHERE status='ACTIVE' ORDER BY sku LIMIT 2`,
    )).rows;
    const item = items[0]!;
    const additionalItem = items[1]!;
    inventoryItemId = item.id;
    inventoryUnit = item.unit;
    additionalItemId = additionalItem.id;
    additionalItemUnit = additionalItem.unit;

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
         VALUES($1,$2,$3,0,7,'MEDIUM',$5),($1,$4,$6,0,7,'MEDIUM',$5)`,
        [branchId, inventoryItemId, item.unitCost, additionalItemId, managerId, additionalItem.unitCost],
      );
      await client.query(
        `INSERT INTO inventory_opening_baselines(id,baseline_no,branch_id,effective_at,designation,notes,created_by)
         VALUES($1,$2,$3,now()-interval '1 day','STARTING_STOCK','Disposable PostgreSQL integration test',$4)`,
        [baselineId, `OB-PCE2E-${runId}`, branchId, managerId],
      );
      await client.query(
        `INSERT INTO inventory_opening_baseline_items(opening_baseline_id,inventory_item_id,quantity,unit)
         VALUES($1,$2,5200,$3),($1,$4,700,$5)`,
        [baselineId, inventoryItemId, inventoryUnit, additionalItemId, additionalItemUnit],
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
    await pool.query("DELETE FROM shrinkage_reports WHERE branch_id=$1", [branchId]);
    await pool.query("DELETE FROM inventory_count_corrections WHERE inventory_count_item_id IN (SELECT ici.id FROM inventory_count_items ici JOIN inventory_counts ic ON ic.id=ici.inventory_count_id WHERE ic.branch_id=$1)", [branchId]);
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

  it("preserves a within-tolerance Opening snapshot as a baseline without creating a shortage anomaly", async () => {
    const initialContext:{body?:any}={};
    await getExpectedInventory({query:{countDate:new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Manila",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date()),countType:"OPENING"},user:{id:managerId,role:"BRANCH_MANAGER",branchId}} as never,{json(body:unknown){initialContext.body=body;return this;}} as never,()=>{});
    expect(initialContext.body.data).toMatchObject({startingStockCopyEligible:true,startingStockSource:{id:baselineId}});
    expect(initialContext.body.data.startingStockItems).toEqual(expect.arrayContaining([expect.objectContaining({inventoryItemId,actualQuantity:5200})]));
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
        items: [{ inventoryItemId, quantity: 5300, enteredUnit: inventoryUnit }],
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
      actualQuantity: 5300,
      varianceQuantity: 100,
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
    expect(balance.rows[0]?.quantity).toBe(5300);
    expect(shrinkage.rows[0]?.count).toBe(0);
    expect(audit.rows[0]?.count).toBeGreaterThan(0);
    const blockedContext:{body?:any}={};
    await getExpectedInventory({query:{countDate:businessDate,countType:"OPENING"},user:{id:managerId,role:"BRANCH_MANAGER",branchId}} as never,{json(body:unknown){blockedContext.body=body;return this;}} as never,()=>{});
    expect(blockedContext.body.data).toMatchObject({startingStockCopyEligible:false,startingStockSource:null,startingStockItems:[]});
  });

  it("serializes concurrent additions of a previously uncounted eligible ingredient without replacing the Opening Count", async () => {
    const businessDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit",
    }).format(new Date());
    const updateRequest = () => ({
      params: { id: countId },
      body: {
        countDate: businessDate,
        correctionReason: "Add physically verified ingredient",
        items: [
          { inventoryItemId, quantity: 5300, enteredUnit: inventoryUnit },
          { inventoryItemId: additionalItemId, quantity: 700, enteredUnit: additionalItemUnit },
        ],
      },
      user: { id: managerId, role: "BRANCH_MANAGER", branchId },
    });
    const responseStates: Array<{ body?: unknown }> = [{}, {}];
    await Promise.all(responseStates.map((state) => updateInventoryCount(
      updateRequest() as never,
      { json(body: unknown) { state.body = body; return this; } } as never,
      () => {},
    )));

    const [counts, items, addedBalance] = await Promise.all([
      pool.query<{ count: number }>("SELECT count(*)::int count FROM inventory_counts WHERE branch_id=$1 AND count_type='OPENING'", [branchId]),
      pool.query<{ inventoryItemId: string; actualQuantity: number }>(
        `SELECT inventory_item_id "inventoryItemId",actual_quantity::float8 "actualQuantity"
         FROM inventory_count_items WHERE inventory_count_id=$1 AND voided_at IS NULL ORDER BY inventory_item_id`,
        [countId],
      ),
      pool.query<{ quantity: number }>(
        `SELECT actual_quantity::float8 quantity FROM branch_inventory_balances
         WHERE branch_id=$1 AND inventory_item_id=$2`,
        [branchId, additionalItemId],
      ),
    ]);
    expect(responseStates).toEqual([
      { body: expect.objectContaining({ success: true }) },
      { body: expect.objectContaining({ success: true }) },
    ]);
    expect(counts.rows[0]?.count).toBe(1);
    expect(items.rows).toHaveLength(2);
    expect(items.rows).toContainEqual({ inventoryItemId: additionalItemId, actualQuantity: 700 });
    expect(addedBalance.rows[0]?.quantity).toBe(700);

    await expect(updateInventoryCount({
      params: { id: countId },
      body: {
        countDate: businessDate,
        correctionReason: "Attempt to omit original ingredient",
        items: [{ inventoryItemId: additionalItemId, quantity: 700, enteredUnit: additionalItemUnit }],
      },
      user: { id: managerId, role: "BRANCH_MANAGER", branchId },
    } as never, { json() { return this; } } as never, () => {})).rejects.toMatchObject({ code: "COUNT_ITEMS_MISMATCH" });
    expect((await pool.query<{ count: number }>(
      "SELECT count(*)::int count FROM inventory_count_items WHERE inventory_count_id=$1 AND voided_at IS NULL",
      [countId],
    )).rows[0]?.count).toBe(2);
  });

  it("uses the latest correction, then falls back to Starting Stock after that count item is voided", async () => {
    const countItem = (await pool.query<{ id: string }>(
      "SELECT id FROM inventory_count_items WHERE inventory_count_id=$1 AND inventory_item_id=$2",
      [countId, inventoryItemId],
    )).rows[0]!;
    const businessDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit",
    }).format(new Date());

    await pool.query(
      `INSERT INTO inventory_count_corrections
       (inventory_count_item_id,revision,previous_actual_quantity,corrected_actual_quantity,
        previous_variance_quantity,corrected_variance_quantity,previous_variance_value,corrected_variance_value,reason,corrected_by)
       VALUES($1,(SELECT coalesce(max(revision),0)+1 FROM inventory_count_corrections WHERE inventory_count_item_id=$1),5000,5100,-200,-100,-200,-100,'Disposable correction test',$2)`,
      [countItem.id, managerId],
    );
    const corrected = await calculateExpectedInventory(pool, branchId, inventoryItemId, businessDate);
    expect(corrected).toMatchObject({ previousActualQuantity: 5100, baselineSource: "DAILY_OPENING" });

    await pool.query("UPDATE inventory_count_items SET voided_at=now() WHERE id=$1", [countItem.id]);
    const [single, batch] = await Promise.all([
      calculateExpectedInventory(pool, branchId, inventoryItemId, businessDate),
      calculateExpectedInventoryBatch(pool, branchId, businessDate),
    ]);
    expect(single).toMatchObject({ previousActualQuantity: 5200, expectedQuantity: 5200, baselineSource: "OPENING_BASELINE" });
    expect(batch.items.find((item) => item.inventoryItemId === inventoryItemId))
      .toMatchObject({ previousActualQuantity: 5200, expectedQuantity: 5200, baselineSource: "OPENING_BASELINE" });
    const ledger = await loadInventoryLedgerBalances(pool, [{ branchId, inventoryItemId, canonicalUnit: inventoryUnit }]);
    expect(ledger.get(inventoryLedgerKey(branchId, inventoryItemId))?.calculatedBalance).toBe(5200);
    expect(ledger.get(inventoryLedgerKey(branchId, inventoryItemId))?.availability).toBe("AVAILABLE");
    expect((await pool.query("SELECT actual_quantity::float8 quantity FROM branch_inventory_balances WHERE branch_id=$1 AND inventory_item_id=$2", [branchId, inventoryItemId])).rows[0].quantity)
      .toBe(5300);

    const { buildReportDataset } = await import("../services/reportDataset.service.js");
    const report = await buildReportDataset(
      { id: managerId, role: "BRANCH_MANAGER", branchId },
      reportRequest.parse({ reportTypes: ["INVENTORY_VARIANCE", "SHRINKAGE"], startDate: businessDate, endDate: businessDate }),
    );
    expect(report.sections.map((section) => section.title)).toContain("Inventory Variance");
    expect(report.sections.find((section) => section.title === "Inventory Variance")?.rows).toEqual([
      expect.objectContaining({ expectedQuantity: 700, actualQuantity: 700, varianceQuantity: 0, varianceStatus: "MATCHED" }),
    ]);

    const fullCountId = (await pool.query<{ id: string }>(
      `INSERT INTO inventory_counts(count_no,branch_id,count_date,submitted_by,count_type)
       VALUES($1,$2,$3,$4,'FULL') RETURNING id`,
      [`IC-PCE2E-${runId}`, branchId, businessDate, managerId],
    )).rows[0]!.id;
    const fullItemId = (await pool.query<{ id: string }>(
      `INSERT INTO inventory_count_items(inventory_count_id,inventory_item_id,previous_actual_quantity,
        expected_quantity,actual_quantity,variance_quantity,variance_value,unit)
       VALUES($1,$2,5200,5200,5100,-100,-100,$3) RETURNING id`,
      [fullCountId, inventoryItemId, inventoryUnit],
    )).rows[0]!.id;
    await pool.query(
      `INSERT INTO inventory_count_corrections
       (inventory_count_item_id,revision,previous_actual_quantity,corrected_actual_quantity,
        previous_variance_quantity,corrected_variance_quantity,previous_variance_value,corrected_variance_value,reason,corrected_by)
       VALUES($1,1,5100,5300,-100,100,-100,100,'Disposable Full Count correction test',$2)`,
      [fullItemId, managerId],
    );
    const correctedReport = await buildReportDataset(
      { id: managerId, role: "BRANCH_MANAGER", branchId },
      reportRequest.parse({ reportTypes: ["INVENTORY_VARIANCE", "SHRINKAGE"], startDate: businessDate, endDate: businessDate }),
    );
    expect(correctedReport.sections.find((section) => section.title === "Inventory Variance")?.rows)
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ expectedQuantity: 5200, actualQuantity: 5300, varianceQuantity: 100, varianceStatus: "EXCESS" }),
        expect.objectContaining({ expectedQuantity: 700, actualQuantity: 700, varianceQuantity: 0, varianceStatus: "MATCHED" }),
      ]));
    expect(correctedReport.reportGroups.find((group) => group.reportType === "INVENTORY_VARIANCE")?.summary)
      .toContainEqual(expect.objectContaining({ key: "detected", value: 0 }));

    const itemWithoutStartingStock = (await pool.query<{ id: string; unit: string }>(
      "SELECT id,unit FROM inventory_items WHERE status='ACTIVE' AND id<>ALL($1::uuid[]) ORDER BY sku LIMIT 1",
      [[inventoryItemId, additionalItemId]],
    )).rows[0]!;
    await pool.query(
      `INSERT INTO inventory_count_items(inventory_count_id,inventory_item_id,previous_actual_quantity,
        expected_quantity,actual_quantity,variance_quantity,variance_value,unit,voided_at)
       VALUES($1,$2,900,900,900,0,0,$3,now())`,
      [fullCountId, itemWithoutStartingStock.id, itemWithoutStartingStock.unit],
    );
    await pool.query(
      "INSERT INTO branch_inventory_balances(branch_id,inventory_item_id,actual_quantity,as_of) VALUES($1,$2,900,now())",
      [branchId, itemWithoutStartingStock.id],
    );
    await expect(calculateExpectedInventory(pool, branchId, itemWithoutStartingStock.id, businessDate))
      .rejects.toMatchObject({ code: "NO_VALID_HISTORICAL_BASELINE" });
    const noBaselineBatch = await calculateExpectedInventoryBatch(pool, branchId, businessDate);
    expect(noBaselineBatch.unavailableItems).toContainEqual(expect.objectContaining({
      inventoryItemId: itemWithoutStartingStock.id, availability: "NO_BASELINE",
    }));
    const noBaselineLedger = await loadInventoryLedgerBalances(pool, [{
      branchId, inventoryItemId: itemWithoutStartingStock.id, canonicalUnit: itemWithoutStartingStock.unit,
    }]);
    expect(noBaselineLedger.get(inventoryLedgerKey(branchId, itemWithoutStartingStock.id))).toMatchObject({
      availability: "NO_BASELINE", activities: [], calculatedBalance: 0,
    });
  });

  it("retains archived investigation history without treating a voided item as official shrinkage", async () => {
    const businessDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit",
    }).format(new Date());
    const archivedCountDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit",
    }).format(new Date(Date.now() - 86_400_000));
    const archivedCountId = (await pool.query<{ id: string }>(
      `INSERT INTO inventory_counts(count_no,branch_id,count_date,submitted_by,count_type)
       VALUES($1,$2,$3,$4,'FULL') RETURNING id`,
      [`IC-PCE2EA-${runId}`, branchId, archivedCountDate, managerId],
    )).rows[0]!.id;
    const archivedItemId = (await pool.query<{ id: string }>(
      `INSERT INTO inventory_count_items(inventory_count_id,inventory_item_id,previous_actual_quantity,
        expected_quantity,actual_quantity,variance_quantity,variance_value,unit)
       VALUES($1,$2,5200,5200,5100,-100,-100,$3) RETURNING id`,
      [archivedCountId, inventoryItemId, inventoryUnit],
    )).rows[0]!.id;
    const archivedReportId = (await pool.query<{ id: string }>(
      `INSERT INTO shrinkage_reports(report_no,branch_id,inventory_item_id,inventory_count_item_id,
        expected_quantity,actual_quantity,variance_quantity,variance_value,unit,status,classification,
        submitted_by,investigated_at,explanation,archived_at,archived_by,archive_reason)
       VALUES($1,$2,$3,$4,5200,5100,-100,-100,$5,'VERIFIED','SPOILAGE',$6,now(),
         'Disposable investigation evidence',now(),$6,'Disposable archive test') RETURNING id`,
      [`SR-PCE2E-${runId}`, branchId, inventoryItemId, archivedItemId, inventoryUnit, managerId],
    )).rows[0]!.id;
    const { listShrinkageReports, getShrinkageReport } = await import("./inventoryWorkflow.controller.js");
    const request = { user: { id: managerId, role: "BRANCH_MANAGER", branchId } };
    const responseFor = () => {
      const state: { body?: { data?: { reports?: Array<{ id: string }> } } } = {};
      return { state, response: { json(body: typeof state.body) { state.body = body; return this; } } };
    };
    const active = responseFor();
    await listShrinkageReports({ ...request, query: {} } as never, active.response as never, () => {});
    expect(active.state.body?.data?.reports?.some((row) => row.id === archivedReportId)).toBe(false);
    const archived = responseFor();
    await listShrinkageReports({ ...request, query: { archiveScope: "ARCHIVED" } } as never, archived.response as never, () => {});
    expect(archived.state.body?.data?.reports).toContainEqual(expect.objectContaining({ id: archivedReportId }));
    const detail = { body: undefined as unknown };
    await getShrinkageReport({ ...request, params: { id: archivedReportId } } as never,
      { json(body: unknown) { detail.body = body; return this; } } as never, () => {});
    expect(detail.body).toEqual(expect.objectContaining({ data: { report: expect.objectContaining({ id: archivedReportId, archivedAt: expect.any(Date) }) } }));

    const { buildReportDataset } = await import("../services/reportDataset.service.js");
    const reportInput = reportRequest.parse({ reportTypes: ["SHRINKAGE"], startDate: businessDate, endDate: businessDate });
    const historical = await buildReportDataset(request.user as never, reportInput);
    expect(historical.summary).toContainEqual(expect.objectContaining({ key: "verified", value: 100 }));
    await pool.query("UPDATE inventory_count_items SET voided_at=now() WHERE id=$1", [archivedItemId]);
    const invalidated = await buildReportDataset(request.user as never, reportInput);
    expect(invalidated.summary).toContainEqual(expect.objectContaining({ key: "verified", value: 0 }));
    const retained = responseFor();
    await listShrinkageReports({ ...request, query: { archiveScope: "ARCHIVED" } } as never, retained.response as never, () => {});
    expect(retained.state.body?.data?.reports).toContainEqual(expect.objectContaining({ id: archivedReportId }));
  });
});
