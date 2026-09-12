import type { PoolClient } from "pg";
import { AppError } from "../utils/appError.js";
import { convertQuantity, normalizeUnit } from "./unitConversion.service.js";

export type RecipePeriod = {
  id: string;
  version: number;
  effectiveFrom: string;
  effectiveTo: string | null;
};

export function isEffectiveOn(period: RecipePeriod, businessDate: string): boolean {
  return period.effectiveFrom === "-infinity" || period.effectiveFrom <= businessDate
    ? period.effectiveTo === null || businessDate < period.effectiveTo
    : false;
}

export function resolveEffectiveRecipe<T extends RecipePeriod>(recipes: readonly T[], businessDate: string): T | null {
  const matches = recipes.filter((recipe) => isEffectiveOn(recipe, businessDate));
  if (matches.length > 1) throw new AppError(409, "RECIPE_PERIOD_OVERLAP", "More than one recipe is effective for this date");
  return matches[0] ?? null;
}

export function periodsOverlap(
  first: Pick<RecipePeriod, "effectiveFrom" | "effectiveTo">,
  second: Pick<RecipePeriod, "effectiveFrom" | "effectiveTo">,
): boolean {
  const firstStartsBeforeSecondEnds = second.effectiveTo === null || first.effectiveFrom < second.effectiveTo;
  const secondStartsBeforeFirstEnds = first.effectiveTo === null || second.effectiveFrom < first.effectiveTo;
  return firstStartsBeforeSecondEnds && secondStartsBeforeFirstEnds;
}

export const shouldCreateNewRecipeVersion = (hasHistoricalUsage: boolean) => hasHistoricalUsage;

type RecipeItemInput = { inventoryItemId: string; quantity: number; unit: string };
type SaveRecipeInput = {
  recipeId?: string;
  menuItemId: string;
  name: string;
  yieldQuantity: number;
  status: "ACTIVE" | "INACTIVE";
  items: RecipeItemInput[];
  effectiveFrom?: string;
  changeReason?: string;
  createdBy: string;
};

async function insertItems(client: Pick<PoolClient, "query">, recipeId: string, items: RecipeItemInput[]) {
  for (const item of items) {
    await client.query(
      `INSERT INTO recipe_items (recipe_id,inventory_item_id,quantity,unit) VALUES ($1,$2,$3,$4)`,
      [recipeId, item.inventoryItemId, item.quantity, normalizeUnit(item.unit)],
    );
  }
}

export async function saveRecipeDefinition(client: Pick<PoolClient, "query">, input: SaveRecipeInput) {
  if (!input.recipeId) {
    const existing = await client.query(`SELECT id FROM recipes WHERE menu_item_id=$1 LIMIT 1 FOR UPDATE`, [input.menuItemId]);
    if (existing.rows[0]) throw new AppError(409, "RECIPE_ALREADY_EXISTS", "This product already has a recipe history");
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO recipes (menu_item_id,name,yield_quantity,status,version,effective_from,created_by,change_reason)
       VALUES ($1,$2,$3,$4,1,COALESCE($5::date,CURRENT_DATE),$6,$7) RETURNING id`,
      [input.menuItemId, input.name, input.yieldQuantity, input.status, input.effectiveFrom ?? null, input.createdBy, input.changeReason?.trim() || null],
    );
    await insertItems(client, inserted.rows[0]!.id, input.items);
    return { recipeId: inserted.rows[0]!.id, version: 1, createdVersion: false };
  }

  const recipeResult = await client.query<RecipePeriod & { menuItemId: string }>(
    `SELECT id,menu_item_id "menuItemId",version,effective_from::text "effectiveFrom",effective_to::text "effectiveTo"
       FROM recipes WHERE id=$1 AND menu_item_id=$2 FOR UPDATE`,
    [input.recipeId, input.menuItemId],
  );
  const recipe = recipeResult.rows[0];
  if (!recipe) throw new AppError(404, "RECIPE_NOT_FOUND", "Recipe not found");
  await client.query(`SELECT id FROM recipes WHERE menu_item_id=$1 FOR UPDATE`, [input.menuItemId]);
  const used = await client.query(
    `SELECT 1 FROM pos_sale_ingredient_usage usage
      JOIN pos_sale_items psi ON psi.id=usage.pos_sale_item_id
     WHERE usage.recipe_version_id=$1 OR (usage.recipe_version_id IS NULL AND psi.menu_item_id=$2)
     LIMIT 1`,
    [recipe.id, input.menuItemId],
  );

  if (!shouldCreateNewRecipeVersion(Boolean(used.rows[0]))) {
    await client.query(
      `UPDATE recipes SET name=$2,yield_quantity=$3,status=$4,
              effective_from=COALESCE($5::date,effective_from),change_reason=$6,updated_at=now()
        WHERE id=$1`,
      [recipe.id, input.name, input.yieldQuantity, input.status, input.effectiveFrom ?? null, input.changeReason?.trim() || null],
    );
    await client.query(`DELETE FROM recipe_items WHERE recipe_id=$1`, [recipe.id]);
    await insertItems(client, recipe.id, input.items);
    return { recipeId: recipe.id, version: recipe.version, createdVersion: false };
  }

  if (!input.effectiveFrom) {
    throw new AppError(422, "RECIPE_EFFECTIVE_DATE_REQUIRED", "Choose when the new recipe version becomes effective");
  }
  if (recipe.effectiveFrom !== "-infinity" && input.effectiveFrom <= recipe.effectiveFrom) {
    throw new AppError(422, "RECIPE_EFFECTIVE_DATE_INVALID", "The new version must start after the current version");
  }
  if (recipe.effectiveTo !== null && input.effectiveFrom >= recipe.effectiveTo) {
    throw new AppError(409, "RECIPE_PERIOD_OVERLAP", "The selected date is already covered by another recipe version");
  }
  const overlap = await client.query(
    `SELECT id FROM recipes WHERE menu_item_id=$1 AND id<>$2
       AND effective_from < COALESCE($3::date,'infinity'::date)
       AND COALESCE(effective_to,'infinity'::date) > $3::date LIMIT 1`,
    [input.menuItemId, recipe.id, input.effectiveFrom],
  );
  if (overlap.rows[0]) throw new AppError(409, "RECIPE_PERIOD_OVERLAP", "A recipe version already applies during the selected period");

  const nextVersion = await client.query<{ version: number }>(
    `SELECT COALESCE(max(version),0)::int+1 version FROM recipes WHERE menu_item_id=$1`,
    [input.menuItemId],
  );
  await client.query(`UPDATE recipes SET effective_to=$2::date,updated_at=now() WHERE id=$1`, [recipe.id, input.effectiveFrom]);
  const inserted = await client.query<{ id: string }>(
    `INSERT INTO recipes (menu_item_id,name,yield_quantity,status,version,effective_from,created_by,change_reason)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [input.menuItemId, input.name, input.yieldQuantity, input.status, nextVersion.rows[0]!.version, input.effectiveFrom, input.createdBy, input.changeReason?.trim() || null],
  );
  await insertItems(client, inserted.rows[0]!.id, input.items);
  return { recipeId: inserted.rows[0]!.id, version: nextVersion.rows[0]!.version, createdVersion: true };
}

