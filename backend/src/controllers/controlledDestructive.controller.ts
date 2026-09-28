import type { RequestHandler } from "express";
import { pool } from "../config/database.js";
import { writeDestructiveActionAudit, verifyDestructiveAction } from "../services/destructiveAction.service.js";
import { AppError } from "../utils/appError.js";
import { idParams } from "../validators/masterData.js";
import { destructiveActionInput, incidentLifecycleInput, purchaseOrderLifecycleInput } from "../validators/destructiveAction.js";

type AppRole = "OWNER" | "BRANCH_MANAGER" | "STAFF";
function requireRole(user: NonNullable<Express.Request["user"]>, roles: AppRole[]) {
  if (!roles.includes(user.role)) throw new AppError(403, "FORBIDDEN", "You do not have permission to perform this action");
}
function assertBranchAccess(user: NonNullable<Express.Request["user"]>, branchId: string) {
  if (user.role !== "OWNER" && user.branchId !== branchId) throw new AppError(403, "BRANCH_SCOPE_FORBIDDEN", "This record does not belong to your assigned branch");
}

export const removeInventoryItem: RequestHandler = async (req, res) => {
  requireRole(req.user!, ["OWNER", "BRANCH_MANAGER"]);
  const { id } = idParams.parse(req.params); const input = destructiveActionInput.parse(req.body);
  await verifyDestructiveAction(req.user!, input.verificationPin, { module: "INVENTORY_ITEM", action: "REMOVE", recordId: id, reason: input.reason });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const found = await client.query<{ name: string; itemScope: "GLOBAL" | "BRANCH"; originBranchId: string | null }>(`SELECT name,item_scope "itemScope",origin_branch_id "originBranchId" FROM inventory_items WHERE id=$1 FOR UPDATE`, [id]);
    const item = found.rows[0];
    if (!item) throw new AppError(404, "INVENTORY_ITEM_NOT_FOUND", "Inventory item not found");
    if (req.user!.role === "BRANCH_MANAGER" && (item.itemScope !== "BRANCH" || item.originBranchId !== req.user!.branchId)) throw new AppError(403, "INVENTORY_ITEM_SCOPE_FORBIDDEN", "Managers may remove only ingredients created for their assigned branch");
    const dependencies = await client.query<{ used: boolean }>(`SELECT EXISTS(
      SELECT 1 FROM recipe_items WHERE inventory_item_id=$1 UNION ALL
      SELECT 1 FROM branch_inventory_balances WHERE inventory_item_id=$1 UNION ALL
      SELECT 1 FROM inventory_movements WHERE inventory_item_id=$1 UNION ALL
      SELECT 1 FROM inventory_count_items WHERE inventory_item_id=$1 UNION ALL
      SELECT 1 FROM purchase_order_items WHERE inventory_item_id=$1 UNION ALL
      SELECT 1 FROM pos_sale_ingredient_usage WHERE inventory_item_id=$1) used`, [id]);
    const action = dependencies.rows[0]?.used ? "DEACTIVATED" : "DELETED";
    if (action === "DEACTIVATED") await client.query(`UPDATE inventory_items SET status='INACTIVE',updated_at=now() WHERE id=$1`, [id]);
    else { await client.query(`DELETE FROM branch_inventory_settings WHERE inventory_item_id=$1`, [id]); await client.query(`DELETE FROM inventory_items WHERE id=$1`, [id]); }
    await writeDestructiveActionAudit(req.user!, { module: "INVENTORY_ITEM", action, recordId: id, reason: input.reason }, `${action === "DELETED" ? "Deleted unused" : "Deactivated used"} inventory item ${item.name}`, { dependencyFound: action === "DEACTIVATED", branchId: item.originBranchId }, client);
    await client.query("COMMIT"); res.json({ success: true, data: { id, action } });
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
};

