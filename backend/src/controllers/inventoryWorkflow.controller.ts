import type { RequestHandler } from "express";
import { pool } from "../config/database.js";
import { calculateExpectedInventory } from "../services/inventoryCalculation.service.js";
import { getEffectiveBranchId } from "../services/branchScope.js";
import { writeAudit } from "../services/audit.service.js";
import { AppError } from "../utils/appError.js";
import { idParams } from "../validators/masterData.js";
import {
  inventoryCountInput,
  inventoryMovementInput,
  notificationIdParams,
  posImportInput,
  shrinkageFilters,
  shrinkageInvestigationInput,
  varianceFilters,
} from "../validators/inventoryWorkflow.js";

function requiredBranchId(user: NonNullable<Express.Request["user"]>, requested?: string) {
  const branchId = getEffectiveBranchId(user, requested);
  if (!branchId) throw new AppError(422, "BRANCH_REQUIRED", "A branch is required for this operation");
  return branchId;
}

export const importPosSales: RequestHandler = async (req, res) => {
  const input = posImportInput.parse(req.body);
  const branchId = requiredBranchId(req.user!);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const existingImport = await client.query<{ id: string }>(
      `SELECT id FROM pos_imports WHERE branch_id=$1 AND business_date=$2 AND source_filename=$3 LIMIT 1`,
      [branchId, input.businessDate, input.sourceFilename],
    );
    if (existingImport.rowCount) {
      throw new AppError(
        409,
        "POS_IMPORT_DUPLICATE",
        `The file ${input.sourceFilename} was already imported for ${input.businessDate}`,
      );
    }
    const menuIds = input.items.map((item) => item.menuItemId);
    const recipeCheck = await client.query<{
      id: string; name: string; recipeId: string | null; ingredientCount: number; unitsMatch: boolean | null;
    }>(`SELECT m.id,m.name,r.id "recipeId",count(ri.id)::int "ingredientCount",
              bool_and(lower(ri.unit)=lower(ii.unit)) "unitsMatch"
         FROM menu_items m
         LEFT JOIN recipes r ON r.menu_item_id=m.id AND r.status='ACTIVE'
         LEFT JOIN recipe_items ri ON ri.recipe_id=r.id
         LEFT JOIN inventory_items ii ON ii.id=ri.inventory_item_id
        WHERE m.id=ANY($1::uuid[]) AND m.status='ACTIVE'
        GROUP BY m.id,r.id`, [menuIds]);
    if (recipeCheck.rows.length !== menuIds.length) throw new AppError(422, "MENU_ITEM_INVALID", "One or more menu products are missing or inactive");
    const invalidRecipe = recipeCheck.rows.find((row) => !row.recipeId || row.ingredientCount === 0 || row.unitsMatch !== true);
    if (invalidRecipe) throw new AppError(422, "RECIPE_INVALID", `${invalidRecipe.name} needs an active recipe whose units match its inventory ingredients`);

    const imported = await client.query<{ id: string }>(
      `INSERT INTO pos_imports (branch_id,business_date,source_filename,imported_by) VALUES ($1,$2,$3,$4) RETURNING id`,
      [branchId, input.businessDate, input.sourceFilename, req.user!.id],
    );
    const importId = imported.rows[0]!.id;
    for (const item of input.items) {
      await client.query(`INSERT INTO pos_sale_items (pos_import_id,menu_item_id,quantity_sold) VALUES ($1,$2,$3)`, [importId, item.menuItemId, item.quantitySold]);
    }
    await client.query(
      `INSERT INTO pos_sale_ingredient_usage (pos_sale_item_id,inventory_item_id,quantity_consumed,unit,unit_cost_snapshot)
       SELECT psi.id,ri.inventory_item_id,psi.quantity_sold*ri.quantity/r.yield_quantity,ri.unit,ii.unit_cost
         FROM pos_sale_items psi
         JOIN recipes r ON r.menu_item_id=psi.menu_item_id AND r.status='ACTIVE'
         JOIN recipe_items ri ON ri.recipe_id=r.id
         JOIN inventory_items ii ON ii.id=ri.inventory_item_id
        WHERE psi.pos_import_id=$1`,
      [importId],
    );
    const consumption = await client.query(
      `SELECT ii.id "inventoryItemId",ii.sku,ii.name,usage.unit,
              sum(usage.quantity_consumed)::float8 "expectedConsumption"
         FROM pos_sale_ingredient_usage usage
         JOIN pos_sale_items psi ON psi.id=usage.pos_sale_item_id
         JOIN inventory_items ii ON ii.id=usage.inventory_item_id
        WHERE psi.pos_import_id=$1 GROUP BY ii.id,usage.unit ORDER BY ii.name`,
      [importId],
    );
    await writeAudit(req.user!, "IMPORT_POS_SALES", "POS_IMPORT", importId, `Imported ${input.items.length} POS product lines`, { businessDate: input.businessDate }, client);
    await client.query("COMMIT");
    res.status(201).json({ success: true, data: { importId, branchId, businessDate: input.businessDate, consumption: consumption.rows } });
  } catch (error) {
    await client.query("ROLLBACK");
    if ((error as { code?: string }).code === "23505") {
      throw new AppError(
        409,
        "POS_IMPORT_DUPLICATE",
        `The file ${input.sourceFilename} was already imported for ${input.businessDate}`,
      );
    }
    throw error;
  } finally {
    client.release();
  }
};

