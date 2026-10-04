import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ExpectedInventoryItem } from "../../types/inventoryWorkflow";
import { allowedPhysicalCountUnits, buildPhysicalCountItems, canLeavePhysicalCountEntry, filterPhysicalCountItems, initialPhysicalCountDate, isFutureInventoryCountDate, normalizePhysicalCountPreview, PHYSICAL_COUNT_INVESTIGATION_GUIDANCE, PhysicalCountBackAction, physicalCountEntryFromCanonical, physicalCountPreviewVariance, validPhysicalCountEntries } from "./InventoryCountPage";

const item = (inventoryItemId: string, sku: string, itemName: string): ExpectedInventoryItem => ({
  inventoryItemId, sku, itemName, unit: "pc", unitCost: 1, previousActualQuantity: 10,
  stockReceived: 0, expectedConsumption: 0, approvedAdjustments: 0, expectedQuantity: 10,
  baselineDate: "2026-10-01",
});
const ingredients = [item("ice", "RM-004", "Ice"), item("milk", "RM-005", "Whole Milk"), item("sugar", "ING-010", "Brown Sugar")];

describe("Inventory physical-count history navigation", () => {
  it("explains that only material discrepancies may require investigation", () => {
    expect(PHYSICAL_COUNT_INVESTIGATION_GUIDANCE).toBe(
      "Significant discrepancies may require an investigation based on the configured tolerance.",
    );
    expect(PHYSICAL_COUNT_INVESTIGATION_GUIDANCE).not.toContain("automatically");
  });

  it("renders Back to Count History and forwards the navigation action", () => {
    const onBack = vi.fn();
    const markup = renderToStaticMarkup(React.createElement(PhysicalCountBackAction, { onBack }));
    expect(markup).toContain("Back to Count History");
    const action = PhysicalCountBackAction({ onBack }) as React.ReactElement<{ onClick: () => void }>;
    action.props.onClick();
    expect(onBack).toHaveBeenCalledOnce();
  });

  it("does not submit or discard an edited draft without confirmation", () => {
    const confirmLeave = vi.fn(() => false);
    expect(canLeavePhysicalCountEntry(true, confirmLeave)).toBe(false);
    expect(confirmLeave).toHaveBeenCalledOnce();
  });

  it("returns without prompting when the entry has not been changed", () => {
    const confirmLeave = vi.fn(() => false);
    expect(canLeavePhysicalCountEntry(false, confirmLeave)).toBe(true);
    expect(confirmLeave).not.toHaveBeenCalled();
  });
});

describe("Inventory physical-count business-date protection", () => {
  const currentBusinessDate = "2026-10-01";

  it("uses the current business date as the inclusive maximum", () => {
    expect(isFutureInventoryCountDate(currentBusinessDate, currentBusinessDate)).toBe(false);
  });

  it("rejects a future count date at submit time", () => {
    expect(isFutureInventoryCountDate("2026-10-02", currentBusinessDate)).toBe(true);
  });

  it("allows an earlier count date", () => {
    expect(isFutureInventoryCountDate("2026-09-30", currentBusinessDate)).toBe(false);
  });

  it("uses a valid requested PO order date and rejects a future requested date", () => {
    expect(initialPhysicalCountDate("2026-10-01", "2026-10-03")).toBe("2026-10-01");
    expect(initialPhysicalCountDate("2026-10-04", "2026-10-03")).toBe("2026-10-03");
  });
});

