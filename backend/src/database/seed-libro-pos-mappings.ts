import { pool } from "../config/database.js";

const SOURCE_CODE = "LIBRO_LEGACY_SUMMARY_XLS_001";
const SOURCE_FORMAT = "SUMMARY_ITEMS_SOLD_LEGACY_XLS";
const REVIEW_NOTE = "Initial Libro POS onboarding mapping review";
const DEMO_REVIEW_NOTE = "SAMPLE / ASSUMED — FOR SYSTEM DEMONSTRATION";

export const libroPosOnboardingMappings = [
  { posName: "H12 AMRCN", product: "Americano", variant: "Standard" },
  { posName: "H12 CAFLT", product: "Café Latte", variant: "Standard" },
  { posName: "H12 CAPP", product: "Cappuccino", variant: "Standard" },
  { posName: "H12 CRLMCT", product: "Caramel Macchiato", variant: "Standard" },
  { posName: "H12 SPNLT", product: "Spanish Latte", variant: "Standard" },
  { posName: "H12 CHCLT", product: "Chocolate", variant: "Standard" },
  { posName: "C12 AMRCN", product: "Americano", variant: "Small" },
  { posName: "C12 CAFLT", product: "Café Latte", variant: "Small" },
  { posName: "C12 CRLMCT", product: "Caramel Macchiato", variant: "Small" },
  { posName: "C12 SPNLT", product: "Spanish Latte", variant: "Small" },
  { posName: "C12 MTCHA", product: "Matcha Latte", variant: "Small" },
  { posName: "C12 WHMCH", product: "White Mocha Latte", variant: "Small" },
  { posName: "C12 SLTCRL", product: "Salted Caramel Latte", variant: "Small" },
  { posName: "C16 AMRCN", product: "Americano", variant: "Large" },
  { posName: "C16 CAFLT", product: "Café Latte", variant: "Large" },
  { posName: "C16 CRLMCT", product: "Caramel Macchiato", variant: "Large" },
  { posName: "C16 SPNLT", product: "Spanish Latte", variant: "Large" },
  { posName: "C16 MTCHA", product: "Matcha Latte", variant: "Large" },
  { posName: "C16 WHMCH", product: "White Mocha Latte", variant: "Large" },
  { posName: "C16 SLTCRL", product: "Salted Caramel Latte", variant: "Large" },
  { posName: "F12 CHJVCHP", product: "Chocolate Java Chip", variant: "Small" },
  { posName: "F12 STBRCRM", product: "Strawberry Cream", variant: "Small" },
  { posName: "F16 CHJVCHP", product: "Chocolate Java Chip", variant: "Large" },
  { posName: "F16 STBRCRM", product: "Strawberry Cream", variant: "Large" },
  { posName: "MEATY SPAGHETTI", product: "Meaty Spaghetti", variant: "Standard" },
  { posName: "CARBONARA", product: "Carbonara", variant: "Standard" },
  { posName: "CHEESE PIZZA", product: "Cheese Pizza", variant: "Standard" },
  { posName: "HAWAIIAN PIZZA", product: "Hawaiian Pizza", variant: "Standard" },
  { posName: "H12 BRKBR", product: "Barako Brew", variant: "Standard" },
  { posName: "C12 CHCLT", product: "Chocolate", variant: "Small" },
  { posName: "C16 CHCLT", product: "Chocolate", variant: "Large" },
  { posName: "GREEN APPLE SODA", product: "Green Apple Soda", variant: "Standard" },
  { posName: "PURE JASMINE", product: "Pure Jasmine", variant: "Standard" },
  { posName: "MIDSUMMER SANGRIA", product: "Midsummer Sangria", variant: "Standard" },
  { posName: "NUTELLA WAFFLE", product: "Nutella Waffle", variant: "Standard" },
  { posName: "FRIES OVERLOAD LARGE", product: "Fries Overload Large", variant: "Standard" },
  { posName: "SPAM N EGG", product: "Spam & Egg", variant: "Standard" },
  { posName: "CLUBHOUSE SANDWICH", product: "Clubhouse Sandwich", variant: "Standard" },
  { posName: "ICED TEA 16OZ", product: "Iced Tea", variant: "Standard" },
  { posName: "FRIES OVERLOAD SOLO", product: "Fries Overload Solo", variant: "Standard" },
  { posName: "GRILLED CHEESE", product: "Grilled Cheese", variant: "Standard" },
  { posName: "NACHOS OVERLOAD SOLO", product: "Nachos Overload Solo", variant: "Standard" },
  { posName: "PANCAKE PAGES", product: "Pancake Pages", variant: "Standard" },
  { posName: "NUTELLA-ALMOND CROFFLES", product: "Nutella-Almond Croffle", variant: "Standard" },
  { posName: "AGLIO Y OLIO", product: "Aglio Y Olio", variant: "Standard" },
  { posName: "SHE A FROOTY", product: "She-a-Frooty", variant: "Standard" },
  { posName: "THE OTHER CHOICE", product: "The Other Choice", variant: "Standard" },
  { posName: "TUNA PASTA", product: "Tuna Pasta", variant: "Standard" },
  { posName: "SPICY AGLIO Y OLIO", product: "Spicy Aglio Y Olio", variant: "Standard" },
  { posName: "GARLIC PEPPER RICE W/LUMPIA", product: "Garlic Pepper Rice w/ Lumpia", variant: "Standard" },
  { posName: "BURNT BASQUE CHEESECAKE", product: "Burnt Basque Cheesecake", variant: "Standard" },
  { posName: "LARGE FRIES", product: "Salt & Pepper Fries", variant: "Standard", reviewNote: DEMO_REVIEW_NOTE },
  { posName: "PEPPERONI", product: "Pepperoni Pizza", variant: "Standard", reviewNote: DEMO_REVIEW_NOTE },
  { posName: "HOPE WATER", product: "Bottled Water", variant: "Standard", reviewNote: DEMO_REVIEW_NOTE },
] as const;

