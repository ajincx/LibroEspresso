import { createHash } from "node:crypto";
import { parse } from "csv-parse/sync";

const HEADER_ALIASES = {
  productId: ["product_id", "product_code", "menu_code", "code"],
  productName: ["product_name", "product", "item_name", "menu_item"],
  quantitySold: ["quantity_sold", "quantity", "qty", "sold"],
  unitPrice: ["selling_price", "unit_price", "price"],
  businessDate: ["business_date", "sales_date", "date"],
  transactionId: ["transaction_id", "receipt_no"],
  sourceLineId: ["line_id"],
  transactionTimestamp: ["transaction_timestamp", "sold_at"],
} as const;

export const MAX_POS_ROWS = 5_000;

export const POS_SOURCE_FORMATS = {
  CSV: "CANONICAL_CSV",
  LEGACY_SUMMARY: "SUMMARY_ITEMS_SOLD_LEGACY_XLS",
  TRANSACTION_SUMMARY: "TRANSACTION_SUMMARY_XLSX",
} as const;

export type PosSourceFormat = typeof POS_SOURCE_FORMATS[keyof typeof POS_SOURCE_FORMATS];

export type PosRowStatus = "VALID" | "WARNING" | "INVALID";

export interface ParsedPosRow {
  rowNumber: number;
  sourceProduct: string;
  sourceProductId: string | null;
  sourceProductName: string | null;
  quantitySold: number | null;
  unitPrice: number | null;
  businessDate: string | null;
  transactionId: string | null;
  sourceLineId: string | null;
  transactionTimestamp: string | null;
  sourceFormat?: PosSourceFormat;
  sourceWorksheet?: string | null;
  sourceRow?: number | null;
  lineAmount?: number | null;
  sourceOrNumber?: string | null;
  sourceTransactionNumber?: string | null;
  transactionStatus?: string | null;
  transactionTimestampRaw?: string | null;
  status: PosRowStatus;
  issues: string[];
}

export interface ParsedPosDocument {
  headers: string[];
  rows: ParsedPosRow[];
  contentHash: string;
  businessDate: string | null;
  sourceFormat: PosSourceFormat;
  formatLabel: string;
  importBlockedReason: string | null;
}

export interface PosMenuCandidate {
  id: string;
  code: string;
  name: string;
  sellingPrice: number;
}

export interface MatchedPosRow extends ParsedPosRow {
  menuItemId: string | null;
  matchedMenuProduct: string | null;
  menuItemVariantId?: string | null;
  matchedVariant?: string | null;
  recipeVersionId?: string | null;
  recipeVersion?: number | null;
  mappingId?: string | null;
  mappingVersion?: string | null;
  mappingStatus?: "APPROVED" | "UNMATCHED" | "AMBIGUOUS" | "DIRECT";
  mappingScope?: "GLOBAL" | "BRANCH" | null;
}

export class PosCsvError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
  }
}

const normalizeHeader = (value: string) =>
  value.replace(/^\uFEFF/, "").trim().toLowerCase().replace(/[\s-]+/g, "_");
const normalizeProduct = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();
const clean = (value: unknown) => String(value ?? "").trim();

export function validBusinessDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month! - 1 && date.getUTCDate() === day;
}

export function hashCanonicalPosRows(rows: readonly ParsedPosRow[]) {
  const canonical = rows.map((row) => ({
    sourceProduct: row.sourceProduct,
    sourceProductId: row.sourceProductId,
    sourceProductName: row.sourceProductName,
    quantitySold: row.quantitySold,
    unitPrice: row.unitPrice,
    businessDate: row.businessDate,
    transactionId: row.transactionId,
    sourceLineId: row.sourceLineId,
    transactionTimestamp: row.transactionTimestamp,
  }));
  return createHash("sha256").update(JSON.stringify(canonical), "utf8").digest("hex");
}

