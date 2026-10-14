import type { RequestHandler } from "express";
import type { PoolClient } from "pg";
import { pool } from "../config/database.js";
import { env } from "../config/env.js";
import { getEffectiveBranchId } from "../services/branchScope.js";
import { writeAudit } from "../services/audit.service.js";
import { lockBranchInventoryOperation } from "../services/inventoryOperationLock.service.js";
import { normalizePhysicalCountQuantity } from "../services/physicalCountUnit.service.js";
import { AppError } from "../utils/appError.js";
import { openingInventoryBaselineBatchInput, openingInventoryBaselineFilters, startingStockConfirmationInput } from "../validators/inventoryWorkflow.js";

const baselineSelection = `SELECT ob.id,ob.baseline_no "baselineNo",ob.branch_id "branchId",b.name "branchName",
  ob.effective_at::text "effectiveAt",ob.designation,ob.notes,ob.created_at::text "createdAt",
  concat_ws(' ',u.first_name,u.last_name) "createdBy",
  COALESCE(json_agg(json_build_object('id',obi.id,'inventoryItemId',ii.id,'sku',ii.sku,'name',ii.name,
    'quantity',obi.quantity::float8,'unit',obi.unit) ORDER BY ii.name) FILTER (WHERE obi.id IS NOT NULL),'[]') items
 FROM inventory_opening_baselines ob
 JOIN branches b ON b.id=ob.branch_id
 JOIN users u ON u.id=ob.created_by
 LEFT JOIN inventory_opening_baseline_items obi ON obi.opening_baseline_id=ob.id
 LEFT JOIN inventory_items ii ON ii.id=obi.inventory_item_id`;

type InventoryDb = Pick<PoolClient, "query">;

const operationalItemsSql = `SELECT id "inventoryItemId",sku,name,category,unit
  FROM inventory_items
 WHERE status='ACTIVE'
   AND left(upper(name),5) <> 'TEST_'
   AND (item_scope='GLOBAL' OR origin_branch_id=$1)
 ORDER BY category,name`;

async function loadInitializationEvidence(db: InventoryDb, branchId: string) {
  const result = await db.query<{
    baselineCount: number;
    balanceCount: number;
    countCount: number;
    movementCount: number;
    usageCount: number;
  }>(
    `SELECT
       (SELECT count(*)::int FROM inventory_opening_baselines WHERE branch_id=$1) "baselineCount",
       (SELECT count(*)::int FROM branch_inventory_balances WHERE branch_id=$1) "balanceCount",
       (SELECT count(*)::int FROM inventory_counts WHERE branch_id=$1) "countCount",
       (SELECT count(*)::int FROM inventory_movements WHERE branch_id=$1) "movementCount",
       (SELECT count(*)::int
          FROM pos_sale_ingredient_usage usage
          JOIN pos_sale_items sale_item ON sale_item.id=usage.pos_sale_item_id
          JOIN pos_imports import_record ON import_record.id=sale_item.pos_import_id
         WHERE import_record.branch_id=$1) "usageCount"`,
    [branchId],
  );
  return result.rows[0] ?? { baselineCount: 0, balanceCount: 0, countCount: 0, movementCount: 0, usageCount: 0 };
}

async function loadLatestBaseline(db: InventoryDb, branchId: string) {
  const result = await db.query(
    `${baselineSelection} WHERE ob.branch_id=$1
     GROUP BY ob.id,b.name,u.first_name,u.last_name
     ORDER BY ob.effective_at DESC LIMIT 1`,
    [branchId],
  );
  return result.rows[0] ?? null;
}

function blockedStartingStockMessage(evidence: Awaited<ReturnType<typeof loadInitializationEvidence>>) {
  if (evidence.baselineCount > 0) return "Starting Stock is already established for this branch and is available below in read-only mode.";
  return "This branch already has inventory history, so Starting Stock cannot be added safely. Continue normal operations with Physical Counts, or ask an administrator to review the branch history.";
}

export const listOpeningInventoryBaselines: RequestHandler = async (req, res) => {
  const filters = openingInventoryBaselineFilters.parse(req.query);
  const branchId = getEffectiveBranchId(req.user!, filters.branchId);
  const result = await pool.query(
    `${baselineSelection}${branchId ? " WHERE ob.branch_id=$1" : ""}
     GROUP BY ob.id,b.name,u.first_name,u.last_name ORDER BY ob.effective_at DESC,b.name`,
    branchId ? [branchId] : [],
  );
  res.json({ success: true, data: { baselines: result.rows } });
};

