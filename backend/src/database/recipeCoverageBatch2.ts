export const RECIPE_COVERAGE_BATCH2_PROVENANCE = "SAMPLE / ASSUMED \u2014 FOR SYSTEM DEMONSTRATION";
export const RECIPE_COVERAGE_BATCH2_EFFECTIVE_FROM = "2026-01-01";
export const RECIPE_COVERAGE_BATCH2_BASELINE = { ingredients: 60, recipes: 66, recipeItems: 263 } as const;

export const RECIPE_COVERAGE_BATCH2_EXISTING = [
  "Cheese Pizza", "Hawaiian Pizza", "Pepperoni Pizza",
] as const;

export const RECIPE_COVERAGE_BATCH2_INGREDIENTS = [
  { name: "Bangus", category: "Proteins", unit: "g", unitCost: 0.45 },
  { name: "Pork Tapa", category: "Proteins", unit: "g", unitCost: 0.55 },
  { name: "Chicken Tender", category: "Proteins", unit: "pc", unitCost: 18 },
  { name: "Sisig", category: "Proteins", unit: "g", unitCost: 0.5 },
  { name: "Pork Tocino", category: "Proteins", unit: "g", unitCost: 0.45 },
] as const;

type RecipeIngredient = { name: string; quantity: number; unit: "g" | "ml" | "pc" };
export type RecipeCoverageBatch2Entry = {
  category: "The Liter-Egg-y Feast";
  product: "Annotated Bangus" | "Breakfast Pork Tapa" | "Garlic Pepper Rice w/ Tenders" | "Sisig Rice Bowl" | "Sweet Pork Tocino";
  variant: "Standard";
  ingredients: readonly RecipeIngredient[];
};

export const RECIPE_COVERAGE_BATCH2: readonly RecipeCoverageBatch2Entry[] = [
  { category: "The Liter-Egg-y Feast", product: "Annotated Bangus", variant: "Standard", ingredients: [
    { name: "Uncooked Rice", quantity: 80, unit: "g" }, { name: "Bangus", quantity: 150, unit: "g" },
    { name: "Chicken Eggs", quantity: 1, unit: "pc" }, { name: "Cooking Oil", quantity: 10, unit: "ml" },
    { name: "Garlic", quantity: 5, unit: "g" }, { name: "Salt", quantity: 2, unit: "g" },
    { name: "Ground Black Pepper", quantity: 1, unit: "g" },
  ] },
  { category: "The Liter-Egg-y Feast", product: "Breakfast Pork Tapa", variant: "Standard", ingredients: [
    { name: "Uncooked Rice", quantity: 80, unit: "g" }, { name: "Pork Tapa", quantity: 120, unit: "g" },
    { name: "Chicken Eggs", quantity: 1, unit: "pc" }, { name: "Cooking Oil", quantity: 10, unit: "ml" },
    { name: "Garlic", quantity: 5, unit: "g" }, { name: "Salt", quantity: 1, unit: "g" },
    { name: "Ground Black Pepper", quantity: 1, unit: "g" },
  ] },
  { category: "The Liter-Egg-y Feast", product: "Garlic Pepper Rice w/ Tenders", variant: "Standard", ingredients: [
    { name: "Uncooked Rice", quantity: 80, unit: "g" }, { name: "Chicken Tender", quantity: 3, unit: "pc" },
    { name: "Cooking Oil", quantity: 10, unit: "ml" }, { name: "Garlic", quantity: 8, unit: "g" },
    { name: "Salt", quantity: 2, unit: "g" }, { name: "Ground Black Pepper", quantity: 2, unit: "g" },
  ] },
  { category: "The Liter-Egg-y Feast", product: "Sisig Rice Bowl", variant: "Standard", ingredients: [
    { name: "Uncooked Rice", quantity: 80, unit: "g" }, { name: "Sisig", quantity: 120, unit: "g" },
    { name: "Chicken Eggs", quantity: 1, unit: "pc" }, { name: "Cooking Oil", quantity: 5, unit: "ml" },
    { name: "Garlic", quantity: 5, unit: "g" }, { name: "Salt", quantity: 1, unit: "g" },
    { name: "Ground Black Pepper", quantity: 1, unit: "g" },
  ] },
  { category: "The Liter-Egg-y Feast", product: "Sweet Pork Tocino", variant: "Standard", ingredients: [
    { name: "Uncooked Rice", quantity: 80, unit: "g" }, { name: "Pork Tocino", quantity: 120, unit: "g" },
    { name: "Chicken Eggs", quantity: 1, unit: "pc" }, { name: "Cooking Oil", quantity: 10, unit: "ml" },
    { name: "Garlic", quantity: 3, unit: "g" }, { name: "Salt", quantity: 1, unit: "g" },
  ] },
] as const;
