export const POS_DEMO_PROVENANCE = "SAMPLE / ASSUMED — FOR SYSTEM DEMONSTRATION";
export const POS_DEMO_EFFECTIVE_FROM = "2026-01-01";
export const POS_DEMO_BASELINE = { ingredients: 36, recipes: 41, recipeItems: 162 } as const;

export type DemoIngredient = {
  name: string;
  category: string;
  unit: "g" | "ml" | "pc";
  unitCost: string;
};

export const POS_DEMO_INGREDIENTS: readonly DemoIngredient[] = [
  { name: "Frozen French Fries", category: "Frozen Foods", unit: "g", unitCost: "0.1800" },
  { name: "Cooking Oil", category: "Cooking Supplies", unit: "ml", unitCost: "0.1200" },
  { name: "Cheese Sauce", category: "Sauces", unit: "ml", unitCost: "0.3500" },
  { name: "Ground Beef", category: "Proteins", unit: "g", unitCost: "0.5500" },
  { name: "Tomato Sauce", category: "Sauces", unit: "ml", unitCost: "0.1800" },
  { name: "Bacon", category: "Proteins", unit: "g", unitCost: "0.7000" },
  { name: "Pizza Dough Base", category: "Bakery", unit: "pc", unitCost: "35.0000" },
  { name: "Pizza Sauce", category: "Sauces", unit: "ml", unitCost: "0.1800" },
  { name: "Mozzarella Cheese", category: "Dairy", unit: "g", unitCost: "0.6500" },
  { name: "Pineapple Pieces", category: "Produce", unit: "g", unitCost: "0.1500" },
  { name: "Pepperoni", category: "Proteins", unit: "g", unitCost: "0.7500" },
  { name: "Tortilla Chips", category: "Snacks", unit: "g", unitCost: "0.3000" },
  { name: "Canned Luncheon Meat", category: "Proteins", unit: "g", unitCost: "0.5500" },
  { name: "Black Tea Bag", category: "Tea", unit: "pc", unitCost: "6.0000" },
  { name: "Waffle Base", category: "Bakery", unit: "pc", unitCost: "25.0000" },
  { name: "Croffle Base", category: "Bakery", unit: "pc", unitCost: "30.0000" },
  { name: "Sliced Almonds", category: "Toppings", unit: "g", unitCost: "0.7500" },
  { name: "Pancake Mix", category: "Dry Goods", unit: "g", unitCost: "0.1800" },
  { name: "Maple Syrup", category: "Syrups", unit: "ml", unitCost: "0.4000" },
  { name: "Butter", category: "Dairy", unit: "g", unitCost: "0.4500" },
  { name: "Chili Flakes", category: "Seasonings", unit: "g", unitCost: "0.8000" },
  { name: "Frozen Lumpia", category: "Frozen Foods", unit: "pc", unitCost: "10.0000" },
  { name: "Bottled Water", category: "Finished Goods", unit: "pc", unitCost: "20.0000" },
  { name: "Purchased Burnt Basque Cheesecake Slice", category: "Finished Goods", unit: "pc", unitCost: "85.0000" },
] as const;

type RecipeIngredient = { name: string; quantity: number; unit: "g" | "ml" | "pc" };
export type PosDemoRecipe = {
  category: string;
  product: string;
  variant: "Standard";
  ingredients: readonly RecipeIngredient[];
};

const ingredient = (name: string, quantity: number, unit: RecipeIngredient["unit"]): RecipeIngredient => ({ name, quantity, unit });

