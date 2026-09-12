import type { RequestHandler } from "express";
import { pool } from "../config/database.js";
import { getEffectiveBranchId } from "../services/branchScope.js";
import { generateGeminiInsights, type DecisionInsight } from "../services/geminiInsights.service.js";
import {
  combineAccuracySummaries,
  evaluateIngredientMae,
  evaluateSalesMae,
  projectStockAvailability,
  projectedStockOnDate,
  type IncomingDelivery,
} from "../services/forecastEvaluation.service.js";
import { predictiveForecastInput } from "../validators/predictive.js";
import { VERIFIED_SHRINKAGE_CLASSIFICATIONS_SQL } from "../services/shrinkageWorkflow.service.js";
import { manilaBusinessDate } from "../services/businessTime.service.js";
import { convertQuantity, normalizeUnit } from "../services/unitConversion.service.js";
import type { TokenUser } from "../types/auth.js";

const DAY = 86_400_000;
const iso = (date: Date) => date.toISOString().slice(0, 10);
const utcDate = (value: string) => new Date(`${value}T00:00:00Z`);
const addDays = (value: string, days: number) => iso(new Date(utcDate(value).getTime() + days * DAY));
const differenceInDays = (start: string, end: string) => Math.floor((utcDate(end).getTime() - utcDate(start).getTime()) / DAY);
const round = (value: number, digits = 2) => Number(value.toFixed(digits));
const average = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

type SalesRow = { date: string; sales: number; cogs: number };
type InventoryRow = {
  branchId: string; branchName: string; inventoryItemId: string; sku: string; name: string; unit: string;
  unitCost: number; reorderLevel: number; reorderDays: number; systemStock: number; dailyUsage: number; outstandingQuantity: number;
};
type EvaluationSalesRow = { branchId: string; branchName: string; date: string; sales: number };
type IngredientUsageRow = {
  branchId: string; branchName: string; inventoryItemId: string; name: string; unit: string; inventoryUnit: string; date: string; usage: number;
};
type IncomingOrderRow = {
  branchId: string; inventoryItemId: string; expectedDeliveryDate: string; quantity: number;
};

