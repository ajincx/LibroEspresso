import { calculateFinancialSummary } from "./financialMetrics.service.js";
import { projectStockAvailability, type AccuracySummary, type IncomingDelivery } from "./forecastEvaluation.service.js";

// Shared deterministic calculations used by the approved report categories.

const DAY = 86_400_000;
const utcDate = (value: string) => new Date(`${value}T00:00:00Z`);
const iso = (value: Date) => value.toISOString().slice(0, 10);
const round = (value: number, digits = 2) => Number(value.toFixed(digits));

export type MetricKey = "sales" | "totalCogs" | "grossProfit" | "grossMargin" | "detectedShortageValue" | "verifiedShrinkageCost";
export type MetricValues = Record<MetricKey, number>;

export function comparablePeriods(startDate: string, endDate: string) {
  const lengthDays = Math.floor((utcDate(endDate).getTime() - utcDate(startDate).getTime()) / DAY) + 1;
  const previousEnd = new Date(utcDate(startDate).getTime() - DAY);
  const previousStart = new Date(previousEnd.getTime() - (lengthDays - 1) * DAY);
  return { startDate, endDate, previousStartDate: iso(previousStart), previousEndDate: iso(previousEnd), lengthDays };
}

export function metricComparison(current: number, previous: number) {
  return {
    current: round(current),
    previous: round(previous),
    absoluteChange: round(current - previous),
    percentageChange: previous === 0 ? null : round(((current - previous) / previous) * 100),
  };
}

export function financialValues(input: {
  sales: number; productCogs: number; detectedShortageValue: number; verifiedShrinkageCost: number;
}): MetricValues {
  const result = calculateFinancialSummary(input);
  return {
    sales: round(input.sales), totalCogs: round(result.totalCogs), grossProfit: round(result.grossProfit),
    grossMargin: round(result.grossMargin), detectedShortageValue: round(input.detectedShortageValue),
    verifiedShrinkageCost: round(input.verifiedShrinkageCost),
  };
}

export function comparisons(current: MetricValues, previous: MetricValues) {
  return Object.fromEntries((Object.keys(current) as MetricKey[]).map((key) => [key, metricComparison(current[key], previous[key])])) as Record<MetricKey, ReturnType<typeof metricComparison>>;
}

export function groupingForPeriod(lengthDays: number): "day" | "week" | "month" {
  return lengthDays <= 45 ? "day" : lengthDays <= 180 ? "week" : "month";
}

export type InventoryRiskInput = {
  branchId: string; branchName: string; inventoryItemId: string; name: string; unit: string;
  currentStock: number; reorderLevel: number; reorderDays: number; dailyUsage: number;
  incomingDeliveries: IncomingDelivery[]; projectionStart: string;
};

export function inventoryRisk(input: InventoryRiskInput) {
  const projectionEnd = iso(new Date(utcDate(input.projectionStart).getTime() + (Math.max(1, input.reorderDays) - 1) * DAY));
  const projection = projectStockAvailability({
    currentStock: input.currentStock, dailyUsage: input.dailyUsage, projectionStart: input.projectionStart,
    projectionEnd, incomingDeliveries: input.incomingDeliveries,
  });
  const depletionDate = projection.daysToStockout === null ? null : iso(new Date(utcDate(input.projectionStart).getTime() + Math.ceil(projection.daysToStockout) * DAY));
  const replenishmentBeforeDepletion = Boolean(depletionDate && input.incomingDeliveries.some((row) => row.expectedDeliveryDate <= depletionDate));
  let risk: "CRITICAL" | "HIGH" | "MEDIUM" | "NORMAL" = "NORMAL";
  let reason = "Projected supply is above the branch reorder threshold.";
  if (projection.daysToStockout !== null && !replenishmentBeforeDepletion && projection.daysToStockout <= input.reorderDays) {
    risk = "CRITICAL";
    reason = `Projected stock-out in ${Math.max(0, Math.ceil(projection.daysToStockout))} day(s), with no confirmed delivery before depletion.`;
  } else if (projection.daysToStockout !== null && projection.daysToStockout <= input.reorderDays) {
    risk = "HIGH";
    reason = `Projected stock-out is within the configured ${input.reorderDays}-day reorder horizon.`;
  } else if (input.currentStock <= input.reorderLevel) {
    risk = "MEDIUM";
    reason = "Current stock is at or below the configured reorder level.";
  }
  const requiredCoverage = input.dailyUsage * input.reorderDays + input.reorderLevel;
  return {
    ...input, currentStock: round(input.currentStock, 3), dailyUsage: round(input.dailyUsage, 3),
    incoming: round(projection.confirmedIncomingQuantity, 3), projectedEndingStock: round(projection.projectedEndStock, 3),
    estimatedStockoutDate: depletionDate, daysToStockout: projection.daysToStockout === null ? null : round(projection.daysToStockout, 1),
    suggestedReorderQuantity: round(Math.max(0, requiredCoverage - input.currentStock - projection.incomingByEnd), 3),
    nextDeliveryDate: projection.nextDeliveryDate, risk, reason,
  };
}

