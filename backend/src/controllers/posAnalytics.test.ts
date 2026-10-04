import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  poolQuery: vi.fn(),
}));

vi.mock("../config/database.js", () => ({
  pool: { query: mocks.poolQuery },
}));

import { getPosAnalytics } from "./inventoryWorkflow.controller.js";

describe("getPosAnalytics verified incident shrinkage causes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calculates verifiedShrinkageCost and shrinkageCauses from verified incident reports", async () => {
    mocks.poolQuery
      .mockResolvedValueOnce({ rows: [{ branchName: "Main Branch" }] }) // branch query
      .mockResolvedValueOnce({ rows: [{ sales: 15443, unitsSold: 89, importCount: 1, theoreticalCogs: 4941.535 }] }) // summary
      .mockResolvedValueOnce({ rows: [] }) // trends
      .mockResolvedValueOnce({ rows: [] }) // products
      .mockResolvedValueOnce({ rows: [] }) // ingredients
      .mockResolvedValueOnce({ rows: [{ detectedShortageValue: 50 }] }) // variance
      .mockResolvedValueOnce({
        rows: [
          { name: "PREPARATION ERROR", value: 36.86 },
          { name: "WASTAGE", value: 4.32 },
        ],
      }); // verifiedCauses

    const req = {
      query: { startDate: "2026-09-01", endDate: "2026-09-26", branchId: "00000000-0000-4000-8000-000000000001" },
      user: { id: "user-1", role: "BRANCH_MANAGER", branchId: "00000000-0000-4000-8000-000000000001" },
    } as never;

    let responseData: any;
    const json = vi.fn().mockImplementation((payload) => {
        responseData = payload;
      });
    const res = { json } as never;

    await getPosAnalytics(req, res, () => undefined);

    expect(json).toHaveBeenCalledTimes(1);
    expect(responseData.success).toBe(true);
    expect(responseData.data.summary.verifiedShrinkageCost).toBe(41.18);
    expect(responseData.data.shrinkageCauses).toEqual([
      { name: "PREPARATION ERROR", value: 36.86 },
      { name: "WASTAGE", value: 4.32 },
    ]);
    expect(responseData.data.summary.sales).toBe(15443);
    expect(responseData.data.summary.theoreticalCogs).toBe(4941.535);

    const operationalPosQueries = mocks.poolQuery.mock.calls
      .map(([sql]) => String(sql))
      .filter((sql) => sql.includes("FROM pos_imports pi"));
    expect(operationalPosQueries).toHaveLength(4);
    for (const sql of operationalPosQueries) {
      expect(sql).toContain("source.status='ACTIVE'");
      expect(sql).toContain("NOT pi.is_test_data");
      expect(sql).toContain("pi.branch_id=$3");
    }
  });

  it("returns empty shrinkageCauses and 0 verifiedShrinkageCost when no verified incidents exist", async () => {
    mocks.poolQuery
      .mockResolvedValueOnce({ rows: [{ sales: 0, unitsSold: 0, importCount: 0, theoreticalCogs: 0 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ detectedShortageValue: 0 }] })
      .mockResolvedValueOnce({ rows: [] }); // verifiedCauses empty

    const req = {
      query: { startDate: "2026-09-01", endDate: "2026-09-26" },
      user: { id: "owner-1", role: "OWNER" },
    } as never;

    let responseData: any;
    const res = {
      json: vi.fn().mockImplementation((payload) => {
        responseData = payload;
      }),
    } as never;

    await getPosAnalytics(req, res, () => undefined);

    expect(responseData.data.summary.verifiedShrinkageCost).toBe(0);
    expect(responseData.data.shrinkageCauses).toEqual([]);
  });
});
