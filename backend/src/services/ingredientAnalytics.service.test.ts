import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  classifyIngredientMovements,
  loadIngredientAnalytics,
  MIN_MOVEMENT_HISTORY_DAYS,
} from "./ingredientAnalytics.service.js";

describe("automatic ingredient movement classification", () => {
  it("ranks normalized 28-day daily consumption into thirds", () => {
    const result = classifyIngredientMovements([
      { inventoryItemId: "fast", inventoryUnit: "g", sourceUnit: "kg", totalConsumption: 84, hasCurrentActiveRecipe: true },
      { inventoryItemId: "medium", inventoryUnit: "g", sourceUnit: "g", totalConsumption: 1400, hasCurrentActiveRecipe: true },
      { inventoryItemId: "slow", inventoryUnit: "g", sourceUnit: "g", totalConsumption: 280, hasCurrentActiveRecipe: true },
    ], MIN_MOVEMENT_HISTORY_DAYS);

    expect(result.get("fast")).toMatchObject({ category: "FAST", averageDailyConsumption: 3000, eligible: true });
    expect(result.get("medium")).toMatchObject({ category: "MEDIUM", averageDailyConsumption: 50, eligible: true });
    expect(result.get("slow")).toMatchObject({ category: "SLOW", averageDailyConsumption: 10, eligible: true });
  });

  it("keeps eligible zero consumption distinct from missing ingredient history", () => {
    const result = classifyIngredientMovements([
      { inventoryItemId: "zero", inventoryUnit: "ml", sourceUnit: null, totalConsumption: 0, hasCurrentActiveRecipe: true },
      { inventoryItemId: "missing", inventoryUnit: "ml", sourceUnit: null, totalConsumption: 0, hasCurrentActiveRecipe: false },
    ], MIN_MOVEMENT_HISTORY_DAYS);

    expect(result.get("zero")).toMatchObject({ category: "SLOW", averageDailyConsumption: 0, eligible: true });
    expect(result.get("missing")).toMatchObject({ category: null, eligible: false });
  });

  it("does not publish a category when branch history is insufficient", () => {
    const result = classifyIngredientMovements([
      { inventoryItemId: "beans", inventoryUnit: "g", sourceUnit: "g", totalConsumption: 280, hasCurrentActiveRecipe: true },
    ], MIN_MOVEMENT_HISTORY_DAYS - 1);
    expect(result.get("beans")).toMatchObject({ eligible: false });
  });

  it("marks incompatible snapshot units ineligible instead of comparing unsafe quantities", () => {
    const result = classifyIngredientMovements([
      { inventoryItemId: "beans", inventoryUnit: "g", sourceUnit: "ml", totalConsumption: 280, hasCurrentActiveRecipe: true },
    ], MIN_MOVEMENT_HISTORY_DAYS);
    expect(result.get("beans")).toMatchObject({ category: null, eligible: false });
  });
});

