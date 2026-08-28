import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowDown, ArrowUp, GitCompare, RefreshCw, Search } from "lucide-react";
import { useNavigate } from "react-router";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useAuth } from "../../contexts/AuthContext";
import { inventoryWorkflowService } from "../../services/inventoryWorkflow.service";
import { masterDataService } from "../../services/masterData.service";
import type { VarianceRecord } from "../../types/inventoryWorkflow";
import type { Branch } from "../../types/masterData";

type DisplayStatus = "MATCHED" | "EXCESS" | "DETECTED" | "PENDING_REVIEW" | "REVIEWED";
const classificationLabel = (value: VarianceRecord["classification"]) => value ? value.split("_").map((word) => word[0] + word.slice(1).toLowerCase()).join(" ") : "—";

function displayStatus(record: VarianceRecord): DisplayStatus {
  if (record.anomalyStatus) return record.anomalyStatus;
  if (record.varianceQuantity > 0.0001) return "EXCESS";
  return "MATCHED";
}

export function VarianceMonitoringPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const owner = user?.role === "OWNER";
  const [records, setRecords] = useState<VarianceRecord[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState("");
  const [countDate, setCountDate] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<DisplayStatus | "">("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true); setError("");
    try { setRecords(await inventoryWorkflowService.variances({ branchId: branchId || undefined, countDate: countDate || undefined })); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to load calculated variances"); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [branchId, countDate]);
  useEffect(() => { if (owner) void masterDataService.branches().then(setBranches).catch(() => setBranches([])); }, [owner]);

  const filtered = useMemo(() => records.filter((record) => {
    const matchesQuery = !query.trim() || `${record.sku} ${record.itemName} ${record.branchName} ${record.countNo}`.toLowerCase().includes(query.trim().toLowerCase());
    return matchesQuery && (!status || displayStatus(record) === status);
  }), [records, query, status]);

  const metrics = useMemo(() => ({
    net: records.reduce((sum, record) => sum + record.varianceValue, 0),
    shortage: records.filter((record) => record.varianceValue < 0).reduce((sum, record) => sum + Math.abs(record.varianceValue), 0),
    excess: records.filter((record) => record.varianceValue > 0).reduce((sum, record) => sum + record.varianceValue, 0),
    investigate: records.filter((record) => record.anomalyStatus === "DETECTED").length,
  }), [records]);

  const chartData = useMemo(() => [...filtered].sort((a, b) => Math.abs(b.varianceValue) - Math.abs(a.varianceValue)).slice(0, 8).map((record) => ({
    item: record.itemName.length > 16 ? `${record.itemName.slice(0, 14)}…` : record.itemName,
    expected: record.expectedQuantity,
    actual: record.actualQuantity,
  })), [filtered]);

  return <div className="p-6 space-y-5">
    <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4"><div><h1 className="text-2xl font-bold">Variance Monitoring</h1><p className="text-sm mt-1" style={{ color: "var(--app-text-muted)" }}>System-calculated comparison of expected inventory and submitted physical counts. Values cannot be manually entered here.</p></div><div className="flex gap-2 flex-wrap">
      <input type="date" value={countDate} onChange={(event) => setCountDate(event.target.value)} className="px-3 py-2 rounded-xl border text-sm" aria-label="Count date" />
      {owner && <select value={branchId} onChange={(event) => setBranchId(event.target.value)} className="px-3 py-2 rounded-xl border text-sm"><option value="">All Branches</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select>}
      <button onClick={() => void load()} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-semibold"><RefreshCw size={14} />Refresh</button>
    </div></div>

    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">{[
      ["Net Variance", `${metrics.net < 0 ? "−" : "+"}₱${Math.abs(metrics.net).toLocaleString("en-PH", { maximumFractionDigits: 2 })}`, GitCompare, "var(--app-primary)"],
      ["Shortage Value", `₱${metrics.shortage.toLocaleString("en-PH", { maximumFractionDigits: 2 })}`, ArrowDown, "var(--app-danger)"],
      ["Excess Value", `₱${metrics.excess.toLocaleString("en-PH", { maximumFractionDigits: 2 })}`, ArrowUp, "var(--app-success)"],
      ["Needs Investigation", String(metrics.investigate), AlertTriangle, "var(--app-warning)"],
    ].map(([label, value, Icon, color]) => <div key={String(label)} className="app-card p-5 rounded-2xl border" style={{ background: "var(--app-surface)", borderColor: "var(--app-border)" }}><div className="flex justify-between gap-3"><div><p className="text-xs font-semibold" style={{ color: "var(--app-text-muted)" }}>{String(label)}</p><p className="text-2xl font-bold mt-2">{String(value)}</p></div><div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "var(--app-surface-muted)", color: String(color) }}><Icon size={18} /></div></div></div>)}</div>

    <div className="app-card rounded-2xl border" style={{ background: "var(--app-surface)", borderColor: "var(--app-border)" }}><div className="p-5 pb-2"><h2 className="font-semibold">Expected vs. Actual Inventory</h2><p className="text-xs mt-1" style={{ color: "var(--app-text-muted)" }}>Based on connected inventory-count records</p></div><div className="h-60 px-3 pb-4">{chartData.length ? <ResponsiveContainer width="100%" height="100%"><BarChart data={chartData} barSize={20} barGap={4}><CartesianGrid strokeDasharray="3 3" stroke="var(--app-border)" vertical={false} /><XAxis dataKey="item" tick={{ fontSize: 10, fill: "var(--app-text-muted)" }} axisLine={false} tickLine={false} /><YAxis tick={{ fontSize: 10, fill: "var(--app-text-muted)" }} axisLine={false} tickLine={false} /><Tooltip contentStyle={{ background: "var(--app-surface-elevated)", border: "1px solid var(--app-border)", borderRadius: 12 }} /><Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} /><Bar dataKey="expected" name="Expected" fill="var(--app-info)" radius={[4, 4, 0, 0]} /><Bar dataKey="actual" name="Actual" fill="var(--app-primary)" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer> : <div className="h-full flex items-center justify-center text-sm" style={{ color: "var(--app-text-muted)" }}>No inventory counts available for this filter.</div>}</div></div>

    <div className="rounded-2xl border overflow-hidden" style={{ background: "var(--app-surface)", borderColor: "var(--app-border)" }}>
      <div className="p-4 flex gap-2 flex-wrap border-b" style={{ borderColor: "var(--app-border)" }}><div className="relative flex-1 min-w-56"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--app-text-faint)" }} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search item, SKU, count, or branch…" className="w-full pl-9 pr-3 py-2 rounded-xl border text-sm" /></div><select value={status} onChange={(event) => setStatus(event.target.value as DisplayStatus | "")} className="px-3 py-2 rounded-xl border text-sm"><option value="">All Statuses</option><option value="MATCHED">Matched</option><option value="EXCESS">Excess</option><option value="DETECTED">Needs Investigation</option><option value="PENDING_REVIEW">Pending Owner Review</option><option value="REVIEWED">Reviewed</option></select></div>
      {loading ? <div className="p-14 text-center text-sm" style={{ color: "var(--app-text-muted)" }}>Loading calculated variances…</div> : error ? <div className="p-14 text-center text-sm" style={{ color: "var(--app-danger)" }}>{error}</div> : filtered.length === 0 ? <div className="p-14 text-center text-sm" style={{ color: "var(--app-text-muted)" }}>No matching variance records.</div> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead style={{ background: "var(--app-bg)" }}><tr>{["Count", "Date", ...(owner ? ["Branch"] : []), "Item", "Expected", "Actual", "Variance", "Value", "Classification", "Status", ""].map((heading) => <th key={heading} className="px-4 py-3 text-left text-xs whitespace-nowrap" style={{ color: "var(--app-text-muted)" }}>{heading}</th>)}</tr></thead><tbody>{filtered.map((record) => <tr key={record.countItemId} className="border-t" style={{ borderColor: "var(--app-border)" }}><td className="px-4 py-3 font-mono text-xs">{record.countNo}</td><td className="px-4 py-3 whitespace-nowrap">{new Date(`${record.countDate}T00:00:00`).toLocaleDateString("en-PH")}</td>{owner && <td className="px-4 py-3">{record.branchName}</td>}<td className="px-4 py-3"><div className="font-semibold">{record.itemName}</div><div className="text-[10px] font-mono" style={{ color: "var(--app-text-faint)" }}>{record.sku}</div></td><td className="px-4 py-3">{record.expectedQuantity.toFixed(2)}{record.unit}</td><td className="px-4 py-3">{record.actualQuantity.toFixed(2)}{record.unit}</td><td className="px-4 py-3 font-bold" style={{ color: record.varianceQuantity < 0 ? "var(--app-danger)" : record.varianceQuantity > 0 ? "var(--app-success)" : "var(--app-text-muted)" }}>{record.varianceQuantity > 0 ? "+" : ""}{record.varianceQuantity.toFixed(2)}{record.unit}</td><td className="px-4 py-3">₱{Math.abs(record.varianceValue).toFixed(2)}</td><td className="px-4 py-3">{classificationLabel(record.classification)}</td><td className="px-4 py-3"><VarianceStatus status={displayStatus(record)} /></td><td className="px-4 py-3">{record.anomalyId && <button onClick={() => navigate(`/shrinkage?reportId=${record.anomalyId}`)} className="px-2.5 py-1.5 rounded-lg text-xs font-semibold" style={{ color: "var(--app-primary)", background: "var(--app-primary-subtle)" }}>{record.anomalyStatus === "DETECTED" && !owner ? "Investigate" : "View"}</button>}</td></tr>)}</tbody></table></div>}
    </div>
  </div>;
}

function VarianceStatus({ status }: { status: DisplayStatus }) {
  const map: Record<DisplayStatus, { label: string; color: string; background: string }> = {
    MATCHED: { label: "Matched", color: "var(--app-success)", background: "var(--app-success-bg)" },
    EXCESS: { label: "Excess", color: "var(--app-info)", background: "var(--app-info-bg)" },
    DETECTED: { label: "Needs Investigation", color: "var(--app-danger)", background: "var(--app-danger-bg)" },
    PENDING_REVIEW: { label: "Pending Owner Review", color: "var(--app-warning)", background: "var(--app-warning-bg)" },
    REVIEWED: { label: "Reviewed", color: "var(--app-success)", background: "var(--app-success-bg)" },
  };
  const visual = map[status];
  return <span className="inline-flex px-2.5 py-1 rounded-full text-[10px] font-bold uppercase whitespace-nowrap" style={{ color: visual.color, background: visual.background }}>{visual.label}</span>;
}
