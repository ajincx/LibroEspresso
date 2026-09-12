import { pool } from "../config/database.js";
import { buildReportSupportData } from "./reportSupport.service.js";
import { buildPredictiveForecast } from "../controllers/predictive.controller.js";
import { calculateFinancialSummary } from "./financialMetrics.service.js";
import { getEffectiveBranchId } from "./branchScope.js";
import {
  VERIFIED_SHRINKAGE_CLASSIFICATIONS_SQL,
  isVerifiedShrinkageClassification,
} from "./shrinkageWorkflow.service.js";
import type { TokenUser } from "../types/auth.js";
import {
  APPROVED_REPORT_TYPES,
  type ApprovedReportType,
  type ReportRequest,
} from "../validators/reports.js";
import { manilaBusinessDate } from "./businessTime.service.js";

export type ReportValueType =
  | "text"
  | "number"
  | "currency"
  | "percentage"
  | "date"
  | "datetime";
export type ReportColumn = {
  key: string;
  label: string;
  type: ReportValueType;
  width?: number;
};
export type ReportSection = {
  title: string;
  columns: ReportColumn[];
  rows: Record<string, unknown>[];
  totalRows: number;
  note?: string;
};
export type ReportSummaryItem = {
  key: string;
  label: string;
  value: string | number | null;
  type: ReportValueType;
};
export type ReportGroup = {
  reportType: ApprovedReportType;
  title: string;
  summary: ReportSummaryItem[];
  sections: ReportSection[];
};
export type ReportDataset = {
  metadata: {
    reportType: ReportRequest["reportType"];
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
};

const TITLES: Record<ReportRequest["reportType"], string> = {
  SALES: "Sales Report",
  COGS_PROFITABILITY: "COGS and Profitability Report",
  INVENTORY_STATUS: "Inventory Status Report",
  INVENTORY_VARIANCE: "Inventory Variance Report",
  SHRINKAGE: "Shrinkage Report",
  PURCHASE_ORDER: "Purchase Order Report",
  PREDICTIVE_FORECAST: "Predictive Forecast Report",
  ALL_REPORTS: "All Reports",
};
const GROUP_TITLES: Record<ApprovedReportType, string> = {
  SALES: "Sales",
  COGS_PROFITABILITY: "COGS and Profitability",
  INVENTORY_STATUS: "Inventory Status",
  INVENTORY_VARIANCE: "Inventory Variance",
  SHRINKAGE: "Shrinkage",
  PURCHASE_ORDER: "Purchase Orders",
  PREDICTIVE_FORECAST: "Predictive Forecast",
};
const SECTION_REPORT_TYPES: Record<string, ApprovedReportType> = {
  "Sales Detail": "SALES",
  "Product Profitability": "COGS_PROFITABILITY",
  "Inventory Status": "INVENTORY_STATUS",
  "Inventory Variance": "INVENTORY_VARIANCE",
  "Shrinkage Investigation Detail": "SHRINKAGE",
  "Purchase Orders": "PURCHASE_ORDER",
  "Forecast Values": "PREDICTIVE_FORECAST",
  "Forecast Evaluation": "PREDICTIVE_FORECAST",
  "Ingredient Usage MAE": "PREDICTIVE_FORECAST",
};
const n = (value: unknown) => Number(value ?? 0);
const round2 = (value: number) =>
  Math.round((value + Number.EPSILON) * 100) / 100;
const safe = (value: string) =>
  value.replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "");
export const formatManilaReportTimestamp = (date = new Date()) =>
  new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone: "Asia/Manila",
  }).format(date);
const addDays = (value: string, days: number) => {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};
const section = (
  title: string,
  columns: ReportColumn[],
  rows: Record<string, unknown>[],
  _request: ReportRequest,
  _forExport: boolean,
  note?: string,
): ReportSection => ({ title, columns, rows, totalRows: rows.length, note });

