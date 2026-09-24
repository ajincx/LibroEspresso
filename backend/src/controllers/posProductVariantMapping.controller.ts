import type { RequestHandler } from "express";
import { z } from "zod";
import { pool } from "../config/database.js";
import { writeAudit } from "../services/audit.service.js";
import { AppError } from "../utils/appError.js";

const sourceInput = z.object({
  sourceCode: z.string().trim().min(2).max(80).transform((value) => value.toUpperCase()),
  displayName: z.string().trim().min(2).max(160),
  supportedFormat: z.enum(["CANONICAL_CSV", "SUMMARY_ITEMS_SOLD_LEGACY_XLS", "TRANSACTION_SUMMARY_XLSX"]),
  status: z.enum(["ACTIVE", "INACTIVE"]).default("INACTIVE"),
});
const mappingInput = z.object({
  posSourceId: z.string().uuid(),
  branchId: z.string().uuid().nullable().default(null),
  sourceProductName: z.string().trim().min(1).max(240),
  sourceProductCode: z.string().trim().min(1).max(160).nullable().default(null),
  menuItemVariantId: z.string().uuid(),
  status: z.enum(["ACTIVE", "INACTIVE"]).default("INACTIVE"),
});
const idParam = z.object({ id: z.string().uuid() });

function databaseConflict(error: unknown): never {
  if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
    throw new AppError(409, "POS_MAPPING_CONFLICT", "An active mapping already exists for this exact POS identity and scope.");
  }
  if (typeof error === "object" && error !== null && "code" in error && (error.code === "23503" || error.code === "23514")) {
    throw new AppError(422, "POS_MAPPING_INVALID", "The POS source, branch, or variant is invalid for this mapping.");
  }
  if (typeof error === "object" && error !== null && "code" in error && error.code === "P0001") {
    throw new AppError(422, "POS_MAPPING_TARGET_INACTIVE", "Activate the verified POS source and approved product variant before activating this mapping.");
  }
  throw error;
}

export const listPosSources: RequestHandler = async (req, res) => {
  const result = await pool.query(`SELECT id,source_code "sourceCode",display_name "displayName",supported_format "supportedFormat",status
    FROM pos_sources WHERE ($1::boolean OR status='ACTIVE') ORDER BY display_name`, [req.user!.role === "OWNER"]);
  res.json({ success: true, data: { sources: result.rows } });
};

export const createPosSource: RequestHandler = async (req, res) => {
  const value = sourceInput.parse(req.body);
  if (value.status !== "INACTIVE") throw new AppError(422, "POS_SOURCE_REVIEW_REQUIRED", "Create the source as inactive, then activate it after verification.");
  try {
    const result = await pool.query(`INSERT INTO pos_sources(source_code,display_name,supported_format,status)
      VALUES($1,$2,$3,$4) RETURNING id,source_code "sourceCode",display_name "displayName",supported_format "supportedFormat",status`,
      [value.sourceCode, value.displayName, value.supportedFormat, value.status]);
    await writeAudit(req.user!, "CREATE_POS_SOURCE", "POS_SOURCE", result.rows[0].id, `Created POS source ${value.sourceCode}`);
    res.status(201).json({ success: true, data: { source: result.rows[0] } });
  } catch (error) { databaseConflict(error); }
};

export const updatePosSource: RequestHandler = async (req, res) => {
  const { id } = idParam.parse(req.params);
  const value = sourceInput.partial().refine((item) => Object.keys(item).length > 0).parse(req.body);
  try {
    const result = await pool.query(`UPDATE pos_sources SET source_code=COALESCE($2,source_code),display_name=COALESCE($3,display_name),
      supported_format=COALESCE($4,supported_format),status=COALESCE($5,status),updated_at=now() WHERE id=$1
      RETURNING id,source_code "sourceCode",display_name "displayName",supported_format "supportedFormat",status`,
      [id, value.sourceCode ?? null, value.displayName ?? null, value.supportedFormat ?? null, value.status ?? null]);
    if (!result.rows[0]) throw new AppError(404, "POS_SOURCE_NOT_FOUND", "POS source not found.");
    await writeAudit(req.user!, "UPDATE_POS_SOURCE", "POS_SOURCE", id, `Updated POS source ${result.rows[0].sourceCode}`);
    res.json({ success: true, data: { source: result.rows[0] } });
  } catch (error) { databaseConflict(error); }
};

