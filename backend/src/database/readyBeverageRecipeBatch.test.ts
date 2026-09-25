import { describe, expect, it } from "vitest";
import { calculateIngredientCost } from "../services/unitConversion.service.js";
import { READY_BEVERAGE_BASELINE, READY_BEVERAGE_PROVENANCE, READY_BEVERAGE_RECIPE_BATCH } from "./readyBeverageRecipeBatch.js";

const ingredients: Record<string, { id: string; unit: string; unitCost: number }> = {
  "ING-00019": { id: "barako", unit: "g", unitCost: 0.65 },
  "ING-00022": { id: "chamomile", unit: "pc", unitCost: 8 },
  "ING-00023": { id: "jasmine", unit: "pc", unitCost: 8 },
  "ING-00024": { id: "lavender", unit: "pc", unitCost: 8 },
  "RM-006": { id: "water", unit: "ml", unitCost: 0.01 },
};
const expectedCosts: Record<string, number> = {
  "Barako Brew": 14.1, "Pure Chamomile": 10.5, "Pure Jasmine": 10.5, "Pure Lavender": 10.5,
};
const prices: Record<string, number> = {
  "Barako Brew": 99, "Pure Chamomile": 109, "Pure Jasmine": 109, "Pure Lavender": 109,
};
const costOf = (recipe: typeof READY_BEVERAGE_RECIPE_BATCH[number]) => recipe.ingredients.reduce((total, item) => {
  const ingredient = ingredients[item.sku];
  if (!ingredient) throw new Error(`Unknown ingredient ${item.sku}`);
  return total + calculateIngredientCost({ recipeQuantity: item.quantity, recipeUnit: item.unit,
    inventoryUnit: ingredient.unit, unitCost: ingredient.unitCost });
}, 0);

describe("ready beverage recipe batch", () => {
  it("contains only the four authorized Standard variants and explicit provenance", () => {
    expect(READY_BEVERAGE_PROVENANCE).toBe("SAMPLE / ASSUMED — FOR SYSTEM DEMONSTRATION");
    expect(READY_BEVERAGE_BASELINE).toEqual({ recipes: 32, recipeItems: 133 });
    expect(READY_BEVERAGE_RECIPE_BATCH).toHaveLength(4);
    expect(READY_BEVERAGE_RECIPE_BATCH.every(({ variant }) => variant === "Standard")).toBe(true);
    expect(READY_BEVERAGE_RECIPE_BATCH.reduce((sum, recipe) => sum + recipe.ingredients.length, 0)).toBe(8);
  });

  it("uses currently available shared ingredient identities", () => {
    for (const recipe of READY_BEVERAGE_RECIPE_BATCH) {
      expect(recipe.ingredients.every(({ sku }) => ingredients[sku] !== undefined)).toBe(true);
      expect(recipe.ingredients.find(({ sku }) => sku === "RM-006")?.quantity).toBeGreaterThan(0);
    }
  });

  it("calculates recipe costs and margins with the existing formula", () => {
    for (const recipe of READY_BEVERAGE_RECIPE_BATCH) {
      const cost = costOf(recipe);
      const expected = expectedCosts[recipe.product]!;
      const price = prices[recipe.product]!;
      expect(cost).toBeCloseTo(expected, 8);
      expect(price - cost).toBeCloseTo(price - expected, 8);
      expect(((price - cost) / price) * 100).toBeCloseTo(((price - expected) / price) * 100, 8);
    }
  });

  it("does not include blocked or composition-review products", () => {
    const products: readonly string[] = READY_BEVERAGE_RECIPE_BATCH.map(({ product }) => product);
    expect(products).not.toContain("Iced Tea");
    expect(products).not.toContain("Bottled Water");
    expect(products).not.toContain("Morpheus Pond");
    expect(products).not.toContain("Midsummer Sangria");
  });
});
