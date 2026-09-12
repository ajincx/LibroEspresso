import { pool } from "../config/database.js";
import { getEffectiveBranchId } from "./branchScope.js";
import { evaluateSalesMae } from "./forecastEvaluation.service.js";
import {
  buildAttention, causeShares, comparablePeriods, comparisons, contributionShares, financialValues, groupingForPeriod,
  inventoryRisk, normalizedMae, productProfitability,
} from "./reportCalculations.service.js";
import { VERIFIED_SHRINKAGE_CLASSIFICATIONS_SQL } from "./shrinkageWorkflow.service.js";
import type { TokenUser } from "../types/auth.js";

type FinancialRow = { branchId: string; branchName: string; branchStatus: string; sales: number; cogs: number; detected: number; verified: number; pending: number; corrected: number };
const n = (value: unknown) => Number(value ?? 0);
const DAY = 86_400_000;
const iso = (date: Date) => date.toISOString().slice(0, 10);
const addDays = (date: string, days: number) => iso(new Date(new Date(`${date}T00:00:00Z`).getTime() + days * DAY));

export type ReportSupportFilters = {
  startDate: string;
  endDate: string;
  branchId?: string;
  productId?: string;
  ingredientId?: string;
  classification?: string;
};

export async function buildReportSupportData(user: TokenUser, filters: ReportSupportFilters) {
  const branchId = getEffectiveBranchId(user, filters.branchId);
  const periods = comparablePeriods(filters.startDate, filters.endDate);
  const evaluationStart = addDays(filters.endDate, -394);
  const inventoryStart = addDays(filters.endDate, -89);
  const today = iso(new Date());
  const scope = branchId ?? null;
  const params = [filters.startDate, filters.endDate, scope];
  const productFilter = filters.productId ?? null;
  const ingredientFilter = filters.ingredientId ?? null;
  const classificationFilter = filters.classification ?? null;

  const [financialResult, productResult, contributionResult, causesResult, shrinkageDetailResult, inventoryResult, incomingResult, salesHistoryResult, dailyResult, settingsResult, overdueResult] = await Promise.all([
    pool.query<FinancialRow>(`
      WITH scoped_branches AS (
        SELECT id,name,status::text FROM branches WHERE ($3::uuid IS NULL OR id=$3::uuid)
      ), sales AS (
        SELECT pi.branch_id,coalesce(sum(psi.quantity_sold*coalesce(psi.unit_price_snapshot,mi.selling_price)),0)::float8 sales
          FROM pos_imports pi JOIN pos_sale_items psi ON psi.pos_import_id=pi.id JOIN menu_items mi ON mi.id=psi.menu_item_id
         WHERE pi.business_date BETWEEN $1::date AND $2::date GROUP BY pi.branch_id
      ), costs AS (
        SELECT pi.branch_id,coalesce(sum(u.quantity_consumed*u.unit_cost_snapshot),0)::float8 cogs
          FROM pos_imports pi JOIN pos_sale_items psi ON psi.pos_import_id=pi.id
          JOIN pos_sale_ingredient_usage u ON u.pos_sale_item_id=psi.id
         WHERE pi.business_date BETWEEN $1::date AND $2::date GROUP BY pi.branch_id
      ), detected AS (
        SELECT ic.branch_id,coalesce(sum(greatest(ici.variance_value,0)),0)::float8 value
          FROM inventory_counts ic JOIN inventory_count_items ici ON ici.inventory_count_id=ic.id
         WHERE ic.count_date BETWEEN $1::date AND $2::date GROUP BY ic.branch_id
      ), states AS (
        SELECT sr.branch_id,
          coalesce(sum(greatest(sr.variance_value,0)) FILTER (WHERE sr.status IN ('VERIFIED','REVIEWED') AND sr.classification IN (${VERIFIED_SHRINKAGE_CLASSIFICATIONS_SQL})),0)::float8 verified,
          coalesce(sum(greatest(sr.variance_value,0)) FILTER (WHERE sr.status IN ('DETECTED','PENDING_REVIEW')),0)::float8 pending,
          coalesce(sum(greatest(sr.variance_value,0)) FILTER (WHERE sr.status IN ('VERIFIED','REVIEWED') AND sr.classification='COUNT_ERROR'),0)::float8 corrected
          FROM shrinkage_reports sr WHERE sr.detected_at::date BETWEEN $1::date AND $2::date GROUP BY sr.branch_id
      )
      SELECT b.id "branchId",b.name "branchName",b.status "branchStatus",coalesce(s.sales,0)::float8 sales,
        coalesce(c.cogs,0)::float8 cogs,coalesce(d.value,0)::float8 detected,coalesce(st.verified,0)::float8 verified,
        coalesce(st.pending,0)::float8 pending,coalesce(st.corrected,0)::float8 corrected
      FROM scoped_branches b LEFT JOIN sales s ON s.branch_id=b.id LEFT JOIN costs c ON c.branch_id=b.id
      LEFT JOIN detected d ON d.branch_id=b.id LEFT JOIN states st ON st.branch_id=b.id ORDER BY b.name`, params),
    pool.query(`WITH line_costs AS (
        SELECT psi.id,coalesce(sum(u.quantity_consumed*u.unit_cost_snapshot),0)::float8 cogs
        FROM pos_imports pi JOIN pos_sale_items psi ON psi.pos_import_id=pi.id
        LEFT JOIN pos_sale_ingredient_usage u ON u.pos_sale_item_id=psi.id
        WHERE pi.business_date BETWEEN $1::date AND $2::date AND ($3::uuid IS NULL OR pi.branch_id=$3::uuid)
        GROUP BY psi.id
      ) SELECT mi.id,mi.name,mi.category,mi.status::text,sum(psi.quantity_sold)::float8 "quantitySold",
        sum(psi.quantity_sold*coalesce(psi.unit_price_snapshot,mi.selling_price))::float8 revenue,sum(lc.cogs)::float8 cogs
      FROM pos_imports pi JOIN pos_sale_items psi ON psi.pos_import_id=pi.id JOIN menu_items mi ON mi.id=psi.menu_item_id JOIN line_costs lc ON lc.id=psi.id
      WHERE pi.business_date BETWEEN $1::date AND $2::date AND ($3::uuid IS NULL OR pi.branch_id=$3::uuid)
        AND ($4::uuid IS NULL OR mi.id=$4::uuid)
      GROUP BY mi.id ORDER BY cogs DESC`, [filters.startDate, filters.endDate, scope, productFilter]),
    pool.query(`SELECT mi.id "productId",mi.name "productName",ii.id "ingredientId",ii.name ingredient,ii.unit,
        sum(u.quantity_consumed)::float8 "quantityUsed",sum(u.quantity_consumed*u.unit_cost_snapshot)::float8 cost
      FROM pos_imports pi JOIN pos_sale_items psi ON psi.pos_import_id=pi.id JOIN menu_items mi ON mi.id=psi.menu_item_id
      JOIN pos_sale_ingredient_usage u ON u.pos_sale_item_id=psi.id JOIN inventory_items ii ON ii.id=u.inventory_item_id
      WHERE pi.business_date BETWEEN $1::date AND $2::date AND ($3::uuid IS NULL OR pi.branch_id=$3::uuid)
        AND ($4::uuid IS NULL OR mi.id=$4::uuid) AND ($5::uuid IS NULL OR ii.id=$5::uuid)
      GROUP BY mi.id,ii.id ORDER BY cost DESC`, [filters.startDate, filters.endDate, scope, productFilter, ingredientFilter]),
    pool.query(`SELECT sr.classification::text classification,count(*)::int cases,
        CASE WHEN count(DISTINCT sr.unit)=1 THEN sum(sr.variance_quantity)::float8 ELSE NULL END quantity,
        CASE WHEN count(DISTINCT sr.unit)=1 THEN min(sr.unit) ELSE NULL END unit,
        sum(greatest(sr.variance_value,0))::float8 cost
      FROM shrinkage_reports sr WHERE sr.detected_at::date BETWEEN $1::date AND $2::date
        AND ($3::uuid IS NULL OR sr.branch_id=$3::uuid) AND sr.status IN ('VERIFIED','REVIEWED')
        AND sr.classification IN (${VERIFIED_SHRINKAGE_CLASSIFICATIONS_SQL})
        AND ($4::text IS NULL OR sr.classification::text=$4::text)
      GROUP BY sr.classification ORDER BY cost DESC`, [filters.startDate, filters.endDate, scope, classificationFilter]),
    pool.query(`SELECT sr.id,sr.report_no "reportNo",sr.branch_id "branchId",b.name "branchName",sr.inventory_item_id "inventoryItemId",
        ii.name ingredient,sr.detected_at "date",sr.variance_quantity::float8 variance,sr.unit,sr.classification::text,
        greatest(sr.variance_value,0)::float8 "verifiedCost",concat(u.first_name,' ',u.last_name) manager,
        sr.status::text "investigationStatus",count(ir.id)::int "relatedIncidentCount"
      FROM shrinkage_reports sr JOIN branches b ON b.id=sr.branch_id JOIN inventory_items ii ON ii.id=sr.inventory_item_id
      LEFT JOIN users u ON u.id=coalesce(sr.reviewed_by,sr.submitted_by) LEFT JOIN incident_reports ir ON ir.shrinkage_report_id=sr.id
      WHERE sr.detected_at::date BETWEEN $1::date AND $2::date AND ($3::uuid IS NULL OR sr.branch_id=$3::uuid)
        AND sr.status IN ('VERIFIED','REVIEWED') AND sr.classification IN (${VERIFIED_SHRINKAGE_CLASSIFICATIONS_SQL})
        AND ($4::uuid IS NULL OR sr.inventory_item_id=$4::uuid) AND ($5::text IS NULL OR sr.classification::text=$5::text)
      GROUP BY sr.id,b.name,ii.name,u.id ORDER BY sr.detected_at DESC`, [filters.startDate, filters.endDate, scope, ingredientFilter, classificationFilter]),
    pool.query(`WITH movement AS (
        SELECT im.branch_id,im.inventory_item_id,
          sum(quantity) FILTER (WHERE movement_type='RECEIPT')::float8 receipts,
          sum(quantity) FILTER (WHERE movement_type='APPROVED_ADJUSTMENT_INCREASE')::float8 increases,
          sum(quantity) FILTER (WHERE movement_type IN ('APPROVED_ADJUSTMENT','APPROVED_ADJUSTMENT_DECREASE'))::float8 decreases
        FROM inventory_movements im LEFT JOIN branch_inventory_balances bal
          ON bal.branch_id=im.branch_id AND bal.inventory_item_id=im.inventory_item_id
        WHERE im.occurred_at>coalesce(bal.as_of,'1970-01-01'::timestamptz)
        GROUP BY im.branch_id,im.inventory_item_id
      ), usage_after AS (
        SELECT pi.branch_id,u.inventory_item_id,sum(u.quantity_consumed)::float8 usage
        FROM pos_imports pi JOIN pos_sale_items psi ON psi.pos_import_id=pi.id JOIN pos_sale_ingredient_usage u ON u.pos_sale_item_id=psi.id
        LEFT JOIN branch_inventory_balances bal ON bal.branch_id=pi.branch_id AND bal.inventory_item_id=u.inventory_item_id
        WHERE pi.business_date>coalesce(bal.as_of::date,'1970-01-01'::date) GROUP BY pi.branch_id,u.inventory_item_id
      ), recent_usage AS (
        SELECT pi.branch_id,u.inventory_item_id,sum(u.quantity_consumed)::float8 usage,count(DISTINCT pi.business_date)::int days
        FROM pos_imports pi JOIN pos_sale_items psi ON psi.pos_import_id=pi.id JOIN pos_sale_ingredient_usage u ON u.pos_sale_item_id=psi.id
        WHERE pi.business_date BETWEEN $1::date AND $2::date GROUP BY pi.branch_id,u.inventory_item_id
      ), variance AS (
        SELECT ic.branch_id,ici.inventory_item_id,sum(ici.variance_quantity)::float8 quantity,sum(greatest(ici.variance_value,0))::float8 value
        FROM inventory_counts ic JOIN inventory_count_items ici ON ici.inventory_count_id=ic.id
        WHERE ic.count_date BETWEEN $3::date AND $4::date GROUP BY ic.branch_id,ici.inventory_item_id
      ), verified AS (
        SELECT branch_id,inventory_item_id,sum(greatest(variance_value,0))::float8 cost FROM shrinkage_reports
        WHERE detected_at::date BETWEEN $3::date AND $4::date AND status IN ('VERIFIED','REVIEWED')
          AND classification IN (${VERIFIED_SHRINKAGE_CLASSIFICATIONS_SQL}) GROUP BY branch_id,inventory_item_id
      ) SELECT b.id "branchId",b.name "branchName",ii.id "inventoryItemId",ii.name,ii.category,ii.unit,
        coalesce(bis.current_unit_cost,ii.unit_cost)::float8 "unitCost",coalesce(bis.reorder_level,ii.reorder_level)::float8 "reorderLevel",
        coalesce(bis.reorder_days,cs.default_reorder_days,7)::int "reorderDays",
        greatest(0,coalesce(bal.actual_quantity,0)+coalesce(m.receipts,0)+coalesce(m.increases,0)-coalesce(m.decreases,0)-coalesce(ua.usage,0))::float8 "currentStock",
        (coalesce(ru.usage,0)/greatest(coalesce(ru.days,0),1))::float8 "dailyUsage",coalesce(ru.usage,0)::float8 "expectedUsage",
        coalesce(v.quantity,0)::float8 "varianceQuantity",coalesce(v.value,0)::float8 "varianceValue",coalesce(ver.cost,0)::float8 "verifiedShrinkageCost"
      FROM branches b CROSS JOIN inventory_items ii LEFT JOIN branch_inventory_balances bal ON bal.branch_id=b.id AND bal.inventory_item_id=ii.id
      LEFT JOIN branch_inventory_settings bis ON bis.branch_id=b.id AND bis.inventory_item_id=ii.id LEFT JOIN movement m ON m.branch_id=b.id AND m.inventory_item_id=ii.id
      LEFT JOIN usage_after ua ON ua.branch_id=b.id AND ua.inventory_item_id=ii.id LEFT JOIN recent_usage ru ON ru.branch_id=b.id AND ru.inventory_item_id=ii.id
      LEFT JOIN variance v ON v.branch_id=b.id AND v.inventory_item_id=ii.id LEFT JOIN verified ver ON ver.branch_id=b.id AND ver.inventory_item_id=ii.id
      CROSS JOIN calculation_settings cs WHERE b.status='ACTIVE' AND ii.status='ACTIVE' AND (ii.item_scope='GLOBAL' OR ii.origin_branch_id=b.id)
        AND ($5::uuid IS NULL OR b.id=$5::uuid) AND ($6::uuid IS NULL OR ii.id=$6::uuid) ORDER BY b.name,ii.name`,
      [inventoryStart, filters.endDate, filters.startDate, filters.endDate, scope, ingredientFilter]),
    pool.query(`SELECT po.branch_id "branchId",poi.inventory_item_id "inventoryItemId",po.expected_delivery_date::text "expectedDeliveryDate",
        sum(poi.quantity_ordered-poi.quantity_received)::float8 quantity FROM purchase_orders po JOIN purchase_order_items poi ON poi.purchase_order_id=po.id
      WHERE po.status IN ('ORDERED','PARTIALLY_RECEIVED') AND poi.quantity_ordered>poi.quantity_received
        AND ($1::uuid IS NULL OR po.branch_id=$1::uuid) GROUP BY po.branch_id,poi.inventory_item_id,po.expected_delivery_date`, [scope]),
    pool.query(`SELECT pi.branch_id "branchId",b.name "branchName",pi.business_date::text date,
        sum(psi.quantity_sold*coalesce(psi.unit_price_snapshot,mi.selling_price))::float8 sales
      FROM pos_imports pi JOIN branches b ON b.id=pi.branch_id JOIN pos_sale_items psi ON psi.pos_import_id=pi.id JOIN menu_items mi ON mi.id=psi.menu_item_id
      WHERE pi.business_date BETWEEN $1::date AND $2::date AND ($3::uuid IS NULL OR pi.branch_id=$3::uuid)
      GROUP BY pi.branch_id,b.name,pi.business_date ORDER BY pi.branch_id,pi.business_date`, [evaluationStart, filters.endDate, scope]),
    pool.query(`WITH sales AS (
        SELECT pi.business_date date,sum(psi.quantity_sold*coalesce(psi.unit_price_snapshot,mi.selling_price))::float8 sales
        FROM pos_imports pi JOIN pos_sale_items psi ON psi.pos_import_id=pi.id JOIN menu_items mi ON mi.id=psi.menu_item_id
        WHERE pi.business_date BETWEEN $1::date AND $2::date AND ($3::uuid IS NULL OR pi.branch_id=$3::uuid) GROUP BY pi.business_date
      ), costs AS (
        SELECT pi.business_date date,sum(u.quantity_consumed*u.unit_cost_snapshot)::float8 cogs
        FROM pos_imports pi JOIN pos_sale_items psi ON psi.pos_import_id=pi.id JOIN pos_sale_ingredient_usage u ON u.pos_sale_item_id=psi.id
        WHERE pi.business_date BETWEEN $1::date AND $2::date AND ($3::uuid IS NULL OR pi.branch_id=$3::uuid) GROUP BY pi.business_date
      ), shortage AS (
        SELECT ic.count_date date,sum(greatest(ici.variance_value,0))::float8 detected FROM inventory_counts ic JOIN inventory_count_items ici ON ici.inventory_count_id=ic.id
        WHERE ic.count_date BETWEEN $1::date AND $2::date AND ($3::uuid IS NULL OR ic.branch_id=$3::uuid) GROUP BY ic.count_date
      ), verified AS (
        SELECT detected_at::date date,sum(greatest(variance_value,0))::float8 verified FROM shrinkage_reports
        WHERE detected_at::date BETWEEN $1::date AND $2::date AND ($3::uuid IS NULL OR branch_id=$3::uuid)
          AND status IN ('VERIFIED','REVIEWED') AND classification IN (${VERIFIED_SHRINKAGE_CLASSIFICATIONS_SQL}) GROUP BY detected_at::date
      ), dates AS (SELECT generate_series($1::date,$2::date,'1 day')::date date)
      SELECT d.date::text,coalesce(s.sales,0)::float8 sales,coalesce(c.cogs,0)::float8 cogs,
        (coalesce(s.sales,0)-coalesce(c.cogs,0))::float8 "grossProfit",coalesce(sh.detected,0)::float8 "detectedShortageValue",coalesce(v.verified,0)::float8 "verifiedShrinkageCost"
      FROM dates d LEFT JOIN sales s USING(date) LEFT JOIN costs c USING(date) LEFT JOIN shortage sh USING(date) LEFT JOIN verified v USING(date) ORDER BY d.date`, [filters.startDate, filters.endDate, scope]),
    pool.query<{ highCogsPercent: number }>(`SELECT high_cogs_percent::float8 "highCogsPercent" FROM calculation_settings WHERE singleton=true`),
    pool.query(`SELECT po.id,po.branch_id "branchId",b.name "branchName",po.po_no "poNo",po.expected_delivery_date::text "expectedDeliveryDate"
      FROM purchase_orders po JOIN branches b ON b.id=po.branch_id WHERE po.status IN ('ORDERED','PARTIALLY_RECEIVED')
        AND po.expected_delivery_date<CURRENT_DATE AND ($1::uuid IS NULL OR po.branch_id=$1::uuid)`, [scope]),
  ]);

  const allRows = financialResult.rows.map((row) => ({ ...row, sales: n(row.sales), cogs: n(row.cogs), detected: n(row.detected), verified: n(row.verified), pending: n(row.pending), corrected: n(row.corrected) }));
  const financialByPeriod = async (startDate: string, endDate: string) => {
    const result = await pool.query(`WITH s AS (SELECT coalesce(sum(psi.quantity_sold*coalesce(psi.unit_price_snapshot,mi.selling_price)),0)::float8 sales FROM pos_imports pi JOIN pos_sale_items psi ON psi.pos_import_id=pi.id JOIN menu_items mi ON mi.id=psi.menu_item_id WHERE pi.business_date BETWEEN $1::date AND $2::date AND ($3::uuid IS NULL OR pi.branch_id=$3::uuid)), c AS (SELECT coalesce(sum(u.quantity_consumed*u.unit_cost_snapshot),0)::float8 cogs FROM pos_imports pi JOIN pos_sale_items psi ON psi.pos_import_id=pi.id JOIN pos_sale_ingredient_usage u ON u.pos_sale_item_id=psi.id WHERE pi.business_date BETWEEN $1::date AND $2::date AND ($3::uuid IS NULL OR pi.branch_id=$3::uuid)), d AS (SELECT coalesce(sum(greatest(ici.variance_value,0)),0)::float8 detected FROM inventory_counts ic JOIN inventory_count_items ici ON ici.inventory_count_id=ic.id WHERE ic.count_date BETWEEN $1::date AND $2::date AND ($3::uuid IS NULL OR ic.branch_id=$3::uuid)), v AS (SELECT coalesce(sum(greatest(variance_value,0)),0)::float8 verified FROM shrinkage_reports WHERE detected_at::date BETWEEN $1::date AND $2::date AND ($3::uuid IS NULL OR branch_id=$3::uuid) AND status IN ('VERIFIED','REVIEWED') AND classification IN (${VERIFIED_SHRINKAGE_CLASSIFICATIONS_SQL})) SELECT * FROM s,c,d,v`, [startDate,endDate,scope]);
    const row = result.rows[0]; return financialValues({ sales:n(row.sales),productCogs:n(row.cogs),detectedShortageValue:n(row.detected),verifiedShrinkageCost:n(row.verified) });
  };
  const [current, previous] = await Promise.all([financialByPeriod(filters.startDate,filters.endDate), financialByPeriod(periods.previousStartDate,periods.previousEndDate)]);

  const salesGroups = new Map<string,{ branchId:string; branchName:string; rows:{date:string;value:number}[] }>();
  for (const row of salesHistoryResult.rows as any[]) { const group=salesGroups.get(row.branchId)??{branchId:row.branchId,branchName:row.branchName,rows:[] as {date:string;value:number}[]}; group.rows.push({date:row.date,value:n(row.sales)}); salesGroups.set(row.branchId,group); }
  const forecastPerformance=[...salesGroups.values()].map((group)=>{const accuracy=evaluateSalesMae(group.rows);return {branchId:group.branchId,branchName:group.branchName,mae:accuracy.mae,evaluatedDays:accuracy.evaluatedDays,averageActualSales:accuracy.averageActual,averageForecastSales:accuracy.averageForecast,normalizedMaePercent:normalizedMae(accuracy),insufficientHistory:accuracy.insufficientHistory};});
  const forecastMap=new Map(forecastPerformance.map((row)=>[row.branchId,row]));

  const incomingMap=new Map<string,{expectedDeliveryDate:string;quantity:number}[]>();
  for(const row of incomingResult.rows as any[]){const key=`${row.branchId}:${row.inventoryItemId}`;const list=incomingMap.get(key)??[];list.push({expectedDeliveryDate:row.expectedDeliveryDate,quantity:n(row.quantity)});incomingMap.set(key,list);}
  const risks=(inventoryResult.rows as any[]).map((row)=>inventoryRisk({branchId:row.branchId,branchName:row.branchName,inventoryItemId:row.inventoryItemId,name:row.name,unit:row.unit,currentStock:n(row.currentStock),reorderLevel:n(row.reorderLevel),reorderDays:n(row.reorderDays),dailyUsage:n(row.dailyUsage),incomingDeliveries:incomingMap.get(`${row.branchId}:${row.inventoryItemId}`)??[],projectionStart:today}));
  const lowStockByBranch=new Map<string,number>(); risks.filter((row)=>row.risk!=="NORMAL").forEach((row)=>lowStockByBranch.set(row.branchId,(lowStockByBranch.get(row.branchId)??0)+1));
  const branchPerformance=allRows.map((row)=>({...row,...financialValues({sales:row.sales,productCogs:row.cogs,detectedShortageValue:row.detected,verifiedShrinkageCost:row.verified}),pendingInvestigationValue:row.pending,resolvedCorrectionValue:row.corrected,forecastMae:forecastMap.get(row.branchId)?.mae??null,forecastEvaluatedDays:forecastMap.get(row.branchId)?.evaluatedDays??0,forecastInsufficientHistory:forecastMap.get(row.branchId)?.insufficientHistory??true,lowStockItemCount:lowStockByBranch.get(row.branchId)??0}));
  const shrinkageCauses=causeShares((causesResult.rows as any[]).map((row)=>({...row,cases:n(row.cases),quantity:row.quantity===null?null:n(row.quantity),cost:n(row.cost)}))).map(({cost,...row})=>({...row,verifiedShrinkageCost:cost}));
  const products=productProfitability((productResult.rows as any[]).map((row)=>({...row,quantitySold:n(row.quantitySold),revenue:n(row.revenue),cogs:n(row.cogs)})));
  const ingredientContributions=contributionShares((contributionResult.rows as any[]).map((row)=>({...row,quantityUsed:n(row.quantityUsed),cost:n(row.cost)})));
  const ingredientRows=inventoryResult.rows as any[];
  const ingredients=ingredientRows.map((row)=>{const risk=risks.find((item)=>item.branchId===row.branchId&&item.inventoryItemId===row.inventoryItemId)!;return {...row,unitCost:n(row.unitCost),expectedUsage:n(row.expectedUsage),recordedUsage:null,varianceQuantity:n(row.varianceQuantity),varianceValue:n(row.varianceValue),verifiedShrinkageCost:n(row.verifiedShrinkageCost),...risk};});
  const repeated=ingredientRows.filter((row)=>n(row.verifiedShrinkageCost)>0).map((row)=>({branchId:row.branchId,branchName:row.branchName,inventoryItemId:row.inventoryItemId,ingredient:row.name,cases:(shrinkageDetailResult.rows as any[]).filter((detail)=>detail.branchId===row.branchId&&detail.inventoryItemId===row.inventoryItemId).length}));
  const highCogs=n(settingsResult.rows[0]?.highCogsPercent??45);
  const attention=buildAttention({unresolved:(await pool.query(`SELECT sr.id,sr.branch_id "branchId",b.name "branchName",ii.name ingredient,greatest(sr.variance_value,0)::float8 value FROM shrinkage_reports sr JOIN branches b ON b.id=sr.branch_id JOIN inventory_items ii ON ii.id=sr.inventory_item_id WHERE sr.detected_at::date BETWEEN $1::date AND $2::date AND sr.status IN ('DETECTED','PENDING_REVIEW') AND greatest(sr.variance_value,0)>0 AND ($3::uuid IS NULL OR sr.branch_id=$3::uuid)`,[filters.startDate,filters.endDate,scope])).rows as any[],risks,repeatedCauses:repeated,lowMarginProducts:products.filter((row)=>row.revenue>0&&row.cogs/row.revenue*100>=highCogs).map((row)=>({id:row.id,name:row.name,grossMargin:row.grossMargin,cogsRate:row.cogs/row.revenue*100,threshold:highCogs})),overdueOrders:overdueResult.rows as any[]});
  const grouping=groupingForPeriod(periods.lengthDays);
  const trendMap=new Map<string,any>();
  for(const row of dailyResult.rows as any[]){const date=new Date(`${row.date}T00:00:00Z`);let key=row.date;if(grouping==="week"){const offset=(date.getUTCDay()+6)%7;date.setUTCDate(date.getUTCDate()-offset);key=iso(date);}else if(grouping==="month")key=row.date.slice(0,7);const item=trendMap.get(key)??{period:key,sales:0,totalCogs:0,grossProfit:0,detectedShortageValue:0,verifiedShrinkageCost:0};item.sales+=n(row.sales);item.totalCogs+=n(row.cogs);item.grossProfit+=n(row.grossProfit);item.detectedShortageValue+=n(row.detectedShortageValue);item.verifiedShrinkageCost+=n(row.verifiedShrinkageCost);trendMap.set(key,item);}
  const trends=[...trendMap.values()].map((row)=>({...row,grossMargin:row.sales?Number((row.grossProfit/row.sales*100).toFixed(2)):0}));
  return {scope:{branchId,branchName:branchId?(branchPerformance[0]?.branchName??"Assigned Branch"):"All Branches",...periods,grouping},summary:current,comparison:comparisons(current,previous),branchPerformance,shrinkageResolution:{detectedShortageValue:current.detectedShortageValue,verifiedShrinkageCost:current.verifiedShrinkageCost,underInvestigationValue:branchPerformance.reduce((s,r)=>s+n(r.pendingInvestigationValue),0),resolvedCorrectionValue:branchPerformance.reduce((s,r)=>s+n(r.resolvedCorrectionValue),0)},shrinkageCauses,shrinkageDetails:shrinkageDetailResult.rows,products,ingredientContributions,ingredients,inventoryRisks:risks,forecastPerformance,trends,attention};
}
