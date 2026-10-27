import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, FilePenLine, FolderOpen, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { operationsService } from "../../services/operations.service";
import type { IncidentItemOption, IncidentProductOption, IncidentType } from "../../types/operations";
import { CalendarDateTimeField, isModalBackdropEvent, Select } from "../../components/ModuleUi";
import { businessDate, manilaBusinessDateTime, manilaDateTimeToIso, validateIncidentDateTime } from "../../utils/businessDate";
import { incidentTypeOptions } from "../../utils/shrinkageTaxonomy";
import { compatibleUnits, type MeasurementUnit } from "../../utils/units";
import { useOptionalAuth } from "../../contexts/AuthContext";
import { useLocalDraftCollection } from "../../hooks/useLocalDraft";
const currentDateTime = () => manilaBusinessDateTime();
const controlClass = "mt-2 block w-full min-w-0 rounded-xl border border-[var(--app-border)] bg-[var(--app-surface-elevated)] px-3.5 py-3 text-sm text-[var(--app-text)] outline-none transition focus:border-[var(--app-primary)] focus:ring-4 focus:ring-[var(--app-primary-faint)]";
export const validateOtherIncidentType = (type: IncidentType, value: string) =>
  type === "OTHER" && !value.trim() ? "Please specify the incident type." : "";
export const nextOtherIncidentType = (nextType: IncidentType, currentValue: string) =>
  nextType === "OTHER" ? currentValue : "";
export const incidentProductsForIngredient = (products: IncidentProductOption[], inventoryItemId: string) =>
  inventoryItemId ? products.filter((product) => product.ingredientIds.includes(inventoryItemId)) : [];
export const incidentProductsForIngredients = (products: IncidentProductOption[], inventoryItemIds: string[]) =>
  inventoryItemIds.length ? products.filter((product) => inventoryItemIds.every((id) => product.ingredientIds.includes(id))) : [];
export const incidentProductOptionLabel = (product: IncidentProductOption) => `${product.name} — ${product.variantName}`;
export const nextIncidentProductSelection = (products: IncidentProductOption[], inventoryItemId: string, currentVariantId: string) =>
  incidentProductsForIngredient(products,inventoryItemId).some((product)=>product.variantId===currentVariantId) ? currentVariantId : "";
export type AffectedItemDraft = { inventoryItemId: string; quantity: string; enteredUnit?: MeasurementUnit | "" };
export const validAffectedItems = (items: AffectedItemDraft[]) => items.length>0 && items.every((item)=>item.inventoryItemId&&Number.isFinite(Number(item.quantity))&&Number(item.quantity)>0) && new Set(items.map((item)=>item.inventoryItemId)).size===items.length;
export const affectedItemsPayload = (items: AffectedItemDraft[]) => items.map((item)=>({inventoryItemId:item.inventoryItemId,quantity:Number(item.quantity),enteredUnit:item.enteredUnit || undefined}));
export type IncidentDraft={type:IncidentType|"";affectedItems:AffectedItemDraft[];productVariantId:string;occurredAt:string;reason:string;lateReportingReason:string;otherIncidentType:string};
const isIncidentDraft=(value:unknown):value is IncidentDraft=>Boolean(value&&typeof value==="object"&&Array.isArray((value as IncidentDraft).affectedItems)&&typeof (value as IncidentDraft).type==="string"&&typeof (value as IncidentDraft).productVariantId==="string"&&typeof (value as IncidentDraft).occurredAt==="string"&&typeof (value as IncidentDraft).reason==="string"&&typeof (value as IncidentDraft).lateReportingReason==="string"&&typeof (value as IncidentDraft).otherIncidentType==="string");
const formatDraftEditedAt=(savedAt:number)=>new Intl.DateTimeFormat("en-PH",{dateStyle:"medium",timeStyle:"short",timeZone:"Asia/Manila"}).format(new Date(savedAt));
export const incidentDraftSummary=(draft:IncidentDraft)=>{
  const itemCount=draft.affectedItems.filter((item)=>item.inventoryItemId).length;
  const kind=draft.type?incidentTypeOptions.find((option)=>option.value===draft.type)?.label??draft.type:"Incident type not selected";
  return `${kind} · ${itemCount} affected item${itemCount===1?"":"s"}`;
};
export const incidentDraftIsMeaningful=(draft:IncidentDraft,initialOccurredAt:string)=>Boolean(
  draft.type||draft.productVariantId||draft.reason.trim()||draft.lateReportingReason.trim()||draft.otherIncidentType.trim()||draft.occurredAt!==initialOccurredAt
  ||draft.affectedItems.some((item)=>item.inventoryItemId||item.quantity!==""||item.enteredUnit)
);

