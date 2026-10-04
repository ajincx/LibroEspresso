import type { RequestHandler } from "express";
import type { PoolClient } from "pg";
import { pool } from "../config/database.js";
import { env } from "../config/env.js";
import { getEffectiveBranchId } from "../services/branchScope.js";
import { writeAudit } from "../services/audit.service.js";
import { loadInventoryLedger } from "../services/inventoryLedger.service.js";
import { configureBranchReorderPolicy } from "../services/branchInventorySettings.service.js";
import { baseStockUnitCost, receivedStockQuantity, resolvePurchaseConversion } from "../services/purchaseUom.service.js";
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
  testCleanupAuthorizationInput,
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

async function loadInventoryOverviewItems(branchId?: string, inventoryItemId?: string) {
  const values: unknown[] = [];
  const branchWhere = branchId ? `AND b.id=$${values.push(branchId)}` : "";
  const itemWhere = inventoryItemId ? `AND ii.id=$${values.push(inventoryItemId)}` : "";
  const result = await pool.query(
    `SELECT b.id "branchId",b.name "branchName",ii.id "inventoryItemId",ii.sku,ii.name,ii.category,ii.unit,
            COALESCE(bis.current_unit_cost,ii.unit_cost)::float8 "unitCost",
            COALESCE(bis.reorder_level,ii.reorder_level)::float8 "reorderLevel",
            COALESCE(bis.reorder_days,7)::int "reorderDays",
            COALESCE(bis.reorder_category,'MEDIUM') "reorderCategory",
            COALESCE(bal.actual_quantity,0)::float8 "lastActualQuantity",bal.as_of "lastCountAt"
       FROM branches b CROSS JOIN inventory_items ii
       LEFT JOIN branch_inventory_balances bal ON bal.branch_id=b.id AND bal.inventory_item_id=ii.id AND NOT bal.is_test_data
       LEFT JOIN branch_inventory_settings bis ON bis.branch_id=b.id AND bis.inventory_item_id=ii.id
      WHERE b.status='ACTIVE' AND ii.status='ACTIVE'
        AND (ii.item_scope='GLOBAL' OR ii.origin_branch_id=b.id) ${branchWhere} ${itemWhere}
      ORDER BY b.name,ii.name`,
    values,
  );
  const items = await Promise.all(result.rows.map(async (row) => {
    const ledger = await loadInventoryLedger(pool, row.branchId, row.inventoryItemId, row.unit);
    const stock = ledger.calculatedBalance;
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
  }));
  return items;
}

export const getInventoryOverview: RequestHandler = async (req, res) => {
  const filters = inventoryOverviewFilters.parse(req.query);
  const branchId = getEffectiveBranchId(req.user!, filters.branchId);
  const items = await loadInventoryOverviewItems(branchId);
  res.json({ success: true, data: { items } });
};

export const getInventoryStockLedger: RequestHandler = async (req, res) => {
  const { inventoryItemId } = inventorySettingsParams.parse(req.params);
  const filters = inventoryOverviewFilters.parse(req.query);
  const branchId = requiredBranchId(req.user!, filters.branchId);
  const item = (await loadInventoryOverviewItems(branchId, inventoryItemId))[0];
  if (!item) throw new AppError(404, "INVENTORY_ITEM_NOT_FOUND", "Inventory item not found");
  const ledger = await loadInventoryLedger(pool, branchId, inventoryItemId, item.unit);
  res.json({
    success: true,
    data: {
      ledger: {
        branchId: item.branchId,
        branchName: item.branchName,
        inventoryItemId: item.inventoryItemId,
        sku: item.sku,
        name: item.name,
        unit: item.unit,
        currentExpectedStock: item.systemStock,
        ...ledger,
      },
    },
  });
};