describe("ingredient analytics database scope", () => {
  it("excludes test and voided imports, retains inactive-source history, and calculates recipe use per sold unit", async () => {
    const query = vi.fn(async (statement: unknown) => {
      const sql = String(statement);
      if (sql.includes('count(DISTINCT pi.business_date)')) return { rows: [{ eligibleBusinessDays: 12, windowStart: "2026-09-27", windowEnd: "2026-10-24" }] };
      if (sql.includes("WITH window_usage")) return { rows: [
        { inventoryItemId: "beans", inventoryUnit: "g", sourceUnit: "kg", totalConsumption: 28, hasCurrentActiveRecipe: true },
        { inventoryItemId: "milk", inventoryUnit: "ml", sourceUnit: "L", totalConsumption: 56, hasCurrentActiveRecipe: true },
        { inventoryItemId: "cup", inventoryUnit: "pc", sourceUnit: "pc", totalConsumption: 14, hasCurrentActiveRecipe: true },
      ] };
      if (sql.includes('product.id "menuItemId"')) return { rows: [{
        menuItemId: "latte", menuProductName: "Caffe Latte", productStatus: "INACTIVE", branchMenuStatus: "INACTIVE",
        variantId: "latte-large", variantName: "Large", variantStatus: "INACTIVE", recipeId: "recipe-2",
        recipeStatus: "ARCHIVED", recipeYield: 4, recipeQuantity: 2, recipeUnit: "kg", inventoryUnit: "g",
        connectionStatus: "HISTORICAL",
      }] };
      return { rows: [] };
    });

    const analytics = await loadIngredientAnalytics({ query } as never, "branch-1", "beans");
    const sql = query.mock.calls.map(([statement]) => String(statement)).join("\n");

    expect(sql).toContain("NOT pi.is_test_data");
    expect(sql).toContain("pi.voided_at IS NULL");
    expect(sql).toContain("pi.completed_at IS NOT NULL");
    expect(sql).toContain("JOIN pos_sources source ON source.id=pi.pos_source_id");
    expect(sql).not.toContain("source.status='ACTIVE'");
    expect(sql).toContain("branch_menu.branch_id=$1");
    expect(analytics.movement).toMatchObject({ status: "AVAILABLE", averageDailyConsumption: 1000, unit: "g" });
    expect(analytics.connectedProducts).toEqual([expect.objectContaining({
      menuProductName: "Caffe Latte", variantName: "Large", recipeQuantity: 2, recipeUnit: "kg",
      recipeYield: 4, consumptionPerSoldUnit: 500, consumptionUnit: "g", connectionStatus: "HISTORICAL",
    })]);
  });

  it("returns Insufficient Data and a clear empty product list", async () => {
    const query = vi.fn(async (statement: unknown) => String(statement).includes('count(DISTINCT pi.business_date)')
      ? { rows: [{ eligibleBusinessDays: 2, windowStart: "2026-09-27", windowEnd: "2026-10-24" }] }
      : String(statement).includes("WITH window_usage")
        ? { rows: [{ inventoryItemId: "beans", inventoryUnit: "g", sourceUnit: "g", totalConsumption: 10, hasCurrentActiveRecipe: true }] }
        : { rows: [] });

    const analytics = await loadIngredientAnalytics({ query } as never, "branch-1", "beans");
    expect(analytics.movement).toMatchObject({ status: "INSUFFICIENT_DATA", category: null, averageDailyConsumption: null });
    expect(analytics.movement.explanation).toContain("Insufficient Data");
    expect(analytics.connectedProducts).toEqual([]);
  });
});

