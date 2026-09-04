import React, { lazy, Suspense, useEffect, useState } from "react";
import { ShoppingCart, Package, AlertTriangle, TrendingDown, ChevronRight, Plus, MapPin, CheckCircle, Activity, ClipboardList, Percent } from "lucide-react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart as RPieChart, Pie, Cell, Area, ComposedChart, LabelList } from "recharts";
import { C, DashboardRange, DashboardComparison, dashboardPeriodLabel, dashboardRangeFactor, formatPeso, SkeletonBlock, SkeletonKPICard, SkeletonTable, StatusChip, KPICard, Card, Btn, DashboardFilters, THead, TR, TD, ChartTip } from "../../components/ModuleUi";
import { salesTrend, managerTodaySalesTrend, branchPerf, inventoryStatus, inventoryItems, aiInsights } from "../demoData";
import { toast } from "sonner";
import { useAuth } from "../../contexts/AuthContext";
import type { Page, Role } from "../../types/navigation";
import { LossRecordModal as SpoilageModal } from "../../components/LossRecordModal";

function OwnerDashboard({ onNavigate }: { onNavigate: (p: Page) => void }) {
  const { user } = useAuth();
  const [metric, setMetric] = useState<"sales" | "cogs" | "margin" | "shrinkage">("sales");
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<DashboardRange>("mtd");
  const [comparison, setComparison] = useState<DashboardComparison>("previous");
  const [customStart, setCustomStart] = useState("2026-08-01");
  const [customEnd, setCustomEnd] = useState("2026-08-26");
  const customDays = Math.max(1, Math.round((new Date(customEnd).getTime() - new Date(customStart).getTime()) / 86400000) + 1);
  const rangeFactor = range === "custom" ? Math.min(customDays / 26, 2) : dashboardRangeFactor(range);
  const grossMargin = range === "custom" ? 56.7 + Math.min(customDays, 30) * 0.01 : { today: 58.2, "7d": 57.4, "30d": 56.8, mtd: 57 }[range];
  const shrinkageRate = range === "custom" ? 1.42 + Math.min(customDays, 30) * 0.008 : { today: 1.31, "7d": 1.48, "30d": 1.72, mtd: 1.65 }[range];
  const periodLabel = dashboardPeriodLabel(range, customStart, customEnd);
  const comparisonLabel = comparison === "previous" ? "previous period" : "last month";
  const ownerChanges = comparison === "previous"
    ? { sales: "+8.3%", cogs: "+5.1%", margin: "+1.2pp", shrinkage: "+0.2pp" }
    : { sales: "+6.9%", cogs: "+4.4%", margin: "+0.8pp", shrinkage: "+0.1pp" };
  const rankedBranchData = branchPerf
    .map(branch => ({
      ...branch,
      sales: Math.round(branch.sales * rangeFactor),
      cogs: Math.round(branch.cogs * rangeFactor),
      margin: Number((branch.margin + grossMargin - 57).toFixed(1)),
      shrinkage: Math.round(branch.shrinkage * rangeFactor),
    }))
    .sort((a, b) => Number(b[metric]) - Number(a[metric]));
  const visibleSalesTrend = range === "today" ? salesTrend.slice(-1) : range === "custom" ? salesTrend.slice(-Math.min(customDays, 7)) : salesTrend;

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 1200);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="dashboard-page p-6 space-y-6">
      <div className="dashboard-intro flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: C.primary }}>Good morning, {user?.firstName ?? "Owner"} 👋</h1>
          <p className="text-sm mt-1" style={{ color: C.secondary }}>Here's how Libro Espresso is performing across all branches.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <DashboardFilters range={range} comparison={comparison} customStart={customStart} customEnd={customEnd}
            onRangeChange={setRange} onComparisonChange={setComparison}
            onApplyCustom={(start, end) => { setCustomStart(start); setCustomEnd(end); }}
            onReset={() => { setRange("mtd"); setCustomStart("2026-08-01"); setCustomEnd("2026-08-26"); }} />
        </div>
      </div>

      {/* KPI Row */}
      {loading ? (
        <div className="dashboard-kpi-grid grid grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonKPICard key={i} />)}
        </div>
      ) : (
        <div className="dashboard-kpi-grid grid grid-cols-4 gap-4">
          <KPICard label="Total Sales" value={formatPeso(1120500 * rangeFactor)} change={ownerChanges.sales} changeDir="up" sub={`All branches · ${periodLabel}`} icon={ShoppingCart} color={C.maroon} comparisonLabel={comparisonLabel} />
          <KPICard label="Total COGS" value={formatPeso(482100 * rangeFactor)} change={ownerChanges.cogs} changeDir="up" sub="43.0% of sales" icon={Package} color={C.amber} comparisonLabel={comparisonLabel} />
          <KPICard label="Gross Margin" value={`${grossMargin.toFixed(1)}%`} change={ownerChanges.margin} changeDir="up" sub={`${formatPeso(638400 * rangeFactor)} gross profit`} icon={Percent} color={C.green} comparisonLabel={comparisonLabel} />
          <KPICard label="Shrinkage Rate" value={`${shrinkageRate.toFixed(2)}%`} change={ownerChanges.shrinkage} changeDir="down" sub={`${formatPeso(18450 * rangeFactor)} loss this period`} icon={TrendingDown} color={C.red} comparisonLabel={comparisonLabel} />
        </div>
      )}

      {/* Row 2: Branch Perf + AI Insights */}
      <div className="grid grid-cols-5 gap-5">
        <Card className="col-span-3" padding={false}>
          <div className="px-5 pt-5 pb-0 flex items-center justify-between mb-3">
            <div>
              <h3 className="font-semibold" style={{ color: C.primary }}>Cross-Branch Performance</h3>
              <p className="text-xs mt-0.5" style={{ color: C.secondary }}>{periodLabel} · Ranked by {metric}</p>
            </div>
            <div className="flex gap-1 p-0.5 rounded-lg border" style={{ borderColor: C.border }}>
              {(["sales", "cogs", "margin", "shrinkage"] as const).map(m => (
                <button key={m} onClick={() => setMetric(m)}
                  className="px-2.5 py-1 rounded-md text-xs font-medium capitalize transition-colors"
                  style={{ background: metric === m ? C.maroon : "transparent", color: metric === m ? "#fff" : C.secondary }}>
                  {m === "margin" ? "Margin" : m.charAt(0).toUpperCase() + m.slice(1)}
                </button>
              ))}
            </div>
          </div>
          {loading ? <div className="h-52 px-5 pb-5"><SkeletonBlock w="100%" h={200} className="rounded-lg" /></div> : (
            <div className="h-60 px-3 pb-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={rankedBranchData} barSize={28} margin={{ left: 8, right: 8, top: 18 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                  <XAxis dataKey="branch" tick={{ fontSize: 11, fill: C.secondary }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: C.secondary }} axisLine={false} tickLine={false}
                    tickFormatter={v => metric === "margin" ? `${v}%` : `₱${(v / 1000).toFixed(0)}k`} />
                  <Tooltip content={<ChartTip />} />
                  <Bar dataKey={metric} name={metric === "margin" ? "Margin %" : metric.charAt(0).toUpperCase() + metric.slice(1)}
                    fill={metric === "shrinkage" ? C.red : metric === "cogs" ? C.amber : metric === "margin" ? C.green : C.maroon}
                    radius={[7, 7, 0, 0]}>
                    <LabelList dataKey={metric} position="top" style={{ fill: C.secondary, fontSize: 10, fontWeight: 600 }}
                      formatter={(value: any) => metric === "margin" ? `${value}%` : `₱${(Number(value) / 1000).toFixed(0)}k`} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card className="col-span-2">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: C.softMaroonBg }}>
              <Activity size={14} style={{ color: C.maroon }} />
            </div>
            <div>
              <h3 className="text-sm font-semibold" style={{ color: C.primary }}>Business Insight</h3>
              <p className="text-xs" style={{ color: C.muted }}>Forecast model · Updated 08:02 AM</p>
            </div>
          </div>
          <div className="space-y-2.5">
            {aiInsights.slice(0, 1).map(ins => (
              <div key={ins.id} className="p-3 rounded-xl border"
                style={{ borderColor: C.border, background: C.veryLightMaroon }}>
                <div className="flex items-start justify-between gap-2 mb-1">
                  <p className="text-xs font-semibold leading-snug" style={{ color: C.primary }}>{ins.title}</p>
                  <StatusChip status={ins.urgency === "high" ? "high" : ins.urgency === "medium" ? "medium" : "low_urgency"} />
                </div>
                <p className="text-xs leading-relaxed" style={{ color: C.secondary }}>{ins.desc}</p>
                <div className="mt-1.5 flex items-center gap-1.5">
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: C.softMaroonBg, color: C.maroon }}>
                    {ins.metric}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <button className="mt-3 text-xs font-semibold flex items-center gap-1" style={{ color: C.maroon }}
            onClick={() => onNavigate("predictive")}>
            View Predictive Analytics <ChevronRight size={11} />
          </button>
        </Card>
      </div>

      {/* Row 3: Inventory Health + Shrinkage */}
      <div className="grid grid-cols-5 gap-5">
        <Card className="col-span-2">
          <h3 className="font-semibold" style={{ color: C.primary }}>Inventory Health</h3>
          <p className="text-xs mt-0.5 mb-4" style={{ color: C.secondary }}>228 SKUs · All branches</p>
          {loading ? <SkeletonBlock w="100%" h={160} className="rounded-lg" /> : (
            <>
              <div className="flex justify-center mb-4">
                <ResponsiveContainer width={200} height={180}>
                  <RPieChart>
                    <Pie data={inventoryStatus} cx="50%" cy="50%" innerRadius={55} outerRadius={85}
                      paddingAngle={3} cornerRadius={7} dataKey="value" startAngle={90} endAngle={-270}
                      stroke={C.surface} strokeWidth={2}>
                      {inventoryStatus.map((e, i) => <Cell key={i} fill={e.color} />)}
                    </Pie>
                    <Tooltip formatter={(v: any, n: any) => [`${v} SKUs`, n]} />
                  </RPieChart>
                </ResponsiveContainer>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {inventoryStatus.map(s => (
                  <div key={s.name} className="flex items-center gap-2 py-1">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: s.color }} />
                    <div>
                      <div className="text-xs font-semibold" style={{ color: C.primary }}>{s.value}</div>
                      <div className="text-xs" style={{ color: C.secondary }}>{s.name}</div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>

        <Card className="col-span-3" padding={false}>
          <div className="px-5 pt-5 flex items-center justify-between">
            <div>
              <h3 className="font-semibold" style={{ color: C.primary }}>Sales &amp; COGS Performance</h3>
              <p className="text-xs mt-0.5" style={{ color: C.secondary }}>Aug 19–25, 2026 · All branches</p>
            </div>
            <Btn variant="ghost" size="sm" onClick={() => onNavigate("sales")}>View analysis</Btn>
          </div>
          {loading ? <div className="p-5"><SkeletonBlock w="100%" h={210} className="rounded-lg" /></div> : (
            <div className="h-64 px-3 pb-4 pt-3">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={visibleSalesTrend}>
                  <defs>
                    <linearGradient id="owner-sales-area" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={C.maroon} stopOpacity={0.16} />
                      <stop offset="95%" stopColor={C.maroon} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: C.secondary }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: C.secondary }} axisLine={false} tickLine={false}
                    tickFormatter={v => `₱${(v / 1000).toFixed(0)}k`} />
                  <Tooltip content={<ChartTip />} />
                  <Legend iconSize={9} wrapperStyle={{ fontSize: 11 }} />
                  <Area type="monotone" dataKey="sales" name="Sales" fill="url(#owner-sales-area)" stroke={C.maroon} strokeWidth={2.25} dot={false} />
                  <Line type="monotone" dataKey="cogs" name="COGS" stroke={C.amber} strokeWidth={1.75} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>

      {/* Row 4: Alerts + Branch Table */}
      <div className="grid grid-cols-5 gap-5">
        <Card className="col-span-3" padding={false}>
          <div className="px-5 pt-5 pb-3 flex items-center justify-between">
            <h3 className="font-semibold" style={{ color: C.primary }}>Recent Inventory Alerts</h3>
            <Btn variant="ghost" size="sm" onClick={() => onNavigate("inventory")}>View all</Btn>
          </div>
          {loading ? <SkeletonTable rows={4} cols={6} /> : (
            <div className="overflow-x-auto">
              <table className="data-table w-full">
                <THead cols={["Item", "Branch", "Alert Type", "Stock / Threshold", "Detected", "Severity"]} />
                <tbody>
                  {[
                    { item: "Arabica Beans", branch: "Vermosa", type: "Potential Pilferage", stock: "38 kg / 20 kg", detected: "Aug 25", sev: "critical" },
                    { item: "Whole Milk", branch: "Lipa", type: "Low Stock", stock: "45 L / 60 L", detected: "Aug 26", sev: "warning" },
                    { item: "Butter", branch: "Lipa", type: "Out of Stock", stock: "0 kg / 10 kg", detected: "Aug 26", sev: "critical" },
                    { item: "White Sugar", branch: "Lipa", type: "Critical Stock", stock: "8 kg / 15 kg", detected: "Aug 25", sev: "critical" },
                    { item: "Croissants", branch: "Gulod", type: "Low Stock", stock: "24 pcs / 30 pcs", detected: "Aug 26", sev: "warning" },
                  ].slice(0, 3).map((a, i) => (
                    <TR key={i}>
                      <TD><span className="font-medium">{a.item}</span></TD>
                      <TD muted>{a.branch}</TD>
                      <TD muted>{a.type}</TD>
                      <TD muted><span className="font-mono text-xs">{a.stock}</span></TD>
                      <TD muted>{a.detected}</TD>
                      <TD><StatusChip status={a.sev} /></TD>
                    </TR>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card className="col-span-2" padding={false}>
          <div className="px-5 pt-5 pb-3">
            <h3 className="font-semibold" style={{ color: C.primary }}>Branch Performance</h3>
          </div>
          {loading ? <SkeletonTable rows={5} cols={4} /> : (
            <div className="overflow-x-auto">
              <table className="data-table w-full">
                <THead cols={["Branch", "Sales", "Margin", "Shrinkage"]} />
                <tbody>
                  {branchPerf.map((b, i) => (
                    <TR key={i} onClick={() => onNavigate("inventory")}>
                      <TD><span className="font-semibold" style={{ color: C.maroon }}>{b.branch}</span></TD>
                      <TD right>₱{(b.sales / 1000).toFixed(0)}k</TD>
                      <TD right><span className="font-semibold text-xs" style={{ color: C.green }}>{b.margin}%</span></TD>
                      <TD right><span className="text-xs" style={{ color: C.red }}>₱{(b.shrinkage / 1000).toFixed(1)}k</span></TD>
                    </TR>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

// ─── Branch Manager Dashboard ──────────────────────────────────────────────────
function ManagerDashboard({ onNavigate }: { onNavigate: (p: Page) => void }) {
  const { user } = useAuth();
  const [showSpoilage, setShowSpoilage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<DashboardRange>("today");
  const [comparison, setComparison] = useState<DashboardComparison>("previous");
  const [customStart, setCustomStart] = useState("2026-08-01");
  const [customEnd, setCustomEnd] = useState("2026-08-26");
  const customDays = Math.max(1, Math.round((new Date(customEnd).getTime() - new Date(customStart).getTime()) / 86400000) + 1);
  const managerRangeFactor = range === "custom" ? customDays * 0.9 : { today: 1, "7d": 6.36, "30d": 25.1, mtd: 21.7 }[range];
  const branchMargin = range === "custom" ? 56.9 + Math.min(customDays, 30) * 0.008 : { today: 57.1, "7d": 57.4, "30d": 56.8, mtd: 57 }[range];
  const branchShrinkage = range === "custom" ? 1.31 + Math.min(customDays, 30) * 0.007 : { today: 1.18, "7d": 1.36, "30d": 1.58, mtd: 1.49 }[range];
  const periodLabel = dashboardPeriodLabel(range, customStart, customEnd);
  const comparisonLabel = comparison === "previous" ? "previous period" : "last month";
  const managerChanges = comparison === "previous"
    ? { sales: "+4.8%", cogs: "+3.1%", profit: "+6.1%", shrinkage: "+0.2pp" }
    : { sales: "+3.9%", cogs: "+2.6%", profit: "+5.0%", shrinkage: "+0.1pp" };
  const visibleSalesTrend = range === "today" ? managerTodaySalesTrend : range === "custom" ? salesTrend.slice(-Math.min(customDays, 7)) : salesTrend;

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 1000);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="dashboard-page p-6 space-y-6">
      {/* Header */}
      <div className="dashboard-intro flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 mb-0.5">
            <h1 className="text-2xl font-bold" style={{ color: C.primary }}>Good morning, {user?.firstName ?? "Manager"} 👋</h1>
            <span className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold" style={{ background: C.softMaroonBg, color: C.maroon }}>
              <MapPin size={10} /> {user?.branch?.name ?? "Assigned Branch"}
            </span>
          </div>
          <p className="text-sm" style={{ color: C.secondary }}>Here's what needs your attention today — August 26, 2026</p>
        </div>
        <DashboardFilters range={range} comparison={comparison} customStart={customStart} customEnd={customEnd}
          onRangeChange={setRange} onComparisonChange={setComparison}
          onApplyCustom={(start, end) => { setCustomStart(start); setCustomEnd(end); }}
          onReset={() => { setRange("today"); setCustomStart("2026-08-01"); setCustomEnd("2026-08-26"); }} />
      </div>

      {/* Quick actions */}
      <div className="dashboard-quick-actions grid grid-cols-3 gap-3">
        {[
          { label: "Record Stock Count", Icon: ClipboardList, action: () => onNavigate("physical-count"), accent: C.blue, bg: C.blueBg },
          { label: "Record Spoilage / Wastage", Icon: AlertTriangle, action: () => setShowSpoilage(true), accent: C.amber, bg: C.amberBg },
          { label: "Create Purchase Request", Icon: Plus, action: () => onNavigate("purchase-orders"), accent: C.green, bg: C.greenBg },
        ].map(qa => (
          <button key={qa.label} onClick={qa.action}
            className="flex items-center gap-3 px-4 py-3.5 rounded-xl border font-medium text-sm transition-all hover:shadow-sm group"
            style={{ background: C.surface, borderColor: C.border, color: qa.accent }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = qa.bg; (e.currentTarget as HTMLElement).style.borderColor = qa.accent; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = C.surface; (e.currentTarget as HTMLElement).style.borderColor = C.border; }}>
            <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: qa.bg }}>
              <qa.Icon size={15} style={{ color: qa.accent }} />
            </div>
            {qa.label}
          </button>
        ))}
      </div>

      {/* KPIs */}
      {loading ? (
        <div className="dashboard-kpi-grid grid grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonKPICard key={i} />)}
        </div>
      ) : (
        <div className="dashboard-kpi-grid grid grid-cols-4 gap-4">
          <KPICard label="Branch Sales" value={formatPeso(48700 * managerRangeFactor)} change={managerChanges.sales} changeDir="up" sub={`Lipa Branch · ${periodLabel}`} icon={ShoppingCart} color={C.maroon} comparisonLabel={comparisonLabel} />
          <KPICard label="Branch COGS" value={formatPeso(20900 * managerRangeFactor)} change={managerChanges.cogs} changeDir="up" sub="42.9% of sales" icon={Package} color={C.amber} comparisonLabel={comparisonLabel} />
          <KPICard label="Gross Profit" value={formatPeso(27800 * managerRangeFactor)} change={managerChanges.profit} changeDir="up" sub={`${branchMargin.toFixed(1)}% margin`} icon={Percent} color={C.green} comparisonLabel={comparisonLabel} />
          <KPICard label="Shrinkage Rate" value={`${branchShrinkage.toFixed(2)}%`} change={managerChanges.shrinkage} changeDir="down" sub={`${formatPeso(3620 * Math.max(1, managerRangeFactor / 21.7))} loss this period`} icon={TrendingDown} color={C.red} comparisonLabel={comparisonLabel} />
        </div>
      )}

      {/* Row 2: Sales + Inventory */}
      <div className="grid grid-cols-5 gap-5">
        <Card className="col-span-3" padding={false}>
          <div className="px-5 pt-5 pb-0 flex items-start justify-between mb-3">
            <div>
              <h3 className="font-semibold" style={{ color: C.primary }}>Sales Performance</h3>
              <p className="text-xs mt-0.5" style={{ color: C.secondary }}>{periodLabel} · Lipa Branch</p>
            </div>
            <button className="text-xs font-semibold" style={{ color: C.maroon }} onClick={() => onNavigate("sales")}>View Analysis →</button>
          </div>
          <div className="h-52 px-3 pb-4">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={visibleSalesTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: C.secondary }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: C.secondary }} axisLine={false} tickLine={false}
                  tickFormatter={v => `₱${(v / 1000).toFixed(0)}k`} />
                <Tooltip content={<ChartTip />} />
                <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="sales" name="Sales" stroke={C.maroon} strokeWidth={2.5} dot={{ r: 2.5, fill: C.maroon }} activeDot={{ r: 5 }} />
                <Line type="monotone" dataKey="cogs" name="COGS" stroke={C.amber} strokeWidth={2.25} dot={{ r: 2.5, fill: C.amber }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="col-span-2">
          <h3 className="font-semibold mb-0.5" style={{ color: C.primary }}>Inventory Status</h3>
          <p className="text-xs mb-4" style={{ color: C.secondary }}>Lipa Branch · 68 SKUs</p>
          <div className="flex justify-center mb-4">
            <ResponsiveContainer width={180} height={175}>
              <RPieChart>
                <Pie data={[
                  { name: "Healthy", value: 46, color: C.green },
                  { name: "Low Stock", value: 14, color: C.amber },
                  { name: "Critical", value: 6, color: C.red },
                  { name: "Out of Stock", value: 2, color: C.deepMaroon },
                ]} cx="50%" cy="50%" innerRadius={52} outerRadius={80} paddingAngle={3} cornerRadius={7}
                  dataKey="value" stroke={C.surface} strokeWidth={2}>
                  {[C.green, C.amber, C.red, C.deepMaroon].map((c, i) => <Cell key={i} fill={c} />)}
                </Pie>
              </RPieChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {[
              { l: "Healthy", v: 46, c: C.green },
              { l: "Low Stock", v: 14, c: C.amber },
              { l: "Critical", v: 6, c: C.red },
              { l: "Out of Stock", v: 2, c: C.deepMaroon },
            ].map(s => (
              <div key={s.l} className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: s.c }} />
                <span className="text-xs" style={{ color: C.secondary }}>{s.l}</span>
                <span className="text-xs font-bold ml-auto" style={{ color: C.primary }}>{s.v}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Row 3: Low Stock + AI */}
      <div className="grid grid-cols-5 gap-5">
        <Card className="col-span-3" padding={false}>
          <div className="px-5 pt-5 pb-3 flex items-center justify-between">
            <h3 className="font-semibold" style={{ color: C.primary }}>Low Stock & Critical Items</h3>
            <Btn variant="ghost" size="sm" onClick={() => onNavigate("inventory")}>View all</Btn>
          </div>
          <div className="overflow-x-auto">
              <table className="data-table w-full">
              <THead cols={["SKU", "Item", "On Hand", "Reorder", "Status", "Action"]} />
              <tbody>
                {inventoryItems.filter(i => i.status !== "healthy").map(item => (
                  <TR key={item.sku}>
                    <TD mono muted>{item.sku}</TD>
                    <TD><span className="font-medium">{item.name}</span></TD>
                    <TD right>{item.onHand} {item.unit}</TD>
                    <TD right muted>{item.reorder}</TD>
                    <TD><StatusChip status={item.status} /></TD>
                    <TD>
                      <button className="text-xs font-semibold px-2.5 py-1 rounded-lg border transition-colors"
                        style={{ borderColor: C.maroon, color: C.maroon }}
                        onClick={() => { onNavigate("purchase-orders"); toast.success("Opening purchase request form"); }}>
                        Request
                      </button>
                    </TD>
                  </TR>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="col-span-2">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: C.softMaroonBg }}>
              <Activity size={14} style={{ color: C.maroon }} />
            </div>
            <div>
              <h3 className="text-sm font-semibold" style={{ color: C.primary }}>Operational Insight</h3>
              <p className="text-xs" style={{ color: C.muted }}>Forecast model · Lipa · Updated 08:02 AM</p>
            </div>
          </div>
          <div className="space-y-3">
            {[
              { item: "Whole Milk", sku: "RM-001", reorder: 24, unit: "L", stockout: "3 days", reason: "Higher consumption detected over last 7 days.", urgency: "high" },
              { item: "Arabica Beans", sku: "RM-002", reorder: 10, unit: "kg", stockout: "4 days", reason: "Usage trending above seasonal average.", urgency: "high" },
              { item: "White Sugar", sku: "RM-008", reorder: 20, unit: "kg", stockout: "6 days", reason: "Consistent daily depletion detected.", urgency: "medium" },
            ].slice(0, 1).map(r => (
              <div key={r.sku} className="p-3 rounded-xl border" style={{ borderColor: C.border, background: C.veryLightMaroon }}>
                <div className="flex items-start justify-between mb-1.5">
                  <div>
                    <p className="text-sm font-semibold" style={{ color: C.primary }}>{r.item}</p>
                    <p className="text-xs" style={{ color: C.muted }}>{r.sku}</p>
                  </div>
                  <StatusChip status={r.urgency} />
                </div>
                <div className="flex gap-3 text-xs mb-1.5">
                  <span style={{ color: C.secondary }}>Reorder: <strong style={{ color: C.primary }}>{r.reorder} {r.unit}</strong></span>
                  <span style={{ color: C.secondary }}>Stockout: <strong style={{ color: C.red }}>{r.stockout}</strong></span>
                </div>
                <p className="text-xs italic mb-2.5" style={{ color: C.secondary }}>&ldquo;{r.reason}&rdquo;</p>
                <div className="flex gap-2">
                  <button className="flex-1 py-1.5 rounded-lg text-xs font-semibold text-white"
                    style={{ background: C.maroon }}
                    onClick={() => { onNavigate("purchase-orders"); toast.success("Opening create PO form"); }}>
                    Create PO
                  </button>
                  <button className="px-3 py-1.5 rounded-lg text-xs font-semibold border"
                    style={{ borderColor: C.border, color: C.secondary }}>
                    Review
                  </button>
                </div>
              </div>
            ))}
          </div>
          <button className="mt-3 text-xs font-semibold flex items-center gap-1" style={{ color: C.maroon }}
            onClick={() => onNavigate("predictive")}>View Predictive Analytics <ChevronRight size={11} /></button>
          <p className="text-xs mt-3 pt-3 border-t" style={{ borderColor: C.border, color: C.muted }}>
            Forecast-assisted · Management approval required before ordering.
          </p>
        </Card>
      </div>

      {/* Row 4: Branch Operations */}
      <Card>
        <div className="mb-4">
          <h3 className="font-semibold" style={{ color: C.primary }}>Branch Operations</h3>
          <p className="text-xs mt-0.5" style={{ color: C.secondary }}>Recent inventory, shrinkage, and POS activity for Lipa Branch</p>
        </div>
        <div className="space-y-2.5">
          {[
            { Icon: CheckCircle, color: C.green, label: "POS CSV successfully imported", sub: "Aug 26, 2026 · 540 transactions · ₱48,700 total sales", time: "2 hr ago" },
            { Icon: ClipboardList, color: C.blue, label: "Physical stock count submitted", sub: "Aug 25 end-of-day · 68 items counted · 3 variances noted", time: "Yesterday" },
            { Icon: AlertTriangle, color: C.amber, label: "Spoilage record created", sub: "Whole Milk · 12 L · Temperature issue · ₱1,680 estimated loss", time: "Yesterday" },
            { Icon: ClipboardList, color: C.maroon, label: "Purchase request submitted", sub: "PR-2026-0042 · ₱28,400 · Metro Dairy Supply · Pending approval", time: "2 days ago" },
          ].map((a, i) => (
            <div key={i} className="flex items-start gap-3 p-3 rounded-xl" style={{ background: C.mainBg }}>
              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: `color-mix(in srgb, ${a.color} 10%, transparent)` }}>
                <a.Icon size={14} style={{ color: a.color }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium" style={{ color: C.primary }}>{a.label}</p>
                <p className="text-xs mt-0.5" style={{ color: C.secondary }}>{a.sub}</p>
              </div>
              <span className="text-xs flex-shrink-0" style={{ color: C.muted }}>{a.time}</span>
            </div>
          ))}
        </div>
      </Card>

      {showSpoilage && <SpoilageModal onClose={() => setShowSpoilage(false)}
        onSave={() => { setShowSpoilage(false); toast.success("Loss record saved successfully"); }} />}
    </div>
  );
}

// ─── Spoilage / Wastage Modal ──────────────────────────────────────────────────

export function DashboardPage({ role, onNavigate }: { role: Role; onNavigate: (page: Page) => void }) {
  return role === "owner" ? <OwnerDashboard onNavigate={onNavigate} /> : <ManagerDashboard onNavigate={onNavigate} />;
}
