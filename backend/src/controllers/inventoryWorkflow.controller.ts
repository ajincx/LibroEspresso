import type { Request, RequestHandler } from "express";
import type { PoolClient } from "pg";
import { pool } from "../config/database.js";
import { env } from "../config/env.js";
import { calculateExpectedInventory, computeVariance } from "../services/inventoryCalculation.service.js";
import { calculateFinancialSummary, roundMoney } from "../services/financialMetrics.service.js";
import { classifyUnmatchedPosIdentity, parsePosCsv, POS_SOURCE_FORMATS, PosCsvError, summarizePosRows, type MatchedPosRow, type PosMenuCandidate } from "../services/posCsvImport.service.js";
import { parsePosExcel, TRANSACTION_SUMMARY_CAPSTONE_PRICING_NOTICE } from "../services/posExcelImport.service.js";
import { loadPosMappings, loadPosSource, posResolutionFingerprint, resolvePosMapping } from "../services/posProductVariantMapping.service.js";
import { getEffectiveBranchId } from "../services/branchScope.js";
import { writeAudit } from "../services/audit.service.js";
import { verifyDestructiveAction, writeDestructiveActionAudit } from "../services/destructiveAction.service.js";
import { createIngredientUsageSnapshots } from "../services/recipeVersion.service.js";
import { assessPosImportInventoryDates } from "../services/posInventoryDate.service.js";
import { calculatePosImportSimulation, type PosSimulationRecipeItem } from "../services/posImportSimulation.service.js";
import { manilaBusinessDate } from "../services/businessTime.service.js";
import { areUnitsCompatible } from "../services/unitConversion.service.js";
import { normalizePhysicalCountQuantity } from "../services/physicalCountUnit.service.js";
import { requiresVarianceInvestigation } from "../services/varianceMateriality.service.js";
import { AppError } from "../utils/appError.js";
import { idParams } from "../validators/masterData.js";
import { destructiveActionInput } from "../validators/destructiveAction.js";
import { paginatedRows, paginationQuery } from "../validators/pagination.js";
import {
  inventoryCountInput,
  inventoryCountTestClassificationInput,
  inventoryMovementInput,
  notificationIdParams,
  posAnalyticsFilters,
  posImportHistoryFilters,
  posImportInput,
  posImportApprovalReviewInput,
  posCleanupAuthorizationInput,
  posPreviewInput,
  shrinkageFilters,
  shrinkageInvestigationInput,
  varianceFilters,
} from "../validators/inventoryWorkflow.js";

const GULOD_UAT_PLACEHOLDER_COUNTS = new Map<string, { countNo: string; itemCount: number; balanceCount: number; shrinkageReportNo: string }>([
  ["87bcecb9-d0f5-4af6-8922-8c0fd9ee6243", { countNo: "IC-2026-00006", itemCount: 77, balanceCount: 0, shrinkageReportNo: "SR-2026-00005" }],
  ["9c084a0a-2283-4d4a-b333-b985a3126ff3", { countNo: "IC-2026-00009", itemCount: 78, balanceCount: 78, shrinkageReportNo: "SR-2026-00006" }],
]);
const GULOD_MAIN_BRANCH_ID = "b50d405c-3c4a-4579-a3e8-7644d8324df6";

function assertUatCountClassificationAvailable() {
  if (env.DATA_LIFECYCLE_ENV === "PRODUCTION")
    throw new AppError(403, "INVENTORY_COUNT_TEST_CLASSIFICATION_DISABLED", "UAT/Test count classification is disabled in production");
}

type PosLifecycleEnvironment = "DEVELOPMENT" | "UAT" | "PRODUCTION";

function posCleanupAccess(record: {
  createdEnvironment: PosLifecycleEnvironment;
  cleanupAuthorizedAt: string | null;
}, role: string) {
  const policy = env.DATA_LIFECYCLE_ENV;
  const sameEnvironment = record.createdEnvironment === policy;
  return {
    cleanupPolicy: policy,
    canAuthorizeCleanup: role === "OWNER" && policy === "UAT" && sameEnvironment && !record.cleanupAuthorizedAt,
    canCleanup: role === "OWNER" && sameEnvironment && (
      policy === "DEVELOPMENT" || (policy === "UAT" && Boolean(record.cleanupAuthorizedAt))
    ),
  };
}

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

export function assertInventoryCountDateNotFuture(
  countDate: string,
  currentBusinessDate = manilaBusinessDate(),
) {
  if (countDate > currentBusinessDate) {
    throw new AppError(
      422,
      "INVENTORY_COUNT_FUTURE_DATE",
      "Physical counts cannot be recorded for a future date.",
    );
  }
}

type PosPreviewProductRow = PosMenuCandidate;
type PosPreviewVariantRow = {
  id: string;
  menuItemId: string;
  name: string;
  status: "ACTIVE" | "INACTIVE";
  recipeVersionId: string | null;
  recipeVersion: number | null;
  sellingPrice: number;
  recipeUnits: Array<{ recipeUnit: string; inventoryUnit: string }>;
};

type PosImportSource =
  | { sourceFilename: string; csvText: string; fileBuffer?: never; posSourceId: string }
  | { sourceFilename: string; fileBuffer: Buffer; csvText?: never; posSourceId: string };

function decodedPosFilename(value: string | string[] | undefined) {
  if (typeof value !== "string") throw new AppError(422, "POS_FILENAME_REQUIRED", "The POS filename is required.");
  let filename: string;
  try { filename = decodeURIComponent(value).trim(); }
  catch { throw new AppError(422, "INVALID_POS_FILENAME", "The POS filename is invalid."); }
  if (!filename || filename.length > 255 || !/\.(xls|xlsx)$/i.test(filename)) {
    throw new AppError(422, "INVALID_POS_FILENAME", "Select a valid XLS or XLSX POS file.");
  }
  return filename;
}

function posRequestSource(req: Request, confirmation: false): PosImportSource;
function posRequestSource(req: Request, confirmation: true): PosImportSource & { expectedContentHash: string; expectedResolutionFingerprint?: string };
function posRequestSource(req: Request, confirmation: boolean) {
  if (Buffer.isBuffer(req.body)) {
    const sourceFilename = decodedPosFilename(req.headers["x-pos-filename"]);
    const expectedContentHash = req.headers["x-pos-content-hash"];
    const posSourceId = req.headers["x-pos-source-id"];
    const expectedResolutionFingerprint = req.headers["x-pos-resolution-fingerprint"];
    if (typeof posSourceId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(posSourceId)) throw new AppError(422, "POS_SOURCE_INVALID", "Select a valid POS source.");
    if (expectedResolutionFingerprint !== undefined && (typeof expectedResolutionFingerprint !== "string" || !/^[a-f0-9]{64}$/i.test(expectedResolutionFingerprint))) throw new AppError(422, "POS_RESOLUTION_INVALID", "Preview the POS file again before importing.");
    if (confirmation && (typeof expectedContentHash !== "string" || !/^[a-f0-9]{64}$/i.test(expectedContentHash))) {
      throw new AppError(422, "POS_PREVIEW_REQUIRED", "Preview the POS file again before importing.");
    }
    return { sourceFilename, fileBuffer: req.body, posSourceId, ...(confirmation ? { expectedContentHash, expectedResolutionFingerprint } : {}) };
  }
  return confirmation ? posImportInput.parse(req.body) : posPreviewInput.parse(req.body);
}

async function buildPosPreview(
  branchId: string,
  source: PosImportSource,
  client: Pick<PoolClient, "query"> = pool,
  includeSimulation = true,
) {
  const previewStartedAt = performance.now();
  let parsed: ReturnType<typeof parsePosCsv>;
  const parseStartedAt = performance.now();
  try {
    parsed = source.fileBuffer ? parsePosExcel(source.sourceFilename, source.fileBuffer) : parsePosCsv(source.csvText);
  } catch (error) {
    if (error instanceof PosCsvError) throw new AppError(422, error.code, error.message);
    throw error;
  }
  const parseMs = performance.now() - parseStartedAt;
  const lookupStartedAt = performance.now();
  const [branch, products] = await Promise.all([
    client.query<{ branchName: string }>(`SELECT name "branchName" FROM branches WHERE id=$1 AND status='ACTIVE'`, [branchId]),
    client.query<PosPreviewProductRow>(
      `SELECT mi.id,mi.code,mi.name,mi.selling_price::float8 "sellingPrice"
         FROM menu_items mi
         JOIN menu_item_branches mib ON mib.menu_item_id=mi.id AND mib.branch_id=$1
        WHERE mi.status='ACTIVE' AND mi.approval_status='APPROVED'
          AND mib.availability_status='APPROVED' AND mib.is_active=true
        ORDER BY mi.name`,
      [branchId],
    ),
  ]);
  const productLookupMs = performance.now() - lookupStartedAt;
  const matchingStartedAt = performance.now();
  const variantResult = await client.query<PosPreviewVariantRow>(
    `SELECT v.id,v.menu_item_id "menuItemId",v.name,v.status,v.selling_price::float8 "sellingPrice",r.id "recipeVersionId",r.version "recipeVersion",
       COALESCE(json_agg(json_build_object('recipeUnit',ri.unit,'inventoryUnit',ii.unit))
         FILTER (WHERE ri.id IS NOT NULL),'[]') "recipeUnits"
     FROM menu_item_variants v
     LEFT JOIN LATERAL (SELECT candidate.* FROM recipes candidate WHERE candidate.menu_item_variant_id=v.id
       AND candidate.status='ACTIVE' AND candidate.effective_from<=$2::date
       AND (candidate.effective_to IS NULL OR candidate.effective_to>$2::date)
       ORDER BY candidate.effective_from DESC LIMIT 1) r ON true
     LEFT JOIN recipe_items ri ON ri.recipe_id=r.id
     LEFT JOIN inventory_items ii ON ii.id=ri.inventory_item_id
     WHERE v.menu_item_id=ANY($1::uuid[])
     GROUP BY v.id,r.id,r.version`,
    [products.rows.map((product)=>product.id), parsed.businessDate],
  );
  const variantById = new Map(variantResult.rows.map((variant)=>[variant.id,variant]));
  const sourceId = source.posSourceId;
  const selectedSource = await loadPosSource(client, sourceId, parsed.sourceFormat, branchId);
  const mappings = await loadPosMappings(client, selectedSource.id, branchId, parsed.businessDate);
  const preliminaryRows: MatchedPosRow[] = parsed.rows.map((row) => {
        if (classifyUnmatchedPosIdentity(row.sourceProduct) === "OPERATIONAL_ITEM") return {
          ...row,
          menuItemId: null,
          matchedMenuProduct: null,
          menuItemVariantId: null,
          matchedVariant: null,
          mappingId: null,
          mappingStatus: "UNMATCHED",
          mappingScope: null,
          itemClassification: "OPERATIONAL_ITEM",
          status: "VALID",
          issues: ["Operational POS line excluded from sellable-item mapping and COGS validation."],
        };
        const resolution = resolvePosMapping(row, branchId, mappings);
        if (!resolution || resolution.status !== "APPROVED") return {
          ...row, menuItemId: null, matchedMenuProduct: null, menuItemVariantId: null, matchedVariant: null,
          mappingId: null, mappingStatus: resolution?.status ?? "UNMATCHED", mappingScope: null,
          itemClassification: "UNKNOWN_REVIEW",
           status: "INVALID", issues: [...row.issues, resolution.issue ?? "No approved POS product/variant mapping exists for this source and branch."],
        };
        return {
          ...row, menuItemId: resolution.menuItemId, matchedMenuProduct: resolution.menuItemName,
          menuItemVariantId: resolution.menuItemVariantId, matchedVariant: resolution.variantName,
          mappingId: resolution.mappingId, mappingVersion: resolution.version,
          mappingStatus: resolution.status, mappingScope: resolution.scope,
          itemClassification: "SELLABLE_ITEM",
        };
      });
  const rows = preliminaryRows.map((row): MatchedPosRow => {
    if (row.itemClassification === "OPERATIONAL_ITEM") return row;
    if (!row.menuItemId || row.status === "INVALID") return row;
    const variant = row.menuItemVariantId ? variantById.get(row.menuItemVariantId) : null;
    if (variant?.menuItemId===row.menuItemId && variant.status==="ACTIVE" && variant.recipeVersionId
      && variant.recipeUnits.length>0 && variant.recipeUnits.every((item)=>areUnitsCompatible(item.recipeUnit,item.inventoryUnit))) {
      const usesMenuPrice = parsed.sourceFormat === POS_SOURCE_FORMATS.TRANSACTION_SUMMARY && row.unitPrice === null;
      return {
        ...row,
        unitPrice: usesMenuPrice ? variant.sellingPrice : row.unitPrice,
        calculatedSalesAmount: usesMenuPrice && row.quantitySold !== null ? row.quantitySold * variant.sellingPrice : row.lineAmount ?? null,
        pricingSource: usesMenuPrice ? "MENU_VARIANT_CAPSTONE_FALLBACK" : "SUPPLIER_ITEM_PRICE",
        recipeVersionId:variant.recipeVersionId,
        recipeVersion:variant.recipeVersion,
      };
    }
    return { ...row, status: "INVALID", issues: [...row.issues, "Matched variant does not have a valid active recipe with matching ingredient units."] };
  });
  const matchAndValidationMs = performance.now() - matchingStartedAt;
  const duplicateStartedAt = performance.now();
  const existing = parsed.businessDate
    ? await client.query<{ id: string }>(
        `SELECT id FROM pos_imports
          WHERE branch_id=$1 AND business_date=$2 AND content_hash=$3 LIMIT 1`,
        [branchId, parsed.businessDate, parsed.contentHash],
      )
    : { rows: [] as { id: string }[] };
  const duplicateCheckMs = performance.now() - duplicateStartedAt;
  const summary = summarizePosRows(rows, existing.rows.length > 0);
  const importBlockedReason = parsed.importBlockedReason ?? null;
  if (importBlockedReason) {
    summary.canImport = false;
    summary.quality = "REJECTED";
  }
  const simulationLines = rows.flatMap((row) => row.itemClassification === "SELLABLE_ITEM" && row.status !== "INVALID" && row.recipeVersionId
    && typeof row.quantitySold === "number" && typeof row.unitPrice === "number"
    ? [{ quantitySold: row.quantitySold, unitPrice: row.unitPrice, recipeVersionId: row.recipeVersionId }]
    : []);
  const recipeVersionIds = [...new Set(simulationLines.map((line) => line.recipeVersionId))];
  const simulationRecipeItems = includeSimulation && recipeVersionIds.length
    ? await client.query<PosSimulationRecipeItem>(
      `SELECT r.id "recipeVersionId",ri.inventory_item_id "inventoryItemId",ii.sku,ii.name,
              ri.quantity::float8 "recipeQuantity",ri.unit "recipeUnit",ii.unit "inventoryUnit",
              COALESCE(bis.current_unit_cost,ii.unit_cost)::float8 "unitCost",r.yield_quantity::float8 "yieldQuantity"
         FROM recipes r JOIN recipe_items ri ON ri.recipe_id=r.id
         JOIN inventory_items ii ON ii.id=ri.inventory_item_id
         LEFT JOIN branch_inventory_settings bis ON bis.branch_id=$2 AND bis.inventory_item_id=ii.id
        WHERE r.id=ANY($1::uuid[]) ORDER BY r.id,ii.name`,
      [recipeVersionIds, branchId],
    )
    : { rows: [] as PosSimulationRecipeItem[] };
  const simulation = calculatePosImportSimulation(simulationLines, simulationRecipeItems.rows);
  const fallbackPricingRows = rows.filter((row) => row.pricingSource === "MENU_VARIANT_CAPSTONE_FALLBACK").length;
  const pricing = {
    method: fallbackPricingRows > 0 ? "MENU_VARIANT_CAPSTONE_FALLBACK" as const : "SUPPLIER_ITEM_PRICE" as const,
    notice: fallbackPricingRows > 0 ? TRANSACTION_SUMMARY_CAPSTONE_PRICING_NOTICE : null,
    fallbackRows: fallbackPricingRows,
  };
  return {
    sourceFilename: source.sourceFilename,
    branchId,
    branchName: branch.rows[0]?.branchName ?? "Assigned Branch",
    businessDate: parsed.businessDate,
    contentHash: parsed.contentHash,
    resolutionFingerprint: posResolutionFingerprint(sourceId, rows),
    posSourceId: selectedSource.id,
    posSourceName: selectedSource.displayName,
    fingerprintIndicator: parsed.contentHash.slice(0, 12),
    sourceFormat: parsed.sourceFormat,
    formatLabel: parsed.formatLabel,
    importBlockedReason,
    rows,
    summary,
    pricing,
    simulation: { ...simulation, complete: summary.canImport, validResolvedRows: simulationLines.length },
    benchmark: { parseMs, productLookupMs, matchAndValidationMs, duplicateCheckMs, previewTotalMs: performance.now() - previewStartedAt },
  };
}

