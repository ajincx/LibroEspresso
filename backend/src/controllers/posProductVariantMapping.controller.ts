import type { RequestHandler } from "express";
import type { PoolClient } from "pg";
import { z } from "zod";
import { pool } from "../config/database.js";
import { writeAudit } from "../services/audit.service.js";
import { inspectPosExcelHeaders, type PosFieldMapping } from "../services/posExcelImport.service.js";
import { AppError } from "../utils/appError.js";

const supportedFormat = z.enum(["CANONICAL_CSV", "SUMMARY_ITEMS_SOLD_LEGACY_XLS", "TRANSACTION_SUMMARY_XLSX", "CUSTOM_TABULAR_XLSX"]);
const mappingReviewStatus = z.enum(["PENDING", "APPROVED", "REJECTED", "AMBIGUOUS"]);
const sourceInput = z.object({
  sourceCode: z.string().trim().min(2).max(80).transform((value) => value.toUpperCase()),
  displayName: z.string().trim().min(2).max(160),
  supportedFormat,
  branchId: z.string().uuid(),
  status: z.enum(["ACTIVE", "INACTIVE"]).default("INACTIVE"),
});
const sourceUpdateInput = sourceInput.partial().extend({ confirmedSupportedFormat: supportedFormat.optional() })
  .refine((item) => Object.keys(item).length > 0);
const mappingInput = z.object({
  posSourceId: z.string().uuid(),
  branchId: z.string().uuid().nullable().default(null),
  sourceProductName: z.string().trim().min(1).max(240),
  sourceProductCode: z.string().trim().min(1).max(160).nullable().default(null),
  menuItemVariantId: z.string().uuid(),
  status: z.enum(["ACTIVE", "INACTIVE"]).default("INACTIVE"),
});
const mappingRevisionInput = z.object({
  branchId: z.string().uuid().nullable(),
  sourceProductCode: z.string().trim().min(1).max(160).nullable(),
  menuItemId: z.string().uuid(),
  menuItemVariantId: z.string().uuid(),
  revisionReason: z.string().trim().min(3).max(1000).optional(),
});
const mappingCopyInput = z.object({
  sourcePosSourceId: z.string().uuid(),
  targetPosSourceId: z.string().uuid(),
}).refine((value) => value.sourcePosSourceId !== value.targetPosSourceId, {
  message: "Choose two different POS sources.",
  path: ["targetPosSourceId"],
});
const mappingConfirmationInput = z.object({ confirmedSupportedFormat: supportedFormat });
const idParam = z.object({ id: z.string().uuid() });
const fieldMappingSchema = z.object({
  productName: z.string().trim().min(1).max(240),
  quantitySold: z.string().trim().min(1).max(240),
  transactionId: z.string().trim().min(1).max(240),
  businessDate: z.string().trim().min(1).max(240),
  status: z.string().trim().min(1).max(240),
  unitPrice: z.string().trim().min(1).max(240),
  salesAmount: z.string().trim().min(1).max(240).optional(),
});
const fieldMappingInput = z.object({
  headers: z.array(z.string().trim().min(1).max(240)).min(2).max(200),
  mapping: fieldMappingSchema,
}).superRefine((value, context) => {
  const mapped = Object.values(value.mapping).filter(Boolean);
  if (new Set(mapped.map((item) => item.toLowerCase())).size !== mapped.length) {
    context.addIssue({ code: "custom", path: ["mapping"], message: "Each source column can map to only one canonical field." });
  }
  const headers = new Set(value.headers.map((header) => header.toLowerCase()));
  for (const [field, header] of Object.entries(value.mapping)) {
    if (header && !headers.has(header.toLowerCase())) context.addIssue({ code: "custom", path: ["mapping", field], message: `Mapped column '${header}' is missing from this file.` });
  }
});
const mappingReviewInput = z.object({
  reviewStatus: mappingReviewStatus,
  reviewComment: z.string().trim().max(1000).optional(),
}).superRefine((value, context) => {
  if ((value.reviewStatus === "REJECTED" || value.reviewStatus === "AMBIGUOUS") && !value.reviewComment) {
    context.addIssue({ code: "custom", path: ["reviewComment"], message: "Add a review note before rejecting or marking a mapping ambiguous." });
  }
});

function databaseConflict(error: unknown): never {
  if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
    if ("constraint" in error && error.constraint === "uq_pos_sources_one_active_per_branch") {
      throw new AppError(409, "POS_SOURCE_ACTIVE_BRANCH_CONFLICT", "Deactivate the branch's current active POS source before activating another one.");
    }
    throw new AppError(409, "POS_MAPPING_CONFLICT", "An active mapping already exists for this exact POS identity and scope.");
  }
  if (typeof error === "object" && error !== null && "code" in error && (error.code === "23503" || error.code === "23514")) {
    throw new AppError(422, "POS_MAPPING_INVALID", "The POS source, branch, or variant is invalid for this mapping.");
  }
  if (typeof error === "object" && error !== null && "code" in error && error.code === "P0001") {
    throw new AppError(422, "POS_MAPPING_TARGET_INACTIVE", "Activate the verified POS source and approved product variant before activating this mapping.");
  }
  if (typeof error === "object" && error !== null && "code" in error && (error.code === "40001" || error.code === "40P01")) {
    throw new AppError(409, "POS_MAPPING_CONCURRENT_CHANGE", "The POS mappings changed during this request. Refresh and try again.");
  }
  throw error;
}

export const listPosSources: RequestHandler = async (req, res) => {
  const result = await pool.query(`SELECT s.id,s.branch_id "branchId",b.name "branchName",s.source_code "sourceCode",s.display_name "displayName",s.supported_format "supportedFormat",s.status,
      s.format_verified_by "formatVerifiedBy",s.format_verified_at "formatVerifiedAt",s.field_mapping "fieldMapping",
      concat(u.first_name,' ',u.last_name) "formatVerifiedByName",
      EXISTS(SELECT 1 FROM pos_imports pi WHERE pi.pos_source_id=s.id) "hasImports",
      EXISTS(SELECT 1 FROM pos_sale_items psi WHERE psi.pos_source_id=s.id) "hasSales",
      EXISTS(SELECT 1 FROM pos_product_variant_mappings pm WHERE pm.pos_source_id=s.id AND pm.status='ACTIVE' AND pm.review_status='APPROVED') "hasActiveMappings",
      EXISTS(SELECT 1 FROM pos_product_variant_mappings pm WHERE pm.pos_source_id=s.id AND pm.status='INACTIVE' AND pm.review_status='PENDING') "hasPendingMappings"
    FROM pos_sources s LEFT JOIN users u ON u.id=s.format_verified_by LEFT JOIN branches b ON b.id=s.branch_id
    WHERE ($1::boolean OR (s.status='ACTIVE' AND s.branch_id=$2::uuid)) ORDER BY b.name,s.display_name`, [req.user!.role === "OWNER",req.user!.branchId]);
  res.json({ success: true, data: { sources: result.rows } });
};

