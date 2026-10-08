import { beforeEach, describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";
import { parsePosCsv } from "../services/posCsvImport.service.js";
import { parsePosExcel } from "../services/posExcelImport.service.js";
import { posResolutionFingerprint } from "../services/posProductVariantMapping.service.js";
import { AppError } from "../utils/appError.js";

const mocks = vi.hoisted(() => ({
  connect: vi.fn(),
  poolQuery: vi.fn(),
  writeAudit: vi.fn(),
  env: {NODE_ENV:"test",DATA_LIFECYCLE_ENV:"DEVELOPMENT" as "DEVELOPMENT"|"UAT"|"PRODUCTION",BENCHMARK_MODE:false},
}));

vi.mock("../config/database.js", () => ({
  pool: { connect: mocks.connect, query: mocks.poolQuery },
}));
vi.mock("../services/audit.service.js", () => ({ writeAudit: mocks.writeAudit }));
vi.mock("../config/env.js",()=>({env:mocks.env}));

import { authorizePosImportCleanup, deletePosImport, importPosSales, listPosImportApprovals, listPosImports, previewPosSales, requestPosImportApproval, reviewPosImportApproval } from "./inventoryWorkflow.controller.js";

const branchId = "00000000-0000-4000-8000-000000000002";
const importId = "00000000-0000-4000-8000-000000000010";
const sourceId = "00000000-0000-4000-8000-000000000030";
const variantId = "00000000-0000-4000-8000-000000000031";
const approvalId = "00000000-0000-4000-8000-000000000032";
const mappingRow = { id: "map-1", status: "ACTIVE", branchId: null, sourceProductName: "Iced Latte, Large", sourceProductCode: null,
  menuItemVariantId: variantId, menuItemId: "menu-1", menuItemName: "Iced Latte, Large", variantName: "Standard", variantStatus: "ACTIVE",
  productStatus: "ACTIVE", approvalStatus: "APPROVED", branchAvailable: true, recipeValid: true, updatedAt: "2026-09-16T00:00:00Z" };
const csvText =
  "product_code,quantity_sold,selling_price,business_date,transaction_id,line_id\nLATTE-L,2,190,2026-09-08,R-1,1";
const csvResolutionFingerprint = posResolutionFingerprint(sourceId, [{
  itemClassification: "SELLABLE_ITEM", menuItemId: "menu-1", menuItemVariantId: variantId,
  mappingId: "map-1", mappingVersion: `map-1:${mappingRow.updatedAt}`, recipeVersionId: "recipe-v1",
}]);
const request = () =>
  ({
    body: {
      sourceFilename: "sales.csv",
      csvText,
      expectedContentHash: parsePosCsv(csvText).contentHash,
      expectedResolutionFingerprint: csvResolutionFingerprint,
      posSourceId: sourceId,
      branchId: "00000000-0000-4000-8000-000000000099",
    },
    user: { id: "manager-1", role: "BRANCH_MANAGER", branchId },
  }) as never;

function legacyExcelBuffer(productName = "Iced Latte, Large") {
  const row = (entries: Record<number, unknown>) => {
    const values: unknown[] = [];
    Object.entries(entries).forEach(([index, value]) => { values[Number(index)] = value; });
    return values;
  };
  const rows = [
    ["LIBRO ESPRESSO"], ["From: 09/08/2026 to 09/08/2026"], ["SUMMARY ITEMS SOLD"], ["---"],
    ["QTY", "DESCRIPTION", null, null, null, null, null, null, null, null, null, null, null, null, "AMOUNT"], ["---"],
    row({ 0: "DATE", 7: ":", 9: "09/08/2026" }), row({ 0: "O.R.#", 7: ":", 9: "OR-1" }),
    row({ 0: "TRXN.#", 7: ":", 9: "R-1" }), row({ 0: "TABLE NO:", 7: ":", 9: "T1" }),
    row({ 0: 2, 2: productName, 11: 190, 15: 380 }), row({ 0: 2, 12: 380 }),
    row({ 4: "TOTAL:", 14: 380 }),
  ];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), "Sheet1");
  return Buffer.from(XLSX.write(workbook, { type: "buffer", bookType: "xls" }));
}

function transactionSummaryBuffer() {
  const rows = [
    ["Store", "Machine ID", "OR No.", "Date", "Payment Time", "Item Name(s)", "Item Qty.", "Due Amt.", "Gross Amt.", "Status", "Voided by"],
    ["LIBRO ESPRESSO", "M-1", "OR-1", "2026-09-08 09:00:00", "2026-09-08 09:01:00", "Iced Latte, Largex2.0000", 2, 380, 380, "Paid", "--"],
    ["Total", null, null, null, null, null, 2, 380, 380],
  ];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), "Worksheet");
  return Buffer.from(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }));
}

function excelRequest(fileBuffer: Buffer, filename: string, expectedContentHash?: string, expectedResolutionFingerprint?: string, posSourceId?: string) {
  return ({
    body: fileBuffer,
    headers: {
      "x-pos-filename": encodeURIComponent(filename),
      ...(expectedContentHash ? { "x-pos-content-hash": expectedContentHash } : {}),
      ...(expectedResolutionFingerprint ? { "x-pos-resolution-fingerprint": expectedResolutionFingerprint } : {}),
      ...(posSourceId ? { "x-pos-source-id": posSourceId } : {}),
    },
    user: { id: "manager-1", role: "BRANCH_MANAGER", branchId },
  }) as never;
}