export const getStartingStockSetup: RequestHandler = async (req, res) => {
  const filters = openingInventoryBaselineFilters.parse(req.query);
  const branchId = getEffectiveBranchId(req.user!, filters.branchId);
  if (!branchId) throw new AppError(422, "STARTING_STOCK_BRANCH_REQUIRED", "Select one branch to view Starting Stock setup.");
  const branch = await pool.query<{ id: string; name: string }>(`SELECT id,name FROM branches WHERE id=$1 AND status='ACTIVE'`, [branchId]);
  if (!branch.rows[0]) throw new AppError(404, "BRANCH_NOT_FOUND", "Active branch not found");
  const [items, evidence, baseline] = await Promise.all([
    pool.query(operationalItemsSql, [branchId]),
    loadInitializationEvidence(pool, branchId),
    loadLatestBaseline(pool, branchId),
  ]);
  const status = baseline ? "INITIALIZED" : evidence.baselineCount || evidence.balanceCount || evidence.countCount || evidence.movementCount || evidence.usageCount ? "BLOCKED" : "READY";
  res.json({ success: true, data: { setup: {
    branchId,
    branchName: branch.rows[0].name,
    status,
    message: status === "READY"
      ? "Enter the actual stock available when this branch begins using Libro."
      : blockedStartingStockMessage(evidence),
    items: items.rows,
    baseline,
  } } });
};

