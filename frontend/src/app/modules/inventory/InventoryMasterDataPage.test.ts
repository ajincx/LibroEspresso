import { describe, expect, it } from "vitest";
import { canCreateInventoryItem, canRemoveBranchInventoryItem } from "./InventoryMasterDataPage";

describe("inventory master-data permissions", () => {
  it("allows Owners and Managers to add inventory items", () => {
    expect(canCreateInventoryItem("OWNER")).toBe(true);
    expect(canCreateInventoryItem("BRANCH_MANAGER")).toBe(true);
    expect(canCreateInventoryItem("STAFF")).toBe(false);
  });

  it("keeps branch-item removal Manager-only", () => {
    expect(canRemoveBranchInventoryItem("BRANCH_MANAGER", "BRANCH")).toBe(true);
    expect(canRemoveBranchInventoryItem("OWNER", "BRANCH")).toBe(false);
    expect(canRemoveBranchInventoryItem("BRANCH_MANAGER", "GLOBAL")).toBe(false);
  });
});
