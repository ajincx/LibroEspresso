import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./api";
import { inventoryWorkflowService } from "./inventoryWorkflow.service";

afterEach(() => vi.restoreAllMocks());

describe("physical-count baseline availability", () => {
  it("preserves valid items and the non-countable No Baseline list", async () => {
    const data = {
      branchId: "branch-1",
      countDate: "2026-10-03",
      items: [{ inventoryItemId: "espresso", sku: "RM-002" }],
      unavailableItems: [{
        inventoryItemId: "test-oat",
        sku: "ING-00073",
        itemName: "TEST_Oat Milk",
        unit: "ml",
        availability: "NO_BASELINE",
      }],
    };
    const get = vi.spyOn(api, "get").mockResolvedValue({
      data: { success: true, data },
    });

    await expect(inventoryWorkflowService.expected("2026-10-03", "branch-1"))
      .resolves.toBe(data);
    expect(get).toHaveBeenCalledWith("/inventory-counts/expected", {
      params: { countDate: "2026-10-03", branchId: "branch-1" },
    });
  });

  it("submits the entered quantity and unit without frontend canonicalization", async () => {
    const post = vi.spyOn(api, "post").mockResolvedValue({
      data: { success: true, data: { count: { id: "count-1" } } },
    });
    const items = [{
      inventoryItemId: "espresso",
      quantity: 3.864,
      enteredUnit: "kg" as const,
    }];

    await inventoryWorkflowService.submitCount("2026-10-03", items);
    expect(post).toHaveBeenCalledWith("/inventory-counts", {
      countDate: "2026-10-03",
      items,
    });
  });
});

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
        posSourceId: "source-1",
      }),
    ).resolves.toBe(preview);
    expect(post).toHaveBeenCalledWith("/pos-sales/preview", {
      sourceFilename: "renamed-sales.csv",
      csvText,
      posSourceId: "source-1",
    });
  });

  it("confirms the same raw CSV using its preview fingerprint", async () => {
    const input = {
      sourceFilename: "sales.csv",
      csvText: "product_code,quantity,price,date\nLATTE-L,1,190,2026-09-08",
      expectedContentHash: "b".repeat(64),
      expectedResolutionFingerprint: "c".repeat(64),
      posSourceId: "source-1",
    };
    const imported = { importId: "import-1", rowsImported: 1 };
    const post = vi.spyOn(api, "post").mockResolvedValue({
      data: { success: true, data: imported },
    });

    await expect(inventoryWorkflowService.importPosSales(input)).resolves.toBe(imported);
    expect(post).toHaveBeenCalledWith("/pos-sales/import", input);
  });

  it("sends original Excel bytes with format metadata for preview", async () => {
    const file = new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04])], "renamed.xlsx");
    const preview = { contentHash: "c".repeat(64) };
    const post = vi.spyOn(api, "post").mockResolvedValue({ data: { success: true, data: { preview } } });
    await expect(inventoryWorkflowService.previewPosSales({ sourceFilename: file.name, file, posSourceId: "source-1" })).resolves.toBe(preview);
    expect(post).toHaveBeenCalledWith("/pos-sales/preview", file, { headers: {
      "Content-Type": "application/octet-stream",
      "X-POS-Filename": "renamed.xlsx",
      "X-POS-Source-Id": "source-1",
    } });
  });

  it("confirms Excel using the preview fingerprint header without converting file contents", async () => {
    const file = new File([new Uint8Array([0xd0, 0xcf, 0x11, 0xe0])], "sales.xls");
    const expectedContentHash = "d".repeat(64);
    const imported = { importId: "import-2", rowsImported: 2 };
    const post = vi.spyOn(api, "post").mockResolvedValue({ data: { success: true, data: imported } });
    await expect(inventoryWorkflowService.importPosSales({ sourceFilename: file.name, file, posSourceId: "source-1", expectedContentHash, expectedResolutionFingerprint: "e".repeat(64) })).resolves.toBe(imported);
    expect(post).toHaveBeenCalledWith("/pos-sales/import", file, { headers: {
      "Content-Type": "application/octet-stream",
      "X-POS-Filename": "sales.xls",
      "X-POS-Source-Id": "source-1",
      "X-POS-Content-Hash": expectedContentHash,
      "X-POS-Resolution-Fingerprint": "e".repeat(64),
    } });
  });

  it("sends the selected verified source and resolution fingerprint for Excel", async () => {
    const file = new File([new Uint8Array([0xd0, 0xcf, 0x11, 0xe0])], "sales.xls");
    const post = vi.spyOn(api, "post").mockResolvedValue({ data: { success: true, data: { preview: {} } } });
    await inventoryWorkflowService.previewPosSales({ sourceFilename: file.name, file, posSourceId: "source-1" });
    expect(post).toHaveBeenLastCalledWith("/pos-sales/preview", file, { headers: expect.objectContaining({ "X-POS-Source-Id": "source-1" }) });
    await inventoryWorkflowService.importPosSales({ sourceFilename: file.name, file, posSourceId: "source-1", expectedContentHash: "a".repeat(64), expectedResolutionFingerprint: "b".repeat(64) });
    expect(post).toHaveBeenLastCalledWith("/pos-sales/import", file, { headers: expect.objectContaining({ "X-POS-Source-Id": "source-1", "X-POS-Resolution-Fingerprint": "b".repeat(64) }) });
    expect(post.mock.calls.at(-1)?.[2]).not.toEqual(expect.objectContaining({ headers: expect.objectContaining({ "X-POS-Approval-Id": expect.anything() }) }));
  });
});

