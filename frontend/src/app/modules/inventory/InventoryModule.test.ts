import { afterEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { branchReorderSettingsInput, canConfigureBranchReorderPolicy, canOpenClosingCount, canSetIngredientInitialStock, closingCountOperationStatus, connectedProductStatusLabel, countCorrectionOperation, dailyCountCorrectionTarget, dailyCountShortcutDestination, dailyCountStatusLabel, fullCountOperationStatus, inventoryAdjustmentValidationError, InventoryOverview, inventoryOverviewColumns, inventoryTabs, movementCategoryLabel, projectedAdjustmentStock, recordCountShortcutDestination, resolveInventoryCountHistoryVisibility, shouldShowInventoryCountHistory, shouldShowStockOperationCards, startingStockOperationStatus, stockOperationCards, stockOperationSelectionAfterDailySubmit, subscribeToInventoryDataChanges } from "./InventoryModule";
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

  it("allows only a Branch Manager to initialize a No Baseline ingredient", () => {
    expect(canSetIngredientInitialStock("manager", "NO_BASELINE")).toBe(true);
    expect(canSetIngredientInitialStock("manager", "AVAILABLE")).toBe(false);
    expect(canSetIngredientInitialStock("owner", "NO_BASELINE")).toBe(false);
    expect(canSetIngredientInitialStock("staff" as never, "NO_BASELINE")).toBe(false);
  });

  it("keeps the existing business category while removing it from Manager input",()=>{
    const item={branchId:"branch-1",inventoryItemId:"item-1",reorderCategory:"FAST",reorderLevel:10,reorderDays:5} as Parameters<typeof branchReorderSettingsInput>[0];
    expect(branchReorderSettingsInput(item,"25","7"," Verified branch threshold ")).toMatchObject({category:"FAST",reorderLevel:25,reorderDays:7,reason:"Verified branch threshold"});
  });

  it("presents automatic categories as read-only values and missing history as Insufficient Data", () => {
    expect(movementCategoryLabel("FAST")).toBe("Fast");
    expect(movementCategoryLabel("MEDIUM")).toBe("Medium");
    expect(movementCategoryLabel("SLOW")).toBe("Slow");
    expect(movementCategoryLabel(null)).toBe("Insufficient Data");
  });

  it("distinguishes active, inactive, and historical recipe connections", () => {
    const product = { productStatus: "ACTIVE", variantStatus: "ACTIVE", branchMenuStatus: "ACTIVE", connectionStatus: "CURRENT" } as Parameters<typeof connectedProductStatusLabel>[0];
    expect(connectedProductStatusLabel(product)).toBe("Active");
    expect(connectedProductStatusLabel({ ...product, branchMenuStatus: "INACTIVE" })).toBe("Inactive");
    expect(connectedProductStatusLabel({ ...product, connectionStatus: "HISTORICAL" })).toBe("Historical recipe");
  });

  it("hides operation cards while a workflow is open and restores them after Back",()=>{
    expect(shouldShowStockOperationCards(null)).toBe(true);
    expect(shouldShowStockOperationCards("starting")).toBe(false);
    expect(shouldShowStockOperationCards("daily")).toBe(false);
    expect(shouldShowStockOperationCards("full")).toBe(false);
  });

  it("uses saved daily-count state and enforces Closing prerequisites",()=>{
    const context={countType:"OPENING" as const,openingCount:{id:"opening-1",countNo:"IC-1",countType:"OPENING" as const,submittedAt:"2026-10-16T00:00:00Z"},closingCount:null,previousClosingItems:[],previousClosingDate:null,posDayComplete:true};
    expect(dailyCountStatusLabel(null)).toBe("Pending");
    expect(dailyCountStatusLabel(context.openingCount)).toBe("Recorded");
    expect(canOpenClosingCount(context)).toBe(true);
    expect(canOpenClosingCount({...context,posDayComplete:false})).toBe(false);
    expect(canOpenClosingCount({...context,openingCount:null})).toBe(false);
  });

  it("uses the approved operation-specific status labels",()=>{
    const daily={countType:"OPENING" as const,openingCount:null,closingCount:null,previousClosingItems:[],previousClosingDate:null,posDayComplete:false};
    expect(startingStockOperationStatus(null)).toBe("Setup Required");
    expect(startingStockOperationStatus({status:"INITIALIZED"} as never)).toBe("Completed");
    expect(startingStockOperationStatus({status:"BLOCKED",baseline:{id:"legacy-uat"}} as never)).toBe("Completed");
    expect(dailyCountStatusLabel(null)).toBe("Pending");
    expect(closingCountOperationStatus(daily)).toBe("Not Yet Available");
    expect(closingCountOperationStatus({...daily,openingCount:{id:"opening",countNo:"IC-O",countType:"OPENING",submittedAt:"now"}})).toBe("Awaiting POS Import");
    expect(closingCountOperationStatus({...daily,openingCount:{id:"opening",countNo:"IC-O",countType:"OPENING",submittedAt:"now"},posDayComplete:true})).toBe("Ready to Record");
    expect(fullCountOperationStatus({countType:"FULL",closingCount:null,fullCount:null,sameDayClosingItems:[],weeklyFullCount:0,weeklyFullLimit:3})).toBe("Closing Required");
    expect(fullCountOperationStatus({countType:"FULL",closingCount:{id:"closing",countNo:"IC-C",countType:"CLOSING",submittedAt:"now"},fullCount:null,sameDayClosingItems:[],weeklyFullCount:2,weeklyFullLimit:3})).toBe("Ready to Record");
    expect(fullCountOperationStatus({countType:"FULL",closingCount:{id:"closing",countNo:"IC-C",countType:"CLOSING",submittedAt:"now"},fullCount:null,sameDayClosingItems:[],weeklyFullCount:3,weeklyFullLimit:3})).toBe("Weekly Limit Reached");
    expect(fullCountOperationStatus({countType:"FULL",closingCount:{id:"closing",countNo:"IC-C",countType:"CLOSING",submittedAt:"now"},fullCount:{id:"full",countNo:"IC-F",countType:"FULL",submittedAt:"now"},sameDayClosingItems:[],weeklyFullCount:3,weeklyFullLimit:3})).toBe("Recorded");
  });

  it("routes each Stock History correction through its matching existing workflow",()=>{
    expect(dailyCountCorrectionTarget({id:"opening-1",countNo:"IC-O",countType:"OPENING",submittedAt:"now"},"OPENING")).toEqual({id:"opening-1",countType:"OPENING"});
    expect(dailyCountCorrectionTarget(null,"OPENING")).toBeNull();
    expect(countCorrectionOperation("OPENING")).toBe("daily");
    expect(countCorrectionOperation("CLOSING")).toBe("daily");
    expect(countCorrectionOperation("FULL")).toBe("full");
  });

  it("does not render a duplicate Record Stock Count action in Inventory Overview", () => {
    const managerMarkup = renderToStaticMarkup(React.createElement(InventoryOverview, { role: "manager" }));
    const ownerMarkup = renderToStaticMarkup(React.createElement(InventoryOverview, { role: "owner" }));
    expect(managerMarkup).toContain("+ Daily Stock Count");
    expect(ownerMarkup).not.toContain("+ Daily Stock Count");
    expect(managerMarkup).not.toContain("Record Stock Count");
  });

  it("uses KPI skeletons instead of temporary zero inventory totals during the initial request", () => {
    const markup = renderToStaticMarkup(React.createElement(InventoryOverview, { role: "manager" }));
    expect(markup.match(/data-kpi-loading-value/g)).toHaveLength(5);
    expect(markup).not.toContain("₱0.00");
    expect(markup).not.toContain("0 records");
    expect(markup).not.toContain('kpi-card__value text-[24px]');
  });

  it("routes the Overview shortcut according to today's saved Daily Count state", () => {
    const context={countType:"OPENING" as const,openingCount:null,closingCount:null,previousClosingItems:[],previousClosingDate:null,posDayComplete:false};
    expect(dailyCountShortcutDestination(context)).toEqual({countType:"OPENING",completed:false});
    expect(dailyCountShortcutDestination({...context,openingCount:{id:"opening-1",countNo:"IC-1",countType:"OPENING",submittedAt:"2026-10-16T00:00:00Z"}})).toEqual({countType:"CLOSING",completed:false});
    expect(dailyCountShortcutDestination({...context,openingCount:{id:"opening-1",countNo:"IC-1",countType:"OPENING",submittedAt:"2026-10-16T00:00:00Z"},closingCount:{id:"closing-1",countNo:"IC-2",countType:"CLOSING",submittedAt:"2026-10-16T10:00:00Z"}})).toEqual({countType:"CLOSING",completed:true});
  });

  it("returns to the Stock Operations cards only after the Daily Count submission callback", () => {
    expect(stockOperationSelectionAfterDailySubmit()).toBeNull();
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