export function enforceSingleBusinessDate(rows: ParsedPosRow[]) {
  const dates = [...new Set(rows.map((row) => row.businessDate).filter((value): value is string => Boolean(value)))];
  if (dates.length > 1) rows.forEach((row) => {
    row.status = "INVALID";
    row.issues.unshift("All rows in one import must use the same Business Date.");
  });
  return dates.length === 1 ? dates[0]! : null;
}

function columnIndex(headers: string[], aliases: readonly string[], label: string, required = false) {
  const matches = headers.map((header, index) => aliases.includes(header as never) ? index : -1).filter((index) => index >= 0);
  if (matches.length > 1) throw new PosCsvError("AMBIGUOUS_COLUMN", `Multiple columns map to ${label}. Keep only one supported ${label} column.`);
  if (required && matches.length === 0) throw new PosCsvError("MISSING_REQUIRED_COLUMN", `Missing required column: ${label}`);
  return matches[0] ?? -1;
}

export function parsePosCsv(csvText: string): ParsedPosDocument {
  if (!csvText.trim()) throw new PosCsvError("EMPTY_CSV", "The CSV file is empty.");
  if (csvText.includes("\uFFFD") || csvText.includes("\u0000")) {
    throw new PosCsvError(
      "INVALID_CSV_ENCODING",
      "The CSV contains invalid text encoding. Export it as UTF-8 and try again.",
    );
  }
  let records: string[][];
  try {
    records = parse(csvText, { bom: true, skip_empty_lines: true, relax_column_count: false, trim: true });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Malformed CSV content";
    throw new PosCsvError("MALFORMED_CSV", `Malformed CSV: ${detail}`);
  }
  if (records.length < 2) throw new PosCsvError("NO_SALES_ROWS", "The CSV file has no sales rows.");
  const headers = records[0]!.map(normalizeHeader);
  if (headers.some((header) => !header)) throw new PosCsvError("BLANK_HEADER", "CSV headers cannot be blank.");
  if (new Set(headers).size !== headers.length) throw new PosCsvError("DUPLICATE_HEADER", "The CSV contains duplicate column headers.");

  const productId = columnIndex(headers, HEADER_ALIASES.productId, "Product Code");
  const productName = columnIndex(headers, HEADER_ALIASES.productName, "Product Name");
  if (productId < 0 && productName < 0) throw new PosCsvError("MISSING_REQUIRED_COLUMN", "Missing required column: Product Code or Product Name");
  const quantitySold = columnIndex(headers, HEADER_ALIASES.quantitySold, "Quantity Sold", true);
  const unitPrice = columnIndex(headers, HEADER_ALIASES.unitPrice, "Selling Price", true);
  const businessDate = columnIndex(headers, HEADER_ALIASES.businessDate, "Business Date", true);
  const transactionId = columnIndex(headers, HEADER_ALIASES.transactionId, "Transaction ID");
  const sourceLineId = columnIndex(headers, HEADER_ALIASES.sourceLineId, "Line ID");
  const transactionTimestamp = columnIndex(headers, HEADER_ALIASES.transactionTimestamp, "Transaction Timestamp");

  if (records.length - 1 > MAX_POS_ROWS) throw new PosCsvError("ROW_LIMIT_EXCEEDED", `POS CSV files may contain at most ${MAX_POS_ROWS.toLocaleString()} sales rows.`);

  const rows = records.slice(1).map((record, index): ParsedPosRow => {
    const issues: string[] = [];
    const idValue = productId >= 0 ? clean(record[productId]) : "";
    const nameValue = productName >= 0 ? clean(record[productName]) : "";
    const sourceProduct = nameValue || idValue;
    if (!sourceProduct) issues.push("Product is required.");

    const quantityText = clean(record[quantitySold]);
    const quantity = Number(quantityText);
    if (!quantityText || !Number.isFinite(quantity) || quantity <= 0) issues.push("Quantity Sold must be a number greater than zero.");

    const priceText = clean(record[unitPrice]);
    const price = Number(priceText);
    if (!priceText || !Number.isFinite(price) || price < 0) issues.push("Selling Price must be a valid non-negative number.");

    const dateValue = clean(record[businessDate]);
    if (!validBusinessDate(dateValue)) issues.push("Business Date must be a valid YYYY-MM-DD date.");

    const timestampValue = transactionTimestamp >= 0 ? clean(record[transactionTimestamp]) : "";
    if (timestampValue && (!/(Z|[+-]\d{2}:\d{2})$/i.test(timestampValue) || !Number.isFinite(Date.parse(timestampValue)))) {
      issues.push("Transaction Timestamp must be a valid ISO timestamp with a timezone offset.");
    }

    const transactionValue = transactionId >= 0 ? clean(record[transactionId]) : "";
    const lineValue = sourceLineId >= 0 ? clean(record[sourceLineId]) : "";
    const warnings = !transactionValue || !lineValue ? ["No complete transaction/line identifier; file-level duplicate protection will apply."] : [];
    return {
      rowNumber: index + 2,
      sourceProduct,
      sourceProductId: idValue || null,
      sourceProductName: nameValue || null,
      quantitySold: Number.isFinite(quantity) ? quantity : null,
      unitPrice: Number.isFinite(price) ? price : null,
      businessDate: validBusinessDate(dateValue) ? dateValue : null,
      transactionId: transactionValue || null,
      sourceLineId: lineValue || null,
      transactionTimestamp: timestampValue || null,
      status: issues.length ? "INVALID" : warnings.length ? "WARNING" : "VALID",
      issues: [...issues, ...warnings],
    };
  });

  const singleBusinessDate = enforceSingleBusinessDate(rows);
  return {
    headers,
    rows,
    contentHash: hashCanonicalPosRows(rows),
    businessDate: singleBusinessDate,
    sourceFormat: POS_SOURCE_FORMATS.CSV,
    formatLabel: "Standard POS CSV",
    importBlockedReason: null,
  };
}

