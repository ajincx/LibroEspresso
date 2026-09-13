import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowDown, ArrowUp, GitCompare, RefreshCw, Search } from "lucide-react";
import { useNavigate } from "react-router";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useAuth } from "../../contexts/AuthContext";
import { inventoryWorkflowService } from "../../services/inventoryWorkflow.service";
import { masterDataService } from "../../services/masterData.service";
import type { VarianceRecord } from "../../types/inventoryWorkflow";
import type { Branch } from "../../types/masterData";
import { CalendarDateField, Select, SearchInput, TableCard, TableWrapper, THead, TR, TD, TableEmptyRow, TableLoadingRow, StatusBadge, Pagination } from "../../components/ModuleUi";
import { formatAppDate } from "../../utils/appPreferences";
import { classificationLabel } from "../../utils/shrinkageTaxonomy";

type DisplayStatus =
  | "MATCHED"
  | "SHORTAGE"
  | "SHORTAGE_WITHIN_TOLERANCE"
  | "EXCESS"
  | "EXCESS_WITHIN_TOLERANCE"
  | "DETECTED"
  | "VERIFIED"
  | "PENDING_REVIEW"
  | "REVIEWED";

function displayStatus(record: VarianceRecord): DisplayStatus {
  if (record.anomalyStatus) return record.anomalyStatus;
  const v = record.varianceQuantity;
  if (Math.abs(v) <= 0.0001) return "MATCHED";
  if (v > 0) return "SHORTAGE_WITHIN_TOLERANCE";
  return "EXCESS_WITHIN_TOLERANCE";
}

