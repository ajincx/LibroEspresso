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
    mocks.query.mockImplementation(async (sql?: string) => {
      if (typeof sql === "string" && sql.includes("COALESCE(sum(CASE")) return { rows: [metrics] };
      if (typeof sql === "string" && sql.includes("NOT EXISTS (SELECT 1 FROM shrinkage_reports linked")) return { rows: [] };
      return { rows: [{ id: "report-on-page", __total: 237 }] };
    });
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
    expect(aggregateSql).toContain("ic.count_date >= $3::date");
    expect(aggregateSql).toContain("ic.count_date <= $4::date");
    expect(aggregateParams).toEqual([managerBranchId, "DETECTED", "2026-10-01", "2026-10-20"]);
    expect(json).toHaveBeenCalledWith({
      success: true,
      data: {
        reports: [{ id: "report-on-page" }],
        pagination: { page: 3, pageSize: 10, total: 237, totalPages: 24 },
        metrics,
        missingInvestigations: [],
        missingInvestigationCount: 0,
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

  it("links only authoritative investigations, retains archived links, and derives materiality from current settings", async () => {
    mocks.query.mockResolvedValue({ rows: [] });
    await listInventoryVariances({ query: {}, user: manager } as never, { json: vi.fn() } as never, vi.fn());

    const [sql] = mocks.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("LEFT JOIN shrinkage_reports sr ON sr.inventory_count_item_id=ici.id AND NOT sr.is_test_data");
    expect(sql).not.toContain("sr.archived_at IS NULL");
    expect(sql).toContain('sr.archived_at "anomalyArchivedAt"');
    expect(sql).toContain('settings.variance_tolerance_quantity');
    expect(sql).toContain('settings.variance_tolerance_percent');
    expect(sql).toContain('"requiresInvestigation"');
  });

  it("returns authoritative count and count-item identifiers for anomaly traceability", async () => {
    mocks.query.mockImplementation(async (sql?: string) => {
      if (typeof sql === "string" && sql.includes("COALESCE(sum(CASE")) return { rows: [{ detectedValue: 0, detected: 0, pending: 0, spoilage: 0, wastage: 0, pilferage: 0 }] };
      return { rows: [] };
    });
    await listShrinkageReports({ query: {}, user: manager } as never, { json: vi.fn() } as never, vi.fn());

    const [sql] = mocks.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('ic.id "inventoryCountId"');
    expect(sql).toContain('ic.count_no "countNo"');
    expect(sql).toContain('ici.id "inventoryCountItemId"');
  });

  it("surfaces material historical shortages with no authoritative investigation without creating records", async () => {
    mocks.query.mockImplementation(async (sql?: string) => {
      if (typeof sql === "string" && sql.includes("COALESCE(sum(CASE")) return { rows: [{ detectedValue: 0, detected: 0, pending: 0, spoilage: 0, wastage: 0, pilferage: 0 }] };
      if (typeof sql === "string" && sql.includes("NOT EXISTS (SELECT 1 FROM shrinkage_reports linked")) return { rows: [{ countItemId: "bacon-item", inventoryItemName: "Bacon", __total: 2 }] };
      return { rows: [] };
    });
    const json = vi.fn();
    await listShrinkageReports({ query: { startDate: "2026-08-01", endDate: "2026-10-31" }, user: manager } as never, { json } as never, vi.fn());

    const missingSql = String(mocks.query.mock.calls[2]?.[0]);
    expect(missingSql).toContain("NOT linked.is_test_data");
    expect(missingSql).toContain("ici.voided_at IS NULL");
    expect(missingSql).toContain("greatest(settings.variance_tolerance_quantity");
    expect(missingSql).toContain("ic.branch_id=$1");
    expect(json).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        missingInvestigations: [{ countItemId: "bacon-item", inventoryItemName: "Bacon" }],
        missingInvestigationCount: 2,
      }),
    }));
  });
});
