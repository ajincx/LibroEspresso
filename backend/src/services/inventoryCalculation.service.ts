import type { PoolClient } from "pg";
import { AppError } from "../utils/appError.js";

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
  expectedQuantity: number;
  baselineDate: string;
}

export function computeExpectedStock(previousActual: number, stockReceived: number, expectedConsumption: number, approvedAdjustments: number) {
  return previousActual + stockReceived - expectedConsumption - approvedAdjustments;
}

export async function calculateExpectedInventory(
  client: Pick<PoolClient, "query">,
  branchId: string,
  inventoryItemId: string,
  countDate: string,
): Promise<ExpectedInventoryResult> {
  const itemResult = await client.query<{
    id: string; sku: string; name: string; unit: string; unitCost: number;
  }>(`SELECT id,sku,name,unit,unit_cost::float8 "unitCost" FROM inventory_items WHERE id=$1 AND status='ACTIVE'`, [inventoryItemId]);
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

  const movements = await client.query<{ received: number; adjustments: number }>(
    `SELECT
       COALESCE(sum(quantity) FILTER (WHERE movement_type='RECEIPT'),0)::float8 received,
       COALESCE(sum(quantity) FILTER (WHERE movement_type='APPROVED_ADJUSTMENT'),0)::float8 adjustments
       FROM inventory_movements
      WHERE branch_id=$1 AND inventory_item_id=$2
        AND occurred_at::date > $3::date AND occurred_at::date <= $4::date`,
    [branchId, inventoryItemId, baseline.baselineDate, countDate],
  );

  const consumption = await client.query<{ quantity: number }>(
    `SELECT COALESCE(sum(usage.quantity_consumed),0)::float8 quantity
       FROM pos_sale_ingredient_usage usage
       JOIN pos_sale_items psi ON psi.id=usage.pos_sale_item_id
       JOIN pos_imports pi ON pi.id=psi.pos_import_id
      WHERE pi.branch_id=$1 AND usage.inventory_item_id=$2 AND pi.business_date > $3::date AND pi.business_date <= $4::date`,
    [branchId, inventoryItemId, baseline.baselineDate, countDate],
  );

  const stockReceived = Number(movements.rows[0]?.received ?? 0);
  const approvedAdjustments = Number(movements.rows[0]?.adjustments ?? 0);
  const expectedConsumption = Number(consumption.rows[0]?.quantity ?? 0);
  const previousActualQuantity = Number(baseline.actualQuantity);
  const expectedQuantity = computeExpectedStock(previousActualQuantity, stockReceived, expectedConsumption, approvedAdjustments);

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
    expectedQuantity,
    baselineDate: baseline.baselineDate,
  };
}