export const previewPosSales: RequestHandler = async (req, res) => {
  const input = posRequestSource(req, false);
  const branchId = requiredBranchId(req.user!);
  try {
    const preview = await buildPosPreview(branchId, input);
    res.json({ success: true, data: { preview } });
  } catch (error) {
    const code = error instanceof AppError ? error.code : "POS_PREVIEW_FAILED";
    await writeAudit(req.user!, "VALIDATE_POS_IMPORT_FAILED", "USER", req.user!.id, "POS import preview validation failed", { branchId, sourceFilename: input.sourceFilename, errorCode: code }).catch(() => undefined);
    throw error;
  }
};

const approvalSelect = `SELECT a.id,a.branch_id "branchId",b.name "branchName",a.pos_source_id "posSourceId",
  a.source_filename "sourceFilename",a.business_date::text "businessDate",a.content_hash "contentHash",
  a.resolution_fingerprint "resolutionFingerprint",a.source_sales_total::float8 "sourceSalesTotal",
  a.source_quantity::float8 "sourceQuantity",a.status,a.requested_by "requestedBy",
  concat(requester.first_name,' ',requester.last_name) "requestedByName",a.requested_at "requestedAt",
  a.reviewed_by "reviewedBy",concat(reviewer.first_name,' ',reviewer.last_name) "reviewedByName",
  a.approval_notes "approvalNotes",a.reviewed_at "reviewedAt",a.consumed_at "consumedAt",a.pos_import_id "posImportId"
  FROM pos_import_approvals a JOIN branches b ON b.id=a.branch_id JOIN users requester ON requester.id=a.requested_by
  LEFT JOIN users reviewer ON reviewer.id=a.reviewed_by`;