export const createPosSource: RequestHandler = async (req, res) => {
  const value = sourceInput.parse(req.body);
  if (value.status !== "INACTIVE") throw new AppError(422, "POS_SOURCE_REVIEW_REQUIRED", "Create the source as inactive, then activate it after verification.");
  try {
    const result = await pool.query(`INSERT INTO pos_sources(source_code,display_name,supported_format,branch_id,status)
      VALUES($1,$2,$3,$4,$5) RETURNING id,branch_id "branchId",source_code "sourceCode",display_name "displayName",supported_format "supportedFormat",status`,
      [value.sourceCode, value.displayName, value.supportedFormat, value.branchId, value.status]);
    await writeAudit(req.user!, "CREATE_POS_SOURCE", "POS_SOURCE", result.rows[0].id, `Created POS source ${value.sourceCode}`);
    res.status(201).json({ success: true, data: { source: result.rows[0] } });
  } catch (error) { databaseConflict(error); }
};

export const updatePosSource: RequestHandler = async (req, res) => {
  const { id } = idParam.parse(req.params);
  const value = sourceUpdateInput.parse(req.body);
  const client = await pool.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
    const current = await client.query<{ supportedFormat: z.infer<typeof supportedFormat>; status: "ACTIVE" | "INACTIVE"; branchId: string | null; fieldMapping: PosFieldMapping | null }>(
      `SELECT supported_format "supportedFormat",status,branch_id "branchId",field_mapping "fieldMapping" FROM pos_sources WHERE id=$1 FOR UPDATE`, [id],
    );
    if (!current.rows[0]) throw new AppError(404, "POS_SOURCE_NOT_FOUND", "POS source not found.");
    const nextFormat = value.supportedFormat ?? current.rows[0].supportedFormat;
    const nextStatus = value.status ?? current.rows[0].status;
    const nextBranchId = value.branchId ?? current.rows[0].branchId;
    if (nextStatus === "ACTIVE" && !nextBranchId) throw new AppError(422, "POS_SOURCE_BRANCH_REQUIRED", "Choose the branch that uses this POS source before activation.");
    if (nextStatus === "ACTIVE" && nextFormat === "CUSTOM_TABULAR_XLSX" && !current.rows[0].fieldMapping) throw new AppError(422, "POS_FIELD_MAPPING_REQUIRED", "Configure the POS column mapping before activating this source.");
    if (nextStatus === "ACTIVE") {
      const branch = await client.query(`SELECT id FROM branches WHERE id=$1 AND status='ACTIVE' FOR UPDATE`, [nextBranchId]);
      if (!branch.rows[0]) throw new AppError(422, "POS_SOURCE_BRANCH_INVALID", "Choose an active branch for this POS source.");
      const activeSource = await client.query<{ id: string }>(
        `SELECT id FROM pos_sources WHERE branch_id=$1 AND status='ACTIVE' AND id<>$2 LIMIT 1`,
        [nextBranchId, id],
      );
      if (activeSource.rows[0]) {
        throw new AppError(409, "POS_SOURCE_ACTIVE_BRANCH_CONFLICT", "Deactivate the branch's current active POS source before activating another one.");
      }
    }
    const requiresFormatReview = nextStatus === "ACTIVE"
      && (current.rows[0].status !== "ACTIVE" || nextFormat !== current.rows[0].supportedFormat);
    if (requiresFormatReview && value.confirmedSupportedFormat !== nextFormat) {
      throw new AppError(422, "POS_SOURCE_FORMAT_REVIEW_REQUIRED", "Confirm the verified export format before activating this POS source.");
    }
    const result = await client.query(`UPDATE pos_sources SET source_code=COALESCE($2,source_code),display_name=COALESCE($3,display_name),
      supported_format=COALESCE($4,supported_format),branch_id=COALESCE($9::uuid,branch_id),status=$5::record_status,
      format_verified_by=CASE WHEN $6::boolean THEN NULL WHEN $8::boolean THEN $7::uuid ELSE format_verified_by END,
      format_verified_at=CASE WHEN $6::boolean THEN NULL WHEN $8::boolean THEN now() ELSE format_verified_at END,updated_at=now() WHERE id=$1
      RETURNING id,branch_id "branchId",source_code "sourceCode",display_name "displayName",supported_format "supportedFormat",status,
        format_verified_by "formatVerifiedBy",format_verified_at "formatVerifiedAt"`,
      [id, value.sourceCode ?? null, value.displayName ?? null, value.supportedFormat ?? null,
        nextStatus, nextStatus === "INACTIVE", req.user!.id, requiresFormatReview, value.branchId ?? null]);
    await writeAudit(req.user!, "UPDATE_POS_SOURCE", "POS_SOURCE", id, `Updated POS source ${result.rows[0].sourceCode}`, { confirmedSupportedFormat: value.confirmedSupportedFormat ?? null }, client);
    await client.query("COMMIT");
    res.json({ success: true, data: { source: result.rows[0] } });
  } catch (error) { await client.query("ROLLBACK"); databaseConflict(error); }
  finally { client.release(); }
};

export const inspectPosSourceHeaders: RequestHandler = async (req, res) => {
  const { id } = idParam.parse(req.params);
  if (!Buffer.isBuffer(req.body)) throw new AppError(422, "POS_FILE_REQUIRED", "Select an XLS or XLSX file to inspect.");
  const source = await pool.query<{ fieldMapping: PosFieldMapping | null }>(
    `SELECT field_mapping "fieldMapping" FROM pos_sources WHERE id=$1`, [id],
  );
  if (!source.rows[0]) throw new AppError(404, "POS_SOURCE_NOT_FOUND", "POS source not found.");
  const encodedFilename = req.headers["x-pos-filename"];
  const filename = typeof encodedFilename === "string" ? decodeURIComponent(encodedFilename) : "source.xlsx";
  try {
    const inspection = inspectPosExcelHeaders(filename, req.body);
    res.json({ success: true, data: { ...inspection, mapping: source.rows[0].fieldMapping } });
  } catch (error) {
    if (error instanceof Error && "code" in error) throw new AppError(422, String(error.code), error.message);
    throw error;
  }
};

