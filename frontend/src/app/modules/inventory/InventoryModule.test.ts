import { afterEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { canConfigureBranchReorderPolicy, inventoryAdjustmentValidationError, InventoryOverview, inventoryOverviewColumns, inventoryTabs, projectedAdjustmentStock, recordCountShortcutDestination, resolveInventoryCountHistoryVisibility, shouldShowInventoryCountHistory, stockOperationCards, subscribeToInventoryDataChanges } from "./InventoryModule";
import type { InventoryCountSummary } from "../../types/inventoryWorkflow";

afterEach(() => vi.useRealTimers());

describe("Inventory Management terminology", () => {
  it("uses the approved three-tab inventory structure", () => {
    expect(inventoryTabs).toEqual([
      { id: "overview", label: "Inventory Overview" },
      { id: "operations", label: "Stock Operations" },
      { id: "history", label: "Stock History" },
    ]);
  });

  it("keeps coverage classifications out of the main Inventory Overview table", () => {
    expect(inventoryOverviewColumns("manager")).not.toContain("Category");
    expect(inventoryOverviewColumns("manager")).not.toContain("Coverage");
    expect(inventoryOverviewColumns("owner")).not.toContain("Category");
    expect(inventoryOverviewColumns("owner")).not.toContain("Coverage");
  });

  it("provides Starting Stock, Daily Stock Count, and Full Physical Count operation cards", () => {
    expect(stockOperationCards("manager").map((card) => card.title)).toEqual([
      "Starting Stock",
      "Daily Stock Count",
      "Full Physical Count",
    ]);
    expect(stockOperationCards("manager").find((card) => card.id === "daily")?.enabled).toBe(true);
    expect(stockOperationCards("manager").find((card) => card.id === "full")?.enabled).toBe(true);
    expect(stockOperationCards("owner").find((card) => card.id === "full")?.enabled).toBe(false);
  });

  it("provides Stock Details from the existing catalog for both management roles", () => {
    expect(inventoryOverviewColumns("owner").at(-1)).toBe("Actions");
    expect(inventoryOverviewColumns("manager").at(-1)).toBe("Actions");
  });

  it("allows only the Branch Manager to configure branch reorder policies", () => {
    expect(canConfigureBranchReorderPolicy("owner")).toBe(false);
    expect(canConfigureBranchReorderPolicy("manager")).toBe(true);
  });

  it("does not render a duplicate Record Stock Count action in Inventory Overview", () => {
    const markup = renderToStaticMarkup(React.createElement(InventoryOverview, { role: "manager" }));
    expect(markup).not.toContain("Record Stock Count");
    expect(markup).not.toContain("Record Stock Adjustment");
  });
});

describe("Inventory Overview data-change refresh", () => {
  it("coalesces rapid POS data-change events into one refresh", () => {
    vi.useFakeTimers();
    const target = new EventTarget();
    const refresh = vi.fn();
    const unsubscribe = subscribeToInventoryDataChanges(refresh, 75, target);

    target.dispatchEvent(new Event("libro-data-changed"));
    target.dispatchEvent(new Event("libro-data-changed"));
    target.dispatchEvent(new Event("libro-data-changed"));
    vi.advanceTimersByTime(74);
    expect(refresh).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(refresh).toHaveBeenCalledTimes(1);

    unsubscribe();
  });

  it("removes the event listener and pending refresh on cleanup", () => {
    vi.useFakeTimers();
    const target = new EventTarget();
    const refresh = vi.fn();
    const unsubscribe = subscribeToInventoryDataChanges(refresh, 75, target);

    target.dispatchEvent(new Event("libro-data-changed"));
    unsubscribe();
    vi.runAllTimers();
    target.dispatchEvent(new Event("libro-data-changed"));
    vi.runAllTimers();

    expect(refresh).not.toHaveBeenCalled();
  });
});

describe("controlled stock adjustment preview", () => {
  it("shows the resulting stock for an approved increase", () => {
    expect(projectedAdjustmentStock(100, "APPROVED_ADJUSTMENT_INCREASE", 25)).toBe(125);
  });

  it("shows the resulting stock for an approved decrease", () => {
    expect(projectedAdjustmentStock(100, "APPROVED_ADJUSTMENT_DECREASE", 25)).toBe(75);
  });

  it("requires a positive quantity and an understandable reason", () => {
    expect(inventoryAdjustmentValidationError(100, "APPROVED_ADJUSTMENT_INCREASE", "", "Valid operational reason")).toContain("greater than zero");
    expect(inventoryAdjustmentValidationError(100, "APPROVED_ADJUSTMENT_INCREASE", "5", "short")).toContain("at least 10 characters");
  });

  it("blocks a decrease that would make stock negative", () => {
    expect(inventoryAdjustmentValidationError(100, "APPROVED_ADJUSTMENT_DECREASE", "101", "Verified damaged stock correction")).toContain("below zero");
    expect(inventoryAdjustmentValidationError(100, "APPROVED_ADJUSTMENT_DECREASE", "100", "Verified damaged stock correction")).toBeNull();
  });
});

describe("Inventory Counts default flow", () => {
  const count = (branchId: string, countDate: string): InventoryCountSummary => ({
    id: `${branchId}-${countDate}`, countNo: "IC-1", countDate, submittedAt: `${countDate}T10:00:00Z`, branchId,
    branchName: branchId, submittedBy: "Manager", itemCount: 76, varianceCount: 0, canEdit: false,
  });

  it("opens the summary history by default", () => {
    expect(shouldShowInventoryCountHistory("history", null)).toBe(true);
  });

  it("opens item-level entry only for an intentional record flow", () => {
    expect(shouldShowInventoryCountHistory("record", null)).toBe(false);
  });

  it("opens the detailed correction form when an edit count is selected", () => {
    expect(shouldShowInventoryCountHistory("history", "count-1")).toBe(false);
  });

  it("returns to summary history after the edit parameter is cleared", () => {
    expect(resolveInventoryCountHistoryVisibility(true, "record", null)).toBe(true);
  });

  it("opens the existing item-level entry flow when recording from history", () => {
    expect(shouldShowInventoryCountHistory("record", null)).toBe(false);
  });

  it("opens the existing Physical Inventory Count when today's branch count does not exist", () => {
    expect(recordCountShortcutDestination([count("branch-1", "2026-10-12")], "2026-10-13", "branch-1")).toBe("record");
  });

  it("keeps the existing Physical Count History when today's branch count exists", () => {
    expect(recordCountShortcutDestination([count("branch-1", "2026-10-13")], "2026-10-13", "branch-1")).toBe("history");
  });

  it("does not reuse a previous branch's count after branch switching", () => {
    const counts = [count("branch-1", "2026-10-13")];
    expect(recordCountShortcutDestination(counts, "2026-10-13", "branch-1")).toBe("history");
    expect(recordCountShortcutDestination(counts, "2026-10-13", "branch-2")).toBe("record");
  });
});
