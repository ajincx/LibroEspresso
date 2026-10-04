import type { PoolClient } from "pg";
import { convertQuantity } from "./unitConversion.service.js";

export type InventoryLedgerActivityType =
  | "STARTING_STOCK"
  | "BALANCE_BASELINE"
  | "POS_CONSUMPTION"
  | "RECEIPT"
  | "APPROVED_INCREASE"
  | "APPROVED_DECREASE"
  | "PHYSICAL_COUNT";

type RawLedgerActivity = {
  id: string;
  occurredAt: string;
  activityType: InventoryLedgerActivityType;
  reference: string;
  quantity: number;
  sourceUnit?: string;
};

export type InventoryLedgerActivity = RawLedgerActivity & {
  quantityChange: number | null;
  runningBalance: number;
};

export type InventoryLedgerTarget = {
  branchId: string;
  inventoryItemId: string;
  canonicalUnit: string;
};

const activityPriority: Record<InventoryLedgerActivityType, number> = {
  STARTING_STOCK: 0,
  BALANCE_BASELINE: 0,
  POS_CONSUMPTION: 1,
  RECEIPT: 1,
  APPROVED_INCREASE: 1,
  APPROVED_DECREASE: 1,
  PHYSICAL_COUNT: 2,
};

export function buildInventoryLedger(rawActivities: RawLedgerActivity[]) {
  const activities = [...rawActivities].sort((left, right) => {
    const time = new Date(left.occurredAt).getTime() - new Date(right.occurredAt).getTime();
    return time || activityPriority[left.activityType] - activityPriority[right.activityType] || left.id.localeCompare(right.id);
  });
  let runningBalance = 0;
  const ledger = activities.map<InventoryLedgerActivity>((activity) => {
    let quantityChange: number | null;
    if (activity.activityType === "STARTING_STOCK" || activity.activityType === "BALANCE_BASELINE") {
      runningBalance = activity.quantity;
      quantityChange = activity.quantity;
    } else if (activity.activityType === "PHYSICAL_COUNT") {
      runningBalance = activity.quantity;
      quantityChange = null;
    } else {
      quantityChange = activity.activityType === "POS_CONSUMPTION" || activity.activityType === "APPROVED_DECREASE"
        ? -activity.quantity
        : activity.quantity;
      runningBalance += quantityChange;
    }
    return { ...activity, quantityChange, runningBalance };
  });
  return {
    activities: ledger,
    startingStock: ledger.find((activity) => activity.activityType === "STARTING_STOCK")?.quantity ?? null,
    operationalPosConsumption: ledger
      .filter((activity) => activity.activityType === "POS_CONSUMPTION")
      .reduce((sum, activity) => sum + activity.quantity, 0),
    calculatedBalance: ledger.at(-1)?.runningBalance ?? 0,
  };
}

export type InventoryLedger = ReturnType<typeof buildInventoryLedger>;
export const inventoryLedgerKey = (branchId: string, inventoryItemId: string) => `${branchId}:${inventoryItemId}`;

