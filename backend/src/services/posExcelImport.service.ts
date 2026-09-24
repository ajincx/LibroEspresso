import * as XLSX from "xlsx";
import {
  MAX_POS_ROWS,
  POS_SOURCE_FORMATS,
  PosCsvError,
  enforceSingleBusinessDate,
  hashCanonicalPosRows,
  type ParsedPosDocument,
  type ParsedPosRow,
  type PosSourceFormat,
} from "./posCsvImport.service.js";

export const MAX_POS_FILE_BYTES = 4_000_000;
export const TRANSACTION_SUMMARY_BLOCK_REASON =
  "This POS export contains transaction-level totals but does not contain item-level selling prices or line amounts. Please upload the supplier's detailed line-item sales export.";

const REQUIRED_TRANSACTION_HEADERS = [
  "store", "machine id", "or no.", "date", "payment time", "item name(s)",
  "item qty.", "due amt.", "gross amt.", "status", "voided by",
] as const;

type SheetRows = unknown[][];

export interface DetectedPosFormat {
  sourceFormat: Exclude<PosSourceFormat, "CANONICAL_CSV">;
  worksheet: string;
  headerRow?: number;
}

const text = (value: unknown) => String(value ?? "").replace(/^\t/, "").trim();
const normalized = (value: unknown) => text(value).replace(/\s+/g, " ").toLowerCase();
const numberValue = (value: unknown) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const cleaned = text(value).replace(/[₱,]/g, "");
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
};

function workbookRows(workbook: XLSX.WorkBook, worksheet: string): SheetRows {
  const sheet = workbook.Sheets[worksheet];
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: null, blankrows: true }) as SheetRows;
}

function isLegacySignature(buffer: Buffer) {
  const expected = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
  return expected.every((value, index) => buffer[index] === value);
}

function isZipSignature(buffer: Buffer) {
  return buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b && [0x03, 0x05, 0x07].includes(buffer[2] ?? -1);
}

export function validateExcelFileSignature(sourceFilename: string, fileBuffer: Buffer) {
  if (!fileBuffer.length) throw new PosCsvError("EMPTY_POS_FILE", "The selected POS file is empty.");
  if (fileBuffer.length > MAX_POS_FILE_BYTES) throw new PosCsvError("POS_FILE_TOO_LARGE", "POS files must be 4 MB or smaller.");
  const extension = sourceFilename.toLowerCase().split(".").pop();
  if (extension === "xls" && !isLegacySignature(fileBuffer)) {
    throw new PosCsvError("INVALID_POS_FILE_SIGNATURE", "The file contents do not match a valid legacy .xls workbook.");
  }
  if (extension === "xlsx" && !isZipSignature(fileBuffer)) {
    throw new PosCsvError("INVALID_POS_FILE_SIGNATURE", "The file contents do not match a valid .xlsx workbook.");
  }
  if (extension !== "xls" && extension !== "xlsx") {
    throw new PosCsvError("UNSUPPORTED_POS_FILE", "Select a CSV, XLS, or XLSX POS file.");
  }
}

function readWorkbook(sourceFilename: string, fileBuffer: Buffer) {
  validateExcelFileSignature(sourceFilename, fileBuffer);
  try {
    return XLSX.read(fileBuffer, { type: "buffer", raw: true, cellDates: false });
  } catch {
    throw new PosCsvError("CORRUPTED_POS_WORKBOOK", "The POS workbook is corrupted or cannot be read.");
  }
}

function hasLegacySignature(rows: SheetRows) {
  const cells = rows.flat().map((cell) => normalized(cell)).filter(Boolean);
  const count = (label: string) => cells.filter((cell) => cell === label).length;
  return cells.includes("libro espresso") && cells.includes("summary items sold")
    && count("date") > 0 && count("o.r.#") > 0 && count("trxn.#") > 0
    && (count("table no:") > 0 || count("table no") > 0)
    && cells.includes("qty") && cells.includes("description") && cells.includes("amount");
}

function transactionHeaderRow(rows: SheetRows) {
  return rows.findIndex((row) => {
    const headers = new Set(row.map((cell) => normalized(cell)));
    return REQUIRED_TRANSACTION_HEADERS.every((header) => headers.has(header));
  });
}