const postgresUrl = process.env.INGREDIENT_ANALYTICS_DATABASE_URL;
describe.skipIf(!postgresUrl)("ingredient analytics real PostgreSQL verification", () => {
  const pool = new Pool({ connectionString: postgresUrl });
  const ids = {
    branchA: "10000000-0000-4000-8000-000000000001",
    branchB: "10000000-0000-4000-8000-000000000002",
    owner: "30000000-0000-4000-8000-000000000001",
    fast: "40000000-0000-4000-8000-000000000001",
    medium: "40000000-0000-4000-8000-000000000002",
    slow: "40000000-0000-4000-8000-000000000003",
    zero: "40000000-0000-4000-8000-000000000004",
    missing: "40000000-0000-4000-8000-000000000005",
    incompatible: "40000000-0000-4000-8000-000000000006",
    branchBItem: "40000000-0000-4000-8000-000000000007",
    activeProduct: "50000000-0000-4000-8000-000000000001",
    historicalProduct: "50000000-0000-4000-8000-000000000002",
    branchBProduct: "50000000-0000-4000-8000-000000000003",
    activeVariant: "60000000-0000-4000-8000-000000000001",
    historicalVariant: "60000000-0000-4000-8000-000000000002",
    branchBVariant: "60000000-0000-4000-8000-000000000003",
    activeRecipe: "70000000-0000-4000-8000-000000000001",
    historicalRecipe: "70000000-0000-4000-8000-000000000002",
    branchBRecipe: "70000000-0000-4000-8000-000000000003",
    activeSource: "80000000-0000-4000-8000-000000000001",
    inactiveSource: "80000000-0000-4000-8000-000000000002",
    branchBSource: "80000000-0000-4000-8000-000000000003",
  };

  beforeAll(async () => {
    const client = await pool.connect();
    try {
      const identity = await client.query<{ database: string; address: string }>(
        `SELECT current_database() "database",split_part(inet_server_addr()::text,'/',1) "address"`,
      );
      expect(identity.rows[0]?.database).toMatch(/^libro_phase2_verify_/);
      expect(["127.0.0.1", "::1"]).toContain(identity.rows[0]?.address);
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO branches(id,code,name,location) VALUES
          ($1,'P2-A','Phase 2 Branch A','Disposable'),($2,'P2-B','Phase 2 Branch B','Disposable')`,
        [ids.branchA, ids.branchB],
      );
      await client.query(
        `INSERT INTO users(id,first_name,last_name,email,username,password_hash,role)
          VALUES($1,'Phase','Owner','phase2-owner@example.test','phase2-owner','unused','OWNER')`,
        [ids.owner],
      );
      await client.query(
        `INSERT INTO inventory_items(id,sku,name,category,unit,unit_cost,reorder_level,item_scope,origin_branch_id,created_by) VALUES
          ($1,'P2-FAST','Fast Beans','Phase 2','g',0.02,10,'BRANCH',$8,$10),
          ($2,'P2-MEDIUM','Medium Beans','Phase 2','g',0.03,20,'BRANCH',$8,$10),
          ($3,'P2-SLOW','Slow Beans','Phase 2','g',0.04,30,'BRANCH',$8,$10),
          ($4,'P2-ZERO','Zero Ingredient','Phase 2','g',0.05,40,'BRANCH',$8,$10),
          ($5,'P2-MISSING','Missing Ingredient','Phase 2','g',0.06,50,'BRANCH',$8,$10),
          ($6,'P2-BAD-UNIT','Incompatible Ingredient','Phase 2','g',0.07,60,'BRANCH',$8,$10),
          ($7,'P2-BRANCH-B','Other Branch Ingredient','Phase 2','g',0.08,70,'BRANCH',$9,$10)`,
        [ids.fast, ids.medium, ids.slow, ids.zero, ids.missing, ids.incompatible, ids.branchBItem, ids.branchA, ids.branchB, ids.owner],
      );
      await client.query(
        `INSERT INTO branch_inventory_settings(branch_id,inventory_item_id,current_unit_cost,reorder_level,reorder_days,reorder_category,updated_by)
          VALUES($1,$2,0.02,42,9,'MEDIUM',$3)`,
        [ids.branchA, ids.fast, ids.owner],
      );
      await client.query(
        `INSERT INTO branch_inventory_balances(branch_id,inventory_item_id,actual_quantity,is_test_data)
          VALUES($1,$2,777,false)`,
        [ids.branchA, ids.fast],
      );
      await client.query(
        `INSERT INTO menu_items(id,code,name,category,selling_price,status,created_by,product_scope,approval_status) VALUES
          ($1,'P2-LATTE','Active Latte','Phase 2',120,'ACTIVE',$4,'GLOBAL','APPROVED'),
          ($2,'P2-OLD','Historical Latte','Phase 2',110,'INACTIVE',$4,'GLOBAL','APPROVED'),
          ($3,'P2-B-DRINK','Branch B Drink','Phase 2',100,'ACTIVE',$4,'GLOBAL','APPROVED')`,
        [ids.activeProduct, ids.historicalProduct, ids.branchBProduct, ids.owner],
      );
      await client.query(
        `INSERT INTO menu_item_branches(menu_item_id,branch_id,availability_status,is_active) VALUES
          ($1,$4,'APPROVED',true),($2,$4,'APPROVED',false),($3,$5,'APPROVED',true)`,
        [ids.activeProduct, ids.historicalProduct, ids.branchBProduct, ids.branchA, ids.branchB],
      );
      await client.query(
        `INSERT INTO menu_item_variants(id,menu_item_id,name,selling_price,status) VALUES
          ($1,$4,'Large',120,'ACTIVE'),($2,$5,'Standard',110,'INACTIVE'),($3,$6,'Standard',100,'ACTIVE')`,
        [ids.activeVariant, ids.historicalVariant, ids.branchBVariant, ids.activeProduct, ids.historicalProduct, ids.branchBProduct],
      );
      await client.query(
        `INSERT INTO recipes(id,menu_item_id,menu_item_variant_id,name,yield_quantity,status,version,effective_from,effective_to,created_by) VALUES
          ($1,$4,$7,'Active Latte Recipe',4,'ACTIVE',1,CURRENT_DATE-100,NULL,$10),
          ($2,$5,$8,'Historical Latte Recipe',2,'INACTIVE',1,CURRENT_DATE-100,CURRENT_DATE-10,$10),
          ($3,$6,$9,'Branch B Recipe',1,'ACTIVE',1,CURRENT_DATE-100,NULL,$10)`,
        [ids.activeRecipe, ids.historicalRecipe, ids.branchBRecipe, ids.activeProduct, ids.historicalProduct, ids.branchBProduct, ids.activeVariant, ids.historicalVariant, ids.branchBVariant, ids.owner],
      );
      await client.query(
        `INSERT INTO recipe_items(recipe_id,inventory_item_id,quantity,unit) VALUES
          ($1,$4,2,'kg'),($1,$5,10,'g'),($2,$4,100,'g'),($3,$6,1,'g')`,
        [ids.activeRecipe, ids.historicalRecipe, ids.branchBRecipe, ids.fast, ids.zero, ids.branchBItem],
      );
      await client.query(
        `INSERT INTO pos_sources(id,source_code,display_name,supported_format,status,format_verified_by,format_verified_at,branch_id) VALUES
          ($1,'P2-ACTIVE','Phase 2 Active','CANONICAL_CSV','ACTIVE',$4,now(),$5),
          ($2,'P2-INACTIVE','Phase 2 Inactive','CANONICAL_CSV','INACTIVE',NULL,NULL,$5),
          ($3,'P2-B-SOURCE','Phase 2 Branch B','CANONICAL_CSV','ACTIVE',$4,now(),$6);`,
        [ids.activeSource, ids.inactiveSource, ids.branchBSource, ids.owner, ids.branchA, ids.branchB],
      );
      await client.query(
        `DO $fixture$
         DECLARE day_offset integer; imported uuid; sold uuid; source uuid;
         BEGIN
           FOR day_offset IN 1..7 LOOP
             source := CASE WHEN day_offset % 2 = 0 THEN '${ids.activeSource}'::uuid ELSE '${ids.inactiveSource}'::uuid END;
             INSERT INTO pos_imports(branch_id,business_date,source_filename,imported_by,completed_at,pos_source_id)
             VALUES('${ids.branchA}',(now() AT TIME ZONE 'Asia/Manila')::date-day_offset,'p2-a-'||day_offset||'.csv','${ids.owner}',now(),source)
             RETURNING id INTO imported;
             INSERT INTO pos_sale_items(pos_import_id,menu_item_id,menu_item_variant_id,quantity_sold,unit_price_snapshot,branch_id,business_date,pos_source_id)
             VALUES(imported,'${ids.activeProduct}','${ids.activeVariant}',1,120,'${ids.branchA}',(now() AT TIME ZONE 'Asia/Manila')::date-day_offset,source)
             RETURNING id INTO sold;
             INSERT INTO pos_sale_ingredient_usage(pos_sale_item_id,inventory_item_id,quantity_consumed,unit,unit_cost_snapshot,recipe_version_id) VALUES
               (sold,'${ids.fast}',1000,'g',0.02,'${ids.activeRecipe}'),
               (sold,'${ids.medium}',0.35,'kg',0.03,'${ids.activeRecipe}'),
               (sold,'${ids.slow}',35,'g',0.04,'${ids.activeRecipe}'),
               (sold,'${ids.incompatible}',10,'ml',0.07,'${ids.activeRecipe}');
           END LOOP;
           FOR day_offset IN 1..6 LOOP
             INSERT INTO pos_imports(branch_id,business_date,source_filename,imported_by,completed_at,pos_source_id)
             VALUES('${ids.branchB}',(now() AT TIME ZONE 'Asia/Manila')::date-day_offset,'p2-b-'||day_offset||'.csv','${ids.owner}',now(),'${ids.branchBSource}')
             RETURNING id INTO imported;
             INSERT INTO pos_sale_items(pos_import_id,menu_item_id,menu_item_variant_id,quantity_sold,unit_price_snapshot,branch_id,business_date,pos_source_id)
             VALUES(imported,'${ids.branchBProduct}','${ids.branchBVariant}',1,100,'${ids.branchB}',(now() AT TIME ZONE 'Asia/Manila')::date-day_offset,'${ids.branchBSource}')
             RETURNING id INTO sold;
             INSERT INTO pos_sale_ingredient_usage(pos_sale_item_id,inventory_item_id,quantity_consumed,unit,unit_cost_snapshot,recipe_version_id)
             VALUES(sold,'${ids.branchBItem}',9000,'g',0.08,'${ids.branchBRecipe}');
           END LOOP;
         END $fixture$;`,
      );
      await client.query(
        `WITH excluded(kind,is_test_data,voided_at,voided_by,void_reason) AS (
           VALUES ('test',true,NULL::timestamptz,NULL::uuid,NULL::text),
                  ('void',false,now(),'${ids.owner}'::uuid,'Disposable void verification')
         ), imports AS (
           INSERT INTO pos_imports(branch_id,business_date,source_filename,imported_by,completed_at,pos_source_id,is_test_data,voided_at,voided_by,void_reason)
           SELECT '${ids.branchA}',(now() AT TIME ZONE 'Asia/Manila')::date-1,'p2-'||kind||'.csv','${ids.owner}',now(),'${ids.activeSource}',is_test_data,voided_at,voided_by,void_reason
           FROM excluded RETURNING id,source_filename
         ), sales AS (
           INSERT INTO pos_sale_items(pos_import_id,menu_item_id,menu_item_variant_id,quantity_sold,unit_price_snapshot,branch_id,business_date,pos_source_id)
           SELECT id,'${ids.activeProduct}','${ids.activeVariant}',1,120,'${ids.branchA}',(now() AT TIME ZONE 'Asia/Manila')::date-1,'${ids.activeSource}' FROM imports
           RETURNING id
         )
         INSERT INTO pos_sale_ingredient_usage(pos_sale_item_id,inventory_item_id,quantity_consumed,unit,unit_cost_snapshot,recipe_version_id)
         SELECT id,'${ids.fast}',999999,'g',0.02,'${ids.activeRecipe}' FROM sales;`,
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }, 30_000);

  afterAll(async () => pool.end());

  it("verifies classification, branch isolation, source lifecycle, recipe details, and read-only accounting", async () => {
    const before = await pool.query(
      `SELECT bis.reorder_level::float8 "reorderLevel",bis.reorder_days "reorderDays",bis.reorder_category "reorderCategory",
              balance.actual_quantity::float8 "balance",
              (SELECT sum(quantity_consumed*unit_cost_snapshot)::float8 FROM pos_sale_ingredient_usage) "cogsSnapshot"
         FROM branch_inventory_settings bis
         JOIN branch_inventory_balances balance ON balance.branch_id=bis.branch_id AND balance.inventory_item_id=bis.inventory_item_id
        WHERE bis.branch_id=$1 AND bis.inventory_item_id=$2`,
      [ids.branchA, ids.fast],
    );
    const [fast, medium, slow, zero, missing, incompatible, branchB] = await Promise.all([
      loadIngredientAnalytics(pool, ids.branchA, ids.fast),
      loadIngredientAnalytics(pool, ids.branchA, ids.medium),
      loadIngredientAnalytics(pool, ids.branchA, ids.slow),
      loadIngredientAnalytics(pool, ids.branchA, ids.zero),
      loadIngredientAnalytics(pool, ids.branchA, ids.missing),
      loadIngredientAnalytics(pool, ids.branchA, ids.incompatible),
      loadIngredientAnalytics(pool, ids.branchB, ids.branchBItem),
    ]);
    expect(fast.movement).toMatchObject({ status: "AVAILABLE", category: "FAST", eligibleBusinessDays: 7, unit: "g" });
    expect(fast.movement.averageDailyConsumption).toBeCloseTo(7000 / 28, 8);
    expect(medium.movement).toMatchObject({ status: "AVAILABLE", category: "MEDIUM", eligibleBusinessDays: 7 });
    expect(medium.movement.averageDailyConsumption).toBeCloseTo(2450 / 28, 8);
    expect(slow.movement).toMatchObject({ status: "AVAILABLE", category: "SLOW", eligibleBusinessDays: 7 });
    expect(slow.movement.averageDailyConsumption).toBeCloseTo(245 / 28, 8);
    expect(zero.movement).toMatchObject({ status: "AVAILABLE", category: "SLOW", averageDailyConsumption: 0 });
    expect(missing.movement).toMatchObject({ status: "INSUFFICIENT_DATA", category: null, averageDailyConsumption: null });
    expect(incompatible.movement).toMatchObject({ status: "INSUFFICIENT_DATA", category: null });
    expect(branchB.movement).toMatchObject({ status: "INSUFFICIENT_DATA", category: null, eligibleBusinessDays: 6 });
    expect(fast.connectedProducts).toEqual(expect.arrayContaining([
      expect.objectContaining({ menuProductName: "Active Latte", variantName: "Large", recipeYield: 4, recipeQuantity: 2, recipeUnit: "kg", consumptionPerSoldUnit: 500, consumptionUnit: "g", connectionStatus: "CURRENT" }),
      expect.objectContaining({ menuProductName: "Historical Latte", variantName: "Standard", productStatus: "INACTIVE", variantStatus: "INACTIVE", branchMenuStatus: "INACTIVE", recipeYield: 2, consumptionPerSoldUnit: 50, connectionStatus: "HISTORICAL" }),
    ]));
    const after = await pool.query(
      `SELECT bis.reorder_level::float8 "reorderLevel",bis.reorder_days "reorderDays",bis.reorder_category "reorderCategory",
              balance.actual_quantity::float8 "balance",
              (SELECT sum(quantity_consumed*unit_cost_snapshot)::float8 FROM pos_sale_ingredient_usage) "cogsSnapshot"
         FROM branch_inventory_settings bis
         JOIN branch_inventory_balances balance ON balance.branch_id=bis.branch_id AND balance.inventory_item_id=bis.inventory_item_id
        WHERE bis.branch_id=$1 AND bis.inventory_item_id=$2`,
      [ids.branchA, ids.fast],
    );
    expect(after.rows).toEqual(before.rows);
    expect(after.rows[0]).toMatchObject({ reorderLevel: 42, reorderDays: 9, reorderCategory: "MEDIUM", balance: 777 });
  }, 30_000);
});
