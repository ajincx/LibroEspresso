import { describe, expect, it, vi } from "vitest";
import { calculateExpectedInventory, computeExpectedStock, computeVariance } from "./inventoryCalculation.service.js";

describe("thesis inventory calculation formulas", () => {
  it("excludes explicitly classified test counts, balances, and movements from authoritative expected stock", async () => {
    const query = vi.fn(async (statement: unknown) => {
      const sql = String(statement);
      if (sql.includes("FROM inventory_items ii")) return { rows: [{ id: "item-1", sku: "RM-001", name: "Milk", unit: "ml", unitCost: 0.1 }] };
      if (sql.includes("FROM inventory_count_items ici")) return { rows: [] };
      if (sql.includes("FROM branch_inventory_balances")) return { rows: [{ actualQuantity: 100, baselineDate: "2026-09-01" }] };
      if (sql.includes("FROM inventory_movements")) return { rows: [{ received: 20, adjustmentIncreases: 0, adjustmentDecreases: 0 }] };
      return { rows: [{ unit: "ml", quantity: 10 }] };
    });

    const result = await calculateExpectedInventory({ query } as never, "branch-1", "item-1", "2026-09-30");

    expect(result.expectedQuantity).toBe(110);
    const statements = query.mock.calls.map(([sql]) => String(sql));
    expect(statements.find((sql) => sql.includes("FROM inventory_count_items ici"))).toContain("NOT ic.is_test_data");
    expect(statements.find((sql) => sql.includes("FROM branch_inventory_balances"))).toContain("NOT is_test_data");
    expect(statements.find((sql) => sql.includes("FROM inventory_movements"))).toContain("NOT is_test_data");
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
    it("computes shortage as positive variance (Expected - Actual > 0)", () => {
      const result = computeVariance(100, 90, 2.5);
      expect(result.varianceQuantity).toBe(10);
      expect(result.varianceValue).toBe(25);
      expect(result.variancePercentage).toBe(10); // +10%
    });

    it("computes excess as negative variance (Expected - Actual < 0)", () => {
      const result = computeVariance(100, 110, 2.5);
      expect(result.varianceQuantity).toBe(-10);
      expect(result.varianceValue).toBe(-25);
      expect(result.variancePercentage).toBe(-10); // -10%
    });

    it("computes matched as zero variance (Expected - Actual = 0)", () => {
      const result = computeVariance(100, 100, 2.5);
      expect(result.varianceQuantity).toBe(0);
      expect(result.varianceValue).toBe(0);
      expect(result.variancePercentage).toBe(0);
    });

    it("returns null for variance percentage when expected inventory is zero or negative", () => {
      const result = computeVariance(0, 5, 2.5);
      expect(result.varianceQuantity).toBe(-5);
      expect(result.varianceValue).toBe(-12.5);
      expect(result.variancePercentage).toBeNull();
    });
  });
});
