import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const geminiMocks = vi.hoisted(() => ({ generate: vi.fn() }));
vi.mock("../services/geminiInsights.service.js", () => ({ generateGeminiShrinkageAnalysis: geminiMocks.generate }));

const databaseUrl = process.env.PHASE_C_E2E_DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;

type ApiState = { status: number; body?: any };

function responseHarness() {
  const state: ApiState = { status: 200 };
  const response = {
    status(code: number) { state.status = code; return this; },
    json(body: unknown) { state.body = body; return this; },
  };
  return { state, response };
}

suite("inventory variance to system-detected anomaly PostgreSQL integration", () => {
  let pool: pg.Pool;
  let submitInventoryCount: Awaited<typeof import("./inventoryWorkflow.controller.js")>["submitInventoryCount"];
  let listInventoryVariances: Awaited<typeof import("./inventoryWorkflow.controller.js")>["listInventoryVariances"];
  let listShrinkageReports: Awaited<typeof import("./inventoryWorkflow.controller.js")>["listShrinkageReports"];
  let getShrinkageReport: Awaited<typeof import("./inventoryWorkflow.controller.js")>["getShrinkageReport"];
  let submitShrinkageInvestigation: Awaited<typeof import("./inventoryWorkflow.controller.js")>["submitShrinkageInvestigation"];
  let getShrinkageAiAnalysis: Awaited<typeof import("./shrinkageAi.controller.js")>["getShrinkageAiAnalysis"];
  let branchId = "";
  let otherBranchId = "";
  let managerId = "";
  let otherManagerId = "";
  let businessDate = "";
  const itemIds = {
    material: randomUUID(),
    belowTolerance: randomUUID(),
    matched: randomUUID(),
    excess: randomUUID(),
  };

  const manager = (id = managerId, branch = branchId) => ({ id, role: "BRANCH_MANAGER", branchId: branch } as const);

  async function submitCount(countType: "OPENING" | "CLOSING", quantities: Record<string, number>) {
    const result = responseHarness();
    await submitInventoryCount({
      body: {
        countDate: businessDate,
        countType,
        items: Object.entries(quantities).map(([inventoryItemId, quantity]) => ({ inventoryItemId, quantity, enteredUnit: "g" })),
      },
      user: manager(),
    } as never, result.response as never, () => {});
    expect(result.state.status).toBe(201);
    return result.state.body.data.count as {
      id: string;
      countNo: string;
      items: Array<{ id: string; inventoryItemId: string; varianceQuantity: number; shrinkageReportId: string | null }>;
    };
  }

  beforeAll(async () => {
    if (!databaseUrl) throw new Error("PHASE_C_E2E_DATABASE_URL is required");
    const databaseName = decodeURIComponent(new URL(databaseUrl).pathname.slice(1));
    if (!/^libro_phasec_[a-z0-9_]*e2e$/i.test(databaseName)) {
      throw new Error("Refusing to run anomaly integration tests outside a disposable libro_phasec_*_e2e database");
    }
    process.env.NODE_ENV = "test";
    process.env.DATA_LIFECYCLE_ENV = "DEVELOPMENT";
    process.env.DATABASE_URL = databaseUrl;
    pool = new pg.Pool({ connectionString: databaseUrl });
    ({ submitInventoryCount, listInventoryVariances, listShrinkageReports, getShrinkageReport, submitShrinkageInvestigation } = await import("./inventoryWorkflow.controller.js"));
    ({ getShrinkageAiAnalysis } = await import("./shrinkageAi.controller.js"));

    const { manilaBusinessDate } = await import("../services/businessTime.service.js");
    const today = new Date(`${manilaBusinessDate()}T12:00:00+08:00`);
    today.setUTCDate(today.getUTCDate() - 1);
    businessDate = today.toISOString().slice(0, 10);
    branchId = randomUUID();
    otherBranchId = randomUUID();
    managerId = randomUUID();
    otherManagerId = randomUUID();

    await pool.query(
      `INSERT INTO branches(id,code,name,location) VALUES
        ($1,$2,'Anomaly Integration Branch','Disposable PostgreSQL test'),
        ($3,$4,'Other Anomaly Branch','Disposable PostgreSQL test')`,
      [branchId, `AN-${branchId.slice(0, 8)}`, otherBranchId, `AN-${otherBranchId.slice(0, 8)}`],
    );
    await pool.query(
      `INSERT INTO users(id,branch_id,first_name,last_name,email,username,password_hash,role,status) VALUES
        ($1,$2,'Anomaly','Manager',$3,$4,'not-used','BRANCH_MANAGER','ACTIVE'),
        ($5,$6,'Other','Manager',$7,$8,'not-used','BRANCH_MANAGER','ACTIVE')`,
      [managerId, branchId, `anomaly-${managerId}@e2e.local`, `anomaly-${managerId}`, otherManagerId, otherBranchId, `anomaly-${otherManagerId}@e2e.local`, `anomaly-${otherManagerId}`],
    );

    const itemRows = [
      [itemIds.material, "AN-MATERIAL", "Espresso Beans Material Shortage"],
      [itemIds.belowTolerance, "AN-BELOW", "Caramel Syrup Below Tolerance"],
      [itemIds.matched, "AN-MATCH", "Matched Ingredient"],
      [itemIds.excess, "AN-EXCESS", "Positive Variance Ingredient"],
    ];
    for (const [id, sku, name] of itemRows) {
      await pool.query(
        `INSERT INTO inventory_items(id,sku,name,category,unit,unit_cost,reorder_level,status,item_scope,origin_branch_id)
         VALUES($1,$2,$3,'Disposable Fixture','g',0.50,0,'ACTIVE','GLOBAL',NULL)`,
        [id, sku, name],
      );
      await pool.query(
        `INSERT INTO branch_inventory_settings(branch_id,inventory_item_id,current_unit_cost,reorder_level,reorder_days,reorder_category,updated_by)
         VALUES($1,$2,0.50,0,7,'MEDIUM',$3)`,
        [branchId, id, managerId],
      );
    }
    const baselineId = randomUUID();
    await pool.query(
      `INSERT INTO inventory_opening_baselines(id,baseline_no,branch_id,effective_at,designation,notes,created_by)
       VALUES($1,$2,$3,$4::date - 1,'STARTING_STOCK','Disposable anomaly integration baseline',$5)`,
      [baselineId, `OB-AN-${baselineId.slice(0, 8)}`, branchId, businessDate, managerId],
    );
    for (const itemId of Object.values(itemIds)) {
      await pool.query(
        `INSERT INTO inventory_opening_baseline_items(opening_baseline_id,inventory_item_id,quantity,unit) VALUES($1,$2,5000,'g')`,
        [baselineId, itemId],
      );
    }
  });

  afterAll(async () => {
    if (pool) await pool.end();
  });

  it("persists one traceable DETECTED case for one qualifying submitted variance", async () => {
    const openingQuantities = Object.fromEntries(Object.values(itemIds).map((id) => [id, 5000]));
    const opening = await submitCount("OPENING", openingQuantities);
    await pool.query(
      `INSERT INTO pos_daily_declarations(branch_id,business_date,declaration,notes,declared_by)
       VALUES($1,$2,'NO_SALES_CLOSED','Disposable no-sales closing prerequisite',$3)`,
      [branchId, businessDate, managerId],
    );

    const closing = await submitCount("CLOSING", {
      [itemIds.material]: 4000,
      [itemIds.belowTolerance]: 4999,
      [itemIds.matched]: 5000,
      [itemIds.excess]: 5100,
    });
    const materialItem = closing.items.find((item) => item.inventoryItemId === itemIds.material)!;
    expect(materialItem.varianceQuantity).toBe(-1000);
    expect(materialItem.shrinkageReportId).toMatch(/[0-9a-f-]{36}/);
    expect(closing.items.filter((item) => item.shrinkageReportId)).toHaveLength(1);

    const variances = responseHarness();
    await listInventoryVariances({ query: { countDate: businessDate }, user: manager() } as never, variances.response as never, () => {});
    const variance = variances.state.body.data.variances.find((row: any) => row.inventoryItemId === itemIds.material);
    expect(variance).toMatchObject({
      countItemId: materialItem.id,
      countNo: closing.countNo,
      countDate: businessDate,
      inventoryItemId: itemIds.material,
      expectedQuantity: 5000,
      actualQuantity: 4000,
      varianceQuantity: -1000,
      unit: "g",
      anomalyId: materialItem.shrinkageReportId,
      anomalyStatus: "DETECTED",
      requiresInvestigation: true,
    });

    const anomalies = responseHarness();
    await listShrinkageReports({
      query: { startDate: businessDate, endDate: businessDate, status: "DETECTED" },
      user: manager(),
    } as never, anomalies.response as never, () => {});
    expect(anomalies.state.body.data.reports).toHaveLength(1);
    expect(anomalies.state.body.data.reports[0]).toMatchObject({
      id: variance.anomalyId,
      inventoryCountId: closing.id,
      inventoryCountItemId: variance.countItemId,
      countNo: variance.countNo,
      countDate: variance.countDate,
      inventoryItemId: variance.inventoryItemId,
      expectedQuantity: variance.expectedQuantity,
      actualQuantity: variance.actualQuantity,
      varianceQuantity: variance.varianceQuantity,
      unit: variance.unit,
      status: "DETECTED",
      classification: null,
    });
    expect(anomalies.state.body.data.missingInvestigationCount).toBe(0);

    const persisted = await pool.query<{ count: number }>(
      `SELECT count(*)::int count FROM shrinkage_reports WHERE inventory_count_item_id=$1`,
      [materialItem.id],
    );
    expect(persisted.rows[0]?.count).toBe(1);

    const interval = (await pool.query<{ occurredAt: Date }>(
      `SELECT opening.effective_at + ((closing.effective_at-opening.effective_at)/2) "occurredAt"
         FROM inventory_counts opening
         JOIN inventory_counts closing ON closing.id=$2
        WHERE opening.id=$1`,
      [opening.id, closing.id],
    )).rows[0]!;
    const incidentId = randomUUID();
    const incidentItemId = randomUUID();
    await pool.query(
      `INSERT INTO incident_reports(id,submitted_by,branch_id,inventory_item_id,incident_type,quantity,occurred_at,reason,status,verified_by,verified_at)
       VALUES($1,$2,$3,$4,'SPILLAGE',1000,$5,'Disposable AI candidate','VERIFIED',$2,now())`,
      [incidentId, managerId, branchId, itemIds.material, interval.occurredAt],
    );
    await pool.query(
      `INSERT INTO incident_report_items(id,incident_report_id,inventory_item_id,quantity,unit)
       VALUES($1,$2,$3,1000,'g')`,
      [incidentItemId, incidentId, itemIds.material],
    );
    geminiMocks.generate.mockResolvedValueOnce({
      observation: "The shortage and incident quantities align.",
      risk: "The incident remains supporting evidence only.",
      recommendation: "Review the evidence before classification.",
      limitations: "No causal conclusion is established.",
    });
    const ai = responseHarness();
    await getShrinkageAiAnalysis(
      { params: { id: materialItem.shrinkageReportId }, user: manager() } as never,
      ai.response as never,
      () => {},
    );
    expect(ai.state.body).toMatchObject({ success: true, data: { source: "GOOGLE_GEMINI" } });
    expect(geminiMocks.generate).toHaveBeenCalledWith(expect.objectContaining({
      candidateIncidents: [expect.objectContaining({
        incidentReportId: incidentId,
        incidentReportItemId: incidentItemId,
        matchQuality: "EXACT",
        evidenceStatus: "UNVERIFIED",
      })],
    }));

    await expect(submitCount("CLOSING", {
      [itemIds.material]: 4000,
    })).rejects.toMatchObject({ code: "INVENTORY_COUNT_DUPLICATE" });
    const afterRetry = await pool.query<{ count: number }>(
      `SELECT count(*)::int count FROM shrinkage_reports WHERE inventory_count_item_id=$1`,
      [materialItem.id],
    );
    expect(afterRetry.rows[0]?.count).toBe(1);
  });

  it("keeps nonqualifying evidence and branch access distinct from the anomaly lifecycle", async () => {
    const variances = responseHarness();
    await listInventoryVariances({ query: { countDate: businessDate }, user: manager() } as never, variances.response as never, () => {});
    const rows = variances.state.body.data.variances as any[];
    expect(rows.find((row) => row.inventoryItemId === itemIds.belowTolerance)).toMatchObject({ varianceQuantity: -1, anomalyId: null, requiresInvestigation: false });
    expect(rows.find((row) => row.inventoryItemId === itemIds.excess)).toMatchObject({ varianceQuantity: 100, anomalyId: null, requiresInvestigation: false });
    expect(rows.some((row) => row.inventoryItemId === itemIds.matched)).toBe(false);

    const matched = responseHarness();
    await listInventoryVariances({ query: { countDate: businessDate, varianceScope: "MATCHED" }, user: manager() } as never, matched.response as never, () => {});
    expect(matched.state.body.data.variances).toEqual(expect.arrayContaining([
      expect.objectContaining({ inventoryItemId: itemIds.matched, varianceQuantity: 0, anomalyId: null }),
    ]));

    const anomaly = (await pool.query<{ id: string }>(
      `SELECT id FROM shrinkage_reports WHERE branch_id=$1 AND inventory_item_id=$2`,
      [branchId, itemIds.material],
    )).rows[0]!.id;
    const unauthorizedList = responseHarness();
    await listShrinkageReports({ query: {}, user: manager(otherManagerId, otherBranchId) } as never, unauthorizedList.response as never, () => {});
    expect(unauthorizedList.state.body.data.reports).toHaveLength(0);

    await expect(getShrinkageReport({ params: { id: anomaly }, user: manager(otherManagerId, otherBranchId) } as never, responseHarness().response as never, () => {}))
      .rejects.toMatchObject({ status: 404, code: "SHRINKAGE_REPORT_NOT_FOUND" });

    const investigated = responseHarness();
    await submitShrinkageInvestigation({
      params: { id: anomaly },
      body: { classification: "WASTAGE", explanation: "Verified operational wastage in disposable testing." },
      user: manager(),
    } as never, investigated.response as never, () => {});
    expect(investigated.state.body.data.report).toMatchObject({ id: anomaly, status: "VERIFIED", classification: "WASTAGE" });

    const reloaded = responseHarness();
    await getShrinkageReport({ params: { id: anomaly }, user: manager() } as never, reloaded.response as never, () => {});
    expect(reloaded.state.body.data.report).toMatchObject({ id: anomaly, status: "VERIFIED", classification: "WASTAGE" });
  });

  it("surfaces legacy missing cases without fabricating them and excludes test, voided, and corrected-below-threshold evidence", async () => {
    const historicalCountId = randomUUID();
    await pool.query(
      `INSERT INTO inventory_counts(id,count_no,branch_id,count_date,submitted_by,count_type,effective_at)
       VALUES($1,$2,$3,$4,$5,'FULL',NULL)`,
      [historicalCountId, `IC-LEGACY-${historicalCountId.slice(0, 8)}`, branchId, businessDate, managerId],
    );
    const missingItemId = randomUUID();
    const correctedItemId = randomUUID();
    const voidedItemId = randomUUID();
    await pool.query(
      `INSERT INTO inventory_count_items(id,inventory_count_id,inventory_item_id,previous_actual_quantity,stock_received,
         expected_consumption,approved_adjustments,expected_quantity,actual_quantity,variance_quantity,variance_value,unit)
       VALUES
         ($1,$4,$5,5000,0,0,0,5000,4500,-500,-250,'g'),
         ($2,$4,$6,5000,0,0,0,5000,4500,-500,-250,'g'),
         ($3,$4,$7,5000,0,0,0,5000,4500,-500,-250,'g')`,
      [missingItemId, correctedItemId, voidedItemId, historicalCountId, itemIds.material, itemIds.belowTolerance, itemIds.excess],
    );
    await pool.query(
      `INSERT INTO inventory_count_corrections(inventory_count_item_id,revision,previous_actual_quantity,corrected_actual_quantity,
         previous_variance_quantity,corrected_variance_quantity,previous_variance_value,corrected_variance_value,reason,corrected_by)
       VALUES($1,1,4500,4999,-500,-1,-250,-0.50,'Disposable corrected count evidence',$2)`,
      [correctedItemId, managerId],
    );
    await pool.query(
      `UPDATE inventory_count_items SET voided_at=now(),voided_by=$2,void_reason='Disposable voided count evidence' WHERE id=$1`,
      [voidedItemId, managerId],
    );

    const testCountId = randomUUID();
    await pool.query(
      `INSERT INTO inventory_counts(id,count_no,branch_id,count_date,submitted_by,count_type,effective_at,is_test_data)
       VALUES($1,$2,$3,$4,$5,'FULL',NULL,true)`,
      [testCountId, `IC-TEST-${testCountId.slice(0, 8)}`, branchId, businessDate, managerId],
    );
    await pool.query(
      `INSERT INTO inventory_count_items(inventory_count_id,inventory_item_id,previous_actual_quantity,stock_received,
         expected_consumption,approved_adjustments,expected_quantity,actual_quantity,variance_quantity,variance_value,unit)
       VALUES($1,$2,5000,0,0,0,5000,4000,-1000,-500,'g')`,
      [testCountId, itemIds.matched],
    );

    const result = responseHarness();
    await listShrinkageReports({ query: { startDate: businessDate, endDate: businessDate }, user: manager() } as never, result.response as never, () => {});
    expect(result.state.body.data.missingInvestigationCount).toBe(1);
    expect(result.state.body.data.missingInvestigations).toEqual([
      expect.objectContaining({ countItemId: missingItemId, inventoryItemId: itemIds.material, varianceQuantity: -500 }),
    ]);
    expect(result.state.body.data.missingInvestigations).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ countItemId: correctedItemId }),
      expect.objectContaining({ countItemId: voidedItemId }),
    ]));
    const fabricated = await pool.query<{ count: number }>(
      `SELECT count(*)::int count FROM shrinkage_reports WHERE inventory_count_item_id IN ($1,$2,$3)`,
      [missingItemId, correctedItemId, voidedItemId],
    );
    expect(fabricated.rows[0]?.count).toBe(0);
  });

  it("serializes concurrent qualifying submissions and persists only one detected case", async () => {
    const raceBranchId = randomUUID();
    const raceManagerId = randomUUID();
    const raceItemId = randomUUID();
    const baselineId = randomUUID();
    await pool.query(
      `INSERT INTO branches(id,code,name,location) VALUES($1,$2,'Concurrent Anomaly Branch','Disposable PostgreSQL test')`,
      [raceBranchId, `AN-${raceBranchId.slice(0, 8)}`],
    );
    await pool.query(
      `INSERT INTO users(id,branch_id,first_name,last_name,email,username,password_hash,role,status)
       VALUES($1,$2,'Concurrent','Manager',$3,$4,'not-used','BRANCH_MANAGER','ACTIVE')`,
      [raceManagerId, raceBranchId, `race-${raceManagerId}@e2e.local`, `race-${raceManagerId}`],
    );
    await pool.query(
      `INSERT INTO inventory_items(id,sku,name,category,unit,unit_cost,reorder_level,status,item_scope,origin_branch_id)
       VALUES($1,$2,'Concurrent Espresso Beans','Disposable Fixture','g',0.50,0,'ACTIVE','GLOBAL',NULL)`,
      [raceItemId, `AN-RACE-${raceItemId.slice(0, 8)}`],
    );
    await pool.query(
      `INSERT INTO branch_inventory_settings(branch_id,inventory_item_id,current_unit_cost,reorder_level,reorder_days,reorder_category,updated_by)
       VALUES($1,$2,0.50,0,7,'MEDIUM',$3)`,
      [raceBranchId, raceItemId, raceManagerId],
    );
    await pool.query(
      `INSERT INTO inventory_opening_baselines(id,baseline_no,branch_id,effective_at,designation,notes,created_by)
       VALUES($1,$2,$3,$4::date - 1,'STARTING_STOCK','Disposable concurrent baseline',$5)`,
      [baselineId, `OB-RACE-${baselineId.slice(0, 8)}`, raceBranchId, businessDate, raceManagerId],
    );
    await pool.query(
      `INSERT INTO inventory_opening_baseline_items(opening_baseline_id,inventory_item_id,quantity,unit) VALUES($1,$2,5000,'g')`,
      [baselineId, raceItemId],
    );

    const submitRaceCount = async (countType: "OPENING" | "CLOSING", quantity: number) => {
      const result = responseHarness();
      await submitInventoryCount({
        body: { countDate: businessDate, countType, items: [{ inventoryItemId: raceItemId, quantity, enteredUnit: "g" }] },
        user: manager(raceManagerId, raceBranchId),
      } as never, result.response as never, () => {});
      return result.state;
    };
    await submitRaceCount("OPENING", 5000);
    await pool.query(
      `INSERT INTO pos_daily_declarations(branch_id,business_date,declaration,notes,declared_by)
       VALUES($1,$2,'NO_SALES_CLOSED','Disposable concurrent prerequisite',$3)`,
      [raceBranchId, businessDate, raceManagerId],
    );

    const submissions = await Promise.allSettled([
      submitRaceCount("CLOSING", 4000),
      submitRaceCount("CLOSING", 4000),
    ]);
    expect(submissions.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejection = submissions.find((result) => result.status === "rejected");
    expect(rejection?.status).toBe("rejected");
    if (rejection?.status === "rejected") expect(rejection.reason).toMatchObject({ code: "INVENTORY_COUNT_DUPLICATE" });

    const persisted = await pool.query<{ counts: number; cases: number }>(
      `SELECT
         (SELECT count(*)::int FROM inventory_counts WHERE branch_id=$1 AND count_type='CLOSING') counts,
         (SELECT count(*)::int FROM shrinkage_reports WHERE branch_id=$1) cases`,
      [raceBranchId],
    );
    expect(persisted.rows[0]).toEqual({ counts: 1, cases: 1 });
  });
});