function response() {
  const res = { status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  return res;
}

const deleteRequest = (id=importId) => ({params:{id},body:{reason:"Reset an explicitly authorized development fixture",verificationPin:"12345"},user:{id:"owner-1",role:"OWNER",branchId:null}}) as never;

function createClient(failAt?: "sale" | "usage" | "concurrent-duplicate" | "reconciliation", mappingVersion?: string,
  variantRows?: Array<{id:string;menuItemId:string;name:string;status:"ACTIVE"|"INACTIVE";recipeVersionId:string|null;recipeUnits:Array<{recipeUnit:string;inventoryUnit:string}>}>,
  sourceFormat = "CANONICAL_CSV", lateHistorical = false) {
  const queries: Array<{ sql: string; values?: unknown[] }> = [];
  const query = vi.fn(async (statement: unknown, values?: unknown[]) => {
    const sql = String(statement);
    queries.push({ sql, values });
    if (sql.includes("SELECT name \"branchName\" FROM branches")) {
      return { rows: [{ branchName: "Lipa" }] };
    }
    if (sql.includes("FROM menu_items mi")) {
      return {
        rows: [
          {
            id: "menu-1",
            code: "LATTE-L",
            name: "Iced Latte, Large",
            sellingPrice: 190,
            recipeVersionId: "recipe-v1",
            recipeUnits: [{ recipeUnit: "g", inventoryUnit: "kg" }],
          },
        ],
      };
    }
    if (sql.includes("FROM menu_item_variants v")) return { rows: variantRows ?? [{
      id: variantId, menuItemId: "menu-1", name: "Standard", status: "ACTIVE",
      sellingPrice: 190, recipeVersionId: "recipe-v1", recipeVersion:1, recipeUnits: [{ recipeUnit: "g", inventoryUnit: "kg" }],
    }] };
    if (sql.includes('r.id "recipeVersionId",ri.inventory_item_id')) return { rows: [{recipeVersionId:"recipe-v1",inventoryItemId:"ingredient-1",sku:"BEANS",name:"Coffee Beans",recipeQuantity:18,recipeUnit:"g",inventoryUnit:"kg",unitCost:800,yieldQuantity:1}] };
    if (sql.includes("FROM pos_import_approvals WHERE")) return { rows: [{id:approvalId,sourceSalesTotal:380,sourceQuantity:2}] };
    if (sql.includes("FROM pos_sources WHERE")) return { rows: [{ id: sourceId, sourceCode: "VERIFIED", displayName: "Verified POS", supportedFormat: sourceFormat }] };
    if (sql.includes("FROM pos_product_variant_mappings pm")) return { rows: [{ ...mappingRow, sourceProductCode: sourceFormat === "CANONICAL_CSV" ? "LATTE-L" : null, updatedAt: mappingVersion ?? mappingRow.updatedAt }] };
    if (sql.includes("SELECT id FROM pos_imports")) return { rows: [] };
    if (sql.includes("INSERT INTO pos_imports")) {
      if (failAt === "concurrent-duplicate") throw Object.assign(new Error("duplicate"), { code: "23505" });
      return { rows: [{ id: "import-1" }] };
    }
    if (sql.includes("INSERT INTO pos_sale_items")) {
      if (failAt === "sale") throw new Error("sale insert failed");
      return { rows: [] };
    }
    if (sql.includes('psi.id "saleItemId"')) {
      return { rows: [{ saleItemId:"sale-1",quantitySold:2,recipeVersionId:"recipe-v1",yieldQuantity:1,inventoryItemId:"ingredient-1",recipeQuantity:18,recipeUnit:"g",inventoryUnit:"kg",unitCost:800 }] };
    }
    if (sql.includes("INSERT INTO pos_sale_ingredient_usage")) {
      if (failAt === "usage") throw new Error("usage generation failed");
      return { rows: [] };
    }
    if (sql.includes('max(ic.count_date)::text "latestBaselineDate"')) {
      return { rows: [{ latestBaselineDate: lateHistorical ? "2026-10-02" : null }] };
    }
    if (sql.includes("WITH affected_items AS")) {
      return { rows: lateHistorical ? [{ id: "count-1", countNo: "IC-2026-00009", countDate: "2026-10-02", affectedItemCount: 1, varianceCount: 1 }] : [] };
    }
    if (sql.includes("sum(usage.quantity_consumed)")) {
      return {
        rows: [
          {
            inventoryItemId: "ingredient-1",
            sku: "BEANS",
            name: "Coffee Beans",
            unit: "kg",
            expectedConsumption: 0.036,
            estimatedCost: 28.8,
          },
        ],
      };
    }
    if (sql.includes("concat(u.first_name")) {
      return {
        rows: [
          {
            branchName: "Lipa",
            managerName: "Branch Manager",
            totalSales: 380,
            unitsSold: 2,
          },
        ],
      };
    }
    if(sql.includes('bool_and(branch_id=$2)'))return{rows:[{branchIsolated:failAt!=="reconciliation"}]};
    if(sql.includes("INSERT INTO pos_import_reconciliations"))return{rows:[{id:"reconciliation-1",generatedAt:"2026-09-08T10:00:00Z"}]};
    return { rows: [] };
  });
  const client = { query, release: vi.fn() };
  return { client, queries };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.env.DATA_LIFECYCLE_ENV="DEVELOPMENT";
  mocks.poolQuery.mockResolvedValue({ rows: [] });
  mocks.writeAudit.mockResolvedValue(undefined);
});

