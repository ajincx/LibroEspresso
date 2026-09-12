import { describe, expect, it } from "vitest";
import {
  formatManilaReportTimestamp,
  getVarianceStatus,
  summarizeSalesRows,
  summarizeShrinkageRows,
} from "./reportDataset.service.js";

describe("report dataset semantics", () => {
  it("totals authoritative sales rows without formatted-string arithmetic", () => {
    expect(summarizeSalesRows([
      { quantitySold: 2, salesRevenue: 300 },
      { quantitySold: 3, salesRevenue: 525 },
    ])).toEqual({ totalQuantitySold: 5, totalSales: 825 });
  });

  it("preserves shortage, excess, and matched variance signs", () => {
    expect(getVarianceStatus(2)).toBe("SHORTAGE");
    expect(getVarianceStatus(-2)).toBe("EXCESS");
    expect(getVarianceStatus(0)).toBe("MATCHED");
  });

  it("separates unresolved shortages, verified shrinkage, and COUNT_ERROR", () => {
    const summary = summarizeShrinkageRows([
      { varianceValue: 100, investigationStatus: "DETECTED", finalClassification: null, verifiedShrinkageCost: 0 },
      { varianceValue: 50, investigationStatus: "VERIFIED", finalClassification: "SPOILAGE", verifiedShrinkageCost: 50 },
      { varianceValue: 40, investigationStatus: "REVIEWED", finalClassification: "COUNT_ERROR", verifiedShrinkageCost: 0 },
      { varianceValue: -20, investigationStatus: "VERIFIED", finalClassification: "WASTAGE", verifiedShrinkageCost: 0 },
    ]);
    expect(summary).toEqual({ detected: 190, underInvestigation: 100, verified: 50, correction: 40, verifiedCases: 1 });
  });

  it("formats generation timestamps in Asia/Manila", () => {
    expect(formatManilaReportTimestamp(new Date("2026-09-09T14:00:00.000Z"))).toContain("10:00:00 PM");
  });
});
