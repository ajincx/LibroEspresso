import React, { lazy, Suspense, useEffect, useState } from "react";
import { ShoppingCart, Package, TrendingDown, Search, X, Upload, Check, Coffee, CheckCircle, TrendingUp, DollarSign, GitCompare, BarChart2, Hash, Percent, Trash2, Building2, Layers, GitBranch, ArrowRight, Copy, Eye, Info, ShieldCheck } from "lucide-react";
import { Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart } from "recharts";
import { C, CalendarDateField, DashboardRange, DashboardComparison, dashboardPeriodLabel, formatPeso, isModalBackdropEvent, StatusChip, KPICard, Card, SectionHeader, Btn, SearchInput, Select, DashboardFilters, THead, TR, TD, Pagination, ChartTip, ModuleTabSwitcher, AnimatedTabPanel, SkeletonBlock, TableCard, TableWrapper, TableEmptyRow, TableLoadingRow } from "../../components/ModuleUi";
import { toast } from "sonner";
import type { Page, Role } from "../../types/navigation";
import { inventoryWorkflowService } from "../../services/inventoryWorkflow.service";
import { masterDataService } from "../../services/masterData.service";
import { controlledActionService } from "../../services/controlledAction.service";
import { ControlledActionDialog } from "../../components/ControlledActionDialog";
import type { DailyPosUploadStatus, PosAnalytics, PosFieldMapping, PosFormatSetupRequest, PosHeaderInspection, PosImportRecord, PosMapping, PosMappingReviewStatus, PosSource } from "../../types/inventoryWorkflow";
import type { Branch, MenuProduct } from "../../types/masterData";
import { useAuth } from "../../contexts/AuthContext";
import { addDateDays, businessDate, periodDates, adjustRangeForAutomaticImport } from "../../utils/businessDate";
import { formatAppDate } from "../../utils/appPreferences";
import { useSearchParams } from "react-router";
import { excludedInvalidRowCount } from "./posImportPresentation";
import { PosImportModal } from "./PosImportModal";

export const SalesPosImportModal = PosImportModal;
export const marginValueColor = (margin:number) => margin > 0 ? C.green : margin < 0 ? C.red : "var(--app-text-muted)";
function AnalyticsChartLoading({ label }: { label: string }) {
  return <div className="flex h-full items-end gap-3 px-4 pb-3" aria-label={label}>{[42,68,52,82,61,76,56,70].map((height,index)=><SkeletonBlock key={index} w={1} h={`${height}%`} className="min-w-0 flex-1 rounded-t-lg rounded-b-sm"/>)}</div>;
}
function AnalyticsListLoading({ label }: { label: string }) {
  return <div className="space-y-4" aria-label={label}>{["92%","78%","86%","70%","82%"].map((width,index)=><div key={index}><div className="flex justify-between gap-3"><SkeletonBlock w={width} h={12}/><SkeletonBlock w={44} h={12}/></div><SkeletonBlock h={6} className="mt-2 rounded-full"/></div>)}</div>;
}
export const isOwnerRole = (role?: string | null) => role?.toLowerCase() === "owner";
export const canDeletePosImport = (role: Role | string, record: Pick<PosImportRecord, "canCleanup">) => isOwnerRole(role) && Boolean(record?.canCleanup);
export const canAuthorizePosImportCleanup = (role: Role | string, record: Pick<PosImportRecord, "canAuthorizeCleanup">) => isOwnerRole(role) && Boolean(record?.canAuthorizeCleanup);
export const canDeletePosSource = (
  role: Role | string | undefined | null,
  source: Pick<PosSource, "status"> & Partial<Pick<PosSource, "hasImports" | "hasSales" | "hasActiveMappings">>
) => {
  return isOwnerRole(role)
    && source.status === "INACTIVE"
    && !source.hasImports
    && !source.hasSales
    && !source.hasActiveMappings;
};
export function PosImportActions({
  role,
  record,
  onView,
  onAuthorize,
  onDelete,
}: {
  role: Role | string;
  record: Pick<PosImportRecord, "canCleanup" | "canAuthorizeCleanup" | "sourceFilename">;
  onView?: () => void;
  onAuthorize?: () => void;
  onDelete?: () => void;
}) {
  const canAuthorize = canAuthorizePosImportCleanup(role, record);
  const canDelete = canDeletePosImport(role, record);
  return (
    <div className="flex justify-center gap-2">
      <button type="button" aria-label={`View details ${record.sourceFilename}`} onClick={onView} className="inline-flex items-center gap-1 rounded-lg border border-[var(--app-border)] px-2 py-1 text-xs font-semibold">
        <Eye size={14}/> View Details
      </button>
      {canAuthorize && (
        <button
          type="button"
          aria-label={`Authorize cleanup ${record.sourceFilename}`}
          onClick={onAuthorize}
          className="rounded-lg border border-[var(--app-border)] px-2 py-1 text-xs font-semibold"
        >
          Authorize
        </button>
      )}
      {canDelete && (
        <button
          type="button"
          aria-label={`Delete import ${record.sourceFilename}`}
          title="Delete import"
          onClick={onDelete}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--app-border)] text-[var(--app-danger)] transition-colors hover:bg-[var(--app-danger-bg)]"
        >
          <Trash2 size={15} />
        </button>
      )}
    </div>
  );
}
export const DAILY_POS_MONITORING_LOCATION="import_history" as const;
export const DAILY_POS_MONITORING_IS_PAGINATED=false;
export const OWNER_POS_IMPORT_HISTORY_COLUMNS=["File Name","Branch","Business Date","Uploaded Date / Time","Uploaded By","Processed / Total Rows","Units Sold","Total Sales","Fingerprint","Status","Action"];
export const MANAGER_POS_IMPORT_HISTORY_COLUMNS=OWNER_POS_IMPORT_HISTORY_COLUMNS.filter((column)=>column!=="Branch");
export const dailyPosStatusLabel = (status:DailyPosUploadStatus["status"]) => ({
  UPLOADED:"Uploaded",DUE_TODAY:"Due Today",MISSING_UPLOAD:"Missing Upload",LATE_UPLOAD:"Late Upload",UPCOMING:"Upcoming",
  NO_SALES_CLOSED:"No Sales / Closed",POS_SOURCE_NOT_CONFIGURED:"POS Source Not Configured",
})[status];
export const DAILY_POS_MONITORING_COLUMNS=["Branch","Business Date","Upload Status","Uploaded File","Uploaded By","Uploaded Date / Time"] as const;
export type DailyPosMonitoringMode="current"|"history";
export function dailyPosMonitoringView(mode:DailyPosMonitoringMode,currentBusinessDate:string,historyBusinessDate:string){
  const businessDate=mode==="current"?currentBusinessDate:historyBusinessDate;
  return {
    businessDate,
    startDate:businessDate,
    endDate:businessDate,
    showDateFilter:mode==="history",
    title:mode==="history"?"Daily Upload Monitoring — History":"Daily Upload Monitoring",
    actionLabel:mode==="history"?"Back to Current":"View History",
  } as const;
}
export type DailyPosBranchSummary=Pick<DailyPosUploadStatus,"branchId"|"branchName"|"businessDate"|"status"|"sourceFilename"|"uploadedBy"|"importedAt"|"closed">&{requiredSourceCount:number;completedSourceCount:number};
export function summarizeDailyPosStatuses(rows:DailyPosUploadStatus[]):DailyPosBranchSummary[]{
  const groups=new Map<string,DailyPosUploadStatus[]>();
  for(const row of rows){const key=`${row.businessDate}:${row.branchId}`;groups.set(key,[...(groups.get(key)??[]),row]);}
  return Array.from(groups.values()).map((group)=>{
    const first=group[0]!;
    const required=group.filter((row)=>Boolean(row.posSourceId));
    const completed=required.filter((row)=>Boolean(row.importId));
    const closed=group.some((row)=>row.closed||row.status==="NO_SALES_CLOSED");
    let status:DailyPosUploadStatus["status"];
    if(required.length===0)status="POS_SOURCE_NOT_CONFIGURED";
    else if(closed)status="NO_SALES_CLOSED";
    else if(completed.length===required.length)status=required.some((row)=>row.status==="LATE_UPLOAD")?"LATE_UPLOAD":"UPLOADED";
    else if(group.some((row)=>row.status==="MISSING_UPLOAD"||row.status==="LATE_UPLOAD"))status="MISSING_UPLOAD";
    else if(group.some((row)=>row.status==="DUE_TODAY"))status="DUE_TODAY";
    else status="UPCOMING";
    const filenames=Array.from(new Set(completed.map((row)=>row.sourceFilename).filter((value):value is string=>Boolean(value))));
    const uploaders=Array.from(new Set(completed.map((row)=>row.uploadedBy).filter((value):value is string=>Boolean(value))));
    const importedAt=completed.map((row)=>row.importedAt).filter((value):value is string=>Boolean(value)).sort().at(-1)??null;
    return {branchId:first.branchId,branchName:first.branchName,businessDate:first.businessDate,status,sourceFilename:filenames.length?filenames.join(", "):null,uploadedBy:uploaders.length?uploaders.join(", "):null,importedAt,closed,requiredSourceCount:required.length,completedSourceCount:completed.length};
  });
}
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
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" role="dialog" aria-modal="true" aria-labelledby="edit-pos-mapping-title" onMouseDown={(event)=>{if(isModalBackdropEvent(event))onCancel();}}>
    <form className="w-full max-w-xl rounded-2xl border bg-[var(--app-surface)] p-6 shadow-2xl" style={{borderColor:C.border}} onSubmit={(event)=>{event.preventDefault();onSave({branchId:branchId||null,sourceProductCode:posCode.trim()||null,menuItemId:productId,menuItemVariantId:variantId,...(revisionReason.trim()?{revisionReason:revisionReason.trim()}:{})});}}>
      <h3 id="edit-pos-mapping-title" className="text-lg font-bold">Edit Pending Mapping</h3>
      <p className="mt-1 text-sm" style={{color:C.secondary}}>Saving returns this mapping to Pending Approval. It will not be activated automatically.</p>
      <div className="mt-5 grid gap-4">
        <label className="grid gap-1 text-sm font-semibold">POS Name<input aria-label="POS Name" readOnly value={mapping.sourceProductName} className="rounded-lg border bg-[var(--app-surface-muted)] p-2 font-normal"/></label>
        <label className="grid gap-1 text-sm font-semibold">POS Code<input aria-label="Edit POS code" value={posCode} onChange={event=>setPosCode(event.target.value)} className="rounded-lg border p-2 font-normal" placeholder="Optional POS code"/></label>
        <label className="grid gap-1 text-sm font-semibold">Branch Scope<Select aria-label="Edit mapping branch" value={branchId} onChange={setBranchId} options={[{value:"",label:"All branches"},...branches.map(branch=>({value:branch.id,label:branch.name}))]}/></label>
        <label className="grid gap-1 text-sm font-semibold">Target Product<Select aria-label="Edit target product" value={productId} onChange={value=>{setProductId(value);setVariantId("");}} options={[{value:"",label:"Select product"},...eligibleProducts.map(product=>({value:product.id,label:`${product.category} / ${product.name}`}))]} searchable searchPlaceholder="Search products…"/></label>
        <label className="grid gap-1 text-sm font-semibold">Target Variant<Select aria-label="Edit target variant" value={variantId} onChange={setVariantId} options={[{value:"",label:"Select variant"},...variants.map(variant=>({value:variant.id,label:`${variant.name} — ${variant.recipeId?`Recipe v${variant.recipeVersion??1}`:"No recipe"}`}))]}/></label>
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