export const savePosSourceFieldMapping: RequestHandler = async (req, res) => {
  const { id } = idParam.parse(req.params);
  const value = fieldMappingInput.parse(req.body);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const source = await client.query<{ supportedFormat: string }>(
      `SELECT supported_format "supportedFormat" FROM pos_sources WHERE id=$1 FOR UPDATE`, [id],
    );
    if (!source.rows[0]) throw new AppError(404, "POS_SOURCE_NOT_FOUND", "POS source not found.");
    if (source.rows[0].supportedFormat !== "CUSTOM_TABULAR_XLSX") throw new AppError(409, "POS_FIELD_MAPPING_NOT_APPLICABLE", "Column mapping is available only for Custom Mapped Excel sources.");
    await client.query(`UPDATE pos_sources SET field_mapping=$2::jsonb,field_mapping_updated_by=$3,field_mapping_updated_at=now(),updated_at=now() WHERE id=$1`, [id, JSON.stringify(value.mapping), req.user!.id]);
    await writeAudit(req.user!, "UPDATE_POS_FIELD_MAPPING", "POS_SOURCE", id, "Configured POS spreadsheet columns", { canonicalFields: Object.keys(value.mapping), sourceHeaders: value.headers }, client);
    await client.query("COMMIT");
    res.json({ success: true, data: { id, mapping: value.mapping } });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export const listPosMappings: RequestHandler = async (req, res) => {
  const sourceId = z.string().uuid().parse(req.query.posSourceId);
  const reviewStatus = req.query.reviewStatus ? mappingReviewStatus.parse(req.query.reviewStatus) : null;
  const branchId = req.user!.role === "OWNER" ? null : req.user!.branchId;
  const result = await pool.query(`SELECT pm.id,pm.pos_source_id "posSourceId",pm.branch_id "branchId",
      pm.source_product_name "sourceProductName",pm.source_product_code "sourceProductCode",
      pm.menu_item_variant_id "menuItemVariantId",m.id "menuItemId",m.name "menuItemName",v.name "variantName",
      pm.status,pm.review_status "reviewStatus",pm.review_comment "reviewComment",
      pm.reviewed_by "reviewedBy",pm.reviewed_at "reviewedAt",b.name "branchName",
      r.id "recipeId",r.version "recipeVersion",
      (r.id IS NOT NULL AND EXISTS(SELECT 1 FROM recipe_items ready_item WHERE ready_item.recipe_id=r.id)
       AND NOT EXISTS(SELECT 1 FROM recipe_items invalid_item JOIN inventory_items ii ON ii.id=invalid_item.inventory_item_id
         WHERE invalid_item.recipe_id=r.id AND NOT (((invalid_item.unit IN ('g','kg')) AND (ii.unit IN ('g','kg')))
           OR ((invalid_item.unit IN ('ml','L')) AND (ii.unit IN ('ml','L'))) OR (invalid_item.unit='pc' AND ii.unit='pc')))) "recipeAvailable"
    FROM pos_product_variant_mappings pm JOIN menu_item_variants v ON v.id=pm.menu_item_variant_id
    JOIN menu_items m ON m.id=v.menu_item_id LEFT JOIN branches b ON b.id=pm.branch_id
    LEFT JOIN LATERAL (SELECT candidate.id,candidate.version FROM recipes candidate
      WHERE candidate.menu_item_variant_id=v.id AND candidate.status='ACTIVE' AND candidate.effective_from<=CURRENT_DATE
        AND (candidate.effective_to IS NULL OR candidate.effective_to>CURRENT_DATE)
      ORDER BY candidate.effective_from DESC LIMIT 1) r ON true
    WHERE pm.pos_source_id=$1 AND ($2::uuid IS NULL OR pm.branch_id IS NULL OR pm.branch_id=$2)
      AND ($3::boolean OR (pm.status='ACTIVE' AND pm.review_status='APPROVED'))
      AND ($4::text IS NULL OR pm.review_status=$4)
    ORDER BY pm.source_product_name,pm.branch_id NULLS FIRST`, [sourceId, branchId, req.user!.role === "OWNER", reviewStatus]);
  res.json({ success: true, data: { mappings: result.rows } });
};

async function verifyMappingTarget(
  value: Pick<z.infer<typeof mappingInput>, "branchId" | "menuItemVariantId"> & { menuItemId?: string },
  client: Pick<PoolClient, "query"> = pool,
) {
  const target = await client.query<{ productScope: string; originBranchId: string | null }>(
    `SELECT m.product_scope "productScope",m.origin_branch_id "originBranchId"
      FROM menu_item_variants v JOIN menu_items m ON m.id=v.menu_item_id
      WHERE v.id=$1 AND ($2::uuid IS NULL OR m.id=$2) AND v.status='ACTIVE' AND m.status='ACTIVE' AND m.approval_status='APPROVED'`,
    [value.menuItemVariantId, value.menuItemId ?? null],
  );
  const product = target.rows[0];
  if (!product) throw new AppError(422, "POS_MAPPING_TARGET_INVALID", "Choose an active variant of an approved product.");
  if ((value.branchId === null && product.productScope !== "GLOBAL") || (product.productScope === "BRANCH" && product.originBranchId !== value.branchId)) {
    throw new AppError(422, "POS_MAPPING_BRANCH_INVALID", "The target product is not available in the mapping scope.");
  }
}

async function ensureNoOpenMappingConflict(client: Pick<PoolClient, "query">, value: {
  id: string | null; posSourceId: string; branchId: string | null; sourceProductName: string; sourceProductCode: string | null;
}) {
  const duplicate = await client.query(`SELECT id FROM pos_product_variant_mappings
    WHERE ($1::uuid IS NULL OR id<>$1) AND pos_source_id=$2
      AND coalesce(branch_id,'00000000-0000-0000-0000-000000000000'::uuid)=coalesce($3::uuid,'00000000-0000-0000-0000-000000000000'::uuid)
      AND (status='ACTIVE' OR review_status='PENDING')
      AND (($4::text IS NOT NULL AND source_product_code IS NOT NULL AND lower(btrim(source_product_code))=lower(btrim($4)))
        OR ($4::text IS NULL AND source_product_code IS NULL
          AND normalized_source_product_name=lower(regexp_replace(btrim($5), '[[:space:]]+', ' ', 'g'))))
    LIMIT 1`, [value.id, value.posSourceId, value.branchId, value.sourceProductCode, value.sourceProductName]);
  if (duplicate.rows[0]) throw new AppError(409, "POS_MAPPING_CONFLICT", "An active or pending mapping already exists for this POS identity and scope.");
}

export const createPosMapping: RequestHandler = async (req, res) => {
  const value = mappingInput.parse(req.body);
  if (value.status !== "INACTIVE") throw new AppError(422, "POS_MAPPING_REVIEW_REQUIRED", "Create the mapping as inactive, then activate it after review.");
  await verifyMappingTarget(value);
  try {
    await ensureNoOpenMappingConflict(pool, {
      id: null, posSourceId: value.posSourceId, branchId: value.branchId,
      sourceProductName: value.sourceProductName, sourceProductCode: value.sourceProductCode,
    });
    const result = await pool.query(`INSERT INTO pos_product_variant_mappings
      (pos_source_id,branch_id,source_product_name,source_product_code,menu_item_variant_id,status,review_status,reviewed_by,reviewed_at)
      VALUES($1,$2,$3,$4,$5,$6,'PENDING',$7,$8) RETURNING id`,
      [value.posSourceId, value.branchId, value.sourceProductName, value.sourceProductCode, value.menuItemVariantId,
       value.status, null, null]);
    await writeAudit(req.user!, "CREATE_POS_MAPPING", "POS_MAPPING", result.rows[0].id, "Created reviewed POS mapping", { branchId: value.branchId });
    res.status(201).json({ success: true, data: { id: result.rows[0].id } });
  } catch (error) { databaseConflict(error); }
};

export const copyApprovedGlobalPosMappings: RequestHandler = async (req, res) => {
  const value = mappingCopyInput.parse(req.body);
  const client = await pool.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
    const sources = await client.query<{ id: string; sourceCode: string; branchId: string; supportedFormat: string }>(
      `SELECT id,source_code "sourceCode",branch_id "branchId",supported_format "supportedFormat"
         FROM pos_sources WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE`,
      [[value.sourcePosSourceId, value.targetPosSourceId]],
    );
    const source = sources.rows.find((item) => item.id === value.sourcePosSourceId);
    const target = sources.rows.find((item) => item.id === value.targetPosSourceId);
    if (!source || !target) throw new AppError(404, "POS_SOURCE_NOT_FOUND", "The source or destination POS source was not found.");
    if (source.branchId === target.branchId) throw new AppError(409, "POS_MAPPING_COPY_SAME_BRANCH", "Choose a destination POS source from another branch.");
    if (source.supportedFormat !== target.supportedFormat) throw new AppError(409, "POS_MAPPING_FORMAT_MISMATCH", "Source and destination POS systems must use the same file format.");

    const candidates = await client.query<{
      sourceProductName: string; sourceProductCode: string | null; normalizedSourceProductName: string;
      menuItemVariantId: string; sourceBranchScoped: boolean; targetAvailable: boolean; recipeAvailable: boolean;
    }>(`SELECT original.source_product_name "sourceProductName",original.source_product_code "sourceProductCode",
        original.normalized_source_product_name "normalizedSourceProductName",original.menu_item_variant_id "menuItemVariantId",
        (original.branch_id IS NOT NULL) "sourceBranchScoped",
        (v.status='ACTIVE' AND m.status='ACTIVE' AND m.approval_status='APPROVED'
          AND (m.product_scope='GLOBAL' OR m.origin_branch_id=$3::uuid)) "targetAvailable",
        EXISTS(SELECT 1 FROM recipes r WHERE r.menu_item_variant_id=v.id AND r.status='ACTIVE'
          AND r.effective_from<=CURRENT_DATE AND (r.effective_to IS NULL OR r.effective_to>CURRENT_DATE)
          AND EXISTS(SELECT 1 FROM recipe_items ri WHERE ri.recipe_id=r.id)
          AND NOT EXISTS(SELECT 1 FROM recipe_items ri JOIN inventory_items ii ON ii.id=ri.inventory_item_id
            WHERE ri.recipe_id=r.id AND NOT (((ri.unit IN ('g','kg')) AND (ii.unit IN ('g','kg')))
              OR ((ri.unit IN ('ml','L')) AND (ii.unit IN ('ml','L'))) OR (ri.unit='pc' AND ii.unit='pc')))) "recipeAvailable"
      FROM pos_product_variant_mappings original
      JOIN menu_item_variants v ON v.id=original.menu_item_variant_id
      JOIN menu_items m ON m.id=v.menu_item_id
      WHERE original.pos_source_id=$1 AND (original.branch_id IS NULL OR original.branch_id=$2::uuid)
        AND original.status='ACTIVE' AND original.review_status='APPROVED'
      ORDER BY original.id FOR SHARE OF original`, [source.id, source.branchId, target.branchId]);
    let copied = 0;
    let skipped = 0;
    const incompatibleMappings: Array<{ sourceProductName: string; sourceProductCode: string | null; reason: string }> = [];
    for (const candidate of candidates.rows) {
      if (!candidate.targetAvailable || !candidate.recipeAvailable) {
        incompatibleMappings.push({ sourceProductName: candidate.sourceProductName, sourceProductCode: candidate.sourceProductCode,
          reason: !candidate.targetAvailable ? "Product or variant is unavailable for the destination branch." : "No valid active recipe is available." });
        continue;
      }
      const targetBranchId = candidate.sourceBranchScoped ? target.branchId : null;
      const duplicate = await client.query(`SELECT id FROM pos_product_variant_mappings
        WHERE pos_source_id=$1
          AND coalesce(branch_id,'00000000-0000-0000-0000-000000000000'::uuid)=coalesce($2::uuid,'00000000-0000-0000-0000-000000000000'::uuid)
          AND (($3::text IS NOT NULL AND source_product_code IS NOT NULL AND lower(btrim(source_product_code))=lower(btrim($3)))
            OR ($3::text IS NULL AND source_product_code IS NULL AND normalized_source_product_name=$4)) LIMIT 1`,
      [target.id,targetBranchId,candidate.sourceProductCode,candidate.normalizedSourceProductName]);
      if (duplicate.rows[0]) { skipped += 1; continue; }
      await client.query(`INSERT INTO pos_product_variant_mappings
        (pos_source_id,branch_id,source_product_name,source_product_code,menu_item_variant_id,status,review_status,review_comment,reviewed_by,reviewed_at)
        VALUES($1,$2,$3,$4,$5,'INACTIVE','PENDING',$6,NULL,NULL)`,
      [target.id,targetBranchId,candidate.sourceProductName,candidate.sourceProductCode,candidate.menuItemVariantId,`Copied from ${source.sourceCode} — pending review`]);
      copied += 1;
    }
    const result = { copied, skipped, incompatible: incompatibleMappings.length, eligible: candidates.rows.length, incompatibleMappings };
    await writeAudit(req.user!, "COPY_POS_MAPPINGS", "POS_SOURCE", target.id,
      `Copied approved mappings from ${source.sourceCode} to ${target.sourceCode}`,
      { sourcePosSourceId: source.id, targetPosSourceId: target.id, ...result }, client);
    await client.query("COMMIT");
    res.status(201).json({ success: true, data: result });
  } catch (error) {
    await client.query("ROLLBACK");
    databaseConflict(error);
  } finally {
    client.release();
  }
};

