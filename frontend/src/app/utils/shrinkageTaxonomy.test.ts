import { describe, expect, it } from "vitest";
import { classificationLabel, incidentTypeLabel, incidentTypeOptions, managerClassificationOptions } from "./shrinkageTaxonomy";

describe("shrinkage display taxonomy", () => {
  it("offers all approved Staff incident types without pilferage", () => {
    expect(incidentTypeOptions.map((item) => item.value)).toEqual([
      "SPOILAGE", "WASTAGE", "SPILLAGE", "DAMAGED_ITEM", "PREPARATION_ERROR",
      "OVERPRODUCTION", "EXPIRATION", "UNAUTHORIZED_CONSUMPTION", "OTHER",
    ]);
    expect(incidentTypeOptions.some((item) => item.value.includes("PILFERAGE"))).toBe(false);
  });

  it("uses clear approved labels", () => {
    expect(incidentTypeLabel("DAMAGED_ITEM")).toBe("Damaged or Broken Items");
    expect(incidentTypeLabel("PREPARATION_ERROR")).toBe("Preparation or Portioning Error");
    expect(classificationLabel(null)).toBe("Unexplained Variance – For Investigation");
    expect(classificationLabel("PILFERAGE")).toBe("Verified Pilferage");
  });

  it("keeps COUNT_ERROR available only as a Manager outcome", () => {
    expect(managerClassificationOptions.some((item) => item.value === "COUNT_ERROR")).toBe(true);
    expect(incidentTypeOptions.some((item) => item.value === ("COUNT_ERROR" as never))).toBe(false);
  });
});