function DraftDecisionDialog({title,description,confirmLabel,onCancel,onConfirm}:{title:string;description:string;confirmLabel:string;onCancel:()=>void;onConfirm:()=>void}){
  return <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4"><div role="alertdialog" aria-modal="true" aria-label={title} className="w-full max-w-md rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface)] p-5 shadow-2xl"><div className="flex items-start justify-between gap-4"><div><h3 className="text-lg font-bold">{title}</h3><p className="mt-2 text-sm text-[var(--app-text-muted)]">{description}</p></div><button type="button" aria-label="Close dialog" onClick={onCancel} className="h-9 w-9 shrink-0 rounded-xl border border-[var(--app-border)]"><X size={15} className="mx-auto"/></button></div><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={onCancel} className="rounded-xl border border-[var(--app-border)] px-4 py-2 text-sm font-semibold">Cancel</button><button type="button" onClick={onConfirm} className="rounded-xl bg-[var(--app-danger)] px-4 py-2 text-sm font-semibold text-white">{confirmLabel}</button></div></div></div>;
}

function IncidentExitDialog({error,onKeepEditing,onSaveDraft,onExit}:{error:string;onKeepEditing:()=>void;onSaveDraft:()=>void;onExit:()=>void}){
  return <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4"><div role="alertdialog" aria-modal="true" aria-label="Exit Without Submitting?" className="w-full max-w-lg rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface)] p-5 shadow-2xl"><div className="flex items-start justify-between gap-4"><div><h3 className="text-lg font-bold">Exit Without Submitting?</h3><p className="mt-2 text-sm text-[var(--app-text-muted)]">You have unfinished changes. Would you like to save them as a draft?</p></div><button type="button" aria-label="Close exit dialog" onClick={onKeepEditing} className="h-9 w-9 shrink-0 rounded-xl border border-[var(--app-border)]"><X size={15} className="mx-auto"/></button></div>{error&&<p role="alert" className="mt-4 text-sm text-[var(--app-danger)]">{error}</p>}<div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" onClick={onKeepEditing} className="rounded-xl border border-[var(--app-border)] px-4 py-2 text-sm font-semibold">Keep Editing</button><button type="button" onClick={onSaveDraft} className="rounded-xl border border-[var(--app-border)] px-4 py-2 text-sm font-semibold text-[var(--app-primary)]">Save as Draft</button><button type="button" onClick={onExit} className="rounded-xl bg-[var(--app-danger)] px-4 py-2 text-sm font-semibold text-white">Exit Without Saving</button></div></div></div>;
}

export function OtherIncidentTypeField({type,value,error,onChange}:{type:IncidentType;value:string;error:string;onChange:(value:string)=>void}) {
  if (type !== "OTHER") return null;
  return <label className="mt-4 block min-w-0 text-sm font-semibold text-[var(--app-text)]"><span className="block">Specify incident type <span className="text-[var(--app-danger)]">*</span></span><input autoFocus className={`${controlClass} ${error ? "border-[var(--app-danger)]" : ""}`} value={value} maxLength={120} aria-invalid={Boolean(error)} aria-describedby={error ? "other-incident-type-error" : undefined} onChange={(event) => onChange(event.target.value)} placeholder="Please specify the incident type"/>{error && <span id="other-incident-type-error" role="alert" className="mt-1.5 block text-xs font-medium text-[var(--app-danger)]">{error}</span>}<span className="mt-1 block text-right text-xs font-normal text-[var(--app-text-faint)]">{value.length}/120</span></label>;
}

