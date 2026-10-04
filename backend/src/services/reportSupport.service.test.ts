import { beforeEach, describe, expect, it, vi } from "vitest";

const managerBranchId = "00000000-0000-4000-8000-000000000002";
const otherBranchId = "00000000-0000-4000-8000-000000000099";
const mocks = vi.hoisted(() => ({ poolQuery: vi.fn(), loadLedgers: vi.fn() }));

vi.mock("../config/database.js", () => ({ pool: { query: mocks.poolQuery } }));
vi.mock("./inventoryLedger.service.js", () => ({
  inventoryLedgerKey: (branchId: string, inventoryItemId: string) => `${branchId}:${inventoryItemId}`,
  loadInventoryLedgerBalances: mocks.loadLedgers,
}));

import { buildReportSupportData } from "./reportSupport.service.js";

beforeEach(() => {
  mocks.poolQuery.mockReset();
  mocks.loadLedgers.mockReset();
  mocks.loadLedgers.mockResolvedValue(new Map([[`${managerBranchId}:espresso`, { calculatedBalance: 5054 }]]));
  mocks.poolQuery.mockImplementation((sqlValue: unknown) => {
    const sql = String(sqlValue);
    if (sql.includes("WITH scoped_branches")) return Promise.resolve({ rows: [{
      branchId: managerBranchId, branchName: "Gulod / Main Branch", branchStatus: "ACTIVE",
      sales: 0, cogs: 0, detected: 0, verified: 0, pending: 0, corrected: 0,
    }] });
    if (sql.includes("WITH recent_usage")) return Promise.resolve({ rows: [{
      branchId: managerBranchId, branchName: "Gulod / Main Branch", inventoryItemId: "espresso",
      name: "Espresso Blend Beans", category: "Raw Materials", unit: "g", unitCost: 0.82,
      reorderLevel: 1500, reorderDays: 5, dailyUsage: 696, expectedUsage: 696,
      varianceQuantity: 0, varianceValue: 0, verifiedShrinkageCost: 0,
    }] });
    if (sql.includes("high_cogs_percent")) return Promise.resolve({ rows: [{ highCogsPercent: 45 }] });
    if (sql.includes("WITH s AS")) return Promise.resolve({ rows: [{ sales: 0, cogs: 0, detected: 0, verified: 0 }] });
    return Promise.resolve({ rows: [] });
  });
});

describe("inventory report calculation source", () => {
  it("uses the authoritative operational ledger and preserves Manager branch scope", async () => {
    const report = await buildReportSupportData(
      { id: "manager", role: "BRANCH_MANAGER", branchId: managerBranchId },
      { branchId: otherBranchId, startDate: "2026-09-16", endDate: "2026-10-04" },
    );

    expect(mocks.loadLedgers).toHaveBeenCalledWith(expect.anything(), [{
      branchId: managerBranchId, inventoryItemId: "espresso", canonicalUnit: "g",
    }]);
    expect(report.ingredients[0]).toMatchObject({ name: "Espresso Blend Beans", currentStock: 5054 });
    expect(report.inventoryRisks[0]).toMatchObject({ branchId: managerBranchId, currentStock: 5054 });
    const inventoryCall = mocks.poolQuery.mock.calls.find(([sql]) => String(sql).includes("WITH recent_usage"));
    expect(inventoryCall?.[1]).toContain(managerBranchId);
    expect(inventoryCall?.[1]).not.toContain(otherBranchId);
    expect(String(inventoryCall?.[0])).toContain("source.status='ACTIVE'");
    expect(String(inventoryCall?.[0])).toContain("NOT pi.is_test_data");
  });
});
