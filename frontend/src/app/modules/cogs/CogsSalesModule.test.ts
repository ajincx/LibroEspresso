import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { act, create } from "react-test-renderer";
import { C } from "../../components/ModuleUi";
import {
  DAILY_POS_MONITORING_LOCATION,
  DAILY_POS_MONITORING_IS_PAGINATED,
  DAILY_POS_MONITORING_COLUMNS,
  CogsOverviewKpis,
  OWNER_POS_IMPORT_HISTORY_COLUMNS,
  PosImportActions,
  PosImportDetailsDialog,
  PosImportStatusBadge,
  PosImportCleanupAuthorizationDialog,
  PosImportDeleteDialog,
  PosImportVoidDialog,
  PosFormatRequestRejectDialog,
  PosMappingActions,
  PosMappingEditDialog,
  PosMappingSearch,
  posMappingEmptyMessage,
  PosMappingSetup,
  ApproveAllMappingsDialog,
  ConfirmAndActivatePosDialog,
  SalesPosImportModal,
  STORAGE_KEY_COGS_USER_RANGE,
  canApprovePosMapping,
  canAuthorizePosImportCleanup,
  canDeletePosImport,
  canVoidPosImport,
  canDeletePosSource,
  canEditPosMapping,
  filterPosMappings,
  clearCogsUserRange,
  dailyPosMonitoringView,
  dailyPosStatusLabel,
  formatPosSourceFormatName,
  formatPosSourceOptionLabel,
  getInitialCogsDateRange,
  marginValueColor,
  pendingPosFormatRequests,
  POS_SOURCE_FORMAT_OPTIONS,
  readCogsUserRange,
  requestedPosFormatRequest,
  saveCogsUserRange,
  POS_IMPORT_FIELD_OPTIONS,
  assignPosHeader,
  branchesAvailableForFormatAssignment,
  destinationPosSourceForQuickAssign,
  quickAssignPosSourceInput,
  resolveQuickAssignSource,
  suggestPosField,
  suggestedPosFieldMapping,
  summarizeDailyPosStatuses,
} from "./CogsSalesModule";
import { PosImportModal } from "./PosImportModal";
import { adjustRangeForImport } from "../../utils/businessDate";

describe("COGS Overview KPI scope", () => {
  it("keeps financial COGS KPIs and excludes inventory shrinkage KPIs", () => {
    const markup = renderToStaticMarkup(React.createElement(CogsOverviewKpis, { loading: false, summary: {
      sales: 1000, theoreticalCogs: 400, totalCogs: 400, detectedShortageValue: 25, verifiedShrinkageCost: 10,
      shrinkageCost: 10, shrinkageRate: 1, adjustedCogs: 400, grossProfit: 600, grossMargin: 60, unitsSold: 8, importCount: 1,
    } }));
    expect(markup).toContain("Total Sales");
    expect(markup).toContain("Total COGS");
    expect(markup).toContain("Gross Profit");
    expect(markup).toContain("Gross Margin");
    expect(markup).not.toContain("Detected Shortage");
    expect(markup).not.toContain("Verified Shrinkage");
  });
});
import type { DailyPosUploadStatus, PosFormatSetupRequest, PosImportRecord, PosMapping } from "../../types/inventoryWorkflow";
import type { MenuProduct } from "../../types/masterData";
import { deduplicatePosValidationIssues, excludedInvalidRowCount, PosMappingRecoveryNotice, requiresPosMappingRecovery, UNCONFIGURED_POS_LAYOUT_MESSAGE } from "./posImportPresentation";

