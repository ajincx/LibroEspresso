import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../utils/appError.js";

const mocks = vi.hoisted(() => ({
  poolQuery: vi.fn(),
  calculateExpectedInventory: vi.fn(),
}));

vi.mock("../config/database.js", () => ({
  pool: { query: mocks.poolQuery },
}));

vi.mock("../services/inventoryCalculation.service.js", () => ({
  calculateExpectedInventory: mocks.calculateExpectedInventory,
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
    mocks.poolQuery.mockResolvedValue({ rows: [validItem, noBaselineItem] });
    const expectedItem = {
      inventoryItemId: validItem.id,
      sku: validItem.sku,
      itemName: validItem.name,
      unit: validItem.unit,
      expectedQuantity: 5054,
    };
    mocks.calculateExpectedInventory
      .mockResolvedValueOnce(expectedItem)
      .mockRejectedValueOnce(new AppError(
        422,
        "NO_VALID_HISTORICAL_BASELINE",
        "No inventory baseline exists",
      ));
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
    mocks.poolQuery.mockResolvedValue({ rows: [validItem] });
    mocks.calculateExpectedInventory.mockRejectedValueOnce(
      new AppError(500, "INVENTORY_CALCULATION_FAILED", "Calculation failed"),
    );

    await expect(getExpectedInventory({
      query: { branchId, countDate: "2026-10-03" },
      user: { id: "owner", role: "OWNER", branchId: null },
    } as never, { json: vi.fn() } as never, vi.fn())).rejects.toMatchObject({
      code: "INVENTORY_CALCULATION_FAILED",
    });
  });
});
