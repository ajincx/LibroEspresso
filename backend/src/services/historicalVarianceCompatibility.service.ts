import type { PoolClient } from "pg";
import type { TokenUser } from "../types/auth.js";
import { writeAudit } from "./audit.service.js";

export const HISTORICAL_VARIANCE_CORRECTION_REASON =
  "Correct proven legacy Expected - Actual variance signs to the current Actual - Expected convention.";

export const HISTORICAL_VARIANCE_TARGETS = [
  {
    countNo: "IC-2026-00001",
    sku: "RM-002",
    expectedQuantity: 388,
    actualQuantity: 126,
    previousVarianceQuantity: 262,
    correctedVarianceQuantity: -262,
  },
  {
    countNo: "IC-2026-00004",
    sku: "RM-005",
    expectedQuantity: 20_000,
    actualQuantity: 19_999.98,
    previousVarianceQuantity: 0.02,
    correctedVarianceQuantity: -0.02,
  },
] as const;

type HistoricalVarianceRow = {
  countId: string;
  countNo: string;
  branchId: string;
  isTestData: boolean;
  countItemId: string;
  inventoryItemId: string;
  sku: string;
  expectedQuantity: number;
  actualQuantity: number;
  varianceQuantity: number;
  varianceValue: number;
  unit: string;
  voidedAt: string | null;
};

const sameNumber = (left: number, right: number) => Math.abs(Number(left) - Number(right)) < 0.000001;

export async function applyHistoricalVarianceSignCompatibility(
  client: Pick<PoolClient, "query">,
  actor: TokenUser,
) {
  if (actor.role !== "OWNER") throw new Error("Historical variance compatibility correction requires an Owner actor.");

  const targets = await client.query<HistoricalVarianceRow>(
    `SELECT ic.id "countId",ic.count_no "countNo",ic.branch_id "branchId",ic.is_test_data "isTestData",
            ici.id "countItemId",ici.inventory_item_id "inventoryItemId",ii.sku,
            ici.expected_quantity::float8 "expectedQuantity",ici.actual_quantity::float8 "actualQuantity",
            ici.variance_quantity::float8 "varianceQuantity",ici.variance_value::float8 "varianceValue",
            ici.unit,ici.voided_at "voidedAt"
       FROM inventory_counts ic
       JOIN inventory_count_items ici ON ici.inventory_count_id=ic.id
       JOIN inventory_items ii ON ii.id=ici.inventory_item_id
      WHERE (ic.count_no='IC-2026-00001' AND ii.sku='RM-002')
         OR (ic.count_no='IC-2026-00004' AND ii.sku='RM-005')
      ORDER BY ic.count_no
      FOR UPDATE OF ic,ici`,
  );
  if (targets.rows.length !== HISTORICAL_VARIANCE_TARGETS.length) {
    throw new Error(`Expected ${HISTORICAL_VARIANCE_TARGETS.length} approved historical variance rows; found ${targets.rows.length}.`);
  }

  for (const approved of HISTORICAL_VARIANCE_TARGETS) {
    const row = targets.rows.find((candidate) => candidate.countNo === approved.countNo && candidate.sku === approved.sku);
    if (!row || row.isTestData || row.voidedAt
      || !sameNumber(row.expectedQuantity, approved.expectedQuantity)
      || !sameNumber(row.actualQuantity, approved.actualQuantity)
      || !sameNumber(row.varianceQuantity, approved.previousVarianceQuantity)
      || !sameNumber(row.varianceQuantity, row.expectedQuantity - row.actualQuantity)) {
      throw new Error(`Preflight mismatch for ${approved.countNo} / ${approved.sku}; no corrections were applied.`);
    }
  }

  const legacyRows = await client.query<{ countItemId: string }>(
    `SELECT ici.id "countItemId"
       FROM inventory_counts ic
       JOIN inventory_count_items ici ON ici.inventory_count_id=ic.id
      WHERE NOT ic.is_test_data AND ici.voided_at IS NULL
        AND abs(ici.expected_quantity-ici.actual_quantity)>0.000001
        AND abs(ici.variance_quantity-(ici.expected_quantity-ici.actual_quantity))<0.000001
      ORDER BY ici.id`,
  );
  const approvedIds = targets.rows.map((row) => row.countItemId).sort();
  const legacyIds = legacyRows.rows.map((row) => row.countItemId).sort();
  if (JSON.stringify(legacyIds) !== JSON.stringify(approvedIds)) {
    throw new Error("Operational legacy-sign rows no longer match the two approved targets; no corrections were applied.");
  }

  const corrected = [];
  for (const approved of HISTORICAL_VARIANCE_TARGETS) {
    const row = targets.rows.find((candidate) => candidate.countNo === approved.countNo && candidate.sku === approved.sku)!;
    const update = await client.query<{ varianceQuantity: number; expectedQuantity: number; actualQuantity: number; varianceValue: number }>(
      `UPDATE inventory_count_items
          SET variance_quantity=$2
        WHERE id=$1 AND variance_quantity=$3 AND expected_quantity=$4 AND actual_quantity=$5
        RETURNING variance_quantity::float8 "varianceQuantity",expected_quantity::float8 "expectedQuantity",
                  actual_quantity::float8 "actualQuantity",variance_value::float8 "varianceValue"`,
      [row.countItemId, approved.correctedVarianceQuantity, approved.previousVarianceQuantity, approved.expectedQuantity, approved.actualQuantity],
    );
    if (update.rows.length !== 1) throw new Error(`Guarded update failed for ${approved.countNo} / ${approved.sku}.`);
    await writeAudit(
      actor,
      "HISTORICAL_VARIANCE_SIGN_COMPATIBILITY",
      "INVENTORY_COUNT_ITEM",
      row.countItemId,
      `${approved.countNo} / ${approved.sku} historical variance sign corrected to Actual - Expected.`,
      {
        branchId: row.branchId,
        countId: row.countId,
        countNo: row.countNo,
        inventoryItemId: row.inventoryItemId,
        sku: row.sku,
        expectedQuantity: row.expectedQuantity,
        actualQuantity: row.actualQuantity,
        previousVarianceQuantity: row.varianceQuantity,
        correctedVarianceQuantity: approved.correctedVarianceQuantity,
        varianceValuePreserved: row.varianceValue,
        legacyConvention: "EXPECTED_MINUS_ACTUAL",
        currentConvention: "ACTUAL_MINUS_EXPECTED",
        correctionType: "HISTORICAL_VARIANCE_SIGN_COMPATIBILITY",
        reason: HISTORICAL_VARIANCE_CORRECTION_REASON,
      },
      client,
    );
    corrected.push({ ...row, correctedVarianceQuantity: approved.correctedVarianceQuantity });
  }
  return corrected;
}
