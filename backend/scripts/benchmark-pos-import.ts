import { performance } from "node:perf_hooks";
import {
  matchPosRows,
  parsePosCsv,
  summarizePosRows,
} from "../src/services/posCsvImport.service.js";

const rowCount = 5_000;
const header =
  "product_code,product_name,quantity_sold,selling_price,business_date,transaction_id,line_id";
const rows = Array.from(
  { length: rowCount },
  (_, index) =>
    `LATTE-L,"Iced Latte, Large",1,190,2026-09-08,R-${Math.floor(index / 10) + 1},${(index % 10) + 1}`,
);
const csvText = `${header}\n${rows.join("\n")}`;
const products = [
  {
    id: "benchmark-menu-item",
    code: "LATTE-L",
    name: "Iced Latte, Large",
    sellingPrice: 190,
  },
];

const totalStart = performance.now();
const parseStart = performance.now();
const parsed = parsePosCsv(csvText);
const parseMs = performance.now() - parseStart;
const validationStart = performance.now();
const matched = matchPosRows(parsed.rows, products);
const summary = summarizePosRows(matched, false);
const validationMs = performance.now() - validationStart;
const totalMs = performance.now() - totalStart;

console.log(
  JSON.stringify(
    {
      fixtureRows: rowCount,
      parsedRows: parsed.rows.length,
      validRows: summary.validRows,
      warningRows: summary.warningRows,
      invalidRows: summary.invalidRows,
      parseMs: Number(parseMs.toFixed(2)),
      matchAndValidationMs: Number(validationMs.toFixed(2)),
      parserAndValidationTotalMs: Number(totalMs.toFixed(2)),
      note: "This benchmark measures CSV parsing, row validation, hashing, and product matching only; database import time is environment-dependent and is not claimed here.",
    },
    null,
    2,
  ),
);
