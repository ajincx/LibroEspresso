import {
  convertQuantity,
  normalizeUnit,
  UnitConversionError,
  type CanonicalUnit,
} from "./unitConversion.service.js";

const countUnitsByCanonicalUnit = {
  g: ["g", "kg"],
  ml: ["ml", "L"],
  pc: ["pc"],
} as const satisfies Record<"g" | "ml" | "pc", readonly CanonicalUnit[]>;

export type PhysicalCountCanonicalUnit = keyof typeof countUnitsByCanonicalUnit;
export type PhysicalCountEnteredUnit = CanonicalUnit;

export function physicalCountUnits(canonicalUnit: string): readonly PhysicalCountEnteredUnit[] {
  const normalized = normalizeUnit(canonicalUnit);
  if (!(normalized in countUnitsByCanonicalUnit)) {
    throw new UnitConversionError(`Unsupported physical-count canonical unit: ${canonicalUnit}`);
  }
  return countUnitsByCanonicalUnit[normalized as PhysicalCountCanonicalUnit];
}

export function normalizePhysicalCountQuantity(input: {
  quantity: number;
  enteredUnit: string;
  canonicalUnit: string;
}): number {
  if (!Number.isFinite(input.quantity)) {
    throw new UnitConversionError("Physical-count quantity must be a finite number");
  }
  if (input.quantity < 0) {
    throw new UnitConversionError("Physical-count quantity cannot be negative");
  }
  const enteredUnit = normalizeUnit(input.enteredUnit);
  const allowedUnits = physicalCountUnits(input.canonicalUnit);
  if (!allowedUnits.includes(enteredUnit)) {
    throw new UnitConversionError(
      `${enteredUnit} is not compatible with inventory unit ${input.canonicalUnit}`,
    );
  }
  return convertQuantity(input.quantity, enteredUnit, input.canonicalUnit);
}
