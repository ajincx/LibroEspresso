import bcrypt from "bcrypt";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createIngredientUsageSnapshots, saveRecipeDefinition } from "../services/recipeVersion.service.js";

// Set MENU_PRODUCT_E2E_DATABASE_URL to a dedicated database named *_e2e.
// The ordinary application database is intentionally never used by this test.
const e2eDatabaseUrl = process.env.MENU_PRODUCT_E2E_DATABASE_URL;
const suite = e2eDatabaseUrl ? describe : describe.skip;

suite("authenticated Menu & Recipe product saves", () => {
  let app: Awaited<typeof import("../app.js")>["app"];
  let pool: Awaited<typeof import("../config/database.js")>["pool"];
  let categoryId = "";
  let branchId = "";
  let ownerId = "";
  let managerId = "";
  let staffId = "";
  let oldProductId = "";
  let oldImportId = "";
  let ingredientId = "";
  let ownerCookie = "";
  let managerCookie = "";
  let staffCookie = "";
  let originalSnapshot: Record<string, unknown> | undefined;
  const createdProductIds: string[] = [];
  const runId = crypto.randomUUID().slice(0, 8);
  const businessDate = new Date().toISOString().slice(0, 10);
  const password = `E2e-${runId}-password`;

  const readExistingSnapshot = async () => (await pool.query<Record<string, unknown>>(
    `SELECT to_jsonb(m) product,
            (SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM recipes r WHERE r.menu_item_id=m.id) recipes,
            (SELECT jsonb_agg(to_jsonb(ri) ORDER BY ri.id) FROM recipe_items ri JOIN recipes r ON r.id=ri.recipe_id WHERE r.menu_item_id=m.id) "recipeItems",
            (SELECT jsonb_agg(to_jsonb(v) ORDER BY v.id) FROM menu_item_variants v WHERE v.menu_item_id=m.id) variants,
            (SELECT jsonb_agg(to_jsonb(s) ORDER BY s.id) FROM pos_sale_items s WHERE s.menu_item_id=m.id) sales
       FROM menu_items m WHERE m.id=$1`, [oldProductId],
  )).rows[0];

  beforeAll(async () => {
    if (!e2eDatabaseUrl) throw new Error("An isolated E2E database URL is required");
    const databaseName = decodeURIComponent(new URL(e2eDatabaseUrl).pathname.slice(1));
    if (!/^libro_[a-z0-9_]+_e2e$/i.test(databaseName)) {
      throw new Error("Refusing to run product-save E2E tests outside a dedicated libro_*_e2e database");
    }

    const migrationClient = new pg.Client({ connectionString: e2eDatabaseUrl });
    await migrationClient.connect();
    try {
      await migrationClient.query("CREATE TABLE IF NOT EXISTS schema_migrations (filename text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
      const directory = fileURLToPath(new URL("../../migrations/", import.meta.url));
      for (const filename of (await readdir(directory)).filter((file) => file.endsWith(".sql")).sort()) {
        if ((await migrationClient.query("SELECT 1 FROM schema_migrations WHERE filename=$1", [filename])).rowCount) continue;
        await migrationClient.query("BEGIN");
        try {
          await migrationClient.query(await readFile(join(directory, filename), "utf8"));
          await migrationClient.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [filename]);
          await migrationClient.query("COMMIT");
        } catch (error) {
          await migrationClient.query("ROLLBACK");
          throw error;
        }
      }
    } finally {
      await migrationClient.end();
    }

    process.env.NODE_ENV = "test";
    process.env.DATABASE_URL = e2eDatabaseUrl;
    process.env.CLIENT_URL = "http://localhost:5173";
    process.env.JWT_SECRET = "menu-product-e2e-secret-at-least-32-characters";
    ({ pool } = await import("../config/database.js"));
    ({ app } = await import("../app.js"));

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      categoryId = (await client.query<{ id: string }>("SELECT id FROM menu_categories WHERE lower(name)='coffee' LIMIT 1")).rows[0]!.id;
      branchId = (await client.query<{ id: string }>("INSERT INTO branches (code,name,location) VALUES ($1,$2,$3) RETURNING id", [`E2E${runId}`, `E2E Branch ${runId}`, "Test only"])).rows[0]!.id;
      const hash = await bcrypt.hash(password, 4);
      const insertUser = async (role: "OWNER" | "BRANCH_MANAGER" | "STAFF", branch: string | null) =>
        (await client.query<{ id: string }>(
          "INSERT INTO users (branch_id,first_name,last_name,email,username,password_hash,role,position,status) VALUES ($1,'Menu','E2E',$2,$3,$4,$5,$6,'ACTIVE') RETURNING id",
          [branch, `${role.toLowerCase()}-${runId}@e2e.local`, `${role.toLowerCase()}-${runId}`, hash, role, role],
        )).rows[0]!.id;
      ownerId = await insertUser("OWNER", null);
      managerId = await insertUser("BRANCH_MANAGER", branchId);
      staffId = await insertUser("STAFF", branchId);
      ingredientId = (await client.query<{ id: string }>("INSERT INTO inventory_items (sku,name,category,unit,unit_cost,reorder_level) VALUES ($1,$2,'E2E','g',2,0) RETURNING id", [`E2E-I-${runId}`, `E2E Beans ${runId}`])).rows[0]!.id;
      oldProductId = (await client.query<{ id: string }>(
        "INSERT INTO menu_items (code,name,category_id,category,selling_price,created_by) VALUES ($1,$2,$3,'Coffee',100,$4) RETURNING id",
        [`E2E-P-${runId}`, `Existing Recipe Product ${runId}`, categoryId, ownerId],
      )).rows[0]!.id;
      const oldVariantId = (await client.query<{ id: string }>("INSERT INTO menu_item_variants (menu_item_id,name,selling_price) VALUES ($1,'Standard',100) RETURNING id", [oldProductId])).rows[0]!.id;
      const recipeId = (await client.query<{ id: string }>("INSERT INTO recipes (menu_item_id,menu_item_variant_id,name,yield_quantity,created_by) VALUES ($1,$2,$3,1,$4) RETURNING id", [oldProductId, oldVariantId, `Existing Recipe ${runId}`, ownerId])).rows[0]!.id;
      await client.query("INSERT INTO recipe_items (recipe_id,inventory_item_id,quantity,unit) VALUES ($1,$2,10,'g')", [recipeId, ingredientId]);
      oldImportId = (await client.query<{ id: string }>("INSERT INTO pos_imports (branch_id,business_date,source_filename,imported_by) VALUES ($1,$2,$3,$4) RETURNING id", [branchId, businessDate, `e2e-${runId}.csv`, ownerId])).rows[0]!.id;
      await client.query("INSERT INTO pos_sale_items (pos_import_id,menu_item_id,menu_item_variant_id,branch_id,business_date,quantity_sold,unit_price_snapshot) VALUES ($1,$2,$3,$4,$5,1,100)", [oldImportId, oldProductId, oldVariantId, branchId, businessDate]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    originalSnapshot = await readExistingSnapshot();

    const login = async (identifier: string) => {
      const response = await request(app).post("/api/auth/login").send({ identifier, password });
      expect(response.status).toBe(200);
      const setCookie = response.headers["set-cookie"] as string[] | string | undefined;
      const cookie = Array.isArray(setCookie) ? setCookie[0] : setCookie;
      expect(cookie).toContain("libro_session=");
      return cookie!.split(";")[0]!;
    };
    ownerCookie = await login(`owner-${runId}@e2e.local`);
    managerCookie = await login(`branch_manager-${runId}@e2e.local`);
    staffCookie = await login(`staff-${runId}@e2e.local`);
  }, 120_000);

  afterAll(async () => {
    if (!pool) return;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      if (oldImportId) await client.query("DELETE FROM pos_imports WHERE id=$1", [oldImportId]);
      const productIds = [...createdProductIds, oldProductId].filter(Boolean);
      if (productIds.length) await client.query("DELETE FROM recipes WHERE menu_item_id=ANY($1::uuid[])", [productIds]);
      if (productIds.length) await client.query("DELETE FROM menu_items WHERE id=ANY($1::uuid[])", [productIds]);
      if (ingredientId) await client.query("DELETE FROM inventory_items WHERE id=$1", [ingredientId]);
      const userIds = [ownerId, managerId, staffId].filter(Boolean);
      if (userIds.length) {
        await client.query("DELETE FROM audit_logs WHERE user_id=ANY($1::uuid[])", [userIds]);
        await client.query("DELETE FROM users WHERE id=ANY($1::uuid[])", [userIds]);
      }
      if (branchId) await client.query("DELETE FROM branches WHERE id=$1", [branchId]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
      await pool.end();
    }
  }, 30_000);

  it("creates a recipe-less Standard product and persists an edited variant price", async () => {
    const input = { name: `Standard Product ${runId}`, categoryId, description: "", status: "ACTIVE", variants: [{ name: "Standard", sellingPrice: 120, status: "ACTIVE" }] };
    const created = await request(app).post("/api/menu-items/with-recipe").set("Cookie", ownerCookie).send(input);
    expect(created.status).toBe(201);
    const product = created.body.data.product;
    createdProductIds.push(product.id);
    expect(product).toMatchObject({ name: input.name, productScope: "GLOBAL", recipeId: null, recipeCost: null, marginAmount: null, marginRate: null });
    expect(product.variants).toMatchObject([{ name: "Standard", sellingPrice: 120, status: "ACTIVE" }]);
    expect(product.ingredients).toEqual([]);

    const updated = await request(app).put(`/api/menu-items/${product.id}/with-recipe`).set("Cookie", ownerCookie)
      .send({ ...input, variants: [{ id: product.variants[0].id, name: "Standard", sellingPrice: 129, status: "ACTIVE" }] });
    expect(updated.status).toBe(200);
    const retrieved = await request(app).get(`/api/menu-items/with-recipes/${product.id}`).set("Cookie", ownerCookie);
    expect(retrieved.status).toBe(200);
    expect(retrieved.body.data.product.variants).toMatchObject([{ id: product.variants[0].id, name: "Standard", sellingPrice: 129 }]);
    expect(retrieved.body.data.product).toMatchObject({ recipeId: null, recipeCost: null, marginAmount: null, marginRate: null });
  });

  it("creates Small/Large variants for a Manager's branch and persists both updated prices", async () => {
    const input = { name: `Sized Product ${runId}`, categoryId, description: "", status: "ACTIVE", variants: [
      { name: "Small", sellingPrice: 149, status: "ACTIVE" },
      { name: "Large", sellingPrice: 189, status: "ACTIVE" },
    ] };
    const created = await request(app).post("/api/menu-items/with-recipe").set("Cookie", managerCookie).send(input);
    expect(created.status).toBe(201);
    const product = created.body.data.product;
    createdProductIds.push(product.id);
    expect(product).toMatchObject({ name: input.name, productScope: "BRANCH", originBranchId: branchId, recipeCost: null, marginRate: null });
    expect(product.variants.every((variant: { recipeId: string | null; recipeCost: number | null; marginRate: number | null }) =>
      variant.recipeId === null && variant.recipeCost === null && variant.marginRate === null)).toBe(true);
    expect(Object.fromEntries(product.variants.map((variant: { name: string; sellingPrice: number }) => [variant.name, variant.sellingPrice])))
      .toEqual({ Small: 149, Large: 189 });

    const variantIds = Object.fromEntries(product.variants.map((variant: { id: string; name: string }) => [variant.name, variant.id]));

    const updated = await request(app).put(`/api/menu-items/${product.id}/with-recipe`).set("Cookie", managerCookie).send({ ...input, variants: [
      { id: variantIds.Small, name: "Small", sellingPrice: 159, status: "ACTIVE" },
      { id: variantIds.Large, name: "Large", sellingPrice: 199, status: "ACTIVE" },
    ] });
    expect(updated.status).toBe(200);
    const retrieved = await request(app).get(`/api/menu-items/with-recipes/${product.id}`).set("Cookie", managerCookie);
    expect(retrieved.status).toBe(200);
    expect(Object.fromEntries(retrieved.body.data.product.variants.map((variant: { name: string; sellingPrice: number }) => [variant.name, variant.sellingPrice])))
      .toEqual({ Small: 159, Large: 199 });
    expect(retrieved.body.data.product.marginRate).toBeNull();
  });

  it("keeps Small and Large recipes, costs, margins, and sale snapshots independent", async () => {
    const input = { name: `Variant Recipe Product ${runId}`, categoryId, description: "", status: "ACTIVE", variants: [
      { name: "Small", sellingPrice: 100, status: "ACTIVE", recipe: { yieldQuantity: 1, items: [{ inventoryItemId: ingredientId, quantity: 10, unit: "g" }] } },
      { name: "Large", sellingPrice: 150, status: "ACTIVE", recipe: { yieldQuantity: 1, items: [{ inventoryItemId: ingredientId, quantity: 20, unit: "g" }] } },
    ] };
    const created = await request(app).post("/api/menu-items/with-recipe").set("Cookie", ownerCookie).send(input);
    expect(created.status).toBe(201);
    const product = created.body.data.product;
    createdProductIds.push(product.id);
    expect(product.recipeCost).toBeNull();
    expect(product.marginRate).toBeNull();
    const variants = Object.fromEntries(product.variants.map((variant: { name: string; id: string; recipeCost: number | null; marginRate: number | null }) => [variant.name, variant]));
    expect(variants.Small).toMatchObject({ recipeCost: 20, marginRate: 80 });
    expect(variants.Large).toMatchObject({ recipeCost: 40 });
    expect(variants.Large.marginRate).toBeCloseTo(73.3333333, 5);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const importId = (await client.query<{ id: string }>(
        "INSERT INTO pos_imports (branch_id,business_date,source_filename,imported_by) VALUES ($1,$2,$3,$4) RETURNING id",
        [branchId,businessDate,`variant-recipe-${runId}.csv`,ownerId],
      )).rows[0]!.id;
      await client.query(`INSERT INTO pos_sale_items (pos_import_id,menu_item_id,menu_item_variant_id,branch_id,business_date,quantity_sold,unit_price_snapshot)
        VALUES ($1,$2,$3,$4,$5,1,100),($1,$2,$6,$4,$5,1,150)`, [importId,product.id,variants.Small.id,branchId,businessDate,variants.Large.id]);
      expect(await createIngredientUsageSnapshots(client,importId)).toBe(2);
      const snapshots = await client.query<{ variant: string; quantity: number; recipeVersionId: string }>(`SELECT v.name variant,u.quantity_consumed::float8 quantity,u.recipe_version_id "recipeVersionId"
        FROM pos_sale_ingredient_usage u JOIN pos_sale_items s ON s.id=u.pos_sale_item_id
        JOIN menu_item_variants v ON v.id=s.menu_item_variant_id WHERE s.pos_import_id=$1 ORDER BY v.name`, [importId]);
      expect(snapshots.rows.map((row)=>[row.variant,row.quantity])).toEqual([["Large",20],["Small",10]]);
      expect(snapshots.rows[0]!.recipeVersionId).not.toBe(snapshots.rows[1]!.recipeVersionId);
      const nextDate = new Date(Date.parse(`${businessDate}T00:00:00Z`)+86_400_000).toISOString().slice(0,10);
      const nextSmall = await saveRecipeDefinition(client,{recipeId:variants.Small.recipeId,menuItemId:product.id,menuItemVariantId:variants.Small.id,
        name:"Small recipe revision",yieldQuantity:1,status:"ACTIVE",effectiveFrom:nextDate,createdBy:ownerId,
        items:[{inventoryItemId:ingredientId,quantity:12,unit:"g"}]});
      expect(nextSmall.version).toBe(2);
      const versions = await client.query<{ name:string; versions:number[] }>(`SELECT v.name,array_agg(r.version ORDER BY r.version) versions FROM recipes r
        JOIN menu_item_variants v ON v.id=r.menu_item_variant_id WHERE v.menu_item_id=$1 GROUP BY v.id`,[product.id]);
      expect(Object.fromEntries(versions.rows.map((row)=>[row.name,row.versions]))).toEqual({Small:[1,2],Large:[1]});
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
    const changed = await request(app).put(`/api/menu-items/${product.id}/with-recipe`).set("Cookie",ownerCookie).send({
      ...input,variants:[
        { ...input.variants[0],id:variants.Small.id,recipe:{yieldQuantity:1,items:[{inventoryItemId:ingredientId,quantity:12,unit:"g"}]} },
        { name:"Large",id:variants.Large.id,sellingPrice:150,status:"ACTIVE" },
      ],
    });
    expect(changed.status).toBe(200);
    const updated = Object.fromEntries(changed.body.data.product.variants.map((variant: { name: string; recipeCost: number | null })=>[variant.name,variant]));
    expect(updated.Small.recipeCost).toBe(24);
    expect(updated.Large.recipeCost).toBe(40);
    const wrongParent = await request(app).put(`/api/menu-items/${oldProductId}/with-recipe`).set("Cookie",ownerCookie).send({
      name:`Existing Recipe Product ${runId}`,categoryId,description:"",status:"ACTIVE",
      variants:[{id:variants.Small.id,name:"Standard",sellingPrice:100,status:"ACTIVE"}],
    });
    expect(wrongParent.status).toBe(422);
  });

  it("keeps Staff out of product management", async () => {
    const forbiddenName = `Forbidden Product ${runId}`;
    const response = await request(app).post("/api/menu-items/with-recipe").set("Cookie", staffCookie)
      .send({ name: forbiddenName, categoryId, variants: [{ name: "Standard", sellingPrice: 100 }] });
    expect(response.status).toBe(403);
    expect((await request(app).get("/api/menu-items/with-recipes").set("Cookie", staffCookie)).status).toBe(403);
    const result = await pool.query<{ count: number }>("SELECT count(*)::int count FROM menu_items WHERE name=$1", [forbiddenName]);
    expect(result.rows[0]?.count).toBe(0);
  });

  it("preserves the existing recipe cost, margin, product price, and historical sale", async () => {
    const response = await request(app).get(`/api/menu-items/with-recipes/${oldProductId}`).set("Cookie", ownerCookie);
    expect(response.status).toBe(200);
    expect(response.body.data.product).toMatchObject({ id: oldProductId, sellingPrice: 100, recipeCost: 20, marginAmount: 80, marginRate: 80 });
    const snapshot = await pool.query<{ productPrice: number; recipeCount: number; saleCount: number; salePrice: number }>(
      `SELECT m.selling_price::float8 "productPrice",
              (SELECT count(*)::int FROM recipes WHERE menu_item_id=m.id) "recipeCount",
              (SELECT count(*)::int FROM pos_sale_items WHERE menu_item_id=m.id) "saleCount",
              (SELECT unit_price_snapshot::float8 FROM pos_sale_items WHERE menu_item_id=m.id LIMIT 1) "salePrice"
         FROM menu_items m WHERE m.id=$1`, [oldProductId],
    );
    expect(snapshot.rows[0]).toEqual({ productPrice: 100, recipeCount: 1, saleCount: 1, salePrice: 100 });
    expect(await readExistingSnapshot()).toEqual(originalSnapshot);
  });
});