export const voidVarianceRecord: RequestHandler = async (req, res) => {
  requireRole(req.user!, ["OWNER", "BRANCH_MANAGER"]);
  const { id } = idParams.parse(req.params); const input = destructiveActionInput.parse(req.body);
  await verifyDestructiveAction(req.user!, input.verificationPin, { module: "INVENTORY_VARIANCE", action: "VOID", recordId: id, reason: input.reason });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const found = await client.query<{ branchId: string; countNo: string }>(`SELECT ic.branch_id "branchId",ic.count_no "countNo" FROM inventory_count_items ici JOIN inventory_counts ic ON ic.id=ici.inventory_count_id WHERE ici.id=$1 AND ici.voided_at IS NULL FOR UPDATE OF ici`, [id]);
    const variance = found.rows[0]; if (!variance) throw new AppError(404, "VARIANCE_NOT_FOUND", "Active variance record not found"); assertBranchAccess(req.user!, variance.branchId);
    await client.query(`UPDATE inventory_count_items SET voided_at=now(),voided_by=$2,void_reason=$3 WHERE id=$1`, [id, req.user!.id, input.reason]);
    await client.query(`UPDATE shrinkage_reports SET archived_at=now(),archived_by=$2,archive_reason=$3,updated_at=now() WHERE inventory_count_item_id=$1 AND archived_at IS NULL`, [id, req.user!.id, `Variance voided: ${input.reason}`]);
    await writeDestructiveActionAudit(req.user!, { module: "INVENTORY_VARIANCE", action: "VOID", recordId: id, reason: input.reason }, `Voided variance from ${variance.countNo}`, { branchId: variance.branchId }, client);
    await client.query("COMMIT"); res.json({ success: true, data: { id, action: "VOIDED" } });
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
};

export const archiveShrinkageReport: RequestHandler = async (req, res) => {
  requireRole(req.user!, ["OWNER", "BRANCH_MANAGER"]);
  const { id } = idParams.parse(req.params); const input = destructiveActionInput.parse(req.body);
  await verifyDestructiveAction(req.user!, input.verificationPin, { module: "SHRINKAGE_REPORT", action: "ARCHIVE", recordId: id, reason: input.reason });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const found = await client.query<{ branchId: string; reportNo: string }>(`SELECT branch_id "branchId",report_no "reportNo" FROM shrinkage_reports WHERE id=$1 AND archived_at IS NULL FOR UPDATE`, [id]);
    const report = found.rows[0]; if (!report) throw new AppError(404, "SHRINKAGE_REPORT_NOT_FOUND", "Active anomaly case not found"); assertBranchAccess(req.user!, report.branchId);
    await client.query(`UPDATE shrinkage_reports SET archived_at=now(),archived_by=$2,archive_reason=$3,updated_at=now() WHERE id=$1`, [id, req.user!.id, input.reason]);
    await writeDestructiveActionAudit(req.user!, { module: "SHRINKAGE_REPORT", action: "ARCHIVE", recordId: id, reason: input.reason }, `Archived anomaly ${report.reportNo}`, { branchId: report.branchId }, client);
    await client.query("COMMIT"); res.json({ success: true, data: { id, action: "ARCHIVED" } });
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
};

export const archiveIncidentReport: RequestHandler = async (req, res) => {
  requireRole(req.user!, ["OWNER", "BRANCH_MANAGER", "STAFF"]);
  const { id } = idParams.parse(req.params); const input = incidentLifecycleInput.parse(req.body);
  await verifyDestructiveAction(req.user!, input.verificationPin, { module: "INCIDENT_REPORT", action: input.action, recordId: id, reason: input.reason });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const found = await client.query<{ branchId: string; submittedBy: string; status: string }>(`SELECT branch_id "branchId",submitted_by "submittedBy",status FROM incident_reports WHERE id=$1 AND archived_at IS NULL FOR UPDATE`, [id]);
    const incident = found.rows[0]; if (!incident) throw new AppError(404, "INCIDENT_NOT_FOUND", "Active incident report not found"); assertBranchAccess(req.user!, incident.branchId);
    if (req.user!.role === "STAFF" && (input.action !== "CANCEL" || incident.submittedBy !== req.user!.id || incident.status !== "PENDING")) throw new AppError(403, "INCIDENT_LIFECYCLE_FORBIDDEN", "Staff may cancel only their own pending incident reports");
    await client.query(`UPDATE incident_reports SET archived_at=now(),archived_by=$2,archive_reason=$3,archive_action=$4,updated_at=now() WHERE id=$1`, [id, req.user!.id, input.reason, input.action === "CANCEL" ? "CANCELLED" : "ARCHIVED"]);
    await writeDestructiveActionAudit(req.user!, { module: "INCIDENT_REPORT", action: input.action, recordId: id, reason: input.reason }, `${input.action === "CANCEL" ? "Cancelled" : "Archived"} incident report`, { branchId: incident.branchId, priorStatus: incident.status }, client);
    await client.query("COMMIT"); res.json({ success: true, data: { id, action: input.action === "CANCEL" ? "CANCELLED" : "ARCHIVED" } });
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
};

