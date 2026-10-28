import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { calculateExpectedInventory } from "../services/inventoryCalculation.service.js";
import { loadInventoryLedger } from "../services/inventoryLedger.service.js";
import { lockBranchInventoryOperation } from "../services/inventoryOperationLock.service.js";
import { resolveHistoricalPosInventoryTreatment, type HistoricalPosCheckpointCoverage } from "../services/posInventoryDate.service.js";

const databaseUrl = process.env.PHASE_C_E2E_DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;

suite("historical POS checkpoint coverage PostgreSQL integration", () => {
  let pool: pg.Pool;
  const branchId = randomUUID();
  const managerId = randomUUID();
  const coveredItemId = randomUUID();
  const openingCoveredItemId = randomUUID();
  const uncoveredItemId = randomUUID();
  const sourceId = randomUUID();
  const menuItemId = randomUUID();
  const countId = randomUUID();
  const countItemId = randomUUID();
  const anomalyId = randomUUID();
  const salesDate = "2026-10-01";
  const countDate = "2026-10-25";
  const currentDate = "2026-10-28";

  async function insertImport(client: pg.PoolClient, options: {
    hash: string;
    filename: string;
    transactionId: string;
    lineId?: string;
    inventoryItemId?: string;
    accounting?: HistoricalPosCheckpointCoverage;
  }) {
    const importId = randomUUID();
    const saleItemId = randomUUID();
    await client.query(
      `INSERT INTO pos_imports(id,branch_id,business_date,source_filename,imported_by,content_hash,
         total_source_rows,valid_rows,import_status,completed_at,pos_source_id,created_environment,
         inventory_accounting_treatment,inventory_accounting_reason,inventory_accounting_decided_by,
         inventory_accounting_decided_at,cogs_cost_basis)
       VALUES($1,$2,$3,$4,$5,$6,1,1,'COMPLETE',now(),$7,'DEVELOPMENT',$8::varchar(40),$9,
         CASE WHEN $8::varchar(40)='HISTORICAL_REPORTING_CUTOVER' THEN $5::uuid ELSE NULL END,
         CASE WHEN $8::varchar(40)='HISTORICAL_REPORTING_CUTOVER' THEN now() ELSE NULL END,$10::varchar(50))`,
      [importId, branchId, salesDate, options.filename, managerId, options.hash, sourceId,
        options.accounting?.inventoryAccountingTreatment ?? "OPERATIONAL",
        options.accounting?.accountingReason ?? null,
        options.accounting?.cogsCostBasis ?? "IMPORT_TIME_CONFIGURED_COST"],
    );
    await client.query(
      `INSERT INTO pos_sale_items(id,pos_import_id,menu_item_id,quantity_sold,unit_price_snapshot,
         branch_id,business_date,source_product,source_transaction_id,source_line_id,pos_source_id)
       VALUES($1,$2,$3,10,100,$4,$5,'Historical Latte',$6,$7,$8)`,
      [saleItemId, importId, menuItemId, branchId, salesDate, options.transactionId, options.lineId ?? "1", sourceId],
    );
    await client.query(
      `INSERT INTO pos_sale_ingredient_usage(pos_sale_item_id,inventory_item_id,quantity_consumed,unit,unit_cost_snapshot)
       VALUES($1,$2,100,'g',2)`,
      [saleItemId, options.inventoryItemId ?? coveredItemId],
    );
    return { importId, saleItemId };
  }

  beforeAll(async () => {
    if (!databaseUrl) throw new Error("PHASE_C_E2E_DATABASE_URL is required");
    const databaseName = decodeURIComponent(new URL(databaseUrl).pathname.slice(1));
    if (!/^libro_phasec_[a-z0-9_]*e2e$/i.test(databaseName)) {
      throw new Error("Refusing to run historical POS tests outside a disposable libro_phasec_*_e2e database");
    }
    pool = new pg.Pool({ connectionString: databaseUrl });
    await pool.query(
      `INSERT INTO branches(id,code,name,location) VALUES($1,$2,'Historical POS Branch','Disposable PostgreSQL test')`,
      [branchId, `HP-${branchId.slice(0, 8)}`],
    );
    await pool.query(
      `INSERT INTO users(id,branch_id,first_name,last_name,email,username,password_hash,role,status)
       VALUES($1,$2,'Historical','Manager',$3,$4,'not-used','BRANCH_MANAGER','ACTIVE')`,
      [managerId, branchId, `historical-${managerId}@e2e.local`, `historical-${managerId}`],
    );
    for (const [id, sku, name] of [
      [coveredItemId, "HIST-COVERED", "Covered Beans"],
      [openingCoveredItemId, "HIST-OPENING", "Opening Covered Milk"],
      [uncoveredItemId, "HIST-UNCOVERED", "Uncovered Syrup"],
    ]) {
      await pool.query(
        `INSERT INTO inventory_items(id,sku,name,category,unit,unit_cost,reorder_level,status,item_scope,origin_branch_id)
         VALUES($1,$2,$3,'Disposable Fixture','g',2,0,'ACTIVE','GLOBAL',NULL)`,
        [id, sku, name],
      );
      await pool.query(
        `INSERT INTO branch_inventory_settings(branch_id,inventory_item_id,current_unit_cost,reorder_level,reorder_days,reorder_category,updated_by)
         VALUES($1,$2,2,0,7,'MEDIUM',$3)`,
        [branchId, id, managerId],
      );
    }
    const baselineId = randomUUID();
    await pool.query(
      `INSERT INTO inventory_opening_baselines(id,baseline_no,branch_id,effective_at,designation,notes,created_by)
       VALUES($1,$2,$3,'2026-09-30 00:00:00+08','STARTING_STOCK','Disposable historical POS baseline',$4)`,
      [baselineId, `OB-HP-${baselineId.slice(0, 8)}`, branchId, managerId],
    );
    for (const itemId of [coveredItemId, openingCoveredItemId, uncoveredItemId]) {
      await pool.query(
        `INSERT INTO inventory_opening_baseline_items(opening_baseline_id,inventory_item_id,quantity,unit)
         VALUES($1,$2,1000,'g')`,
        [baselineId, itemId],
      );
    }
    await pool.query(
      `INSERT INTO pos_sources(id,source_code,display_name,supported_format,status,format_verified_by,format_verified_at,branch_id)
       VALUES($1,$2,'Historical POS Source','CANONICAL_CSV','ACTIVE',$3,now(),$4)`,
      [sourceId, `HIST-${sourceId.slice(0, 8)}`, managerId, branchId],
    );
    await pool.query(
      `INSERT INTO menu_items(id,code,name,category,selling_price,status,created_by)
       VALUES($1,$2,'Historical Latte','Beverage',100,'ACTIVE',$3)`,
      [menuItemId, `HIST-MENU-${menuItemId.slice(0, 8)}`, managerId],
    );
    await pool.query(
      `INSERT INTO inventory_counts(id,count_no,branch_id,count_date,submitted_by,count_type,effective_at)
       VALUES($1,$2,$3,$4,$5,'CLOSING','2026-10-25 20:00:00+08')`,
      [countId, `IC-HP-${countId.slice(0, 8)}`, branchId, countDate, managerId],
    );
    await pool.query(
      `INSERT INTO inventory_count_items(id,inventory_count_id,inventory_item_id,previous_actual_quantity,
         stock_received,expected_consumption,approved_adjustments,expected_quantity,actual_quantity,
         variance_quantity,variance_value,unit)
       VALUES($1,$2,$3,600,0,50,0,550,500,-50,-100,'g')`,
      [countItemId, countId, coveredItemId],
    );
    await pool.query(
      `INSERT INTO shrinkage_reports(id,report_no,branch_id,inventory_item_id,inventory_count_item_id,
         expected_quantity,actual_quantity,variance_quantity,variance_value,unit,status,submitted_by)
       VALUES($1,$2,$3,$4,$5,550,500,-50,-100,'g','DETECTED',$6)`,
      [anomalyId, `SR-HP-${anomalyId.slice(0, 8)}`, branchId, coveredItemId, countItemId, managerId],
    );
    await pool.query(
      `INSERT INTO branch_inventory_balances(branch_id,inventory_item_id,actual_quantity,as_of)
       VALUES($1,$2,500,'2026-10-25 20:00:00+08')`,
      [branchId, coveredItemId],
    );
    await pool.query(
      `INSERT INTO inventory_movements(branch_id,inventory_item_id,movement_type,quantity,occurred_at,reference_no,created_by)
       VALUES($1,$2,'RECEIPT',100,'2026-10-26 10:00:00+08','PO-HIST-1',$3)`,
      [branchId, coveredItemId, managerId],
    );
    const openingCountId = randomUUID();
    await pool.query(
      `INSERT INTO inventory_counts(id,count_no,branch_id,count_date,submitted_by,count_type,effective_at)
       VALUES($1,$2,$3,'2026-10-26',$4,'OPENING','2026-10-26 07:00:00+08')`,
      [openingCountId, `IC-OP-${openingCountId.slice(0, 8)}`, branchId, managerId],
    );
    await pool.query(
      `INSERT INTO inventory_count_items(inventory_count_id,inventory_item_id,previous_actual_quantity,
         stock_received,expected_consumption,approved_adjustments,expected_quantity,actual_quantity,
         variance_quantity,variance_value,unit)
       VALUES($1,$2,800,0,50,0,750,700,-50,-100,'g')`,
      [openingCountId, openingCoveredItemId],
    );
    await pool.query(
      `INSERT INTO branch_inventory_balances(branch_id,inventory_item_id,actual_quantity,as_of)
       VALUES($1,$2,700,'2026-10-26 07:00:00+08')`,
      [branchId, openingCoveredItemId],
    );
    await pool.query(
      `INSERT INTO inventory_movements(branch_id,inventory_item_id,movement_type,quantity,occurred_at,reference_no,created_by)
       VALUES
       ($1,$2,'RECEIPT',50,'2026-10-27 10:00:00+08','PO-HIST-2',$4),
       ($1,$3,'RECEIPT',25,'2026-10-26 11:00:00+08','PO-HIST-3',$4)`,
      [branchId, openingCoveredItemId, uncoveredItemId, managerId],
    );
  });

  afterAll(async () => {
    if (pool) await pool.end();
  });

  it("accepts partial coverage as reporting-only while preserving stock and evidence", async () => {
    const beforeCovered = await calculateExpectedInventory(pool, branchId, coveredItemId, currentDate);
    const beforeUncovered = await calculateExpectedInventory(pool, branchId, uncoveredItemId, currentDate);
    const beforeEvidence = await pool.query(
      `SELECT expected_quantity,actual_quantity,variance_quantity,variance_value
         FROM inventory_count_items WHERE id=$1`, [countItemId],
    );
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await lockBranchInventoryOperation(client, branchId);
      const accounting = await resolveHistoricalPosInventoryTreatment(
        client, branchId, salesDate, [coveredItemId, uncoveredItemId],
      );
      expect(accounting).toMatchObject({
        inventoryAccountingTreatment: "HISTORICAL_REPORTING_CUTOVER",
        affectedIngredientCount: 2,
        coveredIngredientCount: 1,
        uncoveredIngredientCount: 1,
      });
      await insertImport(client, {
        hash: "d".repeat(64), filename: "partial-history.csv", transactionId: "HIST-PARTIAL-1",
        inventoryItemId: uncoveredItemId, accounting,
      });
      await client.query("COMMIT");
    } finally {
      client.release();
    }
    expect((await calculateExpectedInventory(pool, branchId, coveredItemId, currentDate)).expectedQuantity).toBe(beforeCovered.expectedQuantity);
    expect((await calculateExpectedInventory(pool, branchId, uncoveredItemId, currentDate)).expectedQuantity).toBe(beforeUncovered.expectedQuantity);
    expect((await pool.query(`SELECT expected_quantity,actual_quantity,variance_quantity,variance_value FROM inventory_count_items WHERE id=$1`, [countItemId])).rows).toEqual(beforeEvidence.rows);
    expect((await loadInventoryLedger(pool, branchId, uncoveredItemId, "g")).activities.some((row) => row.activityType === "POS_CONSUMPTION")).toBe(false);
    const reporting = await pool.query(
      `SELECT pi.inventory_accounting_treatment treatment,sum(sale.quantity_sold)::float8 sales_quantity,
              sum(usage.quantity_consumed)::float8 usage,sum(usage.quantity_consumed*usage.unit_cost_snapshot)::float8 cogs
         FROM pos_imports pi JOIN pos_sale_items sale ON sale.pos_import_id=pi.id
         JOIN pos_sale_ingredient_usage usage ON usage.pos_sale_item_id=sale.id
        WHERE pi.source_filename='partial-history.csv' GROUP BY pi.inventory_accounting_treatment`,
    );
    expect(reporting.rows[0]).toEqual({treatment:"HISTORICAL_REPORTING_CUTOVER",sales_quantity:10,usage:100,cogs:200});
  });

  it("accepts fully covered history without changing current or finalized evidence", async () => {
    const beforeLedger = await loadInventoryLedger(pool, branchId, coveredItemId, "g");
    const beforeExpected = await calculateExpectedInventory(pool, branchId, coveredItemId, currentDate);
    const beforeEvidence = await pool.query(
      `SELECT ici.expected_quantity,ici.actual_quantity,ici.variance_quantity,ici.variance_value,
              sr.id anomaly_id,sr.status,sr.classification,b.actual_quantity balance_quantity
         FROM inventory_count_items ici
         JOIN shrinkage_reports sr ON sr.inventory_count_item_id=ici.id
         JOIN branch_inventory_balances b ON b.branch_id=$1 AND b.inventory_item_id=ici.inventory_item_id
        WHERE ici.id=$2`,
      [branchId, countItemId],
    );

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await lockBranchInventoryOperation(client, branchId);
      const accounting = await resolveHistoricalPosInventoryTreatment(client, branchId, salesDate, [coveredItemId]);
      expect(accounting).toMatchObject({ laterInventoryCheckpoint: true, affectedIngredientCount: 1, inventoryAccountingTreatment:"OPERATIONAL" });
      await insertImport(client, {
        hash: "a".repeat(64),
        filename: "covered-history.csv",
        transactionId: "HIST-TX-1",
        accounting,
      });
      await client.query("COMMIT");
    } finally {
      client.release();
    }

    const afterLedger = await loadInventoryLedger(pool, branchId, coveredItemId, "g");
    const afterExpected = await calculateExpectedInventory(pool, branchId, coveredItemId, currentDate);
    const afterEvidence = await pool.query(
      `SELECT ici.expected_quantity,ici.actual_quantity,ici.variance_quantity,ici.variance_value,
              sr.id anomaly_id,sr.status,sr.classification,b.actual_quantity balance_quantity
         FROM inventory_count_items ici
         JOIN shrinkage_reports sr ON sr.inventory_count_item_id=ici.id
         JOIN branch_inventory_balances b ON b.branch_id=$1 AND b.inventory_item_id=ici.inventory_item_id
        WHERE ici.id=$2`,
      [branchId, countItemId],
    );

    expect(beforeLedger.calculatedBalance).toBe(600);
    expect(afterLedger.calculatedBalance).toBe(600);
    expect(afterLedger.activities.find((row) => row.activityType === "POS_CONSUMPTION")).toMatchObject({
      quantity: 100,
      runningBalance: 900,
    });
    expect(beforeExpected.expectedQuantity).toBe(600);
    expect(afterExpected.expectedQuantity).toBe(600);
    expect(afterEvidence.rows).toEqual(beforeEvidence.rows);

    const accounting = await pool.query(
      `SELECT count(DISTINCT pi.id)::int imports,sum(psi.quantity_sold)::float8 quantity,
              sum(usage.quantity_consumed*usage.unit_cost_snapshot)::float8 cogs
         FROM pos_imports pi
         JOIN pos_sale_items psi ON psi.pos_import_id=pi.id
         JOIN pos_sale_ingredient_usage usage ON usage.pos_sale_item_id=psi.id
        WHERE pi.branch_id=$1 AND pi.business_date=$2 AND pi.source_filename='covered-history.csv'
          AND NOT pi.is_test_data AND pi.voided_at IS NULL`,
      [branchId, salesDate],
    );
    expect(accounting.rows[0]).toEqual({ imports: 1, quantity: 10, cogs: 200 });
  });

  it("keeps database duplicate and overlapping-sale safeguards active", async () => {
    const duplicateClient = await pool.connect();
    try {
      await duplicateClient.query("BEGIN");
      await expect(insertImport(duplicateClient, {
        hash: "a".repeat(64),
        filename: "duplicate-content.csv",
        transactionId: "HIST-TX-2",
      })).rejects.toMatchObject({ code: "23505" });
      await duplicateClient.query("ROLLBACK");
    } finally {
      duplicateClient.release();
    }

    const overlapClient = await pool.connect();
    try {
      await overlapClient.query("BEGIN");
      await expect(insertImport(overlapClient, {
        hash: "b".repeat(64),
        filename: "overlap.csv",
        transactionId: "HIST-TX-1",
      })).rejects.toMatchObject({ code: "23505" });
      await overlapClient.query("ROLLBACK");
    } finally {
      overlapClient.release();
    }
    expect((await pool.query(`SELECT count(*)::int count FROM pos_imports WHERE branch_id=$1`, [branchId])).rows[0].count).toBe(2);
  });

  it("accepts a strictly later Opening checkpoint without changing current stock", async () => {
    const beforeLedger = await loadInventoryLedger(pool, branchId, openingCoveredItemId, "g");
    const beforeExpected = await calculateExpectedInventory(pool, branchId, openingCoveredItemId, currentDate);
    const beforeOpening = await pool.query(
      `SELECT ici.expected_quantity,ici.actual_quantity,ici.variance_quantity,ici.variance_value,b.actual_quantity balance_quantity
         FROM inventory_count_items ici
         JOIN inventory_counts ic ON ic.id=ici.inventory_count_id
         JOIN branch_inventory_balances b ON b.branch_id=ic.branch_id AND b.inventory_item_id=ici.inventory_item_id
        WHERE ic.branch_id=$1 AND ic.count_type='OPENING' AND ici.inventory_item_id=$2`,
      [branchId, openingCoveredItemId],
    );
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await lockBranchInventoryOperation(client, branchId);
      const accounting = await resolveHistoricalPosInventoryTreatment(client, branchId, salesDate, [openingCoveredItemId]);
      expect(accounting).toMatchObject({ laterInventoryCheckpoint: true, affectedIngredientCount: 1, inventoryAccountingTreatment:"OPERATIONAL" });
      await insertImport(client, {
        hash: "c".repeat(64),
        filename: "opening-covered-history.csv",
        transactionId: "HIST-TX-OPENING",
        inventoryItemId: openingCoveredItemId,
        accounting,
      });
      await client.query("COMMIT");
    } finally {
      client.release();
    }
    const afterLedger = await loadInventoryLedger(pool, branchId, openingCoveredItemId, "g");
    const afterExpected = await calculateExpectedInventory(pool, branchId, openingCoveredItemId, currentDate);
    const afterOpening = await pool.query(
      `SELECT ici.expected_quantity,ici.actual_quantity,ici.variance_quantity,ici.variance_value,b.actual_quantity balance_quantity
         FROM inventory_count_items ici
         JOIN inventory_counts ic ON ic.id=ici.inventory_count_id
         JOIN branch_inventory_balances b ON b.branch_id=ic.branch_id AND b.inventory_item_id=ici.inventory_item_id
        WHERE ic.branch_id=$1 AND ic.count_type='OPENING' AND ici.inventory_item_id=$2`,
      [branchId, openingCoveredItemId],
    );
    expect(beforeLedger.calculatedBalance).toBe(750);
    expect(afterLedger.calculatedBalance).toBe(750);
    expect(afterLedger.activities.find((row) => row.activityType === "POS_CONSUMPTION")).toMatchObject({ quantity: 100, runningBalance: 900 });
    expect(beforeExpected.expectedQuantity).toBe(750);
    expect(afterExpected.expectedQuantity).toBe(750);
    expect(afterOpening.rows).toEqual(beforeOpening.rows);
  });

  it("serializes a concurrent checkpoint before rechecking coverage", async () => {
    const countClient = await pool.connect();
    const importClient = await pool.connect();
    let importLockResolved = false;
    try {
      await countClient.query("BEGIN");
      await importClient.query("BEGIN");
      await lockBranchInventoryOperation(countClient, branchId);
      const pendingImportLock = lockBranchInventoryOperation(importClient, branchId).then(() => {
        importLockResolved = true;
      });
      await new Promise((resolve) => setTimeout(resolve, 75));
      expect(importLockResolved).toBe(false);

      const concurrentCountId = randomUUID();
      await countClient.query(
        `INSERT INTO inventory_counts(id,count_no,branch_id,count_date,submitted_by,count_type)
         VALUES($1,$2,$3,'2026-10-27',$4,'FULL')`,
        [concurrentCountId, `IC-CON-${concurrentCountId.slice(0, 8)}`, branchId, managerId],
      );
      await countClient.query(
        `INSERT INTO inventory_count_items(inventory_count_id,inventory_item_id,previous_actual_quantity,
           stock_received,expected_consumption,approved_adjustments,expected_quantity,actual_quantity,
           variance_quantity,variance_value,unit)
         VALUES($1,$2,1000,0,0,0,1000,1000,0,0,'g')`,
        [concurrentCountId, uncoveredItemId],
      );
      await countClient.query("COMMIT");
      await pendingImportLock;
      await expect(resolveHistoricalPosInventoryTreatment(importClient, branchId, salesDate, [uncoveredItemId]))
        .resolves.toMatchObject({ laterInventoryCheckpoint: true, affectedIngredientCount: 1, inventoryAccountingTreatment:"OPERATIONAL" });
      await importClient.query("ROLLBACK");
    } finally {
      if (!importLockResolved) await countClient.query("ROLLBACK").catch(() => undefined);
      await importClient.query("ROLLBACK").catch(() => undefined);
      countClient.release();
      importClient.release();
    }
  });
});
