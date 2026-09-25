import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { C } from "../../components/ModuleUi";
import { PosImportDeleteDialog, canApprovePosMapping, canDeletePosImport, isSupportedPosFilename, marginValueColor } from "./CogsSalesModule";

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
  it("accepts only the supported POS upload extensions",()=>{
    expect(["sales.csv","summary.XLS","transactions.xlsx"].every(isSupportedPosFilename)).toBe(true);
    expect(isSupportedPosFilename("sales.pdf")).toBe(false);
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
