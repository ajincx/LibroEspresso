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
  baselineSource: "PHYSICAL_COUNT" | "OPENING_BASELINE" | "BALANCE";
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

  type InventoryBaseline = { actualQuantity: number; baselineDate: string; baselineAt: string; baselineSource: ExpectedInventoryResult["baselineSource"] };
  const priorCount = await client.query<InventoryBaseline>(
    `SELECT ici.actual_quantity::float8 "actualQuantity",ic.count_date::text "baselineDate",
            ((ic.count_date::timestamp + interval '1 day') AT TIME ZONE 'Asia/Manila')::text "baselineAt",
            'PHYSICAL_COUNT'::text "baselineSource"
       FROM inventory_count_items ici
       JOIN inventory_counts ic ON ic.id=ici.inventory_count_id
      WHERE ic.branch_id=$1 AND ici.inventory_item_id=$2 AND NOT ic.is_test_data AND ic.count_date <= $3::date
      ORDER BY ic.count_date DESC,ic.submitted_at DESC LIMIT 1`,
    [branchId, inventoryItemId, countDate],
  );
  const openingBaseline = await client.query<InventoryBaseline>(
    `SELECT obi.quantity::float8 "actualQuantity",ob.effective_at::date::text "baselineDate",
            ob.effective_at::text "baselineAt",'OPENING_BASELINE'::text "baselineSource"
       FROM inventory_opening_baseline_items obi
       JOIN inventory_opening_baselines ob ON ob.id=obi.opening_baseline_id
      WHERE ob.branch_id=$1 AND obi.inventory_item_id=$2
        AND ob.effective_at < ($3::date + interval '1 day')
      ORDER BY ob.effective_at DESC LIMIT 1`,
    [branchId, inventoryItemId, countDate],
  );
  const openingBalance = await client.query<InventoryBaseline>(
    `SELECT actual_quantity::float8 "actualQuantity",as_of::date::text "baselineDate",
            as_of::text "baselineAt",'BALANCE'::text "baselineSource"
       FROM branch_inventory_balances
      WHERE branch_id=$1 AND inventory_item_id=$2 AND NOT is_test_data
        AND as_of::date <= $3::date`,
    [branchId, inventoryItemId, countDate],
  );
  const baseline = [priorCount.rows[0], openingBaseline.rows[0], openingBalance.rows[0]]
    .filter((candidate): candidate is InventoryBaseline => Boolean(candidate))
    .sort((left, right) => new Date(right.baselineAt).getTime() - new Date(left.baselineAt).getTime())[0];
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
        AND (($5::text='OPENING_BASELINE' AND occurred_at >= $6::timestamptz)
          OR ($5::text<>'OPENING_BASELINE' AND occurred_at::date > $3::date))
        AND occurred_at::date <= $4::date`,
    [branchId, inventoryItemId, baseline.baselineDate, countDate, baseline.baselineSource, baseline.baselineAt],
  );

  const consumption = await client.query<{ unit: string; quantity: number }>(
    `SELECT usage.unit,COALESCE(sum(usage.quantity_consumed),0)::float8 quantity
       FROM pos_sale_ingredient_usage usage
       JOIN pos_sale_items psi ON psi.id=usage.pos_sale_item_id
       JOIN pos_imports pi ON pi.id=psi.pos_import_id
       JOIN pos_sources source ON source.id=pi.pos_source_id AND source.status='ACTIVE'
      WHERE pi.branch_id=$1 AND usage.inventory_item_id=$2
        AND (($5::text='OPENING_BASELINE' AND pi.business_date >= $3::date)
          OR ($5::text<>'OPENING_BASELINE' AND pi.business_date > $3::date))
        AND pi.business_date <= $4::date
      GROUP BY usage.unit`,
    [branchId, inventoryItemId, baseline.baselineDate, countDate, baseline.baselineSource],
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
    baselineSource: baseline.baselineSource,
  };
}
