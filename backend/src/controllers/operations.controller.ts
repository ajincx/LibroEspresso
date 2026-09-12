import type { RequestHandler } from "express";
import type { PoolClient } from "pg";
import { pool } from "../config/database.js";
import { getEffectiveBranchId } from "../services/branchScope.js";
import { writeAudit } from "../services/audit.service.js";
import { AppError } from "../utils/appError.js";
import { idParams } from "../validators/masterData.js";
import { paginatedRows, paginationQuery } from "../validators/pagination.js";
import {
  incidentCreateInput,
  incidentFilters,
  incidentReviewInput,
  incidentLinkInput,
  branchInventorySettingsInput,
  inventoryOverviewFilters,
  inventorySettingsParams,
  purchaseOrderCreateInput,
  purchaseOrderFilters,
  purchaseOrderReceiveInput,
  purchaseOrderStatusInput,
} from "../validators/operations.js";

function requiredBranchId(
  user: NonNullable<Express.Request["user"]>,
  requested?: string,
) {
  const branchId = getEffectiveBranchId(user, requested);
  if (!branchId)
    throw new AppError(
      422,
      "BRANCH_REQUIRED",
      "A branch is required for this operation",
    );
  return branchId;
}

export const getInventoryOverview: RequestHandler = async (req, res) => {
  const filters = inventoryOverviewFilters.parse(req.query);
  const branchId = getEffectiveBranchId(req.user!, filters.branchId);
  const values: unknown[] = [];
  const branchWhere = branchId ? `AND b.id=$${values.push(branchId)}` : "";
  const result = await pool.query(
    `SELECT b.id "branchId",b.name "branchName",ii.id "inventoryItemId",ii.sku,ii.name,ii.category,ii.unit,
            COALESCE(bis.current_unit_cost,ii.unit_cost)::float8 "unitCost",
            COALESCE(bis.reorder_level,ii.reorder_level)::float8 "reorderLevel",
            COALESCE(bis.reorder_days,7)::int "reorderDays",
            COALESCE(bal.actual_quantity,0)::float8 "lastActualQuantity",bal.as_of "lastCountAt",
            (COALESCE(bal.actual_quantity,0)
              + COALESCE((SELECT sum(im.quantity) FROM inventory_movements im
                          WHERE im.branch_id=b.id AND im.inventory_item_id=ii.id AND im.movement_type='RECEIPT'
                            AND im.occurred_at>COALESCE(bal.as_of,'1970-01-01'::timestamptz)),0)
              + COALESCE((SELECT sum(im.quantity) FROM inventory_movements im
                          WHERE im.branch_id=b.id AND im.inventory_item_id=ii.id AND im.movement_type='APPROVED_ADJUSTMENT_INCREASE'
                            AND im.occurred_at>COALESCE(bal.as_of,'1970-01-01'::timestamptz)),0)
              - COALESCE((SELECT sum(u.quantity_consumed) FROM pos_sale_ingredient_usage u
                          JOIN pos_sale_items psi ON psi.id=u.pos_sale_item_id JOIN pos_imports pi ON pi.id=psi.pos_import_id
                          WHERE pi.branch_id=b.id AND u.inventory_item_id=ii.id
                            AND pi.business_date>COALESCE(bal.as_of::date,'1970-01-01'::date)),0)
              - COALESCE((SELECT sum(im.quantity) FROM inventory_movements im
                          WHERE im.branch_id=b.id AND im.inventory_item_id=ii.id
                            AND im.movement_type IN ('APPROVED_ADJUSTMENT','APPROVED_ADJUSTMENT_DECREASE')
                            AND im.occurred_at>COALESCE(bal.as_of,'1970-01-01'::timestamptz)),0))::float8 "systemStock"
       FROM branches b CROSS JOIN inventory_items ii
       LEFT JOIN branch_inventory_balances bal ON bal.branch_id=b.id AND bal.inventory_item_id=ii.id
       LEFT JOIN branch_inventory_settings bis ON bis.branch_id=b.id AND bis.inventory_item_id=ii.id
      WHERE b.status='ACTIVE' AND ii.status='ACTIVE'
        AND (ii.item_scope='GLOBAL' OR ii.origin_branch_id=b.id) ${branchWhere}
      ORDER BY b.name,ii.name`,
    values,
  );
  const items = result.rows.map((row) => {
    const stock = Number(row.systemStock);
    const reorder = Number(row.reorderLevel);
    const status =
      stock <= 0
        ? "OUT_OF_STOCK"
        : reorder > 0 && stock <= reorder / 2
          ? "CRITICAL"
          : reorder > 0 && stock <= reorder
            ? "LOW_STOCK"
            : "HEALTHY";
    return {
      ...row,
      systemStock: stock,
      inventoryValue: Math.max(stock, 0) * Number(row.unitCost),
      status,
    };
  });
  res.json({ success: true, data: { items } });
};

