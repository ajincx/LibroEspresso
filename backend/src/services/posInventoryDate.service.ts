import type { PoolClient } from "pg";

export interface AffectedInventoryCountPeriod {
  id: string;
  countNo: string;
  countDate: string;
  affectedItemCount: number;
  varianceCount: number;
}

export interface PosInventoryDateAssessment {
  lateHistoricalImport: boolean;
  latestBaselineDate: string | null;
  affectedCountPeriods: AffectedInventoryCountPeriod[];
}

export interface HistoricalPosCheckpointCoverage {
  laterInventoryCheckpoint: boolean;
  firstCheckpoint: { countNo: string; countType: "OPENING" | "CLOSING" | "FULL" } | null;
  affectedIngredientCount: number;
  coveredIngredientCount: number;
  uncoveredIngredientCount: number;
  inventoryAccountingTreatment: "OPERATIONAL" | "HISTORICAL_REPORTING_CUTOVER";
  cogsCostBasis: "IMPORT_TIME_CONFIGURED_COST" | "HISTORICAL_CONFIGURED_COST_ESTIMATE";
  accountingReason: string | null;
}

/**
 * Resolves one immutable accounting treatment for the whole import. Complete
 * later item coverage is safe for the operational ledger. If finalized branch
 * inventory exists but item coverage is incomplete, accepted sales, usage,
 * COGS, and forecast evidence are retained while that import's usage is
 * explicitly excluded from live stock calculations. The caller must hold the
 * branch inventory-operation lock for the transaction.
 */
export async function resolveHistoricalPosInventoryTreatment(
  client: Pick<PoolClient, "query">,
  branchId: string,
  businessDate: string,
  inventoryItemIds: readonly string[],
): Promise<HistoricalPosCheckpointCoverage> {
  const affectedInventoryItemIds = [...new Set(inventoryItemIds)];
  const finalizedCheckpoint = await client.query<{ countNo: string; countType: "OPENING" | "CLOSING" | "FULL" }>(
    `SELECT count_record.count_no "countNo",count_record.count_type "countType"
       FROM inventory_counts count_record
      WHERE count_record.branch_id=$1
        AND count_record.count_type IN ('OPENING','CLOSING','FULL')
        AND NOT count_record.is_test_data
        AND (
          (count_record.count_type IN ('CLOSING','FULL') AND count_record.count_date >= $2::date)
          OR (count_record.count_type='OPENING' AND count_record.count_date > $2::date)
        )
        AND EXISTS (
          SELECT 1 FROM inventory_count_items valid_item
           WHERE valid_item.inventory_count_id=count_record.id
             AND valid_item.voided_at IS NULL
        )
      ORDER BY count_record.count_date,count_record.submitted_at
      LIMIT 1`,
    [branchId, businessDate],
  );
  const firstCheckpoint = finalizedCheckpoint.rows[0] ?? null;
  if (!firstCheckpoint) {
    return {
      laterInventoryCheckpoint: false,
      firstCheckpoint: null,
      affectedIngredientCount: affectedInventoryItemIds.length,
      coveredIngredientCount: 0,
      uncoveredIngredientCount: 0,
      inventoryAccountingTreatment: "OPERATIONAL",
      cogsCostBasis: "IMPORT_TIME_CONFIGURED_COST",
      accountingReason: null,
    };
  }

  const uncovered = affectedInventoryItemIds.length > 0
    ? await client.query<{ inventoryItemId: string }>(
      `WITH affected_inventory_items AS (
         SELECT DISTINCT unnest($3::uuid[]) inventory_item_id
       )
       SELECT affected.inventory_item_id "inventoryItemId"
         FROM affected_inventory_items affected
        WHERE NOT EXISTS (
          SELECT 1
            FROM inventory_count_items count_item
            JOIN inventory_counts count_record ON count_record.id=count_item.inventory_count_id
           WHERE count_record.branch_id=$1
             AND count_record.count_type IN ('OPENING','CLOSING','FULL')
             AND NOT count_record.is_test_data
             AND (
               (count_record.count_type IN ('CLOSING','FULL') AND count_record.count_date >= $2::date)
               OR (count_record.count_type='OPENING' AND count_record.count_date > $2::date)
             )
             AND count_item.inventory_item_id=affected.inventory_item_id
             AND count_item.voided_at IS NULL
        )`,
      [branchId, businessDate, affectedInventoryItemIds],
    )
    : { rows: [] as { inventoryItemId: string }[] };

  const uncoveredIngredientCount = uncovered.rows.length;
  const historicalCutover = uncoveredIngredientCount > 0;

  return {
    laterInventoryCheckpoint: true,
    firstCheckpoint,
    affectedIngredientCount: affectedInventoryItemIds.length,
    coveredIngredientCount: affectedInventoryItemIds.length - uncoveredIngredientCount,
    uncoveredIngredientCount,
    inventoryAccountingTreatment: historicalCutover ? "HISTORICAL_REPORTING_CUTOVER" : "OPERATIONAL",
    cogsCostBasis: historicalCutover ? "HISTORICAL_CONFIGURED_COST_ESTIMATE" : "IMPORT_TIME_CONFIGURED_COST",
    accountingReason: historicalCutover
      ? `Historical sales predate finalized inventory evidence and ${uncoveredIngredientCount} of ${affectedInventoryItemIds.length} consumed ingredients lack a later item checkpoint; recipe usage is retained for reporting but excluded from live stock calculations.`
      : null,
  };
}

