import { describe, expect, it } from "vitest";
import {
  MANAGER_CLASSIFICATIONS,
  STAFF_INCIDENT_TYPES,
  VERIFIED_SHRINKAGE_CLASSIFICATIONS,
  isVerifiedShrinkageClassification,
  validatePilferageSafeguard,
} from "./shrinkageWorkflow.service.js";

describe("Sprint 3 shrinkage taxonomy", () => {
  it("allows every approved Staff incident type and excludes pilferage", () => {
    expect(STAFF_INCIDENT_TYPES).toEqual([
      "SPOILAGE", "WASTAGE", "SPILLAGE", "DAMAGED_ITEM", "PREPARATION_ERROR",
      "OVERPRODUCTION", "EXPIRATION", "UNAUTHORIZED_CONSUMPTION", "OTHER",
    ]);
    expect(STAFF_INCIDENT_TYPES).not.toContain("PILFERAGE");
  });

  it("supports legitimate Manager causes and keeps COUNT_ERROR separate", () => {
    expect(MANAGER_CLASSIFICATIONS).toContain("PILFERAGE");
    expect(MANAGER_CLASSIFICATIONS).toContain("COUNT_ERROR");
    expect(VERIFIED_SHRINKAGE_CLASSIFICATIONS).not.toContain("COUNT_ERROR");
  });

  it.each([
    "SPOILAGE", "WASTAGE", "SPILLAGE", "DAMAGED_ITEM", "PREPARATION_ERROR",
    "OVERPRODUCTION", "EXPIRATION", "UNAUTHORIZED_CONSUMPTION", "PILFERAGE",
  ])("qualifies %s as a legitimate verified shrinkage cause", (classification) => {
    expect(isVerifiedShrinkageClassification(classification)).toBe(true);
  });

  it("does not treat unresolved, correction, or unknown values as a verified cause", () => {
    expect(isVerifiedShrinkageClassification(null)).toBe(false);
    expect(isVerifiedShrinkageClassification("COUNT_ERROR")).toBe(false);
    expect(isVerifiedShrinkageClassification("OTHER")).toBe(false);
  });
});

describe("Verified Pilferage safeguard", () => {
  const valid = {
    classification: "PILFERAGE" as const,
    explanation: "Camera and stock movement records were reviewed.",
    evidenceReviewConfirmed: true,
    evidenceBasis: ["INVENTORY_MOVEMENT" as const],
  };

  it("rejects missing meaningful investigation notes", () => {
    expect(validatePilferageSafeguard({ ...valid, explanation: "Too short" })).toBe(false);
  });

  it("rejects missing explicit evidence confirmation", () => {
    expect(validatePilferageSafeguard({ ...valid, evidenceReviewConfirmed: false })).toBe(false);
  });

  it("rejects missing evidence basis", () => {
    expect(validatePilferageSafeguard({ ...valid, evidenceBasis: [] })).toBe(false);
  });

  it("accepts Verified Pilferage only when all safeguards are supplied", () => {
    expect(validatePilferageSafeguard(valid)).toBe(true);
  });

  it("does not apply the stronger safeguard to ordinary classifications", () => {
    expect(validatePilferageSafeguard({ classification: "SPOILAGE", explanation: "Documented spoilage." })).toBe(true);
  });
});