export function detectPosExcelFormat(workbook: XLSX.WorkBook): DetectedPosFormat {
  const matches: DetectedPosFormat[] = [];
  for (const worksheet of workbook.SheetNames) {
    const rows = workbookRows(workbook, worksheet);
    if (hasLegacySignature(rows)) matches.push({ sourceFormat: POS_SOURCE_FORMATS.LEGACY_SUMMARY, worksheet });
    const headerRow = transactionHeaderRow(rows);
    if (headerRow >= 0) matches.push({ sourceFormat: POS_SOURCE_FORMATS.TRANSACTION_SUMMARY, worksheet, headerRow: headerRow + 1 });
  }
  if (!matches.length) throw new PosCsvError("UNSUPPORTED_POS_FORMAT", "The workbook structure does not match a supported POS export format.");
  if (matches.length > 1) throw new PosCsvError("AMBIGUOUS_POS_FORMAT", "The workbook matches more than one supported POS format. Upload a single unambiguous POS export.");
  return matches[0]!;
}

function followingValue(row: unknown[], labelIndex: number) {
  for (let index = labelIndex + 1; index < row.length; index += 1) {
    const value = row[index];
    if (value !== null && value !== undefined && text(value) && text(value) !== ":") return value;
  }
  return null;
}

function businessDate(value: unknown) {
  if (typeof value === "number") {
    const parts = XLSX.SSF.parse_date_code(value);
    if (!parts) return null;
    return `${String(parts.y).padStart(4, "0")}-${String(parts.m).padStart(2, "0")}-${String(parts.d).padStart(2, "0")}`;
  }
  const valueText = text(value);
  const iso = valueText.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const us = valueText.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (us) return `${us[3]}-${us[1]!.padStart(2, "0")}-${us[2]!.padStart(2, "0")}`;
  return null;
}

function applyIssue(row: ParsedPosRow, issue: string, invalid = true) {
  if (!row.issues.includes(issue)) row.issues.push(issue);
  if (invalid) row.status = "INVALID";
  else if (row.status === "VALID") row.status = "WARNING";
}

