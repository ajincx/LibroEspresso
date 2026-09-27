import React, { lazy, Suspense, useEffect, useState } from "react";
import { ShoppingCart, Package, TrendingDown, Search, X, Upload, Check, Coffee, CheckCircle, TrendingUp, DollarSign, GitCompare, BarChart2, Hash, Percent, Trash2 } from "lucide-react";
import { Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart } from "recharts";
import { C, CalendarDateField, DashboardRange, DashboardComparison, dashboardPeriodLabel, formatPeso, StatusChip, KPICard, Card, SectionHeader, Btn, SearchInput, Select, DashboardFilters, THead, TR, TD, Pagination, ChartTip, ModuleTabSwitcher, AnimatedTabPanel, TableCard, TableWrapper, TableEmptyRow, TableLoadingRow } from "../../components/ModuleUi";
import { toast } from "sonner";
import type { Page, Role } from "../../types/navigation";
import { inventoryWorkflowService } from "../../services/inventoryWorkflow.service";
import { masterDataService } from "../../services/masterData.service";
import type { DailyPosUploadStatus, PosAnalytics, PosImportPreview, PosImportReconciliation, PosImportRecord, PosMapping, PosMappingReviewStatus, PosSource } from "../../types/inventoryWorkflow";
import type { Branch, MenuProduct } from "../../types/masterData";
import { useAuth } from "../../contexts/AuthContext";
import { addDateDays, businessDate, periodDates } from "../../utils/businessDate";
import { formatAppDate } from "../../utils/appPreferences";

export const marginValueColor = (margin:number) => margin > 0 ? C.green : margin < 0 ? C.red : "var(--app-text-muted)";
export function PosPricingNotice({ notice }: { notice: string | null | undefined }) {
  if (!notice) return null;
  return <div className="mb-4 rounded-xl border p-3 text-sm" style={{ borderColor: C.amber, background: C.amberBg, color: C.primary }}>{notice}</div>;
}
export const posSalesAmountLabel = (row: Pick<PosImportPreview["rows"][number], "calculatedSalesAmount" | "lineAmount">) => {
  const amount = row.calculatedSalesAmount ?? row.lineAmount;
  return amount == null ? "Unavailable" : `₱${amount.toFixed(2)}`;
};
export const canDeletePosImport = (role:Role) => role === "owner";
export const isSupportedPosFilename = (filename:string) => /\.(csv|xls|xlsx)$/i.test(filename.trim());
export const hasInvalidCsvEncoding = (csvText:string) => csvText.includes("\uFFFD");
export const DAILY_POS_MONITORING_LOCATION="import_history" as const;
export const OWNER_POS_IMPORT_HISTORY_COLUMNS=["File Name","Branch","Business Date","Uploaded Date / Time","Uploaded By","Processed / Total Rows","Units Sold","Total Sales","Fingerprint","Status","Action"];
export const MANAGER_POS_IMPORT_HISTORY_COLUMNS=OWNER_POS_IMPORT_HISTORY_COLUMNS.filter((column)=>column!=="Branch"&&column!=="Action");
export const dailyPosStatusLabel = (status:DailyPosUploadStatus["status"]) => ({
  UPLOADED:"Uploaded",DUE_TODAY:"Due Today",MISSING_UPLOAD:"Missing Upload",LATE_UPLOAD:"Late Upload",UPCOMING:"Upcoming",
  NO_SALES_CLOSED:"No Sales / Closed",POS_SOURCE_NOT_CONFIGURED:"POS Source Not Configured",
})[status];
export const filterDailyPosStatuses = (rows:DailyPosUploadStatus[],sourceId:string) => sourceId === "ALL" ? rows : rows.filter((row)=>row.posSourceId===sourceId);
export const canApprovePosMapping = (
  mapping: Pick<PosMapping, "recipeAvailable">,
  source: Pick<PosSource, "status" | "formatVerifiedAt"> | null,
) => Boolean(mapping.recipeAvailable && source?.status === "ACTIVE" && source.formatVerifiedAt);
export const canEditPosMapping = (mapping: Pick<PosMapping, "reviewStatus" | "status">) => mapping.reviewStatus === "PENDING" && mapping.status === "INACTIVE";
type MappingRevision = { branchId:string|null;sourceProductCode:string|null;menuItemId:string;menuItemVariantId:string;revisionReason?:string };