export const applyPurchaseOrderLifecycle: RequestHandler = async (req, res) => {
  requireRole(req.user!, ["OWNER", "BRANCH_MANAGER"]);
  const { id } = idParams.parse(req.params); const input = purchaseOrderLifecycleInput.parse(req.body);
  await verifyDestructiveAction(req.user!, input.verificationPin, { module: "PURCHASE_ORDER", action: input.action, recordId: id, reason: input.reason });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const found = await client.query<{ poNo: string; branchId: string; status: string; isTestData: boolean; reversedAt: string | null }>(`SELECT po_no "poNo",branch_id "branchId",status,is_test_data "isTestData",reversed_at::text "reversedAt" FROM purchase_orders WHERE id=$1 FOR UPDATE`, [id]);
    const order = found.rows[0]; if (!order) throw new AppError(404, "PURCHASE_ORDER_NOT_FOUND", "Purchase order not found"); assertBranchAccess(req.user!, order.branchId);
    if (input.action === "DELETE") {
      if (order.status !== "DRAFT") throw new AppError(409, "PO_DELETE_REQUIRES_DRAFT", "Only a draft purchase order can be deleted");
      const received = await client.query(`SELECT 1 FROM purchase_order_items WHERE purchase_order_id=$1 AND quantity_received>0 LIMIT 1`, [id]);
      if (received.rows[0]) throw new AppError(409, "PO_DELETE_HAS_RECEIPTS", "A purchase order with received quantity cannot be deleted");
      await client.query(`DELETE FROM purchase_orders WHERE id=$1`, [id]);
    } else if (input.action === "CANCEL") {
      if (!["DRAFT", "ORDERED"].includes(order.status)) throw new AppError(409, "PO_CANCEL_STATE_INVALID", "Only a draft or ordered purchase order can be cancelled");
      await client.query(`UPDATE purchase_orders SET status='CANCELLED',updated_at=now() WHERE id=$1`, [id]);
    } else {
      if (!["PARTIALLY_RECEIVED", "RECEIVED"].includes(order.status)) throw new AppError(409, "PO_REVERSAL_STATE_INVALID", "Only a partially or fully received purchase order can be reversed");
      if (order.reversedAt) throw new AppError(409, "PO_ALREADY_REVERSED", "This purchase order receipt has already been reversed");
      const countDependency = await client.query(`SELECT 1 FROM inventory_counts WHERE branch_id=$1 AND count_date>=COALESCE((SELECT min(occurred_at::date) FROM inventory_movements WHERE branch_id=$1 AND reference_no=$2 AND movement_type='RECEIPT'),CURRENT_DATE) AND NOT is_test_data LIMIT 1`, [order.branchId, order.poNo]);
      if (countDependency.rows[0]) throw new AppError(409, "PO_REVERSAL_COUNT_DEPENDENCY", "A later physical count depends on this receipt, so it cannot be reversed");
      const items = await client.query<{ inventoryItemId: string; stockQuantity: number }>(`SELECT inventory_item_id "inventoryItemId",(quantity_received*conversion_factor)::float8 "stockQuantity" FROM purchase_order_items WHERE purchase_order_id=$1 AND quantity_received>0 FOR UPDATE`, [id]);
      if (!items.rows.length) throw new AppError(409, "PO_REVERSAL_EMPTY", "This purchase order has no received quantity to reverse");
      for (const item of items.rows) await client.query(`INSERT INTO inventory_movements (branch_id,inventory_item_id,movement_type,quantity,occurred_at,reference_no,notes,approved_by,created_by,is_test_data) VALUES ($1,$2,'APPROVED_ADJUSTMENT_DECREASE',$3,now(),$4,$5,$6,$6,$7)`, [order.branchId, item.inventoryItemId, item.stockQuantity, `REVERSAL-${order.poNo}`, `Controlled reversal: ${input.reason}`, req.user!.id, order.isTestData]);
      await client.query(`UPDATE purchase_orders SET status='CANCELLED',reversed_at=now(),reversed_by=$2,reversal_reason=$3,updated_at=now() WHERE id=$1`, [id, req.user!.id, input.reason]);
    }
    await writeDestructiveActionAudit(req.user!, { module: "PURCHASE_ORDER", action: input.action, recordId: id, reason: input.reason }, `${input.action.toLowerCase()} action applied to ${order.poNo}`, { branchId: order.branchId, priorStatus: order.status }, client);
    await client.query("COMMIT"); res.json({ success: true, data: { id, action: input.action === "DELETE" ? "DELETED" : input.action === "CANCEL" ? "CANCELLED" : "REVERSED" } });
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
};

