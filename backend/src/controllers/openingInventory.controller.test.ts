import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ clientQuery: vi.fn(), poolQuery: vi.fn(), release: vi.fn(), writeAudit: vi.fn() }));
vi.mock("../config/database.js", () => ({ pool: { connect: vi.fn(async () => ({ query: mocks.clientQuery, release: mocks.release })), query: mocks.poolQuery } }));
vi.mock("../services/audit.service.js", () => ({ writeAudit: mocks.writeAudit }));

import { confirmIngredientInitialStock, confirmStartingStock, createOpeningInventoryBaseline, getStartingStockSetup, listOpeningInventoryBaselines } from "./openingInventory.controller.js";

const ownerId = "00000000-0000-4000-8000-000000000001";
const branchId = "00000000-0000-4000-8000-000000000002";
const itemId = "00000000-0000-4000-8000-000000000003";
const milkId = "00000000-0000-4000-8000-000000000005";

beforeEach(() => {
  mocks.clientQuery.mockReset(); mocks.poolQuery.mockReset(); mocks.release.mockReset(); mocks.writeAudit.mockReset();
});

describe("opening inventory baseline workflow", () => {
  it("creates the header, canonical item rows, and audit atomically", async () => {
    mocks.clientQuery.mockImplementation(async (statement: unknown) => {
      const sql = String(statement);
      if (sql === "BEGIN" || sql === "COMMIT") return { rows: [] };
      if (sql.includes("FROM branches")) return { rows: [{ id: branchId, name: "Gulod / Main Branch" }] };
      if (sql.includes("SELECT id FROM inventory_opening_baselines")) return { rows: [] };
      if (sql.includes("FROM inventory_items")) return { rows: [{ id: itemId, sku: "RM-002", name: "Espresso Blend Beans", unit: "g" }] };
      if (sql.includes("INSERT INTO inventory_opening_baselines")) return { rows: [{ id: "00000000-0000-4000-8000-000000000004" }] };
      if (sql.includes("INSERT INTO inventory_opening_baseline_items")) return { rows: [], rowCount: 1 };
      if (sql.includes("SELECT ob.id")) return { rows: [{ id: "00000000-0000-4000-8000-000000000004", items: [] }] };
      throw new Error(`Unexpected query: ${sql}`);
    });
    const status = vi.fn().mockReturnThis(); const json = vi.fn();
    await createOpeningInventoryBaseline({ user: { id: ownerId, role: "OWNER", branchId: null }, body: { baselines: [{ branchId, effectiveAt: "2026-09-16T00:00:00+08:00", designation: "UAT_OPENING", notes: "Approved UAT opening inventory baseline.", items: [{ inventoryItemId: itemId, quantity: 5750, unit: "g" }] }] } } as never, { status, json } as never, vi.fn());
    expect(mocks.clientQuery.mock.calls.map(([sql]) => String(sql))).toEqual(expect.arrayContaining(["BEGIN", "COMMIT"]));
    expect(mocks.writeAudit).toHaveBeenCalledWith(expect.anything(), "CREATE_UAT_OPENING_INVENTORY", "INVENTORY_OPENING_BASELINE", expect.any(String), expect.any(String), expect.objectContaining({ branchId, itemCount: 1 }), expect.anything());
    expect(status).toHaveBeenCalledWith(201);
  });

  it("rejects a non-canonical unit and rolls back", async () => {
    mocks.clientQuery.mockImplementation(async (statement: unknown) => {
      const sql = String(statement);
      if (sql === "BEGIN" || sql === "ROLLBACK") return { rows: [] };
      if (sql.includes("FROM branches")) return { rows: [{ id: branchId, name: "Gulod / Main Branch" }] };
      if (sql.includes("SELECT id FROM inventory_opening_baselines")) return { rows: [] };
      if (sql.includes("FROM inventory_items")) return { rows: [{ id: itemId, sku: "RM-002", name: "Espresso Blend Beans", unit: "g" }] };
      throw new Error(`Unexpected query: ${sql}`);
    });
    await expect(createOpeningInventoryBaseline({ user: { id: ownerId, role: "OWNER", branchId: null }, body: { baselines: [{ branchId, effectiveAt: "2026-09-16T00:00:00+08:00", designation: "UAT_OPENING", notes: "Approved UAT opening inventory baseline.", items: [{ inventoryItemId: itemId, quantity: 5.75, unit: "ml" }] }] } } as never, {} as never, vi.fn())).rejects.toMatchObject({ code: "OPENING_BASELINE_UNIT_INVALID" });
    expect(mocks.clientQuery).toHaveBeenCalledWith("ROLLBACK");
  });

  it("restricts a Manager list query to the assigned branch", async () => {
    mocks.poolQuery.mockResolvedValue({ rows: [] }); const json = vi.fn();
    await listOpeningInventoryBaselines({ user: { id: ownerId, role: "BRANCH_MANAGER", branchId }, query: { branchId: "00000000-0000-4000-8000-000000000099" } } as never, { json } as never, vi.fn());
    expect(mocks.poolQuery.mock.calls[0]?.[1]).toEqual([branchId]);
  });

  it("blocks Starting Stock setup when existing seeded inventory evidence makes initialization unsafe", async () => {
    mocks.poolQuery.mockImplementation(async (statement: unknown, values?: unknown[]) => {
      const sql = String(statement);
      if (sql.includes("FROM branches")) return { rows: [{ id: branchId, name: "Gulod / Main Branch" }] };
      if (sql.includes("FROM inventory_items")) return { rows: [{ inventoryItemId: itemId, sku: "RM-002", name: "Espresso Blend Beans", category: "Coffee", unit: "g" }] };
      if (sql.includes("FROM inventory_opening_baselines WHERE branch_id")) return { rows: [{ baselineCount: 0, balanceCount: 1, countCount: 0, movementCount: 0, usageCount: 0 }] };
      if (sql.includes("SELECT ob.id")) return { rows: [] };
      throw new Error(`Unexpected query: ${sql} ${JSON.stringify(values)}`);
    });
    const json = vi.fn();
    await getStartingStockSetup({ user: { id: ownerId, role: "BRANCH_MANAGER", branchId }, query: { branchId: "00000000-0000-4000-8000-000000000099" } } as never, { json } as never, vi.fn());
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ data: { setup: expect.objectContaining({ branchId, status: "BLOCKED" }) } }));
    expect(mocks.poolQuery.mock.calls.every(([, values]) => !Array.isArray(values) || !values.includes("00000000-0000-4000-8000-000000000099"))).toBe(true);
  });

  it("reports a fresh branch with assigned ingredients and no operational history as ready", async () => {
    mocks.poolQuery.mockImplementation(async (statement: unknown) => {
      const sql = String(statement);
      if (sql.includes("FROM branches")) return { rows: [{ id: branchId, name: "Lipa" }] };
      if (sql.includes("FROM inventory_items")) return { rows: [{ inventoryItemId: itemId, sku: "RM-002", name: "Espresso Blend Beans", category: "Coffee", unit: "g" }] };
      if (sql.includes("FROM inventory_opening_baselines WHERE branch_id")) return { rows: [{ baselineCount: 0, balanceCount: 0, countCount: 0, movementCount: 0, usageCount: 0 }] };
      if (sql.includes("SELECT ob.id")) return { rows: [] };
      throw new Error(`Unexpected query: ${sql}`);
    });
    const json = vi.fn();
    await getStartingStockSetup({ user: { id: ownerId, role: "BRANCH_MANAGER", branchId }, query: {} } as never, { json } as never, vi.fn());
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ data: { setup: expect.objectContaining({ branchId, status: "READY", items: [expect.objectContaining({ inventoryItemId: itemId })] }) } }));
  });

  it("confirms a complete Starting Stock atomically with canonical conversion and an explicit zero", async () => {
    mocks.clientQuery.mockImplementation(async (statement: unknown) => {
      const sql = String(statement);
      if (["BEGIN", "COMMIT"].includes(sql) || sql.includes("pg_advisory_xact_lock")) return { rows: [] };
      if (sql.includes("FROM branches")) return { rows: [{ id: branchId, name: "Lipa" }] };
      if (sql.includes("FROM inventory_opening_baselines WHERE branch_id")) return { rows: [{ baselineCount: 0, balanceCount: 0, countCount: 0, movementCount: 0, usageCount: 0 }] };
      if (sql.includes("FROM inventory_items")) return { rows: [
        { inventoryItemId: itemId, sku: "RM-002", name: "Espresso Blend Beans", unit: "g" },
        { inventoryItemId: milkId, sku: "RM-005", name: "Whole Milk", unit: "ml" },
      ] };
      if (sql.includes("INSERT INTO inventory_opening_baselines")) return { rows: [{ id: "00000000-0000-4000-8000-000000000004" }] };
      if (sql.includes("INSERT INTO inventory_opening_baseline_items")) return { rows: [], rowCount: 2 };
      if (sql.includes("SELECT ob.id")) return { rows: [{ id: "00000000-0000-4000-8000-000000000004", items: [] }] };
      throw new Error(`Unexpected query: ${sql}`);
    });
    const status = vi.fn().mockReturnThis(); const json = vi.fn();
    await confirmStartingStock({ user: { id: ownerId, role: "BRANCH_MANAGER", branchId }, body: { confirmed: true, items: [
      { inventoryItemId: itemId, quantity: 3.864, enteredUnit: "kg" },
      { inventoryItemId: milkId, quantity: 0, enteredUnit: "L" },
    ] } } as never, { status, json } as never, vi.fn());
    const itemInsert = mocks.clientQuery.mock.calls.find(([sql]) => String(sql).includes("INSERT INTO inventory_opening_baseline_items"));
    expect(itemInsert?.[1]).toEqual([expect.any(String), [itemId, milkId], [3864, 0], ["g", "ml"]]);
    expect(mocks.writeAudit).toHaveBeenCalledWith(expect.anything(), "CONFIRM_STARTING_STOCK", "INVENTORY_OPENING_BASELINE", expect.any(String), expect.any(String), expect.objectContaining({ branchId, itemCount: 2, explicitZeroCount: 1 }), expect.anything());
    expect(status).toHaveBeenCalledWith(201);
    expect(mocks.clientQuery).toHaveBeenCalledWith("COMMIT");
  });

  it("rejects duplicate initialization before inserting and rolls back", async () => {
    mocks.clientQuery.mockImplementation(async (statement: unknown) => {
      const sql = String(statement);
      if (["BEGIN", "ROLLBACK"].includes(sql) || sql.includes("pg_advisory_xact_lock")) return { rows: [] };
      if (sql.includes("FROM branches")) return { rows: [{ id: branchId, name: "Lipa" }] };
      if (sql.includes("FROM inventory_opening_baselines WHERE branch_id")) return { rows: [{ baselineCount: 1, balanceCount: 0, countCount: 0, movementCount: 0, usageCount: 0 }] };
      throw new Error(`Unexpected query: ${sql}`);
    });
    await expect(confirmStartingStock({ user: { id: ownerId, role: "BRANCH_MANAGER", branchId }, body: { confirmed: true, items: [{ inventoryItemId: itemId, quantity: 0, enteredUnit: "g" }] } } as never, {} as never, vi.fn())).rejects.toMatchObject({ code: "STARTING_STOCK_EXISTS" });
    expect(mocks.clientQuery.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO inventory_opening_baselines"))).toBe(false);
    expect(mocks.clientQuery).toHaveBeenCalledWith("ROLLBACK");
  });

  it("rolls back the complete confirmation if audit writing fails", async () => {
    mocks.writeAudit.mockRejectedValue(new Error("audit unavailable"));
    mocks.clientQuery.mockImplementation(async (statement: unknown) => {
      const sql = String(statement);
      if (["BEGIN", "ROLLBACK"].includes(sql) || sql.includes("pg_advisory_xact_lock")) return { rows: [] };
      if (sql.includes("FROM branches")) return { rows: [{ id: branchId, name: "Lipa" }] };
      if (sql.includes("FROM inventory_opening_baselines WHERE branch_id")) return { rows: [{ baselineCount: 0, balanceCount: 0, countCount: 0, movementCount: 0, usageCount: 0 }] };
      if (sql.includes("FROM inventory_items")) return { rows: [{ inventoryItemId: itemId, sku: "RM-002", name: "Espresso Blend Beans", unit: "g" }] };
      if (sql.includes("INSERT INTO inventory_opening_baselines")) return { rows: [{ id: "00000000-0000-4000-8000-000000000004" }] };
      if (sql.includes("INSERT INTO inventory_opening_baseline_items")) return { rows: [], rowCount: 1 };
      throw new Error(`Unexpected query: ${sql}`);
    });
    await expect(confirmStartingStock({ user: { id: ownerId, role: "BRANCH_MANAGER", branchId }, body: { confirmed: true, items: [{ inventoryItemId: itemId, quantity: 5750, enteredUnit: "g" }] } } as never, {} as never, vi.fn())).rejects.toThrow("audit unavailable");
    expect(mocks.clientQuery).toHaveBeenCalledWith("ROLLBACK");
    expect(mocks.clientQuery).not.toHaveBeenCalledWith("COMMIT");
  });

  it("confirms explicit-zero ingredient initial stock for today only after pre-operations verification", async () => {
    mocks.clientQuery.mockImplementation(async (statement: unknown) => {
      const sql = String(statement);
      if (["BEGIN", "COMMIT"].includes(sql) || sql.includes("pg_advisory_xact_lock")) return { rows: [] };
      if (sql.includes('"startingStockEstablished"')) return { rows: [{ sku: "ING-99", name: "Oat Milk", unit: "ml", branchName: "Lipa", startingStockEstablished: true }] };
      if (sql.includes("EXISTS (SELECT 1 FROM inventory_opening_baseline_items")) return { rows: [{ baseline: false, balance: false, count: false, movement: false, consumption: false }] };
      if (sql.includes('::date::text today')) return { rows: [{ today: "2026-10-25", nextDate: "2026-10-26" }] };
      if (sql.includes(") started")) return { rows: [{ started: false }] };
      if (sql.includes("INSERT INTO inventory_opening_baselines")) return { rows: [{ id: "00000000-0000-4000-8000-000000000009" }] };
      if (sql.includes("INSERT INTO inventory_opening_baseline_items")) return { rows: [] };
      if (sql.includes("SELECT ob.id")) return { rows: [{ id: "00000000-0000-4000-8000-000000000009", designation: "ITEM_INITIALIZATION", items: [] }] };
      throw new Error(`Unexpected query: ${sql}`);
    });
    const status = vi.fn().mockReturnThis(); const json = vi.fn();
    await confirmIngredientInitialStock({ user: { id: ownerId, role: "BRANCH_MANAGER", branchId }, params: { inventoryItemId: itemId }, body: { confirmed: true, quantity: 0, enteredUnit: "L", preOperationsConfirmed: true } } as never, { status, json } as never, vi.fn());
    const headerInsert = mocks.clientQuery.mock.calls.find(([sql]) => String(sql).includes("INSERT INTO inventory_opening_baselines"));
    const itemInsert = mocks.clientQuery.mock.calls.find(([sql]) => String(sql).includes("INSERT INTO inventory_opening_baseline_items"));
    expect(headerInsert?.[1]).toEqual([branchId, "2026-10-25", itemId, expect.any(String), ownerId]);
    expect(itemInsert?.[1]).toEqual([expect.any(String), itemId, 0, "ml"]);
    expect(mocks.writeAudit).toHaveBeenCalledWith(expect.anything(), "CONFIRM_INGREDIENT_INITIAL_STOCK", "INVENTORY_OPENING_BASELINE", expect.any(String), expect.any(String), expect.objectContaining({ branchId, inventoryItemId: itemId, explicitZero: true, sameDayEffective: true }), expect.anything());
    expect(status).toHaveBeenCalledWith(201);
  });

  it("uses the next business date when branch operations already started", async () => {
    mocks.clientQuery.mockImplementation(async (statement: unknown) => {
      const sql = String(statement);
      if (["BEGIN", "COMMIT"].includes(sql) || sql.includes("pg_advisory_xact_lock")) return { rows: [] };
      if (sql.includes('"startingStockEstablished"')) return { rows: [{ sku: "ING-99", name: "Oat Milk", unit: "ml", branchName: "Lipa", startingStockEstablished: true }] };
      if (sql.includes("EXISTS (SELECT 1 FROM inventory_opening_baseline_items")) return { rows: [{ baseline: false, balance: false, count: false, movement: false, consumption: false }] };
      if (sql.includes('::date::text today')) return { rows: [{ today: "2026-10-25", nextDate: "2026-10-26" }] };
      if (sql.includes(") started")) return { rows: [{ started: true }] };
      if (sql.includes("INSERT INTO inventory_opening_baselines")) return { rows: [{ id: "00000000-0000-4000-8000-000000000009" }] };
      if (sql.includes("INSERT INTO inventory_opening_baseline_items")) return { rows: [] };
      if (sql.includes("SELECT ob.id")) return { rows: [{ id: "00000000-0000-4000-8000-000000000009", designation: "ITEM_INITIALIZATION", items: [] }] };
      throw new Error(`Unexpected query: ${sql}`);
    });
    const status = vi.fn().mockReturnThis(); const json = vi.fn();
    await confirmIngredientInitialStock({ user: { id: ownerId, role: "BRANCH_MANAGER", branchId }, params: { inventoryItemId: itemId }, body: { confirmed: true, quantity: 2, enteredUnit: "L", preOperationsConfirmed: true } } as never, { status, json } as never, vi.fn());
    const headerInsert = mocks.clientQuery.mock.calls.find(([sql]) => String(sql).includes("INSERT INTO inventory_opening_baselines"));
    const itemInsert = mocks.clientQuery.mock.calls.find(([sql]) => String(sql).includes("INSERT INTO inventory_opening_baseline_items"));
    expect(headerInsert?.[1]).toEqual([branchId, "2026-10-26", itemId, expect.any(String), ownerId]);
    expect(itemInsert?.[1]).toEqual([expect.any(String), itemId, 2000, "ml"]);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ effectiveBusinessDate: "2026-10-26", sameDayEffective: false }) }));
  });

  it("rejects prior authoritative item activity without inserting an initialization", async () => {
    mocks.clientQuery.mockImplementation(async (statement: unknown) => {
      const sql = String(statement);
      if (["BEGIN", "ROLLBACK"].includes(sql) || sql.includes("pg_advisory_xact_lock")) return { rows: [] };
      if (sql.includes('"startingStockEstablished"')) return { rows: [{ sku: "ING-99", name: "Oat Milk", unit: "ml", branchName: "Lipa", startingStockEstablished: true }] };
      if (sql.includes("EXISTS (SELECT 1 FROM inventory_opening_baseline_items")) return { rows: [{ baseline: false, balance: false, count: false, movement: true, consumption: false }] };
      throw new Error(`Unexpected query: ${sql}`);
    });
    await expect(confirmIngredientInitialStock({ user: { id: ownerId, role: "BRANCH_MANAGER", branchId }, params: { inventoryItemId: itemId }, body: { confirmed: true, quantity: 2, enteredUnit: "L", preOperationsConfirmed: false } } as never, {} as never, vi.fn())).rejects.toMatchObject({ code: "ITEM_INITIALIZATION_RECONCILIATION_REQUIRED" });
    expect(mocks.clientQuery.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO inventory_opening_baselines"))).toBe(false);
    expect(mocks.clientQuery).toHaveBeenCalledWith("ROLLBACK");
  });

  it("rejects an ingredient that is not available to the Manager's branch", async () => {
    mocks.clientQuery.mockImplementation(async (statement: unknown) => {
      const sql = String(statement);
      if (["BEGIN", "ROLLBACK"].includes(sql) || sql.includes("pg_advisory_xact_lock")) return { rows: [] };
      if (sql.includes('"startingStockEstablished"')) return { rows: [] };
      throw new Error(`Unexpected query: ${sql}`);
    });

    await expect(confirmIngredientInitialStock({ user: { id: ownerId, role: "BRANCH_MANAGER", branchId }, params: { inventoryItemId: itemId }, body: { confirmed: true, quantity: 2, enteredUnit: "L", preOperationsConfirmed: false } } as never, {} as never, vi.fn())).rejects.toMatchObject({ code: "INVENTORY_ITEM_NOT_FOUND" });
    expect(mocks.clientQuery.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO inventory_opening_baselines"))).toBe(false);
    expect(mocks.clientQuery).toHaveBeenCalledWith("ROLLBACK");
  });
});
