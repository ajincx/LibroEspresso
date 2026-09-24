
import PDFDocument from "pdfkit";
import ExcelJS from "exceljs";
import { fileURLToPath } from "node:url";
import type {
  ReportColumn,
  ReportDataset,
  ReportValueType,
} from "./reportDataset.service.js";

export const REPORT_LOGO_PATH=fileURLToPath(new URL("../../../frontend/public/images/logo.jpg",import.meta.url));

const currency = (value: unknown) =>
  `PHP ${Number(value ?? 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const percentage = (value: unknown) =>
  value === null || value === undefined
    ? "N/A"
    : `${Number(value).toFixed(2)}%`;
const manilaDateTime = (value: unknown) =>
  value
    ? new Intl.DateTimeFormat("en-PH", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Manila",
      }).format(new Date(String(value)))
    : "N/A";
export function formatReportValue(value: unknown, type: ReportValueType) {
  if (value === null || value === undefined || value === "") return "N/A";
  if (type === "currency") return currency(value);
  if (type === "percentage") return percentage(value);
  if (type === "datetime") return manilaDateTime(value);
  if (type === "number")
    return Number(value).toLocaleString("en-PH", { maximumFractionDigits: 3 });
  return String(value);
}

export async function renderReportPdf(dataset: ReportDataset): Promise<Buffer> {
  const summaryDescription = dataset.reportGroups
    .flatMap((group) => group.summary)
    .map((item) => `${item.label}: ${formatReportValue(item.value, item.type)}`)
    .join("; ");
  const doc = new PDFDocument({
    size: "A4",
    layout: "landscape",
    margin: 32,
    bufferPages: true,
    info: {
      Title: dataset.metadata.title,
      Author: "LIBRO ESPRESSO CAFE",
      Subject: `${dataset.metadata.periodStart} to ${dataset.metadata.periodEnd}`,
      Keywords: summaryDescription,
    },
  });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
  const completed = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  const pageWidth =
    doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const addHeader = (primary=false) => {
    if(primary){
      const top=doc.page.margins.top,left=doc.page.margins.left;
      doc.image(REPORT_LOGO_PATH,left,top,{fit:[46,46],align:"center",valign:"center"});
      doc.fillColor("#74182b").font("Helvetica-Bold").fontSize(17).text("LIBRO ESPRESSO CAFE",left+58,top+3,{width:pageWidth-58});
      doc.fillColor("#20191b").fontSize(14).text(dataset.metadata.title,left+58,top+25,{width:pageWidth-58});
      doc.y=top+54;
    }else{
      doc.fillColor("#74182b").font("Helvetica-Bold").fontSize(10).text(`LIBRO ESPRESSO CAFE  |  ${dataset.metadata.title}`);
    }
    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor("#5f5558")
      .text(
        `${dataset.metadata.branchName}  |  Period: ${dataset.metadata.periodStart} to ${dataset.metadata.periodEnd}`,
      )
      .text(
        `Generated: ${dataset.metadata.generatedAtDisplay} (${dataset.metadata.timezone})  |  By: ${dataset.metadata.generatedBy} (${dataset.metadata.generatedByRole.replaceAll("_", " ")})`,
      );
    doc.moveDown(0.6);
  };
  addHeader(true);
  const drawSummary = (items: ReportDataset["summary"]) => {
    if (!items.length) return;
    const boxWidth = Math.min(
      170,
      pageWidth / Math.max(1, Math.min(items.length, 4)) - 6,
    );
    let x = doc.page.margins.left,
      y = doc.y + 5;
    for (const item of items) {
      if (x + boxWidth > doc.page.width - doc.page.margins.right) {
        x = doc.page.margins.left;
        y += 43;
      }
      doc
        .roundedRect(x, y, boxWidth, 36, 5)
        .fillAndStroke("#f7f1f3", "#e4d7db");
      doc
        .fillColor("#6f6266")
        .font("Helvetica")
        .fontSize(7)
        .text(item.label, x + 7, y + 6, { width: boxWidth - 14 });
      doc
        .fillColor("#20191b")
        .font("Helvetica-Bold")
        .fontSize(10)
        .text(formatReportValue(item.value, item.type), x + 7, y + 18, {
          width: boxWidth - 14,
        });
      x += boxWidth + 6;
    }
    doc.y = y + 45;
  };
  const drawSectionHeader = (title: string, note?: string) => {
    if (doc.y > doc.page.height - 95) {
      doc.addPage();
      addHeader();
    }
    doc
      .moveDown(0.4)
      .fillColor("#74182b")
      .font("Helvetica-Bold")
      .fontSize(11)
      .text(title);
    if (note) doc.fillColor("#6f6266").font("Helvetica").fontSize(7).text(note);
    doc.moveDown(0.35);
  };
  const drawColumns = (columns: ReportColumn[]) => {
    const width = pageWidth / columns.length;
    const y = doc.y;
    doc.rect(doc.page.margins.left, y, pageWidth, 20).fill("#74182b");
    columns.forEach((column, index) =>
      doc
        .fillColor("#ffffff")
        .font("Helvetica-Bold")
        .fontSize(6.5)
        .text(column.label, doc.page.margins.left + index * width + 3, y + 6, {
          width: width - 6,
          height: 12,
          ellipsis: true,
        }),
    );
    doc.y = y + 20;
  };
  for (const group of dataset.reportGroups) {
    if (doc.y > doc.page.height - 120) {
      doc.addPage();
      addHeader();
    }
    doc
      .moveDown(0.5)
      .fillColor("#20191b")
      .font("Helvetica-Bold")
      .fontSize(14)
      .text(group.title);
    drawSummary(group.summary);
    for (const reportSection of group.sections) {
      drawSectionHeader(reportSection.title, reportSection.note);
      drawColumns(reportSection.columns);
      if (!reportSection.rows.length) {
        doc
          .fillColor("#6f6266")
          .font("Helvetica")
          .fontSize(8)
          .text("No records were found for the selected period.", {
            align: "center",
          });
        doc.moveDown();
        continue;
      }
      const width = pageWidth / reportSection.columns.length;
      for (const [index, row] of reportSection.rows.entries()) {
        if (doc.y > doc.page.height - 58) {
          doc.addPage();
          addHeader();
          drawSectionHeader(
            group.title + " — " + reportSection.title + " (continued)",
          );
          drawColumns(reportSection.columns);
        }
        const y = doc.y;
        doc
          .rect(doc.page.margins.left, y, pageWidth, 18)
          .fill(index % 2 ? "#faf7f8" : "#ffffff");
        reportSection.columns.forEach((column, columnIndex) =>
          doc
            .fillColor("#20191b")
            .font("Helvetica")
            .fontSize(6.2)
            .text(
              formatReportValue(row[column.key], column.type),
              doc.page.margins.left + columnIndex * width + 3,
              y + 5,
              {
                width: width - 6,
                height: 10,
                ellipsis: true,
                align:
                  column.type === "number" ||
                  column.type === "currency" ||
                  column.type === "percentage"
                    ? "center"
                    : "left",
              },
            ),
        );
        doc.y = y + 18;
      }
      doc.moveDown(0.4);
    }
  }
  const range = doc.bufferedPageRange();
  for (let index = range.start; index < range.start + range.count; index++) {
    doc.switchToPage(index);
    doc
      .font("Helvetica")
      .fontSize(7)
      .fillColor("#7d7074")
      .text(
        `Libro Espresso Reporting System  |  Generated ${dataset.metadata.generatedAtDisplay}  |  Page ${index - range.start + 1} of ${range.count}`,
        32,
        doc.page.height - 24,
        { width: doc.page.width - 64, align: "center", lineBreak: false },
      );
  }
  doc.end();
  return completed;
}

function excelValue(value: unknown, type: ReportValueType) {
  if (value === null || value === undefined || value === "") return null;
  if (type === "currency" || type === "percentage" || type === "number")
    return Number(value);
  if (type === "datetime") return new Date(String(value));
  if (type === "date" && /^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
    const [year, month, day] = String(value).split("-").map(Number);
    return new Date(Date.UTC(year!, month! - 1, day, 12));
  }
  return String(value);
}

export async function renderReportXlsx(
  dataset: ReportDataset,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Libro Espresso Reporting System";
  workbook.created = new Date(dataset.metadata.generatedAt);
  const summary = workbook.addWorksheet("Summary", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  summary.columns = [
    { header: "Report Information", key: "label", width: 32 },
    { header: "Value", key: "value", width: 34 },
  ];
  [
    ["Report", dataset.metadata.title],
    ["Branch Scope", dataset.metadata.branchName],
    [
      "Period",
      `${dataset.metadata.periodStart} to ${dataset.metadata.periodEnd}`,
    ],
    [
      "Generated",
      `${dataset.metadata.generatedAtDisplay} (${dataset.metadata.timezone})`,
    ],
    [
      "Generated By",
      `${dataset.metadata.generatedBy} (${dataset.metadata.generatedByRole.replaceAll("_", " ")})`,
    ],
  ].forEach(([label, value]) => summary.addRow({ label, value }));
  for (const group of dataset.reportGroups) {
    summary.addRow({});
    summary.addRow({ label: group.title, value: "Selected" });
    for (const item of group.summary) {
      const row = summary.addRow({
        label: item.label,
        value: excelValue(item.value, item.type),
      });
      if (item.type === "currency") row.getCell(2).numFmt = '"PHP" #,##0.00';
      if (item.type === "percentage") row.getCell(2).numFmt = '0.00"%"';
    }
  }
  for (const sheet of workbook.worksheets)
    sheet.getRow(1).eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF74182B" },
      };
    });
  const usedNames = new Set<string>(["Summary"]);
  dataset.reportGroups.forEach((group, index) => {
    let name =
      group.title.replace(/[\\/?*\[\]:]/g, " ").slice(0, 31) ||
      `Report ${index + 1}`;
    while (usedNames.has(name)) name = `${name.slice(0, 27)} ${index + 1}`;
    usedNames.add(name);
    const sheet = workbook.addWorksheet(name, {
      views: [{ state: "frozen", ySplit: 2 }],
    });
    let firstHeaderRow: number | null = null;
    let firstFilterEndRow: number | null = null;
    for (const reportSection of group.sections) {
      const width = Math.max(1, reportSection.columns.length);
      const titleRow = sheet.addRow([reportSection.title]);
      sheet.mergeCells(titleRow.number, 1, titleRow.number, width);
      titleRow.getCell(1).font = {
        bold: true,
        color: { argb: "FF74182B" },
        size: 12,
      };
      const headerRow = sheet.addRow(
        reportSection.columns.map((column) => column.label),
      );
      firstHeaderRow ??= headerRow.number;
      headerRow.eachCell((cell, columnIndex) => {
        cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FF74182B" },
        };
        cell.alignment = {
          vertical: "middle",
          horizontal:
            reportSection.columns[columnIndex - 1]?.type === "text"
              ? "left"
              : "center",
          wrapText: true,
        };
      });
      for (const value of reportSection.rows) {
        const row = sheet.addRow(
          reportSection.columns.map((column) =>
            excelValue(value[column.key], column.type),
          ),
        );
        reportSection.columns.forEach((column, columnIndex) => {
          const cell = row.getCell(columnIndex + 1);
          cell.alignment = {
            horizontal: column.type === "text" ? "left" : "center",
          };
          if (column.type === "currency") cell.numFmt = '"PHP" #,##0.00';
          if (column.type === "percentage") cell.numFmt = '0.00"%"';
          if (column.type === "date") cell.numFmt = "mmm d, yyyy";
          if (column.type === "datetime")
            cell.numFmt = "mmm d, yyyy h:mm AM/PM";
        });
      }
      if(firstFilterEndRow===null) firstFilterEndRow=Math.max(headerRow.number,sheet.rowCount);
      sheet.addRow([]);
      reportSection.columns.forEach((column, columnIndex) => {
        const current = sheet.getColumn(columnIndex + 1);
        current.width = Math.max(
          current.width ?? 0,
          Math.min(42, Math.max(column.width ?? 14, column.label.length + 3)),
        );
      });
    }
    if (firstHeaderRow && firstFilterEndRow && group.sections[0])
      sheet.autoFilter = {
        from: { row: firstHeaderRow, column: 1 },
        to: {
          row: firstFilterEndRow,
          column: group.sections[0].columns.length,
        },
      };
  });
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
