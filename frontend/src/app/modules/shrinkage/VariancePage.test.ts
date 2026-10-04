import { describe, expect, it } from "vitest";
import { displayStatus } from "./VariancePage";

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
});
