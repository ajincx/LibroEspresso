import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("../config/database.js", () => ({ pool: { query: mocks.query } }));

import { listInventoryVariances, listShrinkageReports } from "./inventoryWorkflow.controller.js";

const managerBranchId = "00000000-0000-4000-8000-000000000011";
const otherBranchId = "00000000-0000-4000-8000-000000000012";
const manager = { id: "00000000-0000-4000-8000-000000000013", role: "BRANCH_MANAGER", branchId: managerBranchId };

beforeEach(() => mocks.query.mockReset());

describe("Phase 2B shrinkage aggregates", () => {
  it("returns filtered totals across every matching row instead of reducing the current page", async () => {
    const metrics = { detectedValue: 9876.5, detected: 137, pending: 81, spoilage: 42, wastage: 31, pilferage: 8 };
    mocks.query.mockImplementation(async (sql?: string) => typeof sql === "string" && sql.includes("COALESCE(sum(CASE")
      ? { rows: [metrics] }
      : { rows: [{ id: "report-on-page", __total: 237 }] });
    const json = vi.fn();

    await listShrinkageReports({
      query: {
        branchId: otherBranchId,
        status: "DETECTED",
        startDate: "2026-10-01",
        endDate: "2026-10-20",
        page: "3",
        pageSize: "10",
      },
      user: manager,
    } as never, { json } as never, vi.fn());

    expect(mocks.query).toHaveBeenCalledTimes(2);
    const [pageSql, pageParams] = mocks.query.mock.calls[0] as [string, unknown[]];
    const [aggregateSql, aggregateParams] = mocks.query.mock.calls[1] as [string, unknown[]];
    expect(pageSql).toContain("LIMIT $5 OFFSET $6");
    expect(pageParams).toEqual([managerBranchId, "DETECTED", "2026-10-01", "2026-10-20", 10, 20]);
    expect(aggregateSql).not.toContain("LIMIT");
    expect(aggregateSql).toContain("sr.branch_id=$1");
    expect(aggregateSql).toContain("sr.status=$2");
    expect(aggregateSql).toContain("sr.detected_at >= $3::date");
    expect(aggregateSql).toContain("sr.detected_at < ($4::date + interval '1 day')");
    expect(aggregateParams).toEqual([managerBranchId, "DETECTED", "2026-10-01", "2026-10-20"]);
    expect(json).toHaveBeenCalledWith({
      success: true,
      data: {
        reports: [{ id: "report-on-page" }],
        pagination: { page: 3, pageSize: 10, total: 237, totalPages: 24 },
        metrics,
      },
    });
  });
});

describe("Phase 2B variance visibility", () => {
  it("excludes corrected matched rows by default while preserving Manager branch scope", async () => {
    mocks.query.mockResolvedValue({ rows: [] });
    const json = vi.fn();
    await listInventoryVariances({
      query: { branchId: otherBranchId, countDate: "2026-10-20" },
      user: manager,
    } as never, { json } as never, vi.fn());

    const [sql, params] = mocks.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("abs(COALESCE(correction.corrected_variance_quantity,ici.variance_quantity)) > 0.0001");
    expect(sql).toContain("ic.branch_id=$1");
    expect(params).toEqual([managerBranchId, "2026-10-20", 100, 0]);
  });

  it("makes matched rows available only through the explicit matched scope", async () => {
    mocks.query.mockResolvedValue({ rows: [] });
    await listInventoryVariances({
      query: { varianceScope: "MATCHED" },
      user: manager,
    } as never, { json: vi.fn() } as never, vi.fn());

    const [sql] = mocks.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("abs(COALESCE(correction.corrected_variance_quantity,ici.variance_quantity)) <= 0.0001");
    expect(sql).not.toContain("abs(COALESCE(correction.corrected_variance_quantity,ici.variance_quantity)) > 0.0001");
  });
});