export function summarizeSalesRows(rows: Record<string, unknown>[]): {
  totalQuantitySold: number;
  totalSales: number;
} {
  return rows.reduce<{ totalQuantitySold: number; totalSales: number }>(
    (summary, row) => ({
      totalQuantitySold: summary.totalQuantitySold + n(row.quantitySold),
      totalSales: summary.totalSales + n(row.salesRevenue),
    }),
    { totalQuantitySold: 0, totalSales: 0 },
  );
}

export function getVarianceStatus(varianceQuantity: unknown) {
  const quantity = n(varianceQuantity);
  return quantity > 0 ? "SHORTAGE" : quantity < 0 ? "EXCESS" : "MATCHED";
}

export function summarizeShrinkageRows(rows: Record<string, unknown>[]) {
  const isReviewed = (row: Record<string, unknown>) =>
    row.investigationStatus === "VERIFIED" ||
    row.investigationStatus === "REVIEWED";
  return {
    detected: rows.reduce(
      (sum, row) => sum + Math.max(n(row.varianceValue), 0),
      0,
    ),
    underInvestigation: rows
      .filter(
        (row) =>
          row.investigationStatus === "DETECTED" ||
          row.investigationStatus === "PENDING_REVIEW",
      )
      .reduce((sum, row) => sum + Math.max(n(row.varianceValue), 0), 0),
    verified: rows
      .filter(
        (row) =>
          isReviewed(row) &&
          isVerifiedShrinkageClassification(
            typeof row.finalClassification === "string"
              ? row.finalClassification
              : null,
          ),
      )
      .reduce((sum, row) => sum + Math.max(n(row.varianceValue), 0), 0),
    correction: rows
      .filter(
        (row) => isReviewed(row) && row.finalClassification === "COUNT_ERROR",
      )
      .reduce((sum, row) => sum + Math.max(n(row.varianceValue), 0), 0),
    verifiedCases: rows.filter((row) => n(row.verifiedShrinkageCost) > 0)
      .length,
  };
}

async function metadata(
  user: TokenUser,
  request: ReportRequest,
  branchId: string | null,
) {
  const result = await pool.query(
    `SELECT concat(u.first_name,' ',u.last_name) "userName",u.role::text,b.name "assignedBranch" FROM users u LEFT JOIN branches b ON b.id=u.branch_id WHERE u.id=$1`,
    [user.id],
  );
  const row = result.rows[0] ?? {};
  const branch = branchId
    ? await pool.query<{ name: string }>(
        `SELECT name FROM branches WHERE id=$1`,
        [branchId],
      )
    : null;
  const branchName = branchId
    ? (branch?.rows[0]?.name ?? row.assignedBranch ?? "Assigned Branch")
    : "All Branches";
  const generatedAt = new Date();
  const period =
    request.startDate === request.endDate
      ? request.startDate
      : `${request.startDate}_to_${request.endDate}`;
  const title: string =
    request.reportTypes.length === APPROVED_REPORT_TYPES.length
      ? "All Reports"
      : request.reportTypes.length === 1
        ? (TITLES[request.reportTypes[0]!] ?? "Selected Reports")
        : "Selected Reports";
  return {
    reportType: request.reportType,
    reportTypes: request.reportTypes,
    title,
    branchId,
    branchName,
    periodStart: request.startDate,
    periodEnd: request.endDate,
    generatedAt: generatedAt.toISOString(),
    generatedAtDisplay: formatManilaReportTimestamp(generatedAt),
    generatedBy: row.userName ?? "Authorized User",
    generatedByRole: row.role ?? user.role,
    timezone: "Asia/Manila" as const,
    filenameBase: `Libro_Espresso_${safe(title)}_${safe(branchName)}_${period}`,
  };
}