export function PosMappingEditDialog({mapping,products,branches,busy,onCancel,onSave}:{
  mapping:PosMapping;products:MenuProduct[];branches:Branch[];busy:boolean;onCancel:()=>void;onSave:(input:MappingRevision)=>void;
}) {
  const [productId,setProductId]=useState(mapping.menuItemId);
  const [variantId,setVariantId]=useState(mapping.menuItemVariantId);
  const [branchId,setBranchId]=useState(mapping.branchId??"");
  const [posCode,setPosCode]=useState(mapping.sourceProductCode??"");
  const [revisionReason,setRevisionReason]=useState("");
  const eligibleProducts=products.filter(product=>product.status==="ACTIVE"&&product.approvalStatus==="APPROVED");
  const selectedProduct=eligibleProducts.find(product=>product.id===productId);
  const variants=selectedProduct?.variants.filter(variant=>variant.status==="ACTIVE")??[];
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" role="dialog" aria-modal="true" aria-labelledby="edit-pos-mapping-title">
    <form className="w-full max-w-xl rounded-2xl border bg-[var(--app-surface)] p-6 shadow-2xl" style={{borderColor:C.border}} onSubmit={(event)=>{event.preventDefault();onSave({branchId:branchId||null,sourceProductCode:posCode.trim()||null,menuItemId:productId,menuItemVariantId:variantId,...(revisionReason.trim()?{revisionReason:revisionReason.trim()}:{})});}}>
      <h3 id="edit-pos-mapping-title" className="text-lg font-bold">Edit Pending Mapping</h3>
      <p className="mt-1 text-sm" style={{color:C.secondary}}>Saving returns this mapping to Pending Approval. It will not be activated automatically.</p>
      <div className="mt-5 grid gap-4">
        <label className="grid gap-1 text-sm font-semibold">POS Name<input aria-label="POS Name" readOnly value={mapping.sourceProductName} className="rounded-lg border bg-[var(--app-surface-muted)] p-2 font-normal"/></label>
        <label className="grid gap-1 text-sm font-semibold">POS Code<input aria-label="Edit POS code" value={posCode} onChange={event=>setPosCode(event.target.value)} className="rounded-lg border p-2 font-normal" placeholder="Optional POS code"/></label>
        <label className="grid gap-1 text-sm font-semibold">Branch Scope<select aria-label="Edit mapping branch" value={branchId} onChange={event=>setBranchId(event.target.value)} className="rounded-lg border p-2 font-normal"><option value="">All branches</option>{branches.map(branch=><option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
        <label className="grid gap-1 text-sm font-semibold">Target Product<select aria-label="Edit target product" value={productId} onChange={event=>{setProductId(event.target.value);setVariantId("");}} className="rounded-lg border p-2 font-normal"><option value="">Select product</option>{eligibleProducts.map(product=><option key={product.id} value={product.id}>{product.category} / {product.name}</option>)}</select></label>
        <label className="grid gap-1 text-sm font-semibold">Target Variant<select aria-label="Edit target variant" value={variantId} onChange={event=>setVariantId(event.target.value)} className="rounded-lg border p-2 font-normal"><option value="">Select variant</option>{variants.map(variant=><option key={variant.id} value={variant.id}>{variant.name} — {variant.recipeId?`Recipe v${variant.recipeVersion??1}`:"No recipe"}</option>)}</select></label>
        <label className="grid gap-1 text-sm font-semibold">Revision Note <span className="font-normal" style={{color:C.secondary}}>(optional)</span><textarea aria-label="Mapping revision note" value={revisionReason} onChange={event=>setRevisionReason(event.target.value)} className="min-h-20 rounded-lg border p-2 font-normal" placeholder="Why is this target being corrected?"/></label>
      </div>
      <div className="mt-6 flex justify-end gap-2"><Btn variant="outline" disabled={busy} onClick={onCancel}>Cancel</Btn><button disabled={busy||!productId||!variantId} type="submit" className="rounded-xl px-3.5 py-2 text-sm font-semibold text-white disabled:opacity-40" style={{background:C.maroon}}>Save Changes</button></div>
    </form>
  </div>;
}

export function PosMappingActions({mapping,busy,canApprove,reviewNote,onEdit,onReview,onDeactivate}:{
  mapping:PosMapping;busy:boolean;canApprove:boolean;reviewNote:string;onEdit:()=>void;
  onReview:(status:PosMappingReviewStatus)=>void;onDeactivate:()=>void;
}) {
  if(mapping.reviewStatus==="APPROVED") return <div className="flex flex-wrap items-center gap-2"><span className="font-semibold" style={{color:C.green}}>Approved</span>{mapping.status==="ACTIVE"?<button type="button" disabled={busy} className="rounded-lg border px-2 py-1" onClick={onDeactivate}>Deactivate</button>:<span style={{color:C.secondary}}>Deactivated</span>}</div>;
  if(mapping.reviewStatus==="REJECTED"||mapping.reviewStatus==="AMBIGUOUS") return <button type="button" disabled={busy} className="rounded-lg border px-2 py-1" onClick={()=>onReview("PENDING")}>Return to Pending</button>;
  return <div className="flex flex-wrap gap-1">{canEditPosMapping(mapping)&&<button type="button" disabled={busy} className="rounded-lg border px-2 py-1" onClick={onEdit}>Edit Mapping</button>}<button type="button" disabled={busy||!canApprove} className="rounded-lg border px-2 py-1 disabled:opacity-40" onClick={()=>onReview("APPROVED")}>Approve</button><button type="button" disabled={busy||!reviewNote.trim()} className="rounded-lg border px-2 py-1 disabled:opacity-40" onClick={()=>onReview("REJECTED")}>Reject</button><button type="button" disabled={busy||!reviewNote.trim()} className="rounded-lg border px-2 py-1 disabled:opacity-40" onClick={()=>onReview("AMBIGUOUS")}>Ambiguous</button></div>;
}

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

function PosMappingSetup() {
  const [open, setOpen] = useState(false);
  const [sources, setSources] = useState<PosSource[]>([]);
  const [mappings, setMappings] = useState<PosMapping[]>([]);
  const [products, setProducts] = useState<MenuProduct[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [sourceId, setSourceId] = useState("");
  const [sourceCode, setSourceCode] = useState("");
  const [sourceName, setSourceName] = useState("");
  const [sourceFormat, setSourceFormat] = useState<PosSource["supportedFormat"]>("SUMMARY_ITEMS_SOLD_LEGACY_XLS");
  const [sourceBranchId, setSourceBranchId] = useState("");
  const [posName, setPosName] = useState("");
  const [posCode, setPosCode] = useState("");
  const [variantId, setVariantId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [mappingFilter, setMappingFilter] = useState<"ALL" | PosMappingReviewStatus>("ALL");
  const [copyFromSourceId, setCopyFromSourceId] = useState("");
  const [copyResult, setCopyResult] = useState<{ copied:number;skipped:number;eligible:number } | null>(null);
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [editMapping,setEditMapping]=useState<PosMapping|null>(null);
  const [sourceFormatConfirmed, setSourceFormatConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const refresh = async () => setSources(await inventoryWorkflowService.posSources());
  useEffect(() => {
    if (!open) return;
    void Promise.all([inventoryWorkflowService.posSources(), masterDataService.menuProducts(), masterDataService.branches()])
      .then(([nextSources, nextProducts, nextBranches]) => { setSources(nextSources); setProducts(nextProducts); setBranches(nextBranches); })
      .catch(() => setError("Unable to load POS mapping setup."));
  }, [open]);
  useEffect(() => {
    if (!sourceId) { setMappings([]); return; }
    void inventoryWorkflowService.posMappings(sourceId, mappingFilter === "ALL" ? undefined : mappingFilter).then(setMappings).catch(() => setError("Unable to load mappings."));
  }, [sourceId, mappingFilter]);
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true); setError("");
    try { await action(); await refresh(); if (sourceId) setMappings(await inventoryWorkflowService.posMappings(sourceId, mappingFilter === "ALL" ? undefined : mappingFilter)); return true; }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to save POS setup."); return false; }
    finally { setBusy(false); }
  };
  const selectedSource = sources.find((source) => source.id === sourceId) ?? null;
  const selectedVariant = products.flatMap((product) => product.variants).find((variant) => variant.id === variantId);
  return <div className="rounded-2xl border p-4" style={{ borderColor: C.border, background: C.mainBg }}>
    <button type="button" className="text-sm font-semibold" style={{ color: C.maroon }} onClick={() => setOpen((value) => !value)}>{open ? "Hide POS mapping setup" : "POS source & mapping setup"}</button>
    {open && <div className="mt-4 space-y-4 text-sm">
      <p style={{ color: C.secondary }}>Owner review only. No supplier identity or product mapping is inferred from an uploaded file.</p>
      {error && <p role="alert" style={{ color: C.red }}>{error}</p>}
      <div className="grid gap-2 md:grid-cols-5">
        <input aria-label="POS source code" placeholder="Verified source code" value={sourceCode} onChange={(event) => setSourceCode(event.target.value)} className="rounded-lg border p-2" />
        <input aria-label="POS source name" placeholder="Display name" value={sourceName} onChange={(event) => setSourceName(event.target.value)} className="rounded-lg border p-2" />
        <select aria-label="Supported POS format" value={sourceFormat} onChange={(event) => setSourceFormat(event.target.value as PosSource["supportedFormat"])} className="rounded-lg border p-2">
          <option value="SUMMARY_ITEMS_SOLD_LEGACY_XLS">Summary Items Sold XLS</option><option value="TRANSACTION_SUMMARY_XLSX">Transaction Summary XLSX</option><option value="CANONICAL_CSV">Canonical CSV</option>
        </select>
        <select aria-label="POS source branch" value={sourceBranchId} onChange={(event)=>setSourceBranchId(event.target.value)} className="rounded-lg border p-2"><option value="">Select branch</option>{branches.map((branch)=><option key={branch.id} value={branch.id}>{branch.name}</option>)}</select>
        <button type="button" disabled={busy || !sourceCode.trim() || !sourceName.trim() || !sourceBranchId} className="rounded-lg px-3 py-2 text-white disabled:opacity-50" style={{ background: C.maroon }} onClick={() => void run(async () => { await inventoryWorkflowService.createPosSource({ sourceCode, displayName: sourceName, supportedFormat: sourceFormat, branchId: sourceBranchId }); setSourceCode(""); setSourceName(""); setSourceBranchId(""); })}>Add source (inactive)</button>
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        <select aria-label="Source to review" value={sourceId} onChange={(event) => { setSourceId(event.target.value); setSourceFormatConfirmed(false); }} className="rounded-lg border p-2"><option value="">Select source</option>{sources.map((source) => <option key={source.id} value={source.id}>{source.displayName} — {source.status}</option>)}</select>
      </div>
      {selectedSource && <section aria-label="Source activation review" className="rounded-xl border p-4" style={{ borderColor: C.border, background: C.surface }}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h4 className="font-semibold">Source activation review</h4><p className="mt-1" style={{ color: C.secondary }}>{selectedSource.displayName} · {selectedSource.sourceCode} · {selectedSource.supportedFormat} · {selectedSource.branchName}</p></div>
          <StatusChip status={selectedSource.status}/>
        </div>
        {selectedSource.status === "INACTIVE" ? <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2"><input type="checkbox" checked={sourceFormatConfirmed} onChange={(event) => setSourceFormatConfirmed(event.target.checked)}/>I verified that the supplier export matches {selectedSource.supportedFormat}.</label>
          <button type="button" disabled={busy || !sourceFormatConfirmed} className="rounded-lg px-3 py-2 text-white disabled:opacity-50" style={{ background: C.maroon }} onClick={() => void run(async () => { await inventoryWorkflowService.updatePosSource(selectedSource.id, { status: "ACTIVE", confirmedSupportedFormat: selectedSource.supportedFormat }); setSourceFormatConfirmed(false); })}>Activate verified source</button>
        </div> : <div className="mt-3 flex flex-wrap items-center gap-3"><p style={{ color: C.green }}>Format verified{selectedSource.formatVerifiedByName ? ` by ${selectedSource.formatVerifiedByName}` : ""}.</p><button type="button" disabled={busy} className="rounded-lg border px-3 py-2" onClick={() => void run(() => inventoryWorkflowService.updatePosSource(selectedSource.id, { status: "INACTIVE" }))}>Deactivate source</button></div>}
      </section>}
      {sourceId && <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="font-semibold">Product and variant mapping review</h4><span style={{ color: C.secondary }}>New mappings begin as Pending.</span></div>
        <div className="flex flex-wrap items-center gap-2 rounded-xl border p-3" style={{borderColor:C.border,background:C.surface}}>
          <select aria-label="Copy mappings from source" value={copyFromSourceId} onChange={(event)=>{setCopyFromSourceId(event.target.value);setCopyResult(null);}} className="rounded-lg border p-2"><option value="">Copy approved global mappings from…</option>{sources.filter((source)=>source.id!==sourceId).map((source)=><option key={source.id} value={source.id}>{source.displayName} · {source.supportedFormat}</option>)}</select>
          <button type="button" disabled={busy||!copyFromSourceId} className="rounded-lg border px-3 py-2 font-semibold disabled:opacity-50" onClick={()=>void run(async()=>{const result=await inventoryWorkflowService.copyPosMappings(copyFromSourceId,sourceId);setCopyResult(result);})}>Copy as pending</button>
          <span style={{color:C.secondary}}>Copied mappings remain inactive until Owner review.</span>
          {copyResult&&<span role="status" className="w-full" style={{color:C.green}}>{copyResult.copied} copied · {copyResult.skipped} skipped as already present · {copyResult.eligible} eligible</span>}
        </div>
        <div className="grid gap-2 md:grid-cols-5">
          <input aria-label="Exact POS product name" placeholder="Exact POS product name" value={posName} onChange={(event) => setPosName(event.target.value)} className="rounded-lg border p-2" />
          <input aria-label="Optional POS product code" placeholder="Separate POS code (optional)" value={posCode} onChange={(event) => setPosCode(event.target.value)} className="rounded-lg border p-2" />
          <select aria-label="Mapping branch" value={branchId} onChange={(event) => setBranchId(event.target.value)} className="rounded-lg border p-2"><option value="">All branches (global)</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select>
          <select aria-label="Target product variant" value={variantId} onChange={(event) => setVariantId(event.target.value)} className="rounded-lg border p-2"><option value="">Select product / variant</option>{products.filter((product) => product.status === "ACTIVE" && product.approvalStatus === "APPROVED").flatMap((product) => product.variants.filter((variant) => variant.status === "ACTIVE").map((variant) => <option key={variant.id} value={variant.id}>{product.category} / {product.name} / {variant.name} — {variant.recipeId ? `Recipe v${variant.recipeVersion ?? 1}` : "No recipe"}</option>))}</select>
          <button type="button" disabled={busy || !posName.trim() || !variantId} className="rounded-lg px-3 py-2 text-white disabled:opacity-50" style={{ background: C.maroon }} onClick={() => void run(async () => { await inventoryWorkflowService.createPosMapping({ posSourceId: sourceId, branchId: branchId || null, sourceProductName: posName, sourceProductCode: posCode.trim() || null, menuItemVariantId: variantId }); setPosName(""); setPosCode(""); setVariantId(""); })}>Add for review</button>
        </div>
        {selectedVariant && !selectedVariant.recipeId && <p role="status" className="rounded-lg p-2" style={{ color: C.red, background: "var(--app-danger-bg)" }}>This variant has no active recipe. It may be recorded for review, but it cannot be approved.</p>}
        <div className="flex flex-wrap gap-2" aria-label="Mapping status filters">{(["ALL", "PENDING", "APPROVED", "REJECTED", "AMBIGUOUS"] as const).map((status) => <button key={status} type="button" className="rounded-full border px-3 py-1.5 font-semibold" style={{ borderColor: mappingFilter === status ? C.maroon : C.border, color: mappingFilter === status ? C.maroon : C.secondary, background: mappingFilter === status ? "var(--app-primary-soft)" : C.surface }} onClick={() => setMappingFilter(status)}>{status === "ALL" ? "All" : status.charAt(0) + status.slice(1).toLowerCase()}</button>)}</div>
        {mappings.length === 0 ? <p className="rounded-xl border p-4" style={{ borderColor: C.border, color: C.secondary }}>No {mappingFilter === "ALL" ? "" : `${mappingFilter.toLowerCase()} `}mappings for this source.</p> : <div className="overflow-x-auto rounded-xl border" style={{ borderColor: C.border }}>
          <table className="min-w-[1120px] w-full text-left"><thead style={{ background: "var(--app-surface-muted)" }}><tr><th className="p-3">POS name</th><th className="p-3">POS code</th><th className="p-3">Target product</th><th className="p-3">Target variant</th><th className="p-3">Recipe</th><th className="p-3">Branch scope</th><th className="p-3">Status</th><th className="p-3">Review</th></tr></thead>
            <tbody>{mappings.map((mapping) => {const note=reviewNotes[mapping.id]??mapping.reviewComment??"";return <tr key={mapping.id} className="border-t align-top" style={{ borderColor: C.border }}><td className="p-3 font-semibold">{mapping.sourceProductName}</td><td className="p-3">{mapping.sourceProductCode || "—"}</td><td className="p-3">{mapping.menuItemName}</td><td className="p-3">{mapping.variantName}</td><td className="p-3">{mapping.recipeAvailable ? <span style={{ color: C.green }}>Available · v{mapping.recipeVersion}</span> : <span style={{ color: C.red }}>Unavailable</span>}</td><td className="p-3">{mapping.branchName || "All branches"}</td><td className="p-3"><StatusChip status={mapping.reviewStatus}/>{mapping.reviewStatus==="APPROVED"&&mapping.status==="INACTIVE"&&<div className="mt-1 text-xs" style={{color:C.secondary}}>Inactive</div>}</td><td className="p-3"><div className="min-w-[250px] space-y-2">{mapping.reviewStatus==="PENDING"?<input aria-label={`Review note for ${mapping.sourceProductName}`} placeholder="Reason for rejection or ambiguity" value={note} onChange={(event) => setReviewNotes((current) => ({ ...current, [mapping.id]: event.target.value }))} className="w-full rounded-lg border p-2"/>:mapping.reviewComment&&<p className="rounded-lg bg-[var(--app-surface-muted)] p-2" style={{color:C.secondary}}>{mapping.reviewComment}</p>}<PosMappingActions mapping={mapping} busy={busy} canApprove={canApprovePosMapping(mapping,selectedSource)} reviewNote={note} onEdit={()=>setEditMapping(mapping)} onReview={(status)=>void run(()=>inventoryWorkflowService.reviewPosMapping(mapping.id,status,note))} onDeactivate={()=>void run(()=>inventoryWorkflowService.deactivatePosMapping(mapping.id))}/></div></td></tr>;})}</tbody>
          </table>
        </div>}
      </div>}
    </div>}
    {editMapping&&<PosMappingEditDialog
      key={editMapping.id}
      mapping={editMapping}
      products={products}
      branches={branches}
      busy={busy}
      onCancel={()=>setEditMapping(null)}
      onSave={(input)=>void run(()=>inventoryWorkflowService.revisePendingPosMapping(editMapping.id,input)).then(saved=>{if(saved)setEditMapping(null);})}
    />}
  </div>;
}

// ─── Sales Analysis ────────────────────────────────────────────────────────────
function SalesAnalysis({ role, scopeBranchName = "All Branches" }: { role: Role; scopeBranchName?: string }) {
  const { user } = useAuth();
  const localToday = businessDate();
  const initialMonthStart = `${localToday.slice(0, 8)}01`;
  const [uploadStep, setUploadStep] = useState<"idle" | "select" | "preview" | "done">("idle");
  const [posPreview, setPosPreview] = useState<PosImportPreview | null>(null);
  const [posCsvText, setPosCsvText] = useState("");
  const [posExcelFile, setPosExcelFile] = useState<File | null>(null);
  const [posFilename, setPosFilename] = useState("");
  const [posSources, setPosSources] = useState<PosSource[]>([]);
  const [selectedPosSourceId, setSelectedPosSourceId] = useState("");
  const [posImportError, setPosImportError] = useState("");
  const [posImporting, setPosImporting] = useState(false);
  const [stagedFile, setStagedFile] = useState<File | null>(null);
  const [posValidating, setPosValidating] = useState(false);
  const [posConsumption, setPosConsumption] = useState<{ name: string; unit: string; expectedConsumption: number }[]>([]);
  const [posImportResult, setPosImportResult] = useState<{ rowsImported: number; productsMatched: number; totalQuantitySold: number; totalSales: number; businessDate: string; fingerprintIndicator: string; pricing: PosImportPreview["pricing"]; reconciliation:PosImportReconciliation } | null>(null);
  const [posImports, setPosImports] = useState<PosImportRecord[]>([]);
  const [posHistoryLoading, setPosHistoryLoading] = useState(true);
  const [posHistoryPage, setPosHistoryPage] = useState(1);
  const [posHistoryTotal, setPosHistoryTotal] = useState(0);
  const [historyRefresh, setHistoryRefresh] = useState(0);
  const [monitoringStart,setMonitoringStart]=useState(addDateDays(localToday,-6));
  const [monitoringEnd,setMonitoringEnd]=useState(localToday);
  const [dailyPosStatuses,setDailyPosStatuses]=useState<DailyPosUploadStatus[]>([]);
  const [dailyPosLoading,setDailyPosLoading]=useState(false);
  const [dailyPosError,setDailyPosError]=useState("");
  const [monitoringSourceId,setMonitoringSourceId]=useState("ALL");
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
  useEffect(() => {
    if (role !== "manager" && role !== "owner") return;
    void inventoryWorkflowService.posSources().then(setPosSources).catch(() => setPosSources([]));
  }, [role]);

  useEffect(() => { if (role === "owner") setPosBranchFilter(scopeBranchName); }, [role, scopeBranchName]);
  useEffect(() => { setMonitoringSourceId("ALL"); }, [posBranchFilter]);
  useEffect(() => {
    const handleDataChanged = () => setHistoryRefresh((value) => value + 1);
    window.addEventListener("libro-data-changed", handleDataChanged);
    return () => window.removeEventListener("libro-data-changed", handleDataChanged);
  }, []);

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
  useEffect(()=>{
    if(tab!=="import_history")return;
    let cancelled=false;
    const branchId=role==="owner"?branches.find((branch)=>branch.name===posBranchFilter)?.id:undefined;
    setDailyPosLoading(true);setDailyPosError("");
    void inventoryWorkflowService.dailyPosStatus({startDate:monitoringStart,endDate:monitoringEnd,branchId})
      .then((result)=>{if(!cancelled)setDailyPosStatuses(result.statuses);})
      .catch((reason)=>{if(!cancelled){setDailyPosStatuses([]);setDailyPosError(reason instanceof Error?reason.message:"Unable to load daily upload monitoring.");}})
      .finally(()=>{if(!cancelled)setDailyPosLoading(false);});
    return()=>{cancelled=true;};
  },[branches,historyRefresh,monitoringEnd,monitoringStart,posBranchFilter,role,tab]);
  const monitoringSources=Array.from(new Map(dailyPosStatuses.filter((row)=>row.posSourceId).map((row)=>[row.posSourceId!,row.posSourceName??row.sourceCode??"POS Source"])).entries());
  const visibleDailyStatuses=filterDailyPosStatuses(dailyPosStatuses,monitoringSourceId);
  const productCategories = [...new Set((analytics?.products ?? []).map((product) => product.category))];
  const visibleProducts = (analytics?.products ?? []).filter((product) => {
    const matchesCategory = productCategory === "All Categories" || product.category === productCategory;
    const query = productSearch.trim().toLowerCase();
    return matchesCategory && (!query || product.name.toLowerCase().includes(query));
  });

  const handleFileChosen = (file: File | undefined) => {
    if (!file) return;
    setPosImportError("");
    if (file.size > 4_000_000) {
      setPosImportError("POS files must be 4 MB or smaller.");
      return;
    }
    const extension = file.name.toLowerCase().split(".").pop();
    if (!extension || !isSupportedPosFilename(file.name)) {
      setPosImportError("Select a CSV, XLS, or XLSX POS file.");
      return;
    }
    setStagedFile(file);
  };

  const validatePosFile = async (fileToValidate?: File | null) => {
    const file = fileToValidate ?? stagedFile;
    if (!file) {
      setPosImportError("Please select a POS file first.");
      return;
    }
    setPosImportError("");
    setPosValidating(true);
    try {
      if (file.size > 4_000_000) throw new Error("POS files must be 4 MB or smaller.");
      const extension = file.name.toLowerCase().split(".").pop();
      if (!extension || !isSupportedPosFilename(file.name)) throw new Error("Select a CSV, XLS, or XLSX POS file.");
      let csvText = "";
      const preview = extension === "csv"
        ? await (async () => {
            csvText = await file.text();
            if (hasInvalidCsvEncoding(csvText)) throw new Error("The CSV contains unsupported or invalid text encoding. Export it as UTF-8 and try again.");
            return inventoryWorkflowService.previewPosSales({ sourceFilename: file.name, csvText });
          })()
        : await inventoryWorkflowService.previewPosSales({ sourceFilename: file.name, file, posSourceId: selectedPosSourceId || undefined });
      setPosPreview(preview);
      setPosCsvText(csvText);
      setPosExcelFile(extension === "csv" ? null : file);
      setPosFilename(file.name);
      setUploadStep("preview");
    } catch (reason) {
      setPosPreview(null);
      setPosCsvText("");
      setPosExcelFile(null);
      setPosImportError(reason instanceof Error ? reason.message : "Unable to read the POS file.");
    } finally {
      setPosValidating(false);
    }
  };

  const confirmPosImport = async () => {
    if (!posPreview?.summary.canImport || (!posCsvText && !posExcelFile)) return;
    setPosImporting(true); setPosImportError("");
    try {
      const result = await inventoryWorkflowService.importPosSales(posExcelFile
        ? { sourceFilename: posFilename, file: posExcelFile, posSourceId: selectedPosSourceId || undefined, expectedContentHash: posPreview.contentHash, expectedResolutionFingerprint: posPreview.resolutionFingerprint }
        : { sourceFilename: posFilename, csvText: posCsvText, expectedContentHash: posPreview.contentHash });
      setPosConsumption(result.consumption);
      setPosImportResult(result);
      setPosHistoryPage(1);
      setHistoryRefresh(value=>value+1);
      setUploadStep("done");
      window.dispatchEvent(new CustomEvent("libro-data-changed", { detail: { businessDate: result.businessDate } }));
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
      window.dispatchEvent(new CustomEvent("libro-data-changed"));
    }catch(reason){toast.error(reason instanceof Error?reason.message:"Unable to delete the POS import.");}
    finally{setDeletingImport(false);}
  };

  return (
    <div className="p-4 md:p-6 space-y-5">
      <SectionHeader title="Sales Analysis"
        sub={`${branchLabel} · ${periodLabel}`}
        actions={
          <>
            {role === "manager" && <Btn variant="primary" icon={Upload} onClick={() => setUploadStep("select")}>Import POS File</Btn>}
            {role === "owner" && <Select options={["All Branches", ...branches.map((branch) => branch.name)]} value={posBranchFilter} onChange={value=>{setPosBranchFilter(value);setPosHistoryPage(1);}} small />}
            <DashboardFilters range={range} comparison={comparison} customStart={customStart} customEnd={customEnd}
              onRangeChange={setRange} onComparisonChange={setComparison}
              onApplyCustom={(start, end) => { setCustomStart(start); setCustomEnd(end); }}
              onReset={() => { setRange("mtd"); setCustomStart(initialMonthStart); setCustomEnd(localToday); }} />
          </>
        } />

      {role === "owner" && <PosMappingSetup />}

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

      {tab === DAILY_POS_MONITORING_LOCATION && (<div className="space-y-4">
        <section aria-label="Daily Upload Monitoring" className="rounded-2xl border p-4" style={{borderColor:C.border,background:C.surface}}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><h3 className="font-semibold" style={{color:C.primary}}>Daily Upload Monitoring</h3><p className="mt-1 text-xs" style={{color:C.secondary}}>Expected branch/POS uploads compared with committed imports. The 10:00 PM reminder does not mark today as missing.</p></div>
            <div className="flex flex-wrap gap-2">
              <CalendarDateField label="From" value={monitoringStart} max={monitoringEnd} onChange={(value)=>value&&setMonitoringStart(value)}/>
              <CalendarDateField label="To" value={monitoringEnd} min={monitoringStart} max={localToday} onChange={(value)=>value&&setMonitoringEnd(value)}/>
              {role === "owner" && <Select ariaLabel="Monitoring branch" options={["All Branches", ...branches.map((branch) => branch.name)]} value={posBranchFilter} onChange={value=>{setPosBranchFilter(value);setPosHistoryPage(1);}} />}
              <Select ariaLabel="Monitoring POS source" options={[{value:"ALL",label:"All POS Sources"},...monitoringSources.map(([value,label])=>({value,label}))]} value={monitoringSourceId} onChange={setMonitoringSourceId}/>
            </div>
          </div>
          {dailyPosError&&<p role="alert" className="mt-3 text-sm" style={{color:C.red}}>{dailyPosError}</p>}
          <div className="mt-3 overflow-x-auto"><table className="data-table w-full min-w-[900px] text-sm"><thead><tr>{role==="owner"&&<th>Branch</th>}<th>POS Source</th><th>Business Date</th><th>Upload Status</th><th>Uploaded File</th><th>Uploaded By</th><th>Uploaded Date / Time</th>{role==="manager"&&<th>Action</th>}</tr></thead><tbody>
            {dailyPosLoading?<tr><td colSpan={role==="owner"?7:7}>Loading daily upload monitoring…</td></tr>:visibleDailyStatuses.length===0?<tr><td colSpan={role==="owner"?7:7}>No monitoring rows found for this date range.</td></tr>:visibleDailyStatuses.map((row)=><tr key={`${row.businessDate}-${row.branchId}-${row.posSourceId??"none"}`}>
              {role==="owner"&&<td className="font-semibold">{row.branchName}</td>}<td>{row.posSourceName??"Not configured"}</td><td>{formatAppDate(row.businessDate)}</td><td><StatusChip status={dailyPosStatusLabel(row.status).toLowerCase()}/></td><td>{row.sourceFilename??"—"}</td><td>{row.uploadedBy??"—"}</td><td>{row.importedAt?formatAppDate(row.importedAt,true):"—"}</td>
              {role==="manager"&&<td>{row.posSourceId&&(row.status==="DUE_TODAY"||row.status==="MISSING_UPLOAD")?<Btn variant="outline" onClick={()=>void inventoryWorkflowService.declareClosedPosDay(row.businessDate,"Branch closed / no sales declared by Manager").then(()=>setHistoryRefresh((value)=>value+1)).catch((reason)=>setDailyPosError(reason instanceof Error?reason.message:"Unable to record the closed day."))}>Record No Sales / Closed</Btn>:"—"}</td>}
            </tr>)}
          </tbody></table></div>
        </section>
        <TableCard
          title="Actual POS Import History"
          subtitle={`Audit log of imported daily sales files for ${branchLabel}`}
          toolbar={
            <>
              <SearchInput placeholder="Search imports…" value={posImportSearch} onChange={value=>{setPosImportSearch(value);setPosHistoryPage(1);}} />
              {role === "owner" && <Select options={["All Branches", ...branches.map((branch) => branch.name)]} value={posBranchFilter} onChange={value=>{setPosBranchFilter(value);setPosHistoryPage(1);}} />}
            </>
          }
        >
          <TableWrapper minWidth={1080}>
            <THead cols={role === "owner" ? OWNER_POS_IMPORT_HISTORY_COLUMNS : MANAGER_POS_IMPORT_HISTORY_COLUMNS} />
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
                  <TD center>{row.validRows + row.warningRows} / {row.totalRows}</TD>
                  <TD right>{row.unitsSold.toLocaleString()}</TD>
                  <TD right>{formatPeso(row.totalSales)}</TD>
                  <TD center mono>{row.fingerprintIndicator ?? "Legacy"}</TD>
                  <TD center>
                    {row.status === "NEEDS_REVIEW" ? (
                      <span
                        className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap border"
                        style={{
                          background: C.amberBg,
                          color: C.amber,
                          borderColor: `color-mix(in srgb, ${C.amber} 25%, transparent)`,
                        }}
                      >
                        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: C.amber }} />
                        <span>Imported · Warnings</span>
                      </span>
                    ) : (
                      <StatusChip status={(row.status as string) === "REJECTED" ? "rejected" : "imported"} />
                    )}
                  </TD>
                  {canDeletePosImport(role)&&<TD center><button type="button" aria-label={`Delete import ${row.sourceFilename}`} onClick={()=>setDeleteTarget(row)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--app-border)] text-[var(--app-danger)] transition-colors hover:bg-[var(--app-danger-bg)]"><Trash2 size={15}/></button></TD>}
                </TR>
              ))}
            </tbody>
          </TableWrapper>
          <Pagination total={posHistoryTotal} page={posHistoryPage} perPage={10} onPageChange={setPosHistoryPage} />
        </TableCard>
      </div>)}

      {deleteTarget&&canDeletePosImport(role)&&(
        <PosImportDeleteDialog target={deleteTarget} deleting={deletingImport} onCancel={()=>setDeleteTarget(null)} onConfirm={()=>void deleteImport()}/>
      )}

      {/* POS File Upload Modal */}
      {role === "manager" && uploadStep !== "idle" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.45)" }}>
          <div role="dialog" aria-modal="true" aria-labelledby="pos-upload-title" className="rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] overflow-y-auto p-6" style={{ background: "var(--app-surface)", border: `1px solid ${C.border}` }}>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 id="pos-upload-title" className="font-bold text-lg" style={{ color: C.primary }}>Upload POS Sales File</h3>
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
                <div className="mb-4">
                  <label htmlFor="pos-source-select" className="block text-sm font-semibold mb-2" style={{ color: C.primary }}>POS source for Excel imports</label>
                  <select id="pos-source-select" value={selectedPosSourceId} onChange={(event) => setSelectedPosSourceId(event.target.value)} className="w-full rounded-xl border px-3 py-2 text-sm" style={{ borderColor: C.border, background: C.mainBg, color: C.primary }}>
                    <option value="">Select a verified POS source</option>
                    {posSources.filter((source) => source.status === "ACTIVE").map((source) => <option key={source.id} value={source.id}>{source.displayName} ({source.supportedFormat.replaceAll("_", " ")})</option>)}
                  </select>
                  <p className="mt-2 text-xs" style={{ color: C.secondary }}>{posSources.some((source) => source.status === "ACTIVE") ? "CSV imports keep their current direct matching. Excel requires a reviewed source and product/variant mappings." : "No verified POS source is configured. Excel files may be previewed, but cannot be confirmed until an Owner configures the source and mappings."}</p>
                </div>
                <label className="block border-2 border-dashed rounded-xl p-8 text-center mb-4 cursor-pointer transition-all"
                  style={{ borderColor: stagedFile ? C.maroon : C.border, background: stagedFile ? "rgba(128,0,32,0.03)" : "transparent" }}>
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-3" style={{ background: C.grayBg }}>
                    <Upload size={20} style={{ color: stagedFile ? C.maroon : C.muted }} />
                  </div>
                  {stagedFile ? (
                    <>
                      <p className="text-sm font-semibold" style={{ color: C.primary }}>{stagedFile.name}</p>
                      <p className="text-xs mt-1" style={{ color: C.secondary }}>{(stagedFile.size / 1024).toFixed(1)} KB · File ready. Click Proceed to validate.</p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm font-semibold" style={{ color: C.primary }}>Drop your POS CSV or Excel file here</p>
                      <p className="text-xs mt-1" style={{ color: C.secondary }}>Accepted formats: CSV, XLS, and XLSX. Product-level quantity, selling price, and business date are required for import.</p>
                    </>
                  )}
                  <input type="file" accept=".csv,.xls,.xlsx,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" onChange={(event) => { handleFileChosen(event.target.files?.[0]); event.target.value = ""; }} />
                </label>
                {posImportError && <div className="mb-4 p-3 rounded-xl text-sm" style={{ color: C.red, background: C.redBg }}>{posImportError}</div>}
                <div className="flex gap-3">
                  <Btn variant="outline" onClick={() => { setUploadStep("idle"); setStagedFile(null); }}>Cancel</Btn>
                  {stagedFile ? (
                    <button
                      disabled={posValidating}
                      className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-50"
                      style={{ background: C.maroon }}
                      onClick={() => void validatePosFile(stagedFile)}
                    >
                      {posValidating ? "Validating…" : "Proceed"}
                    </button>
                  ) : (
                    <label className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white text-center cursor-pointer" style={{ background: C.maroon }}>
                      Select File<input type="file" accept=".csv,.xls,.xlsx,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" onChange={(event) => { handleFileChosen(event.target.files?.[0]); event.target.value = ""; }} />
                    </label>
                  )}
                </div>
              </>
            )}

            {uploadStep === "preview" && (
              <>
                <div className="p-4 rounded-xl border mb-4" style={{ borderColor: C.border, background: C.mainBg }}>
                  <p className="text-sm font-semibold mb-3" style={{ color: C.primary }}>Validation Summary</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                    {[
                      ["Valid Rows", String(posPreview?.summary.validRows ?? posPreview?.summary.sellableRows ?? 0)],
                      ["Operational Rows Excluded", String(posPreview?.summary.operationalRows ?? 0)],
                      ["Invalid Rows", String((posPreview?.summary.invalidRows ?? 0) + (posPreview?.summary.unknownReviewRows ?? 0))],
                      ["Estimated Sales", formatPeso(posPreview?.simulation.estimatedSales ?? 0)],
                      ["Estimated COGS", formatPeso(posPreview?.simulation.estimatedCogs ?? 0)],
                      ["Estimated Gross Profit", formatPeso(posPreview?.simulation.estimatedGrossProfit ?? 0)],
                      ["Estimated Gross Margin", `${(posPreview?.simulation.estimatedGrossMargin ?? 0).toFixed(2)}%`],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-xl border p-3" style={{ borderColor: C.border, background: C.surface }}>
                        <span className="block text-xs" style={{ color: C.secondary }}>{label}</span>
                        <span className="mt-1 block font-semibold" style={{ color: C.primary }}>{value}</span>
                      </div>
                    ))}
                  </div>
                  <PosPricingNotice notice={posPreview?.pricing.notice} />
                   <div className="mt-4 pt-3 border-t overflow-x-auto" style={{ borderColor: C.border }}><table className="w-full text-xs min-w-[1260px]"><thead><tr>{["Row","Original POS Product","Classification","POS Code","Resolved Product","Variant","Recipe Version","Mapping Status","Mapping Scope","Quantity","Unit Price","Sales Amount","Sales Date","Validation Status","Issue"].map((heading)=><th key={heading} className="text-left px-2 py-2" style={{ color: C.secondary }}>{heading}</th>)}</tr></thead><tbody>{posPreview?.rows.map((row,index)=><tr key={`${row.sourceWorksheet ?? "source"}-${row.sourceRow ?? row.rowNumber}-${index}`} className="border-t" style={{ borderColor: C.border }}><td className="px-2 py-2">{row.sourceWorksheet ? `${row.sourceWorksheet}!${row.sourceRow ?? row.rowNumber}` : row.rowNumber}</td><td className="px-2 py-2">{row.sourceProduct || "Blank"}</td><td className="px-2 py-2 font-semibold">{row.itemClassification?.replaceAll("_", " ") ?? "UNKNOWN REVIEW"}</td><td className="px-2 py-2">{row.sourceProductId ?? "—"}</td><td className="px-2 py-2">{row.matchedMenuProduct ?? "—"}</td><td className="px-2 py-2">{row.matchedVariant ?? "—"}</td><td className="px-2 py-2">{row.recipeVersion ? `v${row.recipeVersion}` : "—"}</td><td className="px-2 py-2">{row.mappingStatus ?? "Unmatched"}</td><td className="px-2 py-2">{row.mappingScope ?? "—"}</td><td className="px-2 py-2">{row.quantitySold ?? "Invalid"}</td><td className="px-2 py-2">{row.unitPrice == null ? "Unavailable" : <>{`₱${row.unitPrice.toFixed(2)}`}{row.pricingSource === "MENU_VARIANT_CAPSTONE_FALLBACK" && <span className="block" style={{ color: C.amber }}>Menu price</span>}</>}</td><td className="px-2 py-2">{posSalesAmountLabel(row)}</td><td className="px-2 py-2">{row.businessDate ?? "Invalid"}</td><td className="px-2 py-2 font-semibold" style={{ color: row.itemClassification === "OPERATIONAL_ITEM" ? C.secondary : row.status === "INVALID" ? C.red : row.status === "WARNING" ? C.amber : C.green }}>{row.itemClassification === "OPERATIONAL_ITEM" ? "EXCLUDED" : row.status}</td><td className="px-2 py-2 max-w-xs">{row.issues.join(" ") || "Ready"}</td></tr>)}</tbody></table></div>
                </div>
                {posImportError && <div className="mb-4 p-3 rounded-xl text-sm" style={{ color: C.red, background: C.redBg }}>{posImportError}</div>}
                <div className="flex items-center gap-2 mb-4 p-3 rounded-xl" style={{ background: posPreview?.summary.canImport ? C.greenBg : C.redBg }}>
                  <CheckCircle size={14} style={{ color: posPreview?.summary.canImport ? C.green : C.red }} />
                  <span className="text-sm font-medium" style={{ color: posPreview?.summary.canImport ? C.green : C.red }}>{posPreview?.summary.canImport ? "Validation complete. Review warnings, then confirm the atomic import." : posPreview?.importBlockedReason ?? "POS import cannot continue until invalid, unmatched, or duplicate data is corrected."}</span>
                </div>
                <div className="flex gap-3">
                  <Btn variant="outline" onClick={() => setUploadStep("select")}>Back</Btn>
                  <button
                    disabled={posImporting || !posPreview?.summary.canImport}
                    className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-50"
                    style={{ background: C.maroon }}
                    onClick={() => void confirmPosImport()}
                  >
                    {posImporting ? "Importing…" : "Import Sales"}
                  </button>
                </div>
              </>
            )}

            {uploadStep === "done" && (
              <>
                <div className="text-center py-8">
                  <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: C.greenBg }}>
                    <CheckCircle size={32} style={{ color: C.green }} />
                  </div>
                  <h4 className="font-bold text-lg mb-1" style={{ color: C.primary }}>Import Completed</h4>
                  <p className="text-sm" style={{ color: C.secondary }}>{posImportResult?.rowsImported ?? 0} sales rows were connected to their configured recipes.</p>
                  <p className="text-xs mt-1" style={{ color: C.muted }}>{posFilename} · {posImportResult?.businessDate ?? ""}</p>
                  <div className="grid grid-cols-2 gap-2 mt-4 text-left text-xs">{[["Rows Imported",posImportResult?.rowsImported ?? 0],["Products Matched",posImportResult?.productsMatched ?? 0],["Total Quantity",posImportResult?.totalQuantitySold ?? 0],["Total Sales",`₱${(posImportResult?.totalSales ?? 0).toLocaleString("en-PH",{minimumFractionDigits:2})}`]].map(([label,value])=><div key={label} className="p-2 rounded-lg" style={{ background:C.mainBg }}><span style={{color:C.secondary}}>{label}: </span><strong>{value}</strong></div>)}</div>
                  <div className="mt-4"><PosPricingNotice notice={posImportResult?.pricing.notice} /></div>
                  {posImportResult?.reconciliation&&<div className="mt-4 rounded-xl border p-3 text-left text-xs" style={{borderColor:C.border}}><p className="font-bold uppercase tracking-wide" style={{color:C.secondary}}>POS Import Reconciliation Report</p><div className="mt-2 grid grid-cols-2 gap-2">{[["Sales total",posImportResult.reconciliation.salesTotalMatches],["Quantity",posImportResult.reconciliation.quantityMatches],["Recipe consumption",posImportResult.reconciliation.recipeConsumptionMatches],["COGS",posImportResult.reconciliation.cogsMatches],["Branch isolation",posImportResult.reconciliation.branchIsolated]].map(([label,passed])=><div key={String(label)}><span>{label}: </span><strong style={{color:passed?C.green:C.red}}>{passed?"MATCHED":"FAILED"}</strong></div>)}</div></div>}
                  <div className="mt-4 p-3 rounded-xl text-left space-y-1.5" style={{ background: C.mainBg }}>
                    <p className="text-xs font-bold uppercase tracking-wide" style={{ color: C.secondary }}>Expected ingredient consumption</p>
                    {posConsumption.map((item) => <div key={`${item.name}-${item.unit}`} className="flex justify-between text-xs"><span>{item.name}</span><strong>{item.expectedConsumption.toFixed(2)} {item.unit}</strong></div>)}
                  </div>
                </div>
                <button className="w-full py-2.5 rounded-xl text-sm font-bold text-white" style={{ background: C.maroon }}
                  onClick={() => {
                    const importedDate = posImportResult?.businessDate;
                    setUploadStep("idle");
                    setStagedFile(null);
                    setPosPreview(null);
                    setPosCsvText("");
                    setPosExcelFile(null);
                    setPosConsumption([]);
                    setPosImportResult(null);
                    setPosFilename("");
                    toast.success("POS sales imported successfully");
                    window.dispatchEvent(new CustomEvent("libro-data-changed", { detail: { businessDate: importedDate } }));
                  }}>
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
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    const handleDataChanged = () => setRefresh((value) => value + 1);
    window.addEventListener("libro-data-changed", handleDataChanged);
    return () => window.removeEventListener("libro-data-changed", handleDataChanged);
  }, []);

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
  }, [branchFilter, branches, customEnd, customStart, range, role, refresh]);

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
