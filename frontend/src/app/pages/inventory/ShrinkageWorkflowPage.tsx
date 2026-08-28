import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle, Eye, RefreshCw, SearchCheck, ShieldCheck, X } from "lucide-react";
import { useSearchParams } from "react-router";
import { toast } from "sonner";
import { useAuth } from "../../contexts/AuthContext";
import { inventoryWorkflowService } from "../../services/inventoryWorkflow.service";
import { masterDataService } from "../../services/masterData.service";
import type { ShrinkageClassification, ShrinkageReport, ShrinkageStatus } from "../../types/inventoryWorkflow";
import type { Branch, MenuItem } from "../../types/masterData";

const classifications: { value: ShrinkageClassification; label: string; definition: string }[] = [
  { value: "SPOILAGE", label: "Spoilage", definition: "Expired, contaminated, damaged, or unusable inventory." },
  { value: "WASTAGE", label: "Wastage", definition: "Loss caused by preparation, overproduction, spillage, or handling." },
  { value: "PILFERAGE", label: "Suspected Pilferage", definition: "Possible unauthorized or unaccounted removal of stock." },
  { value: "COUNT_ERROR", label: "Count Error", definition: "A verified physical-count or encoding error." },
];

const classificationLabel = (value: ShrinkageClassification | null) => value
  ? value.split("_").map((word) => word[0] + word.slice(1).toLowerCase()).join(" ")
  : "Awaiting Investigation";
const formatDate = (value: string | null) => value ? new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "—";