export const updateBranchInventorySettings: RequestHandler = async (
  req,
  res,
) => {
  const { inventoryItemId } = inventorySettingsParams.parse(req.params);
  const input = branchInventorySettingsInput.parse(req.body);
  const branchId = requiredBranchId(req.user!);
  const result = await pool.query(
    `INSERT INTO branch_inventory_settings (branch_id,inventory_item_id,current_unit_cost,reorder_level,reorder_days,updated_by)
     SELECT $1,ii.id,$3,$4,$5,$2 FROM inventory_items ii WHERE ii.id=$6 AND ii.status='ACTIVE'
       AND (ii.item_scope='GLOBAL' OR ii.origin_branch_id=$1)
     ON CONFLICT (branch_id,inventory_item_id) DO UPDATE
       SET current_unit_cost=excluded.current_unit_cost,reorder_level=excluded.reorder_level,
           reorder_days=excluded.reorder_days,updated_by=excluded.updated_by,updated_at=now()
     RETURNING inventory_item_id "inventoryItemId",current_unit_cost::float8 "currentUnitCost",
               reorder_level::float8 "reorderLevel",reorder_days "reorderDays"`,
    [
      branchId,
      req.user!.id,
      input.currentUnitCost,
      input.reorderLevel,
      input.reorderDays,
      inventoryItemId,
    ],
  );
  if (!result.rows[0])
    throw new AppError(
      404,
      "INVENTORY_ITEM_NOT_FOUND",
      "Inventory item not found",
    );
  await writeAudit(
    req.user!,
    "UPDATE_BRANCH_INVENTORY_SETTINGS",
    "INVENTORY_ITEM",
    inventoryItemId,
    "Updated branch inventory cost and reorder settings",
    { branchId, reorderDays: input.reorderDays },
  );
  res.json({ success: true, data: { settings: result.rows[0] } });
};

const incidentSelection = `SELECT ir.id,ir.branch_id "branchId",b.name "branchName",ir.inventory_item_id "inventoryItemId",
  ii.sku,ii.name "inventoryItemName",ii.unit,ir.shrinkage_report_id "shrinkageReportId",sr.report_no "shrinkageReportNo",
  ir.menu_item_id "productId",mi.code "productCode",mi.name "productName",
  ir.incident_type "incidentType",ir.quantity::float8,ir.occurred_at "occurredAt",ir.reason,ir.notes,ir.photo_url "photoUrl",
  ir.status,ir.manager_comment "managerComment",ir.submitted_by "submittedByUserId",concat(su.first_name,' ',su.last_name) "submittedByName",su.role "submittedByRole",
  ir.verified_by "verifiedByUserId",concat(vu.first_name,' ',vu.last_name) "verifiedByName",ir.verified_at "verifiedAt",ir.created_at "createdAt"
  FROM incident_reports ir JOIN branches b ON b.id=ir.branch_id JOIN inventory_items ii ON ii.id=ir.inventory_item_id
  LEFT JOIN menu_items mi ON mi.id=ir.menu_item_id
  JOIN users su ON su.id=ir.submitted_by LEFT JOIN users vu ON vu.id=ir.verified_by LEFT JOIN shrinkage_reports sr ON sr.id=ir.shrinkage_report_id`;

