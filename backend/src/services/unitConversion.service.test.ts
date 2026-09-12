import { describe, expect, it } from "vitest";
import {
  areUnitsCompatible,
  calculateIngredientCost,
  convertQuantity,
  fromBaseUnit,
  getUnitDimension,
  normalizeUnit,
  toBaseUnit,
} from "./unitConversion.service.js";

describe("canonical unit normalization", () => {
  it.each([["g", "g"], ["kg", "kg"], ["ml", "ml"], ["L", "L"], ["pc", "pc"], ["pcs", "pc"], ["piece", "pc"]])(
    "normalizes %s to %s", (input, expected) => expect(normalizeUnit(input)).toBe(expected),
  );
  it("identifies measurement dimensions", () => {
    expect(getUnitDimension("kg")).toBe("MASS");
    expect(getUnitDimension("L")).toBe("VOLUME");
    expect(getUnitDimension("pcs")).toBe("COUNT");
  });
});

describe("canonical unit conversion", () => {
  it("converts 1 kg to 1000 g", () => expect(convertQuantity(1, "kg", "g")).toBe(1000));
  it("converts 0.5 kg to 500 g", () => expect(convertQuantity(0.5, "kg", "g")).toBe(500));
  it("converts 1 L to 1000 ml", () => expect(toBaseUnit(1, "L")).toBe(1000));
  it("converts 250 ml to 0.25 L", () => expect(fromBaseUnit(250, "ml", "L")).toBe(0.25));
  it("normalizes count aliases without changing quantity", () => expect(convertQuantity(12, "pcs", "pc")).toBe(12));
  it("rejects mass-to-volume conversion", () => expect(() => convertQuantity(500, "g", "ml")).toThrow(/incompatible/i));
  it("rejects volume-to-count conversion", () => expect(() => convertQuantity(1, "L", "pc")).toThrow(/incompatible/i));
  it("reports compatible dimensions", () => {
    expect(areUnitsCompatible("kg", "g")).toBe(true);
    expect(areUnitsCompatible("ml", "L")).toBe(true);
    expect(areUnitsCompatible("g", "ml")).toBe(false);
  });
});

describe("unit-normalized ingredient costing", () => {
  it("calculates ₱14.40 for 18 g at ₱800 per kg", () => {
    expect(calculateIngredientCost({ recipeQuantity: 18, recipeUnit: "g", inventoryUnit: "kg", unitCost: 800 })).toBeCloseTo(14.4, 8);
  });
  it("converts L and ml before costing", () => {
    expect(calculateIngredientCost({ recipeQuantity: 250, recipeUnit: "ml", inventoryUnit: "L", unitCost: 120 })).toBeCloseTo(30, 8);
  });
  it("keeps count-unit cost unchanged", () => {
    expect(calculateIngredientCost({ recipeQuantity: 2, recipeUnit: "pcs", inventoryUnit: "pc", unitCost: 5 })).toBe(10);
  });
  it("applies version-specific yield", () => {
    expect(calculateIngredientCost({ recipeQuantity: 180, recipeUnit: "g", inventoryUnit: "g", unitCost: 0.8, yieldQuantity: 10 })).toBeCloseTo(14.4, 8);
  });
});
