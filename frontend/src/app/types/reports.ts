export type ReportType =
  | "SALES"
  | "COGS_PROFITABILITY"
  | "INVENTORY_STATUS"
  | "INVENTORY_VARIANCE"
  | "SHRINKAGE"
  | "PURCHASE_ORDER"
  | "PREDICTIVE_FORECAST"
  | "ALL_REPORTS";
export type ApprovedReportType = Exclude<ReportType, "ALL_REPORTS">;
export type ReportValueType =
  | "text"
  | "number"
  | "currency"
  | "percentage"
  | "date"
  | "datetime";
export interface ReportRequest {
  reportTypes: ApprovedReportType[];
  startDate: string;
  endDate: string;
  branchId?: string;
  productId?: string;
  ingredientId?: string;
  classification?: string;
  poStatus?: string;
  forecastStart?: string;
  forecastEnd?: string;
  page?: number;
  pageSize?: number;
}
export interface ReportSummaryItem {
  key: string;
  label: string;
  value: string | number | null;
  type: ReportValueType;
}
export interface ReportSection {
  title: string;
  columns: {
    key: string;
    label: string;
    type: ReportValueType;
    width?: number;
  }[];
  rows: Record<string, unknown>[];
  totalRows: number;
  note?: string;
}
export interface ReportGroup {
  reportType: ApprovedReportType;
  title: string;
  summary: ReportSummaryItem[];
  sections: ReportSection[];
}
export interface ReportDataset {
  metadata: {
    reportType: ReportType;
    reportTypes: ApprovedReportType[];
    title: string;
    branchId: string | null;
    branchName: string;
    periodStart: string;
    periodEnd: string;
    generatedAt: string;
    generatedAtDisplay: string;
    generatedBy: string;
    generatedByRole: string;
    timezone: "Asia/Manila";
    filenameBase: string;
  };
  summary: ReportSummaryItem[];
  sections: ReportSection[];
  reportGroups: ReportGroup[];
  pagination: {
    page: number;
    pageSize: number;
    totalRows: number;
    totalPages: number;
  };
}
