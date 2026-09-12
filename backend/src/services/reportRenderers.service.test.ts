import ExcelJS from "exceljs";
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  formatReportValue,
  REPORT_LOGO_PATH,
  renderReportPdf,
  renderReportXlsx,
} from "./reportRenderers.service.js";
import type { ReportDataset } from "./reportDataset.service.js";

const fixture: ReportDataset = {
  metadata: {
    reportType: "COGS_PROFITABILITY",
    reportTypes: ["COGS_PROFITABILITY"],
    title: "COGS and Profitability Report",
    branchId: null,
    branchName: "All Branches",
    periodStart: "2026-09-01",
    periodEnd: "2026-09-30",
    generatedAt: "2026-09-30T12:00:00.000Z",
    generatedAtDisplay: "Sep 30, 2026, 8:00:00 PM",
    generatedBy: "Carlos Mendoza",
    generatedByRole: "OWNER",
    timezone: "Asia/Manila",
    filenameBase:
      "Libro_Espresso_COGS_and_Profitability_Report_All_Branches_2026-09-01_to_2026-09-30",
  },
  summary: [
    { key: "sales", label: "Total Sales", value: 1000, type: "currency" },
    { key: "margin", label: "Gross Margin", value: 60, type: "percentage" },
  ],
  sections: [
    {
      title: "Product Profitability",
      totalRows: 1,
      columns: [
        { key: "product", label: "Product", type: "text" },
        { key: "revenue", label: "Revenue", type: "currency" },
        { key: "margin", label: "Gross Margin", type: "percentage" },
        { key: "date", label: "Business Date", type: "date" },
      ],
      rows: [
        { product: "Espresso", revenue: 1000, margin: 60, date: "2026-09-01" },
      ],
    },
  ],
  reportGroups: [],
  pagination: { page: 1, pageSize: 50, totalRows: 1, totalPages: 1 },
};
fixture.reportGroups = [{ reportType: "COGS_PROFITABILITY", title: "COGS and Profitability", summary: fixture.summary, sections: fixture.sections }];

describe("professional report renderers", () => {
  it("generates a valid non-empty PDF", async () => {
    const pdf = await renderReportPdf(fixture);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(1000);
  });
  it("embeds the official local logo and uppercase company masthead in the PDF",async()=>{
    expect(existsSync(REPORT_LOGO_PATH)).toBe(true);
    const pdf=await renderReportPdf(fixture);const text=pdf.toString("latin1");
    expect(text).toContain("/Subtype /Image");
    expect(text).toContain("LIBRO ESPRESSO CAFE");
  });
  it("includes report metadata in the PDF binary", async () => {
    const pdf = await renderReportPdf(fixture);
    const text = pdf.toString("latin1");
    expect(text).toContain("COGS and Profitability Report");
    expect(text).toContain("2026-09-01 to 2026-09-30");
  });
  it("renders the same summary total supplied by the preview dataset", async () => {
    const pdf = await renderReportPdf(fixture);
    expect(pdf.toString("latin1")).toContain("PHP 1,000.00");
  });
  it("generates a valid XLSX with summary and detail sheets", async () => {
    const binary = await renderReportXlsx(fixture);
    expect(binary.subarray(0, 2).toString()).toBe("PK");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(binary as any);
    expect(workbook.getWorksheet("Summary")).toBeTruthy();
    expect(workbook.getWorksheet("COGS and Profitability")).toBeTruthy();
  });
  it("keeps amounts and percentages as numeric XLSX cells with formats", async () => {
    const binary = await renderReportXlsx(fixture);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(binary as any);
    const summary = workbook.getWorksheet("Summary")!;
    const detail = workbook.getWorksheet("COGS and Profitability")!;
    expect(typeof summary.getCell("B9").value).toBe("number");
    expect(detail.getCell("B3").value).toBe(1000);
    expect(detail.getCell("B3").numFmt).toContain("PHP");
    expect(detail.getCell("C3").numFmt).toContain("%");
  });
  it("keeps the supplied preview totals in the XLSX Summary sheet", async () => {
    const binary = await renderReportXlsx(fixture);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(binary as any);
    expect(workbook.getWorksheet("Summary")!.getCell("B9").value).toBe(1000);
  });
  it("creates one combined PDF and selected logical XLSX worksheets for multiple reports", async () => {
    const salesSection={title:"Sales Detail",totalRows:1,columns:[{key:"product",label:"Product",type:"text" as const},{key:"sales",label:"Sales",type:"currency" as const}],rows:[{product:"Espresso",sales:500}]};
    const multi:ReportDataset={...fixture,metadata:{...fixture.metadata,reportType:"ALL_REPORTS",reportTypes:["SALES","COGS_PROFITABILITY"],title:"Selected Reports"},summary:[],sections:[salesSection,...fixture.sections],reportGroups:[{reportType:"SALES",title:"Sales",summary:[{key:"sales",label:"Total Sales",value:500,type:"currency"}],sections:[salesSection]},fixture.reportGroups[0]!]};
    const pdf=await renderReportPdf(multi);const binary=await renderReportXlsx(multi);const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(binary as any);
    expect(pdf.subarray(0,5).toString()).toBe("%PDF-");
    expect(pdf.toString("latin1")).not.toContain("Inventory Status");
    expect(workbook.worksheets.map(sheet=>sheet.name)).toEqual(["Summary","Sales","COGS and Profitability"]);
    expect(workbook.getWorksheet("Inventory Status")).toBeUndefined();
  });
  it("preserves date-only report display without timezone shifting", () =>
    expect(formatReportValue("2026-09-01", "date")).toBe("2026-09-01"));
  it("handles empty report sections safely", async () => {
    const empty = {
      ...fixture,
      sections: [{ ...fixture.sections[0]!, rows: [], totalRows: 0 }],
      reportGroups: [{ ...fixture.reportGroups[0]!, sections: [{ ...fixture.sections[0]!, rows: [], totalRows: 0 }] }],
    };
    const [pdf, xlsx] = await Promise.all([
      renderReportPdf(empty),
      renderReportXlsx(empty),
    ]);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(xlsx.subarray(0, 2).toString()).toBe("PK");
  });
});
