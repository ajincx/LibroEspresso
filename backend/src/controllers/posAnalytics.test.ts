import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  poolQuery: vi.fn(),
}));

vi.mock("../config/database.js", () => ({
  pool: { query: mocks.poolQuery },
}));

import { getPosAnalytics } from "./inventoryWorkflow.controller.js";
import { summarizeShrinkageRows } from "../services/reportDataset.service.js";

describe("getPosAnalytics verified shrinkage report causes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calculates verifiedShrinkageCost and shrinkageCauses from the authoritative shrinkage report scope", async () => {
    const shrinkageReportSummary = summarizeShrinkageRows([
      {
        varianceValue: -36.86,
        investigationStatus: "VERIFIED",
        finalClassification: "PREPARATION_ERROR",
        verifiedShrinkageCost: 36.86,
      },
      {
        varianceValue: -4.32,
        investigationStatus: "REVIEWED",
        finalClassification: "WASTAGE",
        verifiedShrinkageCost: 4.32,
      },
    ]);
    mocks.poolQuery
      .mockResolvedValueOnce({ rows: [{ branchName: "Main Branch" }] }) // branch query
      .mockResolvedValueOnce({ rows: [{ sales: 15443, unitsSold: 89, importCount: 1, theoreticalCogs: 4941.535 }] }) // summary
      .mockResolvedValueOnce({ rows: [] }) // trends
      .mockResolvedValueOnce({ rows: [] }) // products
      .mockResolvedValueOnce({ rows: [{ id: "zero-product", name: "Zero Seller", unitsSold: 0 }] }) // active catalog ranking
      .mockResolvedValueOnce({ rows: [] }) // ingredients
      .mockResolvedValueOnce({ rows: [{ detectedShortageValue: 50 }] }) // variance
      .mockResolvedValueOnce({
        rows: [
          { name: "PREPARATION ERROR", value: 36.86 },
          { name: "WASTAGE", value: 4.32 },
        ],
      }); // verified shrinkage report causes

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
    expect(responseData.data.summary.verifiedShrinkageCost).toBe(
      shrinkageReportSummary.verified,
    );
    expect(responseData.data.shrinkageCauses).toEqual([
      { name: "PREPARATION ERROR", value: 36.86 },
      { name: "WASTAGE", value: 4.32 },
    ]);
    expect(responseData.data.summary.sales).toBe(15443);
    expect(responseData.data.summary.theoreticalCogs).toBe(4941.535);
    expect(responseData.data.productSalesRanking).toEqual([
      { id: "zero-product", name: "Zero Seller", unitsSold: 0 },
    ]);

    const operationalPosQueries = mocks.poolQuery.mock.calls
      .map(([sql]) => String(sql))
      .filter((sql) => sql.includes("FROM pos_imports pi"));
    expect(operationalPosQueries).toHaveLength(5);
    for (const sql of operationalPosQueries) {
      expect(sql).toContain("JOIN pos_sources source ON source.id=pi.pos_source_id");
      expect(sql).not.toContain("source.status");
      expect(sql).toContain("NOT pi.is_test_data");
      expect(sql).toContain("pi.voided_at IS NULL");
      expect(sql).toContain("pi.branch_id=$3");
    }

    const rankingQuery = mocks.poolQuery.mock.calls
      .map(([sql]) => String(sql))
      .find((sql) => sql.includes("WITH catalog AS"));
    expect(rankingQuery).toContain("mi.status='ACTIVE'");
    expect(rankingQuery).toContain("mib.branch_id=$3");
    expect(rankingQuery).toContain("pi.business_date BETWEEN $1::date AND $2::date");
    expect(rankingQuery).toContain("coalesce(sold.\"unitsSold\",0)");

    const shrinkageQuery = mocks.poolQuery.mock.calls
      .map(([sql]) => String(sql))
      .find((sql) => sql.includes("FROM shrinkage_reports sr"));
    expect(shrinkageQuery).toContain("NOT sr.is_test_data");
    expect(shrinkageQuery).toContain("ici.voided_at IS NULL");
    expect(shrinkageQuery).toContain("ic.count_type<>'OPENING'");
    expect(shrinkageQuery).toContain("sr.status IN ('VERIFIED','REVIEWED')");
    expect(shrinkageQuery).toContain("sr.classification IN");
    expect(shrinkageQuery).toContain("sr.branch_id=$3");
    expect(shrinkageQuery).not.toContain("incident_reports");
    expect(shrinkageQuery).not.toContain("sr.archived_at IS NULL");
  });

  it("returns empty shrinkageCauses and 0 verifiedShrinkageCost when no verified shrinkage reports exist", async () => {
    mocks.poolQuery
      .mockResolvedValueOnce({ rows: [{ sales: 0, unitsSold: 0, importCount: 0, theoreticalCogs: 0 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ detectedShortageValue: 0 }] })
      .mockResolvedValueOnce({ rows: [] }); // verified shrinkage report causes empty

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
    expect(responseData.data.productSalesRanking).toEqual([]);
  });
});