function parseLegacySummary(rows: SheetRows, worksheet: string): ParsedPosDocument {
  const parsedRows: ParsedPosRow[] = [];
  let currentDate: string | null = null;
  let currentOr: string | null = null;
  let currentTransaction: string | null = null;
  let transactionRows: ParsedPosRow[] = [];
  let positivePriceRows = 0;
  let structurallyValidPriceRows = 0;
  let footerReached = false;

  const finishTransaction = (subtotalQuantity?: number | null, subtotalAmount?: number | null) => {
    if (!transactionRows.length) return;
    if (subtotalQuantity !== undefined && subtotalQuantity !== null) {
      const actualQuantity = transactionRows.reduce((sum, row) => sum + (row.quantitySold ?? 0), 0);
      if (Math.abs(actualQuantity - subtotalQuantity) > 0.0001) transactionRows.forEach((row) => applyIssue(row, "Transaction item quantities do not match the displayed transaction subtotal."));
    }
    if (subtotalAmount !== undefined && subtotalAmount !== null) {
      const actualAmount = transactionRows.reduce((sum, row) => sum + (row.lineAmount ?? 0), 0);
      if (Math.abs(actualAmount - subtotalAmount) > 0.01) transactionRows.forEach((row) => applyIssue(row, "Transaction line amounts do not match the displayed transaction subtotal."));
    }
    transactionRows = [];
  };

  rows.forEach((row, index) => {
    const rowNumber = index + 1;
    const rowCells = row.map((cell) => normalized(cell));
    if (rowCells.includes("total:") || rowCells.includes("net amount:")) {
      finishTransaction(); footerReached = true; return;
    }
    if (footerReached) return;
    const dateIndex = rowCells.indexOf("date");
    if (dateIndex >= 0) {
      finishTransaction(); currentDate = businessDate(followingValue(row, dateIndex)); currentOr = null; currentTransaction = null; return;
    }
    const orIndex = rowCells.indexOf("o.r.#");
    if (orIndex >= 0) { currentOr = text(followingValue(row, orIndex)) || null; return; }
    const transactionIndex = rowCells.indexOf("trxn.#");
    if (transactionIndex >= 0) { currentTransaction = text(followingValue(row, transactionIndex)) || null; return; }

    const quantity = numberValue(row[0]);
    const description = text(row[2]);
    const displayedSubtotal = numberValue(row[12]);
    if (quantity !== null && !description && displayedSubtotal !== null && transactionRows.length) {
      finishTransaction(quantity, displayedSubtotal); return;
    }
    if (!description) return;

    const unitPrice = numberValue(row[11]);
    const lineAmount = numberValue(row[15]);
    const issues: string[] = [];
    if (quantity === null || quantity <= 0) issues.push("Quantity Sold must be a number greater than zero.");
    if (!currentDate) issues.push("The transaction block is missing a valid business date.");
    if (!currentOr) issues.push("The transaction block is missing an O.R. number.");
    if (!currentTransaction) issues.push("The transaction block is missing a transaction number.");
    if (unitPrice === null || unitPrice < 0) issues.push("The apparent unit-price value is missing or invalid.");
    if (lineAmount === null || lineAmount < 0) issues.push("The line amount is missing or invalid.");
    if (unitPrice !== null && lineAmount !== null && quantity !== null && quantity > 0) {
      if (unitPrice > 0 || lineAmount > 0) {
        positivePriceRows += 1;
        if (Math.abs(quantity * unitPrice - lineAmount) <= 0.01) structurallyValidPriceRows += 1;
        else issues.push("Quantity × apparent unit price does not match the displayed line amount.");
      }
    }
    if (unitPrice === 0 && lineAmount === 0) issues.push("Zero-price operational line requires review and must not be silently discarded.");
    const rowStatus = issues.some((issue) => !issue.startsWith("Zero-price")) ? "INVALID" : issues.length ? "WARNING" : "VALID";
    const parsed: ParsedPosRow = {
      rowNumber, sourceProduct: description, sourceProductId: null, sourceProductName: description,
      quantitySold: quantity !== null && quantity > 0 ? quantity : null, unitPrice, businessDate: currentDate,
      transactionId: currentTransaction, sourceLineId: String(rowNumber), transactionTimestamp: null,
      sourceFormat: POS_SOURCE_FORMATS.LEGACY_SUMMARY, sourceWorksheet: worksheet, sourceRow: rowNumber,
      lineAmount, sourceOrNumber: currentOr, sourceTransactionNumber: currentTransaction,
      status: rowStatus, issues,
    };
    parsedRows.push(parsed); transactionRows.push(parsed);
  });
  finishTransaction();
  if (!parsedRows.length) throw new PosCsvError("NO_SALES_ROWS", "The legacy POS workbook contains no item-level sales rows.");
  if (parsedRows.length > MAX_POS_ROWS) throw new PosCsvError("ROW_LIMIT_EXCEEDED", `POS files may contain at most ${MAX_POS_ROWS.toLocaleString()} sales rows.`);
  let importBlockedReason: string | null = null;
  if (positivePriceRows === 0 || structurallyValidPriceRows !== positivePriceRows) {
    importBlockedReason = "The apparent unit-price column could not be reliably validated from the workbook structure. Import is blocked until the export format is confirmed.";
    parsedRows.forEach((row) => applyIssue(row, importBlockedReason!));
  }
  const singleDate = enforceSingleBusinessDate(parsedRows);
  return {
    headers: ["QTY", "DESCRIPTION", "APPARENT UNIT PRICE", "AMOUNT"], rows: parsedRows,
    contentHash: hashCanonicalPosRows(parsedRows), businessDate: singleDate,
    sourceFormat: POS_SOURCE_FORMATS.LEGACY_SUMMARY, formatLabel: "Summary Items Sold (Legacy XLS)", importBlockedReason,
  };
}

function parseItemTokens(value: unknown) {
  const rawTokens = text(value).split(";").map((token) => token.trim()).filter(Boolean);
  return rawTokens.map((raw) => {
    const match = raw.match(/^(.*)x(-?\d+(?:\.\d+)?)$/i);
    if (!match || !match[1]!.trim()) return { raw, name: raw, quantity: null };
    const quantity = Number(match[2]);
    return { raw, name: match[1]!.trim(), quantity: Number.isFinite(quantity) ? quantity : null };
  });
}

