import { AppError } from "../utils/appError.js";
import { areUnitsCompatible, normalizeUnit } from "./unitConversion.service.js";

export function resolvePurchaseConversion(
  stockUnit: string,
  purchaseUom?: string,
  conversionFactor?: number,
) {
  const normalizedStockUnit = normalizeUnit(stockUnit);
  const normalizedPurchaseUom = normalizeUnit(purchaseUom ?? stockUnit);
  if (!areUnitsCompatible(normalizedStockUnit, normalizedPurchaseUom)) {
    throw new AppError(
      422,
      "PO_UOM_INCOMPATIBLE",
      `Purchase unit ${purchaseUom} is not compatible with stock unit ${stockUnit}`,
    );
  }
  if (normalizedPurchaseUom === normalizedStockUnit) {
    if (conversionFactor !== undefined && conversionFactor !== 1) {
      throw new AppError(
        422,
        "PO_CONVERSION_INVALID",
        "Conversion factor must be 1 when purchase and stock units are the same",
      );
    }
    return { purchaseUom: normalizedPurchaseUom, conversionFactor: 1 };
  }
  if (!conversionFactor || conversionFactor <= 0) {
    throw new AppError(
      422,
      "PO_CONVERSION_REQUIRED",
      "Enter how many base stock units are contained in one purchase unit",
    );
  }
  return { purchaseUom: normalizedPurchaseUom, conversionFactor };
}

export function receivedStockQuantity(
  purchaseQuantity: number,
  conversionFactor: number,
) {
  return purchaseQuantity * conversionFactor;
}

export function baseStockUnitCost(
  purchaseUnitCost: number,
  conversionFactor: number,
) {
  return purchaseUnitCost / conversionFactor;
}
