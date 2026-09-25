export const THIRD_BATCH_RECIPE_BASIS = "SAMPLE / ASSUMED RECIPE QUANTITY — FOR SYSTEM DEMONSTRATION";

export type ThirdBatchIngredient = { sku: string; quantity: number; unit: "g" | "ml" };
export type ThirdBatchRecipe = {
  category: "Warm Tales" | "Cold Classics";
  product: "Chocolate" | "Matcha Latte" | "White Mocha Latte";
  variant: "Standard" | "Small" | "Large";
  ingredients: readonly ThirdBatchIngredient[];
};

export const THIRD_BEVERAGE_RECIPE_BATCH: readonly ThirdBatchRecipe[] = [
  { category: "Warm Tales", product: "Chocolate", variant: "Standard", ingredients: [
    { sku: "ING-00020", quantity: 25, unit: "g" }, { sku: "RM-001", quantity: 200, unit: "ml" },
    { sku: "ING-00001", quantity: 10, unit: "g" },
  ] },
  { category: "Cold Classics", product: "Chocolate", variant: "Small", ingredients: [
    { sku: "ING-00020", quantity: 25, unit: "g" }, { sku: "RM-001", quantity: 180, unit: "ml" },
    { sku: "ING-00001", quantity: 10, unit: "g" }, { sku: "ING-00018", quantity: 150, unit: "g" },
  ] },
  { category: "Cold Classics", product: "Chocolate", variant: "Large", ingredients: [
    { sku: "ING-00020", quantity: 35, unit: "g" }, { sku: "RM-001", quantity: 240, unit: "ml" },
    { sku: "ING-00001", quantity: 15, unit: "g" }, { sku: "ING-00018", quantity: 220, unit: "g" },
  ] },
  { category: "Warm Tales", product: "Matcha Latte", variant: "Standard", ingredients: [
    { sku: "ING-00021", quantity: 5, unit: "g" }, { sku: "RM-001", quantity: 200, unit: "ml" },
    { sku: "ING-00001", quantity: 10, unit: "g" },
  ] },
  { category: "Cold Classics", product: "Matcha Latte", variant: "Small", ingredients: [
    { sku: "ING-00021", quantity: 5, unit: "g" }, { sku: "RM-001", quantity: 180, unit: "ml" },
    { sku: "ING-00001", quantity: 10, unit: "g" }, { sku: "ING-00018", quantity: 150, unit: "g" },
  ] },
  { category: "Cold Classics", product: "Matcha Latte", variant: "Large", ingredients: [
    { sku: "ING-00021", quantity: 7, unit: "g" }, { sku: "RM-001", quantity: 240, unit: "ml" },
    { sku: "ING-00001", quantity: 15, unit: "g" }, { sku: "ING-00018", quantity: 220, unit: "g" },
  ] },
  { category: "Cold Classics", product: "White Mocha Latte", variant: "Small", ingredients: [
    { sku: "RM-002", quantity: 18, unit: "g" }, { sku: "RM-006", quantity: 30, unit: "ml" },
    { sku: "RM-001", quantity: 180, unit: "ml" }, { sku: "ING-00025", quantity: 15, unit: "ml" },
    { sku: "ING-00018", quantity: 150, unit: "g" },
  ] },
  { category: "Cold Classics", product: "White Mocha Latte", variant: "Large", ingredients: [
    { sku: "RM-002", quantity: 22, unit: "g" }, { sku: "RM-006", quantity: 40, unit: "ml" },
    { sku: "RM-001", quantity: 240, unit: "ml" }, { sku: "ING-00025", quantity: 20, unit: "ml" },
    { sku: "ING-00018", quantity: 220, unit: "g" },
  ] },
] as const;
