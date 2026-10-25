import { describe, expect, it, vi } from "vitest";
import { assertOperationalInventoryBaselines } from "./inventoryBaseline.service.js";

describe("operational inventory baseline guard", () => {
  it("accepts all requested ingredients when an effective checkpoint exists", async () => {
    const query = vi.fn(async (_sql: string, _params?: unknown[]) => ({ rows: [] }));
    await expect(assertOperationalInventoryBaselines(
      { query } as never,
      "00000000-0000-4000-8000-000000000001",
      ["00000000-0000-4000-8000-000000000002"],
      "2026-10-25",
      "POS import",
    )).resolves.toBeUndefined();
    expect(String(query.mock.calls[0]?.[0])).toContain("baseline.effective_at AT TIME ZONE 'Asia/Manila'");
  });

  it("rejects the whole stock-affecting operation when an ingredient has no effective baseline", async () => {
    const query = vi.fn(async (_sql: string, _params?: unknown[]) => ({ rows: [{ sku: "ING-99", name: "Oat Milk" }] }));
    await expect(assertOperationalInventoryBaselines(
      { query } as never,
      "00000000-0000-4000-8000-000000000001",
      ["00000000-0000-4000-8000-000000000002"],
      "2026-10-25",
      "Purchase-order receiving",
    )).rejects.toMatchObject({ code: "INVENTORY_BASELINE_REQUIRED", status: 409 });
  });

  it("deduplicates ingredient IDs before checking", async () => {
    const query = vi.fn(async (_sql: string, _params?: unknown[]) => ({ rows: [] }));
    await assertOperationalInventoryBaselines(
      { query } as never,
      "00000000-0000-4000-8000-000000000001",
      ["00000000-0000-4000-8000-000000000002", "00000000-0000-4000-8000-000000000002"],
      "2026-10-25",
      "Inventory adjustment",
    );
    expect(query.mock.calls[0]?.[1]?.[1]).toEqual(["00000000-0000-4000-8000-000000000002"]);
  });
});
