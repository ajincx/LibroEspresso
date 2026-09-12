import { describe, expect, it } from "vitest";
import { getEffectiveBranchId } from "./branchScope.js";
describe("branch scoping", () => {
  it("ignores a manager-supplied branch", () => {
    expect(getEffectiveBranchId({ id: "m1", role: "BRANCH_MANAGER", branchId: "lipa" }, "vermosa")).toBe("lipa");
  });
  it("forces Staff to their assigned branch", () => {
    expect(getEffectiveBranchId({ id: "s1", role: "STAFF", branchId: "gulod" }, "lipa")).toBe("gulod");
  });
  it("allows an owner branch filter", () => {
    expect(getEffectiveBranchId({ id: "o1", role: "OWNER", branchId: null }, "vermosa")).toBe("vermosa");
  });
  it("forces predictive evaluation requests to a manager's assigned branch", () => {
    expect(getEffectiveBranchId({ id: "m1", role: "BRANCH_MANAGER", branchId: "lipa" }, "gulod")).toBe("lipa");
  });
  it("allows an owner to select a branch for predictive evaluation", () => {
    expect(getEffectiveBranchId({ id: "o1", role: "OWNER", branchId: null }, "gulod")).toBe("gulod");
  });
});
