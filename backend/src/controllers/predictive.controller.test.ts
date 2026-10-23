import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ poolQuery: vi.fn(), generateGeminiInsights: vi.fn() }));
vi.mock("../config/database.js", () => ({ pool: { query: mocks.poolQuery } }));
vi.mock("../services/geminiInsights.service.js", () => ({ generateGeminiInsights: mocks.generateGeminiInsights }));
vi.mock("../services/businessTime.service.js", () => ({ manilaBusinessDate: () => "2026-10-02" }));

import { buildPredictiveForecast } from "./predictive.controller.js";

const managerBranchId = "00000000-0000-4000-8000-000000000002";
const otherBranchId = "00000000-0000-4000-8000-000000000099";
const manager = { id: "00000000-0000-4000-8000-000000000001", role: "BRANCH_MANAGER" as const, branchId: managerBranchId };

function installDatabaseFixture(shrinkageRows: { branchId: string; branchName: string; weekStart: string; sales: number; shrinkageCost: number }[] = []) {
  const start = Date.UTC(2026, 7, 1);
  const evaluationRows = Array.from({ length: 60 }, (_, index) => ({
    branchId: managerBranchId,
    branchName: "Gulod / Main Branch",
    date: new Date(start + index * 86_400_000).toISOString().slice(0, 10),
    sales: 1_000,
  }));
  mocks.poolQuery.mockImplementation((sqlValue: unknown, params: unknown[] = []) => {
    const sql = String(sqlValue);
    if (sql.includes('SELECT name "branchName" FROM branches')) return Promise.resolve({ rows: [{ branchName: "Gulod / Main Branch" }] });
    if (sql.includes("costs.cogs")) return Promise.resolve({ rows: [{ date: "2026-10-01", sales: 1_000, cogs: 320 }] });
    if (sql.includes("CROSS JOIN inventory_items")) return Promise.resolve({ rows: [{ branchId: managerBranchId, branchName: "Gulod / Main Branch", inventoryItemId: "item-1", sku: "RM-002", name: "Espresso Blend Beans", unit: "g", unitCost: 0.82, reorderLevel: 10, reorderDays: 7, systemStock: 100, dailyUsage: 5, outstandingQuantity: 0 }] });
    if (sql.includes("WITH candidate_count_weeks")) return Promise.resolve({ rows: shrinkageRows });
    if (sql.includes('GROUP BY pi.branch_id,b.name,pi.business_date')) return Promise.resolve({ rows: evaluationRows });
    if (sql.includes('usage.inventory_item_id "inventoryItemId"')) return Promise.resolve({ rows: [] });
    if (sql.includes("FROM purchase_orders po")) return Promise.resolve({ rows: [] });
    if (sql.includes("jsonb_to_recordset")) return Promise.resolve({ rows: [{
      branchId: managerBranchId, inventoryItemId: "item-1", id: "opening", importId: null,
      occurredAt: "2026-09-16T00:00:00+08:00", activityType: "STARTING_STOCK",
      reference: "OB-2026-00001", quantity: 100, sourceUnit: null,
    }] });
    throw new Error(`Unexpected predictive query: ${sql.slice(0, 80)}; params=${JSON.stringify(params)}`);
  });
}

const numericSnapshot = (forecast: Awaited<ReturnType<typeof buildPredictiveForecast>>) => ({
  summary: forecast.summary,
  accuracy: forecast.accuracy,
  predictions: forecast.predictions,
  demandSeries: forecast.demandSeries,
  inventorySeries: forecast.inventorySeries,
});

beforeEach(() => {
  mocks.poolQuery.mockReset();
  mocks.generateGeminiInsights.mockReset();
  installDatabaseFixture();
});