export const listPosImports: RequestHandler = async (req, res) => {
  const requestedBranchId = typeof req.query.branchId === "string" ? req.query.branchId : undefined;
  const branchId = getEffectiveBranchId(req.user!, requestedBranchId);
  const result = await pool.query(
    `SELECT pi.id,pi.business_date::text "businessDate",pi.source_filename "sourceFilename",
            pi.imported_at "importedAt",b.id "branchId",b.name "branchName",
            concat(u.first_name,' ',u.last_name) "importedBy",
            count(psi.id)::int "productLines",
            coalesce(sum(psi.quantity_sold),0)::float8 "unitsSold",
            coalesce(sum(psi.quantity_sold*mi.selling_price),0)::float8 "totalSales"
       FROM pos_imports pi
       JOIN branches b ON b.id=pi.branch_id
       JOIN users u ON u.id=pi.imported_by
       LEFT JOIN pos_sale_items psi ON psi.pos_import_id=pi.id
       LEFT JOIN menu_items mi ON mi.id=psi.menu_item_id
      ${branchId ? "WHERE pi.branch_id=$1" : ""}
      GROUP BY pi.id,b.id,u.id
      ORDER BY pi.business_date DESC,pi.imported_at DESC
      LIMIT 100`,
    branchId ? [branchId] : [],
  );
  res.json({ success: true, data: { imports: result.rows } });
};

export const createInventoryMovement: RequestHandler = async (req, res) => {
  const input = inventoryMovementInput.parse(req.body);
  const branchId = requiredBranchId(req.user!, input.branchId);
  if (req.user!.role === "BRANCH_MANAGER" && input.movementType === "APPROVED_ADJUSTMENT") {
    throw new AppError(403, "OWNER_APPROVAL_REQUIRED", "Only the Owner can record an approved adjustment");
  }
  const result = await pool.query(
    `INSERT INTO inventory_movements (branch_id,inventory_item_id,movement_type,quantity,occurred_at,reference_no,notes,approved_by,created_by)
     VALUES ($1,$2,$3,$4,COALESCE($5::timestamptz,now()),$6,$7,$8,$9)
     RETURNING id,branch_id "branchId",inventory_item_id "inventoryItemId",movement_type "movementType",quantity::float8,occurred_at "occurredAt"`,
    [branchId, input.inventoryItemId, input.movementType, input.quantity, input.occurredAt ?? null, input.referenceNo ?? null, input.notes ?? null, input.movementType === "APPROVED_ADJUSTMENT" ? req.user!.id : null, req.user!.id],
  );
  await writeAudit(req.user!, "CREATE_INVENTORY_MOVEMENT", "INVENTORY_MOVEMENT", result.rows[0].id, `Recorded ${input.movementType.toLowerCase()}`, { branchId, quantity: input.quantity });
  res.status(201).json({ success: true, data: { movement: result.rows[0] } });
};

