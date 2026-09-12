export const SUPPORTED_UNITS = ["g", "kg", "ml", "L", "pc"] as const;
export type CanonicalUnit = (typeof SUPPORTED_UNITS)[number];
export type UnitDimension = "MASS" | "VOLUME" | "COUNT";

const aliases: Record<string, CanonicalUnit> = {
  g: "g",
  gram: "g",
  grams: "g",
  kg: "kg",
  kilogram: "kg",
  kilograms: "kg",
  ml: "ml",
  milliliter: "ml",
  milliliters: "ml",
  l: "L",
  liter: "L",
  liters: "L",
  litre: "L",
  litres: "L",
  pc: "pc",
  pcs: "pc",
  piece: "pc",
  pieces: "pc",
};

const definitions: Record<CanonicalUnit, { dimension: UnitDimension; baseUnit: CanonicalUnit; factor: number }> = {
  g: { dimension: "MASS", baseUnit: "g", factor: 1 },
  kg: { dimension: "MASS", baseUnit: "g", factor: 1000 },
  ml: { dimension: "VOLUME", baseUnit: "ml", factor: 1 },
  L: { dimension: "VOLUME", baseUnit: "ml", factor: 1000 },
  pc: { dimension: "COUNT", baseUnit: "pc", factor: 1 },
};

export class UnitConversionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnitConversionError";
  }
}

export function normalizeUnit(unit: string): CanonicalUnit {
  const normalized = aliases[unit.trim().toLowerCase()];
  if (!normalized) throw new UnitConversionError(`Unsupported unit: ${unit}`);
  return normalized;
}

export function getUnitDimension(unit: string): UnitDimension {
  return definitions[normalizeUnit(unit)].dimension;
}

export function getBaseUnit(unit: string): CanonicalUnit {
  return definitions[normalizeUnit(unit)].baseUnit;
}

export function areUnitsCompatible(unitA: string, unitB: string): boolean {
  try {
    return getUnitDimension(unitA) === getUnitDimension(unitB);
  } catch {
    return false;
  }
}

export function toBaseUnit(quantity: number, unit: string): number {
  if (!Number.isFinite(quantity)) throw new UnitConversionError("Quantity must be a finite number");
  return quantity * definitions[normalizeUnit(unit)].factor;
}

export function fromBaseUnit(quantity: number, baseUnit: string, targetUnit: string): number {
  if (!areUnitsCompatible(baseUnit, targetUnit)) {
    throw new UnitConversionError(`Cannot convert ${baseUnit} to incompatible unit ${targetUnit}`);
  }
  return quantity / definitions[normalizeUnit(targetUnit)].factor;
}

export function convertQuantity(quantity: number, fromUnit: string, toUnit: string): number {
  if (!areUnitsCompatible(fromUnit, toUnit)) {
    throw new UnitConversionError(`Cannot convert ${fromUnit} to incompatible unit ${toUnit}`);
  }
  return fromBaseUnit(toBaseUnit(quantity, fromUnit), getBaseUnit(fromUnit), toUnit);
}

export function compatibleUnits(unit: string): CanonicalUnit[] {
  const dimension = getUnitDimension(unit);
  return SUPPORTED_UNITS.filter((candidate) => definitions[candidate].dimension === dimension);
}

export function calculateIngredientCost(input: {
  recipeQuantity: number;
  recipeUnit: string;
  inventoryUnit: string;
  unitCost: number;
  yieldQuantity?: number;
}): number {
  const yieldQuantity = input.yieldQuantity ?? 1;
  if (!(yieldQuantity > 0)) throw new UnitConversionError("Recipe yield must be greater than zero");
  return convertQuantity(input.recipeQuantity, input.recipeUnit, input.inventoryUnit) * input.unitCost / yieldQuantity;
}
