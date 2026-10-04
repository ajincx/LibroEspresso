import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  poolConnect: vi.fn(),
  calculateExpectedInventory: vi.fn(),
  writeAudit: vi.fn(),
  requiresVarianceInvestigation: vi.fn(() => false),
}));

vi.mock("../config/database.js", () => ({
  pool: { query: vi.fn(), connect: mocks.poolConnect },
}));
vi.mock("../services/inventoryCalculation.service.js", () => ({
  calculateExpectedInventory: mocks.calculateExpectedInventory,
  computeVariance: (expectedQuantity: number, actualQuantity: number, unitCost: number) => {
    const varianceQuantity = actualQuantity - expectedQuantity;
    return {
      varianceQuantity,
      varianceValue: varianceQuantity * unitCost,
      variancePercentage: expectedQuantity > 0 ? varianceQuantity / expectedQuantity * 100 : null,
    };
  },
}));
vi.mock("../services/audit.service.js", () => ({
  writeAudit: mocks.writeAudit,
}));
vi.mock("../services/varianceMateriality.service.js", () => ({
  requiresVarianceInvestigation: mocks.requiresVarianceInvestigation,
}));

import { submitInventoryCount } from "./inventoryWorkflow.controller.js";

const branchId = "11111111-1111-4111-8111-111111111111";
const inventoryItemId = "22222222-2222-4222-8222-222222222222";
const countId = "33333333-3333-4333-8333-333333333333";

function transactionClient() {
  const query = vi.fn(async (sql: string, params?: unknown[]) => {
    if (sql.includes("FROM calculation_settings")) {
      return { rows: [{ absoluteTolerance: 1, relativeTolerance: 2 }] };
    }
    if (sql.includes("SELECT count_no") && sql.includes("inventory_counts")) {
      return { rowCount: 0, rows: [] };
    }
    if (sql.includes("nextval('inventory_count_number_seq')")) {
      return { rows: [{ countNo: "IC-2026-00010" }] };
    }
    if (sql.includes("INSERT INTO inventory_counts")) {
      return { rows: [{ id: countId, countNo: "IC-2026-00010" }] };
    }
    if (sql.includes("INSERT INTO inventory_count_items")) {
      return {
        rows: [{
          id: "44444444-4444-4444-8444-444444444444",
          inventoryItemId,
          expectedQuantity: 3864,
          actualQuantity: params?.[7],
          varianceQuantity: params?.[8],
          varianceValue: params?.[9],
          variancePercentage: 0,
          unit: "g",
        }],
      };
    }
    return { rowCount: 1, rows: [] };
  });
  return { query, release: vi.fn() };
}

describe("physical-count API unit normalization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.calculateExpectedInventory.mockResolvedValue({
      inventoryItemId,
      sku: "RM-002",
      itemName: "Espresso Blend Beans",
      unit: "g",
      unitCost: 0.82,
      previousActualQuantity: 4500,
      stockReceived: 0,
      expectedConsumption: 636,
      approvedAdjustments: 0,
      expectedQuantity: 3864,
      baselineDate: "2026-09-16",
      baselineSource: "OPENING_BASELINE",
    });
  });

  it("normalizes 3.864 kg to 3864 g for variance, persistence, and balance reset", async () => {
    const client = transactionClient();
    mocks.poolConnect.mockResolvedValue(client);
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));

    await submitInventoryCount({
      body: {
        countDate: "2026-10-03",
        items: [{ inventoryItemId, quantity: 3.864, enteredUnit: "kg" }],
      },
      user: { id: "manager", role: "BRANCH_MANAGER", branchId },
    } as never, { status } as never, vi.fn());

    const countItemInsert = client.query.mock.calls.find(([sql]) =>
      String(sql).includes("INSERT INTO inventory_count_items"));
    const balanceUpsert = client.query.mock.calls.find(([sql]) =>
      String(sql).includes("INSERT INTO branch_inventory_balances"));
    expect(countItemInsert?.[1]?.[7]).toBe(3864);
    expect(countItemInsert?.[1]?.[8]).toBe(0);
    expect(balanceUpsert?.[1]?.[2]).toBe(3864);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({
      data: { count: expect.objectContaining({
        items: [expect.objectContaining({ actualQuantity: 3864, varianceQuantity: 0, unit: "g" })],
      }) },
    }));
    expect(client.query).toHaveBeenCalledWith("COMMIT");
  });

  it.each([
    [5000, -54],
    [5100, 46],
    [5054, 0],
  ])("persists Actual minus Expected variance for actual %s", async (actualQuantity, expectedVariance) => {
    mocks.calculateExpectedInventory.mockResolvedValueOnce({
      inventoryItemId,
      sku: "RM-002",
      itemName: "Espresso Blend Beans",
      unit: "g",
      unitCost: 0.82,
      previousActualQuantity: 5750,
      stockReceived: 0,
      expectedConsumption: 696,
      approvedAdjustments: 0,
      expectedQuantity: 5054,
      baselineDate: "2026-09-16",
      baselineSource: "OPENING_BASELINE",
    });
    const client = transactionClient();
    mocks.poolConnect.mockResolvedValue(client);
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));

    await submitInventoryCount({
      body: { countDate: "2026-10-03", items: [{ inventoryItemId, quantity: actualQuantity, enteredUnit: "g" }] },
      user: { id: "manager", role: "BRANCH_MANAGER", branchId },
    } as never, { status } as never, vi.fn());

    const countItemInsert = client.query.mock.calls.find(([sql]) => String(sql).includes("INSERT INTO inventory_count_items"));
    expect(countItemInsert?.[1]?.[8]).toBe(expectedVariance);
  });

  it("rejects an incompatible entered unit and rolls back the transaction", async () => {
    const client = transactionClient();
    mocks.poolConnect.mockResolvedValue(client);

    await expect(submitInventoryCount({
      body: {
        countDate: "2026-10-03",
        items: [{ inventoryItemId, quantity: 3, enteredUnit: "L" }],
      },
      user: { id: "manager", role: "BRANCH_MANAGER", branchId },
    } as never, { status: vi.fn(), json: vi.fn() } as never, vi.fn())).rejects.toMatchObject({
      status: 422,
      code: "INVENTORY_COUNT_UNIT_INCOMPATIBLE",
    });
    expect(client.query).toHaveBeenCalledWith("ROLLBACK");
    expect(client.query.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO inventory_count_items"))).toBe(false);
  });
});
