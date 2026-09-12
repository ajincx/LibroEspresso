import type { PosAnalytics } from "../types/inventoryWorkflow";

export function officialFinancialMetrics(summary: PosAnalytics["summary"]) {
  return {
    sales: summary.sales,
    totalCogs: summary.totalCogs,
    grossProfit: summary.grossProfit,
    grossMargin: summary.grossMargin,
    detectedShortageValue: summary.detectedShortageValue,
    verifiedShrinkageCost: summary.verifiedShrinkageCost,
  };
}
