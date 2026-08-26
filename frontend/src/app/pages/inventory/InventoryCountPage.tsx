import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle, ClipboardList, RefreshCw, Send, X } from "lucide-react";
import { toast } from "sonner";
import { inventoryWorkflowService } from "../../services/inventoryWorkflow.service";
import { masterDataService } from "../../services/masterData.service";
import type { CountVarianceItem, ExpectedInventoryItem, ShrinkageClassification } from "../../types/inventoryWorkflow";
import type { MenuItem } from "../../types/masterData";

const today = new Date().toISOString().slice(0, 10);
const classifications: { value: ShrinkageClassification; label: string; definition: string }[] = [
  { value: "SPOILAGE", label: "Spoilage", definition: "Expired, contaminated, damaged, or unusable inventory." },
  { value: "WASTAGE", label: "Wastage", definition: "Discarded due to preparation, overproduction, or handling errors." },
  { value: "PILFERAGE", label: "Pilferage", definition: "Suspected unauthorized or unaccounted removal of stock." },
  { value: "COUNT_ERROR", label: "Count Error", definition: "A physical counting or inventory encoding mistake." },
];

export function InventoryCountPage() {
  const [countDate, setCountDate] = useState(today);
  const [expected, setExpected] = useState<ExpectedInventoryItem[]>([]);
  const [actual, setActual] = useState<Record<string, number>>({});
  const [submitted, setSubmitted] = useState<{ countNo: string; items: CountVarianceItem[] } | null>(null);
  const [reportItem, setReportItem] = useState<CountVarianceItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const loadExpected = async () => {
    setLoading(true); setError(""); setSubmitted(null);
    try {
      const data = await inventoryWorkflowService.expected(countDate);
      setExpected(data.items);
      setActual(Object.fromEntries(data.items.map((item) => [item.inventoryItemId, Math.max(0, Number(item.expectedQuantity.toFixed(4)))])));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to calculate expected inventory"); }
    finally { setLoading(false); }
  };
  useEffect(() => { void loadExpected(); }, [countDate]);

  const submit = async () => {
    setSaving(true);
    try {
      const count = await inventoryWorkflowService.submitCount(countDate, expected.map((item) => ({ inventoryItemId: item.inventoryItemId, actualQuantity: actual[item.inventoryItemId] ?? 0 })));
      setSubmitted({ countNo: count.countNo, items: count.items });
      toast.success("Physical inventory count submitted");
    } catch (reason) { toast.error(reason instanceof Error ? reason.message : "Unable to submit inventory count"); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="p-16 text-center text-sm" style={{ color: "var(--app-text-muted)" }}>Calculating expected stock from recipes and POS sales…</div>;
  if (error) return <div className="p-16 text-center"><p className="text-sm mb-3" style={{ color: "var(--app-danger)" }}>{error}</p><button onClick={() => void loadExpected()} className="inline-flex items-center gap-2" style={{ color: "var(--app-primary)" }}><RefreshCw size={14} />Retry</button></div>;

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div><h1 className="text-2xl font-bold" style={{ color: "var(--app-text)" }}>Physical Inventory Count</h1><p className="text-sm mt-1" style={{ color: "var(--app-text-muted)" }}>Expected stock is calculated by the server from previous actual stock, receipts, recipes, POS sales, and approved adjustments.</p></div>
        <label className="text-xs font-semibold" style={{ color: "var(--app-text-muted)" }}>Count date<input type="date" value={countDate} onChange={(event) => setCountDate(event.target.value)} className="block mt-1 px-3 py-2 rounded-xl border" style={{ borderColor: "var(--app-border)", background: "var(--app-surface)", color: "var(--app-text)" }} /></label>
      </div>

      {submitted ? <CountResult countNo={submitted.countNo} items={submitted.items} onCreateReport={setReportItem} onNewCount={() => void loadExpected()} /> : (
        <div className="rounded-2xl border overflow-hidden" style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }}>
          <div className="overflow-x-auto"><table className="w-full text-sm"><thead style={{ background: "var(--app-bg)" }}><tr>{["SKU", "Ingredient", "Previous Actual", "Received", "Recipe Consumption", "Expected Stock", "Physical Count", "Preview Variance"].map((heading) => <th key={heading} className="px-4 py-3 text-left text-xs whitespace-nowrap" style={{ color: "var(--app-text-muted)" }}>{heading}</th>)}</tr></thead>
            <tbody>{expected.map((item) => {
              const variance = (actual[item.inventoryItemId] ?? 0) - item.expectedQuantity;
              return <tr key={item.inventoryItemId} className="border-t" style={{ borderColor: "var(--app-border)" }}>
                <td className="px-4 py-3 font-mono text-xs" style={{ color: "var(--app-text-faint)" }}>{item.sku}</td><td className="px-4 py-3 font-semibold" style={{ color: "var(--app-text)" }}>{item.itemName}</td>
                <td className="px-4 py-3">{item.previousActualQuantity.toFixed(2)} {item.unit}</td><td className="px-4 py-3">{item.stockReceived.toFixed(2)} {item.unit}</td>
                <td className="px-4 py-3" style={{ color: "var(--app-primary)" }}>−{item.expectedConsumption.toFixed(2)} {item.unit}</td><td className="px-4 py-3 font-bold">{item.expectedQuantity.toFixed(2)} {item.unit}</td>
                <td className="px-4 py-3"><input type="number" min={0} step="0.01" value={actual[item.inventoryItemId] ?? 0} onChange={(event) => setActual((current) => ({ ...current, [item.inventoryItemId]: Number(event.target.value) }))} className="w-28 px-2.5 py-2 rounded-lg border text-right font-semibold" style={{ borderColor: "var(--app-border)", background: "var(--app-surface-elevated)", color: "var(--app-text)" }} /></td>
                <td className="px-4 py-3 font-bold" style={{ color: Math.abs(variance) < 0.0001 ? "var(--app-success)" : "var(--app-danger)" }}>{variance > 0 ? "+" : ""}{variance.toFixed(2)} {item.unit}</td>
              </tr>;
            })}</tbody></table></div>
          <div className="flex items-center justify-between gap-4 p-4 border-t" style={{ borderColor: "var(--app-border)" }}><p className="text-xs" style={{ color: "var(--app-text-faint)" }}>Preview values are informational. Final variance is recalculated and stored by the backend.</p><button disabled={saving || expected.length === 0} onClick={() => void submit()} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: "var(--app-primary)" }}><Send size={14} />{saving ? "Submitting…" : "Submit Count"}</button></div>
        </div>
      )}
      {reportItem && <ShrinkageReportModal item={reportItem} onClose={() => setReportItem(null)} onSubmitted={() => { setReportItem(null); setSubmitted((current) => current ? { ...current, items: current.items.map((item) => item.id === reportItem.id ? { ...item, requiresShrinkageReport: false } : item) } : current); }} />}
    </div>
  );
}