export function PosImportDeleteDialog({target,deleting,reason,verificationPin="",onReasonChange,onPinChange=()=>undefined,onCancel,onConfirm}:{target:PosImportRecord;deleting:boolean;reason:string;verificationPin?:string;onReasonChange:(value:string)=>void;onPinChange?:(value:string)=>void;onCancel:()=>void;onConfirm:()=>void}) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" role="dialog" aria-modal="true" aria-labelledby="delete-pos-import-title">
    <div className="w-full max-w-lg rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface)] p-6 shadow-2xl">
      <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--app-danger-bg)] text-[var(--app-danger)]"><Trash2 size={20}/></div>
      <h3 id="delete-pos-import-title" className="text-lg font-bold text-[var(--app-text)]">Clean up this POS import?</h3>
      <dl className="mt-4 grid grid-cols-[120px_1fr] gap-x-3 gap-y-2 text-sm"><dt className="text-[var(--app-text-muted)]">File</dt><dd className="font-semibold break-all">{target.sourceFilename}</dd><dt className="text-[var(--app-text-muted)]">Branch</dt><dd className="font-semibold">{target.branchName}</dd><dt className="text-[var(--app-text-muted)]">Business Date</dt><dd className="font-semibold">{formatAppDate(target.businessDate)}</dd></dl>
      <p className="mt-4 rounded-xl bg-[var(--app-surface-muted)] p-3 text-sm leading-6 text-[var(--app-text-muted)]">Cleanup is controlled by the backend lifecycle policy. It removes this import, its sales rows, and recipe-derived usage after dependency checks. Production cleanup remains disabled.</p>
      <label className="mt-4 block text-sm font-medium">Cleanup reason<textarea className="field mt-1.5 min-h-20" value={reason} onChange={(event)=>onReasonChange(event.target.value)} maxLength={500} placeholder="Explain why this import is being removed"/></label>
      <label className="mt-4 block text-sm font-medium">Verification PIN<input className="field mt-1.5" type="password" inputMode="numeric" value={verificationPin} onChange={(event)=>onPinChange(event.target.value)} placeholder="Enter verification PIN"/></label>
      <div className="mt-6 flex justify-end gap-2"><Btn variant="outline" disabled={deleting} onClick={onCancel}>Cancel</Btn><Btn variant="danger" disabled={deleting||reason.trim().length<10||!verificationPin.trim()} onClick={onConfirm}>{deleting?"Deleting…":"Clean Up Import"}</Btn></div>
    </div>
  </div>;
}

export function PosImportCleanupAuthorizationDialog({target,busy,reason,onReasonChange,onCancel,onConfirm}:{target:PosImportRecord;busy:boolean;reason:string;onReasonChange:(value:string)=>void;onCancel:()=>void;onConfirm:()=>void}){
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" role="dialog" aria-modal="true" aria-labelledby="authorize-pos-cleanup-title"><div className="w-full max-w-lg rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface)] p-6 shadow-2xl"><h3 id="authorize-pos-cleanup-title" className="text-lg font-bold">Authorize UAT cleanup</h3><p className="mt-2 text-sm text-[var(--app-text-muted)]">Authorize cleanup only for <strong>{target.sourceFilename}</strong>. This does not delete the import or change its business meaning.</p><label className="mt-4 block text-sm font-medium">Authorization reason<textarea className="field mt-1.5 min-h-20" value={reason} onChange={(event)=>onReasonChange(event.target.value)} maxLength={500}/></label><div className="mt-6 flex justify-end gap-2"><Btn variant="outline" disabled={busy} onClick={onCancel}>Cancel</Btn><Btn variant="primary" disabled={busy||reason.trim().length<10} onClick={onConfirm}>{busy?"Authorizing…":"Authorize Cleanup"}</Btn></div></div></div>;
}

export function PosImportDetailsDialog({ record, onClose }: { record: PosImportRecord; onClose: () => void }) {
  const details = [
    ["Source filename", record.sourceFilename],
    ["POS source", record.posSourceName ?? record.posSourceCode ?? "Historical source"],
    ["Branch", record.branchName],
    ["Business date", formatAppDate(record.businessDate)],
    ["Imported date/time", formatAppDate(record.importedAt)],
    ["Imported by", record.importedBy],
    ["Processed rows", `${record.validRows + record.warningRows} of ${record.totalRows}`],
    ["Warnings", String(record.warningRows)],
    ["Excluded / invalid", String(excludedInvalidRowCount(record))],
    ["Product lines", String(record.productLines)],
    ["Units sold", record.unitsSold.toLocaleString("en-PH")],
    ["Total sales", formatPeso(record.totalSales)],
    ["Status", record.status.replaceAll("_", " ")],
  ];
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" role="dialog" aria-modal="true" aria-labelledby="pos-import-details-title" onMouseDown={(event)=>{if(isModalBackdropEvent(event))onClose();}}>
    <div className="w-full max-w-2xl rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface)] p-6 shadow-2xl">
      <div className="flex items-start justify-between gap-4"><div><h3 id="pos-import-details-title" className="text-lg font-bold">POS Import Details</h3><p className="mt-1 text-sm text-[var(--app-text-muted)]">Read-only import and reconciliation summary.</p></div><button type="button" aria-label="Close POS import details" onClick={onClose}><X size={18}/></button></div>
      <dl className="mt-5 grid gap-x-5 gap-y-3 text-sm sm:grid-cols-2">{details.map(([label,value])=><div key={label} className="rounded-xl bg-[var(--app-surface-muted)] p-3"><dt className="text-xs text-[var(--app-text-muted)]">{label}</dt><dd className="mt-1 break-words font-semibold">{value}</dd></div>)}</dl>
      <div className="mt-6 flex justify-end"><Btn variant="outline" onClick={onClose}>Close</Btn></div>
    </div>
  </div>;
}

export function PosFormatRequestRejectDialog({target,busy,reason,onReasonChange,onCancel,onConfirm}:{
  target:PosFormatSetupRequest;busy:boolean;reason:string;onReasonChange:(value:string)=>void;onCancel:()=>void;onConfirm:()=>void;
}) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" role="dialog" aria-modal="true" aria-labelledby="reject-pos-format-request-title" onMouseDown={(event)=>{if(isModalBackdropEvent(event)&&!busy)onCancel();}}>
    <div className="w-full max-w-lg rounded-2xl border bg-[var(--app-surface)] p-6 shadow-2xl" style={{borderColor:C.border}}>
      <h3 id="reject-pos-format-request-title" className="text-lg font-bold">Reject POS Format Setup Request?</h3>
      <p className="mt-2 text-sm text-[var(--app-text-muted)]">Reject <strong>{target.sourceFilename}</strong> for {target.branchName}. The retained workbook will not be imported or configured.</p>
      <label className="mt-4 block text-sm font-medium">Rejection reason<textarea autoFocus className="field mt-1.5 min-h-24" value={reason} onChange={(event)=>onReasonChange(event.target.value)} maxLength={500} placeholder="Explain why this format request cannot be accepted"/></label>
      <p className="mt-1 text-xs text-[var(--app-text-muted)]">At least 10 characters are required. The requesting Manager will receive this reason.</p>
      <div className="mt-6 flex justify-end gap-2"><Btn variant="outline" disabled={busy} onClick={onCancel}>Cancel</Btn><Btn variant="danger" disabled={busy||reason.trim().length<10} onClick={onConfirm}>{busy?"Rejecting…":"Reject Request"}</Btn></div>
    </div>
  </div>;
}

function dateRange(range: DashboardRange, customStart: string, customEnd: string) {
  return periodDates(range, customStart, customEnd);
}

export const STORAGE_KEY_COGS_USER_RANGE = "libro.cogs.userRange";

export interface CogsUserRangeConfig {
  range: DashboardRange;
  customStart?: string;
  customEnd?: string;
}

export function readCogsUserRange(): CogsUserRangeConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_COGS_USER_RANGE);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && typeof parsed.range === "string") {
      return parsed as CogsUserRangeConfig;
    }
  } catch {
    // ignore
  }
  return null;
}

export function saveCogsUserRange(config: CogsUserRangeConfig) {
  try {
    localStorage.setItem(STORAGE_KEY_COGS_USER_RANGE, JSON.stringify(config));
  } catch {
    // ignore
  }
}

export function clearCogsUserRange() {
  try {
    localStorage.removeItem(STORAGE_KEY_COGS_USER_RANGE);
  } catch {
    // ignore
  }
}

export function getInitialCogsDateRange(): {
  userSelected: boolean;
  range: DashboardRange;
  customStart: string;
  customEnd: string;
} {
  try {
    if (typeof window !== "undefined" && window.location?.search) {
      const params = new URLSearchParams(window.location.search);
      const qStart = params.get("startDate");
      const qEnd = params.get("endDate");
      if (qStart && qEnd) {
        return {
          userSelected: true,
          range: "custom",
          customStart: qStart,
          customEnd: qEnd,
        };
      }
    }
  } catch {
    // ignore
  }
  const saved = readCogsUserRange();
  if (saved) {
    return {
      userSelected: true,
      range: saved.range,
      customStart: saved.customStart ?? businessDate(),
      customEnd: saved.customEnd ?? businessDate(),
    };
  }
  const today = businessDate();
  const monthStart = `${today.slice(0, 8)}01`;
  return {
    userSelected: false,
    range: "mtd",
    customStart: monthStart,
    customEnd: today,
  };
}

export const POS_SOURCE_FORMAT_OPTIONS: Array<{value:PosSource["supportedFormat"];label:string}> = [
  {value:"SUMMARY_ITEMS_SOLD_LEGACY_XLS",label:"Libro Espresso - XLS"},
  {value:"TRANSACTION_SUMMARY_XLSX",label:"Libro Espresso - XLSX"},
  {value:"CANONICAL_CSV",label:"Libro Espresso - CSV"},
  {value:"CUSTOM_TABULAR_XLSX",label:"Custom mapped spreadsheet"},
];

export const formatPosSourceFormatName = (format: PosSource["supportedFormat"]) =>
  POS_SOURCE_FORMAT_OPTIONS.find(option=>option.value===format)?.label??format;

const formatPosSourceOptionFormatName=(format:PosSource["supportedFormat"])=>
  formatPosSourceFormatName(format).replace("Libro Espresso - ","Libro Espresso ");