export const getExpectedInventory: RequestHandler = async (req, res) => {
  const branchId = requiredBranchId(req.user!, typeof req.query.branchId === "string" ? req.query.branchId : undefined);
  const countDate = typeof req.query.countDate === "string" ? req.query.countDate : new Date().toISOString().slice(0, 10);
  const itemIds = await pool.query<{ id: string }>(`SELECT id FROM inventory_items WHERE status='ACTIVE' ORDER BY name`);
  const items = [];
  for (const item of itemIds.rows) items.push(await calculateExpectedInventory(pool, branchId, item.id, countDate));
  res.json({ success: true, data: { branchId, countDate, items } });
};

export const submitInventoryCount: RequestHandler = async (req, res) => {
  const input = inventoryCountInput.parse(req.body);
  const branchId = requiredBranchId(req.user!);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const existingCount = await client.query<{ countNo: string }>(
      `SELECT count_no "countNo" FROM inventory_counts WHERE branch_id=$1 AND count_date=$2 LIMIT 1`,
      [branchId, input.countDate],
    );
    if (existingCount.rowCount) {
      throw new AppError(
        409,
        "INVENTORY_COUNT_DUPLICATE",
        `Physical count ${existingCount.rows[0]!.countNo} was already submitted for ${input.countDate}`,
      );
    }
    const countNoResult = await client.query<{ countNo: string }>(`SELECT 'IC-'||to_char($1::date,'YYYY')||'-'||lpad(nextval('inventory_count_number_seq')::text,5,'0') "countNo"`, [input.countDate]);
    const count = await client.query<{ id: string; countNo: string }>(
      `INSERT INTO inventory_counts (count_no,branch_id,count_date,submitted_by) VALUES ($1,$2,$3,$4) RETURNING id,count_no "countNo"`,
      [countNoResult.rows[0]!.countNo, branchId, input.countDate, req.user!.id],
    );
    const countItems = [];
    for (const submitted of input.items) {
      const expected = await calculateExpectedInventory(client, branchId, submitted.inventoryItemId, input.countDate);
      const varianceQuantity = submitted.actualQuantity - expected.expectedQuantity;
      const varianceValue = varianceQuantity * expected.unitCost;
      const inserted = await client.query(
        `INSERT INTO inventory_count_items
          (inventory_count_id,inventory_item_id,previous_actual_quantity,stock_received,expected_consumption,approved_adjustments,expected_quantity,actual_quantity,variance_quantity,variance_value,unit)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         RETURNING id,inventory_item_id "inventoryItemId",expected_quantity::float8 "expectedQuantity",actual_quantity::float8 "actualQuantity",variance_quantity::float8 "varianceQuantity",variance_value::float8 "varianceValue",unit`,
        [count.rows[0]!.id, submitted.inventoryItemId, expected.previousActualQuantity, expected.stockReceived, expected.expectedConsumption, expected.approvedAdjustments, expected.expectedQuantity, submitted.actualQuantity, varianceQuantity, varianceValue, expected.unit],
      );
      await client.query(
        `INSERT INTO branch_inventory_balances (branch_id,inventory_item_id,actual_quantity,as_of)
         VALUES ($1,$2,$3,$4::date + time '23:59:59')
         ON CONFLICT (branch_id,inventory_item_id) DO UPDATE SET actual_quantity=excluded.actual_quantity,as_of=excluded.as_of,updated_at=now()`,
        [branchId, submitted.inventoryItemId, submitted.actualQuantity, input.countDate],
      );
      const countItem = inserted.rows[0] as { id: string };
      let shrinkageReportId: string | null = null;
      if (varianceQuantity < -0.0001) {
        const reportNo = await client.query<{ reportNo: string }>(`SELECT 'SR-'||to_char(now(),'YYYY')||'-'||lpad(nextval('shrinkage_report_number_seq')::text,5,'0') "reportNo"`);
        const anomaly = await client.query<{ id: string }>(
          `INSERT INTO shrinkage_reports
            (report_no,branch_id,inventory_item_id,inventory_count_item_id,expected_quantity,actual_quantity,variance_quantity,variance_value,unit,status,submitted_by,detected_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'DETECTED',$10,now())
           RETURNING id`,
          [reportNo.rows[0]!.reportNo, branchId, submitted.inventoryItemId, countItem.id, expected.expectedQuantity, submitted.actualQuantity, varianceQuantity, varianceValue, expected.unit, req.user!.id],
        );
        shrinkageReportId = anomaly.rows[0]!.id;
        await client.query(
          `INSERT INTO notifications (recipient_user_id,branch_id,type,title,message,entity_type,entity_id)
           VALUES ($1,$2,'INVENTORY_ANOMALY','Inventory Anomaly Detected',$3,'SHRINKAGE_REPORT',$4)`,
          [req.user!.id, branchId, `${expected.itemName} is ${Math.abs(varianceQuantity).toFixed(2)}${expected.unit} below expected stock. Investigation is required.`, shrinkageReportId],
        );
      }
      countItems.push({
        ...inserted.rows[0], sku: expected.sku, itemName: expected.itemName,
        expectedConsumption: expected.expectedConsumption,
        requiresInvestigation: Boolean(shrinkageReportId), shrinkageReportId,
      });
    }
    await writeAudit(req.user!, "SUBMIT_INVENTORY_COUNT", "INVENTORY_COUNT", count.rows[0]!.id, `Submitted physical inventory count ${count.rows[0]!.countNo}`, { branchId, itemCount: countItems.length }, client);
    await client.query("COMMIT");
    res.status(201).json({ success: true, data: { count: { ...count.rows[0], branchId, countDate: input.countDate, items: countItems } } });
  } catch (error) {
    await client.query("ROLLBACK");
    if ((error as { code?: string }).code === "23505") {
      throw new AppError(
        409,
        "INVENTORY_COUNT_DUPLICATE",
        `A physical count was already submitted for ${input.countDate}`,
      );
    }
    throw error;
  } finally {
    client.release();
  }
};

