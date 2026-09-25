import { calculateFinancialSummary } from "./financialMetrics.service.js";
import { convertQuantity, normalizeUnit } from "./unitConversion.service.js";

export type PosSimulationLine = {
  quantitySold: number;
  unitPrice: number;
  recipeVersionId: string;
};

export type PosSimulationRecipeItem = {
  recipeVersionId: string;
  inventoryItemId: string;
  sku: string;
  name: string;
  recipeQuantity: number;
  recipeUnit: string;
  inventoryUnit: string;
  unitCost: number;
  yieldQuantity: number;
};

export function calculatePosImportSimulation(
  lines: readonly PosSimulationLine[],
  recipeItems: readonly PosSimulationRecipeItem[],
) {
  const itemsByRecipe = new Map<string, PosSimulationRecipeItem[]>();
  for (const item of recipeItems) {
    itemsByRecipe.set(item.recipeVersionId, [...(itemsByRecipe.get(item.recipeVersionId) ?? []), item]);
  }
  const usage = new Map<string, { inventoryItemId: string; sku: string; name: string; unit: string; expectedConsumption: number; estimatedCost: number }>();
  let estimatedSales = 0;
  let estimatedCogs = 0;
  for (const line of lines) {
    estimatedSales += line.quantitySold * line.unitPrice;
    for (const item of itemsByRecipe.get(line.recipeVersionId) ?? []) {
      const quantityPerItem = convertQuantity(item.recipeQuantity, item.recipeUnit, item.inventoryUnit) / item.yieldQuantity;
      const expectedConsumption = line.quantitySold * quantityPerItem;
      const estimatedCost = expectedConsumption * item.unitCost;
      const unit = normalizeUnit(item.inventoryUnit);
      const key = `${item.inventoryItemId}:${unit}`;
      const current = usage.get(key);
      usage.set(key, {
        inventoryItemId: item.inventoryItemId,
        sku: item.sku,
        name: item.name,
        unit,
        expectedConsumption: (current?.expectedConsumption ?? 0) + expectedConsumption,
        estimatedCost: (current?.estimatedCost ?? 0) + estimatedCost,
      });
      estimatedCogs += estimatedCost;
    }
  }
  const financials = calculateFinancialSummary({
    sales: estimatedSales,
    productCogs: estimatedCogs,
    detectedShortageValue: 0,
    verifiedShrinkageCost: 0,
  });
  return {
    estimatedSales,
    estimatedCogs: financials.totalCogs,
    estimatedGrossProfit: financials.grossProfit,
    estimatedGrossMargin: financials.grossMargin,
    ingredientConsumption: [...usage.values()].sort((a, b) => a.name.localeCompare(b.name)),
  };
}
