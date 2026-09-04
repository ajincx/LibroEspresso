import React, { lazy, Suspense, useEffect, useState } from "react";
import { ShoppingCart, Package, TrendingDown, Search, X, Upload, Check, Coffee, CheckCircle, TrendingUp, DollarSign, GitCompare, BarChart2, Hash, Percent, Calendar } from "lucide-react";
import { Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart } from "recharts";
import { C, DashboardRange, DashboardComparison, dashboardPeriodLabel, dashboardRangeFactor, formatPeso, StatusChip, KPICard, Card, SectionHeader, Btn, SearchInput, Select, DashboardFilters, THead, TR, TD, Pagination, ChartTip, ModuleTabSwitcher, AnimatedTabPanel } from "../../components/ModuleUi";
import { salesTrend, kpiSparklines, cogsTrend, topProducts } from "../demoData";
import { toast } from "sonner";
import type { Page, Role } from "../../types/navigation";
import { inventoryWorkflowService } from "../../services/inventoryWorkflow.service";
import { masterDataService } from "../../services/masterData.service";
import type { MenuItem } from "../../types/masterData";
import type { PosImportRecord } from "../../types/inventoryWorkflow";

// ─── Sales Analysis ────────────────────────────────────────────────────────────
function SalesAnalysis({ role }: { role: Role }) {
  const localToday = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
  const [uploadStep, setUploadStep] = useState<"idle" | "select" | "preview" | "done">("idle");
  const [posMenu, setPosMenu] = useState<MenuItem[]>([]);
  const [posLines, setPosLines] = useState<{ menuItemId: string; product: string; quantitySold: number }[]>([]);
  const [posFilename, setPosFilename] = useState("");
  const [posBusinessDate, setPosBusinessDate] = useState(localToday);
  const [posImportError, setPosImportError] = useState("");
  const [posImporting, setPosImporting] = useState(false);
  const [posConsumption, setPosConsumption] = useState<{ name: string; unit: string; expectedConsumption: number }[]>([]);
  const [posImports, setPosImports] = useState<PosImportRecord[]>([]);
  const [posHistoryLoading, setPosHistoryLoading] = useState(true);
  const [posImportSearch, setPosImportSearch] = useState("");
  const [posBranchFilter, setPosBranchFilter] = useState("All Branches");
  const [tab, setTab] = useState("overview");
  const [range, setRange] = useState<DashboardRange>("mtd");
  const [comparison, setComparison] = useState<DashboardComparison>("previous");
  const [customStart, setCustomStart] = useState("2026-08-01");
  const [customEnd, setCustomEnd] = useState("2026-08-26");
  const customDays = Math.max(1, Math.round((new Date(customEnd).getTime() - new Date(customStart).getTime()) / 86400000) + 1);
  const rangeFactor = range === "custom" ? Math.min(customDays / 26, 2) : dashboardRangeFactor(range);
  const periodLabel = dashboardPeriodLabel(range, customStart, customEnd);
  const comparisonLabel = comparison === "previous" ? "previous period" : "last month";
  const visibleSalesTrend = range === "today" ? salesTrend.slice(-1) : range === "custom" ? salesTrend.slice(-Math.min(customDays, 7)) : salesTrend;

  useEffect(() => {
    if (role !== "manager") return;
    void masterDataService.menuItems().then((items) => setPosMenu(items.filter((item) => item.status === "ACTIVE"))).catch(() => setPosMenu([]));
  }, [role]);

  useEffect(() => {
    setPosHistoryLoading(true);
    void inventoryWorkflowService.posImports()
      .then(setPosImports)
      .catch(() => setPosImports([]))
      .finally(() => setPosHistoryLoading(false));
  }, [role]);

  const visiblePosImports = posImports.filter((item) => {
    const matchesBranch = posBranchFilter === "All Branches" || item.branchName === posBranchFilter;
    const query = posImportSearch.trim().toLowerCase();
    const matchesSearch = !query || [item.sourceFilename, item.branchName, item.importedBy, item.businessDate]
      .some((value) => value.toLowerCase().includes(query));
    return matchesBranch && matchesSearch;
  });

  const selectPosFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setPosImportError("");
    try {
      const rows = (await file.text()).split(/\r?\n/).map((row) => row.trim()).filter(Boolean).map((row) => row.split(",").map((cell) => cell.trim().replace(/^\"|\"$/g, "")));
      if (rows.length < 2) throw new Error("The CSV file has no sales rows.");
      const headers = rows[0]!.map((header) => header.toLowerCase().replace(/[\s-]+/g, "_"));
      const productColumn = headers.findIndex((header) => ["product_code", "menu_code", "code", "product", "product_name", "menu_item"].includes(header));
      const quantityColumn = headers.findIndex((header) => ["quantity", "qty", "quantity_sold", "sold"].includes(header));
      if (productColumn < 0 || quantityColumn < 0) throw new Error("CSV headers must include product_code (or product_name) and quantity_sold.");
      const grouped = new Map<string, { menuItemId: string; product: string; quantitySold: number }>();
      for (const row of rows.slice(1)) {
        const productValue = row[productColumn]?.toLowerCase();
        const quantity = Number(row[quantityColumn]);
        const menuItem = posMenu.find((item) => item.code.toLowerCase() === productValue || item.name.toLowerCase() === productValue);
        if (!menuItem) throw new Error(`Unknown or inactive menu product: ${row[productColumn] || "blank value"}`);
        if (!Number.isFinite(quantity) || quantity <= 0) throw new Error(`Invalid quantity for ${menuItem.name}.`);
        const current = grouped.get(menuItem.id);
        grouped.set(menuItem.id, { menuItemId: menuItem.id, product: menuItem.name, quantitySold: (current?.quantitySold ?? 0) + quantity });
      }
      setPosLines([...grouped.values()]);
      setPosFilename(file.name);
      setUploadStep("preview");
    } catch (reason) {
      setPosLines([]);
      setPosImportError(reason instanceof Error ? reason.message : "Unable to read the POS CSV file.");
    } finally {
      event.target.value = "";
    }
  };

  const confirmPosImport = async () => {
    if (!posLines.length) return;
    setPosImporting(true); setPosImportError("");
    try {
      const result = await inventoryWorkflowService.importPosSales({
        businessDate: posBusinessDate,
        sourceFilename: posFilename,
        items: posLines.map(({ menuItemId, quantitySold }) => ({ menuItemId, quantitySold })),
      });
      setPosConsumption(result.consumption);
      void inventoryWorkflowService.posImports().then(setPosImports);
      setUploadStep("done");
    } catch (reason) {
      setPosImportError(reason instanceof Error ? reason.message : "Unable to import POS sales.");
    } finally { setPosImporting(false); }
  };

  return (
    <div className="p-6 space-y-5">
      <SectionHeader title="Sales Analysis"
        sub={`${role === "owner" ? "All branches" : "Lipa Branch"} · ${periodLabel}`}
        actions={
          <>
            {role === "manager" && <Btn variant="primary" icon={Upload} onClick={() => setUploadStep("select")}>Import POS CSV</Btn>}
            {role === "owner" && <Select options={["All Branches", "Gulod", "Lipa", "Vermosa", "Tagaytay", "Evo"]} small />}
            <DashboardFilters range={range} comparison={comparison} customStart={customStart} customEnd={customEnd}
              onRangeChange={setRange} onComparisonChange={setComparison}
              onApplyCustom={(start, end) => { setCustomStart(start); setCustomEnd(end); }}
              onReset={() => { setRange("mtd"); setCustomStart("2026-08-01"); setCustomEnd("2026-08-26"); }} />
          </>
        } />

      <div className="grid grid-cols-4 gap-4">
        <KPICard label="Total Sales" value={formatPeso(1120500 * rangeFactor)} change={comparison === "previous" ? "+8.3%" : "+6.9%"} changeDir="up" sub={periodLabel} icon={ShoppingCart} color={C.maroon} comparisonLabel={comparisonLabel} />
        <KPICard label="Total COGS" value={formatPeso(482100 * rangeFactor)} change={comparison === "previous" ? "+5.1%" : "+4.4%"} changeDir="up" sub="43.0% of sales" icon={Package} color={C.amber} comparisonLabel={comparisonLabel} />
        <KPICard label="Gross Profit" value={formatPeso(638400 * rangeFactor)} change={comparison === "previous" ? "+10.7%" : "+8.8%"} changeDir="up" sub="57.0% margin" icon={TrendingUp} color={C.green} comparisonLabel={comparisonLabel} />
        <KPICard label="Transactions" value={Math.round(12420 * rangeFactor).toLocaleString()} change={comparison === "previous" ? "+6.4%" : "+5.2%"} changeDir="up" sub="Completed POS sales" icon={Hash} color={C.blue} comparisonLabel={comparisonLabel} />
      </div>

      <div className="flex gap-1 border-b" style={{ borderColor: C.border }}>
        {["overview", "products", role === "owner" ? "branches" : "import_history"].map(t => (
          <button key={t} onClick={() => setTab(t)}
            className="px-4 py-2.5 text-sm font-medium border-b-2 transition-colors capitalize"
            style={{ borderColor: tab === t ? C.maroon : "transparent", color: tab === t ? C.maroon : C.secondary }}>
            {t === "import_history" ? "Import History" : t}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="grid grid-cols-3 gap-5">
          <Card className="col-span-2" padding={false}>
            <div className="px-5 pt-5 pb-0">
              <h3 className="font-semibold mb-4" style={{ color: C.primary }}>Sales vs COGS Trend</h3>
            </div>
            <div className="h-64 px-3 pb-4">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={visibleSalesTrend}>
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
              {topProducts.map((p, i) => (
                <div key={p.product}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm" style={{ color: C.primary }}>{p.product}</span>
                    <span className="text-sm font-semibold" style={{ color: C.primary }}>₱{(p.sales / 1000).toFixed(0)}k</span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: C.grayBg }}>
                    <div className="h-full rounded-full" style={{
                      width: `${p.pct}%`,
                      background: i === 0 ? C.maroon : i === 1 ? C.mediumMaroon : C.blue
                    }} />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {(tab === "import_history" || tab === "branches") && (
        <Card padding={false}>
          <div className="px-5 pt-5 pb-3">
            <div className="flex items-center gap-2 mb-4">
              <SearchInput placeholder="Search imports…" value={posImportSearch} onChange={setPosImportSearch} />
              {role === "owner" && <Select options={["All Branches", "Gulod", "Lipa", "Vermosa", "Tagaytay", "Evo"]} value={posBranchFilter} onChange={setPosBranchFilter} />}
            </div>
          </div>
          <div className="overflow-x-auto">
              <table className="data-table w-full">
              <THead cols={role === "owner"
                ? ["Branch", "Business Date", "Filename", "Uploaded By", "Time", "Units Sold", "Total Sales", "Status"]
                : ["Business Date", "Filename", "Upload Time", "Units Sold", "Total Sales", "Status"]} />
              <tbody>
                {posHistoryLoading ? <tr><td colSpan={role === "owner" ? 8 : 6} className="px-5 py-10 text-center text-sm" style={{ color: C.muted }}>Loading import history...</td></tr> : visiblePosImports.length === 0 ? <tr><td colSpan={role === "owner" ? 8 : 6} className="px-5 py-10 text-center text-sm" style={{ color: C.muted }}>No POS imports found.</td></tr> : visiblePosImports.slice(0, 10).map((row) => (
                  <TR key={row.id}>
                    {role === "owner" && <TD><span className="font-semibold" style={{ color: C.maroon }}>{row.branchName}</span></TD>}
                    <TD muted>{new Date(`${row.businessDate}T00:00:00`).toLocaleDateString("en-PH")}</TD>
                    <TD><span className="font-mono text-xs" style={{ color: C.primary }}>{row.sourceFilename}</span></TD>
                    {role === "owner" && <TD muted>{row.importedBy}</TD>}
                    <TD muted>{new Date(row.importedAt).toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" })}</TD>
                    <TD right>{row.unitsSold.toLocaleString()}</TD>
                    <TD right>{formatPeso(row.totalSales)}</TD>
                    <TD><StatusChip status="imported" /></TD>
                  </TR>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination total={visiblePosImports.length} page={1} perPage={10} />
        </Card>
      )}

      {/* CSV Upload Modal */}
      {role === "manager" && uploadStep !== "idle" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.45)" }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6" style={{ border: `1px solid ${C.border}` }}>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="font-bold text-lg" style={{ color: C.primary }}>Upload POS CSV</h3>
                <p className="text-xs mt-0.5" style={{ color: C.secondary }}>Lipa Branch — Import daily sales data</p>
              </div>
              <button onClick={() => setUploadStep("idle")} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ color: C.secondary, background: C.grayBg }}>
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
                <label className="block mb-4">
                  <span className="block text-xs font-semibold mb-1.5" style={{ color: C.secondary }}>Business date</span>
                  <input
                    type="date"
                    value={posBusinessDate}
                    max={localToday}
                    onChange={(event) => { setPosBusinessDate(event.target.value); setPosImportError(""); }}
                    className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none"
                    style={{ borderColor: C.border, background: C.surface, color: C.primary }}
                    required
                  />
                  <span className="block text-xs mt-1" style={{ color: C.muted }}>Choose the actual trading date in the POS file. This date controls recipe-based inventory deduction.</span>
                </label>
                <label className="block border-2 border-dashed rounded-xl p-8 text-center mb-4 cursor-pointer transition-all"
                  style={{ borderColor: C.border }}>
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-3" style={{ background: C.grayBg }}>
                    <Upload size={20} style={{ color: C.muted }} />
                  </div>
                  <p className="text-sm font-semibold" style={{ color: C.primary }}>Drop your POS CSV file here</p>
                  <p className="text-xs mt-1" style={{ color: C.secondary }}>Click to browse · Headers: product_code, quantity_sold</p>
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
                  <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-sm">
                    {[
                      ["File", posFilename],
                      ["Business Date", new Date(`${posBusinessDate}T00:00:00`).toLocaleDateString("en-PH")],
                      ["Products", `${posLines.length} valid product lines`],
                      ["Units Sold", posLines.reduce((sum, line) => sum + line.quantitySold, 0).toLocaleString()],
                    ].map(([label, value]) => (
                      <div key={label}>
                        <span style={{ color: C.secondary }}>{label}: </span>
                        <span className="font-semibold" style={{ color: label.includes("Error") || label.includes("Duplicate") ? C.green : C.primary }}>{value}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 pt-3 border-t space-y-2" style={{ borderColor: C.border }}>
                    {posLines.map((line) => <div key={line.menuItemId} className="flex justify-between text-sm"><span style={{ color: C.secondary }}>{line.product}</span><strong style={{ color: C.primary }}>{line.quantitySold} sold</strong></div>)}
                  </div>
                </div>
                {posImportError && <div className="mb-4 p-3 rounded-xl text-sm" style={{ color: C.red, background: C.redBg }}>{posImportError}</div>}
                <div className="flex items-center gap-2 mb-4 p-3 rounded-xl" style={{ background: C.greenBg }}>
                  <CheckCircle size={14} style={{ color: C.green }} />
                  <span className="text-sm font-medium" style={{ color: C.green }}>File validated successfully. Ready to import.</span>
                </div>
                <div className="flex gap-3">
                  <Btn variant="outline" onClick={() => setUploadStep("select")}>Back</Btn>
                  <button disabled={posImporting || !posLines.length} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-50" style={{ background: C.maroon }}
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
                  <h4 className="font-bold text-lg mb-1" style={{ color: C.primary }}>Import Successful</h4>
                  <p className="text-sm" style={{ color: C.secondary }}>{posLines.reduce((sum, line) => sum + line.quantitySold, 0)} units sold were connected to their configured recipes.</p>
                  <p className="text-xs mt-1" style={{ color: C.muted }}>{posFilename} - {new Date(`${posBusinessDate}T00:00:00`).toLocaleDateString("en-PH")}</p>
                  <div className="mt-4 p-3 rounded-xl text-left space-y-1.5" style={{ background: C.mainBg }}>
                    <p className="text-xs font-bold uppercase tracking-wide" style={{ color: C.secondary }}>Expected ingredient consumption</p>
                    {posConsumption.map((item) => <div key={`${item.name}-${item.unit}`} className="flex justify-between text-xs"><span>{item.name}</span><strong>{item.expectedConsumption.toFixed(2)} {item.unit}</strong></div>)}
                  </div>
                </div>
                <button className="w-full py-2.5 rounded-xl text-sm font-bold text-white" style={{ background: C.maroon }}
                  onClick={() => { setUploadStep("idle"); setPosLines([]); setPosConsumption([]); setPosFilename(""); setPosBusinessDate(localToday); toast.success("POS CSV imported successfully"); }}>
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
function COGSAnalysis({ role }: { role: Role }) {
  return (
    <div className="p-6 space-y-5">
      <SectionHeader title="COGS Analysis"
        sub={role === "owner" ? "Cost of Goods Sold · All branches · August 2026" : "Lipa Branch · August 2026"}
        actions={
          <>
            <Btn variant="outline" icon={Calendar} size="sm">Aug 1–26, 2026</Btn>
            {role === "owner" && <Select options={["All Branches", "Gulod", "Lipa", "Vermosa", "Tagaytay", "Evo"]} />}
          </>
        } />

      <div className="grid grid-cols-3 gap-4">
        <KPICard label="Total Sales" value="₱1,120,500" change="+8.3%" changeDir="up" icon={DollarSign} color={C.blue} sparkData={kpiSparklines.sales} />
        <KPICard label="Theoretical COGS" value="₱468,800" sub="41.8% of sales" icon={BarChart2} color={C.amber} />
        <KPICard label="Actual COGS" value="₱482,100" sub="43.0% of sales" icon={TrendingDown} color={C.red} />
        <KPICard label="Gross Profit" value="₱638,400" change="+10.7%" changeDir="up" icon={TrendingUp} color={C.green} sparkData={kpiSparklines.profit} />
        <KPICard label="Gross Margin" value="57.0%" change="-0.4pp" changeDir="down" icon={Percent} color={C.maroon} />
        <KPICard label="COGS Variance" value="₱13,300" sub="Actual exceeds theoretical" icon={GitCompare} color={C.red} />
      </div>

      <div className="grid grid-cols-3 gap-5">
        <Card className="col-span-2" padding={false}>
          <div className="px-5 pt-5 pb-0">
            <h3 className="font-semibold mb-1" style={{ color: C.primary }}>COGS Trend — Theoretical vs. Actual</h3>
            <p className="text-xs mb-4" style={{ color: C.secondary }}>6-month view with gross margin overlay</p>
          </div>
          <div className="h-56 px-3 pb-4">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={cogsTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: C.secondary }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="l" tick={{ fontSize: 11, fill: C.secondary }} axisLine={false} tickLine={false}
                  tickFormatter={v => `₱${(v / 1000).toFixed(0)}k`} />
                <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 11, fill: C.secondary }} axisLine={false} tickLine={false}
                  tickFormatter={v => `${v}%`} domain={[55, 60]} />
                <Tooltip content={<ChartTip />} />
                <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                <Bar yAxisId="l" dataKey="theo" name="Theoretical COGS" fill={`color-mix(in srgb, ${C.blue} 25%, transparent)`} stroke={C.blue} strokeWidth={1} radius={[3, 3, 0, 0]} />
                <Bar yAxisId="l" dataKey="actual" name="Actual COGS" fill={`color-mix(in srgb, ${C.maroon} 38%, transparent)`} stroke={C.maroon} strokeWidth={1} radius={[3, 3, 0, 0]} />
                <Line yAxisId="r" type="monotone" dataKey="margin" name="Gross Margin %" stroke={C.green} strokeWidth={2} dot={{ fill: C.green, r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card>
          <h3 className="font-semibold mb-4" style={{ color: C.primary }}>Ingredient Cost Distribution</h3>
          {[
            { name: "Coffee Beans", pct: 38.2, color: C.maroon },
            { name: "Dairy (Milk)", pct: 24.7, color: C.blue },
            { name: "Alternative Milks", pct: 16.4, color: C.amber },
            { name: "Bakery/Food", pct: 12.8, color: C.green },
            { name: "Other", pct: 7.9, color: C.muted },
          ].map(c => (
            <div key={c.name} className="mb-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium" style={{ color: C.primary }}>{c.name}</span>
                <span className="text-xs font-bold" style={{ color: C.primary }}>{c.pct}%</span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: C.grayBg }}>
                <div className="h-full rounded-full" style={{ width: `${c.pct * 2.3}%`, background: c.color }} />
              </div>
            </div>
          ))}
        </Card>
      </div>

      <Card padding={false}>
        <div className="px-5 pt-5 pb-3">
          <h3 className="font-semibold mb-3" style={{ color: C.primary }}>Product Profitability</h3>
          <div className="flex items-center gap-2">
            <SearchInput placeholder="Search product…" />
            <Select options={["All Categories", "Coffee Drinks", "Food", "Cold Drinks"]} />
          </div>
        </div>
        <div className="overflow-x-auto">
              <table className="data-table w-full">
            <THead cols={["Product", "Sales", "Theoretical Cost", "Actual Cost", "COGS Variance", "Gross Profit", "Margin"]} />
            <tbody>
              {[
                { name: "Espresso Blend", sales: 187400, theo: 62800, actual: 64900 },
                { name: "Whole Milk", sales: 162300, theo: 78900, actual: 82100 },
                { name: "Almond Milk Latte", sales: 98700, theo: 41200, actual: 43400 },
                { name: "Oat Milk Cappuccino", sales: 87200, theo: 35600, actual: 37100 },
                { name: "Croissants", sales: 74100, theo: 28400, actual: 29200 },
              ].map((p, i) => {
                const gp = p.sales - p.actual;
                const margin = ((gp / p.sales) * 100).toFixed(1);
                const variance = p.actual - p.theo;
                return (
                  <TR key={i}>
                    <TD><span className="font-medium">{p.name}</span></TD>
                    <TD right>₱{p.sales.toLocaleString()}</TD>
                    <TD right muted>₱{p.theo.toLocaleString()}</TD>
                    <TD right muted>₱{p.actual.toLocaleString()}</TD>
                    <TD right><span style={{ color: variance > 0 ? C.red : C.green }}>₱{variance.toLocaleString()}</span></TD>
                    <TD right>₱{gp.toLocaleString()}</TD>
                    <TD right><span className="font-bold" style={{ color: parseFloat(margin) > 60 ? C.green : parseFloat(margin) > 50 ? C.amber : C.red }}>{margin}%</span></TD>
                  </TR>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

const cogsModuleTabs = [
  { id: "overview", label: "COGS Overview" },
  { id: "sales", label: "POS Sales Data" },
] as const;

export function COGSAndPosSalesModule({ role, initialTab = "overview" }: {
  role: Role;
  initialTab?: "overview" | "sales";
}) {
  const [activeTab, setActiveTab] = useState<"overview" | "sales">(initialTab);

  useEffect(() => setActiveTab(initialTab), [initialTab]);

  return (
    <div>
      <ModuleTabSwitcher tabs={cogsModuleTabs} active={activeTab} onChange={setActiveTab} />
      <AnimatedTabPanel panelKey={activeTab}>
        {activeTab === "overview" ? <COGSAnalysis role={role} /> : <SalesAnalysis role={role} />}
      </AnimatedTabPanel>
    </div>
  );
}