export const approveAllPendingPosMappings: RequestHandler = async (req, res) => {
  const { id: posSourceId } = idParam.parse(req.params);
  const client = await pool.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
    const sourceResult = await client.query<{ status: "ACTIVE" | "INACTIVE"; formatVerifiedAt: string | null }>(
      `SELECT status,format_verified_at "formatVerifiedAt" FROM pos_sources WHERE id=$1 FOR UPDATE`, [posSourceId],
    );
    const source = sourceResult.rows[0];
    if (!source) throw new AppError(404, "POS_SOURCE_NOT_FOUND", "POS source not found.");
    if (source.status !== "ACTIVE" || !source.formatVerifiedAt) {
      throw new AppError(422, "POS_SOURCE_FORMAT_REVIEW_REQUIRED", "Activate and verify the POS source format before approving mappings.");
    }
    const pending = await client.query<{
      id: string; branchId: string | null; sourceProductCode: string | null; normalizedSourceProductName: string;
      targetAvailable: boolean; recipeAvailable: boolean;
    }>(`SELECT pm.id,pm.branch_id "branchId",pm.source_product_code "sourceProductCode",
        pm.normalized_source_product_name "normalizedSourceProductName",
        (v.status='ACTIVE' AND m.status='ACTIVE' AND m.approval_status='APPROVED' AND
          ((pm.branch_id IS NULL AND m.product_scope='GLOBAL') OR
           (pm.branch_id IS NOT NULL AND (m.product_scope='GLOBAL' OR m.origin_branch_id=pm.branch_id)))) "targetAvailable",
        EXISTS(SELECT 1 FROM recipes r WHERE r.menu_item_variant_id=v.id AND r.status='ACTIVE'
          AND r.effective_from<=CURRENT_DATE AND (r.effective_to IS NULL OR r.effective_to>CURRENT_DATE)
          AND EXISTS(SELECT 1 FROM recipe_items ri WHERE ri.recipe_id=r.id)
          AND NOT EXISTS(SELECT 1 FROM recipe_items ri JOIN inventory_items ii ON ii.id=ri.inventory_item_id
            WHERE ri.recipe_id=r.id AND NOT (((ri.unit IN ('g','kg')) AND (ii.unit IN ('g','kg')))
              OR ((ri.unit IN ('ml','L')) AND (ii.unit IN ('ml','L'))) OR (ri.unit='pc' AND ii.unit='pc')))) "recipeAvailable"
      FROM pos_product_variant_mappings pm
      JOIN menu_item_variants v ON v.id=pm.menu_item_variant_id
      JOIN menu_items m ON m.id=v.menu_item_id
      WHERE pm.pos_source_id=$1 AND pm.status='INACTIVE' AND pm.review_status='PENDING'
      ORDER BY pm.id FOR UPDATE OF pm`, [posSourceId]);
    if (pending.rows.length === 0) throw new AppError(409, "POS_MAPPING_NONE_PENDING", "There are no pending mappings to approve.");
    const ids = pending.rows.map((mapping) => mapping.id);
    const pendingIdentities = new Set<string>();
    for (const mapping of pending.rows) {
      if (!mapping.targetAvailable) throw new AppError(422, "POS_MAPPING_TARGET_INACTIVE", "Every pending mapping must target an active approved product and variant in its scope.");
      if (!mapping.recipeAvailable) throw new AppError(422, "POS_MAPPING_RECIPE_REQUIRED", "Every pending mapping needs a valid active recipe before bulk approval.");
      const identity = `${mapping.branchId ?? "GLOBAL"}:${mapping.sourceProductCode?.trim().toLowerCase() ?? `name:${mapping.normalizedSourceProductName}`}`;
      if (pendingIdentities.has(identity)) throw new AppError(409, "POS_MAPPING_CONFLICT", "Pending mappings contain a duplicate POS identity. No mappings were approved.");
      pendingIdentities.add(identity);
      const conflict = await client.query(`SELECT id FROM pos_product_variant_mappings WHERE id<>ALL($1::uuid[]) AND pos_source_id=$2
        AND coalesce(branch_id,'00000000-0000-0000-0000-000000000000'::uuid)=coalesce($3::uuid,'00000000-0000-0000-0000-000000000000'::uuid)
        AND status='ACTIVE' AND (($4::text IS NOT NULL AND source_product_code IS NOT NULL AND lower(btrim(source_product_code))=lower(btrim($4)))
          OR ($4::text IS NULL AND source_product_code IS NULL AND normalized_source_product_name=$5)) LIMIT 1`,
      [ids,posSourceId,mapping.branchId,mapping.sourceProductCode,mapping.normalizedSourceProductName]);
      if (conflict.rows[0]) throw new AppError(409, "POS_MAPPING_CONFLICT", "An approved mapping conflicts with a pending mapping. No mappings were approved.");
    }
    await client.query(`UPDATE pos_product_variant_mappings SET status='ACTIVE',review_status='APPROVED',
      review_comment='Approved in bulk review',reviewed_by=$2,reviewed_at=now(),updated_at=now()
      WHERE id=ANY($1::uuid[])`, [ids, req.user!.id]);
    for (const mapping of pending.rows) {
      await writeAudit(req.user!, "REVIEW_POS_MAPPING", "POS_MAPPING", mapping.id, "APPROVED POS mapping in bulk review", { posSourceId, bulkApproval: true }, client);
    }
    await client.query("COMMIT");
    res.json({ success: true, data: { posSourceId, approved: ids.length } });
  } catch (error) {
    await client.query("ROLLBACK");
    databaseConflict(error);
  } finally {
    client.release();
  }
};

