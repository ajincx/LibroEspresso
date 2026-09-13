import { describe, expect, it } from "vitest";
import {
  branchInventorySettingsInput,
  incidentCreateInput,
  incidentReviewInput,
} from "./operations.js";

describe("incident review validation", () => {
  it("accepts an optional Manager comment", () => {
    expect(
      incidentReviewInput.parse({
        status: "VERIFIED",
        managerComment: "Reviewed with the shift lead.",
      }),
    ).toEqual({
      status: "VERIFIED",
      managerComment: "Reviewed with the shift lead.",
    });
  });

  it("rejects comments beyond the database limit", () => {
    expect(() =>
      incidentReviewInput.parse({
        status: "REJECTED",
        managerComment: "x".repeat(2001),
      }),
    ).toThrow();
  });
});

describe("Staff incident validation", () => {
  const base = {
    inventoryItemId: "00000000-0000-4000-8000-000000000001",
    quantity: 1,
    occurredAt: "2026-09-09T08:00:00.000Z",
    reason: "Documented during operations",
  };

  it.each(["SPOILAGE", "WASTAGE", "SPILLAGE", "DAMAGED_ITEM", "PREPARATION_ERROR", "OVERPRODUCTION", "EXPIRATION", "UNAUTHORIZED_CONSUMPTION"])("accepts %s", (incidentType) => {
    expect(incidentCreateInput.parse({ ...base, incidentType }).incidentType).toBe(incidentType);
  });

  it("requires a separate specification for OTHER incidents", () => {
    expect(() => incidentCreateInput.parse({ ...base, incidentType: "OTHER" })).toThrow("Please specify the incident type.");
    expect(() => incidentCreateInput.parse({ ...base, incidentType: "OTHER", otherIncidentType: "   " })).toThrow();
  });

  it("trims and accepts a valid OTHER incident specification", () => {
    const parsed = incidentCreateInput.parse({ ...base, incidentType: "OTHER", otherIncidentType: "  Packaging issue  " });
    expect(parsed.otherIncidentType).toBe("Packaging issue");
    expect(parsed.reason).toBe(base.reason);
  });

  it("ignores an OTHER specification for standard incident categories", () => {
    const parsed = incidentCreateInput.parse({ ...base, incidentType: "SPOILAGE", otherIncidentType: "Stale value" });
    expect(parsed.otherIncidentType).toBeUndefined();
    expect(incidentCreateInput.parse({ ...base, incidentType: "WASTAGE", otherIncidentType: null }).otherIncidentType).toBeUndefined();
  });

  it.each(["PILFERAGE", "VERIFIED_PILFERAGE"])("rejects Staff classification %s", (incidentType) => {
    expect(() => incidentCreateInput.parse({ ...base, incidentType })).toThrow();
  });

  it("does not accept inventory changes through an incident payload", () => {
    const parsed = incidentCreateInput.parse({ ...base, incidentType: "SPOILAGE", actualQuantity: 0, varianceValue: 999 });
    expect(parsed).not.toHaveProperty("actualQuantity");
    expect(parsed).not.toHaveProperty("varianceValue");
  });
});

describe("branch inventory settings validation", () => {
  it("accepts branch-specific cost and reorder settings", () => {
    expect(
      branchInventorySettingsInput.parse({
        currentUnitCost: 0.18,
        reorderLevel: 15000,
        reorderDays: 7,
      }),
    ).toEqual({ currentUnitCost: 0.18, reorderLevel: 15000, reorderDays: 7 });
  });

  it("rejects invalid stock coverage days", () => {
    expect(() =>
      branchInventorySettingsInput.parse({
        currentUnitCost: 1,
        reorderLevel: 10,
        reorderDays: 0,
      }),
    ).toThrow();
  });
});
