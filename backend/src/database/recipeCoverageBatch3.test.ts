import { describe, expect, it } from "vitest";
import { calculateIngredientCost } from "../services/unitConversion.service.js";
import {
  RECIPE_COVERAGE_BATCH3,
  RECIPE_COVERAGE_BATCH3_BASELINE,
  RECIPE_COVERAGE_BATCH3_EFFECTIVE_FROM,
  RECIPE_COVERAGE_BATCH3_PROVENANCE,
} from "./recipeCoverageBatch3.js";

const inventory: Record<string, { unit: string; unitCost: number }> = {
  "Sandwich Bread Slices": { unit: "pc", unitCost: 6 }, "Bacon": { unit: "g", unitCost: 0.7 },
  "Cheddar Cheese": { unit: "g", unitCost: 0.6 }, "Chicken Eggs": { unit: "pc", unitCost: 9 },
  "Lettuce": { unit: "g", unitCost: 0.18 }, "Tomatoes": { unit: "g", unitCost: 0.11 },
  "Butter": { unit: "g", unitCost: 0.45 }, "Burger Bun": { unit: "pc", unitCost: 12 },
  "Ground Beef": { unit: "g", unitCost: 0.55 }, "Cooking Oil": { unit: "ml", unitCost: 0.12 },
  "Chicken Tender": { unit: "pc", unitCost: 18 },
};
const expected = {
  "Bacon Best Seller": { cost: 92.4, price: 269 },
  "Cheddar Chapter Cheeseburger": { cost: 101.3, price: 239 },
  "TLC Tender Chapter": { cost: 86.1, price: 259 },
} as const;

describe("recipe coverage batch 3", () => {
  it("contains only the three requested Standard recipes and 20 items", () => {
    expect(RECIPE_COVERAGE_BATCH3).toHaveLength(3);
    expect(RECIPE_COVERAGE_BATCH3.reduce((sum, recipe) => sum + recipe.ingredients.length, 0)).toBe(20);
    expect(RECIPE_COVERAGE_BATCH3.every(({ variant }) => variant === "Standard")).toBe(true);
  });

  it("uses Burger Bun for TLC Tender Chapter", () => {
    const tlc = RECIPE_COVERAGE_BATCH3.find(({ product }) => product === "TLC Tender Chapter")!;
    expect(tlc.ingredients.some(({ name }) => name === "Burger Bun")).toBe(true);
    expect(tlc.ingredients.some(({ name }) => name === "Sandwich Bread Slices")).toBe(false);
  });

  it("calculates the expected recipe costs, gross profits, and margins", () => {
    for (const recipe of RECIPE_COVERAGE_BATCH3) {
      const cost = recipe.ingredients.reduce((sum, item) => {
        const saved = inventory[item.name];
        expect(saved).toBeDefined();
        return sum + calculateIngredientCost({ recipeQuantity: item.quantity, recipeUnit: item.unit,
          inventoryUnit: saved!.unit, unitCost: saved!.unitCost });
      }, 0);
      const target = expected[recipe.product];
      expect(cost).toBeCloseTo(target.cost, 8);
      expect(target.price - cost).toBeGreaterThan(0);
      expect(((target.price - cost) / target.price) * 100).toBeGreaterThan(0);
    }
  });

  it("uses the approved baseline, effective date, and provenance", () => {
    expect(RECIPE_COVERAGE_BATCH3_BASELINE).toEqual({ ingredients: 65, recipes: 71, recipeItems: 296 });
    expect(RECIPE_COVERAGE_BATCH3_EFFECTIVE_FROM).toBe("2026-01-01");
    expect(RECIPE_COVERAGE_BATCH3_PROVENANCE).toBe("SAMPLE / ASSUMED \u2014 FOR SYSTEM DEMONSTRATION");
  });
});
