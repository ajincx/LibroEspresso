import type { PoolClient } from "pg";
import { AppError } from "../utils/appError.js";
import { convertQuantity } from "./unitConversion.service.js";

export interface ExpectedInventoryResult {
  inventoryItemId: string;
  sku: string;
  itemName: string;
  unit: string;
  unitCost: number;
  previousActualQuantity: number;
  stockReceived: number;
  expectedConsumption: number;
  approvedAdjustments: number;
  approvedAdjustmentIncreases: number;
  approvedAdjustmentDecreases: number;
  expectedQuantity: number;
  baselineDate: string;
  baselineAt: string;
  baselineSource: "PHYSICAL_COUNT" | "DAILY_OPENING" | "DAILY_CLOSING" | "OPENING_BASELINE" | "BALANCE";
}

export interface UnavailableExpectedInventoryItem {
  inventoryItemId: string;
  sku: string;
  itemName: string;
  unit: string;
  availability: "NO_BASELINE";
}

export interface ExpectedInventoryBatchResult {
  items: ExpectedInventoryResult[];
  unavailableItems: UnavailableExpectedInventoryItem[];
}

export interface VarianceResult {
  varianceQuantity: number;
  varianceValue: number;
  variancePercentage: number | null;
}

// --- EXPECTED INVENTORY FORMULA ---
// Expected Stock = Previous Actual
//                + Stock Received
//                - Expected Consumption
//                + Approved Increase
//                - Approved Decrease
export function computeExpectedStock(
  previousActual: number,
  stockReceived: number,
  expectedConsumption: number,
  approvedAdjustmentIncreases: number = 0,
  approvedAdjustmentDecreases: number = 0,
): number {
  return (
    previousActual +
    stockReceived -
    expectedConsumption +
    approvedAdjustmentIncreases -
    approvedAdjustmentDecreases
  );
}

// --- INVENTORY VARIANCE FORMULA ---
// Variance Quantity = Actual - Expected
// Variance Value = Variance Quantity × Unit Cost
// Variance % = (Variance Quantity / Expected) × 100
// Negative = Shortage, Positive = Excess, Zero = Matched
export function computeVariance(
  expectedQuantity: number,
  actualQuantity: number,
  unitCost: number,
): VarianceResult {
  const varianceQuantity = actualQuantity - expectedQuantity;
  const varianceValue = varianceQuantity * unitCost;
  const variancePercentage =
    expectedQuantity > 0 ? (varianceQuantity / expectedQuantity) * 100 : null;
  return {
    varianceQuantity,
    varianceValue,
    variancePercentage,
  };
}

