import { describe, expect, it } from "vitest";
import { calculatePosImportSimulation } from "./posImportSimulation.service.js";

describe("read-only POS first-import simulation", () => {
  const recipeItems = [
    { recipeVersionId: "small-v1", inventoryItemId: "beans", sku: "RM-BEAN", name: "Coffee Beans", recipeQuantity: 18, recipeUnit: "g", inventoryUnit: "kg", unitCost: 650, yieldQuantity: 1 },
    { recipeVersionId: "small-v1", inventoryItemId: "milk", sku: "RM-MILK", name: "Whole Milk", recipeQuantity: 150, recipeUnit: "ml", inventoryUnit: "L", unitCost: 120, yieldQuantity: 1 },
  ] as const;

  it("uses variant recipe quantities and unit conversion for consumption and COGS", () => {
    const result = calculatePosImportSimulation([{ quantitySold: 2, unitPrice: 150, recipeVersionId: "small-v1" }], recipeItems);
    expect(result.ingredientConsumption).toEqual([
      expect.objectContaining({ inventoryItemId: "beans", unit: "kg", expectedConsumption: 0.036, estimatedCost: 23.4 }),
      expect.objectContaining({ inventoryItemId: "milk", unit: "L", expectedConsumption: 0.3, estimatedCost: 36 }),
    ]);
    expect(result.estimatedSales).toBe(300);
    expect(result.estimatedCogs).toBe(59.4);
    expect(result.estimatedGrossProfit).toBe(240.6);
    expect(result.estimatedGrossMargin).toBeCloseTo(80.2);
  });

  it("does not fabricate consumption for a missing recipe", () => {
    const result = calculatePosImportSimulation([{ quantitySold: 1, unitPrice: 150, recipeVersionId: "missing" }], recipeItems);
    expect(result.ingredientConsumption).toEqual([]);
    expect(result.estimatedCogs).toBe(0);
  });
});
