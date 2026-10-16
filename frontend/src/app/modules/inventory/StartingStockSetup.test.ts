import { describe, expect, it } from "vitest";
import {
  allowedStartingStockUnits,
  changeStartingStockUnit,
  normalizeStartingStockEntry,
  startingStockCompletion,
  startingStockDraftKey,
  startingStockStatusLabel,
} from "./StartingStockSetup";
import type { StartingStockSetupItem } from "../../types/inventoryWorkflow";

const items: StartingStockSetupItem[] = [
  { inventoryItemId: "espresso", sku: "RM-002", name: "Espresso Blend Beans", category: "Coffee", unit: "g" },
  { inventoryItemId: "milk", sku: "RM-005", name: "Whole Milk", category: "Dairy", unit: "ml" },
  { inventoryItemId: "water", sku: "RM-010", name: "Bottled Water", category: "Beverage", unit: "pc" },
];

describe("Starting Stock entry normalization", () => {
  it("keeps blank distinct from an explicit zero", () => {
    expect(normalizeStartingStockEntry({ quantity: "", enteredUnit: "g" }, "g")).toBeNull();
    expect(normalizeStartingStockEntry({ quantity: "0", enteredUnit: "g" }, "g")).toBe(0);
  });

  it("converts practical entry units into canonical inventory units", () => {
    expect(normalizeStartingStockEntry({ quantity: "3.864", enteredUnit: "kg" }, "g")).toBe(3864);
    expect(normalizeStartingStockEntry({ quantity: "2.5", enteredUnit: "L" }, "ml")).toBe(2500);
    expect(normalizeStartingStockEntry({ quantity: "12", enteredUnit: "pc" }, "pc")).toBe(12);
    expect(allowedStartingStockUnits("g")).toEqual(["g", "kg"]);
    expect(allowedStartingStockUnits("ml")).toEqual(["ml", "L"]);
    expect(allowedStartingStockUnits("pc")).toEqual(["pc"]);
  });

  it("rejects negative, nonnumeric, and incompatible entries", () => {
    expect(normalizeStartingStockEntry({ quantity: "-1", enteredUnit: "g" }, "g")).toBeNull();
    expect(normalizeStartingStockEntry({ quantity: "beans", enteredUnit: "g" }, "g")).toBeNull();
    expect(normalizeStartingStockEntry({ quantity: "3", enteredUnit: "L" }, "g")).toBeNull();
  });

  it("preserves the canonical quantity when the user switches compatible units", () => {
    expect(changeStartingStockUnit({ quantity: "3864", enteredUnit: "g" }, "g", "kg")).toEqual({ quantity: "3.864", enteredUnit: "kg" });
    expect(changeStartingStockUnit({ quantity: "2.5", enteredUnit: "L" }, "ml", "ml")).toEqual({ quantity: "2500", enteredUnit: "ml" });
  });

  it("requires every assigned item while counting zero as completed", () => {
    const partial = startingStockCompletion(items, {
      espresso: { quantity: "0", enteredUnit: "g" },
      milk: { quantity: "2.5", enteredUnit: "L" },
      water: { quantity: "", enteredUnit: "pc" },
    });
    expect(partial).toEqual({ completed: 2, total: 3, remaining: 1, complete: false });
    expect(startingStockCompletion(items, {
      espresso: { quantity: "0", enteredUnit: "g" },
      milk: { quantity: "2.5", enteredUnit: "L" },
      water: { quantity: "24", enteredUnit: "pc" },
    }).complete).toBe(true);
  });

  it("scopes saved drafts to the selected branch", () => {
    expect(startingStockDraftKey("gulod")).not.toBe(startingStockDraftKey("lipa"));
  });

  it("uses clear confirmed and unconfirmed status labels",()=>{
    expect(startingStockStatusLabel(false)).toBe("Not Yet Set Up");
    expect(startingStockStatusLabel(true)).toBe("Confirmed");
  });
});
