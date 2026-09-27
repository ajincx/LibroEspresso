import { describe, expect, it } from "vitest";
import { calculateIngredientCost } from "../services/unitConversion.service.js";
import {
  RECIPE_COVERAGE_BATCH1,
  RECIPE_COVERAGE_BATCH1_BASELINE,
  RECIPE_COVERAGE_BATCH1_EFFECTIVE_FROM,
  RECIPE_COVERAGE_BATCH1_PROVENANCE,
} from "./recipeCoverageBatch1.js";

const inventory: Record<string, { unit: string; unitCost: number }> = {
  "ING-00042": { unit: "g", unitCost: 0.3 },
  "ING-00033": { unit: "ml", unitCost: 0.35 },
  "ING-00034": { unit: "g", unitCost: 0.55 },
  "ING-00016": { unit: "g", unitCost: 0.11 },
  "ING-00046": { unit: "pc", unitCost: 30 },
  "ING-00015": { unit: "g", unitCost: 0.85 },
  "ING-00002": { unit: "ml", unitCost: 0.3 },
  "ING-00045": { unit: "pc", unitCost: 25 },
  "ING-00049": { unit: "ml", unitCost: 0.4 },
  "ING-00050": { unit: "g", unitCost: 0.45 },
};

const expected = {
  "Nachos Overload Large": { cost: 135.3, price: 249 },
  "Biscoff Croffle": { cost: 61.5, price: 189 },
  "Maple & Butter Waffle": { cost: 41.5, price: 159 },
} as const;

describe("recipe coverage batch 1", () => {
  it("contains only the three authorized Standard recipes", () => {
    expect(RECIPE_COVERAGE_BATCH1).toHaveLength(3);
    expect(RECIPE_COVERAGE_BATCH1.map(({ product }) => product)).toEqual([
      "Nachos Overload Large", "Biscoff Croffle", "Maple & Butter Waffle",
    ]);
    expect(RECIPE_COVERAGE_BATCH1.every(({ variant }) => variant === "Standard")).toBe(true);
    expect(RECIPE_COVERAGE_BATCH1.reduce((total, recipe) => total + recipe.ingredients.length, 0)).toBe(10);
  });

  it("uses the approved effective date and sample provenance", () => {
    expect(RECIPE_COVERAGE_BATCH1_BASELINE).toEqual({ recipes: 63, recipeItems: 253 });
    expect(RECIPE_COVERAGE_BATCH1_EFFECTIVE_FROM).toBe("2026-01-01");
    expect(RECIPE_COVERAGE_BATCH1_PROVENANCE).toBe("SAMPLE / ASSUMED \u2014 FOR SYSTEM DEMONSTRATION");
  });

  it("uses existing ingredients and calculates expected costs and margins", () => {
    for (const recipe of RECIPE_COVERAGE_BATCH1) {
      const cost = recipe.ingredients.reduce((sum, item) => {
        const saved = inventory[item.sku];
        expect(saved).toBeDefined();
        return sum + calculateIngredientCost({
          recipeQuantity: item.quantity,
          recipeUnit: item.unit,
          inventoryUnit: saved!.unit,
          unitCost: saved!.unitCost,
        });
      }, 0);
      const target = expected[recipe.product];
      expect(cost).toBeCloseTo(target.cost, 8);
      expect(target.price - cost).toBeCloseTo(target.price - target.cost, 8);
      expect(((target.price - cost) / target.price) * 100).toBeGreaterThan(0);
    }
  });

  it("contains no duplicate ingredient within a recipe and no zero quantity", () => {
    for (const recipe of RECIPE_COVERAGE_BATCH1) {
      expect(new Set(recipe.ingredients.map(({ sku }) => sku)).size).toBe(recipe.ingredients.length);
      expect(recipe.ingredients.every(({ quantity }) => quantity > 0)).toBe(true);
    }
  });
});
