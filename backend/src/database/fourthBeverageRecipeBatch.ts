export const BATCH_FOUR_PROVENANCE = "SAMPLE / ASSUMED — FOR SYSTEM DEMONSTRATION";
export const BATCH_FOUR_EXPECTED_BASELINE = { recipes: 21, recipeItems: 82 } as const;

export type FourthBatchIngredient = { sku: string; quantity: number; unit: "g" | "ml" | "pc" };
export type FourthBatchRecipe = {
  category: "Cold Classics" | "Chilled Chapter";
  product: "Salted Caramel Latte" | "Green Apple Soda" | "Strawberry Cream" | "Chocolate Java Chip" | "Crushed Oreo" | "Salted Caramel";
  variant: "Standard" | "Small" | "Large";
  ingredients: readonly FourthBatchIngredient[];
};

export const FOURTH_BEVERAGE_RECIPE_BATCH: readonly FourthBatchRecipe[] = [
  { category: "Cold Classics", product: "Salted Caramel Latte", variant: "Small", ingredients: [
    { sku: "RM-002", quantity: 18, unit: "g" }, { sku: "RM-006", quantity: 30, unit: "ml" },
    { sku: "RM-001", quantity: 180, unit: "ml" }, { sku: "RM-005", quantity: 15, unit: "ml" },
    { sku: "ING-00006", quantity: 0.5, unit: "g" }, { sku: "ING-00018", quantity: 150, unit: "g" },
  ] },
  { category: "Cold Classics", product: "Salted Caramel Latte", variant: "Large", ingredients: [
    { sku: "RM-002", quantity: 22, unit: "g" }, { sku: "RM-006", quantity: 40, unit: "ml" },
    { sku: "RM-001", quantity: 240, unit: "ml" }, { sku: "RM-005", quantity: 20, unit: "ml" },
    { sku: "ING-00006", quantity: 0.75, unit: "g" }, { sku: "ING-00018", quantity: 220, unit: "g" },
  ] },
  { category: "Cold Classics", product: "Green Apple Soda", variant: "Standard", ingredients: [
    { sku: "ING-00026", quantity: 20, unit: "ml" }, { sku: "ING-00027", quantity: 250, unit: "ml" },
    { sku: "ING-00018", quantity: 180, unit: "g" },
  ] },
  { category: "Chilled Chapter", product: "Strawberry Cream", variant: "Small", ingredients: [
    { sku: "ING-00030", quantity: 20, unit: "ml" }, { sku: "RM-001", quantity: 160, unit: "ml" },
    { sku: "ING-00002", quantity: 20, unit: "ml" }, { sku: "ING-00018", quantity: 180, unit: "g" },
  ] },
  { category: "Chilled Chapter", product: "Strawberry Cream", variant: "Large", ingredients: [
    { sku: "ING-00030", quantity: 30, unit: "ml" }, { sku: "RM-001", quantity: 220, unit: "ml" },
    { sku: "ING-00002", quantity: 30, unit: "ml" }, { sku: "ING-00018", quantity: 250, unit: "g" },
  ] },
  { category: "Chilled Chapter", product: "Chocolate Java Chip", variant: "Small", ingredients: [
    { sku: "ING-00020", quantity: 25, unit: "g" }, { sku: "ING-00028", quantity: 15, unit: "g" },
    { sku: "RM-001", quantity: 160, unit: "ml" }, { sku: "ING-00002", quantity: 20, unit: "ml" },
    { sku: "ING-00018", quantity: 180, unit: "g" },
  ] },
  { category: "Chilled Chapter", product: "Chocolate Java Chip", variant: "Large", ingredients: [
    { sku: "ING-00020", quantity: 35, unit: "g" }, { sku: "ING-00028", quantity: 20, unit: "g" },
    { sku: "RM-001", quantity: 220, unit: "ml" }, { sku: "ING-00002", quantity: 30, unit: "ml" },
    { sku: "ING-00018", quantity: 250, unit: "g" },
  ] },
  { category: "Chilled Chapter", product: "Crushed Oreo", variant: "Small", ingredients: [
    { sku: "ING-00029", quantity: 2, unit: "pc" }, { sku: "RM-001", quantity: 170, unit: "ml" },
    { sku: "ING-00002", quantity: 20, unit: "ml" }, { sku: "ING-00018", quantity: 180, unit: "g" },
  ] },
  { category: "Chilled Chapter", product: "Crushed Oreo", variant: "Large", ingredients: [
    { sku: "ING-00029", quantity: 3, unit: "pc" }, { sku: "RM-001", quantity: 230, unit: "ml" },
    { sku: "ING-00002", quantity: 30, unit: "ml" }, { sku: "ING-00018", quantity: 250, unit: "g" },
  ] },
  { category: "Chilled Chapter", product: "Salted Caramel", variant: "Small", ingredients: [
    { sku: "RM-005", quantity: 20, unit: "ml" }, { sku: "ING-00006", quantity: 0.5, unit: "g" },
    { sku: "RM-001", quantity: 160, unit: "ml" }, { sku: "ING-00002", quantity: 20, unit: "ml" },
    { sku: "ING-00018", quantity: 180, unit: "g" },
  ] },
  { category: "Chilled Chapter", product: "Salted Caramel", variant: "Large", ingredients: [
    { sku: "RM-005", quantity: 30, unit: "ml" }, { sku: "ING-00006", quantity: 0.75, unit: "g" },
    { sku: "RM-001", quantity: 220, unit: "ml" }, { sku: "ING-00002", quantity: 30, unit: "ml" },
    { sku: "ING-00018", quantity: 250, unit: "g" },
  ] },
] as const;
