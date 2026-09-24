import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pool } from "../src/config/database.js";

type MenuRow = { category: string; product: string; variant: string; price: number };
const officialCategories = [
  "Warm Tales", "Cold Classics", "Chilled Chapter", "The Liter-Egg-y Feast",
  "The Anthology", "Fork and Folio", "Book Bites", "The Stacked Stories",
  "Sweet Endings", "Oven Edition",
];
const sampleNames = ["Americano", "Cappuccino", "Caramel Macchiato", "Spanish Latte"];
const sampleImportNames = ["pos_sales_test.csv", "pos_sales_test_1788767219997.csv", "e2e_pos_20260826.csv"];
const sampleShrinkageId = "36de8c03-929a-4311-a5f5-2712a4c78bbf";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function parseOfficialMenu(markdown: string): MenuRow[] {
  const rows: MenuRow[] = [];
  for (const line of markdown.split(/\r?\n/)) {
    if (!line.startsWith("| ") || line.includes("---|")) continue;
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
    if (cells.length !== 6 || !/^\d+(?:\.\d{1,2})?$/.test(cells[3] ?? "")) continue;
    rows.push({ category: cells[0]!, product: cells[1]!, variant: cells[2]!, price: Number(cells[3]) });
  }
  assert(rows.length === 81, `Expected 81 variant rows; found ${rows.length}`);
  const categoryNames = new Set(rows.map((row) => row.category));
  assert(categoryNames.size === 10 && officialCategories.every((name) => categoryNames.has(name)), "Official category list differs from approved preview");
  const products = new Map<string, MenuRow[]>();
  for (const row of rows) {
    assert(row.price > 0 && Number.isFinite(row.price), `Invalid price: ${row.product}`);
    assert(["Standard", "Small", "Large"].includes(row.variant), `Invalid variant: ${row.product}`);
    const key = `${row.category}\u0000${row.product}`;
    const variants = products.get(key) ?? [];
    assert(!variants.some((variant) => variant.variant.toLowerCase() === row.variant.toLowerCase()), `Duplicate variant: ${row.product}`);
    variants.push(row);
    products.set(key, variants);
  }
  assert(products.size === 69, `Expected 69 products; found ${products.size}`);
  const counts = { standard: 0, sized: 0 };
  for (const variants of products.values()) {
    const names = variants.map((row) => row.variant).sort().join(",");
    if (names === "Standard") counts.standard++;
    else if (names === "Large,Small") counts.sized++;
    else throw new Error(`Unexpected variant structure: ${variants[0]!.product}`);
  }
  assert(counts.standard === 57 && counts.sized === 12, "Official variant distribution differs from approved preview");
  return rows;
}