export const POS_DEMO_RECIPES: readonly PosDemoRecipe[] = [
  { category: "Fork and Folio", product: "Meaty Spaghetti", variant: "Standard", ingredients: [
    ingredient("Dry Spaghetti", 100, "g"), ingredient("Tomato Sauce", 100, "ml"), ingredient("Ground Beef", 70, "g"),
    ingredient("Cheddar Cheese", 15, "g"), ingredient("Garlic", 5, "g"),
  ] },
  { category: "Book Bites", product: "Salt & Pepper Fries", variant: "Standard", ingredients: [
    ingredient("Frozen French Fries", 180, "g"), ingredient("Cooking Oil", 10, "ml"), ingredient("Salt", 2, "g"), ingredient("Ground Black Pepper", 1, "g"),
  ] },
  { category: "Cold Classics", product: "Midsummer Sangria", variant: "Standard", ingredients: [
    ingredient("Strawberry Syrup", 20, "ml"), ingredient("Green Apple Syrup", 15, "ml"), ingredient("Carbonated Water", 250, "ml"), ingredient("Ice — By Weight", 150, "g"),
  ] },
  { category: "Sweet Endings", product: "Nutella Waffle", variant: "Standard", ingredients: [
    ingredient("Waffle Base", 1, "pc"), ingredient("Nutella Hazelnut Spread", 35, "g"),
  ] },
  { category: "Book Bites", product: "Fries Overload Large", variant: "Standard", ingredients: [
    ingredient("Frozen French Fries", 350, "g"), ingredient("Cooking Oil", 18, "ml"), ingredient("Cheese Sauce", 70, "ml"), ingredient("Ground Beef", 70, "g"),
  ] },
  { category: "The Liter-Egg-y Feast", product: "Spam & Egg", variant: "Standard", ingredients: [
    ingredient("Uncooked Rice", 80, "g"), ingredient("Canned Luncheon Meat", 80, "g"), ingredient("Chicken Eggs", 1, "pc"),
    ingredient("Cooking Oil", 5, "ml"), ingredient("Salt", 1, "g"),
  ] },
  { category: "Fork and Folio", product: "Carbonara", variant: "Standard", ingredients: [
    ingredient("Dry Spaghetti", 100, "g"), ingredient("Whipping Cream", 80, "ml"), ingredient("Bacon", 40, "g"),
    ingredient("Cheddar Cheese", 20, "g"), ingredient("Garlic", 5, "g"), ingredient("Ground Black Pepper", 1, "g"),
  ] },
  { category: "Cold Classics", product: "Iced Tea", variant: "Standard", ingredients: [
    ingredient("Black Tea Bag", 1, "pc"), ingredient("Filtered Water", 300, "ml"), ingredient("Granulated Sugar", 20, "g"), ingredient("Ice — By Weight", 150, "g"),
  ] },
  { category: "Book Bites", product: "Fries Overload Solo", variant: "Standard", ingredients: [
    ingredient("Frozen French Fries", 220, "g"), ingredient("Cooking Oil", 12, "ml"), ingredient("Cheese Sauce", 40, "ml"), ingredient("Ground Beef", 40, "g"),
  ] },
  { category: "Book Bites", product: "Nachos Overload Solo", variant: "Standard", ingredients: [
    ingredient("Tortilla Chips", 120, "g"), ingredient("Cheese Sauce", 50, "ml"), ingredient("Ground Beef", 50, "g"), ingredient("Tomatoes", 20, "g"),
  ] },
  { category: "Sweet Endings", product: "Pancake Pages", variant: "Standard", ingredients: [
    ingredient("Pancake Mix", 120, "g"), ingredient("Whole Milk", 100, "ml"), ingredient("Chicken Eggs", 1, "pc"),
    ingredient("Maple Syrup", 30, "ml"), ingredient("Butter", 10, "g"),
  ] },
  { category: "Sweet Endings", product: "Nutella-Almond Croffle", variant: "Standard", ingredients: [
    ingredient("Croffle Base", 1, "pc"), ingredient("Nutella Hazelnut Spread", 30, "g"), ingredient("Sliced Almonds", 12, "g"),
  ] },
  { category: "Oven Edition", product: "Pepperoni Pizza", variant: "Standard", ingredients: [
    ingredient("Pizza Dough Base", 1, "pc"), ingredient("Pizza Sauce", 60, "ml"), ingredient("Mozzarella Cheese", 80, "g"), ingredient("Pepperoni", 50, "g"),
  ] },
  { category: "Fork and Folio", product: "Aglio Y Olio", variant: "Standard", ingredients: [
    ingredient("Dry Spaghetti", 100, "g"), ingredient("Cooking Oil", 25, "ml"), ingredient("Garlic", 10, "g"),
    ingredient("Salt", 2, "g"), ingredient("Ground Black Pepper", 1, "g"),
  ] },
  { category: "Cold Classics", product: "She-a-Frooty", variant: "Standard", ingredients: [
    ingredient("Strawberry Syrup", 25, "ml"), ingredient("Whole Milk", 200, "ml"), ingredient("Whipping Cream", 20, "ml"),
    ingredient("Granulated Sugar", 10, "g"), ingredient("Ice — By Weight", 150, "g"),
  ] },
  { category: "Oven Edition", product: "Hawaiian Pizza", variant: "Standard", ingredients: [
    ingredient("Pizza Dough Base", 1, "pc"), ingredient("Pizza Sauce", 60, "ml"), ingredient("Mozzarella Cheese", 80, "g"),
    ingredient("Sliced Ham", 50, "g"), ingredient("Pineapple Pieces", 40, "g"),
  ] },
  { category: "The Anthology", product: "The Other Choice", variant: "Standard", ingredients: [
    ingredient("Espresso Blend Beans", 18, "g"), ingredient("Whole Milk", 180, "ml"), ingredient("Caramel Syrup", 15, "ml"),
    ingredient("Condensed Milk", 20, "ml"), ingredient("Ice — By Weight", 150, "g"),
  ] },
  { category: "Oven Edition", product: "Cheese Pizza", variant: "Standard", ingredients: [
    ingredient("Pizza Dough Base", 1, "pc"), ingredient("Pizza Sauce", 60, "ml"), ingredient("Mozzarella Cheese", 100, "g"),
  ] },
  { category: "Fork and Folio", product: "Spicy Aglio Y Olio", variant: "Standard", ingredients: [
    ingredient("Dry Spaghetti", 100, "g"), ingredient("Cooking Oil", 25, "ml"), ingredient("Garlic", 10, "g"),
    ingredient("Salt", 2, "g"), ingredient("Ground Black Pepper", 1, "g"), ingredient("Chili Flakes", 2, "g"),
  ] },
  { category: "The Liter-Egg-y Feast", product: "Garlic Pepper Rice w/ Lumpia", variant: "Standard", ingredients: [
    ingredient("Uncooked Rice", 80, "g"), ingredient("Garlic", 8, "g"), ingredient("Ground Black Pepper", 2, "g"),
    ingredient("Salt", 2, "g"), ingredient("Cooking Oil", 10, "ml"), ingredient("Frozen Lumpia", 4, "pc"),
  ] },
  { category: "Sweet Endings", product: "Burnt Basque Cheesecake", variant: "Standard", ingredients: [
    ingredient("Purchased Burnt Basque Cheesecake Slice", 1, "pc"),
  ] },
  { category: "Cold Classics", product: "Bottled Water", variant: "Standard", ingredients: [
    ingredient("Bottled Water", 1, "pc"),
  ] },
] as const;
