export const RECIPE_COVERAGE_BATCH1_PROVENANCE = "SAMPLE / ASSUMED \u2014 FOR SYSTEM DEMONSTRATION";
export const RECIPE_COVERAGE_BATCH1_EFFECTIVE_FROM = "2026-01-01";
export const RECIPE_COVERAGE_BATCH1_BASELINE = { recipes: 63, recipeItems: 253 } as const;

type RecipeIngredient = {
  sku: string;
  name: string;
  quantity: number;
  unit: "g" | "ml" | "pc";
};

export type RecipeCoverageBatch1Entry = {
  category: "Book Bites" | "Sweet Endings";
  product: "Nachos Overload Large" | "Biscoff Croffle" | "Maple & Butter Waffle";
  variant: "Standard";
  ingredients: readonly RecipeIngredient[];
};

export const RECIPE_COVERAGE_BATCH1: readonly RecipeCoverageBatch1Entry[] = [
  {
    category: "Book Bites",
    product: "Nachos Overload Large",
    variant: "Standard",
    ingredients: [
      { sku: "ING-00042", name: "Tortilla Chips", quantity: 200, unit: "g" },
      { sku: "ING-00033", name: "Cheese Sauce", quantity: 80, unit: "ml" },
      { sku: "ING-00034", name: "Ground Beef", quantity: 80, unit: "g" },
      { sku: "ING-00016", name: "Tomatoes", quantity: 30, unit: "g" },
    ],
  },
  {
    category: "Sweet Endings",
    product: "Biscoff Croffle",
    variant: "Standard",
    ingredients: [
      { sku: "ING-00046", name: "Croffle Base", quantity: 1, unit: "pc" },
      { sku: "ING-00015", name: "Biscoff Spread", quantity: 30, unit: "g" },
      { sku: "ING-00002", name: "Whipping Cream", quantity: 20, unit: "ml" },
    ],
  },
  {
    category: "Sweet Endings",
    product: "Maple & Butter Waffle",
    variant: "Standard",
    ingredients: [
      { sku: "ING-00045", name: "Waffle Base", quantity: 1, unit: "pc" },
      { sku: "ING-00049", name: "Maple Syrup", quantity: 30, unit: "ml" },
      { sku: "ING-00050", name: "Butter", quantity: 10, unit: "g" },
    ],
  },
] as const;