export const confirmAndActivatePosMappings: RequestHandler = async (req, res) => {
  const { id: posSourceId } = idParam.parse(req.params);
  const value = mappingConfirmationInput.parse(req.body);
  const client = await pool.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
    const identity = await client.query<{ branchId: string | null }>(
      `SELECT branch_id "branchId" FROM pos_sources WHERE id=$1`, [posSourceId],
    );
    if (!identity.rows[0]) throw new AppError(404, "POS_SOURCE_NOT_FOUND", "POS source not found.");
    if (!identity.rows[0].branchId) throw new AppError(422, "POS_SOURCE_BRANCH_REQUIRED", "Choose the destination branch before confirmation.");
    await client.query(`SELECT pg_advisory_xact_lock(hashtextextended('libro:pos-source:' || $1::text, 0))`, [identity.rows[0].branchId]);

    const sourceResult = await client.query<{
      branchId: string; displayName: string; sourceCode: string; status: "ACTIVE" | "INACTIVE";
      supportedFormat: z.infer<typeof supportedFormat>; fieldMapping: PosFieldMapping | null;
    }>(`SELECT branch_id "branchId",display_name "displayName",source_code "sourceCode",status,
        supported_format "supportedFormat",field_mapping "fieldMapping"
      FROM pos_sources WHERE id=$1 FOR UPDATE`, [posSourceId]);
    const source = sourceResult.rows[0];
    if (!source) throw new AppError(404, "POS_SOURCE_NOT_FOUND", "POS source not found.");
    if (source.supportedFormat !== value.confirmedSupportedFormat) {
      throw new AppError(422, "POS_SOURCE_FORMAT_REVIEW_REQUIRED", "The confirmed export format no longer matches this POS source. Review the format before activation.");
    }
    if (source.supportedFormat === "CUSTOM_TABULAR_XLSX" && !source.fieldMapping) {
      throw new AppError(422, "POS_FIELD_MAPPING_REQUIRED", "Configure the POS column mapping before confirmation.");
    }
    const branch = await client.query(`SELECT id FROM branches WHERE id=$1 AND status='ACTIVE' FOR UPDATE`, [source.branchId]);
    if (!branch.rows[0]) throw new AppError(422, "POS_SOURCE_BRANCH_INVALID", "The destination branch is not active.");
    const competingSource = await client.query<{ id: string }>(
      `SELECT id FROM pos_sources WHERE branch_id=$1 AND status='ACTIVE' AND id<>$2 ORDER BY id FOR UPDATE`,
      [source.branchId, posSourceId],
    );
    if (competingSource.rows[0]) {
      throw new AppError(409, "POS_SOURCE_ACTIVE_BRANCH_CONFLICT", "Another POS source is already active for this branch. Deactivate it explicitly before confirming this setup.");
    }

    const pending = await client.query<{
      id: string; branchId: string | null; sourceProductCode: string | null; normalizedSourceProductName: string;
      targetAvailable: boolean; recipeAvailable: boolean;
    }>(`SELECT pm.id,pm.branch_id "branchId",pm.source_product_code "sourceProductCode",
        pm.normalized_source_product_name "normalizedSourceProductName",
        (v.status='ACTIVE' AND m.status='ACTIVE' AND m.approval_status='APPROVED' AND
          ((pm.branch_id IS NULL AND m.product_scope='GLOBAL') OR
           (pm.branch_id IS NOT NULL AND (m.product_scope='GLOBAL' OR m.origin_branch_id=pm.branch_id)))) "targetAvailable",
        EXISTS(SELECT 1 FROM recipes r WHERE r.menu_item_variant_id=v.id AND r.status='ACTIVE'
          AND r.effective_from<=CURRENT_DATE AND (r.effective_to IS NULL OR r.effective_to>CURRENT_DATE)
          AND EXISTS(SELECT 1 FROM recipe_items ri WHERE ri.recipe_id=r.id)
          AND NOT EXISTS(SELECT 1 FROM recipe_items ri JOIN inventory_items ii ON ii.id=ri.inventory_item_id
            WHERE ri.recipe_id=r.id AND NOT (((ri.unit IN ('g','kg')) AND (ii.unit IN ('g','kg')))
              OR ((ri.unit IN ('ml','L')) AND (ii.unit IN ('ml','L'))) OR (ri.unit='pc' AND ii.unit='pc')))) "recipeAvailable"
      FROM pos_product_variant_mappings pm
      JOIN menu_item_variants v ON v.id=pm.menu_item_variant_id
      JOIN menu_items m ON m.id=v.menu_item_id
      WHERE pm.pos_source_id=$1 AND pm.status='INACTIVE' AND pm.review_status='PENDING'
      ORDER BY pm.id FOR UPDATE OF pm`, [posSourceId]);
    if (pending.rows.length === 0) throw new AppError(409, "POS_MAPPING_NONE_PENDING", "There are no pending mappings to confirm.");
    const ids = pending.rows.map((mapping) => mapping.id);
    const pendingIdentities = new Set<string>();
    for (const mapping of pending.rows) {
      if (!mapping.targetAvailable) throw new AppError(422, "POS_MAPPING_TARGET_INACTIVE", "Every pending mapping must target an active approved product and variant in its scope.");
      if (!mapping.recipeAvailable) throw new AppError(422, "POS_MAPPING_RECIPE_REQUIRED", "Every pending mapping needs a valid active recipe before confirmation.");
      const mappingIdentity = `${mapping.branchId ?? "GLOBAL"}:${mapping.sourceProductCode?.trim().toLowerCase() ?? `name:${mapping.normalizedSourceProductName}`}`;
      if (pendingIdentities.has(mappingIdentity)) throw new AppError(409, "POS_MAPPING_CONFLICT", "Pending mappings contain a duplicate POS identity. Nothing was activated.");
      pendingIdentities.add(mappingIdentity);
      const conflict = await client.query(`SELECT id FROM pos_product_variant_mappings WHERE id<>ALL($1::uuid[]) AND pos_source_id=$2
        AND coalesce(branch_id,'00000000-0000-0000-0000-000000000000'::uuid)=coalesce($3::uuid,'00000000-0000-0000-0000-000000000000'::uuid)
        AND status='ACTIVE' AND (($4::text IS NOT NULL AND source_product_code IS NOT NULL AND lower(btrim(source_product_code))=lower(btrim($4)))
          OR ($4::text IS NULL AND source_product_code IS NULL AND normalized_source_product_name=$5)) LIMIT 1`,
      [ids,posSourceId,mapping.branchId,mapping.sourceProductCode,mapping.normalizedSourceProductName]);
      if (conflict.rows[0]) throw new AppError(409, "POS_MAPPING_CONFLICT", "An approved mapping conflicts with a pending mapping. Nothing was activated.");
    }

    await client.query(`UPDATE pos_sources SET status='ACTIVE',format_verified_by=$2,format_verified_at=now(),updated_at=now() WHERE id=$1`, [posSourceId, req.user!.id]);
    await client.query(`UPDATE pos_product_variant_mappings SET status='ACTIVE',review_status='APPROVED',
      review_comment='Approved during Quick Assign confirmation',reviewed_by=$2,reviewed_at=now(),updated_at=now()
      WHERE id=ANY($1::uuid[])`, [ids, req.user!.id]);
    await writeAudit(req.user!, "VERIFY_POS_SOURCE_FORMAT", "POS_SOURCE", posSourceId, `Verified ${source.supportedFormat} during Quick Assign confirmation`, { supportedFormat: source.supportedFormat, branchId: source.branchId }, client);
    for (const mapping of pending.rows) {
      await writeAudit(req.user!, "REVIEW_POS_MAPPING", "POS_MAPPING", mapping.id, "APPROVED POS mapping during Quick Assign confirmation", { posSourceId, quickAssignConfirmation: true }, client);
    }
    await writeAudit(req.user!, "ACTIVATE_POS_SOURCE", "POS_SOURCE", posSourceId, `Activated POS source ${source.sourceCode}`, { branchId: source.branchId, approvedMappings: ids.length }, client);
    await client.query("COMMIT");
    res.json({ success: true, data: { posSourceId, approved: ids.length, status: "ACTIVE", readiness: "Ready" } });
  } catch (error) {
    await client.query("ROLLBACK");
    databaseConflict(error);
  } finally {
    client.release();
  }
};

