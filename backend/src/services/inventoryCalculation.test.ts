import { describe, expect, it } from "vitest";
import { computeExpectedStock, computeVariance } from "./inventoryCalculation.service.js";

describe("thesis inventory calculation formulas", () => {
  describe("computeExpectedStock", () => {
    it("deducts exact configured recipe consumption", () => {
      expect(computeExpectedStock(1000, 0, 34 * 7, 0, 0)).toBe(762);
      expect(computeExpectedStock(1000, 0, 34 * 9, 0, 0)).toBe(694);
    });

    it("applies Beginning Inventory + Stock Received - Usage + Increases - Decreases", () => {
      // 1000 + 250 - 238 + 50 - 62 = 1000
      expect(computeExpectedStock(1000, 250, 238, 50, 62)).toBe(1000);
    });
  });

  describe("computeVariance", () => {
    it("computes shortage as positive variance (Expected - Actual > 0)", () => {
      const result = computeVariance(100, 90, 2.5);
      expect(result.varianceQuantity).toBe(10);
      expect(result.varianceValue).toBe(25);
      expect(result.variancePercentage).toBe(10); // +10%
    });

    it("computes excess as negative variance (Expected - Actual < 0)", () => {
      const result = computeVariance(100, 110, 2.5);
      expect(result.varianceQuantity).toBe(-10);
      expect(result.varianceValue).toBe(-25);
      expect(result.variancePercentage).toBe(-10); // -10%
    });

    it("computes matched as zero variance (Expected - Actual = 0)", () => {
      const result = computeVariance(100, 100, 2.5);
      expect(result.varianceQuantity).toBe(0);
      expect(result.varianceValue).toBe(0);
      expect(result.variancePercentage).toBe(0);
    });

    it("returns null for variance percentage when expected inventory is zero or negative", () => {
      const result = computeVariance(0, 5, 2.5);
      expect(result.varianceQuantity).toBe(-5);
      expect(result.varianceValue).toBe(-12.5);
      expect(result.variancePercentage).toBeNull();
    });
  });
});
