import type { UserRole } from "../types/auth";

export const pagePaths = {
  dashboard: "/dashboard", sales: "/sales", menu: "/menu", inventory: "/inventory",
  "physical-count": "/inventory/physical-count",
  "physical-count-history": "/inventory/physical-count-history",
  "expected-stock": "/inventory/expected-stock",
  "stock-levels": "/inventory/stock-levels",
  "recipe-reference": "/cogs/menu-recipes",
  "ingredient-usage": "/cogs/menu-recipes/ingredient-usage",
  shrinkage: "/shrinkage",
  variance: "/inventory/variance", "purchase-orders": "/purchase-orders",
  cogs: "/cogs", predictive: "/predictive", reports: "/reports",
  "staff-monitoring": "/staff-monitoring",
  users: "/users", branches: "/branches", settings: "/settings", "master-data": "/inventory/master-data",
} as const;

export type AppPage = keyof typeof pagePaths;
export const ownerOnlyPages = new Set<AppPage>(["users", "branches", "master-data"]);
export const managerOnlyPages = new Set<AppPage>(["physical-count"]);

export function isPageAllowed(page: AppPage, role: UserRole) {
  if (role === "STAFF") return page === "dashboard" || page === "settings";
  return role === "OWNER" ? !managerOnlyPages.has(page) : !ownerOnlyPages.has(page);
}

export function pageFromPath(pathname: string): AppPage {
  return (Object.entries(pagePaths).find(([, path]) => path === pathname)?.[0] as AppPage) ?? "dashboard";
}
