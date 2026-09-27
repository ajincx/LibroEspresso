import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ poolQuery: vi.fn() }));

vi.mock("../config/database.js", () => ({
  pool: { query: mocks.poolQuery },
}));

import { getShrinkageEvidence } from "./inventoryWorkflow.controller.js";

const reportId = "11111111-1111-4111-8111-111111111111";
const branchId = "22222222-2222-4222-8222-222222222222";
const ingredientId = "33333333-3333-4333-8333-333333333333";

describe("shrinkage supporting-record evidence", () => {
  beforeEach(() => vi.clearAllMocks());

  it("matches incidents by report or by the same branch, ingredient, status, and Manila date window", async () => {
    mocks.poolQuery.mockImplementation(async (statement: unknown, values?: unknown[]) => {
      const sql = String(statement);
      if (sql.includes("FROM shrinkage_reports sr")) {
        return { rows: [{ branchId, inventoryItemId: ingredientId, countDate: "2026-09-20" }] };
      }
      if (sql.includes("FROM incident_reports ir")) {
        return { rows: [{ id: "incident-1", status: "VERIFIED", explicitlyLinked: false }] };
      }
      return { rows: [] };
    });
    const res = { json: vi.fn() };

    await getShrinkageEvidence({
      params: { id: reportId },
      user: { id: "manager-1", role: "BRANCH_MANAGER", branchId },
    } as never, res as never, vi.fn());

    const incidentCall = mocks.poolQuery.mock.calls.find(([sql]) => String(sql).includes("FROM incident_reports ir"));
    expect(incidentCall).toBeDefined();
    expect(String(incidentCall![0])).toContain("ir.branch_id=$2 AND ir.inventory_item_id=$3");
    expect(String(incidentCall![0])).toContain("NOT ir.is_test_data");
    expect(String(incidentCall![0])).toContain("ir.status IN ('PENDING','VERIFIED')");
    expect(String(incidentCall![0])).toContain("AT TIME ZONE 'Asia/Manila'");
    expect(incidentCall![1]).toEqual([reportId, branchId, ingredientId, "2026-09-20"]);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: { evidence: expect.objectContaining({ incidents: [{ id: "incident-1", status: "VERIFIED", explicitlyLinked: false }] }) },
    }));
  });
});