function CountResult({ countNo, items, onCreateReport, onNewCount }: { countNo: string; items: CountVarianceItem[]; onCreateReport: (item: CountVarianceItem) => void; onNewCount: () => void }) {
  const variances = items.filter((item) => Math.abs(item.varianceQuantity) > 0.0001);
  return <div className="space-y-4"><div className="flex items-center justify-between p-4 rounded-2xl border" style={{ borderColor: variances.length ? "var(--app-warning)" : "var(--app-success)", background: variances.length ? "var(--app-warning-bg)" : "var(--app-success-bg)" }}><div className="flex items-center gap-3">{variances.length ? <AlertTriangle style={{ color: "var(--app-warning)" }} /> : <CheckCircle style={{ color: "var(--app-success)" }} />}<div><h2 className="font-bold">{variances.length ? "Inventory Variance Detected" : "Inventory Count Matched"}</h2><p className="text-xs mt-0.5" style={{ color: "var(--app-text-muted)" }}>{countNo} · {variances.length} item{variances.length === 1 ? "" : "s"} require reconciliation</p></div></div><button onClick={onNewCount} className="px-3 py-2 rounded-xl border text-xs font-semibold" style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }}>New Count</button></div>
    <div className="grid gap-3">{items.map((item) => <div key={item.id} className="p-4 rounded-2xl border flex items-center gap-4" style={{ borderColor: item.requiresShrinkageReport ? "var(--app-danger)" : "var(--app-border)", background: "var(--app-surface)" }}><ClipboardList size={18} style={{ color: item.requiresShrinkageReport ? "var(--app-danger)" : "var(--app-success)" }} /><div className="flex-1"><div className="font-semibold">{item.itemName}</div><div className="text-xs mt-1" style={{ color: "var(--app-text-muted)" }}>Expected {item.expectedQuantity.toFixed(2)}{item.unit} · Actual {item.actualQuantity.toFixed(2)}{item.unit}</div></div><div className="text-right"><div className="font-bold" style={{ color: item.varianceQuantity < 0 ? "var(--app-danger)" : "var(--app-success)" }}>{item.varianceQuantity > 0 ? "+" : ""}{item.varianceQuantity.toFixed(2)}{item.unit}</div><div className="text-[10px]" style={{ color: "var(--app-text-faint)" }}>₱{Math.abs(item.varianceValue).toFixed(2)}</div></div>{item.requiresShrinkageReport && <button onClick={() => onCreateReport(item)} className="px-3 py-2 rounded-xl text-xs font-semibold text-white" style={{ background: "var(--app-primary)" }}>Create Shrinkage Report</button>}</div>)}</div></div>;
}