export async function calculateExpectedInventory(
  client: Pick<PoolClient, "query">,
  branchId: string,
  inventoryItemId: string,
  countDate: string,
  calculationPhase: "FULL" | "OPENING" | "CLOSING" = "FULL",
  targetCutoffAt: string | null = null,
): Promise<ExpectedInventoryResult> {
  const itemResult = await client.query<{
    id: string; sku: string; name: string; unit: string; unitCost: number;
  }>(`SELECT ii.id,ii.sku,ii.name,ii.unit,COALESCE(bis.current_unit_cost,ii.unit_cost)::float8 "unitCost"
         FROM inventory_items ii
         LEFT JOIN branch_inventory_settings bis ON bis.inventory_item_id=ii.id AND bis.branch_id=$2
        WHERE ii.id=$1 AND ii.status='ACTIVE'
          AND (ii.item_scope='GLOBAL' OR ii.origin_branch_id=$2)`, [inventoryItemId, branchId]);
  const item = itemResult.rows[0];
  if (!item) throw new AppError(404, "INVENTORY_ITEM_NOT_FOUND", "Inventory item not found");

  type InventoryBaseline = { actualQuantity: number; baselineDate: string; baselineAt: string; baselineSource: ExpectedInventoryResult["baselineSource"]; sourcePriority?:number };
  const priorCount = await client.query<InventoryBaseline>(
    `SELECT COALESCE(correction.corrected_actual_quantity,ici.actual_quantity)::float8 "actualQuantity",ic.count_date::text "baselineDate",
            COALESCE(ic.effective_at,(ic.count_date::timestamp + interval '1 day') AT TIME ZONE 'Asia/Manila')::text "baselineAt",
            CASE ic.count_type WHEN 'OPENING' THEN 'DAILY_OPENING' WHEN 'CLOSING' THEN 'DAILY_CLOSING' ELSE 'PHYSICAL_COUNT' END::text "baselineSource"
       FROM inventory_count_items ici
       JOIN inventory_counts ic ON ic.id=ici.inventory_count_id
       LEFT JOIN LATERAL (SELECT corrected_actual_quantity FROM inventory_count_corrections
         WHERE inventory_count_item_id=ici.id ORDER BY revision DESC LIMIT 1) correction ON true
      WHERE ic.branch_id=$1 AND ici.inventory_item_id=$2 AND NOT ic.is_test_data AND ici.voided_at IS NULL
        AND (($4::text='OPENING' AND ic.count_date < $3::date) OR ($4::text<>'OPENING' AND ic.count_date <= $3::date))
      ORDER BY ic.count_date DESC,
               CASE ic.count_type WHEN 'CLOSING' THEN 0 WHEN 'FULL' THEN 1 ELSE 2 END,
               COALESCE(ic.effective_at,ic.submitted_at) DESC LIMIT 1`,
    [branchId, inventoryItemId, countDate, calculationPhase],
  );
  const openingBaseline = await client.query<InventoryBaseline>(
    `SELECT obi.quantity::float8 "actualQuantity",ob.effective_at::date::text "baselineDate",
            ob.effective_at::text "baselineAt",'OPENING_BASELINE'::text "baselineSource"
       FROM inventory_opening_baseline_items obi
       JOIN inventory_opening_baselines ob ON ob.id=obi.opening_baseline_id
      WHERE ob.branch_id=$1 AND obi.inventory_item_id=$2
        AND (($4::text='OPENING' AND ob.effective_at < $3::date) OR ($4::text<>'OPENING' AND ob.effective_at < ($3::date + interval '1 day')))
      ORDER BY ob.effective_at DESC LIMIT 1`,
    [branchId, inventoryItemId, countDate, calculationPhase],
  );
  const openingBalance = await client.query<InventoryBaseline>(
    `SELECT actual_quantity::float8 "actualQuantity",as_of::date::text "baselineDate",
            as_of::text "baselineAt",'BALANCE'::text "baselineSource"
       FROM branch_inventory_balances
      WHERE branch_id=$1 AND inventory_item_id=$2 AND NOT is_test_data
         AND (($4::text='OPENING' AND as_of::date < $3::date) OR ($4::text<>'OPENING' AND as_of::date <= $3::date))
         AND NOT EXISTS (SELECT 1 FROM inventory_count_items historical_item
           JOIN inventory_counts historical_count ON historical_count.id=historical_item.inventory_count_id
           WHERE historical_count.branch_id=$1 AND historical_item.inventory_item_id=$2 AND NOT historical_count.is_test_data
             AND (($4::text='OPENING' AND historical_count.count_date < $3::date) OR ($4::text<>'OPENING' AND historical_count.count_date <= $3::date)))
         AND NOT EXISTS (SELECT 1 FROM inventory_opening_baseline_items historical_item
           JOIN inventory_opening_baselines historical_baseline ON historical_baseline.id=historical_item.opening_baseline_id
           WHERE historical_baseline.branch_id=$1 AND historical_item.inventory_item_id=$2
             AND (($4::text='OPENING' AND historical_baseline.effective_at < $3::date) OR ($4::text<>'OPENING' AND historical_baseline.effective_at < ($3::date + interval '1 day'))))`,
    [branchId, inventoryItemId, countDate, calculationPhase],
  );
  if(priorCount.rows[0]) priorCount.rows[0].sourcePriority=0;
  if(openingBaseline.rows[0]) openingBaseline.rows[0].sourcePriority=1;
  if(openingBalance.rows[0]) openingBalance.rows[0].sourcePriority=2;
  const baseline = [priorCount.rows[0], openingBaseline.rows[0], openingBalance.rows[0]]
    .filter((candidate): candidate is InventoryBaseline => Boolean(candidate))
    .sort((left, right) => right.baselineDate.localeCompare(left.baselineDate)
      || Number(left.sourcePriority)-Number(right.sourcePriority)
      || new Date(right.baselineAt).getTime()-new Date(left.baselineAt).getTime())[0];
  if (!baseline) {
    throw new AppError(
      422,
      "NO_VALID_HISTORICAL_BASELINE",
      `No inventory baseline exists for ${item.sku} on or before ${countDate}.`,
    );
  }

  const movements = await client.query<{ received: number; adjustmentIncreases: number; adjustmentDecreases: number }>(
    `SELECT
       COALESCE(sum(quantity) FILTER (WHERE movement_type='RECEIPT'),0)::float8 received,
       COALESCE(sum(quantity) FILTER (WHERE movement_type IN ('APPROVED_ADJUSTMENT_INCREASE')),0)::float8 "adjustmentIncreases",
       COALESCE(sum(quantity) FILTER (WHERE movement_type IN ('APPROVED_ADJUSTMENT', 'APPROVED_ADJUSTMENT_DECREASE')),0)::float8 "adjustmentDecreases"
       FROM inventory_movements
      WHERE branch_id=$1 AND inventory_item_id=$2 AND NOT is_test_data
        AND occurred_at > $3::timestamptz
        AND occurred_at <= COALESCE($6::timestamptz,
          CASE WHEN $4::date < (clock_timestamp() AT TIME ZONE 'Asia/Manila')::date OR $5::text='FULL'
            THEN (($4::date + 1)::timestamp AT TIME ZONE 'Asia/Manila') - interval '1 microsecond'
            ELSE clock_timestamp() END)`,
    [branchId, inventoryItemId, baseline.baselineAt, countDate, calculationPhase, targetCutoffAt],
  );

  const consumption = await client.query<{ unit: string; quantity: number }>(
    `SELECT usage.unit,COALESCE(sum(usage.quantity_consumed),0)::float8 quantity
       FROM pos_sale_ingredient_usage usage
       JOIN pos_sale_items psi ON psi.id=usage.pos_sale_item_id
       JOIN pos_imports pi ON pi.id=psi.pos_import_id
       JOIN pos_sources source ON source.id=pi.pos_source_id
      WHERE pi.branch_id=$1 AND usage.inventory_item_id=$2 AND NOT pi.is_test_data AND pi.voided_at IS NULL
        AND pi.inventory_accounting_treatment='OPERATIONAL'
        AND ((psi.transaction_timestamp IS NOT NULL
              AND psi.transaction_timestamp > $6::timestamptz
              AND psi.transaction_timestamp <= COALESCE($8::timestamptz,
                CASE WHEN $4::date < (clock_timestamp() AT TIME ZONE 'Asia/Manila')::date OR $7::text='FULL'
                  THEN (($4::date + 1)::timestamp AT TIME ZONE 'Asia/Manila') - interval '1 microsecond'
                  ELSE clock_timestamp() END))
          OR (psi.transaction_timestamp IS NULL
              AND (($5::text IN ('OPENING_BASELINE','DAILY_OPENING') AND pi.business_date >= $3::date)
                OR ($5::text NOT IN ('OPENING_BASELINE','DAILY_OPENING') AND pi.business_date > $3::date))
              AND (($7::text='OPENING' AND pi.business_date < $4::date) OR ($7::text<>'OPENING' AND pi.business_date <= $4::date))))
      GROUP BY usage.unit`,
    [branchId, inventoryItemId, baseline.baselineDate, countDate, baseline.baselineSource, baseline.baselineAt, calculationPhase, targetCutoffAt],
  );

  const stockReceived = Number(movements.rows[0]?.received ?? 0);
  const approvedAdjustmentIncreases = Number(movements.rows[0]?.adjustmentIncreases ?? 0);
  const approvedAdjustmentDecreases = Number(movements.rows[0]?.adjustmentDecreases ?? 0);
  const approvedAdjustments = approvedAdjustmentIncreases - approvedAdjustmentDecreases;
  const expectedConsumption = consumption.rows.reduce((sum,row)=>sum+convertQuantity(Number(row.quantity),row.unit,item.unit),0);
  const previousActualQuantity = Number(baseline.actualQuantity);
  const expectedQuantity = computeExpectedStock(
    previousActualQuantity,
    stockReceived,
    expectedConsumption,
    approvedAdjustmentIncreases,
    approvedAdjustmentDecreases,
  );

  return {
    inventoryItemId: item.id,
    sku: item.sku,
    itemName: item.name,
    unit: item.unit,
    unitCost: Number(item.unitCost),
    previousActualQuantity,
    stockReceived,
    expectedConsumption,
    approvedAdjustments,
    approvedAdjustmentIncreases,
    approvedAdjustmentDecreases,
    expectedQuantity,
    baselineDate: baseline.baselineDate,
    baselineAt: baseline.baselineAt,
    baselineSource: baseline.baselineSource,
  };
}

