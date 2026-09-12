import { z } from "zod";
import { MANAGER_CLASSIFICATIONS } from "../services/shrinkageWorkflow.service.js";

export const APPROVED_REPORT_TYPES = [
  "SALES",
  "COGS_PROFITABILITY",
  "INVENTORY_STATUS",
  "INVENTORY_VARIANCE",
  "SHRINKAGE",
  "PURCHASE_ORDER",
  "PREDICTIVE_FORECAST",
] as const;
export const REPORT_TYPES = [...APPROVED_REPORT_TYPES, "ALL_REPORTS"] as const;

export const reportRequest = z
  .object({
    reportType: z.enum(REPORT_TYPES).optional(),
    reportTypes: z
      .array(z.enum(APPROVED_REPORT_TYPES))
      .min(1)
      .max(APPROVED_REPORT_TYPES.length)
      .optional(),
    startDate: z.iso.date(),
    endDate: z.iso.date(),
    branchId: z.string().uuid().optional(),
    productId: z.string().uuid().optional(),
    ingredientId: z.string().uuid().optional(),
    classification: z.enum(MANAGER_CLASSIFICATIONS).optional(),
    poStatus: z
      .enum(["DRAFT", "ORDERED", "PARTIALLY_RECEIVED", "RECEIVED", "CANCELLED"])
      .optional(),
    forecastStart: z.iso.date().optional(),
    forecastEnd: z.iso.date().optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(10).max(100).default(50),
  })
  .superRefine((value, context) => {
    if (!value.reportType && !value.reportTypes?.length)
      context.addIssue({
        code: "custom",
        path: ["reportTypes"],
        message: "Select at least one report",
      });
    if (value.reportType && value.reportTypes)
      context.addIssue({
        code: "custom",
        path: ["reportTypes"],
        message: "Use reportType or reportTypes, not both",
      });
    if (
      value.reportTypes &&
      new Set(value.reportTypes).size !== value.reportTypes.length
    )
      context.addIssue({
        code: "custom",
        path: ["reportTypes"],
        message: "Duplicate report types are not allowed",
      });
    if (value.startDate > value.endDate)
      context.addIssue({
        code: "custom",
        path: ["endDate"],
        message: "Date To must be on or after Date From",
      });
    if (
      (value.forecastStart && !value.forecastEnd) ||
      (!value.forecastStart && value.forecastEnd)
    )
      context.addIssue({
        code: "custom",
        path: ["forecastEnd"],
        message: "Both forecast dates are required",
      });
    if (
      value.forecastStart &&
      value.forecastEnd &&
      value.forecastStart > value.forecastEnd
    )
      context.addIssue({
        code: "custom",
        path: ["forecastEnd"],
        message: "Forecast end must be on or after forecast start",
      });
  })
  .transform((value) => {
    const reportTypes =
      value.reportTypes ??
      (value.reportType === "ALL_REPORTS"
        ? [...APPROVED_REPORT_TYPES]
        : value.reportType
          ? [value.reportType]
          : []);
    const reportType =
      reportTypes.length === APPROVED_REPORT_TYPES.length
        ? "ALL_REPORTS"
        : reportTypes.length === 1
          ? reportTypes[0]!
          : "ALL_REPORTS";
    return { ...value, reportType, reportTypes };
  });

export type ReportRequest = z.infer<typeof reportRequest>;
export type ApprovedReportType = (typeof APPROVED_REPORT_TYPES)[number];
