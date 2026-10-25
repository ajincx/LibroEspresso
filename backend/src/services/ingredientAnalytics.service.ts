import type { Pool } from "pg";
import { convertQuantity, getUnitDimension, type UnitDimension } from "./unitConversion.service.js";

export const MOVEMENT_WINDOW_DAYS = 28;
export const MIN_MOVEMENT_HISTORY_DAYS = 7;
export type MovementCategory = "FAST" | "MEDIUM" | "SLOW";

export interface IngredientMovementClassification {
  status: "AVAILABLE" | "INSUFFICIENT_DATA";
  category: MovementCategory | null;
  averageDailyConsumption: number | null;
  unit: string;
  eligibleBusinessDays: number;
  windowDays: number;
  windowStart: string;
  windowEnd: string;
  explanation: string;
}

export interface ConnectedMenuProduct {
  menuItemId: string;
  menuProductName: string;
  productStatus: string;
  branchMenuStatus: "ACTIVE" | "INACTIVE";
  variantId: string;
  variantName: string;
  variantStatus: string;
  recipeId: string;
  recipeStatus: string;
  recipeYield: number;
  recipeQuantity: number;
  recipeUnit: string;
  consumptionPerSoldUnit: number;
  consumptionUnit: string;
  connectionStatus: "CURRENT" | "HISTORICAL";
}

export type IngredientMovementUsageRow = {
  inventoryItemId: string;
  inventoryUnit: string;
  sourceUnit: string | null;
  totalConsumption: number;
  hasCurrentActiveRecipe: boolean;
};

type MovementCandidate = {
  inventoryItemId: string;
  inventoryUnit: string;
  dimension: UnitDimension;
  averageDailyConsumption: number;
  normalizedMovementMetric: number;
};

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

function aggregateUsage(rows: IngredientMovementUsageRow[]) {
  const byItem = new Map<string, Omit<MovementCandidate, "normalizedMovementMetric"> & { hasCurrentActiveRecipe: boolean; invalidUnit: boolean }>();
  for (const row of rows) {
    let current = byItem.get(row.inventoryItemId);
    if (!current) {
      current = {
        inventoryItemId: row.inventoryItemId,
        inventoryUnit: row.inventoryUnit,
        dimension: getUnitDimension(row.inventoryUnit),
        averageDailyConsumption: 0,
        hasCurrentActiveRecipe: row.hasCurrentActiveRecipe,
        invalidUnit: false,
      };
      byItem.set(row.inventoryItemId, current);
    }
    current.hasCurrentActiveRecipe ||= row.hasCurrentActiveRecipe;
    if (!row.sourceUnit) continue;
    try {
      current.averageDailyConsumption += convertQuantity(Number(row.totalConsumption), row.sourceUnit, row.inventoryUnit) / MOVEMENT_WINDOW_DAYS;
    } catch {
      current.invalidUnit = true;
    }
  }
  return byItem;
}

/**
 * Daily consumption is converted to each item's canonical unit, then divided
 * by the median positive daily consumption in its compatible unit family.
 * Ranking this dimensionless metric avoids comparing grams, millilitres, and
 * pieces as if their raw quantities were interchangeable.
 */
export function classifyIngredientMovements(rows: IngredientMovementUsageRow[], eligibleBusinessDays: number) {
  const aggregated = aggregateUsage(rows);
  const result = new Map<string, MovementCandidate & { category: MovementCategory | null; eligible: boolean }>();
  const eligible = [...aggregated.values()].filter((row) =>
    !row.invalidUnit && (row.averageDailyConsumption > 0 || row.hasCurrentActiveRecipe),
  );
  const familyMedians = new Map<UnitDimension, number>();
  for (const dimension of ["MASS", "VOLUME", "COUNT"] as const) {
    familyMedians.set(dimension, median(eligible
      .filter((row) => row.dimension === dimension && row.averageDailyConsumption > 0)
      .map((row) => row.averageDailyConsumption)));
  }
  const candidates: MovementCandidate[] = eligible.map((row) => ({
    inventoryItemId: row.inventoryItemId,
    inventoryUnit: row.inventoryUnit,
    dimension: row.dimension,
    averageDailyConsumption: row.averageDailyConsumption,
    normalizedMovementMetric: row.averageDailyConsumption > 0
      ? row.averageDailyConsumption / (familyMedians.get(row.dimension) || row.averageDailyConsumption)
      : 0,
  }));
  const positives = candidates
    .filter((row) => row.normalizedMovementMetric > 0)
    .sort((a, b) => b.normalizedMovementMetric - a.normalizedMovementMetric || a.inventoryItemId.localeCompare(b.inventoryItemId));
  positives.forEach((row, index) => {
    const third = Math.min(2, Math.floor(index * 3 / positives.length));
    result.set(row.inventoryItemId, {
      ...row,
      category: (["FAST", "MEDIUM", "SLOW"] as const)[third]!,
      eligible: eligibleBusinessDays >= MIN_MOVEMENT_HISTORY_DAYS,
    });
  });
  for (const row of candidates.filter((candidate) => candidate.normalizedMovementMetric === 0)) {
    result.set(row.inventoryItemId, { ...row, category: "SLOW", eligible: eligibleBusinessDays >= MIN_MOVEMENT_HISTORY_DAYS });
  }
  for (const row of aggregated.values()) {
    if (!result.has(row.inventoryItemId)) {
      result.set(row.inventoryItemId, {
        inventoryItemId: row.inventoryItemId,
        inventoryUnit: row.inventoryUnit,
        dimension: row.dimension,
        averageDailyConsumption: row.averageDailyConsumption,
        normalizedMovementMetric: 0,
        category: null,
        eligible: false,
      });
    }
  }
  return result;
}