describe("Excel POS preview and canonical import integration", () => {
  const csvPreviewRequest = (posSourceId?: string) => ({
    body: { sourceFilename: "sales.csv", csvText, ...(posSourceId ? { posSourceId } : {}) },
    user: { id: "manager-1", role: "BRANCH_MANAGER", branchId },
  }) as never;

  it("requires a configured source for canonical CSV preview", async () => {
    await expect(previewPosSales(csvPreviewRequest(), response() as never, vi.fn())).rejects.toBeDefined();
    expect(mocks.poolQuery).not.toHaveBeenCalled();
  });

  it("rejects canonical CSV when the active source uses another format", async () => {
    mocks.poolQuery.mockImplementation(async (statement: unknown) => {
      const sql = String(statement);
      if (sql.includes('SELECT name "branchName" FROM branches')) return { rows: [{ branchName: "Lipa" }] };
      if (sql.includes("FROM menu_items mi")) return { rows: [{ id: "menu-1", code: "LATTE-L", name: "Iced Latte, Large", sellingPrice: 190 }] };
      if (sql.includes("FROM menu_item_variants v")) return { rows: [] };
      if (sql.includes("FROM pos_sources WHERE")) return { rows: [{ id: sourceId, sourceCode: "LEGACY", displayName: "Legacy", supportedFormat: "SUMMARY_ITEMS_SOLD_LEGACY_XLS" }] };
      return { rows: [] };
    });

    await expect(previewPosSales(csvPreviewRequest(sourceId), response() as never, vi.fn()))
      .rejects.toMatchObject({ code: "POS_SOURCE_FORMAT_MISMATCH" });
  });

  it("resolves canonical CSV through source-specific mappings and uses commit duplicate identity", async () => {
    const queries: Array<{ sql: string; values?: unknown[] }> = [];
    mocks.poolQuery.mockImplementation(async (statement: unknown, values?: unknown[]) => {
      const sql = String(statement); queries.push({ sql, values });
      if (sql.includes('SELECT name "branchName" FROM branches')) return { rows: [{ branchName: "Lipa" }] };
      if (sql.includes("FROM menu_items mi")) return { rows: [{ id: "menu-1", code: "LATTE-L", name: "Iced Latte, Large", sellingPrice: 190 }] };
      if (sql.includes("FROM menu_item_variants v")) return { rows: [{ id: variantId, menuItemId: "menu-1", name: "Standard", status: "ACTIVE", sellingPrice: 190, recipeVersionId: "recipe-v1", recipeVersion: 1, recipeUnits: [{ recipeUnit: "g", inventoryUnit: "kg" }] }] };
      if (sql.includes("FROM pos_sources WHERE")) return { rows: [{ id: sourceId, sourceCode: "CSV", displayName: "Canonical CSV", supportedFormat: "CANONICAL_CSV" }] };
      if (sql.includes("FROM pos_product_variant_mappings pm")) return { rows: [{ ...mappingRow, sourceProductCode: "LATTE-L" }] };
      if (sql.includes('r.id "recipeVersionId",ri.inventory_item_id')) return { rows: [{ recipeVersionId: "recipe-v1", inventoryItemId: "ingredient-1", sku: "BEANS", name: "Coffee Beans", recipeQuantity: 18, recipeUnit: "g", inventoryUnit: "kg", unitCost: 800, yieldQuantity: 1 }] };
      return { rows: [] };
    });
    const res = response();

    await previewPosSales(csvPreviewRequest(sourceId), res as never, vi.fn());

    const preview = (res.json.mock.calls[0]?.[0] as { data: { preview: { posSourceId: string; rows: Array<{ mappingStatus: string; menuItemVariantId: string }>; summary: { canImport: boolean } } } }).data.preview;
    expect(preview).toMatchObject({ posSourceId: sourceId, summary: { canImport: true } });
    expect(preview.rows[0]).toMatchObject({ mappingStatus: "APPROVED", menuItemVariantId: variantId });
    const sourceLookup = queries.find(({ sql }) => sql.includes("FROM pos_sources WHERE"));
    expect(sourceLookup?.values).toEqual([sourceId, branchId]);
    const duplicateLookup = queries.find(({ sql }) => sql.includes("SELECT id FROM pos_imports"));
    expect(duplicateLookup?.sql).toContain("branch_id=$1 AND business_date=$2 AND content_hash=$3");
    expect(duplicateLookup?.values).toEqual([branchId, "2026-09-08", parsePosCsv(csvText).contentHash]);
  });

  it.each([
    ["12OZ PAPER CUP", "OPERATIONAL_ITEM", 1, 0],
    ["MILK", "OPERATIONAL_ITEM", 1, 0],
    ["NEW CRISPY BITES", "UNKNOWN_REVIEW", 0, 1],
  ] as const)("classifies unmatched %s without weakening sellable-item validation", async (identity, classification, operationalRows, unknownReviewRows) => {
    mocks.poolQuery.mockImplementation(async (statement: unknown) => {
      const sql = String(statement);
      if (sql.includes("SELECT name \"branchName\" FROM branches")) return { rows: [{ branchName: "Lipa" }] };
      if (sql.includes("FROM menu_items mi")) return { rows: [] };
      if (sql.includes("FROM menu_item_variants v")) return { rows: [] };
      if (sql.includes("FROM pos_sources WHERE")) return { rows: [{ id: sourceId, sourceCode: "VERIFIED", displayName: "Verified POS", supportedFormat: "SUMMARY_ITEMS_SOLD_LEGACY_XLS" }] };
      if (sql.includes("FROM pos_product_variant_mappings pm")) return { rows: [] };
      return { rows: [] };
    });
    const res = response();
    await previewPosSales(excelRequest(legacyExcelBuffer(identity), "sales.xls", undefined, undefined, sourceId), res as never, vi.fn());
    const preview = (res.json.mock.calls[0]?.[0] as {data:{preview:{rows:Array<{itemClassification:string;status:string}>;summary:{operationalRows:number;unknownReviewRows:number;canImport:boolean}}}}).data.preview;
    expect(preview.rows[0]).toMatchObject({ itemClassification: classification, status: classification === "OPERATIONAL_ITEM" ? "VALID" : "INVALID" });
    expect(preview.summary).toMatchObject({ operationalRows, unknownReviewRows, canImport: false });
  });

  it("rejects Format A preview without a configured source before writing", async () => {
    mocks.poolQuery.mockImplementation(async (statement: unknown) => {
      const sql = String(statement);
      if (sql.includes("SELECT name \"branchName\" FROM branches")) return { rows: [{ branchName: "Lipa" }] };
      if (sql.includes("FROM menu_items mi")) return { rows: [{ id: "menu-1", code: "LATTE-L", name: "Iced Latte, Large", sellingPrice: 190, recipeVersionId: "recipe-v1", recipeUnits: [{ recipeUnit: "g", inventoryUnit: "kg" }] }] };
      if (sql.includes("FROM menu_item_variants v")) return { rows: [{ id: variantId, menuItemId: "menu-1", name: "Standard", status: "ACTIVE", recipeVersionId: "recipe-v1", recipeVersion: 1, recipeUnits: [{ recipeUnit: "g", inventoryUnit: "kg" }] }] };
      return { rows: [] };
    });
    await expect(previewPosSales(excelRequest(legacyExcelBuffer(), "renamed.xls"), response() as never, vi.fn()))
      .rejects.toMatchObject({ code: "POS_SOURCE_INVALID" });
    expect(mocks.poolQuery.mock.calls.some(([sql]) => String(sql).includes("INSERT"))).toBe(false);
  });

  it("passes Format A confirmation through the existing sale and recipe snapshot transaction", async () => {
    const buffer = legacyExcelBuffer();
    const hash = parsePosExcel("sales.xls", buffer).contentHash;
    const { client, queries } = createClient(undefined, undefined, undefined, "SUMMARY_ITEMS_SOLD_LEGACY_XLS");
    mocks.connect.mockResolvedValue(client);
    const preview = response();
    mocks.poolQuery.mockImplementation(async (statement: unknown) => {
      const sql = String(statement);
      if (sql.includes("SELECT name \"branchName\" FROM branches")) return { rows: [{ branchName: "Lipa" }] };
      if (sql.includes("FROM menu_items mi")) return { rows: [{ id: "menu-1", code: "LATTE-L", name: "Iced Latte, Large", sellingPrice: 190, recipeVersionId: "recipe-v1", recipeUnits: [{ recipeUnit: "g", inventoryUnit: "kg" }] }] };
      if (sql.includes("FROM menu_item_variants v")) return { rows: [{ id: variantId, menuItemId: "menu-1", name: "Standard", status: "ACTIVE", recipeVersionId: "recipe-v1", recipeVersion: 1, recipeUnits: [{ recipeUnit: "g", inventoryUnit: "kg" }] }] };
      if (sql.includes("FROM pos_sources WHERE")) return { rows: [{ id: sourceId, sourceCode: "VERIFIED", displayName: "Verified POS", supportedFormat: "SUMMARY_ITEMS_SOLD_LEGACY_XLS" }] };
      if (sql.includes("FROM pos_product_variant_mappings pm")) return { rows: [mappingRow] };
      if (sql.includes('r.id "recipeVersionId",ri.inventory_item_id')) return { rows: [{
        recipeVersionId:"recipe-v1",inventoryItemId:"ingredient-1",sku:"BEANS",name:"Coffee Beans",
        recipeQuantity:18,recipeUnit:"g",inventoryUnit:"kg",unitCost:800,yieldQuantity:1,
      }] };
      return { rows: [] };
    });
    await previewPosSales(excelRequest(buffer, "sales.xls", undefined, undefined, sourceId), preview as never, vi.fn());
    const resolved = (preview.json.mock.calls[0]?.[0] as { data: { preview: { resolutionFingerprint: string; summary: { canImport: boolean }; rows:Array<{mappingStatus:string;mappingScope:string;menuItemVariantId:string;matchedVariant:string;recipeVersion:number}>; simulation: { estimatedSales:number;estimatedCogs:number;estimatedGrossProfit:number;estimatedGrossMargin:number;ingredientConsumption:Array<{expectedConsumption:number}> } } } }).data.preview;
    expect(resolved.summary.canImport).toBe(true);
    expect(resolved.rows[0]).toMatchObject({mappingStatus:"APPROVED",mappingScope:"GLOBAL",menuItemVariantId:variantId,matchedVariant:"Standard",recipeVersion:1});
    expect(resolved.simulation).toMatchObject({estimatedSales:380,estimatedCogs:28.8,estimatedGrossProfit:351.2});
    expect(resolved.simulation.estimatedGrossMargin).toBeCloseTo(92.4210526316);
    expect(resolved.simulation.ingredientConsumption[0]?.expectedConsumption).toBe(0.036);
    const variantLookupSql = mocks.poolQuery.mock.calls
      .map(([sql]) => String(sql))
      .find((sql) => sql.includes("FROM menu_item_variants v"));
    expect(variantLookupSql).toContain("GROUP BY v.id,r.id,r.version");
    expect(mocks.poolQuery).toHaveBeenCalledWith(expect.stringContaining("bis.branch_id=$2"), [["recipe-v1"], branchId]);
    await importPosSales(excelRequest(buffer, "sales.xls", hash, resolved.resolutionFingerprint, sourceId), response() as never, vi.fn());
    const sale = queries.find(({ sql }) => sql.includes("INSERT INTO pos_sale_items"));
    expect(sale?.values).toEqual(["import-1", branchId, sourceId, "2026-09-08", ["menu-1"], [2], [190], ["Iced Latte, Large"], ["R-1"], ["11"], [null], [variantId]]);
    expect(queries.some(({ sql }) => sql.includes("INSERT INTO pos_sale_ingredient_usage"))).toBe(true);
    expect(queries.at(-1)?.sql).toBe("COMMIT");
  });

  it("creates an Owner notification in the same transaction as a valid import approval request",async()=>{
    const buffer=legacyExcelBuffer();
    mocks.poolQuery.mockImplementation(async(statement:unknown)=>{
      const sql=String(statement);
      if(sql.includes('SELECT name "branchName" FROM branches'))return{rows:[{branchName:"Lipa"}]};
      if(sql.includes("FROM menu_items mi"))return{rows:[{id:"menu-1",code:"LATTE-L",name:"Iced Latte, Large",sellingPrice:190,recipeVersionId:"recipe-v1",recipeUnits:[{recipeUnit:"g",inventoryUnit:"kg"}]}]};
      if(sql.includes("FROM menu_item_variants v"))return{rows:[{id:variantId,menuItemId:"menu-1",name:"Standard",status:"ACTIVE",recipeVersionId:"recipe-v1",recipeVersion:1,recipeUnits:[{recipeUnit:"g",inventoryUnit:"kg"}]}]};
      if(sql.includes("FROM pos_sources WHERE"))return{rows:[{id:sourceId,sourceCode:"VERIFIED",displayName:"Verified POS",supportedFormat:"SUMMARY_ITEMS_SOLD_LEGACY_XLS"}]};
      if(sql.includes("FROM pos_product_variant_mappings pm"))return{rows:[mappingRow]};
      if(sql.includes('r.id "recipeVersionId",ri.inventory_item_id'))return{rows:[{recipeVersionId:"recipe-v1",inventoryItemId:"ingredient-1",sku:"BEANS",name:"Coffee Beans",recipeQuantity:18,recipeUnit:"g",inventoryUnit:"kg",unitCost:800,yieldQuantity:1}]};
      return{rows:[]};
    });
    const queries:Array<{sql:string;values?:unknown[]}>=[];
    const client={query:vi.fn(async(statement:unknown,values?:unknown[])=>{
      const sql=String(statement);queries.push({sql,values});
      if(sql.includes("INSERT INTO pos_import_approvals"))return{rows:[{id:approvalId}]};
      if(sql.includes("FROM pos_import_approvals a JOIN branches"))return{rows:[{id:approvalId,status:"PENDING"}]};
      return{rows:[]};
    }),release:vi.fn()};
    mocks.connect.mockResolvedValue(client);
    const res=response();
    await requestPosImportApproval(excelRequest(buffer,"sales.xls",undefined,undefined,sourceId),res as never,vi.fn());
    const notification=queries.find(({sql})=>sql.includes("INSERT INTO notifications"));
    expect(notification?.sql).toContain("owner_user.role='OWNER'");
    expect(notification?.values).toEqual([branchId,"sales.xls","2026-09-08","Lipa",approvalId,"manager-1"]);
    expect(queries.map(({sql})=>sql).at(0)).toBe("BEGIN");
    expect(queries.map(({sql})=>sql).at(-1)).toBe("COMMIT");
    expect(res.status).toHaveBeenCalledWith(201);
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("rejects confirmation when an approved mapping changed after Excel preview", async () => {
    const buffer = legacyExcelBuffer();
    const preview = response();
    mocks.poolQuery.mockImplementation(async (statement: unknown) => {
      const sql = String(statement);
      if (sql.includes("SELECT name \"branchName\" FROM branches")) return { rows: [{ branchName: "Lipa" }] };
      if (sql.includes("FROM menu_items mi")) return { rows: [{ id: "menu-1", code: "LATTE-L", name: "Iced Latte, Large", sellingPrice: 190, recipeVersionId: "recipe-v1", recipeUnits: [{ recipeUnit: "g", inventoryUnit: "kg" }] }] };
      if (sql.includes("FROM pos_sources WHERE")) return { rows: [{ id: sourceId, sourceCode: "VERIFIED", displayName: "Verified POS", supportedFormat: "SUMMARY_ITEMS_SOLD_LEGACY_XLS" }] };
      if (sql.includes("FROM pos_product_variant_mappings pm")) return { rows: [mappingRow] };
      return { rows: [] };
    });
    await previewPosSales(excelRequest(buffer, "sales.xls", undefined, undefined, sourceId), preview as never, vi.fn());
    const before = (preview.json.mock.calls[0]?.[0] as { data: { preview: { contentHash: string; resolutionFingerprint: string } } }).data.preview;
    const { client, queries } = createClient(undefined, "2026-09-17T00:00:00Z", undefined, "SUMMARY_ITEMS_SOLD_LEGACY_XLS");
    mocks.connect.mockResolvedValue(client);
    await expect(importPosSales(excelRequest(buffer, "sales.xls", before.contentHash, before.resolutionFingerprint, sourceId), response() as never, vi.fn())).rejects.toMatchObject({ code: "POS_MAPPING_CHANGED" });
    expect(queries.some(({ sql }) => sql.includes("INSERT INTO pos_imports"))).toBe(false);
    expect(queries.at(-1)?.sql).toBe("ROLLBACK");
  });

  it("uses the resolved variant menu price for Format B without allocating transaction totals", async () => {
    const buffer = transactionSummaryBuffer();
    const hash = parsePosExcel("transactions.xlsx", buffer).contentHash;
    mocks.poolQuery.mockImplementation(async (statement: unknown) => {
      const sql = String(statement);
      if (sql.includes("SELECT name \"branchName\" FROM branches")) return { rows: [{ branchName: "Lipa" }] };
      if (sql.includes("FROM menu_items mi")) return { rows: [{ id: "menu-1", code: "LATTE-L", name: "Iced Latte, Large", sellingPrice: 190 }] };
      if (sql.includes("FROM menu_item_variants v")) return { rows: [{ id: variantId, menuItemId: "menu-1", name: "Standard", status: "ACTIVE", sellingPrice: 190, recipeVersionId: "recipe-v1", recipeVersion: 1, recipeUnits: [{ recipeUnit: "g", inventoryUnit: "kg" }] }] };
      if (sql.includes("FROM pos_sources WHERE")) return { rows: [{ id: sourceId, sourceCode: "TRANSACTION", displayName: "Transaction POS", supportedFormat: "TRANSACTION_SUMMARY_XLSX" }] };
      if (sql.includes("FROM pos_product_variant_mappings pm")) return { rows: [mappingRow] };
      if (sql.includes('r.id "recipeVersionId",ri.inventory_item_id')) return { rows: [{recipeVersionId:"recipe-v1",inventoryItemId:"ingredient-1",sku:"BEANS",name:"Coffee Beans",recipeQuantity:18,recipeUnit:"g",inventoryUnit:"kg",unitCost:800,yieldQuantity:1}] };
      return { rows: [] };
    });
    const previewResponse = response();
    await previewPosSales(excelRequest(buffer, "transactions.xlsx", undefined, undefined, sourceId), previewResponse as never, vi.fn());
    const preview = (previewResponse.json.mock.calls[0]?.[0] as {data:{preview:{contentHash:string;resolutionFingerprint:string;rows:Array<{unitPrice:number;lineAmount:null;calculatedSalesAmount:number;pricingSource:string;status:string}>;pricing:{method:string;notice:string;fallbackRows:number};summary:{canImport:boolean;validRows:number;warningRows:number;quality:string};simulation:{estimatedSales:number;estimatedCogs:number;estimatedGrossProfit:number;estimatedGrossMargin:number}}}}).data.preview;
    expect(preview.contentHash).toBe(hash);
    expect(preview.rows[0]).toMatchObject({unitPrice:190,lineAmount:null,calculatedSalesAmount:380,pricingSource:"MENU_VARIANT_CAPSTONE_FALLBACK"});
    expect(preview.pricing).toMatchObject({method:"MENU_VARIANT_CAPSTONE_FALLBACK",fallbackRows:1});
    expect(preview.pricing.notice).toBe("Item-level selling prices were not found in the uploaded file. The system will use the configured menu selling prices.");
    expect(preview.rows[0]).toMatchObject({status:"VALID"});
    expect(preview.summary).toMatchObject({canImport:true,validRows:1,warningRows:0,quality:"COMPLETE"});
    expect(preview.simulation).toMatchObject({estimatedSales:380,estimatedCogs:28.8,estimatedGrossProfit:351.2});
    expect(preview.simulation.estimatedGrossMargin).toBeCloseTo(92.4210526316);

    const { client, queries } = createClient(undefined, undefined, undefined, "TRANSACTION_SUMMARY_XLSX");
    mocks.connect.mockResolvedValue(client);
    await importPosSales(excelRequest(buffer, "transactions.xlsx", hash, preview.resolutionFingerprint, sourceId), response() as never, vi.fn());
    const sale = queries.find(({sql})=>sql.includes("INSERT INTO pos_sale_items"));
    expect(sale?.values).toEqual(["import-1",branchId,sourceId,"2026-09-08",["menu-1"],[2],[190],["Iced Latte, Large"],["OR-1"],[null],[null],[variantId]]);
    expect(mocks.writeAudit).toHaveBeenCalledWith(expect.anything(),"IMPORT_POS_SALES","POS_IMPORT","import-1",expect.any(String),expect.objectContaining({pricingMethod:"MENU_VARIANT_CAPSTONE_FALLBACK",fallbackPricingRows:1}),client);
    expect(queries.at(-1)?.sql).toBe("COMMIT");
  });
});

describe("transactional POS import persistence", () => {
  it("rejects a CSV parent match when Small and Large are both active",async()=>{
    const variants=["Small","Large"].map((name,index)=>({id:`variant-${index}`,menuItemId:"menu-1",name,status:"ACTIVE" as const,recipeVersionId:`recipe-${index}`,recipeUnits:[{recipeUnit:"g",inventoryUnit:"kg"}]}));
    const {client,queries}=createClient(undefined,undefined,variants);
    mocks.connect.mockResolvedValue(client);
    await expect(importPosSales(request(),response() as never,vi.fn())).rejects.toMatchObject({code:"POS_IMPORT_INVALID"});
    expect(queries.some(({sql})=>sql.includes("INSERT INTO pos_sale_items"))).toBe(false);
  });

  it("rejects an identified variant without an active recipe",async()=>{
    const {client,queries}=createClient(undefined,undefined,[{id:variantId,menuItemId:"menu-1",name:"Standard",status:"ACTIVE",recipeVersionId:null,recipeUnits:[]}]);
    mocks.connect.mockResolvedValue(client);
    await expect(importPosSales(request(),response() as never,vi.fn())).rejects.toMatchObject({code:"POS_IMPORT_INVALID"});
    expect(queries.some(({sql})=>sql.includes("INSERT INTO pos_sale_ingredient_usage"))).toBe(false);
  });
  it("rolls back the import batch when sale-line creation fails", async () => {
    const { client, queries } = createClient("sale");
    mocks.connect.mockResolvedValue(client);

    await expect(importPosSales(request(), response() as never, vi.fn())).rejects.toThrow("sale insert failed");

    expect(queries.some(({ sql }) => sql === "ROLLBACK")).toBe(true);
    expect(queries.some(({ sql }) => sql === "COMMIT")).toBe(false);
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("rolls back stored sales when ingredient-usage generation fails", async () => {
    const { client, queries } = createClient("usage");
    mocks.connect.mockResolvedValue(client);

    await expect(importPosSales(request(), response() as never, vi.fn())).rejects.toThrow("usage generation failed");

    expect(queries.some(({ sql }) => sql.includes("INSERT INTO pos_sale_items"))).toBe(true);
    expect(queries.some(({ sql }) => sql === "ROLLBACK")).toBe(true);
    expect(queries.some(({ sql }) => sql === "COMMIT")).toBe(false);
  });

  it("rolls back every imported row when reconciliation fails",async()=>{
    const {client,queries}=createClient("reconciliation");
    mocks.connect.mockResolvedValue(client);
    await expect(importPosSales(request(),response() as never,vi.fn())).rejects.toMatchObject({code:"POS_RECONCILIATION_FAILED"});
    expect(queries.some(({sql})=>sql==="ROLLBACK")).toBe(true);
    expect(queries.some(({sql})=>sql==="COMMIT")).toBe(false);
    expect(queries.some(({sql})=>sql.includes("INSERT INTO pos_import_reconciliations"))).toBe(false);
  });

  it("stores sale and ingredient snapshots before committing a successful import", async () => {
    const { client, queries } = createClient();
    mocks.connect.mockResolvedValue(client);
    const res = response();

    await importPosSales(request(), res as never, vi.fn());

    const sale = queries.find(({ sql }) => sql.includes("INSERT INTO pos_sale_items"));
    const usage = queries.find(({ sql }) => sql.includes("INSERT INTO pos_sale_ingredient_usage"));
    const previewProducts = queries.find(({ sql }) => sql.includes("FROM menu_items mi"));
    const usageSource = queries.find(({ sql }) => sql.includes('psi.id "saleItemId"'));
    expect(sale?.values).toEqual([
      "import-1",
      branchId,
      sourceId,
      "2026-09-08",
      ["menu-1"],
      [2],
      [190],
      ["LATTE-L"],
      ["R-1"],
      ["1"],
      [null],
      [variantId],
    ]);
    expect(usage?.sql).toContain("quantity_consumed,unit,unit_cost_snapshot,recipe_version_id");
    expect(usage?.values).toEqual([["sale-1"],["ingredient-1"],[0.036],["kg"],[800],["recipe-v1"]]);
    const previewVariants = queries.find(({ sql }) => sql.includes("FROM menu_item_variants v"));
    expect(previewProducts?.values).toEqual([branchId]);
    expect(previewVariants?.sql).toContain("candidate.menu_item_variant_id=v.id");
    expect(previewVariants?.values).toEqual([["menu-1"],"2026-09-08"]);
    expect(usageSource?.sql).toContain("candidate.effective_from<=psi.business_date");
    expect(queries.some(({ sql }) => sql.includes("INSERT INTO pos_imports"))).toBe(true);
    const importInsert=queries.find(({sql})=>sql.includes("INSERT INTO pos_imports"));
    expect(importInsert?.sql).toContain("created_environment");
    expect(importInsert?.values?.at(-1)).toBe("DEVELOPMENT");
    expect(sale?.sql).toContain("pos_source_id");
    expect(queries.some(({sql})=>sql.includes("pos_test_fixture_authorizations"))).toBe(false);
    const duplicateCheck=queries.find(({sql})=>sql.includes("SELECT id FROM pos_imports"));
    expect(duplicateCheck?.sql).toContain("branch_id=$1 AND business_date=$2 AND content_hash=$3");
    expect(duplicateCheck?.sql).not.toContain("pos_source_id");
    expect(queries.some(({ sql }) => sql.includes("INSERT INTO pos_sale_items"))).toBe(true);
    expect(queries.some(({ sql }) => sql.includes("INSERT INTO pos_sale_ingredient_usage"))).toBe(true);
    expect(queries.some(({ sql }) => sql.includes("INSERT INTO pos_import_reconciliations"))).toBe(true);
    expect(queries.some(({ sql }) => sql.includes("FROM pos_import_approvals"))).toBe(false);
    expect(queries.some(({ sql }) => sql.includes("UPDATE pos_import_approvals"))).toBe(false);
    expect(queries.at(-1)?.sql).toBe("COMMIT");
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          rowsImported: 1,
          totalSales: 380,
          reconciliation: expect.objectContaining({
            salesTotalMatches: true,
            quantityMatches: true,
            recipeConsumptionMatches: true,
            cogsMatches: true,
            branchIsolated: true,
          }),
        }),
      }),
    );
  });

  it("flags a late historical import for count reconciliation without changing current inventory", async () => {
    const { client, queries } = createClient(undefined, undefined, undefined, "CANONICAL_CSV", true);
    mocks.connect.mockResolvedValue(client);
    const res = response();

    await importPosSales(request(), res as never, vi.fn());

    expect(queries.some(({ sql }) => sql.includes("POS_LATE_HISTORICAL_IMPORT"))).toBe(true);
    expect(queries.some(({ sql }) => /(?:INSERT INTO|UPDATE) branch_inventory_balances/i.test(sql))).toBe(false);
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.anything(), "IMPORT_POS_SALES", "POS_IMPORT", "import-1", expect.any(String),
      expect.objectContaining({
        inventoryDateAssessment: expect.objectContaining({
          lateHistoricalImport: true,
          latestBaselineDate: "2026-10-02",
          affectedCountPeriods: [expect.objectContaining({ countNo: "IC-2026-00009" })],
        }),
      }),
      client,
    );
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        inventoryDateAssessment: expect.objectContaining({ lateHistoricalImport: true }),
      }),
    }));
  });

  it("maps a concurrent uniqueness conflict to a duplicate rejection", async () => {
    const { client, queries } = createClient("concurrent-duplicate");
    mocks.connect.mockResolvedValue(client);

    let failure: unknown;
    try {
      await importPosSales(request(), response() as never, vi.fn());
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(AppError);
    expect(failure).toMatchObject({ status: 409, code: "POS_IMPORT_DUPLICATE" });
    expect(queries.some(({ sql }) => sql === "ROLLBACK")).toBe(true);
    expect(queries.some(({ sql }) => sql.includes("INSERT INTO pos_sale_items"))).toBe(false);
  });
});

