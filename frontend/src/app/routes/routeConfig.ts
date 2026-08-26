import type { UserRole } from "../types/auth";

export const pagePaths = {
  dashboard: "/dashboard", sales: "/sales", menu: "/menu", inventory: "/inventory",
  "physical-count": "/inventory/physical-count", shrinkage: "/shrinkage",
  variance: "/inventory/variance", "purchase-orders": "/purchase-orders",
  cogs: "/cogs", predictive: "/predictive", reports: "/reports",
  users: "/users", branches: "/branches", settings: "/settings", "master-data": "/inventory/master-data",
} as const;

export type AppPage = keyof typeof pagePaths;
export const ownerOnlyPages = new Set<AppPage>(["users", "branches", "master-data"]);
export const managerOnlyPages = new Set<AppPage>(["physical-count"]);

export function isPageAllowed(page: AppPage, role: UserRole) {
  return role === "OWNER" ? !managerOnlyPages.has(page) : !ownerOnlyPages.has(page);
}

export function pageFromPath(pathname: string): AppPage {
  return (Object.entries(pagePaths).find(([, path]) => path === pathname)?.[0] as AppPage) ?? "dashboard";
}
