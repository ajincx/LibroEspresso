import { describe, expect, it } from "vitest";
import { calculateIngredientCost } from "../services/unitConversion.service.js";
import { SAMPLE_RECIPE_BASIS, SECOND_BEVERAGE_RECIPE_BATCH } from "./secondBeverageRecipeBatch.js";

const ingredientCosts: Record<string, { id: string; unit: string; unitCost: number }> = {
  "RM-001": { id: "whole-milk", unit: "ml", unitCost: 0.14 },
  "RM-002": { id: "espresso-beans", unit: "g", unitCost: 0.82 },
  "RM-003": { id: "condensed-milk", unit: "ml", unitCost: 0.18 },
  "RM-005": { id: "caramel-syrup", unit: "ml", unitCost: 0.32 },
  "RM-006": { id: "filtered-water", unit: "ml", unitCost: 0.01 },
  "ING-00018": { id: "ice-by-weight", unit: "g", unitCost: 0.01 },
};
const sellingPrices: Record<string, number> = {
  "Americano Small": 119, "Americano Large": 139,
  "Café Latte Small": 129, "Café Latte Large": 159,
  "Caramel Macchiato Small": 159, "Caramel Macchiato Large": 199,
  "Spanish Latte Small": 149, "Spanish Latte Large": 189,
};
const expectedCosts: Record<string, number> = {
  "Americano Small": 18.06, "Americano Large": 22.84,
  "Café Latte Small": 41.76, "Café Latte Large": 54.24,
  "Caramel Macchiato Small": 46.56, "Caramel Macchiato Large": 60.64,
  "Spanish Latte Small": 42.96, "Spanish Latte Large": 57.24,
};

const findRecipe = (product: string, variant: "Small" | "Large") => {
  const recipe = SECOND_BEVERAGE_RECIPE_BATCH.find((row) => row.product === product && row.variant === variant);
  if (!recipe) throw new Error(`Missing ${product} ${variant}`);
  return recipe;
};
const costOf = (product: string, variant: "Small" | "Large") => findRecipe(product, variant).ingredients.reduce((sum, item) => {
  const ingredient = ingredientCosts[item.sku];
  if (!ingredient) throw new Error(`Missing test cost for ${item.sku}`);
  return sum + calculateIngredientCost({ recipeQuantity: item.quantity, recipeUnit: item.unit,
    inventoryUnit: ingredient.unit, unitCost: ingredient.unitCost });
}, 0);

describe("second beverage recipe batch", () => {
  it("defines one Small and one Large version-1 recipe for each approved product", () => {
    expect(SAMPLE_RECIPE_BASIS).toContain("SAMPLE / ASSUMED RECIPE QUANTITY");
    expect(SECOND_BEVERAGE_RECIPE_BATCH).toHaveLength(8);
    expect(SECOND_BEVERAGE_RECIPE_BATCH.reduce((sum, recipe) => sum + recipe.ingredients.length, 0)).toBe(34);
    for (const product of ["Americano", "Café Latte", "Caramel Macchiato", "Spanish Latte"]) {
      expect(findRecipe(product, "Small").variant).toBe("Small");
      expect(findRecipe(product, "Large").variant).toBe("Large");
    }
  });

  it("uses shared ingredient identities with different Small and Large quantities", () => {
    for (const product of ["Americano", "Café Latte", "Caramel Macchiato", "Spanish Latte"]) {
      const small = findRecipe(product, "Small");
      const large = findRecipe(product, "Large");
      expect(small.ingredients.map(({ sku }) => ingredientCosts[sku]!.id)).toEqual(
        large.ingredients.map(({ sku }) => ingredientCosts[sku]!.id),
      );
      expect(small.ingredients.map(({ quantity }) => quantity)).not.toEqual(large.ingredients.map(({ quantity }) => quantity));
    }
  });

  it("calculates variant-specific recipe cost and margin from existing formulas", () => {
    for (const [key, expectedCost] of Object.entries(expectedCosts)) {
      const splitAt = key.lastIndexOf(" ");
      const product = key.slice(0, splitAt);
      const variant = key.slice(splitAt + 1) as "Small" | "Large";
      const cost = costOf(product, variant);
      const price = sellingPrices[key]!;
      expect(cost).toBeCloseTo(expectedCost, 8);
      expect(price - cost).toBeCloseTo(price - expectedCost, 8);
      expect(((price - cost) / price) * 100).toBeCloseTo(((price - expectedCost) / price) * 100, 8);
    }
  });

  it("uses only Ice By Weight and never RM-004 Ice", () => {
    const items = SECOND_BEVERAGE_RECIPE_BATCH.flatMap(({ ingredients }) => ingredients);
    expect(items.filter(({ sku }) => sku === "ING-00018")).toHaveLength(8);
    expect(items.some(({ sku }) => sku === "RM-004")).toBe(false);
  });
});
