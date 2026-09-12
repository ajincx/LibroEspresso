import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ReportSelector, selectAllReportTypes, toggleReportType } from "./ReportsPage";

describe("report multi-selection",()=>{
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
});