export function ShrinkageWorkflowPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const owner = user?.role === "OWNER";
  const [reports, setReports] = useState<ShrinkageReport[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [branchId, setBranchId] = useState("");
  const [status, setStatus] = useState<ShrinkageStatus | "">(owner ? "PENDING_REVIEW" : "DETECTED");
  const [classification, setClassification] = useState<ShrinkageClassification | "">("");
  const [selected, setSelected] = useState<ShrinkageReport | null>(null);
  const [confirmReview, setConfirmReview] = useState(false);
  const [investigation, setInvestigation] = useState({ classification: "" as ShrinkageClassification | "", menuItemId: "", explanation: "", supportingNotes: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true); setError("");
    try { setReports(await inventoryWorkflowService.reports({ branchId: branchId || undefined, status: status || undefined, classification: classification || undefined })); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to load system-detected anomalies"); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [branchId, status, classification]);
  useEffect(() => {
    if (owner) void masterDataService.branches().then(setBranches).catch(() => setBranches([]));
    else void masterDataService.menuItems().then((items) => setMenu(items.filter((item) => item.status === "ACTIVE"))).catch(() => setMenu([]));
  }, [owner]);
  useEffect(() => {
    const reportId = searchParams.get("reportId");
    if (!reportId || !reports.length) return;
    const report = reports.find((item) => item.id === reportId);
    if (report) { openReport(report); setSearchParams({}, { replace: true }); }
  }, [reports, searchParams, setSearchParams]);

  const openReport = (report: ShrinkageReport) => {
    setSelected(report);
    setInvestigation({ classification: report.classification ?? "", menuItemId: report.menuItemId ?? "", explanation: report.explanation ?? "", supportingNotes: report.supportingNotes ?? "" });
  };

  const metrics = useMemo(() => ({
    detectedValue: reports.reduce((sum, report) => sum + Math.abs(report.varianceValue), 0),
    detected: reports.filter((report) => report.status === "DETECTED").length,
    pending: reports.filter((report) => report.status === "PENDING_REVIEW").length,
    spoilage: reports.filter((report) => report.classification === "SPOILAGE").length,
    wastage: reports.filter((report) => report.classification === "WASTAGE").length,
    pilferage: reports.filter((report) => report.classification === "PILFERAGE").length,
  }), [reports]);

  const submitInvestigation = async () => {
    if (!selected || !investigation.classification || investigation.explanation.trim().length < 10) return;
    setSaving(true);
    try {
      const updated = await inventoryWorkflowService.submitInvestigation(selected.id, {
        classification: investigation.classification,
        menuItemId: investigation.menuItemId || undefined,
        explanation: investigation.explanation.trim(),
        supportingNotes: investigation.supportingNotes.trim() || undefined,
      });
      setReports((current) => status === "DETECTED" ? current.filter((report) => report.id !== updated.id) : current.map((report) => report.id === updated.id ? updated : report));
      setSelected(updated);
      toast.success("Investigation findings submitted for Owner review");
    } catch (reason) { toast.error(reason instanceof Error ? reason.message : "Unable to submit investigation findings"); }
    finally { setSaving(false); }
  };

  const review = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const reviewed = await inventoryWorkflowService.reviewReport(selected.id);
      setReports((current) => status === "PENDING_REVIEW" ? current.filter((report) => report.id !== reviewed.id) : current.map((report) => report.id === reviewed.id ? reviewed : report));
      setSelected(reviewed); setConfirmReview(false); toast.success("Investigation marked as reviewed");
    } catch (reason) { toast.error(reason instanceof Error ? reason.message : "Unable to review investigation"); }
    finally { setSaving(false); }
  };

  return <div className="p-6 space-y-5">
    <div className="flex items-start justify-between gap-4"><div><h1 className="text-2xl font-bold">Classification &amp; Investigation</h1><p className="text-sm mt-1" style={{ color: "var(--app-text-muted)" }}>{owner ? "Review Manager findings for system-detected inventory shortages across branches." : "Investigate shortages automatically detected from expected stock and physical counts."}</p></div><button onClick={() => void load()} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-semibold" style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }}><RefreshCw size={14} />Refresh</button></div>

    <div className="flex gap-3 p-4 rounded-2xl border" style={{ borderColor: "var(--app-border)", background: "var(--app-primary-faint)" }}><SearchCheck size={20} style={{ color: "var(--app-primary)" }} /><div><div className="text-sm font-semibold">System-generated workflow</div><p className="text-xs mt-1" style={{ color: "var(--app-text-muted)" }}>POS sales and standard recipes calculate expected usage. Physical counts create variance automatically. Only negative discrepancies become investigation cases; Managers document findings but cannot edit the calculated quantities.</p></div></div>

    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">{[
      ["Detected Value", `₱${metrics.detectedValue.toLocaleString("en-PH", { maximumFractionDigits: 2 })}`], ["Needs Investigation", String(metrics.detected)], ["Pending Owner Review", String(metrics.pending)], ["Spoilage", String(metrics.spoilage)], ["Wastage", String(metrics.wastage)], ["Suspected Pilferage", String(metrics.pilferage)],
    ].map(([label, value], index) => <div key={label} className="p-4 rounded-2xl border" style={{ borderColor: (index === 1 && metrics.detected) || (index === 2 && metrics.pending) ? "var(--app-warning)" : "var(--app-border)", background: "var(--app-surface)" }}><div className="text-[10px] uppercase tracking-wider" style={{ color: "var(--app-text-faint)" }}>{label}</div><div className="text-xl font-bold mt-1.5" style={{ color: index === 0 ? "var(--app-primary)" : "var(--app-text)" }}>{value}</div></div>)}</div>

    <div className="rounded-2xl border overflow-hidden" style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }}>
      <div className="p-4 flex items-center gap-2 flex-wrap border-b" style={{ borderColor: "var(--app-border)" }}>
        <div className="flex items-center gap-1 p-1 rounded-xl border" style={{ borderColor: "var(--app-border)", background: "var(--app-bg)" }}>{[
          { value: "", label: "All" }, { value: "DETECTED", label: "Needs Investigation" }, { value: "PENDING_REVIEW", label: "Pending Review" }, { value: "REVIEWED", label: "Reviewed" },
        ].map((option) => <button key={option.value || "all"} onClick={() => setStatus(option.value as ShrinkageStatus | "")} className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ background: status === option.value ? "var(--app-primary)" : "transparent", color: status === option.value ? "#fff" : "var(--app-text-muted)" }}>{option.label}</button>)}</div>
        {owner && <select value={branchId} onChange={(event) => setBranchId(event.target.value)} className="px-3 py-2 rounded-xl border text-sm" style={{ borderColor: "var(--app-border)", background: "var(--app-surface-elevated)" }}><option value="">All Branches</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select>}
        <select value={classification} onChange={(event) => setClassification(event.target.value as ShrinkageClassification | "")} className="px-3 py-2 rounded-xl border text-sm" style={{ borderColor: "var(--app-border)", background: "var(--app-surface-elevated)" }}><option value="">All Classifications</option>{classifications.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
      </div>
      {loading ? <div className="p-14 text-center text-sm" style={{ color: "var(--app-text-muted)" }}>Loading system-detected anomalies…</div> : error ? <div className="p-14 text-center text-sm" style={{ color: "var(--app-danger)" }}>{error}</div> : reports.length === 0 ? <div className="p-14 text-center"><ShieldCheck className="mx-auto mb-3" style={{ color: "var(--app-text-faint)" }} /><div className="font-semibold">No matching anomalies found</div><p className="text-xs mt-1" style={{ color: "var(--app-text-muted)" }}>Negative variances appear automatically after a Manager submits a physical inventory count.</p></div> : <div className="overflow-x-auto"><table className="data-table w-full text-sm"><thead style={{ background: "var(--app-bg)" }}><tr>{["Case No.", "Detected", ...(owner ? ["Branch"] : []), "Inventory Item", "Classification", "System Variance", "Status", "Investigated", ""].map((heading) => <th key={heading} className="px-4 py-3 text-left text-xs whitespace-nowrap" style={{ color: "var(--app-text-muted)" }}>{heading}</th>)}</tr></thead><tbody>{reports.map((report) => <tr key={report.id} className="border-t" style={{ borderColor: "var(--app-border)" }}><td className="px-4 py-3 font-mono text-xs" style={{ color: "var(--app-primary)" }}>{report.reportNo}</td><td className="px-4 py-3 whitespace-nowrap">{formatDate(report.detectedAt)}</td>{owner && <td className="px-4 py-3">{report.branchName}</td>}<td className="px-4 py-3"><div className="font-semibold">{report.inventoryItemName}</div><div className="text-[10px] font-mono" style={{ color: "var(--app-text-faint)" }}>{report.sku}</div></td><td className="px-4 py-3">{classificationLabel(report.classification)}</td><td className="px-4 py-3 font-bold" style={{ color: "var(--app-danger)" }}>{report.varianceQuantity.toFixed(2)}{report.unit}</td><td className="px-4 py-3"><Status status={report.status} /></td><td className="px-4 py-3 whitespace-nowrap">{formatDate(report.investigatedAt)}</td><td className="px-4 py-3"><button onClick={() => openReport(report)} className="p-2 rounded-lg" title={report.status === "DETECTED" && !owner ? "Investigate anomaly" : "View case"}><Eye size={15} /></button></td></tr>)}</tbody></table></div>}
    </div>

    {selected && <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,.5)" }}><div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 rounded-2xl border" style={{ background: "var(--app-surface)", borderColor: "var(--app-border)" }}>
      <div className="flex justify-between mb-5"><div><h2 className="text-lg font-bold">{selected.reportNo}</h2><p className="text-xs mt-1" style={{ color: "var(--app-text-muted)" }}>{selected.branchName} · {selected.inventoryItemName}</p></div><button onClick={() => setSelected(null)}><X size={18} /></button></div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">{[["Expected",`${selected.expectedQuantity.toFixed(2)}${selected.unit}`],["Actual",`${selected.actualQuantity.toFixed(2)}${selected.unit}`],["Variance",`${selected.varianceQuantity.toFixed(2)}${selected.unit}`],["Value",`₱${Math.abs(selected.varianceValue).toFixed(2)}`]].map(([label,value]) => <div key={label} className="p-3 rounded-xl" style={{ background: "var(--app-bg)" }}><div className="text-[10px] uppercase" style={{ color: "var(--app-text-faint)" }}>{label}</div><div className="font-bold mt-1">{value}</div></div>)}</div>
      <div className="p-3 rounded-xl mb-4 flex gap-3" style={{ background: "var(--app-warning-bg)" }}><AlertTriangle size={18} style={{ color: "var(--app-warning)" }} /><p className="text-xs" style={{ color: "var(--app-text-muted)" }}>These quantities were calculated from connected inventory records and cannot be edited in the investigation.</p></div>

      {selected.status === "DETECTED" && !owner ? <div>
        <h3 className="font-semibold mb-1">Manager Investigation Findings</h3><p className="text-xs mb-4" style={{ color: "var(--app-text-muted)" }}>Investigate with branch personnel, then document the verified or suspected cause.</p>
        <div className="grid grid-cols-2 gap-2 mb-4">{classifications.map((option) => <button key={option.value} onClick={() => setInvestigation((current) => ({ ...current, classification: option.value }))} className="p-3 rounded-xl border text-left" style={{ borderColor: investigation.classification === option.value ? "var(--app-primary)" : "var(--app-border)", background: investigation.classification === option.value ? "var(--app-primary-subtle)" : "var(--app-surface)" }}><div className="text-sm font-semibold">{option.label}</div><div className="text-[11px] mt-1 leading-relaxed" style={{ color: "var(--app-text-muted)" }}>{option.definition}</div></button>)}</div>
        <label className="block text-sm mb-3">Related menu product (optional)<select value={investigation.menuItemId} onChange={(event) => setInvestigation((current) => ({ ...current, menuItemId: event.target.value }))} className="mt-1.5 w-full px-3 py-2.5 rounded-xl border" style={{ borderColor: "var(--app-border)", background: "var(--app-surface-elevated)" }}><option value="">No specific menu product</option>{menu.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label>
        <label className="block text-sm mb-3">Investigation explanation<textarea value={investigation.explanation} onChange={(event) => setInvestigation((current) => ({ ...current, explanation: event.target.value }))} rows={4} placeholder="Document what was found during the investigation (minimum 10 characters)…" className="mt-1.5 w-full px-3 py-2.5 rounded-xl border resize-none" style={{ borderColor: "var(--app-border)", background: "var(--app-surface-elevated)" }} /></label>
        <label className="block text-sm">Corrective action / supporting notes (optional)<textarea value={investigation.supportingNotes} onChange={(event) => setInvestigation((current) => ({ ...current, supportingNotes: event.target.value }))} rows={2} className="mt-1.5 w-full px-3 py-2.5 rounded-xl border resize-none" style={{ borderColor: "var(--app-border)", background: "var(--app-surface-elevated)" }} /></label>
        <button disabled={saving || !investigation.classification || investigation.explanation.trim().length < 10} onClick={() => void submitInvestigation()} className="w-full mt-5 py-2.5 rounded-xl text-white font-semibold disabled:opacity-40" style={{ background: "var(--app-primary)" }}>{saving ? "Submitting…" : "Submit Findings for Owner Review"}</button>
      </div> : <div><Detail label="Classification" value={classificationLabel(selected.classification)} /><Detail label="Investigated by" value={selected.managerName} /><Detail label="Menu reference" value={selected.menuItemName ?? "Not specified"} /><Detail label="Investigation explanation" value={selected.explanation ?? "Awaiting Manager investigation"} /><Detail label="Corrective action / supporting notes" value={selected.supportingNotes || "None"} />
        {selected.status === "REVIEWED" ? <div className="mt-5 p-4 rounded-xl flex gap-3" style={{ background: "var(--app-success-bg)" }}><CheckCircle style={{ color: "var(--app-success)" }} /><div><div className="font-semibold">Reviewed</div><div className="text-xs mt-1" style={{ color: "var(--app-text-muted)" }}>Reviewed by {selected.reviewedByName} · {formatDate(selected.reviewedAt)}</div></div></div> : selected.status === "PENDING_REVIEW" && owner ? <button onClick={() => setConfirmReview(true)} className="w-full mt-5 py-2.5 rounded-xl text-white font-semibold" style={{ background: "var(--app-primary)" }}>Mark Findings as Reviewed</button> : <div className="mt-5"><Status status={selected.status} /></div>}
      </div>}
    </div></div>}

    {confirmReview && selected && <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,.55)" }}><div className="w-full max-w-md p-6 rounded-2xl border" style={{ background: "var(--app-surface)", borderColor: "var(--app-border)" }}><h2 className="text-lg font-bold">Mark these investigation findings as reviewed?</h2><p className="text-sm mt-2" style={{ color: "var(--app-text-muted)" }}>The Branch Manager will be notified and the Owner review will be recorded.</p><div className="flex gap-3 mt-6"><button onClick={() => setConfirmReview(false)} className="flex-1 py-2.5 rounded-xl border" style={{ borderColor: "var(--app-border)" }}>Cancel</button><button disabled={saving} onClick={() => void review()} className="flex-1 py-2.5 rounded-xl text-white font-semibold disabled:opacity-50" style={{ background: "var(--app-primary)" }}>{saving ? "Reviewing…" : "Mark as Reviewed"}</button></div></div></div>}
  </div>;
}

function Status({ status }: { status: ShrinkageStatus }) {
  const visual = status === "REVIEWED"
    ? { label: "Reviewed", color: "var(--app-success)", background: "var(--app-success-bg)" }
    : status === "PENDING_REVIEW"
      ? { label: "Pending Owner Review", color: "var(--app-warning)", background: "var(--app-warning-bg)" }
      : { label: "Needs Investigation", color: "var(--app-danger)", background: "var(--app-danger-bg)" };
  return <span className="inline-flex px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide" style={{ color: visual.color, background: visual.background }}>{visual.label}</span>;
}

function Detail({ label, value }: { label: string; value: string }) { return <div className="py-3 border-b" style={{ borderColor: "var(--app-border)" }}><div className="text-[10px] uppercase tracking-wide" style={{ color: "var(--app-text-faint)" }}>{label}</div><div className="text-sm mt-1 whitespace-pre-wrap">{value}</div></div>; }