export const updatePosMapping: RequestHandler = async (req, res) => {
  const { id } = idParam.parse(req.params);
  const value = mappingReviewInput.parse(req.body);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const mapping = await client.query<{
      branchId: string | null; sourceStatus: "ACTIVE" | "INACTIVE"; formatVerifiedAt: string | null;
      recipeAvailable: boolean; targetAvailable: boolean; sourceProductCode: string | null;
      normalizedSourceProductName: string; posSourceId: string; reviewStatus: "PENDING" | "APPROVED" | "REJECTED" | "AMBIGUOUS";
    }>(`SELECT pm.branch_id "branchId",pm.source_product_code "sourceProductCode",
        pm.normalized_source_product_name "normalizedSourceProductName",pm.pos_source_id "posSourceId",
        pm.review_status "reviewStatus",
        s.status "sourceStatus",s.format_verified_at "formatVerifiedAt",
        (v.status='ACTIVE' AND m.status='ACTIVE' AND m.approval_status='APPROVED' AND
          ((pm.branch_id IS NULL AND m.product_scope='GLOBAL') OR
           (pm.branch_id IS NOT NULL AND (m.product_scope='GLOBAL' OR m.origin_branch_id=pm.branch_id)))) "targetAvailable",
        EXISTS(SELECT 1 FROM recipes r WHERE r.menu_item_variant_id=v.id AND r.status='ACTIVE'
          AND r.effective_from<=CURRENT_DATE AND (r.effective_to IS NULL OR r.effective_to>CURRENT_DATE)
          AND EXISTS(SELECT 1 FROM recipe_items ri WHERE ri.recipe_id=r.id)
          AND NOT EXISTS(SELECT 1 FROM recipe_items ri JOIN inventory_items ii ON ii.id=ri.inventory_item_id
            WHERE ri.recipe_id=r.id AND NOT (((ri.unit IN ('g','kg')) AND (ii.unit IN ('g','kg')))
              OR ((ri.unit IN ('ml','L')) AND (ii.unit IN ('ml','L'))) OR (ri.unit='pc' AND ii.unit='pc')))) "recipeAvailable"
      FROM pos_product_variant_mappings pm JOIN pos_sources s ON s.id=pm.pos_source_id
      JOIN menu_item_variants v ON v.id=pm.menu_item_variant_id JOIN menu_items m ON m.id=v.menu_item_id
      WHERE pm.id=$1 FOR UPDATE OF pm`, [id]);
    const current = mapping.rows[0];
    if (!current) throw new AppError(404, "POS_MAPPING_NOT_FOUND", "POS mapping not found.");
    if (current.reviewStatus === "APPROVED") {
      throw new AppError(409, "POS_MAPPING_APPROVED_LOCKED", "Approved mappings are locked. Deactivate the mapping before creating a replacement revision.");
    }
    if (value.reviewStatus === "APPROVED") {
      if (current.sourceStatus !== "ACTIVE" || !current.formatVerifiedAt) {
        throw new AppError(422, "POS_SOURCE_FORMAT_REVIEW_REQUIRED", "Activate and verify the POS source format before approving a mapping.");
      }
      if (!current.targetAvailable) throw new AppError(422, "POS_MAPPING_TARGET_INACTIVE", "The target product or variant is not active and approved for this scope.");
      if (!current.recipeAvailable) throw new AppError(422, "POS_MAPPING_RECIPE_REQUIRED", "The target variant needs a valid active recipe before this mapping can be approved.");
      const duplicate = await client.query(`SELECT id FROM pos_product_variant_mappings WHERE id<>$1 AND pos_source_id=$2
        AND coalesce(branch_id,'00000000-0000-0000-0000-000000000000'::uuid)=coalesce($3::uuid,'00000000-0000-0000-0000-000000000000'::uuid)
        AND status='ACTIVE' AND (($4::text IS NOT NULL AND source_product_code IS NOT NULL AND lower(btrim(source_product_code))=lower(btrim($4)))
          OR ($4::text IS NULL AND source_product_code IS NULL AND normalized_source_product_name=$5)) LIMIT 1`,
      [id,current.posSourceId,current.branchId,current.sourceProductCode,current.normalizedSourceProductName]);
      if (duplicate.rows[0]) throw new AppError(409, "POS_MAPPING_CONFLICT", "An approved mapping already exists for this POS identity and scope.");
    }
    const operationalStatus = value.reviewStatus === "APPROVED" ? "ACTIVE" : "INACTIVE";
    const reviewed = value.reviewStatus !== "PENDING";
    const result = await client.query(`UPDATE pos_product_variant_mappings SET status=$2::record_status,review_status=$3::text,review_comment=$4::text,
      reviewed_by=CASE WHEN $5::boolean THEN $6::uuid ELSE NULL::uuid END,
      reviewed_at=CASE WHEN $5::boolean THEN now() ELSE NULL::timestamptz END,updated_at=now()
      WHERE id=$1 RETURNING id,branch_id "branchId",status,review_status "reviewStatus",
        reviewed_by "reviewedBy",reviewed_at "reviewedAt"`,
      [id,operationalStatus,value.reviewStatus,value.reviewComment?.trim()||null,reviewed,req.user!.id]);
    await writeAudit(req.user!, "REVIEW_POS_MAPPING", "POS_MAPPING", id, `${value.reviewStatus} POS mapping`, { branchId: result.rows[0].branchId, reviewComment: value.reviewComment ?? null }, client);
    await client.query("COMMIT");
    res.json({ success: true, data: {
      id, status: result.rows[0].status, reviewStatus: result.rows[0].reviewStatus,
      reviewedBy: result.rows[0].reviewedBy, reviewedAt: result.rows[0].reviewedAt,
    } });
  } catch (error) { await client.query("ROLLBACK"); databaseConflict(error); }
  finally { client.release(); }
};