async function main() {
  const preview = process.argv[2];
  const mode = process.argv[3] ?? "--preview";
  assert(preview && ["--preview", "--apply", "--verify"].includes(mode), "Usage: tsx scripts/import-official-menu.ts <approved-preview.md> [--preview|--apply|--verify]");
  const rows = parseOfficialMenu(await readFile(resolve(preview), "utf8"));
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout = '10s'");
    const categoryResult = await client.query<{ id: string; name: string }>("SELECT id,name FROM menu_categories FOR UPDATE");
    const categories = new Map(categoryResult.rows.map((row) => [row.name, row.id]));
    const products = await client.query<{ id: string; code: string; name: string; category: string }>("SELECT id,code,name,category FROM menu_items FOR UPDATE");
    const counts = await client.query<{
      variants: number; recipes: number; recipe_items: number; sales: number; usage: number;
      imports: number; branch_rows: number; incidents: number; mappings: number; sources: number;
    }>(`SELECT
      (SELECT count(*)::int FROM menu_item_variants) variants,
      (SELECT count(*)::int FROM recipes) recipes,
      (SELECT count(*)::int FROM recipe_items) recipe_items,
      (SELECT count(*)::int FROM pos_sale_items) sales,
      (SELECT count(*)::int FROM pos_sale_ingredient_usage) usage,
      (SELECT count(*)::int FROM pos_imports) imports,
      (SELECT count(*)::int FROM menu_item_branches) branch_rows,
      (SELECT count(*)::int FROM incident_reports WHERE menu_item_id IS NOT NULL) incidents,
      (SELECT count(*)::int FROM pos_product_variant_mappings) mappings,
      (SELECT count(*)::int FROM pos_sources) sources`);
    const c = counts.rows[0]!;
    if (mode !== "--verify") {
      assert(products.rows.length === 4 && sampleNames.every((name) => products.rows.some((row) => row.name === name && row.code.startsWith("BEV-") && row.category === "Coffee")), "Catalog is not exactly the four approved sample products");
      assert(c.variants === 4 && c.recipes === 4 && c.recipe_items === 12 && c.sales === 7 && c.usage === 24 && c.imports === 3 && c.branch_rows === 20 && c.incidents === 0 && c.mappings === 0 && c.sources === 0, "Dependent sample counts changed; refusing reset");
      const imports = await client.query<{ id: string; source_filename: string; lines: number }>(`SELECT pi.id,pi.source_filename,count(psi.id)::int lines FROM pos_imports pi LEFT JOIN pos_sale_items psi ON psi.pos_import_id=pi.id GROUP BY pi.id`);
      assert(imports.rows.length === 3 && imports.rows.every((row) => sampleImportNames.includes(row.source_filename) && row.lines > 0), "POS imports are not exactly the three approved sample imports");
      const unrelatedSales = await client.query<{ count: number }>("SELECT count(*)::int count FROM pos_sale_items WHERE menu_item_id <> ALL($1::uuid[])", [products.rows.map((row) => row.id)]);
      assert(unrelatedSales.rows[0]!.count === 0, "Unrelated sales exist; refusing reset");
      const linkedShrinkage = await client.query<{ id: string; explanation: string; supporting_notes: string }>("SELECT id,explanation,supporting_notes FROM shrinkage_reports WHERE menu_item_id = ANY($1::uuid[]) FOR UPDATE", [products.rows.map((row) => row.id)]);
      assert(linkedShrinkage.rows.length === 1 && linkedShrinkage.rows[0]!.id === sampleShrinkageId && linkedShrinkage.rows[0]!.supporting_notes === "Automated live workflow verification.", "Unexpected shrinkage dependency; refusing reset");
      assert(officialCategories.every((name) => categories.has(name)), "An official category is missing; refusing reset");
      const legacy = categoryResult.rows.filter((row) => !officialCategories.includes(row.name));
      assert(legacy.length === 9 && legacy.every((row) => ["Coffee", "Non-Coffee", "Pastries", "Food", "Tea", "Refreshers", "Desserts", "Add-ons", "Others"].includes(row.name)), "Unexpected legacy category; refusing reset");
      console.log(JSON.stringify({ sampleProducts: products.rows, sampleVariants: c.variants, sampleRecipes: c.recipes, sampleRecipeItems: c.recipe_items, sampleSaleLines: c.sales, sampleUsageRows: c.usage, sampleImports: imports.rows, linkedSampleShrinkage: linkedShrinkage.rows, legacyCategories: legacy.map((row) => row.name), officialCategoriesReused: 10, plannedProducts: 69, plannedVariants: 81 }, null, 2));
      if (mode === "--preview") { await client.query("ROLLBACK"); return; }

      await client.query("DELETE FROM shrinkage_reports WHERE id=$1", [sampleShrinkageId]);
      await client.query("DELETE FROM pos_sale_ingredient_usage WHERE pos_sale_item_id IN (SELECT id FROM pos_sale_items WHERE menu_item_id = ANY($1::uuid[]))", [products.rows.map((row) => row.id)]);
      await client.query("DELETE FROM pos_sale_items WHERE menu_item_id = ANY($1::uuid[])", [products.rows.map((row) => row.id)]);
      await client.query("DELETE FROM pos_imports WHERE id = ANY($1::uuid[])", [imports.rows.map((row) => row.id)]);
      await client.query("DELETE FROM recipe_items WHERE recipe_id IN (SELECT id FROM recipes WHERE menu_item_id = ANY($1::uuid[]))", [products.rows.map((row) => row.id)]);
      await client.query("DELETE FROM recipes WHERE menu_item_id = ANY($1::uuid[])", [products.rows.map((row) => row.id)]);
      await client.query("DELETE FROM menu_item_branches WHERE menu_item_id = ANY($1::uuid[])", [products.rows.map((row) => row.id)]);
      await client.query("DELETE FROM menu_item_variants WHERE menu_item_id = ANY($1::uuid[])", [products.rows.map((row) => row.id)]);
      await client.query("DELETE FROM menu_items WHERE id = ANY($1::uuid[])", [products.rows.map((row) => row.id)]);
      await client.query("DELETE FROM menu_categories WHERE id = ANY($1::uuid[])", [legacy.map((row) => row.id)]);

      const groups = new Map<string, MenuRow[]>();
      for (const row of rows) {
        const key = `${row.category}\u0000${row.product}`;
        groups.set(key, [...(groups.get(key) ?? []), row]);
      }
      for (const variants of groups.values()) {
        const first = variants[0]!;
        const code = await client.query<{ code: string }>("SELECT 'PRD-'||lpad(nextval('menu_product_code_seq')::text,5,'0') code");
        const inserted = await client.query<{ id: string }>(`INSERT INTO menu_items (code,name,category_id,category,selling_price,status,product_scope,approval_status)
          VALUES ($1,$2,$3,$4,$5,'ACTIVE','GLOBAL','APPROVED') RETURNING id`, [code.rows[0]!.code, first.product, categories.get(first.category), first.category, first.price]);
        const productId = inserted.rows[0]!.id;
        for (const variant of variants) await client.query("INSERT INTO menu_item_variants (menu_item_id,name,selling_price,status) VALUES ($1,$2,$3,'ACTIVE')", [productId, variant.variant, variant.price]);
        await client.query("INSERT INTO menu_item_branches (menu_item_id,branch_id,availability_status,is_active) SELECT $1,id,'APPROVED',true FROM branches WHERE status='ACTIVE'", [productId]);
      }
    }

    const actual = await client.query<{ category: string; product: string; variant: string; price: number }>(`SELECT c.name category,m.name product,v.name variant,v.selling_price::float8 price
      FROM menu_item_variants v JOIN menu_items m ON m.id=v.menu_item_id JOIN menu_categories c ON c.id=m.category_id`);
    const expected = rows.map((row) => JSON.stringify(row)).sort();
    const got = actual.rows.map((row) => JSON.stringify(row)).sort();
    assert(JSON.stringify(got) === JSON.stringify(expected), "Saved names, categories, variants, or prices differ from approved preview");
    const final = await client.query<{ products: number; variants: number; categories: number; recipes: number; sales: number; imports: number; sources: number; mappings: number; branch_rows: number; duplicate_products: number; duplicate_variants: number }>(`SELECT
      (SELECT count(*)::int FROM menu_items) products,
      (SELECT count(*)::int FROM menu_item_variants) variants,
      (SELECT count(*)::int FROM menu_categories) categories,
      (SELECT count(*)::int FROM recipes) recipes,
      (SELECT count(*)::int FROM pos_sale_items) sales,
      (SELECT count(*)::int FROM pos_imports) imports,
      (SELECT count(*)::int FROM pos_sources) sources,
      (SELECT count(*)::int FROM pos_product_variant_mappings) mappings,
      (SELECT count(*)::int FROM menu_item_branches) branch_rows,
      (SELECT count(*)::int FROM (SELECT category_id,lower(name) FROM menu_items GROUP BY 1,2 HAVING count(*)>1) d) duplicate_products,
      (SELECT count(*)::int FROM (SELECT menu_item_id,lower(name) FROM menu_item_variants GROUP BY 1,2 HAVING count(*)>1) d) duplicate_variants`);
    const f = final.rows[0]!;
    assert(f.products === 69 && f.variants === 81 && f.categories === 10 && f.recipes === 0 && f.sales === 0 && f.imports === 0 && f.sources === 0 && f.mappings === 0 && f.branch_rows === 345 && f.duplicate_products === 0 && f.duplicate_variants === 0, "Final database validation failed");
    console.log(JSON.stringify({ mode, ...f, exactPriceAndNameMatch: true }, null, 2));
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

if (process.argv[1]?.includes("import-official-menu")) main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
