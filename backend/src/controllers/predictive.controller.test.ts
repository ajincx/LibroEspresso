import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ poolQuery: vi.fn(), generateGeminiInsights: vi.fn() }));
vi.mock("../config/database.js", () => ({ pool: { query: mocks.poolQuery } }));
vi.mock("../services/geminiInsights.service.js", () => ({ generateGeminiInsights: mocks.generateGeminiInsights }));
vi.mock("../services/businessTime.service.js", () => ({ manilaBusinessDate: () => "2026-10-02" }));

import { buildPredictiveForecast } from "./predictive.controller.js";

const managerBranchId = "00000000-0000-4000-8000-000000000002";
const otherBranchId = "00000000-0000-4000-8000-000000000099";
const manager = { id: "00000000-0000-4000-8000-000000000001", role: "BRANCH_MANAGER" as const, branchId: managerBranchId };

function installDatabaseFixture() {
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
    if (sql.includes("FROM shrinkage_reports")) return Promise.resolve({ rows: [{ verifiedShrinkageCost: 0 }] });
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
    ].sort());
    for (const forbidden of ["password", "token", "user", "customer", "transaction", "recipe", "physicalCount", "incident", "shrinkageClassification"]) {
      expect(JSON.stringify(findings).toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
    const scopedCalls = mocks.poolQuery.mock.calls.filter((call) => String(call[0]).includes("=$"));
    expect(scopedCalls.length).toBeGreaterThan(0);
    expect(scopedCalls.every((call) => (call[1] as unknown[]).includes(managerBranchId))).toBe(true);
  });

  it("uses only active POS sources for operational inventory and ingredient-demand calculations", async () => {
    mocks.generateGeminiInsights.mockResolvedValue(null);
    await buildPredictiveForecast(manager, { startDate: "2026-10-02", endDate: "2026-10-31" });

    const statements = mocks.poolQuery.mock.calls.map(([sql]) => String(sql));
    const salesSql = statements.find((sql) => sql.includes("costs.cogs"));
    const inventorySql = statements.find((sql) => sql.includes("CROSS JOIN inventory_items"));
    const ledgerSql = statements.find((sql) => sql.includes("jsonb_to_recordset"));
    const ingredientDemandSql = statements.find((sql) => sql.includes('usage.inventory_item_id "inventoryItemId"'));
    expect(salesSql).toContain("source.status='ACTIVE'");
    expect(salesSql).toContain("NOT pi.is_test_data");
    expect(inventorySql).toContain("source.status='ACTIVE'");
    expect(inventorySql).toContain("NOT pi.is_test_data");
    expect(ledgerSql).toContain("source.status='ACTIVE'");
    expect(ledgerSql).toContain("NOT pi.is_test_data");
    expect(ingredientDemandSql).toContain("source.status='ACTIVE'");
    expect(ingredientDemandSql).toContain("NOT pi.is_test_data");
  });
});