export const listInventoryCounts: RequestHandler = async (req, res) => {
  const branchId = getEffectiveBranchId(req.user!, typeof req.query.branchId === "string" ? req.query.branchId : undefined);
  const result = await pool.query(
    `SELECT ic.id,ic.count_no "countNo",ic.count_date "countDate",ic.submitted_at "submittedAt",b.id "branchId",b.name "branchName",
              concat(u.first_name,' ',u.last_name) "submittedBy",count(ici.id)::int "itemCount",
              (count(ici.id) FILTER (WHERE abs(ici.variance_quantity)>0.0001))::int "varianceCount"
       FROM inventory_counts ic JOIN branches b ON b.id=ic.branch_id JOIN users u ON u.id=ic.submitted_by
       LEFT JOIN inventory_count_items ici ON ici.inventory_count_id=ic.id
      ${branchId ? "WHERE ic.branch_id=$1" : ""}
      GROUP BY ic.id,b.id,u.id ORDER BY ic.count_date DESC,ic.submitted_at DESC`,
    branchId ? [branchId] : [],
  );
  res.json({ success: true, data: { counts: result.rows } });
};

export const listInventoryVariances: RequestHandler = async (req, res) => {
  const filters = varianceFilters.parse(req.query);
  const branchId = getEffectiveBranchId(req.user!, filters.branchId);
  const clauses: string[] = [];
  const values: unknown[] = [];
  if (branchId) { values.push(branchId); clauses.push(`ic.branch_id=$${values.length}`); }
  if (filters.countDate) { values.push(filters.countDate); clauses.push(`ic.count_date=$${values.length}::date`); }
  const result = await pool.query(
    `SELECT ici.id "countItemId",ic.count_no "countNo",ic.count_date::text "countDate",
            b.id "branchId",b.name "branchName",ii.id "inventoryItemId",ii.sku,ii.name "itemName",
            ici.expected_quantity::float8 "expectedQuantity",ici.actual_quantity::float8 "actualQuantity",
            ici.variance_quantity::float8 "varianceQuantity",ici.variance_value::float8 "varianceValue",ici.unit,
            sr.id "anomalyId",sr.report_no "reportNo",sr.status "anomalyStatus",sr.classification
       FROM inventory_count_items ici
       JOIN inventory_counts ic ON ic.id=ici.inventory_count_id
       JOIN branches b ON b.id=ic.branch_id
       JOIN inventory_items ii ON ii.id=ici.inventory_item_id
       LEFT JOIN shrinkage_reports sr ON sr.inventory_count_item_id=ici.id
      ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""}
      ORDER BY ic.count_date DESC,abs(ici.variance_value) DESC,ii.name`,
    values,
  );
  res.json({ success: true, data: { variances: result.rows } });
};

