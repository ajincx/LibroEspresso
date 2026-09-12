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
}

export interface VarianceResult {
  varianceQuantity: number;
  varianceValue: number;
  variancePercentage: number | null;
}

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

export function computeVariance(
  expectedQuantity: number,
  actualQuantity: number,
  unitCost: number,
): VarianceResult {
  const varianceQuantity = expectedQuantity - actualQuantity;
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

  const priorCount = await client.query<{ actualQuantity: number; baselineDate: string }>(
    `SELECT ici.actual_quantity::float8 "actualQuantity",ic.count_date::text "baselineDate"
       FROM inventory_count_items ici
       JOIN inventory_counts ic ON ic.id=ici.inventory_count_id
      WHERE ic.branch_id=$1 AND ici.inventory_item_id=$2 AND ic.count_date < $3::date
      ORDER BY ic.count_date DESC,ic.submitted_at DESC LIMIT 1`,
    [branchId, inventoryItemId, countDate],
  );
  const openingBalance = await client.query<{ actualQuantity: number; baselineDate: string }>(
    `SELECT actual_quantity::float8 "actualQuantity",as_of::date::text "baselineDate"
       FROM branch_inventory_balances WHERE branch_id=$1 AND inventory_item_id=$2`,
    [branchId, inventoryItemId],
  );
  const baseline = priorCount.rows[0] ?? openingBalance.rows[0] ?? { actualQuantity: 0, baselineDate: "1970-01-01" };

  const movements = await client.query<{ received: number; adjustmentIncreases: number; adjustmentDecreases: number }>(
    `SELECT
       COALESCE(sum(quantity) FILTER (WHERE movement_type='RECEIPT'),0)::float8 received,
       COALESCE(sum(quantity) FILTER (WHERE movement_type IN ('APPROVED_ADJUSTMENT_INCREASE')),0)::float8 "adjustmentIncreases",
       COALESCE(sum(quantity) FILTER (WHERE movement_type IN ('APPROVED_ADJUSTMENT', 'APPROVED_ADJUSTMENT_DECREASE')),0)::float8 "adjustmentDecreases"
       FROM inventory_movements
      WHERE branch_id=$1 AND inventory_item_id=$2
        AND occurred_at::date > $3::date AND occurred_at::date <= $4::date`,
    [branchId, inventoryItemId, baseline.baselineDate, countDate],
  );

  const consumption = await client.query<{ unit: string; quantity: number }>(
    `SELECT usage.unit,COALESCE(sum(usage.quantity_consumed),0)::float8 quantity
       FROM pos_sale_ingredient_usage usage
       JOIN pos_sale_items psi ON psi.id=usage.pos_sale_item_id
       JOIN pos_imports pi ON pi.id=psi.pos_import_id
      WHERE pi.branch_id=$1 AND usage.inventory_item_id=$2 AND pi.business_date > $3::date AND pi.business_date <= $4::date
      GROUP BY usage.unit`,
    [branchId, inventoryItemId, baseline.baselineDate, countDate],
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
  };
}
