import { describe, expect, it } from "vitest";
import { AppError } from "../utils/appError.js";
import {
  baseStockUnitCost,
  receivedStockQuantity,
  resolvePurchaseConversion,
} from "./purchaseUom.service.js";

describe("purchase order unit conversion", () => {
  it("uses factor one when purchasing in the stock unit", () => {
    expect(resolvePurchaseConversion("g", "g", 1)).toEqual({ purchaseUom: "g", conversionFactor: 1 });
  });

  it("converts purchase quantities and costs into the base stock unit", () => {
    const resolved = resolvePurchaseConversion("g", "kg", 1000);
    expect(receivedStockQuantity(12, resolved.conversionFactor)).toBe(12000);
    expect(baseStockUnitCost(500, resolved.conversionFactor)).toBe(0.5);
  });

  it("blocks a differing purchase unit without an explicit conversion", () => {
    expect(() => resolvePurchaseConversion("g", "kg")).toThrow(AppError);
  });

  it("blocks incompatible dimensions", () => {
    expect(() => resolvePurchaseConversion("ml", "kg", 1000)).toThrow(AppError);
  });
});
