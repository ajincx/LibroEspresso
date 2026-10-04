import { describe, expect, it } from "vitest";
import {
  normalizePhysicalCountQuantity,
  physicalCountUnits,
} from "./physicalCountUnit.service.js";

describe("physical-count unit normalization", () => {
  it.each([
    [3864, "g", "g", 3864],
    [3.864, "kg", "g", 3864],
    [2500, "ml", "ml", 2500],
    [2.5, "L", "ml", 2500],
    [10, "pc", "pc", 10],
    [0, "kg", "g", 0],
    [1.25, "kg", "g", 1250],
  ] as const)("normalizes %s %s to %s", (quantity, enteredUnit, canonicalUnit, expected) => {
    expect(normalizePhysicalCountQuantity({ quantity, enteredUnit, canonicalUnit })).toBe(expected);
  });

  it("exposes only practical units compatible with the canonical storage unit", () => {
    expect(physicalCountUnits("g")).toEqual(["g", "kg"]);
    expect(physicalCountUnits("ml")).toEqual(["ml", "L"]);
    expect(physicalCountUnits("pc")).toEqual(["pc"]);
  });

  it.each([
    { quantity: 3, enteredUnit: "L", canonicalUnit: "g" },
    { quantity: 10, enteredUnit: "kg", canonicalUnit: "pc" },
    { quantity: -1, enteredUnit: "g", canonicalUnit: "g" },
  ])("rejects invalid physical-count input %#", (input) => {
    expect(() => normalizePhysicalCountQuantity(input)).toThrow();
  });
});