function ShrinkageReportModal({ item, onClose, onSubmitted }: { item: CountVarianceItem; onClose: () => void; onSubmitted: () => void }) {
  const [classification, setClassification] = useState<ShrinkageClassification | "">("");
  const [explanation, setExplanation] = useState("");
  const [notes, setNotes] = useState("");
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [menuItemId, setMenuItemId] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => { void masterDataService.menuItems().then(setMenu).catch(() => setMenu([])); }, []);
  const submit = async () => { if (!classification || explanation.trim().length < 10) return; setSaving(true); try { await inventoryWorkflowService.createReport({ inventoryCountItemId: item.id, menuItemId: menuItemId || undefined, classification, explanation, supportingNotes: notes || undefined }); toast.success("Shrinkage report submitted for Owner review"); onSubmitted(); } catch (reason) { toast.error(reason instanceof Error ? reason.message : "Unable to submit shrinkage report"); } finally { setSaving(false); } };
  return <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,.5)" }}><div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border p-6" style={{ background: "var(--app-surface)", borderColor: "var(--app-border)" }}><div className="flex justify-between mb-5"><div><h2 className="text-lg font-bold">Create Shrinkage Report</h2><p className="text-xs mt-1" style={{ color: "var(--app-text-muted)" }}>{item.itemName} · Variance {item.varianceQuantity.toFixed(2)}{item.unit}</p></div><button onClick={onClose}><X size={18} /></button></div>
    <div className="grid grid-cols-3 gap-3 mb-5">{[["Expected", `${item.expectedQuantity.toFixed(2)} ${item.unit}`],["Actual", `${item.actualQuantity.toFixed(2)} ${item.unit}`],["Variance", `${item.varianceQuantity.toFixed(2)} ${item.unit}`]].map(([label,value]) => <div key={label} className="p-3 rounded-xl" style={{ background: "var(--app-bg)" }}><div className="text-[10px] uppercase" style={{ color: "var(--app-text-faint)" }}>{label}</div><div className="font-bold mt-1">{value}</div></div>)}</div>
    <label className="block text-sm font-semibold mb-2">Classification</label><div className="grid grid-cols-2 gap-2 mb-4">{classifications.map((option) => <button key={option.value} onClick={() => setClassification(option.value)} className="p-3 rounded-xl border text-left" style={{ borderColor: classification === option.value ? "var(--app-primary)" : "var(--app-border)", background: classification === option.value ? "var(--app-primary-subtle)" : "var(--app-surface)" }}><div className="text-sm font-semibold">{option.label}</div><div className="text-[11px] mt-1 leading-relaxed" style={{ color: "var(--app-text-muted)" }}>{option.definition}</div></button>)}</div>
    <label className="block text-sm mb-3">Menu reference (optional)<select value={menuItemId} onChange={(event) => setMenuItemId(event.target.value)} className="mt-1.5 w-full px-3 py-2.5 rounded-xl border" style={{ borderColor: "var(--app-border)", background: "var(--app-surface-elevated)" }}><option value="">No specific menu product</option>{menu.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label>
    <label className="block text-sm mb-3">Explanation<textarea value={explanation} onChange={(event) => setExplanation(event.target.value)} rows={4} placeholder="Explain what caused the discrepancy (minimum 10 characters)…" className="mt-1.5 w-full px-3 py-2.5 rounded-xl border resize-none" style={{ borderColor: "var(--app-border)", background: "var(--app-surface-elevated)" }} /></label>
    <label className="block text-sm">Supporting notes (optional)<textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} className="mt-1.5 w-full px-3 py-2.5 rounded-xl border resize-none" style={{ borderColor: "var(--app-border)", background: "var(--app-surface-elevated)" }} /></label>
    <div className="flex gap-3 mt-6"><button onClick={onClose} className="flex-1 py-2.5 rounded-xl border" style={{ borderColor: "var(--app-border)" }}>Cancel</button><button disabled={saving || !classification || explanation.trim().length < 10} onClick={() => void submit()} className="flex-1 py-2.5 rounded-xl text-white font-semibold disabled:opacity-40" style={{ background: "var(--app-primary)" }}>{saving ? "Submitting…" : "Submit for Review"}</button></div>
  </div></div>;
}
