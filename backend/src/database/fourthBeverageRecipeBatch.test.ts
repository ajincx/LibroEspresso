import { describe, expect, it } from "vitest";
import { calculateIngredientCost } from "../services/unitConversion.service.js";
import { BATCH_FOUR_EXPECTED_BASELINE, BATCH_FOUR_PROVENANCE, FOURTH_BEVERAGE_RECIPE_BATCH } from "./fourthBeverageRecipeBatch.js";

const ingredientData: Record<string, { id: string; unit: string; unitCost: number }> = {
  "RM-001": { id: "milk", unit: "ml", unitCost: 0.14 }, "RM-002": { id: "beans", unit: "g", unitCost: 0.82 },
  "RM-005": { id: "caramel", unit: "ml", unitCost: 0.32 }, "RM-006": { id: "water", unit: "ml", unitCost: 0.01 },
  "ING-00002": { id: "cream", unit: "ml", unitCost: 0.3 }, "ING-00006": { id: "salt", unit: "g", unitCost: 0.02 },
  "ING-00018": { id: "weighted-ice", unit: "g", unitCost: 0.01 }, "ING-00020": { id: "chocolate", unit: "g", unitCost: 0.5 },
  "ING-00026": { id: "apple", unit: "ml", unitCost: 0.25 }, "ING-00027": { id: "carbonated-water", unit: "ml", unitCost: 0.06 },
  "ING-00028": { id: "java-chips", unit: "g", unitCost: 0.75 }, "ING-00029": { id: "oreo", unit: "pc", unitCost: 8 },
  "ING-00030": { id: "strawberry", unit: "ml", unitCost: 0.3 },
};
const prices: Record<string, number> = {
  "Salted Caramel Latte|Small": 159, "Salted Caramel Latte|Large": 199, "Green Apple Soda|Standard": 159,
  "Strawberry Cream|Small": 139, "Strawberry Cream|Large": 189, "Chocolate Java Chip|Small": 139,
  "Chocolate Java Chip|Large": 189, "Crushed Oreo|Small": 139, "Crushed Oreo|Large": 189,
  "Salted Caramel|Small": 149, "Salted Caramel|Large": 189,
};
const expectedCosts: Record<string, number> = {
  "Salted Caramel Latte|Small": 46.57, "Salted Caramel Latte|Large": 60.655, "Green Apple Soda|Standard": 21.8,
  "Strawberry Cream|Small": 36.2, "Strawberry Cream|Large": 51.3, "Chocolate Java Chip|Small": 53.95,
  "Chocolate Java Chip|Large": 74.8, "Crushed Oreo|Small": 47.6, "Crushed Oreo|Large": 67.7,
  "Salted Caramel|Small": 36.61, "Salted Caramel|Large": 51.915,
};
const recipeKey = (recipe: typeof FOURTH_BEVERAGE_RECIPE_BATCH[number]) => `${recipe.product}|${recipe.variant}`;
const recipeCost = (recipe: typeof FOURTH_BEVERAGE_RECIPE_BATCH[number]) => recipe.ingredients.reduce((total, item) => {
  const ingredient = ingredientData[item.sku];
  if (!ingredient) throw new Error(`Unknown ${item.sku}`);
  return total + calculateIngredientCost({ recipeQuantity: item.quantity, recipeUnit: item.unit,
    inventoryUnit: ingredient.unit, unitCost: ingredient.unitCost });
}, 0);

describe("fourth beverage recipe batch", () => {
  it("contains only the 11 authorized variants with explicit provenance", () => {
    expect(BATCH_FOUR_PROVENANCE).toBe("SAMPLE / ASSUMED — FOR SYSTEM DEMONSTRATION");
    expect(BATCH_FOUR_EXPECTED_BASELINE).toEqual({ recipes: 21, recipeItems: 82 });
    expect(FOURTH_BEVERAGE_RECIPE_BATCH).toHaveLength(11);
    expect(FOURTH_BEVERAGE_RECIPE_BATCH.reduce((sum, recipe) => sum + recipe.ingredients.length, 0)).toBe(51);
    expect(FOURTH_BEVERAGE_RECIPE_BATCH.map(({ product }) => product)).not.toContain("Midsummer Sangria");
  });

  it("uses shared identities with different Small and Large quantities", () => {
    for (const product of ["Salted Caramel Latte", "Strawberry Cream", "Chocolate Java Chip", "Crushed Oreo", "Salted Caramel"] as const) {
      const small = FOURTH_BEVERAGE_RECIPE_BATCH.find((row) => row.product === product && row.variant === "Small")!;
      const large = FOURTH_BEVERAGE_RECIPE_BATCH.find((row) => row.product === product && row.variant === "Large")!;
      expect(small.ingredients.map(({ sku }) => ingredientData[sku]!.id)).toEqual(large.ingredients.map(({ sku }) => ingredientData[sku]!.id));
      expect(small.ingredients.map(({ quantity }) => quantity)).not.toEqual(large.ingredients.map(({ quantity }) => quantity));
    }
  });

  it("calculates recipe cost and margin through the existing formula", () => {
    for (const recipe of FOURTH_BEVERAGE_RECIPE_BATCH) {
      const key = recipeKey(recipe);
      const cost = recipeCost(recipe);
      const price = prices[key]!;
      expect(cost).toBeCloseTo(expectedCosts[key]!, 8);
      expect(price - cost).toBeCloseTo(price - expectedCosts[key]!, 8);
      expect(((price - cost) / price) * 100).toBeCloseTo(((price - expectedCosts[key]!) / price) * 100, 8);
    }
  });

  it("uses weighted Ice in every approved cold recipe and never RM-004", () => {
    for (const recipe of FOURTH_BEVERAGE_RECIPE_BATCH) {
      expect(recipe.ingredients.some(({ sku }) => sku === "ING-00018")).toBe(true);
      expect(recipe.ingredients.some(({ sku }) => sku === "RM-004")).toBe(false);
    }
  });
});
