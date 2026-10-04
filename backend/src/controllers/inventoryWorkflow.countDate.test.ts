import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  poolQuery: vi.fn(),
  poolConnect: vi.fn(),
}));

vi.mock("../config/database.js", () => ({
  pool: {
    query: mocks.poolQuery,
    connect: mocks.poolConnect,
  },
}));

vi.mock("../services/businessTime.service.js", () => ({
  manilaBusinessDate: () => "2026-10-01",
}));

import {
  assertInventoryCountDateNotFuture,
  getExpectedInventory,
  submitInventoryCount,
  updateInventoryCount,
} from "./inventoryWorkflow.controller.js";

const branchId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const countId = "33333333-3333-4333-8333-333333333333";
const inventoryItemId = "44444444-4444-4444-8444-444444444444";

const user = { id: userId, role: "BRANCH_MANAGER", branchId };
const countBody = (countDate: string) => ({
  countDate,
  items: [{ inventoryItemId, quantity: 10, enteredUnit: "pc" }],
});

describe("inventory physical-count future-date protection", () => {
  beforeEach(() => vi.clearAllMocks());

  it("accepts the current Manila business date", () => {
    expect(() => assertInventoryCountDateNotFuture("2026-10-01")).not.toThrow();
  });

  it("rejects a future Manila business date", () => {
    expect(() => assertInventoryCountDateNotFuture("2026-10-02")).toThrowError(
      expect.objectContaining({ status: 422, code: "INVENTORY_COUNT_FUTURE_DATE" }),
    );
  });

  it("rejects a future date from expected-inventory lookup before database access", async () => {
    await expect(getExpectedInventory({
      query: { countDate: "2026-10-02" },
      user,
    } as never, { json: vi.fn() } as never, vi.fn())).rejects.toMatchObject({
      status: 422,
      code: "INVENTORY_COUNT_FUTURE_DATE",
    });
    expect(mocks.poolQuery).not.toHaveBeenCalled();
  });

  it("rejects a future date from count submission before opening a transaction", async () => {
    await expect(submitInventoryCount({
      body: countBody("2026-10-02"),
      user,
    } as never, { json: vi.fn() } as never, vi.fn())).rejects.toMatchObject({
      status: 422,
      code: "INVENTORY_COUNT_FUTURE_DATE",
    });
    expect(mocks.poolConnect).not.toHaveBeenCalled();
  });

  it("rejects a future date from count correction before opening a transaction", async () => {
    await expect(updateInventoryCount({
      params: { id: countId },
      body: countBody("2026-10-02"),
      user,
    } as never, { json: vi.fn() } as never, vi.fn())).rejects.toMatchObject({
      status: 422,
      code: "INVENTORY_COUNT_FUTURE_DATE",
    });
    expect(mocks.poolConnect).not.toHaveBeenCalled();
  });

  it("preserves duplicate-date validation for an allowed date", async () => {
    const client = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ absoluteTolerance: 1, relativeTolerance: 2 }] })
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ countNo: "IC-2026-00006" }] })
        .mockResolvedValueOnce({ rows: [] }),
      release: vi.fn(),
    };
    mocks.poolConnect.mockResolvedValue(client);

    await expect(submitInventoryCount({
      body: countBody("2026-10-01"),
      user,
    } as never, { status: vi.fn(), json: vi.fn() } as never, vi.fn())).rejects.toMatchObject({
      status: 409,
      code: "INVENTORY_COUNT_DUPLICATE",
    });
    expect(client.query).toHaveBeenCalledWith("ROLLBACK");
    expect(client.release).toHaveBeenCalledOnce();
  });
});