export const revisePendingPosMapping: RequestHandler = async (req, res) => {
  const { id } = idParam.parse(req.params);
  const value = mappingRevisionInput.parse(req.body);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const existing = await client.query<{
      id: string; posSourceId: string; branchId: string | null; sourceProductName: string;
      sourceProductCode: string | null; menuItemId: string; menuItemVariantId: string;
      status: "ACTIVE" | "INACTIVE"; reviewStatus: "PENDING" | "APPROVED" | "REJECTED" | "AMBIGUOUS";
      reviewComment: string | null; reviewedBy: string | null; reviewedAt: string | null;
    }>(`SELECT pm.id,pm.pos_source_id "posSourceId",pm.branch_id "branchId",
        pm.source_product_name "sourceProductName",pm.source_product_code "sourceProductCode",
        v.menu_item_id "menuItemId",pm.menu_item_variant_id "menuItemVariantId",pm.status,
        pm.review_status "reviewStatus",pm.review_comment "reviewComment",
        pm.reviewed_by "reviewedBy",pm.reviewed_at "reviewedAt"
      FROM pos_product_variant_mappings pm
      JOIN pos_sources s ON s.id=pm.pos_source_id
      JOIN menu_item_variants v ON v.id=pm.menu_item_variant_id
      WHERE pm.id=$1 FOR UPDATE OF pm`, [id]);
    const current = existing.rows[0];
    if (!current) throw new AppError(404, "POS_MAPPING_NOT_FOUND", "POS mapping not found.");
    if (current.reviewStatus !== "PENDING" || current.status !== "INACTIVE") {
      throw new AppError(409, "POS_MAPPING_EDIT_LOCKED", "Only inactive Pending mappings can be edited.");
    }
    await verifyMappingTarget(value, client);
    await ensureNoOpenMappingConflict(client, {
      id, posSourceId: current.posSourceId, branchId: value.branchId,
      sourceProductName: current.sourceProductName, sourceProductCode: value.sourceProductCode,
    });
    const result = await client.query(`UPDATE pos_product_variant_mappings SET
        branch_id=$2,source_product_code=$3,menu_item_variant_id=$4,status='INACTIVE',review_status='PENDING',
        review_comment=$5,reviewed_by=NULL,reviewed_at=NULL,updated_at=now()
      WHERE id=$1
      RETURNING id,pos_source_id "posSourceId",branch_id "branchId",source_product_name "sourceProductName",
        source_product_code "sourceProductCode",menu_item_variant_id "menuItemVariantId",status,
        review_status "reviewStatus",review_comment "reviewComment",reviewed_by "reviewedBy",reviewed_at "reviewedAt"`,
    [id, value.branchId, value.sourceProductCode, value.menuItemVariantId, value.revisionReason ?? null]);
    await writeAudit(req.user!, "REVISE_POS_MAPPING", "POS_MAPPING", id, "Revised Pending POS mapping", {
      branchId: value.branchId,
      before: {
        branchId: current.branchId, sourceProductCode: current.sourceProductCode,
        menuItemId: current.menuItemId, menuItemVariantId: current.menuItemVariantId,
        reviewStatus: current.reviewStatus, reviewComment: current.reviewComment,
        reviewedBy: current.reviewedBy, reviewedAt: current.reviewedAt,
      },
      after: {
        branchId: value.branchId, sourceProductCode: value.sourceProductCode,
        menuItemId: value.menuItemId, menuItemVariantId: value.menuItemVariantId,
        reviewStatus: "PENDING", revisionReason: value.revisionReason ?? null,
      },
    }, client);
    await client.query("COMMIT");
    res.json({ success: true, data: { mapping: result.rows[0] } });
  } catch (error) { await client.query("ROLLBACK"); databaseConflict(error); }
  finally { client.release(); }
};

