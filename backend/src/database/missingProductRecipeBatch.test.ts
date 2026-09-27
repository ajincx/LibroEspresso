import { describe, expect, it } from "vitest";
import { calculateIngredientCost } from "../services/unitConversion.service.js";
import {
  MISSING_PRODUCT_RECIPE_BATCH,
  MISSING_PRODUCT_RECIPE_EFFECTIVE_FROM,
  MISSING_PRODUCT_RECIPE_PROVENANCE,
} from "./missingProductRecipeBatch.js";

const inventory: Record<string, { unit: string; unitCost: number }> = {
  "ING-00002": { unit: "ml", unitCost: 0.3 },
  "ING-00003": { unit: "g", unitCost: 0.16 },
  "ING-00005": { unit: "g", unitCost: 0.18 },
  "ING-00006": { unit: "g", unitCost: 0.02 },
  "ING-00007": { unit: "g", unitCost: 0.7 },
  "ING-00008": { unit: "pc", unitCost: 6 },
  "ING-00010": { unit: "g", unitCost: 0.6 },
  "ING-00011": { unit: "g", unitCost: 0.45 },
  "ING-00012": { unit: "g", unitCost: 0.4 },
  "ING-00013": { unit: "pc", unitCost: 9 },
  "ING-00016": { unit: "g", unitCost: 0.11 },
  "ING-00017": { unit: "g", unitCost: 0.18 },
};

const prices: Record<string, number> = {
  "Tuna Pasta": 249,
  "Clubhouse Sandwich": 299,
  "Grilled Cheese": 149,
  "Grilled Ham & Cheese": 199,
  "Tuna Sandwich": 189,
};

const expectedCosts: Record<string, number> = {
  "Tuna Pasta": 63.64,
  "Clubhouse Sandwich": 68.4,
  "Grilled Cheese": 42,
  "Grilled Ham & Cheese": 52.5,
  "Tuna Sandwich": 40.9,
};

describe("missing product recipe batch", () => {
  it("contains only explicitly supportable missing Standard recipes", () => {
    expect(MISSING_PRODUCT_RECIPE_BATCH).toHaveLength(5);
    expect(MISSING_PRODUCT_RECIPE_EFFECTIVE_FROM).toBe("2026-01-01");
    expect(MISSING_PRODUCT_RECIPE_PROVENANCE).toBe("SAMPLE / ASSUMED — FOR SYSTEM DEMONSTRATION");
    expect(new Set(MISSING_PRODUCT_RECIPE_BATCH.map(({ product, variant }) => `${product}:${variant}`)).size).toBe(5);
    expect(MISSING_PRODUCT_RECIPE_BATCH.every(({ variant, ingredients }) =>
      variant === "Standard" && ingredients.length > 0 && ingredients.every(({ sku, quantity }) => inventory[sku] && quantity > 0),
    )).toBe(true);
  });

  it("uses the existing costing formula for recipe cost and margin", () => {
    for (const recipe of MISSING_PRODUCT_RECIPE_BATCH) {
      const cost = recipe.ingredients.reduce((sum, item) => {
        const saved = inventory[item.sku]!;
        return sum + calculateIngredientCost({ recipeQuantity: item.quantity, recipeUnit: item.unit,
          inventoryUnit: saved.unit, unitCost: saved.unitCost });
      }, 0);
      expect(cost).toBeCloseTo(expectedCosts[recipe.product]!, 8);
      expect(prices[recipe.product]! - cost).toBeGreaterThan(0);
    }
  });

  it("does not fabricate recipes for products missing essential ingredients", () => {
    const products: readonly string[] = MISSING_PRODUCT_RECIPE_BATCH.map(({ product }) => product);
    for (const blocked of ["Carbonara", "Meaty Spaghetti", "Hawaiian Pizza", "Salt & Pepper Fries", "Bottled Water", "Morpheus Pond"]) {
      expect(products).not.toContain(blocked);
    }
  });
});
