import React, { lazy, Suspense, useEffect, useState } from "react";
import { ShoppingCart, Package, TrendingDown, Search, X, Upload, Check, Coffee, CheckCircle, TrendingUp, DollarSign, GitCompare, BarChart2, Hash, Percent, Trash2 } from "lucide-react";
import { Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart } from "recharts";
import { C, CalendarDateField, DashboardRange, DashboardComparison, dashboardPeriodLabel, formatPeso, StatusChip, KPICard, Card, SectionHeader, Btn, SearchInput, Select, DashboardFilters, THead, TR, TD, Pagination, ChartTip, ModuleTabSwitcher, AnimatedTabPanel, TableCard, TableWrapper, TableEmptyRow, TableLoadingRow } from "../../components/ModuleUi";
import { toast } from "sonner";
import type { Page, Role } from "../../types/navigation";
import { inventoryWorkflowService } from "../../services/inventoryWorkflow.service";
import { masterDataService } from "../../services/masterData.service";
import type { PosAnalytics, PosImportPreview, PosImportRecord } from "../../types/inventoryWorkflow";
import type { Branch } from "../../types/masterData";
import { useAuth } from "../../contexts/AuthContext";
import { businessDate, periodDates } from "../../utils/businessDate";
import { formatAppDate } from "../../utils/appPreferences";

export const marginValueColor = (margin:number) => margin > 0 ? C.green : margin < 0 ? C.red : "var(--app-text-muted)";
export const canDeletePosImport = (role:Role) => role === "owner";

export function PosImportDeleteDialog({target,deleting,onCancel,onConfirm}:{target:PosImportRecord;deleting:boolean;onCancel:()=>void;onConfirm:()=>void}) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" role="dialog" aria-modal="true" aria-labelledby="delete-pos-import-title">
    <div className="w-full max-w-lg rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface)] p-6 shadow-2xl">
      <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--app-danger-bg)] text-[var(--app-danger)]"><Trash2 size={20}/></div>
      <h3 id="delete-pos-import-title" className="text-lg font-bold text-[var(--app-text)]">Delete imported sales data?</h3>
      <dl className="mt-4 grid grid-cols-[120px_1fr] gap-x-3 gap-y-2 text-sm"><dt className="text-[var(--app-text-muted)]">File</dt><dd className="font-semibold break-all">{target.sourceFilename}</dd><dt className="text-[var(--app-text-muted)]">Branch</dt><dd className="font-semibold">{target.branchName}</dd><dt className="text-[var(--app-text-muted)]">Business Date</dt><dd className="font-semibold">{formatAppDate(target.businessDate)}</dd></dl>
      <p className="mt-4 rounded-xl bg-[var(--app-surface-muted)] p-3 text-sm leading-6 text-[var(--app-text-muted)]">This removes the sales records and recipe-derived usage associated with this import. It cannot be undone. Imports already included in a physical inventory count cannot be deleted.</p>
      <div className="mt-6 flex justify-end gap-2"><Btn variant="outline" disabled={deleting} onClick={onCancel}>Cancel</Btn><Btn variant="danger" disabled={deleting} onClick={onConfirm}>{deleting?"Deleting…":"Delete Import"}</Btn></div>
    </div>
  </div>;
}

function dateRange(range: DashboardRange, customStart: string, customEnd: string) {
  return periodDates(range, customStart, customEnd);
}

