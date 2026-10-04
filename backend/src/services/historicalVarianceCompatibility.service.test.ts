import { describe, expect, it, vi } from "vitest";
import { computeVariance } from "./inventoryCalculation.service.js";
import {
  applyHistoricalVarianceSignCompatibility,
  HISTORICAL_VARIANCE_TARGETS,
} from "./historicalVarianceCompatibility.service.js";

const owner = { id: "owner-id", role: "OWNER" as const, branchId: null };
const rows = HISTORICAL_VARIANCE_TARGETS.map((target, index) => ({
  countId: `count-${index}`,
  countNo: target.countNo,
  branchId: `branch-${index}`,
  isTestData: false,
  countItemId: `item-${index}`,
  inventoryItemId: `inventory-${index}`,
  sku: target.sku,
  expectedQuantity: target.expectedQuantity,
  actualQuantity: target.actualQuantity,
  varianceQuantity: target.previousVarianceQuantity,
  varianceValue: index === 0 ? -214.84 : -0.0064,
  unit: index === 0 ? "g" : "ml",
  voidedAt: null,
}));

function compatibleClient(targetRows = rows, legacyIds = rows.map((row) => row.countItemId)) {
  const query = vi.fn(async (statement: unknown, params?: unknown[]) => {
    const sql = String(statement);
    if (sql.includes("FOR UPDATE OF ic,ici")) return { rows: targetRows };
    if (sql.includes("Operational legacy-sign") || sql.includes("abs(ici.variance_quantity")) {
      return { rows: legacyIds.map((countItemId) => ({ countItemId })) };
    }
    if (sql.includes("UPDATE inventory_count_items")) {
      const source = targetRows.find((row) => row.countItemId === params?.[0])!;
      return { rows: [{
        varianceQuantity: params?.[1], expectedQuantity: source.expectedQuantity,
        actualQuantity: source.actualQuantity, varianceValue: source.varianceValue,
      }] };
    }
    if (sql.includes("INSERT INTO audit_logs")) return { rows: [] };
    throw new Error(`Unexpected query: ${sql}`);
  });
  return { query };
}

describe("historical physical-count variance compatibility", () => {
  it("uses Actual minus Expected for both approved legacy values", () => {
    expect(computeVariance(388, 126, 0.82).varianceQuantity).toBe(-262);
    expect(computeVariance(20_000, 19_999.98, 0.32).varianceQuantity).toBeCloseTo(-0.02, 8);
  });

  it("preserves the current positive-excess and negative-shortage convention", () => {
    expect(computeVariance(100, 110, 1).varianceQuantity).toBe(10);
    expect(computeVariance(100, 90, 1).varianceQuantity).toBe(-10);
  });

  it("updates only the two proven rows and appends an audit record for each", async () => {
    const client = compatibleClient();
    const corrected = await applyHistoricalVarianceSignCompatibility(client as never, owner);
    const updates = client.query.mock.calls.filter(([sql]) => String(sql).includes("UPDATE inventory_count_items"));
    const audits = client.query.mock.calls.filter(([sql]) => String(sql).includes("INSERT INTO audit_logs"));

    expect(corrected.map((row) => row.correctedVarianceQuantity)).toEqual([-262, -0.02]);
    expect(updates.map(([, params]) => params?.slice(0, 2))).toEqual([["item-0", -262], ["item-1", -0.02]]);
    expect(audits).toHaveLength(2);
    expect(audits.every(([, params]) => params?.[2] === "HISTORICAL_VARIANCE_SIGN_COMPATIBILITY")).toBe(true);
    expect(audits.every(([, params]) => JSON.stringify(params?.[6]).includes("EXPECTED_MINUS_ACTUAL"))).toBe(true);
  });

  it("rejects test/UAT targets before any update", async () => {
    const client = compatibleClient([{ ...rows[0]!, isTestData: true }, rows[1]!]);
    await expect(applyHistoricalVarianceSignCompatibility(client as never, owner)).rejects.toThrow("Preflight mismatch");
    expect(client.query.mock.calls.some(([sql]) => String(sql).includes("UPDATE inventory_count_items"))).toBe(false);
  });

  it("rejects an unexpected or unaffected legacy row before any update", async () => {
    const client = compatibleClient(rows, [...rows.map((row) => row.countItemId), "unapproved-item"]);
    await expect(applyHistoricalVarianceSignCompatibility(client as never, owner)).rejects.toThrow("no longer match");
    expect(client.query.mock.calls.some(([sql]) => String(sql).includes("UPDATE inventory_count_items"))).toBe(false);
  });
});
