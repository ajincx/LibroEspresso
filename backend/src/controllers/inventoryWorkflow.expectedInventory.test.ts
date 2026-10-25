import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  poolQuery: vi.fn(),
  calculateExpectedInventoryBatch: vi.fn(),
}));

vi.mock("../config/database.js", () => ({
  pool: { query: mocks.poolQuery },
}));

vi.mock("../services/inventoryCalculation.service.js", () => ({
  calculateExpectedInventoryBatch: mocks.calculateExpectedInventoryBatch,
}));

import { getExpectedInventory } from "./inventoryWorkflow.controller.js";

const branchId = "11111111-1111-4111-8111-111111111111";
const validItem = {
  id: "22222222-2222-4222-8222-222222222222",
  sku: "RM-002",
  name: "Espresso Blend Beans",
  unit: "g",
};
const noBaselineItem = {
  id: "33333333-3333-4333-8333-333333333333",
  sku: "ING-00073",
  name: "TEST_Oat Milk",
  unit: "ml",
};

describe("expected inventory partial baseline availability", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns valid countable items and isolates an item with no baseline", async () => {
    const expectedItem = {
      inventoryItemId: validItem.id,
      sku: validItem.sku,
      itemName: validItem.name,
      unit: validItem.unit,
      expectedQuantity: 5054,
    };
    mocks.calculateExpectedInventoryBatch.mockResolvedValueOnce({
      items: [expectedItem],
      unavailableItems: [{
        inventoryItemId: noBaselineItem.id,
        sku: noBaselineItem.sku,
        itemName: noBaselineItem.name,
        unit: noBaselineItem.unit,
        availability: "NO_BASELINE",
      }],
    });
    const json = vi.fn();

    await getExpectedInventory({
      query: { branchId, countDate: "2026-10-03" },
      user: { id: "owner", role: "OWNER", branchId: null },
    } as never, { json } as never, vi.fn());

    expect(json).toHaveBeenCalledWith({
      success: true,
      data: {
        branchId,
        countDate: "2026-10-03",
        items: [expectedItem],
        unavailableItems: [{
          inventoryItemId: noBaselineItem.id,
          sku: noBaselineItem.sku,
          itemName: noBaselineItem.name,
          unit: noBaselineItem.unit,
          availability: "NO_BASELINE",
        }],
      },
    });
  });

  it("does not hide unexpected calculation failures", async () => {
    mocks.calculateExpectedInventoryBatch.mockRejectedValueOnce(
      Object.assign(new Error("Calculation failed"), { code: "INVENTORY_CALCULATION_FAILED" }),
    );

    await expect(getExpectedInventory({
      query: { branchId, countDate: "2026-10-03" },
      user: { id: "owner", role: "OWNER", branchId: null },
    } as never, { json: vi.fn() } as never, vi.fn())).rejects.toMatchObject({
      code: "INVENTORY_CALCULATION_FAILED",
    });
  });

  it("prefills Opening from each ingredient's latest Closing or newer Full checkpoint", async () => {
    const expectedItem = {
      inventoryItemId: validItem.id,
      sku: validItem.sku,
      itemName: validItem.name,
      unit: validItem.unit,
      expectedQuantity: 5100,
    };
    mocks.calculateExpectedInventoryBatch.mockResolvedValueOnce({ items: [expectedItem], unavailableItems: [] });
    mocks.poolQuery.mockImplementation(async (statement: unknown) => {
      const sql = String(statement);
      if (sql.includes("count_type IN ('OPENING','CLOSING')")) return { rows: [] };
      if (sql.includes("DISTINCT ON (ici.inventory_item_id)")) return { rows: [{
        inventoryItemId: validItem.id,
        actualQuantity: 5100,
        countDate: "2026-10-02",
        countType: "FULL",
      }] };
      if (sql.includes("SELECT EXISTS")) return { rows: [{ complete: false }] };
      return { rows: [] };
    });
    const json = vi.fn();

    await getExpectedInventory({
      query: { branchId, countDate: "2026-10-03", countType: "OPENING" },
      user: { id: "owner", role: "OWNER", branchId: null },
    } as never, { json } as never, vi.fn());

    const checkpointQuery = String(mocks.poolQuery.mock.calls.find(([sql]) => String(sql).includes("DISTINCT ON"))?.[0]);
    expect(checkpointQuery).toContain("ic.count_type IN ('CLOSING','FULL')");
    expect(checkpointQuery).toContain("ici.voided_at IS NULL");
    expect(json).toHaveBeenCalledWith({
      success: true,
      data: expect.objectContaining({
        countType: "OPENING",
        previousClosingItems: [expect.objectContaining({ countType: "FULL", actualQuantity: 5100 })],
        previousClosingDate: "2026-10-02",
        previousClosingCountType: "FULL",
      }),
    });
  });
});
