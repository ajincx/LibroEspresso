import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("../config/database.js", () => ({ pool: { query: mocks.query } }));
vi.mock("../config/env.js", () => ({ env: { DATA_LIFECYCLE_ENV: "UAT" } }));

import { getInventoryOverview, getInventoryStockLedger } from "./operations.controller.js";

describe("Inventory Overview system stock", () => {
  beforeEach(() => mocks.query.mockReset());

  it("uses the authoritative ledger balance for Starting Stock and active POS consumption", async () => {
    mocks.query.mockImplementation(async (statement: unknown, values?: unknown[]) => {
      const sql = String(statement);
      const inventoryItemId = values?.[1];
      if (sql.includes("FROM branches b CROSS JOIN inventory_items")) return { rows: [
        {
          branchId: "branch-1", branchName: "Lipa", inventoryItemId: "item-beans",
          sku: "RM-002", name: "Espresso Blend Beans", category: "Coffee", unit: "g", unitCost: 0.82,
          reorderLevel: 25000, reorderDays: 7, lastActualQuantity: 126, lastCountAt: "2026-09-05T15:59:59.000Z",
        },
        {
          branchId: "branch-1", branchName: "Lipa", inventoryItemId: "item-water",
          sku: "ING-00027", name: "Carbonated Water", category: "Beverage Base", unit: "ml", unitCost: 0.06,
          reorderLevel: 500, reorderDays: 7, lastActualQuantity: 0, lastCountAt: "2026-09-05T15:59:59.000Z",
        },
      ] };
      if (sql.includes("WITH targets AS")) return { rows: [
        { branchId: "branch-1", inventoryItemId: "item-beans", id: "opening-item-beans", importId: null, occurredAt: "2026-09-16T00:00:00+08:00", activityType: "STARTING_STOCK", reference: "OB-2026-00002", quantity: 4500, sourceUnit: null },
        { branchId: "branch-1", inventoryItemId: "item-beans", id: "pos-item-beans", importId: "active-lipa", occurredAt: "2026-09-16", activityType: "POS_CONSUMPTION", reference: "Lipa active POS", quantity: 636, sourceUnit: "g" },
        { branchId: "branch-1", inventoryItemId: "item-water", id: "opening-item-water", importId: null, occurredAt: "2026-09-16T00:00:00+08:00", activityType: "STARTING_STOCK", reference: "OB-2026-00002", quantity: 750, sourceUnit: null },
        { branchId: "branch-1", inventoryItemId: "item-water", id: "pos-item-water", importId: "active-lipa", occurredAt: "2026-09-16", activityType: "POS_CONSUMPTION", reference: "Lipa active POS", quantity: 1250, sourceUnit: "ml" },
      ] };
      if (sql.includes("FROM inventory_opening_baselines")) return { rows: [{
        id: `opening-${inventoryItemId}`, occurredAt: "2026-09-16T00:00:00+08:00",
        reference: "OB-2026-00002", quantity: inventoryItemId === "item-beans" ? 4500 : 750,
      }] };
      if (sql.includes("FROM pos_imports")) return { rows: [{
        id: `pos-${inventoryItemId}`, importId: "active-lipa", occurredAt: "2026-09-16",
        reference: "Lipa active POS", quantity: inventoryItemId === "item-beans" ? 636 : 1250,
        sourceUnit: inventoryItemId === "item-beans" ? "g" : "ml",
      }] };
      return { rows: [] };
    });
    const json = vi.fn();

    await getInventoryOverview({ query: {}, user: { id: "owner-1", role: "OWNER", branchId: null } } as never, { json } as never, vi.fn());

    expect(mocks.query).toHaveBeenCalledTimes(2);
    expect(String(mocks.query.mock.calls[0]?.[0])).not.toContain("pos_sale_ingredient_usage");
    expect(mocks.query.mock.calls.some(([sql]) => String(sql).includes("JOIN pos_sources source ON source.id=pi.pos_source_id AND source.status='ACTIVE'"))).toBe(true);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: { items: [
        expect.objectContaining({ sku: "RM-002", systemStock: 3864, inventoryValue: 3168.48 }),
        expect.objectContaining({ sku: "ING-00027", systemStock: -500, inventoryValue: 0 }),
      ] },
    }));
  });

  it("keeps concurrent Owner overview query counts bounded", async () => {
    mocks.query.mockImplementation(async (statement: unknown) => {
      const sql = String(statement);
      if (sql.includes("FROM branches b CROSS JOIN inventory_items")) return { rows: [{
        branchId: "branch-1", branchName: "Lipa", inventoryItemId: "item-beans",
        sku: "RM-002", name: "Espresso Blend Beans", category: "Coffee", unit: "g", unitCost: 0.82,
        reorderLevel: 1500, reorderDays: 5, lastActualQuantity: 0, lastCountAt: null,
      }] };
      return { rows: [] };
    });
    const request = { query: {}, user: { id: "owner-1", role: "OWNER", branchId: null } } as never;

    await Promise.all([
      getInventoryOverview(request, { json: vi.fn() } as never, vi.fn()),
      getInventoryOverview(request, { json: vi.fn() } as never, vi.fn()),
    ]);

    expect(mocks.query).toHaveBeenCalledTimes(4);
    expect(mocks.query.mock.calls.filter(([sql]) => String(sql).includes("WITH targets AS"))).toHaveLength(2);
  });
});

