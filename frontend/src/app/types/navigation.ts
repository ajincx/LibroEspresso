export type Role = "owner" | "manager";

export type Page =
  | "login" | "dashboard" | "sales" | "menu" | "inventory" | "physical-count"
  | "physical-count-history" | "expected-stock" | "stock-levels"
  | "recipe-reference" | "ingredient-usage"
  | "shrinkage" | "variance" | "purchase-orders" | "cogs"
  | "predictive" | "reports" | "staff-monitoring"
  | "users" | "branches" | "settings" | "master-data";
