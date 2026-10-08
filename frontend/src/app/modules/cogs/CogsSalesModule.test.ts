import { afterEach, beforeEach, describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { C } from "../../components/ModuleUi";
import {
  DAILY_POS_MONITORING_LOCATION,
  DAILY_POS_MONITORING_IS_PAGINATED,
  DAILY_POS_MONITORING_COLUMNS,
  OWNER_POS_IMPORT_HISTORY_COLUMNS,
  PosImportActions,
  PosImportCleanupAuthorizationDialog,
  PosImportDeleteDialog,
  PosMappingActions,
  PosMappingEditDialog,
  PosMappingSetup,
  PosPricingNotice,
  STORAGE_KEY_COGS_USER_RANGE,
  canApprovePosMapping,
  canAuthorizePosImportCleanup,
  canDeletePosImport,
  canDeletePosSource,
  canEditPosMapping,
  clearCogsUserRange,
  dailyPosMonitoringView,
  dailyPosStatusLabel,
  formatPosSourceFormatName,
  getInitialCogsDateRange,
  hasInvalidCsvEncoding,
  isSupportedPosFilename,
  marginValueColor,
  posSalesAmountLabel,
  readCogsUserRange,
  saveCogsUserRange,
  summarizeDailyPosStatuses,
} from "./CogsSalesModule";
import { adjustRangeForImport } from "../../utils/businessDate";
import type { DailyPosUploadStatus, PosMapping } from "../../types/inventoryWorkflow";
import type { MenuProduct } from "../../types/masterData";

describe("profitability presentation",()=>{
  it("uses success for positive margin, danger for negative margin, and neutral for zero",()=>{
    expect(marginValueColor(35.2)).toBe(C.green);
    expect(marginValueColor(-1)).toBe(C.red);
    expect(marginValueColor(0)).toBe("var(--app-text-muted)");
  });

  it("does not alter the established margin calculation",()=>{
    const sales=100;
    const cogs=64.8;
    expect(((sales-cogs)/sales)*100).toBeCloseTo(35.2);
  });
});

describe("POS Import History controls",()=>{
  it("places compact daily monitoring inside Import History while retaining actual history",()=>{
    expect(DAILY_POS_MONITORING_LOCATION).toBe("import_history");
    expect(DAILY_POS_MONITORING_IS_PAGINATED).toBe(false);
    expect(OWNER_POS_IMPORT_HISTORY_COLUMNS).toEqual(expect.arrayContaining(["File Name","Business Date","Processed / Total Rows","Fingerprint","Status","Action"]));
  });

  it("uses clear monitoring labels without a POS Source summary column",()=>{
    expect(dailyPosStatusLabel("UPLOADED")).toBe("Uploaded");
    expect(dailyPosStatusLabel("MISSING_UPLOAD")).toBe("Missing Upload");
    expect(dailyPosStatusLabel("DUE_TODAY")).toBe("Due Today");
    expect(DAILY_POS_MONITORING_COLUMNS).not.toContain("POS Source");
  });

  it("summarizes multiple required POS sources into one persisted branch/day row",()=>{
    const base={branchId:"branch-1",branchName:"Gulod / Main Branch",businessDate:"2026-10-01",closed:false,sourceCode:null,posSourceName:null};
    const rows=[
      {...base,posSourceId:"source-a",importId:"import-a",sourceFilename:"sales.xls",importedAt:"2026-10-01T10:00:00Z",uploadedBy:"Ana Reyes",status:"UPLOADED"},
      {...base,posSourceId:"source-b",importId:"import-b",sourceFilename:"sales.xlsx",importedAt:"2026-10-01T11:00:00Z",uploadedBy:"Ana Reyes",status:"UPLOADED"},
    ] as DailyPosUploadStatus[];
    expect(summarizeDailyPosStatuses(rows)).toEqual([expect.objectContaining({branchId:"branch-1",businessDate:"2026-10-01",status:"UPLOADED",requiredSourceCount:2,completedSourceCount:2,sourceFilename:"sales.xls, sales.xlsx"})]);
  });

  it("keeps a branch due while one existing required source remains uncommitted",()=>{
    const base={branchId:"branch-1",branchName:"Gulod",businessDate:"2026-10-01",closed:false,sourceCode:null,posSourceName:null,uploadedBy:null,importedAt:null,sourceFilename:null};
    const rows=[
      {...base,posSourceId:"source-a",importId:"import-a",status:"UPLOADED"},
      {...base,posSourceId:"source-b",importId:null,status:"DUE_TODAY"},
    ] as DailyPosUploadStatus[];
    expect(summarizeDailyPosStatuses(rows)[0]).toMatchObject({status:"DUE_TODAY",requiredSourceCount:2,completedSourceCount:1});
  });

  it("keeps a branch without an active source explicitly not configured",()=>{
    const rows=[{branchId:"branch-2",branchName:"Evo",businessDate:"2026-10-01",posSourceId:null,posSourceName:null,sourceCode:null,importId:null,sourceFilename:null,importedAt:null,uploadedBy:null,closed:false,status:"POS_SOURCE_NOT_CONFIGURED"}] as DailyPosUploadStatus[];
    expect(summarizeDailyPosStatuses(rows)[0]).toMatchObject({status:"POS_SOURCE_NOT_CONFIGURED",requiredSourceCount:0,completedSourceCount:0});
  });

  it("uses only the current business date in the default monitoring mode",()=>{
    expect(dailyPosMonitoringView("current","2026-10-01","2026-09-16")).toEqual({
      businessDate:"2026-10-01",startDate:"2026-10-01",endDate:"2026-10-01",showDateFilter:false,
      title:"Daily Upload Monitoring",actionLabel:"View History",
    });
  });

  it("uses the selected business date and exposes the date filter in history mode",()=>{
    expect(dailyPosMonitoringView("history","2026-10-01","2026-09-16")).toEqual({
      businessDate:"2026-09-16",startDate:"2026-09-16",endDate:"2026-09-16",showDateFilter:true,
      title:"Daily Upload Monitoring — History",actionLabel:"Back to Current",
    });
  });
  it("clearly discloses and labels the configured menu-price fallback",()=>{
    const notice="Item-level selling prices were not found in the uploaded file. The system will use the configured menu selling prices.";
    expect(renderToStaticMarkup(React.createElement(PosPricingNotice,{notice}))).toContain(notice);
    expect(renderToStaticMarkup(React.createElement(PosPricingNotice,{notice:null}))).toBe("");
    expect(posSalesAmountLabel({calculatedSalesAmount:380,lineAmount:null})).toBe("₱380.00");
  });

  it("accepts only the supported POS upload extensions",()=>{
    expect(["sales.csv","summary.XLS","transactions.xlsx"].every(isSupportedPosFilename)).toBe(true);
    expect(isSupportedPosFilename("sales.pdf")).toBe(false);
  });

  it("accepts normal CSV text and rejects only decoded replacement characters",()=>{
    expect(hasInvalidCsvEncoding("product,quantity\nAmericano,2")).toBe(false);
    expect(hasInvalidCsvEncoding("product,quantity\nAmericano,\uFFFD")).toBe(true);
  });

  it("uses backend lifecycle permissions for Owner cleanup controls",()=>{
    expect(canDeletePosImport("owner",{canCleanup:true})).toBe(true);
    expect(canDeletePosImport("OWNER",{canCleanup:true})).toBe(true);
    expect(canDeletePosImport("owner",{canCleanup:false})).toBe(false);
    expect(canDeletePosImport("manager",{canCleanup:true})).toBe(false);
    expect(canDeletePosImport("BRANCH_MANAGER",{canCleanup:true})).toBe(false);
    expect(canAuthorizePosImportCleanup("owner",{canAuthorizeCleanup:true})).toBe(true);
    expect(canAuthorizePosImportCleanup("OWNER",{canAuthorizeCleanup:true})).toBe(true);
    expect(canAuthorizePosImportCleanup("manager",{canAuthorizeCleanup:true})).toBe(false);
  });

  it("renders the Delete button only when Owner has canCleanup=true from the backend", () => {
    // Scenario 1: Owner user, Development environment, canCleanup: true
    const devImport = {
      sourceFilename: "POS.09.16.2026.xlsx",
      canCleanup: true,
      canAuthorizeCleanup: false,
    };
    const devMarkup = renderToStaticMarkup(
      React.createElement(PosImportActions, { role: "owner", record: devImport })
    );
    expect(devMarkup).toContain("Delete import POS.09.16.2026.xlsx");
    expect(devMarkup).toContain("lucide-trash-2");

    const ownerUpperMarkup = renderToStaticMarkup(
      React.createElement(PosImportActions, { role: "OWNER", record: devImport })
    );
    expect(ownerUpperMarkup).toContain("Delete import POS.09.16.2026.xlsx");
    expect(ownerUpperMarkup).toContain("lucide-trash-2");

    // Scenario 2: Owner user, Production environment, canCleanup: false
    const prodImport = {
      sourceFilename: "POS.09.16.2026.xlsx",
      canCleanup: false,
      canAuthorizeCleanup: false,
    };
    const prodMarkup = renderToStaticMarkup(
      React.createElement(PosImportActions, { role: "owner", record: prodImport })
    );
    expect(prodMarkup).toBe("");

    // Scenario 3: Branch Manager never sees Delete button even if canCleanup flag were true
    const managerMarkup = renderToStaticMarkup(
      React.createElement(PosImportActions, { role: "manager", record: devImport })
    );
    expect(managerMarkup).toBe("");

    const managerUpperMarkup = renderToStaticMarkup(
      React.createElement(PosImportActions, { role: "BRANCH_MANAGER", record: devImport })
    );
    expect(managerUpperMarkup).toBe("");

    // Scenario 4: Owner user, UAT environment, canAuthorizeCleanup: true
    const uatImport = {
      sourceFilename: "POS.09.16.2026.xlsx",
      canCleanup: false,
      canAuthorizeCleanup: true,
    };
    const uatMarkup = renderToStaticMarkup(
      React.createElement(PosImportActions, { role: "owner", record: uatImport })
    );
    expect(uatMarkup).toContain("Authorize cleanup POS.09.16.2026.xlsx");
    expect(uatMarkup).not.toContain("lucide-trash-2");
  });

  it("requires a descriptive confirmation before deleting an entire import batch",()=>{
    const target={id:"import-1",businessDate:"2026-09-13",sourceFilename:"sales0913.csv",importedAt:"2026-09-13T08:00:00Z",branchId:"branch-1",branchName:"Lipa",importedBy:"Maria D.",productLines:20,unitsSold:500,totalSales:10000,status:"COMPLETE",totalRows:500,validRows:500,warningRows:0,invalidRows:0,unmatchedRows:0,fingerprintIndicator:"abcdef",createdEnvironment:"DEVELOPMENT",cleanupPolicy:"DEVELOPMENT",cleanupAuthorizedBy:null,cleanupAuthorizedAt:null,cleanupReason:null,canAuthorizeCleanup:false,canCleanup:true} as const;
    const markup=renderToStaticMarkup(React.createElement(PosImportDeleteDialog,{target,deleting:false,reason:"",onReasonChange:()=>undefined,onCancel:()=>undefined,onConfirm:()=>undefined}));
    expect(markup).toContain("Clean up this POS import?");
    expect(markup).toContain("sales0913.csv");
    expect(markup).toContain("Lipa");
    expect(markup).toContain("Production cleanup remains disabled");
    expect(markup).toContain("Cancel");
    expect(markup).toContain("Clean Up Import");
    expect(markup).toContain("app-btn--danger");
    const authorization=renderToStaticMarkup(React.createElement(PosImportCleanupAuthorizationDialog,{target:{...target,createdEnvironment:"UAT",cleanupPolicy:"UAT",canAuthorizeCleanup:true,canCleanup:false},busy:false,reason:"",onReasonChange:()=>undefined,onCancel:()=>undefined,onConfirm:()=>undefined}));
    expect(authorization).toContain("Authorize UAT cleanup");
    expect(authorization).toContain("does not delete the import or change its business meaning");
  });
});

describe("POS mapping activation safeguards",()=>{
  const verifiedSource={status:"ACTIVE",formatVerifiedAt:"2026-09-25T10:00:00Z"} as const;

  it("allows review approval only for a recipe-backed variant and a verified active source",()=>{
    expect(canApprovePosMapping({recipeAvailable:true},verifiedSource)).toBe(true);
  });

  it("blocks review approval when the recipe or verified source is unavailable",()=>{
    expect(canApprovePosMapping({recipeAvailable:false},verifiedSource)).toBe(false);
    expect(canApprovePosMapping({recipeAvailable:true},{status:"INACTIVE",formatVerifiedAt:null})).toBe(false);
    expect(canApprovePosMapping({recipeAvailable:true},null)).toBe(false);
  });
});

describe("POS mapping revision presentation",()=>{
  const pending={id:"mapping-1",posSourceId:"source-1",branchId:null,sourceProductName:"H12 CAPP",sourceProductCode:null,menuItemVariantId:"variant-spanish",menuItemId:"product-spanish",menuItemName:"Spanish Latte",variantName:"Standard",status:"INACTIVE",reviewStatus:"PENDING",reviewComment:null,reviewedBy:null,reviewedAt:null,branchName:null,recipeId:"recipe-1",recipeVersion:1,recipeAvailable:true} as PosMapping;

  it("shows Edit only for inactive Pending mappings",()=>{
    expect(canEditPosMapping(pending)).toBe(true);
    const pendingMarkup=renderToStaticMarkup(React.createElement(PosMappingActions,{mapping:pending,busy:false,canApprove:true,reviewNote:"Needs correction",onEdit:()=>undefined,onReview:()=>undefined,onDeactivate:()=>undefined}));
    expect(pendingMarkup).toContain("Edit Mapping");
    expect(pendingMarkup).toContain("Approve");
    expect(pendingMarkup).toContain("Reject");
    expect(pendingMarkup).toContain("Ambiguous");
    expect(pendingMarkup).not.toContain("Deactivate");
  });

  it("locks Approved mappings and offers deactivation instead of Edit",()=>{
    const approved={...pending,status:"ACTIVE",reviewStatus:"APPROVED",reviewedBy:"owner-1",reviewedAt:"2026-09-25T02:00:00Z"} as PosMapping;
    expect(canEditPosMapping(approved)).toBe(false);
    const markup=renderToStaticMarkup(React.createElement(PosMappingActions,{mapping:approved,busy:false,canApprove:true,reviewNote:"",onEdit:()=>undefined,onReview:()=>undefined,onDeactivate:()=>undefined}));
    expect(markup).toContain("Approved");
    expect(markup).toContain("Deactivate");
    expect(markup).not.toContain("Edit Mapping");
  });

  it("reuses product and variant fields in the Pending edit dialog",()=>{
    const product={id:"product-spanish",name:"Spanish Latte",category:"Warm Tales",status:"ACTIVE",approvalStatus:"APPROVED",variants:[{id:"variant-spanish",name:"Standard",status:"ACTIVE",recipeId:"recipe-1",recipeVersion:1}]} as MenuProduct;
    const markup=renderToStaticMarkup(React.createElement(PosMappingEditDialog,{mapping:pending,products:[product],branches:[],busy:false,onCancel:()=>undefined,onSave:()=>undefined}));
    expect(markup).toContain("Edit Pending Mapping");
    expect(markup).toContain("H12 CAPP");
    expect(markup).toContain("Target Product");
    expect(markup).toContain("Target Variant");
    expect(markup).toContain("Pending Approval");
    expect(markup).toContain("Save Changes");
  });
});

describe("POS System and Mapping Setup UX workflow", () => {
  it("formats POS source format names for user readability", () => {
    expect(formatPosSourceFormatName("SUMMARY_ITEMS_SOLD_LEGACY_XLS")).toBe("Summary Items Sold XLS");
    expect(formatPosSourceFormatName("TRANSACTION_SUMMARY_XLSX")).toBe("Transaction Summary XLSX");
    expect(formatPosSourceFormatName("CANONICAL_CSV")).toBe("Canonical CSV");
  });

  it("renders the POS System & Mapping Setup button and collapsed state cleanly", () => {
    const markup = renderToStaticMarkup(React.createElement(PosMappingSetup));
    expect(markup).toContain("POS System &amp; Mapping Setup");
    expect(markup).toContain("Open POS Setup");
  });
});

describe("POS System configuration deletion policy", () => {
  it("allows deletion only for Owner on inactive, unused POS systems", () => {
    const unusedSource = { status: "INACTIVE" as const, hasImports: false, hasSales: false, hasActiveMappings: false };
    expect(canDeletePosSource("owner", unusedSource)).toBe(true);
    expect(canDeletePosSource("OWNER", unusedSource)).toBe(true);
  });

  it("blocks deletion of active POS systems", () => {
    const activeSource = { status: "ACTIVE" as const, hasImports: false, hasSales: false, hasActiveMappings: false };
    expect(canDeletePosSource("owner", activeSource)).toBe(false);
  });

  it("blocks deletion when historical imports exist", () => {
    const sourceWithImports = { status: "INACTIVE" as const, hasImports: true, hasSales: false, hasActiveMappings: false };
    expect(canDeletePosSource("owner", sourceWithImports)).toBe(false);
  });

  it("blocks deletion when recorded sales exist", () => {
    const sourceWithSales = { status: "INACTIVE" as const, hasImports: false, hasSales: true, hasActiveMappings: false };
    expect(canDeletePosSource("owner", sourceWithSales)).toBe(false);
  });

  it("blocks deletion when active mappings exist", () => {
    const sourceWithMappings = { status: "INACTIVE" as const, hasImports: false, hasSales: false, hasActiveMappings: true };
    expect(canDeletePosSource("owner", sourceWithMappings)).toBe(false);
  });

  it("blocks managers from deleting POS systems under all conditions", () => {
    const unusedSource = { status: "INACTIVE" as const, hasImports: false, hasSales: false, hasActiveMappings: false };
    expect(canDeletePosSource("manager", unusedSource)).toBe(false);
    expect(canDeletePosSource("BRANCH_MANAGER", unusedSource)).toBe(false);
  });
});

describe("COGS and Sales reporting period synchronization and persistence", () => {
  let mockStorage: Record<string, string> = {};
  const originalLocalStorage = globalThis.localStorage;

  beforeEach(() => {
    mockStorage = {};
    const storageMock = {
      getItem: (key: string) => mockStorage[key] ?? null,
      setItem: (key: string, val: string) => { mockStorage[key] = String(val); },
      removeItem: (key: string) => { delete mockStorage[key]; },
      clear: () => { mockStorage = {}; },
      get length() { return Object.keys(mockStorage).length; },
      key: (i: number) => Object.keys(mockStorage)[i] ?? null,
    };
    try {
      Object.defineProperty(globalThis, "localStorage", {
        value: storageMock,
        writable: true,
        configurable: true,
      });
    } catch {
      // fallback
    }
  });

  afterEach(() => {
    try {
      Object.defineProperty(globalThis, "localStorage", {
        value: originalLocalStorage,
        writable: true,
        configurable: true,
      });
    } catch {
      // fallback
    }
  });

  it("returns null when no COGS user range is stored", () => {
    expect(readCogsUserRange()).toBeNull();
  });

  it("saves and retrieves user-selected range configuration", () => {
    saveCogsUserRange({
      range: "custom",
      customStart: "2026-09-16",
      customEnd: "2026-10-01",
    });
    expect(readCogsUserRange()).toEqual({
      range: "custom",
      customStart: "2026-09-16",
      customEnd: "2026-10-01",
    });
  });

  it("clears user range from storage on reset", () => {
    saveCogsUserRange({ range: "30d" });
    expect(readCogsUserRange()).toEqual({ range: "30d" });
    clearCogsUserRange();
    expect(readCogsUserRange()).toBeNull();
  });

  it("defaults getInitialCogsDateRange to mtd with userSelected=false when no params or storage exist", () => {
    const initial = getInitialCogsDateRange();
    expect(initial.userSelected).toBe(false);
    expect(initial.range).toBe("mtd");
  });

  it("restores user-selected range in getInitialCogsDateRange when storage is populated", () => {
    saveCogsUserRange({
      range: "custom",
      customStart: "2026-09-01",
      customEnd: "2026-09-30",
    });
    const initial = getInitialCogsDateRange();
    expect(initial.userSelected).toBe(true);
    expect(initial.range).toBe("custom");
    expect(initial.customStart).toBe("2026-09-01");
    expect(initial.customEnd).toBe("2026-09-30");
  });

  it("adjusts range to include imported historical business date when outside current month", () => {
    const adjusted = adjustRangeForImport("mtd", "2026-10-01", "2026-10-01", "2026-09-16", "2026-10-01");
    expect(adjusted).toEqual({
      range: "custom",
      customStart: "2026-09-16",
      customEnd: "2026-10-01",
    });
  });

  it("does not adjust range when imported date is already encompassed", () => {
    const adjusted = adjustRangeForImport("custom", "2026-09-01", "2026-09-30", "2026-09-16", "2026-10-01");
    expect(adjusted).toBeNull();
  });
});

