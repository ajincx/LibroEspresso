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

export type NotificationDestination = { path: string } | { message: string } | { messageTargetId: string | null };

export function notificationDestination(
  notification: { entityType: string | null; entityId: string | null; type?: string },
  role: UserRole,
): NotificationDestination {
  const id = notification.entityId ? encodeURIComponent(notification.entityId) : null;
  if (notification.entityType === "MESSAGE") return { messageTargetId: notification.entityId };
  if (role === "STAFF") {
    if (notification.entityType === "INCIDENT_REPORT") return id ? { path: `/dashboard?incidentId=${id}` } : { message: "This incident report is no longer available." };
    return { message: "This notification target is not available with Staff access." };
  }
  if (notification.entityType === "MENU_ITEM") return { path: "/cogs/menu-recipes" };
  if (notification.entityType === "POS_FORMAT_SETUP_REQUEST") {
    if (role !== "OWNER") return { path: "/sales" };
    return id
      ? { path: `/sales?formatRequestId=${id}` }
      : { message: "This POS format setup request is no longer available." };
  }
  if (notification.entityType === "POS_SOURCE") return { path: id ? `/sales?configureMapping=${id}` : "/sales" };
  if (notification.entityType === "POS_IMPORT" || notification.entityType === "POS_IMPORT_APPROVAL") {
    return { path: "/sales" };
  }
  if (notification.entityType === "INCIDENT_REPORT") return { path: id ? `/shrinkage?incidentId=${id}` : "/shrinkage" };
  if (notification.entityType === "SHRINKAGE_REPORT") return { path: id ? `/shrinkage?reportId=${id}` : "/shrinkage" };
  if (notification.entityType === "PURCHASE_ORDER") return { path: id ? `/purchase-orders?orderId=${id}` : "/purchase-orders" };
  return { message: "This notification target is no longer available or you do not have access." };
}
