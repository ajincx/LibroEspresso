import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle, Eye, RefreshCw, SearchCheck, ShieldCheck, X } from "lucide-react";
import { useSearchParams } from "react-router";
import { toast } from "sonner";
import { useAuth } from "../../contexts/AuthContext";
import { inventoryWorkflowService } from "../../services/inventoryWorkflow.service";
import { operationsService } from "../../services/operations.service";
import { masterDataService } from "../../services/masterData.service";
import type { EvidenceBasis, ShrinkageClassification, ShrinkageEvidence, ShrinkageReport, ShrinkageStatus } from "../../types/inventoryWorkflow";
import type { Branch, InventoryItem, MenuItem } from "../../types/masterData";
import type { IncidentType } from "../../types/operations";
import { ShrinkageIncidentReports } from "./ShrinkageIncidentReports";
import { CalendarDateField, Select, TableCard, TableWrapper, THead, TR, TD, TableEmptyRow, TableLoadingRow, Pagination } from "../../components/ModuleUi";
import { formatAppDate } from "../../utils/appPreferences";
import { classificationLabel, evidenceBasisOptions, incidentTypeLabel, incidentTypeOptions, managerClassificationOptions } from "../../utils/shrinkageTaxonomy";
const formatDate = (value: string | null) => value ? formatAppDate(value, true) : "—";

