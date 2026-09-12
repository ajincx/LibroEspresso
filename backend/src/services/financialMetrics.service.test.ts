import { describe, expect, it } from "vitest";
import {
  calculateFinancialSummary,
  calculateProductCogs,
  calculateTotalCogs,
  detectedShortageContribution,
  verifiedShrinkageContribution,
  roundMoney,
  sumMoney,
} from "./financialMetrics.service.js";

describe("official COGS and profitability calculations", () => {
  it("rounds monetary values consistently without floating-point artifacts", () => {
    expect(roundMoney(0.1 + 0.2)).toBe(0.3);
    expect(sumMoney([0.1, 0.2, 10.005])).toBe(10.31);
    expect(calculateProductCogs(3, 0.1)).toBe(0.3);
  });
  it("calculates Product COGS from quantity sold and ingredient cost per item", () => {
    expect(calculateProductCogs(12, 42.5)).toBe(510);
  });

  it("calculates Total COGS as the sum of Product COGS", () => {
    const productCogs = [
      calculateProductCogs(10, 20),
      calculateProductCogs(5, 30),
      calculateProductCogs(2, 75),
    ];
    expect(calculateTotalCogs(productCogs)).toBe(500);
  });

  it("keeps Total COGS recipe-based and separate from shortages", () => {
    const summary = calculateFinancialSummary({
      sales: 2_000,
      productCogs: 800,
      detectedShortageValue: 250,
      verifiedShrinkageCost: 150,
    });

    expect(summary.totalCogs).toBe(800);
    expect(summary.grossProfit).toBe(1_200);
    expect(summary.grossMargin).toBe(60);
    expect(summary.detectedShortageValue).toBe(250);
    expect(summary.verifiedShrinkageCost).toBe(150);
  });

  it("does not deduct verified shrinkage from Gross Profit a second time", () => {
    const summary = calculateFinancialSummary({
      sales: 1_000,
      productCogs: 400,
      detectedShortageValue: 100,
      verifiedShrinkageCost: 80,
    });

    expect(summary.grossProfit).toBe(600);
    expect(summary.grossProfit).not.toBe(520);
  });
});

describe("detected and verified shrinkage contributions", () => {
  it("includes only positive variance in Detected Shortage Value", () => {
    expect(detectedShortageContribution(75)).toBe(75);
    expect(detectedShortageContribution(-75)).toBe(0);
    expect(detectedShortageContribution(0)).toBe(0);
  });

  it("excludes unresolved shortages from Verified Shrinkage Cost", () => {
    expect(verifiedShrinkageContribution({
      varianceValue: 75,
      status: "DETECTED",
      classification: null,
    })).toBe(0);
  });

  it("includes verified legitimate shrinkage", () => {
    expect(verifiedShrinkageContribution({
      varianceValue: 75,
      status: "VERIFIED",
      classification: "SPOILAGE",
    })).toBe(75);
    expect(verifiedShrinkageContribution({
      varianceValue: 50,
      status: "REVIEWED",
      classification: "PILFERAGE",
    })).toBe(50);
  });

  it.each(["SPILLAGE", "OVERPRODUCTION", "EXPIRATION", "UNAUTHORIZED_CONSUMPTION"] as const)("includes verified %s in Verified Shrinkage Cost", (classification) => {
    expect(verifiedShrinkageContribution({ varianceValue: 40, status: "VERIFIED", classification })).toBe(40);
  });

  it("excludes COUNT_ERROR and excess inventory from Verified Shrinkage Cost", () => {
    expect(verifiedShrinkageContribution({
      varianceValue: 75,
      status: "REVIEWED",
      classification: "COUNT_ERROR",
    })).toBe(0);
    expect(verifiedShrinkageContribution({
      varianceValue: -75,
      status: "VERIFIED",
      classification: "WASTAGE",
    })).toBe(0);
  });
});
