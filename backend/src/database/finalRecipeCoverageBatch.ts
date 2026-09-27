export const FINAL_RECIPE_COVERAGE_PROVENANCE = "SAMPLE / ASSUMED \u2014 FOR SYSTEM DEMONSTRATION";
export const FINAL_RECIPE_COVERAGE_EFFECTIVE_FROM = "2026-01-01";
export const FINAL_RECIPE_COVERAGE_BASELINE = { ingredients: 65, recipes: 74, recipeItems: 316 } as const;

export const FINAL_RECIPE_INGREDIENTS = [
  { name: "Asian Noodles", category: "Pasta & Noodles", unit: "g", unitCost: 0.18 },
  { name: "Soy Sauce", category: "Sauces", unit: "ml", unitCost: 0.08 },
  { name: "Mixed Vegetables", category: "Produce", unit: "g", unitCost: 0.2 },
  { name: "Lasagna Sheets", category: "Pasta & Noodles", unit: "g", unitCost: 0.22 },
  { name: "Cream Cheese", category: "Dairy", unit: "g", unitCost: 0.55 },
  { name: "Rice Flour", category: "Dry Goods", unit: "g", unitCost: 0.1 },
  { name: "Blueberry Filling", category: "Toppings", unit: "g", unitCost: 0.4 },
  { name: "Cheesecake Crust Base", category: "Bakery", unit: "g", unitCost: 0.2 },
  { name: "Coconut Milk", category: "Dairy", unit: "ml", unitCost: 0.15 },
  { name: "Ground Cinnamon", category: "Seasonings", unit: "g", unitCost: 0.9 },
  { name: "Butterscotch Syrup", category: "Syrups", unit: "ml", unitCost: 0.35 },
  { name: "Cold Foam Base", category: "Dairy", unit: "ml", unitCost: 0.25 },
] as const;

type RecipeIngredient = { name: string; quantity: number; unit: "g" | "ml" | "pc" };
export type FinalRecipeCoverageEntry = {
  category: "Fork and Folio" | "Sweet Endings" | "The Anthology" | "Warm Tales";
  product: "Asian Noodles" | "Lasagna" | "Bibingka Cheesecake" | "Blueberry Cheesecake" |
    "Dairy Dose of Coco" | "Libro Mood Mover" | "Morpheus Pond";
  variant: "Standard";
  ingredients: readonly RecipeIngredient[];
};

export const FINAL_RECIPE_COVERAGE_BATCH: readonly FinalRecipeCoverageEntry[] = [
  { category: "Fork and Folio", product: "Asian Noodles", variant: "Standard", ingredients: [
    { name: "Asian Noodles", quantity: 120, unit: "g" }, { name: "Cooking Oil", quantity: 10, unit: "ml" },
    { name: "Garlic", quantity: 5, unit: "g" }, { name: "Soy Sauce", quantity: 20, unit: "ml" },
    { name: "Mixed Vegetables", quantity: 50, unit: "g" }, { name: "Chicken Tender", quantity: 1, unit: "pc" },
  ] },
  { category: "Fork and Folio", product: "Lasagna", variant: "Standard", ingredients: [
    { name: "Lasagna Sheets", quantity: 100, unit: "g" }, { name: "Ground Beef", quantity: 80, unit: "g" },
    { name: "Tomato Sauce", quantity: 100, unit: "ml" }, { name: "Mozzarella Cheese", quantity: 50, unit: "g" },
    { name: "Cheddar Cheese", quantity: 20, unit: "g" }, { name: "Whipping Cream", quantity: 30, unit: "ml" },
    { name: "Garlic", quantity: 5, unit: "g" },
  ] },
  { category: "Sweet Endings", product: "Bibingka Cheesecake", variant: "Standard", ingredients: [
    { name: "Cream Cheese", quantity: 80, unit: "g" }, { name: "Whole Milk", quantity: 80, unit: "ml" },
    { name: "Chicken Eggs", quantity: 1, unit: "pc" }, { name: "Granulated Sugar", quantity: 30, unit: "g" },
    { name: "Butter", quantity: 10, unit: "g" }, { name: "Rice Flour", quantity: 60, unit: "g" },
  ] },
  { category: "Sweet Endings", product: "Blueberry Cheesecake", variant: "Standard", ingredients: [
    { name: "Cream Cheese", quantity: 100, unit: "g" }, { name: "Blueberry Filling", quantity: 40, unit: "g" },
    { name: "Butter", quantity: 10, unit: "g" }, { name: "Granulated Sugar", quantity: 20, unit: "g" },
    { name: "Cheesecake Crust Base", quantity: 60, unit: "g" },
  ] },
  { category: "The Anthology", product: "Dairy Dose of Coco", variant: "Standard", ingredients: [
    { name: "Espresso Blend Beans", quantity: 18, unit: "g" }, { name: "Coconut Milk", quantity: 150, unit: "ml" },
    { name: "Whole Milk", quantity: 50, unit: "ml" }, { name: "Condensed Milk", quantity: 20, unit: "ml" },
    { name: "Ground Cinnamon", quantity: 1, unit: "g" }, { name: "Ice — By Weight", quantity: 150, unit: "g" },
  ] },
  { category: "The Anthology", product: "Libro Mood Mover", variant: "Standard", ingredients: [
    { name: "Espresso Blend Beans", quantity: 18, unit: "g" }, { name: "Whole Milk", quantity: 180, unit: "ml" },
    { name: "Butterscotch Syrup", quantity: 20, unit: "ml" }, { name: "Condensed Milk", quantity: 15, unit: "ml" },
    { name: "Cold Foam Base", quantity: 40, unit: "ml" }, { name: "Ice — By Weight", quantity: 150, unit: "g" },
  ] },
  { category: "Warm Tales", product: "Morpheus Pond", variant: "Standard", ingredients: [
    { name: "Black Tea Bag", quantity: 1, unit: "pc" }, { name: "Granulated Sugar", quantity: 15, unit: "g" },
    { name: "Filtered Water", quantity: 250, unit: "ml" }, { name: "Ice — By Weight", quantity: 150, unit: "g" },
    { name: "Strawberry Syrup", quantity: 10, unit: "ml" },
  ] },
] as const;