export function ShrinkagePage({ scopeBranchId = "ALL" }: { scopeBranchId?: string }) {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const owner = user?.role === "OWNER";
  const [reports, setReports] = useState<ShrinkageReport[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [branchId, setBranchId] = useState(scopeBranchId === "ALL" ? "" : scopeBranchId);
  const [status, setStatus] = useState<ShrinkageStatus | "">("");
  const [classification, setClassification] = useState<ShrinkageClassification | "">("");
  const [inventoryItemId, setInventoryItemId] = useState("");
  const [incidentType, setIncidentType] = useState<IncidentType | "">("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [selected, setSelected] = useState<ShrinkageReport | null>(null);
  const [confirmReview, setConfirmReview] = useState(false);
  const [investigation, setInvestigation] = useState({ classification: "" as ShrinkageClassification | "", menuItemId: "", explanation: "", supportingNotes: "", evidenceReviewConfirmed: false, evidenceBasis: [] as EvidenceBasis[] });
  const [evidence, setEvidence] = useState<ShrinkageEvidence | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true); setError("");
    try { setReports(await inventoryWorkflowService.reports({ branchId: branchId || undefined, status: status || undefined, classification: classification || undefined, inventoryItemId: inventoryItemId || undefined, incidentType: incidentType || undefined, startDate: startDate || undefined, endDate: endDate || undefined })); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to load system-detected anomalies"); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [branchId, status, classification, inventoryItemId, incidentType, startDate, endDate]);
  useEffect(() => { if (owner) setBranchId(scopeBranchId === "ALL" ? "" : scopeBranchId); }, [owner, scopeBranchId]);
  useEffect(() => {
    void masterDataService.inventoryItems().then(setInventoryItems).catch(() => setInventoryItems([]));
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
    setInvestigation({ classification: report.classification ?? "", menuItemId: report.menuItemId ?? "", explanation: report.explanation ?? "", supportingNotes: report.supportingNotes ?? "", evidenceReviewConfirmed: report.evidenceReviewConfirmed ?? false, evidenceBasis: report.evidenceBasis ?? [] });
    setEvidence(null);
    void inventoryWorkflowService.evidence(report.id).then(setEvidence).catch(() => setEvidence(null));
  };

  const metrics = useMemo(() => ({
    detectedValue: reports.reduce((sum, report) => sum + Math.max(report.varianceValue, 0), 0),
    detected: reports.filter((report) => report.status === "DETECTED").length,
    pending: reports.filter((report) => report.status === "PENDING_REVIEW" || report.status === "VERIFIED").length,
    spoilage: reports.filter((report) => report.classification === "SPOILAGE").length,
    wastage: reports.filter((report) => report.classification === "WASTAGE").length,
    pilferage: reports.filter((report) => report.classification === "PILFERAGE").length,
  }), [reports]);

  const submitInvestigation = async () => {
    if (!selected || !investigation.classification || investigation.explanation.trim().length < 10) return;
    if (investigation.classification === "PILFERAGE" && (investigation.explanation.trim().length < 20 || !investigation.evidenceReviewConfirmed || investigation.evidenceBasis.length === 0)) {
      return toast.error("Verified Pilferage requires detailed notes, evidence basis, and explicit confirmation.");
    }
    setSaving(true);
    try {
      const updated = await inventoryWorkflowService.submitInvestigation(selected.id, {
        classification: investigation.classification,
        menuItemId: investigation.menuItemId || undefined,
        explanation: investigation.explanation.trim(),
        supportingNotes: investigation.supportingNotes.trim() || undefined,
        evidenceReviewConfirmed: investigation.evidenceReviewConfirmed,
        evidenceBasis: investigation.evidenceBasis,
      });
      setReports((current) => status === "DETECTED" ? current.filter((report) => report.id !== updated.id) : current.map((report) => report.id === updated.id ? updated : report));
      setSelected(updated);
      toast.success("Investigation findings verified and submitted");
    } catch (reason) { toast.error(reason instanceof Error ? reason.message : "Unable to submit investigation findings"); }
    finally { setSaving(false); }
  };

  const review = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const reviewed = await inventoryWorkflowService.reviewReport(selected.id);
      setReports((current) => current.map((report) => report.id === reviewed.id ? reviewed : report));
      setSelected(reviewed); setConfirmReview(false); toast.success("Investigation marked as reviewed");
    } catch (reason) { toast.error(reason instanceof Error ? reason.message : "Unable to review investigation"); }
    finally { setSaving(false); }
  };

  const linkIncident = async (incidentId: string) => {
    if (!selected) return;
    setSaving(true);
    try {
      await operationsService.linkIncident(incidentId, selected.id);
      setEvidence(await inventoryWorkflowService.evidence(selected.id));
      toast.success("Incident linked as supporting evidence");
    } catch (reason) { toast.error(reason instanceof Error ? reason.message : "Unable to link incident evidence"); }
    finally { setSaving(false); }
  };

  return <div className="p-6 space-y-5">
    <div className="flex items-start justify-between gap-4"><div><h1 className="text-2xl font-bold">Classification &amp; Investigation</h1><p className="text-sm mt-1" style={{ color: "var(--app-text-muted)" }}>{owner ? "Review Manager findings for system-detected inventory shortages across branches." : "Investigate shortages automatically detected from expected stock and physical counts."}</p></div><button onClick={() => void load()} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-semibold" style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }}><RefreshCw size={14} />Refresh</button></div>

    <div className="flex gap-3 p-4 rounded-2xl border" style={{ borderColor: "var(--app-border)", background: "var(--app-primary-faint)" }}><SearchCheck size={20} style={{ color: "var(--app-primary)" }} /><div><div className="text-sm font-semibold">System-generated workflow</div><p className="text-xs mt-1" style={{ color: "var(--app-text-muted)" }}>POS sales and standard recipes calculate expected usage. Physical counts create variance automatically. Positive shortages above tolerance become investigation cases; Managers document findings but cannot edit the calculated quantities.</p></div></div>

    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">{[
      ["Detected Value", `₱${metrics.detectedValue.toLocaleString("en-PH", { maximumFractionDigits: 2 })}`], ["Needs Investigation", String(metrics.detected)], ["Pending Owner Review", String(metrics.pending)], ["Spoilage", String(metrics.spoilage)], ["Wastage", String(metrics.wastage)], ["Verified Pilferage", String(metrics.pilferage)],
    ].map(([label, value], index) => <div key={label} className="p-4 rounded-2xl border" style={{ borderColor: (index === 1 && metrics.detected) || (index === 2 && metrics.pending) ? "var(--app-warning)" : "var(--app-border)", background: "var(--app-surface)" }}><div className="text-[10px] uppercase tracking-wider" style={{ color: "var(--app-text-faint)" }}>{label}</div><div className="text-xl font-bold mt-1.5" style={{ color: index === 0 ? "var(--app-primary)" : "var(--app-text)" }}>{value}</div></div>)}</div>

    <TableCard
      title="System-Detected Anomaly Cases"
      subtitle="Positive shortages above tolerance flagged automatically from physical counts for Manager investigation"
      badge={
        reports.length > 0 ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-0.5 rounded-full text-rose-700 bg-rose-50 border border-rose-200">
            {reports.length} case{reports.length === 1 ? "" : "s"}
          </span>
        ) : undefined
      }
      toolbar={
        <>
          <div className="flex items-center gap-1 p-1 rounded-xl border" style={{ borderColor: "var(--app-border)", background: "var(--app-bg)" }}>{[
            { value: "", label: "All" }, { value: "DETECTED", label: "Needs Investigation" }, { value: "VERIFIED", label: "Verified" }, { value: "PENDING_REVIEW", label: "Pending Review" }, { value: "REVIEWED", label: "Reviewed" },
          ].map((option) => <button key={option.value || "all"} onClick={() => setStatus(option.value as ShrinkageStatus | "")} className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors" style={{ background: status === option.value ? "var(--app-primary)" : "transparent", color: status === option.value ? "#fff" : "var(--app-text-muted)" }}>{option.label}</button>)}</div>
          {owner && <Select value={branchId} onChange={setBranchId} options={[{ value: "", label: "All Branches" }, ...branches.map((branch) => ({ value: branch.id, label: branch.name }))]}/>}
          <Select value={classification} onChange={(value) => setClassification(value as ShrinkageClassification | "")} options={[{ value: "", label: "All Classifications" }, ...managerClassificationOptions.map((option) => ({ value: option.value, label: option.label }))]}/>
          <Select value={inventoryItemId} onChange={setInventoryItemId} options={[{ value: "", label: "All Ingredients" }, ...inventoryItems.map((item) => ({ value: item.id, label: item.name }))]}/>
          <Select value={incidentType} onChange={(value) => setIncidentType(value as IncidentType | "")} options={[{ value: "", label: "All Incident Types" }, ...incidentTypeOptions]}/>
          <CalendarDateField label="From" value={startDate} onChange={setStartDate}/>
          <CalendarDateField label="To" value={endDate} onChange={setEndDate}/>
        </>
      }
    >
      <TableWrapper minWidth={900}>
        <THead cols={["Case No.", "Detected", ...(owner ? ["Branch"] : []), "Inventory Item", "Classification", "System Variance", "Status", "Investigated", "Action"]} />
        <tbody>
          {loading ? (
            <TableLoadingRow colSpan={owner ? 9 : 8} label="Loading system-detected anomalies…" />
          ) : error ? (
            <TableEmptyRow colSpan={owner ? 9 : 8} title="Unable to load anomalies" subtitle={error} />
          ) : reports.length === 0 ? (
            <TableEmptyRow colSpan={owner ? 9 : 8} icon={ShieldCheck} title="No matching anomalies found" subtitle="Negative variances appear automatically after a physical inventory count is submitted." />
          ) : (
            reports.map((report) => (
              <TR key={report.id}>
                <TD mono><span className="font-semibold text-[var(--app-primary)]">{report.reportNo}</span></TD>
                <TD muted>{formatDate(report.detectedAt)}</TD>
                {owner && <TD muted><span className="font-medium text-[var(--app-text)]">{report.branchName}</span></TD>}
                <TD>
                  <div className="font-semibold text-sm text-[var(--app-text)]">{report.inventoryItemName}</div>
                  <div className="text-[11px] font-mono text-[var(--app-text-muted)] mt-0.5">{report.sku}</div>
                </TD>
                <TD muted>{classificationLabel(report.classification)}</TD>
                <TD right><span className="font-bold text-[var(--app-danger)]">{report.varianceQuantity.toFixed(2)} {report.unit}</span></TD>
                <TD center><Status status={report.status} /></TD>
                <TD muted>{formatDate(report.investigatedAt)}</TD>
                <TD right>
                  <button
                    type="button"
                    onClick={() => openReport(report)}
                    className="p-2 rounded-lg hover:bg-[var(--app-surface-muted)] transition-colors text-[var(--app-text-muted)] hover:text-[var(--app-primary)]"
                    title={report.status === "DETECTED" && !owner ? "Investigate anomaly" : "View case"}
                    aria-label={`View case ${report.reportNo}`}
                  >
                    <Eye size={15} />
                  </button>
                </TD>
              </TR>
            ))
          )}
        </tbody>
      </TableWrapper>
      <Pagination total={reports.length} page={1} perPage={Math.max(reports.length, 1)} />
    </TableCard>

    <ShrinkageIncidentReports owner={owner} branchId={branchId} />

    {selected && <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,.5)" }}><div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 rounded-2xl border" style={{ background: "var(--app-surface)", borderColor: "var(--app-border)" }}>
      <div className="flex justify-between mb-5"><div><h2 className="text-lg font-bold">{selected.reportNo}</h2><p className="text-xs mt-1" style={{ color: "var(--app-text-muted)" }}>{selected.branchName} · {selected.inventoryItemName}</p></div><button onClick={() => setSelected(null)}><X size={18} /></button></div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">{[["Expected",`${selected.expectedQuantity.toFixed(2)}${selected.unit}`],["Actual",`${selected.actualQuantity.toFixed(2)}${selected.unit}`],["Variance",`${selected.varianceQuantity > 0 ? "+" : ""}${selected.varianceQuantity.toFixed(2)}${selected.unit}`],["Variance Value",`${selected.varianceValue > 0 ? "+" : ""}₱${selected.varianceValue.toFixed(2)}`]].map(([label,value]) => <div key={label} className="p-3 rounded-xl" style={{ background: "var(--app-bg)" }}><div className="text-[10px] uppercase" style={{ color: "var(--app-text-faint)" }}>{label}</div><div className="font-bold mt-1">{value}</div></div>)}</div>
      <div className="p-3 rounded-xl mb-4 flex gap-3" style={{ background: "var(--app-warning-bg)" }}><AlertTriangle size={18} style={{ color: "var(--app-warning)" }} /><p className="text-xs" style={{ color: "var(--app-text-muted)" }}>These quantities were calculated from connected inventory records and cannot be edited in the investigation.</p></div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4"><Detail label="Variance Percentage" value={selected.variancePercentage == null ? "Not available" : `${selected.variancePercentage.toFixed(2)}%`} /><Detail label="Count Date" value={formatDate(selected.countDate)} /><Detail label="Tolerance Status" value="Above tolerance — investigation required" /></div>

      <div className="mb-5 rounded-xl border p-4" style={{ borderColor: "var(--app-border)", background: "var(--app-surface-elevated)" }}>
        <h3 className="text-sm font-semibold">Supporting Records</h3>
        {!evidence ? <p className="text-xs mt-2" style={{ color: "var(--app-text-muted)" }}>Loading available operational evidence…</p> : <>
          {evidence.incidents.length ? <div className="mt-3 space-y-2">{evidence.incidents.map((incident) => <div key={incident.id} className="rounded-xl border p-3 text-xs" style={{ borderColor: "var(--app-border)" }}><div className="flex justify-between gap-2"><strong>{incidentTypeLabel(incident.incidentType)}</strong><span>{incident.explicitlyLinked ? "Linked evidence" : "Possible match"}</span></div><div className="mt-1" style={{ color: "var(--app-text-muted)" }}>{incident.submittedByName} · {formatDate(incident.occurredAt)} · {incident.quantity} {selected.unit} · {incident.status}</div><p className="mt-2">{incident.reason}</p><div className="flex items-center gap-3 mt-2">{incident.photoUrl && <a href={incident.photoUrl} target="_blank" rel="noreferrer" className="font-semibold" style={{ color: "var(--app-primary)" }}>View supporting image</a>}{!owner && !incident.explicitlyLinked && <button disabled={saving} onClick={() => void linkIncident(incident.id)} className="font-semibold" style={{ color: "var(--app-primary)" }}>Link as evidence</button>}</div></div>)}</div> : <p className="text-xs mt-2" style={{ color: "var(--app-text-muted)" }}>No linked or potentially relevant Staff incidents were found.</p>}
          <div className="grid sm:grid-cols-2 gap-3 mt-3"><div className="rounded-xl p-3" style={{ background: "var(--app-bg)" }}><div className="text-xs font-semibold">Recent inventory records</div>{evidence.movements.length ? <div className="mt-2 space-y-1.5">{evidence.movements.map((movement, index) => <div key={`${movement.occurredAt}-${index}`} className="text-xs" style={{ color: "var(--app-text-muted)" }}><strong>{movement.movementType.replaceAll("_", " ")}</strong> · {movement.quantity} {selected.unit} · {formatDate(movement.occurredAt)}{movement.referenceNo ? ` · ${movement.referenceNo}` : ""}</div>)}</div> : <div className="text-xs mt-1" style={{ color: "var(--app-text-muted)" }}>No nearby receipt or adjustment records.</div>}</div><div className="rounded-xl p-3" style={{ background: "var(--app-bg)" }}><div className="text-xs font-semibold">Related sales usage</div>{evidence.usage.length ? <div className="mt-2 space-y-1.5">{evidence.usage.map((entry) => <div key={entry.date} className="text-xs" style={{ color: "var(--app-text-muted)" }}>{formatDate(entry.date)} · {entry.expectedUsage.toFixed(2)} {selected.unit} expected usage</div>)}</div> : <div className="text-xs mt-1" style={{ color: "var(--app-text-muted)" }}>No recent recipe-derived usage.</div>}</div></div>
          <div className="mt-3 rounded-xl p-3 text-xs" style={{ background: "var(--app-primary-subtle)", color: "var(--app-text-muted)" }}><strong>AI-assisted analysis</strong><div className="mt-1">{evidence.aiSuggestion ?? "No AI suggestion was requested for this investigation."}</div><div className="mt-1 font-semibold">{evidence.aiAdvisoryLabel}</div></div>
        </>}
      </div>

      {selected.status === "DETECTED" && !owner ? <div>
        <h3 className="font-semibold mb-1">Manager Investigation Findings</h3><p className="text-xs mb-4" style={{ color: "var(--app-text-muted)" }}>Investigate with branch personnel, then document the verified or suspected cause.</p>
        <div className="grid grid-cols-2 gap-2 mb-4">{managerClassificationOptions.map((option) => <button key={option.value} onClick={() => setInvestigation((current) => ({ ...current, classification: option.value }))} className="p-3 rounded-xl border text-left" style={{ borderColor: investigation.classification === option.value ? "var(--app-primary)" : "var(--app-border)", background: investigation.classification === option.value ? "var(--app-primary-subtle)" : "var(--app-surface)" }}><div className="text-sm font-semibold">{option.label}</div><div className="text-[11px] mt-1 leading-relaxed" style={{ color: "var(--app-text-muted)" }}>{option.definition}</div></button>)}</div>
        <label className="block text-sm mb-3">Related menu product (optional)<Select className="mt-1.5 w-full" value={investigation.menuItemId} onChange={(value) => setInvestigation((current) => ({ ...current, menuItemId: value }))} options={[{ value: "", label: "No specific menu product" }, ...menu.map((product) => ({ value: product.id, label: product.name }))]}/></label>
        <label className="block text-sm mb-3">Investigation explanation<textarea value={investigation.explanation} onChange={(event) => setInvestigation((current) => ({ ...current, explanation: event.target.value }))} rows={4} placeholder="Document what was found during the investigation (minimum 10 characters)…" className="mt-1.5 w-full px-3 py-2.5 rounded-xl border resize-none" style={{ borderColor: "var(--app-border)", background: "var(--app-surface-elevated)" }} /></label>
        <label className="block text-sm">Corrective action / supporting notes (optional)<textarea value={investigation.supportingNotes} onChange={(event) => setInvestigation((current) => ({ ...current, supportingNotes: event.target.value }))} rows={2} className="mt-1.5 w-full px-3 py-2.5 rounded-xl border resize-none" style={{ borderColor: "var(--app-border)", background: "var(--app-surface-elevated)" }} /></label>
        {investigation.classification === "PILFERAGE" && <div className="mt-4 p-4 rounded-xl border" style={{ borderColor: "var(--app-warning)", background: "var(--app-warning-bg)" }}><div className="text-sm font-semibold">Verified Pilferage safeguard</div><p className="text-xs mt-1" style={{ color: "var(--app-text-muted)" }}>Select at least one traceable evidence basis and confirm that you personally reviewed the available records.</p><div className="grid sm:grid-cols-2 gap-2 mt-3">{evidenceBasisOptions.map((option) => <label key={option.value} className="flex items-start gap-2 text-xs"><input type="checkbox" checked={investigation.evidenceBasis.includes(option.value)} onChange={(event) => setInvestigation((current) => ({ ...current, evidenceBasis: event.target.checked ? [...current.evidenceBasis, option.value] : current.evidenceBasis.filter((value) => value !== option.value) }))}/><span>{option.label}</span></label>)}</div><label className="flex items-start gap-2 text-xs font-semibold mt-4"><input type="checkbox" checked={investigation.evidenceReviewConfirmed} onChange={(event) => setInvestigation((current) => ({ ...current, evidenceReviewConfirmed: event.target.checked }))}/><span>I confirm that I reviewed the available records and supporting evidence before classifying this discrepancy as Verified Pilferage.</span></label></div>}
        <button disabled={saving || !investigation.classification || investigation.explanation.trim().length < 10 || (investigation.classification === "PILFERAGE" && (investigation.explanation.trim().length < 20 || !investigation.evidenceReviewConfirmed || investigation.evidenceBasis.length === 0))} onClick={() => void submitInvestigation()} className="w-full mt-5 py-2.5 rounded-xl text-white font-semibold disabled:opacity-40" style={{ background: "var(--app-primary)" }}>{saving ? "Submitting…" : "Verify & Submit Classification"}</button>
      </div> : <div><Detail label="Classification" value={classificationLabel(selected.classification)} /><Detail label="Investigated by" value={selected.managerName} /><Detail label="Menu reference" value={selected.menuItemName ?? "Not specified"} /><Detail label="Investigation explanation" value={selected.explanation ?? "Awaiting Manager investigation"} /><Detail label="Corrective action / supporting notes" value={selected.supportingNotes || "None"} />
        {selected.status === "REVIEWED" ? <div className="mt-5 p-4 rounded-xl flex gap-3" style={{ background: "var(--app-success-bg)" }}><CheckCircle style={{ color: "var(--app-success)" }} /><div><div className="font-semibold">Reviewed</div><div className="text-xs mt-1" style={{ color: "var(--app-text-muted)" }}>Reviewed by {selected.reviewedByName} · {formatDate(selected.reviewedAt)}</div></div></div> : (selected.status === "PENDING_REVIEW" || selected.status === "VERIFIED") && owner ? <button onClick={() => setConfirmReview(true)} className="w-full mt-5 py-2.5 rounded-xl text-white font-semibold" style={{ background: "var(--app-primary)" }}>Mark Findings as Reviewed</button> : <div className="mt-5"><Status status={selected.status} /></div>}
      </div>}
    </div></div>}

    {confirmReview && selected && <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,.55)" }}><div className="w-full max-w-md p-6 rounded-2xl border" style={{ background: "var(--app-surface)", borderColor: "var(--app-border)" }}><h2 className="text-lg font-bold">Mark these investigation findings as reviewed?</h2><p className="text-sm mt-2" style={{ color: "var(--app-text-muted)" }}>The Branch Manager will be notified and the Owner review will be recorded.</p><div className="flex gap-3 mt-6"><button onClick={() => setConfirmReview(false)} className="flex-1 py-2.5 rounded-xl border" style={{ borderColor: "var(--app-border)" }}>Cancel</button><button disabled={saving} onClick={() => void review()} className="flex-1 py-2.5 rounded-xl text-white font-semibold disabled:opacity-50" style={{ background: "var(--app-primary)" }}>{saving ? "Reviewing…" : "Mark as Reviewed"}</button></div></div></div>}
  </div>;
}

function Status({ status }: { status: ShrinkageStatus }) {
  const visual = status === "REVIEWED"
    ? { label: "Reviewed", color: "var(--app-success)", background: "var(--app-success-bg)" }
    : status === "VERIFIED"
      ? { label: "Verified", color: "var(--app-primary)", background: "var(--app-primary-subtle)" }
      : status === "PENDING_REVIEW"
        ? { label: "Pending Owner Review", color: "var(--app-warning)", background: "var(--app-warning-bg)" }
        : { label: "Needs Investigation", color: "var(--app-danger)", background: "var(--app-danger-bg)" };
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

function Detail({ label, value }: { label: string; value: string }) { return <div className="py-3 border-b" style={{ borderColor: "var(--app-border)" }}><div className="text-[10px] uppercase tracking-wide" style={{ color: "var(--app-text-faint)" }}>{label}</div><div className="text-sm mt-1 whitespace-pre-wrap">{value}</div></div>; }
