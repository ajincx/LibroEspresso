import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { POS_SOURCE_FORMATS } from "./posCsvImport.service.js";
import {
  TRANSACTION_SUMMARY_BLOCK_REASON,
  detectPosExcelFormat,
  parsePosExcel,
  validateExcelFileSignature,
} from "./posExcelImport.service.js";

const row = (entries: Record<number, unknown>) => {
  const values: unknown[] = [];
  Object.entries(entries).forEach(([index, value]) => { values[Number(index)] = value; });
  return values;
};

function workbookBuffer(rows: unknown[][], bookType: "xls" | "xlsx", extraSheets: unknown[][][] = []) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), "Sheet1");
  extraSheets.forEach((sheetRows, index) => XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(sheetRows), `Sheet${index + 2}`));
  return Buffer.from(XLSX.write(workbook, { type: "buffer", bookType }));
}

function legacyRows(options?: { mismatch?: boolean; zero?: boolean; secondDate?: boolean; malformed?: boolean }) {
  const rows: unknown[][] = [
    ["LIBRO ESPRESSO"],
    ["From: 09/16/2026 to 09/16/2026"],
    ["SUMMARY ITEMS SOLD"],
    ["---"],
    ["QTY", "DESCRIPTION", null, null, null, null, null, null, null, null, null, null, null, null, "AMOUNT"],
    ["---"],
    row({ 0: "DATE", 7: ":", 9: "09/16/2026" }),
    row({ 0: "O.R.#", 7: ":", 9: "OR-1" }),
    row({ 0: "TRXN.#", 7: ":", 9: "TX-1" }),
    row({ 0: "TABLE NO:", 7: ":", 9: "T1" }),
    row({ 0: 2, 2: "Spanish Latte", 11: 100, 15: options?.mismatch ? 150 : 200 }),
    row({ 0: 1, 2: "Americano", 11: options?.malformed ? null : 80, 15: 80 }),
  ];
  if (options?.zero) rows.push(row({ 0: 1, 2: "12OZ PAPER CUP", 11: 0, 15: 0 }));
  rows.push(row({ 0: options?.zero ? 4 : 3, 12: options?.mismatch ? 230 : 280 }));
  if (options?.secondDate) {
    rows.push(
      row({ 0: "DATE", 7: ":", 9: "09/17/2026" }),
      row({ 0: "O.R.#", 7: ":", 9: "OR-2" }),
      row({ 0: "TRXN.#", 7: ":", 9: "TX-2" }),
      row({ 0: "TABLE NO:", 7: ":", 9: "T2" }),
      row({ 0: 1, 2: "Americano", 11: 80, 15: 80 }),
      row({ 0: 1, 12: 80 }),
    );
  }
  rows.push(row({ 4: "TOTAL:", 14: 9999 }), row({ 4: "NET AMOUNT:", 14: 9000 }));
  return rows;
}

const transactionHeaders = [
  "Store", "Machine ID", "OR No.", "Date", "Payment Time", "Item Name(s)",
  "Item Qty.", "Due Amt.", "Gross Amt.", "Status", "Voided by",
];

function transactionRows(options?: { items?: string; itemQty?: number; status?: string }) {
  return [
    transactionHeaders,
    ["LIBRO ESPRESSO", "M-1", "OR-1", "2026-09-16 09:00:00", "2026-09-16 09:05:00", options?.items ?? "Americanox1.0000; Spanish Lattex2.0000", options?.itemQty ?? 3, 380, 400, options?.status ?? "Paid", "--"],
    ["Total", null, null, null, null, null, 3, 380, 400],
    ["Success Transaction", 1],
  ];
}

describe("POS Excel format detection and file validation", () => {
  it("detects the legacy format from structure even when the file is renamed", () => {
    const parsed = parsePosExcel("renamed-export.xls", workbookBuffer(legacyRows(), "xls"));
    expect(parsed.sourceFormat).toBe(POS_SOURCE_FORMATS.LEGACY_SUMMARY);
    expect(parsed.formatLabel).toContain("Legacy XLS");
  });

  it("detects the transaction-summary format from its known headers", () => {
    const parsed = parsePosExcel("anything.xlsx", workbookBuffer(transactionRows(), "xlsx"));
    expect(parsed.sourceFormat).toBe(POS_SOURCE_FORMATS.TRANSACTION_SUMMARY);
  });

  it("rejects unsupported and ambiguous workbook structures", () => {
    expect(() => parsePosExcel("unknown.xlsx", workbookBuffer([["Something else"]], "xlsx"))).toThrow(/does not match/);
    const ambiguousBuffer = workbookBuffer(legacyRows(), "xlsx", [transactionRows()]);
    expect(() => parsePosExcel("ambiguous.xlsx", ambiguousBuffer)).toThrow(/more than one/);
  });

  it("rejects corrupted workbooks and extension/signature mismatches", () => {
    expect(() => validateExcelFileSignature("broken.xlsx", Buffer.from("not a workbook"))).toThrow(/do not match/);
    expect(() => parsePosExcel("wrong.xlsx", workbookBuffer(legacyRows(), "xls"))).toThrow(/do not match/);
  });

  it("detects against workbook content rather than worksheet order", () => {
    const workbook = XLSX.read(workbookBuffer(transactionRows(), "xlsx"), { type: "buffer" });
    expect(detectPosExcelFormat(workbook)).toMatchObject({ sourceFormat: POS_SOURCE_FORMATS.TRANSACTION_SUMMARY, worksheet: "Sheet1" });
  });
});

