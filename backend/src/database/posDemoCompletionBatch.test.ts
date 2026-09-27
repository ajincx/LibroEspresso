import { describe, expect, it } from "vitest";
import { calculateIngredientCost } from "../services/unitConversion.service.js";
import {
  POS_DEMO_EFFECTIVE_FROM,
  POS_DEMO_INGREDIENTS,
  POS_DEMO_PROVENANCE,
  POS_DEMO_RECIPES,
} from "./posDemoCompletionBatch.js";

const existing = new Map<string, { unit: string; unitCost: number }>([
  ["Granulated Sugar", { unit: "g", unitCost: 0.07 }], ["Whipping Cream", { unit: "ml", unitCost: 0.3 }],
  ["Dry Spaghetti", { unit: "g", unitCost: 0.16 }], ["Uncooked Rice", { unit: "g", unitCost: 0.06 }],
  ["Garlic", { unit: "g", unitCost: 0.18 }], ["Salt", { unit: "g", unitCost: 0.02 }],
  ["Ground Black Pepper", { unit: "g", unitCost: 0.7 }], ["Cheddar Cheese", { unit: "g", unitCost: 0.6 }],
  ["Sliced Ham", { unit: "g", unitCost: 0.45 }], ["Chicken Eggs", { unit: "pc", unitCost: 9 }],
  ["Nutella Hazelnut Spread", { unit: "g", unitCost: 0.9 }], ["Tomatoes", { unit: "g", unitCost: 0.11 }],
  ["Ice — By Weight", { unit: "g", unitCost: 0.01 }], ["Carbonated Water", { unit: "ml", unitCost: 0.06 }],
  ["Green Apple Syrup", { unit: "ml", unitCost: 0.25 }], ["Strawberry Syrup", { unit: "ml", unitCost: 0.3 }],
  ["Whole Milk", { unit: "ml", unitCost: 0.14 }], ["Espresso Blend Beans", { unit: "g", unitCost: 0.82 }],
  ["Condensed Milk", { unit: "ml", unitCost: 0.18 }], ["Caramel Syrup", { unit: "ml", unitCost: 0.32 }],
  ["Filtered Water", { unit: "ml", unitCost: 0.01 }],
]);
for (const item of POS_DEMO_INGREDIENTS) existing.set(item.name, { unit: item.unit, unitCost: Number(item.unitCost) });

describe("POS demo completion batch", () => {
  it("uses unique supported ingredient identities with explicit sample provenance", () => {
    expect(POS_DEMO_INGREDIENTS).toHaveLength(24);
    expect(new Set(POS_DEMO_INGREDIENTS.map(({ name }) => name.toLowerCase())).size).toBe(24);
    expect(POS_DEMO_INGREDIENTS.every(({ unit, unitCost }) => ["g", "ml", "pc"].includes(unit) && Number(unitCost) > 0)).toBe(true);
    expect(POS_DEMO_PROVENANCE).toBe("SAMPLE / ASSUMED — FOR SYSTEM DEMONSTRATION");
    expect(POS_DEMO_EFFECTIVE_FROM).toBe("2026-01-01");
  });

  it("contains one non-empty version-one candidate for each missing sellable POS target", () => {
    expect(POS_DEMO_RECIPES).toHaveLength(22);
    expect(new Set(POS_DEMO_RECIPES.map(({ product, variant }) => `${product}:${variant}`)).size).toBe(22);
    expect(POS_DEMO_RECIPES.reduce((sum, recipe) => sum + recipe.ingredients.length, 0)).toBe(91);
    expect(POS_DEMO_RECIPES.every(({ variant, ingredients }) => variant === "Standard" &&
      ingredients.length > 0 && ingredients.every(({ name, quantity }) => existing.has(name) && quantity > 0))).toBe(true);
  });

  it("produces positive recipe costs below current selling prices", () => {
    const prices: Record<string, number> = {
      "Meaty Spaghetti": 259, "Salt & Pepper Fries": 99, "Midsummer Sangria": 189, "Nutella Waffle": 169,
      "Fries Overload Large": 259, "Spam & Egg": 229, Carbonara: 279, "Iced Tea": 79,
      "Fries Overload Solo": 159, "Nachos Overload Solo": 159, "Pancake Pages": 199,
      "Nutella-Almond Croffle": 189, "Pepperoni Pizza": 139, "Aglio Y Olio": 269, "She-a-Frooty": 189,
      "Hawaiian Pizza": 139, "The Other Choice": 219, "Cheese Pizza": 139, "Spicy Aglio Y Olio": 279,
      "Garlic Pepper Rice w/ Lumpia": 279, "Burnt Basque Cheesecake": 229, "Bottled Water": 50,
    };
    for (const recipe of POS_DEMO_RECIPES) {
      const cost = recipe.ingredients.reduce((total, item) => {
        const inventory = existing.get(item.name)!;
        return total + calculateIngredientCost({ recipeQuantity: item.quantity, recipeUnit: item.unit,
          inventoryUnit: inventory.unit, unitCost: inventory.unitCost });
      }, 0);
      expect(cost).toBeGreaterThan(0);
      expect(cost).toBeLessThan(prices[recipe.product]!);
    }
  });

  it("never uses the undefined historical RM-004 Ice identity", () => {
    expect(POS_DEMO_RECIPES.flatMap(({ ingredients }) => ingredients).some(({ name }) => name === "Ice")).toBe(false);
  });
});