export function normalizedMae(summary: AccuracySummary) {
  return summary.mae === null || !summary.averageActual ? null : round((summary.mae / summary.averageActual) * 100);
}

export function productProfitability<T extends { revenue: number; cogs: number }>(rows: T[]) {
  const totalCogs = rows.reduce((sum, row) => sum + row.cogs, 0);
  return rows.map((row) => {
    const grossProfit = row.revenue - row.cogs;
    return { ...row, grossProfit: round(grossProfit), grossMargin: row.revenue > 0 ? round(grossProfit / row.revenue * 100) : 0, shareOfTotalCogs: totalCogs > 0 ? round(row.cogs / totalCogs * 100) : 0 };
  });
}

export function contributionShares<T extends { productId: string; cost: number }>(rows: T[]) {
  const totals = new Map<string, number>();
  rows.forEach((row) => totals.set(row.productId, (totals.get(row.productId) ?? 0) + row.cost));
  return rows.map((row) => ({ ...row, sharePercent: (totals.get(row.productId) ?? 0) > 0 ? round(row.cost / (totals.get(row.productId) ?? 1) * 100) : 0 }));
}

export function causeShares<T extends { cost: number }>(rows: T[]) {
  const total = rows.reduce((sum, row) => sum + row.cost, 0);
  return rows.map((row) => ({ ...row, sharePercent: total > 0 ? round(row.cost / total * 100) : 0 }));
}

export type AttentionItem = { type: string; urgency: "HIGH" | "MEDIUM" | "LOW"; title: string; reason: string; branchId?: string; entityId?: string };

export function buildAttention(input: {
  unresolved: { id: string; branchId: string; branchName: string; ingredient: string; value: number }[];
  risks: ReturnType<typeof inventoryRisk>[];
  repeatedCauses: { branchId: string; branchName: string; inventoryItemId: string; ingredient: string; cases: number }[];
  lowMarginProducts: { id: string; name: string; grossMargin: number; cogsRate: number; threshold: number }[];
  overdueOrders: { id: string; branchId: string; branchName: string; poNo: string; expectedDeliveryDate: string }[];
}): AttentionItem[] {
  const positive = input.unresolved.filter((row) => row.value > 0);
  const unresolvedThreshold = positive.length ? positive.reduce((sum, row) => sum + row.value, 0) / positive.length : Infinity;
  return [
    ...positive.filter((row) => row.value >= unresolvedThreshold).map((row) => ({ type: "UNRESOLVED_SHORTAGE", urgency: "HIGH" as const, title: `${row.ingredient} — ${row.branchName}`, reason: `Unresolved shortage value is ${round(row.value)} and is at or above the current-period unresolved average of ${round(unresolvedThreshold)}.`, branchId: row.branchId, entityId: row.id })),
    ...input.risks.filter((row) => row.risk === "CRITICAL" || row.risk === "HIGH").map((row) => ({ type: "STOCK_RISK", urgency: row.risk === "CRITICAL" ? "HIGH" as const : "MEDIUM" as const, title: `${row.name} — ${row.branchName}`, reason: row.reason, branchId: row.branchId, entityId: row.inventoryItemId })),
    ...input.repeatedCauses.filter((row) => row.cases >= 2).map((row) => ({ type: "REPEATED_SHRINKAGE", urgency: "MEDIUM" as const, title: `${row.ingredient} — ${row.branchName}`, reason: `${row.cases} legitimate shrinkage cases were verified in the selected period.`, branchId: row.branchId, entityId: row.inventoryItemId })),
    ...input.lowMarginProducts.map((row) => ({ type: "LOW_GROSS_MARGIN", urgency: "MEDIUM" as const, title: row.name, reason: `Product COGS rate is ${round(row.cogsRate, 1)}%, meeting the configured ${round(row.threshold, 1)}% high-COGS threshold; product gross margin is ${round(row.grossMargin, 1)}%.`, entityId: row.id })),
    ...input.overdueOrders.map((row) => ({ type: "OVERDUE_PO", urgency: "HIGH" as const, title: `${row.poNo} — ${row.branchName}`, reason: `Expected delivery ${row.expectedDeliveryDate} has passed and the order remains open.`, branchId: row.branchId, entityId: row.id })),
  ].slice(0, 20);
}
