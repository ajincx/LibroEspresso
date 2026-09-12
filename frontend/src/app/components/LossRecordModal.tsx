import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { operationsService } from "../services/operations.service";
import type { IncidentReport, IncidentType, InventoryOverviewItem } from "../types/operations";
import { Btn, CalendarDateTimeField, Select } from "./ModuleUi";
import { businessDateTime } from "../utils/businessDate";
import { incidentTypeOptions } from "../utils/shrinkageTaxonomy";

const localDateTimeValue = () => businessDateTime();

export function LossRecordModal({ items = [], onClose, onSaved }: {
  items?: InventoryOverviewItem[];
  onClose: () => void;
  onSaved: (incident: IncidentReport) => void;
}) {
  const [availableItems, setAvailableItems] = useState(items);
  useEffect(() => {
    if (items.length) { setAvailableItems(items); return; }
    void operationsService.inventoryOverview().then(setAvailableItems).catch(() => setAvailableItems([]));
  }, [items]);
  const [incidentType, setIncidentType] = useState<IncidentType>("SPOILAGE");
  const [inventoryItemId, setInventoryItemId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [occurredAt, setOccurredAt] = useState(localDateTimeValue);
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const selected = availableItems.find((item) => item.inventoryItemId === inventoryItemId);
  const uniqueItems = useMemo(() => Array.from(new Map(availableItems.map((item) => [item.inventoryItemId, item])).values()), [availableItems]);
  const estimatedValue = selected ? Number(quantity || 0) * selected.unitCost : 0;

  const save = async () => {
    if (!inventoryItemId || !(Number(quantity) > 0) || !occurredAt || reason.trim().length < 3) {
      setError("Select an item and provide a valid quantity, date, and reason.");
      return;
    }
    setSaving(true); setError("");
    try {
      const incident = await operationsService.createIncident({
        inventoryItemId, incidentType, quantity: Number(quantity),
        occurredAt: new Date(occurredAt).toISOString(), reason: reason.trim(), notes: notes.trim() || undefined,
      });
      toast.success("Incident report submitted for verification");
      onSaved(incident);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save the incident report.");
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.45)" }}>
      <div role="dialog" aria-modal="true" aria-labelledby="loss-record-title" className="rounded-2xl shadow-2xl w-full max-w-xl p-6 border" style={{ background: "var(--app-surface)", borderColor: "var(--app-border)" }}>
        <div className="flex items-start justify-between mb-5">
          <div><h3 id="loss-record-title" className="font-bold text-lg">Record Loss / Incident</h3><p className="text-xs mt-1 text-[var(--app-text-muted)]">This report supports variance investigation and does not directly deduct inventory.</p></div>
          <button autoFocus onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center bg-[var(--app-surface-muted)] text-[var(--app-text-muted)]" aria-label="Close"><X size={15}/></button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-1 p-1 rounded-xl border mb-5 border-[var(--app-border)]">
          {incidentTypeOptions.map(({ value: type, label }) => <button key={type} type="button" onClick={() => setIncidentType(type)}
            className="px-2 py-2 rounded-lg text-[11px] font-semibold transition-colors"
            style={{ background: incidentType === type ? "var(--app-primary)" : "transparent", color: incidentType === type ? "#fff" : "var(--app-text-muted)" }}>{label}</button>)}
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <CalendarDateTimeField label="Date and Time" value={occurredAt} onChange={setOccurredAt}/>
          <label className="text-sm font-medium">Item / SKU<Select className="mt-1.5 w-full" value={inventoryItemId} onChange={setInventoryItemId} options={[{ value: "", label: "Select ingredient" }, ...uniqueItems.map((item) => ({ value: item.inventoryItemId, label: `${item.name} (${item.sku})` }))]}/></label>
          <label className="text-sm font-medium">Quantity<input type="number" min="0" step="any" value={quantity} onChange={(event) => setQuantity(event.target.value)} placeholder="0.00" className="field mt-1.5"/></label>
          <label className="text-sm font-medium">Unit<input value={selected?.unit ?? ""} disabled placeholder="From inventory item" className="field mt-1.5 disabled:opacity-70"/></label>
          <label className="sm:col-span-2 text-sm font-medium">Reason<textarea rows={2} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Describe what happened" className="field mt-1.5 resize-none"/></label>
          <label className="sm:col-span-2 text-sm font-medium">Additional notes (optional)<textarea rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Additional context or corrective action" className="field mt-1.5 resize-none"/></label>
        </div>

        <div className="flex items-center justify-between p-3 rounded-xl my-5 bg-[var(--app-surface-muted)]"><span className="text-sm text-[var(--app-text-muted)]">Estimated loss value</span><strong>₱{estimatedValue.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
        {error && <p className="text-sm mb-4 text-[var(--app-danger)]">{error}</p>}
        <div className="flex justify-end gap-3"><Btn variant="outline" onClick={onClose}>Cancel</Btn><button disabled={saving} onClick={() => void save()} className="px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-[var(--app-primary)] disabled:opacity-50">{saving ? "Saving…" : "Submit Incident"}</button></div>
      </div>
    </div>
  );
}
