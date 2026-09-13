import { useState } from "react";
import { Camera, X } from "lucide-react";
import { toast } from "sonner";
import { operationsService } from "../../services/operations.service";
import type { IncidentItemOption, IncidentProductOption, IncidentType } from "../../types/operations";
import { CalendarDateTimeField, Select } from "../../components/ModuleUi";
import { businessDateTime } from "../../utils/businessDate";
import { incidentTypeOptions } from "../../utils/shrinkageTaxonomy";
const currentDateTime = () => businessDateTime();
const controlClass = "mt-2 block w-full min-w-0 rounded-xl border border-[var(--app-border)] bg-[var(--app-surface-elevated)] px-3.5 py-3 text-sm text-[var(--app-text)] outline-none transition focus:border-[var(--app-primary)] focus:ring-4 focus:ring-[var(--app-primary-faint)]";
export const validateOtherIncidentType = (type: IncidentType, value: string) =>
  type === "OTHER" && !value.trim() ? "Please specify the incident type." : "";
export const nextOtherIncidentType = (nextType: IncidentType, currentValue: string) =>
  nextType === "OTHER" ? currentValue : "";

export function OtherIncidentTypeField({type,value,error,onChange}:{type:IncidentType;value:string;error:string;onChange:(value:string)=>void}) {
  if (type !== "OTHER") return null;
  return <label className="mt-4 block min-w-0 text-sm font-semibold text-[var(--app-text)]"><span className="block">Specify incident type <span className="text-[var(--app-danger)]">*</span></span><input autoFocus className={`${controlClass} ${error ? "border-[var(--app-danger)]" : ""}`} value={value} maxLength={120} aria-invalid={Boolean(error)} aria-describedby={error ? "other-incident-type-error" : undefined} onChange={(event) => onChange(event.target.value)} placeholder="Please specify the incident type"/>{error && <span id="other-incident-type-error" role="alert" className="mt-1.5 block text-xs font-medium text-[var(--app-danger)]">{error}</span>}<span className="mt-1 block text-right text-xs font-normal text-[var(--app-text-faint)]">{value.length}/120</span></label>;
}

