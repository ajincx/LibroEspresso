import {
  VERIFIED_SHRINKAGE_CLASSIFICATIONS,
  isVerifiedShrinkageClassification,
} from "./shrinkageWorkflow.service.js";

export { VERIFIED_SHRINKAGE_CLASSIFICATIONS } from "./shrinkageWorkflow.service.js";

type ShrinkageStatus = "DETECTED" | "VERIFIED" | "PENDING_REVIEW" | "REVIEWED";
type ShrinkageClassification =
  | (typeof VERIFIED_SHRINKAGE_CLASSIFICATIONS)[number]
  | "COUNT_ERROR"
  | null;

export interface FinancialSummaryInput {
  sales: number;
  productCogs: number | readonly number[];
  detectedShortageValue: number;
  verifiedShrinkageCost: number;
}

export function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Math.sign(value) * Number.EPSILON) * 100) / 100;
}

export function sumMoney(values: readonly number[]): number {
  return values.reduce((cents, value) => cents + Math.round(roundMoney(value) * 100), 0) / 100;
}

export function calculateProductCogs(
  quantitySold: number,
  ingredientCostPerMenuItem: number,
): number {
  return roundMoney(quantitySold * ingredientCostPerMenuItem);
}

export function calculateTotalCogs(productCogs: number | readonly number[]): number {
  return typeof productCogs === "number"
    ? roundMoney(productCogs)
    : sumMoney(productCogs);
}

export function detectedShortageContribution(varianceValue: number): number {
  return Math.max(varianceValue, 0);
}

export function verifiedShrinkageContribution(record: {
  varianceValue: number;
  status: ShrinkageStatus;
  classification: ShrinkageClassification;
}): number {
  const isVerified = record.status === "VERIFIED" || record.status === "REVIEWED";
  const isShrinkageCause = isVerifiedShrinkageClassification(record.classification);
  return isVerified && isShrinkageCause
    ? detectedShortageContribution(record.varianceValue)
    : 0;
}

export function calculateFinancialSummary(input: FinancialSummaryInput) {
  const totalCogs = calculateTotalCogs(input.productCogs);
  const sales = roundMoney(input.sales);
  const grossProfit = roundMoney(sales - totalCogs);
  const grossMargin = sales > 0 ? (grossProfit / sales) * 100 : 0;
  const shrinkageRate =
    sales > 0 ? (input.verifiedShrinkageCost / sales) * 100 : 0;

  return {
    totalCogs,
    grossProfit,
    grossMargin,
    shrinkageRate,
    detectedShortageValue: input.detectedShortageValue,
    verifiedShrinkageCost: input.verifiedShrinkageCost,
  };
}