export const confirmStartingStock: RequestHandler = async (req, res) => {
  const input = startingStockConfirmationInput.parse(req.body);
  const branchId = getEffectiveBranchId(req.user!);
  if (!branchId) throw new AppError(403, "BRANCH_NOT_ASSIGNED", "No branch is assigned to this account");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await lockBranchInventoryOperation(client, branchId);
    const branch = await client.query<{ id: string; name: string }>(`SELECT id,name FROM branches WHERE id=$1 AND status='ACTIVE' FOR UPDATE`, [branchId]);
    if (!branch.rows[0]) throw new AppError(404, "BRANCH_NOT_FOUND", "Active branch not found");
    const evidence = await loadInitializationEvidence(client, branchId);
    if (evidence.baselineCount || evidence.balanceCount || evidence.countCount || evidence.movementCount || evidence.usageCount) {
      throw new AppError(409, evidence.baselineCount ? "STARTING_STOCK_EXISTS" : "STARTING_STOCK_INITIALIZATION_BLOCKED", blockedStartingStockMessage(evidence));
    }
    const available = await client.query<{ inventoryItemId: string; sku: string; name: string; unit: string }>(operationalItemsSql, [branchId]);
    const submittedIds = new Set(input.items.map((item) => item.inventoryItemId));
    if (available.rows.length === 0 || input.items.length !== available.rows.length || available.rows.some((item) => !submittedIds.has(item.inventoryItemId))) {
      throw new AppError(422, "STARTING_STOCK_ITEMS_INCOMPLETE", "Enter a starting quantity for every active ingredient assigned to this branch.");
    }
    const availableById = new Map(available.rows.map((item) => [item.inventoryItemId, item]));
    const normalizedItems = input.items.map((submitted) => {
      const item = availableById.get(submitted.inventoryItemId);
      if (!item) throw new AppError(422, "STARTING_STOCK_ITEM_INVALID", "Starting Stock contains an inactive or unavailable ingredient.");
      try {
        return { ...item, quantity: normalizePhysicalCountQuantity({ quantity: submitted.quantity, enteredUnit: submitted.enteredUnit, canonicalUnit: item.unit }) };
      } catch (error) {
        throw new AppError(422, "STARTING_STOCK_UNIT_INCOMPATIBLE", error instanceof Error ? error.message : "Invalid Starting Stock unit");
      }
    });
    const created = await client.query<{ id: string }>(
      `INSERT INTO inventory_opening_baselines
         (baseline_no,branch_id,effective_at,designation,notes,created_by)
       VALUES (concat('OB-',to_char(now() AT TIME ZONE 'Asia/Manila','YYYY'),'-',
                      lpad(nextval('inventory_opening_baseline_no_seq')::text,5,'0')),$1,now(),'STARTING_STOCK',$2,$3)
       RETURNING id`,
      [branchId, "Initial stock recorded when the branch began using Libro.", req.user!.id],
    );
    const baselineId = created.rows[0]!.id;
    await client.query(
      `INSERT INTO inventory_opening_baseline_items (opening_baseline_id,inventory_item_id,quantity,unit)
       SELECT $1,item_id,quantity,unit
         FROM unnest($2::uuid[],$3::numeric[],$4::text[]) input(item_id,quantity,unit)`,
      [baselineId, normalizedItems.map((item) => item.inventoryItemId), normalizedItems.map((item) => item.quantity), normalizedItems.map((item) => item.unit)],
    );
    await writeAudit(
      req.user!,
      "CONFIRM_STARTING_STOCK",
      "INVENTORY_OPENING_BASELINE",
      baselineId,
      `Confirmed Starting Stock for ${branch.rows[0].name}`,
      { branchId, itemCount: normalizedItems.length, explicitZeroCount: normalizedItems.filter((item) => item.quantity === 0).length },
      client,
    );
    const baseline = await loadLatestBaseline(client, branchId);
    await client.query("COMMIT");
    res.status(201).json({ success: true, data: { baseline } });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export const createOpeningInventoryBaseline: RequestHandler = async (req, res) => {
  const input = openingInventoryBaselineBatchInput.parse(req.body);
  if (env.DATA_LIFECYCLE_ENV === "PRODUCTION") {
    throw new AppError(403, "UAT_OPENING_BASELINE_FORBIDDEN", "UAT opening baselines cannot be created in production.");
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const createdIds: string[] = [];
    for (const baseline of input.baselines) {
    const branch = await client.query<{ id: string; name: string }>(
      `SELECT id,name FROM branches WHERE id=$1 AND status='ACTIVE' FOR UPDATE`,
      [baseline.branchId],
    );
    if (!branch.rows[0]) throw new AppError(404, "BRANCH_NOT_FOUND", "Active branch not found");
    const duplicate = await client.query(
      `SELECT id FROM inventory_opening_baselines WHERE branch_id=$1 AND effective_at=$2::timestamptz AND designation=$3`,
      [baseline.branchId, baseline.effectiveAt, baseline.designation],
    );
    if (duplicate.rows[0]) throw new AppError(409, "OPENING_BASELINE_EXISTS", "An opening baseline already exists for this branch and effective time.");

    const inventoryIds = baseline.items.map((item) => item.inventoryItemId);
    const available = await client.query<{ id: string; sku: string; name: string; unit: string }>(
      `SELECT id,sku,name,unit FROM inventory_items
        WHERE id=ANY($1::uuid[]) AND status='ACTIVE'
          AND (item_scope='GLOBAL' OR origin_branch_id=$2)`,
      [inventoryIds, baseline.branchId],
    );
    if (available.rows.length !== baseline.items.length) {
      throw new AppError(422, "OPENING_BASELINE_ITEM_INVALID", "Every opening-baseline item must be an active inventory item available to the branch.");
    }
    const availableById = new Map(available.rows.map((item) => [item.id, item]));
    for (const item of baseline.items) {
      const inventoryItem = availableById.get(item.inventoryItemId)!;
      if (inventoryItem.name.toUpperCase().startsWith("TEST_")) {
        throw new AppError(422, "OPENING_BASELINE_TEST_ITEM_FORBIDDEN", "Test-labelled inventory items cannot be included in an operational opening baseline.");
      }
      if (inventoryItem.unit !== item.unit) {
        throw new AppError(422, "OPENING_BASELINE_UNIT_INVALID", `${inventoryItem.sku} must use its canonical ${inventoryItem.unit} unit.`);
      }
    }

    const created = await client.query<{ id: string }>(
      `INSERT INTO inventory_opening_baselines
         (baseline_no,branch_id,effective_at,designation,notes,created_by)
       VALUES (concat('OB-',to_char($2::timestamptz AT TIME ZONE 'Asia/Manila','YYYY'),'-',
                      lpad(nextval('inventory_opening_baseline_no_seq')::text,5,'0')),$1,$2,$3,$4,$5)
       RETURNING id`,
      [baseline.branchId, baseline.effectiveAt, baseline.designation, baseline.notes, req.user!.id],
    );
    const baselineId = created.rows[0]!.id;
    await client.query(
      `INSERT INTO inventory_opening_baseline_items
         (opening_baseline_id,inventory_item_id,quantity,unit)
       SELECT $1,item_id,quantity,unit
         FROM unnest($2::uuid[],$3::numeric[],$4::text[]) AS input(item_id,quantity,unit)`,
      [baselineId, inventoryIds, baseline.items.map((item) => item.quantity), baseline.items.map((item) => item.unit)],
    );
    await writeAudit(
      req.user!,
      "CREATE_UAT_OPENING_INVENTORY",
      "INVENTORY_OPENING_BASELINE",
      baselineId,
      `Created ${baseline.designation} opening inventory for ${branch.rows[0].name}`,
      { branchId: baseline.branchId, effectiveAt: baseline.effectiveAt, designation: baseline.designation, itemCount: baseline.items.length },
      client,
    );
    createdIds.push(baselineId);
    }
    const result = await client.query(`${baselineSelection} WHERE ob.id=ANY($1::uuid[]) GROUP BY ob.id,b.name,u.first_name,u.last_name ORDER BY b.name`, [createdIds]);
    await client.query("COMMIT");
    res.status(201).json({ success: true, data: { baselines: result.rows } });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};
