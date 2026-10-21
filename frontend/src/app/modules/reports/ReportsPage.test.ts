import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { initialReportSelection, ReportExportActions, ReportPreviewSkeleton, ReportSelector, selectAllReportTypes, shouldApplyPreviewResponse, toggleReportType } from "./ReportsPage";

describe("report multi-selection",()=>{
  it("uses a report-shaped skeleton without replacing it with a large spinner",()=>{
    const markup=renderToStaticMarkup(React.createElement(ReportPreviewSkeleton,{selectedTypes:["SALES"]}));
    expect(markup).toContain("data-report-preview-skeleton");
    expect(markup).toContain("reports-kpi-grid");
    expect(markup).toContain('aria-label="Loading report preview"');
    expect(markup).not.toContain("animate-spin");
    expect(markup).toContain("Libro Espresso Cafe");
    expect(markup).toContain("Sales Report");
    expect(markup).toContain("Scope:");
  });
  it("opens with no report selected",()=>expect(initialReportSelection()).toEqual([]));
  it("selects one and multiple report types in official order",()=>{
    expect(toggleReportType([],"SALES")).toEqual(["SALES"]);
    expect(toggleReportType(["INVENTORY_STATUS"],"SALES")).toEqual(["SALES","INVENTORY_STATUS"]);
  });
  it("clears a selected report and selects all seven without duplicates",()=>{
    expect(toggleReportType(["SALES","SHRINKAGE"],"SALES")).toEqual(["SHRINKAGE"]);
    expect(selectAllReportTypes()).toHaveLength(7);
    expect(new Set(selectAllReportTypes()).size).toBe(7);
  });
  it("renders whole-card accessible buttons without visible checkbox inputs",()=>{
    const markup=renderToStaticMarkup(React.createElement(ReportSelector,{selected:["SALES","SHRINKAGE"],onChange:()=>undefined}));
    expect(markup).not.toContain('type="checkbox"');
    expect(markup.match(/type="button"/g)).toHaveLength(9);
    expect(markup.match(/aria-pressed="true"/g)).toHaveLength(2);
    expect(markup).toContain("border-[var(--app-primary)]");
  });
  it("uses native buttons so Space and Enter retain keyboard activation",()=>{
    const markup=renderToStaticMarkup(React.createElement(ReportSelector,{selected:[],onChange:()=>undefined}));
    expect(markup).toContain('type="button"');
    expect(markup).toContain('aria-pressed="false"');
  });
  it("rejects stale preview responses after a newer request starts",()=>{
    expect(shouldApplyPreviewResponse(3,4)).toBe(false);
    expect(shouldApplyPreviewResponse(4,4)).toBe(true);
  });
  it("renders one disabled PDF and Excel action for an unavailable preview",()=>{
    const markup=renderToStaticMarkup(React.createElement(ReportExportActions,{disabled:true,exporting:null,onExport:()=>undefined}));
    expect(markup.match(/Export PDF/g)).toHaveLength(1);
    expect(markup.match(/Export Excel/g)).toHaveLength(1);
    expect(markup.match(/disabled=""/g)).toHaveLength(2);
  });
});
