import type { PoolClient } from "pg";
import { AppError } from "../utils/appError.js";

type InventoryDb = Pick<PoolClient, "query">;

export async function assertOperationalInventoryBaselines(
  db: InventoryDb,
  branchId: string,
  inventoryItemIds: string[],
  businessDate: string,
  operationLabel: string,
) {
  const uniqueIds = [...new Set(inventoryItemIds)];
  if (uniqueIds.length === 0) return;

  const unavailable = await db.query<{ sku: string; name: string }>(
    `SELECT ii.sku,ii.name
       FROM inventory_items ii
      WHERE ii.id=ANY($2::uuid[])
        AND NOT (
          EXISTS (
            SELECT 1
              FROM inventory_count_items item
              JOIN inventory_counts count_record ON count_record.id=item.inventory_count_id
             WHERE count_record.branch_id=$1
               AND item.inventory_item_id=ii.id
               AND NOT count_record.is_test_data
               AND item.voided_at IS NULL
               AND count_record.count_date <= $3::date
          )
          OR EXISTS (
            SELECT 1
              FROM inventory_opening_baseline_items item
              JOIN inventory_opening_baselines baseline ON baseline.id=item.opening_baseline_id
             WHERE baseline.branch_id=$1
               AND item.inventory_item_id=ii.id
               AND (baseline.effective_at AT TIME ZONE 'Asia/Manila')::date <= $3::date
          )
          OR EXISTS (
            SELECT 1
              FROM branch_inventory_balances balance
             WHERE balance.branch_id=$1
               AND balance.inventory_item_id=ii.id
               AND NOT balance.is_test_data
               AND (balance.as_of AT TIME ZONE 'Asia/Manila')::date <= $3::date
          )
        )
      ORDER BY ii.name`,
    [branchId, uniqueIds, businessDate],
  );

  if (unavailable.rows.length > 0) {
    throw new AppError(
      409,
      "INVENTORY_BASELINE_REQUIRED",
      `${operationLabel} cannot continue because initial stock is not effective for: ${unavailable.rows.map((item) => `${item.sku} (${item.name})`).join(", ")}. Set a physically verified initial quantity first.`,
    );
  }
}
