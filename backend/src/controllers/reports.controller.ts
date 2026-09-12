import type { RequestHandler } from "express";
import { buildReportDataset } from "../services/reportDataset.service.js";
import { writeAudit } from "../services/audit.service.js";
import { reportRequest } from "../validators/reports.js";
import { AppError } from "../utils/appError.js";

const parseRequest = (body: unknown) => reportRequest.parse(body);
export const reportAuditMetadata = (
  input: ReturnType<typeof parseRequest>,
) => ({
  reportType: input.reportType,
  reportTypes: input.reportTypes,
  startDate: input.startDate,
  endDate: input.endDate,
  branchId: input.branchId ?? null,
  productId: input.productId ?? null,
  ingredientId: input.ingredientId ?? null,
  classification: input.classification ?? null,
  poStatus: input.poStatus ?? null,
  forecastStart: input.forecastStart ?? null,
  forecastEnd: input.forecastEnd ?? null,
});
const safelyBuild = async (
  user: NonNullable<Express.Request["user"]>,
  input: ReturnType<typeof parseRequest>,
  forExport = false,
) => {
  try {
    return await buildReportDataset(user, input, forExport);
  } catch (error) {
    if (error instanceof Error && error.message === "REPORT_EXPORT_LIMIT")
      throw new AppError(
        422,
        "REPORT_EXPORT_LIMIT",
        "The report exceeds the 5,000-row export limit. Narrow the date or item filters and try again.",
      );
    throw error;
  }
};

export const previewReport: RequestHandler = async (req, res) => {
  const input = parseRequest(req.body);
  const dataset = await safelyBuild(req.user!, input);
  res.json({ success: true, data: { report: dataset } });
};
export const exportReportPdf: RequestHandler = async (req, res) => {
  const input = parseRequest(req.body);
  const dataset = await safelyBuild(req.user!, input, true);
  const { renderReportPdf } = await import(
    "../services/reportRenderers.service.js"
  );
  const binary = await renderReportPdf(dataset);
  await writeAudit(
    req.user!,
    "REPORT_EXPORTED_PDF",
    "REPORT",
    dataset.metadata.filenameBase,
    `Exported ${dataset.metadata.title} as PDF`,
    {
      ...reportAuditMetadata(input),
      branchId: dataset.metadata.branchId,
      format: "PDF",
      generatedAt: dataset.metadata.generatedAt,
    },
  );
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${dataset.metadata.filenameBase}.pdf"`,
  );
  res.setHeader("Content-Length", binary.length);
  res.send(binary);
};
export const exportReportXlsx: RequestHandler = async (req, res) => {
  const input = parseRequest(req.body);
  const dataset = await safelyBuild(req.user!, input, true);
  const { renderReportXlsx } = await import(
    "../services/reportRenderers.service.js"
  );
  const binary = await renderReportXlsx(dataset);
  await writeAudit(
    req.user!,
    "REPORT_EXPORTED_XLSX",
    "REPORT",
    dataset.metadata.filenameBase,
    `Exported ${dataset.metadata.title} as XLSX`,
    {
      ...reportAuditMetadata(input),
      branchId: dataset.metadata.branchId,
      format: "XLSX",
      generatedAt: dataset.metadata.generatedAt,
    },
  );
  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${dataset.metadata.filenameBase}.xlsx"`,
  );
  res.setHeader("Content-Length", binary.length);
  res.send(binary);
};
