import { describe, expect, it } from "vitest";
import { calculateIngredientCost } from "../services/unitConversion.service.js";
import { THIRD_BATCH_RECIPE_BASIS, THIRD_BEVERAGE_RECIPE_BATCH } from "./thirdBeverageRecipeBatch.js";

const ingredients: Record<string, { id: string; unit: string; unitCost: number }> = {
  "ING-00001": { id: "sugar", unit: "g", unitCost: 0.07 },
  "ING-00018": { id: "weighted-ice", unit: "g", unitCost: 0.01 },
  "ING-00020": { id: "chocolate-powder", unit: "g", unitCost: 0.5 },
  "ING-00021": { id: "matcha-powder", unit: "g", unitCost: 2.5 },
  "ING-00025": { id: "white-chocolate-sauce", unit: "ml", unitCost: 0.45 },
  "RM-001": { id: "whole-milk", unit: "ml", unitCost: 0.14 },
  "RM-002": { id: "espresso-beans", unit: "g", unitCost: 0.82 },
  "RM-006": { id: "filtered-water", unit: "ml", unitCost: 0.01 },
};
const prices: Record<string, number> = {
  "Warm Tales|Chocolate|Standard": 179, "Cold Classics|Chocolate|Small": 159,
  "Cold Classics|Chocolate|Large": 179, "Warm Tales|Matcha Latte|Standard": 179,
  "Cold Classics|Matcha Latte|Small": 159, "Cold Classics|Matcha Latte|Large": 189,
  "Cold Classics|White Mocha Latte|Small": 159, "Cold Classics|White Mocha Latte|Large": 199,
};
const expectedCosts: Record<string, number> = {
  "Warm Tales|Chocolate|Standard": 41.2, "Cold Classics|Chocolate|Small": 39.9,
  "Cold Classics|Chocolate|Large": 54.35, "Warm Tales|Matcha Latte|Standard": 41.2,
  "Cold Classics|Matcha Latte|Small": 39.9, "Cold Classics|Matcha Latte|Large": 54.35,
  "Cold Classics|White Mocha Latte|Small": 48.51, "Cold Classics|White Mocha Latte|Large": 63.24,
};
const keyOf = (recipe: typeof THIRD_BEVERAGE_RECIPE_BATCH[number]) => `${recipe.category}|${recipe.product}|${recipe.variant}`;
const costOf = (recipe: typeof THIRD_BEVERAGE_RECIPE_BATCH[number]) => recipe.ingredients.reduce((total, item) => {
  const ingredient = ingredients[item.sku];
  if (!ingredient) throw new Error(`Unknown ingredient ${item.sku}`);
  return total + calculateIngredientCost({ recipeQuantity: item.quantity, recipeUnit: item.unit,
    inventoryUnit: ingredient.unit, unitCost: ingredient.unitCost });
}, 0);

describe("third beverage recipe batch", () => {
  it("contains only the eight approved existing variants and 32 recipe items", () => {
    expect(THIRD_BATCH_RECIPE_BASIS).toContain("SAMPLE / ASSUMED RECIPE QUANTITY");
    expect(THIRD_BEVERAGE_RECIPE_BATCH).toHaveLength(8);
    expect(THIRD_BEVERAGE_RECIPE_BATCH.reduce((sum, recipe) => sum + recipe.ingredients.length, 0)).toBe(32);
    expect(THIRD_BEVERAGE_RECIPE_BATCH.filter(({ variant }) => variant === "Standard")).toHaveLength(2);
    expect(THIRD_BEVERAGE_RECIPE_BATCH.filter(({ variant }) => variant === "Small")).toHaveLength(3);
    expect(THIRD_BEVERAGE_RECIPE_BATCH.filter(({ variant }) => variant === "Large")).toHaveLength(3);
  });

  it("shares ingredient identities but keeps different Small and Large quantities", () => {
    for (const product of ["Chocolate", "Matcha Latte", "White Mocha Latte"] as const) {
      const small = THIRD_BEVERAGE_RECIPE_BATCH.find((row) => row.product === product && row.variant === "Small")!;
      const large = THIRD_BEVERAGE_RECIPE_BATCH.find((row) => row.product === product && row.variant === "Large")!;
      expect(small.ingredients.map(({ sku }) => ingredients[sku]!.id)).toEqual(large.ingredients.map(({ sku }) => ingredients[sku]!.id));
      expect(small.ingredients.map(({ quantity }) => quantity)).not.toEqual(large.ingredients.map(({ quantity }) => quantity));
    }
  });

  it("calculates each variant cost and margin with the existing formula", () => {
    for (const recipe of THIRD_BEVERAGE_RECIPE_BATCH) {
      const key = keyOf(recipe);
      const cost = costOf(recipe);
      const price = prices[key]!;
      expect(cost).toBeCloseTo(expectedCosts[key]!, 8);
      expect(price - cost).toBeCloseTo(price - expectedCosts[key]!, 8);
      expect(((price - cost) / price) * 100).toBeCloseTo(((price - expectedCosts[key]!) / price) * 100, 8);
    }
  });

  it("uses weighted ice only for cold variants and never uses RM-004", () => {
    for (const recipe of THIRD_BEVERAGE_RECIPE_BATCH) {
      expect(recipe.ingredients.some(({ sku }) => sku === "RM-004")).toBe(false);
      expect(recipe.ingredients.some(({ sku }) => sku === "ING-00018")).toBe(recipe.category === "Cold Classics");
    }
  });
});
