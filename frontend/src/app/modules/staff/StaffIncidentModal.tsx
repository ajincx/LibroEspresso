import { useState } from "react";
import { Camera, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { operationsService } from "../../services/operations.service";
import type { IncidentItemOption, IncidentProductOption, IncidentType } from "../../types/operations";
import { CalendarDateTimeField, isModalBackdropEvent, Select } from "../../components/ModuleUi";
import { businessDateTime } from "../../utils/businessDate";
import { incidentTypeOptions } from "../../utils/shrinkageTaxonomy";
const currentDateTime = () => businessDateTime();
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
export type AffectedItemDraft = { inventoryItemId: string; quantity: string };
export const validAffectedItems = (items: AffectedItemDraft[]) => items.length>0 && items.every((item)=>item.inventoryItemId&&Number.isFinite(Number(item.quantity))&&Number(item.quantity)>0) && new Set(items.map((item)=>item.inventoryItemId)).size===items.length;
export const affectedItemsPayload = (items: AffectedItemDraft[]) => items.map((item)=>({inventoryItemId:item.inventoryItemId,quantity:Number(item.quantity)}));

export function OtherIncidentTypeField({type,value,error,onChange}:{type:IncidentType;value:string;error:string;onChange:(value:string)=>void}) {
  if (type !== "OTHER") return null;
  return <label className="mt-4 block min-w-0 text-sm font-semibold text-[var(--app-text)]"><span className="block">Specify incident type <span className="text-[var(--app-danger)]">*</span></span><input autoFocus className={`${controlClass} ${error ? "border-[var(--app-danger)]" : ""}`} value={value} maxLength={120} aria-invalid={Boolean(error)} aria-describedby={error ? "other-incident-type-error" : undefined} onChange={(event) => onChange(event.target.value)} placeholder="Please specify the incident type"/>{error && <span id="other-incident-type-error" role="alert" className="mt-1.5 block text-xs font-medium text-[var(--app-danger)]">{error}</span>}<span className="mt-1 block text-right text-xs font-normal text-[var(--app-text-faint)]">{value.length}/120</span></label>;
}

export function StaffIncidentModal({ options, products, onClose, onSaved }: { options: IncidentItemOption[]; products: IncidentProductOption[]; onClose: () => void; onSaved: () => void }) {
  const [type, setType] = useState<IncidentType>("WASTAGE");
  const [affectedItems, setAffectedItems] = useState([{ inventoryItemId: "", quantity: "" }]);
  const [productVariantId, setProductVariantId] = useState("");
  const [occurredAt, setOccurredAt] = useState(currentDateTime);
  const [reason, setReason] = useState("");
  const [otherIncidentType, setOtherIncidentType] = useState("");
  const [otherIncidentTypeError, setOtherIncidentTypeError] = useState("");
  const [photoUrl, setPhotoUrl] = useState<string>();
  const [saving, setSaving] = useState(false);
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
    const otherError = validateOtherIncidentType(type, otherIncidentType);
    setOtherIncidentTypeError(otherError);
    if (otherError) return;
    if (!validAffectedItems(affectedItems) || !occurredAt || reason.trim().length < 3) return toast.error("Complete each unique affected item and positive quantity, plus the date/time and reason.");
    setSaving(true);
    try {
      await operationsService.createIncident({ items: affectedItemsPayload(affectedItems), productId: selectedProduct?.productId, productVariantId: selectedProduct?.variantId, incidentType: type, otherIncidentType: type === "OTHER" ? otherIncidentType.trim() : undefined, occurredAt: new Date(occurredAt).toISOString(), reason: reason.trim(), photoUrl });
      toast.success("Incident report submitted for Manager review");
      onSaved();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Unable to submit incident report."); }
    finally { setSaving(false); }
  };
  return <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/50" onMouseDown={(event)=>{if(isModalBackdropEvent(event))onClose();}}>
    <div role="dialog" aria-modal="true" aria-labelledby="staff-incident-title" className="flex w-full max-h-[94vh] flex-col overflow-hidden rounded-t-3xl bg-[var(--app-surface)] sm:max-w-2xl sm:rounded-3xl lg:max-w-4xl">
      <div className="flex shrink-0 items-start justify-between gap-4 border-b border-[var(--app-border)] p-5 sm:p-6"><div className="min-w-0"><p className="text-xs font-bold tracking-wider text-[var(--app-primary)]">STAFF REPORT</p><h2 id="staff-incident-title" className="text-xl font-bold mt-1">Record an Incident</h2><p className="text-xs mt-1 text-[var(--app-text-muted)]">This remains pending until your Manager verifies it.</p></div><button autoFocus onClick={onClose} className="w-9 h-9 shrink-0 rounded-xl bg-[var(--app-surface-muted)] flex items-center justify-center" aria-label="Close incident form"><X size={16}/></button></div>
      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-5 py-5 sm:px-6">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">{incidentTypeOptions.map((item) => <button type="button" key={item.value} aria-pressed={type === item.value} onClick={() => { setType(item.value); setOtherIncidentType((current) => nextOtherIncidentType(item.value, current)); setOtherIncidentTypeError(""); }} className="p-2.5 rounded-xl text-xs font-semibold border" style={{ background: type === item.value ? "var(--app-primary)" : "var(--app-surface)", color: type === item.value ? "white" : "var(--app-text-muted)", borderColor: type === item.value ? "var(--app-primary)" : "var(--app-border)" }}>{item.label}</button>)}</div>
      <OtherIncidentTypeField type={type} value={otherIncidentType} error={otherIncidentTypeError} onChange={(value) => { setOtherIncidentType(value); if (otherIncidentTypeError) setOtherIncidentTypeError(validateOtherIncidentType(type, value)); }}/>
      <div className="mt-5 flex w-full min-w-0 flex-col gap-5">
        <label className="block w-full min-w-0 text-sm font-semibold text-[var(--app-text)]"><span className="block">Affected Product Variant <span className="font-normal text-[var(--app-text-muted)]">(optional; recipe must contain every affected ingredient)</span></span><Select className="mt-2 w-full" value={productVariantId} onChange={setProductVariantId} disabled={!selectedIds.length} options={availableProducts.length?[{ value: "", label: "Not related to a specific product variant" }, ...availableProducts.map((product) => ({ value: product.variantId, label: incidentProductOptionLabel(product) }))]:[]} searchable searchPlaceholder={selectedIds.length?"Search product variants…":"Select affected items first"}/>{selectedIds.length>0 && availableProducts.length === 0 && <span className="mt-1.5 block text-xs font-normal text-[var(--app-text-muted)]">No active branch product variant recipe uses every affected ingredient.</span>}</label>
        <fieldset className="w-full min-w-0"><legend className="text-sm font-semibold">Affected Items</legend><div className="mt-2 space-y-3">{affectedItems.map((affected,index)=>{const selected=options.find((item)=>item.inventoryItemId===affected.inventoryItemId);return <div key={index} className="grid grid-cols-[minmax(0,1fr)_5rem_2.75rem] gap-3 rounded-xl border border-[var(--app-border)] p-3 lg:grid-cols-[minmax(20rem,1fr)_minmax(8rem,10rem)_6rem_2.75rem] lg:items-end"><label className="col-span-3 block min-w-0 text-xs font-semibold lg:col-span-1"><span className="mb-1.5 block">Item</span><Select className="w-full" value={affected.inventoryItemId} onChange={(value)=>{setAffectedItems((current)=>current.map((item,itemIndex)=>itemIndex===index?{...item,inventoryItemId:value}:item));setProductVariantId("");}} options={[{value:"",label:"Select ingredient"},...options.filter((option)=>!selectedIds.includes(option.inventoryItemId)||option.inventoryItemId===affected.inventoryItemId).map((item)=>({value:item.inventoryItemId,label:`${item.name} (${item.sku})`}))]} searchable searchPlaceholder="Search ingredients…"/></label><label className="block min-w-0 text-xs font-semibold"><span className="mb-1.5 block">Quantity</span><input className={`${controlClass} mt-0 h-11`} type="number" min=".001" step="any" value={affected.quantity} onChange={(event)=>setAffectedItems((current)=>current.map((item,itemIndex)=>itemIndex===index?{...item,quantity:event.target.value}:item))} placeholder="0.00"/></label><div className="min-w-0"><span className="mb-1.5 block text-xs font-semibold">Unit</span><div className="flex h-11 items-center rounded-xl border border-[var(--app-border)] bg-[var(--app-surface-muted)] px-3 text-sm font-semibold text-[var(--app-text-muted)]">{selected?.unit??"—"}</div></div><div><span className="mb-1.5 block text-xs font-semibold opacity-0" aria-hidden="true">Remove</span><button type="button" aria-label={`Remove affected item ${index+1}`} disabled={affectedItems.length===1} onClick={()=>{setAffectedItems((current)=>current.filter((_,itemIndex)=>itemIndex!==index));setProductVariantId("");}} className="flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--app-border)] text-[var(--app-danger)] disabled:opacity-30"><Trash2 size={16}/></button></div></div>})}</div><button type="button" onClick={()=>setAffectedItems((current)=>[...current,{inventoryItemId:"",quantity:""}])} className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-xl border border-[var(--app-border)] px-3 py-2 text-sm font-semibold text-[var(--app-primary)]"><Plus size={15}/>Add affected item</button></fieldset>
        <div className="sm:col-span-2"><CalendarDateTimeField label="Date and Time" value={occurredAt} onChange={setOccurredAt}/></div>
        <label className="block min-w-0 text-sm font-semibold text-[var(--app-text)] sm:col-span-2"><span className="block">What happened?</span><textarea className={`${controlClass} min-h-28 resize-y`} rows={4} maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Describe the incident clearly…"/></label>
        <label className="block w-full min-w-0 border-t border-[var(--app-border)] pt-5 text-sm font-semibold text-[var(--app-text)]"><span className="block">Optional Photo Evidence</span><input className={`${controlClass} max-w-full cursor-pointer text-xs file:mr-3 file:rounded-lg file:border-0 file:bg-[var(--app-primary-subtle)] file:px-3 file:py-2 file:font-semibold file:text-[var(--app-primary)]`} type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => choosePhoto(event.target.files?.[0])}/>{photoUrl && <img src={photoUrl} alt="Evidence preview" className="mt-3 w-full max-h-48 object-contain rounded-xl border border-[var(--app-border)]"/>}<span className="flex items-center gap-1.5 text-xs font-normal mt-2 text-[var(--app-text-faint)]"><Camera size={13}/>JPEG, PNG, or WebP · Max 3 MB</span></label>
      </div>
      <p className="mt-5 p-3 rounded-xl text-xs leading-relaxed bg-[var(--app-primary-subtle)] text-[var(--app-text-muted)]">This report supports variance investigation. It does not deduct inventory or automatically assign responsibility.</p>
      </div>
      <div className="flex shrink-0 items-center justify-end gap-3 border-t border-[var(--app-border)] bg-[var(--app-surface)] p-4 sm:px-6"><button onClick={onClose} className="min-h-11 flex-1 rounded-xl border border-[var(--app-border)] px-4 py-2.5 text-sm font-semibold sm:flex-none">Cancel</button><button disabled={saving} onClick={() => void submit()} className="min-h-11 flex-1 rounded-xl bg-[var(--app-primary)] px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60 sm:flex-none">{saving ? "Submitting…" : "Submit Report"}</button></div>
    </div>
  </div>;
}
