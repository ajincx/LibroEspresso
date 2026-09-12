import { describe, expect, it } from "vitest";
import { isPageAllowed, ownerOnlyPages, managerOnlyPages, pageFromPath, pagePaths, type AppPage } from "./routeConfig";

describe("Route and Role Security Configuration", () => {
  it("defines paths for all essential application pages", () => {
    expect(pagePaths.dashboard).toBe("/dashboard");
    expect(pagePaths.sales).toBe("/sales");
    expect(pagePaths.menu).toBe("/menu");
    expect(pagePaths.inventory).toBe("/inventory");
    expect(pagePaths["physical-count"]).toBe("/inventory/physical-count");
    expect(pagePaths.shrinkage).toBe("/shrinkage");
    expect(pagePaths.variance).toBe("/inventory/variance");
    expect(pagePaths.users).toBe("/users");
    expect(pagePaths.branches).toBe("/branches");
    expect(pagePaths["master-data"]).toBe("/inventory/master-data");
    expect(pagePaths.settings).toBe("/settings");
    expect("analytics" in pagePaths).toBe(false);
  });

  describe("Owner Access Control", () => {
    it("allows OWNER access to administrative and company-wide pages", () => {
      expect(isPageAllowed("dashboard", "OWNER")).toBe(true);
      expect(isPageAllowed("users", "OWNER")).toBe(true);
      expect(isPageAllowed("branches", "OWNER")).toBe(true);
      expect(isPageAllowed("master-data", "OWNER")).toBe(true);
      expect(isPageAllowed("shrinkage", "OWNER")).toBe(true);
      expect(isPageAllowed("variance", "OWNER")).toBe(true);
      expect(isPageAllowed("menu", "OWNER")).toBe(true);
      expect(isPageAllowed("settings", "OWNER")).toBe(true);
    });

    it("blocks OWNER from manager-only branch operational input pages", () => {
      expect(isPageAllowed("physical-count", "OWNER")).toBe(false);
      expect(managerOnlyPages.has("physical-count")).toBe(true);
    });
  });

  describe("Branch Manager Access Control", () => {
    it("allows BRANCH_MANAGER access to branch operations and daily logging", () => {
      expect(isPageAllowed("dashboard", "BRANCH_MANAGER")).toBe(true);
      expect(isPageAllowed("sales", "BRANCH_MANAGER")).toBe(true);
      expect(isPageAllowed("physical-count", "BRANCH_MANAGER")).toBe(true);
      expect(isPageAllowed("shrinkage", "BRANCH_MANAGER")).toBe(true);
      expect(isPageAllowed("variance", "BRANCH_MANAGER")).toBe(true);
      expect(isPageAllowed("menu", "BRANCH_MANAGER")).toBe(true);
      expect(isPageAllowed("settings", "BRANCH_MANAGER")).toBe(true);
    });

    it("blocks BRANCH_MANAGER from global owner-only pages", () => {
      expect(isPageAllowed("users", "BRANCH_MANAGER")).toBe(false);
      expect(isPageAllowed("branches", "BRANCH_MANAGER")).toBe(false);
      expect(isPageAllowed("master-data", "BRANCH_MANAGER")).toBe(false);
      expect(ownerOnlyPages.has("users")).toBe(true);
      expect(ownerOnlyPages.has("branches")).toBe(true);
      expect(ownerOnlyPages.has("master-data")).toBe(true);
    });
  });

  describe("Staff Access Control", () => {
    it("limits STAFF to the Staff portal and personal Settings", () => {
      expect(isPageAllowed("dashboard", "STAFF")).toBe(true);
      expect(isPageAllowed("settings", "STAFF")).toBe(true);
      (["sales", "inventory", "physical-count", "shrinkage", "purchase-orders", "predictive", "reports", "staff-monitoring", "users", "branches"] as AppPage[])
        .forEach((page) => expect(isPageAllowed(page, "STAFF")).toBe(false));
    });
  });

  describe("Path Resolution", () => {
    it("correctly identifies valid route paths", () => {
      expect(pageFromPath("/dashboard")).toBe("dashboard");
      expect(pageFromPath("/inventory/physical-count")).toBe("physical-count");
      expect(pageFromPath("/shrinkage")).toBe("shrinkage");
      expect(pageFromPath("/users")).toBe("users");
      expect(pageFromPath("/analytics")).toBe("dashboard");
    });

    it("falls back to dashboard for root or unrecognized paths", () => {
      expect(pageFromPath("/")).toBe("dashboard");
      expect(pageFromPath("/some/unknown/route")).toBe("dashboard");
    });
  });
});