export async function buildReportDataset(
  user: TokenUser,
  request: ReportRequest,
  forExport = false,
): Promise<ReportDataset> {
  const branchId = getEffectiveBranchId(user, request.branchId) ?? null;
  const analytics = await buildReportSupportData(user, {
    startDate: request.startDate,
    endDate: request.endDate,
    branchId: branchId ?? undefined,
    productId: request.productId,
    ingredientId: request.ingredientId,
    classification: request.classification,
  });
  const meta = await metadata(user, request, branchId);
  const sections: ReportSection[] = [];
  const selected = new Set<ApprovedReportType>(request.reportTypes);
  const summaries = APPROVED_REPORT_TYPES.reduce(
    (result, type) => ({ ...result, [type]: [] }),
    {} as Record<ApprovedReportType, ReportSummaryItem[]>,
  );

  if (selected.has("SALES")) {
    const result = await pool.query(
      `SELECT pi.business_date::text "businessDate",b.name branch,mi.name product,
      psi.quantity_sold::float8 "quantitySold",coalesce(psi.unit_price_snapshot,mi.selling_price)::float8 "sellingPriceSnapshot",
      (psi.quantity_sold*coalesce(psi.unit_price_snapshot,mi.selling_price))::float8 "salesRevenue"
      FROM pos_imports pi JOIN branches b ON b.id=pi.branch_id JOIN pos_sale_items psi ON psi.pos_import_id=pi.id JOIN menu_items mi ON mi.id=psi.menu_item_id
      WHERE pi.business_date BETWEEN $1::date AND $2::date AND ($3::uuid IS NULL OR pi.branch_id=$3::uuid)
        AND ($4::uuid IS NULL OR mi.id=$4::uuid) ORDER BY pi.business_date,mi.name LIMIT 5001`,
      [request.startDate, request.endDate, branchId, request.productId ?? null],
    );
    if (result.rows.length > 5000) throw new Error("REPORT_EXPORT_LIMIT");
    const { totalQuantitySold: totalQuantity, totalSales } = summarizeSalesRows(
      result.rows,
    );
    summaries.SALES.push(
      {
        key: "totalQuantitySold",
        label: "Total Quantity Sold",
        value: totalQuantity,
        type: "number",
      },
      {
        key: "totalSales",
        label: "Total Sales",
        value: totalSales,
        type: "currency",
      },
    );
    sections.push(
      section(
        "Sales Detail",
        [
          { key: "businessDate", label: "Business Date", type: "date" },
          { key: "branch", label: "Branch", type: "text" },
          { key: "product", label: "Product", type: "text" },
          { key: "quantitySold", label: "Quantity Sold", type: "number" },
          {
            key: "sellingPriceSnapshot",
            label: "Selling Price Snapshot",
            type: "currency",
          },
          { key: "salesRevenue", label: "Sales Revenue", type: "currency" },
        ],
        result.rows,
        request,
        forExport,
        "Historical selling-price snapshots are preserved.",
      ),
    );
  }

  if (selected.has("COGS_PROFITABILITY")) {
    {
      const sales = analytics.products.reduce(
          (sum: any, row: any) => sum + n(row.revenue),
          0,
        ),
        cogs = analytics.products.reduce(
          (sum: any, row: any) => sum + n(row.cogs),
          0,
        );
      const financial = calculateFinancialSummary({
        sales,
        productCogs: cogs,
        detectedShortageValue: 0,
        verifiedShrinkageCost: 0,
      });
      summaries.COGS_PROFITABILITY.push(
        {
          key: "sales",
          label: "Total Sales",
          value: round2(sales),
          type: "currency",
        },
        {
          key: "totalCogs",
          label: "Total COGS",
          value: round2(financial.totalCogs),
          type: "currency",
        },
        {
          key: "grossProfit",
          label: "Gross Profit",
          value: round2(financial.grossProfit),
          type: "currency",
        },
        {
          key: "grossMargin",
          label: "Gross Margin",
          value: round2(financial.grossMargin),
          type: "percentage",
        },
      );
    }
    sections.push(
      section(
        "Product Profitability",
        [
          { key: "name", label: "Menu Product", type: "text" },
          { key: "quantitySold", label: "Quantity Sold", type: "number" },
          { key: "revenue", label: "Revenue", type: "currency" },
          { key: "cogs", label: "Product COGS", type: "currency" },
          { key: "grossProfit", label: "Gross Profit", type: "currency" },
          { key: "grossMargin", label: "Gross Margin", type: "percentage" },
          {
            key: "shareOfTotalCogs",
            label: "Share of Total COGS",
            type: "percentage",
          },
        ],
        analytics.products,
        request,
        forExport,
        "Gross margin is product gross margin based on COGS, not full business profitability.",
      ),
    );
  }

  if (selected.has("INVENTORY_STATUS")) {
    const rows = analytics.ingredients.map((row: any) => ({
      ...row,
      estimatedStockout: row.estimatedStockoutDate ?? "N/A",
    }));
    summaries.INVENTORY_STATUS.push(
      {
        key: "items",
        label: "Inventory Items",
        value: rows.length,
        type: "number",
      },
      {
        key: "atRisk",
        label: "Items Requiring Attention",
        value: rows.filter((row: any) => row.risk !== "NORMAL").length,
        type: "number",
      },
    );
    sections.push(
      section(
        "Inventory Status",
        [
          { key: "branchName", label: "Branch", type: "text" },
          { key: "name", label: "Ingredient", type: "text" },
          { key: "unit", label: "Unit", type: "text" },
          { key: "currentStock", label: "Current Stock", type: "number" },
          { key: "reorderLevel", label: "Reorder Level", type: "number" },
          { key: "incoming", label: "Confirmed Incoming", type: "number" },
          {
            key: "projectedEndingStock",
            label: "Projected Ending Stock",
            type: "number",
          },
          {
            key: "estimatedStockout",
            label: "Estimated Stock-out",
            type: "date",
          },
          { key: "risk", label: "Inventory Risk", type: "text" },
        ],
        rows,
        request,
        forExport,
        "Quantities use normalized inventory units.",
      ),
    );
  }

  if (selected.has("INVENTORY_VARIANCE")) {
    const result = await pool.query(
      `SELECT ic.count_date::text "countDate",b.name branch,ii.name ingredient,ici.unit,
      ici.expected_quantity::float8 "expectedQuantity",ici.actual_quantity::float8 "actualQuantity",ici.variance_quantity::float8 "varianceQuantity",
      ici.variance_value::float8 "varianceValue",CASE WHEN ici.expected_quantity>0 THEN (ici.variance_quantity/ici.expected_quantity*100)::float8 ELSE NULL END "variancePercentage"
      FROM inventory_counts ic JOIN inventory_count_items ici ON ici.inventory_count_id=ic.id JOIN branches b ON b.id=ic.branch_id JOIN inventory_items ii ON ii.id=ici.inventory_item_id
      WHERE ic.count_date BETWEEN $1::date AND $2::date AND ($3::uuid IS NULL OR ic.branch_id=$3::uuid) AND ($4::uuid IS NULL OR ii.id=$4::uuid)
      ORDER BY ic.count_date DESC,abs(ici.variance_value) DESC LIMIT 5001`,
      [
        request.startDate,
        request.endDate,
        branchId,
        request.ingredientId ?? null,
      ],
    );
    if (result.rows.length > 5000) throw new Error("REPORT_EXPORT_LIMIT");
    const rows = result.rows.map((row) => ({
      ...row,
      varianceStatus: getVarianceStatus(row.varianceQuantity),
    }));
    summaries.INVENTORY_VARIANCE.push(
      {
        key: "records",
        label: "Variance Records",
        value: rows.length,
        type: "number",
      },
      {
        key: "detected",
        label: "Detected Shortage Value",
        value: rows.reduce(
          (sum, row) => sum + Math.max(n(row.varianceValue), 0),
          0,
        ),
        type: "currency",
      },
    );
    sections.push(
      section(
        "Inventory Variance",
        [
          { key: "countDate", label: "Count Date", type: "date" },
          { key: "branch", label: "Branch", type: "text" },
          { key: "ingredient", label: "Ingredient", type: "text" },
          { key: "unit", label: "Unit", type: "text" },
          {
            key: "expectedQuantity",
            label: "Expected Quantity",
            type: "number",
          },
          { key: "actualQuantity", label: "Actual Quantity", type: "number" },
          {
            key: "varianceQuantity",
            label: "Variance Quantity",
            type: "number",
          },
          { key: "varianceValue", label: "Variance Value", type: "currency" },
          {
            key: "variancePercentage",
            label: "Variance %",
            type: "percentage",
          },
          { key: "varianceStatus", label: "Status", type: "text" },
        ],
        rows,
        request,
        forExport,
        "Positive variance is shortage; negative variance is excess. Exported signs are preserved.",
      ),
    );
  }

  if (selected.has("SHRINKAGE")) {
    const result = await pool.query(
      `SELECT coalesce(sr.investigated_at,sr.detected_at) "investigationDate",b.name branch,ii.name ingredient,sr.variance_value::float8 "varianceValue",sr.status::text "investigationStatus",
      sr.classification::text "finalClassification",CASE WHEN sr.status IN ('VERIFIED','REVIEWED') AND sr.classification IN (${VERIFIED_SHRINKAGE_CLASSIFICATIONS_SQL}) THEN greatest(sr.variance_value,0)::float8 ELSE 0 END "verifiedShrinkageCost",
      CASE WHEN sr.status IN ('VERIFIED','REVIEWED') THEN concat(mu.first_name,' ',mu.last_name) ELSE NULL END "branchManagerVerification",
      CASE WHEN sr.status='REVIEWED' THEN 'REVIEWED' WHEN sr.status='VERIFIED' THEN 'AWAITING OWNER REVIEW' ELSE 'NOT YET SUBMITTED' END "ownerReviewState"
      FROM shrinkage_reports sr JOIN branches b ON b.id=sr.branch_id JOIN inventory_items ii ON ii.id=sr.inventory_item_id LEFT JOIN users mu ON mu.id=sr.submitted_by
      WHERE sr.detected_at::date BETWEEN $1::date AND $2::date AND ($3::uuid IS NULL OR sr.branch_id=$3::uuid) AND ($4::uuid IS NULL OR ii.id=$4::uuid)
        AND ($5::text IS NULL OR sr.classification::text=$5::text) ORDER BY sr.detected_at DESC LIMIT 5001`,
      [
        request.startDate,
        request.endDate,
        branchId,
        request.ingredientId ?? null,
        request.classification ?? null,
      ],
    );
    if (result.rows.length > 5000) throw new Error("REPORT_EXPORT_LIMIT");
    {
      const shrinkage = summarizeShrinkageRows(result.rows);
      summaries.SHRINKAGE.push(
        {
          key: "detected",
          label: "Detected Shortage Value",
          value: shrinkage.detected,
          type: "currency",
        },
        {
          key: "underInvestigation",
          label: "Under Investigation Value",
          value: shrinkage.underInvestigation,
          type: "currency",
        },
        {
          key: "verified",
          label: "Verified Shrinkage Cost",
          value: shrinkage.verified,
          type: "currency",
        },
        {
          key: "correction",
          label: "Resolved Non-Shrinkage Correction",
          value: shrinkage.correction,
          type: "currency",
        },
        {
          key: "verifiedCases",
          label: "Verified Cases",
          value: shrinkage.verifiedCases,
          type: "number",
        },
      );
    }
    sections.push(
      section(
        "Shrinkage Investigation Detail",
        [
          {
            key: "investigationDate",
            label: "Investigation Date",
            type: "datetime",
          },
          { key: "branch", label: "Branch", type: "text" },
          { key: "ingredient", label: "Ingredient", type: "text" },
          { key: "varianceValue", label: "Variance Value", type: "currency" },
          {
            key: "investigationStatus",
            label: "Investigation Status",
            type: "text",
          },
          {
            key: "finalClassification",
            label: "Final Classification",
            type: "text",
          },
          {
            key: "verifiedShrinkageCost",
            label: "Verified Shrinkage Cost",
            type: "currency",
          },
          {
            key: "branchManagerVerification",
            label: "Branch Manager Verification",
            type: "text",
          },
          { key: "ownerReviewState", label: "Owner Review", type: "text" },
        ],
        result.rows,
        request,
        forExport,
      ),
    );
  }

  if (selected.has("PURCHASE_ORDER")) {
    const result = await pool.query(
      `SELECT po.po_no "poNumber",po.supplier_name supplier,b.name branch,po.order_date::text "orderDate",po.expected_delivery_date::text "expectedDelivery",
      po.status::text,ii.name ingredient,poi.quantity_ordered::float8 "orderedQuantity",poi.quantity_received::float8 "receivedQuantity",
      (poi.quantity_ordered-poi.quantity_received)::float8 "outstandingQuantity",(poi.quantity_ordered*poi.unit_cost)::float8 total
      FROM purchase_orders po JOIN purchase_order_items poi ON poi.purchase_order_id=po.id JOIN branches b ON b.id=po.branch_id JOIN inventory_items ii ON ii.id=poi.inventory_item_id
      WHERE po.order_date BETWEEN $1::date AND $2::date AND ($3::uuid IS NULL OR po.branch_id=$3::uuid) AND ($4::text IS NULL OR po.status::text=$4::text)
        AND ($5::uuid IS NULL OR ii.id=$5::uuid) ORDER BY po.order_date DESC,po.po_no,ii.name LIMIT 5001`,
      [
        request.startDate,
        request.endDate,
        branchId,
        request.poStatus ?? null,
        request.ingredientId ?? null,
      ],
    );
    if (result.rows.length > 5000) throw new Error("REPORT_EXPORT_LIMIT");
    summaries.PURCHASE_ORDER.push(
      {
        key: "lines",
        label: "Purchase Order Lines",
        value: result.rows.length,
        type: "number",
      },
      {
        key: "total",
        label: "Ordered Total",
        value: result.rows.reduce((sum, row) => sum + n(row.total), 0),
        type: "currency",
      },
      {
        key: "outstanding",
        label: "Outstanding Quantity",
        value: result.rows.reduce(
          (sum, row) => sum + n(row.outstandingQuantity),
          0,
        ),
        type: "number",
      },
    );
    sections.push(
      section(
        "Purchase Orders",
        [
          { key: "poNumber", label: "PO Number", type: "text" },
          { key: "supplier", label: "Supplier", type: "text" },
          { key: "branch", label: "Branch", type: "text" },
          { key: "orderDate", label: "Order Date", type: "date" },
          { key: "expectedDelivery", label: "Expected Delivery", type: "date" },
          { key: "status", label: "Status", type: "text" },
          { key: "ingredient", label: "Ingredient", type: "text" },
          { key: "orderedQuantity", label: "Ordered Quantity", type: "number" },
          {
            key: "receivedQuantity",
            label: "Received Quantity",
            type: "number",
          },
          {
            key: "outstandingQuantity",
            label: "Outstanding Quantity",
            type: "number",
          },
          { key: "total", label: "Total", type: "currency" },
        ],
        result.rows,
        request,
        forExport,
      ),
    );
  }

  if (selected.has("PREDICTIVE_FORECAST")) {
    const forecastStart =
      request.forecastStart ?? addDays(manilaBusinessDate(), 1);
    const forecastEnd = request.forecastEnd ?? addDays(forecastStart, 29);
    const forecast = await buildPredictiveForecast(user, {
      startDate: forecastStart,
      endDate: forecastEnd,
      branchId: branchId ?? undefined,
    });
    summaries.PREDICTIVE_FORECAST.push(
      {
        key: "forecastSales",
        label: "Predicted Sales",
        value: forecast.summary.forecastSales,
        type: "currency",
      },
      {
        key: "forecastHorizon",
        label: "Forecast Horizon",
        value: `${forecastStart} to ${forecastEnd}`,
        type: "text",
      },
      {
        key: "salesMae",
        label: "Sales MAE",
        value: forecast.accuracy.sales.overall.mae,
        type: "currency",
      },
      {
        key: "evaluatedDays",
        label: "Evaluated Days",
        value: forecast.accuracy.sales.overall.evaluatedDays,
        type: "number",
      },
    );
    sections.push(
      section(
        "Forecast Values",
        [
          { key: "branchName", label: "Branch", type: "text" },
          { key: "name", label: "Ingredient", type: "text" },
          { key: "unit", label: "Unit", type: "text" },
          { key: "systemStock", label: "Current Stock", type: "number" },
          {
            key: "projectedEndStock",
            label: "Projected Ending Stock",
            type: "number",
          },
          { key: "daysToStockout", label: "Days to Stock-out", type: "number" },
          {
            key: "recommendedReorder",
            label: "Suggested Reorder",
            type: "number",
          },
          { key: "urgency", label: "Risk", type: "text" },
        ],
        forecast.predictions,
        request,
        forExport,
        "Forecast values are predictions, not guaranteed outcomes.",
      ),
    );
    sections.push(
      section(
        "Forecast Evaluation",
        [
          { key: "branchName", label: "Branch", type: "text" },
          { key: "mae", label: "Sales MAE", type: "currency" },
          { key: "evaluatedDays", label: "Evaluated Days", type: "number" },
          {
            key: "averageActual",
            label: "Average Actual Sales",
            type: "currency",
          },
          {
            key: "averageForecast",
            label: "Average Forecast Sales",
            type: "currency",
          },
        ],
        forecast.accuracy.sales.branches,
        request,
        forExport,
        "MAE is average forecast error, not an accuracy percentage.",
      ),
    );
    sections.push(
      section(
        "Ingredient Usage MAE",
        [
          { key: "branchName", label: "Branch", type: "text" },
          { key: "name", label: "Ingredient", type: "text" },
          { key: "unit", label: "Unit", type: "text" },
          { key: "mae", label: "Ingredient MAE", type: "number" },
          { key: "evaluatedDays", label: "Evaluated Days", type: "number" },
        ],
        forecast.accuracy.ingredients,
        request,
        forExport,
      ),
    );
  }

  const totalRows = sections.reduce((sum, item) => sum + item.totalRows, 0);
  let cursor = 0;
  const pageStart = (request.page - 1) * request.pageSize,
    pageEnd = pageStart + request.pageSize;
  const multiReportPreview=!forExport&&request.reportTypes.length>1;
  const visibleSections = forExport
    ? sections
    : multiReportPreview
      ? sections.map((item)=>({...item,rows:item.rows.slice(pageStart,pageEnd)}))
      : sections
        .map((item) => {
          const sectionStart = cursor,
            sectionEnd = cursor + item.rows.length;
          cursor = sectionEnd;
          const from = Math.max(0, pageStart - sectionStart),
            to = Math.max(
              0,
              Math.min(item.rows.length, pageEnd - sectionStart),
            );
          return {
            ...item,
            rows:
              pageEnd <= sectionStart || pageStart >= sectionEnd
                ? []
                : item.rows.slice(from, to),
          };
        })
        .filter((item) => item.rows.length > 0 || item.totalRows === 0);
  const reportGroups = request.reportTypes.map((reportType) => ({
    reportType,
    title: GROUP_TITLES[reportType],
    summary: summaries[reportType],
    sections: visibleSections.filter(
      (item) => SECTION_REPORT_TYPES[item.title] === reportType,
    ),
  }));
  const summary =
    request.reportTypes.length === 1 ? summaries[request.reportTypes[0]!] : [];
  const totalPages=multiReportPreview?Math.max(1,...sections.map(item=>Math.ceil(item.totalRows/request.pageSize))):Math.max(1,Math.ceil(totalRows/request.pageSize));
  return {
    metadata: meta,
    summary,
    sections: visibleSections,
    reportGroups,
    pagination: {
      page: request.page,
      pageSize: request.pageSize,
      totalRows,
      totalPages,
    },
  };
}
