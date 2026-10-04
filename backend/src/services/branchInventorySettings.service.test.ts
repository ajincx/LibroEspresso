import { describe, expect, it, vi } from "vitest";
import { configureBranchReorderPolicy } from "./branchInventorySettings.service.js";

const owner = { id: "owner", role: "OWNER" as const, branchId: null };
const input = { branchId: "branch", inventoryItemId: "item", category: "FAST" as const, reorderLevel: 1500, reorderDays: 5, reason: "Approved manual initial configuration" };

describe("configureBranchReorderPolicy", () => {
  it("locks, updates, and audits previous and new values", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ inventoryItemId: "item", sku: "RM-002", branchName: "Gulod / Main Branch" }] })
      .mockResolvedValueOnce({ rows: [{ category: "MEDIUM", reorderLevel: 25000, reorderDays: 7 }] })
      .mockResolvedValueOnce({ rows: [{ inventoryItemId: "item", category: "FAST", reorderLevel: 1500, reorderDays: 5 }] })
      .mockResolvedValueOnce({ rows: [] });
    await expect(configureBranchReorderPolicy({ query } as never, owner, input)).resolves.toMatchObject({ category: "FAST", reorderLevel: 1500 });
    expect(String(query.mock.calls[1]?.[0])).toContain("FOR UPDATE");
    expect(query.mock.calls[3]?.[1]?.[6]).toMatchObject({
      configurationType: "MANUAL_INITIAL_CONFIGURATION",
      previousCategory: "MEDIUM",
      newCategory: "FAST",
      previousReorderLevel: 25000,
      newReorderLevel: 1500,
      previousCoverageDays: 7,
      newCoverageDays: 5,
      reason: input.reason,
    });
  });

  it("rejects non-Owners before querying", async () => {
    const query = vi.fn();
    await expect(configureBranchReorderPolicy({ query } as never, { id: "manager", role: "BRANCH_MANAGER", branchId: "branch" }, input)).rejects.toMatchObject({ status: 403 });
    expect(query).not.toHaveBeenCalled();
  });

  it("rejects excluded or invalid branch-item targets", async () => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [] });
    await expect(configureBranchReorderPolicy({ query } as never, owner, input)).rejects.toMatchObject({ code: "REORDER_CONFIGURATION_TARGET_INVALID" });
  });
});