describe("POS import history access and deletion",()=>{
  it("keeps Branch Manager import history restricted to the authenticated branch",async()=>{
    mocks.poolQuery.mockResolvedValue({rows:[]});
    const req={query:{branchId:"00000000-0000-4000-8000-000000000099",page:"1",pageSize:"10"},user:{id:"manager-1",role:"BRANCH_MANAGER",branchId}} as never;
    await listPosImports(req,response() as never,vi.fn());
    expect(mocks.poolQuery).toHaveBeenCalledWith(expect.stringContaining("pi.branch_id=$1"),[branchId,10,0]);
  });

  it("deletes the complete import batch transactionally and writes a retained audit event",async()=>{
    const queries:Array<{sql:string;values?:unknown[]}>=[];
    const client={query:vi.fn(async(statement:unknown,values?:unknown[])=>{
      const sql=String(statement);queries.push({sql,values});
      if(sql.includes('pi.branch_id "branchId"'))return{rows:[{branchId,branchName:"Lipa",businessDate:"2026-09-13",importedAt:"2026-09-14T01:00:00Z",sourceFilename:"sales.csv",importedByUserId:"manager-1",totalRows:500,saleRowCount:500,ingredientUsageRowCount:1200,createdEnvironment:"DEVELOPMENT",cleanupAuthorizedBy:null,cleanupAuthorizedAt:null,cleanupReason:null,contentHash:"hash",reconciliationCount:1,notificationCount:1}]};
      if(sql.includes("FROM inventory_counts"))return{rows:[]};
      return{rows:[]};
    }),release:vi.fn()};
    mocks.connect.mockResolvedValue(client);
    const req=deleteRequest();
    const res=response();
    await deletePosImport(req,res as never,vi.fn());
    const statements=queries.map(item=>item.sql);
    expect(statements).toEqual(expect.arrayContaining(["BEGIN",expect.stringContaining("DELETE FROM notifications"),expect.stringContaining("DELETE FROM pos_import_reconciliations"),expect.stringContaining("DELETE FROM pos_import_approvals"),expect.stringContaining("DELETE FROM pos_sale_ingredient_usage"),expect.stringContaining("DELETE FROM pos_sale_items"),expect.stringContaining("DELETE FROM pos_imports"),"COMMIT"]));
    const reconciliationDelete=statements.findIndex(sql=>sql.includes("DELETE FROM pos_import_reconciliations"));
    const approvalDelete=statements.findIndex(sql=>sql.includes("DELETE FROM pos_import_approvals"));
    const usageDelete=statements.findIndex(sql=>sql.includes("DELETE FROM pos_sale_ingredient_usage"));
    const salesDelete=statements.findIndex(sql=>sql.includes("DELETE FROM pos_sale_items"));
    const importDelete=statements.findIndex(sql=>sql.includes("DELETE FROM pos_imports"));
    expect(reconciliationDelete).toBeLessThan(approvalDelete);
    expect(approvalDelete).toBeLessThan(usageDelete);
    expect(usageDelete).toBeLessThan(salesDelete);
    expect(salesDelete).toBeLessThan(importDelete);
    expect(mocks.writeAudit).toHaveBeenCalledWith(expect.objectContaining({role:"OWNER"}),"CONTROLLED_DELETE","POS_IMPORT",importId,"Cleaned up POS import sales.csv",expect.objectContaining({saleRowCount:500,ingredientUsageRowCount:1200,reason:expect.any(String),createdEnvironment:"DEVELOPMENT",verificationResult:"VERIFIED"}),client);
    expect(res.json).toHaveBeenCalledWith({success:true,data:{id:importId,deleted:true}});
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("rolls back the complete deletion when a dependent-record delete fails",async()=>{
    const queries:string[]=[];
    const client={query:vi.fn(async(statement:unknown)=>{
      const sql=String(statement);queries.push(sql);
      if(sql.includes('pi.branch_id "branchId"'))return{rows:[{branchId,branchName:"Lipa",businessDate:"2026-09-13",importedAt:"2026-09-14T01:00:00Z",sourceFilename:"sales.csv",importedByUserId:"manager-1",totalRows:10,saleRowCount:10,ingredientUsageRowCount:20,createdEnvironment:"DEVELOPMENT",cleanupAuthorizedBy:null,cleanupAuthorizedAt:null,cleanupReason:null}]};
      if(sql.includes("FROM inventory_counts"))return{rows:[]};
      if(sql.includes("DELETE FROM pos_sale_ingredient_usage"))throw new Error("usage delete failed");
      return{rows:[]};
    }),release:vi.fn()};
    mocks.connect.mockResolvedValue(client);
    await expect(deletePosImport(deleteRequest(),response() as never,vi.fn())).rejects.toThrow("usage delete failed");
    expect(queries).toContain("ROLLBACK");
    expect(queries).not.toContain("COMMIT");
    expect(queries.some(sql=>sql.includes("DELETE FROM pos_imports"))).toBe(false);
    expect(mocks.writeAudit).not.toHaveBeenCalled();
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("blocks deletion after a physical count has reconciled the import date",async()=>{
    const queries:string[]=[];
    const client={query:vi.fn(async(statement:unknown)=>{
      const sql=String(statement);queries.push(sql);
      if(sql.includes('pi.branch_id "branchId"'))return{rows:[{branchId,branchName:"Lipa",businessDate:"2026-09-13",importedAt:"2026-09-14T01:00:00Z",sourceFilename:"sales.csv",importedByUserId:"manager-1",totalRows:10,saleRowCount:10,ingredientUsageRowCount:20,createdEnvironment:"DEVELOPMENT",cleanupAuthorizedBy:null,cleanupAuthorizedAt:null,cleanupReason:null}]};
      if(sql.includes("FROM inventory_counts"))return{rows:[{exists:1}]};
      return{rows:[]};
    }),release:vi.fn()};
    mocks.connect.mockResolvedValue(client);
    let failure:unknown;
    try{await deletePosImport(deleteRequest(),response() as never,vi.fn());}catch(error){failure=error;}
    expect(failure).toMatchObject({status:409,code:"POS_IMPORT_RECONCILED"});
    expect(queries).toContain("ROLLBACK");
    expect(queries.some(sql=>sql.includes("DELETE FROM pos_imports"))).toBe(false);
    expect(mocks.writeAudit).not.toHaveBeenCalled();
  });

  it("allows deletion when the physical count was submitted before the import",async()=>{
    const queries:Array<{sql:string;values?:unknown[]}>=[];
    const client={query:vi.fn(async(statement:unknown,values?:unknown[])=>{
      const sql=String(statement);queries.push({sql,values});
      if(sql.includes('pi.branch_id "branchId"'))return{rows:[{branchId,branchName:"Lipa",businessDate:"2026-09-16",importedAt:"2026-09-17T02:00:00Z",sourceFilename:"sales.xlsx",importedByUserId:"manager-1",totalRows:96,saleRowCount:85,ingredientUsageRowCount:300,createdEnvironment:"DEVELOPMENT",cleanupAuthorizedBy:null,cleanupAuthorizedAt:null,cleanupReason:null}]};
      if(sql.includes("FROM inventory_counts"))return{rows:[]};
      return{rows:[]};
    }),release:vi.fn()};
    mocks.connect.mockResolvedValue(client);
    await deletePosImport(deleteRequest(),response() as never,vi.fn());
    const guard=queries.find(({sql})=>sql.includes("FROM inventory_counts"));
    expect(guard?.sql).toContain("NOT is_test_data");
    expect(guard?.sql).toContain("submitted_at >= $3::timestamptz");
    expect(guard?.values).toEqual([branchId,"2026-09-16","2026-09-17T02:00:00Z"]);
    expect(queries.some(({sql})=>sql.includes("DELETE FROM pos_imports"))).toBe(true);
  });

  it("refuses cleanup when the import was created in a different lifecycle environment",async()=>{
    const queries:string[]=[];
    const client={query:vi.fn(async(statement:unknown)=>{
      const sql=String(statement);queries.push(sql);
      if(sql.includes('pi.branch_id "branchId"'))return{rows:[{branchId,branchName:"Lipa",businessDate:"2026-09-16",importedAt:"2026-09-17T02:00:00Z",sourceFilename:"real-sales.xlsx",importedByUserId:"manager-1",totalRows:96,saleRowCount:85,ingredientUsageRowCount:300,createdEnvironment:"PRODUCTION",cleanupAuthorizedBy:null,cleanupAuthorizedAt:null,cleanupReason:null}]};
      return{rows:[]};
    }),release:vi.fn()};
    mocks.connect.mockResolvedValue(client);
    await expect(deletePosImport(deleteRequest(),response() as never,vi.fn())).rejects.toMatchObject({status:409,code:"POS_CLEANUP_ENVIRONMENT_MISMATCH"});
    expect(queries.some(sql=>sql.includes("DELETE FROM pos_imports"))).toBe(false);
    expect(queries).toContain("ROLLBACK");
  });

  it("disables POS cleanup in production",async()=>{
    mocks.env.DATA_LIFECYCLE_ENV="PRODUCTION";
    await expect(deletePosImport(deleteRequest(),response() as never,vi.fn())).rejects.toMatchObject({status:403,code:"POS_CLEANUP_DISABLED"});
    expect(mocks.connect).not.toHaveBeenCalled();
  });

  it("requires and records explicit Owner authorization before UAT cleanup",async()=>{
    mocks.env.DATA_LIFECYCLE_ENV="UAT";
    const queries:string[]=[];
    const client={query:vi.fn(async(statement:unknown)=>{
      const sql=String(statement);queries.push(sql);
      if(sql.includes('SELECT created_environment "createdEnvironment"'))return{rows:[{createdEnvironment:"UAT"}]};
      return{rows:[]};
    }),release:vi.fn()};
    mocks.connect.mockResolvedValue(client);
    const res=response();
    await authorizePosImportCleanup(deleteRequest(),res as never,vi.fn());
    expect(queries.some(sql=>sql.includes("cleanup_authorized_by=$2::uuid"))).toBe(true);
    expect(mocks.writeAudit).toHaveBeenCalledWith(expect.objectContaining({role:"OWNER"}),"AUTHORIZE_POS_IMPORT_CLEANUP","POS_IMPORT",importId,"Authorized UAT POS import cleanup",expect.any(Object),client);
    expect(res.json).toHaveBeenCalledWith({success:true,data:{id:importId,authorized:true}});
  });
});

describe("POS import approval visibility and review",()=>{
  it("returns pending approvals across all branches for the Owner",async()=>{
    mocks.poolQuery.mockResolvedValue({rows:[]});
    await listPosImportApprovals({query:{status:"PENDING"},user:{id:"owner-1",role:"OWNER",branchId:null}} as never,response() as never,vi.fn());
    expect(mocks.poolQuery).toHaveBeenCalledWith(expect.stringContaining("($1::uuid IS NULL OR a.branch_id=$1)"),[null,"PENDING"]);
  });

  it("keeps a Branch Manager approval list restricted to the assigned branch",async()=>{
    mocks.poolQuery.mockResolvedValue({rows:[]});
    await listPosImportApprovals({query:{status:"PENDING"},user:{id:"manager-1",role:"BRANCH_MANAGER",branchId}} as never,response() as never,vi.fn());
    expect(mocks.poolQuery).toHaveBeenCalledWith(expect.stringContaining("($1::uuid IS NULL OR a.branch_id=$1)"),[branchId,"PENDING"]);
  });

  it("records Owner review and notifies the requesting Manager in one transaction",async()=>{
    const queries:Array<{sql:string;values?:unknown[]}>=[];
    const client={query:vi.fn(async(statement:unknown,values?:unknown[])=>{
      const sql=String(statement);queries.push({sql,values});
      if(sql.includes("UPDATE pos_import_approvals"))return{rows:[{id:approvalId,requestedBy:"manager-1",branchId,sourceFilename:"sales.xls"}]};
      if(sql.includes("FROM pos_import_approvals a JOIN branches"))return{rows:[{id:approvalId,status:"APPROVED"}]};
      return{rows:[]};
    }),release:vi.fn()};
    mocks.connect.mockResolvedValue(client);
    const res=response();
    await reviewPosImportApproval({params:{id:approvalId},body:{status:"APPROVED",approvalNotes:"Validated totals"},user:{id:"owner-1",role:"OWNER",branchId:null}} as never,res as never,vi.fn());
    const notification=queries.find(({sql})=>sql.includes("INSERT INTO notifications"));
    expect(notification?.values).toEqual(["manager-1",branchId,"POS Import Approved","sales.xls was approved by the Owner. Return to POS Sales and confirm the import.",approvalId]);
    expect(queries.map(({sql})=>sql).at(0)).toBe("BEGIN");
    expect(queries.map(({sql})=>sql).at(-1)).toBe("COMMIT");
    expect(mocks.writeAudit).toHaveBeenCalledWith(expect.objectContaining({role:"OWNER"}),"REVIEW_POS_IMPORT_APPROVAL","POS_IMPORT_APPROVAL",approvalId,"APPROVED POS import request",{approvalNotes:"Validated totals"},client);
    expect(client.release).toHaveBeenCalledOnce();
  });
});