export const listPosMappings: RequestHandler = async (req, res) => {
  const sourceId = z.string().uuid().parse(req.query.posSourceId);
  const branchId = req.user!.role === "OWNER" ? null : req.user!.branchId;
  const result = await pool.query(`SELECT pm.id,pm.pos_source_id "posSourceId",pm.branch_id "branchId",
      pm.source_product_name "sourceProductName",pm.source_product_code "sourceProductCode",
      pm.menu_item_variant_id "menuItemVariantId",m.id "menuItemId",m.name "menuItemName",v.name "variantName",
      pm.status,pm.reviewed_by "reviewedBy",pm.reviewed_at "reviewedAt"
    FROM pos_product_variant_mappings pm JOIN menu_item_variants v ON v.id=pm.menu_item_variant_id
    JOIN menu_items m ON m.id=v.menu_item_id WHERE pm.pos_source_id=$1 AND ($2::uuid IS NULL OR pm.branch_id IS NULL OR pm.branch_id=$2)
      AND ($3::boolean OR pm.status='ACTIVE')
    ORDER BY pm.source_product_name,pm.branch_id NULLS FIRST`, [sourceId, branchId, req.user!.role === "OWNER"]);
  res.json({ success: true, data: { mappings: result.rows } });
};

async function verifyMappingTarget(value: z.infer<typeof mappingInput>) {
  const target = await pool.query<{ productScope: string; originBranchId: string | null }>(
    `SELECT m.product_scope "productScope",m.origin_branch_id "originBranchId"
      FROM menu_item_variants v JOIN menu_items m ON m.id=v.menu_item_id
      WHERE v.id=$1 AND v.status='ACTIVE' AND m.status='ACTIVE' AND m.approval_status='APPROVED'`,
    [value.menuItemVariantId],
  );
  const product = target.rows[0];
  if (!product) throw new AppError(422, "POS_MAPPING_TARGET_INVALID", "Choose an active variant of an approved product.");
  if ((value.branchId === null && product.productScope !== "GLOBAL") || (product.productScope === "BRANCH" && product.originBranchId !== value.branchId)) {
    throw new AppError(422, "POS_MAPPING_BRANCH_INVALID", "The target product is not available in the mapping scope.");
  }
}

export const createPosMapping: RequestHandler = async (req, res) => {
  const value = mappingInput.parse(req.body);
  if (value.status !== "INACTIVE") throw new AppError(422, "POS_MAPPING_REVIEW_REQUIRED", "Create the mapping as inactive, then activate it after review.");
  await verifyMappingTarget(value);
  try {
    const result = await pool.query(`INSERT INTO pos_product_variant_mappings
      (pos_source_id,branch_id,source_product_name,source_product_code,menu_item_variant_id,status,reviewed_by,reviewed_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [value.posSourceId, value.branchId, value.sourceProductName, value.sourceProductCode, value.menuItemVariantId,
       value.status, null, null]);
    await writeAudit(req.user!, "CREATE_POS_MAPPING", "POS_MAPPING", result.rows[0].id, "Created reviewed POS mapping", { branchId: value.branchId });
    res.status(201).json({ success: true, data: { id: result.rows[0].id } });
  } catch (error) { databaseConflict(error); }
};

export const updatePosMapping: RequestHandler = async (req, res) => {
  const { id } = idParam.parse(req.params);
  const status = z.object({ status: z.enum(["ACTIVE", "INACTIVE"]) }).parse(req.body).status;
  try {
    const result = await pool.query(`UPDATE pos_product_variant_mappings SET status=$2,
      reviewed_by=CASE WHEN $2='ACTIVE' THEN $3 ELSE reviewed_by END,
      reviewed_at=CASE WHEN $2='ACTIVE' THEN now() ELSE reviewed_at END,updated_at=now()
      WHERE id=$1 RETURNING id,branch_id "branchId"`, [id, status, req.user!.id]);
    if (!result.rows[0]) throw new AppError(404, "POS_MAPPING_NOT_FOUND", "POS mapping not found.");
    await writeAudit(req.user!, "REVIEW_POS_MAPPING", "POS_MAPPING", id, `${status} POS mapping`, { branchId: result.rows[0].branchId });
    res.json({ success: true, data: { id, status } });
  } catch (error) { databaseConflict(error); }
};
