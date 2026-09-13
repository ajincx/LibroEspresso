import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle, ClipboardList, RefreshCw, Send } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";
import { inventoryWorkflowService } from "../../services/inventoryWorkflow.service";
import type { CountVarianceItem, ExpectedInventoryItem } from "../../types/inventoryWorkflow";
import { CalendarDateField, TableCard, TableWrapper, THead, TR, TD, TableEmptyRow, TableLoadingRow, Btn } from "../../components/ModuleUi";

import { businessDate } from "../../utils/businessDate";

export function InventoryCountPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const requestedCountId = params.get("editCount");
  const [countDate, setCountDate] = useState(businessDate);
  const [expected, setExpected] = useState<ExpectedInventoryItem[]>([]);
  const [actual, setActual] = useState<Record<string, number>>({});
  const [submitted, setSubmitted] = useState<{ id: string; countNo: string; items: CountVarianceItem[] } | null>(null);
  const [editingCountId, setEditingCountId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const loadExpected = async () => {
    setLoading(true); setError(""); setSubmitted(null); setEditingCountId(null);
    try {
      if (requestedCountId) {
        const count = await inventoryWorkflowService.count(requestedCountId);
        if (!count.canEdit) throw new Error("This count is locked. A newer count or submitted investigation prevents correction.");
        setCountDate(count.countDate); setExpected(count.items);
        setActual(Object.fromEntries(count.items.map(item => [item.inventoryItemId,item.actualQuantity])));
        setEditingCountId(count.id);
        return;
      }
      const data = await inventoryWorkflowService.expected(countDate);
      setExpected(data.items);
      setActual(Object.fromEntries(data.items.map((item) => [item.inventoryItemId, Math.max(0, Number(item.expectedQuantity.toFixed(4)))])));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to calculate expected inventory"); }
    finally { setLoading(false); }
  };
  useEffect(() => { void loadExpected(); }, [countDate, requestedCountId]);

  const cancelEdit = () => {
    setEditingCountId(null);
    setParams({}, { replace: true });
    setCountDate(businessDate());
  };

  const submit = async () => {
    setSaving(true);
    try {
      const items = expected.map((item) => ({ inventoryItemId: item.inventoryItemId, actualQuantity: actual[item.inventoryItemId] ?? 0 }));
      const count = editingCountId ? await inventoryWorkflowService.updateCount(editingCountId, countDate, items) : await inventoryWorkflowService.submitCount(countDate, items);
      setSubmitted({ id: count.id, countNo: count.countNo, items: count.items });
      toast.success(editingCountId ? "Physical count corrections saved" : "Physical count submitted and variances calculated automatically");
      setEditingCountId(null);
      setParams({}, { replace: true });
    } catch (reason) { toast.error(reason instanceof Error ? reason.message : "Unable to submit inventory count"); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="p-16 text-center text-sm" style={{ color: "var(--app-text-muted)" }}>Calculating expected stock from recipes and POS sales…</div>;
  if (error) return (
    <div className="p-16 text-center">
      <p className="text-sm mb-3" style={{ color: "var(--app-danger)" }}>{error}</p>
      <div className="flex justify-center gap-3">
        <button onClick={() => void loadExpected()} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-semibold" style={{ borderColor: "var(--app-border)" }}>
          <RefreshCw size={14} />Retry
        </button>
        {requestedCountId && (
          <button onClick={cancelEdit} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold text-white" style={{ background: "var(--app-primary)" }}>
            Return to New Count
          </button>
        )}
      </div>
    </div>
  );

  return <div className="p-4 md:p-6 space-y-5">
    <div className="flex items-start justify-between gap-4">
      <div>
        <div className="flex items-center gap-3">
        <h1 className="text-xl font-bold" style={{ color: "var(--app-text)" }}>
            {editingCountId ? "Correct Physical Inventory Count" : "Physical Inventory Count"}
          </h1>
          {editingCountId && (
            <span className="px-2.5 py-1 rounded-full text-xs font-semibold" style={{ background: "var(--app-primary-faint)", color: "var(--app-primary)" }}>
              Correction Mode
            </span>
          )}
        </div>
        <p className="text-sm mt-1" style={{ color: "var(--app-text-muted)" }}>
          {editingCountId
            ? "Revising saved physical count. Update the recorded quantities and save your corrections."
            : "The server calculates expected stock from prior counts, receipts, standard recipes, POS sales, and approved adjustments. You only record the actual physical quantity."}
        </p>
      </div>
      <CalendarDateField label="Count date" value={countDate} onChange={setCountDate} disabled={Boolean(editingCountId)}/>
    </div>

    {submitted ? <CountResult countNo={submitted.countNo} items={submitted.items} onEdit={() => { setActual(Object.fromEntries(submitted.items.map((item) => [item.inventoryItemId, item.actualQuantity]))); setEditingCountId(submitted.id); setSubmitted(null); }} onInvestigate={(item) => item.shrinkageReportId && navigate(`/shrinkage?reportId=${item.shrinkageReportId}`)} onNewCount={() => void loadExpected()} /> : (
      <TableCard
        title={editingCountId ? "Correct Physical Count" : "Physical Count Entry"}
        subtitle="Expected stock is calculated from standard recipes and POS sales. Enter the verified physical stock."
        badge={
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-[var(--app-primary-faint)] text-[var(--app-primary)] border border-[var(--app-border)]">
            {expected.length} item{expected.length === 1 ? "" : "s"}
          </span>
        }
      >
        <TableWrapper minWidth={900}>
          <THead cols={["SKU", "Ingredient", "Previous Actual", "Received", "Recipe Consumption", "Expected Stock", "Physical Count", "Preview Variance"]} />
          <tbody>
            {expected.length === 0 ? (
              <TableEmptyRow colSpan={8} title="No ingredients available" subtitle="No ingredients are configured for physical counting." />
            ) : (
              expected.map((item) => {
                const variance = item.expectedQuantity - (actual[item.inventoryItemId] ?? 0);
                return (
                  <TR key={item.inventoryItemId}>
                    <TD mono><span className="font-semibold text-[var(--app-primary)]">{item.sku}</span></TD>
                    <TD><span className="font-semibold text-[var(--app-text)]">{item.itemName}</span></TD>
                    <TD right muted>{item.previousActualQuantity.toFixed(2)} {item.unit}</TD>
                    <TD right muted>{item.stockReceived.toFixed(2)} {item.unit}</TD>
                    <TD right><span className="font-medium text-[var(--app-primary)]">−{item.expectedConsumption.toFixed(2)} {item.unit}</span></TD>
                    <TD right><span className="font-bold text-[var(--app-text)]">{item.expectedQuantity.toFixed(2)} {item.unit}</span></TD>
                    <TD right>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={actual[item.inventoryItemId] ?? 0}
                        onChange={(event) => setActual((current) => ({ ...current, [item.inventoryItemId]: Number(event.target.value) }))}
                        className="w-28 px-2.5 py-1.5 rounded-xl border text-right font-semibold text-sm outline-none transition-colors border-[var(--app-border)] bg-[var(--app-surface-elevated)] text-[var(--app-text)] focus:border-[var(--app-primary)] focus:ring-2 focus:ring-[var(--app-primary-faint)]"
                      />
                    </TD>
                    <TD right>
                      <span
                        className="font-bold text-sm"
                        style={{
                          color: Math.abs(variance) < 0.0001
                            ? "var(--app-success)"
                            : variance > 0
                              ? "var(--app-danger)"
                              : "var(--app-info)",
                        }}
                      >
                        {variance > 0 ? "+" : ""}{variance.toFixed(2)} {item.unit}
                      </span>
                    </TD>
                  </TR>
                );
              })
            )}
          </tbody>
        </TableWrapper>
        <div className="flex flex-wrap items-center justify-between gap-4 p-4 border-t bg-[var(--app-surface)]" style={{ borderColor: "var(--app-border)" }}>
          <p className="text-xs text-[var(--app-text-muted)] max-w-md">
            Variance and possible shrinkage are calculated by the server. Discrepancies automatically generate investigation records.
          </p>
          <div className="flex items-center gap-2">
            {editingCountId && (
              <Btn variant="outline" onClick={cancelEdit}>
                Cancel Correction
              </Btn>
            )}
            <Btn
              icon={Send}
              disabled={saving || expected.length === 0}
              onClick={() => void submit()}
            >
              {saving ? "Saving…" : editingCountId ? "Save Corrections" : "Submit Count"}
            </Btn>
          </div>
        </div>
      </TableCard>
    )}
  </div>;
}

function CountResult({ countNo, items, onEdit, onInvestigate, onNewCount }: { countNo: string; items: CountVarianceItem[]; onEdit: () => void; onInvestigate: (item: CountVarianceItem) => void; onNewCount: () => void }) {
  const variances = items.filter((item) => Math.abs(item.varianceQuantity) > 0.0001);
  return <div className="space-y-4">
    <div className="flex items-center justify-between p-4 rounded-2xl border" style={{ borderColor: variances.length ? "var(--app-warning)" : "var(--app-success)", background: variances.length ? "var(--app-warning-bg)" : "var(--app-success-bg)" }}><div className="flex items-center gap-3">{variances.length ? <AlertTriangle style={{ color: "var(--app-warning)" }} /> : <CheckCircle style={{ color: "var(--app-success)" }} />}<div><h2 className="font-bold">{variances.length ? "System-Calculated Variance Detected" : "Inventory Count Matched"}</h2><p className="text-xs mt-0.5" style={{ color: "var(--app-text-muted)" }}>{countNo} · {variances.length} item{variances.length === 1 ? "" : "s"} differ from expected stock</p></div></div><div className="flex gap-2"><button onClick={onEdit} className="px-3 py-2 rounded-xl border text-xs font-semibold" style={{ borderColor: "var(--app-primary)", color: "var(--app-primary)", background: "var(--app-surface)" }}>Edit Count</button><button onClick={onNewCount} className="px-3 py-2 rounded-xl border text-xs font-semibold" style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }}>New Count</button></div></div>
    <div className="grid gap-3">{items.map((item) => <div key={item.id} className="p-4 rounded-2xl border flex items-center gap-4" style={{ borderColor: item.requiresInvestigation ? "var(--app-danger)" : "var(--app-border)", background: "var(--app-surface)" }}><ClipboardList size={18} style={{ color: item.requiresInvestigation ? "var(--app-danger)" : item.varianceQuantity > 0 ? "var(--app-danger)" : item.varianceQuantity < 0 ? "var(--app-info)" : "var(--app-text-faint)" }} /><div className="flex-1"><div className="font-semibold">{item.itemName}</div><div className="text-xs mt-1" style={{ color: "var(--app-text-muted)" }}>Expected {item.expectedQuantity.toFixed(2)}{item.unit} · Actual {item.actualQuantity.toFixed(2)}{item.unit}</div></div><div className="text-right"><div className="font-bold" style={{ color: item.varianceQuantity > 0 ? "var(--app-danger)" : item.varianceQuantity < 0 ? "var(--app-info)" : "var(--app-text-muted)" }}>{item.varianceQuantity > 0 ? "+" : ""}{item.varianceQuantity.toFixed(2)}{item.unit}</div><div className="text-[10px]" style={{ color: "var(--app-text-faint)" }}>{item.varianceValue > 0 ? "+" : ""}₱{item.varianceValue.toFixed(2)}</div></div>{item.requiresInvestigation && <button onClick={() => onInvestigate(item)} className="px-3 py-2 rounded-xl text-xs font-semibold text-white" style={{ background: "var(--app-primary)" }}>Investigate Anomaly</button>}</div>)}</div>
  </div>;
}
