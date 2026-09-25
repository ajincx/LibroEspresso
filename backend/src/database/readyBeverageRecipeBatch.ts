export const READY_BEVERAGE_PROVENANCE = "SAMPLE / ASSUMED — FOR SYSTEM DEMONSTRATION";
export const READY_BEVERAGE_BASELINE = { recipes: 32, recipeItems: 133 } as const;

export type ReadyBeverageRecipe = {
  category: "Warm Tales";
  product: "Barako Brew" | "Pure Chamomile" | "Pure Jasmine" | "Pure Lavender";
  variant: "Standard";
  ingredients: readonly { sku: string; quantity: number; unit: "g" | "ml" | "pc" }[];
};

export const READY_BEVERAGE_RECIPE_BATCH: readonly ReadyBeverageRecipe[] = [
  { category: "Warm Tales", product: "Barako Brew", variant: "Standard", ingredients: [
    { sku: "ING-00019", quantity: 18, unit: "g" },
    { sku: "RM-006", quantity: 240, unit: "ml" },
  ] },
  { category: "Warm Tales", product: "Pure Chamomile", variant: "Standard", ingredients: [
    { sku: "ING-00022", quantity: 1, unit: "pc" },
    { sku: "RM-006", quantity: 250, unit: "ml" },
  ] },
  { category: "Warm Tales", product: "Pure Jasmine", variant: "Standard", ingredients: [
    { sku: "ING-00023", quantity: 1, unit: "pc" },
    { sku: "RM-006", quantity: 250, unit: "ml" },
  ] },
  { category: "Warm Tales", product: "Pure Lavender", variant: "Standard", ingredients: [
    { sku: "ING-00024", quantity: 1, unit: "pc" },
    { sku: "RM-006", quantity: 250, unit: "ml" },
  ] },
] as const;
