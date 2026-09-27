export const RECIPE_COVERAGE_BATCH3_PROVENANCE = "SAMPLE / ASSUMED \u2014 FOR SYSTEM DEMONSTRATION";
export const RECIPE_COVERAGE_BATCH3_EFFECTIVE_FROM = "2026-01-01";
export const RECIPE_COVERAGE_BATCH3_BASELINE = { ingredients: 65, recipes: 71, recipeItems: 296 } as const;

type RecipeIngredient = { name: string; quantity: number; unit: "g" | "ml" | "pc" };
export type RecipeCoverageBatch3Entry = {
  category: "The Stacked Stories";
  product: "Bacon Best Seller" | "Cheddar Chapter Cheeseburger" | "TLC Tender Chapter";
  variant: "Standard";
  ingredients: readonly RecipeIngredient[];
};

export const RECIPE_COVERAGE_BATCH3: readonly RecipeCoverageBatch3Entry[] = [
  { category: "The Stacked Stories", product: "Bacon Best Seller", variant: "Standard", ingredients: [
    { name: "Sandwich Bread Slices", quantity: 3, unit: "pc" },
    { name: "Bacon", quantity: 60, unit: "g" },
    { name: "Cheddar Cheese", quantity: 20, unit: "g" },
    { name: "Chicken Eggs", quantity: 1, unit: "pc" },
    { name: "Lettuce", quantity: 20, unit: "g" },
    { name: "Tomatoes", quantity: 30, unit: "g" },
    { name: "Butter", quantity: 10, unit: "g" },
  ] },
  { category: "The Stacked Stories", product: "Cheddar Chapter Cheeseburger", variant: "Standard", ingredients: [
    { name: "Burger Bun", quantity: 1, unit: "pc" },
    { name: "Ground Beef", quantity: 120, unit: "g" },
    { name: "Cheddar Cheese", quantity: 25, unit: "g" },
    { name: "Lettuce", quantity: 15, unit: "g" },
    { name: "Tomatoes", quantity: 25, unit: "g" },
    { name: "Cooking Oil", quantity: 5, unit: "ml" },
    { name: "Butter", quantity: 5, unit: "g" },
  ] },
  { category: "The Stacked Stories", product: "TLC Tender Chapter", variant: "Standard", ingredients: [
    { name: "Burger Bun", quantity: 1, unit: "pc" },
    { name: "Chicken Tender", quantity: 3, unit: "pc" },
    { name: "Lettuce", quantity: 20, unit: "g" },
    { name: "Tomatoes", quantity: 30, unit: "g" },
    { name: "Cheddar Cheese", quantity: 20, unit: "g" },
    { name: "Cooking Oil", quantity: 10, unit: "ml" },
  ] },
] as const;