describe("Inventory Overview stock ledger", () => {
  beforeEach(() => mocks.query.mockReset());

  it("uses the same overview stock result and enforces the Manager's assigned branch", async () => {
    const assignedBranch = "00000000-0000-4000-8000-000000000001";
    const requestedBranch = "00000000-0000-4000-8000-000000000002";
    const inventoryItemId = "00000000-0000-4000-8000-000000000003";
    mocks.query.mockImplementation(async (statement: unknown) => {
      const sql = String(statement);
      if (sql.includes("FROM branches b CROSS JOIN inventory_items")) return { rows: [{
        branchId: assignedBranch, branchName: "Gulod / Main Branch", inventoryItemId,
        sku: "RM-002", name: "Espresso Blend Beans", category: "Coffee", unit: "g", unitCost: 0.82,
        reorderLevel: 25000, reorderDays: 7, lastActualQuantity: 5750, lastCountAt: null, systemStock: 5054,
      }] };
      if (sql.includes("WITH targets AS")) return { rows: [
        { branchId: assignedBranch, inventoryItemId, id: "opening", importId: null, occurredAt: "2026-09-16T00:00:00+08:00", activityType: "STARTING_STOCK", reference: "OB-2026-00001", quantity: 5750, sourceUnit: null },
        { branchId: assignedBranch, inventoryItemId, id: "active", importId: "active", occurredAt: "2026-09-16", activityType: "POS_CONSUMPTION", reference: "Active XLSX", quantity: 696, sourceUnit: "g" },
      ] };
      if (sql.includes("FROM inventory_opening_baselines")) return { rows: [{ id: "opening", occurredAt: "2026-09-16T00:00:00+08:00", reference: "OB-2026-00001", quantity: 5750 }] };
      if (sql.includes("FROM pos_imports")) return { rows: [{ id: "active-g", importId: "active", occurredAt: "2026-09-16T12:00:00+08:00", reference: "Active XLSX", quantity: 696, sourceUnit: "g" }] };
      return { rows: [] };
    });
    const json = vi.fn();

    await getInventoryStockLedger({
      params: { inventoryItemId }, query: { branchId: requestedBranch },
      user: { id: "manager-1", role: "BRANCH_MANAGER", branchId: assignedBranch },
    } as never, { json } as never, vi.fn());

    expect(mocks.query.mock.calls[0]?.[1]).toEqual([assignedBranch, inventoryItemId]);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: { ledger: expect.objectContaining({ startingStock: 5750, operationalPosConsumption: 696, calculatedBalance: 5054, currentExpectedStock: 5054 }) },
    }));
  });

  it("allows an Owner to request a valid item in a selected branch", async () => {
    const selectedBranch = "00000000-0000-4000-8000-000000000002";
    const inventoryItemId = "00000000-0000-4000-8000-000000000003";
    mocks.query.mockImplementation(async (statement: unknown) => {
      if (String(statement).includes("FROM branches b CROSS JOIN inventory_items")) return { rows: [{
        branchId: selectedBranch, branchName: "Evo", inventoryItemId,
        sku: "ING-00060", name: "Asian Noodles", category: "Food", unit: "g", unitCost: 0,
        reorderLevel: 0, reorderDays: 7, lastActualQuantity: 0, lastCountAt: null, systemStock: 0,
      }] };
      if (String(statement).includes("WITH targets AS")) return { rows: [] };
      return { rows: [] };
    });
    const json = vi.fn();

    await getInventoryStockLedger({
      params: { inventoryItemId }, query: { branchId: selectedBranch },
      user: { id: "owner-1", role: "OWNER", branchId: null },
    } as never, { json } as never, vi.fn());

    expect(mocks.query.mock.calls[0]?.[1]).toEqual([selectedBranch, inventoryItemId]);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({
      data: { ledger: expect.objectContaining({ branchName: "Evo", activities: [], currentExpectedStock: 0 }) },
    }));
  });
});