export const deactivateApprovedPosMapping: RequestHandler = async (req, res) => {
  const { id } = idParam.parse(req.params);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query<{ branchId: string | null; status: "ACTIVE" | "INACTIVE"; reviewStatus: string }>(
      `SELECT branch_id "branchId",status,review_status "reviewStatus"
        FROM pos_product_variant_mappings WHERE id=$1 FOR UPDATE`, [id],
    );
    const mapping = current.rows[0];
    if (!mapping) throw new AppError(404, "POS_MAPPING_NOT_FOUND", "POS mapping not found.");
    if (mapping.reviewStatus !== "APPROVED" || mapping.status !== "ACTIVE") {
      throw new AppError(409, "POS_MAPPING_DEACTIVATION_INVALID", "Only an active approved mapping can be deactivated.");
    }
    const result = await client.query(`UPDATE pos_product_variant_mappings SET status='INACTIVE',updated_at=now()
      WHERE id=$1 RETURNING id,status,review_status "reviewStatus",reviewed_by "reviewedBy",reviewed_at "reviewedAt"`, [id]);
    await writeAudit(req.user!, "DEACTIVATE_POS_MAPPING", "POS_MAPPING", id, "Deactivated approved POS mapping", {
      branchId: mapping.branchId, preservedReviewStatus: mapping.reviewStatus,
    }, client);
    await client.query("COMMIT");
    res.json({ success: true, data: { mapping: result.rows[0] } });
  } catch (error) { await client.query("ROLLBACK"); databaseConflict(error); }
  finally { client.release(); }
};

export const reactivateApprovedPosMapping: RequestHandler = async (req, res) => {
  const { id } = idParam.parse(req.params);
  const client = await pool.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
    const current = await client.query<{
      branchId: string | null; status: "ACTIVE" | "INACTIVE"; reviewStatus: string;
      reviewedBy: string | null; reviewedAt: string | null; posSourceId: string;
      sourceBranchId: string | null; sourceStatus: "ACTIVE" | "INACTIVE"; formatVerifiedAt: string | null;
      sourceProductCode: string | null; normalizedSourceProductName: string;
      targetAvailable: boolean; recipeAvailable: boolean;
    }>(`SELECT pm.branch_id "branchId",pm.status,pm.review_status "reviewStatus",
        pm.reviewed_by "reviewedBy",pm.reviewed_at "reviewedAt",pm.pos_source_id "posSourceId",
        pm.source_product_code "sourceProductCode",pm.normalized_source_product_name "normalizedSourceProductName",
        s.branch_id "sourceBranchId",s.status "sourceStatus",s.format_verified_at "formatVerifiedAt",
        (v.status='ACTIVE' AND m.status='ACTIVE' AND m.approval_status='APPROVED' AND
          ((pm.branch_id IS NULL AND m.product_scope='GLOBAL') OR
           (pm.branch_id IS NOT NULL AND (m.product_scope='GLOBAL' OR m.origin_branch_id=pm.branch_id)))) "targetAvailable",
        EXISTS(SELECT 1 FROM recipes r WHERE r.menu_item_variant_id=v.id AND r.status='ACTIVE'
          AND r.effective_from<=CURRENT_DATE AND (r.effective_to IS NULL OR r.effective_to>CURRENT_DATE)
          AND EXISTS(SELECT 1 FROM recipe_items ri WHERE ri.recipe_id=r.id)
          AND NOT EXISTS(SELECT 1 FROM recipe_items ri JOIN inventory_items ii ON ii.id=ri.inventory_item_id
            WHERE ri.recipe_id=r.id AND NOT (((ri.unit IN ('g','kg')) AND (ii.unit IN ('g','kg')))
              OR ((ri.unit IN ('ml','L')) AND (ii.unit IN ('ml','L'))) OR (ri.unit='pc' AND ii.unit='pc')))) "recipeAvailable"
      FROM pos_product_variant_mappings pm JOIN pos_sources s ON s.id=pm.pos_source_id
      JOIN menu_item_variants v ON v.id=pm.menu_item_variant_id JOIN menu_items m ON m.id=v.menu_item_id
      WHERE pm.id=$1 FOR UPDATE OF pm,s`, [id]);
    const mapping = current.rows[0];
    if (!mapping) throw new AppError(404, "POS_MAPPING_NOT_FOUND", "POS mapping not found.");
    if (mapping.reviewStatus !== "APPROVED" || mapping.status !== "INACTIVE") {
      throw new AppError(409, "POS_MAPPING_REACTIVATION_INVALID", "Only an inactive approved mapping can be reactivated.");
    }
    if (mapping.sourceStatus !== "ACTIVE" || !mapping.formatVerifiedAt || !mapping.sourceBranchId) {
      throw new AppError(422, "POS_SOURCE_FORMAT_REVIEW_REQUIRED", "The POS source must be active, branch-assigned, and format-verified before reactivating mappings.");
    }
    if (!mapping.targetAvailable) {
      throw new AppError(422, "POS_MAPPING_TARGET_INACTIVE", "The mapped product or variant is not active and approved for this scope.");
    }
    if (!mapping.recipeAvailable) {
      throw new AppError(422, "POS_MAPPING_RECIPE_REQUIRED", "The mapped variant needs a valid active recipe before reactivation.");
    }
    const conflict = await client.query(`SELECT id FROM pos_product_variant_mappings
      WHERE id<>$1 AND pos_source_id=$2
        AND coalesce(branch_id,'00000000-0000-0000-0000-000000000000'::uuid)=coalesce($3::uuid,'00000000-0000-0000-0000-000000000000'::uuid)
        AND status='ACTIVE' AND review_status='APPROVED'
        AND (($4::text IS NOT NULL AND source_product_code IS NOT NULL AND lower(btrim(source_product_code))=lower(btrim($4)))
          OR ($4::text IS NULL AND source_product_code IS NULL AND normalized_source_product_name=$5)) LIMIT 1`,
    [id,mapping.posSourceId,mapping.branchId,mapping.sourceProductCode,mapping.normalizedSourceProductName]);
    if (conflict.rows[0]) {
      throw new AppError(409, "POS_MAPPING_CONFLICT", "An active approved mapping already uses this POS identity and scope.");
    }
    const result = await client.query(`UPDATE pos_product_variant_mappings SET status='ACTIVE',updated_at=now()
      WHERE id=$1 RETURNING id,status,review_status "reviewStatus",reviewed_by "reviewedBy",reviewed_at "reviewedAt"`, [id]);
    await writeAudit(req.user!, "REACTIVATE_POS_MAPPING", "POS_MAPPING", id, "Reactivated approved POS mapping", {
      branchId: mapping.branchId, posSourceId: mapping.posSourceId, preservedReviewStatus: mapping.reviewStatus,
      preservedReviewedBy: mapping.reviewedBy, preservedReviewedAt: mapping.reviewedAt,
    }, client);
    await client.query("COMMIT");
    res.json({ success: true, data: { mapping: result.rows[0] } });
  } catch (error) { await client.query("ROLLBACK"); databaseConflict(error); }
  finally { client.release(); }
};