/**
 * Assesses inventory chronology without changing a balance, count, variance, or
 * shrinkage record. The import remains authoritative for sales/COGS while any
 * already-submitted physical count remains the authoritative stock baseline.
 */
export async function assessPosImportInventoryDates(
  client: Pick<PoolClient, "query">,
  importId: string,
): Promise<PosInventoryDateAssessment> {
  const baseline = await client.query<{ latestBaselineDate: string | null }>(
    `SELECT max(ic.count_date)::text "latestBaselineDate"
       FROM pos_imports pi
       JOIN inventory_counts ic
         ON ic.branch_id=pi.branch_id
        AND NOT ic.is_test_data
        AND ic.submitted_at <= pi.imported_at
        AND ic.count_date >= pi.business_date
      WHERE pi.id=$1`,
    [importId],
  );
  const latestBaselineDate = baseline.rows[0]?.latestBaselineDate ?? null;
  if (!latestBaselineDate) {
    return { lateHistoricalImport: false, latestBaselineDate: null, affectedCountPeriods: [] };
  }

  const affected = await client.query<AffectedInventoryCountPeriod>(
    `WITH affected_items AS (
       SELECT DISTINCT usage.inventory_item_id
         FROM pos_sale_items sale
         JOIN pos_sale_ingredient_usage usage ON usage.pos_sale_item_id=sale.id
        WHERE sale.pos_import_id=$1
     )
     SELECT ic.id,ic.count_no "countNo",ic.count_date::text "countDate",
            count(DISTINCT ici.inventory_item_id)::int "affectedItemCount",
            count(DISTINCT ici.id) FILTER (WHERE ici.variance_quantity <> 0)::int "varianceCount"
       FROM pos_imports pi
       JOIN inventory_counts ic
         ON ic.branch_id=pi.branch_id
        AND NOT ic.is_test_data
        AND ic.submitted_at <= pi.imported_at
        AND ic.count_date >= pi.business_date
       JOIN inventory_count_items ici ON ici.inventory_count_id=ic.id
       JOIN affected_items affected_item ON affected_item.inventory_item_id=ici.inventory_item_id
      WHERE pi.id=$1
      GROUP BY ic.id,ic.count_no,ic.count_date
      ORDER BY ic.count_date,ic.submitted_at`,
    [importId],
  );

  return {
    lateHistoricalImport: true,
    latestBaselineDate,
    affectedCountPeriods: affected.rows,
  };
}
