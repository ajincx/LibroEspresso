import { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  Boxes,
  Check,
  Download,
  FileSpreadsheet,
  FileText,
  PackageSearch,
  ReceiptText,
  ScanSearch,
  ShoppingCart,
  Sparkles,
} from "lucide-react";
import {
  Btn,
  CalendarDateField,
  Card,
  SectionHeader,
  Select,
} from "../../components/ModuleUi";
import { useAuth } from "../../contexts/AuthContext";
import { masterDataService } from "../../services/masterData.service";
import { reportsService } from "../../services/reports.service";
import type { Branch, InventoryItem, MenuItem } from "../../types/masterData";
import type { Role } from "../../types/navigation";
import type {
  ApprovedReportType,
  ReportDataset,
  ReportRequest,
  ReportValueType,
} from "../../types/reports";
import { businessDate } from "../../utils/businessDate";
import { formatAppCurrency, formatAppDate } from "../../utils/appPreferences";
import { toast } from "sonner";

const addDays = (value: string, days: number) => {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};
const reportTypes: {
  value: ApprovedReportType;
  label: string;
  description: string;
  icon: typeof FileText;
}[] = [
  {
    value: "SALES",
    label: "Sales Report",
    description: "Imported sales and selling-price snapshots",
    icon: ShoppingCart,
  },
  {
    value: "COGS_PROFITABILITY",
    label: "COGS and Profitability Report",
    description: "Product COGS, gross profit, and gross margin",
    icon: BarChart3,
  },
  {
    value: "INVENTORY_STATUS",
    label: "Inventory Status Report",
    description: "Current stock, incoming supply, and risk",
    icon: Boxes,
  },
  {
    value: "INVENTORY_VARIANCE",
    label: "Inventory Variance Report",
    description: "Expected versus actual inventory with signed variance",
    icon: ScanSearch,
  },
  {
    value: "SHRINKAGE",
    label: "Shrinkage Report",
    description: "Investigation state and verified shrinkage",
    icon: PackageSearch,
  },
  {
    value: "PURCHASE_ORDER",
    label: "Purchase Order Report",
    description: "Ordered, received, and outstanding quantities",
    icon: ReceiptText,
  },
  {
    value: "PREDICTIVE_FORECAST",
    label: "Predictive Forecast Report",
    description: "Forecast values separated from MAE evaluation",
    icon: Sparkles,
  },
];
export const selectAllReportTypes=()=>reportTypes.map(item=>item.value);
export const toggleReportType=(selected:ApprovedReportType[],value:ApprovedReportType)=>selected.includes(value)?selected.filter(item=>item!==value):reportTypes.map(item=>item.value).filter(item=>item===value||selected.includes(item));
const classifications = [
  { label: "All Classifications", value: "" },
  ...(
    [
      "SPOILAGE",
      "WASTAGE",
      "SPILLAGE",
      "DAMAGED_ITEM",
      "PREPARATION_ERROR",
      "OVERPRODUCTION",
      "EXPIRATION",
      "UNAUTHORIZED_CONSUMPTION",
      "PILFERAGE",
      "COUNT_ERROR",
    ] as const
  ).map((value) => ({
    label:
      value === "PILFERAGE"
        ? "Verified Pilferage"
        : value
            .replaceAll("_", " ")
            .replace(/\b\w/g, (char) => char.toUpperCase()),
    value,
  })),
];
const poStatuses = [
  { label: "All Statuses", value: "" },
  ...(
    ["DRAFT", "ORDERED", "PARTIALLY_RECEIVED", "RECEIVED", "CANCELLED"] as const
  ).map((value) => ({
    label: value
      .replaceAll("_", " ")
      .replace(/\b\w/g, (char) => char.toUpperCase()),
    value,
  })),
];

function valueDisplay(value: unknown, type: ReportValueType) {
  if (value === null || value === undefined || value === "") return "N/A";
  if (type === "currency") return formatAppCurrency(Number(value));
  if (type === "percentage") return `${Number(value).toFixed(2)}%`;
  if (type === "date")
    return /^\d{4}-\d{2}-\d{2}$/.test(String(value))
      ? formatAppDate(String(value))
      : String(value);
  if (type === "datetime") return formatAppDate(String(value), true);
  if (type === "number")
    return Number(value).toLocaleString("en-PH", { maximumFractionDigits: 3 });
  return String(value).replaceAll("_", " ");
}

