import { describe, expect, it } from "vitest";
import {
  classifyShortageVariance,
  requiresVarianceInvestigation,
  varianceThreshold,
} from "./varianceMateriality.service.js";

const tolerance = { absoluteQuantity: 1, relativePercent: 2 };

describe("inventory variance materiality", () => {
  it.each([
    ["g", 100, 1],
    ["ml", 10, 1],
    ["pc", 20, 1],
  ])("keeps a one-base-unit %s shortage immaterial", (_unit, expected, shortage) => {
    expect(requiresVarianceInvestigation(expected, -shortage, tolerance)).toBe(false);
  });

  it("uses the larger of absolute and relative tolerance", () => {
    expect(varianceThreshold(10, tolerance)).toBe(1);
    expect(varianceThreshold(1000, tolerance)).toBe(20);
  });

  it("distinguishes moderate and significant shortages without changing raw variance", () => {
    expect(classifyShortageVariance(100, -3, tolerance)).toBe("MATERIAL");
    expect(classifyShortageVariance(100, -4, tolerance)).toBe("SIGNIFICANT");
    expect(classifyShortageVariance(100, 10, tolerance)).toBe("IMMATERIAL");
  });
});
