import { useEffect, useMemo, useState } from "react";
import { Check, CheckCircle, Upload, X } from "lucide-react";
import { Btn, C, formatPeso, isModalBackdropEvent } from "../../components/ModuleUi";
import { inventoryWorkflowService } from "../../services/inventoryWorkflow.service";
import type { PosImportPreview, PosSource } from "../../types/inventoryWorkflow";
import { deduplicatePosValidationIssues, PosMappingRecoveryNotice, requiresPosMappingRecovery } from "./posImportPresentation";

type Step = "select" | "preview" | "done";

const supportedFilename = (filename: string) => /\.(csv|xls|xlsx)$/i.test(filename.trim());

export function activePosSourcesForBranch(sources: PosSource[], branchId: string | null | undefined) {
  if (!branchId) return [];
  return sources.filter((source) => source.status === "ACTIVE" && source.branchId === branchId);
}

export function resolvedPosSourceId(sources: PosSource[], currentSourceId: string) {
  if (sources.length === 1) return sources[0]!.id;
  return sources.some((source) => source.id === currentSourceId) ? currentSourceId : "";
}

export function canValidatePosImport(fileSelected: boolean, busy: boolean, sourceId: string, sources: PosSource[]) {
  return fileSelected && !busy && Boolean(sourceId) && sources.length > 0;
}

export function PosSourceField({ sources, sourceId, loading, onChange }: {
  sources: PosSource[];
  sourceId: string;
  loading: boolean;
  onChange: (sourceId: string) => void;
}) {
  if (!loading && sources.length === 1) {
    return <p className="text-sm font-normal" aria-label="POS Source">
      <span>POS Source: </span>
      <strong style={{ color: C.maroon }}>{sources[0]!.displayName}</strong>
    </p>;
  }
  return <div className="text-sm font-semibold">
    <span className="block">POS Source</span>
    {loading ? <div role="status" className="field mt-2 text-[var(--app-text-muted)]">Loading POS sources…</div>
      : sources.length === 0 ? <p role="alert" className="mt-2 rounded-xl bg-[var(--app-warning-bg)] p-3 text-sm text-[var(--app-warning)]">No active POS source is configured for this branch.</p>
        : <select aria-label="POS Source" value={sourceId} onChange={(event) => onChange(event.target.value)} className="field mt-2">
          <option value="">Select active POS source</option>
          {sources.map((source) => <option key={source.id} value={source.id}>{source.displayName} · {source.supportedFormat.replaceAll("_", " ")}</option>)}
        </select>}
  </div>;
}

