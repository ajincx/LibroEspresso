import { describe, expect, it } from "vitest";
import { MAX_POS_ROWS, matchPosRows, parsePosCsv, summarizePosRows } from "./posCsvImport.service.js";

const header = "product_code,product_name,quantity_sold,selling_price,business_date,transaction_id,line_id";
const product = { id: "menu-1", code: "LATTE-L", name: "Iced Latte, Large", sellingPrice: 190 };

describe("standards-compliant POS CSV parsing", () => {
  it("parses a normal CSV", () => {
    const parsed = parsePosCsv(`${header}\nLATTE-L,Iced Latte Large,2,190,2026-09-08,R-1,1`);
    expect(parsed.rows[0]).toMatchObject({ sourceProductId: "LATTE-L", quantitySold: 2, unitPrice: 190, businessDate: "2026-09-08" });
  });

  it("keeps a quoted comma inside one product field", () => {
    const parsed = parsePosCsv(`${header}\nLATTE-L,"Iced Latte, Large",2,190,2026-09-08,R-1,1`);
    expect(parsed.rows[0]!.sourceProductName).toBe("Iced Latte, Large");
  });

  it("parses escaped quotation marks", () => {
    const parsed = parsePosCsv(`${header}\nLATTE-L,"Iced ""Special"" Latte",2,190,2026-09-08,R-1,1`);
    expect(parsed.rows[0]!.sourceProductName).toBe('Iced "Special" Latte');
  });

  it("handles UTF-8 BOM, CRLF, and blank lines", () => {
    const parsed = parsePosCsv(`\uFEFF${header}\r\nLATTE-L,Latte,2,190,2026-09-08,R-1,1\r\n\r\n`);
    expect(parsed.rows).toHaveLength(1);
  });

  it("rejects malformed CSV", () => {
    expect(() => parsePosCsv(`${header}\nLATTE-L,"unterminated,2,190,2026-09-08,R-1,1`)).toThrow(/Malformed CSV/);
  });

  it("rejects common invalid UTF-8 replacement characters", () => {
    expect(() => parsePosCsv(`${header}\nLATTE-L,Latte\uFFFD,2,190,2026-09-08,R-1,1`)).toThrow(/UTF-8/);
  });
});

describe("POS CSV validation", () => {
  it.each([
    ["product", "quantity_sold,selling_price,business_date\n2,190,2026-09-08", /Product Code or Product Name/],
    ["quantity", "product_code,selling_price,business_date\nLATTE-L,190,2026-09-08", /Quantity Sold/],
  ])("rejects a missing %s header", (_field, csv, message) => expect(() => parsePosCsv(csv)).toThrow(message));

  it("marks invalid quantity, price, and date rows invalid", () => {
    const parsed = parsePosCsv(`${header}\nLATTE-L,Latte,NaN,Infinity,2026-02-30,R-1,1`);
    expect(parsed.rows[0]!.status).toBe("INVALID");
    expect(parsed.rows[0]!.issues.join(" ")).toMatch(/Quantity Sold.*Selling Price.*Business Date/);
  });

  it("marks a blank product invalid", () => {
    const parsed = parsePosCsv(`${header}\n,,1,190,2026-09-08,R-1,1`);
    expect(parsed.rows[0]).toMatchObject({ status: "INVALID", sourceProduct: "" });
    expect(parsed.rows[0]!.issues).toContain("Product is required.");
  });

  it("rejects ambiguous aliases instead of guessing a column", () => {
    expect(() => parsePosCsv("product_code,quantity,qty,price,date\nLATTE-L,1,1,190,2026-09-08")).toThrow(/Multiple columns map to Quantity Sold/);
  });

  it("enforces the documented 5,000-row limit", () => {
    const row = "LATTE-L,Latte,1,190,2026-09-08,R-1,1";
    expect(parsePosCsv(`${header}\n${Array.from({ length: MAX_POS_ROWS }, () => row).join("\n")}`).rows).toHaveLength(MAX_POS_ROWS);
    expect(() => parsePosCsv(`${header}\n${Array.from({ length: MAX_POS_ROWS + 1 }, () => row).join("\n")}`)).toThrow(/at most 5,000/);
  });

  it("preserves a Philippine business date without UTC conversion", () => {
    expect(parsePosCsv(`${header}\nLATTE-L,Latte,1,190,2026-09-08,R-1,1`).businessDate).toBe("2026-09-08");
  });

  it("keeps business date separate from a timezone-aware transaction timestamp", () => {
    const parsed = parsePosCsv("product_code,quantity,price,business_date,transaction_timestamp\nLATTE-L,1,190,2026-09-08,2026-09-08T00:15:00+08:00");
    expect(parsed.businessDate).toBe("2026-09-08");
    expect(parsed.rows[0]!.transactionTimestamp).toBe("2026-09-08T00:15:00+08:00");
  });

  it("rejects inconsistent dates in one batch", () => {
    const parsed = parsePosCsv(`${header}\nLATTE-L,Latte,1,190,2026-09-08,R-1,1\nLATTE-L,Latte,1,190,2026-09-09,R-2,1`);
    expect(parsed.rows.every((row) => row.status === "INVALID")).toBe(true);
  });
});

describe("product matching and deterministic identity", () => {
  it("matches code first and exact normalized name second", () => {
    const code = matchPosRows(parsePosCsv(`${header}\nLATTE-L,Wrong Name,1,190,2026-09-08,R-1,1`).rows, [product]);
    const name = matchPosRows(parsePosCsv(`product_name,quantity_sold,selling_price,business_date\n" iced latte, large ",1,190,2026-09-08`).rows, [product]);
    expect(code[0]!.menuItemId).toBe("menu-1");
    expect(name[0]!.menuItemId).toBe("menu-1");
  });

  it("accepts an exact stable menu item identifier when supplied", () => {
    const rows = matchPosRows(parsePosCsv("product_id,quantity,price,date\nmenu-1,1,190,2026-09-08").rows, [product]);
    expect(rows[0]!.menuItemId).toBe("menu-1");
  });

  it("does not silently import an unmatched product", () => {
    const rows = matchPosRows(parsePosCsv(`${header}\nUNKNOWN,Unknown,1,190,2026-09-08,R-1,1`).rows, [product]);
    expect(rows[0]!.status).toBe("INVALID");
    expect(summarizePosRows(rows, false)).toMatchObject({ unmatchedRows: 1, canImport: false });
  });

  it("creates the same content hash across filename-independent parsing", () => {
    const csv = `${header}\nLATTE-L,Latte,1,190,2026-09-08,R-1,1`;
    expect(parsePosCsv(csv).contentHash).toBe(parsePosCsv(csv).contentHash);
  });

  it("creates a different hash for different valid content", () => {
    const first = parsePosCsv(`${header}\nLATTE-L,Latte,1,190,2026-09-08,R-1,1`).contentHash;
    const second = parsePosCsv(`${header}\nLATTE-L,Latte,2,190,2026-09-08,R-1,1`).contentHash;
    expect(first).not.toBe(second);
  });

  it("marks missing stable source IDs as a warning without inventing them", () => {
    const rows = matchPosRows(parsePosCsv(`product_code,quantity_sold,selling_price,business_date\nLATTE-L,1,190,2026-09-08`).rows, [product]);
    expect(rows[0]).toMatchObject({ status: "WARNING", transactionId: null, sourceLineId: null });
    expect(summarizePosRows(rows, false)).toMatchObject({ warningRows: 1, canImport: true, quality: "NEEDS_REVIEW" });
  });
});