export async function loadIngredientAnalytics(
  client: Pick<Pool, "query">,
  branchId: string,
  inventoryItemId: string,
): Promise<{ movement: IngredientMovementClassification; connectedProducts: ConnectedMenuProduct[] }> {
  const [coverageResult, usageResult, productsResult] = await Promise.all([
    client.query<{ eligibleBusinessDays: number; windowStart: string; windowEnd: string }>(
      `SELECT count(DISTINCT pi.business_date)::int "eligibleBusinessDays",
              ((now() AT TIME ZONE 'Asia/Manila')::date - 28)::text "windowStart",
              ((now() AT TIME ZONE 'Asia/Manila')::date - 1)::text "windowEnd"
         FROM pos_imports pi
         JOIN pos_sources source ON source.id=pi.pos_source_id
        WHERE pi.branch_id=$1 AND NOT pi.is_test_data AND pi.voided_at IS NULL
          AND pi.completed_at IS NOT NULL
          AND pi.business_date >= (now() AT TIME ZONE 'Asia/Manila')::date - 28
          AND pi.business_date < (now() AT TIME ZONE 'Asia/Manila')::date`,
      [branchId],
    ),
    client.query<IngredientMovementUsageRow>(
      `WITH window_usage AS (
         SELECT usage.inventory_item_id,usage.unit "sourceUnit",sum(usage.quantity_consumed)::float8 "totalConsumption"
           FROM pos_imports pi
           JOIN pos_sources source ON source.id=pi.pos_source_id
           JOIN pos_sale_items sale ON sale.pos_import_id=pi.id
           JOIN pos_sale_ingredient_usage usage ON usage.pos_sale_item_id=sale.id
          WHERE pi.branch_id=$1 AND NOT pi.is_test_data AND pi.voided_at IS NULL
            AND pi.completed_at IS NOT NULL
            AND pi.business_date >= (now() AT TIME ZONE 'Asia/Manila')::date - 28
            AND pi.business_date < (now() AT TIME ZONE 'Asia/Manila')::date
          GROUP BY usage.inventory_item_id,usage.unit
       )
       SELECT ii.id "inventoryItemId",ii.unit "inventoryUnit",usage."sourceUnit",
              coalesce(usage."totalConsumption",0)::float8 "totalConsumption",
              EXISTS (
                SELECT 1 FROM recipe_items current_item
                JOIN recipes current_recipe ON current_recipe.id=current_item.recipe_id
                JOIN menu_item_variants current_variant ON current_variant.id=current_recipe.menu_item_variant_id
                JOIN menu_items current_product ON current_product.id=current_variant.menu_item_id
                JOIN menu_item_branches current_branch ON current_branch.menu_item_id=current_product.id AND current_branch.branch_id=$1
                WHERE current_item.inventory_item_id=ii.id AND current_recipe.status='ACTIVE'
                  AND current_recipe.effective_from<=(now() AT TIME ZONE 'Asia/Manila')::date
                  AND (current_recipe.effective_to IS NULL OR current_recipe.effective_to>(now() AT TIME ZONE 'Asia/Manila')::date)
                  AND current_variant.status='ACTIVE' AND current_product.status='ACTIVE'
                  AND current_product.approval_status='APPROVED'
                  AND current_branch.availability_status='APPROVED' AND current_branch.is_active
              ) "hasCurrentActiveRecipe"
         FROM inventory_items ii
         LEFT JOIN window_usage usage ON usage.inventory_item_id=ii.id
        WHERE ii.status='ACTIVE' AND (ii.item_scope='GLOBAL' OR ii.origin_branch_id=$1)
        ORDER BY ii.id,usage."sourceUnit"`,
      [branchId],
    ),
    client.query<{
      menuItemId: string; menuProductName: string; productStatus: string; branchMenuStatus: "ACTIVE" | "INACTIVE";
      variantId: string; variantName: string; variantStatus: string; recipeId: string; recipeStatus: string;
      recipeYield: number; recipeQuantity: number; recipeUnit: string; inventoryUnit: string; connectionStatus: "CURRENT" | "HISTORICAL";
    }>(
      `SELECT product.id "menuItemId",product.name "menuProductName",product.status "productStatus",
              CASE WHEN branch_menu.is_active THEN 'ACTIVE' ELSE 'INACTIVE' END "branchMenuStatus",
              variant.id "variantId",variant.name "variantName",variant.status "variantStatus",
              recipe.id "recipeId",recipe.status "recipeStatus",recipe.yield_quantity::float8 "recipeYield",
              ingredient.quantity::float8 "recipeQuantity",ingredient.unit "recipeUnit",inventory.unit "inventoryUnit",
              CASE WHEN recipe.status='ACTIVE'
                 AND recipe.effective_from<=(now() AT TIME ZONE 'Asia/Manila')::date
                 AND (recipe.effective_to IS NULL OR recipe.effective_to>(now() AT TIME ZONE 'Asia/Manila')::date)
                THEN 'CURRENT' ELSE 'HISTORICAL' END "connectionStatus"
         FROM menu_items product
         JOIN menu_item_branches branch_menu ON branch_menu.menu_item_id=product.id AND branch_menu.branch_id=$1
         JOIN menu_item_variants variant ON variant.menu_item_id=product.id
         JOIN LATERAL (
           SELECT candidate.* FROM recipes candidate
           JOIN recipe_items candidate_item ON candidate_item.recipe_id=candidate.id
          WHERE candidate.menu_item_variant_id=variant.id AND candidate_item.inventory_item_id=$2
          ORDER BY CASE WHEN candidate.status='ACTIVE'
                     AND candidate.effective_from<=(now() AT TIME ZONE 'Asia/Manila')::date
                     AND (candidate.effective_to IS NULL OR candidate.effective_to>(now() AT TIME ZONE 'Asia/Manila')::date)
                   THEN 0 ELSE 1 END,candidate.version DESC
          LIMIT 1
         ) recipe ON true
         JOIN recipe_items ingredient ON ingredient.recipe_id=recipe.id AND ingredient.inventory_item_id=$2
         JOIN inventory_items inventory ON inventory.id=ingredient.inventory_item_id
        WHERE product.approval_status='APPROVED' AND branch_menu.availability_status='APPROVED'
          AND (product.product_scope='GLOBAL' OR product.origin_branch_id=$1)
        ORDER BY product.name,variant.name`,
      [branchId, inventoryItemId],
    ),
  ]);

  const coverage = coverageResult.rows[0] ?? { eligibleBusinessDays: 0, windowStart: "", windowEnd: "" };
  const target = classifyIngredientMovements(usageResult.rows, Number(coverage.eligibleBusinessDays)).get(inventoryItemId);
  const enoughHistory = Boolean(target?.eligible);
  const movement: IngredientMovementClassification = {
    status: enoughHistory ? "AVAILABLE" : "INSUFFICIENT_DATA",
    category: enoughHistory ? target!.category : null,
    averageDailyConsumption: enoughHistory ? target!.averageDailyConsumption : null,
    unit: target?.inventoryUnit ?? "",
    eligibleBusinessDays: Number(coverage.eligibleBusinessDays),
    windowDays: MOVEMENT_WINDOW_DAYS,
    windowStart: coverage.windowStart,
    windowEnd: coverage.windowEnd,
    explanation: enoughHistory
      ? `Based on accepted POS recipe consumption over the latest ${MOVEMENT_WINDOW_DAYS} completed Manila business days. Daily consumption is converted to the ingredient's canonical unit, normalized within its compatible unit family, then ranked in thirds. Zero eligible consumption is Slow.`
      : `Insufficient Data: at least ${MIN_MOVEMENT_HISTORY_DAYS} accepted POS business dates and either valid consumption or an active connected recipe are required within the latest ${MOVEMENT_WINDOW_DAYS} completed Manila business days.`,
  };

  const connectedProducts = productsResult.rows.flatMap((row) => {
    try {
      return [{
        menuItemId: row.menuItemId,
        menuProductName: row.menuProductName,
        productStatus: row.productStatus,
        branchMenuStatus: row.branchMenuStatus,
        variantId: row.variantId,
        variantName: row.variantName,
        variantStatus: row.variantStatus,
        recipeId: row.recipeId,
        recipeStatus: row.recipeStatus,
        recipeYield: Number(row.recipeYield),
        recipeQuantity: Number(row.recipeQuantity),
        recipeUnit: row.recipeUnit,
        consumptionPerSoldUnit: convertQuantity(Number(row.recipeQuantity) / Number(row.recipeYield), row.recipeUnit, row.inventoryUnit),
        consumptionUnit: row.inventoryUnit,
        connectionStatus: row.connectionStatus,
      } satisfies ConnectedMenuProduct];
    } catch {
      return [];
    }
  });
  return { movement, connectedProducts };
}
