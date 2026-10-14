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

  it("derives standard conversion without trusting the client", () => {
    expect(resolvePurchaseConversion("g", "kg")).toEqual({ purchaseUom: "kg", conversionFactor: 1000 });
    expect(resolvePurchaseConversion("kg", "g")).toEqual({ purchaseUom: "g", conversionFactor: 0.001 });
    expect(resolvePurchaseConversion("ml", "L")).toEqual({ purchaseUom: "L", conversionFactor: 1000 });
    expect(resolvePurchaseConversion("L", "ml")).toEqual({ purchaseUom: "ml", conversionFactor: 0.001 });
  });

  it("rejects a forged standard conversion factor", () => {
    expect(() => resolvePurchaseConversion("g", "kg", 500)).toThrow(AppError);
  });

  it("blocks incompatible dimensions", () => {
    expect(() => resolvePurchaseConversion("ml", "kg", 1000)).toThrow(AppError);
  });
});
