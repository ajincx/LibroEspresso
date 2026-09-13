import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ShoppingCart, Package, Percent, TrendingDown, RefreshCw, Check, AlertTriangle, Search, BadgeDollarSign, Sparkles, ArrowRight } from "lucide-react";
import { Card, Btn, KPICard, DashboardFilters, StatusChip, SearchInput, Select, C, type DashboardRange, type DashboardComparison } from "../../components/ModuleUi";
import { useAuth } from "../../contexts/AuthContext";
import { inventoryWorkflowService as workflow } from "../../services/inventoryWorkflow.service";
import { operationsService } from "../../services/operations.service";
import { predictiveService } from "../../services/predictive.service";
import type { PosAnalytics, ShrinkageReport } from "../../types/inventoryWorkflow";
import type { InventoryOverviewItem } from "../../types/operations";
import type { PredictiveForecast } from "../../types/predictive";
import type { Page, Role } from "../../types/navigation";
import { businessDate, addDateDays, periodDates } from "../../utils/businessDate";
import { formatAppCurrency as money, formatAppDate, readAppPreferences } from "../../utils/appPreferences";
import { officialFinancialMetrics } from "../../utils/financialMetrics";

const ALERT_PRIORITY: Record<InventoryOverviewItem["status"], number> = { OUT_OF_STOCK: 4, CRITICAL: 3, LOW_STOCK: 2, HEALTHY: 1 };
export const DASHBOARD_INVENTORY_TARGET:Page="inventory";
export const dashboardGreeting = (hour:number,firstName?:string) => `${hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening"}, ${firstName ?? ""} 👋`.replace(",  ", ", ");
export const prioritizeInventoryAlerts = (items:InventoryOverviewItem[]) => [...items].filter(item=>item.status!=="HEALTHY").sort((a,b)=>ALERT_PRIORITY[b.status]-ALERT_PRIORITY[a.status] || (b.reorderLevel-b.systemStock)-(a.reorderLevel-a.systemStock) || a.name.localeCompare(b.name));
export const stockStatusChip=(status:InventoryOverviewItem["status"])=>status==="OUT_OF_STOCK"?"out_neutral":status==="LOW_STOCK"?"low":status.toLowerCase();
export const inventoryValueColor=(value:number)=>value<0?C.red:"var(--app-text)";
export const forecastUrgencyAccent=(urgency:PredictiveForecast["insights"][number]["urgency"])=>({HIGH:C.red,MEDIUM:C.amber,LOW:C.green}[urgency]);

export function DashboardToolbar({ actions, filters }:{ actions?:ReactNode;filters:ReactNode }) {
  return <div data-dashboard-toolbar className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
    <div className="flex min-h-10 flex-wrap items-center gap-2">{actions}</div>
    <div className="min-w-0 lg:ml-auto">{filters}</div>
  </div>;
}