describe("predictive controller Gemini boundaries", () => {
  it("keeps every official numeric result identical when Gemini succeeds or falls back", async () => {
    mocks.generateGeminiInsights.mockResolvedValueOnce([{ title: "Gemini", description: "Validated narrative", recommendation: "Review", urgency: "LOW" }]);
    const withGemini = await buildPredictiveForecast(manager, { branchId: otherBranchId, startDate: "2026-10-02", endDate: "2026-10-31" });
    mocks.generateGeminiInsights.mockResolvedValueOnce(null);
    const withFallback = await buildPredictiveForecast(manager, { branchId: otherBranchId, startDate: "2026-10-02", endDate: "2026-10-31" });

    expect(withGemini.methodology.insightSource).toBe("GOOGLE_GEMINI");
    expect(withFallback.methodology.insightSource).toBe("SYSTEM_ANALYSIS");
    expect(numericSnapshot(withGemini)).toEqual(numericSnapshot(withFallback));
    expect(withGemini.insights).not.toEqual(withFallback.insights);
  });

  it("enforces the Manager branch in every scoped query and sends only minimized aggregate findings", async () => {
    mocks.generateGeminiInsights.mockResolvedValue(null);
    await buildPredictiveForecast(manager, { branchId: otherBranchId, startDate: "2026-10-02", endDate: "2026-10-31" });

    const findings = mocks.generateGeminiInsights.mock.calls[0]![0] as Record<string, unknown>;
    expect(findings.scope).toBe("Gulod / Main Branch");
    expect(JSON.stringify(findings)).not.toContain(otherBranchId);
    expect((findings.stockRisks as { branch: string }[]).every((risk) => risk.branch === "Gulod / Main Branch")).toBe(true);
    expect(Object.keys(findings).sort()).toEqual([
      "baselineDailySales", "confidence", "demandChangePercent", "evaluatedSalesDays", "forecastDays", "forecastEnd",
      "forecastSales", "forecastStart", "historicalCogsRatePercent", "largestSalesError", "observedSalesDays", "salesMae", "scope", "stockRisks",
      "projectedShrinkageCost", "projectedShrinkageRate", "shrinkageEligibleWeeks", "shrinkageForecastStatus", "shrinkageMaePercentagePoints",
    ].sort());
    for (const forbidden of ["password", "token", "user", "customer", "transaction", "recipe", "physicalCount", "incident", "shrinkageClassification"]) {
      expect(JSON.stringify(findings).toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
    const scopedCalls = mocks.poolQuery.mock.calls.filter((call) => String(call[0]).includes("=$"));
    expect(scopedCalls.length).toBeGreaterThan(0);
    expect(scopedCalls.every((call) => (call[1] as unknown[]).includes(managerBranchId))).toBe(true);
  });

  it("keeps accepted historical POS data in forecasts after source deactivation", async () => {
    mocks.generateGeminiInsights.mockResolvedValue(null);
    await buildPredictiveForecast(manager, { startDate: "2026-10-02", endDate: "2026-10-31" });

    const statements = mocks.poolQuery.mock.calls.map(([sql]) => String(sql));
    const salesSql = statements.find((sql) => sql.includes("costs.cogs"));
    const inventorySql = statements.find((sql) => sql.includes("CROSS JOIN inventory_items"));
    const ledgerSql = statements.find((sql) => sql.includes("jsonb_to_recordset"));
    const ingredientDemandSql = statements.find((sql) => sql.includes('usage.inventory_item_id "inventoryItemId"'));
    expect(salesSql).toContain("JOIN pos_sources source ON source.id=pi.pos_source_id");
    expect(salesSql).not.toContain("source.status");
    expect(salesSql).toContain("NOT pi.is_test_data");
    expect(salesSql).toContain("pi.voided_at IS NULL");
    expect(inventorySql).toContain("JOIN pos_sources source ON source.id=pi.pos_source_id");
    expect(inventorySql).not.toContain("source.status");
    expect(inventorySql).toContain("NOT pi.is_test_data");
    expect(inventorySql).toContain("pi.voided_at IS NULL");
    expect(ledgerSql).toContain("JOIN pos_sources source ON source.id=pi.pos_source_id");
    expect(ledgerSql).not.toContain("source.status");
    expect(ledgerSql).toContain("NOT pi.is_test_data");
    expect(ledgerSql).toContain("pi.voided_at IS NULL");
    expect(ingredientDemandSql).toContain("JOIN pos_sources source ON source.id=pi.pos_source_id");
    expect(ingredientDemandSql).not.toContain("source.status");
    expect(ingredientDemandSql).toContain("NOT pi.is_test_data");
    expect(ingredientDemandSql).toContain("pi.voided_at IS NULL");
  });

  it("excludes Opening Count differences from verified shrinkage context", async () => {
    mocks.generateGeminiInsights.mockResolvedValue(null);
    await buildPredictiveForecast(manager, { startDate: "2026-10-02", endDate: "2026-10-31" });

    const shrinkageSql = mocks.poolQuery.mock.calls
      .map(([sql]) => String(sql))
      .find((sql) => sql.includes("WITH candidate_count_weeks"));
    expect(shrinkageSql).toContain("FROM inventory_counts ic");
    expect(shrinkageSql).toContain("ic.count_type IN ('FULL','CLOSING')");
    expect(shrinkageSql).toContain("NOT ic.is_test_data");
    expect(shrinkageSql).toContain("voided.voided_at IS NOT NULL");
    expect(shrinkageSql).toContain("unresolved.status NOT IN ('VERIFIED','REVIEWED')");
    expect(shrinkageSql).toContain("unresolved.classification='COUNT_ERROR'");
    expect(shrinkageSql).toContain("required.status='ACTIVE'");
    expect(shrinkageSql).toContain("candidate.candidate_count=cw.eligible_count");
    expect(shrinkageSql).toContain("cw.checkpoint_date>=sw.last_sales_date");
    expect(shrinkageSql).toContain("cw.week_start+6<=$2::date");
    expect(shrinkageSql).toContain("pi.business_date");
    expect(shrinkageSql).toContain("NOT pi.is_test_data");
    expect(shrinkageSql).toContain("pi.voided_at IS NULL");
    expect(shrinkageSql).toContain("JOIN pos_sources source");
    expect(shrinkageSql).not.toContain("source.status");
    expect(shrinkageSql).not.toContain("sr.archived_at IS NULL");
  });

  it("adds a deterministic shrinkage forecast without changing sales or COGS figures", async () => {
    mocks.generateGeminiInsights.mockResolvedValue(null);
    const withoutShrinkageHistory = await buildPredictiveForecast(manager, {
      startDate: "2026-10-02", endDate: "2026-10-29",
    });
    installDatabaseFixture(Array.from({ length: 8 }, (_, index) => ({
      branchId: managerBranchId,
      branchName: "Gulod / Main Branch",
      weekStart: new Date(Date.UTC(2026, 7, 3 + index * 7)).toISOString().slice(0, 10),
      sales: 7_000,
      shrinkageCost: 70,
    })));
    const withShrinkageHistory = await buildPredictiveForecast(manager, {
      startDate: "2026-10-02", endDate: "2026-10-29",
    });

    expect(withShrinkageHistory.summary.forecastSales).toBe(withoutShrinkageHistory.summary.forecastSales);
    expect(withShrinkageHistory.summary.projectedCogs).toBe(withoutShrinkageHistory.summary.projectedCogs);
    expect(withShrinkageHistory.summary).toMatchObject({
      shrinkageForecastStatus: "AVAILABLE",
      projectedShrinkageRate: 1,
    });
    expect(withShrinkageHistory.summary.projectedShrinkageCost).toBeGreaterThan(0);
  });
});