export const formatPosSourceOptionLabel=(source:Pick<PosSource,"displayName"|"branchName"|"supportedFormat"|"status">)=>{
  const cleanedName=source.displayName.replace(/\s*(?:[-·|]\s*)?(?:transaction summary xlsx|summary items sold(?: xls)?|canonical csv|summary items|transaction summary|xlsx|xls|csv)$/i,"").trim()||source.displayName;
  const branchPosName=`${source.branchName.replace(/\s*\/\s*/g," ").replace(/\s+Branch$/i,"").trim()} POS`;
  const posName=/^Libro POS$/i.test(cleanedName)?branchPosName:cleanedName;
  return `${posName} - ${formatPosSourceOptionFormatName(source.supportedFormat)} - ${source.status==="ACTIVE"?"Ready":"Not Active"}`;
};

const EMPTY_POS_FIELD_MAPPING: PosFieldMapping = {productName:"",quantitySold:"",transactionId:"",businessDate:"",status:"",unitPrice:"",salesAmount:""};
export const POS_IMPORT_FIELD_OPTIONS: Array<{value:keyof PosFieldMapping;label:string;required:boolean}> = [
  {value:"productName",label:"Product Name",required:true},
  {value:"quantitySold",label:"Quantity",required:true},
  {value:"transactionId",label:"Transaction / OR Number",required:true},
  {value:"businessDate",label:"Business Date",required:true},
  {value:"status",label:"Status",required:true},
  {value:"unitPrice",label:"Unit Price",required:true},
  {value:"salesAmount",label:"Sales Amount",required:false},
];

export function suggestPosField(header:string):keyof PosFieldMapping|"" {
  const normalized=header.toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
  if(/^(product|product name|item|item name|description)$/.test(normalized))return "productName";
  if(/^(quantity|quantity sold|qty|qty sold)$/.test(normalized))return "quantitySold";
  if(/^(receipt no|receipt number|transaction id|transaction no|transaction number|or no|or number|txn ref)$/.test(normalized))return "transactionId";
  if(/^(business date|transaction date|date|sales date)$/.test(normalized))return "businessDate";
  if(/^(status|payment status|transaction status)$/.test(normalized))return "status";
  if(/^(unit price|selling price|price)$/.test(normalized))return "unitPrice";
  if(/^(sales amount|total amount|line total|net due|amount)$/.test(normalized))return "salesAmount";
  return "";
}

export function suggestedPosFieldMapping(headers:string[]):PosFieldMapping {
  const mapping={...EMPTY_POS_FIELD_MAPPING};
  for(const header of headers){const field=suggestPosField(header);if(field&&!mapping[field])mapping[field]=header;}
  return mapping;
}

export function assignPosHeader(mapping:PosFieldMapping,header:string,field:keyof PosFieldMapping|""):PosFieldMapping {
  const next={...mapping};
  for(const key of Object.keys(next) as Array<keyof PosFieldMapping>)if(next[key]===header)next[key]="";
  if(field)next[field]=header;
  return next;
}

export const pendingPosFormatRequests=(requests:PosFormatSetupRequest[])=>requests.filter(request=>request.status==="PENDING"||request.status==="BLOCKED");

