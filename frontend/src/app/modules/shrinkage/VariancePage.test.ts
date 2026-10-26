import { describe, expect, it } from "vitest";
import { displayStatus, varianceScopeForStatus, varianceWithoutInvestigationLabel } from "./VariancePage";

describe("variance sign presentation", () => {
  it("treats negative Actual-minus-Expected variance as shortage", () => {
    expect(displayStatus({ varianceQuantity: -54, anomalyStatus: null } as never)).toBe("SHORTAGE_WITHIN_TOLERANCE");
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
    const caramel = { varianceQuantity: -0.02, anomalyId: null } as never;
    expect(displayStatus(caramel)).toBe("SHORTAGE_WITHIN_TOLERANCE");
    expect(varianceWithoutInvestigationLabel(caramel)).toBe("Within tolerance — no investigation");
    expect(varianceWithoutInvestigationLabel({ varianceQuantity: 5, anomalyId: null } as never)).toBe("Excess — no shortage investigation");
  });
});
