import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("../config/database.js", () => ({ pool: { query: mocks.query } }));

import { getShrinkageReport, listShrinkageReports } from "./inventoryWorkflow.controller.js";

const branchId = "00000000-0000-4000-8000-000000000002";
const reportId = "00000000-0000-4000-8000-000000000003";
const manager = { id: "00000000-0000-4000-8000-000000000001", role: "BRANCH_MANAGER", branchId };

beforeEach(() => {
  mocks.query.mockReset();
  mocks.query.mockResolvedValue({ rows: [{ id: reportId, archivedAt: "2026-10-01T00:00:00Z", __total: 1 }] });
});

describe("shrinkage archive retrieval", () => {
  it.each([
    [undefined, "sr.archived_at IS NULL"],
    ["ARCHIVED", "sr.archived_at IS NOT NULL"],
    ["ALL", null],
  ] as const)("scopes %s records while preserving archived evidence", async (archiveScope, expectedClause) => {
    const json = vi.fn();
    await listShrinkageReports({ query: archiveScope ? { archiveScope } : {}, user: manager } as never, { json } as never, vi.fn());
    const [sql, params] = mocks.query.mock.calls[0] as [string, unknown[]];
    if (archiveScope !== "ARCHIVED") expect(sql).toContain("ici.voided_at IS NULL");
    expect(sql).toContain("sr.branch_id=$1");
    expect(params[0]).toBe(branchId);
    if (expectedClause) expect(sql).toContain(expectedClause);
    else expect(sql).not.toContain("sr.archived_at IS NULL");
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it("retrieves an archived report by ID within the Manager branch", async () => {
    const json = vi.fn();
    await getShrinkageReport({ params: { id: reportId }, user: manager } as never, { json } as never, vi.fn());
    const [sql, params] = mocks.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("sr.branch_id=$2");
    expect(sql).not.toContain("sr.archived_at IS NULL");
    expect(params).toEqual([reportId, branchId]);
    expect(json).toHaveBeenCalledWith({ success: true, data: { report: expect.objectContaining({ archivedAt: expect.any(String) }) } });
  });
});