export function VariancePage({ scopeBranchId = "ALL" }: { scopeBranchId?: string }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const owner = user?.role === "OWNER";
  const [records, setRecords] = useState<VarianceRecord[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState(scopeBranchId === "ALL" ? "" : scopeBranchId);
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
  useEffect(() => { if (owner) setBranchId(scopeBranchId === "ALL" ? "" : scopeBranchId); }, [owner, scopeBranchId]);
  useEffect(() => { if (owner) void masterDataService.branches().then(setBranches).catch(() => setBranches([])); }, [owner]);

  const filtered = useMemo(() => records.filter((record) => {
    const matchesQuery = !query.trim() || `${record.sku} ${record.itemName} ${record.branchName} ${record.countNo}`.toLowerCase().includes(query.trim().toLowerCase());
    return matchesQuery && (!status || displayStatus(record) === status);
  }), [records, query, status]);

  const metrics = useMemo(() => ({
    net: records.reduce((sum, record) => sum + record.varianceValue, 0),
    shortage: records.filter((record) => record.varianceValue > 0).reduce((sum, record) => sum + record.varianceValue, 0),
    excess: records.filter((record) => record.varianceValue < 0).reduce((sum, record) => sum + Math.abs(record.varianceValue), 0),
    investigate: records.filter((record) => record.anomalyStatus === "DETECTED").length,
  }), [records]);

  const chartData = useMemo(() => [...filtered].sort((a, b) => Math.abs(b.varianceValue) - Math.abs(a.varianceValue)).slice(0, 8).map((record) => ({
    item: record.itemName.length > 16 ? `${record.itemName.slice(0, 14)}…` : record.itemName,
    expected: record.expectedQuantity,
    actual: record.actualQuantity,
  })), [filtered]);

  return <div className="p-4 md:p-6 space-y-5">
    <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4"><div><h1 className="text-xl font-bold">Variance &amp; Discrepancies</h1><p className="text-sm mt-1" style={{ color: "var(--app-text-muted)" }}>System-calculated comparison of expected inventory and submitted physical counts (Expected − Actual). Positive values indicate shortages.</p></div><div className="flex gap-2 flex-wrap">
      <CalendarDateField label="Count date" value={countDate} onChange={setCountDate}/>
      {owner && <Select value={branchId} onChange={setBranchId} options={[{ value: "", label: "All Branches" }, ...branches.map((branch) => ({ value: branch.id, label: branch.name }))]}/>}
      <button onClick={() => void load()} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-semibold"><RefreshCw size={14} />Refresh</button>
    </div></div>

    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">{[
      ["Net Variance", `${metrics.net < 0 ? "−" : "+"}₱${Math.abs(metrics.net).toLocaleString("en-PH", { maximumFractionDigits: 2 })}`, GitCompare, "var(--app-primary)"],
      ["Shortage Value", `₱${metrics.shortage.toLocaleString("en-PH", { maximumFractionDigits: 2 })}`, ArrowDown, "var(--app-danger)"],
      ["Excess Value", `₱${metrics.excess.toLocaleString("en-PH", { maximumFractionDigits: 2 })}`, ArrowUp, "var(--app-success)"],
      ["Needs Investigation", String(metrics.investigate), AlertTriangle, "var(--app-warning)"],
    ].map(([label, value, Icon, color]) => <div key={String(label)} className="app-card p-5 rounded-2xl border" style={{ background: "var(--app-surface)", borderColor: "var(--app-border)" }}><div className="flex justify-between gap-3"><div><p className="text-xs font-semibold" style={{ color: "var(--app-text-muted)" }}>{String(label)}</p><p className="text-2xl font-bold mt-2">{String(value)}</p></div><div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "var(--app-surface-muted)", color: String(color) }}><Icon size={18} /></div></div></div>)}</div>

    <div className="app-card rounded-2xl border" style={{ background: "var(--app-surface)", borderColor: "var(--app-border)" }}><div className="p-5 pb-2"><h2 className="font-semibold">Expected vs. Actual Inventory</h2><p className="text-xs mt-1" style={{ color: "var(--app-text-muted)" }}>Based on connected inventory-count records</p></div><div className="h-60 px-3 pb-4">{chartData.length ? <ResponsiveContainer width="100%" height="100%"><BarChart data={chartData} barSize={20} barGap={4}><CartesianGrid strokeDasharray="3 3" stroke="var(--app-border)" vertical={false} /><XAxis dataKey="item" tick={{ fontSize: 10, fill: "var(--app-text-muted)" }} axisLine={false} tickLine={false} /><YAxis tick={{ fontSize: 10, fill: "var(--app-text-muted)" }} axisLine={false} tickLine={false} /><Tooltip contentStyle={{ background: "var(--app-surface-elevated)", border: "1px solid var(--app-border)", borderRadius: 12 }} /><Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} /><Bar dataKey="expected" name="Expected" fill="var(--app-info)" radius={[4, 4, 0, 0]} /><Bar dataKey="actual" name="Actual" fill="var(--app-primary)" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer> : <div className="h-full flex items-center justify-center text-sm" style={{ color: "var(--app-text-muted)" }}>No inventory counts available for this filter.</div>}</div></div>

    <TableCard
      title="Variance & Discrepancy Records"
      subtitle="System-calculated variance between expected inventory and actual physical counts (Expected − Actual)"
      badge={
        filtered.length > 0 ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-0.5 rounded-full text-rose-700 bg-rose-50 border border-rose-200">
            {filtered.length} record{filtered.length === 1 ? "" : "s"}
          </span>
        ) : undefined
      }
      toolbar={
        <>
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search item, SKU, count, or branch…"
            width={280}
          />
          <Select
            value={status}
            onChange={(value) => setStatus(value as DisplayStatus | "")}
            options={[
              { value: "", label: "All Statuses" },
              { value: "MATCHED", label: "Matched" },
              { value: "SHORTAGE_WITHIN_TOLERANCE", label: "Shortage (Within Tolerance)" },
              { value: "EXCESS_WITHIN_TOLERANCE", label: "Excess" },
              { value: "DETECTED", label: "Needs Investigation" },
              { value: "VERIFIED", label: "Verified Shrinkage" },
              { value: "PENDING_REVIEW", label: "Pending Owner Review" },
              { value: "REVIEWED", label: "Reviewed" },
            ]}
          />
        </>
      }
    >
      <TableWrapper minWidth={900}>
        <THead
          cols={[
            "Count",
            "Date",
            ...(owner ? ["Branch"] : []),
            "Item",
            "Expected",
            "Actual",
            "Variance",
            "Variance %",
            "Value",
            "Classification",
            "Status",
            "Action",
          ]}
        />
        <tbody>
          {loading ? (
            <TableLoadingRow colSpan={owner ? 12 : 11} label="Loading calculated variances…" />
          ) : error ? (
            <TableEmptyRow colSpan={owner ? 12 : 11} title="Unable to load variances" subtitle={error} />
          ) : filtered.length === 0 ? (
            <TableEmptyRow colSpan={owner ? 12 : 11} title="No matching variance records" subtitle="No physical count discrepancies match the selected criteria." />
          ) : (
            filtered.map((record) => (
              <TR key={record.countItemId}>
                <TD mono><span className="font-semibold text-[var(--app-primary)]">{record.countNo}</span></TD>
                  <TD muted>{formatAppDate(record.countDate)}</TD>
                {owner && <TD muted><span className="font-medium text-[var(--app-text)]">{record.branchName}</span></TD>}
                <TD>
                  <div className="font-semibold text-sm text-[var(--app-text)]">{record.itemName}</div>
                  <div className="text-[11px] font-mono text-[var(--app-text-muted)] mt-0.5">{record.sku}</div>
                </TD>
                <TD right muted>{record.expectedQuantity.toFixed(2)} {record.unit}</TD>
                <TD right muted>{record.actualQuantity.toFixed(2)} {record.unit}</TD>
                <TD right>
                  <span
                    className="font-bold"
                    style={{
                      color:
                        record.varianceQuantity > 0
                          ? "var(--app-danger)"
                          : record.varianceQuantity < 0
                            ? "var(--app-info)"
                            : "var(--app-text-muted)",
                    }}
                  >
                    {record.varianceQuantity > 0 ? "+" : ""}
                    {record.varianceQuantity.toFixed(2)} {record.unit}
                  </span>
                </TD>
                <TD right>
                  <span
                    className="font-bold text-xs"
                    style={{
                      color:
                        record.variancePercentage === null
                          ? "var(--app-text-muted)"
                          : record.variancePercentage > 0
                            ? "var(--app-danger)"
                            : record.variancePercentage < 0
                              ? "var(--app-info)"
                              : "var(--app-text-muted)",
                    }}
                  >
                    {record.variancePercentage !== null && record.variancePercentage !== undefined
                      ? `${record.variancePercentage > 0 ? "+" : ""}${record.variancePercentage.toFixed(1)}%`
                      : "N/A"}
                  </span>
                </TD>
                <TD right><span className="font-semibold">{record.varianceValue > 0 ? "+" : ""}₱{record.varianceValue.toFixed(2)}</span></TD>
                <TD muted>{classificationLabel(record.classification)}</TD>
                <TD center><VarianceStatus status={displayStatus(record)} /></TD>
                <TD right>
                  {record.anomalyId ? (
                    <button
                      type="button"
                      onClick={() => navigate(`/shrinkage?reportId=${record.anomalyId}`)}
                      className="inline-flex items-center px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-opacity hover:opacity-85"
                      style={{
                        color: "var(--app-primary)",
                        background: "var(--app-primary-subtle)",
                      }}
                    >
                      {record.anomalyStatus === "DETECTED" && !owner ? "Investigate" : "View"}
                    </button>
                  ) : (
                    <span className="text-xs text-[var(--app-text-faint)]">—</span>
                  )}
                </TD>
              </TR>
            ))
          )}
        </tbody>
      </TableWrapper>
      <Pagination total={filtered.length} page={1} perPage={Math.max(filtered.length, 1)} />
    </TableCard>
  </div>;
}

