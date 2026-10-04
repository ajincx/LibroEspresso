import type { RequestHandler } from "express";
import { pool } from "../config/database.js";
import { env } from "../config/env.js";
import { getEffectiveBranchId } from "../services/branchScope.js";
import { writeAudit } from "../services/audit.service.js";
import { AppError } from "../utils/appError.js";
import { openingInventoryBaselineBatchInput, openingInventoryBaselineFilters } from "../validators/inventoryWorkflow.js";

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
