import * as XLSX from "xlsx";
import { pool } from "../src/config/database.js";
import { buildPosPreview } from "../src/controllers/inventoryWorkflow.controller.js";
import { MAX_POS_ROWS, parsePosCsv } from "../src/services/posCsvImport.service.js";
import { parsePosExcel } from "../src/services/posExcelImport.service.js";
import { benchmark, benchmarkConcurrent } from "./benchmark-utils.js";

const requestedIterations = Number(process.env.BENCHMARK_ITERATIONS ?? 5);
const iterations = Number.isInteger(requestedIterations) && requestedIterations > 0 ? Math.min(requestedIterations, 20) : 5;
const sizes = [10, 100, 500, 1_000, 5_000, 10_000];
const businessDate = "2026-10-13";

const fixture = await pool.query<{ sourceId: string; branchId: string; sourceProductName: string }>(
  `SELECT ps.id "sourceId",ps.branch_id "branchId",pm.source_product_name "sourceProductName"
     FROM pos_sources ps
     JOIN pos_product_variant_mappings pm ON pm.pos_source_id=ps.id AND pm.status='ACTIVE'
    WHERE ps.status='ACTIVE' AND ps.source_code LIKE '%TRANSACTION%'
    ORDER BY ps.created_at,pm.created_at LIMIT 1`,
);
const selected = fixture.rows[0];
if (!selected) throw new Error("An active transaction-summary POS source with an approved mapping is required.");

const header = ["Store", "Machine ID", "OR No.", "Date", "Payment Time", "Item Name(s)", "Item Qty.", "Due Amt.", "Gross Amt.", "Status", "Voided By"];
function workbookBuffer(rowCount: number, mixedInvalid = false) {
  const rows = Array.from({ length: rowCount }, (_, index) => [
    "Benchmark Branch",
    "M1",
    `BENCH-${rowCount}-${index + 1}`,
    businessDate,
    `${businessDate} 08:00:00`,
    `${selected.sourceProductName}x1`,
    mixedInvalid && index % 10 === 0 ? "invalid" : 1,
    100,
    100,
    "Paid",
    "",
  ]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([header, ...rows]), "Transactions");
  return Buffer.from(XLSX.write(workbook, { type: "buffer", bookType: "xlsx", compression: true }));
}

function legacyWorkbookBuffer(rowCount: number) {
  const rows: unknown[][] = [
    ["LIBRO ESPRESSO"],
    ["SUMMARY ITEMS SOLD"],
    ["QTY", "DESCRIPTION", null, null, null, null, null, null, null, null, null, "UNIT PRICE", "SUBTOTAL", null, null, "AMOUNT"],
    ["DATE", null, null, null, null, null, null, ":", null, "10/13/2026"],
    ["O.R.#", null, null, null, null, null, null, ":", null, "BENCH-OR"],
    ["TRXN.#", null, null, null, null, null, null, ":", null, "BENCH-TXN"],
    ["TABLE NO:", null, null, null, null, null, null, ":", null, "TAKEOUT"],
    ...Array.from({ length: rowCount }, () => [1, null, selected.sourceProductName, null, null, null, null, null, null, null, null, 100, null, null, null, 100]),
    [rowCount, null, null, null, null, null, null, null, null, null, null, null, rowCount * 100],
    [null, null, null, null, "TOTAL:", null, null, null, null, null, null, null, null, null, rowCount * 100],
  ];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), "Summary");
  return Buffer.from(XLSX.write(workbook, { type: "buffer", bookType: "xls" }));
}

function csvFixture(rowCount: number) {
  const header = "product_code,product_name,quantity_sold,selling_price,business_date,transaction_id,line_id";
  const rows = Array.from({ length: rowCount }, (_, index) => `,\"${selected.sourceProductName.replaceAll('"', '""')}\",1,100,${businessDate},CSV-${index + 1},1`);
  return `${header}\n${rows.join("\n")}`;
}

const fixtures = new Map(sizes.map((size) => [size, workbookBuffer(size)]));
const results: unknown[] = [];
for (const size of sizes) {
  const buffer = fixtures.get(size)!;
  const expectedToParse = size <= MAX_POS_ROWS;
  results.push(await benchmark(
    "XLSX parse and structural validation",
    `${size.toLocaleString()} rows; ${(buffer.length / 1_024).toFixed(1)} KiB`,
    2_000,
    iterations,
    async () => {
      try { parsePosExcel(`benchmark-${size}.xlsx`, buffer); }
      catch (error) {
        if (expectedToParse) throw error;
        if (!(error instanceof Error) || !error.message.includes("at most 5,000")) throw error;
      }
    },
  ));
  if (expectedToParse) {
    results.push(await benchmark(
      "Full POS preview",
      `${size.toLocaleString()} valid rows`,
      2_000,
      iterations,
      () => buildPosPreview(selected.branchId, {
        sourceFilename: `benchmark-${size}.xlsx`,
        fileBuffer: buffer,
        posSourceId: selected.sourceId,
      }),
    ));
  }

  const legacyBuffer = legacyWorkbookBuffer(size);
  results.push(await benchmark(
    "Legacy XLS parse and structural validation",
    `${size.toLocaleString()} rows; ${(legacyBuffer.length / 1_024).toFixed(1)} KiB`,
    2_000,
    iterations,
    async () => {
      try { parsePosExcel(`benchmark-${size}.xls`, legacyBuffer); }
      catch (error) {
        if (expectedToParse) throw error;
        if (!(error instanceof Error) || !error.message.includes("at most 5,000")) throw error;
      }
    },
  ));

  const csv = csvFixture(size);
  results.push(await benchmark(
    "CSV parse and structural validation",
    `${size.toLocaleString()} rows; ${(Buffer.byteLength(csv) / 1_024).toFixed(1)} KiB`,
    2_000,
    iterations,
    async () => {
      try { parsePosCsv(csv); }
      catch (error) {
        if (expectedToParse) throw error;
        if (!(error instanceof Error) || !error.message.includes("at most 5,000")) throw error;
      }
    },
  ));
}

const mixedBuffer = workbookBuffer(1_000, true);
results.push(await benchmark(
  "Mixed valid and invalid POS preview",
  "1,000 rows; every tenth quantity invalid",
  3_000,
  iterations,
  () => buildPosPreview(selected.branchId, {
    sourceFilename: "benchmark-mixed-1000.xlsx",
    fileBuffer: mixedBuffer,
    posSourceId: selected.sourceId,
  }),
));

const concurrency: unknown[] = [];
for (const users of [1, 5, 10, 25, 50]) {
  concurrency.push(await benchmarkConcurrent(
    "Representative dashboard read workload",
    users,
    2_000,
    1,
    async () => {
      await Promise.all([
        pool.query("SELECT COUNT(*) FROM pos_imports WHERE branch_id=$1", [selected.branchId]),
        pool.query("SELECT COUNT(*) FROM inventory_items WHERE status='ACTIVE'"),
        pool.query("SELECT COUNT(*) FROM notifications WHERE branch_id=$1", [selected.branchId]),
      ]);
    },
  ));
}

console.log(JSON.stringify({
  measuredAt: new Date().toISOString(),
  environment: { node: process.version, platform: process.platform, architecture: process.arch },
  iterations,
  maximumSupportedRows: MAX_POS_ROWS,
  results,
  concurrency,
}, null, 2));
await pool.end();
