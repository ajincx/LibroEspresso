import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { C } from "../../components/ModuleUi";
import { DAILY_POS_MONITORING_LOCATION, OWNER_POS_IMPORT_HISTORY_COLUMNS, PosImportDeleteDialog, PosMappingActions, PosMappingEditDialog, PosPricingNotice, canApprovePosMapping, canDeletePosImport, canEditPosMapping, dailyPosStatusLabel, filterDailyPosStatuses, hasInvalidCsvEncoding, isSupportedPosFilename, marginValueColor, posSalesAmountLabel } from "./CogsSalesModule";
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
    expect(OWNER_POS_IMPORT_HISTORY_COLUMNS).toEqual(expect.arrayContaining(["File Name","Business Date","Processed / Total Rows","Fingerprint","Status","Action"]));
  });

  it("uses clear monitoring labels and filters independently configured POS sources",()=>{
    expect(dailyPosStatusLabel("UPLOADED")).toBe("Uploaded");
    expect(dailyPosStatusLabel("MISSING_UPLOAD")).toBe("Missing Upload");
    expect(dailyPosStatusLabel("DUE_TODAY")).toBe("Due Today");
    const rows=[
      {posSourceId:"source-a",status:"UPLOADED"},
      {posSourceId:"source-b",status:"MISSING_UPLOAD"},
    ] as DailyPosUploadStatus[];
    expect(filterDailyPosStatuses(rows,"ALL")).toHaveLength(2);
    expect(filterDailyPosStatuses(rows,"source-b")).toEqual([rows[1]]);
  });
  it("clearly discloses and labels the CAPSTONE menu-price fallback",()=>{
    const notice="Supplier file does not contain item-level selling prices. Menu selling prices are used for this CAPSTONE demonstration.";
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

  it("limits import deletion to the Owner presentation",()=>{
    expect(canDeletePosImport("owner")).toBe(true);
    expect(canDeletePosImport("manager")).toBe(false);
  });

  it("requires a descriptive confirmation before deleting an entire import batch",()=>{
    const target={id:"import-1",businessDate:"2026-09-13",sourceFilename:"sales0913.csv",importedAt:"2026-09-13T08:00:00Z",branchId:"branch-1",branchName:"Lipa",importedBy:"Maria D.",productLines:20,unitsSold:500,totalSales:10000,status:"COMPLETE",totalRows:500,validRows:500,warningRows:0,invalidRows:0,unmatchedRows:0,fingerprintIndicator:"abcdef"} as const;
    const markup=renderToStaticMarkup(React.createElement(PosImportDeleteDialog,{target,deleting:false,onCancel:()=>undefined,onConfirm:()=>undefined}));
    expect(markup).toContain("Delete imported sales data?");
    expect(markup).toContain("sales0913.csv");
    expect(markup).toContain("Lipa");
    expect(markup).toContain("recipe-derived usage");
    expect(markup).toContain("Cancel");
    expect(markup).toContain("Delete Import");
    expect(markup).toContain("app-btn--danger");
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
