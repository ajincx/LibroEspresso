import type { RequestHandler } from "express";
import { pool } from "../config/database.js";
import { getEffectiveBranchId } from "../services/branchScope.js";
import { generateGeminiInsights, type DecisionInsight } from "../services/geminiInsights.service.js";
import {
  buildShrinkageRateForecast,
  combineBranchShrinkageRates,
  combineAccuracySummaries,
  evaluateCogsMae,
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
import { inventoryLedgerKey, loadInventoryLedgerBalances } from "../services/inventoryLedger.service.js";
import type { TokenUser } from "../types/auth.js";

const DAY = 86_400_000;
const iso = (date: Date) => date.toISOString().slice(0, 10);
const utcDate = (value: string) => new Date(`${value}T00:00:00Z`);
const addDays = (value: string, days: number) => iso(new Date(utcDate(value).getTime() + days * DAY));
const differenceInDays = (start: string, end: string) => Math.floor((utcDate(end).getTime() - utcDate(start).getTime()) / DAY);
const round = (value: number, digits = 2) => Number(value.toFixed(digits));
const average = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

type SalesRow = { branchId: string; branchName: string; date: string; sales: number; cogs: number };
type InventoryRow = {
  branchId: string; branchName: string; inventoryItemId: string; sku: string; name: string; unit: string;
  unitCost: number; reorderLevel: number; reorderDays: number; dailyUsage: number; outstandingQuantity: number;
};
type EvaluationSalesRow = { branchId: string; branchName: string; date: string; sales: number; cogs: number };
type IngredientUsageRow = {
  branchId: string; branchName: string; inventoryItemId: string; name: string; unit: string; inventoryUnit: string; date: string; usage: number;
};
type IncomingOrderRow = {
  branchId: string; inventoryItemId: string; expectedDeliveryDate: string; quantity: number;
};
type ShrinkageWeeklyRow = {
  branchId: string; branchName: string; weekStart: string; sales: number; shrinkageCost: number;
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

const MIN_FORECAST_HISTORY_DAYS = 28;
const COMPARISON_WINDOW_DAYS = 28;

export function buildBranchSalesProjection(
  rows: { date: string; value: number }[],
  startDate: string,
  endDate: string,
  today: string,
) {
  const sorted = [...rows].sort((left, right) => left.date.localeCompare(right.date));
  const recent = sorted.slice(-MIN_FORECAST_HISTORY_DAYS).map((row) => row.value);
  const prior = sorted.slice(-(MIN_FORECAST_HISTORY_DAYS + COMPARISON_WINDOW_DAYS), -MIN_FORECAST_HISTORY_DAYS).map((row) => row.value);
  const baseline = average(recent);
  const priorAverage = average(prior) || baseline;
  const trend = priorAverage > 0 ? clamp((baseline - priorAverage) / priorAverage, -0.25, 0.25) : 0;
  const overallAverage = average(sorted.map((row) => row.value));
  const weekdayAverages = Array.from({ length: 7 }, (_, weekday) => average(
    sorted.filter((row) => utcDate(row.date).getUTCDay() === weekday).map((row) => row.value),
  ));
  const days = differenceInDays(startDate, endDate) + 1;
  const daily = Array.from({ length: days }, (_, index) => {
    const date = addDays(startDate, index);
    const weekdayAverage = weekdayAverages[utcDate(date).getUTCDay()] || overallAverage || baseline;
    const weekdayFactor = overallAverage > 0 ? clamp(weekdayAverage / overallAverage, 0.6, 1.4) : 1;
    const offset = differenceInDays(today, date);
    const attenuatedTrend = 1 + trend * Math.min(Math.max(offset, 0) / 28, 4);
    return { date, value: Math.max(0, baseline * weekdayFactor * Math.max(0.25, attenuatedTrend)) };
  });
  return {
    observedDays: sorted.length,
    baseline,
    recentDays: recent.length,
    priorDays: prior.length,
    forecastReady: recent.length >= MIN_FORECAST_HISTORY_DAYS,
    comparisonReady: recent.length === MIN_FORECAST_HISTORY_DAYS && prior.length === COMPARISON_WINDOW_DAYS,
    daily,
    forecastSales: daily.reduce((sum, row) => sum + row.value, 0),
    flatBaselineSales: baseline * days,
  };
}

export function summarizeInventoryPredictions<T extends { dailyUsage: number; systemStock: number; reorderLevel: number; urgency: string; recommendedReorder: number }>(inventory: T[]) {
  const eligible = inventory.filter((row) => row.dailyUsage > 0 || row.systemStock <= row.reorderLevel);
  return {
    details: eligible.slice(0, 20),
    criticalItems: eligible.filter((row) => row.urgency === "HIGH").length,
    recommendedReorders: eligible.filter((row) => row.recommendedReorder > 0).length,
  };
}

function forecastSalesTotalForRange(
  rows: { date: string; value: number }[],
  startDate: string,
  endDate: string,
  today: string,
) {
  return buildBranchSalesProjection(rows, startDate, endDate, today).forecastSales;
}

function analyticalInsights(input: {
  demandChange: number | null; forecastDays: number; confidence: string; observedSalesDays: number;
  salesMae: number | null; predictions: { name: string; branchName: string; daysToStockout: number | null; recommendedReorder: number; unit: string }[];
}): DecisionInsight[] {
  const direction = (input.demandChange ?? 0) > 1 ? "increase" : (input.demandChange ?? 0) < -1 ? "decrease" : "remain broadly stable";
  const insights: DecisionInsight[] = [{
    title: "Projected demand pattern",
    description: input.demandChange === null
      ? `A demand-change percentage is unavailable because a complete earlier comparison window has not yet been recorded for the selected scope.`
      : `Recorded sales patterns suggest demand may ${direction} by approximately ${Math.abs(input.demandChange).toFixed(1)}% across the selected ${input.forecastDays}-day period. This is an estimate, not a guaranteed outcome.`,
    recommendation: "Compare the projection with promotions, holidays, weather, and planned branch events before making purchasing decisions.",
    urgency: input.demandChange !== null && Math.abs(input.demandChange) >= 15 ? "HIGH" : input.demandChange !== null && Math.abs(input.demandChange) >= 5 ? "MEDIUM" : "LOW",
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
  const shrinkageParams: unknown[] = [evaluationHistoryStart, historyEnd];
  const shrinkageCountBranchClause = branchId ? `AND ic.branch_id=$${shrinkageParams.push(branchId)}` : "";
  const shrinkageSalesBranchClause = branchId ? `AND pi.branch_id=$${shrinkageParams.length}` : "";
  const evaluationParams: unknown[] = [evaluationHistoryStart, historyEnd];
  const evaluationBranchClause = branchId ? `AND pi.branch_id=$${evaluationParams.push(branchId)}` : "";
  const incomingParams: unknown[] = [];
  const incomingBranchClause = branchId ? `AND po.branch_id=$${incomingParams.push(branchId)}` : "";

  // --- HISTORICAL SALES DATA FOR FORECASTING ---
  // Uses historical POS sales and recipe-derived ingredient usage per branch.
  const [scope, salesResult, inventoryResult, shrinkageWeeklyResult, evaluationSalesResult, ingredientUsageResult, incomingOrderResult] = await Promise.all([
    branchId ? pool.query<{ branchName: string }>(`SELECT name "branchName" FROM branches WHERE id=$1 AND status='ACTIVE'`, [branchId]) : Promise.resolve({ rows: [] }),
    pool.query<SalesRow>(
      `SELECT pi.branch_id "branchId",b.name "branchName",pi.business_date::text date,
              sum(psi.quantity_sold*coalesce(psi.unit_price_snapshot,mi.selling_price))::float8 sales,
              coalesce(sum(costs.cogs),0)::float8 cogs
         FROM pos_imports pi JOIN branches b ON b.id=pi.branch_id
         JOIN pos_sources source ON source.id=pi.pos_source_id
         JOIN pos_sale_items psi ON psi.pos_import_id=pi.id
         JOIN menu_items mi ON mi.id=psi.menu_item_id
         LEFT JOIN LATERAL (SELECT sum(u.quantity_consumed*u.unit_cost_snapshot)::float8 cogs
           FROM pos_sale_ingredient_usage u WHERE u.pos_sale_item_id=psi.id) costs ON true
        WHERE NOT pi.is_test_data AND pi.voided_at IS NULL AND pi.business_date BETWEEN $1::date AND $2::date ${salesBranchClause}
        GROUP BY pi.branch_id,b.name,pi.business_date ORDER BY pi.branch_id,pi.business_date`, scopeParams),
    pool.query<InventoryRow>(
      `SELECT b.id "branchId",b.name "branchName",ii.id "inventoryItemId",ii.sku,ii.name,ii.unit,
              coalesce(bis.current_unit_cost,ii.unit_cost)::float8 "unitCost",
              coalesce(bis.reorder_level,ii.reorder_level)::float8 "reorderLevel",
              coalesce(bis.reorder_days,7)::int "reorderDays",
              coalesce((SELECT avg(recent.daily_usage) FROM (
                SELECT sum(u.quantity_consumed)::float8 daily_usage
                  FROM pos_sale_ingredient_usage u
                  JOIN pos_sale_items psi ON psi.id=u.pos_sale_item_id
                  JOIN pos_imports pi ON pi.id=psi.pos_import_id
                   JOIN pos_sources source ON source.id=pi.pos_source_id
                 WHERE pi.branch_id=b.id AND u.inventory_item_id=ii.id AND NOT pi.is_test_data AND pi.voided_at IS NULL
                   AND pi.business_date BETWEEN $1::date AND $2::date
                 GROUP BY pi.business_date
                 ORDER BY pi.business_date DESC
                 LIMIT 28
              ) recent),0)::float8 "dailyUsage",
              coalesce((SELECT sum((poi.quantity_ordered-poi.quantity_received)*poi.conversion_factor) FROM purchase_order_items poi JOIN purchase_orders po ON po.id=poi.purchase_order_id WHERE po.branch_id=b.id AND NOT po.is_test_data AND poi.inventory_item_id=ii.id AND po.status IN ('ORDERED','PARTIALLY_RECEIVED')),0)::float8 "outstandingQuantity"
         FROM branches b CROSS JOIN inventory_items ii
         LEFT JOIN branch_inventory_settings bis ON bis.branch_id=b.id AND bis.inventory_item_id=ii.id
        WHERE b.status='ACTIVE' AND ii.status='ACTIVE' AND (ii.item_scope='GLOBAL' OR ii.origin_branch_id=b.id) ${inventoryBranchClause}
        ORDER BY b.name,ii.name`, inventoryParams),
    // Weekly shrinkage evidence is aligned by the Manila business dates stored
    // on counts/imports. FULL counts are complete by workflow. A CLOSING count
    // is eligible only when every currently provable branch ingredient appears.
    // Weeks with unresolved/count-error evidence are omitted rather than
    // interpreted as zero shrinkage.
    pool.query<ShrinkageWeeklyRow>(
      `WITH candidate_count_weeks AS (
         SELECT ic.branch_id,
                (ic.count_date-(extract(isodow from ic.count_date)::int-1))::date week_start,
                count(*)::int candidate_count
           FROM inventory_counts ic
          WHERE NOT ic.is_test_data
            AND ic.count_date BETWEEN $1::date AND $2::date
            AND ic.count_type IN ('FULL','CLOSING')
            ${shrinkageCountBranchClause}
          GROUP BY ic.branch_id,week_start
       ), eligible_counts AS (
         SELECT ic.id,ic.branch_id,ic.count_date
           FROM inventory_counts ic
          WHERE NOT ic.is_test_data
            AND ic.count_date BETWEEN $1::date AND $2::date
            AND ic.count_type IN ('FULL','CLOSING')
            ${shrinkageCountBranchClause}
            AND EXISTS (SELECT 1 FROM inventory_count_items present WHERE present.inventory_count_id=ic.id AND present.voided_at IS NULL)
            AND NOT EXISTS (SELECT 1 FROM inventory_count_items voided WHERE voided.inventory_count_id=ic.id AND voided.voided_at IS NOT NULL)
            AND (
              ic.count_type='FULL'
              OR NOT EXISTS (
                SELECT 1 FROM inventory_items required
                 WHERE required.status='ACTIVE'
                   AND (required.item_scope='GLOBAL' OR required.origin_branch_id=ic.branch_id)
                   AND NOT EXISTS (
                     SELECT 1 FROM inventory_count_items covered
                      WHERE covered.inventory_count_id=ic.id
                        AND covered.inventory_item_id=required.id
                        AND covered.voided_at IS NULL
                   )
              )
            )
            AND NOT EXISTS (
              SELECT 1 FROM inventory_count_items item
              JOIN shrinkage_reports unresolved ON unresolved.inventory_count_item_id=item.id
               WHERE item.inventory_count_id=ic.id
                 AND (unresolved.is_test_data
                   OR unresolved.status NOT IN ('VERIFIED','REVIEWED')
                   OR unresolved.classification='COUNT_ERROR')
            )
       ), count_weeks AS (
         SELECT ec.branch_id,
                (ec.count_date-(extract(isodow from ec.count_date)::int-1))::date week_start,
                max(ec.count_date) checkpoint_date,
                count(DISTINCT ec.id)::int eligible_count,
                coalesce(sum(CASE WHEN sr.status IN ('VERIFIED','REVIEWED')
                                    AND NOT sr.is_test_data
                                    AND sr.classification IN (${VERIFIED_SHRINKAGE_CLASSIFICATIONS_SQL})
                                    AND sr.actual_quantity<sr.expected_quantity
                                  THEN abs(sr.variance_value) ELSE 0 END),0)::float8 shrinkage_cost
           FROM eligible_counts ec
           JOIN inventory_count_items ici ON ici.inventory_count_id=ec.id AND ici.voided_at IS NULL
           LEFT JOIN shrinkage_reports sr ON sr.inventory_count_item_id=ici.id
          GROUP BY ec.branch_id,week_start
       ), sales_weeks AS (
         SELECT pi.branch_id,
                (pi.business_date-(extract(isodow from pi.business_date)::int-1))::date week_start,
                max(pi.business_date) last_sales_date,
                sum(psi.quantity_sold*coalesce(psi.unit_price_snapshot,mi.selling_price))::float8 sales
           FROM pos_imports pi
           JOIN pos_sources source ON source.id=pi.pos_source_id
           JOIN pos_sale_items psi ON psi.pos_import_id=pi.id
           JOIN menu_items mi ON mi.id=psi.menu_item_id
          WHERE NOT pi.is_test_data AND pi.voided_at IS NULL
            AND pi.business_date BETWEEN $1::date AND $2::date
            ${shrinkageSalesBranchClause}
          GROUP BY pi.branch_id,week_start
       )
       SELECT cw.branch_id "branchId",b.name "branchName",cw.week_start::text "weekStart",
              sw.sales,cw.shrinkage_cost "shrinkageCost"
         FROM count_weeks cw
         JOIN candidate_count_weeks candidate ON candidate.branch_id=cw.branch_id
          AND candidate.week_start=cw.week_start AND candidate.candidate_count=cw.eligible_count
         JOIN sales_weeks sw ON sw.branch_id=cw.branch_id AND sw.week_start=cw.week_start
         JOIN branches b ON b.id=cw.branch_id
        WHERE sw.sales>0 AND cw.checkpoint_date>=sw.last_sales_date
          AND cw.week_start+6<=$2::date
        ORDER BY cw.branch_id,cw.week_start`, shrinkageParams),
    pool.query<EvaluationSalesRow>(
      `SELECT pi.branch_id "branchId",b.name "branchName",pi.business_date::text date,
              sum(psi.quantity_sold*coalesce(psi.unit_price_snapshot,mi.selling_price))::float8 sales,
              coalesce(sum(daily_cogs.total_cogs),0)::float8 cogs
         FROM pos_imports pi
         JOIN branches b ON b.id=pi.branch_id
         JOIN pos_sources source ON source.id=pi.pos_source_id
         JOIN pos_sale_items psi ON psi.pos_import_id=pi.id
         JOIN menu_items mi ON mi.id=psi.menu_item_id
         LEFT JOIN LATERAL (SELECT sum(u.quantity_consumed*u.unit_cost_snapshot)::float8 total_cogs
           FROM pos_sale_ingredient_usage u WHERE u.pos_sale_item_id=psi.id) daily_cogs ON true
        WHERE NOT pi.is_test_data AND pi.voided_at IS NULL AND pi.business_date BETWEEN $1::date AND $2::date ${evaluationBranchClause}
        GROUP BY pi.branch_id,b.name,pi.business_date
        ORDER BY pi.branch_id,pi.business_date`, evaluationParams),
    pool.query<IngredientUsageRow>(
      `SELECT pi.branch_id "branchId",b.name "branchName",usage.inventory_item_id "inventoryItemId",
              ii.name,usage.unit,ii.unit "inventoryUnit",pi.business_date::text date,sum(usage.quantity_consumed)::float8 usage
         FROM pos_sale_ingredient_usage usage
         JOIN pos_sale_items psi ON psi.id=usage.pos_sale_item_id
         JOIN pos_imports pi ON pi.id=psi.pos_import_id
          JOIN pos_sources source ON source.id=pi.pos_source_id
         JOIN branches b ON b.id=pi.branch_id
         JOIN inventory_items ii ON ii.id=usage.inventory_item_id
        WHERE NOT pi.is_test_data AND pi.voided_at IS NULL AND pi.business_date BETWEEN $1::date AND $2::date ${evaluationBranchClause}
         GROUP BY pi.branch_id,b.name,usage.inventory_item_id,ii.name,usage.unit,ii.unit,pi.business_date
        ORDER BY pi.branch_id,usage.inventory_item_id,pi.business_date`, evaluationParams),
    pool.query<IncomingOrderRow>(
      `SELECT po.branch_id "branchId",poi.inventory_item_id "inventoryItemId",
              po.expected_delivery_date::text "expectedDeliveryDate",
              sum((poi.quantity_ordered-poi.quantity_received)*poi.conversion_factor)::float8 quantity
         FROM purchase_orders po
         JOIN purchase_order_items poi ON poi.purchase_order_id=po.id
        WHERE NOT po.is_test_data AND po.status IN ('ORDERED','PARTIALLY_RECEIVED')
          AND poi.quantity_ordered>poi.quantity_received ${incomingBranchClause}
        GROUP BY po.branch_id,poi.inventory_item_id,po.expected_delivery_date`, incomingParams),
  ]);

  const inventoryLedgers = await loadInventoryLedgerBalances(pool, inventoryResult.rows.map((row) => ({
    branchId: row.branchId,
    inventoryItemId: row.inventoryItemId,
    canonicalUnit: row.unit,
  })));

  const branchName = branchId ? scope.rows[0]?.branchName ?? "Assigned Branch" : "All Branches";
  const salesRows = salesResult.rows.map((row) => ({ ...row, sales: Number(row.sales), cogs: Number(row.cogs) }));
  const forecastSalesGroups = new Map<string, { branchId: string; branchName: string; rows: { date: string; value: number }[]; financialRows: { date: string; sales: number; cogs: number }[] }>();
  salesRows.forEach((row) => {
    const group = forecastSalesGroups.get(row.branchId) ?? { branchId: row.branchId, branchName: row.branchName, rows: [], financialRows: [] };
    group.rows.push({ date: row.date, value: row.sales });
    group.financialRows.push({ date: row.date, sales: row.sales, cogs: row.cogs });
    forecastSalesGroups.set(row.branchId, group);
  });
  const evaluationSalesGroups = new Map<string, { branchId: string; branchName: string; rows: { date: string; value: number }[]; financialRows: { date: string; sales: number; cogs: number }[] }>();
  evaluationSalesResult.rows.forEach((row) => {
    const group = evaluationSalesGroups.get(row.branchId) ?? { branchId: row.branchId, branchName: row.branchName, rows: [], financialRows: [] };
    group.rows.push({ date: row.date, value: Number(row.sales) });
    group.financialRows.push({ date: row.date, sales: Number(row.sales), cogs: Number(row.cogs) });
    evaluationSalesGroups.set(row.branchId, group);
  });
  const salesAccuracyByBranch = [...evaluationSalesGroups.values()].map((group) => ({
    branchId: group.branchId,
    branchName: group.branchName,
    ...evaluateSalesMae(group.rows),
  }));
  const overallSalesAccuracy = combineAccuracySummaries(salesAccuracyByBranch);
  const cogsAccuracyByBranch = [...evaluationSalesGroups.values()].map((group) => ({
    branchId: group.branchId,
    branchName: group.branchName,
    ...evaluateCogsMae(group.financialRows),
  }));
  const overallCogsAccuracy = combineAccuracySummaries(cogsAccuracyByBranch);

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
  // --- SALES FORECAST LOGIC ---
  // Each branch is projected independently so uneven branch coverage cannot
  // distort an Owner all-branch forecast. The resulting daily values are summed.
  const forecastDays = differenceInDays(input.startDate, input.endDate) + 1;
  const inventoryCoverageDays = Math.max(1, differenceInDays(today, input.endDate) + 1);
  const branchSalesProjections = [...forecastSalesGroups.values()].map((group) => {
    const projection = buildBranchSalesProjection(group.rows, input.startDate, input.endDate, today);
    const sales = group.financialRows.reduce((sum, row) => sum + row.sales, 0);
    const cogs = group.financialRows.reduce((sum, row) => sum + row.cogs, 0);
    return { ...group, ...projection, cogsRate: sales > 0 ? cogs / sales : 0 };
  });
  const observedSalesDays = branchSalesProjections.length
    ? Math.min(...branchSalesProjections.map((row) => row.observedDays))
    : 0;
  const forecastReady = branchSalesProjections.length > 0 && branchSalesProjections.every((row) => row.forecastReady);
  const priorComparisonAvailable = branchSalesProjections.length > 0 && branchSalesProjections.every((row) => row.comparisonReady);
  const baselineDailySales = branchSalesProjections.reduce((sum, row) => sum + row.baseline, 0);
  const futureByDate = new Map<string, number>();
  branchSalesProjections.forEach((branch) => branch.daily.forEach((row) => {
    futureByDate.set(row.date, (futureByDate.get(row.date) ?? 0) + row.value);
  }));
  const futureDaily = [...futureByDate.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([date, value]) => ({ date, value }));
  const forecastSales = branchSalesProjections.reduce((sum, row) => sum + row.forecastSales, 0);
  const projectedCogs = branchSalesProjections.reduce((sum, row) => sum + row.forecastSales * row.cogsRate, 0);
  const shrinkageGroups = new Map<string, { branchId: string; branchName: string; observations: { weekStart: string; sales: number; shrinkageCost: number }[] }>();
  shrinkageWeeklyResult.rows.forEach((row) => {
    const group = shrinkageGroups.get(row.branchId) ?? {
      branchId: row.branchId,
      branchName: row.branchName,
      observations: [],
    };
    group.observations.push({
      weekStart: row.weekStart,
      sales: Number(row.sales),
      shrinkageCost: Number(row.shrinkageCost),
    });
    shrinkageGroups.set(row.branchId, group);
  });
  const shrinkageBranchForecasts = [...forecastSalesGroups.values()].map((salesGroup) => {
    const weekly = shrinkageGroups.get(salesGroup.branchId);
    const projectedSales = forecastSalesTotalForRange(
      salesGroup.rows,
      input.startDate,
      input.endDate,
      today,
    );
    const rateForecast = buildShrinkageRateForecast({
      observations: weekly?.observations ?? [],
      targetDate: input.startDate,
      horizonDays: forecastDays,
    });
    return {
      branchId: salesGroup.branchId,
      branchName: salesGroup.branchName,
      projectedSales: round(projectedSales),
      ...rateForecast,
    };
  });
  const supportedShrinkageHorizon = forecastDays >= 7 && forecastDays <= 28;
  const allShrinkageBranchesAvailable = shrinkageBranchForecasts.length > 0 &&
    shrinkageBranchForecasts.every((row) => row.status === "AVAILABLE" && row.projectedRate !== null && row.projectedSales > 0);
  const shrinkageForecastStatus = !supportedShrinkageHorizon
    ? "UNSUPPORTED_HORIZON" as const
    : allShrinkageBranchesAvailable
      ? "AVAILABLE" as const
      : "INSUFFICIENT_HISTORICAL_DATA" as const;
  const projectedShrinkageRate = allShrinkageBranchesAvailable
    ? combineBranchShrinkageRates(shrinkageBranchForecasts)
    : null;
  const projectedShrinkageCost = projectedShrinkageRate === null
    ? null
    : shrinkageBranchForecasts.reduce(
        (sum, row) => sum + row.projectedSales * (row.projectedRate ?? 0) / 100,
        0,
      );
  const branchesWithShrinkageMae = shrinkageBranchForecasts.filter(
    (row) => row.maePercentagePoints !== null && row.projectedSales > 0,
  );
  const shrinkageMaeWeight = branchesWithShrinkageMae.reduce((sum, row) => sum + row.projectedSales, 0);
  const shrinkageMaePercentagePoints = allShrinkageBranchesAvailable &&
    branchesWithShrinkageMae.length === shrinkageBranchForecasts.length && shrinkageMaeWeight > 0
    ? branchesWithShrinkageMae.reduce(
        (sum, row) => sum + row.projectedSales * (row.maePercentagePoints ?? 0),
        0,
      ) / shrinkageMaeWeight
    : null;
  const flatBaselineSales = branchSalesProjections.reduce((sum, row) => sum + row.flatBaselineSales, 0);
  const demandChange = priorComparisonAvailable && flatBaselineSales > 0
    ? ((forecastSales - flatBaselineSales) / flatBaselineSales) * 100
    : null;
  const historicalByDate = new Map<string, number>();
  salesRows.forEach((row) => historicalByDate.set(row.date, (historicalByDate.get(row.date) ?? 0) + row.sales));
  const historicalSales = [...historicalByDate.entries()].sort(([left], [right]) => left.localeCompare(right)).slice(-30).map(([date, sales]) => ({
    date,
    label: new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", timeZone: "UTC" }).format(utcDate(date)),
    actualSales: round(sales),
  }));
  const projectedDemand = groupForecast(futureDaily, forecastDays);

  // --- FORECASTED INVENTORY AND REPLENISHMENT ---
  // Projected Stock = Current Stock + Incoming Stock - Forecasted Usage
  // Used to estimate stock-out risk and replenishment needs.
  const inventory = inventoryResult.rows.map((row) => {
    const stock = inventoryLedgers.get(inventoryLedgerKey(row.branchId, row.inventoryItemId))?.calculatedBalance ?? 0;
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
  const predictionSummary = summarizeInventoryPredictions(inventory);
  const predictions = predictionSummary.details;
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
  const confidence = observedSalesDays >= 90 && forecastDays <= 90 ? "HIGH" : observedSalesDays >= 30 && forecastDays <= 366 ? "MEDIUM" : "LOW";
  const findings = {
    scope: branchName, forecastStart: input.startDate, forecastEnd: input.endDate, forecastDays,
    observedSalesDays, baselineDailySales: round(baselineDailySales), forecastSales: round(forecastSales),
    demandChangePercent: demandChange === null ? null : round(demandChange), historicalCogsRatePercent: round(cogsRate * 100),
    salesMae: overallSalesAccuracy.mae,
    evaluatedSalesDays: overallSalesAccuracy.evaluatedDays,
    cogsMae: overallCogsAccuracy.mae,
    evaluatedCogsDays: overallCogsAccuracy.evaluatedDays,
    shrinkageForecastStatus,
    projectedShrinkageRate: projectedShrinkageRate === null ? null : round(projectedShrinkageRate, 4),
    projectedShrinkageCost: projectedShrinkageCost === null ? null : round(projectedShrinkageCost),
    shrinkageEligibleWeeks: shrinkageBranchForecasts.length
      ? Math.min(...shrinkageBranchForecasts.map((row) => row.eligibleWeeks))
      : 0,
    shrinkageMaePercentagePoints: shrinkageMaePercentagePoints === null ? null : round(shrinkageMaePercentagePoints, 4),
    largestSalesError: overallSalesAccuracy.observations.length
      ? Math.max(...overallSalesAccuracy.observations.map((row) => row.absoluteError))
      : null,
    confidence,
    stockRisks: forecastReady ? predictions.slice(0, 5).map((row) => ({ branch: row.branchName, ingredient: row.name, daysToStockout: row.daysToStockout, suggestedReorder: row.recommendedReorder, unit: row.unit })) : [],
  };
  const fallbackInsights = analyticalInsights({ demandChange, forecastDays, confidence, observedSalesDays, salesMae: overallSalesAccuracy.mae, predictions: forecastReady ? predictions : [] });
  const geminiInsights = options.includeGemini === false ? null : await generateGeminiInsights(findings);

  return {
    scope: { branchId: branchId ?? null, branchName, forecastStart: input.startDate, forecastEnd: input.endDate },
    methodology: {
      historicalStart: historyStart, historicalEnd: historyEnd, observedSalesDays, confidence,
      insightSource: geminiInsights ? "GOOGLE_GEMINI" : "SYSTEM_ANALYSIS",
      salesMaeMethod: "Each tested branch-day uses only sales records dated before that day; overall MAE uses all underlying branch observations.",
      cogsMaeMethod: "Each tested branch-day forecasts sales from earlier records and applies the recipe-snapshot COGS rate observed before that day; no future records are used.",
      ingredientMaeMethod: "Each tested ingredient day uses only earlier recipe-derived usage records with the same unit; dates without recorded actual usage are not inserted as zero.",
      shrinkageRateMethod: "Uses the eight latest eligible complete branch-weeks. Each weekly verified shrinkage rate is weighted by accepted sales and recency; missing or unresolved evidence is never inserted as zero.",
      stockProjectionAssumption: "Only unreceived quantities from ordered or partially received purchase orders are considered, and they affect projected supply no earlier than their expected delivery date. Overdue expected deliveries are not assumed available.",
      disclaimer: "Forecasts are estimates based on recorded historical patterns. They support, but do not replace, management judgment and do not automatically create purchase orders or change inventory.",
    },
    readiness: {
      status: forecastReady ? "READY" as const : "PRELIMINARY" as const,
      minimumSalesDays: MIN_FORECAST_HISTORY_DAYS,
      observedSalesDays,
      comparisonPeriodAvailable: priorComparisonAvailable,
      recommendationsActionable: forecastReady,
      reason: forecastReady
        ? null
        : `At least ${MIN_FORECAST_HISTORY_DAYS} recorded sales days are required before projections and reorder suggestions are considered actionable.`,
    },
    summary: {
      forecastSales: round(forecastSales), demandChange: demandChange === null ? null : round(demandChange), criticalItems: predictionSummary.criticalItems,
      projectedCogs: round(projectedCogs),
      projectedShrinkageRate: projectedShrinkageRate === null ? null : round(projectedShrinkageRate, 4),
      projectedShrinkageCost: projectedShrinkageCost === null ? null : round(projectedShrinkageCost),
      shrinkageForecastStatus,
      recommendedReorders: predictionSummary.recommendedReorders,
    },
    accuracy: {
      sales: { overall: overallSalesAccuracy, branches: salesAccuracyByBranch },
      cogs: { overall: overallCogsAccuracy, branches: cogsAccuracyByBranch },
      ingredients: ingredientAccuracy,
      shrinkage: {
        maePercentagePoints: shrinkageMaePercentagePoints === null ? null : round(shrinkageMaePercentagePoints, 4),
        evaluatedWeeks: shrinkageBranchForecasts.reduce((sum, row) => sum + row.evaluatedWeeks, 0),
        branches: shrinkageBranchForecasts.map((row) => ({
          branchId: row.branchId,
          branchName: row.branchName,
          status: row.status,
          projectedRate: row.projectedRate,
          eligibleWeeks: row.eligibleWeeks,
          historicalStart: row.historicalStart,
          historicalEnd: row.historicalEnd,
          maePercentagePoints: row.maePercentagePoints,
          evaluatedWeeks: row.evaluatedWeeks,
          evaluationStart: row.evaluationStart,
          evaluationEnd: row.evaluationEnd,
        })),
      },
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
