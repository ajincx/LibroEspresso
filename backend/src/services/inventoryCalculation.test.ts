import { describe, expect, it, vi } from "vitest";
import { calculateExpectedInventory, calculateExpectedInventoryBatch, computeExpectedStock, computeVariance } from "./inventoryCalculation.service.js";

describe("thesis inventory calculation formulas", () => {
  it("excludes explicitly classified test counts, balances, and movements from authoritative expected stock", async () => {
    const query = vi.fn(async (statement: unknown) => {
      const sql = String(statement);
      if (sql.includes("FROM inventory_items ii")) return { rows: [{ id: "item-1", sku: "RM-001", name: "Milk", unit: "ml", unitCost: 0.1 }] };
      if (sql.includes("FROM inventory_count_items ici")) return { rows: [] };
      if (sql.includes("FROM inventory_opening_baseline_items")) return { rows: [] };
      if (sql.includes("FROM branch_inventory_balances")) return { rows: [{ actualQuantity: 100, baselineDate: "2026-09-01", baselineAt: "2026-09-01T00:00:00.000Z", baselineSource: "BALANCE" }] };
      if (sql.includes("FROM inventory_movements")) return { rows: [{ received: 20, adjustmentIncreases: 0, adjustmentDecreases: 0 }] };
      return { rows: [{ unit: "ml", quantity: 10 }] };
    });

    const result = await calculateExpectedInventory({ query } as never, "branch-1", "item-1", "2026-09-30");

    expect(result.expectedQuantity).toBe(110);
    const statements = query.mock.calls.map(([sql]) => String(sql));
    expect(statements.find((sql) => sql.includes("FROM inventory_count_items ici"))).toContain("NOT ic.is_test_data");
    expect(statements.find((sql) => sql.includes("FROM branch_inventory_balances"))).toContain("NOT is_test_data");
    expect(statements.find((sql) => sql.includes("FROM branch_inventory_balances"))).toContain("as_of::date <= $3::date");
    expect(statements.find((sql) => sql.includes("FROM inventory_movements"))).toContain("NOT is_test_data");
    const consumptionSql = statements.find((sql) => sql.includes("FROM pos_sale_ingredient_usage"));
    expect(consumptionSql).toContain("JOIN pos_sources source ON source.id=pi.pos_source_id AND source.status='ACTIVE'");
  });

  it("rejects a historical query when only a later mutable balance exists", async () => {
    const query = vi.fn(async (statement: unknown) => {
      const sql = String(statement);
      if (sql.includes("FROM inventory_items ii")) return { rows: [{ id: "item-1", sku: "RM-001", name: "Milk", unit: "ml", unitCost: 0.1 }] };
      if (sql.includes("FROM inventory_count_items ici")) return { rows: [] };
      if (sql.includes("FROM inventory_opening_baseline_items")) return { rows: [] };
      if (sql.includes("FROM branch_inventory_balances")) return { rows: [] };
      throw new Error("No activity query should run without a valid baseline");
    });

    await expect(calculateExpectedInventory({ query } as never, "branch-1", "item-1", "2026-09-16"))
      .rejects.toMatchObject({ status: 422, code: "NO_VALID_HISTORICAL_BASELINE" });
  });

  it("uses a valid physical-count baseline on the requested historical date", async () => {
    const query = vi.fn(async (statement: unknown) => {
      const sql = String(statement);
      if (sql.includes("FROM inventory_items ii")) return { rows: [{ id: "item-1", sku: "RM-001", name: "Milk", unit: "ml", unitCost: 0.1 }] };
      if (sql.includes("FROM inventory_count_items ici")) return { rows: [{ actualQuantity: 200, baselineDate: "2026-09-16", baselineAt: "2026-09-16T16:00:00.000Z", baselineSource: "PHYSICAL_COUNT" }] };
      if (sql.includes("FROM inventory_opening_baseline_items")) return { rows: [] };
      if (sql.includes("FROM branch_inventory_balances")) return { rows: [] };
      if (sql.includes("FROM inventory_movements")) return { rows: [{ received: 0, adjustmentIncreases: 0, adjustmentDecreases: 0 }] };
      return { rows: [] };
    });

    const result = await calculateExpectedInventory({ query } as never, "branch-1", "item-1", "2026-09-16");
    expect(result.baselineDate).toBe("2026-09-16");
    expect(result.baselineSource).toBe("PHYSICAL_COUNT");
    expect(result.expectedQuantity).toBe(200);
    expect(query.mock.calls.find(([sql]) => String(sql).includes("FROM inventory_count_items ici"))?.[0]).toContain("ic.count_date <= $3::date");
  });

  it("uses a start-of-day opening baseline and includes same-day active-source POS usage", async () => {
    const query = vi.fn(async (statement: unknown, params?: unknown[]) => {
      const sql = String(statement);
      if (sql.includes("FROM inventory_items ii")) return { rows: [{ id: "item-1", sku: "RM-002", name: "Espresso Blend Beans", unit: "g", unitCost: 0.82 }] };
      if (sql.includes("FROM inventory_count_items ici")) return { rows: [{ actualQuantity: 1000, baselineDate: "2026-09-05", baselineAt: "2026-09-05T16:00:00.000Z", baselineSource: "PHYSICAL_COUNT" }] };
      if (sql.includes("FROM inventory_opening_baseline_items")) return { rows: [{ actualQuantity: 5750, baselineDate: "2026-09-16", baselineAt: "2026-09-15T16:00:00.000Z", baselineSource: "OPENING_BASELINE" }] };
      if (sql.includes("FROM branch_inventory_balances")) return { rows: [] };
      if (sql.includes("FROM inventory_movements")) return { rows: [{ received: 0, adjustmentIncreases: 0, adjustmentDecreases: 0 }] };
      if (sql.includes("FROM pos_sale_ingredient_usage")) {
        expect(sql).toContain("source.status='ACTIVE'");
        expect(sql).toContain("pi.business_date >= $3::date");
        expect(params?.[4]).toBe("OPENING_BASELINE");
        return { rows: [{ unit: "g", quantity: 696 }] };
      }
      return { rows: [] };
    });

    const result = await calculateExpectedInventory({ query } as never, "branch-1", "item-1", "2026-09-16");
    expect(result).toMatchObject({ previousActualQuantity: 5750, expectedConsumption: 696, expectedQuantity: 5054, baselineSource: "OPENING_BASELINE" });
  });

  it("keeps a later physical count authoritative over an older opening baseline", async () => {
    const query = vi.fn(async (statement: unknown) => {
      const sql = String(statement);
      if (sql.includes("FROM inventory_items ii")) return { rows: [{ id: "item-1", sku: "RM-002", name: "Espresso Blend Beans", unit: "g", unitCost: 0.82 }] };
      if (sql.includes("FROM inventory_count_items ici")) return { rows: [{ actualQuantity: 970, baselineDate: "2026-10-01", baselineAt: "2026-10-01T16:00:00.000Z", baselineSource: "PHYSICAL_COUNT" }] };
      if (sql.includes("FROM inventory_opening_baseline_items")) return { rows: [{ actualQuantity: 5750, baselineDate: "2026-09-16", baselineAt: "2026-09-15T16:00:00.000Z", baselineSource: "OPENING_BASELINE" }] };
      if (sql.includes("FROM branch_inventory_balances")) return { rows: [] };
      if (sql.includes("FROM inventory_movements")) return { rows: [{ received: 0, adjustmentIncreases: 0, adjustmentDecreases: 0 }] };
      return { rows: [] };
    });

    const result = await calculateExpectedInventory({ query } as never, "branch-1", "item-1", "2026-10-02");
    expect(result).toMatchObject({ previousActualQuantity: 970, expectedQuantity: 970, baselineSource: "PHYSICAL_COUNT" });
  });

  it("batch-calculates all scoped items in one query without changing the stock formula", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [
      {
        inventoryItemId: "beans", sku: "RM-002", itemName: "Espresso Blend Beans", unit: "g", unitCost: 0.82,
        actualQuantity: 5750, baselineDate: "2026-09-16", baselineSource: "OPENING_BASELINE",
        received: 100, adjustmentIncreases: 50, adjustmentDecreases: 25,
        consumptionUnit: "g", consumptionQuantity: 696,
      },
      {
        inventoryItemId: "beans", sku: "RM-002", itemName: "Espresso Blend Beans", unit: "g", unitCost: 0.82,
        actualQuantity: 5750, baselineDate: "2026-09-16", baselineSource: "OPENING_BASELINE",
        received: 100, adjustmentIncreases: 50, adjustmentDecreases: 25,
        consumptionUnit: "kg", consumptionQuantity: 1,
      },
      {
        inventoryItemId: "test-oat", sku: "ING-00073", itemName: "TEST_Oat Milk", unit: "ml", unitCost: 0.2,
        actualQuantity: null, baselineDate: null, baselineSource: null,
        received: 0, adjustmentIncreases: 0, adjustmentDecreases: 0,
        consumptionUnit: null, consumptionQuantity: null,
      },
    ] });

    const result = await calculateExpectedInventoryBatch({ query } as never, "branch-1", "2026-10-08");

    expect(query).toHaveBeenCalledOnce();
    expect(result.items).toEqual([expect.objectContaining({
      inventoryItemId: "beans",
      previousActualQuantity: 5750,
      stockReceived: 100,
      expectedConsumption: 1696,
      approvedAdjustmentIncreases: 50,
      approvedAdjustmentDecreases: 25,
      approvedAdjustments: 25,
      expectedQuantity: 4179,
      baselineSource: "OPENING_BASELINE",
    })]);
    expect(result.unavailableItems).toEqual([{
      inventoryItemId: "test-oat", sku: "ING-00073", itemName: "TEST_Oat Milk", unit: "ml", availability: "NO_BASELINE",
    }]);
    const sql = String(query.mock.calls[0]?.[0]);
    expect(sql).toContain("source.status='ACTIVE'");
    expect(sql).toContain("movement.occurred_at::date <= $2::date");
    expect(sql).toContain("pi.business_date <= $2::date");
    expect(sql).toContain("balance.as_of::date <= $2::date");
  });

  describe("computeExpectedStock", () => {
    it("deducts exact configured recipe consumption", () => {
      expect(computeExpectedStock(1000, 0, 34 * 7, 0, 0)).toBe(762);
      expect(computeExpectedStock(1000, 0, 34 * 9, 0, 0)).toBe(694);
    });

    it("applies Beginning Inventory + Stock Received - Usage + Increases - Decreases", () => {
      // 1000 + 250 - 238 + 50 - 62 = 1000
      expect(computeExpectedStock(1000, 250, 238, 50, 62)).toBe(1000);
    });
  });

  describe("computeVariance", () => {
    it("computes shortage as negative variance (Actual - Expected < 0)", () => {
      const result = computeVariance(100, 90, 2.5);
      expect(result.varianceQuantity).toBe(-10);
      expect(result.varianceValue).toBe(-25);
      expect(result.variancePercentage).toBe(-10);
    });

    it("computes excess as positive variance (Actual - Expected > 0)", () => {
      const result = computeVariance(100, 110, 2.5);
      expect(result.varianceQuantity).toBe(10);
      expect(result.varianceValue).toBe(25);
      expect(result.variancePercentage).toBe(10);
    });

    it("computes matched as zero variance (Expected - Actual = 0)", () => {
      const result = computeVariance(100, 100, 2.5);
      expect(result.varianceQuantity).toBe(0);
      expect(result.varianceValue).toBe(0);
      expect(result.variancePercentage).toBe(0);
    });

    it("returns null for variance percentage when expected inventory is zero or negative", () => {
      const result = computeVariance(0, 5, 2.5);
      expect(result.varianceQuantity).toBe(5);
      expect(result.varianceValue).toBe(12.5);
      expect(result.variancePercentage).toBeNull();
    });

    it("uses Actual minus Expected for the Gulod Espresso preview cases", () => {
      expect(computeVariance(5054, 5000, 0.82).varianceQuantity).toBe(-54);
      expect(computeVariance(5054, 5100, 0.82).varianceQuantity).toBe(46);
      expect(computeVariance(5054, 5054, 0.82).varianceQuantity).toBe(0);
    });
  });
});