export function ForecastReplenishmentPanel({forecast,forecastError,role,onReview,onCreateOrder}:{forecast:PredictiveForecast|null;forecastError:string;role:Role;onReview:()=>void;onCreateOrder:(prediction:PredictiveForecast["predictions"][number])=>void}) {
  const selectedPrediction=forecast?.predictions.find(prediction=>prediction.recommendedReorder>0);
  return <Card padding={false} className="overflow-hidden shadow-[0_18px_46px_rgba(77,20,31,.10)]">
    <div className="border-b border-[var(--app-border)] bg-[var(--app-surface)] px-5 py-5 sm:px-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[.16em] text-[var(--app-primary)]"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--app-primary-faint)]"><Sparkles size={14}/></span>Decision-support forecast</div>
          <h2 className="text-lg font-bold tracking-tight text-[var(--app-text)] sm:text-xl">Next 30 Days · Forecast &amp; Replenishment</h2>
          <p className="mt-1 text-xs leading-relaxed text-[var(--app-text-muted)]">Projected demand, inventory risk, and replenishment guidance from recorded operational data.</p>
        </div>
        <Btn variant="outline" icon={ArrowRight} onClick={onReview}>Review Forecast</Btn>
      </div>
    </div>
    {forecastError ? <div className="m-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert">{forecastError}</div> : !forecast ? <div className="flex min-h-56 items-center justify-center p-6" aria-live="polite"><div className="text-center"><span className="mx-auto block h-9 w-9 animate-spin rounded-full border-4 border-[var(--app-primary-faint)] border-t-[var(--app-primary)]"/><p className="mt-3 text-sm font-semibold">Loading forecast…</p></div></div> : <>
      <div className="grid gap-4 border-b border-[var(--app-border)] bg-[var(--app-bg)] p-5 sm:p-6 md:grid-cols-[minmax(0,1.45fr)_minmax(220px,.55fr)]">
        <div className="rounded-2xl border border-[var(--app-primary-soft)] bg-[var(--app-surface)] p-5 shadow-sm">
          <p className="text-[11px] font-bold uppercase tracking-[.14em] text-[var(--app-text-muted)]">Projected sales</p>
          <div className="mt-2 flex flex-wrap items-end gap-3"><p className="text-3xl font-extrabold tracking-tight text-[var(--app-text)] sm:text-4xl">{money(forecast.summary.forecastSales)}</p><span className="mb-1 text-xs font-medium text-[var(--app-text-muted)]">over the next 30 days</span></div>
        </div>
        <div className="flex flex-col justify-center rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface)] p-5 shadow-sm">
          <p className="text-[11px] font-bold uppercase tracking-[.14em] text-[var(--app-text-muted)]">Forecast confidence</p>
          <div className="mt-3"><StatusChip status={forecast.methodology.confidence} kind="confidence"/></div>
          <p className="mt-3 text-xs leading-relaxed text-[var(--app-text-muted)]">Based on {forecast.methodology.observedSalesDays} recorded sales day{forecast.methodology.observedSalesDays===1?"":"s"}.</p>
        </div>
      </div>
      <div className="p-5 sm:p-6">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-2"><div><h3 className="text-sm font-bold text-[var(--app-text)]">Forecast insights</h3><p className="mt-1 text-xs text-[var(--app-text-muted)]">Review the signals that may require operational attention.</p></div><span className="rounded-full border border-[var(--app-border)] bg-[var(--app-surface-muted)] px-2.5 py-1 text-[10px] font-bold text-[var(--app-text-muted)]">{forecast.insights.length} insight{forecast.insights.length===1?"":"s"}</span></div>
        <div className="grid gap-3">
          {forecast.insights.map((insight,index)=>{
            const accent=forecastUrgencyAccent(insight.urgency);
            return <article key={`${insight.title}-${index}`} className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface)] p-4 shadow-sm transition-shadow hover:shadow-md sm:p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><span className="flex h-8 w-8 items-center justify-center rounded-xl" style={{color:accent,background:`color-mix(in srgb, ${accent} 11%, transparent)`}}><AlertTriangle size={15}/></span><h4 className="text-sm font-bold text-[var(--app-text)]">{insight.title}</h4><StatusChip status={insight.urgency} kind="urgency"/></div>
                  <p className="mt-3 text-sm leading-6 text-[var(--app-text)]">{insight.description}</p>
                  <div className="mt-3 rounded-xl bg-[var(--app-surface-muted)] px-3.5 py-3"><p className="text-[10px] font-bold uppercase tracking-wider text-[var(--app-primary)]">Recommended response</p><p className="mt-1 text-xs leading-5 text-[var(--app-text-muted)]">{insight.recommendation}</p></div>
                </div>
                <Btn size="sm" variant="outline" onClick={onReview}>Review</Btn>
              </div>
            </article>;
          })}
        </div>
        {selectedPrediction&&<div className="mt-5 rounded-2xl border border-[var(--app-primary-soft)] bg-[var(--app-primary-faint)] p-4 sm:p-5"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex min-w-0 items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--app-primary)] text-white"><Package size={18}/></span><div><p className="text-[10px] font-bold uppercase tracking-[.13em] text-[var(--app-primary)]">Reorder recommendation</p><p className="mt-1 text-sm font-semibold leading-6 text-[var(--app-text)]">{selectedPrediction.branchName}: suggested reorder of {selectedPrediction.recommendedReorder.toLocaleString()} {selectedPrediction.unit} {selectedPrediction.name}.</p><p className="mt-1 text-xs text-[var(--app-text-muted)]">Confirmed incoming orders are included in this estimate.</p></div></div>{role==="manager"&&<Btn onClick={()=>onCreateOrder(selectedPrediction)}>Create PO from Recommendation</Btn>}</div></div>}
      </div>
      <div className="flex items-start gap-2.5 border-t border-[var(--app-border)] bg-[var(--app-surface-muted)] px-5 py-3.5 text-xs leading-relaxed text-[var(--app-text-muted)] sm:px-6"><AlertTriangle size={15} className="mt-0.5 shrink-0 text-[var(--app-primary)]"/><p>{forecast.methodology.disclaimer}</p></div>
    </>}
  </Card>;
}