export const listIncidentReports: RequestHandler = async (req, res) => {
  const filters = incidentFilters.parse(req.query);
  const pagination = paginationQuery.parse(req.query);
  const branchId = getEffectiveBranchId(req.user!, filters.branchId);
  const clauses: string[] = [];
  const values: unknown[] = [];
  if (branchId) {
    values.push(branchId);
    clauses.push(`ir.branch_id=$${values.length}`);
  }
  if (filters.status) {
    values.push(filters.status);
    clauses.push(`ir.status=$${values.length}`);
  }
  if (filters.incidentType) {
    values.push(filters.incidentType);
    clauses.push(`ir.incident_type=$${values.length}`);
  }
  if (filters.inventoryItemId) {
    values.push(filters.inventoryItemId);
    clauses.push(`ir.inventory_item_id=$${values.length}`);
  }
  if (filters.shrinkageReportId) {
    values.push(filters.shrinkageReportId);
    clauses.push(`ir.shrinkage_report_id=$${values.length}`);
  }
  if (filters.startDate) {
    values.push(filters.startDate);
    clauses.push(`ir.occurred_at >= $${values.length}::date`);
  }
  if (filters.endDate) {
    values.push(filters.endDate);
    clauses.push(`ir.occurred_at < ($${values.length}::date + interval '1 day')`);
  }
  if (req.user!.role === "STAFF") {
    values.push(req.user!.id);
    clauses.push(`ir.submitted_by=$${values.length}`);
  }
  const result = await pool.query(
    `${incidentSelection.replace("SELECT ","SELECT count(*) OVER()::int \"__total\",")} ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""} ORDER BY ir.occurred_at DESC LIMIT $${values.length+1} OFFSET $${values.length+2}`,
    [...values,pagination.pageSize,(pagination.page-1)*pagination.pageSize],
  );
  const page = paginatedRows(result.rows, pagination);
  res.json({ success: true, data: { incidents: page.data, pagination: page.pagination } });
};

export const listIncidentItemOptions: RequestHandler = async (req, res) => {
  const branchId = requiredBranchId(req.user!);
  const [items, products] = await Promise.all([
    pool.query(
      `SELECT id "inventoryItemId",sku,name,unit FROM inventory_items
      WHERE status='ACTIVE' AND (item_scope='GLOBAL' OR origin_branch_id=$1) ORDER BY name`,
      [branchId],
    ),
    pool.query(
      `SELECT mi.id "productId",mi.code,mi.name
       FROM menu_items mi
       JOIN menu_item_branches mib ON mib.menu_item_id=mi.id AND mib.branch_id=$1
      WHERE mi.status='ACTIVE' AND mi.approval_status='APPROVED'
        AND mib.availability_status='APPROVED' AND mib.is_active=true
      ORDER BY mi.name`,
      [branchId],
    ),
  ]);
  res.json({
    success: true,
    data: { items: items.rows, products: products.rows },
  });
};

