import { describe, expect, it } from "vitest";
import {
  RECIPE_COVERAGE_BATCH2,
  RECIPE_COVERAGE_BATCH2_BASELINE,
  RECIPE_COVERAGE_BATCH2_EFFECTIVE_FROM,
  RECIPE_COVERAGE_BATCH2_EXISTING,
  RECIPE_COVERAGE_BATCH2_INGREDIENTS,
  RECIPE_COVERAGE_BATCH2_PROVENANCE,
} from "./recipeCoverageBatch2.js";

describe("recipe coverage batch 2", () => {
  it("preserves the three already-covered pizza recipes", () => {
    expect(RECIPE_COVERAGE_BATCH2_EXISTING).toEqual(["Cheese Pizza", "Hawaiian Pizza", "Pepperoni Pizza"]);
    expect(RECIPE_COVERAGE_BATCH2.map(({ product }) => product)).not.toContain("Cheese Pizza");
  });

  it("contains exactly the five missing rice-meal recipes and 33 items", () => {
    expect(RECIPE_COVERAGE_BATCH2).toHaveLength(5);
    expect(RECIPE_COVERAGE_BATCH2.reduce((sum, recipe) => sum + recipe.ingredients.length, 0)).toBe(33);
    expect(RECIPE_COVERAGE_BATCH2.every(({ variant }) => variant === "Standard")).toBe(true);
    for (const recipe of RECIPE_COVERAGE_BATCH2) {
      expect(new Set(recipe.ingredients.map(({ name }) => name)).size).toBe(recipe.ingredients.length);
      expect(recipe.ingredients.every(({ quantity }) => quantity > 0)).toBe(true);
    }
  });

  it("defines only five positive-cost ingredients with supported units", () => {
    expect(RECIPE_COVERAGE_BATCH2_INGREDIENTS).toHaveLength(5);
    expect(new Set(RECIPE_COVERAGE_BATCH2_INGREDIENTS.map(({ name }) => name)).size).toBe(5);
    expect(RECIPE_COVERAGE_BATCH2_INGREDIENTS.every(({ unit, unitCost }) =>
      ["g", "kg", "ml", "L", "pc"].includes(unit) && unitCost > 0)).toBe(true);
  });

  it("uses the approved baseline, effective date, and provenance", () => {
    expect(RECIPE_COVERAGE_BATCH2_BASELINE).toEqual({ ingredients: 60, recipes: 66, recipeItems: 263 });
    expect(RECIPE_COVERAGE_BATCH2_EFFECTIVE_FROM).toBe("2026-01-01");
    expect(RECIPE_COVERAGE_BATCH2_PROVENANCE).toBe("SAMPLE / ASSUMED \u2014 FOR SYSTEM DEMONSTRATION");
  });
});
