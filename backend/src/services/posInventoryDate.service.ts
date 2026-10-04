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
