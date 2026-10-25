import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const databaseUrl = process.env.PHASE_C_E2E_DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;

suite("final inventory and purchase-order PostgreSQL workflow", () => {
  let pool: pg.Pool;
  let submitInventoryCount: Awaited<typeof import("./inventoryWorkflow.controller.js")>["submitInventoryCount"];
  let createPurchaseOrder: Awaited<typeof import("./operations.controller.js")>["createPurchaseOrder"];
  let businessDate = "";
  let deliveryDate = "";
  let inventoryItemId = "";
  let inventoryUnit = "";
  let unitCost = 0;

  const jsonResponse = () => {
    const state: { status: number; body?: unknown } = { status: 200 };
    const response = {
      status(code: number) { state.status = code; return this; },
      json(body: unknown) { state.body = body; return this; },
    };
    return { state, response };
  };

  const manager = (id: string, branchId: string) => ({ id, role: "BRANCH_MANAGER", branchId } as const);

  async function createBranchFixture(label: string) {
    const branchId = crypto.randomUUID();
    const managerId = crypto.randomUUID();
    const baselineId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO branches(id,code,name,location) VALUES($1,$2,$3,'Disposable final workflow test')`,
      [branchId, `FW-${label}`, `Final Workflow ${label}`],
    );
    await pool.query(
      `INSERT INTO users(id,branch_id,first_name,last_name,email,username,password_hash,role,status)
       VALUES($1,$2,'Final','Workflow',$3,$4,'not-used','BRANCH_MANAGER','ACTIVE')`,
      [managerId, branchId, `final-${label}@e2e.local`, `final-${label}`],
    );
    await pool.query(
      `INSERT INTO branch_inventory_settings(branch_id,inventory_item_id,current_unit_cost,reorder_level,reorder_days,reorder_category,updated_by)
       VALUES($1,$2,$3,0,7,'MEDIUM',$4)`,
      [branchId, inventoryItemId, unitCost, managerId],
    );
    await pool.query(
      `INSERT INTO inventory_opening_baselines(id,baseline_no,branch_id,effective_at,designation,notes,created_by)
       VALUES($1,$2,$3,$4::date - interval '1 day','STARTING_STOCK','Disposable final workflow baseline',$5)`,
      [baselineId, `OB-${label}`, branchId, businessDate, managerId],
    );
    await pool.query(
      `INSERT INTO inventory_opening_baseline_items(opening_baseline_id,inventory_item_id,quantity,unit)
       VALUES($1,$2,5000,$3)`,
      [baselineId, inventoryItemId, inventoryUnit],
    );
    return { branchId, managerId };
  }

  async function submitCount(branchId: string, managerId: string, countType: "OPENING" | "CLOSING" | "FULL", quantity: number) {
    const result = jsonResponse();
    await submitInventoryCount({
      body: { countDate: businessDate, countType, items: [{ inventoryItemId, quantity, enteredUnit: inventoryUnit }] },
      user: manager(managerId, branchId),
    } as never, result.response as never, () => {});
    expect(result.state.status).toBe(201);
    return result.state.body as { data: { count: { id: string; items: Array<{ varianceQuantity: number }> } } };
  }

  async function addAcceptedSales(branchId: string, managerId: string, label: string) {
    const sourceId = crypto.randomUUID();
    const importId = crypto.randomUUID();
    const menuItemId = crypto.randomUUID();
    const saleItemId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO menu_items(id,code,name,category,selling_price,status,created_by)
       VALUES($1,$2,$3,'Beverage',100,'ACTIVE',$4)`,
      [menuItemId, `FW-MENU-${label}`, `Final Workflow Drink ${label}`, managerId],
    );
    await pool.query(
      `INSERT INTO pos_sources(id,source_code,display_name,supported_format,status,format_verified_by,format_verified_at,branch_id)
       VALUES($1,$2,$3,'CANONICAL_CSV','ACTIVE',$4,now(),$5)`,
      [sourceId, `FW-SOURCE-${label}`, `Final Workflow Source ${label}`, managerId, branchId],
    );
    await pool.query(
      `INSERT INTO pos_imports(id,branch_id,business_date,source_filename,imported_by,content_hash,total_source_rows,valid_rows,
         import_status,completed_at,pos_source_id,created_environment)
       VALUES($1,$2,$3,$4,$5,$6,1,1,'COMPLETE',now(),$7,'DEVELOPMENT')`,
      [importId, branchId, businessDate, `final-${label}.csv`, managerId, label.padEnd(64, "a").slice(0, 64), sourceId],
    );
    await pool.query(
      `INSERT INTO pos_sale_items(id,pos_import_id,menu_item_id,quantity_sold,unit_price_snapshot,branch_id,business_date,
         source_product,source_transaction_id,source_line_id,pos_source_id)
       VALUES($1,$2,$3,1,100,$4,$5,$6,$7,'1',$8)`,
      [saleItemId, importId, menuItemId, branchId, businessDate, `Final Workflow Drink ${label}`, `TX-${label}`, sourceId],
    );
    await pool.query(
      `INSERT INTO pos_sale_ingredient_usage(pos_sale_item_id,inventory_item_id,quantity_consumed,unit,unit_cost_snapshot)
       VALUES($1,$2,1500,$3,$4)`,
      [saleItemId, inventoryItemId, inventoryUnit, unitCost],
    );
    await pool.query(
      `INSERT INTO pos_import_reconciliations(pos_import_id,branch_id,pos_sales_total,imported_sales_total,pos_quantity,
         imported_quantity,expected_consumption_cost,generated_cogs,sales_total_matches,quantity_matches,
         recipe_consumption_matches,cogs_matches,branch_isolated)
       VALUES($1,$2,100,100,1,1,$3,$3,true,true,true,true,true)`,
      [importId, branchId, 1500 * unitCost],
    );
    await pool.query(
      `INSERT INTO pos_daily_declarations(branch_id,business_date,declaration,notes,declared_by,pos_source_id,pos_import_id,confirmed_at)
       VALUES($1,$2,'SALES_COMPLETE','Disposable complete sales coverage',$3,$4,$5,now())`,
      [branchId, businessDate, managerId, sourceId, importId],
    );
  }

  async function createPo(branchId: string, managerId: string, status: "DRAFT" | "ORDERED" = "DRAFT") {
    const result = jsonResponse();
    await createPurchaseOrder({
      body: {
        supplierName: "Disposable Supplier",
        orderDate: businessDate,
        expectedDeliveryDate: deliveryDate,
        status,
        items: [{ inventoryItemId, quantityOrdered: 10, unitCost, purchaseUom: inventoryUnit, conversionFactor: 1 }],
      },
      user: manager(managerId, branchId),
    } as never, result.response as never, () => {});
    expect(result.state.status).toBe(201);
    return result.state.body;
  }

  beforeAll(async () => {
    if (!databaseUrl) throw new Error("PHASE_C_E2E_DATABASE_URL is required");
    const databaseName = decodeURIComponent(new URL(databaseUrl).pathname.slice(1));
    if (!/^libro_phasec_[a-z0-9_]*e2e$/i.test(databaseName)) {
      throw new Error("Refusing to run final workflow tests outside a disposable libro_phasec_*_e2e database");
    }
    process.env.NODE_ENV = "test";
    process.env.DATA_LIFECYCLE_ENV = "DEVELOPMENT";
    process.env.DATABASE_URL = databaseUrl;
    pool = new pg.Pool({ connectionString: databaseUrl });
    ({ submitInventoryCount } = await import("./inventoryWorkflow.controller.js"));
    ({ createPurchaseOrder } = await import("./operations.controller.js"));
    const { manilaBusinessDate } = await import("../services/businessTime.service.js");
    businessDate = manilaBusinessDate();
    const next = new Date(`${businessDate}T12:00:00+08:00`);
    next.setUTCDate(next.getUTCDate() + 1);
    deliveryDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(next);
    const item = (await pool.query<{ id: string; unit: string; unitCost: number }>(
      `SELECT id,unit,unit_cost::float8 "unitCost" FROM inventory_items WHERE status='ACTIVE' ORDER BY (unit='g') DESC,sku LIMIT 1`,
    )).rows[0]!;
    inventoryItemId = item.id;
    inventoryUnit = item.unit;
    unitCost = item.unitCost;
  });

  afterAll(async () => {
    if (pool) await pool.end();
  });

  it("completes Opening, accepted POS coverage, Closing, Full, then PO without double-counting variance", async () => {
    const fixture = await createBranchFixture(`SEQ-${crypto.randomUUID().slice(0, 8)}`);
    await submitCount(fixture.branchId, fixture.managerId, "OPENING", 5000);

    await expect(createPo(fixture.branchId, fixture.managerId)).rejects.toMatchObject({ code: "PHYSICAL_COUNT_REQUIRED" });
    await addAcceptedSales(fixture.branchId, fixture.managerId, `SEQ-${crypto.randomUUID().slice(0, 8)}`);
    const closing = await submitCount(fixture.branchId, fixture.managerId, "CLOSING", 3300);
    expect(closing.data.count.items[0]?.varianceQuantity).toBe(-200);

    await expect(createPo(fixture.branchId, fixture.managerId)).rejects.toMatchObject({ code: "PHYSICAL_COUNT_REQUIRED" });
    const full = await submitCount(fixture.branchId, fixture.managerId, "FULL", 3300);
    expect(full.data.count.items[0]?.varianceQuantity).toBe(0);
    await createPo(fixture.branchId, fixture.managerId, "DRAFT");

    const verification = await pool.query<{
      opening: number; closing: number; full: number; shrinkage: number; closingVariance: number; fullVariance: number; purchaseOrders: number;
    }>(
      `SELECT
         count(*) FILTER (WHERE ic.count_type='OPENING')::int opening,
         count(*) FILTER (WHERE ic.count_type='CLOSING')::int closing,
         count(*) FILTER (WHERE ic.count_type='FULL')::int full,
         (SELECT count(*)::int FROM shrinkage_reports sr WHERE sr.branch_id=$1) shrinkage,
         COALESCE(max(ici.variance_quantity) FILTER (WHERE ic.count_type='CLOSING'),0)::float8 "closingVariance",
         COALESCE(max(ici.variance_quantity) FILTER (WHERE ic.count_type='FULL'),0)::float8 "fullVariance",
         (SELECT count(*)::int FROM purchase_orders po WHERE po.branch_id=$1) "purchaseOrders"
       FROM inventory_counts ic JOIN inventory_count_items ici ON ici.inventory_count_id=ic.id
       WHERE ic.branch_id=$1`,
      [fixture.branchId],
    );
    expect(verification.rows[0]).toEqual({
      opening: 1,
      closing: 1,
      full: 1,
      shrinkage: 1,
      closingVariance: -200,
      fullVariance: 0,
      purchaseOrders: 1,
    });
  });

  it("serializes concurrent Full submission and PO creation under the branch advisory lock", async () => {
    const fixture = await createBranchFixture(`RACE-${crypto.randomUUID().slice(0, 8)}`);
    await submitCount(fixture.branchId, fixture.managerId, "OPENING", 5000);
    await addAcceptedSales(fixture.branchId, fixture.managerId, `RACE-${crypto.randomUUID().slice(0, 8)}`);
    await submitCount(fixture.branchId, fixture.managerId, "CLOSING", 3500);

    const [fullResult, poResult] = await Promise.allSettled([
      submitCount(fixture.branchId, fixture.managerId, "FULL", 3500),
      createPo(fixture.branchId, fixture.managerId, "ORDERED"),
    ]);
    expect(fullResult.status).toBe("fulfilled");
    if (poResult.status === "rejected") {
      expect(poResult.reason).toMatchObject({ code: "PHYSICAL_COUNT_REQUIRED" });
      await createPo(fixture.branchId, fixture.managerId, "ORDERED");
    }

    const result = await pool.query<{ full: number; purchaseOrders: number }>(
      `SELECT
         (SELECT count(*)::int FROM inventory_counts WHERE branch_id=$1 AND count_type='FULL') full,
         (SELECT count(*)::int FROM purchase_orders WHERE branch_id=$1) "purchaseOrders"`,
      [fixture.branchId],
    );
    expect(result.rows[0]).toEqual({ full: 1, purchaseOrders: 1 });
  });
});