function VarianceStatus({ status }: { status: DisplayStatus }) {
  const map: Record<DisplayStatus, { label: string; color: string; background: string }> = {
    MATCHED: { label: "Matched", color: "var(--app-success)", background: "var(--app-success-bg)" },
    SHORTAGE: { label: "Shortage", color: "var(--app-danger)", background: "var(--app-danger-bg)" },
    SHORTAGE_WITHIN_TOLERANCE: { label: "Shortage (Tol.)", color: "var(--app-warning)", background: "var(--app-warning-bg)" },
    EXCESS: { label: "Excess", color: "var(--app-info)", background: "var(--app-info-bg)" },
    EXCESS_WITHIN_TOLERANCE: { label: "Excess (Tol.)", color: "var(--app-info)", background: "var(--app-info-bg)" },
    DETECTED: { label: "Needs Investigation", color: "var(--app-danger)", background: "var(--app-danger-bg)" },
    VERIFIED: { label: "Verified Shrinkage", color: "var(--app-primary)", background: "var(--app-primary-subtle)" },
    PENDING_REVIEW: { label: "Pending Owner Review", color: "var(--app-warning)", background: "var(--app-warning-bg)" },
    REVIEWED: { label: "Reviewed", color: "var(--app-success)", background: "var(--app-success-bg)" },
  };
  const visual = map[status] ?? { label: status, color: "var(--app-text-muted)", background: "var(--app-surface-muted)" };
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap border"
      style={{
        color: visual.color,
        background: visual.background,
        borderColor: `color-mix(in srgb, ${visual.color} 24%, transparent)`,
      }}
    >
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: visual.color }} />
      <span>{visual.label}</span>
    </span>
  );
}
