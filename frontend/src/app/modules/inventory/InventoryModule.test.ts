import { afterEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { canConfigureBranchReorderPolicy, InventoryOverview, inventoryOverviewColumns, inventoryTabs, resolveInventoryCountHistoryVisibility, shouldShowInventoryCountHistory, subscribeToInventoryDataChanges } from "./InventoryModule";

afterEach(() => vi.useRealTimers());

describe("Inventory Management terminology", () => {
  it("labels the initial branch inventory feature as Starting Stock", () => {
    expect(inventoryTabs).toEqual([
      { id: "overview", label: "Inventory Overview" },
      { id: "counts", label: "Inventory Counts" },
      { id: "opening", label: "Starting Stock" },
    ]);
  });

  it("provides Stock Details from the existing catalog for both management roles", () => {
    expect(inventoryOverviewColumns("owner").at(-1)).toBe("Actions");
    expect(inventoryOverviewColumns("manager").at(-1)).toBe("Actions");
  });

  it("allows only the Owner to configure branch reorder policies", () => {
    expect(canConfigureBranchReorderPolicy("owner")).toBe(true);
    expect(canConfigureBranchReorderPolicy("manager")).toBe(false);
  });

  it("does not render a duplicate Record Stock Count action in Inventory Overview", () => {
    const markup = renderToStaticMarkup(React.createElement(InventoryOverview, { role: "manager" }));
    expect(markup).not.toContain("Record Stock Count");
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

describe("Inventory Counts default flow", () => {
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
});
