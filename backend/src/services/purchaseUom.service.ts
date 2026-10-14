import { AppError } from "../utils/appError.js";
import { areUnitsCompatible, convertQuantity, normalizeUnit } from "./unitConversion.service.js";

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
  const authoritativeFactor = convertQuantity(
    1,
    normalizedPurchaseUom,
    normalizedStockUnit,
  );
  if (
    conversionFactor !== undefined &&
    Math.abs(conversionFactor - authoritativeFactor) > 0.000000001
  ) {
    throw new AppError(
      422,
      "PO_CONVERSION_INVALID",
      "The conversion factor does not match the selected standard units",
    );
  }
  return {
    purchaseUom: normalizedPurchaseUom,
    conversionFactor: authoritativeFactor,
  };
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
