export const GROUP_A_PROVENANCE = "SAMPLE / ASSUMED — FOR SYSTEM DEMONSTRATION";

export type GroupABeverageIngredient = {
  name: string;
  category: string;
  unit: "g" | "kg" | "ml" | "L" | "pc";
  unitCost: string;
};

export const GROUP_A_BEVERAGE_INGREDIENTS: readonly GroupABeverageIngredient[] = [
  { name: "Ice — By Weight", category: "Supplies", unit: "g", unitCost: "0.0100" },
  { name: "Barako Coffee Beans", category: "Coffee", unit: "g", unitCost: "0.6500" },
  { name: "Chocolate Beverage Powder", category: "Beverage Base", unit: "g", unitCost: "0.5000" },
  { name: "Matcha Powder", category: "Beverage Base", unit: "g", unitCost: "2.5000" },
  { name: "Chamomile Tea Bag", category: "Tea", unit: "pc", unitCost: "8.0000" },
  { name: "Jasmine Tea Bag", category: "Tea", unit: "pc", unitCost: "8.0000" },
  { name: "Lavender Tea Bag", category: "Tea", unit: "pc", unitCost: "8.0000" },
  { name: "White Chocolate Sauce", category: "Syrups & Sauces", unit: "ml", unitCost: "0.4500" },
  { name: "Green Apple Syrup", category: "Syrups", unit: "ml", unitCost: "0.2500" },
  { name: "Carbonated Water", category: "Beverage Base", unit: "ml", unitCost: "0.0600" },
  { name: "Java Chips", category: "Toppings", unit: "g", unitCost: "0.7500" },
  { name: "Oreo Cookie", category: "Toppings", unit: "pc", unitCost: "8.0000" },
  { name: "Strawberry Syrup", category: "Syrups", unit: "ml", unitCost: "0.3000" },
] as const;