export const createIncidentReport: RequestHandler = async (req, res) => {
  const input = incidentCreateInput.parse(req.body);
  const branchId = requiredBranchId(req.user!);
  if (req.user!.role === "STAFF" && input.shrinkageReportId) {
    throw new AppError(403, "INCIDENT_LINK_FORBIDDEN", "Only the Branch Manager may link an incident to an investigation");
  }
  const item = await pool.query(
    `SELECT 1 FROM inventory_items WHERE id=$1 AND status='ACTIVE'
    AND (item_scope='GLOBAL' OR origin_branch_id=$2)`,
    [input.inventoryItemId, branchId],
  );
  if (!item.rows[0])
    throw new AppError(
      422,
      "INVENTORY_ITEM_INVALID",
      "Select an active inventory item",
    );
  if (input.productId) {
    const product = await pool.query(
      `SELECT 1 FROM menu_items mi JOIN menu_item_branches mib ON mib.menu_item_id=mi.id
        WHERE mi.id=$1 AND mib.branch_id=$2 AND mi.status='ACTIVE' AND mi.approval_status='APPROVED'
          AND mib.availability_status='APPROVED' AND mib.is_active=true`,
      [input.productId, branchId],
    );
    if (!product.rows[0])
      throw new AppError(
        422,
        "PRODUCT_INVALID",
        "Select an active product available at your branch",
      );
  }
  if (input.shrinkageReportId) {
    const report = await pool.query(
      `SELECT 1 FROM shrinkage_reports WHERE id=$1 AND branch_id=$2 AND inventory_item_id=$3`,
      [input.shrinkageReportId, branchId, input.inventoryItemId],
    );
    if (!report.rows[0])
      throw new AppError(
        422,
        "SHRINKAGE_REPORT_INVALID",
        "The selected variance does not match this branch and inventory item",
      );
  }
  const inserted = await pool.query<{ id: string }>(
    `INSERT INTO incident_reports (submitted_by,branch_id,inventory_item_id,menu_item_id,shrinkage_report_id,incident_type,quantity,occurred_at,reason,notes,photo_url)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
    [
      req.user!.id,
      branchId,
      input.inventoryItemId,
      input.productId ?? null,
      input.shrinkageReportId ?? null,
      input.incidentType,
      input.quantity,
      input.occurredAt,
      input.reason,
      input.notes ?? null,
      input.photoUrl ?? null,
    ],
  );
  await writeAudit(
    req.user!,
    "CREATE_INCIDENT_REPORT",
    "INCIDENT_REPORT",
    inserted.rows[0]!.id,
    `Recorded ${input.incidentType.toLowerCase()} incident`,
    {
      branchId,
      inventoryItemId: input.inventoryItemId,
      productId: input.productId ?? null,
      incidentType: input.incidentType,
      shrinkageReportId: input.shrinkageReportId ?? null,
    },
  );
  const result = await pool.query(`${incidentSelection} WHERE ir.id=$1`, [
    inserted.rows[0]!.id,
  ]);
  if (req.user!.role === "STAFF") {
    await pool.query(
      `INSERT INTO notifications (recipient_user_id,branch_id,type,title,message,entity_type,entity_id)
       SELECT id,$1,'INCIDENT_SUBMITTED','New staff incident report',$2,'INCIDENT_REPORT',$3
       FROM users u WHERE role='BRANCH_MANAGER' AND branch_id=$1 AND status='ACTIVE'
         AND NOT EXISTS (
           SELECT 1 FROM notifications n
            WHERE n.recipient_user_id=u.id AND n.type='INCIDENT_SUBMITTED'
              AND n.entity_type='INCIDENT_REPORT' AND n.entity_id=$3
         )`,
      [
        branchId,
        `${result.rows[0].inventoryItemName}: ${input.incidentType.toLowerCase().replaceAll("_", " ")}`,
        inserted.rows[0]!.id,
      ],
    );
  }
  res.status(201).json({ success: true, data: { incident: result.rows[0] } });
};

export const reviewIncidentReport: RequestHandler = async (req, res) => {
  const { id } = idParams.parse(req.params);
  const input = incidentReviewInput.parse(req.body);
  const branchId = requiredBranchId(req.user!);
  const updated = await pool.query(
    `UPDATE incident_reports SET status=$3,verified_by=$4,verified_at=now(),manager_comment=$5,updated_at=now()
      WHERE id=$1 AND branch_id=$2 AND status='PENDING' RETURNING id`,
    [
      id,
      branchId,
      input.status,
      req.user!.id,
      input.managerComment?.trim() || null,
    ],
  );
  if (!updated.rows[0])
    throw new AppError(
      404,
      "INCIDENT_NOT_PENDING",
      "Pending incident report not found for your branch",
    );
  await writeAudit(
    req.user!,
    "REVIEW_INCIDENT_REPORT",
    "INCIDENT_REPORT",
    id,
    `${input.status === "VERIFIED" ? "Verified" : "Rejected"} incident report`,
    { branchId, commentAdded: Boolean(input.managerComment?.trim()) },
  );
  const result = await pool.query(`${incidentSelection} WHERE ir.id=$1`, [id]);
  await pool.query(
    `INSERT INTO notifications (recipient_user_id,branch_id,type,title,message,entity_type,entity_id)
     SELECT submitted_by,branch_id,'INCIDENT_REVIEWED','Incident report reviewed',$2,'INCIDENT_REPORT',id
      FROM incident_reports ir WHERE id=$1
        AND NOT EXISTS (
          SELECT 1 FROM notifications n
           WHERE n.recipient_user_id=ir.submitted_by AND n.type='INCIDENT_REVIEWED'
             AND n.entity_type='INCIDENT_REPORT' AND n.entity_id=ir.id
        )`,
    [
      id,
      `${input.status === "VERIFIED" ? "Your incident report was verified." : "Your incident report was rejected."}${input.managerComment?.trim() ? ` Manager comment: ${input.managerComment.trim()}` : ""}`,
    ],
  );
  res.json({ success: true, data: { incident: result.rows[0] } });
};

export const linkIncidentToInvestigation: RequestHandler = async (req, res) => {
  const { id } = idParams.parse(req.params);
  const input = incidentLinkInput.parse(req.body);
  const branchId = requiredBranchId(req.user!);
  const updated = await pool.query(
    `UPDATE incident_reports ir SET shrinkage_report_id=$3,updated_at=now()
      FROM shrinkage_reports sr
     WHERE ir.id=$1 AND ir.branch_id=$2 AND sr.id=$3 AND sr.branch_id=$2
       AND sr.inventory_item_id=ir.inventory_item_id
     RETURNING ir.id`,
    [id, branchId, input.shrinkageReportId],
  );
  if (!updated.rows[0]) throw new AppError(422, "INCIDENT_LINK_INVALID", "The incident and investigation must belong to the same branch and ingredient");
  await writeAudit(req.user!, "LINK_INCIDENT_EVIDENCE", "INCIDENT_REPORT", id, "Linked an incident report as supporting investigation evidence", { branchId, shrinkageReportId: input.shrinkageReportId });
  const result = await pool.query(`${incidentSelection} WHERE ir.id=$1`, [id]);
  res.json({ success: true, data: { incident: result.rows[0] } });
};

const purchaseOrderSelection = `SELECT po.id,po.po_no "poNo",po.branch_id "branchId",b.name "branchName",po.created_by "createdByUserId",
  concat(u.first_name,' ',u.last_name) "createdByName",po.supplier_name "supplierName",po.order_date::text "orderDate",
  po.expected_delivery_date::text "expectedDeliveryDate",po.received_date::text "receivedDate",po.status,po.notes,
  po.created_at "createdAt",po.updated_at "updatedAt",count(poi.id)::int "itemCount",
  COALESCE(sum(poi.quantity_ordered*poi.unit_cost),0)::float8 "totalAmount",
  COALESCE(json_agg(json_build_object('id',poi.id,'inventoryItemId',ii.id,'sku',ii.sku,'name',ii.name,'unit',ii.unit,
    'quantityOrdered',poi.quantity_ordered::float8,'quantityReceived',poi.quantity_received::float8,'unitCost',poi.unit_cost::float8)
    ORDER BY ii.name) FILTER (WHERE poi.id IS NOT NULL),'[]') items
  FROM purchase_orders po JOIN branches b ON b.id=po.branch_id JOIN users u ON u.id=po.created_by
  LEFT JOIN purchase_order_items poi ON poi.purchase_order_id=po.id LEFT JOIN inventory_items ii ON ii.id=poi.inventory_item_id`;

async function readPurchaseOrders(
  branchId?: string,
  status?: string,
  id?: string,
  client: Pick<PoolClient, "query"> = pool,
  pagination?: { page: number; pageSize: number },
) {
  const clauses: string[] = [];
  const values: unknown[] = [];
  if (branchId) {
    values.push(branchId);
    clauses.push(`po.branch_id=$${values.length}`);
  }
  if (status) {
    values.push(status);
    clauses.push(`po.status=$${values.length}`);
  }
  if (id) {
    values.push(id);
    clauses.push(`po.id=$${values.length}`);
  }
  const result = await client.query(
    `${pagination?purchaseOrderSelection.replace("SELECT ","SELECT count(*) OVER()::int \"__total\","):purchaseOrderSelection} ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""}
    GROUP BY po.id,b.id,u.id ORDER BY po.order_date DESC,po.created_at DESC${pagination?` LIMIT $${values.length+1} OFFSET $${values.length+2}`:""}`,
    pagination?[...values,pagination.pageSize,(pagination.page-1)*pagination.pageSize]:values,
  );
  return result.rows;
}

export const listPurchaseOrders: RequestHandler = async (req, res) => {
  const filters = purchaseOrderFilters.parse(req.query);
  const pagination = paginationQuery.parse(req.query);
  const branchId = getEffectiveBranchId(req.user!, filters.branchId);
  const rows = await readPurchaseOrders(branchId, filters.status, undefined, pool, pagination);
  const page = paginatedRows(rows, pagination);
  res.json({
    success: true,
    data: {
      purchaseOrders: page.data,
      pagination: page.pagination,
    },
  });
};

export const getPurchaseOrder: RequestHandler = async (req, res) => {
  const { id } = idParams.parse(req.params);
  const branchId = getEffectiveBranchId(req.user!);
  const order = (await readPurchaseOrders(branchId, undefined, id))[0];
  if (!order)
    throw new AppError(
      404,
      "PURCHASE_ORDER_NOT_FOUND",
      "Purchase order not found",
    );
  res.json({ success: true, data: { purchaseOrder: order } });
};

export const createPurchaseOrder: RequestHandler = async (req, res) => {
  const input = purchaseOrderCreateInput.parse(req.body);
  const branchId = requiredBranchId(req.user!);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const completedCount = await client.query(
      `SELECT id FROM inventory_counts WHERE branch_id=$1 AND count_date=$2::date LIMIT 1`,
      [branchId, input.orderDate],
    );
    if (!completedCount.rows[0]) {
      throw new AppError(
        409,
        "PHYSICAL_COUNT_REQUIRED",
        `Complete the physical inventory count for ${input.orderDate} before creating a purchase order.`,
      );
    }
    const ids = input.items.map((item) => item.inventoryItemId);
    const valid = await client.query(
      `SELECT id FROM inventory_items WHERE id=ANY($1::uuid[]) AND status='ACTIVE'
      AND (item_scope='GLOBAL' OR origin_branch_id=$2)`,
      [ids, branchId],
    );
    if (valid.rows.length !== ids.length)
      throw new AppError(
        422,
        "PO_ITEM_INVALID",
        "One or more purchase order ingredients are missing or inactive",
      );
    const number = await client.query<{ poNo: string }>(
      `SELECT 'PO-'||to_char($1::date,'YYYY')||'-'||lpad(nextval('purchase_order_number_seq')::text,5,'0') "poNo"`,
      [input.orderDate],
    );
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO purchase_orders (po_no,branch_id,created_by,supplier_name,order_date,expected_delivery_date,status,notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [
        number.rows[0]!.poNo,
        branchId,
        req.user!.id,
        input.supplierName,
        input.orderDate,
        input.expectedDeliveryDate,
        input.status,
        input.notes ?? null,
      ],
    );
    for (const item of input.items)
      await client.query(
        `INSERT INTO purchase_order_items (purchase_order_id,inventory_item_id,quantity_ordered,unit_cost) VALUES ($1,$2,$3,$4)`,
        [
          inserted.rows[0]!.id,
          item.inventoryItemId,
          item.quantityOrdered,
          item.unitCost,
        ],
      );
    await writeAudit(
      req.user!,
      "CREATE_PURCHASE_ORDER",
      "PURCHASE_ORDER",
      inserted.rows[0]!.id,
      `Created ${number.rows[0]!.poNo}`,
      { branchId, status: input.status },
      client,
    );
    await client.query("COMMIT");
    const order = (
      await readPurchaseOrders(branchId, undefined, inserted.rows[0]!.id)
    )[0];
    res.status(201).json({ success: true, data: { purchaseOrder: order } });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export const updatePurchaseOrderStatus: RequestHandler = async (req, res) => {
  const { id } = idParams.parse(req.params);
  const input = purchaseOrderStatusInput.parse(req.body);
  const branchId = requiredBranchId(req.user!);
  const allowedCurrent =
    input.status === "ORDERED" ? ["DRAFT"] : ["DRAFT", "ORDERED"];
  const result = await pool.query(
    `UPDATE purchase_orders SET status=$3,updated_at=now() WHERE id=$1 AND branch_id=$2 AND status=ANY($4::purchase_order_status[]) RETURNING id`,
    [id, branchId, input.status, allowedCurrent],
  );
  if (!result.rows[0])
    throw new AppError(
      409,
      "PO_STATUS_TRANSITION_INVALID",
      "The purchase order cannot be changed to that status",
    );
  await writeAudit(
    req.user!,
    "UPDATE_PURCHASE_ORDER_STATUS",
    "PURCHASE_ORDER",
    id,
    `Changed purchase order status to ${input.status}`,
    { branchId },
  );
  res.json({
    success: true,
    data: {
      purchaseOrder: (await readPurchaseOrders(branchId, undefined, id))[0],
    },
  });
};

export const receivePurchaseOrder: RequestHandler = async (req, res) => {
  const { id } = idParams.parse(req.params);
  const input = purchaseOrderReceiveInput.parse(req.body);
  const branchId = requiredBranchId(req.user!);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const order = await client.query<{ poNo: string; orderDate: string }>(
      `SELECT po_no "poNo",order_date::text "orderDate" FROM purchase_orders WHERE id=$1 AND branch_id=$2 AND status IN ('ORDERED','PARTIALLY_RECEIVED') FOR UPDATE`,
      [id, branchId],
    );
    if (!order.rows[0])
      throw new AppError(
        409,
        "PO_NOT_RECEIVABLE",
        "Only ordered or partially received purchase orders can be received",
      );
    if (input.receivedDate < order.rows[0].orderDate)
      throw new AppError(
        422,
        "PO_RECEIPT_DATE_INVALID",
        "Received date cannot be before the order date",
      );
    for (const item of input.items) {
      const current = await client.query<{
        inventoryItemId: string;
        remaining: number;
        unitCost: number;
      }>(
        `SELECT inventory_item_id "inventoryItemId",(quantity_ordered-quantity_received)::float8 remaining,unit_cost::float8 "unitCost"
           FROM purchase_order_items WHERE id=$1 AND purchase_order_id=$2 FOR UPDATE`,
        [item.purchaseOrderItemId, id],
      );
      if (!current.rows[0])
        throw new AppError(
          422,
          "PO_ITEM_NOT_FOUND",
          "A received item does not belong to this purchase order",
        );
      if (item.quantityReceived > current.rows[0].remaining)
        throw new AppError(
          422,
          "PO_RECEIPT_EXCEEDS_ORDER",
          "Received quantity cannot exceed the remaining ordered quantity",
        );
      await client.query(
        `UPDATE purchase_order_items SET quantity_received=quantity_received+$2,updated_at=now() WHERE id=$1`,
        [item.purchaseOrderItemId, item.quantityReceived],
      );
      await client.query(
        `INSERT INTO inventory_movements (branch_id,inventory_item_id,movement_type,quantity,occurred_at,reference_no,notes,created_by)
         VALUES ($1,$2,'RECEIPT',$3,$4::date + time '12:00',$5,'Received through Purchase Orders',$6)`,
        [
          branchId,
          current.rows[0].inventoryItemId,
          item.quantityReceived,
          input.receivedDate,
          order.rows[0].poNo,
          req.user!.id,
        ],
      );
      await client.query(
        `INSERT INTO branch_inventory_settings (branch_id,inventory_item_id,current_unit_cost,reorder_level,reorder_days,updated_by)
         SELECT $1,ii.id,$3,ii.reorder_level,7,$2 FROM inventory_items ii WHERE ii.id=$4
         ON CONFLICT (branch_id,inventory_item_id) DO UPDATE
           SET current_unit_cost=excluded.current_unit_cost,updated_by=excluded.updated_by,updated_at=now()`,
        [
          branchId,
          req.user!.id,
          current.rows[0].unitCost,
          current.rows[0].inventoryItemId,
        ],
      );
    }
    const remaining = await client.query<{ count: string }>(
      `SELECT count(*) count FROM purchase_order_items WHERE purchase_order_id=$1 AND quantity_received<quantity_ordered`,
      [id],
    );
    const status =
      Number(remaining.rows[0]?.count ?? 0) === 0
        ? "RECEIVED"
        : "PARTIALLY_RECEIVED";
    await client.query(
      `UPDATE purchase_orders
          SET status=$2::purchase_order_status,
              received_date=CASE WHEN $2::purchase_order_status='RECEIVED'::purchase_order_status THEN $3::date ELSE NULL END,
              updated_at=now()
        WHERE id=$1`,
      [id, status, input.receivedDate],
    );
    await writeAudit(
      req.user!,
      "RECEIVE_PURCHASE_ORDER",
      "PURCHASE_ORDER",
      id,
      `Recorded ${status.toLowerCase().replaceAll("_", " ")}`,
      { branchId },
      client,
    );
    await client.query("COMMIT");
    res.json({
      success: true,
      data: {
        purchaseOrder: (await readPurchaseOrders(branchId, undefined, id))[0],
      },
    });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};