export function StaffIncidentModal({ options, products, onClose, onSaved }: { options: IncidentItemOption[]; products: IncidentProductOption[]; onClose: () => void; onSaved: () => void }) {
  const user=useOptionalAuth()?.user;
  const initialOccurredAt=useRef(currentDateTime()).current;
  const [type, setType] = useState<IncidentType | "">("");
  const [affectedItems, setAffectedItems] = useState<AffectedItemDraft[]>([{ inventoryItemId: "", quantity: "", enteredUnit: "" }]);
  const [productVariantId, setProductVariantId] = useState("");
  const [occurredAt, setOccurredAt] = useState(initialOccurredAt);
  const [reason, setReason] = useState("");
  const [lateReportingReason, setLateReportingReason] = useState("");
  const [otherIncidentType, setOtherIncidentType] = useState("");
  const [otherIncidentTypeError, setOtherIncidentTypeError] = useState("");
  const [photoUrl, setPhotoUrl] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [activeDraftId,setActiveDraftId]=useState<string|null>(null);
  const [draftsOpen,setDraftsOpen]=useState(false);
  const drafts=useLocalDraftCollection<IncidentDraft>({userId:user?.id,branchId:user?.branchId,form:"staff-incident"},isIncidentDraft);
  const initialDraft=drafts.list()[0]??null;
  const [recoveryDraftId,setRecoveryDraftId]=useState<string|null>(initialDraft?.id??null);
  const [exitOpen,setExitOpen]=useState(false);
  const [deleteDraftId,setDeleteDraftId]=useState<string|null>(null);
  const [draftError,setDraftError]=useState("");
  const activeDraftIdRef=useRef<string|null>(null);
  const autosaveTimerRef=useRef<ReturnType<typeof setTimeout>|null>(null);
  const autosaveBlockedRef=useRef(false);
  const draftValue=useMemo<IncidentDraft>(()=>({type,affectedItems,productVariantId,occurredAt,reason,lateReportingReason,otherIncidentType}),[affectedItems,lateReportingReason,occurredAt,otherIncidentType,productVariantId,reason,type]);
  const meaningfulDraft=incidentDraftIsMeaningful(draftValue,initialOccurredAt)||Boolean(photoUrl);
  const draftEntries=drafts.list();
  const resetForm=()=>{setType("");setAffectedItems([{inventoryItemId:"",quantity:"",enteredUnit:""}]);setProductVariantId("");setOccurredAt(initialOccurredAt);setReason("");setLateReportingReason("");setOtherIncidentType("");setOtherIncidentTypeError("");setPhotoUrl(undefined);setDraftError("");activeDraftIdRef.current=null;setActiveDraftId(null);};
  const persistDraft=()=>{const id=drafts.save(draftValue,activeDraftIdRef.current??undefined);if(!id){setDraftError("Unable to save this draft in browser storage. Keep editing and check browser storage availability.");return "";}activeDraftIdRef.current=id;setActiveDraftId(id);setDraftError("");return id;};
  const continueDraft=(id:string)=>{const entry=drafts.read(id);if(!entry)return toast.error("This draft is unavailable or expired.");const saved=entry.value;setType(saved.type);setAffectedItems(saved.affectedItems);setProductVariantId(saved.productVariantId);setOccurredAt(validateIncidentDateTime(saved.occurredAt)?initialOccurredAt:saved.occurredAt);setReason(saved.reason);setLateReportingReason(saved.lateReportingReason);setOtherIncidentType(saved.otherIncidentType);setOtherIncidentTypeError("");setPhotoUrl(undefined);setDraftError("");activeDraftIdRef.current=id;setActiveDraftId(id);setDraftsOpen(false);setRecoveryDraftId(null);};
  const preventAutosave=()=>{autosaveBlockedRef.current=true;if(autosaveTimerRef.current){clearTimeout(autosaveTimerRef.current);autosaveTimerRef.current=null;}};
  useEffect(()=>{if(recoveryDraftId||autosaveBlockedRef.current||!incidentDraftIsMeaningful(draftValue,initialOccurredAt))return;if(autosaveTimerRef.current)clearTimeout(autosaveTimerRef.current);autosaveTimerRef.current=setTimeout(()=>{if(!autosaveBlockedRef.current)persistDraft();},600);return()=>{if(autosaveTimerRef.current){clearTimeout(autosaveTimerRef.current);autosaveTimerRef.current=null;}};},[draftValue,initialOccurredAt,recoveryDraftId]);
  const requestClose=()=>{if(!meaningfulDraft){preventAutosave();onClose();return;}setDraftError("");setExitOpen(true);};
  const saveAndExit=()=>{if(!persistDraft())return;preventAutosave();setExitOpen(false);onClose();};
  const exitWithoutSaving=()=>{preventAutosave();if(activeDraftIdRef.current)drafts.remove(activeDraftIdRef.current);activeDraftIdRef.current=null;setActiveDraftId(null);setExitOpen(false);onClose();};
  const confirmDeleteDraft=()=>{if(!deleteDraftId)return;drafts.remove(deleteDraftId);if(activeDraftIdRef.current===deleteDraftId){activeDraftIdRef.current=null;setActiveDraftId(null);}setDeleteDraftId(null);};
  const selectedIds = affectedItems.map((item) => item.inventoryItemId).filter(Boolean);
  const availableProducts = incidentProductsForIngredients(products,selectedIds);
  const selectedProduct = availableProducts.find((product)=>product.variantId===productVariantId);
  const choosePhoto = (file?: File) => {
    if (!file) return;
    if (file.size > 3_000_000) return toast.error("Evidence image must be 3 MB or smaller.");
    const reader = new FileReader();
    reader.onload = () => setPhotoUrl(String(reader.result));
    reader.readAsDataURL(file);
  };
  const submit = async () => {
    if (!type) return toast.error("Select an incident type.");
    const otherError = validateOtherIncidentType(type, otherIncidentType);
    setOtherIncidentTypeError(otherError);
    if (otherError) return;
    if (!validAffectedItems(affectedItems) || !occurredAt || reason.trim().length < 3) return toast.error("Complete each unique affected item and positive quantity, plus the date/time and reason.");
    const dateError = validateIncidentDateTime(occurredAt);
    if (dateError) return toast.error(dateError);
    setSaving(true);
    try {
      const incident = await operationsService.createIncident({ items: affectedItemsPayload(affectedItems), productId: selectedProduct?.productId, productVariantId: selectedProduct?.variantId, incidentType: type, otherIncidentType: type === "OTHER" ? otherIncidentType.trim() : undefined, occurredAt: manilaDateTimeToIso(occurredAt), lateReportingReason: occurredAt.slice(0,10) < businessDate(new Date(), "Asia/Manila") ? lateReportingReason.trim() : undefined, reason: reason.trim(), photoUrl });
      toast.success(incident.isLate ? "Late incident request sent for Manager verification" : "Incident report submitted for Manager review");
      preventAutosave();if(activeDraftIdRef.current)drafts.remove(activeDraftIdRef.current);
      onSaved();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Unable to submit incident report."); }
    finally { setSaving(false); }
  };
  return <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/50" onMouseDown={(event)=>{if(isModalBackdropEvent(event))requestClose();}}>
    <div role="dialog" aria-modal="true" aria-labelledby="staff-incident-title" className="flex w-full max-h-[94vh] flex-col overflow-hidden rounded-t-3xl bg-[var(--app-surface)] sm:max-w-2xl sm:rounded-3xl lg:max-w-4xl">
      <div className="flex shrink-0 items-start justify-between gap-4 border-b border-[var(--app-border)] p-5 sm:p-6"><div className="min-w-0"><p className="text-xs font-bold tracking-wider text-[var(--app-primary)]">STAFF REPORT</p><h2 id="staff-incident-title" className="text-xl font-bold mt-1">Record an Incident</h2><p className="text-xs mt-1 text-[var(--app-text-muted)]">This remains pending until your Manager verifies it.</p></div><button autoFocus onClick={requestClose} className="w-9 h-9 shrink-0 rounded-xl bg-[var(--app-surface-muted)] flex items-center justify-center" aria-label="Close incident form"><X size={16}/></button></div>
      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-5 py-5 sm:px-6">
      {recoveryDraftId&&drafts.read(recoveryDraftId)&&<div className="mb-5 rounded-2xl border border-[var(--app-primary)] bg-[var(--app-primary-faint)] p-4"><p className="font-semibold">Resume Incident Draft?</p><p className="mt-1 text-xs text-[var(--app-text-muted)]">{incidentDraftSummary(drafts.read(recoveryDraftId)!.value)} · Attachments must be reselected.</p><div className="mt-3 flex gap-2"><button type="button" onClick={()=>continueDraft(recoveryDraftId)} className="rounded-lg bg-[var(--app-primary)] px-3 py-2 text-xs font-semibold text-white">Resume Draft</button><button type="button" onClick={()=>{setRecoveryDraftId(null);resetForm();}} className="rounded-lg border border-[var(--app-border)] px-3 py-2 text-xs font-semibold">Start New</button></div></div>}
      {draftsOpen&&<section aria-label="Temporary incident drafts" className="mb-5 rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface-muted)] p-4"><div className="flex items-center justify-between gap-3"><div><h3 className="font-semibold">Temporary Incident Drafts</h3><p className="text-xs text-[var(--app-text-muted)]">Saved only in this browser. Photos are never stored.</p></div><button type="button" onClick={()=>{resetForm();setDraftsOpen(false);}} className="rounded-lg border border-[var(--app-border)] px-3 py-2 text-xs font-semibold">Start New</button></div>{draftEntries.length===0?<p className="py-6 text-center text-sm text-[var(--app-text-muted)]">No saved incident drafts.</p>:<ul className="mt-3 space-y-2">{draftEntries.map((draft)=><li key={draft.id} className="flex flex-col gap-3 rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] p-3 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="truncate text-sm font-semibold">{incidentDraftSummary(draft.value)}</p><p className="mt-1 text-xs text-[var(--app-text-muted)]">Last edited {formatDraftEditedAt(draft.savedAt)}</p></div><div className="flex shrink-0 gap-2"><button type="button" onClick={()=>continueDraft(draft.id)} className="inline-flex items-center gap-1 rounded-lg border border-[var(--app-border)] px-2.5 py-1.5 text-xs font-semibold text-[var(--app-primary)]"><FilePenLine size={13}/>Continue/Edit</button><button type="button" onClick={()=>setDeleteDraftId(draft.id)} className="inline-flex items-center gap-1 rounded-lg border border-[var(--app-border)] px-2.5 py-1.5 text-xs font-semibold text-[var(--app-danger)]"><Trash2 size={13}/>Delete Draft</button></div></li>)}</ul>}</section>}
      {activeDraftId&&<p className="mb-4 text-xs text-[var(--app-text-muted)]">Autosaving this incident draft on this device. Attachments are excluded.</p>}{draftError&&<p role="alert" className="mb-4 text-sm text-[var(--app-danger)]">{draftError}</p>}
      <label className="block text-sm font-semibold">Incident Type <span className="text-[var(--app-danger)]">*</span><Select className="mt-2 w-full" value={type} onChange={(value)=>{const next=value as IncidentType|"";setType(next);setOtherIncidentType(next==="OTHER"?otherIncidentType:"");setOtherIncidentTypeError("");}} options={[{value:"",label:"Select Incident Type"},...incidentTypeOptions]}/></label>
      {type && (
        <OtherIncidentTypeField type={type} value={otherIncidentType} error={otherIncidentTypeError} onChange={(value) => { setOtherIncidentType(value); if (otherIncidentTypeError) setOtherIncidentTypeError(validateOtherIncidentType(type, value)); }}/>
      )}
      <div className="mt-5 flex w-full min-w-0 flex-col gap-5">
        <label className="block w-full min-w-0 text-sm font-semibold text-[var(--app-text)]"><span className="block">Affected Product Variant <span className="font-normal text-[var(--app-text-muted)]">(optional; recipe must contain every affected ingredient)</span></span><Select className="mt-2 w-full" value={productVariantId} onChange={setProductVariantId} disabled={!selectedIds.length} options={availableProducts.length?[{ value: "", label: "Not related to a specific product variant" }, ...availableProducts.map((product) => ({ value: product.variantId, label: incidentProductOptionLabel(product) }))]:[]} searchable searchPlaceholder={selectedIds.length?"Search product variants…":"Select affected items first"}/>{selectedIds.length>0 && availableProducts.length === 0 && <span className="mt-1.5 block text-xs font-normal text-[var(--app-text-muted)]">No active branch product variant recipe uses every affected ingredient.</span>}</label>
        <fieldset className="w-full min-w-0"><legend className="text-sm font-semibold">Affected Items</legend><div className="mt-2 space-y-3">{affectedItems.map((affected,index)=>{const selected=options.find((item)=>item.inventoryItemId===affected.inventoryItemId);const availableUnits=selected?compatibleUnits(selected.unit):[];return <div key={index} data-incident-item-grid className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_2.75rem] items-end gap-3 overflow-hidden rounded-xl border border-[var(--app-border)] p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(5rem,7rem)_2.75rem] lg:grid-cols-[minmax(0,1fr)_minmax(8rem,10rem)_minmax(5rem,7rem)_2.75rem]">
          <label data-incident-field="ingredient" className="col-[1/-1] block min-w-0 text-xs font-semibold lg:col-[1]"><span className="mb-1.5 block">Item</span><Select className="w-full min-w-0" value={affected.inventoryItemId} onChange={(value)=>{const option=options.find((item)=>item.inventoryItemId===value);setAffectedItems((current)=>current.map((item,itemIndex)=>itemIndex===index?{...item,inventoryItemId:value,enteredUnit:(option?.unit??"") as MeasurementUnit|""}:item));setProductVariantId("");}} options={[{value:"",label:"Select ingredient"},...options.filter((option)=>!selectedIds.includes(option.inventoryItemId)||option.inventoryItemId===affected.inventoryItemId).map((item)=>({value:item.inventoryItemId,label:`${item.name} (${item.sku})`}))]} searchable searchPlaceholder="Search ingredients…"/></label>
          <label data-incident-field="quantity" className="col-[1/-1] block min-w-0 text-xs font-semibold sm:col-[1/3] lg:col-[2]"><span className="mb-1.5 block">Quantity</span><input className={`${controlClass} mt-0 h-11`} type="number" min=".001" step="any" value={affected.quantity} onChange={(event)=>setAffectedItems((current)=>current.map((item,itemIndex)=>itemIndex===index?{...item,quantity:event.target.value}:item))} placeholder="0.00"/></label>
          <label data-incident-field="unit" className="col-[1] block min-w-0 text-xs font-semibold sm:col-[3] lg:col-[3]"><span className="mb-1.5 block">Unit</span><Select className="w-full min-w-0" value={affected.enteredUnit??""} disabled={!selected} onChange={(value)=>setAffectedItems((current)=>current.map((item,itemIndex)=>itemIndex===index?{...item,enteredUnit:value as MeasurementUnit}:item))} options={availableUnits.map((unit)=>({value:unit,label:unit}))}/></label>
          <div data-incident-field="delete" className="col-[2] w-11 min-w-0 sm:col-[4] lg:col-[4]"><span className="mb-1.5 block text-xs font-semibold opacity-0" aria-hidden="true">Remove</span><button type="button" aria-label={`Remove affected item ${index+1}`} disabled={affectedItems.length===1} onClick={()=>{setAffectedItems((current)=>current.filter((_,itemIndex)=>itemIndex!==index));setProductVariantId("");}} className="flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--app-border)] text-[var(--app-danger)] disabled:opacity-30"><Trash2 size={16}/></button></div>
        </div>})}</div><button type="button" onClick={()=>setAffectedItems((current)=>[...current,{inventoryItemId:"",quantity:"",enteredUnit:""}])} className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-xl border border-[var(--app-border)] px-3 py-2 text-sm font-semibold text-[var(--app-primary)]"><Plus size={15}/>Add affected item</button></fieldset>
        <div className="sm:col-span-2"><CalendarDateTimeField label="Date and Time" value={occurredAt} max={currentDateTime()} onChange={setOccurredAt}/></div>
        {occurredAt.slice(0,10) < businessDate(new Date(), "Asia/Manila") && <label className="block min-w-0 text-sm font-semibold"><span>Reason for Late Reporting <span className="text-[var(--app-danger)]">*</span></span><textarea className={`${controlClass} min-h-20`} minLength={10} maxLength={1000} value={lateReportingReason} onChange={(event)=>setLateReportingReason(event.target.value)} placeholder="Explain why this incident is being reported after its business date."/><span className="mt-1 block text-xs font-normal text-[var(--app-text-muted)]">At least 10 characters. Manager verification is still required.</span></label>}
        <label className="block min-w-0 text-sm font-semibold text-[var(--app-text)] sm:col-span-2"><span className="block">What happened?</span><textarea className={`${controlClass} min-h-28 resize-y`} rows={4} maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Describe the incident clearly…"/></label>
        <label className="block w-full min-w-0 border-t border-[var(--app-border)] pt-5 text-sm font-semibold text-[var(--app-text)]"><span className="block">Optional Photo Evidence</span><input className={`${controlClass} max-w-full cursor-pointer text-xs file:mr-3 file:rounded-lg file:border-0 file:bg-[var(--app-primary-subtle)] file:px-3 file:py-2 file:font-semibold file:text-[var(--app-primary)]`} type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => choosePhoto(event.target.files?.[0])}/>{photoUrl && <img src={photoUrl} alt="Evidence preview" className="mt-3 w-full max-h-48 object-contain rounded-xl border border-[var(--app-border)]"/>}<span className="flex items-center gap-1.5 text-xs font-normal mt-2 text-[var(--app-text-faint)]"><Camera size={13}/>JPEG, PNG, or WebP · Max 3 MB</span></label>
      </div>
      <p className="mt-5 p-3 rounded-xl text-xs leading-relaxed bg-[var(--app-primary-subtle)] text-[var(--app-text-muted)]">This report supports variance investigation. It does not deduct inventory or automatically assign responsibility.</p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-3 border-t border-[var(--app-border)] bg-[var(--app-surface)] p-4 sm:px-6"><button disabled={saving} onClick={() => void submit()} className="min-h-11 flex-1 rounded-xl bg-[var(--app-primary)] px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60 sm:flex-none">{saving ? "Submitting…" : "Submit Incident"}</button>{draftEntries.length>0&&<button type="button" onClick={()=>setDraftsOpen((open)=>!open)} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-[var(--app-border)] px-4 py-2.5 text-sm font-semibold text-[var(--app-primary)] sm:flex-none"><FolderOpen size={15}/>View Drafts ({draftEntries.length})</button>}<button onClick={requestClose} className="min-h-11 flex-1 rounded-xl border border-[var(--app-border)] px-4 py-2.5 text-sm font-semibold sm:flex-none">Cancel</button></div>
    </div>
    {exitOpen&&<IncidentExitDialog error={draftError} onKeepEditing={()=>{setExitOpen(false);setDraftError("");}} onSaveDraft={saveAndExit} onExit={exitWithoutSaving}/>}
    {deleteDraftId&&<DraftDecisionDialog title="Delete Incident Draft?" description="This removes only the selected browser-local draft. No official incident or stock record is affected." confirmLabel="Delete Draft" onCancel={()=>setDeleteDraftId(null)} onConfirm={confirmDeleteDraft}/>}
  </div>;
}
