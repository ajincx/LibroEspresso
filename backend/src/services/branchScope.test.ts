import { describe, expect, it } from "vitest";
import { getEffectiveBranchId } from "./branchScope.js";
describe("branch scoping", () => {
  it("ignores a manager-supplied branch", () => {
    expect(getEffectiveBranchId({ id: "m1", role: "BRANCH_MANAGER", branchId: "lipa" }, "vermosa")).toBe("lipa");
  });
  it("allows an owner branch filter", () => {
    expect(getEffectiveBranchId({ id: "o1", role: "OWNER", branchId: null }, "vermosa")).toBe("vermosa");
  });
});
