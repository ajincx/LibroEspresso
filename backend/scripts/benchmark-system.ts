import { pool } from "../src/config/database.js";
import { buildReportSupportData } from "../src/services/reportSupport.service.js";
import { getPosAnalytics, listShrinkageReports } from "../src/controllers/inventoryWorkflow.controller.js";
import { getInventoryOverview } from "../src/controllers/operations.controller.js";
import { buildPredictiveForecast } from "../src/controllers/predictive.controller.js";
import { buildReportDataset, type ReportDataset } from "../src/services/reportDataset.service.js";
import { renderReportPdf, renderReportXlsx } from "../src/services/reportRenderers.service.js";
import { manilaBusinessDate } from "../src/services/businessTime.service.js";
import { reportRequest } from "../src/validators/reports.js";
import { benchmark } from "./benchmark-utils.js";

const scenario = process.argv[2] ?? "all";
const iterations = Math.max(1, Math.min(20, Number(process.env.BENCHMARK_ITERATIONS ?? 3)));
const addDays = (value: string, days: number) => { const date = new Date(`${value}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); };
const today = manilaBusinessDate();
const endDate = addDays(today, -1);
const startDate = addDays(endDate, -29);
const owner = await pool.query<{ id: string }>("SELECT id FROM users WHERE role='OWNER' AND status='ACTIVE' ORDER BY created_at LIMIT 1");
if (!owner.rows[0]) throw new Error("An active Owner fixture is required. Run npm run db:seed first.");
const user = { id: owner.rows[0].id, role: "OWNER" as const, branchId: null };
const managerResult = await pool.query<{ id: string; branchId: string }>("SELECT id,branch_id \"branchId\" FROM users WHERE role='BRANCH_MANAGER' AND status='ACTIVE' AND branch_id IS NOT NULL ORDER BY created_at LIMIT 1");
const branchResult = await pool.query<{ id: string }>("SELECT id FROM branches WHERE status='ACTIVE' ORDER BY created_at LIMIT 1");
if (!managerResult.rows[0] || !branchResult.rows[0]) throw new Error("Active Manager and branch fixtures are required. Run npm run db:seed first.");
const manager = { id: managerResult.rows[0].id, role: "BRANCH_MANAGER" as const, branchId: managerResult.rows[0].branchId };
const dashboardData = async (actor: typeof user | typeof manager, branchId?: string) => {
  const invoke = async (handler: Function, query: Record<string, string>) => {
    let payload: unknown;
    const response = { status: () => response, json: (value: unknown) => { payload = value; return response; } };
    await handler({ user: actor, query, params: {}, body: {} }, response, () => undefined);
    return payload;
  };
  const scoped = branchId ? { branchId } : {};
  return Promise.all([
    invoke(getPosAnalytics, { ...scoped, startDate, endDate }),
    invoke(getPosAnalytics, { ...scoped, startDate: addDays(startDate, -30), endDate: addDays(endDate, -30) }),
    invoke(getInventoryOverview, scoped),
    invoke(listShrinkageReports, { ...scoped, page: "1", pageSize: "100" }),
  ]);
};
const results: unknown[] = [];

if (scenario === "dashboard" || scenario === "all") {
  results.push(await benchmark("Owner dashboard data", "30-day selected branch", 3_000, iterations, () => dashboardData(user, branchResult.rows[0]!.id)));
  results.push(await benchmark("Branch Manager dashboard data", "30-day assigned branch", 3_000, iterations, () => dashboardData(manager)));
}

if (scenario === "cogs" || scenario === "all") {
  results.push(await benchmark("COGS and variance calculations", "30-day consolidated period", 5_000, iterations, () => buildReportSupportData(user, { startDate, endDate })));
}

if (scenario === "forecast" || scenario === "all") {
  for (const days of [30, 90, 180, 365]) {
    results.push(await benchmark(`Statistical forecast ${days} days`, `${days}-day horizon; Gemini excluded`, 10_000, iterations, () => buildPredictiveForecast(user, { startDate: addDays(today, 1), endDate: addDays(today, days) }, { includeGemini: false })));
  }
}

if (scenario === "reports" || scenario === "all") {
  for (const reportType of ["COGS_PROFITABILITY", "ALL_REPORTS"] as const) {
    const request = reportRequest.parse({ reportType, startDate, endDate, page: 1, pageSize: 100 });
    let dataset: ReportDataset;
    results.push(await benchmark(`${reportType} dataset`, "Current authorized monthly data", 15_000, iterations, async () => { dataset = await buildReportDataset(user, request, true); }));
    dataset = await buildReportDataset(user, request, true);
    results.push(await benchmark(`${reportType} PDF renderer`, `${dataset.pagination.totalRows} rows`, 15_000, iterations, () => renderReportPdf(dataset)));
    results.push(await benchmark(`${reportType} XLSX renderer`, `${dataset.pagination.totalRows} rows`, 15_000, iterations, () => renderReportXlsx(dataset)));
    results.push(await benchmark(`${reportType} total PDF`, `${dataset.pagination.totalRows} rows; query plus render`, 15_000, iterations, async () => renderReportPdf(await buildReportDataset(user, request, true))));
    results.push(await benchmark(`${reportType} total XLSX`, `${dataset.pagination.totalRows} rows; query plus render`, 15_000, iterations, async () => renderReportXlsx(await buildReportDataset(user, request, true))));
  }
  const base = await buildReportDataset(user, reportRequest.parse({ reportType: "SALES", startDate, endDate }), true);
  const detail = base.sections[0];
  if (detail?.rows.length) {
    const rows = Array.from({ length: 5_000 }, (_, index) => ({ ...detail.rows[index % detail.rows.length]!, benchmarkRow: index + 1 }));
    const nearLimit: ReportDataset = { ...base, sections: [{ ...detail, rows, totalRows: rows.length }], pagination: { page: 1, pageSize: 100, totalRows: rows.length, totalPages: 50 } };
    results.push(await benchmark("5,000-row PDF renderer", "Deterministic 5,000-row export fixture", 15_000, iterations, () => renderReportPdf(nearLimit)));
    results.push(await benchmark("5,000-row XLSX renderer", "Deterministic 5,000-row export fixture", 15_000, iterations, () => renderReportXlsx(nearLimit)));
  }
}

console.log(JSON.stringify({ measuredAt: new Date().toISOString(), environment: { node: process.version, platform: process.platform, architecture: process.arch }, results }, null, 2));
await pool.end();