export function matchPosRows(rows: ParsedPosRow[], products: readonly PosMenuCandidate[]): MatchedPosRow[] {
  return rows.map((row) => {
    if (row.status === "INVALID") return { ...row, menuItemId: null, matchedMenuProduct: null };
    let matches: PosMenuCandidate[] = [];
    if (row.sourceProductId) {
      matches = products.filter(
        (item) =>
          normalizeProduct(item.id) === normalizeProduct(row.sourceProductId!) ||
          normalizeProduct(item.code) === normalizeProduct(row.sourceProductId!),
      );
    }
    if (!matches.length && row.sourceProductName) matches = products.filter((item) => normalizeProduct(item.name) === normalizeProduct(row.sourceProductName!));
    if (!matches.length && !row.sourceProductName) matches = products.filter((item) => normalizeProduct(item.name) === normalizeProduct(row.sourceProduct));
    if (matches.length !== 1) {
      return { ...row, menuItemId: null, matchedMenuProduct: null, status: "INVALID", issues: [...row.issues, matches.length ? "Product match is ambiguous and requires correction." : "UNMATCHED PRODUCT: no approved branch menu product matches this value."] };
    }
    return { ...row, menuItemId: matches[0]!.id, matchedMenuProduct: matches[0]!.name };
  });
}

export function summarizePosRows(rows: readonly MatchedPosRow[], duplicate: boolean) {
  const validRows = rows.filter((row) => row.status === "VALID").length;
  const warningRows = rows.filter((row) => row.status === "WARNING").length;
  const invalidRows = rows.filter((row) => row.status === "INVALID").length;
  const unmatchedRows = rows.filter((row) => row.mappingStatus === "UNMATCHED" || row.issues.some((issue) => issue.startsWith("UNMATCHED PRODUCT"))).length;
  return { totalSourceRows: rows.length, validRows, warningRows, invalidRows, unmatchedRows, duplicate, quality: duplicate || invalidRows ? "REJECTED" as const : warningRows ? "NEEDS_REVIEW" as const : "COMPLETE" as const, canImport: !duplicate && invalidRows === 0 && rows.length > 0 };
}