export function PosImportModal({ open, branchId, branchName, onClose, onImported, onConfigureMapping: _onConfigureMapping }: {
  open: boolean;
  branchId: string | null | undefined;
  branchName: string;
  onClose: () => void;
  onImported: (businessDate: string) => void;
  onConfigureMapping: (sourceId: string) => void;
}) {
  const [step, setStep] = useState<Step>("select");
  const [sources, setSources] = useState<PosSource[]>([]);
  const [sourcesLoading, setSourcesLoading] = useState(true);
  const [sourceId, setSourceId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [csvText, setCsvText] = useState("");
  const [preview, setPreview] = useState<PosImportPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [mappingRecoveryRequired, setMappingRecoveryRequired] = useState(false);
  const [formatRequestSent, setFormatRequestSent] = useState(false);
  const [result, setResult] = useState<{ rowsImported: number; totalSales: number; businessDate: string } | null>(null);
  const activeSources = useMemo(() => activePosSourcesForBranch(sources, branchId), [sources, branchId]);

  useEffect(() => {
    if (!open) return;
    let current = true;
    setStep("select"); setSources([]); setSourceId(""); setSourcesLoading(true); setFile(null); setCsvText(""); setPreview(null); setResult(null); setError(""); setMappingRecoveryRequired(false); setFormatRequestSent(false);
    void inventoryWorkflowService.posSources()
      .then((nextSources) => { if (current) setSources(nextSources); })
      .catch(() => { if (current) setError("Unable to load configured POS sources."); })
      .finally(() => { if (current) setSourcesLoading(false); });
    return () => { current = false; };
  }, [open, branchId]);

  useEffect(() => {
    if (!open || sourcesLoading) return;
    setSourceId((currentSourceId) => resolvedPosSourceId(activeSources, currentSourceId));
  }, [open, sourcesLoading, activeSources]);

  if (!open) return null;
  const validationIssues = deduplicatePosValidationIssues(preview?.validationIssues);

  const choose = (selected?: File) => {
    if (!selected) return;
    setError("");
    if (selected.size > 4_000_000) return setError("POS files must be 4 MB or smaller.");
    if (!supportedFilename(selected.name)) return setError("Select a CSV, XLS, or XLSX POS file.");
    setFile(selected);
  };

  const validate = async () => {
    if (!file) return setError("Select a POS file first.");
    const extension = file.name.toLowerCase().split(".").pop();
    if (!sourceId) return setError("Select the configured POS source for this file.");
    setBusy(true); setError(""); setMappingRecoveryRequired(false);
    try {
      const nextCsv = extension === "csv" ? await file.text() : "";
      if (nextCsv.includes("\uFFFD")) throw new Error("The CSV contains invalid text encoding. Export it as UTF-8 and try again.");
      const nextPreview = extension === "csv"
        ? await inventoryWorkflowService.previewPosSales({ sourceFilename: file.name, csvText: nextCsv, posSourceId: sourceId })
        : await inventoryWorkflowService.previewPosSales({ sourceFilename: file.name, file, posSourceId: sourceId });
      setCsvText(nextCsv); setPreview(nextPreview); setStep("preview");
    } catch (cause) {
      setMappingRecoveryRequired(requiresPosMappingRecovery(cause));
      setError(cause instanceof Error ? cause.message : "Unable to validate the POS file.");
    } finally { setBusy(false); }
  };

  const importSales = async () => {
    if (!file || !preview?.summary.canImport) return;
    setBusy(true); setError("");
    try {
      const imported = csvText
        ? await inventoryWorkflowService.importPosSales({ sourceFilename: file.name, csvText, posSourceId: sourceId, expectedContentHash: preview.contentHash, expectedResolutionFingerprint: preview.resolutionFingerprint })
        : await inventoryWorkflowService.importPosSales({ sourceFilename: file.name, file, posSourceId: sourceId, expectedContentHash: preview.contentHash, expectedResolutionFingerprint: preview.resolutionFingerprint });
      setResult(imported); setStep("done");
      window.dispatchEvent(new CustomEvent("libro-data-changed", { detail: { businessDate: imported.businessDate } }));
      onImported(imported.businessDate);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to import POS sales.");
    } finally { setBusy(false); }
  };

  const requestFormatSetup = async () => {
    if (!file || !sourceId) return;
    setBusy(true); setError("");
    try {
      await inventoryWorkflowService.requestPosFormatSetup(file.name,file,sourceId);
      setFormatRequestSent(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to send the format setup request.");
    } finally { setBusy(false); }
  };

  const close = () => { if (!busy) onClose(); };
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onMouseDown={(event)=>{if(isModalBackdropEvent(event))close();}}>
    <div role="dialog" aria-modal="true" aria-labelledby="dashboard-pos-import-title" className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-2xl border bg-[var(--app-surface)] p-6 shadow-2xl" style={{ borderColor: C.border }}>
      <div className="flex items-start justify-between gap-4"><div><h2 id="dashboard-pos-import-title" className="text-lg font-bold">Import POS Sales</h2><p className="mt-1 text-xs text-[var(--app-text-muted)]">{branchName} · Validate, preview, and import daily sales without leaving the Dashboard.</p></div><button type="button" aria-label="Close POS import" onClick={close} className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--app-surface-muted)]"><X size={16}/></button></div>
      <div className="my-6 flex items-center gap-2">{["Select File","Validate","Import"].map((label,index)=>{const current=step==="select"?0:step==="preview"?1:2;return <div key={label} className="contents"><div className="flex items-center gap-1.5"><span className="flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold text-white" style={{background:index<=current?C.maroon:C.muted}}>{index<current?<Check size={12}/>:index+1}</span><span className="text-xs font-semibold">{label}</span></div>{index<2&&<span className="h-px flex-1 bg-[var(--app-border)]"/>}</div>;})}</div>
      {step==="select"&&<div className="space-y-4"><PosSourceField sources={activeSources} sourceId={sourceId} loading={sourcesLoading} onChange={setSourceId}/><label className="block cursor-pointer rounded-2xl border-2 border-dashed p-8 text-center" style={{borderColor:file?C.maroon:C.border}}><Upload className="mx-auto"/><span className="mt-3 block text-sm font-semibold">{file?.name??"Choose CSV, XLS, or XLSX file"}</span><input className="sr-only" type="file" accept=".csv,.xls,.xlsx" onChange={event=>{choose(event.target.files?.[0]);event.target.value="";}}/></label><div className="flex justify-end gap-2"><Btn variant="outline" onClick={close}>Cancel</Btn><Btn disabled={!canValidatePosImport(Boolean(file),busy,sourceId,activeSources)} onClick={()=>void validate()}>{busy?"Validating…":"Validate File"}</Btn></div></div>}
      {step==="preview"&&preview&&<div className="space-y-4"><div className="grid grid-cols-2 gap-3 md:grid-cols-4">{[["Processed Rows",`${preview.summary.validRows+preview.summary.warningRows} / ${preview.summary.totalSourceRows}`],["Operational Excluded",preview.summary.operationalRows],["Estimated Sales",formatPeso(preview.simulation.estimatedSales)],["Estimated COGS",formatPeso(preview.simulation.estimatedCogs)],["Gross Profit",formatPeso(preview.simulation.estimatedGrossProfit)],["Gross Margin",`${preview.simulation.estimatedGrossMargin.toFixed(2)}%`],["Blocking Rows",preview.summary.invalidRows+preview.summary.unknownReviewRows],["Recipe-resolved Rows",preview.simulation.validResolvedRows]].map(([label,value])=><div key={String(label)} className="rounded-xl border p-3 text-center"><span className="block text-xs text-[var(--app-text-muted)]">{label}</span><strong className="mt-1 block">{value}</strong></div>)}</div>{preview.pricing.notice&&<p className="rounded-xl border p-3 text-sm" style={{borderColor:C.amber,background:C.amberBg}}>{preview.pricing.notice}</p>}{validationIssues.length>0&&<div className="rounded-xl border p-3"><h3 className="text-sm font-bold">Validation details</h3><div className="mt-2 overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr><th className="p-2">Row</th><th className="p-2">Field</th><th className="p-2">Issue</th></tr></thead><tbody>{validationIssues.map((issue)=><tr key={`${issue.rowNumber}-${issue.field}-${issue.issue}`} className="border-t"><td className="p-2">{issue.rowNumber}</td><td className="p-2 font-semibold">{issue.field}</td><td className="p-2">{issue.issue}</td></tr>)}</tbody></table></div></div>}<p className="rounded-xl p-3 text-sm" style={{background:preview.summary.canImport?C.greenBg:C.redBg,color:preview.summary.canImport?C.green:C.red}}>{preview.summary.canImport?"Validation complete. Review the totals before importing.":preview.importBlockedReason??"Correct blocking validation issues before importing."}</p><div className="flex justify-end gap-2"><Btn variant="outline" onClick={()=>setStep("select")}>Back</Btn><Btn disabled={busy||!preview.summary.canImport} onClick={()=>void importSales()}>{busy?"Importing…":"Import Sales"}</Btn></div></div>}
      {step==="done"&&result&&<div className="py-8 text-center"><CheckCircle size={44} className="mx-auto text-[var(--app-success)]"/><h3 className="mt-3 text-lg font-bold">Import Completed</h3><p className="mt-1 text-sm text-[var(--app-text-muted)]">{result.rowsImported} sales rows imported for {result.businessDate} · {formatPeso(result.totalSales)}</p><Btn className="mt-5" onClick={close}>Return to Dashboard</Btn></div>}
      {mappingRecoveryRequired&&sourceId&&<div className="mt-4">{formatRequestSent
        ? <p role="status" className="rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-950">Format setup request sent to the Owner. The sales file will continue processing after the format is configured.</p>
        : <PosMappingRecoveryNotice
            message="New POS file format detected. This format needs to be configured by the Owner before the sales can be imported."
            actionLabel={busy?"Sending Request…":"Request POS Format Setup"}
            onConfigure={()=>void requestFormatSetup()}
          />}</div>}
      {error&&!mappingRecoveryRequired&&<p role="alert" className="mt-4 rounded-xl bg-[var(--app-danger-bg)] p-3 text-sm text-[var(--app-danger)]">{error}</p>}
    </div>
  </div>;
}
