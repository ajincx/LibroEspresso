export type VarianceMateriality = "IMMATERIAL" | "MATERIAL" | "SIGNIFICANT";

export type VarianceTolerance = {
  absoluteQuantity: number;
  relativePercent: number;
};

export function varianceThreshold(
  expectedQuantity: number,
  tolerance: VarianceTolerance,
) {
  const absolute = Math.max(0, tolerance.absoluteQuantity);
  const relative =
    Math.max(0, expectedQuantity) *
    (Math.max(0, tolerance.relativePercent) / 100);
  return Math.max(absolute, relative);
}

export function classifyShortageVariance(
  expectedQuantity: number,
  varianceQuantity: number,
  tolerance: VarianceTolerance,
): VarianceMateriality {
  if (varianceQuantity <= 0) return "IMMATERIAL";
  const threshold = varianceThreshold(expectedQuantity, tolerance);
  if (varianceQuantity <= threshold) return "IMMATERIAL";
  return varianceQuantity >= threshold * 2 ? "SIGNIFICANT" : "MATERIAL";
}

export function requiresVarianceInvestigation(
  expectedQuantity: number,
  varianceQuantity: number,
  tolerance: VarianceTolerance,
) {
  return (
    classifyShortageVariance(expectedQuantity, varianceQuantity, tolerance) !==
    "IMMATERIAL"
  );
}