export const updateBranchInventorySettings: RequestHandler = async (
  req,
  res,
) => {
  const { inventoryItemId } = inventorySettingsParams.parse(req.params);
  const input = branchInventorySettingsInput.parse(req.body);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const settings = await configureBranchReorderPolicy(client, req.user!, {
      ...input,
      inventoryItemId,
    });
    await client.query("COMMIT");
    res.json({ success: true, data: { settings } });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

const incidentSelection = `SELECT ir.id,ir.branch_id "branchId",b.name "branchName",ir.inventory_item_id "inventoryItemId",
  ii.sku,ii.name "inventoryItemName",ii.unit,ir.shrinkage_report_id "shrinkageReportId",sr.report_no "shrinkageReportNo",
  ir.menu_item_id "productId",mi.code "productCode",mi.name "productName",ir.menu_item_variant_id "productVariantId",miv.name "productVariantName",
  ir.incident_type "incidentType",ir.other_incident_type "otherIncidentType",ir.quantity::float8,ir.occurred_at "occurredAt",ir.reason,ir.notes,ir.photo_url "photoUrl",
  ir.status,ir.manager_comment "managerComment",ir.submitted_by "submittedByUserId",concat(su.first_name,' ',su.last_name) "submittedByName",su.role "submittedByRole",
  ir.verified_by "verifiedByUserId",concat(vu.first_name,' ',vu.last_name) "verifiedByName",ir.verified_at "verifiedAt",ir.created_at "createdAt",
  COALESCE((SELECT json_agg(json_build_object('id',iri.id,'inventoryItemId',child.id,'sku',child.sku,'name',child.name,'quantity',iri.quantity::float8,'unit',iri.unit) ORDER BY iri.created_at,iri.id)
    FROM incident_report_items iri JOIN inventory_items child ON child.id=iri.inventory_item_id WHERE iri.incident_report_id=ir.id),'[]') items,
  COALESCE((SELECT json_agg(json_build_object('id',isl.id,'incidentReportItemId',isl.incident_report_item_id,'shrinkageReportId',isl.shrinkage_report_id,'shrinkageReportNo',linked.report_no) ORDER BY isl.created_at)
    FROM incident_shrinkage_links isl JOIN shrinkage_reports linked ON linked.id=isl.shrinkage_report_id WHERE isl.incident_report_id=ir.id),'[]') "shrinkageLinks"
  FROM incident_reports ir JOIN branches b ON b.id=ir.branch_id JOIN inventory_items ii ON ii.id=ir.inventory_item_id
  LEFT JOIN menu_items mi ON mi.id=ir.menu_item_id
  LEFT JOIN menu_item_variants miv ON miv.id=ir.menu_item_variant_id
  JOIN users su ON su.id=ir.submitted_by LEFT JOIN users vu ON vu.id=ir.verified_by LEFT JOIN shrinkage_reports sr ON sr.id=ir.shrinkage_report_id`;

export const listIncidentReports: RequestHandler = async (req, res) => {
  const filters = incidentFilters.parse(req.query);
  const pagination = paginationQuery.parse(req.query);
  const branchId = getEffectiveBranchId(req.user!, filters.branchId);
  const clauses: string[] = ["NOT ir.is_test_data", "ir.archived_at IS NULL"];
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
    clauses.push(`EXISTS (SELECT 1 FROM incident_report_items iri WHERE iri.incident_report_id=ir.id AND iri.inventory_item_id=$${values.length})`);
  }
  if (filters.shrinkageReportId) {
    values.push(filters.shrinkageReportId);
    clauses.push(`EXISTS (SELECT 1 FROM incident_shrinkage_links isl WHERE isl.incident_report_id=ir.id AND isl.shrinkage_report_id=$${values.length})`);
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
      `SELECT mi.id "productId",mi.code,mi.name,v.id "variantId",v.name "variantName",
              array_agg(DISTINCT ri.inventory_item_id::text) "ingredientIds"
       FROM menu_items mi
       JOIN menu_item_branches mib ON mib.menu_item_id=mi.id AND mib.branch_id=$1
       JOIN menu_item_variants v ON v.menu_item_id=mi.id AND v.status='ACTIVE'
       JOIN recipes r ON r.menu_item_variant_id=v.id AND r.status='ACTIVE'
         AND r.effective_from<=CURRENT_DATE AND (r.effective_to IS NULL OR r.effective_to>CURRENT_DATE)
       JOIN recipe_items ri ON ri.recipe_id=r.id
      WHERE mi.status='ACTIVE' AND mi.approval_status='APPROVED'
        AND mib.availability_status='APPROVED' AND mib.is_active=true
      GROUP BY mi.id,v.id,v.name
      ORDER BY mi.name,v.name`,
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
  const client = await pool.connect();
  let incidentId: string;
  try {
    await client.query("BEGIN");
    const itemIds = input.items.map((item) => item.inventoryItemId);
    const foundItems = await client.query<{ id: string; name: string; unit: string }>(
      `SELECT id,name,unit FROM inventory_items WHERE id=ANY($1::uuid[]) AND status='ACTIVE'
       AND (item_scope='GLOBAL' OR origin_branch_id=$2) FOR SHARE`,
      [itemIds, branchId],
    );
    if (foundItems.rows.length !== itemIds.length)
      throw new AppError(422, "INVENTORY_ITEM_INVALID", "Select only active inventory items available to this branch");

    let productId = input.productId ?? null;
    if (input.productVariantId) {
      const variant = await client.query<{ productId: string }>(
        `SELECT mi.id "productId" FROM menu_item_variants v
         JOIN menu_items mi ON mi.id=v.menu_item_id
         JOIN menu_item_branches mib ON mib.menu_item_id=mi.id AND mib.branch_id=$2
         WHERE v.id=$1 AND v.status='ACTIVE' AND mi.status='ACTIVE' AND mi.approval_status='APPROVED'
           AND mib.availability_status='APPROVED' AND mib.is_active=true
           AND NOT EXISTS (SELECT 1 FROM unnest($3::uuid[]) affected(item_id) WHERE NOT EXISTS (
             SELECT 1 FROM recipes r JOIN recipe_items ri ON ri.recipe_id=r.id
              WHERE r.menu_item_variant_id=v.id AND r.status='ACTIVE' AND ri.inventory_item_id=affected.item_id
                AND r.effective_from<=($4::timestamptz AT TIME ZONE 'Asia/Manila')::date
                AND (r.effective_to IS NULL OR r.effective_to>($4::timestamptz AT TIME ZONE 'Asia/Manila')::date)))`,
        [input.productVariantId, branchId, itemIds, input.occurredAt],
      );
      if (!variant.rows[0]) throw new AppError(422, "PRODUCT_VARIANT_INVALID", "Select an active branch product variant whose recipe uses every affected ingredient");
      productId = variant.rows[0].productId;
      if (input.productId && input.productId !== productId)
        throw new AppError(422, "PRODUCT_VARIANT_INVALID", "The selected variant does not belong to the selected product");
    } else if (input.productId) {
      const product = await client.query(
        `SELECT 1 FROM menu_items mi JOIN menu_item_branches mib ON mib.menu_item_id=mi.id
         WHERE mi.id=$1 AND mib.branch_id=$2 AND mi.status='ACTIVE' AND mi.approval_status='APPROVED'
           AND mib.availability_status='APPROVED' AND mib.is_active=true`,
        [input.productId, branchId],
      );
      if (!product.rows[0]) throw new AppError(422, "PRODUCT_INVALID", "Select an active branch product");
    }

    if (input.shrinkageReportId && input.items.length !== 1)
      throw new AppError(422, "SHRINKAGE_REPORT_INVALID", "Legacy direct shrinkage linking supports only a one-item incident");
    if (input.shrinkageReportId) {
      const report = await client.query(`SELECT 1 FROM shrinkage_reports WHERE id=$1 AND branch_id=$2 AND inventory_item_id=$3`, [input.shrinkageReportId, branchId, itemIds[0]]);
      if (!report.rows[0]) throw new AppError(422, "SHRINKAGE_REPORT_INVALID", "The selected variance does not match this branch and inventory item");
    }

    const first = input.items[0]!;
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO incident_reports (submitted_by,branch_id,inventory_item_id,menu_item_id,menu_item_variant_id,shrinkage_report_id,incident_type,other_incident_type,quantity,occurred_at,reason,notes,photo_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
      [req.user!.id,branchId,first.inventoryItemId,productId,input.productVariantId??null,input.shrinkageReportId??null,input.incidentType,input.otherIncidentType??null,first.quantity,input.occurredAt,input.reason,input.notes??null,input.photoUrl??null],
    );
    incidentId = inserted.rows[0]!.id;
    for (const affected of input.items) {
      await client.query(
        `INSERT INTO incident_report_items (incident_report_id,inventory_item_id,quantity,unit)
         SELECT $1,ii.id,$3,ii.unit FROM inventory_items ii WHERE ii.id=$2`,
        [incidentId, affected.inventoryItemId, affected.quantity],
      );
    }
    if (input.shrinkageReportId) {
      await client.query(
        `INSERT INTO incident_shrinkage_links (incident_report_id,incident_report_item_id,shrinkage_report_id)
         SELECT $1,iri.id,$2 FROM incident_report_items iri WHERE iri.incident_report_id=$1 AND iri.inventory_item_id=$3`,
        [incidentId,input.shrinkageReportId,first.inventoryItemId],
      );
    }
    await writeAudit(req.user!,"CREATE_INCIDENT_REPORT","INCIDENT_REPORT",incidentId,`Recorded ${input.incidentType.toLowerCase()} incident`,{
      branchId,itemCount:input.items.length,inventoryItemIds:itemIds,productId,productVariantId:input.productVariantId??null,incidentType:input.incidentType,otherIncidentType:input.otherIncidentType??null,
    },client);
    if (req.user!.role === "STAFF") {
      const itemSummary = foundItems.rows.map((item) => item.name).join(", ");
      await client.query(
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
        `${input.items.length} affected item${input.items.length===1?"":"s"} (${itemSummary}): ${input.incidentType.toLowerCase().replaceAll("_", " ")}`,
        incidentId,
      ],
    );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  const result = await pool.query(`${incidentSelection} WHERE ir.id=$1`, [incidentId!]);
  res.status(201).json({ success: true, data: { incident: result.rows[0] } });
};

export const reviewIncidentReport: RequestHandler = async (req, res) => {
  const { id } = idParams.parse(req.params);
  const input = incidentReviewInput.parse(req.body);
  const branchId = requiredBranchId(req.user!);
  const updated = await pool.query(
    `UPDATE incident_reports SET status=$3,verified_by=$4,verified_at=now(),manager_comment=$5,updated_at=now()
      WHERE id=$1 AND branch_id=$2 AND status='PENDING' AND archived_at IS NULL RETURNING id`,
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
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const linked = await client.query<{ incidentReportItemId: string }>(
      `SELECT iri.id "incidentReportItemId"
         FROM incident_reports ir
         JOIN incident_report_items iri ON iri.incident_report_id=ir.id
         JOIN shrinkage_reports sr ON sr.id=$3 AND sr.branch_id=ir.branch_id AND sr.inventory_item_id=iri.inventory_item_id
        WHERE ir.id=$1 AND ir.branch_id=$2 AND NOT ir.is_test_data AND ir.archived_at IS NULL
          AND ir.status IN ('PENDING','VERIFIED') AND NOT sr.is_test_data AND sr.archived_at IS NULL
          AND sr.status IN ('DETECTED','VERIFIED','PENDING_REVIEW')
          AND ($4::uuid IS NULL OR iri.id=$4::uuid)
        FOR UPDATE OF ir`,
      [id,branchId,input.shrinkageReportId,input.incidentReportItemId??null],
    );
    if (!linked.rows[0]) throw new AppError(422, "INCIDENT_LINK_INVALID", "The active incident item and investigation must belong to the same branch and ingredient");
    await client.query(
      `INSERT INTO incident_shrinkage_links (incident_report_id,incident_report_item_id,shrinkage_report_id)
       VALUES ($1,$2,$3) ON CONFLICT (incident_report_item_id,shrinkage_report_id) DO NOTHING`,
      [id,linked.rows[0].incidentReportItemId,input.shrinkageReportId],
    );
    await client.query(`UPDATE incident_reports SET shrinkage_report_id=COALESCE(shrinkage_report_id,$2),updated_at=now() WHERE id=$1`,[id,input.shrinkageReportId]);
    await writeAudit(req.user!, "LINK_INCIDENT_EVIDENCE", "INCIDENT_REPORT", id, "Linked an incident item as supporting investigation evidence", { branchId, incidentReportItemId:linked.rows[0].incidentReportItemId, shrinkageReportId: input.shrinkageReportId },client);
    await client.query("COMMIT");
  } catch(error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  const result = await pool.query(`${incidentSelection} WHERE ir.id=$1`, [id]);
  res.json({ success: true, data: { incident: result.rows[0] } });
};

const purchaseOrderSelection = `SELECT po.id,po.po_no "poNo",po.branch_id "branchId",b.name "branchName",po.created_by "createdByUserId",
  concat(u.first_name,' ',u.last_name) "createdByName",po.supplier_name "supplierName",po.order_date::text "orderDate",
  po.expected_delivery_date::text "expectedDeliveryDate",po.received_date::text "receivedDate",po.status,po.notes,
  po.is_test_data "isTestData",po.test_authorized_at "testAuthorizedAt",
  po.created_at "createdAt",po.updated_at "updatedAt",count(poi.id)::int "itemCount",
  COALESCE(sum(poi.quantity_ordered*poi.unit_cost),0)::float8 "totalAmount",
  COALESCE(json_agg(json_build_object('id',poi.id,'inventoryItemId',ii.id,'sku',ii.sku,'name',ii.name,'unit',ii.unit,
    'quantityOrdered',poi.quantity_ordered::float8,'quantityReceived',poi.quantity_received::float8,'unitCost',poi.unit_cost::float8,
    'purchaseUom',poi.purchase_uom,'conversionFactor',poi.conversion_factor::float8,
    'latestPhysicalCountDate',(SELECT max(ic.count_date)::text FROM inventory_counts ic
      JOIN inventory_count_items ici ON ici.inventory_count_id=ic.id
      WHERE ic.branch_id=po.branch_id AND ici.inventory_item_id=ii.id AND NOT ic.is_test_data))
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
      `SELECT id FROM inventory_counts WHERE branch_id=$1 AND count_date=$2::date AND NOT is_test_data LIMIT 1`,
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
    const valid = await client.query<{ id: string; unit: string }>(
      `SELECT id,unit FROM inventory_items WHERE id=ANY($1::uuid[]) AND status='ACTIVE'
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
    for (const item of input.items) {
      const inventoryItem = valid.rows.find((candidate) => candidate.id === item.inventoryItemId)!;
      const conversion = resolvePurchaseConversion(
        inventoryItem.unit,
        item.purchaseUom,
        item.conversionFactor,
      );
      await client.query(
        `INSERT INTO purchase_order_items (purchase_order_id,inventory_item_id,quantity_ordered,unit_cost,purchase_uom,conversion_factor) VALUES ($1,$2,$3,$4,$5,$6)`,
        [
          inserted.rows[0]!.id,
          item.inventoryItemId,
          item.quantityOrdered,
          item.unitCost,
          conversion.purchaseUom,
          conversion.conversionFactor,
        ],
      );
    }
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
  if (input.status === "CANCELLED") throw new AppError(409, "CONTROLLED_CANCELLATION_REQUIRED", "Use the controlled purchase-order cancellation action and provide a reason and verification PIN");
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

function requireDevelopmentOwner(user: NonNullable<Express.Request["user"]>) {
  if (user.role !== "OWNER")
    throw new AppError(403, "FORBIDDEN", "Only the Owner can manage test purchase orders");
  if (env.NODE_ENV === "production")
    throw new AppError(403, "TEST_DATA_DISABLED", "Test-data actions are disabled in production");
}

export const authorizePurchaseOrderTestCleanup: RequestHandler = async (req, res) => {
  requireDevelopmentOwner(req.user!);
  const { id } = idParams.parse(req.params);
  const input = testCleanupAuthorizationInput.parse(req.body);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const authorized = await client.query<{ id: string; poNo: string; branchId: string }>(
      `UPDATE purchase_orders po
          SET is_test_data=true,test_authorized_by=$2,test_authorized_at=now(),
              test_authorization_reason=$3,updated_at=now()
        WHERE po.id=$1 AND po.status IN ('DRAFT','ORDERED','CANCELLED')
          AND NOT EXISTS (
            SELECT 1 FROM purchase_order_items item
             WHERE item.purchase_order_id=po.id AND item.quantity_received>0
          )
      RETURNING po.id,po.po_no "poNo",po.branch_id "branchId"`,
      [id, req.user!.id, input.reason],
    );
    const order = authorized.rows[0];
    if (!order)
      throw new AppError(
        409,
        "PO_TEST_AUTHORIZATION_INVALID",
        "Only an individual draft, ordered, or cancelled purchase order with zero received quantity can be authorized as test data",
      );
    await writeAudit(
      req.user!,
      "AUTHORIZE_TEST_DATA_CLEANUP",
      "PURCHASE_ORDER",
      id,
      `Authorized ${order.poNo} as development test data`,
      { branchId: order.branchId, reason: input.reason },
      client,
    );
    await client.query("COMMIT");
    res.json({
      success: true,
      data: { purchaseOrder: (await readPurchaseOrders(undefined, undefined, id))[0] },
    });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export const receivePurchaseOrder: RequestHandler = async (req, res) => {
  const { id } = idParams.parse(req.params);
  const input = purchaseOrderReceiveInput.parse(req.body);
  const branchId = requiredBranchId(req.user!);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const order = await client.query<{ poNo: string; orderDate: string; isTestData: boolean; status: string }>(
      `SELECT po_no "poNo",order_date::text "orderDate",is_test_data "isTestData",status
         FROM purchase_orders WHERE id=$1 AND branch_id=$2 FOR UPDATE`,
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
    const lockedItems: {
      purchaseOrderItemId: string;
      quantityReceived: number;
      inventoryItemId: string;
      remaining: number;
      unitCost: number;
      conversionFactor: number;
    }[] = [];
    for (const item of input.items) {
      const current = await client.query<{
        inventoryItemId: string;
        remaining: number;
        unitCost: number;
        conversionFactor: number;
      }>(
        `SELECT inventory_item_id "inventoryItemId",(quantity_ordered-quantity_received)::float8 remaining,
                unit_cost::float8 "unitCost",conversion_factor::float8 "conversionFactor"
           FROM purchase_order_items WHERE id=$1 AND purchase_order_id=$2 FOR UPDATE`,
        [item.purchaseOrderItemId, id],
      );
      if (!current.rows[0])
        throw new AppError(
          422,
          "PO_ITEM_NOT_FOUND",
          "A received item does not belong to this purchase order",
        );
      lockedItems.push({
        ...item,
        ...current.rows[0],
        conversionFactor: Number(current.rows[0].conversionFactor ?? 1),
      });
    }
    const priorReceipt = await client.query<{
      inventoryItemId: string;
      quantity: number;
      receivedDate: string;
    }>(
      `SELECT inventory_item_id "inventoryItemId",quantity::float8,
              occurred_at::date::text "receivedDate"
         FROM inventory_movements
        WHERE branch_id=$1 AND reference_no=$2 AND movement_type='RECEIPT'
          AND receipt_request_id=$3::uuid
        ORDER BY inventory_item_id`,
      [branchId, order.rows[0].poNo, input.receiptRequestId],
    );
    if (priorReceipt.rows.length > 0) {
      const exactReplay = priorReceipt.rows.length === lockedItems.length
        && lockedItems.every((item) => priorReceipt.rows.some((movement) =>
          movement.inventoryItemId === item.inventoryItemId
          && Number(movement.quantity).toFixed(4) === receivedStockQuantity(
            item.quantityReceived,
            item.conversionFactor,
          ).toFixed(4)
          && movement.receivedDate === input.receivedDate
        ));
      if (!exactReplay)
        throw new AppError(
          409,
          "PO_RECEIPT_IDEMPOTENCY_CONFLICT",
          "This receipt request ID was already used with different receipt details",
        );
      await client.query("COMMIT");
      res.json({
        success: true,
        data: {
          purchaseOrder: (await readPurchaseOrders(branchId, undefined, id))[0],
        },
      });
      return;
    }
    const latestPhysicalCount = await client.query<{ countDate: string }>(
      `SELECT max(ic.count_date)::text "countDate"
         FROM inventory_counts ic
         JOIN inventory_count_items ici ON ici.inventory_count_id=ic.id
        WHERE ic.branch_id=$1 AND ici.inventory_item_id=ANY($2::uuid[]) AND NOT ic.is_test_data`,
      [branchId, [...new Set(lockedItems.map((item) => item.inventoryItemId))]],
    );
    const latestCountDate = latestPhysicalCount.rows[0]?.countDate;
    if (latestCountDate && input.receivedDate <= latestCountDate)
      throw new AppError(
        422,
        "PO_RECEIPT_DATE_BEFORE_LATEST_COUNT",
        `Receipt date must be after the latest physical count date (${latestCountDate})`,
      );
    if (!["ORDERED", "PARTIALLY_RECEIVED"].includes(order.rows[0].status))
      throw new AppError(
        409,
        "PO_NOT_RECEIVABLE",
        "Only ordered or partially received purchase orders can be received",
      );
    for (const item of lockedItems) {
      if (item.quantityReceived > item.remaining)
        throw new AppError(
          422,
          "PO_RECEIPT_EXCEEDS_ORDER",
          "Received quantity cannot exceed the remaining ordered quantity",
        );
      const conversionFactor = item.conversionFactor;
      if (order.rows[0].isTestData) {
        const priorSetting = await client.query<{ currentUnitCost: number }>(
          `SELECT current_unit_cost::float8 "currentUnitCost"
             FROM branch_inventory_settings
            WHERE branch_id=$1 AND inventory_item_id=$2 FOR UPDATE`,
          [branchId, item.inventoryItemId],
        );
        await client.query(
          `UPDATE purchase_order_items
              SET test_prior_setting_existed=$2,
                  test_prior_unit_cost=$3
            WHERE id=$1 AND test_prior_setting_existed IS NULL`,
          [
            item.purchaseOrderItemId,
            Boolean(priorSetting.rows[0]),
            priorSetting.rows[0]?.currentUnitCost ?? null,
          ],
        );
      }
      await client.query(
        `UPDATE purchase_order_items SET quantity_received=quantity_received+$2,updated_at=now() WHERE id=$1`,
        [item.purchaseOrderItemId, item.quantityReceived],
      );
      await client.query(
        `INSERT INTO inventory_movements (branch_id,inventory_item_id,movement_type,quantity,occurred_at,reference_no,notes,created_by,is_test_data,receipt_request_id)
         VALUES ($1,$2,'RECEIPT',$3,$4::date + time '12:00',$5,'Received through Purchase Orders',$6,$7,$8::uuid)`,
        [
          branchId,
          item.inventoryItemId,
          receivedStockQuantity(item.quantityReceived, conversionFactor),
          input.receivedDate,
          order.rows[0].poNo,
          req.user!.id,
          order.rows[0].isTestData,
          input.receiptRequestId,
        ],
      );
      const appliedSetting = await client.query<{ updatedAt: Date }>(
        `INSERT INTO branch_inventory_settings (branch_id,inventory_item_id,current_unit_cost,reorder_level,reorder_days,updated_by)
         SELECT $1,ii.id,$3,ii.reorder_level,7,$2 FROM inventory_items ii WHERE ii.id=$4
         ON CONFLICT (branch_id,inventory_item_id) DO UPDATE
           SET current_unit_cost=excluded.current_unit_cost,updated_by=excluded.updated_by,updated_at=now()
         RETURNING updated_at "updatedAt"`,
        [
          branchId,
          req.user!.id,
          baseStockUnitCost(item.unitCost, conversionFactor),
          item.inventoryItemId,
        ],
      );
      if (order.rows[0].isTestData) {
        await client.query(
          `UPDATE purchase_order_items SET test_cost_applied_at=$2 WHERE id=$1`,
          [item.purchaseOrderItemId, appliedSetting.rows[0]!.updatedAt],
        );
      }
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

export const deletePurchaseOrderTestData: RequestHandler = async (req, res) => {
  requireDevelopmentOwner(req.user!);
  const { id } = idParams.parse(req.params);
  const input = testCleanupAuthorizationInput.parse(req.body);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const orderResult = await client.query<{
      id: string;
      poNo: string;
      branchId: string;
      status: string;
      isTestData: boolean;
      testAuthorizedBy: string | null;
    }>(
      `SELECT id,po_no "poNo",branch_id "branchId",status,
              is_test_data "isTestData",test_authorized_by "testAuthorizedBy"
         FROM purchase_orders WHERE id=$1 FOR UPDATE`,
      [id],
    );
    const order = orderResult.rows[0];
    if (!order) throw new AppError(404, "PURCHASE_ORDER_NOT_FOUND", "Purchase order not found");
    if (!order.isTestData || !order.testAuthorizedBy)
      throw new AppError(
        409,
        "PO_NOT_AUTHORIZED_TEST_DATA",
        "Only an individually Owner-authorized test purchase order can be cleaned up",
      );

    const items = await client.query<{
      inventoryItemId: string;
      quantityReceived: number;
      priorSettingExisted: boolean | null;
      priorUnitCost: number | null;
      costAppliedAt: Date | null;
    }>(
      `SELECT inventory_item_id "inventoryItemId",quantity_received::float8 "quantityReceived",
              test_prior_setting_existed "priorSettingExisted",
              test_prior_unit_cost::float8 "priorUnitCost",test_cost_applied_at "costAppliedAt"
         FROM purchase_order_items WHERE purchase_order_id=$1 FOR UPDATE`,
      [id],
    );
    const receivedItems = items.rows.filter((item) => Number(item.quantityReceived) > 0);
    const unsafeMovement = await client.query(
      `SELECT id FROM inventory_movements
        WHERE reference_no=$1 AND (branch_id<>$2 OR NOT is_test_data) LIMIT 1`,
      [order.poNo, order.branchId],
    );
    if (unsafeMovement.rows[0])
      throw new AppError(409, "PO_TEST_CLEANUP_UNSAFE", "The purchase order has a non-test or cross-branch inventory movement");

    for (const item of receivedItems) {
      if (item.priorSettingExisted === null || !item.costAppliedAt)
        throw new AppError(409, "PO_TEST_CLEANUP_UNSAFE", "A received test item is missing its reversible cost snapshot");
      const currentSetting = await client.query<{ updatedAt: Date }>(
        `SELECT updated_at "updatedAt" FROM branch_inventory_settings
          WHERE branch_id=$1 AND inventory_item_id=$2 FOR UPDATE`,
        [order.branchId, item.inventoryItemId],
      );
      if (!currentSetting.rows[0] || currentSetting.rows[0].updatedAt.getTime() !== item.costAppliedAt.getTime())
        throw new AppError(409, "PO_TEST_CLEANUP_COST_CHANGED", "An ingredient cost changed after this test receipt; cleanup was stopped to protect the newer value");
    }

    const deletedMovements = await client.query(
      `DELETE FROM inventory_movements
        WHERE branch_id=$1 AND reference_no=$2 AND is_test_data=true RETURNING id`,
      [order.branchId, order.poNo],
    );
    for (const item of receivedItems) {
      if (item.priorSettingExisted) {
        const restored = await client.query(
          `UPDATE branch_inventory_settings
              SET current_unit_cost=$3,updated_by=$4,updated_at=now()
            WHERE branch_id=$1 AND inventory_item_id=$2 AND updated_at=$5 RETURNING inventory_item_id`,
          [order.branchId, item.inventoryItemId, item.priorUnitCost, req.user!.id, item.costAppliedAt],
        );
        if (!restored.rows[0]) throw new AppError(409, "PO_TEST_CLEANUP_COST_CHANGED", "The test cost could not be safely restored");
      } else {
        const removed = await client.query(
          `DELETE FROM branch_inventory_settings
            WHERE branch_id=$1 AND inventory_item_id=$2 AND updated_at=$3 RETURNING inventory_item_id`,
          [order.branchId, item.inventoryItemId, item.costAppliedAt],
        );
        if (!removed.rows[0]) throw new AppError(409, "PO_TEST_CLEANUP_COST_CHANGED", "The test-created cost setting could not be safely removed");
      }
    }
    await client.query(`DELETE FROM notifications WHERE entity_type='PURCHASE_ORDER' AND entity_id=$1`, [id]);
    await client.query(`DELETE FROM purchase_orders WHERE id=$1`, [id]);
    await writeAudit(
      req.user!,
      "TEST_DATA_CLEANUP",
      "PURCHASE_ORDER",
      id,
      `Cleaned up Owner-authorized test purchase order ${order.poNo}`,
      {
        branchId: order.branchId,
        reason: input.reason,
        priorStatus: order.status,
        authorizedBy: order.testAuthorizedBy,
        removedMovementCount: deletedMovements.rowCount ?? 0,
      },
      client,
    );
    await client.query("COMMIT");
    res.json({ success: true, data: { deletedId: id } });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};
