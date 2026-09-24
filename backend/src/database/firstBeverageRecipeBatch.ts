export const SAMPLE_RECIPE_BASIS = "SAMPLE / ASSUMED RECIPE QUANTITY — FOR SYSTEM DEMONSTRATION";

export type SampleRecipeIngredient = {
  sku: string;
  quantity: number;
  unit: "g" | "kg" | "ml" | "L" | "pc";
};

export type SampleBeverageRecipe = {
  category: "Warm Tales";
  product: string;
  variant: "Standard";
  ingredients: readonly SampleRecipeIngredient[];
};

// These quantities are capstone demonstration values, not Libro Espresso recipes.
// Cold Small/Large drinks are intentionally excluded until the inventory basis for
// Ice is defined; no recipe below omits a known required ingredient to force eligibility.
export const FIRST_BEVERAGE_RECIPE_BATCH: readonly SampleBeverageRecipe[] = [
  {
    category: "Warm Tales",
    product: "Americano",
    variant: "Standard",
    ingredients: [
      { sku: "RM-002", quantity: 18, unit: "g" },
      { sku: "RM-006", quantity: 240, unit: "ml" },
    ],
  },
  {
    category: "Warm Tales",
    product: "Café Latte",
    variant: "Standard",
    ingredients: [
      { sku: "RM-002", quantity: 18, unit: "g" },
      { sku: "RM-006", quantity: 30, unit: "ml" },
      { sku: "RM-001", quantity: 180, unit: "ml" },
    ],
  },
  {
    category: "Warm Tales",
    product: "Cappuccino",
    variant: "Standard",
    ingredients: [
      { sku: "RM-002", quantity: 18, unit: "g" },
      { sku: "RM-006", quantity: 30, unit: "ml" },
      { sku: "RM-001", quantity: 150, unit: "ml" },
    ],
  },
  {
    category: "Warm Tales",
    product: "Caramel Macchiato",
    variant: "Standard",
    ingredients: [
      { sku: "RM-002", quantity: 18, unit: "g" },
      { sku: "RM-006", quantity: 30, unit: "ml" },
      { sku: "RM-001", quantity: 180, unit: "ml" },
      { sku: "RM-005", quantity: 15, unit: "ml" },
    ],
  },
  {
    category: "Warm Tales",
    product: "Spanish Latte",
    variant: "Standard",
    ingredients: [
      { sku: "RM-002", quantity: 18, unit: "g" },
      { sku: "RM-006", quantity: 30, unit: "ml" },
      { sku: "RM-001", quantity: 150, unit: "ml" },
      { sku: "RM-003", quantity: 30, unit: "ml" },
    ],
  },
] as const;
