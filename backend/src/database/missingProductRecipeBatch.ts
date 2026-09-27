export const MISSING_PRODUCT_RECIPE_PROVENANCE = "SAMPLE / ASSUMED — FOR SYSTEM DEMONSTRATION";
export const MISSING_PRODUCT_RECIPE_EFFECTIVE_FROM = "2026-01-01";
export const MISSING_PRODUCT_RECIPE_BASELINE = { recipes: 36, recipeItems: 141 } as const;

export type MissingProductRecipe = {
  category: "Fork and Folio" | "The Stacked Stories";
  product: "Tuna Pasta" | "Clubhouse Sandwich" | "Grilled Cheese" | "Grilled Ham & Cheese" | "Tuna Sandwich";
  variant: "Standard";
  ingredients: readonly { sku: string; quantity: number; unit: "g" | "ml" | "pc" }[];
};

// These are intentionally limited to products that can be represented without
// inventing an ingredient identity that is absent from inventory_items.
export const MISSING_PRODUCT_RECIPE_BATCH: readonly MissingProductRecipe[] = [
  { category: "Fork and Folio", product: "Tuna Pasta", variant: "Standard", ingredients: [
    { sku: "ING-00003", quantity: 100, unit: "g" },
    { sku: "ING-00012", quantity: 70, unit: "g" },
    { sku: "ING-00002", quantity: 60, unit: "ml" },
    { sku: "ING-00005", quantity: 5, unit: "g" },
    { sku: "ING-00006", quantity: 2, unit: "g" },
    { sku: "ING-00007", quantity: 1, unit: "g" },
  ] },
  { category: "The Stacked Stories", product: "Clubhouse Sandwich", variant: "Standard", ingredients: [
    { sku: "ING-00008", quantity: 3, unit: "pc" },
    { sku: "ING-00011", quantity: 50, unit: "g" },
    { sku: "ING-00010", quantity: 20, unit: "g" },
    { sku: "ING-00013", quantity: 1, unit: "pc" },
    { sku: "ING-00017", quantity: 20, unit: "g" },
    { sku: "ING-00016", quantity: 30, unit: "g" },
  ] },
  { category: "The Stacked Stories", product: "Grilled Cheese", variant: "Standard", ingredients: [
    { sku: "ING-00008", quantity: 2, unit: "pc" },
    { sku: "ING-00010", quantity: 50, unit: "g" },
  ] },
  { category: "The Stacked Stories", product: "Grilled Ham & Cheese", variant: "Standard", ingredients: [
    { sku: "ING-00008", quantity: 2, unit: "pc" },
    { sku: "ING-00011", quantity: 50, unit: "g" },
    { sku: "ING-00010", quantity: 30, unit: "g" },
  ] },
  { category: "The Stacked Stories", product: "Tuna Sandwich", variant: "Standard", ingredients: [
    { sku: "ING-00008", quantity: 2, unit: "pc" },
    { sku: "ING-00012", quantity: 60, unit: "g" },
    { sku: "ING-00017", quantity: 15, unit: "g" },
    { sku: "ING-00016", quantity: 20, unit: "g" },
  ] },
] as const;