describe("POS first-run review API workflow", () => {
  it("copies mappings into a different source as pending review", async () => {
    const result={copied:54,skipped:0,eligible:54};
    const post=vi.spyOn(api,"post").mockResolvedValue({data:{success:true,data:result}});
    await expect(inventoryWorkflowService.copyPosMappings("legacy-source","transaction-source")).resolves.toEqual(result);
    expect(post).toHaveBeenCalledWith("/pos-sales/mappings/copy",{sourcePosSourceId:"legacy-source",targetPosSourceId:"transaction-source"});
  });

  it("sends explicit format confirmation when activating a source", async () => {
    const patch = vi.spyOn(api, "patch").mockResolvedValue({ data: { success: true, data: { source: {} } } });
    await inventoryWorkflowService.updatePosSource("source-1", {
      status: "ACTIVE",
      confirmedSupportedFormat: "TRANSACTION_SUMMARY_XLSX",
    });
    expect(patch).toHaveBeenCalledWith("/pos-sales/sources/source-1", {
      status: "ACTIVE",
      confirmedSupportedFormat: "TRANSACTION_SUMMARY_XLSX",
    });
  });

  it("filters mappings by review status and submits a review decision", async () => {
    const get = vi.spyOn(api, "get").mockResolvedValue({ data: { success: true, data: { mappings: [] } } });
    const patch = vi.spyOn(api, "patch").mockResolvedValue({ data: { success: true, data: { id: "mapping-1", status: "INACTIVE", reviewStatus: "AMBIGUOUS" } } });
    await inventoryWorkflowService.posMappings("source-1", "PENDING");
    await inventoryWorkflowService.reviewPosMapping("mapping-1", "AMBIGUOUS", "Same POS name can refer to two products");
    expect(get).toHaveBeenCalledWith("/pos-sales/mappings", { params: { posSourceId: "source-1", reviewStatus: "PENDING" } });
    expect(patch).toHaveBeenCalledWith("/pos-sales/mappings/mapping-1", {
      reviewStatus: "AMBIGUOUS",
      reviewComment: "Same POS name can refer to two products",
    });
  });

  it("saves a Pending mapping revision and can deactivate an Approved mapping", async () => {
    const revised={id:"mapping-1",reviewStatus:"PENDING",status:"INACTIVE"};
    const put=vi.spyOn(api,"put").mockResolvedValue({data:{success:true,data:{mapping:revised}}});
    const post=vi.spyOn(api,"post").mockResolvedValue({data:{success:true,data:{mapping:{...revised,reviewStatus:"APPROVED"}}}});
    const input={branchId:null,sourceProductCode:"CAPP-H12",menuItemId:"product-capp",menuItemVariantId:"variant-standard",revisionReason:"Corrected target product"};
    await expect(inventoryWorkflowService.revisePendingPosMapping("mapping-1",input)).resolves.toBe(revised);
    expect(put).toHaveBeenCalledWith("/pos-sales/mappings/mapping-1",input);
    expect(revised.reviewStatus).toBe("PENDING");
    await inventoryWorkflowService.deactivatePosMapping("mapping-1");
    expect(post).toHaveBeenCalledWith("/pos-sales/mappings/mapping-1/deactivate");
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

describe("opening inventory baseline API workflow", () => {
  it("loads centralized baselines for the Owner and supports an explicit branch scope", async () => {
    const baselines = [{ id: "baseline-1", branchName: "Gulod / Main Branch", items: [] }];
    const get = vi.spyOn(api, "get").mockResolvedValue({ data: { success: true, data: { baselines } } });
    await expect(inventoryWorkflowService.openingBaselines()).resolves.toBe(baselines);
    expect(get).toHaveBeenLastCalledWith("/inventory-opening-baselines", { params: { branchId: undefined } });
    await inventoryWorkflowService.openingBaselines("branch-1");
    expect(get).toHaveBeenLastCalledWith("/inventory-opening-baselines", { params: { branchId: "branch-1" } });
  });
});
