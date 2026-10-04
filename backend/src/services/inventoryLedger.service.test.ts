import { describe, expect, it, vi } from "vitest";
import { buildInventoryLedger, inventoryLedgerKey, loadInventoryLedger, loadInventoryLedgerBalances } from "./inventoryLedger.service.js";

describe("inventory stock ledger", () => {
  it("shows the approved September opening stock and active POS deduction without changing Starting Stock", () => {
    const ledger = buildInventoryLedger([
      { id: "opening", occurredAt: "2026-09-15T16:00:00.000Z", activityType: "STARTING_STOCK", reference: "OB-2026-00001", quantity: 5750 },
      { id: "active-pos", occurredAt: "2026-09-16T04:00:00.000Z", activityType: "POS_CONSUMPTION", reference: "Active XLSX", quantity: 696 },
    ]);
    expect(ledger.startingStock).toBe(5750);
    expect(ledger.operationalPosConsumption).toBe(696);
    expect(ledger.calculatedBalance).toBe(5054);
    expect(ledger.activities.map((activity) => activity.runningBalance)).toEqual([5750, 5054]);
  });

  it("treats a physical count as a verified balance reset, not a movement", () => {
    const ledger = buildInventoryLedger([
      { id: "opening", occurredAt: "2026-09-15T16:00:00.000Z", activityType: "STARTING_STOCK", reference: "OB-1", quantity: 5750 },
      { id: "pos", occurredAt: "2026-09-16T04:00:00.000Z", activityType: "POS_CONSUMPTION", reference: "POS", quantity: 696 },
      { id: "count", occurredAt: "2026-10-01T15:59:59.000Z", activityType: "PHYSICAL_COUNT", reference: "IC-1", quantity: 970 },
    ]);
    expect(ledger.activities[2]).toMatchObject({ quantityChange: null, runningBalance: 970 });
  });

  it("loads only active POS-source usage for operational deductions", async () => {
    const statements: string[] = [];
    const query = vi.fn(async (statement: unknown) => {
      const sql = String(statement); statements.push(sql);
      if (sql.includes("FROM inventory_opening_baselines")) return { rows: [{ id: "opening", occurredAt: "2026-09-16T00:00:00+08:00", reference: "OB-2026-00001", quantity: 5750 }] };
      if (sql.includes("FROM pos_imports")) return { rows: [{ id: "active-g", importId: "active", occurredAt: "2026-09-16T12:00:00+08:00", reference: "Active XLSX", quantity: 696, sourceUnit: "g" }] };
      return { rows: [] };
    });
    const ledger = await loadInventoryLedger({ query } as never, "gulod", "beans", "g");
    expect(statements.find((sql) => sql.includes("FROM pos_imports"))).toContain("source.status='ACTIVE'");
    expect(statements.find((sql) => sql.includes("FROM inventory_counts"))).toContain("NOT ic.is_test_data");
    expect(ledger).toMatchObject({ startingStock: 5750, operationalPosConsumption: 696, calculatedBalance: 5054 });
  });

  it("returns a zero ledger when a valid branch item has no baseline or activity", async () => {
    const statements: string[] = [];
    const query = vi.fn(async (statement: unknown) => {
      statements.push(String(statement));
      return { rows: [] };
    });

    const ledger = await loadInventoryLedger({ query } as never, "evo", "asian-noodles", "g");

    expect(ledger).toEqual({ activities: [], startingStock: null, operationalPosConsumption: 0, calculatedBalance: 0 });
    expect(statements.find((sql) => sql.includes("FROM inventory_movements"))).toContain("im.movement_type::text");
  });

  it("batches authoritative branch ledgers and preserves the approved Gulod/Lipa balances", async () => {
    const query = vi.fn(async (statement: unknown) => {
      const sql = String(statement);
      expect(sql).toContain("source.status='ACTIVE'");
      expect(sql).toContain("NOT pi.is_test_data");
      expect(sql).toContain("NOT ic.is_test_data");
      return { rows: [
        { branchId: "gulod", inventoryItemId: "espresso", id: "g-open", importId: null, occurredAt: "2026-09-16T00:00:00+08:00", activityType: "STARTING_STOCK", reference: "OB-G", quantity: 5750, sourceUnit: null },
        { branchId: "gulod", inventoryItemId: "espresso", id: "g-pos-g", importId: "g-pos", occurredAt: "2026-09-16", activityType: "POS_CONSUMPTION", reference: "Active Gulod", quantity: 696, sourceUnit: "g" },
        { branchId: "lipa", inventoryItemId: "espresso", id: "l-open-e", importId: null, occurredAt: "2026-09-16T00:00:00+08:00", activityType: "STARTING_STOCK", reference: "OB-L", quantity: 4500, sourceUnit: null },
        { branchId: "lipa", inventoryItemId: "espresso", id: "l-pos-e", importId: "l-pos", occurredAt: "2026-09-16", activityType: "POS_CONSUMPTION", reference: "Active Lipa", quantity: 636, sourceUnit: "g" },
        { branchId: "lipa", inventoryItemId: "milk", id: "l-open-m", importId: null, occurredAt: "2026-09-16T00:00:00+08:00", activityType: "STARTING_STOCK", reference: "OB-L", quantity: 23250, sourceUnit: null },
        { branchId: "lipa", inventoryItemId: "milk", id: "l-pos-m", importId: "l-pos", occurredAt: "2026-09-16", activityType: "POS_CONSUMPTION", reference: "Active Lipa", quantity: 11290, sourceUnit: "ml" },
        { branchId: "lipa", inventoryItemId: "ice", id: "l-open-i", importId: null, occurredAt: "2026-09-16T00:00:00+08:00", activityType: "STARTING_STOCK", reference: "OB-L", quantity: 28750, sourceUnit: null },
        { branchId: "lipa", inventoryItemId: "ice", id: "l-pos-i", importId: "l-pos", occurredAt: "2026-09-16", activityType: "POS_CONSUMPTION", reference: "Active Lipa", quantity: 12540, sourceUnit: "g" },
      ] };
    });
    const ledgers = await loadInventoryLedgerBalances({ query } as never, [
      { branchId: "gulod", inventoryItemId: "espresso", canonicalUnit: "g" },
      { branchId: "lipa", inventoryItemId: "espresso", canonicalUnit: "g" },
      { branchId: "lipa", inventoryItemId: "milk", canonicalUnit: "ml" },
      { branchId: "lipa", inventoryItemId: "ice", canonicalUnit: "g" },
    ]);

    expect(query).toHaveBeenCalledTimes(1);
    expect(ledgers.get(inventoryLedgerKey("gulod", "espresso"))?.calculatedBalance).toBe(5054);
    expect(ledgers.get(inventoryLedgerKey("lipa", "espresso"))?.calculatedBalance).toBe(3864);
    expect(ledgers.get(inventoryLedgerKey("lipa", "milk"))?.calculatedBalance).toBe(11960);
    expect(ledgers.get(inventoryLedgerKey("lipa", "ice"))?.calculatedBalance).toBe(16210);
  });

  it("keeps a later operational physical count authoritative in the batched ledger", async () => {
    const query = vi.fn(async () => ({ rows: [
      { branchId: "gulod", inventoryItemId: "espresso", id: "open", importId: null, occurredAt: "2026-09-16T00:00:00+08:00", activityType: "STARTING_STOCK", reference: "OB", quantity: 5750, sourceUnit: null },
      { branchId: "gulod", inventoryItemId: "espresso", id: "pos", importId: "pos", occurredAt: "2026-09-16", activityType: "POS_CONSUMPTION", reference: "POS", quantity: 696, sourceUnit: "g" },
      { branchId: "gulod", inventoryItemId: "espresso", id: "count", importId: null, occurredAt: "2026-10-03T15:59:59+00:00", activityType: "PHYSICAL_COUNT", reference: "IC", quantity: 5000, sourceUnit: null },
    ] }));
    const ledgers = await loadInventoryLedgerBalances({ query } as never, [
      { branchId: "gulod", inventoryItemId: "espresso", canonicalUnit: "g" },
    ]);
    expect(ledgers.get(inventoryLedgerKey("gulod", "espresso"))?.calculatedBalance).toBe(5000);
  });
});