const shrinkageSelection = `SELECT sr.id,sr.report_no "reportNo",sr.status,sr.classification,sr.explanation,sr.supporting_notes "supportingNotes",
  sr.expected_quantity::float8 "expectedQuantity",sr.actual_quantity::float8 "actualQuantity",sr.variance_quantity::float8 "varianceQuantity",sr.variance_value::float8 "varianceValue",sr.unit,
  sr.detected_at "detectedAt",sr.investigated_at "investigatedAt",sr.submitted_at "submittedAt",sr.reviewed_at "reviewedAt",b.id "branchId",b.name "branchName",ii.id "inventoryItemId",ii.sku,ii.name "inventoryItemName",
  mi.id "menuItemId",mi.name "menuItemName",concat(su.first_name,' ',su.last_name) "managerName",concat(ru.first_name,' ',ru.last_name) "reviewedByName"
  FROM shrinkage_reports sr JOIN branches b ON b.id=sr.branch_id JOIN inventory_items ii ON ii.id=sr.inventory_item_id
  JOIN users su ON su.id=sr.submitted_by LEFT JOIN users ru ON ru.id=sr.reviewed_by LEFT JOIN menu_items mi ON mi.id=sr.menu_item_id`;

export const listShrinkageReports: RequestHandler = async (req, res) => {
  const filters = shrinkageFilters.parse(req.query);
  const branchId = getEffectiveBranchId(req.user!, filters.branchId);
  const clauses: string[] = [];
  const values: unknown[] = [];
  if (branchId) { values.push(branchId); clauses.push(`sr.branch_id=$${values.length}`); }
  if (filters.status) { values.push(filters.status); clauses.push(`sr.status=$${values.length}`); }
  if (filters.classification) { values.push(filters.classification); clauses.push(`sr.classification=$${values.length}`); }
  const result = await pool.query(`${shrinkageSelection} ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""} ORDER BY CASE sr.status WHEN 'DETECTED' THEN 0 WHEN 'PENDING_REVIEW' THEN 1 ELSE 2 END,sr.detected_at DESC`, values);
  res.json({ success: true, data: { reports: result.rows } });
};

export const getShrinkageReport: RequestHandler = async (req, res) => {
  const { id } = idParams.parse(req.params);
  const branchId = getEffectiveBranchId(req.user!);
  const result = await pool.query(`${shrinkageSelection} WHERE sr.id=$1 ${branchId ? "AND sr.branch_id=$2" : ""}`, branchId ? [id, branchId] : [id]);
  if (!result.rows[0]) throw new AppError(404, "SHRINKAGE_REPORT_NOT_FOUND", "Shrinkage report not found");
  res.json({ success: true, data: { report: result.rows[0] } });
};