export async function loadInventoryLedger(
  client: Pick<PoolClient, "query">,
  branchId: string,
  inventoryItemId: string,
  canonicalUnit: string,
) {
  const opening = await client.query<{ id: string; occurredAt: string; reference: string; quantity: number }>(
    `SELECT ob.id,ob.effective_at::text "occurredAt",ob.baseline_no reference,obi.quantity::float8 quantity
       FROM inventory_opening_baselines ob
       JOIN inventory_opening_baseline_items obi ON obi.opening_baseline_id=ob.id
      WHERE ob.branch_id=$1 AND obi.inventory_item_id=$2
      ORDER BY ob.effective_at,ob.id
      LIMIT 1`,
    [branchId, inventoryItemId],
  );
  const firstOpeningAt = opening.rows[0]?.occurredAt;
  const fallback = firstOpeningAt ? { rows: [] as { id: string; occurredAt: string; reference: string; quantity: number }[] } : await client.query<{
    id: string; occurredAt: string; reference: string; quantity: number;
  }>(
    `SELECT concat(branch_id,'-',inventory_item_id) id,as_of::text "occurredAt",'Current balance baseline' reference,
            actual_quantity::float8 quantity
       FROM branch_inventory_balances
      WHERE branch_id=$1 AND inventory_item_id=$2 AND NOT is_test_data`,
    [branchId, inventoryItemId],
  );
  const fromAt = firstOpeningAt ?? fallback.rows[0]?.occurredAt ?? "1970-01-01T00:00:00.000Z";
  const baselineMode = firstOpeningAt ? "OPENING" : "BALANCE";

  const [pos, movements, counts] = await Promise.all([
    client.query<{ id: string; importId: string; occurredAt: string; reference: string; quantity: number; sourceUnit: string }>(
      `SELECT concat(pi.id,'-',usage.unit) id,pi.id "importId",
              pi.business_date::text "occurredAt",
              concat(source.display_name,' · ',pi.source_filename) reference,
              sum(usage.quantity_consumed)::float8 quantity,usage.unit "sourceUnit"
         FROM pos_imports pi
         JOIN pos_sources source ON source.id=pi.pos_source_id AND source.status='ACTIVE'
         JOIN pos_sale_items sale ON sale.pos_import_id=pi.id
         JOIN pos_sale_ingredient_usage usage ON usage.pos_sale_item_id=sale.id
        WHERE pi.branch_id=$1 AND usage.inventory_item_id=$2 AND NOT pi.is_test_data
          AND (($4::text='OPENING' AND pi.business_date >= ($3::timestamptz AT TIME ZONE 'Asia/Manila')::date)
            OR ($4::text='BALANCE' AND pi.business_date > ($3::timestamptz AT TIME ZONE 'Asia/Manila')::date))
        GROUP BY pi.id,source.display_name,usage.unit
        ORDER BY pi.business_date,pi.id,usage.unit`,
      [branchId, inventoryItemId, fromAt, baselineMode],
    ),
    client.query<{ id: string; occurredAt: string; activityType: InventoryLedgerActivityType; reference: string; quantity: number }>(
      `SELECT im.id,im.occurred_at::text "occurredAt",
              CASE im.movement_type
                WHEN 'RECEIPT' THEN 'RECEIPT'
                WHEN 'APPROVED_ADJUSTMENT_INCREASE' THEN 'APPROVED_INCREASE'
                ELSE 'APPROVED_DECREASE'
              END "activityType",
              COALESCE(im.reference_no,im.notes,im.movement_type::text) reference,im.quantity::float8 quantity
         FROM inventory_movements im
        WHERE im.branch_id=$1 AND im.inventory_item_id=$2 AND NOT im.is_test_data
          AND im.movement_type IN ('RECEIPT','APPROVED_ADJUSTMENT_INCREASE','APPROVED_ADJUSTMENT','APPROVED_ADJUSTMENT_DECREASE')
          AND (($4::text='OPENING' AND im.occurred_at >= $3::timestamptz)
            OR ($4::text='BALANCE' AND im.occurred_at > $3::timestamptz))
        ORDER BY im.occurred_at,im.id`,
      [branchId, inventoryItemId, fromAt, baselineMode],
    ),
    client.query<{ id: string; occurredAt: string; reference: string; quantity: number }>(
      `SELECT ic.id,((ic.count_date::timestamp + interval '1 day' - interval '1 second') AT TIME ZONE 'Asia/Manila')::text "occurredAt",
              ic.count_no reference,ici.actual_quantity::float8 quantity
         FROM inventory_counts ic
         JOIN inventory_count_items ici ON ici.inventory_count_id=ic.id AND ici.voided_at IS NULL
        WHERE ic.branch_id=$1 AND ici.inventory_item_id=$2 AND NOT ic.is_test_data
          AND ic.count_date >= ($3::timestamptz AT TIME ZONE 'Asia/Manila')::date
        ORDER BY ic.count_date,ic.submitted_at,ic.id`,
      [branchId, inventoryItemId, fromAt],
    ),
  ]);

  const posByImport = new Map<string, RawLedgerActivity>();
  for (const row of pos.rows) {
    const quantity = convertQuantity(Number(row.quantity), row.sourceUnit, canonicalUnit);
    const current = posByImport.get(row.importId);
    if (current) current.quantity += quantity;
    else posByImport.set(row.importId, { ...row, id: row.importId, activityType: "POS_CONSUMPTION", quantity });
  }

  return buildInventoryLedger([
    ...opening.rows.map((row) => ({ ...row, activityType: "STARTING_STOCK" as const })),
    ...fallback.rows.map((row) => ({ ...row, activityType: "BALANCE_BASELINE" as const })),
    ...posByImport.values(),
    ...movements.rows,
    ...counts.rows.map((row) => ({ ...row, activityType: "PHYSICAL_COUNT" as const })),
  ]);
}

