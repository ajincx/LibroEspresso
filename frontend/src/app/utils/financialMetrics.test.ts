import { describe, expect, it } from "vitest";
import type { PosAnalytics } from "../types/inventoryWorkflow";
import { officialFinancialMetrics } from "./financialMetrics";

describe("frontend financial summaries", () => {
  it("uses the backend official totals without adding shrinkage", () => {
    const summary = {
      sales: 2_000,
      theoreticalCogs: 800,
      totalCogs: 800,
      detectedShortageValue: 250,
      verifiedShrinkageCost: 150,
      shrinkageCost: 150,
      shrinkageRate: 7.5,
      adjustedCogs: 800,
      grossProfit: 1_200,
      grossMargin: 60,
      unitsSold: 20,
      importCount: 1,
    } satisfies PosAnalytics["summary"];

    expect(officialFinancialMetrics(summary)).toEqual({
      sales: 2_000,
      totalCogs: 800,
      grossProfit: 1_200,
      grossMargin: 60,
      detectedShortageValue: 250,
      verifiedShrinkageCost: 150,
    });
  });
});