type Mode = "--preview" | "--apply";
type Snapshot = { sources: number; mappings: number; imports: number; saleItems: number };
type TargetRow = {
  productId: string;
  productName: string;
  productStatus: "ACTIVE" | "INACTIVE";
  approvalStatus: string;
  variantId: string | null;
  variantName: string | null;
  variantStatus: "ACTIVE" | "INACTIVE" | null;
  recipeId: string | null;
  recipeVersion: number | null;
  recipeItemCount: number;
  recipeUnitsValid: boolean;
};

function normalizePosName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main() {
  const mode = (process.argv[2] ?? "--preview") as Mode;
  assert(mode === "--preview" || mode === "--apply", "Usage: npm run db:seed:pos-mappings -- [--preview|--apply]");
  const client = await pool.connect();
  try {
    await client.query(mode === "--apply" ? "BEGIN ISOLATION LEVEL SERIALIZABLE" : "BEGIN ISOLATION LEVEL SERIALIZABLE READ ONLY");
    await client.query("SET LOCAL lock_timeout = '10s'");

    const snapshot = async () => (await client.query<Snapshot>(`SELECT
      (SELECT count(*)::int FROM pos_sources) sources,
      (SELECT count(*)::int FROM pos_product_variant_mappings) mappings,
      (SELECT count(*)::int FROM pos_imports) imports,
      (SELECT count(*)::int FROM pos_sale_items) "saleItems"`)).rows[0]!;
    const before = await snapshot();

    const sourceResult = await client.query<{
      id: string; status: string; supportedFormat: string; formatVerifiedBy: string | null; formatVerifiedAt: Date | null;
    }>(`SELECT id,status,supported_format "supportedFormat",format_verified_by "formatVerifiedBy",format_verified_at "formatVerifiedAt"
          FROM pos_sources WHERE source_code=$1`, [SOURCE_CODE]);
    assert(sourceResult.rows.length === 1, `Required POS source ${SOURCE_CODE} was not found exactly once.`);
    const source = sourceResult.rows[0]!;
    assert(source.status === "ACTIVE", `POS source ${SOURCE_CODE} is not ACTIVE.`);
    assert(source.supportedFormat === SOURCE_FORMAT, `POS source ${SOURCE_CODE} does not use ${SOURCE_FORMAT}.`);
    assert(source.formatVerifiedBy && source.formatVerifiedAt, `POS source ${SOURCE_CODE} has not completed format verification.`);

    const owners = await client.query<{ id: string }>(
      `SELECT id FROM users WHERE role='OWNER' AND status='ACTIVE'
       ORDER BY (id=$1::uuid) DESC,created_at,id`, [source.formatVerifiedBy],
    );
    assert(owners.rows[0], "An active Owner reviewer is required before onboarding mappings can be seeded.");
    const reviewerId = owners.rows[0].id;

    const productNames = [...new Set(libroPosOnboardingMappings.map((mapping) => mapping.product.toLowerCase()))];
    const targets = await client.query<TargetRow>(`SELECT
        m.id "productId",m.name "productName",m.status "productStatus",m.approval_status "approvalStatus",
        v.id "variantId",v.name "variantName",v.status "variantStatus",
        r.id "recipeId",r.version "recipeVersion",
        COALESCE((SELECT count(*)::int FROM recipe_items ri WHERE ri.recipe_id=r.id),0) "recipeItemCount",
        CASE WHEN r.id IS NULL THEN false ELSE NOT EXISTS (
          SELECT 1 FROM recipe_items ri JOIN inventory_items ii ON ii.id=ri.inventory_item_id
          WHERE ri.recipe_id=r.id AND NOT (
            (ri.unit IN ('g','kg') AND ii.unit IN ('g','kg')) OR
            (ri.unit IN ('ml','L') AND ii.unit IN ('ml','L')) OR
            (ri.unit='pc' AND ii.unit='pc')
          )
        ) END "recipeUnitsValid"
      FROM menu_items m
      LEFT JOIN menu_item_variants v ON v.menu_item_id=m.id
      LEFT JOIN LATERAL (
        SELECT candidate.id,candidate.version FROM recipes candidate
        WHERE candidate.menu_item_variant_id=v.id AND candidate.status='ACTIVE'
          AND candidate.effective_from<=CURRENT_DATE
          AND (candidate.effective_to IS NULL OR candidate.effective_to>CURRENT_DATE)
        ORDER BY candidate.effective_from DESC,candidate.version DESC LIMIT 1
      ) r ON true
      WHERE lower(m.name)=ANY($1::text[])`, [productNames]);

    const existing = await client.query<{ normalizedName: string }>(
      `SELECT normalized_source_product_name "normalizedName"
         FROM pos_product_variant_mappings
        WHERE pos_source_id=$1 AND branch_id IS NULL`, [source.id],
    );
    const existingNames = new Set(existing.rows.map((row) => row.normalizedName));
    const summary = {
      created: [] as string[],
      readyToCreate: [] as string[],
      skipped: [] as string[],
      missingProducts: [] as string[],
      missingVariants: [] as string[],
      missingRecipes: [] as string[],
      duplicateMappings: [] as string[],
      ambiguousTargets: [] as string[],
    };

    const ready: Array<{ posName: string; variantId: string; target: string; reviewNote: string }> = [];
    for (const mapping of libroPosOnboardingMappings) {
      const label = `${mapping.posName} -> ${mapping.product} / ${mapping.variant}`;
      const products = targets.rows.filter((row) => row.productName.toLowerCase() === mapping.product.toLowerCase());
      if (products.length === 0) {
        summary.missingProducts.push(label);
        summary.skipped.push(label);
        continue;
      }
      const variants = products.filter((row) => row.variantName?.toLowerCase() === mapping.variant.toLowerCase());
      if (variants.length === 0) {
        summary.missingVariants.push(label);
        summary.skipped.push(label);
        continue;
      }
      const active = variants.filter((row) => row.productStatus === "ACTIVE" && row.approvalStatus === "APPROVED" && row.variantStatus === "ACTIVE");
      if (active.length !== 1) {
        summary.ambiguousTargets.push(`${label} (${active.length} active exact targets)`);
        summary.skipped.push(label);
        continue;
      }
      const target = active[0]!;
      if (!target.recipeId || target.recipeItemCount === 0 || !target.recipeUnitsValid) {
        summary.missingRecipes.push(label);
        summary.skipped.push(label);
        continue;
      }
      if (existingNames.has(normalizePosName(mapping.posName))) {
        summary.duplicateMappings.push(label);
        summary.skipped.push(label);
        continue;
      }
      assert(target.variantId, `Resolved target ${label} has no variant ID.`);
      ready.push({ posName: mapping.posName, variantId: target.variantId, target: label,
        reviewNote: "reviewNote" in mapping ? mapping.reviewNote : REVIEW_NOTE });
      summary.readyToCreate.push(label);
    }

    if (mode === "--apply") {
      await client.query("LOCK TABLE pos_product_variant_mappings IN SHARE ROW EXCLUSIVE MODE");
      for (const mapping of ready) {
        const inserted = await client.query<{ id: string }>(`INSERT INTO pos_product_variant_mappings
          (pos_source_id,branch_id,source_product_name,source_product_code,menu_item_variant_id,status,
           review_status,review_comment,reviewed_by,reviewed_at)
          VALUES ($1,NULL,$2,NULL,$3,'ACTIVE','APPROVED',$4,$5,now())
          ON CONFLICT DO NOTHING RETURNING id`,
        [source.id, mapping.posName, mapping.variantId, mapping.reviewNote, reviewerId]);
        if (inserted.rows[0]) summary.created.push(`${mapping.target} [${inserted.rows[0].id}]`);
        else {
          summary.duplicateMappings.push(mapping.target);
          summary.skipped.push(mapping.target);
        }
      }
    }

    const after = await snapshot();
    const added = mode === "--apply" ? summary.created.length : 0;
    assert(after.sources === before.sources, "POS source count changed unexpectedly.");
    assert(after.imports === before.imports && after.saleItems === before.saleItems, "POS import or sales records changed unexpectedly.");
    assert(after.mappings === before.mappings + added, "POS mapping count does not match the created mapping count.");

    console.log(JSON.stringify({
      mode,
      source: { code: SOURCE_CODE, format: SOURCE_FORMAT, id: source.id },
      branchScope: "GLOBAL",
      reviewerId,
      requestedMappings: libroPosOnboardingMappings.length,
      ...summary,
      counts: { before, after },
    }, null, 2));
    if (mode === "--apply") await client.query("COMMIT");
    else await client.query("ROLLBACK");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

if (process.argv[1]?.includes("seed-libro-pos-mappings")) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
