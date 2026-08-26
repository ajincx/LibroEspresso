import { useEffect, useMemo, useState } from "react";
import { CheckCircle, Eye, RefreshCw, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";
import { useSearchParams } from "react-router";
import { useAuth } from "../../contexts/AuthContext";
import { inventoryWorkflowService } from "../../services/inventoryWorkflow.service";
import { masterDataService } from "../../services/masterData.service";
import type { ShrinkageReport } from "../../types/inventoryWorkflow";
import type { Branch } from "../../types/masterData";

const classificationLabel = (value: string) => value.split("_").map((word) => word[0] + word.slice(1).toLowerCase()).join(" ");
const formatDate = (value: string | null) => value ? new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "—";

export function ShrinkageWorkflowPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const owner = user?.role === "OWNER";
  const [reports, setReports] = useState<ShrinkageReport[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState("");
  const [status, setStatus] = useState(owner ? "PENDING_REVIEW" : "");
  const [classification, setClassification] = useState("");
  const [selected, setSelected] = useState<ShrinkageReport | null>(null);
  const [confirmReview, setConfirmReview] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reviewing, setReviewing] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true); setError("");
    try { setReports(await inventoryWorkflowService.reports({ branchId: branchId || undefined, status: status || undefined, classification: classification || undefined })); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to load shrinkage reports"); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [branchId, status, classification]);
  useEffect(() => { if (owner) void masterDataService.branches().then(setBranches).catch(() => setBranches([])); }, [owner]);
  useEffect(() => {
    const reportId = searchParams.get("reportId");
    if (!reportId || !reports.length) return;
    const report = reports.find((item) => item.id === reportId);
    if (report) { setSelected(report); setSearchParams({}, { replace: true }); }
  }, [reports, searchParams, setSearchParams]);

  const metrics = useMemo(() => ({
    total: reports.reduce((sum, report) => sum + Math.abs(report.varianceValue), 0),
    pending: reports.filter((report) => report.status === "PENDING_REVIEW").length,
    spoilage: reports.filter((report) => report.classification === "SPOILAGE").length,
    wastage: reports.filter((report) => report.classification === "WASTAGE").length,
    pilferage: reports.filter((report) => report.classification === "PILFERAGE").length,
    countError: reports.filter((report) => report.classification === "COUNT_ERROR").length,
  }), [reports]);

  const review = async () => {
    if (!selected) return;
    setReviewing(true);
    try {
      const reviewed = await inventoryWorkflowService.reviewReport(selected.id);
      setReports((current) => status === "PENDING_REVIEW" ? current.filter((report) => report.id !== reviewed.id) : current.map((report) => report.id === reviewed.id ? reviewed : report));
      setSelected(reviewed); setConfirmReview(false); toast.success("Shrinkage report marked as reviewed");
    } catch (reason) { toast.error(reason instanceof Error ? reason.message : "Unable to review report"); }
    finally { setReviewing(false); }
  };

  return <div className="p-6 space-y-5">
    <div className="flex items-start justify-between gap-4"><div><h1 className="text-2xl font-bold">Shrinkage Monitoring</h1><p className="text-sm mt-1" style={{ color: "var(--app-text-muted)" }}>{owner ? "Review shrinkage reports submitted by all branches." : "Track shrinkage reports submitted for your assigned branch."}</p></div><button onClick={() => void load()} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-semibold" style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }}><RefreshCw size={14} />Refresh</button></div>
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">{[
      ["Total Shrinkage", `₱${metrics.total.toLocaleString("en-PH", { maximumFractionDigits: 2 })}`], ["Pending Review", String(metrics.pending)], ["Spoilage", String(metrics.spoilage)], ["Wastage", String(metrics.wastage)], ["Pilferage", String(metrics.pilferage)], ["Count Errors", String(metrics.countError)],
    ].map(([label, value], index) => <div key={label} className="p-4 rounded-2xl border" style={{ borderColor: index === 1 && metrics.pending ? "var(--app-warning)" : "var(--app-border)", background: "var(--app-surface)" }}><div className="text-[10px] uppercase tracking-wider" style={{ color: "var(--app-text-faint)" }}>{label}</div><div className="text-xl font-bold mt-1.5" style={{ color: index === 0 ? "var(--app-primary)" : "var(--app-text)" }}>{value}</div></div>)}</div>
    <div className="rounded-2xl border overflow-hidden" style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }}>
      <div className="p-4 flex items-center gap-2 flex-wrap border-b" style={{ borderColor: "var(--app-border)" }}>
        <div className="flex items-center gap-1 p-1 rounded-xl border" style={{ borderColor: "var(--app-border)", background: "var(--app-bg)" }}>
          {[{ value: "", label: "All Reports" }, { value: "PENDING_REVIEW", label: "Pending Review" }, { value: "REVIEWED", label: "Reviewed" }].map((option) => <button key={option.value || "all"} onClick={() => setStatus(option.value)} className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors" style={{ background: status === option.value ? "var(--app-primary)" : "transparent", color: status === option.value ? "#fff" : "var(--app-text-muted)" }}>{option.label}</button>)}
        </div>
        {owner && <select value={branchId} onChange={(event) => setBranchId(event.target.value)} className="px-3 py-2 rounded-xl border text-sm" style={{ borderColor: "var(--app-border)", background: "var(--app-surface-elevated)" }}><option value="">All Branches</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select>}
        <select value={classification} onChange={(event) => setClassification(event.target.value)} className="px-3 py-2 rounded-xl border text-sm" style={{ borderColor: "var(--app-border)", background: "var(--app-surface-elevated)" }}><option value="">All Classifications</option><option value="SPOILAGE">Spoilage</option><option value="WASTAGE">Wastage</option><option value="PILFERAGE">Pilferage</option><option value="COUNT_ERROR">Count Error</option></select>
      </div>
      {loading ? <div className="p-14 text-center text-sm" style={{ color: "var(--app-text-muted)" }}>Loading shrinkage reports…</div> : error ? <div className="p-14 text-center text-sm" style={{ color: "var(--app-danger)" }}>{error}</div> : reports.length === 0 ? <div className="p-14 text-center"><ShieldCheck className="mx-auto mb-3" style={{ color: "var(--app-text-faint)" }} /><div className="font-semibold">No shrinkage reports found</div><p className="text-xs mt-1" style={{ color: "var(--app-text-muted)" }}>Reports appear after a Manager submits an explanation for an inventory variance.</p></div> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead style={{ background: "var(--app-bg)" }}><tr>{["Report No.", "Date", ...(owner ? ["Branch"] : []), "Inventory Item", "Classification", "Variance", "Status", "Submitted At", "Reviewed At", ""].map((heading) => <th key={heading} className="px-4 py-3 text-left text-xs whitespace-nowrap" style={{ color: "var(--app-text-muted)" }}>{heading}</th>)}</tr></thead><tbody>{reports.map((report) => <tr key={report.id} className="border-t" style={{ borderColor: "var(--app-border)" }}><td className="px-4 py-3 font-mono text-xs" style={{ color: "var(--app-primary)" }}>{report.reportNo}</td><td className="px-4 py-3 whitespace-nowrap">{new Date(report.submittedAt).toLocaleDateString("en-PH")}</td>{owner && <td className="px-4 py-3">{report.branchName}</td>}<td className="px-4 py-3"><div className="font-semibold">{report.inventoryItemName}</div><div className="text-[10px] font-mono" style={{ color: "var(--app-text-faint)" }}>{report.sku}</div></td><td className="px-4 py-3">{classificationLabel(report.classification)}</td><td className="px-4 py-3 font-bold" style={{ color: report.varianceQuantity < 0 ? "var(--app-danger)" : "var(--app-success)" }}>{report.varianceQuantity > 0 ? "+" : ""}{report.varianceQuantity}{report.unit}</td><td className="px-4 py-3"><Status status={report.status} /></td><td className="px-4 py-3 whitespace-nowrap">{formatDate(report.submittedAt)}</td><td className="px-4 py-3 whitespace-nowrap">{formatDate(report.reviewedAt)}</td><td className="px-4 py-3"><button onClick={() => setSelected(report)} className="p-2 rounded-lg" title="View report"><Eye size={15} /></button></td></tr>)}</tbody></table></div>}
    </div>
    {selected && <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,.5)" }}><div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 rounded-2xl border" style={{ background: "var(--app-surface)", borderColor: "var(--app-border)" }}><div className="flex justify-between mb-5"><div><h2 className="text-lg font-bold">{selected.reportNo}</h2><p className="text-xs mt-1" style={{ color: "var(--app-text-muted)" }}>{selected.branchName} · {selected.inventoryItemName}</p></div><button onClick={() => setSelected(null)}><X size={18} /></button></div><div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">{[["Expected",`${selected.expectedQuantity}${selected.unit}`],["Actual",`${selected.actualQuantity}${selected.unit}`],["Variance",`${selected.varianceQuantity}${selected.unit}`],["Value",`₱${Math.abs(selected.varianceValue).toFixed(2)}`]].map(([label,value]) => <div key={label} className="p-3 rounded-xl" style={{ background: "var(--app-bg)" }}><div className="text-[10px] uppercase" style={{ color: "var(--app-text-faint)" }}>{label}</div><div className="font-bold mt-1">{value}</div></div>)}</div><Detail label="Classification" value={classificationLabel(selected.classification)} /><Detail label="Manager" value={selected.managerName} /><Detail label="Menu reference" value={selected.menuItemName ?? "Not specified"} /><Detail label="Explanation" value={selected.explanation} /><Detail label="Supporting notes" value={selected.supportingNotes || "None"} />{selected.status === "REVIEWED" ? <div className="mt-5 p-4 rounded-xl flex gap-3" style={{ background: "var(--app-success-bg)" }}><CheckCircle style={{ color: "var(--app-success)" }} /><div><div className="font-semibold">Reviewed</div><div className="text-xs mt-1" style={{ color: "var(--app-text-muted)" }}>Reviewed by {selected.reviewedByName} · {formatDate(selected.reviewedAt)}</div></div></div> : owner ? <button onClick={() => setConfirmReview(true)} className="w-full mt-5 py-2.5 rounded-xl text-white font-semibold" style={{ background: "var(--app-primary)" }}>Mark as Reviewed</button> : <div className="mt-5"><Status status={selected.status} /></div>}</div></div>}
    {confirmReview && selected && <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,.55)" }}><div className="w-full max-w-md p-6 rounded-2xl border" style={{ background: "var(--app-surface)", borderColor: "var(--app-border)" }}><h2 className="text-lg font-bold">Mark this shrinkage report as reviewed?</h2><p className="text-sm mt-2" style={{ color: "var(--app-text-muted)" }}>This will notify the Branch Manager and record your name and the current review time.</p><div className="flex gap-3 mt-6"><button onClick={() => setConfirmReview(false)} className="flex-1 py-2.5 rounded-xl border" style={{ borderColor: "var(--app-border)" }}>Cancel</button><button disabled={reviewing} onClick={() => void review()} className="flex-1 py-2.5 rounded-xl text-white font-semibold disabled:opacity-50" style={{ background: "var(--app-primary)" }}>{reviewing ? "Reviewing…" : "Mark as Reviewed"}</button></div></div></div>}
  </div>;
}

function Status({ status }: { status: ShrinkageReport["status"] }) { const reviewed = status === "REVIEWED"; return <span className="inline-flex px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide" style={{ color: reviewed ? "var(--app-success)" : "var(--app-warning)", background: reviewed ? "var(--app-success-bg)" : "var(--app-warning-bg)" }}>{reviewed ? "Reviewed" : "Pending Review"}</span>; }
function Detail({ label, value }: { label: string; value: string }) { return <div className="py-3 border-b" style={{ borderColor: "var(--app-border)" }}><div className="text-[10px] uppercase tracking-wide" style={{ color: "var(--app-text-faint)" }}>{label}</div><div className="text-sm mt-1 whitespace-pre-wrap">{value}</div></div>; }
