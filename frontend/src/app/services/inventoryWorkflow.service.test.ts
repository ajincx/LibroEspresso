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
      approvalId: "approval-1",
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
    await expect(inventoryWorkflowService.previewPosSales({ sourceFilename: file.name, file })).resolves.toBe(preview);
    expect(post).toHaveBeenCalledWith("/pos-sales/preview", file, { headers: {
      "Content-Type": "application/octet-stream",
      "X-POS-Filename": "renamed.xlsx",
    } });
  });

  it("confirms Excel using the preview fingerprint header without converting file contents", async () => {
    const file = new File([new Uint8Array([0xd0, 0xcf, 0x11, 0xe0])], "sales.xls");
    const expectedContentHash = "d".repeat(64);
    const imported = { importId: "import-2", rowsImported: 2 };
    const post = vi.spyOn(api, "post").mockResolvedValue({ data: { success: true, data: imported } });
    await expect(inventoryWorkflowService.importPosSales({ sourceFilename: file.name, file, expectedContentHash,approvalId:"approval-1" })).resolves.toBe(imported);
    expect(post).toHaveBeenCalledWith("/pos-sales/import", file, { headers: {
      "Content-Type": "application/octet-stream",
      "X-POS-Filename": "sales.xls",
      "X-POS-Content-Hash": expectedContentHash,
      "X-POS-Approval-Id": "approval-1",
    } });
  });

  it("sends the selected verified source and resolution fingerprint for Excel", async () => {
    const file = new File([new Uint8Array([0xd0, 0xcf, 0x11, 0xe0])], "sales.xls");
    const post = vi.spyOn(api, "post").mockResolvedValue({ data: { success: true, data: { preview: {} } } });
    await inventoryWorkflowService.previewPosSales({ sourceFilename: file.name, file, posSourceId: "source-1" });
    expect(post).toHaveBeenLastCalledWith("/pos-sales/preview", file, { headers: expect.objectContaining({ "X-POS-Source-Id": "source-1" }) });
    await inventoryWorkflowService.importPosSales({ sourceFilename: file.name, file, posSourceId: "source-1", expectedContentHash: "a".repeat(64), expectedResolutionFingerprint: "b".repeat(64),approvalId:"approval-1" });
    expect(post).toHaveBeenLastCalledWith("/pos-sales/import", file, { headers: expect.objectContaining({ "X-POS-Source-Id": "source-1", "X-POS-Resolution-Fingerprint": "b".repeat(64),"X-POS-Approval-Id":"approval-1" }) });
  });
});

describe("POS first-run review API workflow", () => {
  it("requests and reviews an immutable import approval",async()=>{
    const post=vi.spyOn(api,"post").mockResolvedValue({data:{success:true,data:{approval:{id:"approval-1",status:"PENDING"}}}});
    const patch=vi.spyOn(api,"patch").mockResolvedValue({data:{success:true,data:{approval:{id:"approval-1",status:"APPROVED"}}}});
    await inventoryWorkflowService.requestPosImportApproval({sourceFilename:"sales.csv",csvText:"product_code,quantity_sold,selling_price,business_date\nA,1,10,2026-09-25"});
    await inventoryWorkflowService.reviewPosImportApproval("approval-1","APPROVED","Totals and mappings verified");
    expect(post).toHaveBeenCalledWith("/pos-sales/approvals",expect.objectContaining({sourceFilename:"sales.csv"}));
    expect(patch).toHaveBeenCalledWith("/pos-sales/approvals/approval-1",{status:"APPROVED",approvalNotes:"Totals and mappings verified"});
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
});

describe("notification API workflow", () => {
  it("marks all notifications with one backend request", async () => {
    const patch = vi.spyOn(api, "patch").mockResolvedValue({ data: { success: true } });
    await inventoryWorkflowService.markAllNotificationsRead();
    expect(patch).toHaveBeenCalledOnce();
    expect(patch).toHaveBeenCalledWith("/notifications/read-all");
  });
});
