export const units = ["g", "kg", "ml", "L", "pc"] as const;
export type MeasurementUnit = (typeof units)[number];

const dimensions:Record<MeasurementUnit,"MASS"|"VOLUME"|"COUNT">={g:"MASS",kg:"MASS",ml:"VOLUME",L:"VOLUME",pc:"COUNT"};
const aliases:Record<string,MeasurementUnit>={g:"g",kg:"kg",ml:"ml",l:"L",pc:"pc",pcs:"pc",piece:"pc",pieces:"pc"};

export function normalizeUnit(unit:string):MeasurementUnit|null{return aliases[unit.trim().toLowerCase()]??null;}
export function compatibleUnits(unit:string):MeasurementUnit[]{const normalized=normalizeUnit(unit);return normalized?units.filter((candidate)=>dimensions[candidate]===dimensions[normalized]):[];}