function groupForecast(rows: { date: string; value: number }[], horizonDays: number) {
  const mode = horizonDays <= 62 ? "day" : horizonDays <= 366 ? "week" : "month";
  const groups = new Map<string, { date: string; value: number }>();
  rows.forEach((row, index) => {
    const date = utcDate(row.date);
    const key = mode === "day" ? row.date
      : mode === "week" ? `week-${Math.floor(index / 7)}`
      : `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
    const current = groups.get(key);
    groups.set(key, { date: row.date, value: (current?.value ?? 0) + row.value });
  });
  return [...groups.values()].map((row) => ({
    date: row.date,
    label: new Intl.DateTimeFormat("en-PH", mode === "month"
      ? { month: "short", year: "numeric", timeZone: "UTC" }
      : { month: "short", day: "numeric", year: horizonDays > 366 ? "numeric" : undefined, timeZone: "UTC" }).format(utcDate(row.date)),
    projectedSales: round(row.value),
  }));
}

function analyticalInsights(input: {
  demandChange: number; forecastDays: number; confidence: string; observedSalesDays: number;
  salesMae: number | null; predictions: { name: string; branchName: string; daysToStockout: number | null; recommendedReorder: number; unit: string }[];
}): DecisionInsight[] {
  const direction = input.demandChange > 1 ? "increase" : input.demandChange < -1 ? "decrease" : "remain broadly stable";
  const insights: DecisionInsight[] = [{
    title: "Projected demand pattern",
    description: `Recorded sales patterns suggest demand may ${direction} by approximately ${Math.abs(input.demandChange).toFixed(1)}% across the selected ${input.forecastDays}-day period. This is an estimate, not a guaranteed outcome.`,
    recommendation: "Compare the projection with promotions, holidays, weather, and planned branch events before making purchasing decisions.",
    urgency: Math.abs(input.demandChange) >= 15 ? "HIGH" : Math.abs(input.demandChange) >= 5 ? "MEDIUM" : "LOW",
  }];
  const atRisk = input.predictions.find((item) => item.daysToStockout !== null && item.daysToStockout <= 7);
  if (atRisk) insights.push({
    title: "Potential stock-out risk",
    description: `${atRisk.name} at ${atRisk.branchName} may reach zero in about ${Math.max(0, Math.ceil(atRisk.daysToStockout!))} day(s) if recent usage continues.`,
    recommendation: `Review available stock, open deliveries, and the suggested ${atRisk.recommendedReorder} ${atRisk.unit} reorder quantity before creating a purchase order.`,
    urgency: "HIGH",
  });
  if (input.salesMae !== null) insights.push({
    title: "Forecast error review",
    description: `Historical evaluation produced a daily sales MAE of ${input.salesMae.toFixed(2)}. Lower MAE means predictions are closer to recorded sales.`,
    recommendation: "Review dates with the largest errors before using the forecast for purchasing decisions.",
    urgency: "LOW",
  });
  if (input.observedSalesDays < 30) insights.push({
    title: "Limited historical coverage",
    description: `Only ${input.observedSalesDays} day(s) with recorded POS sales were available, so the forecast confidence is ${input.confidence.toLowerCase()}.`,
    recommendation: "Import more complete POS history and maintain regular inventory counts to improve later forecasts.",
    urgency: "MEDIUM",
  });
  return insights.slice(0, 4);
}

export async function buildPredictiveForecast(user: TokenUser, rawInput: unknown, options: { includeGemini?: boolean } = {}) {
  const input = predictiveForecastInput.parse(rawInput);
  const branchId = getEffectiveBranchId(user, input.branchId);
  const today = manilaBusinessDate();
  const historyEnd = addDays(today, -1);
  const historyStart = addDays(historyEnd, -364);
  const evaluationHistoryStart = addDays(historyEnd, -394);
  const scopeParams: unknown[] = [historyStart, historyEnd];
  const salesBranchClause = branchId ? `AND pi.branch_id=$${scopeParams.push(branchId)}` : "";
  const inventoryParams: unknown[] = [addDays(historyEnd, -89), historyEnd];
  const inventoryBranchClause = branchId ? `AND b.id=$${inventoryParams.push(branchId)}` : "";
  const shrinkageParams: unknown[] = [historyStart, historyEnd];
  const shrinkageBranchClause = branchId ? `AND sr.branch_id=$${shrinkageParams.push(branchId)}` : "";
  const evaluationParams: unknown[] = [evaluationHistoryStart, historyEnd];
  const evaluationBranchClause = branchId ? `AND pi.branch_id=$${evaluationParams.push(branchId)}` : "";
  const incomingParams: unknown[] = [];
  const incomingBranchClause = branchId ? `AND po.branch_id=$${incomingParams.push(branchId)}` : "";

  const [scope, salesResult, inventoryResult, varianceResult, evaluationSalesResult, ingredientUsageResult, incomingOrderResult] = await Promise.all([
    branchId ? pool.query<{ branchName: string }>(`SELECT name "branchName" FROM branches WHERE id=$1 AND status='ACTIVE'`, [branchId]) : Promise.resolve({ rows: [] }),
    pool.query<SalesRow>(
      `SELECT pi.business_date::text date, sum(psi.quantity_sold*coalesce(psi.unit_price_snapshot,mi.selling_price))::float8 sales,
              coalesce(sum(costs.cogs),0)::float8 cogs
         FROM pos_imports pi JOIN pos_sale_items psi ON psi.pos_import_id=pi.id
         JOIN menu_items mi ON mi.id=psi.menu_item_id
         LEFT JOIN LATERAL (SELECT sum(u.quantity_consumed*u.unit_cost_snapshot)::float8 cogs
           FROM pos_sale_ingredient_usage u WHERE u.pos_sale_item_id=psi.id) costs ON true
        WHERE pi.business_date BETWEEN $1::date AND $2::date ${salesBranchClause}
        GROUP BY pi.business_date ORDER BY pi.business_date`, scopeParams),
    pool.query<InventoryRow>(
      `SELECT b.id "branchId",b.name "branchName",ii.id "inventoryItemId",ii.sku,ii.name,ii.unit,
              coalesce(bis.current_unit_cost,ii.unit_cost)::float8 "unitCost",
              coalesce(bis.reorder_level,ii.reorder_level)::float8 "reorderLevel",
              coalesce(bis.reorder_days,7)::int "reorderDays",
              (coalesce(bal.actual_quantity,0)
                + coalesce((SELECT sum(im.quantity) FROM inventory_movements im WHERE im.branch_id=b.id AND im.inventory_item_id=ii.id AND im.movement_type='RECEIPT' AND im.occurred_at>coalesce(bal.as_of,'1970-01-01'::timestamptz)),0)
                - coalesce((SELECT sum(u.quantity_consumed) FROM pos_sale_ingredient_usage u JOIN pos_sale_items psi ON psi.id=u.pos_sale_item_id JOIN pos_imports pi ON pi.id=psi.pos_import_id WHERE pi.branch_id=b.id AND u.inventory_item_id=ii.id AND pi.business_date>coalesce(bal.as_of::date,'1970-01-01'::date)),0)
                + coalesce((SELECT sum(im.quantity) FROM inventory_movements im WHERE im.branch_id=b.id AND im.inventory_item_id=ii.id AND im.movement_type='APPROVED_ADJUSTMENT_INCREASE' AND im.occurred_at>coalesce(bal.as_of,'1970-01-01'::timestamptz)),0)
                - coalesce((SELECT sum(im.quantity) FROM inventory_movements im WHERE im.branch_id=b.id AND im.inventory_item_id=ii.id AND im.movement_type IN ('APPROVED_ADJUSTMENT','APPROVED_ADJUSTMENT_DECREASE') AND im.occurred_at>coalesce(bal.as_of,'1970-01-01'::timestamptz)),0))::float8 "systemStock",
              coalesce((SELECT avg(recent.daily_usage) FROM (
                SELECT sum(u.quantity_consumed)::float8 daily_usage
                  FROM pos_sale_ingredient_usage u
                  JOIN pos_sale_items psi ON psi.id=u.pos_sale_item_id
                  JOIN pos_imports pi ON pi.id=psi.pos_import_id
                 WHERE pi.branch_id=b.id AND u.inventory_item_id=ii.id
                   AND pi.business_date BETWEEN $1::date AND $2::date
                 GROUP BY pi.business_date
                 ORDER BY pi.business_date DESC
                 LIMIT 28
              ) recent),0)::float8 "dailyUsage",
              coalesce((SELECT sum(poi.quantity_ordered-poi.quantity_received) FROM purchase_order_items poi JOIN purchase_orders po ON po.id=poi.purchase_order_id WHERE po.branch_id=b.id AND poi.inventory_item_id=ii.id AND po.status IN ('ORDERED','PARTIALLY_RECEIVED')),0)::float8 "outstandingQuantity"
         FROM branches b CROSS JOIN inventory_items ii
         LEFT JOIN branch_inventory_balances bal ON bal.branch_id=b.id AND bal.inventory_item_id=ii.id
         LEFT JOIN branch_inventory_settings bis ON bis.branch_id=b.id AND bis.inventory_item_id=ii.id
        WHERE b.status='ACTIVE' AND ii.status='ACTIVE' AND (ii.item_scope='GLOBAL' OR ii.origin_branch_id=b.id) ${inventoryBranchClause}
        ORDER BY b.name,ii.name`, inventoryParams),
    pool.query<{ verifiedShrinkageCost: number }>(
      `SELECT coalesce(sum(greatest(sr.variance_value,0)),0)::float8 "verifiedShrinkageCost"
         FROM shrinkage_reports sr
        WHERE sr.detected_at::date BETWEEN $1::date AND $2::date
          AND sr.status IN ('VERIFIED', 'REVIEWED')
          AND sr.classification IN (${VERIFIED_SHRINKAGE_CLASSIFICATIONS_SQL})
          ${shrinkageBranchClause}`, shrinkageParams),
    pool.query<EvaluationSalesRow>(
      `SELECT pi.branch_id "branchId",b.name "branchName",pi.business_date::text date,
              sum(psi.quantity_sold*coalesce(psi.unit_price_snapshot,mi.selling_price))::float8 sales
         FROM pos_imports pi
         JOIN branches b ON b.id=pi.branch_id
         JOIN pos_sale_items psi ON psi.pos_import_id=pi.id
         JOIN menu_items mi ON mi.id=psi.menu_item_id
        WHERE pi.business_date BETWEEN $1::date AND $2::date ${evaluationBranchClause}
        GROUP BY pi.branch_id,b.name,pi.business_date
        ORDER BY pi.branch_id,pi.business_date`, evaluationParams),
    pool.query<IngredientUsageRow>(
      `SELECT pi.branch_id "branchId",b.name "branchName",usage.inventory_item_id "inventoryItemId",
              ii.name,usage.unit,ii.unit "inventoryUnit",pi.business_date::text date,sum(usage.quantity_consumed)::float8 usage
         FROM pos_sale_ingredient_usage usage
         JOIN pos_sale_items psi ON psi.id=usage.pos_sale_item_id
         JOIN pos_imports pi ON pi.id=psi.pos_import_id
         JOIN branches b ON b.id=pi.branch_id
         JOIN inventory_items ii ON ii.id=usage.inventory_item_id
        WHERE pi.business_date BETWEEN $1::date AND $2::date ${evaluationBranchClause}
         GROUP BY pi.branch_id,b.name,usage.inventory_item_id,ii.name,usage.unit,ii.unit,pi.business_date
        ORDER BY pi.branch_id,usage.inventory_item_id,pi.business_date`, evaluationParams),
    pool.query<IncomingOrderRow>(
      `SELECT po.branch_id "branchId",poi.inventory_item_id "inventoryItemId",
              po.expected_delivery_date::text "expectedDeliveryDate",
              sum(poi.quantity_ordered-poi.quantity_received)::float8 quantity
         FROM purchase_orders po
         JOIN purchase_order_items poi ON poi.purchase_order_id=po.id
        WHERE po.status IN ('ORDERED','PARTIALLY_RECEIVED')
          AND poi.quantity_ordered>poi.quantity_received ${incomingBranchClause}
        GROUP BY po.branch_id,poi.inventory_item_id,po.expected_delivery_date`, incomingParams),
  ]);

  const branchName = branchId ? scope.rows[0]?.branchName ?? "Assigned Branch" : "All Branches";
  const salesRows = salesResult.rows.map((row) => ({ ...row, sales: Number(row.sales), cogs: Number(row.cogs) }));
  const salesGroups = new Map<string, { branchId: string; branchName: string; rows: { date: string; value: number }[] }>();
  evaluationSalesResult.rows.forEach((row) => {
    const group = salesGroups.get(row.branchId) ?? { branchId: row.branchId, branchName: row.branchName, rows: [] };
    group.rows.push({ date: row.date, value: Number(row.sales) });
    salesGroups.set(row.branchId, group);
  });
  const salesAccuracyByBranch = [...salesGroups.values()].map((group) => ({
    branchId: group.branchId,
    branchName: group.branchName,
    ...evaluateSalesMae(group.rows),
  }));
  const overallSalesAccuracy = combineAccuracySummaries(salesAccuracyByBranch);

  const ingredientGroups = new Map<string, {
    branchId: string; branchName: string; inventoryItemId: string; name: string; units: Set<string>; rows: { date: string; value: number }[];
  }>();
  ingredientUsageResult.rows.forEach((row) => {
    const key = `${row.branchId}:${row.inventoryItemId}`;
    const group = ingredientGroups.get(key) ?? {
      branchId: row.branchId, branchName: row.branchName, inventoryItemId: row.inventoryItemId,
      name: row.name, units: new Set<string>(), rows: [],
    };
    const normalizedUnit=normalizeUnit(row.inventoryUnit);
    group.units.add(normalizedUnit);
    try {
      const converted=convertQuantity(Number(row.usage),row.unit,normalizedUnit);
      const existing=group.rows.find((item)=>item.date===row.date);
      if(existing)existing.value+=converted;else group.rows.push({ date: row.date, value: converted });
    } catch {
      group.units.add(`incompatible:${row.unit}`);
    }
    ingredientGroups.set(key, group);
  });
  const ingredientAccuracy = [...ingredientGroups.values()].map((group) => ({
    branchId: group.branchId,
    branchName: group.branchName,
    inventoryItemId: group.inventoryItemId,
    name: group.name,
    unit: group.units.size === 1 ? [...group.units][0]! : [...group.units].join(", "),
    ...evaluateIngredientMae({ observations: group.rows, units: [...group.units] }),
  }));
  const incomingByItem = new Map<string, IncomingDelivery[]>();
  incomingOrderResult.rows.forEach((row) => {
    const key = `${row.branchId}:${row.inventoryItemId}`;
    const deliveries = incomingByItem.get(key) ?? [];
    deliveries.push({ expectedDeliveryDate: row.expectedDeliveryDate, quantity: Number(row.quantity) });
    incomingByItem.set(key, deliveries);
  });
  const observedSalesDays = salesRows.length;
  const recent = salesRows.slice(-28).map((row) => row.sales);
  const prior = salesRows.slice(-56, -28).map((row) => row.sales);
  const baselineDailySales = average(recent);
  const priorDailySales = average(prior) || baselineDailySales;
  const periodTrend = priorDailySales > 0 ? clamp((baselineDailySales - priorDailySales) / priorDailySales, -0.25, 0.25) : 0;
  const weekdayAverages = Array.from({ length: 7 }, (_, weekday) => average(salesRows.filter((row) => utcDate(row.date).getUTCDay() === weekday).map((row) => row.sales)));
  const overallAverage = average(salesRows.map((row) => row.sales));
  const forecastDays = differenceInDays(input.startDate, input.endDate) + 1;
  const inventoryCoverageDays = Math.max(1, differenceInDays(today, input.endDate) + 1);
  const futureDaily = Array.from({ length: forecastDays }, (_, index) => {
    const date = addDays(input.startDate, index);
    const offset = differenceInDays(today, date);
    const weekdayAverage = weekdayAverages[utcDate(date).getUTCDay()] || overallAverage || baselineDailySales;
    const weekdayFactor = overallAverage > 0 ? clamp(weekdayAverage / overallAverage, 0.6, 1.4) : 1;
    const attenuatedTrend = 1 + periodTrend * Math.min(Math.max(offset, 0) / 28, 4);
    return { date, value: Math.max(0, baselineDailySales * weekdayFactor * Math.max(0.25, attenuatedTrend)) };
  });
  const forecastSales = futureDaily.reduce((sum, row) => sum + row.value, 0);
  const flatBaselineSales = baselineDailySales * forecastDays;
  const demandChange = flatBaselineSales > 0 ? ((forecastSales - flatBaselineSales) / flatBaselineSales) * 100 : 0;
  const historicalSales = salesRows.slice(-30).map((row) => ({
    date: row.date,
    label: new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", timeZone: "UTC" }).format(utcDate(row.date)),
    actualSales: round(row.sales),
  }));
  const projectedDemand = groupForecast(futureDaily, forecastDays);

  const inventory = inventoryResult.rows.map((row) => {
    const stock = Math.max(0, Number(row.systemStock));
    const dailyUsage = Math.max(0, Number(row.dailyUsage));
    const deliveries = incomingByItem.get(`${row.branchId}:${row.inventoryItemId}`) ?? [];
    const supply = projectStockAvailability({
      currentStock: stock,
      dailyUsage,
      projectionStart: today,
      projectionEnd: input.endDate,
      incomingDeliveries: deliveries,
    });
    const outstandingQuantity = supply.confirmedIncomingQuantity;
    const reorderLevel = Number(row.reorderLevel);
    const daysToStockout = supply.daysToStockout;
    const recommendedReorder = Math.max(0, Math.ceil(dailyUsage * inventoryCoverageDays + reorderLevel - stock - supply.incomingByEnd));
    return {
      ...row, systemStock: round(stock), dailyUsage: round(dailyUsage, 3), outstandingQuantity: round(outstandingQuantity),
      daysToStockout: daysToStockout === null ? null : round(daysToStockout, 1),
      nextDeliveryDate: supply.nextDeliveryDate,
      projectedEndStock: round(supply.projectedEndStock), recommendedReorder,
      incomingDeliveries: deliveries,
      urgency: daysToStockout !== null && daysToStockout <= 7 ? "HIGH" as const : recommendedReorder > 0 ? "MEDIUM" as const : "LOW" as const,
    };
  }).sort((a, b) => (a.daysToStockout ?? Number.MAX_VALUE) - (b.daysToStockout ?? Number.MAX_VALUE));
  const predictions = inventory.filter((row) => row.dailyUsage > 0 || row.systemStock <= row.reorderLevel).slice(0, 20);
  const inventoryChartItems = predictions.slice(0, 3);
  const inventorySeries = projectedDemand.map((point) => {
    return {
      date: point.date, label: point.label,
      values: inventoryChartItems.map((item) => ({
        key: `${item.inventoryItemId}-${item.branchId}`, name: `${item.name} · ${item.branchName}`, unit: item.unit,
        value: round(projectedStockOnDate({
          currentStock: item.systemStock,
          dailyUsage: item.dailyUsage,
          projectionStart: today,
          targetDate: point.date,
          incomingDeliveries: item.incomingDeliveries,
        })),
      })),
    };
  });

  const historicalSalesTotal = salesRows.reduce((sum, row) => sum + row.sales, 0);
  const historicalCogsTotal = salesRows.reduce((sum, row) => sum + row.cogs, 0);
  const cogsRate = historicalSalesTotal > 0 ? historicalCogsTotal / historicalSalesTotal : 0;
  const verifiedShrinkageCost = Number(varianceResult.rows[0]?.verifiedShrinkageCost ?? 0);
  // Deprecated compatibility metric. It is not presented as a primary analytical output.
  const shrinkageRate = historicalSalesTotal > 0 ? (verifiedShrinkageCost / historicalSalesTotal) * 100 : 0;
  const confidence = observedSalesDays >= 90 && forecastDays <= 90 ? "HIGH" : observedSalesDays >= 30 && forecastDays <= 366 ? "MEDIUM" : "LOW";
  const findings = {
    scope: branchName, forecastStart: input.startDate, forecastEnd: input.endDate, forecastDays,
    observedSalesDays, baselineDailySales: round(baselineDailySales), forecastSales: round(forecastSales),
    demandChangePercent: round(demandChange), historicalCogsRatePercent: round(cogsRate * 100),
    salesMae: overallSalesAccuracy.mae,
    evaluatedSalesDays: overallSalesAccuracy.evaluatedDays,
    largestSalesError: overallSalesAccuracy.observations.length
      ? Math.max(...overallSalesAccuracy.observations.map((row) => row.absoluteError))
      : null,
    confidence,
    stockRisks: predictions.slice(0, 5).map((row) => ({ branch: row.branchName, ingredient: row.name, daysToStockout: row.daysToStockout, suggestedReorder: row.recommendedReorder, unit: row.unit })),
  };
  const fallbackInsights = analyticalInsights({ demandChange, forecastDays, confidence, observedSalesDays, salesMae: overallSalesAccuracy.mae, predictions });
  const geminiInsights = options.includeGemini === false ? null : await generateGeminiInsights(findings);

  return {
    scope: { branchId: branchId ?? null, branchName, forecastStart: input.startDate, forecastEnd: input.endDate },
    methodology: {
      historicalStart: historyStart, historicalEnd: historyEnd, observedSalesDays, confidence,
      insightSource: geminiInsights ? "GOOGLE_GEMINI" : "SYSTEM_ANALYSIS",
      salesMaeMethod: "Each tested branch-day uses only sales records dated before that day; overall MAE uses all underlying branch observations.",
      ingredientMaeMethod: "Each tested ingredient day uses only earlier recipe-derived usage records with the same unit; dates without recorded actual usage are not inserted as zero.",
      stockProjectionAssumption: "Only unreceived quantities from ordered or partially received purchase orders are considered, and they affect projected supply no earlier than their expected delivery date. Overdue expected deliveries are not assumed available.",
      disclaimer: "Forecasts are estimates based on recorded historical patterns. They support, but do not replace, management judgment and do not automatically create purchase orders or change inventory.",
    },
    summary: {
      forecastSales: round(forecastSales), demandChange: round(demandChange), criticalItems: predictions.filter((row) => row.urgency === "HIGH").length,
      // Deprecated compatibility field; no longer shown as a KPI.
      projectedCogs: round(forecastSales * cogsRate), projectedShrinkageRate: round(shrinkageRate),
      recommendedReorders: predictions.filter((row) => row.recommendedReorder > 0).length,
    },
    accuracy: {
      sales: { overall: overallSalesAccuracy, branches: salesAccuracyByBranch },
      ingredients: ingredientAccuracy,
    },
    demandSeries: [...historicalSales, ...projectedDemand],
    inventorySeries,
    inventoryChartItems: inventoryChartItems.map((row) => ({ key: `${row.inventoryItemId}-${row.branchId}`, name: `${row.name} · ${row.branchName}`, unit: row.unit })),
    predictions,
    insights: geminiInsights ?? fallbackInsights,
  };
}

export const generatePredictiveForecast: RequestHandler = async (req, res) => {
  res.json({ success: true, data: await buildPredictiveForecast(req.user!, req.body) });
};