export const submitShrinkageInvestigation: RequestHandler = async (req, res) => {
  const { id } = idParams.parse(req.params);
  const input = shrinkageInvestigationInput.parse(req.body);
  const branchId = requiredBranchId(req.user!);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const investigated = await client.query<{ reportNo: string; inventoryItemId: string; varianceQuantity: number; unit: string }>(
      `UPDATE shrinkage_reports
          SET menu_item_id=$3,classification=$4,explanation=$5,supporting_notes=$6,
              status='PENDING_REVIEW',investigated_at=now(),submitted_at=now(),updated_at=now()
        WHERE id=$1 AND branch_id=$2 AND status='DETECTED'
        RETURNING report_no "reportNo",inventory_item_id "inventoryItemId",variance_quantity::float8 "varianceQuantity",unit`,
      [id, branchId, input.menuItemId ?? null, input.classification, input.explanation, input.supportingNotes ?? null],
    );
    const row = investigated.rows[0];
    if (!row) {
      const existing = await client.query(`SELECT 1 FROM shrinkage_reports WHERE id=$1 AND branch_id=$2`, [id, branchId]);
      if (!existing.rows[0]) throw new AppError(404, "SHRINKAGE_REPORT_NOT_FOUND", "Detected anomaly not found for your branch");
      throw new AppError(409, "INVESTIGATION_ALREADY_SUBMITTED", "This anomaly has already been submitted for Owner review");
    }
    const context = await client.query<{ itemName: string; branchName: string }>(
      `SELECT ii.name "itemName",b.name "branchName" FROM inventory_items ii CROSS JOIN branches b WHERE ii.id=$1 AND b.id=$2`,
      [row.inventoryItemId, branchId],
    );
    await client.query(
      `INSERT INTO notifications (recipient_user_id,branch_id,type,title,message,entity_type,entity_id)
       SELECT id,$1,'SHRINKAGE_SUBMITTED','New Shrinkage Report',$2,'SHRINKAGE_REPORT',$3 FROM users WHERE role='OWNER' AND status='ACTIVE'`,
      [branchId, `${context.rows[0]!.branchName} submitted investigation findings for ${context.rows[0]!.itemName}. System variance: ${row.varianceQuantity}${row.unit}. Classification: ${input.classification.replace("_", " ")}.`, id],
    );
    await writeAudit(req.user!, "SUBMIT_SHRINKAGE_INVESTIGATION", "SHRINKAGE_REPORT", id, `Submitted investigation findings for ${row.reportNo}`, { branchId, classification: input.classification }, client);
    await client.query("COMMIT");
    const result = await pool.query(`${shrinkageSelection} WHERE sr.id=$1`, [id]);
    res.json({ success: true, data: { report: result.rows[0] } });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export const reviewShrinkageReport: RequestHandler = async (req, res) => {
  const { id } = idParams.parse(req.params);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const reviewed = await client.query<{ reportNo: string; submittedBy: string; branchId: string }>(
      `UPDATE shrinkage_reports SET status='REVIEWED',reviewed_by=$2,reviewed_at=now(),updated_at=now()
        WHERE id=$1 AND status='PENDING_REVIEW'
        RETURNING report_no "reportNo",submitted_by "submittedBy",branch_id "branchId"`, [id, req.user!.id],
    );
    const row = reviewed.rows[0];
    if (!row) {
      const exists = await client.query(`SELECT 1 FROM shrinkage_reports WHERE id=$1`, [id]);
      if (!exists.rows[0]) throw new AppError(404, "SHRINKAGE_REPORT_NOT_FOUND", "Shrinkage report not found");
      throw new AppError(409, "ALREADY_REVIEWED", "This shrinkage report has already been reviewed");
    }
    await client.query(
      `INSERT INTO notifications (recipient_user_id,branch_id,type,title,message,entity_type,entity_id)
       VALUES ($1,$2,'SHRINKAGE_REVIEWED','Shrinkage Report Reviewed',$3,'SHRINKAGE_REPORT',$4)`,
      [row.submittedBy, row.branchId, `Your shrinkage report ${row.reportNo} has been reviewed by the Owner.`, id],
    );
    await writeAudit(req.user!, "REVIEW_SHRINKAGE_REPORT", "SHRINKAGE_REPORT", id, `Marked shrinkage report ${row.reportNo} as reviewed`, {}, client);
    await client.query("COMMIT");
    const result = await pool.query(`${shrinkageSelection} WHERE sr.id=$1`, [id]);
    res.json({ success: true, data: { report: result.rows[0] } });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export const listNotifications: RequestHandler = async (req, res) => {
  const result = await pool.query(
    `SELECT id,type,title,message,entity_type "entityType",entity_id "entityId",read_at "readAt",created_at "createdAt"
       FROM notifications WHERE recipient_user_id=$1 ORDER BY created_at DESC LIMIT 100`, [req.user!.id],
  );
  res.json({ success: true, data: { notifications: result.rows } });
};

export const markNotificationRead: RequestHandler = async (req, res) => {
  const { id } = notificationIdParams.parse(req.params);
  const result = await pool.query(
    `UPDATE notifications SET read_at=COALESCE(read_at,now()) WHERE id=$1 AND recipient_user_id=$2 RETURNING id,read_at "readAt"`,
    [id, req.user!.id],
  );
  if (!result.rows[0]) throw new AppError(404, "NOTIFICATION_NOT_FOUND", "Notification not found");
  res.json({ success: true, data: { notification: result.rows[0] } });
};
