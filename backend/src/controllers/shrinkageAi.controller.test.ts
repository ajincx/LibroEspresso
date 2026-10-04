import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ poolQuery: vi.fn(), generate: vi.fn() }));
vi.mock("../config/database.js", () => ({ pool: { query: mocks.poolQuery } }));
vi.mock("../services/geminiInsights.service.js", () => ({ generateGeminiShrinkageAnalysis: mocks.generate }));

import { getShrinkageAiAnalysis } from "./shrinkageAi.controller.js";

const reportId = "11111111-1111-4111-8111-111111111111";
const branchId = "22222222-2222-4222-8222-222222222222";
const context = {
  branchId,
  branchName: "Gulod / Main Branch",
  inventoryItemId: "33333333-3333-4333-8333-333333333333",
  ingredient: "Espresso Blend Beans",
  expectedQuantity: 5_054,
  actualQuantity: 5_000,
  varianceQuantity: -54,
  variancePercent: -1.068,
  unit: "g",
  classification: null,
  status: "DETECTED",
  relatedHistoricalCases: 0,
};
const analysis = {
  observation: "A 54 g shortage was recorded.",
  risk: "The available evidence does not establish a cause.",
  recommendation: "Review the count and nearby inventory activity.",
  limitations: "No linked incident evidence is available.",
};

function request(role: "OWNER" | "BRANCH_MANAGER", scopedBranchId: string | null) {
  return { params: { id: reportId }, user: { id: "user-1", role, branchId: scopedBranchId } } as never;
}

describe("shrinkage AI analysis controller", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.poolQuery.mockResolvedValueOnce({ rows: [context] }).mockResolvedValueOnce({ rows: [] });
    mocks.generate.mockResolvedValue(analysis);
  });

  it("returns validated advisory output without mutating authoritative values", async () => {
    const res = { json: vi.fn() };
    await getShrinkageAiAnalysis(request("BRANCH_MANAGER", branchId), res as never, vi.fn());

    expect(mocks.generate).toHaveBeenCalledWith(expect.objectContaining({
      expectedQuantity: 5_054,
      actualQuantity: 5_000,
      varianceQuantity: -54,
      materiality: "ABOVE_TOLERANCE",
    }));
    expect(res.json).toHaveBeenCalledWith({ success: true, data: { source: "GOOGLE_GEMINI", analysis } });
    expect(mocks.poolQuery.mock.calls.every(([sql]) => /^\s*SELECT/i.test(String(sql)))).toBe(true);
  });

  it("keeps the investigation available when Gemini is unavailable", async () => {
    mocks.generate.mockResolvedValue(null);
    const res = { json: vi.fn() };
    await getShrinkageAiAnalysis(request("OWNER", null), res as never, vi.fn());
    expect(res.json).toHaveBeenCalledWith({ success: true, data: { source: "UNAVAILABLE", analysis: null } });
  });

  it("enforces the Branch Manager branch scope in the report query", async () => {
    await getShrinkageAiAnalysis(request("BRANCH_MANAGER", branchId), { json: vi.fn() } as never, vi.fn());
    const [sql, values] = mocks.poolQuery.mock.calls[0]!;
    expect(String(sql)).toContain("AND sr.branch_id=$2");
    expect(values).toEqual([reportId, branchId]);
  });
});