export const requestPosImportApproval: RequestHandler = async (req, res) => {
  const input = posRequestSource(req, false);
  const branchId = requiredBranchId(req.user!);
  const preview = await buildPosPreview(branchId, input);
  if (!preview.summary.canImport || !preview.businessDate) throw new AppError(422, "POS_IMPORT_INVALID", "Resolve every preview issue before requesting approval.");
  const sourceRows = preview.rows.filter((row) => row.itemClassification === "SELLABLE_ITEM" && row.status !== "INVALID" && row.quantitySold !== null && row.unitPrice !== null);
  const sourceSalesTotal = sourceRows.reduce((total,row)=>total+(typeof row.lineAmount==="number"?row.lineAmount:Number(row.quantitySold)*Number(row.unitPrice)),0);
  const sourceQuantity = sourceRows.reduce((total,row)=>total+Number(row.quantitySold),0);
  const client=await pool.connect();
  try {
    await client.query("BEGIN");
    const inserted = await client.query<{id:string}>(`INSERT INTO pos_import_approvals
      (branch_id,pos_source_id,source_filename,business_date,content_hash,resolution_fingerprint,source_sales_total,source_quantity,requested_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [branchId,preview.posSourceId,input.sourceFilename,preview.businessDate,preview.contentHash,preview.resolutionFingerprint,sourceSalesTotal,sourceQuantity,req.user!.id]);
    const approvalId=inserted.rows[0]!.id;
    await client.query(`INSERT INTO notifications (recipient_user_id,branch_id,type,title,message,entity_type,entity_id)
      SELECT owner_user.id,$1,'POS_IMPORT_APPROVAL_REQUESTED','POS Import Approval Required',
             concat(requester.first_name,' ',requester.last_name,' requested approval for ',$2::text,' (',$3::text,') at ',$4::text,'.'),
             'POS_IMPORT_APPROVAL',$5
      FROM users owner_user JOIN users requester ON requester.id=$6
      WHERE owner_user.role='OWNER' AND owner_user.status='ACTIVE'`,[
      branchId,
      input.sourceFilename,
      preview.businessDate,
      preview.branchName,
      approvalId,
      req.user!.id,
    ]);
    await writeAudit(req.user!,"REQUEST_POS_IMPORT_APPROVAL","POS_IMPORT_APPROVAL",approvalId,"Requested POS import approval",{branchId,businessDate:preview.businessDate,fingerprintIndicator:preview.fingerprintIndicator},client);
    const result=await client.query(`${approvalSelect} WHERE a.id=$1`,[approvalId]);
    await client.query("COMMIT");
    res.status(201).json({success:true,data:{approval:result.rows[0]}});
  } catch(error) {
    await client.query("ROLLBACK");
    if((error as {code?:string}).code==="23505") throw new AppError(409,"POS_APPROVAL_EXISTS","A pending or approved request already exists for this preview.");
    throw error;
  } finally {
    client.release();
  }
};

export const listPosImportApprovals: RequestHandler = async (req,res) => {
  const status=typeof req.query.status==="string"?req.query.status:null;
  if(status && !["PENDING","APPROVED","REJECTED","CONSUMED"].includes(status)) throw new AppError(422,"POS_APPROVAL_STATUS_INVALID","Select a valid approval status.");
  const branchId=req.user!.role==="OWNER"?null:requiredBranchId(req.user!);
  const result=await pool.query(`${approvalSelect} WHERE ($1::uuid IS NULL OR a.branch_id=$1) AND ($2::text IS NULL OR a.status=$2) ORDER BY a.requested_at DESC`,[branchId,status]);
  res.json({success:true,data:{approvals:result.rows}});
};

export const reviewPosImportApproval: RequestHandler = async (req,res) => {
  const id=idParams.parse(req.params).id;
  const value=posImportApprovalReviewInput.parse(req.body);
  const client=await pool.connect();
  try {
    await client.query("BEGIN");
    const result=await client.query<{id:string;requestedBy:string;branchId:string;sourceFilename:string}>(`UPDATE pos_import_approvals SET status=$2,reviewed_by=$3,approval_notes=$4,reviewed_at=now(),updated_at=now()
      WHERE id=$1 AND status='PENDING' RETURNING id,requested_by "requestedBy",branch_id "branchId",source_filename "sourceFilename"`,[id,value.status,req.user!.id,value.approvalNotes]);
    const reviewed=result.rows[0];
    if(!reviewed) throw new AppError(409,"POS_APPROVAL_NOT_PENDING","Only a pending import request can be reviewed.");
    await client.query(`INSERT INTO notifications (recipient_user_id,branch_id,type,title,message,entity_type,entity_id)
      VALUES($1,$2,'POS_IMPORT_APPROVAL_REVIEWED',$3,$4,'POS_IMPORT_APPROVAL',$5)`,[
      reviewed.requestedBy,
      reviewed.branchId,
      value.status==="APPROVED"?"POS Import Approved":"POS Import Rejected",
      `${reviewed.sourceFilename} was ${value.status.toLowerCase()} by the Owner. ${value.status==="APPROVED"?"Return to POS Sales and confirm the import.":"Review the Owner notes before requesting approval again."}`,
      id,
    ]);
    await writeAudit(req.user!,"REVIEW_POS_IMPORT_APPROVAL","POS_IMPORT_APPROVAL",id,`${value.status} POS import request`,{approvalNotes:value.approvalNotes},client);
    const approval=await client.query(`${approvalSelect} WHERE a.id=$1`,[id]);
    await client.query("COMMIT");
    res.json({success:true,data:{approval:approval.rows[0]}});
  } catch(error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export const importPosSales: RequestHandler = async (req, res) => {
  const importStartedAt = performance.now();
  const input = posRequestSource(req, true);
  const branchId = requiredBranchId(req.user!);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const preview = await buildPosPreview(branchId, input, client);
    if (preview.contentHash !== input.expectedContentHash) throw new AppError(409, "POS_PREVIEW_CHANGED", "The selected POS file changed after preview. Preview it again before importing.");
    if (preview.summary.duplicate) throw new AppError(409, "POS_IMPORT_DUPLICATE", "This POS file appears to have already been imported for this branch.");
    if (preview.importBlockedReason) throw new AppError(422, "POS_FORMAT_IMPORT_BLOCKED", preview.importBlockedReason);
    if (!preview.summary.canImport || !preview.businessDate) throw new AppError(422, "POS_IMPORT_INVALID", "POS import was not completed because the preview contains invalid or unmatched rows.");
    if (!input.expectedResolutionFingerprint || preview.resolutionFingerprint !== input.expectedResolutionFingerprint) throw new AppError(409, "POS_MAPPING_CHANGED", "POS source or product/variant mapping changed after preview. Preview the file again.");
    const importRows = preview.rows.filter((row): row is MatchedPosRow & { menuItemId: string; quantitySold: number; unitPrice: number; businessDate: string } => Boolean(row.menuItemId) && row.quantitySold !== null && row.unitPrice !== null && row.businessDate !== null && row.status !== "INVALID");
    const sourceSalesTotal=importRows.reduce((total,row)=>total+(typeof row.lineAmount==="number"?row.lineAmount:Number(row.quantitySold)*Number(row.unitPrice)),0);
    const sourceQuantity=importRows.reduce((total,row)=>total+Number(row.quantitySold),0);
    const imported = await client.query<{ id: string }>(
      `INSERT INTO pos_imports (branch_id,business_date,source_filename,imported_by,content_hash,total_source_rows,valid_rows,warning_rows,invalid_rows,unmatched_rows,import_status,completed_at,pos_source_id,created_environment)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,0,0,$9,now(),$10,$11) RETURNING id`,
      [branchId, preview.businessDate, input.sourceFilename, req.user!.id, preview.contentHash, preview.summary.totalSourceRows, preview.summary.validRows, preview.summary.warningRows, preview.summary.quality,preview.posSourceId,env.DATA_LIFECYCLE_ENV],
    );
    const importId = imported.rows[0]!.id;
    const salesInsertStartedAt = performance.now();
    await client.query(
      `INSERT INTO pos_sale_items (pos_import_id,branch_id,pos_source_id,business_date,menu_item_id,quantity_sold,unit_price_snapshot,source_product,source_transaction_id,source_line_id,transaction_timestamp,menu_item_variant_id)
       SELECT $1,$2,$3,$4,source.menu_item_id,source.quantity_sold,source.unit_price,source.source_product,source.transaction_id,source.line_id,source.transaction_timestamp,source.variant_id
       FROM unnest($5::uuid[],$6::numeric[],$7::numeric[],$8::text[],$9::text[],$10::text[],$11::timestamptz[],$12::uuid[])
         AS source(menu_item_id,quantity_sold,unit_price,source_product,transaction_id,line_id,transaction_timestamp,variant_id)`,
      [importId,branchId,preview.posSourceId,preview.businessDate,importRows.map((item)=>item.menuItemId),importRows.map((item)=>item.quantitySold),importRows.map((item)=>item.unitPrice),importRows.map((item)=>item.sourceProduct),importRows.map((item)=>item.transactionId),importRows.map((item)=>item.sourceLineId),importRows.map((item)=>item.transactionTimestamp),importRows.map((item)=>item.menuItemVariantId ?? null)],
    );
    const salesInsertMs = performance.now() - salesInsertStartedAt;
    const usageStartedAt = performance.now();
    await createIngredientUsageSnapshots(client,importId);
    const ingredientUsageMs = performance.now() - usageStartedAt;
    const inventoryDateAssessment = await assessPosImportInventoryDates(client, importId);
    const consumption = await client.query(
      `SELECT ii.id "inventoryItemId",ii.sku,ii.name,usage.unit,
              sum(usage.quantity_consumed)::float8 "expectedConsumption",
              sum(usage.quantity_consumed*usage.unit_cost_snapshot)::float8 "estimatedCost"
         FROM pos_sale_ingredient_usage usage
         JOIN pos_sale_items psi ON psi.id=usage.pos_sale_item_id
         JOIN inventory_items ii ON ii.id=usage.inventory_item_id
        WHERE psi.pos_import_id=$1 GROUP BY ii.id,usage.unit ORDER BY ii.name`,
      [importId],
    );
    const importMeta = await client.query<{
      branchName: string;
      managerName: string;
      totalSales: number;
      unitsSold: number;
    }>(
      `SELECT b.name "branchName",
              concat(u.first_name, ' ', u.last_name) "managerName",
              coalesce(sum(psi.quantity_sold * coalesce(psi.unit_price_snapshot, mi.selling_price)), 0)::float8 "totalSales",
              coalesce(sum(psi.quantity_sold), 0)::float8 "unitsSold"
         FROM pos_imports pi
         JOIN branches b ON b.id = pi.branch_id
         JOIN users u ON u.id = pi.imported_by
         JOIN pos_sale_items psi ON psi.pos_import_id = pi.id
         JOIN menu_items mi ON mi.id = psi.menu_item_id
        WHERE pi.id = $1
        GROUP BY b.name, u.first_name, u.last_name`,
      [importId],
    );
    const meta = importMeta.rows[0];
    const actualCogs=consumption.rows.reduce((total:number,item:{estimatedCost:number})=>total+Number(item.estimatedCost),0);
    const expectedByIngredient=new Map(preview.simulation.ingredientConsumption.map((item)=>[`${item.inventoryItemId}:${item.unit}`,item]));
    const actualByIngredient=new Map(consumption.rows.map((item:{inventoryItemId:string;unit:string;expectedConsumption:number})=>[`${item.inventoryItemId}:${item.unit}`,item]));
    const recipeConsumptionMatches=expectedByIngredient.size===actualByIngredient.size && [...expectedByIngredient].every(([key,item])=>Math.abs(item.expectedConsumption-Number(actualByIngredient.get(key)?.expectedConsumption??NaN))<0.000001);
    const salesTotalMatches=Math.abs(sourceSalesTotal-Number(meta?.totalSales??0))<0.01;
    const quantityMatches=Math.abs(sourceQuantity-Number(meta?.unitsSold??0))<0.000001;
    const cogsMatches=Math.abs(preview.simulation.estimatedCogs-actualCogs)<0.01;
    const branchCheck=await client.query<{branchIsolated:boolean}>(`SELECT bool_and(branch_id=$2)::boolean "branchIsolated" FROM pos_sale_items WHERE pos_import_id=$1`,[importId,branchId]);
    const branchIsolated=branchCheck.rows[0]?.branchIsolated===true;
    if(!salesTotalMatches||!quantityMatches||!recipeConsumptionMatches||!cogsMatches||!branchIsolated) throw new AppError(409,"POS_RECONCILIATION_FAILED","The imported rows did not reconcile with the validated POS preview. No sales data was committed.");
    const reconciliationResult=await client.query<{id:string;generatedAt:string}>(`INSERT INTO pos_import_reconciliations
      (pos_import_id,approval_id,branch_id,pos_sales_total,imported_sales_total,pos_quantity,imported_quantity,
       expected_consumption_cost,generated_cogs,sales_total_matches,quantity_matches,recipe_consumption_matches,cogs_matches,branch_isolated)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,true,true,true,true,true) RETURNING id,generated_at "generatedAt"`,
      [importId,null,branchId,sourceSalesTotal,meta?.totalSales??0,sourceQuantity,meta?.unitsSold??0,preview.simulation.estimatedCogs,actualCogs]);
    const reconciliation={id:reconciliationResult.rows[0]!.id,generatedAt:reconciliationResult.rows[0]!.generatedAt,
      posSalesTotal:sourceSalesTotal,importedSalesTotal:Number(meta?.totalSales??0),posQuantity:sourceQuantity,importedQuantity:Number(meta?.unitsSold??0),
      expectedCogs:preview.simulation.estimatedCogs,generatedCogs:actualCogs,salesTotalMatches,quantityMatches,recipeConsumptionMatches,cogsMatches,branchIsolated};
    if (meta) {
      const formattedSales = new Intl.NumberFormat("en-PH", {
        style: "currency",
        currency: "PHP",
      }).format(meta.totalSales);
      await client.query(
        `INSERT INTO notifications (recipient_user_id, branch_id, type, title, message, entity_type, entity_id)
         SELECT id, $1, 'POS_SALES_IMPORTED', 'POS Sales Imported', $2, 'POS_IMPORT', $3
         FROM users WHERE role = 'OWNER' AND status = 'ACTIVE'`,
        [
          branchId,
          `${meta.managerName} imported ${importRows.length} sales rows (${meta.unitsSold} units · ${formattedSales}) for ${meta.branchName} on ${preview.businessDate}.`,
          importId,
        ],
      );
      if (inventoryDateAssessment.lateHistoricalImport) {
        const affectedCounts = inventoryDateAssessment.affectedCountPeriods.map((period) => period.countNo).join(", ") || "the applicable historical count period";
        await client.query(
          `INSERT INTO notifications (recipient_user_id,branch_id,type,title,message,entity_type,entity_id)
           SELECT id,$1,'POS_LATE_HISTORICAL_IMPORT','Historical POS Import Needs Reconciliation',$2,'POS_IMPORT',$3
             FROM users
            WHERE status='ACTIVE' AND (role='OWNER' OR (role='BRANCH_MANAGER' AND branch_id=$1))`,
          [branchId, `${input.sourceFilename} contains sales dated ${preview.businessDate}, on or before the ${inventoryDateAssessment.latestBaselineDate} inventory baseline. Current inventory was not changed. Review ${affectedCounts} for historical reconciliation.`, importId],
        );
      }
    }
    await writeAudit(
      req.user!,
      "IMPORT_POS_SALES",
      "POS_IMPORT",
      importId,
      `Imported ${importRows.length} POS sales rows`,
      { branchId, businessDate: preview.businessDate, rowCount: importRows.length, totalQuantity: meta?.unitsSold ?? 0, totalSales: meta?.totalSales ?? 0, fingerprintIndicator: preview.fingerprintIndicator, pricingMethod: preview.pricing.method, pricingNotice: preview.pricing.notice, fallbackPricingRows: preview.pricing.fallbackRows, createdEnvironment:env.DATA_LIFECYCLE_ENV, inventoryDateAssessment },
      client,
    );
    await client.query("COMMIT");
    res
      .status(201)
      .json({
        success: true,
        data: {
          importId,
          branchId,
          businessDate: preview.businessDate,
          rowsImported: importRows.length,
          productsMatched: new Set(importRows.map((row) => row.menuItemId)).size,
          totalQuantitySold: meta?.unitsSold ?? 0,
          totalSales: meta?.totalSales ?? 0,
          fingerprintIndicator: preview.fingerprintIndicator,
          quality: preview.summary.quality,
          createdEnvironment:env.DATA_LIFECYCLE_ENV,
          pricing: preview.pricing,
          consumption: consumption.rows,
          reconciliation,
          inventoryDateAssessment,
          ...(env.BENCHMARK_MODE ? { benchmark: { ...preview.benchmark, salesInsertMs, ingredientUsageMs, databaseTransactionMs: performance.now() - importStartedAt } } : {}),
        },
      });
  } catch (error) {
    await client.query("ROLLBACK");
    const duplicate = (error as { code?: string }).code === "23505" || (error instanceof AppError && error.code === "POS_IMPORT_DUPLICATE");
    await writeAudit(req.user!, duplicate ? "REJECT_DUPLICATE_POS_IMPORT" : "IMPORT_POS_SALES_FAILED", "USER", req.user!.id, duplicate ? "Rejected duplicate POS import" : "POS import failed", { branchId, sourceFilename: input.sourceFilename, errorCode: (error as { code?: string }).code ?? "UNKNOWN" }).catch(() => undefined);
    if ((error as { code?: string }).code === "23505") throw new AppError(409, "POS_IMPORT_DUPLICATE", "This POS file or one or more identified source lines have already been imported for this branch.");
    throw error;
  } finally {
    client.release();
  }
};

export const listPosImports: RequestHandler = async (req, res) => {
  const pagination = paginationQuery.parse(req.query);
  const filters = posImportHistoryFilters.parse(req.query);
  const branchId = getEffectiveBranchId(req.user!, filters.branchId);
  const clauses:string[]=[];
  const values:unknown[]=[];
  if(branchId){values.push(branchId);clauses.push(`pi.branch_id=$${values.length}`);}
  if(filters.search){values.push(`%${filters.search}%`);clauses.push(`(pi.source_filename ILIKE $${values.length} OR b.name ILIKE $${values.length} OR concat(u.first_name,' ',u.last_name) ILIKE $${values.length} OR pi.business_date::text ILIKE $${values.length})`);}
  values.push(pagination.pageSize,(pagination.page-1)*pagination.pageSize);
  const result = await pool.query(
    `SELECT pi.id,pi.business_date::text "businessDate",pi.source_filename "sourceFilename",
            pi.imported_at "importedAt",pi.import_status "status",pi.total_source_rows "totalRows",
            pi.valid_rows "validRows",pi.warning_rows "warningRows",pi.invalid_rows "invalidRows",pi.unmatched_rows "unmatchedRows",
            pi.created_environment "createdEnvironment",pi.cleanup_authorized_by "cleanupAuthorizedBy",
            pi.cleanup_authorized_at "cleanupAuthorizedAt",pi.cleanup_reason "cleanupReason",
            CASE WHEN pi.content_hash IS NULL THEN NULL ELSE left(pi.content_hash,12) END "fingerprintIndicator",
            b.id "branchId",b.name "branchName",
            concat(u.first_name,' ',u.last_name) "importedBy",count(*) OVER()::int "__total",
            count(psi.id)::int "productLines",
            coalesce(sum(psi.quantity_sold),0)::float8 "unitsSold",
            coalesce(sum(psi.quantity_sold*coalesce(psi.unit_price_snapshot,mi.selling_price)),0)::float8 "totalSales"
            ,exists(
               SELECT 1 FROM inventory_counts historical_count
                WHERE historical_count.branch_id=pi.branch_id
                  AND NOT historical_count.is_test_data
                  AND historical_count.submitted_at <= pi.imported_at
                  AND historical_count.count_date >= pi.business_date
             ) "lateHistoricalImport"
            ,(SELECT max(historical_count.count_date)::text FROM inventory_counts historical_count
                WHERE historical_count.branch_id=pi.branch_id
                  AND NOT historical_count.is_test_data
                  AND historical_count.submitted_at <= pi.imported_at
                  AND historical_count.count_date >= pi.business_date) "latestBaselineDate"
       FROM pos_imports pi
       JOIN branches b ON b.id=pi.branch_id
       JOIN users u ON u.id=pi.imported_by
       LEFT JOIN pos_sale_items psi ON psi.pos_import_id=pi.id
       LEFT JOIN menu_items mi ON mi.id=psi.menu_item_id
      ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""}
      GROUP BY pi.id,b.id,u.id
      ORDER BY pi.business_date DESC,pi.imported_at DESC
      LIMIT $${values.length-1} OFFSET $${values.length}`,
    values,
  );
  const page = paginatedRows(result.rows, pagination);
  page.data = page.data.map((record) => ({
    ...record,
    ...posCleanupAccess(record as {createdEnvironment:PosLifecycleEnvironment;cleanupAuthorizedAt:string|null},req.user!.role),
  }));
  res.json({ success: true, data: { imports: page.data, pagination: page.pagination } });
};

export const authorizePosImportCleanup: RequestHandler = async (req,res) => {
  if(env.DATA_LIFECYCLE_ENV!=="UAT") throw new AppError(403,"POS_CLEANUP_AUTHORIZATION_DISABLED","Separate cleanup authorization is available only in UAT.");
  const {id}=idParams.parse(req.params);
  const input=posCleanupAuthorizationInput.parse(req.body);
  const client=await pool.connect();
  try{
    await client.query("BEGIN");
    const existing=await client.query<{createdEnvironment:PosLifecycleEnvironment}>(
      `SELECT created_environment "createdEnvironment" FROM pos_imports WHERE id=$1 FOR UPDATE`,[id]);
    const record=existing.rows[0];
    if(!record)throw new AppError(404,"POS_IMPORT_NOT_FOUND","POS import not found");
    if(record.createdEnvironment!=="UAT")throw new AppError(409,"POS_CLEANUP_ENVIRONMENT_MISMATCH","Only a POS import created in this UAT environment can be authorized for cleanup.");
    await client.query(`UPDATE pos_imports SET cleanup_authorized_by=$2::uuid,cleanup_authorized_at=now(),cleanup_reason=$3 WHERE id=$1`,[id,req.user!.id,input.reason]);
    await writeAudit(req.user!,"AUTHORIZE_POS_IMPORT_CLEANUP","POS_IMPORT",id,"Authorized UAT POS import cleanup",{reason:input.reason,createdEnvironment:record.createdEnvironment},client);
    await client.query("COMMIT");
    res.json({success:true,data:{id,authorized:true}});
  }catch(error){await client.query("ROLLBACK");throw error;}
  finally{client.release();}
};

export const deletePosImport: RequestHandler = async (req, res) => {
  if(env.DATA_LIFECYCLE_ENV==="PRODUCTION") throw new AppError(403,"POS_CLEANUP_DISABLED","POS import cleanup is disabled in production.");
  const { id } = idParams.parse(req.params);
  const input=destructiveActionInput.parse(req.body);
  await verifyDestructiveAction(req.user!,input.verificationPin,{module:"POS_IMPORT",action:"DELETE",recordId:id,reason:input.reason});
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const imported = await client.query<{
      branchId:string;branchName:string;businessDate:string;importedAt:string;sourceFilename:string;importedByUserId:string;
      totalRows:number;saleRowCount:number;ingredientUsageRowCount:number;contentHash:string|null;reconciliationCount:number;notificationCount:number;
      createdEnvironment:PosLifecycleEnvironment;cleanupAuthorizedBy:string|null;cleanupAuthorizedAt:string|null;cleanupReason:string|null;
    }>(
      `SELECT pi.branch_id "branchId",b.name "branchName",pi.business_date::text "businessDate",
              pi.imported_at::text "importedAt",
              pi.source_filename "sourceFilename",pi.imported_by "importedByUserId",pi.total_source_rows "totalRows",pi.content_hash "contentHash",
              pi.created_environment "createdEnvironment",pi.cleanup_authorized_by "cleanupAuthorizedBy",
              pi.cleanup_authorized_at::text "cleanupAuthorizedAt",pi.cleanup_reason "cleanupReason",
              (SELECT count(*)::int FROM pos_sale_items psi WHERE psi.pos_import_id=pi.id) "saleRowCount",
              (SELECT count(*)::int FROM pos_sale_ingredient_usage usage JOIN pos_sale_items psi ON psi.id=usage.pos_sale_item_id WHERE psi.pos_import_id=pi.id) "ingredientUsageRowCount",
              (SELECT count(*)::int FROM pos_import_reconciliations reconciliation WHERE reconciliation.pos_import_id=pi.id) "reconciliationCount",
              (SELECT count(*)::int FROM notifications notification WHERE notification.entity_type='POS_IMPORT' AND notification.entity_id=pi.id) "notificationCount"
         FROM pos_imports pi JOIN branches b ON b.id=pi.branch_id WHERE pi.id=$1 FOR UPDATE`,
      [id],
    );
    const record=imported.rows[0];
    if(!record) throw new AppError(404,"POS_IMPORT_NOT_FOUND","POS import not found");
    if(record.createdEnvironment!==env.DATA_LIFECYCLE_ENV) throw new AppError(409,"POS_CLEANUP_ENVIRONMENT_MISMATCH","This POS import was created in a different lifecycle environment and cannot be cleaned up here.");
    if(env.DATA_LIFECYCLE_ENV==="UAT"&&!record.cleanupAuthorizedAt) throw new AppError(409,"POS_CLEANUP_AUTHORIZATION_REQUIRED","Owner cleanup authorization is required before this UAT import can be deleted.");
    const reconciled=await client.query(
      `SELECT 1
         FROM inventory_counts
        WHERE branch_id=$1
          AND NOT is_test_data
          AND count_date >= $2::date
          AND submitted_at >= $3::timestamptz
        LIMIT 1`,
      [record.branchId,record.businessDate,record.importedAt],
    );
    if(reconciled.rows[0]) throw new AppError(409,"POS_IMPORT_RECONCILED","This import cannot be deleted because a physical inventory count already includes its business date.");
    await client.query(`DELETE FROM notifications WHERE entity_type='POS_IMPORT' AND entity_id=$1`,[id]);
    await client.query(`DELETE FROM pos_import_reconciliations WHERE pos_import_id=$1`,[id]);
    await client.query(`DELETE FROM pos_import_approvals WHERE pos_import_id=$1`,[id]);
    await client.query(`DELETE FROM pos_sale_ingredient_usage
      WHERE pos_sale_item_id IN (SELECT id FROM pos_sale_items WHERE pos_import_id=$1)`,[id]);
    await client.query(`DELETE FROM pos_sale_items WHERE pos_import_id=$1`,[id]);
    await client.query(`DELETE FROM pos_imports WHERE id=$1`,[id]);
    await writeDestructiveActionAudit(req.user!,{module:"POS_IMPORT",action:"DELETE",recordId:id,reason:input.reason},`Cleaned up POS import ${record.sourceFilename}`,{
      branchId:record.branchId,
      branchName:record.branchName,
      businessDate:record.businessDate,
      sourceFilename:record.sourceFilename,
      importedByUserId:record.importedByUserId,
      totalRows:record.totalRows,
      saleRowCount:record.saleRowCount,
      ingredientUsageRowCount:record.ingredientUsageRowCount,
      reconciliationCount:record.reconciliationCount,
      notificationCount:record.notificationCount,
      contentHash:record.contentHash,
      reason:input.reason,
      createdEnvironment:record.createdEnvironment,
      cleanupAuthorizedBy:record.cleanupAuthorizedBy,
      cleanupAuthorizedAt:record.cleanupAuthorizedAt,
      cleanupAuthorizationReason:record.cleanupReason,
      deletingRole:req.user!.role,
    },client);
    await client.query("COMMIT");
    res.json({success:true,data:{id,deleted:true}});
  } catch(error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export const getPosAnalytics: RequestHandler = async (req, res) => {
  const filters = posAnalyticsFilters.parse(req.query);
  const branchId = getEffectiveBranchId(req.user!, filters.branchId);
  const endDate = filters.endDate ?? manilaBusinessDate();
  const defaultStart = new Date(`${endDate}T00:00:00Z`);
  defaultStart.setUTCDate(defaultStart.getUTCDate() - 29);
  const startDate =
    filters.startDate ?? defaultStart.toISOString().slice(0, 10);
  const params: unknown[] = [startDate, endDate];
  const branchClause = branchId
    ? `AND pi.branch_id=$${params.push(branchId)}`
    : "";

  const [scope, summary, trends, products, ingredients, variance, verifiedCauses] =
    await Promise.all([
      branchId
        ? pool.query<{ branchName: string }>(
            `SELECT name "branchName" FROM branches WHERE id=$1`,
            [branchId],
          )
        : Promise.resolve({ rows: [] }),
      pool.query(
        `WITH sales AS (
         SELECT coalesce(sum(psi.quantity_sold*coalesce(psi.unit_price_snapshot,mi.selling_price)),0)::float8 sales,
                coalesce(sum(psi.quantity_sold),0)::float8 units_sold,
                count(DISTINCT pi.id)::int import_count
           FROM pos_imports pi JOIN pos_sale_items psi ON psi.pos_import_id=pi.id JOIN menu_items mi ON mi.id=psi.menu_item_id
          WHERE pi.business_date BETWEEN $1::date AND $2::date ${branchClause}
       ), costs AS (
         SELECT coalesce(sum(usage.quantity_consumed*usage.unit_cost_snapshot),0)::float8 cogs
           FROM pos_imports pi JOIN pos_sale_items psi ON psi.pos_import_id=pi.id
           JOIN pos_sale_ingredient_usage usage ON usage.pos_sale_item_id=psi.id
          WHERE pi.business_date BETWEEN $1::date AND $2::date ${branchClause}
       ) SELECT sales,units_sold "unitsSold",import_count "importCount",cogs "theoreticalCogs" FROM sales CROSS JOIN costs`,
        params,
      ),
      pool.query(
        `WITH sales AS (
         SELECT pi.business_date::text date,sum(psi.quantity_sold*coalesce(psi.unit_price_snapshot,mi.selling_price))::float8 sales
           FROM pos_imports pi JOIN pos_sale_items psi ON psi.pos_import_id=pi.id JOIN menu_items mi ON mi.id=psi.menu_item_id
          WHERE pi.business_date BETWEEN $1::date AND $2::date ${branchClause} GROUP BY pi.business_date
       ), costs AS (
         SELECT pi.business_date::text date,sum(usage.quantity_consumed*usage.unit_cost_snapshot)::float8 cogs
           FROM pos_imports pi JOIN pos_sale_items psi ON psi.pos_import_id=pi.id
           JOIN pos_sale_ingredient_usage usage ON usage.pos_sale_item_id=psi.id
          WHERE pi.business_date BETWEEN $1::date AND $2::date ${branchClause} GROUP BY pi.business_date
       ) SELECT sales.date,sales.sales,coalesce(costs.cogs,0)::float8 cogs,(sales.sales-coalesce(costs.cogs,0))::float8 "grossProfit"
           FROM sales LEFT JOIN costs USING(date) ORDER BY sales.date`,
        params,
      ),
      pool.query(
        `WITH line_costs AS (
         SELECT psi.id,coalesce(sum(usage.quantity_consumed*usage.unit_cost_snapshot),0)::float8 cogs
           FROM pos_sale_items psi LEFT JOIN pos_sale_ingredient_usage usage ON usage.pos_sale_item_id=psi.id GROUP BY psi.id
       ) SELECT mi.id,mi.name,mi.category,sum(psi.quantity_sold)::float8 "unitsSold",
                sum(psi.quantity_sold*coalesce(psi.unit_price_snapshot,mi.selling_price))::float8 sales,sum(lc.cogs)::float8 cogs
           FROM pos_imports pi JOIN pos_sale_items psi ON psi.pos_import_id=pi.id JOIN menu_items mi ON mi.id=psi.menu_item_id
           JOIN line_costs lc ON lc.id=psi.id
          WHERE pi.business_date BETWEEN $1::date AND $2::date ${branchClause}
          GROUP BY mi.id ORDER BY sales DESC`,
        params,
      ),
      pool.query(
        `SELECT ii.id,ii.name,ii.category,sum(usage.quantity_consumed*usage.unit_cost_snapshot)::float8 cost
         FROM pos_imports pi JOIN pos_sale_items psi ON psi.pos_import_id=pi.id
         JOIN pos_sale_ingredient_usage usage ON usage.pos_sale_item_id=psi.id JOIN inventory_items ii ON ii.id=usage.inventory_item_id
        WHERE pi.business_date BETWEEN $1::date AND $2::date ${branchClause}
        GROUP BY ii.id ORDER BY cost DESC`,
        params,
      ),
      pool.query(
        `SELECT coalesce(sum(CASE WHEN ici.actual_quantity < ici.expected_quantity THEN abs(ici.variance_value) ELSE 0 END),0)::float8 "detectedShortageValue"
         FROM inventory_counts ic JOIN inventory_count_items ici ON ici.inventory_count_id=ic.id
        WHERE NOT ic.is_test_data AND ic.count_date BETWEEN $1::date AND $2::date ${branchId ? `AND ic.branch_id=$3` : ""}`,
        params,
      ),
      pool.query<{ name: string; value: number }>(
        `SELECT replace(ir.incident_type::text, '_', ' ') "name",
                round(coalesce(sum(iri.quantity * ii.unit_cost), 0)::numeric, 2)::float8 "value"
         FROM incident_reports ir
         JOIN incident_report_items iri ON iri.incident_report_id=ir.id
         JOIN inventory_items ii ON ii.id = iri.inventory_item_id
        WHERE NOT ir.is_test_data AND ir.status = 'VERIFIED'
          AND ir.occurred_at::date BETWEEN $1::date AND $2::date
          ${branchId ? `AND ir.branch_id=$3` : ""}
        GROUP BY ir.incident_type
        ORDER BY "value" DESC`,
        params,
      ),
    ]);

  const totals = summary.rows[0] as {
    sales: number;
    unitsSold: number;
    importCount: number;
    theoreticalCogs: number;
  };
  const detectedShortageValue = Number(
    (variance.rows[0] as { detectedShortageValue: number }).detectedShortageValue ?? 0,
  );
  const shrinkageCauses = verifiedCauses.rows.map((row) => ({
    name: row.name,
    value: Number(row.value ?? 0),
  }));
  const verifiedShrinkageCost = roundMoney(
    shrinkageCauses.reduce((sum, item) => sum + item.value, 0),
  );
  const theoreticalCogs = Number(totals.theoreticalCogs ?? 0);
  const sales = Number(totals.sales ?? 0);
  const financials = calculateFinancialSummary({
    sales,
    productCogs: theoreticalCogs,
    detectedShortageValue,
    verifiedShrinkageCost,
  });
  res.json({
    success: true,
    data: {
      scope: {
        branchId: branchId ?? null,
        branchName: branchId
          ? (scope.rows[0]?.branchName ?? "Assigned Branch")
          : "All Branches",
        startDate,
        endDate,
      },
      summary: {
        sales,
        theoreticalCogs,
        totalCogs: financials.totalCogs,
        detectedShortageValue,
        verifiedShrinkageCost,
        shrinkageCost: verifiedShrinkageCost,
        shrinkageRate: financials.shrinkageRate,
        adjustedCogs: financials.totalCogs,
        grossProfit: financials.grossProfit,
        grossMargin: financials.grossMargin,
        unitsSold: Number(totals.unitsSold ?? 0),
        importCount: Number(totals.importCount ?? 0),
      },
      trends: trends.rows,
      products: products.rows,
      ingredients: ingredients.rows,
      shrinkageCauses,
    },
  });
};

export const createInventoryMovement: RequestHandler = async (req, res) => {
  const input = inventoryMovementInput.parse(req.body);
  const branchId = requiredBranchId(req.user!, input.branchId);
  if (
    req.user!.role === "BRANCH_MANAGER" &&
    input.movementType.startsWith("APPROVED_ADJUSTMENT")
  ) {
    throw new AppError(
      403,
      "OWNER_APPROVAL_REQUIRED",
      "Only the Owner can record an approved adjustment",
    );
  }
  const available = await pool.query(
    `SELECT 1 FROM inventory_items WHERE id=$1 AND status='ACTIVE'
    AND (item_scope='GLOBAL' OR origin_branch_id=$2)`,
    [input.inventoryItemId, branchId],
  );
  if (!available.rows[0])
    throw new AppError(
      422,
      "INVENTORY_ITEM_SCOPE_INVALID",
      "The inventory item is not available to this branch",
    );
  const result = await pool.query(
    `INSERT INTO inventory_movements (branch_id,inventory_item_id,movement_type,quantity,occurred_at,reference_no,notes,approved_by,created_by)
     VALUES ($1,$2,$3,$4,COALESCE($5::timestamptz,now()),$6,$7,$8,$9)
     RETURNING id,branch_id "branchId",inventory_item_id "inventoryItemId",movement_type "movementType",quantity::float8,occurred_at "occurredAt"`,
    [
      branchId,
      input.inventoryItemId,
      input.movementType,
      input.quantity,
      input.occurredAt ?? null,
      input.referenceNo ?? null,
      input.notes ?? null,
      input.movementType.startsWith("APPROVED_ADJUSTMENT") ? req.user!.id : null,
      req.user!.id,
    ],
  );
  await writeAudit(
    req.user!,
    "CREATE_INVENTORY_MOVEMENT",
    "INVENTORY_MOVEMENT",
    result.rows[0].id,
    `Recorded ${input.movementType.toLowerCase()}`,
    { branchId, quantity: input.quantity },
  );
  res.status(201).json({ success: true, data: { movement: result.rows[0] } });
};

export const getExpectedInventory: RequestHandler = async (req, res) => {
  const branchId = requiredBranchId(
    req.user!,
    typeof req.query.branchId === "string" ? req.query.branchId : undefined,
  );
  const countDate =
    typeof req.query.countDate === "string"
      ? req.query.countDate
      : manilaBusinessDate();
  assertInventoryCountDateNotFuture(countDate);
  const itemIds = await pool.query<{ id: string; sku: string; name: string; unit: string }>(
    `SELECT id,sku,name,unit FROM inventory_items WHERE status='ACTIVE'
    AND (item_scope='GLOBAL' OR origin_branch_id=$1) ORDER BY name`,
    [branchId],
  );
  const items = [];
  const unavailableItems: Array<{
    inventoryItemId: string;
    sku: string;
    itemName: string;
    unit: string;
    availability: "NO_BASELINE";
  }> = [];
  for (const item of itemIds.rows) {
    try {
      items.push(
        await calculateExpectedInventory(pool, branchId, item.id, countDate),
      );
    } catch (error) {
      if (error instanceof AppError && error.code === "NO_VALID_HISTORICAL_BASELINE") {
        unavailableItems.push({
          inventoryItemId: item.id,
          sku: item.sku,
          itemName: item.name,
          unit: item.unit,
          availability: "NO_BASELINE",
        });
        continue;
      }
      throw error;
    }
  }
  res.json({ success: true, data: { branchId, countDate, items, unavailableItems } });
};

export const submitInventoryCount: RequestHandler = async (req, res) => {
  const input = inventoryCountInput.parse(req.body);
  assertInventoryCountDateNotFuture(input.countDate);
  const branchId = requiredBranchId(req.user!);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const rulesResult = await client.query<{ absoluteTolerance: number; relativeTolerance: number }>(
      `SELECT variance_tolerance_quantity::float8 "absoluteTolerance",
              variance_tolerance_percent::float8 "relativeTolerance"
         FROM calculation_settings WHERE singleton=true`,
    );
    const varianceTolerance = {
      absoluteQuantity: Number(rulesResult.rows[0]?.absoluteTolerance ?? 1),
      relativePercent: Number(rulesResult.rows[0]?.relativeTolerance ?? 2),
    };
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
    const countNoResult = await client.query<{ countNo: string }>(
      `SELECT 'IC-'||to_char($1::date,'YYYY')||'-'||lpad(nextval('inventory_count_number_seq')::text,5,'0') "countNo"`,
      [input.countDate],
    );
    const count = await client.query<{ id: string; countNo: string }>(
      `INSERT INTO inventory_counts (count_no,branch_id,count_date,submitted_by) VALUES ($1,$2,$3,$4) RETURNING id,count_no "countNo"`,
      [countNoResult.rows[0]!.countNo, branchId, input.countDate, req.user!.id],
    );
    const countItems = [];
    for (const submitted of input.items) {
      const expected = await calculateExpectedInventory(
        client,
        branchId,
        submitted.inventoryItemId,
        input.countDate,
      );
      let actualQuantity: number;
      try {
        actualQuantity = normalizePhysicalCountQuantity({
          quantity: submitted.quantity,
          enteredUnit: submitted.enteredUnit,
          canonicalUnit: expected.unit,
        });
      } catch (error) {
        throw new AppError(
          422,
          "INVENTORY_COUNT_UNIT_INCOMPATIBLE",
          error instanceof Error ? error.message : "Invalid physical-count unit",
        );
      }
      const { varianceQuantity, varianceValue } = computeVariance(
        expected.expectedQuantity,
        actualQuantity,
        expected.unitCost,
      );
      const inserted = await client.query(
        `INSERT INTO inventory_count_items
          (inventory_count_id,inventory_item_id,previous_actual_quantity,stock_received,expected_consumption,approved_adjustments,expected_quantity,actual_quantity,variance_quantity,variance_value,unit)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         RETURNING id,inventory_item_id "inventoryItemId",expected_quantity::float8 "expectedQuantity",actual_quantity::float8 "actualQuantity",variance_quantity::float8 "varianceQuantity",variance_value::float8 "varianceValue",
                   CASE WHEN expected_quantity > 0 THEN ((variance_quantity / expected_quantity) * 100)::float8 ELSE NULL END "variancePercentage",
                   unit`,
        [
          count.rows[0]!.id,
          submitted.inventoryItemId,
          expected.previousActualQuantity,
          expected.stockReceived,
          expected.expectedConsumption,
          expected.approvedAdjustments,
          expected.expectedQuantity,
          actualQuantity,
          varianceQuantity,
          varianceValue,
          expected.unit,
        ],
      );
      await client.query(
        `INSERT INTO branch_inventory_balances (branch_id,inventory_item_id,actual_quantity,as_of,is_test_data)
         VALUES ($1,$2,$3,$4::date + time '23:59:59',false)
         ON CONFLICT (branch_id,inventory_item_id) DO UPDATE SET actual_quantity=excluded.actual_quantity,as_of=excluded.as_of,is_test_data=false,updated_at=now()`,
        [
          branchId,
          submitted.inventoryItemId,
          actualQuantity,
          input.countDate,
        ],
      );
      const countItem = inserted.rows[0] as { id: string };
      let shrinkageReportId: string | null = null;
      if (requiresVarianceInvestigation(expected.expectedQuantity, varianceQuantity, varianceTolerance)) {
        const reportNo = await client.query<{ reportNo: string }>(
          `SELECT 'SR-'||to_char(now(),'YYYY')||'-'||lpad(nextval('shrinkage_report_number_seq')::text,5,'0') "reportNo"`,
        );
        const anomaly = await client.query<{ id: string }>(
          `INSERT INTO shrinkage_reports
            (report_no,branch_id,inventory_item_id,inventory_count_item_id,expected_quantity,actual_quantity,variance_quantity,variance_value,unit,status,submitted_by,detected_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'DETECTED',$10,now())
           RETURNING id`,
          [
            reportNo.rows[0]!.reportNo,
            branchId,
            submitted.inventoryItemId,
            countItem.id,
            expected.expectedQuantity,
            actualQuantity,
            varianceQuantity,
            varianceValue,
            expected.unit,
            req.user!.id,
          ],
        );
        shrinkageReportId = anomaly.rows[0]!.id;
        await client.query(
          `INSERT INTO notifications (recipient_user_id,branch_id,type,title,message,entity_type,entity_id)
           VALUES ($1,$2,'INVENTORY_ANOMALY','Inventory Anomaly Detected',$3,'SHRINKAGE_REPORT',$4)`,
          [
            req.user!.id,
            branchId,
            `${expected.itemName} has a detected shortage of ${Math.abs(varianceQuantity).toFixed(2)}${expected.unit} below expected stock. Investigation is required.`,
            shrinkageReportId,
          ],
        );
      }
      countItems.push({
        ...inserted.rows[0],
        sku: expected.sku,
        itemName: expected.itemName,
        expectedConsumption: expected.expectedConsumption,
        requiresInvestigation: Boolean(shrinkageReportId),
        shrinkageReportId,
      });
    }
    await writeAudit(
      req.user!,
      "SUBMIT_INVENTORY_COUNT",
      "INVENTORY_COUNT",
      count.rows[0]!.id,
      `Submitted physical inventory count ${count.rows[0]!.countNo}`,
      { branchId, itemCount: countItems.length },
      client,
    );
    await client.query("COMMIT");
    res
      .status(201)
      .json({
        success: true,
        data: {
          count: {
            ...count.rows[0],
            branchId,
            countDate: input.countDate,
            items: countItems,
          },
        },
      });
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

export const updateInventoryCount: RequestHandler = async (req, res) => {
  const { id } = idParams.parse(req.params);
  const input = inventoryCountInput.parse(req.body);
  assertInventoryCountDateNotFuture(input.countDate);
  const branchId = requiredBranchId(req.user!);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const count = await client.query<{ countNo: string; countDate: string; isTestData: boolean }>(
      `SELECT count_no "countNo",count_date::text "countDate",is_test_data "isTestData" FROM inventory_counts
        WHERE id=$1 AND branch_id=$2 AND submitted_by=$3 FOR UPDATE`,
      [id, branchId, req.user!.id],
    );
    if (!count.rows[0])
      throw new AppError(
        404,
        "INVENTORY_COUNT_NOT_FOUND",
        "Your submitted physical count was not found",
      );
    if (count.rows[0].countDate !== input.countDate)
      throw new AppError(
        422,
        "COUNT_DATE_LOCKED",
        "The submitted count date cannot be changed",
      );
    const later = await client.query(
      `SELECT 1 FROM inventory_counts WHERE branch_id=$1 AND NOT is_test_data AND count_date>$2::date LIMIT 1`,
      [branchId, input.countDate],
    );
    if (later.rows[0])
      throw new AppError(
        409,
        "COUNT_CORRECTION_LOCKED",
        "This count cannot be edited because a newer physical count exists",
      );
    const locked = await client.query(
      `SELECT 1 FROM shrinkage_reports sr JOIN inventory_count_items ici ON ici.id=sr.inventory_count_item_id
        WHERE ici.inventory_count_id=$1 AND sr.status<>'DETECTED' LIMIT 1`,
      [id],
    );
    if (locked.rows[0])
      throw new AppError(
        409,
        "COUNT_CORRECTION_LOCKED",
        "This count can no longer be edited because its variance investigation has been submitted",
      );
    const rulesResult = await client.query<{ absoluteTolerance: number; relativeTolerance: number }>(
      `SELECT variance_tolerance_quantity::float8 "absoluteTolerance",
              variance_tolerance_percent::float8 "relativeTolerance"
         FROM calculation_settings WHERE singleton=true`,
    );
    const varianceTolerance = {
      absoluteQuantity: Number(rulesResult.rows[0]?.absoluteTolerance ?? 1),
      relativePercent: Number(rulesResult.rows[0]?.relativeTolerance ?? 2),
    };
    const existing = await client.query<{
      id: string;
      inventoryItemId: string;
      expectedQuantity: number;
      expectedConsumption: number;
      unit: string;
      sku: string;
      itemName: string;
      unitCost: number;
      shrinkageReportId: string | null;
    }>(
      `SELECT ici.id,ici.inventory_item_id "inventoryItemId",ici.expected_quantity::float8 "expectedQuantity",
        ici.expected_consumption::float8 "expectedConsumption",ici.unit,ii.sku,ii.name "itemName",
        COALESCE(bis.current_unit_cost,ii.unit_cost)::float8 "unitCost",sr.id "shrinkageReportId"
       FROM inventory_count_items ici JOIN inventory_items ii ON ii.id=ici.inventory_item_id
       LEFT JOIN branch_inventory_settings bis ON bis.inventory_item_id=ii.id AND bis.branch_id=$2
       LEFT JOIN shrinkage_reports sr ON sr.inventory_count_item_id=ici.id
       WHERE ici.inventory_count_id=$1`,
      [id, branchId],
    );
    if (
      input.items.length !== existing.rows.length ||
      input.items.some(
        (item) =>
          !existing.rows.some(
            (row) => row.inventoryItemId === item.inventoryItemId,
          ),
      )
    ) {
      throw new AppError(
        422,
        "COUNT_ITEMS_MISMATCH",
        "All original count items must be included",
      );
    }
    const returned = [];
    for (const submitted of input.items) {
      const row = existing.rows.find(
        (candidate) => candidate.inventoryItemId === submitted.inventoryItemId,
      )!;
      let actualQuantity: number;
      try {
        actualQuantity = normalizePhysicalCountQuantity({
          quantity: submitted.quantity,
          enteredUnit: submitted.enteredUnit,
          canonicalUnit: row.unit,
        });
      } catch (error) {
        throw new AppError(
          422,
          "INVENTORY_COUNT_UNIT_INCOMPATIBLE",
          error instanceof Error ? error.message : "Invalid physical-count unit",
        );
      }
      const expectedQty = Number(row.expectedQuantity);
      const { varianceQuantity, varianceValue, variancePercentage } = computeVariance(
        expectedQty,
        actualQuantity,
        Number(row.unitCost),
      );
      await client.query(
        `UPDATE inventory_count_items SET actual_quantity=$2,variance_quantity=$3,variance_value=$4 WHERE id=$1`,
        [row.id, actualQuantity, varianceQuantity, varianceValue],
      );
      await client.query(
        `UPDATE branch_inventory_balances SET actual_quantity=$3,as_of=$4::date+time '23:59:59',is_test_data=$5,updated_at=now()
          WHERE branch_id=$1 AND inventory_item_id=$2`,
        [
          branchId,
          row.inventoryItemId,
          actualQuantity,
          input.countDate,
          count.rows[0].isTestData,
        ],
      );
      let shrinkageReportId = row.shrinkageReportId;
      const requiresInvestigation = requiresVarianceInvestigation(
        expectedQty,
        varianceQuantity,
        varianceTolerance,
      );
      if (requiresInvestigation && shrinkageReportId) {
        await client.query(
          `UPDATE shrinkage_reports SET actual_quantity=$2,variance_quantity=$3,variance_value=$4,updated_at=now() WHERE id=$1 AND status='DETECTED'`,
          [
            shrinkageReportId,
            actualQuantity,
            varianceQuantity,
            varianceValue,
          ],
        );
      } else if (requiresInvestigation) {
        const reportNo = await client.query<{ reportNo: string }>(
          `SELECT 'SR-'||to_char(now(),'YYYY')||'-'||lpad(nextval('shrinkage_report_number_seq')::text,5,'0') "reportNo"`,
        );
        const anomaly = await client.query<{ id: string }>(
          `INSERT INTO shrinkage_reports
            (report_no,branch_id,inventory_item_id,inventory_count_item_id,expected_quantity,actual_quantity,variance_quantity,variance_value,unit,status,submitted_by,detected_at,is_test_data)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'DETECTED',$10,now(),$11) RETURNING id`,
          [
            reportNo.rows[0]!.reportNo,
            branchId,
            row.inventoryItemId,
            row.id,
            row.expectedQuantity,
            actualQuantity,
            varianceQuantity,
            varianceValue,
            row.unit,
            req.user!.id,
            count.rows[0].isTestData,
          ],
        );
        shrinkageReportId = anomaly.rows[0]!.id;
        await client.query(
          `INSERT INTO notifications (recipient_user_id,branch_id,type,title,message,entity_type,entity_id)
           VALUES ($1,$2,'INVENTORY_ANOMALY','Inventory Anomaly Detected',$3,'SHRINKAGE_REPORT',$4)`,
          [
            req.user!.id,
            branchId,
            `${row.itemName} has a detected shortage of ${Math.abs(varianceQuantity).toFixed(2)}${row.unit} below expected stock. Investigation is required.`,
            shrinkageReportId,
          ],
        );
      } else if (shrinkageReportId) {
        await client.query(
          `DELETE FROM notifications WHERE entity_type='SHRINKAGE_REPORT' AND entity_id=$1`,
          [shrinkageReportId],
        );
        await client.query(
          `DELETE FROM shrinkage_reports WHERE id=$1 AND status='DETECTED'`,
          [shrinkageReportId],
        );
        shrinkageReportId = null;
      }
      returned.push({
        id: row.id,
        inventoryItemId: row.inventoryItemId,
        sku: row.sku,
        itemName: row.itemName,
        expectedConsumption: Number(row.expectedConsumption),
        expectedQuantity: expectedQty,
        actualQuantity,
        varianceQuantity,
        varianceValue,
        variancePercentage,
        unit: row.unit,
        requiresInvestigation: Boolean(shrinkageReportId),
        shrinkageReportId,
      });
    }
    await client.query(
      `UPDATE inventory_counts SET submitted_at=now() WHERE id=$1`,
      [id],
    );
    await writeAudit(
      req.user!,
      "CORRECT_INVENTORY_COUNT",
      "INVENTORY_COUNT",
      id,
      `Corrected physical inventory count ${count.rows[0].countNo}`,
      { branchId, itemCount: returned.length },
      client,
    );
    await client.query("COMMIT");
    res.json({
      success: true,
      data: {
        count: {
          id,
          countNo: count.rows[0].countNo,
          branchId,
          countDate: input.countDate,
          items: returned,
        },
      },
    });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export const listInventoryCounts: RequestHandler = async (req, res) => {
  const pagination = paginationQuery.parse(req.query);
  const branchId = getEffectiveBranchId(
    req.user!,
    typeof req.query.branchId === "string" ? req.query.branchId : undefined,
  );
  const result = await pool.query(
    `SELECT ic.id,ic.count_no "countNo",ic.count_date::text "countDate",ic.submitted_at "submittedAt",b.id "branchId",b.name "branchName",
              (ic.submitted_by=$1 AND NOT EXISTS(SELECT 1 FROM inventory_counts newer WHERE newer.branch_id=ic.branch_id AND NOT newer.is_test_data AND (newer.count_date,newer.submitted_at)>(ic.count_date,ic.submitted_at))
                AND NOT EXISTS(SELECT 1 FROM inventory_count_items ci JOIN shrinkage_reports sr ON sr.inventory_count_item_id=ci.id WHERE ci.inventory_count_id=ic.id AND sr.status<>'DETECTED')) "canEdit",
              concat(u.first_name,' ',u.last_name) "submittedBy",count(ici.id)::int "itemCount",count(*) OVER()::int "__total",
              (count(ici.id) FILTER (WHERE abs(ici.variance_quantity)>0.0001))::int "varianceCount"
       FROM inventory_counts ic JOIN branches b ON b.id=ic.branch_id JOIN users u ON u.id=ic.submitted_by
       LEFT JOIN inventory_count_items ici ON ici.inventory_count_id=ic.id AND ici.voided_at IS NULL
      WHERE NOT ic.is_test_data AND ($2::uuid IS NULL OR ic.branch_id=$2)
      GROUP BY ic.id,b.id,u.id ORDER BY ic.count_date DESC,ic.submitted_at DESC LIMIT $3 OFFSET $4`,
    [req.user!.id, branchId ?? null, pagination.pageSize, (pagination.page-1)*pagination.pageSize],
  );
  const page = paginatedRows(result.rows, pagination);
  const counts = page.data.map((count) => ({
    ...count,
    canClassifyAsTestData:
      req.user!.role === "OWNER" &&
      env.DATA_LIFECYCLE_ENV !== "PRODUCTION" &&
      GULOD_UAT_PLACEHOLDER_COUNTS.has(String(count.id)),
  }));
  res.json({
    success: true,
    data: {
      counts,
      pagination: page.pagination,
      uatTestControlsEnabled: req.user!.role === "OWNER" && env.DATA_LIFECYCLE_ENV !== "PRODUCTION",
    },
  });
};

export const listUatInventoryCounts: RequestHandler = async (req, res) => {
  assertUatCountClassificationAvailable();
  const pagination = paginationQuery.parse(req.query);
  const branchId = typeof req.query.branchId === "string" ? req.query.branchId : undefined;
  const values: unknown[] = [];
  const branchClause = branchId ? `AND ic.branch_id=$${values.push(branchId)}` : "";
  const result = await pool.query(
    `SELECT ic.id,ic.count_no "countNo",ic.count_date::text "countDate",ic.submitted_at "submittedAt",b.id "branchId",b.name "branchName",
            false "canEdit",false "canClassifyAsTestData",true "isTestData",
            concat(u.first_name,' ',u.last_name) "submittedBy",count(ici.id)::int "itemCount",count(*) OVER()::int "__total",
            (count(ici.id) FILTER (WHERE abs(ici.variance_quantity)>0.0001))::int "varianceCount"
       FROM inventory_counts ic JOIN branches b ON b.id=ic.branch_id JOIN users u ON u.id=ic.submitted_by
       LEFT JOIN inventory_count_items ici ON ici.inventory_count_id=ic.id AND ici.voided_at IS NULL
      WHERE ic.is_test_data ${branchClause}
      GROUP BY ic.id,b.id,u.id ORDER BY ic.count_date DESC,ic.submitted_at DESC
      LIMIT $${values.length+1} OFFSET $${values.length+2}`,
    [...values, pagination.pageSize, (pagination.page-1)*pagination.pageSize],
  );
  const page = paginatedRows(result.rows, pagination);
  res.json({ success: true, data: { counts: page.data, pagination: page.pagination } });
};

export const getInventoryCount: RequestHandler = async (req, res) => {
  const { id } = idParams.parse(req.params);
  const branchId = getEffectiveBranchId(req.user!);
  const count = await pool.query(
    `SELECT ic.id,ic.count_no "countNo",ic.count_date::text "countDate",ic.branch_id "branchId",
      (ic.submitted_by=$3 AND NOT EXISTS(SELECT 1 FROM inventory_counts n WHERE n.branch_id=ic.branch_id AND NOT n.is_test_data AND (n.count_date,n.submitted_at)>(ic.count_date,ic.submitted_at))
       AND NOT EXISTS(SELECT 1 FROM inventory_count_items ci JOIN shrinkage_reports sr ON sr.inventory_count_item_id=ci.id WHERE ci.inventory_count_id=ic.id AND sr.status<>'DETECTED')) "canEdit"
     FROM inventory_counts ic WHERE ic.id=$1 AND NOT ic.is_test_data AND ($2::uuid IS NULL OR ic.branch_id=$2)`, [id,branchId ?? null,req.user!.id]);
  if (!count.rows[0]) throw new AppError(404,"INVENTORY_COUNT_NOT_FOUND","Count not found for your branch");
  const items = await pool.query(`SELECT ici.id,ici.inventory_item_id "inventoryItemId",ii.sku,ii.name "itemName",ici.unit,
    ici.previous_actual_quantity::float8 "previousActualQuantity",ici.stock_received::float8 "stockReceived",
    ici.expected_consumption::float8 "expectedConsumption",ici.approved_adjustments::float8 "approvedAdjustments",
    ici.expected_quantity::float8 "expectedQuantity",ici.actual_quantity::float8 "actualQuantity",
    (ici.actual_quantity-ici.expected_quantity)::float8 "varianceQuantity",
    CASE WHEN ici.actual_quantity>ici.expected_quantity THEN abs(ici.variance_value)
         WHEN ici.actual_quantity<ici.expected_quantity THEN -abs(ici.variance_value) ELSE 0 END::float8 "varianceValue",
    CASE WHEN ici.expected_quantity > 0 THEN (((ici.actual_quantity-ici.expected_quantity) / ici.expected_quantity) * 100)::float8 ELSE NULL END "variancePercentage",
    sr.id "shrinkageReportId",(sr.status='DETECTED') "requiresInvestigation"
    FROM inventory_count_items ici JOIN inventory_items ii ON ii.id=ici.inventory_item_id
    LEFT JOIN shrinkage_reports sr ON sr.inventory_count_item_id=ici.id AND sr.archived_at IS NULL
    WHERE ici.inventory_count_id=$1 AND ici.voided_at IS NULL ORDER BY ii.name`,[id]);
  res.json({success:true,data:{count:{...count.rows[0],items:items.rows}}});
};

export const getUatInventoryCount: RequestHandler = async (req, res) => {
  assertUatCountClassificationAvailable();
  const { id } = idParams.parse(req.params);
  const count = await pool.query(
    `SELECT ic.id,ic.count_no "countNo",ic.count_date::text "countDate",ic.branch_id "branchId",
            b.name "branchName",false "canEdit",true "isTestData"
       FROM inventory_counts ic JOIN branches b ON b.id=ic.branch_id
      WHERE ic.id=$1 AND ic.is_test_data`,
    [id],
  );
  if (!count.rows[0]) throw new AppError(404, "INVENTORY_COUNT_NOT_FOUND", "UAT/Test count not found");
  const items = await pool.query(
    `SELECT ici.id,ici.inventory_item_id "inventoryItemId",ii.sku,ii.name "itemName",ici.unit,
            ici.previous_actual_quantity::float8 "previousActualQuantity",ici.stock_received::float8 "stockReceived",
            ici.expected_consumption::float8 "expectedConsumption",ici.approved_adjustments::float8 "approvedAdjustments",
            ici.expected_quantity::float8 "expectedQuantity",ici.actual_quantity::float8 "actualQuantity",
            (ici.actual_quantity-ici.expected_quantity)::float8 "varianceQuantity",
            CASE WHEN ici.actual_quantity>ici.expected_quantity THEN abs(ici.variance_value)
                 WHEN ici.actual_quantity<ici.expected_quantity THEN -abs(ici.variance_value) ELSE 0 END::float8 "varianceValue",
            CASE WHEN ici.expected_quantity > 0 THEN (((ici.actual_quantity-ici.expected_quantity) / ici.expected_quantity) * 100)::float8 ELSE NULL END "variancePercentage",
            sr.id "shrinkageReportId",false "requiresInvestigation"
       FROM inventory_count_items ici JOIN inventory_items ii ON ii.id=ici.inventory_item_id
       LEFT JOIN shrinkage_reports sr ON sr.inventory_count_item_id=ici.id
      WHERE ici.inventory_count_id=$1 AND ici.voided_at IS NULL ORDER BY ii.name`,
    [id],
  );
  res.json({ success: true, data: { count: { ...count.rows[0], items: items.rows } } });
};

export const classifyInventoryCountAsTestData: RequestHandler = async (req, res) => {
  assertUatCountClassificationAvailable();
  if (req.user!.role !== "OWNER") throw new AppError(403, "FORBIDDEN", "Only the Owner can classify UAT/Test counts");
  const { id } = idParams.parse(req.params);
  const target = GULOD_UAT_PLACEHOLDER_COUNTS.get(id);
  if (!target) throw new AppError(403, "INVENTORY_COUNT_TEST_CLASSIFICATION_NOT_ALLOWED", "This physical count is not authorized for UAT/Test classification");
  const input = inventoryCountTestClassificationInput.parse(req.body);
  await verifyDestructiveAction(req.user!, input.verificationPin, {
    module: "INVENTORY_COUNT",
    action: "CLASSIFY_UAT_TEST",
    recordId: id,
    reason: input.reason,
  });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const countResult = await client.query<{ countNo: string; branchId: string; branchName: string; countDate: string; isTestData: boolean }>(
      `SELECT ic.count_no "countNo",ic.branch_id "branchId",b.name "branchName",ic.count_date::text "countDate",ic.is_test_data "isTestData"
         FROM inventory_counts ic JOIN branches b ON b.id=ic.branch_id
        WHERE ic.id=$1 FOR UPDATE OF ic`,
      [id],
    );
    const count = countResult.rows[0];
    if (!count) throw new AppError(404, "INVENTORY_COUNT_NOT_FOUND", "Physical count not found");
    if (count.countNo !== target.countNo || count.branchId !== GULOD_MAIN_BRANCH_ID || count.branchName !== "Gulod / Main Branch")
      throw new AppError(409, "INVENTORY_COUNT_TEST_CLASSIFICATION_MISMATCH", "The authorized UAT count identity or branch does not match");
    if (count.isTestData) throw new AppError(409, "INVENTORY_COUNT_ALREADY_TEST_DATA", "This physical count is already classified as UAT/Test Data");

    const countItems = await client.query<{ inventoryItemId: string; actualQuantity: number }>(
      `SELECT inventory_item_id "inventoryItemId",actual_quantity::float8 "actualQuantity"
         FROM inventory_count_items WHERE inventory_count_id=$1 ORDER BY inventory_item_id FOR UPDATE`,
      [id],
    );
    if (countItems.rows.length !== target.itemCount)
      throw new AppError(409, "INVENTORY_COUNT_TEST_DEPENDENCY_MISMATCH", `Expected ${target.itemCount} count items but found ${countItems.rows.length}`);

    const linkedReports = await client.query<{ id: string; reportNo: string; status: string; isTestData: boolean }>(
      `SELECT sr.id,sr.report_no "reportNo",sr.status,sr.is_test_data "isTestData"
         FROM shrinkage_reports sr JOIN inventory_count_items ici ON ici.id=sr.inventory_count_item_id
        WHERE ici.inventory_count_id=$1 FOR UPDATE OF sr`,
      [id],
    );
    if (linkedReports.rows.length !== 1 || linkedReports.rows[0]!.reportNo !== target.shrinkageReportNo)
      throw new AppError(409, "INVENTORY_COUNT_TEST_DEPENDENCY_MISMATCH", "Linked shrinkage records do not match the authorized UAT dependency set");

    let classifiedBalanceRows = 0;
    if (target.balanceCount > 0) {
      const itemIds = countItems.rows.map((item) => item.inventoryItemId);
      const balances = await client.query<{ inventoryItemId: string; actualQuantity: number; asOfDate: string; isTestData: boolean }>(
        `SELECT inventory_item_id "inventoryItemId",actual_quantity::float8 "actualQuantity",as_of::date::text "asOfDate",is_test_data "isTestData"
           FROM branch_inventory_balances
          WHERE branch_id=$1 AND inventory_item_id=ANY($2::uuid[])
          ORDER BY inventory_item_id FOR UPDATE`,
        [count.branchId, itemIds],
      );
      const actualByItem = new Map(countItems.rows.map((item) => [item.inventoryItemId, Number(item.actualQuantity)]));
      const balancesMatch = balances.rows.length === target.balanceCount && balances.rows.every((balance) =>
        !balance.isTestData && balance.asOfDate === count.countDate && Number(balance.actualQuantity) === actualByItem.get(balance.inventoryItemId));
      if (!balancesMatch)
        throw new AppError(409, "INVENTORY_COUNT_TEST_BALANCE_MISMATCH", "Gulod balance rows no longer exactly match the authorized physical-count snapshots");
      const classified = await client.query(
        `UPDATE branch_inventory_balances SET is_test_data=true
          WHERE branch_id=$1 AND inventory_item_id=ANY($2::uuid[]) AND NOT is_test_data`,
        [count.branchId, itemIds],
      );
      classifiedBalanceRows = classified.rowCount ?? 0;
      if (classifiedBalanceRows !== target.balanceCount)
        throw new AppError(409, "INVENTORY_COUNT_TEST_BALANCE_MISMATCH", "Not all validated Gulod balance rows were classified");
    }

    await client.query(`UPDATE shrinkage_reports SET is_test_data=true WHERE id=$1`, [linkedReports.rows[0]!.id]);
    const classifiedCount = await client.query(`UPDATE inventory_counts SET is_test_data=true WHERE id=$1 AND NOT is_test_data`, [id]);
    if (classifiedCount.rowCount !== 1)
      throw new AppError(409, "INVENTORY_COUNT_TEST_CLASSIFICATION_FAILED", "The physical count classification did not complete");
    await writeDestructiveActionAudit(
      req.user!,
      { module: "INVENTORY_COUNT", action: "CLASSIFY_UAT_TEST", recordId: id, reason: input.reason },
      `Classified physical count ${count.countNo} and its authorized dependencies as UAT/Test Data`,
      {
        branchId: count.branchId,
        countNo: count.countNo,
        countDate: count.countDate,
        countItemCount: countItems.rows.length,
        balanceRowsClassified: classifiedBalanceRows,
        shrinkageReportsClassified: linkedReports.rows.map((report) => ({ id: report.id, reportNo: report.reportNo, priorStatus: report.status })),
        preservedDependencies: ["COUNT_ITEMS", "NOTIFICATIONS", "INCIDENT_LINKS", "AUDIT_HISTORY"],
      },
      client,
    );
    await client.query("COMMIT");
    res.json({ success: true, data: { id, countNo: count.countNo, classified: true, balanceRowsClassified: classifiedBalanceRows, shrinkageReportNo: target.shrinkageReportNo } });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export const listInventoryVariances: RequestHandler = async (req, res) => {
  const filters = varianceFilters.parse(req.query);
  const pagination = paginationQuery.parse(req.query);
  const branchId = getEffectiveBranchId(req.user!, filters.branchId);
  const clauses: string[] = ["NOT ic.is_test_data", "ici.voided_at IS NULL"];
  const values: unknown[] = [];
  if (branchId) {
    values.push(branchId);
    clauses.push(`ic.branch_id=$${values.length}`);
  }
  if (filters.countDate) {
    values.push(filters.countDate);
    clauses.push(`ic.count_date=$${values.length}::date`);
  }
  const result = await pool.query(
    `SELECT ici.id "countItemId",ic.count_no "countNo",ic.count_date::text "countDate",
            b.id "branchId",b.name "branchName",ii.id "inventoryItemId",ii.sku,ii.name "itemName",
            ici.expected_quantity::float8 "expectedQuantity",ici.actual_quantity::float8 "actualQuantity",
            (ici.actual_quantity-ici.expected_quantity)::float8 "varianceQuantity",
            CASE WHEN ici.actual_quantity>ici.expected_quantity THEN abs(ici.variance_value)
                 WHEN ici.actual_quantity<ici.expected_quantity THEN -abs(ici.variance_value) ELSE 0 END::float8 "varianceValue",ici.unit,
            CASE WHEN ici.expected_quantity > 0 THEN (((ici.actual_quantity-ici.expected_quantity) / ici.expected_quantity) * 100)::float8 ELSE NULL END "variancePercentage",
            sr.id "anomalyId",sr.report_no "reportNo",sr.status "anomalyStatus",sr.classification,count(*) OVER()::int "__total"
       FROM inventory_count_items ici
       JOIN inventory_counts ic ON ic.id=ici.inventory_count_id
       JOIN branches b ON b.id=ic.branch_id
       JOIN inventory_items ii ON ii.id=ici.inventory_item_id
       LEFT JOIN shrinkage_reports sr ON sr.inventory_count_item_id=ici.id AND sr.archived_at IS NULL
      ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""}
      ORDER BY ic.count_date DESC,abs(ici.variance_value) DESC,ii.name LIMIT $${values.length+1} OFFSET $${values.length+2}`,
    [...values,pagination.pageSize,(pagination.page-1)*pagination.pageSize],
  );
  const page = paginatedRows(result.rows, pagination);
  res.json({ success: true, data: { variances: page.data, pagination: page.pagination } });
};

const shrinkageSelection = `SELECT sr.id,sr.report_no "reportNo",sr.status,sr.classification,sr.explanation,sr.supporting_notes "supportingNotes",
  sr.evidence_review_confirmed "evidenceReviewConfirmed",sr.evidence_basis "evidenceBasis",
  sr.expected_quantity::float8 "expectedQuantity",sr.actual_quantity::float8 "actualQuantity",
  (sr.actual_quantity-sr.expected_quantity)::float8 "varianceQuantity",
  CASE WHEN sr.actual_quantity>sr.expected_quantity THEN abs(sr.variance_value)
       WHEN sr.actual_quantity<sr.expected_quantity THEN -abs(sr.variance_value) ELSE 0 END::float8 "varianceValue",sr.unit,
  CASE WHEN sr.expected_quantity > 0 THEN (((sr.actual_quantity-sr.expected_quantity) / sr.expected_quantity) * 100)::float8 ELSE NULL END "variancePercentage",
  ic.count_date::text "countDate",sr.detected_at "detectedAt",sr.investigated_at "investigatedAt",sr.submitted_at "submittedAt",sr.reviewed_at "reviewedAt",b.id "branchId",b.name "branchName",ii.id "inventoryItemId",ii.sku,ii.name "inventoryItemName",
  mi.id "menuItemId",mi.name "menuItemName",concat(su.first_name,' ',su.last_name) "managerName",concat(ru.first_name,' ',ru.last_name) "reviewedByName"
  FROM shrinkage_reports sr JOIN branches b ON b.id=sr.branch_id JOIN inventory_items ii ON ii.id=sr.inventory_item_id
  JOIN inventory_count_items ici ON ici.id=sr.inventory_count_item_id JOIN inventory_counts ic ON ic.id=ici.inventory_count_id
  JOIN users su ON su.id=sr.submitted_by LEFT JOIN users ru ON ru.id=sr.reviewed_by LEFT JOIN menu_items mi ON mi.id=sr.menu_item_id`;

export const listShrinkageReports: RequestHandler = async (req, res) => {
  const filters = shrinkageFilters.parse(req.query);
  const pagination = paginationQuery.parse(req.query);
  const branchId = getEffectiveBranchId(req.user!, filters.branchId);
  const clauses: string[] = ["NOT sr.is_test_data", "sr.archived_at IS NULL"];
  const values: unknown[] = [];
  if (branchId) {
    values.push(branchId);
    clauses.push(`sr.branch_id=$${values.length}`);
  }
  if (filters.status) {
    values.push(filters.status);
    clauses.push(`sr.status=$${values.length}`);
  }
  if (filters.classification) {
    values.push(filters.classification);
    clauses.push(`sr.classification=$${values.length}`);
  }
  if (filters.inventoryItemId) {
    values.push(filters.inventoryItemId);
    clauses.push(`sr.inventory_item_id=$${values.length}`);
  }
  if (filters.startDate) {
    values.push(filters.startDate);
    clauses.push(`sr.detected_at >= $${values.length}::date`);
  }
  if (filters.endDate) {
    values.push(filters.endDate);
    clauses.push(`sr.detected_at < ($${values.length}::date + interval '1 day')`);
  }
  if (filters.incidentType) {
    values.push(filters.incidentType);
    clauses.push(`EXISTS (SELECT 1 FROM incident_shrinkage_links isl JOIN incident_reports ir ON ir.id=isl.incident_report_id WHERE NOT ir.is_test_data AND ir.archived_at IS NULL AND isl.shrinkage_report_id=sr.id AND ir.incident_type=$${values.length})`);
  }
  const result = await pool.query(
    `${shrinkageSelection.replace("SELECT ","SELECT count(*) OVER()::int \"__total\",")} ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""} ORDER BY CASE sr.status WHEN 'DETECTED' THEN 0 WHEN 'PENDING_REVIEW' THEN 1 ELSE 2 END,sr.detected_at DESC LIMIT $${values.length+1} OFFSET $${values.length+2}`,
    [...values,pagination.pageSize,(pagination.page-1)*pagination.pageSize],
  );
  const page = paginatedRows(result.rows, pagination);
  res.json({ success: true, data: { reports: page.data, pagination: page.pagination } });
};

export const getShrinkageReport: RequestHandler = async (req, res) => {
  const { id } = idParams.parse(req.params);
  const branchId = getEffectiveBranchId(req.user!);
  const result = await pool.query(
    `${shrinkageSelection} WHERE sr.id=$1 AND NOT sr.is_test_data AND sr.archived_at IS NULL ${branchId ? "AND sr.branch_id=$2" : ""}`,
    branchId ? [id, branchId] : [id],
  );
  if (!result.rows[0])
    throw new AppError(
      404,
      "SHRINKAGE_REPORT_NOT_FOUND",
      "Shrinkage report not found",
    );
  res.json({ success: true, data: { report: result.rows[0] } });
};

export const getShrinkageEvidence: RequestHandler = async (req, res) => {
  const { id } = idParams.parse(req.params);
  const branchId = getEffectiveBranchId(req.user!);
  const report = await pool.query<{
    branchId: string;
    inventoryItemId: string;
    countDate: string;
  }>(
    `SELECT sr.branch_id "branchId",sr.inventory_item_id "inventoryItemId",ic.count_date::text "countDate"
       FROM shrinkage_reports sr
       JOIN inventory_count_items ici ON ici.id=sr.inventory_count_item_id
       JOIN inventory_counts ic ON ic.id=ici.inventory_count_id
      WHERE sr.id=$1 AND NOT sr.is_test_data ${branchId ? "AND sr.branch_id=$2" : ""}`,
    branchId ? [id, branchId] : [id],
  );
  const context = report.rows[0];
  if (!context) throw new AppError(404, "SHRINKAGE_REPORT_NOT_FOUND", "Shrinkage report not found");

  const [incidents, movements, usage] = await Promise.all([
    pool.query(
      `SELECT ir.id,iri.id "incidentReportItemId",ir.incident_type "incidentType",iri.quantity::float8,iri.unit,ir.occurred_at "occurredAt",
              ir.reason,ir.notes,ir.photo_url "photoUrl",ir.status,ir.manager_comment "managerComment",
              concat(u.first_name,' ',u.last_name) "submittedByName",
              EXISTS (SELECT 1 FROM incident_shrinkage_links isl WHERE isl.incident_report_item_id=iri.id AND isl.shrinkage_report_id=$1) "explicitlyLinked"
         FROM incident_reports ir JOIN users u ON u.id=ir.submitted_by
         JOIN incident_report_items iri ON iri.incident_report_id=ir.id
        WHERE ir.branch_id=$2 AND iri.inventory_item_id=$3 AND NOT ir.is_test_data AND ir.archived_at IS NULL
          AND (
            EXISTS (SELECT 1 FROM incident_shrinkage_links isl WHERE isl.incident_report_item_id=iri.id AND isl.shrinkage_report_id=$1)
            OR (
              NOT EXISTS (SELECT 1 FROM incident_shrinkage_links isl WHERE isl.incident_report_item_id=iri.id)
              AND ir.status IN ('PENDING','VERIFIED')
              AND (ir.occurred_at AT TIME ZONE 'Asia/Manila')::date BETWEEN $4::date-7 AND $4::date+1
            )
          )
        ORDER BY EXISTS (SELECT 1 FROM incident_shrinkage_links isl WHERE isl.incident_report_item_id=iri.id AND isl.shrinkage_report_id=$1) DESC,ir.occurred_at DESC`,
      [id, context.branchId, context.inventoryItemId, context.countDate],
    ),
    pool.query(
      `SELECT movement_type "movementType",quantity::float8,occurred_at "occurredAt",reference_no "referenceNo",notes
         FROM inventory_movements
        WHERE branch_id=$1 AND inventory_item_id=$2 AND NOT is_test_data AND occurred_at::date BETWEEN $3::date-7 AND $3::date+7
        ORDER BY occurred_at DESC`,
      [context.branchId, context.inventoryItemId, context.countDate],
    ),
    pool.query(
      `SELECT pi.business_date::text date,coalesce(sum(u.quantity_consumed),0)::float8 "expectedUsage"
         FROM pos_sale_ingredient_usage u
         JOIN pos_sale_items psi ON psi.id=u.pos_sale_item_id
         JOIN pos_imports pi ON pi.id=psi.pos_import_id
       JOIN pos_sources source ON source.id=pi.pos_source_id AND source.status='ACTIVE'
        WHERE pi.branch_id=$1 AND u.inventory_item_id=$2 AND pi.business_date BETWEEN $3::date-7 AND $3::date
        GROUP BY pi.business_date ORDER BY pi.business_date DESC`,
      [context.branchId, context.inventoryItemId, context.countDate],
    ),
  ]);
  res.json({
    success: true,
    data: {
      evidence: {
        incidents: incidents.rows,
        movements: movements.rows,
        usage: usage.rows,
        aiSuggestion: null,
        aiAdvisoryLabel: "AI-assisted suggestion — requires Branch Manager verification.",
      },
    },
  });
};

export const submitShrinkageInvestigation: RequestHandler = async (
  req,
  res,
) => {
  const { id } = idParams.parse(req.params);
  const input = shrinkageInvestigationInput.parse(req.body);
  const branchId = requiredBranchId(req.user!);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (input.menuItemId) {
      const product = await client.query(
        `SELECT 1 FROM menu_items mi JOIN menu_item_branches mib ON mib.menu_item_id=mi.id
          WHERE mi.id=$1 AND mib.branch_id=$2 AND mi.status='ACTIVE' AND mi.approval_status='APPROVED'
            AND mib.availability_status='APPROVED' AND mib.is_active=true`,
        [input.menuItemId, branchId],
      );
      if (!product.rows[0]) throw new AppError(422, "MENU_ITEM_INVALID", "Select an active menu product available at your branch");
    }
    const investigated = await client.query<{
      reportNo: string;
      inventoryItemId: string;
      varianceQuantity: number;
      unit: string;
    }>(
      `UPDATE shrinkage_reports
          SET menu_item_id=$3,classification=$4,explanation=$5,supporting_notes=$6,
              evidence_review_confirmed=$7,evidence_basis=$8,
              verification_safeguard_version=1,
              status='VERIFIED',investigated_at=now(),submitted_at=now(),updated_at=now()
        WHERE id=$1 AND branch_id=$2 AND status='DETECTED'
        RETURNING report_no "reportNo",inventory_item_id "inventoryItemId",variance_quantity::float8 "varianceQuantity",unit`,
      [
        id,
        branchId,
        input.menuItemId ?? null,
        input.classification,
        input.explanation,
        input.supportingNotes ?? null,
        input.evidenceReviewConfirmed ?? false,
        input.evidenceBasis ?? [],
      ],
    );
    const row = investigated.rows[0];
    if (!row) {
      const existing = await client.query(
        `SELECT 1 FROM shrinkage_reports WHERE id=$1 AND branch_id=$2`,
        [id, branchId],
      );
      if (!existing.rows[0])
        throw new AppError(
          404,
          "SHRINKAGE_REPORT_NOT_FOUND",
          "Detected anomaly not found for your branch",
        );
      throw new AppError(
        409,
        "INVESTIGATION_ALREADY_SUBMITTED",
        "This anomaly has already been verified and submitted",
      );
    }
    const context = await client.query<{
      itemName: string;
      branchName: string;
    }>(
      `SELECT ii.name "itemName",b.name "branchName" FROM inventory_items ii CROSS JOIN branches b WHERE ii.id=$1 AND b.id=$2`,
      [row.inventoryItemId, branchId],
    );
    await client.query(
      `INSERT INTO notifications (recipient_user_id,branch_id,type,title,message,entity_type,entity_id)
        SELECT u.id,$1,'SHRINKAGE_SUBMITTED','Shrinkage Classification Verified',$2,'SHRINKAGE_REPORT',$3
          FROM users u WHERE role='OWNER' AND status='ACTIVE'
            AND NOT EXISTS (
              SELECT 1 FROM notifications n WHERE n.recipient_user_id=u.id AND n.type='SHRINKAGE_SUBMITTED'
                AND n.entity_type='SHRINKAGE_REPORT' AND n.entity_id=$3
            )`,
      [
        branchId,
        `${context.rows[0]!.branchName} verified classification for ${context.rows[0]!.itemName}. Shortage variance: ${Math.abs(row.varianceQuantity)}${row.unit}. Classification: ${input.classification.replace("_", " ")}.`,
        id,
      ],
    );
    await writeAudit(
      req.user!,
      input.classification === "PILFERAGE" ? "VERIFY_PILFERAGE_CLASSIFICATION" : "SUBMIT_SHRINKAGE_INVESTIGATION",
      "SHRINKAGE_REPORT",
      id,
      `Verified investigation findings for ${row.reportNo}`,
      { branchId, classification: input.classification, evidenceReviewConfirmed: input.evidenceReviewConfirmed ?? false, evidenceBasis: input.evidenceBasis ?? [] },
      client,
    );
    await client.query("COMMIT");
    const result = await pool.query(`${shrinkageSelection} WHERE sr.id=$1`, [
      id,
    ]);
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
    const reviewed = await client.query<{
      reportNo: string;
      submittedBy: string;
      branchId: string;
    }>(
      `UPDATE shrinkage_reports SET status='REVIEWED',reviewed_by=$2,reviewed_at=now(),updated_at=now()
        WHERE id=$1 AND status IN ('VERIFIED', 'PENDING_REVIEW')
        RETURNING report_no "reportNo",submitted_by "submittedBy",branch_id "branchId"`,
      [id, req.user!.id],
    );
    const row = reviewed.rows[0];
    if (!row) {
      const exists = await client.query(
        `SELECT 1 FROM shrinkage_reports WHERE id=$1`,
        [id],
      );
      if (!exists.rows[0])
        throw new AppError(
          404,
          "SHRINKAGE_REPORT_NOT_FOUND",
          "Shrinkage report not found",
        );
      throw new AppError(
        409,
        "ALREADY_REVIEWED",
        "This shrinkage report has already been reviewed",
      );
    }
    await client.query(
      `INSERT INTO notifications (recipient_user_id,branch_id,type,title,message,entity_type,entity_id)
        SELECT $1,$2,'SHRINKAGE_REVIEWED','Shrinkage Report Reviewed',$3,'SHRINKAGE_REPORT',$4
         WHERE NOT EXISTS (
           SELECT 1 FROM notifications n WHERE n.recipient_user_id=$1 AND n.type='SHRINKAGE_REVIEWED'
             AND n.entity_type='SHRINKAGE_REPORT' AND n.entity_id=$4
         )`,
      [
        row.submittedBy,
        row.branchId,
        `Your shrinkage report ${row.reportNo} has been reviewed by the Owner.`,
        id,
      ],
    );
    await writeAudit(
      req.user!,
      "REVIEW_SHRINKAGE_REPORT",
      "SHRINKAGE_REPORT",
      id,
      `Marked shrinkage report ${row.reportNo} as reviewed`,
      { branchId: row.branchId },
      client,
    );
    await client.query("COMMIT");
    const result = await pool.query(`${shrinkageSelection} WHERE sr.id=$1`, [
      id,
    ]);
    res.json({ success: true, data: { report: result.rows[0] } });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export const listNotifications: RequestHandler = async (req, res) => {
  const pagination = paginationQuery.parse(req.query);
  const result = await pool.query(
    `SELECT id,type,title,message,entity_type "entityType",entity_id "entityId",read_at "readAt",created_at "createdAt",count(*) OVER()::int "__total"
       FROM notifications WHERE recipient_user_id=$1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
    [req.user!.id,pagination.pageSize,(pagination.page-1)*pagination.pageSize],
  );
  const page = paginatedRows(result.rows, pagination);
  res.json({ success: true, data: { notifications: page.data, pagination: page.pagination } });
};

export const markNotificationRead: RequestHandler = async (req, res) => {
  const { id } = notificationIdParams.parse(req.params);
  const result = await pool.query(
    `UPDATE notifications SET read_at=COALESCE(read_at,now()) WHERE id=$1 AND recipient_user_id=$2 RETURNING id,read_at "readAt"`,
    [id, req.user!.id],
  );
  if (!result.rows[0])
    throw new AppError(404, "NOTIFICATION_NOT_FOUND", "Notification not found");
  res.json({ success: true, data: { notification: result.rows[0] } });
};

export const markAllNotificationsRead: RequestHandler = async (req, res) => {
  const result = await pool.query(
    `UPDATE notifications SET read_at=now() WHERE recipient_user_id=$1 AND read_at IS NULL RETURNING id`,
    [req.user!.id],
  );
  res.json({ success: true, data: { updated: result.rowCount ?? 0 } });
};