export const deletePosSourceConfiguration: RequestHandler = async (req, res) => {
  requireRole(req.user!, ["OWNER"]);
  const { id } = idParams.parse(req.params);
  const input = destructiveActionInput.parse(req.body);
  await verifyDestructiveAction(req.user!, input.verificationPin, {
    module: "POS_SOURCE",
    action: "DELETE",
    recordId: id,
    reason: input.reason,
  });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const found = await client.query<{
      sourceCode: string;
      displayName: string;
      supportedFormat: string;
      branchId: string | null;
      status: "ACTIVE" | "INACTIVE";
    }>(
      `SELECT source_code "sourceCode", display_name "displayName", supported_format "supportedFormat",
              branch_id "branchId", status
       FROM pos_sources WHERE id=$1 FOR UPDATE`,
      [id],
    );
    const source = found.rows[0];
    if (!source) throw new AppError(404, "POS_SOURCE_NOT_FOUND", "POS system configuration not found");

    if (source.status === "ACTIVE") {
      throw new AppError(409, "POS_SOURCE_ACTIVE_CANNOT_DELETE", "Only an inactive POS system can be deleted. Deactivate it first before deletion.");
    }

    const importDep = await client.query(`SELECT 1 FROM pos_imports WHERE pos_source_id=$1 LIMIT 1`, [id]);
    if (importDep.rows[0]) {
      throw new AppError(409, "POS_SOURCE_HAS_IMPORTS", "This POS system has historical imports and cannot be deleted. Deactivate it instead.");
    }

    const saleDep = await client.query(`SELECT 1 FROM pos_sale_items WHERE pos_source_id=$1 LIMIT 1`, [id]);
    if (saleDep.rows[0]) {
      throw new AppError(409, "POS_SOURCE_HAS_SALES", "This POS system has recorded sales and cannot be deleted. Deactivate it instead.");
    }

    const usageDep = await client.query(
      `SELECT 1 FROM pos_sale_ingredient_usage u JOIN pos_sale_items psi ON psi.id=u.pos_sale_item_id WHERE psi.pos_source_id=$1 LIMIT 1`,
      [id],
    );
    if (usageDep.rows[0]) {
      throw new AppError(409, "POS_SOURCE_HAS_USAGE", "This POS system has ingredient usage dependencies and cannot be deleted. Deactivate it instead.");
    }

    const approvalDep = await client.query(`SELECT 1 FROM pos_import_approvals WHERE pos_source_id=$1 LIMIT 1`, [id]);
    if (approvalDep.rows[0]) {
      throw new AppError(409, "POS_SOURCE_HAS_APPROVALS", "This POS system has import approval records and cannot be deleted. Deactivate it instead.");
    }

    const activeMappingDep = await client.query(
      `SELECT 1 FROM pos_product_variant_mappings WHERE pos_source_id=$1 AND status='ACTIVE' LIMIT 1`,
      [id],
    );
    if (activeMappingDep.rows[0]) {
      throw new AppError(409, "POS_SOURCE_HAS_ACTIVE_MAPPINGS", "This POS system has active product mappings and cannot be deleted. Deactivate or reassign mappings first.");
    }

    // Clean up draft/inactive mappings for this unused source
    await client.query(`DELETE FROM pos_product_variant_mappings WHERE pos_source_id=$1`, [id]);

    // Delete the unused POS source
    await client.query(`DELETE FROM pos_sources WHERE id=$1`, [id]);

    await writeDestructiveActionAudit(
      req.user!,
      { module: "POS_SOURCE", action: "DELETE", recordId: id, reason: input.reason },
      `Deleted unused POS system configuration ${source.sourceCode}`,
      {
        sourceCode: source.sourceCode,
        displayName: source.displayName,
        supportedFormat: source.supportedFormat,
        branchId: source.branchId,
      },
      client,
    );

    await client.query("COMMIT");
    res.json({ success: true, data: { id, action: "DELETED" } });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

