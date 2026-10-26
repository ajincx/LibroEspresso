import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  poolConnect: vi.fn(),
  calculateExpectedInventory: vi.fn(),
  calculateExpectedInventoryBatch: vi.fn(),
  writeAudit: vi.fn(),
  requiresVarianceInvestigation: vi.fn(() => false),
}));

vi.mock("../config/database.js", () => ({
  pool: { query: vi.fn(), connect: mocks.poolConnect },
}));
vi.mock("../services/inventoryCalculation.service.js", () => ({
  calculateExpectedInventory: mocks.calculateExpectedInventory,
  calculateExpectedInventoryBatch: mocks.calculateExpectedInventoryBatch,
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

function transactionClient(options: { existingCounts?: Array<{ countNo: string; countType: string }>; posComplete?: boolean; weeklyFullCount?: number } = {}) {
  const query = vi.fn(async (sql: string, params?: unknown[]) => {
    if (sql.includes("FROM calculation_settings")) {
      return { rows: [{ absoluteTolerance: 1, relativeTolerance: 2 }] };
    }
    if (sql.includes("SELECT count_no") && sql.includes("inventory_counts")) {
      return { rowCount: options.existingCounts?.length ?? 0, rows: options.existingCounts ?? [] };
    }
    if (sql.includes("FROM pos_daily_declarations")) {
      return { rowCount: options.posComplete ? 1 : 0, rows: options.posComplete ? [{ complete: true }] : [] };
    }
    if (sql.includes('count(*)::int "count"') && sql.includes("ic.count_type='FULL'")) {
      return { rows: [{ count: options.weeklyFullCount ?? 0 }] };
    }
    if (sql.includes("nextval('inventory_count_number_seq')")) {
      return { rows: [{ countNo: "IC-2026-00010" }] };
    }
    if (sql.includes("INSERT INTO inventory_counts")) {
      return { rows: [{ id: countId, countNo: "IC-2026-00010" }] };
    }
    if (sql.includes("nextval('shrinkage_report_number_seq')")) {
      return { rows: [{ reportNo: "SR-2026-00010" }] };
    }
    if (sql.includes("INSERT INTO shrinkage_reports")) {
      return { rows: [{ id: "55555555-5555-4555-8555-555555555555" }] };
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
    mocks.calculateExpectedInventory.mockReset();
    mocks.calculateExpectedInventoryBatch.mockReset();
    mocks.requiresVarianceInvestigation.mockReset();
    mocks.requiresVarianceInvestigation.mockReturnValue(false);
    mocks.calculateExpectedInventoryBatch.mockResolvedValue({
      items: [{ inventoryItemId, sku: "RM-002" }],
      unavailableItems: [],
    });
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
    const client = transactionClient({ existingCounts: [{ countNo: "IC-2026-00009", countType: "CLOSING" }] });
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
    const client = transactionClient({ existingCounts: [{ countNo: "IC-2026-00009", countType: "CLOSING" }] });
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
    const client = transactionClient({ existingCounts: [{ countNo: "IC-2026-00009", countType: "CLOSING" }] });
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

  it("preserves the Opening snapshot without creating a shrinkage investigation", async () => {
    mocks.calculateExpectedInventory.mockResolvedValueOnce({
      inventoryItemId,
      sku: "RM-002",
      itemName: "Espresso Blend Beans",
      unit: "g",
      unitCost: 0.82,
      previousActualQuantity: 5000,
      stockReceived: 0,
      expectedConsumption: 0,
      approvedAdjustments: 0,
      expectedQuantity: 5000,
      baselineDate: "2026-10-02",
      baselineSource: "DAILY_CLOSING",
    });
    mocks.requiresVarianceInvestigation.mockReturnValue(true);
    const client = transactionClient();
    mocks.poolConnect.mockResolvedValue(client);
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));

    await submitInventoryCount({
      body: { countDate: "2026-10-03", countType: "OPENING", items: [{ inventoryItemId, quantity: 4800, enteredUnit: "g" }] },
      user: { id: "manager", role: "BRANCH_MANAGER", branchId },
    } as never, { status } as never, vi.fn());

    const countItemInsert = client.query.mock.calls.find(([sql]) => String(sql).includes("INSERT INTO inventory_count_items"));
    expect(countItemInsert?.[1]?.[6]).toBe(5000);
    expect(countItemInsert?.[1]?.[7]).toBe(4800);
    expect(countItemInsert?.[1]?.[8]).toBe(-200);
    expect(client.query.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO shrinkage_reports"))).toBe(false);
    expect(mocks.requiresVarianceInvestigation).not.toHaveBeenCalled();
    expect(json).toHaveBeenCalledWith(expect.objectContaining({
      data: { count: expect.objectContaining({
        items: [expect.objectContaining({ actualQuantity: 4800, varianceQuantity: -200, requiresInvestigation: false })],
      }) },
    }));
  });

  it.each([
    ["FULL" as const, transactionClient({ existingCounts: [{ countNo: "IC-2026-00009", countType: "CLOSING" }] })],
    ["CLOSING" as const, transactionClient({ existingCounts: [{ countNo: "IC-2026-00009", countType: "OPENING" }], posComplete: true })],
  ])("continues creating shrinkage investigations for %s counts", async (countType, client) => {
    mocks.requiresVarianceInvestigation.mockReturnValue(true);
    mocks.poolConnect.mockResolvedValue(client);
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));

    await submitInventoryCount({
      body: { countDate: "2026-10-03", countType, items: [{ inventoryItemId, quantity: 3700, enteredUnit: "g" }] },
      user: { id: "manager", role: "BRANCH_MANAGER", branchId },
    } as never, { status } as never, vi.fn());

    expect(client.query.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO shrinkage_reports"))).toBe(true);
    if(countType==="CLOSING"){
      const completenessSql=String(client.query.mock.calls.find(([sql])=>String(sql).includes("FROM pos_daily_declarations"))?.[0]);
      expect(completenessSql).toContain("declaration.invalidated_at IS NULL");
      expect(completenessSql).toContain("imported.voided_at IS NULL");
    }
    expect(mocks.requiresVarianceInvestigation).toHaveBeenCalled();
    expect(json).toHaveBeenCalledWith(expect.objectContaining({
      data: { count: expect.objectContaining({
        items: [expect.objectContaining({ requiresInvestigation: true })],
      }) },
    }));
  });

  it.each([
    ["CLOSING" as const, [], "OPENING_COUNT_REQUIRED"],
    ["FULL" as const, [{ countNo: "IC-OPEN", countType: "OPENING" }], "CLOSING_COUNT_REQUIRED"],
    ["CLOSING" as const, [{ countNo: "IC-OPEN", countType: "OPENING" }, { countNo: "IC-FULL", countType: "FULL" }], "CLOSING_COUNT_AFTER_FULL"],
    ["OPENING" as const, [{ countNo: "IC-CLOSE", countType: "CLOSING" }], "OPENING_COUNT_SEQUENCE_INVALID"],
  ])("rejects invalid same-day %s sequencing with %s", async (countType, existingCounts, code) => {
    const client = transactionClient({ existingCounts, posComplete: true });
    mocks.poolConnect.mockResolvedValue(client);

    await expect(submitInventoryCount({
      body: { countDate: "2026-10-03", countType, items: [{ inventoryItemId, quantity: 3700, enteredUnit: "g" }] },
      user: { id: "manager", role: "BRANCH_MANAGER", branchId },
    } as never, { status: vi.fn(), json: vi.fn() } as never, vi.fn())).rejects.toMatchObject({ status: 409, code });

    expect(client.query.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO inventory_counts"))).toBe(false);
    expect(client.query).toHaveBeenCalledWith("ROLLBACK");
  });

  it("rejects only a duplicate of the requested count type", async () => {
    const client = transactionClient({ existingCounts: [
      { countNo: "IC-OPEN", countType: "OPENING" },
      { countNo: "IC-CLOSE", countType: "CLOSING" },
      { countNo: "IC-FULL", countType: "FULL" },
    ] });
    mocks.poolConnect.mockResolvedValue(client);

    await expect(submitInventoryCount({
      body: { countDate: "2026-10-03", countType: "FULL", items: [{ inventoryItemId, quantity: 3700, enteredUnit: "g" }] },
      user: { id: "manager", role: "BRANCH_MANAGER", branchId },
    } as never, { status: vi.fn(), json: vi.fn() } as never, vi.fn())).rejects.toMatchObject({
      status: 409,
      code: "INVENTORY_COUNT_DUPLICATE",
    });
  });

  it("rejects the fourth valid Full Count in the same Manila Monday-Sunday week", async () => {
    const client = transactionClient({
      existingCounts: [{ countNo: "IC-CLOSE", countType: "CLOSING" }],
      weeklyFullCount: 3,
    });
    mocks.poolConnect.mockResolvedValue(client);

    await expect(submitInventoryCount({
      body: { countDate: "2026-10-23", countType: "FULL", items: [{ inventoryItemId, quantity: 3700, enteredUnit: "g" }] },
      user: { id: "manager", role: "BRANCH_MANAGER", branchId },
    } as never, { status: vi.fn(), json: vi.fn() } as never, vi.fn())).rejects.toMatchObject({
      status: 409,
      code: "FULL_COUNT_WEEKLY_LIMIT_REACHED",
    });

    const guard = client.query.mock.calls.find(([sql]) => String(sql).includes('count(*)::int "count"'));
    expect(String(guard?.[0])).toContain("date_trunc('week',$2::date)");
    expect(String(guard?.[0])).toContain("invalid_item.voided_at IS NOT NULL");
    expect(guard?.[1]).toEqual([branchId,"2026-10-23"]);
    expect(client.query.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO inventory_counts"))).toBe(false);
    expect(client.query).toHaveBeenCalledWith("ROLLBACK");
  });

  it("allows the third valid Full Count and checks the new week independently", async () => {
    const third = transactionClient({ existingCounts: [{ countNo: "IC-CLOSE", countType: "CLOSING" }], weeklyFullCount: 2 });
    mocks.poolConnect.mockResolvedValueOnce(third);
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));

    await submitInventoryCount({
      body: { countDate: "2026-10-25", countType: "FULL", items: [{ inventoryItemId, quantity: 3864, enteredUnit: "g" }] },
      user: { id: "manager", role: "BRANCH_MANAGER", branchId },
    } as never, { status } as never, vi.fn());
    expect(third.query).toHaveBeenCalledWith("COMMIT");

    const nextWeek = transactionClient({ existingCounts: [{ countNo: "IC-CLOSE-2", countType: "CLOSING" }], weeklyFullCount: 0 });
    mocks.poolConnect.mockResolvedValueOnce(nextWeek);
    await submitInventoryCount({
      body: { countDate: "2026-10-26", countType: "FULL", items: [{ inventoryItemId, quantity: 3864, enteredUnit: "g" }] },
      user: { id: "manager", role: "BRANCH_MANAGER", branchId },
    } as never, { status } as never, vi.fn());
    expect(nextWeek.query).toHaveBeenCalledWith("COMMIT");
  });
});
