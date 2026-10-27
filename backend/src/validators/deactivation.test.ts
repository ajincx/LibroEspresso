import { describe, expect, it } from "vitest";
import { branchDeactivationInput, userDeactivationInput } from "./deactivation.js";

describe("controlled deactivation reasons", () => {
  it("accepts only the approved account and branch reasons", () => {
    expect(userDeactivationInput.parse({ reason: "Employee resigned." }).reason).toBe("Employee resigned.");
    expect(branchDeactivationInput.parse({ reason: "Branch permanently closed." }).reason).toBe("Branch permanently closed.");
    expect(() => userDeactivationInput.parse({ reason: "Branch permanently closed." })).toThrow();
  });

  it("requires a meaningful explanation for Other", () => {
    expect(() => userDeactivationInput.parse({ reason: "Other: short" })).toThrow();
    expect(userDeactivationInput.parse({ reason: "Other: Role was consolidated." }).reason).toBe("Other: Role was consolidated.");
  });
});