export async function calculateExpectedInventoryBatch(
  client: Pick<PoolClient, "query">,
  branchId: string,
  countDate: string,
  calculationPhase: "FULL" | "OPENING" | "CLOSING" = "FULL",
  targetCutoffAt: string | null = null,
): Promise<ExpectedInventoryBatchResult> {
  type BatchRow = {
    inventoryItemId: string;
    sku: string;
    itemName: string;
    unit: string;
    unitCost: number;
    actualQuantity: number | null;
    baselineDate: string | null;
    baselineAt: string | null;
    baselineSource: ExpectedInventoryResult["baselineSource"] | null;
    received: number;
    adjustmentIncreases: number;
    adjustmentDecreases: number;
    consumptionUnit: string | null;
    consumptionQuantity: number | null;
  };
  const result = await client.query<BatchRow>(
    `WITH items AS (
       SELECT ii.id "inventoryItemId",ii.sku,ii.name "itemName",ii.unit,
              COALESCE(bis.current_unit_cost,ii.unit_cost)::float8 "unitCost"
         FROM inventory_items ii
         LEFT JOIN branch_inventory_settings bis ON bis.inventory_item_id=ii.id AND bis.branch_id=$1
        WHERE ii.status='ACTIVE' AND (ii.item_scope='GLOBAL' OR ii.origin_branch_id=$1)
     ), baseline_candidates AS (
       SELECT ici.inventory_item_id "inventoryItemId",COALESCE(correction.corrected_actual_quantity,ici.actual_quantity)::float8 "actualQuantity",
              ic.count_date::text "baselineDate",
              COALESCE(ic.effective_at,(ic.count_date::timestamp + interval '1 day') AT TIME ZONE 'Asia/Manila') "baselineAt",
              CASE ic.count_type WHEN 'OPENING' THEN 'DAILY_OPENING' WHEN 'CLOSING' THEN 'DAILY_CLOSING' ELSE 'PHYSICAL_COUNT' END::text "baselineSource",0 "sourcePriority",
              CASE ic.count_type WHEN 'CLOSING' THEN 0 WHEN 'FULL' THEN 1 ELSE 2 END "checkpointPriority",ic.submitted_at "sourceOrderAt"
         FROM inventory_count_items ici
         JOIN inventory_counts ic ON ic.id=ici.inventory_count_id
         JOIN items item ON item."inventoryItemId"=ici.inventory_item_id
         LEFT JOIN LATERAL (SELECT corrected_actual_quantity FROM inventory_count_corrections
           WHERE inventory_count_item_id=ici.id ORDER BY revision DESC LIMIT 1) correction ON true
         WHERE ic.branch_id=$1 AND NOT ic.is_test_data AND ici.voided_at IS NULL
          AND (($3::text='OPENING' AND ic.count_date < $2::date) OR ($3::text<>'OPENING' AND ic.count_date <= $2::date))
       UNION ALL
       SELECT obi.inventory_item_id,obi.quantity::float8,ob.effective_at::date::text,
              ob.effective_at,'OPENING_BASELINE'::text,1,3,ob.effective_at
         FROM inventory_opening_baseline_items obi
         JOIN inventory_opening_baselines ob ON ob.id=obi.opening_baseline_id
         JOIN items item ON item."inventoryItemId"=obi.inventory_item_id
        WHERE ob.branch_id=$1
          AND (($3::text='OPENING' AND ob.effective_at < $2::date) OR ($3::text<>'OPENING' AND ob.effective_at < ($2::date + interval '1 day')))
       UNION ALL
       SELECT balance.inventory_item_id,balance.actual_quantity::float8,balance.as_of::date::text,
              balance.as_of,'BALANCE'::text,2,4,balance.as_of
         FROM branch_inventory_balances balance
         JOIN items item ON item."inventoryItemId"=balance.inventory_item_id
        WHERE balance.branch_id=$1 AND NOT balance.is_test_data
           AND (($3::text='OPENING' AND balance.as_of::date < $2::date) OR ($3::text<>'OPENING' AND balance.as_of::date <= $2::date))
           AND NOT EXISTS (SELECT 1 FROM inventory_count_items historical_item
             JOIN inventory_counts historical_count ON historical_count.id=historical_item.inventory_count_id
             WHERE historical_count.branch_id=$1 AND historical_item.inventory_item_id=balance.inventory_item_id AND NOT historical_count.is_test_data
               AND (($3::text='OPENING' AND historical_count.count_date < $2::date) OR ($3::text<>'OPENING' AND historical_count.count_date <= $2::date)))
           AND NOT EXISTS (SELECT 1 FROM inventory_opening_baseline_items historical_item
             JOIN inventory_opening_baselines historical_baseline ON historical_baseline.id=historical_item.opening_baseline_id
             WHERE historical_baseline.branch_id=$1 AND historical_item.inventory_item_id=balance.inventory_item_id
               AND (($3::text='OPENING' AND historical_baseline.effective_at < $2::date) OR ($3::text<>'OPENING' AND historical_baseline.effective_at < ($2::date + interval '1 day'))))
     ), baselines AS (
       SELECT DISTINCT ON (candidate."inventoryItemId") candidate.*
         FROM baseline_candidates candidate
        ORDER BY candidate."inventoryItemId",candidate."baselineDate"::date DESC,candidate."checkpointPriority",candidate."sourcePriority",candidate."baselineAt" DESC,candidate."sourceOrderAt" DESC
     ), movement_totals AS (
       SELECT baseline."inventoryItemId",
              COALESCE(sum(movement.quantity) FILTER (WHERE movement.movement_type='RECEIPT'),0)::float8 received,
              COALESCE(sum(movement.quantity) FILTER (WHERE movement.movement_type='APPROVED_ADJUSTMENT_INCREASE'),0)::float8 "adjustmentIncreases",
              COALESCE(sum(movement.quantity) FILTER (WHERE movement.movement_type IN ('APPROVED_ADJUSTMENT','APPROVED_ADJUSTMENT_DECREASE')),0)::float8 "adjustmentDecreases"
         FROM baselines baseline
         LEFT JOIN inventory_movements movement ON movement.branch_id=$1
          AND movement.inventory_item_id=baseline."inventoryItemId" AND NOT movement.is_test_data
          AND movement.occurred_at > baseline."baselineAt"
          AND movement.occurred_at <= COALESCE($4::timestamptz,
            CASE WHEN $2::date < (clock_timestamp() AT TIME ZONE 'Asia/Manila')::date OR $3::text='FULL'
              THEN (($2::date + 1)::timestamp AT TIME ZONE 'Asia/Manila') - interval '1 microsecond'
              ELSE clock_timestamp() END)
        GROUP BY baseline."inventoryItemId"
     ), consumption_totals AS (
       SELECT baseline."inventoryItemId",usage.unit "consumptionUnit",
              COALESCE(sum(usage.quantity_consumed),0)::float8 "consumptionQuantity"
         FROM baselines baseline
         JOIN pos_imports pi ON pi.branch_id=$1 AND NOT pi.is_test_data AND pi.voided_at IS NULL
          AND pi.inventory_accounting_treatment='OPERATIONAL'
         JOIN pos_sources source ON source.id=pi.pos_source_id
         JOIN pos_sale_items psi ON psi.pos_import_id=pi.id
         JOIN pos_sale_ingredient_usage usage ON usage.pos_sale_item_id=psi.id
          AND usage.inventory_item_id=baseline."inventoryItemId"
        WHERE (psi.transaction_timestamp IS NOT NULL
              AND psi.transaction_timestamp > baseline."baselineAt"
              AND psi.transaction_timestamp <= COALESCE($4::timestamptz,
                CASE WHEN $2::date < (clock_timestamp() AT TIME ZONE 'Asia/Manila')::date OR $3::text='FULL'
                  THEN (($2::date + 1)::timestamp AT TIME ZONE 'Asia/Manila') - interval '1 microsecond'
                  ELSE clock_timestamp() END))
           OR (psi.transaction_timestamp IS NULL
              AND ((baseline."baselineSource" IN ('OPENING_BASELINE','DAILY_OPENING') AND pi.business_date >= baseline."baselineDate"::date)
                OR (baseline."baselineSource" NOT IN ('OPENING_BASELINE','DAILY_OPENING') AND pi.business_date > baseline."baselineDate"::date))
              AND (($3::text='OPENING' AND pi.business_date < $2::date) OR ($3::text<>'OPENING' AND pi.business_date <= $2::date)))
        GROUP BY baseline."inventoryItemId",usage.unit
     )
     SELECT item.*,baseline."actualQuantity",baseline."baselineDate",baseline."baselineAt",baseline."baselineSource",
            COALESCE(movement.received,0)::float8 received,
            COALESCE(movement."adjustmentIncreases",0)::float8 "adjustmentIncreases",
            COALESCE(movement."adjustmentDecreases",0)::float8 "adjustmentDecreases",
            consumption."consumptionUnit",consumption."consumptionQuantity"
       FROM items item
       LEFT JOIN baselines baseline ON baseline."inventoryItemId"=item."inventoryItemId"
       LEFT JOIN movement_totals movement ON movement."inventoryItemId"=item."inventoryItemId"
       LEFT JOIN consumption_totals consumption ON consumption."inventoryItemId"=item."inventoryItemId"
      ORDER BY item."itemName",consumption."consumptionUnit"`,
    [branchId, countDate, calculationPhase, targetCutoffAt],
  );

  const unavailableItems: UnavailableExpectedInventoryItem[] = [];
  const grouped = new Map<string, { row: BatchRow; consumption: Array<{ unit: string; quantity: number }> }>();
  for (const row of result.rows) {
    if (!row.baselineSource || row.actualQuantity === null || !row.baselineDate) {
      if (!unavailableItems.some((item) => item.inventoryItemId === row.inventoryItemId)) {
        unavailableItems.push({
          inventoryItemId: row.inventoryItemId,
          sku: row.sku,
          itemName: row.itemName,
          unit: row.unit,
          availability: "NO_BASELINE",
        });
      }
      continue;
    }
    const item = grouped.get(row.inventoryItemId) ?? { row, consumption: [] };
    if (row.consumptionUnit && row.consumptionQuantity !== null) {
      item.consumption.push({ unit: row.consumptionUnit, quantity: Number(row.consumptionQuantity) });
    }
    grouped.set(row.inventoryItemId, item);
  }

  const items = [...grouped.values()].map(({ row, consumption }) => {
    const stockReceived = Number(row.received ?? 0);
    const approvedAdjustmentIncreases = Number(row.adjustmentIncreases ?? 0);
    const approvedAdjustmentDecreases = Number(row.adjustmentDecreases ?? 0);
    const approvedAdjustments = approvedAdjustmentIncreases - approvedAdjustmentDecreases;
    const expectedConsumption = consumption.reduce(
      (sum, usage) => sum + convertQuantity(usage.quantity, usage.unit, row.unit),
      0,
    );
    const previousActualQuantity = Number(row.actualQuantity);
    return {
      inventoryItemId: row.inventoryItemId,
      sku: row.sku,
      itemName: row.itemName,
      unit: row.unit,
      unitCost: Number(row.unitCost),
      previousActualQuantity,
      stockReceived,
      expectedConsumption,
      approvedAdjustments,
      approvedAdjustmentIncreases,
      approvedAdjustmentDecreases,
      expectedQuantity: computeExpectedStock(
        previousActualQuantity,
        stockReceived,
        expectedConsumption,
        approvedAdjustmentIncreases,
        approvedAdjustmentDecreases,
      ),
      baselineDate: row.baselineDate!,
      baselineAt: row.baselineAt!,
      baselineSource: row.baselineSource!,
    } satisfies ExpectedInventoryResult;
  });
  return { items, unavailableItems };
}
