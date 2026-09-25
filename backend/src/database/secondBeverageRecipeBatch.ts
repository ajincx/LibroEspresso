export const SAMPLE_RECIPE_BASIS = "SAMPLE / ASSUMED RECIPE QUANTITY — FOR SYSTEM DEMONSTRATION";

export type ColdCoffeeRecipeIngredient = {
  sku: string;
  quantity: number;
  unit: "g" | "ml";
};

export type ColdCoffeeRecipe = {
  category: "Cold Classics";
  product: "Americano" | "Café Latte" | "Caramel Macchiato" | "Spanish Latte";
  variant: "Small" | "Large";
  ingredients: readonly ColdCoffeeRecipeIngredient[];
};

export const SECOND_BEVERAGE_RECIPE_BATCH: readonly ColdCoffeeRecipe[] = [
  { category: "Cold Classics", product: "Americano", variant: "Small", ingredients: [
    { sku: "RM-002", quantity: 18, unit: "g" }, { sku: "RM-006", quantity: 180, unit: "ml" },
    { sku: "ING-00018", quantity: 150, unit: "g" },
  ] },
  { category: "Cold Classics", product: "Americano", variant: "Large", ingredients: [
    { sku: "RM-002", quantity: 22, unit: "g" }, { sku: "RM-006", quantity: 260, unit: "ml" },
    { sku: "ING-00018", quantity: 220, unit: "g" },
  ] },
  { category: "Cold Classics", product: "Café Latte", variant: "Small", ingredients: [
    { sku: "RM-002", quantity: 18, unit: "g" }, { sku: "RM-006", quantity: 30, unit: "ml" },
    { sku: "RM-001", quantity: 180, unit: "ml" }, { sku: "ING-00018", quantity: 150, unit: "g" },
  ] },
  { category: "Cold Classics", product: "Café Latte", variant: "Large", ingredients: [
    { sku: "RM-002", quantity: 22, unit: "g" }, { sku: "RM-006", quantity: 40, unit: "ml" },
    { sku: "RM-001", quantity: 240, unit: "ml" }, { sku: "ING-00018", quantity: 220, unit: "g" },
  ] },
  { category: "Cold Classics", product: "Caramel Macchiato", variant: "Small", ingredients: [
    { sku: "RM-002", quantity: 18, unit: "g" }, { sku: "RM-006", quantity: 30, unit: "ml" },
    { sku: "RM-001", quantity: 180, unit: "ml" }, { sku: "RM-005", quantity: 15, unit: "ml" },
    { sku: "ING-00018", quantity: 150, unit: "g" },
  ] },
  { category: "Cold Classics", product: "Caramel Macchiato", variant: "Large", ingredients: [
    { sku: "RM-002", quantity: 22, unit: "g" }, { sku: "RM-006", quantity: 40, unit: "ml" },
    { sku: "RM-001", quantity: 240, unit: "ml" }, { sku: "RM-005", quantity: 20, unit: "ml" },
    { sku: "ING-00018", quantity: 220, unit: "g" },
  ] },
  { category: "Cold Classics", product: "Spanish Latte", variant: "Small", ingredients: [
    { sku: "RM-002", quantity: 18, unit: "g" }, { sku: "RM-006", quantity: 30, unit: "ml" },
    { sku: "RM-001", quantity: 150, unit: "ml" }, { sku: "RM-003", quantity: 30, unit: "ml" },
    { sku: "ING-00018", quantity: 150, unit: "g" },
  ] },
  { category: "Cold Classics", product: "Spanish Latte", variant: "Large", ingredients: [
    { sku: "RM-002", quantity: 22, unit: "g" }, { sku: "RM-006", quantity: 40, unit: "ml" },
    { sku: "RM-001", quantity: 210, unit: "ml" }, { sku: "RM-003", quantity: 40, unit: "ml" },
    { sku: "ING-00018", quantity: 220, unit: "g" },
  ] },
] as const;
