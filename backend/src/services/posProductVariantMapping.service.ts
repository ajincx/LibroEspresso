import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { AppError } from "../utils/appError.js";
import type { ParsedPosRow, PosSourceFormat } from "./posCsvImport.service.js";

export const normalizePosIdentity = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();

export interface PosSourceRecord {
  id: string;
  sourceCode: string;
  displayName: string;
  supportedFormat: PosSourceFormat;
}

export interface PosMappingRecord {
  id: string;
  status: "ACTIVE" | "INACTIVE";
  branchId: string | null;
  sourceProductName: string;
  sourceProductCode: string | null;
  menuItemVariantId: string;
  menuItemId: string;
  menuItemName: string;
  variantName: string;
  variantStatus: "ACTIVE" | "INACTIVE";
  productStatus: "ACTIVE" | "INACTIVE";
  approvalStatus: string;
  branchAvailable: boolean;
  recipeValid: boolean;
  updatedAt: string;
}

export interface PosMappingResolution {
  status: "APPROVED" | "UNMATCHED" | "AMBIGUOUS";
  scope: "BRANCH" | "GLOBAL" | null;
  mappingId: string | null;
  menuItemId: string | null;
  menuItemVariantId: string | null;
  menuItemName: string | null;
  variantName: string | null;
  issue: string | null;
  version: string | null;
}

export function resolvePosMapping(row: ParsedPosRow, branchId: string, mappings: readonly PosMappingRecord[]): PosMappingResolution {
  const name = normalizePosIdentity(row.sourceProductName ?? row.sourceProduct);
  const code = row.sourceProductId ? normalizePosIdentity(row.sourceProductId) : null;
  const candidates = mappings.filter((mapping) => {
    if (mapping.status !== "ACTIVE") return false;
    if (mapping.branchId !== null && mapping.branchId !== branchId) return false;
    if (code) return mapping.sourceProductCode !== null && normalizePosIdentity(mapping.sourceProductCode) === code;
    return mapping.sourceProductCode === null && normalizePosIdentity(mapping.sourceProductName) === name;
  });
  const scoped = candidates.some((mapping) => mapping.branchId === branchId)
    ? candidates.filter((mapping) => mapping.branchId === branchId)
    : candidates.filter((mapping) => mapping.branchId === null);
  const matching = code ? scoped.filter((mapping) => normalizePosIdentity(mapping.sourceProductName) === name) : scoped;
  const empty = (status: "UNMATCHED" | "AMBIGUOUS", issue: string): PosMappingResolution => ({
    status, scope: null, mappingId: null, menuItemId: null, menuItemVariantId: null,
    menuItemName: null, variantName: null, issue, version: null,
  });
  if (code && scoped.length && !matching.length) return empty("UNMATCHED", "POS product code and name disagree with the approved mapping.");
  if (!matching.length) return empty("UNMATCHED", "No approved exact POS product/variant mapping exists for this source and branch.");
  if (matching.length > 1) return empty("AMBIGUOUS", "Multiple approved targets match this POS item.");
  const mapping = matching[0]!;
  if (mapping.variantStatus !== "ACTIVE" || mapping.productStatus !== "ACTIVE" || mapping.approvalStatus !== "APPROVED" || !mapping.branchAvailable) {
    return empty("UNMATCHED", "The mapped product or variant is not active and approved for this branch.");
  }
  return {
    status: "APPROVED", scope: mapping.branchId ? "BRANCH" : "GLOBAL", mappingId: mapping.id,
    menuItemId: mapping.menuItemId, menuItemVariantId: mapping.menuItemVariantId,
    menuItemName: mapping.menuItemName, variantName: mapping.variantName, issue: null,
    version: `${mapping.id}:${mapping.updatedAt}`,
  };
}

export function posResolutionFingerprint(sourceId: string | null, rows: readonly { menuItemId: string | null; menuItemVariantId?: string | null; mappingId?: string | null; mappingVersion?: string | null; recipeVersionId?: string | null }[]) {
  return createHash("sha256").update(JSON.stringify({ sourceId, rows: rows.map((row) => [row.menuItemId, row.menuItemVariantId ?? null, row.mappingId ?? null, row.mappingVersion ?? null, row.recipeVersionId ?? null]) })).digest("hex");
}

export async function loadPosSource(client: Pick<PoolClient, "query">, id: string, format: PosSourceFormat): Promise<PosSourceRecord> {
  const result = await client.query<PosSourceRecord>(
    `SELECT id,source_code "sourceCode",display_name "displayName",supported_format "supportedFormat"
       FROM pos_sources WHERE id=$1 AND status='ACTIVE' FOR SHARE`, [id],
  );
  const source = result.rows[0];
  if (!source) throw new AppError(422, "POS_SOURCE_UNAVAILABLE", "Select a configured, active POS source before previewing or importing.");
  if (source.supportedFormat !== format) throw new AppError(422, "POS_SOURCE_FORMAT_MISMATCH", "The selected POS source does not use the detected file format.");
  return source;
}

export async function loadPosMappings(client: Pick<PoolClient, "query">, sourceId: string, branchId: string, businessDate: string | null): Promise<PosMappingRecord[]> {
  const result = await client.query<PosMappingRecord>(
    `SELECT pm.id,pm.status,pm.branch_id "branchId",pm.source_product_name "sourceProductName",
            pm.source_product_code "sourceProductCode",pm.menu_item_variant_id "menuItemVariantId",
            m.id "menuItemId",m.name "menuItemName",v.name "variantName",v.status "variantStatus",
            m.status "productStatus",m.approval_status "approvalStatus",
            (mib.availability_status='APPROVED' AND mib.is_active) "branchAvailable",
            EXISTS(SELECT 1 FROM recipes r JOIN recipe_items ri ON ri.recipe_id=r.id
              WHERE r.menu_item_variant_id=v.id AND r.status='ACTIVE' AND r.effective_from<=$3::date
                AND (r.effective_to IS NULL OR r.effective_to>$3::date)) "recipeValid",
            pm.updated_at::text "updatedAt"
       FROM pos_product_variant_mappings pm
       JOIN menu_item_variants v ON v.id=pm.menu_item_variant_id
       JOIN menu_items m ON m.id=v.menu_item_id
       LEFT JOIN menu_item_branches mib ON mib.menu_item_id=m.id AND mib.branch_id=$2
      WHERE pm.pos_source_id=$1 AND (pm.branch_id IS NULL OR pm.branch_id=$2) AND pm.status='ACTIVE'
      FOR SHARE OF pm,v,m`,
    [sourceId, branchId, businessDate],
  );
  return result.rows;
}
