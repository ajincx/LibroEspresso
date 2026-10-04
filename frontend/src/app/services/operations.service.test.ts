import { describe, expect, it, vi } from "vitest";
import { api } from "./api";
import { operationsService } from "./operations.service";

describe("operations inventory stock ledger", () => {
  it("requests read-only stock details for the selected item and branch", async () => {
    const ledger = { inventoryItemId: "item-1", branchId: "branch-1", activities: [] };
    const get = vi.spyOn(api, "get").mockResolvedValue({ data: { data: { ledger } } });

    await expect(operationsService.inventoryStockLedger("item-1", "branch-1")).resolves.toBe(ledger);
    expect(get).toHaveBeenCalledWith("/inventory-overview/item-1/ledger", { params: { branchId: "branch-1" } });
    get.mockRestore();
  });
});