// ─── Sales Analysis ────────────────────────────────────────────────────────────
function SalesAnalysis({ role, scopeBranchName = "All Branches" }: { role: Role; scopeBranchName?: string }) {
  const { user } = useAuth();
  const localToday = businessDate();
  const initialMonthStart = `${localToday.slice(0, 8)}01`;
  const [uploadStep, setUploadStep] = useState<"idle" | "select" | "preview" | "done">("idle");
  const [posPreview, setPosPreview] = useState<PosImportPreview | null>(null);
  const [posCsvText, setPosCsvText] = useState("");
  const [posFilename, setPosFilename] = useState("");
  const [posImportError, setPosImportError] = useState("");
  const [posImporting, setPosImporting] = useState(false);
  const [posConsumption, setPosConsumption] = useState<{ name: string; unit: string; expectedConsumption: number }[]>([]);
  const [posImportResult, setPosImportResult] = useState<{ rowsImported: number; productsMatched: number; totalQuantitySold: number; totalSales: number; businessDate: string; fingerprintIndicator: string } | null>(null);
  const [posImports, setPosImports] = useState<PosImportRecord[]>([]);
  const [posHistoryLoading, setPosHistoryLoading] = useState(true);
  const [posHistoryPage, setPosHistoryPage] = useState(1);
  const [posHistoryTotal, setPosHistoryTotal] = useState(0);
  const [historyRefresh, setHistoryRefresh] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState<PosImportRecord|null>(null);
  const [deletingImport, setDeletingImport] = useState(false);
  const [posImportSearch, setPosImportSearch] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [productCategory, setProductCategory] = useState("All Categories");
  const [posBranchFilter, setPosBranchFilter] = useState("All Branches");
  const [branches, setBranches] = useState<Branch[]>([]);
  const [analytics, setAnalytics] = useState<PosAnalytics | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [tab, setTab] = useState("overview");
  const [range, setRange] = useState<DashboardRange>("mtd");
  const [comparison, setComparison] = useState<DashboardComparison>("previous");
  const [customStart, setCustomStart] = useState(initialMonthStart);
  const [customEnd, setCustomEnd] = useState(localToday);
  const periodLabel = dashboardPeriodLabel(range, customStart, customEnd);
  const comparisonLabel = comparison === "previous" ? "previous period" : "last month";
  const branchLabel = role === "manager" ? (user?.branch?.name ?? "Assigned Branch") : posBranchFilter;

  useEffect(() => {
    if (role !== "owner") return;
    void masterDataService.branches().then(setBranches).catch(() => setBranches([]));
  }, [role]);
  useEffect(() => { if (role === "owner") setPosBranchFilter(scopeBranchName); }, [role, scopeBranchName]);

  useEffect(() => {
    const dates = dateRange(range, customStart, customEnd);
    const branchId = role === "owner" ? branches.find((branch) => branch.name === posBranchFilter)?.id : undefined;
    setAnalyticsLoading(true);
    void inventoryWorkflowService.posAnalytics({ ...dates, branchId })
      .then(setAnalytics)
      .catch(() => setAnalytics(null))
      .finally(() => setAnalyticsLoading(false));
  }, [branches, customEnd, customStart, posBranchFilter, range, role, historyRefresh]);

  useEffect(() => {
    let cancelled=false;
    const branchId=role==="owner"?branches.find(branch=>branch.name===posBranchFilter)?.id:undefined;
    setPosHistoryLoading(true);
    const timer=window.setTimeout(()=>void inventoryWorkflowService.posImports({branchId,search:posImportSearch.trim()||undefined,page:posHistoryPage,pageSize:10})
      .then(result=>{if(!cancelled){setPosImports(result.imports);setPosHistoryTotal(result.pagination.total);}})
      .catch(()=>{if(!cancelled){setPosImports([]);setPosHistoryTotal(0);}})
      .finally(()=>{if(!cancelled)setPosHistoryLoading(false);}),200);
    return()=>{cancelled=true;window.clearTimeout(timer);};
  }, [branches, historyRefresh, posBranchFilter, posHistoryPage, posImportSearch, role]);
  const productCategories = [...new Set((analytics?.products ?? []).map((product) => product.category))];
  const visibleProducts = (analytics?.products ?? []).filter((product) => {
    const matchesCategory = productCategory === "All Categories" || product.category === productCategory;
    const query = productSearch.trim().toLowerCase();
    return matchesCategory && (!query || product.name.toLowerCase().includes(query));
  });

  const selectPosFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setPosImportError("");
    try {
      if (file.size > 4_000_000) throw new Error("POS CSV files must be 4 MB or smaller.");
      const csvText = await file.text();
      if (csvText.includes("�")) throw new Error("The CSV contains unsupported or invalid text encoding. Export it as UTF-8 and try again.");
      const preview = await inventoryWorkflowService.previewPosSales({ sourceFilename: file.name, csvText });
      setPosPreview(preview);
      setPosCsvText(csvText);
      setPosFilename(file.name);
      setUploadStep("preview");
    } catch (reason) {
      setPosPreview(null);
      setPosCsvText("");
      setPosImportError(reason instanceof Error ? reason.message : "Unable to read the POS CSV file.");
    } finally {
      event.target.value = "";
    }
  };

  const confirmPosImport = async () => {
    if (!posPreview?.summary.canImport || !posCsvText) return;
    setPosImporting(true); setPosImportError("");
    try {
      const result = await inventoryWorkflowService.importPosSales({
        sourceFilename: posFilename,
        csvText: posCsvText,
        expectedContentHash: posPreview.contentHash,
      });
      setPosConsumption(result.consumption);
      setPosImportResult(result);
      setPosHistoryPage(1);
      setHistoryRefresh(value=>value+1);
      setUploadStep("done");
    } catch (reason) {
      setPosImportError(reason instanceof Error ? reason.message : "Unable to import POS sales.");
    } finally { setPosImporting(false); }
  };

  const deleteImport=async()=>{
    if(!deleteTarget||role!=="owner")return;
    setDeletingImport(true);
    try{
      await inventoryWorkflowService.deletePosImport(deleteTarget.id);
      toast.success("POS import deleted");
      setDeleteTarget(null);
      setPosHistoryPage(1);
      setHistoryRefresh(value=>value+1);
    }catch(reason){toast.error(reason instanceof Error?reason.message:"Unable to delete the POS import.");}
    finally{setDeletingImport(false);}
  };

  return (
    <div className="p-4 md:p-6 space-y-5">
      <SectionHeader title="Sales Analysis"
        sub={`${branchLabel} · ${periodLabel}`}
        actions={
          <>
            {role === "manager" && <Btn variant="primary" icon={Upload} onClick={() => setUploadStep("select")}>Import POS CSV</Btn>}
            {role === "owner" && <Select options={["All Branches", ...branches.map((branch) => branch.name)]} value={posBranchFilter} onChange={value=>{setPosBranchFilter(value);setPosHistoryPage(1);}} small />}
            <DashboardFilters range={range} comparison={comparison} customStart={customStart} customEnd={customEnd}
              onRangeChange={setRange} onComparisonChange={setComparison}
              onApplyCustom={(start, end) => { setCustomStart(start); setCustomEnd(end); }}
              onReset={() => { setRange("mtd"); setCustomStart(initialMonthStart); setCustomEnd(localToday); }} />
          </>
        } />

      <div className="sales-kpi-grid grid grid-cols-4 gap-4">
        <KPICard label="Total Sales" value={analyticsLoading ? "—" : formatPeso(analytics?.summary.sales ?? 0)} sub={periodLabel} icon={ShoppingCart} color={C.maroon} comparisonLabel={comparisonLabel} />
        <KPICard label="Recipe COGS" value={analyticsLoading ? "—" : formatPeso(analytics?.summary.theoreticalCogs ?? 0)} sub="Based on saved ingredient costs" icon={Package} color={C.amber} comparisonLabel={comparisonLabel} />
        <KPICard label="Gross Profit" value={analyticsLoading ? "—" : formatPeso(analytics?.summary.grossProfit ?? 0)} sub={`${(analytics?.summary.grossMargin ?? 0).toFixed(1)}% margin`} icon={TrendingUp} color={C.green} comparisonLabel={comparisonLabel} />
        <KPICard label="Units Sold" value={analyticsLoading ? "—" : (analytics?.summary.unitsSold ?? 0).toLocaleString()} sub={`${analytics?.summary.importCount ?? 0} POS import(s)`} icon={Hash} color={C.blue} comparisonLabel={comparisonLabel} />
      </div>

      <div className="flex gap-1 border-b overflow-x-auto" style={{ borderColor: C.border }}>
        {["overview", "products", "import_history"].map(t => (
          <button key={t} onClick={() => setTab(t)}
            className="px-4 py-2.5 text-sm font-medium border-b-2 transition-colors capitalize"
            style={{ borderColor: tab === t ? C.maroon : "transparent", color: tab === t ? C.maroon : C.secondary }}>
            {t === "import_history" ? "Import History" : t === "products" ? "Product Sales" : t}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="sales-analysis-grid grid grid-cols-3 gap-5">
          <Card className="col-span-2" padding={false}>
            <div className="px-5 pt-5 pb-0">
              <h3 className="font-semibold mb-4" style={{ color: C.primary }}>Sales vs COGS Trend</h3>
            </div>
            <div className="h-64 px-3 pb-4">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={(analytics?.trends ?? []).map((item) => ({ ...item, date: new Date(`${item.date}T00:00:00`).toLocaleDateString("en-PH", { month: "short", day: "numeric" }), gp: item.grossProfit }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: C.secondary }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: C.secondary }} axisLine={false} tickLine={false}
                    tickFormatter={v => `₱${(v / 1000).toFixed(0)}k`} />
                  <Tooltip content={<ChartTip />} />
                  <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="sales" name="Sales" fill={`color-mix(in srgb, ${C.maroon} 18%, transparent)`} stroke={C.maroon} strokeWidth={1} radius={[3, 3, 0, 0]} />
                  <Line dataKey="cogs" name="COGS" stroke={C.amber} strokeWidth={2} dot={false} />
                  <Line dataKey="gp" name="Gross Profit" stroke={C.green} strokeWidth={2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </Card>
          <Card>
            <h3 className="font-semibold mb-4" style={{ color: C.primary }}>Top Products</h3>
            <div className="space-y-3.5">
              {(analytics?.products ?? []).slice(0, 5).map((p, i) => (
                <div key={p.id}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm" style={{ color: C.primary }}>{p.name}</span>
                    <span className="text-sm font-semibold" style={{ color: C.primary }}>₱{(p.sales / 1000).toFixed(0)}k</span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: C.grayBg }}>
                    <div className="h-full rounded-full" style={{
                      width: `${analytics?.summary.sales ? Math.max(4, (p.sales / analytics.summary.sales) * 100) : 0}%`,
                      background: i === 0 ? C.maroon : i === 1 ? C.mediumMaroon : C.blue
                    }} />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {tab === "products" && (
        <TableCard
          title="Product Sales Performance"
          subtitle={`Calculated from imported POS sales for ${branchLabel} during ${periodLabel}`}
          toolbar={
            <>
              <SearchInput placeholder="Search sold products…" value={productSearch} onChange={setProductSearch} />
              <Select options={["All Categories", ...productCategories]} value={productCategory} onChange={setProductCategory} />
            </>
          }
        >
          <TableWrapper minWidth={760}>
            <THead cols={["Product", "Category", "Units Sold", "Sales", "Recipe COGS", "Gross Profit", "Margin"]} />
            <tbody>
              {analyticsLoading ? (
                <TableLoadingRow colSpan={7} label="Loading product sales…" />
              ) : visibleProducts.length === 0 ? (
                <TableEmptyRow colSpan={7} title="No product sales found" subtitle="No product sales were imported for the selected branch and period." />
              ) : visibleProducts.map((product) => {
                const grossProfit = product.sales - product.cogs;
                const margin = product.sales > 0 ? (grossProfit / product.sales) * 100 : 0;
                return (
                  <TR key={product.id}>
                    <TD><span className="font-semibold text-[var(--app-text)]">{product.name}</span></TD>
                    <TD muted>{product.category}</TD>
                    <TD right>{product.unitsSold.toLocaleString()}</TD>
                    <TD right>{formatPeso(product.sales)}</TD>
                    <TD right muted>{formatPeso(product.cogs)}</TD>
                    <TD right><span className="font-semibold" style={{ color: grossProfit >= 0 ? C.green : C.red }}>{formatPeso(grossProfit)}</span></TD>
                    <TD right><span className="font-bold" style={{ color: marginValueColor(margin) }}>{margin.toFixed(1)}%</span></TD>
                  </TR>
                );
              })}
            </tbody>
          </TableWrapper>
          <Pagination total={visibleProducts.length} page={1} perPage={10} />
        </TableCard>
      )}

      {tab === "import_history" && (
        <TableCard
          title="POS Import History"
          subtitle={`Audit log of imported daily sales files for ${branchLabel}`}
          toolbar={
            <>
              <SearchInput placeholder="Search imports…" value={posImportSearch} onChange={value=>{setPosImportSearch(value);setPosHistoryPage(1);}} />
              {role === "owner" && <Select options={["All Branches", ...branches.map((branch) => branch.name)]} value={posBranchFilter} onChange={value=>{setPosBranchFilter(value);setPosHistoryPage(1);}} />}
            </>
          }
        >
          <TableWrapper minWidth={1080}>
            <THead cols={role === "owner"
              ? ["File Name", "Branch", "Business Date", "Uploaded Date / Time", "Uploaded By", "Valid / Total Rows", "Units Sold", "Total Sales", "Fingerprint", "Status", "Action"]
              : ["File Name", "Business Date", "Uploaded Date / Time", "Uploaded By", "Valid / Total Rows", "Units Sold", "Total Sales", "Fingerprint", "Status"]} />
            <tbody>
              {posHistoryLoading ? (
                <TableLoadingRow colSpan={role === "owner" ? 11 : 9} label="Loading import history…" />
              ) : posImports.length === 0 ? (
                <TableEmptyRow colSpan={role === "owner" ? 11 : 9} title="No POS imports found" subtitle="Upload a POS sales CSV to see historical records." />
              ) : posImports.map((row) => (
                <TR key={row.id}>
                  <TD><span className="font-mono text-xs font-medium" style={{ color: C.primary }}>{row.sourceFilename}</span></TD>
                  {role === "owner" && <TD center><span className="font-semibold" style={{ color: C.maroon }}>{row.branchName}</span></TD>}
                  <TD center muted>{formatAppDate(row.businessDate)}</TD>
                  <TD center muted>{formatAppDate(row.importedAt,true)}</TD>
                  <TD>{row.importedBy}</TD>
                  <TD center>{row.validRows} / {row.totalRows}</TD>
                  <TD right>{row.unitsSold.toLocaleString()}</TD>
                  <TD right>{formatPeso(row.totalSales)}</TD>
                  <TD center mono>{row.fingerprintIndicator ?? "Legacy"}</TD>
                  <TD center><StatusChip status={row.status === "NEEDS_REVIEW" ? "pending_review" : "imported"} /></TD>
                  {canDeletePosImport(role)&&<TD center><button type="button" aria-label={`Delete import ${row.sourceFilename}`} onClick={()=>setDeleteTarget(row)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--app-border)] text-[var(--app-danger)] transition-colors hover:bg-[var(--app-danger-bg)]"><Trash2 size={15}/></button></TD>}
                </TR>
              ))}
            </tbody>
          </TableWrapper>
          <Pagination total={posHistoryTotal} page={posHistoryPage} perPage={10} onPageChange={setPosHistoryPage} />
        </TableCard>
      )}

      {deleteTarget&&canDeletePosImport(role)&&(
        <PosImportDeleteDialog target={deleteTarget} deleting={deletingImport} onCancel={()=>setDeleteTarget(null)} onConfirm={()=>void deleteImport()}/>
      )}

      {/* CSV Upload Modal */}
      {role === "manager" && uploadStep !== "idle" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.45)" }}>
          <div role="dialog" aria-modal="true" aria-labelledby="pos-upload-title" className="rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] overflow-y-auto p-6" style={{ background: "var(--app-surface)", border: `1px solid ${C.border}` }}>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 id="pos-upload-title" className="font-bold text-lg" style={{ color: C.primary }}>Upload POS CSV</h3>
                <p className="text-xs mt-0.5" style={{ color: C.secondary }}>{user?.branch?.name ?? "Assigned Branch"} — Import daily sales data</p>
              </div>
              <button aria-label="Close POS upload" onClick={() => setUploadStep("idle")} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ color: C.secondary, background: C.grayBg }}>
                <X size={15} />
              </button>
            </div>

            {/* Step indicators */}
            <div className="flex items-center gap-2 mb-6">
              {["Select File", "Validate", "Confirm"].map((s, i) => {
                const stepIdx = uploadStep === "select" ? 0 : uploadStep === "preview" ? 1 : 2;
                const done = i < stepIdx;
                const active = i === stepIdx;
                return (
                  <React.Fragment key={s}>
                    <div className="flex items-center gap-1.5">
                      <div className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold"
                        style={{ background: done || active ? C.maroon : C.grayBg, color: done || active ? "#fff" : C.muted }}>
                        {done ? <Check size={11} /> : i + 1}
                      </div>
                      <span className="text-xs font-medium" style={{ color: active ? C.maroon : C.muted }}>{s}</span>
                    </div>
                    {i < 2 && <div className="flex-1 h-px" style={{ background: done ? C.maroon : C.border }} />}
                  </React.Fragment>
                );
              })}
            </div>

            {uploadStep === "select" && (
              <>
                <label className="block border-2 border-dashed rounded-xl p-8 text-center mb-4 cursor-pointer transition-all"
                  style={{ borderColor: C.border }}>
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-3" style={{ background: C.grayBg }}>
                    <Upload size={20} style={{ color: C.muted }} />
                  </div>
                  <p className="text-sm font-semibold" style={{ color: C.primary }}>Drop your POS CSV file here</p>
                  <p className="text-xs mt-1" style={{ color: C.secondary }}>Required: product code or name, quantity sold, selling price, and business date</p>
                  <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(event) => void selectPosFile(event)} />
                </label>
                {posImportError && <div className="mb-4 p-3 rounded-xl text-sm" style={{ color: C.red, background: C.redBg }}>{posImportError}</div>}
                <div className="flex gap-3">
                  <Btn variant="outline" onClick={() => setUploadStep("idle")}>Cancel</Btn>
                  <label className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white text-center cursor-pointer" style={{ background: C.maroon }}>
                    Select File<input type="file" accept=".csv,text/csv" className="sr-only" onChange={(event) => void selectPosFile(event)} />
                  </label>
                </div>
              </>
            )}

            {uploadStep === "preview" && (
              <>
                <div className="p-4 rounded-xl border mb-4" style={{ borderColor: C.border, background: C.mainBg }}>
                  <p className="text-sm font-semibold mb-3" style={{ color: C.primary }}>Validation Preview</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-y-2 gap-x-4 text-sm">
                    {[
                      ["File", posFilename],
                      ["Branch", posPreview?.branchName ?? "Assigned Branch"],
                      ["Business Date", posPreview?.businessDate ?? "Invalid"],
                      ["Source Rows", String(posPreview?.summary.totalSourceRows ?? 0)],
                      ["Valid", String(posPreview?.summary.validRows ?? 0)],
                      ["Warnings", String(posPreview?.summary.warningRows ?? 0)],
                      ["Invalid", String(posPreview?.summary.invalidRows ?? 0)],
                      ["Unmatched", String(posPreview?.summary.unmatchedRows ?? 0)],
                      ["Duplicate", posPreview?.summary.duplicate ? "Yes" : "No"],
                      ["Import Quality", posPreview?.summary.quality.replaceAll("_", " ") ?? "Rejected"],
                      ["Fingerprint", posPreview?.fingerprintIndicator ?? "Not available"],
                    ].map(([label, value]) => (
                      <div key={label}>
                        <span style={{ color: C.secondary }}>{label}: </span>
                        <span className="font-semibold" style={{ color: label === "Duplicate" ? (value === "Yes" ? C.red : C.green) : C.primary }}>{value}</span>
                      </div>
                    ))}
                  </div>
                   <div className="mt-4 pt-3 border-t overflow-x-auto" style={{ borderColor: C.border }}><table className="w-full text-xs min-w-[820px]"><thead><tr>{["Row","Source Product","Matched Product","Quantity","Price","Sales Date","Status","Issue"].map((heading)=><th key={heading} className="text-left px-2 py-2" style={{ color: C.secondary }}>{heading}</th>)}</tr></thead><tbody>{posPreview?.rows.map((row)=><tr key={row.rowNumber} className="border-t" style={{ borderColor: C.border }}><td className="px-2 py-2">{row.rowNumber}</td><td className="px-2 py-2">{row.sourceProduct || "Blank"}</td><td className="px-2 py-2">{row.matchedMenuProduct ?? "Unmatched"}</td><td className="px-2 py-2">{row.quantitySold ?? "Invalid"}</td><td className="px-2 py-2">{row.unitPrice == null ? "Invalid" : `₱${row.unitPrice.toFixed(2)}`}</td><td className="px-2 py-2">{row.businessDate ?? "Invalid"}</td><td className="px-2 py-2 font-semibold" style={{ color: row.status === "INVALID" ? C.red : row.status === "WARNING" ? C.amber : C.green }}>{row.status}</td><td className="px-2 py-2 max-w-xs">{row.issues.join(" ") || "Ready"}</td></tr>)}</tbody></table></div>
                </div>
                {posImportError && <div className="mb-4 p-3 rounded-xl text-sm" style={{ color: C.red, background: C.redBg }}>{posImportError}</div>}
                <div className="flex items-center gap-2 mb-4 p-3 rounded-xl" style={{ background: posPreview?.summary.canImport ? C.greenBg : C.redBg }}>
                  <CheckCircle size={14} style={{ color: posPreview?.summary.canImport ? C.green : C.red }} />
                  <span className="text-sm font-medium" style={{ color: posPreview?.summary.canImport ? C.green : C.red }}>{posPreview?.summary.canImport ? "Validation complete. Review warnings, then confirm the atomic import." : "POS import cannot continue until invalid, unmatched, or duplicate data is corrected."}</span>
                </div>
                <div className="flex gap-3">
                  <Btn variant="outline" onClick={() => setUploadStep("select")}>Back</Btn>
                  <button disabled={posImporting || !posPreview?.summary.canImport} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-50" style={{ background: C.maroon }}
                    onClick={() => void confirmPosImport()}>{posImporting ? "Importing…" : "Confirm Import"}</button>
                </div>
              </>
            )}

            {uploadStep === "done" && (
              <>
                <div className="text-center py-8">
                  <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: C.greenBg }}>
                    <CheckCircle size={32} style={{ color: C.green }} />
                  </div>
                  <h4 className="font-bold text-lg mb-1" style={{ color: C.primary }}>POS Import Complete</h4>
                  <p className="text-sm" style={{ color: C.secondary }}>{posImportResult?.rowsImported ?? 0} sales rows were connected to their configured recipes.</p>
                  <p className="text-xs mt-1" style={{ color: C.muted }}>{posFilename} · {posImportResult?.businessDate ?? ""}</p>
                  <div className="grid grid-cols-2 gap-2 mt-4 text-left text-xs">{[["Rows Imported",posImportResult?.rowsImported ?? 0],["Products Matched",posImportResult?.productsMatched ?? 0],["Total Quantity",posImportResult?.totalQuantitySold ?? 0],["Total Sales",`₱${(posImportResult?.totalSales ?? 0).toLocaleString("en-PH",{minimumFractionDigits:2})}`]].map(([label,value])=><div key={label} className="p-2 rounded-lg" style={{ background:C.mainBg }}><span style={{color:C.secondary}}>{label}: </span><strong>{value}</strong></div>)}</div>
                  <div className="mt-4 p-3 rounded-xl text-left space-y-1.5" style={{ background: C.mainBg }}>
                    <p className="text-xs font-bold uppercase tracking-wide" style={{ color: C.secondary }}>Expected ingredient consumption</p>
                    {posConsumption.map((item) => <div key={`${item.name}-${item.unit}`} className="flex justify-between text-xs"><span>{item.name}</span><strong>{item.expectedConsumption.toFixed(2)} {item.unit}</strong></div>)}
                  </div>
                </div>
                <button className="w-full py-2.5 rounded-xl text-sm font-bold text-white" style={{ background: C.maroon }}
                  onClick={() => { setUploadStep("idle"); setPosPreview(null); setPosCsvText(""); setPosConsumption([]); setPosImportResult(null); setPosFilename(""); toast.success("POS CSV imported successfully"); }}>
                  Done
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Inventory Overview ────────────────────────────────────────────────────────

// ─── COGS Analysis ─────────────────────────────────────────────────────────────
function COGSAnalysis({ role, scopeBranchName = "All Branches" }: { role: Role; scopeBranchName?: string }) {
  const { user } = useAuth();
  const today = businessDate();
  const monthStart = `${today.slice(0, 8)}01`;
  const [range, setRange] = useState<DashboardRange>("mtd");
  const [comparison, setComparison] = useState<DashboardComparison>("previous");
  const [customStart, setCustomStart] = useState(monthStart);
  const [customEnd, setCustomEnd] = useState(today);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchFilter, setBranchFilter] = useState("All Branches");
  const [analytics, setAnalytics] = useState<PosAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All Categories");

  useEffect(() => {
    if (role !== "owner") return;
    void masterDataService.branches().then(setBranches).catch(() => setBranches([]));
  }, [role]);
  useEffect(() => { if (role === "owner") setBranchFilter(scopeBranchName); }, [role, scopeBranchName]);

  useEffect(() => {
    const branchId = role === "owner" ? branches.find((branch) => branch.name === branchFilter)?.id : undefined;
    setLoading(true);
    void inventoryWorkflowService.posAnalytics({ ...dateRange(range, customStart, customEnd), branchId })
      .then(setAnalytics)
      .catch(() => setAnalytics(null))
      .finally(() => setLoading(false));
  }, [branchFilter, branches, customEnd, customStart, range, role]);

  const summary = analytics?.summary;
  const branchLabel = role === "manager" ? (user?.branch?.name ?? "Assigned Branch") : branchFilter;
  const categories = [...new Set((analytics?.products ?? []).map((product) => product.category))];
  const products = (analytics?.products ?? []).filter((product) =>
    (category === "All Categories" || product.category === category)
    && product.name.toLowerCase().includes(search.trim().toLowerCase()));
  const ingredientTotal = (analytics?.ingredients ?? []).reduce((total, item) => total + item.cost, 0);

  return (
    <div className="p-4 md:p-6 space-y-5">
      <SectionHeader title="COGS Analysis"
        sub={`Cost of Goods Sold · ${branchLabel} · ${dashboardPeriodLabel(range, customStart, customEnd)}`}
        actions={
          <>
            {role === "owner" && <Select options={["All Branches", ...branches.map((branch) => branch.name)]} value={branchFilter} onChange={setBranchFilter} />}
            <DashboardFilters range={range} comparison={comparison} customStart={customStart} customEnd={customEnd}
              onRangeChange={setRange} onComparisonChange={setComparison}
              onApplyCustom={(start, end) => { setCustomStart(start); setCustomEnd(end); }}
              onReset={() => { setRange("mtd"); setCustomStart(monthStart); setCustomEnd(today); }} />
          </>
        } />

      <div className="cogs-kpi-grid grid gap-4">
        <KPICard label="Total Sales" value={loading ? "—" : formatPeso(summary?.sales ?? 0)} sub={`${summary?.unitsSold ?? 0} units sold`} icon={DollarSign} color={C.blue} />
        <KPICard label="Total COGS" value={loading ? "—" : formatPeso(summary?.totalCogs ?? 0)} sub="Sum of recipe-based product COGS" icon={BarChart2} color={C.amber} />
        <KPICard label="Gross Profit" value={loading ? "—" : formatPeso(summary?.grossProfit ?? 0)} sub="Total Sales less Total COGS" icon={TrendingUp} color={C.green} />
        <KPICard label="Gross Margin" value={loading ? "—" : `${(summary?.grossMargin ?? 0).toFixed(1)}%`} sub="Gross Profit ÷ Sales × 100" icon={Percent} color={C.maroon} />
        <KPICard label="Detected Shortage" value={loading ? "—" : formatPeso(summary?.detectedShortageValue ?? 0)} sub="Positive variance awaiting or under review" icon={TrendingDown} color={C.red} />
        <KPICard label="Verified Shrinkage" value={loading ? "—" : formatPeso(summary?.verifiedShrinkageCost ?? 0)} sub="Verified positive shrinkage causes only" icon={GitCompare} color={C.red} />
      </div>

      <div className="cogs-analysis-grid grid grid-cols-3 gap-5">
        <Card className="col-span-2" padding={false}>
          <div className="px-5 pt-5 pb-0">
            <h3 className="font-semibold mb-1" style={{ color: C.primary }}>Sales and Recipe COGS Trend</h3>
            <p className="text-xs mb-4" style={{ color: C.secondary }}>Daily totals from imported POS sales and saved recipe costs</p>
          </div>
          <div className="h-56 px-3 pb-4">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={(analytics?.trends ?? []).map((item) => ({ ...item, label: new Date(`${item.date}T00:00:00`).toLocaleDateString("en-PH", { month: "short", day: "numeric" }), margin: item.sales ? (item.grossProfit / item.sales) * 100 : 0 }))}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: C.secondary }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="l" tick={{ fontSize: 11, fill: C.secondary }} axisLine={false} tickLine={false}
                  tickFormatter={v => `₱${(v / 1000).toFixed(0)}k`} />
                <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 11, fill: C.secondary }} axisLine={false} tickLine={false}
                  tickFormatter={v => `${v}%`} domain={[0, 100]} />
                <Tooltip content={<ChartTip />} />
                <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                <Bar yAxisId="l" dataKey="sales" name="Sales" fill={`color-mix(in srgb, ${C.blue} 25%, transparent)`} stroke={C.blue} strokeWidth={1} radius={[3, 3, 0, 0]} />
                <Bar yAxisId="l" dataKey="cogs" name="Recipe COGS" fill={`color-mix(in srgb, ${C.maroon} 38%, transparent)`} stroke={C.maroon} strokeWidth={1} radius={[3, 3, 0, 0]} />
                <Line yAxisId="r" type="monotone" dataKey="margin" name="Gross Margin %" stroke={C.green} strokeWidth={2} dot={{ fill: C.green, r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card>
          <h3 className="font-semibold mb-4" style={{ color: C.primary }}>Ingredient Cost Distribution</h3>
          {(analytics?.ingredients ?? []).slice(0, 6).map((item, index) => {
            const pct = ingredientTotal > 0 ? (item.cost / ingredientTotal) * 100 : 0;
            const colors = [C.maroon, C.blue, C.amber, C.green, C.red, C.muted];
            return (
            <div key={item.id} className="mb-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium" style={{ color: C.primary }}>{item.name}</span>
                <span className="text-xs font-bold" style={{ color: C.primary }}>{pct.toFixed(1)}%</span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: C.grayBg }}>
                <div className="h-full rounded-full" style={{ width: `${pct}%`, background: colors[index] }} />
              </div>
            </div>
          );})}
          {!loading && (analytics?.ingredients.length ?? 0) === 0 && <p className="text-sm" style={{ color: C.muted }}>No ingredient cost data is available for this period.</p>}
        </Card>
      </div>

      <TableCard
        title="Product Profitability"
        subtitle="Product-level sales and recipe cost performance"
        toolbar={
          <>
            <SearchInput placeholder="Search product…" value={search} onChange={setSearch} />
            <Select options={["All Categories", ...categories]} value={category} onChange={setCategory} />
          </>
        }
      >
        <TableWrapper minWidth={800}>
          <THead cols={["Product", "Sales", "Recipe COGS", "Recipe Gross Profit", "Recipe Margin"]} />
          <tbody>
            {loading ? (
              <TableLoadingRow colSpan={5} label="Calculating product profitability…" />
            ) : products.length === 0 ? (
              <TableEmptyRow colSpan={5} title="No POS sales data" subtitle="No POS sales data is available for this period." />
            ) : products.map((p) => {
              const gp = p.sales - p.cogs;
              const margin = ((gp / p.sales) * 100).toFixed(1);
              return (
                <TR key={p.id}>
                  <TD><span className="font-semibold text-[var(--app-text)]">{p.name}</span></TD>
                  <TD right>₱{p.sales.toLocaleString()}</TD>
                  <TD right muted>{formatPeso(p.cogs)}</TD>
                  <TD right>₱{gp.toLocaleString()}</TD>
                  <TD right><span className="font-bold" style={{ color: marginValueColor(parseFloat(margin)) }}>{margin}%</span></TD>
                </TR>
              );
            })}
          </tbody>
        </TableWrapper>
      </TableCard>
    </div>
  );
}

const cogsModuleTabs = [
  { id: "overview", label: "COGS Overview" },
  { id: "sales", label: "POS Sales Data" },
] as const;

export function COGSAndPosSalesModule({ role, initialTab = "overview", scopeBranchName = "All Branches" }: {
  role: Role;
  initialTab?: "overview" | "sales";
  scopeBranchName?: string;
}) {
  const [activeTab, setActiveTab] = useState<"overview" | "sales">(initialTab);

  useEffect(() => setActiveTab(initialTab), [initialTab]);

  return (
    <div>
      <ModuleTabSwitcher tabs={cogsModuleTabs} active={activeTab} onChange={setActiveTab} />
      <AnimatedTabPanel panelKey={activeTab}>
        {activeTab === "overview" ? <COGSAnalysis role={role} scopeBranchName={scopeBranchName} /> : <SalesAnalysis role={role} scopeBranchName={scopeBranchName} />}
      </AnimatedTabPanel>
    </div>
  );
}