describe("Summary Items Sold legacy XLS adapter", () => {
  it("extracts repeated metadata, multiple products, quantity, price, and line amount", () => {
    const parsed = parsePosExcel("summary.xls", workbookBuffer(legacyRows(), "xls"));
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0]).toMatchObject({
      sourceProduct: "Spanish Latte", quantitySold: 2, unitPrice: 100, lineAmount: 200,
      businessDate: "2026-09-16", transactionId: "TX-1", sourceOrNumber: "OR-1",
      sourceTransactionNumber: "TX-1", sourceWorksheet: "Sheet1", sourceRow: 11,
    });
    expect(parsed.rows[1]).toMatchObject({ sourceProduct: "Americano", quantitySold: 1, unitPrice: 80, lineAmount: 80 });
    expect(parsed.importBlockedReason).toBeNull();
  });

  it("excludes footer totals and preserves zero-price operational lines as warnings", () => {
    const parsed = parsePosExcel("summary.xls", workbookBuffer(legacyRows({ zero: true }), "xls"));
    expect(parsed.rows).toHaveLength(3);
    expect(parsed.rows.some((item) => item.sourceProduct === "TOTAL:")).toBe(false);
    expect(parsed.rows[2]).toMatchObject({ sourceProduct: "12OZ PAPER CUP", unitPrice: 0, lineAmount: 0, status: "WARNING" });
    expect(parsed.rows[2]!.issues.join(" ")).toMatch(/requires review/);
  });

  it("blocks import when quantity multiplied by apparent price does not match line amount", () => {
    const parsed = parsePosExcel("summary.xls", workbookBuffer(legacyRows({ mismatch: true }), "xls"));
    expect(parsed.importBlockedReason).toMatch(/could not be reliably validated/);
    expect(parsed.rows.every((item) => item.status === "INVALID")).toBe(true);
  });

  it("keeps malformed item rows visible and invalid", () => {
    const parsed = parsePosExcel("summary.xls", workbookBuffer(legacyRows({ malformed: true }), "xls"));
    expect(parsed.rows[1]).toMatchObject({ sourceProduct: "Americano", unitPrice: null, status: "INVALID" });
    expect(parsed.rows[1]!.issues.join(" ")).toMatch(/unit-price value/);
  });

  it("rejects one import containing multiple business dates", () => {
    const parsed = parsePosExcel("summary.xls", workbookBuffer(legacyRows({ secondDate: true }), "xls"));
    expect(parsed.businessDate).toBeNull();
    expect(parsed.rows.every((item) => item.status === "INVALID")).toBe(true);
  });
});

describe("Transaction Summary XLSX adapter", () => {
  it("parses individual product tokens and quantities but never allocates transaction totals", () => {
    const parsed = parsePosExcel("transactions.xlsx", workbookBuffer(transactionRows(), "xlsx"));
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows.map((item) => [item.sourceProduct, item.quantitySold])).toEqual([["Americano", 1], ["Spanish Latte", 2]]);
    expect(parsed.rows.every((item) => item.unitPrice === null && item.lineAmount === null)).toBe(true);
    expect(parsed.rows.every((item) => item.status === "INVALID")).toBe(true);
    expect(parsed.importBlockedReason).toBe(TRANSACTION_SUMMARY_BLOCK_REASON);
  });

  it("supports a single product and excludes report summary rows", () => {
    const parsed = parsePosExcel("transactions.xlsx", workbookBuffer(transactionRows({ items: "Americanox1.0000", itemQty: 1 }), "xlsx"));
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]).toMatchObject({ sourceProduct: "Americano", quantitySold: 1, transactionId: "OR-1", transactionStatus: "Paid" });
  });

  it("reports malformed product tokens, quantity mismatches, and non-paid status", () => {
    const parsed = parsePosExcel("transactions.xlsx", workbookBuffer(transactionRows({ items: "Malformed token", itemQty: 2, status: "Voided" }), "xlsx"));
    expect(parsed.rows[0]!.issues.join(" ")).toMatch(/malformed product token.*do not match Item Qty.*Voided/s);
  });
});