export function DashboardPage({ role, onNavigate, scopeBranchId, scopeBranchName = "All Branches" }: {
  role: Role; onNavigate: (page: Page) => void; scopeBranchId?: string; scopeBranchName?: string;
}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [now, setNow] = useState(new Date());
  const [range, setRange] = useState<DashboardRange>(role === "owner" ? "mtd" : "today");
  const [comparison, setComparison] = useState<DashboardComparison>("previous");
  const [customStart, setCustomStart] = useState(businessDate());
  const [customEnd, setCustomEnd] = useState(businessDate());
  const [refresh, setRefresh] = useState(0);
  const [data, setData] = useState<{ current: PosAnalytics; previous: PosAnalytics; inventory: InventoryOverviewItem[]; reports: ShrinkageReport[] } | null>(null);
  const [forecast, setForecast] = useState<PredictiveForecast | null>(null);
  const [error, setError] = useState("");
  const [forecastError, setForecastError] = useState("");
  const [marginOpen, setMarginOpen] = useState(false);
  const [alertSearch, setAlertSearch] = useState("");
  const [alertCategory, setAlertCategory] = useState("All Categories");
  const branchId = role === "owner" && scopeBranchId && scopeBranchId !== "ALL" ? scopeBranchId : undefined;
  const scope = role === "manager" ? user?.branch?.name ?? "Assigned Branch" : scopeBranchName;
  const today = businessDate(now);
  const { startDate, endDate } = periodDates(range, customStart, customEnd);
  useEffect(() => {
    const tick = window.setInterval(() => setNow(new Date()), 60000);
    const focus = () => { setNow(new Date()); setRefresh(v => v + 1); };
    window.addEventListener("focus", focus);
    window.addEventListener("libro-data-changed", focus);
    return () => { clearInterval(tick); window.removeEventListener("focus", focus); window.removeEventListener("libro-data-changed", focus); };
  }, []);
  useEffect(() => {
    let active = true;
    setData(null); setError("");
    const days = Math.round((Date.parse(endDate) - Date.parse(startDate)) / 86400000) + 1;
    const shiftMonth = (value: string) => {
      const date = new Date(value + "T12:00:00Z");
      const day = date.getUTCDate(); date.setUTCDate(1); date.setUTCMonth(date.getUTCMonth() - 1);
      const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth()+1,0)).getUTCDate();
      date.setUTCDate(Math.min(day,last)); return date.toISOString().slice(0,10);
    };
    const previous = comparison === "lastMonth" ? { startDate: shiftMonth(startDate), endDate: shiftMonth(endDate) }
      : { startDate: addDateDays(startDate, -days), endDate: addDateDays(startDate, -1) };
    Promise.all([
      workflow.posAnalytics({ branchId, startDate, endDate }),
      workflow.posAnalytics({ branchId, ...previous }),
      operationsService.inventoryOverview(branchId),
      workflow.reports({ branchId }),
    ]).then(([current, prior, inventory, reports]) => {
      if (active) setData({ current, previous: prior, inventory, reports: reports.filter(r => r.detectedAt.slice(0,10) >= startDate && r.detectedAt.slice(0,10) <= endDate) });
    }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [branchId, role, startDate, endDate, comparison, refresh]);
  useEffect(() => {
    let active = true; setForecast(null); setForecastError("");
    predictiveService.generate({ branchId, startDate: today, endDate: addDateDays(today,29) })
      .then(v => { if (active) setForecast(v); }).catch(e => { if (active) setForecastError(e.message); });
    return () => { active = false; };
  }, [branchId, role, today, refresh]);
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", timeZone: readAppPreferences().timezone }).format(now));
  const greeting = dashboardGreeting(hour,user?.firstName);
  const totals = data?.current.summary;
  const financials = totals ? officialFinancialMetrics(totals) : null;
  const ratio = (loss: number, sales: number) => sales > 0 ? 100*loss/sales : 0;
  const changed = (current: number, previous: number) => range === "custom" || previous === 0 ? undefined : ((current-previous)/Math.abs(previous)*100).toFixed(1) + "%";
  const alerts = useMemo(() => prioritizeInventoryAlerts(data?.inventory ?? []), [data?.inventory]);
  const alertCategories = useMemo(() => {
    const cats = new Set(alerts.map((i) => i.category).filter(Boolean));
    return ["All Categories", ...Array.from(cats)];
  }, [alerts]);
  const filteredAlerts = useMemo(() => {
    const query = alertSearch.trim().toLowerCase();
    return alerts.filter((i) => {
      const matchesCategory = alertCategory === "All Categories" || i.category === alertCategory;
      const matchesSearch =
        !query ||
        i.name.toLowerCase().includes(query) ||
        i.branchName.toLowerCase().includes(query) ||
        (i.category && i.category.toLowerCase().includes(query)) ||
        (i.sku && i.sku.toLowerCase().includes(query));
      return matchesCategory && matchesSearch;
    }).slice(0,5);
  }, [alerts, alertSearch, alertCategory]);
  const classifications = Object.entries((data?.reports ?? []).filter((r)=>
    (r.status === "VERIFIED" || r.status === "REVIEWED") && r.classification !== "COUNT_ERROR" && r.classification !== null,
  ).reduce<Record<string,number>>((acc,r) => {
    const key = (r.classification ?? "Unexplained").replaceAll("_"," ");
    acc[key] = (acc[key] ?? 0) + Math.max(0, r.varianceValue); return acc;
  }, {})).map(([name,value]) => ({name,value}));
  const inventoryHealth = [
    { key: "HEALTHY", name: "Healthy", color: C.green },
    { key: "LOW_STOCK", name: "Low Stock", color: C.amber },
    { key: "CRITICAL", name: "Critical", color: "#e26d2f" },
    { key: "OUT_OF_STOCK", name: "Out of Stock", color: C.red },
  ].map((item) => ({
    ...item,
    value: data?.inventory.filter((inventoryItem) => inventoryItem.status === item.key).length ?? 0,
  })).filter((item) => item.value > 0);
  const selectedPrediction = forecast?.predictions.find(p => p.recommendedReorder > 0);
  const createOrder = (prediction?: PredictiveForecast["predictions"][0]) => {
    const target = prediction ?? selectedPrediction;
    const params = new URLSearchParams({ create: "1" });
    if (target) {
      params.set("ingredientId", target.inventoryItemId);
      params.set("quantity", String(target.recommendedReorder));
    }
    navigate(`/purchase-orders?${params.toString()}`);
  };
  const salesUrl = "/sales?startDate=" + startDate + "&endDate=" + endDate;
  return <div className="p-4 md:p-6 space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h1 className="text-xl font-bold">{greeting}</h1><p className="text-sm text-[var(--app-text-muted)]">{scope} · {formatAppDate(startDate)} – {formatAppDate(endDate)}</p></div>
      <div className="flex gap-2"><Btn variant="outline" icon={RefreshCw} onClick={() => setRefresh(v => v+1)}>Refresh</Btn></div>
    </div>
    <DashboardToolbar
      actions={role === "manager" ? <><Btn onClick={() => onNavigate("physical-count")}>Record Stock Count</Btn><Btn variant="outline" onClick={() => createOrder()}>Create Purchase Request</Btn></> : undefined}
      filters={<DashboardFilters range={range} comparison={comparison} customStart={customStart} customEnd={customEnd} onRangeChange={setRange} onComparisonChange={setComparison} onApplyCustom={(a,b) => { setCustomStart(a); setCustomEnd(b); setRange("custom"); }} onReset={() => { setRange(role === "owner" ? "mtd" : "today"); setComparison("previous"); }}/>} />
    {error ? <Card><p role="alert" className="text-red-700">{error}</p><Btn onClick={() => setRefresh(v => v+1)}>Retry</Btn></Card> : !totals || !data ? <Card>Loading branch records…</Card> : <>
      <div className="dashboard-kpis grid grid-cols-2 xl:grid-cols-6 gap-4">
        <KPICard label={role === "owner" ? "Total Sales" : "Branch Sales"} value={money(financials!.sales)} sub={totals.unitsSold + " units sold"} icon={ShoppingCart} change={changed(financials!.sales,data.previous.summary.sales)} onClick={() => navigate(salesUrl)}/>
        <KPICard label={role === "owner" ? "Total COGS" : "Branch COGS"} value={money(financials!.totalCogs)} sub="Recipe-based cost of products sold" icon={Package} change={changed(financials!.totalCogs,data.previous.summary.totalCogs)} onClick={() => navigate("/cogs?startDate="+startDate+"&endDate="+endDate)}/>
        <KPICard label="Gross Profit" value={money(financials!.grossProfit)} sub="Sales minus official Total COGS" icon={BadgeDollarSign} change={changed(financials!.grossProfit,data.previous.summary.grossProfit)} onClick={() => setMarginOpen(true)}/>
        <KPICard label="Gross Margin" value={financials!.grossMargin.toFixed(1)+"%"} sub="Product margin based on COGS" icon={Percent} onClick={() => setMarginOpen(true)}/>
        <KPICard label="Detected Shortage" value={money(financials!.detectedShortageValue)} sub="Positive inventory variance before resolution" icon={AlertTriangle} onClick={() => onNavigate("variance")}/>
        <KPICard label="Verified Shrinkage" value={money(financials!.verifiedShrinkageCost)} sub="Reviewed legitimate shrinkage causes only" icon={TrendingDown} onClick={() => onNavigate("shrinkage")}/>
      </div>
      {totals.importCount === 0 && <p className="text-sm text-[var(--app-text-muted)]">No POS sales were imported for this branch and period. No demonstration values are shown.</p>}
      <div className="grid xl:grid-cols-2 gap-5">
        <Card className="xl:col-span-2"><h2 className="font-semibold mb-3">Sales & Recipe COGS</h2>{data.current.trends.length ? <div className="h-64"><ResponsiveContainer width="100%" height="100%"><AreaChart data={data.current.trends}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="date" tick={{fontSize:10}}/><YAxis tick={{fontSize:10}}/><Tooltip formatter={v=>money(Number(v))} contentStyle={{borderRadius:12, borderColor:"var(--app-border)"}}/><Area type="monotone" dataKey="sales" name="Sales" stroke={C.maroon} strokeWidth={2.5} fill={C.softMaroonBg}/><Area type="monotone" dataKey="cogs" name="Recipe COGS" stroke={C.amber} strokeWidth={2.5} fill={C.amberBg}/></AreaChart></ResponsiveContainer></div> : <p className="py-12 text-sm">No sales records for this period.</p>}</Card>
        <Card><h2 className="font-semibold">Inventory Health Distribution</h2><p className="text-xs mb-2 text-[var(--app-text-muted)]">Live item counts from the selected branch scope.</p>{inventoryHealth.length ? <div className="h-64"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={inventoryHealth} dataKey="value" nameKey="name" innerRadius={52} outerRadius={82} paddingAngle={3} cornerRadius={7} stroke="var(--app-surface)" strokeWidth={3}>{inventoryHealth.map((item) => <Cell key={item.key} fill={item.color}/>)}</Pie><Tooltip formatter={(value,name)=>[`${Number(value)} item${Number(value) === 1 ? "" : "s"}`,name]} contentStyle={{borderRadius:12, borderColor:"var(--app-border)"}}/><Legend iconType="circle" iconSize={8}/></PieChart></ResponsiveContainer></div> : <p className="py-12 text-sm">No inventory records are available for this branch scope.</p>}</Card>
        <Card><h2 className="font-semibold mb-1">Verified Shrinkage Causes</h2><p className="text-xs mb-3 text-[var(--app-text-muted)]">Reviewed legitimate shrinkage cost by final classification.</p>{classifications.length ? <div className="h-64"><ResponsiveContainer width="100%" height="100%"><BarChart data={classifications}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="name" tick={{fontSize:10}}/><YAxis tick={{fontSize:10}}/><Tooltip formatter={v=>money(Number(v))} contentStyle={{borderRadius:12, borderColor:"var(--app-border)"}}/><Bar dataKey="value" name="Verified shrinkage cost" fill={C.maroon} radius={[8,8,2,2]} maxBarSize={64}/></BarChart></ResponsiveContainer></div> : <p className="py-12 text-sm">No verified shrinkage causes for this period.</p>}</Card>
      </div>
      <Card padding={false} className="overflow-hidden shadow-sm">
        <div className="px-5 pt-5 pb-4">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="font-bold text-base text-[var(--app-text)] tracking-tight">
                  Inventory Alerts
                </h2>
                {alerts.length > 0 ? (
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-0.5 rounded-full text-rose-700 bg-rose-50 border border-rose-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                    {alerts.length} item{alerts.length === 1 ? "" : "s"} below threshold
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-0.5 rounded-full text-emerald-700 bg-emerald-50 border border-emerald-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    All healthy
                  </span>
                )}
              </div>
              <p className="text-xs text-[var(--app-text-muted)]">
                Current stock position compared against branch reorder levels
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Btn
                variant="outline"
                size="sm"
                onClick={() => onNavigate(DASHBOARD_INVENTORY_TARGET)}
                className="hover:border-[var(--app-primary)]"
              >
                View All Inventory
              </Btn>
              {role === "manager" && alerts.length > 0 && (
                <Btn
                  size="sm"
                  onClick={() => {
                    const highestShortfall = [...alerts].sort(
                      (a, b) => (b.reorderLevel - b.systemStock) - (a.reorderLevel - a.systemStock),
                    )[0];
                    const params = new URLSearchParams({ create: "1" });
                    if (highestShortfall) {
                      params.set("ingredientId", highestShortfall.inventoryItemId);
                      params.set(
                        "quantity",
                        String(Math.max(1, Math.ceil(highestShortfall.reorderLevel * 2 - highestShortfall.systemStock))),
                      );
                    }
                    navigate(`/purchase-orders?${params.toString()}`);
                  }}
                >
                  Create Reorder PO
                </Btn>
              )}
            </div>
          </div>

          {alerts.length > 0 && (
            <div className="cogs-table-filters flex items-center gap-2 pt-1">
              <SearchInput
                placeholder="Search ingredient, category, or branch…"
                value={alertSearch}
                onChange={setAlertSearch}
                width={280}
              />
              {alertCategories.length > 2 && (
                <Select
                  small
                  options={alertCategories}
                  value={alertCategory}
                  onChange={setAlertCategory}
                />
              )}
            </div>
          )}
        </div>

        {alerts.length > 0 ? (
          <div className="overflow-x-auto border-t" style={{ borderColor: "var(--app-border)" }}>
            <table className="data-table dashboard-alerts-table w-full text-left border-collapse min-w-[760px]">
              <thead>
                <tr style={{ background: "var(--app-bg)", borderBottom: "1px solid var(--app-border)" }}>
                  <th className="py-3 px-4 text-xs font-semibold uppercase tracking-wider text-[var(--app-text-muted)]">
                    Branch
                  </th>
                  <th className="py-3 px-4 text-xs font-semibold uppercase tracking-wider text-[var(--app-text-muted)]">
                    Ingredient & Category
                  </th>
                  <th className="py-3 px-4 text-xs font-semibold uppercase tracking-wider text-[var(--app-text-muted)] text-center">
                    Current Stock
                  </th>
                  <th className="py-3 px-4 text-xs font-semibold uppercase tracking-wider text-[var(--app-text-muted)] text-center">
                    Reorder Level
                  </th>
                  <th className="py-3 px-4 text-xs font-semibold uppercase tracking-wider text-[var(--app-text-muted)] text-center">
                    Shortfall
                  </th>
                  <th className="py-3 px-4 text-xs font-semibold uppercase tracking-wider text-[var(--app-text-muted)] text-center">
                    Stock Value
                  </th>
                  <th className="py-3 px-4 text-xs font-semibold uppercase tracking-wider text-[var(--app-text-muted)] text-center">
                    Health Status
                  </th>
                  <th className="py-3 px-4 text-xs font-semibold uppercase tracking-wider text-[var(--app-text-muted)] text-center">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: "var(--app-border)" }}>
                {filteredAlerts.length > 0 ? (
                  filteredAlerts.map((i) => {
                    const shortfall = Math.max(0, i.reorderLevel - i.systemStock);
                    const suggestedOrder = Math.max(1, Math.ceil(i.reorderLevel * 2 - i.systemStock));
                    return (
                      <tr
                        key={i.branchId + i.inventoryItemId}
                        className="hover:bg-[var(--app-primary-faint)] transition-colors duration-150"
                      >
                        <td className="py-3.5 px-4 text-xs font-medium text-[var(--app-text-muted)] whitespace-nowrap">
                          {i.branchName}
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="font-bold text-sm text-[var(--app-text)] leading-tight">
                            {i.name}
                          </div>
                          <div className="text-[11px] text-[var(--app-text-muted)] mt-0.5 font-normal">
                            {i.category || "General"}{i.sku ? ` · SKU: ${i.sku}` : ""}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-center whitespace-nowrap">
                          <span className="font-bold text-sm" style={{color:inventoryValueColor(i.systemStock)}}>
                            {i.systemStock.toLocaleString("en-PH", { maximumFractionDigits: 2 })}
                          </span>
                          <span className="text-xs text-[var(--app-text-muted)] ml-1 font-medium">
                            {i.unit}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-center text-xs font-medium whitespace-nowrap">
                          <span style={{color:inventoryValueColor(i.reorderLevel)}}>{i.reorderLevel.toLocaleString("en-PH", { maximumFractionDigits: 2 })}</span>
                          <span className="ml-1 text-[11px] text-[var(--app-text-faint)]">{i.unit}</span>
                        </td>
                        <td className="py-3.5 px-4 text-center whitespace-nowrap">
                          {shortfall > 0 ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                              -{shortfall.toLocaleString("en-PH", { maximumFractionDigits: 2 })} {i.unit}
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium text-[var(--app-text-muted)] bg-[var(--app-surface-muted)]">
                              0.00 {i.unit}
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-center text-xs font-medium text-[var(--app-text)] whitespace-nowrap">
                          {money(i.inventoryValue)}
                        </td>
                        <td className="py-3.5 px-4 text-center whitespace-nowrap">
                          <StatusChip status={stockStatusChip(i.status)} />
                        </td>
                        <td className="py-3.5 px-4 text-center whitespace-nowrap">
                          {role === "manager" ? (
                            <button
                              type="button"
                              onClick={() => {
                                const params = new URLSearchParams({
                                  create: "1",
                                  ingredientId: i.inventoryItemId,
                                  quantity: String(suggestedOrder),
                                });
                                navigate(`/purchase-orders?${params.toString()}`);
                              }}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors border shadow-sm hover:bg-[var(--app-primary)] hover:text-white"
                              style={{
                                borderColor: "var(--app-border)",
                                color: "var(--app-primary)",
                                background: "var(--app-surface)",
                              }}
                            >
                              Reorder
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => onNavigate(DASHBOARD_INVENTORY_TARGET)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors border shadow-sm hover:bg-[var(--app-primary)] hover:text-white"
                              style={{
                                borderColor: "var(--app-border)",
                                color: "var(--app-primary)",
                                background: "var(--app-surface)",
                              }}
                            >
                              Inspect
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={8} className="py-10 text-center text-xs text-[var(--app-text-muted)]">
                      No inventory alert items match "{alertSearch}".
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            {filteredAlerts.length > 0 && (
              <div
                className="px-5 py-3 bg-[var(--app-bg)] border-t flex items-center justify-between text-xs text-[var(--app-text-muted)]"
                style={{ borderColor: "var(--app-border)" }}
              >
                <span>
                  Showing top {filteredAlerts.length} of {alerts.length} alert item{alerts.length === 1 ? "" : "s"}
                </span>
                <span className="font-semibold text-[var(--app-text)]">
                  Total value: {money(filteredAlerts.reduce((sum, item) => sum + item.inventoryValue, 0))}
                </span>
              </div>
            )}
          </div>
        ) : (
          <div className="p-8 text-center bg-[var(--app-surface)] border-t" style={{ borderColor: "var(--app-border)" }}>
            <div className="w-11 h-11 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-2.5 border border-emerald-200 shadow-sm">
              <Check size={22} strokeWidth={2.5} />
            </div>
            <p className="text-sm font-bold text-emerald-900">All inventory items are currently healthy</p>
            <p className="text-xs text-[var(--app-text-muted)] mt-1 max-w-sm mx-auto leading-relaxed">
              No ingredients are below their safety or reorder thresholds in the selected branch scope.
            </p>
          </div>
        )}
      </Card>
    </>}
    <ForecastReplenishmentPanel forecast={forecast} forecastError={forecastError} role={role} onReview={() => onNavigate("predictive")} onCreateOrder={createOrder}/>
    {marginOpen && totals && financials && <div className="fixed inset-0 z-50 bg-black/40 p-4 flex items-center justify-center" onMouseDown={e=>{if(e.target===e.currentTarget)setMarginOpen(false);}}><section role="dialog" aria-modal="true" aria-label="Gross margin calculation" className="rounded-2xl p-6 max-w-md w-full bg-[var(--app-surface)] shadow-xl"><h2 className="font-bold">Gross Margin Calculation</h2><p className="mt-4">Sales: {money(financials.sales)}</p><p>Total COGS (recipe-based): {money(financials.totalCogs)}</p><p>Gross profit = Sales − Total COGS: {money(financials.grossProfit)}</p><p className="my-4">Gross margin = Gross profit ÷ Sales × 100 = {financials.grossMargin.toFixed(1)}%</p><p className="text-xs mb-3">Detected shortages and verified shrinkage are shown separately and are not deducted again.</p>{financials.sales===0&&<p className="text-xs mb-3">No sales denominator is available; the displayed margin is 0%.</p>}<Btn onClick={()=>setMarginOpen(false)}>Close</Btn></section></div>}
  </div>;
}
