import fs from "node:fs";
import dotenv from "dotenv";
import pg from "pg";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { classifyUnmatchedPosIdentity } from "../services/posCsvImport.service.js";
import { parsePosExcel } from "../services/posExcelImport.service.js";
import { calculatePosImportSimulation, type PosSimulationRecipeItem } from "../services/posImportSimulation.service.js";
import { loadPosMappings, resolvePosMapping } from "../services/posProductVariantMapping.service.js";
import { saveRecipeDefinition } from "../services/recipeVersion.service.js";

const backendDir = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
dotenv.config({ path: resolve(backendDir, ".env"), quiet: true });

const SOURCE_CODE = "LIBRO_LEGACY_SUMMARY_XLS_001";
const SOURCE_FORMAT = "SUMMARY_ITEMS_SOLD_LEGACY_XLS";
const PROVENANCE = "SAMPLE / ASSUMED — FOR SYSTEM DEMONSTRATION";
const EFFECTIVE_FROM = "2026-01-01";

export const FINAL_POS_MAPPING_TARGETS = [
  { posName: "B1T1 SL ML", product: "Spanish Latte", variant: "Large" },
  { posName: "B1T1 ML", product: "Matcha Latte", variant: "Large" },
  { posName: "NEW CRISPY BITES", product: "Crispy Bites", variant: "Standard" },
  { posName: "SOLO WEDGES", product: "Fries Overload Solo", variant: "Standard" },
  { posName: "FP C16 SPNLT", product: "Spanish Latte", variant: "Large" },
] as const;

type Counts = {
  products: number; variants: number; ingredients: number; recipes: number; recipeItems: number;
  sources: number; mappings: number; imports: number; saleItems: number;
};

type Target = {
  productId: string; product: string; variantId: string; variant: string;
  recipeId: string; recipeVersion: number; recipeItemCount: number; unitsValid: boolean;
};