function parseTransactionSummary(rows: SheetRows, worksheet: string, headerRowNumber: number): ParsedPosDocument {
  const header = rows[headerRowNumber - 1] ?? [];
  const indexes = new Map(header.map((cell, index) => [normalized(cell), index]));
  const at = (row: unknown[], name: string) => row[indexes.get(name) ?? -1];
  const parsedRows: ParsedPosRow[] = [];
  rows.slice(headerRowNumber).forEach((row, offset) => {
    const sourceRow = headerRowNumber + offset + 1;
    const firstValue = normalized(row[0]);
    if (!firstValue && row.every((cell) => !text(cell))) return;
    if (firstValue === "total" || firstValue === "success transaction") return;
    const transactionId = text(at(row, "or no.")) || null;
    const date = businessDate(at(row, "date"));
    const timestampRaw = text(at(row, "payment time")) || text(at(row, "date")) || null;
    const status = text(at(row, "status")) || null;
    const expectedQuantity = numberValue(at(row, "item qty."));
    const tokens = parseItemTokens(at(row, "item name(s)"));
    const parsedQuantity = tokens.reduce((sum, token) => sum + (token.quantity ?? 0), 0);
    const quantityMismatch = expectedQuantity !== null && Math.abs(expectedQuantity - parsedQuantity) > 0.0001;
    if (!tokens.length) tokens.push({ raw: "", name: "", quantity: null });
    tokens.forEach((token) => {
      const issues = [TRANSACTION_SUMMARY_BLOCK_REASON];
      if (!token.name || token.quantity === null || token.quantity <= 0) issues.unshift("The Item Name(s) value contains a malformed product token.");
      if (quantityMismatch) issues.push("Parsed product quantities do not match Item Qty.");
      if (!date) issues.push("The transaction has no valid business date.");
      if (!transactionId) issues.push("The transaction has no O.R. number.");
      if (status && normalized(status) !== "paid") issues.push(`Transaction status is ${status}; it is not eligible for import.`);
      parsedRows.push({
        rowNumber: sourceRow, sourceProduct: token.name, sourceProductId: null, sourceProductName: token.name || null,
        quantitySold: token.quantity !== null && token.quantity > 0 ? token.quantity : null,
        unitPrice: null, businessDate: date, transactionId, sourceLineId: null, transactionTimestamp: null,
        sourceFormat: POS_SOURCE_FORMATS.TRANSACTION_SUMMARY, sourceWorksheet: worksheet, sourceRow,
        lineAmount: null, sourceOrNumber: transactionId, sourceTransactionNumber: null,
        transactionStatus: status, transactionTimestampRaw: timestampRaw, status: "INVALID", issues,
      });
    });
  });
  if (!parsedRows.length) throw new PosCsvError("NO_SALES_ROWS", "The transaction-summary workbook contains no transaction rows.");
  if (parsedRows.length > MAX_POS_ROWS) throw new PosCsvError("ROW_LIMIT_EXCEEDED", `POS files may contain at most ${MAX_POS_ROWS.toLocaleString()} sales rows.`);
  const singleDate = enforceSingleBusinessDate(parsedRows);
  return {
    headers: header.map((cell) => text(cell)), rows: parsedRows, contentHash: hashCanonicalPosRows(parsedRows),
    businessDate: singleDate, sourceFormat: POS_SOURCE_FORMATS.TRANSACTION_SUMMARY,
    formatLabel: "Transaction Summary (XLSX)", importBlockedReason: TRANSACTION_SUMMARY_BLOCK_REASON,
  };
}

export function parsePosExcel(sourceFilename: string, fileBuffer: Buffer): ParsedPosDocument {
  const workbook = readWorkbook(sourceFilename, fileBuffer);
  const detected = detectPosExcelFormat(workbook);
  const rows = workbookRows(workbook, detected.worksheet);
  if (detected.sourceFormat === POS_SOURCE_FORMATS.LEGACY_SUMMARY) return parseLegacySummary(rows, detected.worksheet);
  return parseTransactionSummary(rows, detected.worksheet, detected.headerRow!);
}
