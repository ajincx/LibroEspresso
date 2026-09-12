import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./api";
import { inventoryWorkflowService } from "./inventoryWorkflow.service";

afterEach(() => vi.restoreAllMocks());

describe("POS preview and confirmation API workflow", () => {
  it("sends the untouched CSV to the backend preview endpoint", async () => {
    const csvText = 'product_name,quantity,price,date\n"Iced Latte, Large",2,190,2026-09-08';
    const preview = { contentHash: "a".repeat(64) };
    const post = vi.spyOn(api, "post").mockResolvedValue({
      data: { success: true, data: { preview } },
    });

    await expect(
      inventoryWorkflowService.previewPosSales({
        sourceFilename: "renamed-sales.csv",
        csvText,
      }),
    ).resolves.toBe(preview);
    expect(post).toHaveBeenCalledWith("/pos-sales/preview", {
      sourceFilename: "renamed-sales.csv",
      csvText,
    });
  });

  it("confirms the same raw CSV using its preview fingerprint", async () => {
    const input = {
      sourceFilename: "sales.csv",
      csvText: "product_code,quantity,price,date\nLATTE-L,1,190,2026-09-08",
      expectedContentHash: "b".repeat(64),
    };
    const imported = { importId: "import-1", rowsImported: 1 };
    const post = vi.spyOn(api, "post").mockResolvedValue({
      data: { success: true, data: imported },
    });

    await expect(inventoryWorkflowService.importPosSales(input)).resolves.toBe(imported);
    expect(post).toHaveBeenCalledWith("/pos-sales/import", input);
  });
});

describe("notification API workflow", () => {
  it("marks all notifications with one backend request", async () => {
    const patch = vi.spyOn(api, "patch").mockResolvedValue({ data: { success: true } });
    await inventoryWorkflowService.markAllNotificationsRead();
    expect(patch).toHaveBeenCalledOnce();
    expect(patch).toHaveBeenCalledWith("/notifications/read-all");
  });
});