type UsageSourceRow = {
  saleItemId: string;
  quantitySold: number;
  recipeVersionId: string;
  yieldQuantity: number;
  inventoryItemId: string;
  recipeQuantity: number;
  recipeUnit: string;
  inventoryUnit: string;
  unitCost: number;
};

export async function createIngredientUsageSnapshots(client: Pick<PoolClient, "query">, importId: string) {
  const result = await client.query<UsageSourceRow>(
    `SELECT psi.id "saleItemId",psi.quantity_sold::float8 "quantitySold",
            r.id "recipeVersionId",r.yield_quantity::float8 "yieldQuantity",
            ri.inventory_item_id "inventoryItemId",ri.quantity::float8 "recipeQuantity",ri.unit "recipeUnit",
            ii.unit "inventoryUnit",COALESCE(bis.current_unit_cost,ii.unit_cost)::float8 "unitCost"
       FROM pos_sale_items psi
       JOIN pos_imports pi ON pi.id=psi.pos_import_id
       JOIN LATERAL (
         SELECT candidate.* FROM recipes candidate
          WHERE candidate.menu_item_id=psi.menu_item_id AND candidate.status='ACTIVE'
            AND candidate.effective_from<=psi.business_date
            AND (candidate.effective_to IS NULL OR candidate.effective_to>psi.business_date)
          ORDER BY candidate.effective_from DESC LIMIT 1
       ) r ON true
       JOIN recipe_items ri ON ri.recipe_id=r.id
       JOIN inventory_items ii ON ii.id=ri.inventory_item_id
       LEFT JOIN branch_inventory_settings bis ON bis.branch_id=pi.branch_id AND bis.inventory_item_id=ii.id
      WHERE psi.pos_import_id=$1
      ORDER BY psi.id,ri.id`,
    [importId],
  );
  const snapshots = result.rows.map((row) => {
    const quantityPerServing = convertQuantity(Number(row.recipeQuantity), row.recipeUnit, row.inventoryUnit) / Number(row.yieldQuantity);
    return { saleItemId: row.saleItemId, inventoryItemId: row.inventoryItemId, quantityConsumed: Number(row.quantitySold) * quantityPerServing, unit: normalizeUnit(row.inventoryUnit), unitCost: Number(row.unitCost), recipeVersionId: row.recipeVersionId };
  });
  if (snapshots.length) {
    await client.query(
      `INSERT INTO pos_sale_ingredient_usage
       (pos_sale_item_id,inventory_item_id,quantity_consumed,unit,unit_cost_snapshot,recipe_version_id)
       SELECT snapshot.sale_item_id,snapshot.inventory_item_id,snapshot.quantity_consumed,snapshot.unit,snapshot.unit_cost,snapshot.recipe_version_id
       FROM unnest($1::uuid[],$2::uuid[],$3::numeric[],$4::text[],$5::numeric[],$6::uuid[])
         AS snapshot(sale_item_id,inventory_item_id,quantity_consumed,unit,unit_cost,recipe_version_id)`,
      [snapshots.map((row)=>row.saleItemId),snapshots.map((row)=>row.inventoryItemId),snapshots.map((row)=>row.quantityConsumed),snapshots.map((row)=>row.unit),snapshots.map((row)=>row.unitCost),snapshots.map((row)=>row.recipeVersionId)],
    );
  }
  return result.rows.length;
}
