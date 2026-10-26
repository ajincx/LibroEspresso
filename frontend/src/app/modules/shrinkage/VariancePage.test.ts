import { describe, expect, it } from "vitest";
import { displayStatus, varianceClassificationLabel, varianceScopeForStatus, varianceWithoutInvestigationLabel } from "./VariancePage";

describe("variance sign presentation", () => {
  it("treats negative Actual-minus-Expected variance as shortage", () => {
    expect(displayStatus({ varianceQuantity: -54, anomalyStatus: null, requiresInvestigation: false } as never)).toBe("SHORTAGE_WITHIN_TOLERANCE");
  });

  it("treats positive Actual-minus-Expected variance as excess", () => {
    expect(displayStatus({ varianceQuantity: 46, anomalyStatus: null } as never)).toBe("EXCESS_WITHIN_TOLERANCE");
  });

  it("keeps zero variance matched", () => {
    expect(displayStatus({ varianceQuantity: 0, anomalyStatus: null } as never)).toBe("MATCHED");
  });

  it("requests matched records only when the existing Matched filter is selected", () => {
    expect(varianceScopeForStatus("MATCHED")).toBe("MATCHED");
    expect(varianceScopeForStatus("")).toBe("DISCREPANCIES");
    expect(varianceScopeForStatus("DETECTED")).toBe("DISCREPANCIES");
  });

  it("explains why the historical Caramel Syrup variance has no investigation", () => {
    const caramel = { varianceQuantity: -0.02, anomalyId: null, classification: null, requiresInvestigation: false } as never;
    expect(displayStatus(caramel)).toBe("SHORTAGE_WITHIN_TOLERANCE");
    expect(varianceWithoutInvestigationLabel(caramel)).toBe("Within tolerance — no investigation");
    expect(varianceClassificationLabel(caramel)).toBe("No investigation classification — within tolerance");
    expect(varianceWithoutInvestigationLabel({ varianceQuantity: 5, anomalyId: null } as never)).toBe("Excess — no shortage investigation");
  });

  it.each([
    ["Bacon", -865],
    ["Espresso Blend Beans", -262],
  ])("flags a material %s shortage when its authoritative investigation record is missing", (_name, varianceQuantity) => {
    const record = { varianceQuantity, anomalyId: null, anomalyStatus: null, classification: null, requiresInvestigation: true } as never;
    expect(displayStatus(record)).toBe("MISSING_INVESTIGATION");
    expect(varianceWithoutInvestigationLabel(record)).toBe("Investigation record missing");
    expect(varianceClassificationLabel(record)).toBe("Unexplained Variance — Investigation record missing");
  });

  it("preserves the authoritative classification and linkage of an archived investigation", () => {
    const archived = { anomalyId: "report-1", classification: "PILFERAGE", requiresInvestigation: true } as never;
    expect(varianceClassificationLabel(archived)).toBe("Verified Pilferage");
    expect(varianceWithoutInvestigationLabel(archived)).toBe("Investigation available");
  });
});
