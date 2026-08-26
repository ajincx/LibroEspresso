import { describe, expect, it } from "vitest";
import { computeExpectedStock } from "./inventoryCalculation.service.js";

describe("expected inventory calculation", () => {
  it("deducts exact configured recipe consumption", () => {
    expect(computeExpectedStock(1000, 0, 34 * 7, 0)).toBe(762);
    expect(computeExpectedStock(1000, 0, 34 * 9, 0)).toBe(694);
  });

  it("includes receipts and approved adjustments", () => {
    expect(computeExpectedStock(1000, 250, 238, 12)).toBe(1000);
  });
});