function requireCondition(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

const normalize = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();

async function counts(client: pg.PoolClient): Promise<Counts> {
  return (await client.query<Counts>(`SELECT
    (SELECT count(*)::int FROM menu_items) products,
    (SELECT count(*)::int FROM menu_item_variants) variants,
    (SELECT count(*)::int FROM inventory_items) ingredients,
    (SELECT count(*)::int FROM recipes) recipes,
    (SELECT count(*)::int FROM recipe_items) "recipeItems",
    (SELECT count(*)::int FROM pos_sources) sources,
    (SELECT count(*)::int FROM pos_product_variant_mappings) mappings,
    (SELECT count(*)::int FROM pos_imports) imports,
    (SELECT count(*)::int FROM pos_sale_items) "saleItems"`)).rows[0]!;
}

async function hashRows(client: pg.PoolClient, table: string, ids: string[]) {
  if (ids.length === 0) return "EMPTY";
  return (await client.query<{ hash: string }>(
    `SELECT md5(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'[]')) hash
       FROM (SELECT * FROM ${table} WHERE id=ANY($1::uuid[])) t`, [ids],
  )).rows[0]!.hash;
}

async function ensureCrispyBites(client: pg.PoolClient, reviewerId: string) {
  const existing = await client.query<{ productId: string; variantId: string }>(
    `SELECT mi.id "productId",v.id "variantId" FROM menu_items mi
       JOIN menu_item_variants v ON v.menu_item_id=mi.id
      WHERE lower(mi.name)=lower('Crispy Bites') AND lower(v.name)='standard'`,
  );
  if (existing.rows[0]) return { ...existing.rows[0], created: false };

  const category = await client.query<{ id: string; name: string }>(
    `SELECT id,name FROM menu_categories WHERE lower(name)=lower('Book Bites')`,
  );
  requireCondition(category.rows.length === 1, "Book Bites category was not found exactly once.");
  const ingredients = await client.query<{ id: string; name: string; unit: string }>(
    `SELECT id,name,unit FROM inventory_items WHERE status='ACTIVE' AND lower(name)=ANY($1::text[])`,
    [["chicken tender", "cooking oil"]],
  );
  const byName = new Map(ingredients.rows.map((item) => [item.name.toLowerCase(), item]));
  requireCondition(byName.get("chicken tender")?.unit === "pc", "Chicken Tender in pc is required.");
  requireCondition(byName.get("cooking oil")?.unit === "ml", "Cooking Oil in ml is required.");

  const code = await client.query<{ code: string }>(
    `SELECT 'PRD-'||lpad(nextval('menu_product_code_seq')::text,5,'0') code`,
  );
  const product = await client.query<{ id: string }>(
    `INSERT INTO menu_items
      (code,name,category_id,category,selling_price,description,status,created_by,product_scope,origin_branch_id,approval_status)
     VALUES ($1,'Crispy Bites',$2,$3,339,$4,'ACTIVE',$5,'GLOBAL',NULL,'APPROVED') RETURNING id`,
    [code.rows[0]!.code, category.rows[0]!.id, category.rows[0]!.name,
      `Demonstration menu identity; ${PROVENANCE}`, reviewerId],
  );
  const productId = product.rows[0]!.id;
  const variant = await client.query<{ id: string }>(
    `INSERT INTO menu_item_variants (menu_item_id,name,selling_price,status)
     VALUES ($1,'Standard',339,'ACTIVE') RETURNING id`, [productId],
  );
  const variantId = variant.rows[0]!.id;
  await client.query(
    `INSERT INTO menu_item_branches
      (menu_item_id,branch_id,availability_status,is_active,reviewed_by,reviewed_at,review_comment)
     SELECT $1,id,'APPROVED',true,$2,now(),$3 FROM branches WHERE status='ACTIVE'`,
    [productId, reviewerId, PROVENANCE],
  );
  await saveRecipeDefinition(client, {
    menuItemId: productId,
    menuItemVariantId: variantId,
    name: "Crispy Bites Standard Recipe",
    yieldQuantity: 1,
    status: "ACTIVE",
    effectiveFrom: EFFECTIVE_FROM,
    changeReason: PROVENANCE,
    createdBy: reviewerId,
    items: [
      { inventoryItemId: byName.get("chicken tender")!.id, quantity: 6, unit: "pc" },
      { inventoryItemId: byName.get("cooking oil")!.id, quantity: 25, unit: "ml" },
    ],
  });
  return { productId, variantId, created: true };
}

async function resolveTarget(client: pg.PoolClient, product: string, variant: string): Promise<Target> {
  const result = await client.query<Target>(
    `SELECT mi.id "productId",mi.name product,v.id "variantId",v.name variant,
            r.id "recipeId",r.version "recipeVersion",count(ri.id)::int "recipeItemCount",
            bool_and((ri.unit IN ('g','kg') AND ii.unit IN ('g','kg')) OR
                     (ri.unit IN ('ml','L') AND ii.unit IN ('ml','L')) OR
                     (ri.unit='pc' AND ii.unit='pc')) "unitsValid"
       FROM menu_items mi JOIN menu_item_variants v ON v.menu_item_id=mi.id
       JOIN recipes r ON r.menu_item_variant_id=v.id AND r.status='ACTIVE'
         AND r.effective_from<='2026-09-16'::date AND (r.effective_to IS NULL OR r.effective_to>'2026-09-16'::date)
       JOIN recipe_items ri ON ri.recipe_id=r.id JOIN inventory_items ii ON ii.id=ri.inventory_item_id
      WHERE lower(mi.name)=lower($1) AND lower(v.name)=lower($2)
        AND mi.status='ACTIVE' AND mi.approval_status='APPROVED' AND v.status='ACTIVE'
      GROUP BY mi.id,mi.name,v.id,v.name,r.id,r.version`, [product, variant],
  );
  requireCondition(result.rows.length === 1, `Expected one active recipe-backed target for ${product} / ${variant}.`);
  const target = result.rows[0]!;
  requireCondition(target.recipeItemCount > 0 && target.unitsValid, `Invalid recipe for ${product} / ${variant}.`);
  return target;
}

async function simulatePreview(client: pg.PoolClient, filePath: string, sourceId: string, branchId: string) {
  const parsed = parsePosExcel(filePath, fs.readFileSync(filePath));
  const mappings = await loadPosMappings(client, sourceId, branchId, parsed.businessDate);
  const sellable: Array<{ quantitySold: number; unitPrice: number; recipeVersionId: string }> = [];
  const unresolved = new Map<string, number>();
  let operationalRows = 0;
  for (const row of parsed.rows) {
    if (classifyUnmatchedPosIdentity(row.sourceProduct) === "OPERATIONAL_ITEM") {
      operationalRows += 1;
      continue;
    }
    const resolution = resolvePosMapping(row, branchId, mappings);
    if (!resolution || resolution.status !== "APPROVED" || row.quantitySold === null || row.unitPrice === null) {
      unresolved.set(row.sourceProduct, (unresolved.get(row.sourceProduct) ?? 0) + 1);
      continue;
    }
    const recipe = await client.query<{ id: string }>(
      `SELECT id FROM recipes WHERE menu_item_variant_id=$1 AND status='ACTIVE'
        AND effective_from<=$2::date AND (effective_to IS NULL OR effective_to>$2::date)
       ORDER BY effective_from DESC,version DESC LIMIT 1`, [resolution.menuItemVariantId, parsed.businessDate],
    );
    requireCondition(recipe.rows[0], `Recipe lookup failed for ${row.sourceProduct}.`);
    sellable.push({ quantitySold: row.quantitySold, unitPrice: row.unitPrice, recipeVersionId: recipe.rows[0].id });
  }
  const recipeIds = [...new Set(sellable.map((row) => row.recipeVersionId))];
  const items = recipeIds.length ? await client.query<PosSimulationRecipeItem>(
    `SELECT r.id "recipeVersionId",ri.inventory_item_id "inventoryItemId",ii.sku,ii.name,
            ri.quantity::float8 "recipeQuantity",ri.unit "recipeUnit",ii.unit "inventoryUnit",
            COALESCE(bis.current_unit_cost,ii.unit_cost)::float8 "unitCost",r.yield_quantity::float8 "yieldQuantity"
       FROM recipes r JOIN recipe_items ri ON ri.recipe_id=r.id JOIN inventory_items ii ON ii.id=ri.inventory_item_id
       LEFT JOIN branch_inventory_settings bis ON bis.branch_id=$2 AND bis.inventory_item_id=ii.id
      WHERE r.id=ANY($1::uuid[])`, [recipeIds, branchId],
  ) : { rows: [] as PosSimulationRecipeItem[] };
  return {
    totalRows: parsed.rows.length,
    sellableRows: sellable.length,
    operationalRows,
    unknownReviewRows: [...unresolved.values()].reduce((sum, value) => sum + value, 0),
    unresolved: [...unresolved].map(([name, rows]) => ({ name, rows })),
    ...calculatePosImportSimulation(sellable, items.rows),
  };
}

async function main() {
  const mode = process.argv[2] ?? "--preview";
  const validationFile = process.argv[3];
  requireCondition(mode === "--preview" || mode === "--apply", "Usage: tsx completePosMappingValidation.ts [--preview|--apply] [POS file]");
  requireCondition(process.env.DATABASE_URL, "DATABASE_URL is required.");
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
    const before = await counts(client);
    const source = await client.query<{ id: string; reviewerId: string }>(
      `SELECT id,format_verified_by "reviewerId" FROM pos_sources
        WHERE source_code=$1 AND supported_format=$2 AND status='ACTIVE'
          AND format_verified_by IS NOT NULL AND format_verified_at IS NOT NULL`, [SOURCE_CODE, SOURCE_FORMAT],
    );
    requireCondition(source.rows.length === 1, "The verified Libro legacy POS source was not found exactly once.");
    const sourceId = source.rows[0]!.id;
    const owner = await client.query<{ id: string }>(
      `SELECT id FROM users WHERE id=$1 AND role='OWNER' AND status='ACTIVE'`, [source.rows[0]!.reviewerId],
    );
    requireCondition(owner.rows.length === 1, "The POS source reviewer is not an active Owner.");
    const reviewerId = owner.rows[0]!.id;
    const beforePreview = validationFile ? await simulatePreview(client, validationFile, sourceId,
      (await client.query<{ id: string }>(`SELECT id FROM branches WHERE status='ACTIVE' ORDER BY created_at,id LIMIT 1`)).rows[0]!.id) : null;

    const protectedMappings = await client.query<{ id: string }>(`SELECT id FROM pos_product_variant_mappings ORDER BY id`);
    const protectedRecipes = await client.query<{ id: string }>(`SELECT id FROM recipes ORDER BY id`);
    const mappingHash = await hashRows(client, "pos_product_variant_mappings", protectedMappings.rows.map((row) => row.id));
    const recipeHash = await hashRows(client, "recipes", protectedRecipes.rows.map((row) => row.id));

    const existingNames = await client.query<{ name: string }>(
      `SELECT normalized_source_product_name name FROM pos_product_variant_mappings
        WHERE pos_source_id=$1 AND branch_id IS NULL AND status='ACTIVE'`, [sourceId],
    );
    const duplicates = new Set(existingNames.rows.map((row) => row.name));
    const requestedDuplicates = FINAL_POS_MAPPING_TARGETS.filter((mapping) => duplicates.has(normalize(mapping.posName)));
    requireCondition(requestedDuplicates.length === 0, `Required mappings already exist: ${requestedDuplicates.map((item) => item.posName).join(", ")}`);

    if (mode === "--preview") {
      for (const mapping of FINAL_POS_MAPPING_TARGETS.filter((item) => item.product !== "Crispy Bites")) {
        await resolveTarget(client, mapping.product, mapping.variant);
      }
      const category = await client.query(`SELECT 1 FROM menu_categories WHERE lower(name)=lower('Book Bites')`);
      const ingredients = await client.query(`SELECT name,unit FROM inventory_items WHERE status='ACTIVE' AND lower(name)=ANY($1::text[])`, [["chicken tender", "cooking oil"]]);
      requireCondition(category.rows.length === 1 && ingredients.rows.length === 2, "Crispy Bites prerequisites are incomplete.");
      await client.query("ROLLBACK");
      console.log(JSON.stringify({ transaction: "DRY_RUN_ROLLED_BACK", before, beforePreview,
        plannedProduct: { product: "Crispy Bites", variant: "Standard", sellingPrice: 339,
          recipe: [{ ingredient: "Chicken Tender", quantity: 6, unit: "pc" }, { ingredient: "Cooking Oil", quantity: 25, unit: "ml" }], provenance: PROVENANCE },
        plannedMappings: FINAL_POS_MAPPING_TARGETS, expectedCounts: { ...before, products: before.products + 1,
          variants: before.variants + 1, recipes: before.recipes + 1, recipeItems: before.recipeItems + 2,
          mappings: before.mappings + FINAL_POS_MAPPING_TARGETS.length } }, null, 2));
      return;
    }

    await client.query("LOCK TABLE menu_items,menu_item_variants,recipes,recipe_items,pos_product_variant_mappings IN SHARE ROW EXCLUSIVE MODE");
    const crispy = await ensureCrispyBites(client, reviewerId);
    requireCondition(crispy.created, "Crispy Bites unexpectedly existed; no existing product was changed.");
    const createdMappings: Array<{ id: string; posName: string; product: string; variant: string; recipeId: string; recipeVersion: number }> = [];
    for (const mapping of FINAL_POS_MAPPING_TARGETS) {
      const target = await resolveTarget(client, mapping.product, mapping.variant);
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO pos_product_variant_mappings
          (pos_source_id,branch_id,source_product_name,source_product_code,menu_item_variant_id,status,
           review_status,review_comment,reviewed_by,reviewed_at)
         VALUES ($1,NULL,$2,NULL,$3,'ACTIVE','APPROVED',$4,$5,now()) RETURNING id`,
        [sourceId, mapping.posName, target.variantId, PROVENANCE, reviewerId],
      );
      createdMappings.push({ id: inserted.rows[0]!.id, posName: mapping.posName, product: target.product,
        variant: target.variant, recipeId: target.recipeId, recipeVersion: target.recipeVersion });
    }

    requireCondition(await hashRows(client, "pos_product_variant_mappings", protectedMappings.rows.map((row) => row.id)) === mappingHash,
      "An existing POS mapping changed.");
    requireCondition(await hashRows(client, "recipes", protectedRecipes.rows.map((row) => row.id)) === recipeHash,
      "An existing recipe changed.");
    const after = await counts(client);
    requireCondition(after.products === before.products + 1 && after.variants === before.variants + 1 &&
      after.recipes === before.recipes + 1 && after.recipeItems === before.recipeItems + 2 &&
      after.mappings === before.mappings + FINAL_POS_MAPPING_TARGETS.length && after.ingredients === before.ingredients &&
      after.sources === before.sources && after.imports === before.imports && after.saleItems === before.saleItems,
      `Unexpected post-insertion counts: ${JSON.stringify(after)}`);
    const branchId = (await client.query<{ id: string }>(
      `SELECT id FROM branches WHERE status='ACTIVE' ORDER BY created_at,id LIMIT 1`,
    )).rows[0]!.id;
    const afterPreview = validationFile ? await simulatePreview(client, validationFile, sourceId, branchId) : null;
    requireCondition(!afterPreview || afterPreview.unknownReviewRows === 0, "The POS preview still contains blocking UNKNOWN_REVIEW rows.");
    await client.query("COMMIT");
    console.log(JSON.stringify({ transaction: "COMMITTED", before, after, beforePreview, afterPreview,
      createdProduct: { product: "Crispy Bites", variant: "Standard", provenance: PROVENANCE },
      createdMappings, protectedExistingMappings: protectedMappings.rows.length,
      protectedExistingRecipes: protectedRecipes.rows.length }, null, 2));
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

if (process.argv[1]?.includes("completePosMappingValidation")) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
