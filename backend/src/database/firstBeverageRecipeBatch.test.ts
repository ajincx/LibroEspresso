import { describe, expect, it } from "vitest";
import { calculateIngredientCost } from "../services/unitConversion.service.js";
import { FIRST_BEVERAGE_RECIPE_BATCH, SAMPLE_RECIPE_BASIS } from "./firstBeverageRecipeBatch.js";

const costs: Record<string, { unit: string; unitCost: number }> = {
  "RM-001": { unit: "ml", unitCost: 0.14 },
  "RM-002": { unit: "g", unitCost: 0.82 },
  "RM-003": { unit: "ml", unitCost: 0.18 },
  "RM-005": { unit: "ml", unitCost: 0.32 },
  "RM-006": { unit: "ml", unitCost: 0.01 },
};
const prices: Record<string, number> = {
  Americano: 129,
  "Café Latte": 149,
  Cappuccino: 149,
  "Caramel Macchiato": 189,
  "Spanish Latte": 159,
};

function recipeCost(product: string) {
  const recipe = FIRST_BEVERAGE_RECIPE_BATCH.find((candidate) => candidate.product === product)!;
  return recipe.ingredients.reduce((total, ingredient) => {
    const cost = costs[ingredient.sku]!;
    return total + calculateIngredientCost({
      recipeQuantity: ingredient.quantity,
      recipeUnit: ingredient.unit,
      inventoryUnit: cost.unit,
      unitCost: cost.unitCost,
    });
  }, 0);
}

describe("first sample beverage recipe batch", () => {
  it("contains five independently identified Standard recipes with positive quantities", () => {
    expect(SAMPLE_RECIPE_BASIS).toContain("SAMPLE / ASSUMED RECIPE QUANTITY");
    expect(FIRST_BEVERAGE_RECIPE_BATCH).toHaveLength(5);
    for (const recipe of FIRST_BEVERAGE_RECIPE_BATCH) {
      expect(recipe.category).toBe("Warm Tales");
      expect(recipe.variant).toBe("Standard");
      expect(new Set(recipe.ingredients.map((ingredient) => ingredient.sku)).size).toBe(recipe.ingredients.length);
      expect(recipe.ingredients.every((ingredient) => ingredient.quantity > 0)).toBe(true);
      expect(recipe.ingredients.every((ingredient) => costs[ingredient.sku] !== undefined)).toBe(true);
    }
  });

  it("uses the existing costing formula and variant price for cost and margin", () => {
    const expectedCosts: Record<string, number> = {
      Americano: 17.16,
      "Café Latte": 40.26,
      Cappuccino: 36.06,
      "Caramel Macchiato": 45.06,
      "Spanish Latte": 41.46,
    };
    for (const [product, expected] of Object.entries(expectedCosts)) {
      const cost = recipeCost(product);
      const price = prices[product]!;
      expect(cost).toBeCloseTo(expected, 8);
      expect(price - cost).toBeCloseTo(price - expected, 8);
      expect(((price - cost) / price) * 100).toBeCloseTo(((price - expected) / price) * 100, 8);
    }
  });

  it("does not include unresolved Ice or fabricate a Small/Large production recipe", () => {
    expect(FIRST_BEVERAGE_RECIPE_BATCH.flatMap((recipe) => recipe.ingredients).some((item) => item.sku === "RM-004")).toBe(false);
    expect(FIRST_BEVERAGE_RECIPE_BATCH.some((recipe) => (recipe.variant as string) === "Small")).toBe(false);
    expect(FIRST_BEVERAGE_RECIPE_BATCH.some((recipe) => (recipe.variant as string) === "Large")).toBe(false);
  });
});
