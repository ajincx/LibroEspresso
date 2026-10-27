import { describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { filterIngredientUsageItems, filterInventoryCountHistory, ingredientUsageThroughDateError, IngredientUsageSearch, IngredientUsageToolbar, INGREDIENT_USAGE_NO_MATCH_TITLE, inventoryCountHistoryActions, inventoryCountHistoryModes, PhysicalCountHistoryHeaderActions } from "./InventorySupportPages";
import type { ExpectedInventoryItem, InventoryCountSummary } from "../../types/inventoryWorkflow";

describe("inventory-count history role actions", () => {
  it("keeps Owner history read-only while exposing count details", () => {
    expect(inventoryCountHistoryActions("owner", true)).toEqual({ canView: true, canEdit: false, canDelete: false });
  });

  it("shows correction only when the server authorizes the Branch Manager", () => {
    expect(inventoryCountHistoryActions("manager", true)).toEqual({ canView: false, canEdit: true, canDelete: false });
    expect(inventoryCountHistoryActions("manager", false)).toEqual({ canView: false, canEdit: false, canDelete: false });
  });

  it("shows the separate UAT/Test history only to the Owner when the backend enables it", () => {
    expect(inventoryCountHistoryModes("owner", true)).toEqual(["operational", "uat"]);
    expect(inventoryCountHistoryModes("owner", false)).toEqual(["operational"]);
    expect(inventoryCountHistoryModes("manager", true)).toEqual(["operational"]);
  });

  it("keeps Stock History read-only and removes the Record Stock Count action", () => {
    const markup = renderToStaticMarkup(React.createElement(PhysicalCountHistoryHeaderActions, { onRefresh: () => undefined }));
    expect(markup).not.toContain("Record Stock Count");
    expect(markup).toContain("Refresh");
  });
});

describe("Stock History filters", () => {
  const count = (id: string, countDate: string, countType: InventoryCountSummary["countType"]): InventoryCountSummary => ({
    id, countNo: id, countDate, countType, submittedAt: `${countDate}T10:00:00Z`, branchId: "branch-1",
    branchName: "Gulod", submittedBy: "Manager", itemCount: 2, varianceCount: 0, canEdit: false,
  });
  const counts = [count("IC-1", "2026-10-15", "OPENING"), count("IC-2", "2026-10-15", "CLOSING"), count("IC-3", "2026-10-16", "FULL")];

  it("filters by count date", () => {
    expect(filterInventoryCountHistory(counts, "", "2026-10-15", "ALL").map((item) => item.id)).toEqual(["IC-1", "IC-2"]);
  });

  it("filters by Opening, Closing, and Full type", () => {
    expect(filterInventoryCountHistory(counts, "", "", "OPENING").map((item) => item.id)).toEqual(["IC-1"]);
    expect(filterInventoryCountHistory(counts, "", "", "CLOSING").map((item) => item.id)).toEqual(["IC-2"]);
    expect(filterInventoryCountHistory(counts, "", "", "FULL").map((item) => item.id)).toEqual(["IC-3"]);
  });

  it("combines search, date, and type filters without changing branch-scoped data", () => {
    expect(filterInventoryCountHistory(counts, "Gulod", "2026-10-15", "CLOSING").map((item) => item.id)).toEqual(["IC-2"]);
  });
});

describe("Ingredient Usage search", () => {
  const item = (inventoryItemId: string, sku: string, itemName: string): ExpectedInventoryItem => ({
    inventoryItemId, sku, itemName, unit: "g", unitCost: 1, previousActualQuantity: 10,
    stockReceived: 2, expectedConsumption: 3, approvedAdjustments: 0, expectedQuantity: 9,
    baselineDate: "2026-10-27", baselineSource: "DAILY_OPENING",
  });
  const branchItems = [item("beans", "RM-002", "Espresso Blend Beans"), item("milk", "ING-17", "Fresh Milk")];

  it("matches ingredient names and SKU codes case-insensitively", () => {
    expect(filterIngredientUsageItems(branchItems, "ESPRESSO").map((entry) => entry.inventoryItemId)).toEqual(["beans"]);
    expect(filterIngredientUsageItems(branchItems, "ing-17").map((entry) => entry.inventoryItemId)).toEqual(["milk"]);
    expect(filterIngredientUsageItems(branchItems, "missing")).toEqual([]);
    expect(INGREDIENT_USAGE_NO_MATCH_TITLE).toBe("No matching ingredients found");
  });

  it("filters only the already authorized branch dataset", () => {
    expect(filterIngredientUsageItems([branchItems[0]!], "milk")).toEqual([]);
    expect(filterIngredientUsageItems([branchItems[0]!], "")).toEqual([branchItems[0]]);
  });

  it("shows Clear Search only for entered text and clears through the controlled callback", () => {
    const onChange = vi.fn();
    const populated = IngredientUsageSearch({ value: "beans", onChange }) as React.ReactElement<{ children: React.ReactNode }>;
    const children = React.Children.toArray(populated.props.children);
    const clear = children[1] as React.ReactElement<{ onClick: () => void }>;
    expect(renderToStaticMarkup(populated)).toContain("Clear Search");
    clear.props.onClick();
    expect(onChange).toHaveBeenCalledWith("");
    expect(renderToStaticMarkup(React.createElement(IngredientUsageSearch, { value: "", onChange }))).not.toContain("Clear Search");
  });

  it("groups the Usage Through Date and search controls responsively",()=>{
    const markup=renderToStaticMarkup(React.createElement(IngredientUsageToolbar,{
      date:"2026-10-27",search:"beans",onDateChange:vi.fn(),onSearchChange:vi.fn(),
    }));
    expect(markup).toContain("data-ingredient-usage-toolbar");
    expect(markup).toContain("flex-col");
    expect(markup).toContain("md:flex-row");
    expect(markup).toContain("Usage Through Date");
    expect(markup).toContain("validated POS sales up to this date");
    expect(markup).toContain("Search ingredient name or SKU");
  });

  it("accepts today and past Manila dates but rejects future and invalid input",()=>{
    expect(ingredientUsageThroughDateError("2026-10-27","2026-10-27")).toBe("");
    expect(ingredientUsageThroughDateError("2026-09-01","2026-10-27")).toBe("");
    expect(ingredientUsageThroughDateError("2026-10-28","2026-10-27")).toContain("cannot be later");
    expect(ingredientUsageThroughDateError("2026-02-30","2026-10-27")).toContain("valid");
  });
});