describe("POS import recovery and details presentation", () => {
  const formatRequest=(status:PosFormatSetupRequest["status"]):PosFormatSetupRequest=>({
    id:`request-${status}`,branchId:"branch-1",branchName:"Gulod / Main Branch",posSourceId:"source-1",posSourceName:"Libro POS",sourceFilename:"unknown.xlsx",worksheet:"Sales",headerRow:1,headers:["Product","Quantity"],status,validationIssues:null,requestedBy:"manager-1",requestedByName:"Maria Manager",requestedAt:"2026-10-14T00:00:00Z",configuredBy:null,configuredAt:null,completedAt:status==="COMPLETED"?"2026-10-14T01:00:00Z":null,rejectionReason:status==="REJECTED"?"Not an approved sales export.":null,rejectedBy:status==="REJECTED"?"owner-1":null,rejectedByName:status==="REJECTED"?"Olivia Owner":null,rejectedAt:status==="REJECTED"?"2026-10-14T01:00:00Z":null,posImportId:null,
  });

  it("offers column mapping recovery only for layout and mapping errors", () => {
    expect(requiresPosMappingRecovery({ response: { data: { error: { code: "UNSUPPORTED_POS_FORMAT" } } } })).toBe(true);
    expect(requiresPosMappingRecovery({ response: { data: { error: { code: "POS_SOURCE_FORMAT_MISMATCH" } } } })).toBe(false);
    expect(requiresPosMappingRecovery({ response: { data: { error: { code: "POS_IMPORT_DUPLICATE" } } } })).toBe(false);
    const markup = renderToStaticMarkup(React.createElement(PosMappingRecoveryNotice, { onConfigure: () => undefined }));
    expect(markup).toContain(UNCONFIGURED_POS_LAYOUT_MESSAGE);
    expect(markup).toContain("Configure Mapping");
  });

  it("uses the shared Dashboard POS importer instead of a separate Sales importer", () => {
    expect(SalesPosImportModal).toBe(PosImportModal);
  });

  it("requires a reason in the Owner rejection dialog and excludes rejected requests from pending",()=>{
    const target=formatRequest("PENDING");
    const emptyMarkup=renderToStaticMarkup(React.createElement(PosFormatRequestRejectDialog,{target,busy:false,reason:"",onReasonChange:()=>undefined,onCancel:()=>undefined,onConfirm:()=>undefined}));
    const validMarkup=renderToStaticMarkup(React.createElement(PosFormatRequestRejectDialog,{target,busy:false,reason:"The workbook is not an approved export.",onReasonChange:()=>undefined,onCancel:()=>undefined,onConfirm:()=>undefined}));
    expect(emptyMarkup).toContain("Reject POS Format Setup Request?");
    expect(emptyMarkup).toContain("disabled");
    expect(validMarkup).toContain("unknown.xlsx");
    expect(validMarkup).toContain("Reject Request");
    const requests=[formatRequest("PENDING"),formatRequest("BLOCKED"),formatRequest("COMPLETED"),formatRequest("REJECTED")];
    expect(pendingPosFormatRequests(requests).map(request=>request.status)).toEqual(["PENDING","BLOCKED"]);
    expect(requestedPosFormatRequest(requests,"request-PENDING")?.status).toBe("PENDING");
    expect(requestedPosFormatRequest(requests,"request-COMPLETED")).toBeNull();
    expect(requestedPosFormatRequest(requests,"missing")).toBeNull();
  });

  it("suggests only deterministic importer-supported field aliases", () => {
    expect(suggestPosField("Receipt No.")).toBe("transactionId");
    expect(suggestPosField("Quantity Sold")).toBe("quantitySold");
    expect(suggestPosField("Transaction Date")).toBe("businessDate");
    expect(suggestPosField("Product")).toBe("productName");
    expect(suggestPosField("Payment Status")).toBe("status");
    expect(suggestPosField("Cashier")).toBe("");
    expect(POS_IMPORT_FIELD_OPTIONS.map(option=>option.value)).toEqual(["productName","quantitySold","transactionId","businessDate","status","unitPrice","salesAmount"]);
  });

  it("leaves unknown columns ignored while preparing unsaved suggestions", () => {
    const mapping=suggestedPosFieldMapping(["Receipt No.","Product","Quantity Sold","Transaction Date","Payment Status","Unit Price","Cashier"]);
    expect(mapping).toMatchObject({transactionId:"Receipt No.",productName:"Product",quantitySold:"Quantity Sold",businessDate:"Transaction Date",status:"Payment Status",unitPrice:"Unit Price"});
    expect(Object.values(mapping)).not.toContain("Cashier");
  });

  it("prevents a source header from remaining assigned to two Libro fields", () => {
    const initial=suggestedPosFieldMapping(["Product","Quantity"]);
    const reassigned=assignPosHeader(initial,"Product","quantitySold");
    expect(reassigned.productName).toBe("");
    expect(reassigned.quantitySold).toBe("Product");
  });

  it("uses invalidRows as the authoritative excluded/invalid total", () => {
    expect(excludedInvalidRowCount({ invalidRows: 4 })).toBe(4);
  });

  it("renders identical validation issues once while preserving different issues on the same row", () => {
    const quantity = { rowNumber: 2, field: "Quantity", issue: "Quantity must be a valid number." };
    const product = { rowNumber: 2, field: "Product", issue: "Product/item name is required." };
    expect(deduplicatePosValidationIssues([quantity, quantity, product])).toEqual([quantity, product]);
  });
});

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
  it("offers non-destructive voiding only to Owners and requires reason plus confirmation",()=>{
    expect(canVoidPosImport("OWNER",{status:"COMPLETE",isTestData:false})).toBe(true);
    expect(canVoidPosImport("manager",{status:"COMPLETE",isTestData:false})).toBe(false);
    expect(canVoidPosImport("OWNER",{status:"VOIDED",isTestData:false})).toBe(false);
    const target={sourceFilename:"incorrect.xlsx",branchName:"Lipa",businessDate:"2026-09-08"} as PosImportRecord;
    const blocked=renderToStaticMarkup(React.createElement(PosImportVoidDialog,{target,busy:false,reason:"too short",confirmed:false,onReasonChange:()=>undefined,onConfirmedChange:()=>undefined,onCancel:()=>undefined,onConfirm:()=>undefined}));
    const ready=renderToStaticMarkup(React.createElement(PosImportVoidDialog,{target,busy:false,reason:"The accepted report contains incorrect sales.",confirmed:true,onReasonChange:()=>undefined,onConfirmedChange:()=>undefined,onCancel:()=>undefined,onConfirm:()=>undefined}));
    expect(blocked).toContain("disabled");
    expect(ready).toContain("checked");
    expect(ready).toContain("Void Import");
  });
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
    expect(dailyPosMonitoringView("2026-10-01")).toEqual({
      businessDate:"2026-10-01",startDate:"2026-10-01",endDate:"2026-10-01",
      title:"Daily Upload Monitoring",
    });
  });

  it("keeps Daily Upload Monitoring focused on the current day without a redundant history action",()=>{
    expect(dailyPosMonitoringView("2026-10-01")).not.toHaveProperty("actionLabel");
    expect(dailyPosMonitoringView("2026-10-01")).not.toHaveProperty("showDateFilter");
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
    expect(prodMarkup).toContain("View POS.09.16.2026.xlsx");
    expect(prodMarkup).not.toContain("lucide-trash-2");

    // Scenario 3: Branch Manager never sees Delete button even if canCleanup flag were true
    const managerMarkup = renderToStaticMarkup(
      React.createElement(PosImportActions, { role: "manager", record: devImport })
    );
    expect(managerMarkup).toContain("View POS.09.16.2026.xlsx");
    expect(managerMarkup).not.toContain("lucide-trash-2");

    const managerUpperMarkup = renderToStaticMarkup(
      React.createElement(PosImportActions, { role: "BRANCH_MANAGER", record: devImport })
    );
    expect(managerUpperMarkup).toContain("View POS.09.16.2026.xlsx");
    expect(managerUpperMarkup).not.toContain("lucide-trash-2");

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

  it("shows a read-only import detail summary for history records", () => {
    const record = {
      id: "import-1", businessDate: "2026-09-16", sourceFilename: "sales.xlsx",
      posSourceName: "Main POS", posSourceCode: "MAIN_POS", importedAt: "2026-09-16T10:00:00Z",
      branchId: "branch-1", branchName: "Gulod / Main Branch", importedBy: "Owner",
      productLines: 50, unitsSold: 89, totalSales: 15443, status: "COMPLETE",
      totalRows: 96, validRows: 85, warningRows: 0, invalidRows: 0, unmatchedRows: 0,
      fingerprintIndicator: "abcdef", createdEnvironment: "PRODUCTION", cleanupPolicy: "PRODUCTION",
      cleanupAuthorizedBy: null, cleanupAuthorizedAt: null, cleanupReason: null,
      canAuthorizeCleanup: false, canCleanup: false,
      inventoryAccountingTreatment: "HISTORICAL_REPORTING_CUTOVER",
      inventoryAccountingReason: "Sales predate the operational inventory cutover.",
      cogsCostBasis: "HISTORICAL_CONFIGURED_COST_ESTIMATE",
    } as PosImportRecord;
    const statusMarkup = renderToStaticMarkup(React.createElement(PosImportStatusBadge, { record }));
    expect(statusMarkup).toContain("Imported");
    expect(statusMarkup).not.toContain("Historical Reporting");
    expect(statusMarkup).not.toContain("Live Operational Stock");
    expect(statusMarkup).not.toContain("Estimated using configured ingredient costs");

    const onView = vi.fn();
    const actions = create(React.createElement(PosImportActions, { role: "owner", record, onView }));
    act(() => actions.root.findByProps({ "aria-label": "View sales.xlsx" }).props.onClick());
    expect(onView).toHaveBeenCalledOnce();

    const markup = renderToStaticMarkup(React.createElement(PosImportDetailsDialog, { record, onClose: () => undefined }));
    expect(markup).toContain("POS Import Details");
    expect(markup).toContain("Main POS");
    expect(markup).toContain("Gulod / Main Branch");
    expect(markup).toContain("85 of 96");
    expect(markup).toContain("89");
    expect(markup).toContain("Inventory Accounting Treatment");
    expect(markup).toContain("Historical Reporting");
    expect(markup).toContain("Live Operational Stock");
    expect(markup).toContain("Excluded");
    expect(markup).toContain("Estimated using configured ingredient costs");
    expect(markup).toContain("Sales predate the operational inventory cutover.");

    const voidedOperational = { ...record,
      status: "VOIDED",
      inventoryAccountingTreatment: "OPERATIONAL",
      inventoryAccountingReason: "Applied to live inventory when imported.",
      cogsCostBasis: "IMPORT_TIME_CONFIGURED_COST",
      voidReason: "Incorrect source rows.",
      voidedAt: "2026-09-17T10:00:00Z",
    } as PosImportRecord;
    const voidedStatusMarkup = renderToStaticMarkup(React.createElement(PosImportStatusBadge, { record: voidedOperational }));
    expect(voidedStatusMarkup).toContain("VOIDED");
    expect(voidedStatusMarkup).not.toContain("Operational Inventory");
    const operationalDetails = renderToStaticMarkup(React.createElement(PosImportDetailsDialog, { record: voidedOperational, onClose: () => undefined }));
    expect(operationalDetails).toContain("Operational Inventory");
    expect(operationalDetails).toContain("Included");
    expect(operationalDetails).toContain("Calculated using configured ingredient costs at import time");
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
  const pending={id:"mapping-1",posSourceId:"source-1",branchId:null,sourceProductName:"H12 CAPP",sourceProductCode:null,menuItemVariantId:"variant-spanish",menuItemId:"product-spanish",menuItemName:"Spanish Latte",variantName:"Standard",status:"INACTIVE",reviewStatus:"PENDING",reviewComment:null,reviewedBy:null,reviewedAt:null,updatedAt:"2026-10-20T02:00:00.000Z",branchName:null,recipeId:"recipe-1",recipeVersion:1,recipeAvailable:true} as PosMapping;

  it("shows Edit only for inactive Pending mappings",()=>{
    expect(canEditPosMapping(pending)).toBe(true);
    const pendingMarkup=renderToStaticMarkup(React.createElement(PosMappingActions,{mapping:pending,busy:false,canApprove:true,reviewNote:"Needs correction",onEdit:()=>undefined,onReview:()=>undefined,onDeactivate:()=>undefined,onReactivate:()=>undefined}));
    expect(pendingMarkup).toContain("Edit Mapping");
    expect(pendingMarkup).toContain(">Approve</button>");
    expect(pendingMarkup).toContain("border-[var(--app-success)]");
    expect(pendingMarkup).toContain("Reject");
    expect(pendingMarkup).toContain("Ambiguous");
    expect(pendingMarkup).not.toContain("Deactivate");
  });

  it("offers audited editing and deactivation for an active Approved mapping",()=>{
    const approved={...pending,status:"ACTIVE",reviewStatus:"APPROVED",reviewedBy:"owner-1",reviewedAt:"2026-09-25T02:00:00Z"} as PosMapping;
    expect(canEditPosMapping(approved)).toBe(true);
    const markup=renderToStaticMarkup(React.createElement(PosMappingActions,{mapping:approved,busy:false,canApprove:true,reviewNote:"",onEdit:()=>undefined,onReview:()=>undefined,onDeactivate:()=>undefined,onReactivate:()=>undefined}));
    expect(markup).toContain(">Approved</button>");
    expect(markup).toContain("disabled");
    expect(markup).toContain("bg-[var(--app-surface-muted)]");
    expect(markup).toContain(">Deactivate</button>");
    expect(markup).toContain("border-[var(--app-danger)]");
    expect(markup).toContain("Edit Mapping");
  });

  it("offers Reactivate only for an inactive Approved mapping",()=>{
    const inactive={...pending,status:"INACTIVE",reviewStatus:"APPROVED",reviewedBy:"owner-1",reviewedAt:"2026-09-25T02:00:00Z"} as PosMapping;
    const markup=renderToStaticMarkup(React.createElement(PosMappingActions,{mapping:inactive,busy:false,canApprove:true,reviewNote:"",onEdit:()=>undefined,onReview:()=>undefined,onDeactivate:()=>undefined,onReactivate:()=>undefined}));
    expect(markup).toContain(">Reactivate</button>");
    expect(markup).toContain("border-[var(--app-success)]");
    expect(markup).not.toContain(">Deactivate</button>");
    expect(markup).toContain("Edit Mapping");
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

  it("requires an approved-change reason and confirms old versus new values before one save",()=>{
    const product={id:"product-spanish",name:"Spanish Latte",category:"Warm Tales",status:"ACTIVE",approvalStatus:"APPROVED",variants:[{id:"variant-spanish",name:"Standard",status:"ACTIVE",recipeId:"recipe-1",recipeVersion:1}]} as MenuProduct;
    const approved={...pending,status:"ACTIVE",reviewStatus:"APPROVED",reviewedBy:"owner-1",reviewedAt:"2026-09-25T02:00:00Z"} as PosMapping;
    const onSave=vi.fn();
    const renderer=create(React.createElement(PosMappingEditDialog,{mapping:approved,products:[product],branches:[],busy:false,onCancel:()=>undefined,onSave}));
    const root=renderer.root;
    const form=root.findByType("form");
    act(()=>form.props.onSubmit({preventDefault:()=>undefined}));
    expect(root.findByProps({role:"alert"}).children.join("")).toContain("reason is required");
    const posName=root.findByProps({"aria-label":"POS Name"});
    const reason=root.findByProps({"aria-label":"Mapping revision note"});
    act(()=>{posName.props.onChange({target:{value:"H12 CAPPUCCINO"}});reason.props.onChange({target:{value:"Correct exact alias"}});});
    act(()=>form.props.onSubmit({preventDefault:()=>undefined}));
    expect(root.findByProps({id:"edit-pos-mapping-title"}).children.join("")).toBe("Confirm Mapping Changes");
    expect(root.findAllByType("strong").map(node=>node.children.join(" ")).join(" ")).toContain("H12 CAPPUCCINO");
    expect(onSave).not.toHaveBeenCalled();
    act(()=>form.props.onSubmit({preventDefault:()=>undefined}));
    expect(onSave).toHaveBeenCalledOnce();
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({sourceProductName:"H12 CAPPUCCINO",changeReason:"Correct exact alias",expectedUpdatedAt:approved.updatedAt,confirmed:true}));
  });
});

describe("Product Mapping search",()=>{
  const mapping=(id:string,reviewStatus:PosMapping["reviewStatus"],fields:Partial<PosMapping>={}):PosMapping=>({
    id,posSourceId:"source-gulod",branchId:null,sourceProductName:`POS Item ${id}`,sourceProductCode:null,
    menuItemVariantId:`variant-${id}`,menuItemId:`product-${id}`,menuItemName:`Menu Product ${id}`,variantName:"Standard",
    status:"INACTIVE",reviewStatus,reviewComment:null,reviewedBy:null,reviewedAt:null,updatedAt:"2026-10-29T00:00:00.000000Z",
    branchName:null,recipeId:"recipe-1",recipeVersion:1,recipeAvailable:true,...fields,
  });
  const mappings=[
    mapping("aglio","APPROVED",{sourceProductName:"AGLIO Y OLIO",sourceProductCode:"PASTA-01",menuItemName:"Aglio Y Olio",variantName:"Standard",status:"ACTIVE"}),
    mapping("noodles","PENDING",{sourceProductName:"ASIAN NOODLES LARGE",sourceProductCode:"NOOD-L",menuItemName:"Asian Noodles",variantName:"Large"}),
    mapping("bangus","REJECTED",{sourceProductName:"BANGUS",menuItemName:"Annotated Bangus",variantName:"Single Meal"}),
  ];

  it("matches POS name, code, target product, and variant case-insensitively with trimmed input",()=>{
    expect(filterPosMappings(mappings,"ALL","  aglio ").map(row=>row.id)).toEqual(["aglio"]);
    expect(filterPosMappings(mappings,"ALL","pasta-01").map(row=>row.id)).toEqual(["aglio"]);
    expect(filterPosMappings(mappings,"ALL","ANNOTATED").map(row=>row.id)).toEqual(["bangus"]);
    expect(filterPosMappings(mappings,"ALL"," single meal ").map(row=>row.id)).toEqual(["bangus"]);
  });

  it("combines search with status without expanding the source-scoped dataset",()=>{
    expect(filterPosMappings(mappings,"PENDING","noodles").map(row=>row.id)).toEqual(["noodles"]);
    expect(filterPosMappings(mappings,"APPROVED","noodles")).toEqual([]);
    expect(filterPosMappings(mappings,"ALL","")).toHaveLength(3);
    expect(filterPosMappings(mappings,"AMBIGUOUS","")).toEqual([]);
    expect(filterPosMappings(mappings.filter(row=>row.posSourceId==="source-gulod"),"ALL","item").every(row=>row.posSourceId==="source-gulod")).toBe(true);
    expect(posMappingEmptyMessage(mappings.length)).toBe("No matching mappings found");
    expect(posMappingEmptyMessage(0)).toBe("No mappings found for this POS system.");
  });

  it("clears the search immediately and exposes an accessible clear control",()=>{
    const onChange=vi.fn();
    const renderer=create(React.createElement(PosMappingSearch,{value:"aglio",onChange}));
    const root=renderer.root;
    expect(root.findByProps({"aria-label":"Search product mappings"}).props.value).toBe("aglio");
    act(()=>root.findByProps({"aria-label":"Clear mapping search"}).props.onClick());
    expect(onChange).toHaveBeenCalledWith("");
  });
});

describe("POS System and Mapping Setup UX workflow", () => {
  it("formats POS source format names for user readability", () => {
    expect(formatPosSourceFormatName("SUMMARY_ITEMS_SOLD_LEGACY_XLS")).toBe("Libro Espresso - XLS");
    expect(formatPosSourceFormatName("TRANSACTION_SUMMARY_XLSX")).toBe("Libro Espresso - XLSX");
    expect(formatPosSourceFormatName("CANONICAL_CSV")).toBe("Libro Espresso - CSV");
    expect(POS_SOURCE_FORMAT_OPTIONS.slice(0,3).map(option=>option.label)).toEqual([
      "Libro Espresso - XLS",
      "Libro Espresso - XLSX",
      "Libro Espresso - CSV",
    ]);
  });

  it("formats POS system choices with a concise format and readable status",()=>{
    expect(formatPosSourceOptionLabel({displayName:"Evo POS Transaction Summary XLSX",branchName:"Evo",supportedFormat:"TRANSACTION_SUMMARY_XLSX",status:"ACTIVE",formatVerifiedAt:"2026-10-01",fieldMapping:null,hasActiveMappings:true,hasPendingMappings:false})).toBe("Evo POS - Libro Espresso XLSX - Ready");
    expect(formatPosSourceOptionLabel({displayName:"Libro POS Summary Items Sold",branchName:"Gulod / Main Branch",supportedFormat:"SUMMARY_ITEMS_SOLD_LEGACY_XLS",status:"INACTIVE",formatVerifiedAt:null,fieldMapping:null,hasActiveMappings:false,hasPendingMappings:false})).toBe("Gulod Main POS - Libro Espresso XLS - Inactive");
  });

  it("assigns a selected format only to unassigned branches and keeps the source inactive",()=>{
    const branches=[{id:"branch-1",name:"Main Branch"},{id:"branch-2",name:"Lipa Branch"}] as never[];
    const sources=[{branchId:"branch-1",supportedFormat:"CANONICAL_CSV"}] as never[];
    expect(branchesAvailableForFormatAssignment(branches,sources,"CANONICAL_CSV").map(branch=>branch.id)).toEqual(["branch-2"]);
    expect(quickAssignPosSourceInput(branches[1]!,"CANONICAL_CSV","ABC123")).toEqual({sourceCode:"POS_branch2_ABC123",displayName:"Lipa POS",supportedFormat:"CANONICAL_CSV",branchId:"branch-2",status:"INACTIVE"});
    expect(destinationPosSourceForQuickAssign(sources as never,"branch-1","CANONICAL_CSV")).toBe(sources[0]);
    expect(destinationPosSourceForQuickAssign(sources as never,"branch-2","CANONICAL_CSV")).toBeNull();
  });

  it("resolves one or identical approved mapping sets without an arbitrary branch choice",()=>{
    const sourceA={id:"source-a",branchId:"branch-a",hasActiveMappings:true} as never;
    const sourceB={id:"source-b",branchId:"branch-b",hasActiveMappings:true} as never;
    const mapping=(id:string,branchId:string|null,variantId="variant-1")=>({id,posSourceId:"source",branchId,sourceProductName:"Café Latte",sourceProductCode:"LATTE",menuItemVariantId:variantId,status:"ACTIVE",reviewStatus:"APPROVED"}) as never;
    expect(resolveQuickAssignSource([sourceA],{"source-a":[mapping("mapping-a",null)]})).toMatchObject({status:"RESOLVED",source:sourceA});
    expect(resolveQuickAssignSource([sourceB,sourceA],{
      "source-a":[mapping("mapping-a",null)],
      "source-b":[mapping("mapping-b",null)],
    })).toMatchObject({status:"RESOLVED",source:sourceA,sources:[sourceB,sourceA]});
  });

  it("requires an explicit source only when approved mapping sets conflict",()=>{
    const sourceA={id:"source-a",branchId:"branch-a",hasActiveMappings:true} as never;
    const sourceB={id:"source-b",branchId:"branch-b",hasActiveMappings:true} as never;
    const mapping=(id:string,variantId:string)=>({id,posSourceId:"source",branchId:null,sourceProductName:"Latte",sourceProductCode:"LATTE",menuItemVariantId:variantId,status:"ACTIVE",reviewStatus:"APPROVED"}) as never;
    expect(resolveQuickAssignSource([sourceA,sourceB],{
      "source-a":[mapping("mapping-a","variant-a")],
      "source-b":[mapping("mapping-b","variant-b")],
    })).toEqual({status:"CONFLICT",sources:[sourceA,sourceB]});
    expect(resolveQuickAssignSource([sourceA],{"source-a":[]})).toEqual({status:"NONE",sources:[]});
  });

  it("confirms the exact pending mapping count before bulk approval",()=>{
    const markup=renderToStaticMarkup(React.createElement(ApproveAllMappingsDialog,{count:3,busy:false,onCancel:()=>undefined,onConfirm:()=>undefined}));
    expect(markup).toContain("Approve all pending mappings?");
    expect(markup).toContain("approve 3 pending mappings together");
    expect(markup).toContain("Approve All (3)");
  });

  it("summarizes destination, format, mapping count, and atomic activation",()=>{
    const markup=renderToStaticMarkup(React.createElement(ConfirmAndActivatePosDialog,{destination:"Lipa Branch — Lipa POS",format:"Libro Espresso - XLS",count:25,busy:false,onCancel:()=>undefined,onConfirm:()=>undefined}));
    expect(markup).toContain("Confirm and activate this POS?");
    expect(markup).toContain("Lipa Branch — Lipa POS");
    expect(markup).toContain("Libro Espresso - XLS");
    expect(markup).toContain("25 pending");
    expect(markup).toContain("Confirm &amp; Activate");
    expect(markup).toContain("If any check fails, nothing will change");
  });

  it("uses the shared modern Select controls throughout the expanded setup workflow",()=>{
    const markup=renderToStaticMarkup(React.createElement(PosMappingSetup as React.ComponentType<{initialSourceId?:string}>,{initialSourceId:"source-1"}));
    expect(markup).toContain("custom-select-trigger");
    expect(markup).toContain("Libro Espresso - XLS");
    expect(markup).toContain("Select File Format");
    expect(markup).not.toContain("Quick Copy");
    expect(markup).not.toContain("<select");
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

  it("defaults getInitialCogsDateRange to the shared seven-day period with userSelected=false", () => {
    const initial = getInitialCogsDateRange();
    expect(initial.userSelected).toBe(false);
    expect(initial.range).toBe("7d");
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

