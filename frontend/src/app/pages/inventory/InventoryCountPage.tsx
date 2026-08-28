import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle, ClipboardList, RefreshCw, Send } from "lucide-react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { inventoryWorkflowService } from "../../services/inventoryWorkflow.service";
import type { CountVarianceItem, ExpectedInventoryItem } from "../../types/inventoryWorkflow";

const today = new Date().toISOString().slice(0, 10);

export function InventoryCountPage() {
  const navigate = useNavigate();
  const [countDate, setCountDate] = useState(today);
  const [expected, setExpected] = useState<ExpectedInventoryItem[]>([]);
  const [actual, setActual] = useState<Record<string, number>>({});
  const [submitted, setSubmitted] = useState<{ countNo: string; items: CountVarianceItem[] } | null>(null);
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
      toast.success("Physical count submitted and variances calculated automatically");
    } catch (reason) { toast.error(reason instanceof Error ? reason.message : "Unable to submit inventory count"); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="p-16 text-center text-sm" style={{ color: "var(--app-text-muted)" }}>Calculating expected stock from recipes and POS sales…</div>;
  if (error) return <div className="p-16 text-center"><p className="text-sm mb-3" style={{ color: "var(--app-danger)" }}>{error}</p><button onClick={() => void loadExpected()} className="inline-flex items-center gap-2" style={{ color: "var(--app-primary)" }}><RefreshCw size={14} />Retry</button></div>;

  return <div className="p-6 space-y-5">
    <div className="flex items-start justify-between gap-4">
      <div><h1 className="text-2xl font-bold" style={{ color: "var(--app-text)" }}>Physical Inventory Count</h1><p className="text-sm mt-1" style={{ color: "var(--app-text-muted)" }}>The server calculates expected stock from prior counts, receipts, standard recipes, POS sales, and approved adjustments. You only record the actual physical quantity.</p></div>
      <label className="text-xs font-semibold" style={{ color: "var(--app-text-muted)" }}>Count date<input type="date" value={countDate} onChange={(event) => setCountDate(event.target.value)} className="block mt-1 px-3 py-2 rounded-xl border" style={{ borderColor: "var(--app-border)", background: "var(--app-surface)", color: "var(--app-text)" }} /></label>
    </div>

    {submitted ? <CountResult countNo={submitted.countNo} items={submitted.items} onInvestigate={(item) => item.shrinkageReportId && navigate(`/shrinkage?reportId=${item.shrinkageReportId}`)} onNewCount={() => void loadExpected()} /> : <div className="rounded-2xl border overflow-hidden" style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }}>
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
      <div className="flex items-center justify-between gap-4 p-4 border-t" style={{ borderColor: "var(--app-border)" }}><p className="text-xs" style={{ color: "var(--app-text-faint)" }}>Variance and possible shrinkage are calculated by the backend. Negative discrepancies automatically become investigation cases.</p><button disabled={saving || expected.length === 0} onClick={() => void submit()} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: "var(--app-primary)" }}><Send size={14} />{saving ? "Submitting…" : "Submit Count"}</button></div>
    </div>}
  </div>;
}

function CountResult({ countNo, items, onInvestigate, onNewCount }: { countNo: string; items: CountVarianceItem[]; onInvestigate: (item: CountVarianceItem) => void; onNewCount: () => void }) {
  const variances = items.filter((item) => Math.abs(item.varianceQuantity) > 0.0001);
  return <div className="space-y-4">
    <div className="flex items-center justify-between p-4 rounded-2xl border" style={{ borderColor: variances.length ? "var(--app-warning)" : "var(--app-success)", background: variances.length ? "var(--app-warning-bg)" : "var(--app-success-bg)" }}><div className="flex items-center gap-3">{variances.length ? <AlertTriangle style={{ color: "var(--app-warning)" }} /> : <CheckCircle style={{ color: "var(--app-success)" }} />}<div><h2 className="font-bold">{variances.length ? "System-Calculated Variance Detected" : "Inventory Count Matched"}</h2><p className="text-xs mt-0.5" style={{ color: "var(--app-text-muted)" }}>{countNo} · {variances.length} item{variances.length === 1 ? "" : "s"} differ from expected stock</p></div></div><button onClick={onNewCount} className="px-3 py-2 rounded-xl border text-xs font-semibold" style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }}>New Count</button></div>
    <div className="grid gap-3">{items.map((item) => <div key={item.id} className="p-4 rounded-2xl border flex items-center gap-4" style={{ borderColor: item.requiresInvestigation ? "var(--app-danger)" : "var(--app-border)", background: "var(--app-surface)" }}><ClipboardList size={18} style={{ color: item.requiresInvestigation ? "var(--app-danger)" : item.varianceQuantity > 0 ? "var(--app-success)" : "var(--app-text-faint)" }} /><div className="flex-1"><div className="font-semibold">{item.itemName}</div><div className="text-xs mt-1" style={{ color: "var(--app-text-muted)" }}>Expected {item.expectedQuantity.toFixed(2)}{item.unit} · Actual {item.actualQuantity.toFixed(2)}{item.unit}</div></div><div className="text-right"><div className="font-bold" style={{ color: item.varianceQuantity < 0 ? "var(--app-danger)" : item.varianceQuantity > 0 ? "var(--app-success)" : "var(--app-text-muted)" }}>{item.varianceQuantity > 0 ? "+" : ""}{item.varianceQuantity.toFixed(2)}{item.unit}</div><div className="text-[10px]" style={{ color: "var(--app-text-faint)" }}>₱{Math.abs(item.varianceValue).toFixed(2)}</div></div>{item.requiresInvestigation && <button onClick={() => onInvestigate(item)} className="px-3 py-2 rounded-xl text-xs font-semibold text-white" style={{ background: "var(--app-primary)" }}>Investigate Anomaly</button>}</div>)}</div>
  </div>;
}