/** Loads the same chronological ledger for many branch/item pairs in one query. */
export async function loadInventoryLedgerBalances(
  client: Pick<PoolClient, "query">,
  targets: InventoryLedgerTarget[],
): Promise<Map<string, InventoryLedger>> {
  const uniqueTargets = [...new Map(targets.map((target) => [inventoryLedgerKey(target.branchId, target.inventoryItemId), target])).values()];
  const result = new Map<string, InventoryLedger>();
  if (uniqueTargets.length === 0) return result;

  type ActivityRow = RawLedgerActivity & {
    branchId: string;
    inventoryItemId: string;
    importId: string | null;
  };
  const activities = await client.query<ActivityRow>(
    `WITH targets AS (
       SELECT * FROM jsonb_to_recordset($1::jsonb)
         AS target("branchId" uuid,"inventoryItemId" uuid,"canonicalUnit" text)
     ), baselines AS (
       SELECT target.*,
         coalesce(opening.id::text,balance.id) id,
         coalesce(opening."occurredAt",balance."occurredAt",'1970-01-01T00:00:00.000Z') "occurredAt",
         coalesce(opening."baselineDate",balance."baselineDate",'1970-01-01') "baselineDate",
         coalesce(opening.reference,balance.reference) reference,
         coalesce(opening.quantity,balance.quantity)::float8 quantity,
         CASE WHEN opening.id IS NOT NULL THEN 'OPENING' ELSE 'BALANCE' END mode
       FROM targets target
       LEFT JOIN LATERAL (
         SELECT ob.id,ob.effective_at::text "occurredAt",
           (ob.effective_at AT TIME ZONE 'Asia/Manila')::date::text "baselineDate",
           ob.baseline_no reference,obi.quantity::float8 quantity
         FROM inventory_opening_baselines ob
         JOIN inventory_opening_baseline_items obi ON obi.opening_baseline_id=ob.id
         WHERE ob.branch_id=target."branchId" AND obi.inventory_item_id=target."inventoryItemId"
         ORDER BY ob.effective_at,ob.id LIMIT 1
       ) opening ON true
       LEFT JOIN LATERAL (
         SELECT concat(bal.branch_id,'-',bal.inventory_item_id) id,bal.as_of::text "occurredAt",
           (bal.as_of AT TIME ZONE 'Asia/Manila')::date::text "baselineDate",
           'Current balance baseline' reference,bal.actual_quantity::float8 quantity
         FROM branch_inventory_balances bal
         WHERE opening.id IS NULL AND bal.branch_id=target."branchId"
           AND bal.inventory_item_id=target."inventoryItemId" AND NOT bal.is_test_data
         LIMIT 1
       ) balance ON true
     ), activity_rows AS (
       SELECT b."branchId",b."inventoryItemId",b.id,b."occurredAt",b.reference,b.quantity,
         CASE WHEN b.mode='OPENING' THEN 'STARTING_STOCK' ELSE 'BALANCE_BASELINE' END "activityType",
         NULL::text "sourceUnit",NULL::text "importId"
       FROM baselines b WHERE b.id IS NOT NULL
       UNION ALL
       SELECT pi.branch_id,usage.inventory_item_id,concat(pi.id,'-',usage.unit),pi.business_date::text,
         concat(source.display_name,' · ',pi.source_filename),sum(usage.quantity_consumed)::float8,'POS_CONSUMPTION',usage.unit,pi.id::text
       FROM baselines b
       JOIN pos_imports pi ON pi.branch_id=b."branchId" AND NOT pi.is_test_data
       JOIN pos_sources source ON source.id=pi.pos_source_id AND source.status='ACTIVE'
       JOIN pos_sale_items sale ON sale.pos_import_id=pi.id
       JOIN pos_sale_ingredient_usage usage ON usage.pos_sale_item_id=sale.id AND usage.inventory_item_id=b."inventoryItemId"
       WHERE (b.mode='OPENING' AND pi.business_date>=b."baselineDate"::date)
          OR (b.mode='BALANCE' AND pi.business_date>b."baselineDate"::date)
       GROUP BY pi.branch_id,usage.inventory_item_id,pi.id,source.display_name,usage.unit
       UNION ALL
       SELECT im.branch_id,im.inventory_item_id,im.id::text,im.occurred_at::text,
         coalesce(im.reference_no,im.notes,im.movement_type::text),im.quantity::float8,
         CASE im.movement_type WHEN 'RECEIPT' THEN 'RECEIPT' WHEN 'APPROVED_ADJUSTMENT_INCREASE' THEN 'APPROVED_INCREASE' ELSE 'APPROVED_DECREASE' END,
         NULL::text,NULL::text
       FROM baselines b JOIN inventory_movements im
         ON im.branch_id=b."branchId" AND im.inventory_item_id=b."inventoryItemId"
       WHERE NOT im.is_test_data
         AND im.movement_type IN ('RECEIPT','APPROVED_ADJUSTMENT_INCREASE','APPROVED_ADJUSTMENT','APPROVED_ADJUSTMENT_DECREASE')
         AND ((b.mode='OPENING' AND im.occurred_at>=b."occurredAt"::timestamptz)
           OR (b.mode='BALANCE' AND im.occurred_at>b."occurredAt"::timestamptz))
       UNION ALL
       SELECT ic.branch_id,ici.inventory_item_id,ic.id::text,
         ((ic.count_date::timestamp+interval '1 day'-interval '1 second') AT TIME ZONE 'Asia/Manila')::text,
         ic.count_no,ici.actual_quantity::float8,'PHYSICAL_COUNT',NULL::text,NULL::text
       FROM baselines b JOIN inventory_counts ic ON ic.branch_id=b."branchId" AND NOT ic.is_test_data
       JOIN inventory_count_items ici ON ici.inventory_count_id=ic.id
         AND ici.inventory_item_id=b."inventoryItemId" AND ici.voided_at IS NULL
       WHERE ic.count_date>=b."baselineDate"::date
     ) SELECT * FROM activity_rows ORDER BY "branchId","inventoryItemId","occurredAt",id`,
    [JSON.stringify(uniqueTargets)],
  );

  for (const target of uniqueTargets) {
    const key = inventoryLedgerKey(target.branchId, target.inventoryItemId);
    const raw: RawLedgerActivity[] = [];
    const posByImport = new Map<string, RawLedgerActivity>();
    for (const row of activities.rows.filter((item) => inventoryLedgerKey(item.branchId, item.inventoryItemId) === key)) {
      if (row.activityType !== "POS_CONSUMPTION") {
        raw.push({ id: row.id, occurredAt: row.occurredAt, activityType: row.activityType, reference: row.reference, quantity: Number(row.quantity) });
        continue;
      }
      const quantity = convertQuantity(Number(row.quantity), row.sourceUnit!, target.canonicalUnit);
      const importId = row.importId!;
      const current = posByImport.get(importId);
      if (current) current.quantity += quantity;
      else posByImport.set(importId, { id: importId, occurredAt: row.occurredAt, activityType: "POS_CONSUMPTION", reference: row.reference, quantity });
    }
    result.set(key, buildInventoryLedger([...raw, ...posByImport.values()]));
  }
  return result;
}