export function PosMappingSetup({ role = "owner", initialSourceId = "" }: { role?: Role | string; initialSourceId?: string } = {}) {
  const [deleteSourceTarget, setDeleteSourceTarget] = useState<PosSource | null>(null);
  const [deleteSourceValue, setDeleteSourceValue] = useState({ reason: "", verificationPin: "" });
  const [deletingSource, setDeletingSource] = useState(false);
  const [open, setOpen] = useState(Boolean(initialSourceId));
  const [sources, setSources] = useState<PosSource[]>([]);
  const [mappings, setMappings] = useState<PosMapping[]>([]);
  const [products, setProducts] = useState<MenuProduct[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [formatRequests,setFormatRequests]=useState<PosFormatSetupRequest[]>([]);
  const [selectedFormatRequest,setSelectedFormatRequest]=useState<PosFormatSetupRequest|null>(null);
  const [rejectFormatRequestTarget,setRejectFormatRequestTarget]=useState<PosFormatSetupRequest|null>(null);
  const [formatRequestRejectionReason,setFormatRequestRejectionReason]=useState("");
  const [formatSetupResult,setFormatSetupResult]=useState("");
  const [sourceId, setSourceId] = useState(initialSourceId);
  const [sourceName, setSourceName] = useState("");
  const [sourceFormat, setSourceFormat] = useState<PosSource["supportedFormat"]>("SUMMARY_ITEMS_SOLD_LEGACY_XLS");
  const [sourceBranchId, setSourceBranchId] = useState("");
  const [showAssignBranch, setShowAssignBranch] = useState(false);
  const [assignBranchId, setAssignBranchId] = useState("");
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
  const [mappingInspection,setMappingInspection]=useState<PosHeaderInspection|null>(null);
  const [mappingFile,setMappingFile]=useState<File|null>(null);
  const [fieldMapping,setFieldMapping]=useState<PosFieldMapping>({productName:"",quantitySold:"",transactionId:"",businessDate:"",status:"",unitPrice:"",salesAmount:""});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const refresh = async () => {
    const [nextSources,nextRequests]=await Promise.all([inventoryWorkflowService.posSources(),inventoryWorkflowService.posFormatSetupRequests()]);
    setSources(nextSources);setFormatRequests(nextRequests);
  };
  useEffect(() => {
    if (!open) return;
    void Promise.all([inventoryWorkflowService.posSources(), masterDataService.menuProducts(), masterDataService.branches(),inventoryWorkflowService.posFormatSetupRequests()])
      .then(([nextSources, nextProducts, nextBranches,nextRequests]) => { setSources(nextSources); setProducts(nextProducts); setBranches(nextBranches); setFormatRequests(nextRequests); })
      .catch(() => setError("Unable to load POS mapping setup."));
  }, [open]);
  useEffect(() => {
    if (!initialSourceId) return;
    setOpen(true);
    setSourceId(initialSourceId);
  }, [initialSourceId]);
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

  // Group current and historical source configurations by their assigned branch.
  const sourcesByBranch = branches.map((b) => ({
    branch: b,
    sources: sources.filter((s) => s.branchId === b.id),
  }));

  // Find other branches using the same format as selectedSource (Scenario A)
  const sameFormatSources = selectedSource
    ? sources.filter((s) => s.supportedFormat === selectedSource.supportedFormat)
    : [];
  const mappingComplete = [fieldMapping.productName,fieldMapping.quantitySold,fieldMapping.transactionId,fieldMapping.businessDate,fieldMapping.status,fieldMapping.unitPrice].every(Boolean);
  const pendingFormatRequests=pendingPosFormatRequests(formatRequests);
  const openFormatRequest=(request:PosFormatSetupRequest)=>{
    setSelectedFormatRequest(request);setSourceId(request.posSourceId);setFormatSetupResult("");
    setMappingInspection({worksheet:request.worksheet,headerRow:request.headerRow,headers:request.headers,mapping:null});
    const saved=sources.find(source=>source.id===request.posSourceId)?.fieldMapping;
    setFieldMapping(saved??suggestedPosFieldMapping(request.headers));
  };
  const inspectMappingFile=async()=>{
    if(!selectedSource||!mappingFile)return;
    setBusy(true);setError("");
    try{const inspected=await inventoryWorkflowService.inspectPosHeaders(selectedSource.id,mappingFile);setMappingInspection(inspected);setFieldMapping(inspected.mapping??{productName:"",quantitySold:"",transactionId:"",businessDate:"",status:"",unitPrice:"",salesAmount:""});}
    catch(reason){setError(reason instanceof Error?reason.message:"Unable to inspect spreadsheet headers.");}
    finally{setBusy(false);}
  };

  return <div className="rounded-2xl border p-5 shadow-sm" style={{ borderColor: C.border, background: C.mainBg }}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h3 className="text-base font-bold text-[var(--app-text)]">POS System & Mapping Setup</h3>
        <p className="mt-0.5 text-xs text-[var(--app-text-muted)]">Connect sales files from your branch POS systems and tell Libro how to read them.</p>
      </div>
      <button type="button" className="rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors hover:bg-[var(--app-surface-muted)]" style={{ borderColor: C.border, color: C.maroon }} onClick={() => setOpen((value) => !value)}>
        {open ? "Hide POS Setup" : "Open POS Setup"}
      </button>
    </div>

    {open && <div className="mt-5 space-y-6 text-sm">
      <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-4 text-[var(--app-text)] dark:border-blue-900 dark:bg-blue-950/30">
        <div className="flex items-start gap-3">
          <Info className="mt-0.5 shrink-0 text-blue-600 dark:text-blue-400" size={18} />
          <div className="space-y-2">
            <p className="font-semibold text-blue-950 dark:text-blue-100">Use the guided sections below to choose a branch POS, set up spreadsheet columns, and match POS products to Libro menu items.</p>
          </div>
        </div>
      </div>

      <section aria-label="Pending Format Requests" className="rounded-xl border bg-[var(--app-surface)] p-5" style={{borderColor:C.border}}>
        <h4 className="font-bold">Pending Format Requests ({pendingFormatRequests.length})</h4>
        <p className="mt-1 text-xs text-[var(--app-text-muted)]">Sales files waiting for the Owner to confirm how Libro should read their columns.</p>
        {pendingFormatRequests.length===0?<p className="mt-3 rounded-lg bg-[var(--app-surface-muted)] p-3 text-xs text-[var(--app-text-muted)]">No sales files are waiting for format setup.</p>:<div className="mt-3 grid gap-3 md:grid-cols-2">{pendingFormatRequests.map(request=><article key={request.id} className="rounded-xl border p-4" style={{borderColor:selectedFormatRequest?.id===request.id?C.maroon:C.border}}><div className="flex items-start justify-between gap-3"><div><strong>New sales format detected</strong><dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-xs"><dt className="text-[var(--app-text-muted)]">Branch:</dt><dd>{request.branchName}</dd><dt className="text-[var(--app-text-muted)]">Requested by:</dt><dd>{request.requestedByName}</dd><dt className="text-[var(--app-text-muted)]">File:</dt><dd>{request.sourceFilename}</dd><dt className="text-[var(--app-text-muted)]">Status:</dt><dd>{request.status==="BLOCKED"?"Configured · Needs attention":"Pending Setup"}</dd><dt className="text-[var(--app-text-muted)]">Detected:</dt><dd>{request.headers.length} columns</dd></dl></div><div className="flex flex-wrap justify-end gap-2"><Btn size="sm" onClick={()=>openFormatRequest(request)}>Configure Format</Btn>{request.status==="PENDING"&&<Btn size="sm" variant="outline" onClick={()=>{setRejectFormatRequestTarget(request);setFormatRequestRejectionReason("");}}>Reject Request</Btn>}</div></div></article>)}</div>}
      </section>

      {error && <p role="alert" className="rounded-xl bg-[var(--app-danger-bg)] p-3 text-sm font-semibold" style={{ color: C.red }}>{error}</p>}

      {/* ─── Step 1: Register POS Format / System ─────────────────────────────── */}
      <div className="rounded-xl border bg-[var(--app-surface)] p-5" style={{ borderColor: C.border }}>
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold text-white" style={{ background: C.maroon }}>1</span>
          <h4 className="font-bold text-[var(--app-text)]">1. POS System Details</h4>
        </div>
        <p className="mt-1 text-xs text-[var(--app-text-muted)]">
          Which POS system does each branch use?
        </p>

        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs font-semibold text-[var(--app-text-muted)]">POS System Name</label>
            <input aria-label="POS System Name" placeholder="e.g. Libro POS Summary Items" value={sourceName} onChange={(event) => setSourceName(event.target.value)} className="w-full rounded-lg border p-2" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-[var(--app-text-muted)]">File Format</label>
            <Select aria-label="Supported POS format" value={sourceFormat} onChange={value=>setSourceFormat(value as PosSource["supportedFormat"])} options={POS_SOURCE_FORMAT_OPTIONS}/>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-[var(--app-text-muted)]">Assigned Branch</label>
            <Select aria-label="POS source branch" value={sourceBranchId} onChange={setSourceBranchId} options={[{value:"",label:"Select branch"},...branches.map(branch=>({value:branch.id,label:branch.name}))]}/>
          </div>
          <div className="flex items-end">
            <button type="button" disabled={busy || !sourceName.trim() || !sourceBranchId} className="w-full rounded-lg px-3 py-2 text-sm font-semibold text-white transition-opacity disabled:opacity-40" style={{ background: C.maroon }} onClick={() => void run(async () => { const generatedCode=`POS_${sourceBranchId.replaceAll("-","").slice(0,8)}_${Date.now().toString(36).toUpperCase()}`;await inventoryWorkflowService.createPosSource({ sourceCode:generatedCode, displayName: sourceName, supportedFormat: sourceFormat, branchId: sourceBranchId }); setSourceName(""); setSourceBranchId(""); })}>
              Continue
            </button>
          </div>
        </div>
      </div>

      {/* ─── Step 2: Assign POS System to Branches & Verification ────────────── */}
      <div className="rounded-xl border bg-[var(--app-surface)] p-5" style={{ borderColor: C.border }}>
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold text-white" style={{ background: C.maroon }}>2</span>
          <h4 className="font-bold text-[var(--app-text)]">2. Format Setup</h4>
        </div>
        <p className="mt-1 text-xs text-[var(--app-text-muted)]">
          Tell Libro how to read the columns from this POS.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className="text-xs font-semibold text-[var(--app-text-muted)]">Select POS System:</label>
          <Select aria-label="Source to review" className="w-full min-w-0 sm:w-auto sm:min-w-[280px]" value={sourceId} onChange={value => { setSourceId(value); setSelectedFormatRequest(null); setFormatSetupResult(""); setSourceFormatConfirmed(false); setShowAssignBranch(false); setMappingInspection(null); setMappingFile(null); }} options={[{value:"",label:"Select POS system to configure"},...sources.map(source=>({value:source.id,label:formatPosSourceOptionLabel(source)}))]} searchable searchPlaceholder="Select POS system to configure"/>
        </div>

        {selectedSource && (
          <div className="mt-4 space-y-4">
            {selectedFormatRequest&&mappingInspection&&<section aria-label="Requested POS format mapping" className="rounded-xl border p-4" style={{borderColor:C.maroon}}>
              <div className="flex flex-wrap items-start justify-between gap-3"><div><h5 className="font-bold">Uploaded Format Request</h5><p className="mt-1 text-xs text-[var(--app-text-muted)]">{selectedFormatRequest.branchName} · Requested by {selectedFormatRequest.requestedByName} · {selectedFormatRequest.sourceFilename}</p></div><StatusChip status={selectedFormatRequest.status}/></div>
              <div className="mt-4"><h6 className="font-semibold">Column Mapping</h6><p className="mt-1 text-xs text-[var(--app-text-muted)]">Confirm what each detected spreadsheet column means. Choose Ignore for columns Libro does not need.</p></div>
              <div className="mt-3 overflow-x-auto rounded-xl border" style={{borderColor:C.border}}><table className="w-full min-w-[560px] text-left text-xs"><thead className="bg-[var(--app-surface-muted)]"><tr><th className="p-3">New POS Field</th><th className="p-3">Matched Libro Field</th></tr></thead><tbody>{mappingInspection.headers.map(header=>{const assigned=(Object.keys(fieldMapping) as Array<keyof PosFieldMapping>).find(field=>fieldMapping[field]===header)??"";return <tr key={header} className="border-t" style={{borderColor:C.border}}><td className="p-3 font-semibold">{header}</td><td className="p-3"><Select small aria-label={`Map source column ${header}`} value={assigned} onChange={value=>setFieldMapping(current=>assignPosHeader(current,header,value as keyof PosFieldMapping|""))} options={[{value:"",label:"Ignore"},...POS_IMPORT_FIELD_OPTIONS.map(option=>({value:option.value,label:`${option.label}${option.required?" *":""}`}))]}/></td></tr>;})}</tbody></table></div>
              {!mappingComplete&&<div role="alert" className="mt-3 rounded-xl bg-[var(--app-warning-bg)] p-3 text-xs text-[var(--app-warning)]">{POS_IMPORT_FIELD_OPTIONS.filter(option=>option.required&&!fieldMapping[option.value]).map(option=><p key={option.value}>{option.label} has not been mapped.</p>)}</div>}
              {selectedFormatRequest.status==="BLOCKED"&&selectedFormatRequest.validationIssues?.length?<div className="mt-3 rounded-xl bg-[var(--app-danger-bg)] p-3 text-xs text-[var(--app-danger)]"><strong>Remaining validation issues</strong>{selectedFormatRequest.validationIssues.map(issue=><p key={`${issue.rowNumber}-${issue.field}-${issue.issue}`}>Row {issue.rowNumber || "—"} · {issue.field}: {issue.issue}</p>)}</div>:null}
              <div className="mt-4 flex justify-end"><Btn disabled={busy||!mappingComplete} onClick={()=>void run(async()=>{const result=await inventoryWorkflowService.configurePosFormatRequest(selectedFormatRequest.id,mappingInspection.headers,fieldMapping);setFormatSetupResult(result.imported?"POS format configured and sales import completed successfully.":"POS format was configured successfully, but the sales file still has blocking validation issues.");if(result.imported)setSelectedFormatRequest(null);else setSelectedFormatRequest(current=>current?{...current,status:"BLOCKED",validationIssues:result.validationIssues??null}:current);await refresh();})}>{busy?"Saving…":"Save Format & Continue Import"}</Btn></div>
            </section>}
            {formatSetupResult&&<p role="status" className="rounded-xl bg-[var(--app-success-bg)] p-3 text-sm font-semibold text-[var(--app-success)]">{formatSetupResult}</p>}
            {selectedSource.supportedFormat==="CUSTOM_TABULAR_XLSX"&&<section aria-label="Custom POS column mapping" className="rounded-xl border p-4" style={{borderColor:C.border}}><h5 className="font-bold">Configure Spreadsheet Columns</h5><p className="mt-1 text-xs text-[var(--app-text-muted)]">Map supplier spreadsheet headers to canonical sales fields. Product-to-menu mapping remains a separate step.</p><div className="mt-3 flex flex-wrap items-center gap-2"><input aria-label="Custom POS mapping workbook" type="file" accept=".xls,.xlsx" onChange={event=>{setMappingFile(event.target.files?.[0]??null);setMappingInspection(null);}}/><Btn size="sm" variant="outline" disabled={busy||!mappingFile} onClick={()=>void inspectMappingFile()}>Read Headers</Btn>{selectedSource.fieldMapping&&<span className="text-xs font-semibold" style={{color:C.green}}>Saved mapping available</span>}</div>{mappingInspection&&<div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{([
              ["productName","Product Name",true],["quantitySold","Quantity",true],["transactionId","Transaction / OR Number",true],["businessDate","Business Date",true],["status","Status",true],["unitPrice","Unit Price",true],["salesAmount","Sales Amount",false],
            ] as Array<[keyof PosFieldMapping,string,boolean]>).map(([field,label,required])=><label key={field} className="grid gap-1 text-xs font-semibold">{label}{required?" *":" (optional)"}<Select small aria-label={`Map ${label}`} value={fieldMapping[field]??""} onChange={value=>setFieldMapping(current=>({...current,[field]:value}))} options={[{value:"",label:"Select source header"},...mappingInspection.headers.map(header=>({value:header,label:header}))]}/></label>)}</div>}{mappingInspection&&<div className="mt-4 flex justify-end"><Btn size="sm" disabled={busy||!mappingComplete} onClick={()=>void run(async()=>{await inventoryWorkflowService.savePosFieldMapping(selectedSource.id,mappingInspection.headers,fieldMapping);setMappingInspection(current=>current?{...current,mapping:fieldMapping}:current);})}>Save Column Mapping</Btn></div>}</section>}
            {/* POS System Verification Section */}
            <section aria-label="POS System Verification" className="rounded-xl border p-4 bg-[var(--app-surface-muted)]" style={{ borderColor: C.border }}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h5 className="font-bold text-[var(--app-text)] flex items-center gap-2">
                    <ShieldCheck size={16} className="text-emerald-600" />
                    POS System Status
                  </h5>
                  <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid-cols-4">
                    <div><span className="text-[var(--app-text-muted)]">POS System Name:</span> <strong className="block text-[var(--app-text)]">{selectedSource.displayName}</strong></div>
                    <div><span className="text-[var(--app-text-muted)]">Format:</span> <strong className="block text-[var(--app-text)]">{formatPosSourceFormatName(selectedSource.supportedFormat)}</strong></div>
                    <div><span className="text-[var(--app-text-muted)]">Assigned Branch:</span> <strong className="block text-[var(--app-text)]">{selectedSource.branchName}</strong></div>
                  </div>
                </div>
                <StatusChip status={selectedSource.status}/>
              </div>

              <div className="mt-4 border-t pt-3" style={{ borderColor: C.border }}>
                {selectedSource.status === "INACTIVE" ? (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <label className="flex items-center gap-2 text-xs font-semibold">
                        <input type="checkbox" checked={sourceFormatConfirmed} onChange={(event) => setSourceFormatConfirmed(event.target.checked)}/>
                        I verified that the supplier export matches {formatPosSourceFormatName(selectedSource.supportedFormat)}.
                      </label>
                      <div className="flex flex-wrap items-center gap-2">
                        {canDeletePosSource(role, selectedSource) && (
                          <button
                            type="button"
                            disabled={busy || deletingSource}
                            aria-label={`Delete POS system configuration ${selectedSource.displayName}`}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--app-border)] px-3 py-2 text-xs font-semibold text-[var(--app-danger)] transition-colors hover:bg-[var(--app-danger-bg)]"
                            onClick={() => {
                              setDeleteSourceTarget(selectedSource);
                              setDeleteSourceValue({ reason: "", verificationPin: "" });
                            }}
                          >
                            <Trash2 size={13} />
                            Delete POS System Configuration
                          </button>
                        )}
                        <button type="button" disabled={busy || !sourceFormatConfirmed || (selectedSource.supportedFormat==="CUSTOM_TABULAR_XLSX"&&!selectedSource.fieldMapping)} className="rounded-lg px-3 py-2 text-xs font-semibold text-white disabled:opacity-40" style={{ background: C.maroon }} onClick={() => void run(async () => { await inventoryWorkflowService.updatePosSource(selectedSource.id, { status: "ACTIVE", confirmedSupportedFormat: selectedSource.supportedFormat }); setSourceFormatConfirmed(false); })}>
                          Activate verified POS system
                        </button>
                      </div>
                    </div>
                    {(selectedSource.hasImports || selectedSource.hasSales || selectedSource.hasActiveMappings) && (
                      <p className="text-xs text-[var(--app-text-muted)] italic">
                        {selectedSource.hasImports ? "Historical imports exist. " : selectedSource.hasSales ? "Historical sales exist. " : "Active mappings exist. "}
                        This configuration is preserved for business audit history and cannot be deleted.
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-xs font-medium" style={{ color: C.green }}>
                      Format verified{selectedSource.formatVerifiedByName ? ` by ${selectedSource.formatVerifiedByName}` : ""}{selectedSource.formatVerifiedAt ? ` on ${formatAppDate(selectedSource.formatVerifiedAt)}` : ""}.
                    </p>
                    <button type="button" disabled={busy} className="rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-[var(--app-danger-bg)] hover:text-[var(--app-danger)]" onClick={() => void run(() => inventoryWorkflowService.updatePosSource(selectedSource.id, { status: "INACTIVE" }))}>
                      Deactivate POS system
                    </button>
                  </div>
                )}
              </div>
            </section>

            {/* Branch Deployment & Multi-POS Overview (Scenarios A & B) */}
            <div className="rounded-xl border p-4 bg-[var(--app-surface)]" style={{ borderColor: C.border }}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h5 className="font-semibold text-xs text-[var(--app-text)] flex items-center gap-1.5">
                    <Building2 size={14} className="text-blue-600" />
                    Other Branches Using This File Format
                  </h5>
                  <p className="text-xs text-[var(--app-text-muted)]">
                    Branches using the {formatPosSourceFormatName(selectedSource.supportedFormat)} format:
                  </p>
                </div>
                {!showAssignBranch && (
                  <button type="button" disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors hover:bg-[var(--app-surface-muted)]" onClick={() => setShowAssignBranch(true)}>
                    <ArrowRight size={13} />
                    Assign this format to another branch
                  </button>
                )}
              </div>

              <div className="mt-2.5 flex flex-wrap gap-2">
                {sameFormatSources.map((s) => (
                  <span key={s.id} className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium bg-[var(--app-surface-muted)]" style={{ borderColor: C.border }}>
                    <CheckCircle size={12} className={s.status === "ACTIVE" ? "text-emerald-600" : "text-amber-500"} />
                    <strong>{s.branchName}</strong>: {s.displayName}
                  </span>
                ))}
              </div>

              {showAssignBranch && (
                <div className="mt-3 rounded-lg border border-dashed border-blue-300 bg-blue-50/40 p-3 dark:border-blue-800 dark:bg-blue-950/20">
                  <p className="text-xs font-semibold text-blue-900 dark:text-blue-200">
                    Deploy <strong>{formatPosSourceFormatName(selectedSource.supportedFormat)}</strong> to another branch:
                  </p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <Select small aria-label="Target Branch to Assign" value={assignBranchId} onChange={setAssignBranchId} options={[{value:"",label:"Select target branch…"},...branches.filter(branch=>branch.id!==selectedSource.branchId).map(branch=>({value:branch.id,label:branch.name}))]}/>
                    <div className="flex gap-2">
                      <button type="button" disabled={busy || !assignBranchId} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40" style={{ background: C.maroon }} onClick={() => void run(async () => {
                        const created = await inventoryWorkflowService.createPosSource({
                          sourceCode: `POS_${assignBranchId.replaceAll("-","").slice(0,8)}_${Date.now().toString(36).toUpperCase()}`,
                          displayName: `${selectedSource.displayName} (${branches.find(b => b.id === assignBranchId)?.name ?? "Branch"})`,
                          supportedFormat: selectedSource.supportedFormat,
                          branchId: assignBranchId,
                        });
                        setShowAssignBranch(false);
                        setAssignBranchId("");
                        setSourceId(created.id);
                      })}>
                        Create & Assign
                      </button>
                      <button type="button" className="rounded-lg border px-2 py-1.5 text-xs font-medium" onClick={() => setShowAssignBranch(false)}>Cancel</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ─── Step 3: Manage Product Mapping per Branch (Scenario C) ───────────── */}
      {sourceId && <div className="rounded-xl border bg-[var(--app-surface)] p-5" style={{ borderColor: C.border }}>
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold text-white" style={{ background: C.maroon }}>3</span>
          <h4 className="font-bold text-[var(--app-text)]">3. Product Mapping</h4>
        </div>
        <p className="mt-1 text-xs text-[var(--app-text-muted)]">
          Match POS product names and codes to approved Libro menu items and recipes. A mapping may apply to all branches or one specific branch.
        </p>

        {/* Copy Mappings Utility */}
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border p-3 bg-[var(--app-surface-muted)]" style={{borderColor:C.border}}>
          <Copy size={15} className="text-[var(--app-text-muted)] shrink-0" />
          <span className="text-xs font-semibold text-[var(--app-text-muted)]">Quick Copy:</span>
          <Select small className="w-full min-w-0 sm:w-auto sm:min-w-[280px]" aria-label="Copy mappings from source" value={copyFromSourceId} onChange={value=>{setCopyFromSourceId(value);setCopyResult(null);}} options={[{value:"",label:"Copy approved mappings from another POS system"},...sources.filter(source=>source.id!==sourceId).map(source=>({value:source.id,label:formatPosSourceOptionLabel(source)}))]} searchable searchPlaceholder="Search POS systems…"/>
          <button type="button" disabled={busy||!copyFromSourceId} className="rounded-lg border px-2.5 py-1.5 text-xs font-semibold disabled:opacity-50 hover:bg-[var(--app-surface)]" onClick={()=>void run(async()=>{const result=await inventoryWorkflowService.copyPosMappings(copyFromSourceId,sourceId);setCopyResult(result);})}>
            Copy as pending
          </button>
          <span className="text-xs text-[var(--app-text-muted)]">Copied mappings remain inactive until Owner review.</span>
          {copyResult&&<span role="status" className="w-full text-xs font-semibold" style={{color:C.green}}>{copyResult.copied} copied · {copyResult.skipped} skipped as already present · {copyResult.eligible} eligible</span>}
        </div>

        {/* Add Product Mapping Form */}
        <div className="mt-4 rounded-xl border p-4 bg-[var(--app-surface)]" style={{ borderColor: C.border }}>
          <h5 className="font-semibold text-xs text-[var(--app-text)]">Add Product Mapping for Review</h5>
          <div className="mt-3 grid gap-2 md:grid-cols-5">
            <div>
              <label className="mb-1 block text-xs font-semibold text-[var(--app-text-muted)]">POS Product Name</label>
              <input aria-label="Exact POS product name" placeholder="Exact POS product name" value={posName} onChange={(event) => setPosName(event.target.value)} className="w-full rounded-lg border p-2 text-xs" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-[var(--app-text-muted)]">POS Code (optional)</label>
              <input aria-label="Optional POS product code" placeholder="Optional POS code" value={posCode} onChange={(event) => setPosCode(event.target.value)} className="w-full rounded-lg border p-2 text-xs" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-[var(--app-text-muted)]">Branch Scope</label>
              <Select small aria-label="Mapping branch" value={branchId} onChange={setBranchId} options={[{value:"",label:"All branches (global)"},...branches.map(branch=>({value:branch.id,label:`Branch: ${branch.name} (Override)`}))]}/>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-[var(--app-text-muted)]">Target Product / Variant</label>
              <Select small aria-label="Target product variant" value={variantId} onChange={setVariantId} options={[{value:"",label:"Select product / variant"},...products.filter(product=>product.status==="ACTIVE"&&product.approvalStatus==="APPROVED").flatMap(product=>product.variants.filter(variant=>variant.status==="ACTIVE").map(variant=>({value:variant.id,label:`${product.category} / ${product.name} / ${variant.name} — ${variant.recipeId?`Recipe v${variant.recipeVersion??1}`:"No recipe"}`})))]} searchable searchPlaceholder="Search products and variants…"/>
            </div>
            <div className="flex items-end">
              <button type="button" disabled={busy || !posName.trim() || !variantId} className="w-full rounded-lg px-3 py-2 text-xs font-semibold text-white disabled:opacity-50" style={{ background: C.maroon }} onClick={() => void run(async () => { await inventoryWorkflowService.createPosMapping({ posSourceId: sourceId, branchId: branchId || null, sourceProductName: posName, sourceProductCode: posCode.trim() || null, menuItemVariantId: variantId }); setPosName(""); setPosCode(""); setVariantId(""); })}>
                Add for review
              </button>
            </div>
          </div>
          {selectedVariant && !selectedVariant.recipeId && <p role="status" className="mt-2 rounded-lg p-2 text-xs font-medium" style={{ color: C.red, background: "var(--app-danger-bg)" }}>This variant has no active recipe. It may be recorded for review, but it cannot be approved.</p>}
        </div>

        {/* Status Filter Tabs */}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2" aria-label="Mapping status filters">
            {(["ALL", "PENDING", "APPROVED", "REJECTED", "AMBIGUOUS"] as const).map((status) => (
              <button key={status} type="button" className="rounded-full border px-3 py-1 text-xs font-semibold transition-colors" style={{ borderColor: mappingFilter === status ? C.maroon : C.border, color: mappingFilter === status ? C.maroon : C.secondary, background: mappingFilter === status ? "var(--app-primary-soft)" : C.surface }} onClick={() => setMappingFilter(status)}>
                {status === "ALL" ? "All Statuses" : status.charAt(0) + status.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
          <span className="text-xs text-[var(--app-text-muted)]">Showing {mappings.length} {mappingFilter === "ALL" ? "" : mappingFilter.toLowerCase()} mapping(s)</span>
        </div>

        {/* Mappings Table with Scenario C Branch Scope Highlighting */}
        {mappings.length === 0 ? (
          <p className="mt-3 rounded-xl border p-4 text-center text-xs" style={{ borderColor: C.border, color: C.secondary }}>
            No {mappingFilter === "ALL" ? "" : `${mappingFilter.toLowerCase()} `}mappings found for this POS system.
          </p>
        ) : (
          <TableWrapper minWidth={1120} className="mt-3 rounded-xl border" >
              <thead style={{ background: "var(--app-surface-muted)" }}>
                <tr>
                  <th className="p-3 font-semibold">POS Name</th>
                  <th className="p-3 font-semibold">POS Code</th>
                  <th className="p-3 font-semibold">Target Product</th>
                  <th className="p-3 font-semibold">Target Variant</th>
                  <th className="p-3 font-semibold">Recipe</th>
                  <th className="p-3 font-semibold">Branch</th>
                  <th className="p-3 font-semibold">Status</th>
                  <th className="p-3 font-semibold">Review Actions</th>
                </tr>
              </thead>
              <tbody>
                {mappings.map((mapping) => {
                  const note = reviewNotes[mapping.id] ?? mapping.reviewComment ?? "";
                  return (
                    <tr key={mapping.id} className="border-t align-top" style={{ borderColor: C.border }}>
                      <td className="p-3 font-semibold">{mapping.sourceProductName}</td>
                      <td className="p-3 font-mono text-[var(--app-text-muted)]">{mapping.sourceProductCode || "—"}</td>
                      <td className="p-3">{mapping.menuItemName}</td>
                      <td className="p-3 font-medium">{mapping.variantName}</td>
                      <td className="p-3">
                        {mapping.recipeAvailable ? (
                          <span className="inline-flex items-center gap-1 font-semibold" style={{ color: C.green }}>
                            <Check size={12} /> Available · v{mapping.recipeVersion}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 font-semibold" style={{ color: C.red }}>
                            <X size={12} /> Unavailable
                          </span>
                        )}
                      </td>
                      <td className="p-3">
                        {mapping.branchId ? (
                          <span className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                            <GitBranch size={11} />
                            Branch: {mapping.branchName}
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-md bg-[var(--app-surface-muted)] px-2 py-0.5 text-xs font-semibold text-[var(--app-text)]">
                            All branches (global)
                          </span>
                        )}
                      </td>
                      <td className="p-3">
                        <StatusChip status={mapping.reviewStatus}/>
                        {mapping.reviewStatus === "APPROVED" && mapping.status === "INACTIVE" && (
                          <div className="mt-1 text-xs" style={{ color: C.secondary }}>Inactive</div>
                        )}
                      </td>
                      <td className="p-3">
                        <div className="min-w-[250px] space-y-2">
                          {mapping.reviewStatus === "PENDING" ? (
                            <input aria-label={`Review note for ${mapping.sourceProductName}`} placeholder="Reason for rejection or ambiguity" value={note} onChange={(event) => setReviewNotes((current) => ({ ...current, [mapping.id]: event.target.value }))} className="w-full rounded-lg border p-1.5 text-xs"/>
                          ) : mapping.reviewComment && (
                            <p className="rounded-lg bg-[var(--app-surface-muted)] p-2 text-xs" style={{color:C.secondary}}>{mapping.reviewComment}</p>
                          )}
                          <PosMappingActions
                            mapping={mapping}
                            busy={busy}
                            canApprove={canApprovePosMapping(mapping,selectedSource)}
                            reviewNote={note}
                            onEdit={()=>setEditMapping(mapping)}
                            onReview={(status)=>void run(()=>inventoryWorkflowService.reviewPosMapping(mapping.id,status,note))}
                            onDeactivate={()=>void run(()=>inventoryWorkflowService.deactivatePosMapping(mapping.id))}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
          </TableWrapper>
        )}
      </div>}
    </div>}

    {editMapping && <PosMappingEditDialog
      key={editMapping.id}
      mapping={editMapping}
      products={products}
      branches={branches}
      busy={busy}
      onCancel={()=>setEditMapping(null)}
      onSave={(input)=>void run(()=>inventoryWorkflowService.revisePendingPosMapping(editMapping.id,input)).then(saved=>{if(saved)setEditMapping(null);})}
    />}

    {deleteSourceTarget && (
      <ControlledActionDialog
        title="Delete POS System Configuration"
        description={`Permanently delete the unused POS system configuration "${deleteSourceTarget.displayName}" (${deleteSourceTarget.sourceCode}). No imports, sales, or active mappings exist. This action cannot be undone.`}
        confirmLabel="Delete Configuration"
        value={deleteSourceValue}
        busy={deletingSource}
        onChange={setDeleteSourceValue}
        onCancel={() => {
          setDeleteSourceTarget(null);
          setDeleteSourceValue({ reason: "", verificationPin: "" });
        }}
        onConfirm={async () => {
          setDeletingSource(true);
          try {
            await controlledActionService.deletePosSource(deleteSourceTarget.id, deleteSourceValue);
            toast.success(`Deleted POS system configuration ${deleteSourceTarget.displayName}`);
            setDeleteSourceTarget(null);
            setDeleteSourceValue({ reason: "", verificationPin: "" });
            setSourceId("");
            await refresh();
          } catch (err) {
            setError(err instanceof Error ? err.message : "Unable to delete POS system configuration.");
          } finally {
            setDeletingSource(false);
          }
        }}
      />
    )}
    {rejectFormatRequestTarget&&<PosFormatRequestRejectDialog
      target={rejectFormatRequestTarget}
      busy={busy}
      reason={formatRequestRejectionReason}
      onReasonChange={setFormatRequestRejectionReason}
      onCancel={()=>{if(!busy){setRejectFormatRequestTarget(null);setFormatRequestRejectionReason("");}}}
      onConfirm={()=>void (async()=>{
        const rejected=await run(()=>inventoryWorkflowService.rejectPosFormatRequest(rejectFormatRequestTarget.id,formatRequestRejectionReason.trim()));
        if(rejected){if(selectedFormatRequest?.id===rejectFormatRequestTarget.id)setSelectedFormatRequest(null);setRejectFormatRequestTarget(null);setFormatRequestRejectionReason("");toast.success("POS format setup request rejected");}
      })()}
    />}
  </div>;
}

// ─── Sales Analysis ────────────────────────────────────────────────────────────
function SalesAnalysis({ role, scopeBranchName = "All Branches" }: { role: Role | string; scopeBranchName?: string }) {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const isOwner = isOwnerRole(role) || user?.role === "OWNER";
  const effectiveRole: Role = isOwner ? "owner" : "manager";
  const localToday = businessDate();
  const initialMonthStart = `${localToday.slice(0, 8)}01`;
  const [posImportOpen, setPosImportOpen] = useState(false);
  const [posImports, setPosImports] = useState<PosImportRecord[]>([]);
  const [posHistoryLoading, setPosHistoryLoading] = useState(true);
  const [posHistoryPage, setPosHistoryPage] = useState(1);
  const [posHistoryTotal, setPosHistoryTotal] = useState(0);
  const [historyRefresh, setHistoryRefresh] = useState(0);
  const [monitoringMode,setMonitoringMode]=useState<DailyPosMonitoringMode>("current");
  const [monitoringHistoryDate,setMonitoringHistoryDate]=useState(addDateDays(localToday,-1));
  const [dailyPosStatuses,setDailyPosStatuses]=useState<DailyPosUploadStatus[]>([]);
  const [dailyPosLoading,setDailyPosLoading]=useState(false);
  const [dailyPosError,setDailyPosError]=useState("");
  const [viewImportTarget,setViewImportTarget]=useState<PosImportRecord|null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PosImportRecord|null>(null);
  const [deleteReason, setDeleteReason] = useState("");
  const [deletePin, setDeletePin] = useState("");
  const [deletingImport, setDeletingImport] = useState(false);
  const [authorizeTarget,setAuthorizeTarget]=useState<PosImportRecord|null>(null);
  const [authorizeReason,setAuthorizeReason]=useState("");
  const [authorizingImport,setAuthorizingImport]=useState(false);
  const [posImportSearch, setPosImportSearch] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [productCategory, setProductCategory] = useState("All Categories");
  const [posBranchFilter, setPosBranchFilter] = useState("All Branches");
  const [branches, setBranches] = useState<Branch[]>([]);
  const [analytics, setAnalytics] = useState<PosAnalytics | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [tab, setTab] = useState("overview");
  const initialRange = getInitialCogsDateRange();
  const [userSelected, setUserSelected] = useState<boolean>(initialRange.userSelected);
  const [range, setRange] = useState<DashboardRange>(initialRange.range);
  const [comparison, setComparison] = useState<DashboardComparison>("previous");
  const [customStart, setCustomStart] = useState(initialRange.customStart);
  const [customEnd, setCustomEnd] = useState(initialRange.customEnd);
  const periodLabel = dashboardPeriodLabel(range, customStart, customEnd);
  const comparisonLabel = comparison === "previous" ? "previous period" : "last month";
  const branchLabel = !isOwner ? (user?.branch?.name ?? "Assigned Branch") : posBranchFilter;
  const branchId = isOwner ? branches.find((branch) => branch.name === posBranchFilter)?.id : user?.branch?.id;

  useEffect(() => {
    if (!isOwner) return;
    void masterDataService.branches().then(setBranches).catch(() => setBranches([]));
  }, [isOwner]);
  useEffect(() => { if (isOwner) setPosBranchFilter(scopeBranchName); }, [isOwner, scopeBranchName]);

  useEffect(() => {
    let active = true;
    if (!userSelected) {
      inventoryWorkflowService.posImports({ branchId, pageSize: 1 })
        .then((res) => {
          if (!active) return;
          const latestDate = res.imports?.[0]?.businessDate;
          if (latestDate) {
            const defaultDates = periodDates("mtd");
            const adjustment = adjustRangeForAutomaticImport(false, "mtd", defaultDates.startDate, defaultDates.endDate, latestDate, localToday);
            if (adjustment) {
              if (adjustment.customStart) setCustomStart(adjustment.customStart);
              if (adjustment.customEnd) setCustomEnd(adjustment.customEnd);
              setRange(adjustment.range);
            } else {
              setRange("mtd");
            }
          } else {
            setRange("mtd");
          }
        })
        .catch(() => undefined);
    }
    return () => { active = false; };
  }, [branchId, userSelected, historyRefresh, localToday]);

  useEffect(() => {
    const handleDataChanged = (event: Event) => {
      const customEvent = event as CustomEvent<{ businessDate?: string } | undefined>;
      const importedDate = customEvent.detail?.businessDate;
      if (importedDate) {
        const currentDates = dateRange(range, customStart, customEnd);
        const adjustment = adjustRangeForAutomaticImport(userSelected, range, currentDates.startDate, currentDates.endDate, importedDate, localToday);
        if (adjustment) {
          if (adjustment.customStart) setCustomStart(adjustment.customStart);
          if (adjustment.customEnd) setCustomEnd(adjustment.customEnd);
          setRange(adjustment.range);
        }
      }
      setHistoryRefresh((value) => value + 1);
    };
    window.addEventListener("libro-data-changed", handleDataChanged);
    return () => window.removeEventListener("libro-data-changed", handleDataChanged);
  }, [range, customStart, customEnd, userSelected, localToday]);

  useEffect(() => {
    const dates = dateRange(range, customStart, customEnd);
    setAnalyticsLoading(true);
    void inventoryWorkflowService.posAnalytics({ ...dates, branchId })
      .then(setAnalytics)
      .catch(() => setAnalytics(null))
      .finally(() => setAnalyticsLoading(false));
  }, [branches, customEnd, customStart, branchId, range, effectiveRole, isOwner, historyRefresh]);

  useEffect(() => {
    let cancelled=false;
    const branchId=isOwner?branches.find(branch=>branch.name===posBranchFilter)?.id:undefined;
    setPosHistoryLoading(true);
    const timer=window.setTimeout(()=>void inventoryWorkflowService.posImports({branchId,search:posImportSearch.trim()||undefined,page:posHistoryPage,pageSize:10})
      .then(result=>{if(!cancelled){setPosImports(result.imports);setPosHistoryTotal(result.pagination.total);}})
      .catch(()=>{if(!cancelled){setPosImports([]);setPosHistoryTotal(0);}})
      .finally(()=>{if(!cancelled)setPosHistoryLoading(false);}),200);
    return()=>{cancelled=true;window.clearTimeout(timer);};
  }, [branches, historyRefresh, posBranchFilter, posHistoryPage, posImportSearch, effectiveRole, isOwner]);
  useEffect(()=>{
    if(tab!=="import_history")return;
    let cancelled=false;
    const branchId=isOwner?branches.find((branch)=>branch.name===posBranchFilter)?.id:undefined;
    const monitoringView=dailyPosMonitoringView(monitoringMode,localToday,monitoringHistoryDate);
    setDailyPosLoading(true);setDailyPosError("");
    void inventoryWorkflowService.dailyPosStatus({startDate:monitoringView.startDate,endDate:monitoringView.endDate,branchId})
      .then((result)=>{if(!cancelled)setDailyPosStatuses(result.statuses);})
      .catch((reason)=>{if(!cancelled){setDailyPosStatuses([]);setDailyPosError(reason instanceof Error?reason.message:"Unable to load daily upload monitoring.");}})
      .finally(()=>{if(!cancelled)setDailyPosLoading(false);});
    return()=>{cancelled=true;};
  },[branches,historyRefresh,localToday,monitoringHistoryDate,monitoringMode,posBranchFilter,effectiveRole,isOwner,tab]);
  const monitoringView=dailyPosMonitoringView(monitoringMode,localToday,monitoringHistoryDate);
  const visibleDailyStatuses=summarizeDailyPosStatuses(dailyPosStatuses);
  const productCategories = [...new Set((analytics?.products ?? []).map((product) => product.category))];
  const visibleProducts = (analytics?.products ?? []).filter((product) => {
    const matchesCategory = productCategory === "All Categories" || product.category === productCategory;
    const query = productSearch.trim().toLowerCase();
    return matchesCategory && (!query || product.name.toLowerCase().includes(query));
  });
  const deleteImport=async()=>{
    if(!deleteTarget||!canDeletePosImport(effectiveRole,deleteTarget)||deleteReason.trim().length<10||!deletePin.trim())return;
    setDeletingImport(true);
    try{
      await inventoryWorkflowService.deletePosImport(deleteTarget.id,deleteReason.trim(),deletePin.trim());
      toast.success("POS import deleted");
      setDeleteTarget(null);
      setDeleteReason("");
      setDeletePin("");
      setPosHistoryPage(1);
      setHistoryRefresh(value=>value+1);
      window.dispatchEvent(new CustomEvent("libro-data-changed"));
    }catch(reason){toast.error(reason instanceof Error?reason.message:"Unable to delete the POS import.");}
    finally{setDeletingImport(false);}
  };

  const authorizeImportCleanup=async()=>{
    if(!authorizeTarget||!canAuthorizePosImportCleanup(effectiveRole,authorizeTarget)||authorizeReason.trim().length<10)return;
    setAuthorizingImport(true);
    try{
      await inventoryWorkflowService.authorizePosImportCleanup(authorizeTarget.id,authorizeReason.trim());
      toast.success("POS import cleanup authorized");
      setAuthorizeTarget(null);setAuthorizeReason("");setHistoryRefresh(value=>value+1);
    }catch(reason){toast.error(reason instanceof Error?reason.message:"Unable to authorize cleanup.");}
    finally{setAuthorizingImport(false);}
  };

  return (
    <div className="sales-analysis-page min-w-0 p-4 md:p-6 space-y-5">
      <SectionHeader title="Sales Analysis"
        sub={`${branchLabel} · ${periodLabel}`}
        actions={
          <>
            {!isOwner && <Btn variant="primary" icon={Upload} onClick={() => setPosImportOpen(true)}>Import POS File</Btn>}
            {isOwner && <Select options={["All Branches", ...branches.map((branch) => branch.name)]} value={posBranchFilter} onChange={value=>{setPosBranchFilter(value);setPosHistoryPage(1);}} small />}
            <DashboardFilters range={range} comparison={comparison} customStart={customStart} customEnd={customEnd}
              onRangeChange={(nextRange) => {
                setUserSelected(true);
                setRange(nextRange);
                saveCogsUserRange({ range: nextRange, customStart, customEnd });
              }}
              onComparisonChange={setComparison}
              onApplyCustom={(start, end) => {
                setUserSelected(true);
                setCustomStart(start);
                setCustomEnd(end);
                setRange("custom");
                saveCogsUserRange({ range: "custom", customStart: start, customEnd: end });
              }}
              onReset={() => {
                setUserSelected(false);
                clearCogsUserRange();
                setRange("mtd");
                setComparison("previous");
                setHistoryRefresh((v) => v + 1);
              }} />
          </>
        } />

      {isOwner && <PosMappingSetup role={effectiveRole} initialSourceId={searchParams.get("configureMapping") ?? ""} />}
      {!isOwner && searchParams.get("configureMapping") && <p role="alert" className="rounded-xl border p-3 text-sm" style={{borderColor:C.amber,background:C.amberBg}}>POS column mapping is Owner-only. Ask an Owner to open this mapping request.</p>}

      <div className="sales-kpi-grid grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KPICard loading={analyticsLoading} label="Total Sales" value={formatPeso(analytics?.summary.sales ?? 0)} sub={periodLabel} icon={ShoppingCart} color={C.maroon} comparisonLabel={comparisonLabel} />
        <KPICard loading={analyticsLoading} label="Recipe COGS" value={formatPeso(analytics?.summary.theoreticalCogs ?? 0)} sub="Based on saved ingredient costs" icon={Package} color={C.amber} comparisonLabel={comparisonLabel} />
        <KPICard loading={analyticsLoading} label="Gross Profit" value={formatPeso(analytics?.summary.grossProfit ?? 0)} sub={`${(analytics?.summary.grossMargin ?? 0).toFixed(1)}% margin`} icon={TrendingUp} color={C.green} comparisonLabel={comparisonLabel} />
        <KPICard loading={analyticsLoading} label="Units Sold" value={(analytics?.summary.unitsSold ?? 0).toLocaleString()} sub={`${analytics?.summary.importCount ?? 0} POS import(s)`} icon={Hash} color={C.blue} comparisonLabel={comparisonLabel} />
      </div>

      <div className="sales-section-tabs flex max-w-full gap-1 overflow-x-auto border-b" style={{ borderColor: C.border }}>
        {["overview", "products", "import_history"].map(t => (
          <button key={t} onClick={() => setTab(t)}
            className="shrink-0 whitespace-nowrap px-4 py-2.5 text-sm font-medium border-b-2 transition-colors capitalize"
            style={{ borderColor: tab === t ? C.maroon : "transparent", color: tab === t ? C.maroon : C.secondary }}>
            {t === "import_history" ? "Import History" : t === "products" ? "Product Sales" : t}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="sales-analysis-grid grid grid-cols-3 gap-5">
          <Card className="col-span-2 min-w-0" padding={false}>
            <div className="px-5 pt-5 pb-0">
              <h3 className="font-semibold mb-4" style={{ color: C.primary }}>Sales vs COGS Trend</h3>
            </div>
            <div className="h-64 px-3 pb-4">
              {analyticsLoading ? <AnalyticsChartLoading label="Loading sales and COGS trend"/> : <ResponsiveContainer width="100%" height="100%">
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
              </ResponsiveContainer>}
            </div>
          </Card>
          <Card>
            <h3 className="font-semibold mb-4" style={{ color: C.primary }}>Top Products</h3>
            <div className="space-y-3.5">
              {analyticsLoading ? <AnalyticsListLoading label="Loading top products"/> : (analytics?.products ?? []).slice(0, 5).map((p, i) => (
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
        </TableCard>
      )}

      {tab === DAILY_POS_MONITORING_LOCATION && (<div className="space-y-4">
        <section aria-label="Daily Upload Monitoring" className="rounded-2xl border p-4" style={{borderColor:C.border,background:C.surface}}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><h3 className="font-semibold" style={{color:C.primary}}>{monitoringView.title}</h3><p className="mt-1 text-xs" style={{color:C.secondary}}>{monitoringMode==="current"?"Current business-date upload status for each monitored branch.":"Historical upload status based on the selected business date."}</p></div>
            <div className="flex flex-wrap gap-2">
              {isOwner && <Select ariaLabel="Monitoring branch" options={["All Branches", ...branches.map((branch) => branch.name)]} value={posBranchFilter} onChange={value=>{setPosBranchFilter(value);setPosHistoryPage(1);}} />}
              {monitoringView.showDateFilter&&<CalendarDateField label="Date" value={monitoringHistoryDate} max={addDateDays(localToday,-1)} onChange={(value)=>value&&setMonitoringHistoryDate(value)}/>}
              <Btn variant="outline" onClick={()=>setMonitoringMode((mode)=>mode==="current"?"history":"current")}>{monitoringView.actionLabel}</Btn>
            </div>
          </div>
          {dailyPosError&&<p role="alert" className="mt-3 text-sm" style={{color:C.red}}>{dailyPosError}</p>}
          <div className="mt-3 overflow-x-auto"><table className="data-table w-full min-w-[800px] text-sm"><thead><tr>{DAILY_POS_MONITORING_COLUMNS.map((column)=><th key={column}>{column}</th>)}{!isOwner&&<th>Action</th>}</tr></thead><tbody>
            {dailyPosLoading?<TableLoadingRow colSpan={isOwner?6:7} label="Loading daily upload monitoring…"/>:visibleDailyStatuses.length===0?<tr><td colSpan={isOwner?6:7}>No monitoring rows found for this date range.</td></tr>:visibleDailyStatuses.map((row)=><tr key={`${row.businessDate}-${row.branchId}`}>
              <td className="font-semibold">{row.branchName}</td><td>{formatAppDate(row.businessDate)}</td><td><StatusChip status={dailyPosStatusLabel(row.status).toLowerCase()}/></td><td>{row.sourceFilename??"—"}</td><td>{row.uploadedBy??"—"}</td><td>{row.importedAt?formatAppDate(row.importedAt,true):"—"}</td>
              {!isOwner&&<td>{row.requiredSourceCount>0&&(row.status==="DUE_TODAY"||row.status==="MISSING_UPLOAD")?<Btn variant="outline" onClick={()=>void inventoryWorkflowService.declareClosedPosDay(row.businessDate,"Branch closed / no sales declared by Manager").then(()=>setHistoryRefresh((value)=>value+1)).catch((reason)=>setDailyPosError(reason instanceof Error?reason.message:"Unable to record the closed day."))}>Record No Sales / Closed</Btn>:"—"}</td>}
            </tr>)}
          </tbody></table></div>
        </section>
        <TableCard
          title="Actual POS Import History"
          subtitle={`Audit log of imported daily sales files for ${branchLabel}`}
          toolbar={
            <>
              <SearchInput placeholder="Search imports…" value={posImportSearch} onChange={value=>{setPosImportSearch(value);setPosHistoryPage(1);}} />
              {isOwner && <Select options={["All Branches", ...branches.map((branch) => branch.name)]} value={posBranchFilter} onChange={value=>{setPosBranchFilter(value);setPosHistoryPage(1);}} />}
            </>
          }
        >
          <TableWrapper minWidth={1080} paginate={false}>
            <THead cols={isOwner ? OWNER_POS_IMPORT_HISTORY_COLUMNS : MANAGER_POS_IMPORT_HISTORY_COLUMNS} />
            <tbody>
              {posHistoryLoading ? (
                <TableLoadingRow colSpan={isOwner ? 11 : 10} label="Loading import history…" />
              ) : posImports.length === 0 ? (
                <TableEmptyRow colSpan={isOwner ? 11 : 10} title="No POS imports found" subtitle="Upload a POS sales file to see historical records." />
              ) : posImports.map((row) => (
                <TR key={row.id}>
                  <TD><span className="font-mono text-xs font-medium" style={{ color: C.primary }}>{row.sourceFilename}</span></TD>
                  {isOwner && <TD center><span className="font-semibold" style={{ color: C.maroon }}>{row.branchName}</span></TD>}
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
                    {row.lateHistoricalImport && <div className="mt-1 text-[10px] font-semibold" style={{color:C.amber}}>Late historical · reconcile inventory periods</div>}
                  </TD>
                  <TD center>
                      <PosImportActions
                        role={effectiveRole}
                        record={row}
                        onView={() => setViewImportTarget(row)}
                        onAuthorize={() => {
                          setAuthorizeTarget(row);
                          setAuthorizeReason("");
                        }}
                        onDelete={() => {
                          setDeleteTarget(row);
                          setDeleteReason("");
                          setDeletePin("");
                        }}
                      />
                  </TD>
                </TR>
              ))}
            </tbody>
          </TableWrapper>
          <Pagination total={posHistoryTotal} page={posHistoryPage} perPage={10} onPageChange={setPosHistoryPage} />
        </TableCard>
      </div>)}

      {viewImportTarget&&<PosImportDetailsDialog record={viewImportTarget} onClose={()=>setViewImportTarget(null)}/>}
      {authorizeTarget&&canAuthorizePosImportCleanup(effectiveRole,authorizeTarget)&&<PosImportCleanupAuthorizationDialog target={authorizeTarget} busy={authorizingImport} reason={authorizeReason} onReasonChange={setAuthorizeReason} onCancel={()=>{setAuthorizeTarget(null);setAuthorizeReason("");}} onConfirm={()=>void authorizeImportCleanup()}/>}
      {deleteTarget&&canDeletePosImport(effectiveRole,deleteTarget)&&(
        <PosImportDeleteDialog target={deleteTarget} deleting={deletingImport} reason={deleteReason} verificationPin={deletePin} onReasonChange={setDeleteReason} onPinChange={setDeletePin} onCancel={()=>{setDeleteTarget(null);setDeleteReason("");setDeletePin("");}} onConfirm={()=>void deleteImport()}/>
      )}

      <SalesPosImportModal
        open={!isOwner && posImportOpen}
        branchId={branchId}
        branchName={branchLabel}
        onClose={() => setPosImportOpen(false)}
        onImported={() => {
          setPosHistoryPage(1);
          toast.success("POS sales imported successfully");
        }}
      />
    </div>
  );
}

// ─── Inventory Overview ────────────────────────────────────────────────────────

// ─── COGS Analysis ─────────────────────────────────────────────────────────────
function COGSAnalysis({ role, scopeBranchName = "All Branches" }: { role: Role | string; scopeBranchName?: string }) {
  const { user } = useAuth();
  const isOwner = isOwnerRole(role) || user?.role === "OWNER";
  const effectiveRole: Role = isOwner ? "owner" : "manager";
  const today = businessDate();
  const initialRange = getInitialCogsDateRange();
  const [userSelected, setUserSelected] = useState<boolean>(initialRange.userSelected);
  const [range, setRange] = useState<DashboardRange>(initialRange.range);
  const [comparison, setComparison] = useState<DashboardComparison>("previous");
  const [customStart, setCustomStart] = useState(initialRange.customStart);
  const [customEnd, setCustomEnd] = useState(initialRange.customEnd);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchFilter, setBranchFilter] = useState("All Branches");
  const [analytics, setAnalytics] = useState<PosAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All Categories");
  const [refresh, setRefresh] = useState(0);
  const branchId = isOwner ? branches.find((branch) => branch.name === branchFilter)?.id : user?.branch?.id;

  useEffect(() => {
    let active = true;
    if (!userSelected) {
      inventoryWorkflowService.posImports({ branchId, pageSize: 1 })
        .then((res) => {
          if (!active) return;
          const latestDate = res.imports?.[0]?.businessDate;
          if (latestDate) {
            const defaultDates = periodDates("mtd");
            const adjustment = adjustRangeForAutomaticImport(false, "mtd", defaultDates.startDate, defaultDates.endDate, latestDate, today);
            if (adjustment) {
              if (adjustment.customStart) setCustomStart(adjustment.customStart);
              if (adjustment.customEnd) setCustomEnd(adjustment.customEnd);
              setRange(adjustment.range);
            } else {
              setRange("mtd");
            }
          } else {
            setRange("mtd");
          }
        })
        .catch(() => undefined);
    }
    return () => { active = false; };
  }, [branchId, userSelected, refresh, today]);

  useEffect(() => {
    const handleDataChanged = (event: Event) => {
      const customEvent = event as CustomEvent<{ businessDate?: string } | undefined>;
      const importedDate = customEvent.detail?.businessDate;
      if (importedDate) {
        const currentDates = dateRange(range, customStart, customEnd);
        const adjustment = adjustRangeForAutomaticImport(userSelected, range, currentDates.startDate, currentDates.endDate, importedDate, today);
        if (adjustment) {
          if (adjustment.customStart) setCustomStart(adjustment.customStart);
          if (adjustment.customEnd) setCustomEnd(adjustment.customEnd);
          setRange(adjustment.range);
        }
      }
      setRefresh((value) => value + 1);
    };
    window.addEventListener("libro-data-changed", handleDataChanged);
    return () => window.removeEventListener("libro-data-changed", handleDataChanged);
  }, [range, customStart, customEnd, userSelected, today]);

  useEffect(() => {
    if (!isOwner) return;
    void masterDataService.branches().then(setBranches).catch(() => setBranches([]));
  }, [isOwner]);
  useEffect(() => { if (isOwner) setBranchFilter(scopeBranchName); }, [isOwner, scopeBranchName]);

  useEffect(() => {
    setLoading(true);
    void inventoryWorkflowService.posAnalytics({ ...dateRange(range, customStart, customEnd), branchId })
      .then(setAnalytics)
      .catch(() => setAnalytics(null))
      .finally(() => setLoading(false));
  }, [branchId, branches, customEnd, customStart, range, effectiveRole, isOwner, refresh]);

  const summary = analytics?.summary;
  const branchLabel = !isOwner ? (user?.branch?.name ?? "Assigned Branch") : branchFilter;
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
            {isOwner && <Select options={["All Branches", ...branches.map((branch) => branch.name)]} value={branchFilter} onChange={setBranchFilter} />}
            <DashboardFilters range={range} comparison={comparison} customStart={customStart} customEnd={customEnd}
              onRangeChange={(nextRange) => {
                setUserSelected(true);
                setRange(nextRange);
                saveCogsUserRange({ range: nextRange, customStart, customEnd });
              }}
              onComparisonChange={setComparison}
              onApplyCustom={(start, end) => {
                setUserSelected(true);
                setCustomStart(start);
                setCustomEnd(end);
                setRange("custom");
                saveCogsUserRange({ range: "custom", customStart: start, customEnd: end });
              }}
              onReset={() => {
                setUserSelected(false);
                clearCogsUserRange();
                setRange("mtd");
                setComparison("previous");
                setRefresh((v) => v + 1);
              }} />
          </>
        } />

      <div className="cogs-kpi-grid grid gap-4">
        <KPICard loading={loading} label="Total Sales" value={formatPeso(summary?.sales ?? 0)} sub={`${summary?.unitsSold ?? 0} units sold`} icon={DollarSign} color={C.blue} />
        <KPICard loading={loading} label="Total COGS" value={formatPeso(summary?.totalCogs ?? 0)} sub="Sum of recipe-based product COGS" icon={BarChart2} color={C.amber} />
        <KPICard loading={loading} label="Gross Profit" value={formatPeso(summary?.grossProfit ?? 0)} sub="Total Sales less Total COGS" icon={TrendingUp} color={C.green} />
        <KPICard loading={loading} label="Gross Margin" value={`${(summary?.grossMargin ?? 0).toFixed(1)}%`} sub="Gross Profit ÷ Sales × 100" icon={Percent} color={C.maroon} />
          <KPICard loading={loading} label="Detected Shortage" value={formatPeso(summary?.detectedShortageValue ?? 0)} sub="Inventory shortage awaiting or under review" icon={TrendingDown} color={C.red} />
          <KPICard loading={loading} label="Verified Shrinkage" value={formatPeso(summary?.verifiedShrinkageCost ?? 0)} sub="Verified shrinkage causes only" icon={GitCompare} color={C.red} />
      </div>

      <div className="cogs-analysis-grid grid grid-cols-3 gap-5">
        <Card className="col-span-2" padding={false}>
          <div className="px-5 pt-5 pb-0">
            <h3 className="font-semibold mb-1" style={{ color: C.primary }}>Sales and Recipe COGS Trend</h3>
            <p className="text-xs mb-4" style={{ color: C.secondary }}>Daily totals from imported POS sales and saved recipe costs</p>
          </div>
          <div className="h-56 px-3 pb-4">
            {loading ? <AnalyticsChartLoading label="Loading COGS trend"/> : <ResponsiveContainer width="100%" height="100%">
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
            </ResponsiveContainer>}
          </div>
        </Card>
        <Card>
          <h3 className="font-semibold mb-4" style={{ color: C.primary }}>Ingredient Cost Distribution</h3>
          {loading ? <AnalyticsListLoading label="Loading ingredient cost distribution"/> : (analytics?.ingredients ?? []).slice(0, 6).map((item, index) => {
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
  role: Role | string;
  initialTab?: "overview" | "sales";
  scopeBranchName?: string;
}) {
  const { user } = useAuth();
  const effectiveRole: Role = (isOwnerRole(role) || user?.role === "OWNER") ? "owner" : "manager";
  const [activeTab, setActiveTab] = useState<"overview" | "sales">(initialTab);

  useEffect(() => setActiveTab(initialTab), [initialTab]);

  return (
    <div>
      <ModuleTabSwitcher tabs={cogsModuleTabs} active={activeTab} onChange={setActiveTab} />
      <AnimatedTabPanel panelKey={activeTab}>
        {activeTab === "overview" ? <COGSAnalysis role={effectiveRole} scopeBranchName={scopeBranchName} /> : <SalesAnalysis role={effectiveRole} scopeBranchName={scopeBranchName} />}
      </AnimatedTabPanel>
    </div>
  );
}