export function StaffIncidentModal({ options, products, onClose, onSaved }: { options: IncidentItemOption[]; products: IncidentProductOption[]; onClose: () => void; onSaved: () => void }) {
  const [type, setType] = useState<IncidentType>("WASTAGE");
  const [itemId, setItemId] = useState("");
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [occurredAt, setOccurredAt] = useState(currentDateTime);
  const [reason, setReason] = useState("");
  const [otherIncidentType, setOtherIncidentType] = useState("");
  const [otherIncidentTypeError, setOtherIncidentTypeError] = useState("");
  const [photoUrl, setPhotoUrl] = useState<string>();
  const [saving, setSaving] = useState(false);
  const selected = options.find((item) => item.inventoryItemId === itemId);
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
    if (!itemId || Number(quantity) <= 0 || !occurredAt || reason.trim().length < 3) return toast.error("Complete the item, quantity, date/time, and reason.");
    setSaving(true);
    try {
      await operationsService.createIncident({ inventoryItemId: itemId, productId: productId || undefined, incidentType: type, otherIncidentType: type === "OTHER" ? otherIncidentType.trim() : undefined, quantity: Number(quantity), occurredAt: new Date(occurredAt).toISOString(), reason: reason.trim(), photoUrl });
      toast.success("Incident report submitted for Manager review");
      onSaved();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Unable to submit incident report."); }
    finally { setSaving(false); }
  };
  return <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/50">
    <div role="dialog" aria-modal="true" aria-labelledby="staff-incident-title" className="w-full sm:max-w-xl max-h-[94vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 bg-[var(--app-surface)]">
      <div className="flex justify-between mb-5"><div><p className="text-xs font-bold tracking-wider text-[var(--app-primary)]">STAFF REPORT</p><h2 id="staff-incident-title" className="text-xl font-bold mt-1">Record an Incident</h2><p className="text-xs mt-1 text-[var(--app-text-muted)]">This remains pending until your Manager verifies it.</p></div><button autoFocus onClick={onClose} className="w-9 h-9 rounded-xl bg-[var(--app-surface-muted)] flex items-center justify-center" aria-label="Close incident form"><X size={16}/></button></div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">{incidentTypeOptions.map((item) => <button type="button" key={item.value} aria-pressed={type === item.value} onClick={() => { setType(item.value); setOtherIncidentType((current) => nextOtherIncidentType(item.value, current)); setOtherIncidentTypeError(""); }} className="p-2.5 rounded-xl text-xs font-semibold border" style={{ background: type === item.value ? "var(--app-primary)" : "var(--app-surface)", color: type === item.value ? "white" : "var(--app-text-muted)", borderColor: type === item.value ? "var(--app-primary)" : "var(--app-border)" }}>{item.label}</button>)}</div>
      <OtherIncidentTypeField type={type} value={otherIncidentType} error={otherIncidentTypeError} onChange={(value) => { setOtherIncidentType(value); if (otherIncidentTypeError) setOtherIncidentTypeError(validateOtherIncidentType(type, value)); }}/>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-5">
        <label className="block min-w-0 text-sm font-semibold text-[var(--app-text)] sm:col-span-2"><span className="block">Product <span className="font-normal text-[var(--app-text-muted)]">(optional)</span></span><Select className="mt-2 w-full" value={productId} onChange={setProductId} options={[{ value: "", label: "Not related to a specific product" }, ...products.map((product) => ({ value: product.productId, label: `${product.name} (${product.code})` }))]}/></label>
        <label className="block min-w-0 text-sm font-semibold text-[var(--app-text)]"><span className="block">Item</span><Select className="mt-2 w-full" value={itemId} onChange={setItemId} options={[{ value: "", label: "Select ingredient" }, ...options.map((item) => ({ value: item.inventoryItemId, label: `${item.name} (${item.sku})` }))]}/></label>
        <label className="block min-w-0 text-sm font-semibold text-[var(--app-text)]"><span className="block">Quantity ({selected?.unit ?? "unit"})</span><input className={controlClass} type="number" min=".001" step="any" value={quantity} onChange={(event) => setQuantity(event.target.value)} placeholder="0.00"/></label>
        <div className="sm:col-span-2"><CalendarDateTimeField label="Date and Time" value={occurredAt} onChange={setOccurredAt}/></div>
        <label className="block min-w-0 text-sm font-semibold text-[var(--app-text)] sm:col-span-2"><span className="block">What happened?</span><textarea className={`${controlClass} min-h-28 resize-y`} rows={4} maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Describe the incident clearly…"/></label>
        <label className="block min-w-0 sm:col-span-2 text-sm font-semibold text-[var(--app-text)]"><span className="block">Optional Photo Evidence</span><input className={`${controlClass} cursor-pointer text-xs file:mr-3 file:rounded-lg file:border-0 file:bg-[var(--app-primary-subtle)] file:px-3 file:py-2 file:font-semibold file:text-[var(--app-primary)]`} type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => choosePhoto(event.target.files?.[0])}/>{photoUrl && <img src={photoUrl} alt="Evidence preview" className="mt-3 w-full max-h-48 object-contain rounded-xl border border-[var(--app-border)]"/>}<span className="flex items-center gap-1.5 text-xs font-normal mt-2 text-[var(--app-text-faint)]"><Camera size={13}/>JPEG, PNG, or WebP · Max 3 MB</span></label>
      </div>
      <p className="mt-5 p-3 rounded-xl text-xs leading-relaxed bg-[var(--app-primary-subtle)] text-[var(--app-text-muted)]">This report supports variance investigation. It does not deduct inventory or automatically assign responsibility.</p>
      <div className="mt-5 flex justify-end gap-2"><button onClick={onClose} className="px-4 py-2.5 rounded-xl border border-[var(--app-border)] text-sm font-semibold">Cancel</button><button disabled={saving} onClick={() => void submit()} className="px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-[var(--app-primary)] disabled:opacity-60">{saving ? "Submitting…" : "Submit Report"}</button></div>
    </div>
  </div>;
}
