import type { RequestHandler } from "express";
import type { PoolClient } from "pg";
import { z } from "zod";
import { pool } from "../config/database.js";
import { writeAudit } from "../services/audit.service.js";
import { AppError } from "../utils/appError.js";

const supportedFormat = z.enum(["CANONICAL_CSV", "SUMMARY_ITEMS_SOLD_LEGACY_XLS", "TRANSACTION_SUMMARY_XLSX"]);
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
const idParam = z.object({ id: z.string().uuid() });
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
  const result = await pool.query(`SELECT s.id,s.branch_id "branchId",b.name "branchName",s.source_code "sourceCode",s.display_name "displayName",s.supported_format "supportedFormat",s.status,
      s.format_verified_by "formatVerifiedBy",s.format_verified_at "formatVerifiedAt",
      concat(u.first_name,' ',u.last_name) "formatVerifiedByName"
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
    await client.query("BEGIN");
    const current = await client.query<{ supportedFormat: z.infer<typeof supportedFormat>; status: "ACTIVE" | "INACTIVE"; branchId: string | null }>(
      `SELECT supported_format "supportedFormat",status,branch_id "branchId" FROM pos_sources WHERE id=$1 FOR UPDATE`, [id],
    );
    if (!current.rows[0]) throw new AppError(404, "POS_SOURCE_NOT_FOUND", "POS source not found.");
    const nextFormat = value.supportedFormat ?? current.rows[0].supportedFormat;
    const nextStatus = value.status ?? current.rows[0].status;
    const nextBranchId = value.branchId ?? current.rows[0].branchId;
    if (nextStatus === "ACTIVE" && !nextBranchId) throw new AppError(422, "POS_SOURCE_BRANCH_REQUIRED", "Choose the branch that uses this POS source before activation.");
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
    const sources = await client.query<{ id: string; sourceCode: string }>(
      `SELECT id,source_code "sourceCode" FROM pos_sources WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE`,
      [[value.sourcePosSourceId, value.targetPosSourceId]],
    );
    const source = sources.rows.find((item) => item.id === value.sourcePosSourceId);
    const target = sources.rows.find((item) => item.id === value.targetPosSourceId);
    if (!source || !target) throw new AppError(404, "POS_SOURCE_NOT_FOUND", "The source or destination POS source was not found.");

    const eligible = await client.query<{ count: number }>(
      `SELECT count(*)::int count FROM pos_product_variant_mappings
        WHERE pos_source_id=$1 AND branch_id IS NULL AND status='ACTIVE' AND review_status='APPROVED'`,
      [source.id],
    );
    const copied = await client.query<{ id: string }>(
      `INSERT INTO pos_product_variant_mappings
        (pos_source_id,branch_id,source_product_name,source_product_code,menu_item_variant_id,
         status,review_status,review_comment,reviewed_by,reviewed_at)
       SELECT $2,NULL,original.source_product_name,original.source_product_code,original.menu_item_variant_id,
              'INACTIVE','PENDING',$3,NULL,NULL
         FROM pos_product_variant_mappings original
        WHERE original.pos_source_id=$1 AND original.branch_id IS NULL
          AND original.status='ACTIVE' AND original.review_status='APPROVED'
          AND NOT EXISTS (
            SELECT 1 FROM pos_product_variant_mappings existing
             WHERE existing.pos_source_id=$2 AND existing.branch_id IS NULL
               AND ((original.source_product_code IS NOT NULL AND existing.source_product_code IS NOT NULL
                     AND lower(btrim(existing.source_product_code))=lower(btrim(original.source_product_code)))
                 OR (original.source_product_code IS NULL AND existing.source_product_code IS NULL
                     AND existing.normalized_source_product_name=original.normalized_source_product_name))
          )
       RETURNING id`,
      [source.id, target.id, `Copied from ${source.sourceCode} — pending review`],
    );
    const eligibleCount = Number(eligible.rows[0]?.count ?? 0);
    const result = { copied: copied.rows.length, skipped: eligibleCount - copied.rows.length, eligible: eligibleCount };
    await writeAudit(req.user!, "COPY_POS_MAPPINGS", "POS_SOURCE", target.id,
      `Copied reviewed global mappings from ${source.sourceCode} to ${target.sourceCode}`,
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
        (v.status='ACTIVE' AND m.status='ACTIVE' AND m.approval_status='APPROVED'
          AND (pm.branch_id IS NULL OR m.product_scope='GLOBAL' OR m.origin_branch_id=pm.branch_id)) "targetAvailable",
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
