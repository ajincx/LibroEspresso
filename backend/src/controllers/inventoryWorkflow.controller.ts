import type { RequestHandler } from "express";
import type { PoolClient } from "pg";
import { pool } from "../config/database.js";
import { env } from "../config/env.js";
import { calculateExpectedInventory } from "../services/inventoryCalculation.service.js";
import { calculateFinancialSummary } from "../services/financialMetrics.service.js";
import { matchPosRows, parsePosCsv, PosCsvError, summarizePosRows, type MatchedPosRow, type PosMenuCandidate } from "../services/posCsvImport.service.js";
import { getEffectiveBranchId } from "../services/branchScope.js";
import { writeAudit } from "../services/audit.service.js";
import { VERIFIED_SHRINKAGE_CLASSIFICATIONS_SQL } from "../services/shrinkageWorkflow.service.js";
import { createIngredientUsageSnapshots } from "../services/recipeVersion.service.js";
import { manilaBusinessDate } from "../services/businessTime.service.js";
import { areUnitsCompatible } from "../services/unitConversion.service.js";
import { AppError } from "../utils/appError.js";
import { idParams } from "../validators/masterData.js";
import { paginatedRows, paginationQuery } from "../validators/pagination.js";
import {
  inventoryCountInput,
  inventoryMovementInput,
  notificationIdParams,
  posAnalyticsFilters,
  posImportInput,
  posPreviewInput,
  shrinkageFilters,
  shrinkageInvestigationInput,
  varianceFilters,
} from "../validators/inventoryWorkflow.js";

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

type PosPreviewProduct = PosMenuCandidate & { recipeValid: boolean };
type PosPreviewProductRow = PosMenuCandidate & {
  recipeVersionId: string | null;
  recipeUnits: Array<{ recipeUnit: string; inventoryUnit: string }>;
};

async function buildPosPreview(
  branchId: string,
  source: { sourceFilename: string; csvText: string },
  client: Pick<PoolClient, "query"> = pool,
) {
  const previewStartedAt = performance.now();
  let parsed: ReturnType<typeof parsePosCsv>;
  const parseStartedAt = performance.now();
  try {
    parsed = parsePosCsv(source.csvText);
  } catch (error) {
    if (error instanceof PosCsvError) throw new AppError(422, error.code, error.message);
    throw error;
  }
  const parseMs = performance.now() - parseStartedAt;
  const lookupStartedAt = performance.now();
  const [branch, products] = await Promise.all([
    client.query<{ branchName: string }>(`SELECT name "branchName" FROM branches WHERE id=$1 AND status='ACTIVE'`, [branchId]),
    client.query<PosPreviewProductRow>(
      `SELECT mi.id,mi.code,mi.name,mi.selling_price::float8 "sellingPrice",
              r.id "recipeVersionId",
              COALESCE(json_agg(json_build_object('recipeUnit',ri.unit,'inventoryUnit',ii.unit))
                FILTER (WHERE ri.id IS NOT NULL),'[]') "recipeUnits"
         FROM menu_items mi
         JOIN menu_item_branches mib ON mib.menu_item_id=mi.id AND mib.branch_id=$1
         LEFT JOIN LATERAL (SELECT candidate.* FROM recipes candidate
           WHERE candidate.menu_item_id=mi.id AND candidate.status='ACTIVE'
             AND candidate.effective_from<=$2::date
             AND (candidate.effective_to IS NULL OR candidate.effective_to>$2::date)
           ORDER BY candidate.effective_from DESC LIMIT 1) r ON true
         LEFT JOIN recipe_items ri ON ri.recipe_id=r.id
         LEFT JOIN inventory_items ii ON ii.id=ri.inventory_item_id
        WHERE mi.status='ACTIVE' AND mi.approval_status='APPROVED'
          AND mib.availability_status='APPROVED' AND mib.is_active=true
        GROUP BY mi.id,r.id ORDER BY mi.name`,
      [branchId, parsed.businessDate],
    ),
  ]);
  const productLookupMs = performance.now() - lookupStartedAt;
  const matchingStartedAt = performance.now();
  const validatedProducts:PosPreviewProduct[]=products.rows.map((product)=>({
    ...product,
    recipeValid:Boolean(product.recipeVersionId)&&product.recipeUnits.length>0&&product.recipeUnits.every((item)=>areUnitsCompatible(item.recipeUnit,item.inventoryUnit)),
  }));
  const productMap = new Map(validatedProducts.map((product) => [product.id, product]));
  const rows = matchPosRows(parsed.rows, validatedProducts).map((row): MatchedPosRow => {
    if (!row.menuItemId || row.status === "INVALID") return row;
    const product = productMap.get(row.menuItemId);
    if (product?.recipeValid) return row;
    return { ...row, status: "INVALID", issues: [...row.issues, "Matched product does not have a valid active recipe with matching ingredient units."] };
  });
  const matchAndValidationMs = performance.now() - matchingStartedAt;
  const duplicateStartedAt = performance.now();
  const existing = parsed.businessDate
    ? await client.query<{ id: string }>(
        `SELECT id FROM pos_imports WHERE branch_id=$1 AND business_date=$2 AND content_hash=$3 LIMIT 1`,
        [branchId, parsed.businessDate, parsed.contentHash],
      )
    : { rows: [] as { id: string }[] };
  const duplicateCheckMs = performance.now() - duplicateStartedAt;
  const summary = summarizePosRows(rows, existing.rows.length > 0);
  return {
    sourceFilename: source.sourceFilename,
    branchId,
    branchName: branch.rows[0]?.branchName ?? "Assigned Branch",
    businessDate: parsed.businessDate,
    contentHash: parsed.contentHash,
    fingerprintIndicator: parsed.contentHash.slice(0, 12),
    rows,
    summary,
    benchmark: { parseMs, productLookupMs, matchAndValidationMs, duplicateCheckMs, previewTotalMs: performance.now() - previewStartedAt },
  };
}