export function ReportSelector({
  selected,
  onChange,
}: {
  selected: ApprovedReportType[];
  onChange: (next: ApprovedReportType[]) => void;
}) {
  const toggle = (value: ApprovedReportType) => onChange(toggleReportType(selected,value));
  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {reportTypes.map((item) => {
          const active=selected.includes(item.value);
          return <button type="button" key={item.value} aria-pressed={active} onClick={()=>toggle(item.value)} className={`group/report relative min-h-[92px] rounded-xl border p-3.5 text-left transition-[border-color,background-color,box-shadow,transform] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-primary)] focus-visible:ring-offset-2 ${active?"border-[var(--app-primary)] bg-[var(--app-primary-faint)] shadow-md":"border-[var(--app-border)] bg-[var(--app-surface)] hover:border-[var(--app-primary-soft)] hover:bg-[var(--app-surface-muted)] hover:shadow-sm"}`}>
            <span className="flex items-start gap-3"><span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${active?"bg-[var(--app-primary)] text-white":"bg-[var(--app-surface-muted)] text-[var(--app-primary)]"}`}><item.icon size={16}/></span><span className="min-w-0 pr-6"><span className="block text-sm font-bold text-[var(--app-text)]">{item.label}</span><span className="mt-1 block text-xs leading-relaxed text-[var(--app-text-muted)]">{item.description}</span></span>{active&&<Check aria-hidden="true" size={16} className="absolute right-3 top-3 text-[var(--app-primary)]"/>}</span>
          </button>;
        })}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--app-border)] pt-3">
        <span className="text-xs font-semibold text-[var(--app-text-muted)]" aria-live="polite">{selected.length} report{selected.length===1?"":"s"} selected</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onChange(selectAllReportTypes())}
            className="rounded-lg px-3 py-2 text-xs font-semibold text-[var(--app-primary)] hover:bg-[var(--app-primary-faint)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-primary)]"
          >
            Select All
          </button>
          <button
            type="button"
            onClick={() => onChange([])}
            disabled={!selected.length}
            className="rounded-lg px-3 py-2 text-xs font-semibold text-[var(--app-text-muted)] hover:bg-[var(--app-surface-muted)] disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-primary)]"
          >
            Clear Selection
          </button>
        </div>
      </div>
    </div>
  );
}

export function Reports({
  role,
  scopeBranchId,
  scopeBranchName = "All Branches",
}: {
  role: Role;
  scopeBranchId?: string;
  scopeBranchName?: string;
}) {
  const { user } = useAuth();
  const today = businessDate();
  const [selectedTypes, setSelectedTypes] = useState<ApprovedReportType[]>([
      "SALES",
    ]),
    [startDate, setStartDate] = useState(`${today.slice(0, 7)}-01`),
    [endDate, setEndDate] = useState(today);
  const [branchId, setBranchId] = useState(
    role === "owner" && scopeBranchId && scopeBranchId !== "ALL"
      ? scopeBranchId
      : "",
  );
  const [productId, setProductId] = useState(""),
    [ingredientId, setIngredientId] = useState(""),
    [classification, setClassification] = useState(""),
    [poStatus, setPoStatus] = useState("");
  const [forecastStart, setForecastStart] = useState(addDays(today, 1)),
    [forecastEnd, setForecastEnd] = useState(addDays(today, 30));
  const [branches, setBranches] = useState<Branch[]>([]),
    [products, setProducts] = useState<MenuItem[]>([]),
    [ingredients, setIngredients] = useState<InventoryItem[]>([]);
  const [preview, setPreview] = useState<ReportDataset | null>(null),
    [loading, setLoading] = useState(false),
    [exporting, setExporting] = useState<"pdf" | "xlsx" | null>(null),
    [page, setPage] = useState(1);
  useEffect(() => {
    if (role === "owner")
      void masterDataService
        .branches()
        .then(setBranches)
        .catch(() => setBranches([]));
    void Promise.all([
      masterDataService.menuItems(),
      masterDataService.inventoryItems(),
    ])
      .then(([menu, items]) => {
        setProducts(menu);
        setIngredients(items);
      })
      .catch(() => {
        setProducts([]);
        setIngredients([]);
      });
  }, [role]);
  useEffect(() => {
    if (role === "owner")
      setBranchId(
        scopeBranchId && scopeBranchId !== "ALL" ? scopeBranchId : "",
      );
  }, [role, scopeBranchId]);
  const has = (...types: ApprovedReportType[]) =>
    types.some((type) => selectedTypes.includes(type));
  const showProduct = has("SALES", "COGS_PROFITABILITY"),
    showIngredient = has(
      "INVENTORY_STATUS",
      "INVENTORY_VARIANCE",
      "SHRINKAGE",
      "PURCHASE_ORDER",
    ),
    showClassification = has("SHRINKAGE"),
    showPoStatus = has("PURCHASE_ORDER"),
    showForecast = has("PREDICTIVE_FORECAST");
  const request = useMemo<ReportRequest>(
    () => ({
      reportTypes: selectedTypes,
      startDate,
      endDate,
      branchId: role === "owner" && branchId ? branchId : undefined,
      productId: showProduct && productId ? productId : undefined,
      ingredientId: showIngredient && ingredientId ? ingredientId : undefined,
      classification:
        showClassification && classification ? classification : undefined,
      poStatus: showPoStatus && poStatus ? poStatus : undefined,
      forecastStart: showForecast ? forecastStart : undefined,
      forecastEnd: showForecast ? forecastEnd : undefined,
      page,
      pageSize: 50,
    }),
    [
      selectedTypes,
      startDate,
      endDate,
      role,
      branchId,
      showProduct,
      productId,
      showIngredient,
      ingredientId,
      showClassification,
      classification,
      showPoStatus,
      poStatus,
      showForecast,
      forecastStart,
      forecastEnd,
      page,
    ],
  );
  const selectionChanged = (next: ApprovedReportType[]) => {
    setSelectedTypes(next);
    setPreview(null);
    setPage(1);
  };
  const generate = async (targetPage = 1) => {
    if (!selectedTypes.length) return;
    if (startDate > endDate) {
      toast.error("Date To must be on or after Date From.");
      return;
    }
    setLoading(true);
    try {
      const result = await reportsService.preview({
        ...request,
        page: targetPage,
      });
      setPreview(result);
      setPage(targetPage);
      toast.success(
        `${selectedTypes.length} report${selectedTypes.length === 1 ? "" : "s"} prepared for review.`,
      );
    } catch (error) {
      setPreview(null);
      toast.error(
        error instanceof Error
          ? error.message
          : "Report generation failed. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };
  const exportReport = async (format: "pdf" | "xlsx") => {
    setExporting(format);
    try {
      await reportsService.export({ ...request, page: 1 }, format);
      toast.success(
        format === "pdf" ? "PDF downloaded." : "Excel workbook downloaded.",
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : `${format.toUpperCase()} generation failed. Please try again.`,
      );
    } finally {
      setExporting(null);
    }
  };
  return (
    <div className="reports-page p-4 md:p-6 space-y-5">
      <SectionHeader
        title="Reports"
        sub="Build one review-ready preview from one or more approved report categories"
      />
      <Card>
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div><h2 className="font-semibold">1. Select Reports</h2><p className="mt-1 text-xs text-[var(--app-text-muted)]">Choose one or more reports. They appear in the official order.</p></div>
        </div>
        <div className="mt-4"><ReportSelector selected={selectedTypes} onChange={selectionChanged}/></div>
      </Card>
      <div className="reports-layout grid xl:grid-cols-[340px_1fr] gap-5">
        <div className="space-y-4">
          <Card>
            <h2 className="font-semibold">2. Report Filters</h2>
            <div className="grid gap-3 mt-3">
              <CalendarDateField
                label="Date From"
                value={startDate}
                onChange={(value) => {
                  setStartDate(value);
                  setPreview(null);
                }}
              />
              <CalendarDateField
                label="Date To"
                value={endDate}
                onChange={(value) => {
                  setEndDate(value);
                  setPreview(null);
                }}
              />
              {role === "owner" ? (
                <label className="text-xs font-semibold">
                  Branch
                  <Select
                    options={[
                      { label: "All Branches", value: "" },
                      ...branches.map((item) => ({
                        label: item.name,
                        value: item.id,
                      })),
                    ]}
                    value={branchId}
                    onChange={(value) => {
                      setBranchId(value);
                      setPreview(null);
                    }}
                  />
                </label>
              ) : (
                <div className="rounded-xl border p-3">
                  <p className="text-[10px] uppercase text-[var(--app-text-muted)]">
                    Branch Scope
                  </p>
                  <p className="text-sm font-semibold mt-1">
                    {user?.branch?.name ?? scopeBranchName}
                  </p>
                  <p className="text-[11px] text-[var(--app-text-muted)]">
                    Enforced by the backend
                  </p>
                </div>
              )}
              {showProduct && (
                <label className="text-xs font-semibold">
                  Product
                  <Select
                    options={[
                      { label: "All Products", value: "" },
                      ...products.map((item) => ({
                        label: item.name,
                        value: item.id,
                      })),
                    ]}
                    value={productId}
                    onChange={(value) => {
                      setProductId(value);
                      setPreview(null);
                    }}
                  />
                </label>
              )}
              {showIngredient && (
                <label className="text-xs font-semibold">
                  Ingredient
                  <Select
                    options={[
                      { label: "All Ingredients", value: "" },
                      ...ingredients.map((item) => ({
                        label: item.name,
                        value: item.id,
                      })),
                    ]}
                    value={ingredientId}
                    onChange={(value) => {
                      setIngredientId(value);
                      setPreview(null);
                    }}
                  />
                </label>
              )}
              {showClassification && (
                <label className="text-xs font-semibold">
                  Classification
                  <Select
                    options={classifications}
                    value={classification}
                    onChange={(value) => {
                      setClassification(value);
                      setPreview(null);
                    }}
                  />
                </label>
              )}
              {showPoStatus && (
                <label className="text-xs font-semibold">
                  PO Status
                  <Select
                    options={poStatuses}
                    value={poStatus}
                    onChange={(value) => {
                      setPoStatus(value);
                      setPreview(null);
                    }}
                  />
                </label>
              )}
              {showForecast && (
                <>
                  <CalendarDateField
                    label="Forecast Start"
                    value={forecastStart}
                    onChange={(value) => {
                      setForecastStart(value);
                      setPreview(null);
                    }}
                  />
                  <CalendarDateField
                    label="Forecast End"
                    value={forecastEnd}
                    onChange={(value) => {
                      setForecastEnd(value);
                      setPreview(null);
                    }}
                  />
                </>
              )}
              <Btn
                onClick={() => void generate(1)}
                disabled={loading || selectedTypes.length === 0}
              >
                {loading ? "Generating Preview…" : "Generate Preview"}
              </Btn>
            </div>
          </Card>
        </div>
        <div className="min-w-0">
          {!preview ? (
            <Card className="min-h-[520px] flex items-center justify-center">
              <div className="text-center max-w-md">
                <div className="w-14 h-14 rounded-2xl bg-[var(--app-primary-faint)] text-[var(--app-primary)] flex items-center justify-center mx-auto">
                  <FileText size={25} />
                </div>
                <h2 className="font-semibold mt-4">No report generated yet</h2>
                <p className="text-sm text-[var(--app-text-muted)] mt-2">
                  {selectedTypes.length
                    ? "Configure the relevant filters, then generate a backend-owned preview."
                    : "Select at least one report to enable the preview."}
                </p>
              </div>
            </Card>
          ) : (
            <div className="space-y-4">
              <Card className="overflow-hidden">
                <div className="border-b pb-4 mb-4 border-[var(--app-border)]">
                  <div className="flex items-center gap-3">
                    <img src="/images/logo.jpg" alt="Libro Espresso Cafe logo" className="h-12 w-12 shrink-0 rounded-xl object-cover shadow-sm"/>
                    <div className="min-w-0"><p className="text-sm font-extrabold uppercase tracking-wide text-[var(--app-primary)]">Libro Espresso Cafe</p><h1 className="mt-0.5 text-xl font-bold">{preview.metadata.title}</h1></div>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1 mt-3 text-xs text-[var(--app-text-muted)]">
                    <p>
                      Scope:{" "}
                      <span className="font-semibold text-[var(--app-text)]">
                        {preview.metadata.branchName}
                      </span>
                    </p>
                    <p>
                      Period:{" "}
                      <span className="font-semibold text-[var(--app-text)]">
                        {formatAppDate(preview.metadata.periodStart)} –{" "}
                        {formatAppDate(preview.metadata.periodEnd)}
                      </span>
                    </p>
                    <p>
                      Generated:{" "}
                      <span className="font-semibold text-[var(--app-text)]">
                        {preview.metadata.generatedAtDisplay}
                      </span>
                    </p>
                    <p>
                      Generated by:{" "}
                      <span className="font-semibold text-[var(--app-text)]">
                        {preview.metadata.generatedBy} ·{" "}
                        {preview.metadata.generatedByRole.replaceAll("_", " ")}
                      </span>
                    </p>
                  </div>
                </div>
                <div className="space-y-8">
                  {preview.reportGroups.map((group) => (
                    <section key={group.reportType} className="rounded-2xl border border-[var(--app-border)] p-4 md:p-5 shadow-sm">
                      <div className="flex items-center gap-2 border-b border-[var(--app-border)] pb-3">
                        <Check size={16} className="text-[var(--app-primary)]" />
                        <h2 className="text-base font-bold">{group.title}</h2>
                      </div>
                      {group.summary.length > 0 && <div className="reports-kpi-grid grid sm:grid-cols-2 xl:grid-cols-4 gap-3 mt-4">{group.summary.map((item) => <div key={item.key} className="rounded-xl border border-[var(--app-border)] bg-[var(--app-surface-muted)] p-3"><p className="text-[11px] uppercase font-semibold text-[var(--app-text-muted)]">{item.label}</p><p className="font-bold mt-1">{valueDisplay(item.value,item.type)}</p></div>)}</div>}
                      <div className="space-y-6 mt-5">{group.sections.map((reportSection) => <div key={reportSection.title}><div className="flex justify-between gap-3 mb-2"><div><h3 className="text-sm font-semibold">{reportSection.title}</h3>{reportSection.note && <p className="text-[11px] text-[var(--app-text-muted)] mt-0.5">{reportSection.note}</p>}</div><span className="text-xs text-[var(--app-text-muted)]">{reportSection.totalRows.toLocaleString()} row{reportSection.totalRows === 1 ? "" : "s"}</span></div><div className="overflow-x-auto rounded-xl border border-[var(--app-border)]"><table className="w-full min-w-[720px] text-xs"><thead><tr className="bg-[var(--app-primary)] text-white">{reportSection.columns.map((column) => <th key={column.key} className={`px-3 py-2.5 whitespace-nowrap ${column.type === "text" ? "text-left" : "text-center"}`}>{column.label}</th>)}</tr></thead><tbody>{reportSection.rows.length ? reportSection.rows.map((row,rowIndex) => <tr key={rowIndex} className="border-t border-[var(--app-border)] even:bg-[var(--app-surface-muted)] hover:bg-[var(--app-primary-faint)] transition-colors duration-150">{reportSection.columns.map((column) => <td key={column.key} className={`px-3 py-2.5 ${column.type === "text" ? "text-left" : "text-center"}`}>{valueDisplay(row[column.key],column.type)}</td>)}</tr>) : <tr><td colSpan={reportSection.columns.length} className="text-center py-10 text-[var(--app-text-muted)]">No records were found for the selected period.</td></tr>}</tbody></table></div></div>)}</div>
                    </section>
                  ))}
                </div>
                <p className="text-[10px] text-[var(--app-text-muted)] mt-6 pt-3 border-t border-[var(--app-border)]">
                  Libro Espresso Reporting System · Generated on demand · No
                  report binary is permanently stored.
                </p>
              </Card>
              {preview.pagination.totalPages > 1 && (
                <div className="flex items-center justify-center gap-3">
                  <Btn
                    variant="outline"
                    disabled={page <= 1 || loading}
                    onClick={() => void generate(page - 1)}
                  >
                    Previous
                  </Btn>
                  <span className="text-xs">
                    Page {page} of {preview.pagination.totalPages}
                  </span>
                  <Btn
                    variant="outline"
                    disabled={page >= preview.pagination.totalPages || loading}
                    onClick={() => void generate(page + 1)}
                  >
                    Next
                  </Btn>
                </div>
              )}
              <div className="flex justify-end gap-2">
                <Btn
                  variant="outline"
                  icon={FileSpreadsheet}
                  disabled={Boolean(exporting)}
                  onClick={() => void exportReport("xlsx")}
                >
                  {exporting === "xlsx" ? "Creating Excel…" : "Excel (.xlsx)"}
                </Btn>
                <Btn
                  icon={Download}
                  disabled={Boolean(exporting)}
                  onClick={() => void exportReport("pdf")}
                >
                  {exporting === "pdf" ? "Creating PDF…" : "PDF"}
                </Btn>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
