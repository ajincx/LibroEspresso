import type { PoolClient } from "pg";
import type { TokenUser } from "../types/auth.js";
import { writeAudit } from "./audit.service.js";
import { AppError } from "../utils/appError.js";

export type ReorderCategory = "FAST" | "MEDIUM" | "SLOW";

export interface BranchReorderConfigurationInput {
  branchId: string;
  inventoryItemId: string;
  category: ReorderCategory;
  reorderLevel: number;
  reorderDays: number;
  reason: string;
}

export async function configureBranchReorderPolicy(
  client: Pick<PoolClient, "query">,
  user: TokenUser,
  input: BranchReorderConfigurationInput,
) {
  if (user.role !== "OWNER") throw new AppError(403, "FORBIDDEN", "Only the Owner can configure reorder policies");
  const target = await client.query<{ inventoryItemId: string; sku: string; branchName: string }>(
    `SELECT ii.id "inventoryItemId",ii.sku,b.name "branchName"
       FROM inventory_items ii CROSS JOIN branches b
      WHERE ii.id=$1 AND b.id=$2 AND ii.status='ACTIVE' AND b.status='ACTIVE'
        AND ii.sku<>'ING-00073' AND (ii.item_scope='GLOBAL' OR ii.origin_branch_id=b.id)
      FOR UPDATE OF ii,b`,
    [input.inventoryItemId, input.branchId],
  );
  if (!target.rows[0]) throw new AppError(422, "REORDER_CONFIGURATION_TARGET_INVALID", "Select an active branch and operational inventory item");

  const priorResult = await client.query<{
    category: ReorderCategory | null;
    reorderLevel: number;
    reorderDays: number;
  }>(
    `SELECT bis.reorder_category "category",bis.reorder_level::float8 "reorderLevel",bis.reorder_days "reorderDays"
       FROM branch_inventory_settings bis
      WHERE bis.branch_id=$1 AND bis.inventory_item_id=$2 FOR UPDATE`,
    [input.branchId, input.inventoryItemId],
  );
  const fallback = priorResult.rows[0] ?? (await client.query<{ reorderLevel: number }>(
    `SELECT reorder_level::float8 "reorderLevel" FROM inventory_items WHERE id=$1`,
    [input.inventoryItemId],
  )).rows[0];
  const previous = priorResult.rows[0]
    ? { category: priorResult.rows[0].category, reorderLevel: Number(priorResult.rows[0].reorderLevel), reorderDays: priorResult.rows[0].reorderDays }
    : { category: null, reorderLevel: Number(fallback?.reorderLevel ?? 0), reorderDays: 7 };

  const result = await client.query(
    `INSERT INTO branch_inventory_settings
       (branch_id,inventory_item_id,current_unit_cost,reorder_level,reorder_days,reorder_category,updated_by)
     SELECT $1,ii.id,ii.unit_cost,$3,$4,$5,$2 FROM inventory_items ii WHERE ii.id=$6
     ON CONFLICT (branch_id,inventory_item_id) DO UPDATE
       SET reorder_level=excluded.reorder_level,reorder_days=excluded.reorder_days,
           reorder_category=excluded.reorder_category,updated_by=excluded.updated_by,updated_at=now()
     RETURNING inventory_item_id "inventoryItemId",reorder_level::float8 "reorderLevel",
               reorder_days "reorderDays",reorder_category "category",updated_at "updatedAt"`,
    [input.branchId, user.id, input.reorderLevel, input.reorderDays, input.category, input.inventoryItemId],
  );
  await writeAudit(
    user,
    "CONFIGURE_BRANCH_REORDER_POLICY",
    "INVENTORY_ITEM",
    input.inventoryItemId,
    `Configured manual initial reorder policy for ${target.rows[0].sku} at ${target.rows[0].branchName}`,
    {
      configurationType: "MANUAL_INITIAL_CONFIGURATION",
      branchId: input.branchId,
      branchName: target.rows[0].branchName,
      sku: target.rows[0].sku,
      previousCategory: previous.category,
      newCategory: input.category,
      previousReorderLevel: previous.reorderLevel,
      newReorderLevel: input.reorderLevel,
      previousCoverageDays: previous.reorderDays,
      newCoverageDays: input.reorderDays,
      reason: input.reason,
      configuredBy: user.id,
    },
    client as PoolClient,
  );
  return result.rows[0];
}