export const previewPosSales: RequestHandler = async (req, res) => {
  const input = posPreviewInput.parse(req.body);
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

export const importPosSales: RequestHandler = async (req, res) => {
  const importStartedAt = performance.now();
  const input = posImportInput.parse(req.body);
  const branchId = requiredBranchId(req.user!);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const preview = await buildPosPreview(branchId, input, client);
    if (preview.contentHash !== input.expectedContentHash) throw new AppError(409, "POS_PREVIEW_CHANGED", "The selected CSV changed after preview. Preview it again before importing.");
    if (preview.summary.duplicate) throw new AppError(409, "POS_IMPORT_DUPLICATE", "This POS file appears to have already been imported for this branch.");
    if (!preview.summary.canImport || !preview.businessDate) throw new AppError(422, "POS_IMPORT_INVALID", "POS import was not completed because the preview contains invalid or unmatched rows.");
    const importRows = preview.rows.filter((row): row is MatchedPosRow & { menuItemId: string; quantitySold: number; unitPrice: number; businessDate: string } => Boolean(row.menuItemId) && row.quantitySold !== null && row.unitPrice !== null && row.businessDate !== null && row.status !== "INVALID");
    const imported = await client.query<{ id: string }>(
      `INSERT INTO pos_imports (branch_id,business_date,source_filename,imported_by,content_hash,total_source_rows,valid_rows,warning_rows,invalid_rows,unmatched_rows,import_status,completed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,0,0,$9,now()) RETURNING id`,
      [branchId, preview.businessDate, input.sourceFilename, req.user!.id, preview.contentHash, preview.summary.totalSourceRows, preview.summary.validRows, preview.summary.warningRows, preview.summary.quality],
    );
    const importId = imported.rows[0]!.id;
    const salesInsertStartedAt = performance.now();
    await client.query(
      `INSERT INTO pos_sale_items (pos_import_id,branch_id,business_date,menu_item_id,quantity_sold,unit_price_snapshot,source_product,source_transaction_id,source_line_id,transaction_timestamp)
       SELECT $1,$2,$3,source.menu_item_id,source.quantity_sold,source.unit_price,source.source_product,source.transaction_id,source.line_id,source.transaction_timestamp
       FROM unnest($4::uuid[],$5::numeric[],$6::numeric[],$7::text[],$8::text[],$9::text[],$10::timestamptz[])
         AS source(menu_item_id,quantity_sold,unit_price,source_product,transaction_id,line_id,transaction_timestamp)`,
      [importId,branchId,preview.businessDate,importRows.map((item)=>item.menuItemId),importRows.map((item)=>item.quantitySold),importRows.map((item)=>item.unitPrice),importRows.map((item)=>item.sourceProduct),importRows.map((item)=>item.transactionId),importRows.map((item)=>item.sourceLineId),importRows.map((item)=>item.transactionTimestamp)],
    );
    const salesInsertMs = performance.now() - salesInsertStartedAt;
    const usageStartedAt = performance.now();
    await createIngredientUsageSnapshots(client,importId);
    const ingredientUsageMs = performance.now() - usageStartedAt;
    const consumption = await client.query(
      `SELECT ii.id "inventoryItemId",ii.sku,ii.name,usage.unit,
              sum(usage.quantity_consumed)::float8 "expectedConsumption"
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
    }
    await writeAudit(
      req.user!,
      "IMPORT_POS_SALES",
      "POS_IMPORT",
      importId,
      `Imported ${importRows.length} POS sales rows`,
      { branchId, businessDate: preview.businessDate, rowCount: importRows.length, totalQuantity: meta?.unitsSold ?? 0, totalSales: meta?.totalSales ?? 0, fingerprintIndicator: preview.fingerprintIndicator },
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
          consumption: consumption.rows,
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
  const requestedBranchId =
    typeof req.query.branchId === "string" ? req.query.branchId : undefined;
  const branchId = getEffectiveBranchId(req.user!, requestedBranchId);
  const result = await pool.query(
    `SELECT pi.id,pi.business_date::text "businessDate",pi.source_filename "sourceFilename",
            pi.imported_at "importedAt",pi.import_status "status",pi.total_source_rows "totalRows",
            pi.valid_rows "validRows",pi.warning_rows "warningRows",pi.invalid_rows "invalidRows",pi.unmatched_rows "unmatchedRows",
            CASE WHEN pi.content_hash IS NULL THEN NULL ELSE left(pi.content_hash,12) END "fingerprintIndicator",
            b.id "branchId",b.name "branchName",
            concat(u.first_name,' ',u.last_name) "importedBy",count(*) OVER()::int "__total",
            count(psi.id)::int "productLines",
            coalesce(sum(psi.quantity_sold),0)::float8 "unitsSold",
            coalesce(sum(psi.quantity_sold*coalesce(psi.unit_price_snapshot,mi.selling_price)),0)::float8 "totalSales"
       FROM pos_imports pi
       JOIN branches b ON b.id=pi.branch_id
       JOIN users u ON u.id=pi.imported_by
       LEFT JOIN pos_sale_items psi ON psi.pos_import_id=pi.id
       LEFT JOIN menu_items mi ON mi.id=psi.menu_item_id
      ${branchId ? "WHERE pi.branch_id=$1" : ""}
      GROUP BY pi.id,b.id,u.id
      ORDER BY pi.business_date DESC,pi.imported_at DESC
      LIMIT $${branchId ? 2 : 1} OFFSET $${branchId ? 3 : 2}`,
    branchId ? [branchId, pagination.pageSize, (pagination.page-1)*pagination.pageSize] : [pagination.pageSize, (pagination.page-1)*pagination.pageSize],
  );
  const page = paginatedRows(result.rows, pagination);
  res.json({ success: true, data: { imports: page.data, pagination: page.pagination } });
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

  const [scope, summary, trends, products, ingredients, variance, verifiedVariance] =
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
        `SELECT coalesce(sum(greatest(ici.variance_value,0)),0)::float8 "detectedShortageValue"
         FROM inventory_counts ic JOIN inventory_count_items ici ON ici.inventory_count_id=ic.id
        WHERE ic.count_date BETWEEN $1::date AND $2::date ${branchId ? `AND ic.branch_id=$3` : ""}`,
        params,
      ),
      pool.query(
        `SELECT coalesce(sum(greatest(sr.variance_value,0)),0)::float8 "verifiedShrinkageCost"
         FROM shrinkage_reports sr
        WHERE sr.detected_at::date BETWEEN $1::date AND $2::date
          AND sr.status IN ('VERIFIED', 'REVIEWED')
           AND sr.classification IN (${VERIFIED_SHRINKAGE_CLASSIFICATIONS_SQL})
          ${branchId ? `AND sr.branch_id=$3` : ""}`,
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
  const verifiedShrinkageCost = Number(
    (verifiedVariance.rows[0] as { verifiedShrinkageCost: number }).verifiedShrinkageCost ?? 0,
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
  const itemIds = await pool.query<{ id: string }>(
    `SELECT id FROM inventory_items WHERE status='ACTIVE'
    AND (item_scope='GLOBAL' OR origin_branch_id=$1) ORDER BY name`,
    [branchId],
  );
  const items = [];
  for (const item of itemIds.rows)
    items.push(
      await calculateExpectedInventory(pool, branchId, item.id, countDate),
    );
  res.json({ success: true, data: { branchId, countDate, items } });
};

export const submitInventoryCount: RequestHandler = async (req, res) => {
  const input = inventoryCountInput.parse(req.body);
  const branchId = requiredBranchId(req.user!);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const rulesResult = await client.query<{ tolerance: number }>(
      `SELECT variance_tolerance_quantity::float8 tolerance FROM calculation_settings WHERE singleton=true`,
    );
    const varianceTolerance = Number(rulesResult.rows[0]?.tolerance ?? 0.0001);
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
      const varianceQuantity =
        expected.expectedQuantity - submitted.actualQuantity;
      const varianceValue = varianceQuantity * expected.unitCost;
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
          submitted.actualQuantity,
          varianceQuantity,
          varianceValue,
          expected.unit,
        ],
      );
      await client.query(
        `INSERT INTO branch_inventory_balances (branch_id,inventory_item_id,actual_quantity,as_of)
         VALUES ($1,$2,$3,$4::date + time '23:59:59')
         ON CONFLICT (branch_id,inventory_item_id) DO UPDATE SET actual_quantity=excluded.actual_quantity,as_of=excluded.as_of,updated_at=now()`,
        [
          branchId,
          submitted.inventoryItemId,
          submitted.actualQuantity,
          input.countDate,
        ],
      );
      const countItem = inserted.rows[0] as { id: string };
      let shrinkageReportId: string | null = null;
      if (varianceQuantity > varianceTolerance) {
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
            submitted.actualQuantity,
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
            `${expected.itemName} has a detected shortage of ${varianceQuantity.toFixed(2)}${expected.unit} below expected stock. Investigation is required.`,
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
  const branchId = requiredBranchId(req.user!);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const count = await client.query<{ countNo: string; countDate: string }>(
      `SELECT count_no "countNo",count_date::text "countDate" FROM inventory_counts
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
      `SELECT 1 FROM inventory_counts WHERE branch_id=$1 AND count_date>$2::date LIMIT 1`,
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
    const rulesResult = await client.query<{ tolerance: number }>(
      `SELECT variance_tolerance_quantity::float8 tolerance FROM calculation_settings WHERE singleton=true`,
    );
    const varianceTolerance = Number(rulesResult.rows[0]?.tolerance ?? 0.0001);
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
      const expectedQty = Number(row.expectedQuantity);
      const varianceQuantity = expectedQty - submitted.actualQuantity;
      const varianceValue = varianceQuantity * Number(row.unitCost);
      const variancePercentage = expectedQty > 0 ? (varianceQuantity / expectedQty) * 100 : null;
      await client.query(
        `UPDATE inventory_count_items SET actual_quantity=$2,variance_quantity=$3,variance_value=$4 WHERE id=$1`,
        [row.id, submitted.actualQuantity, varianceQuantity, varianceValue],
      );
      await client.query(
        `UPDATE branch_inventory_balances SET actual_quantity=$3,as_of=$4::date+time '23:59:59',updated_at=now()
          WHERE branch_id=$1 AND inventory_item_id=$2`,
        [
          branchId,
          row.inventoryItemId,
          submitted.actualQuantity,
          input.countDate,
        ],
      );
      let shrinkageReportId = row.shrinkageReportId;
      if (varianceQuantity > varianceTolerance && shrinkageReportId) {
        await client.query(
          `UPDATE shrinkage_reports SET actual_quantity=$2,variance_quantity=$3,variance_value=$4,updated_at=now() WHERE id=$1 AND status='DETECTED'`,
          [
            shrinkageReportId,
            submitted.actualQuantity,
            varianceQuantity,
            varianceValue,
          ],
        );
      } else if (varianceQuantity > varianceTolerance) {
        const reportNo = await client.query<{ reportNo: string }>(
          `SELECT 'SR-'||to_char(now(),'YYYY')||'-'||lpad(nextval('shrinkage_report_number_seq')::text,5,'0') "reportNo"`,
        );
        const anomaly = await client.query<{ id: string }>(
          `INSERT INTO shrinkage_reports
            (report_no,branch_id,inventory_item_id,inventory_count_item_id,expected_quantity,actual_quantity,variance_quantity,variance_value,unit,status,submitted_by,detected_at)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'DETECTED',$10,now()) RETURNING id`,
          [
            reportNo.rows[0]!.reportNo,
            branchId,
            row.inventoryItemId,
            row.id,
            row.expectedQuantity,
            submitted.actualQuantity,
            varianceQuantity,
            varianceValue,
            row.unit,
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
            `${row.itemName} has a detected shortage of ${varianceQuantity.toFixed(2)}${row.unit} below expected stock. Investigation is required.`,
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
        actualQuantity: submitted.actualQuantity,
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
              (ic.submitted_by=$1 AND NOT EXISTS(SELECT 1 FROM inventory_counts newer WHERE newer.branch_id=ic.branch_id AND (newer.count_date,newer.submitted_at)>(ic.count_date,ic.submitted_at))
                AND NOT EXISTS(SELECT 1 FROM inventory_count_items ci JOIN shrinkage_reports sr ON sr.inventory_count_item_id=ci.id WHERE ci.inventory_count_id=ic.id AND sr.status<>'DETECTED')) "canEdit",
              concat(u.first_name,' ',u.last_name) "submittedBy",count(ici.id)::int "itemCount",count(*) OVER()::int "__total",
              (count(ici.id) FILTER (WHERE abs(ici.variance_quantity)>0.0001))::int "varianceCount"
       FROM inventory_counts ic JOIN branches b ON b.id=ic.branch_id JOIN users u ON u.id=ic.submitted_by
       LEFT JOIN inventory_count_items ici ON ici.inventory_count_id=ic.id
      WHERE ($2::uuid IS NULL OR ic.branch_id=$2)
      GROUP BY ic.id,b.id,u.id ORDER BY ic.count_date DESC,ic.submitted_at DESC LIMIT $3 OFFSET $4`,
    [req.user!.id, branchId ?? null, pagination.pageSize, (pagination.page-1)*pagination.pageSize],
  );
  const page = paginatedRows(result.rows, pagination);
  res.json({ success: true, data: { counts: page.data, pagination: page.pagination } });
};

export const getInventoryCount: RequestHandler = async (req, res) => {
  const { id } = idParams.parse(req.params);
  const branchId = getEffectiveBranchId(req.user!);
  const count = await pool.query(
    `SELECT ic.id,ic.count_no "countNo",ic.count_date::text "countDate",ic.branch_id "branchId",
      (ic.submitted_by=$3 AND NOT EXISTS(SELECT 1 FROM inventory_counts n WHERE n.branch_id=ic.branch_id AND (n.count_date,n.submitted_at)>(ic.count_date,ic.submitted_at))
       AND NOT EXISTS(SELECT 1 FROM inventory_count_items ci JOIN shrinkage_reports sr ON sr.inventory_count_item_id=ci.id WHERE ci.inventory_count_id=ic.id AND sr.status<>'DETECTED')) "canEdit"
     FROM inventory_counts ic WHERE ic.id=$1 AND ($2::uuid IS NULL OR ic.branch_id=$2)`, [id,branchId ?? null,req.user!.id]);
  if (!count.rows[0]) throw new AppError(404,"INVENTORY_COUNT_NOT_FOUND","Count not found for your branch");
  const items = await pool.query(`SELECT ici.id,ici.inventory_item_id "inventoryItemId",ii.sku,ii.name "itemName",ici.unit,
    ici.previous_actual_quantity::float8 "previousActualQuantity",ici.stock_received::float8 "stockReceived",
    ici.expected_consumption::float8 "expectedConsumption",ici.approved_adjustments::float8 "approvedAdjustments",
    ici.expected_quantity::float8 "expectedQuantity",ici.actual_quantity::float8 "actualQuantity",
    ici.variance_quantity::float8 "varianceQuantity",ici.variance_value::float8 "varianceValue",
    CASE WHEN ici.expected_quantity > 0 THEN ((ici.variance_quantity / ici.expected_quantity) * 100)::float8 ELSE NULL END "variancePercentage",
    sr.id "shrinkageReportId",(sr.status='DETECTED') "requiresInvestigation"
    FROM inventory_count_items ici JOIN inventory_items ii ON ii.id=ici.inventory_item_id
    LEFT JOIN shrinkage_reports sr ON sr.inventory_count_item_id=ici.id
    WHERE ici.inventory_count_id=$1 ORDER BY ii.name`,[id]);
  res.json({success:true,data:{count:{...count.rows[0],items:items.rows}}});
};

export const listInventoryVariances: RequestHandler = async (req, res) => {
  const filters = varianceFilters.parse(req.query);
  const pagination = paginationQuery.parse(req.query);
  const branchId = getEffectiveBranchId(req.user!, filters.branchId);
  const clauses: string[] = [];
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
            ici.variance_quantity::float8 "varianceQuantity",ici.variance_value::float8 "varianceValue",ici.unit,
            CASE WHEN ici.expected_quantity > 0 THEN ((ici.variance_quantity / ici.expected_quantity) * 100)::float8 ELSE NULL END "variancePercentage",
            sr.id "anomalyId",sr.report_no "reportNo",sr.status "anomalyStatus",sr.classification,count(*) OVER()::int "__total"
       FROM inventory_count_items ici
       JOIN inventory_counts ic ON ic.id=ici.inventory_count_id
       JOIN branches b ON b.id=ic.branch_id
       JOIN inventory_items ii ON ii.id=ici.inventory_item_id
       LEFT JOIN shrinkage_reports sr ON sr.inventory_count_item_id=ici.id
      ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""}
      ORDER BY ic.count_date DESC,abs(ici.variance_value) DESC,ii.name LIMIT $${values.length+1} OFFSET $${values.length+2}`,
    [...values,pagination.pageSize,(pagination.page-1)*pagination.pageSize],
  );
  const page = paginatedRows(result.rows, pagination);
  res.json({ success: true, data: { variances: page.data, pagination: page.pagination } });
};

const shrinkageSelection = `SELECT sr.id,sr.report_no "reportNo",sr.status,sr.classification,sr.explanation,sr.supporting_notes "supportingNotes",
  sr.evidence_review_confirmed "evidenceReviewConfirmed",sr.evidence_basis "evidenceBasis",
  sr.expected_quantity::float8 "expectedQuantity",sr.actual_quantity::float8 "actualQuantity",sr.variance_quantity::float8 "varianceQuantity",sr.variance_value::float8 "varianceValue",sr.unit,
  CASE WHEN sr.expected_quantity > 0 THEN ((sr.variance_quantity / sr.expected_quantity) * 100)::float8 ELSE NULL END "variancePercentage",
  ic.count_date::text "countDate",sr.detected_at "detectedAt",sr.investigated_at "investigatedAt",sr.submitted_at "submittedAt",sr.reviewed_at "reviewedAt",b.id "branchId",b.name "branchName",ii.id "inventoryItemId",ii.sku,ii.name "inventoryItemName",
  mi.id "menuItemId",mi.name "menuItemName",concat(su.first_name,' ',su.last_name) "managerName",concat(ru.first_name,' ',ru.last_name) "reviewedByName"
  FROM shrinkage_reports sr JOIN branches b ON b.id=sr.branch_id JOIN inventory_items ii ON ii.id=sr.inventory_item_id
  JOIN inventory_count_items ici ON ici.id=sr.inventory_count_item_id JOIN inventory_counts ic ON ic.id=ici.inventory_count_id
  JOIN users su ON su.id=sr.submitted_by LEFT JOIN users ru ON ru.id=sr.reviewed_by LEFT JOIN menu_items mi ON mi.id=sr.menu_item_id`;

export const listShrinkageReports: RequestHandler = async (req, res) => {
  const filters = shrinkageFilters.parse(req.query);
  const pagination = paginationQuery.parse(req.query);
  const branchId = getEffectiveBranchId(req.user!, filters.branchId);
  const clauses: string[] = [];
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
    clauses.push(`EXISTS (SELECT 1 FROM incident_reports ir WHERE ir.shrinkage_report_id=sr.id AND ir.incident_type=$${values.length})`);
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
    `${shrinkageSelection} WHERE sr.id=$1 ${branchId ? "AND sr.branch_id=$2" : ""}`,
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
      WHERE sr.id=$1 ${branchId ? "AND sr.branch_id=$2" : ""}`,
    branchId ? [id, branchId] : [id],
  );
  const context = report.rows[0];
  if (!context) throw new AppError(404, "SHRINKAGE_REPORT_NOT_FOUND", "Shrinkage report not found");

  const [incidents, movements, usage] = await Promise.all([
    pool.query(
      `SELECT ir.id,ir.incident_type "incidentType",ir.quantity::float8,ir.occurred_at "occurredAt",
              ir.reason,ir.notes,ir.photo_url "photoUrl",ir.status,ir.manager_comment "managerComment",
              concat(u.first_name,' ',u.last_name) "submittedByName",
              (ir.shrinkage_report_id=$1) "explicitlyLinked"
         FROM incident_reports ir JOIN users u ON u.id=ir.submitted_by
        WHERE ir.branch_id=$2 AND ir.inventory_item_id=$3
          AND (ir.shrinkage_report_id=$1 OR (ir.shrinkage_report_id IS NULL AND ir.occurred_at::date BETWEEN $4::date-7 AND $4::date+7))
        ORDER BY (ir.shrinkage_report_id=$1) DESC,ir.occurred_at DESC`,
      [id, context.branchId, context.inventoryItemId, context.countDate],
    ),
    pool.query(
      `SELECT movement_type "movementType",quantity::float8,occurred_at "occurredAt",reference_no "referenceNo",notes
         FROM inventory_movements
        WHERE branch_id=$1 AND inventory_item_id=$2 AND occurred_at::date BETWEEN $3::date-7 AND $3::date+7
        ORDER BY occurred_at DESC`,
      [context.branchId, context.inventoryItemId, context.countDate],
    ),
    pool.query(
      `SELECT pi.business_date::text date,coalesce(sum(u.quantity_consumed),0)::float8 "expectedUsage"
         FROM pos_sale_ingredient_usage u
         JOIN pos_sale_items psi ON psi.id=u.pos_sale_item_id
         JOIN pos_imports pi ON pi.id=psi.pos_import_id
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
        `${context.rows[0]!.branchName} verified classification for ${context.rows[0]!.itemName}. Shortage variance: ${row.varianceQuantity}${row.unit}. Classification: ${input.classification.replace("_", " ")}.`,
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
