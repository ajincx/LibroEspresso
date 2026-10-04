import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ poolQuery: vi.fn() }));
vi.mock("../config/database.js", () => ({
  pool: { query: mocks.poolQuery, connect: vi.fn() },
}));

import { listMenuProducts, sameIngredientIdentitySet } from "./catalog.controller.js";

describe("menu product listing", () => {
  it("returns newly created products first without changing stored records", async () => {
    mocks.poolQuery.mockResolvedValueOnce({ rows: [] });
    const req = {
      user: {
        id: "00000000-0000-4000-8000-000000000001",
        role: "OWNER",
        branchId: null,
      },
    } as never;
    const res = { json: vi.fn() };

    await listMenuProducts(req, res as never, vi.fn());

    expect(String(mocks.poolQuery.mock.calls[0]?.[0])).toContain(
      "ORDER BY m.created_at DESC,m.name",
    );
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { products: [] },
    });
  });
});

describe("Small/Large recipe ingredient consistency",()=>{
  it("accepts the same pending TEST_Oat Milk identity with different quantities handled outside the identity set",()=>{
    expect(sameIngredientIdentitySet(["beans-id","oat-milk-id"],["oat-milk-id","beans-id"])).toBe(true);
  });
  it("rejects a missing pending ingredient identity",()=>{
    expect(sameIngredientIdentitySet(["beans-id","oat-milk-id"],["beans-id"])).toBe(false);
  });
});
