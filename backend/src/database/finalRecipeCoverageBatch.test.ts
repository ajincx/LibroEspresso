import { describe, expect, it } from "vitest";
import {
  FINAL_RECIPE_COVERAGE_BASELINE,
  FINAL_RECIPE_COVERAGE_BATCH,
  FINAL_RECIPE_COVERAGE_EFFECTIVE_FROM,
  FINAL_RECIPE_COVERAGE_PROVENANCE,
  FINAL_RECIPE_INGREDIENTS,
} from "./finalRecipeCoverageBatch.js";

describe("final recipe coverage batch", () => {
  it("contains exactly the seven remaining Standard variants and 41 items", () => {
    expect(FINAL_RECIPE_COVERAGE_BATCH).toHaveLength(7);
    expect(FINAL_RECIPE_COVERAGE_BATCH.reduce((sum, recipe) => sum + recipe.ingredients.length, 0)).toBe(41);
    expect(FINAL_RECIPE_COVERAGE_BATCH.every(({ variant }) => variant === "Standard")).toBe(true);
    expect(new Set(FINAL_RECIPE_COVERAGE_BATCH.map(({ product }) => product)).size).toBe(7);
  });

  it("defines unique positive-cost ingredients using supported units", () => {
    expect(FINAL_RECIPE_INGREDIENTS).toHaveLength(12);
    expect(new Set(FINAL_RECIPE_INGREDIENTS.map(({ name }) => name)).size).toBe(12);
    expect(FINAL_RECIPE_INGREDIENTS.every(({ unit, unitCost }) =>
      ["g", "kg", "ml", "L", "pc"].includes(unit) && unitCost > 0)).toBe(true);
  });

  it("uses positive quantities without duplicate ingredients per recipe", () => {
    for (const recipe of FINAL_RECIPE_COVERAGE_BATCH) {
      expect(recipe.ingredients.every(({ quantity }) => quantity > 0)).toBe(true);
      expect(new Set(recipe.ingredients.map(({ name }) => name)).size).toBe(recipe.ingredients.length);
    }
  });

  it("uses the approved baseline, effective date, and provenance", () => {
    expect(FINAL_RECIPE_COVERAGE_BASELINE).toEqual({ ingredients: 65, recipes: 74, recipeItems: 316 });
    expect(FINAL_RECIPE_COVERAGE_EFFECTIVE_FROM).toBe("2026-01-01");
    expect(FINAL_RECIPE_COVERAGE_PROVENANCE).toBe("SAMPLE / ASSUMED \u2014 FOR SYSTEM DEMONSTRATION");
  });
});