describe("Inventory physical-count ingredient search", () => {
  it("filters by ingredient name", () => {
    expect(filterPhysicalCountItems(ingredients, "Ice").map((entry) => entry.inventoryItemId)).toEqual(["ice"]);
  });

  it("filters by SKU", () => {
    expect(filterPhysicalCountItems(ingredients, "RM-004").map((entry) => entry.itemName)).toEqual(["Ice"]);
  });

  it("matches case-insensitively and supports no results", () => {
    expect(filterPhysicalCountItems(ingredients, "wHoLe MiLk")).toEqual([ingredients[1]]);
    expect(filterPhysicalCountItems(ingredients, "not-present")).toEqual([]);
  });

  it("restores all items when search is cleared", () => {
    expect(filterPhysicalCountItems(ingredients, "")).toEqual(ingredients);
  });

  it("preserves entered quantities while filtering", () => {
    const actual = { ice: { quantity: "20", enteredUnit: "pc" as const }, milk: { quantity: "15", enteredUnit: "pc" as const }, sugar: { quantity: "8", enteredUnit: "pc" as const } };
    filterPhysicalCountItems(ingredients, "Ice");
    filterPhysicalCountItems(ingredients, "");
    expect(actual).toEqual({
      ice: { quantity: "20", enteredUnit: "pc" },
      milk: { quantity: "15", enteredUnit: "pc" },
      sugar: { quantity: "8", enteredUnit: "pc" },
    });
  });

  it("builds the submitted item set from every ingredient, not filtered rows", () => {
    const actual = { ice: { quantity: "20", enteredUnit: "pc" as const }, milk: { quantity: "15", enteredUnit: "pc" as const }, sugar: { quantity: "8", enteredUnit: "pc" as const } };
    expect(filterPhysicalCountItems(ingredients, "Ice")).toHaveLength(1);
    expect(buildPhysicalCountItems(ingredients, actual)).toEqual([
      { inventoryItemId: "ice", quantity: 20, enteredUnit: "pc" },
      { inventoryItemId: "milk", quantity: 15, enteredUnit: "pc" },
      { inventoryItemId: "sugar", quantity: 8, enteredUnit: "pc" },
    ]);
  });

  it("does not add a No Baseline item to the submitted count set", () => {
    const actual = { ice: { quantity: "20", enteredUnit: "pc" as const }, milk: { quantity: "15", enteredUnit: "pc" as const }, sugar: { quantity: "8", enteredUnit: "pc" as const }, "test-oat": { quantity: "99", enteredUnit: "ml" as const } };
    expect(buildPhysicalCountItems(ingredients, actual)).not.toContainEqual({
      inventoryItemId: "test-oat",
      quantity: 99,
      enteredUnit: "ml",
    });
  });
});

describe("Inventory physical-count unit entry", () => {
  it("offers the correct units for canonical g, ml, and pc", () => {
    expect(allowedPhysicalCountUnits("g")).toEqual(["g", "kg"]);
    expect(allowedPhysicalCountUnits("ml")).toEqual(["ml", "L"]);
    expect(allowedPhysicalCountUnits("pc")).toEqual(["pc"]);
  });

  it("displays 3864 g as 3.864 kg and previews the canonical quantity", () => {
    const entry = physicalCountEntryFromCanonical(3864, "g");
    expect(entry).toEqual({ quantity: "3.864", enteredUnit: "kg" });
    expect(normalizePhysicalCountPreview(entry, "g")).toBe(3864);
  });

  it("previews L to ml and preserves canonical input", () => {
    expect(normalizePhysicalCountPreview({ quantity: "2.5", enteredUnit: "L" }, "ml")).toBe(2500);
    expect(normalizePhysicalCountPreview({ quantity: "3864", enteredUnit: "g" }, "g")).toBe(3864);
  });

  it("accepts zero and decimals but rejects empty, negative, and incompatible entries", () => {
    expect(normalizePhysicalCountPreview({ quantity: "0", enteredUnit: "g" }, "g")).toBe(0);
    expect(normalizePhysicalCountPreview({ quantity: "1.25", enteredUnit: "kg" }, "g")).toBe(1250);
    expect(normalizePhysicalCountPreview({ quantity: "", enteredUnit: "g" }, "g")).toBeNull();
    expect(normalizePhysicalCountPreview({ quantity: "-1", enteredUnit: "g" }, "g")).toBeNull();
    expect(normalizePhysicalCountPreview({ quantity: "3", enteredUnit: "L" }, "g")).toBeNull();
  });

  it("requires every countable item to have a valid entry", () => {
    expect(validPhysicalCountEntries([ingredients[0]!], { ice: { quantity: "10", enteredUnit: "pc" } })).toBe(true);
    expect(validPhysicalCountEntries([ingredients[0]!], { ice: { quantity: "", enteredUnit: "pc" } })).toBe(false);
  });

  it("previews variance as Actual minus Expected", () => {
    expect(physicalCountPreviewVariance(5054, 5000)).toBe(-54);
    expect(physicalCountPreviewVariance(5054, 5100)).toBe(46);
    expect(physicalCountPreviewVariance(5054, 5054)).toBe(0);
  });
});
