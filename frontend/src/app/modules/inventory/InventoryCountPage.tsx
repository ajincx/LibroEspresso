import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, CheckCircle, ClipboardList, RefreshCw, Send } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";
import { inventoryWorkflowService } from "../../services/inventoryWorkflow.service";
import type { CountVarianceItem, ExpectedInventoryItem, UnavailableInventoryCountItem } from "../../types/inventoryWorkflow";
import { CalendarDateField, TableCard, TableWrapper, THead, TR, TD, TableEmptyRow, Btn, SearchInput } from "../../components/ModuleUi";

import { businessDate } from "../../utils/businessDate";

export const isFutureInventoryCountDate = (countDate: string, currentBusinessDate = businessDate()) =>
  countDate > currentBusinessDate;

export const PHYSICAL_COUNT_INVESTIGATION_GUIDANCE =
  "Significant discrepancies may require an investigation based on the configured tolerance.";

export const initialPhysicalCountDate = (requestedDate: string | null, currentBusinessDate = businessDate()) =>
  requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate) && !isFutureInventoryCountDate(requestedDate, currentBusinessDate)
    ? requestedDate
    : currentBusinessDate;

export const filterPhysicalCountItems = (items: ExpectedInventoryItem[], search: string) => {
  const query = search.trim().toLocaleLowerCase();
  return query
    ? items.filter((item) => item.itemName.toLocaleLowerCase().includes(query) || item.sku.toLocaleLowerCase().includes(query))
    : items;
};

export type PhysicalCountUnit = "g" | "kg" | "ml" | "L" | "pc";
export type PhysicalCountEntry = { quantity: string; enteredUnit: PhysicalCountUnit };

export const allowedPhysicalCountUnits = (canonicalUnit: string): PhysicalCountUnit[] => {
  if (canonicalUnit === "g") return ["g", "kg"];
  if (canonicalUnit === "ml") return ["ml", "L"];
  return ["pc"];
};

export const normalizePhysicalCountPreview = (
  entry: PhysicalCountEntry,
  canonicalUnit: string,
) => {
  const quantity = Number(entry.quantity);
  if (entry.quantity.trim() === "" || !Number.isFinite(quantity) || quantity < 0) return null;
  if (!allowedPhysicalCountUnits(canonicalUnit).includes(entry.enteredUnit)) return null;
  return quantity * (entry.enteredUnit === "kg" || entry.enteredUnit === "L" ? 1000 : 1);
};

export const physicalCountPreviewVariance = (
  expectedQuantity: number,
  actualQuantity: number,
) => actualQuantity - expectedQuantity;

export const physicalCountEntryFromCanonical = (
  quantity: number,
  canonicalUnit: string,
): PhysicalCountEntry => {
  const useLargeUnit = quantity >= 1000 && (canonicalUnit === "g" || canonicalUnit === "ml");
  const enteredUnit: PhysicalCountUnit = useLargeUnit
    ? canonicalUnit === "g" ? "kg" : "L"
    : canonicalUnit as PhysicalCountUnit;
  return {
    quantity: String(useLargeUnit ? quantity / 1000 : quantity),
    enteredUnit,
  };
};

export const buildPhysicalCountItems = (
  items: ExpectedInventoryItem[],
  entries: Record<string, PhysicalCountEntry>,
) => items.map((item) => {
  const entry = entries[item.inventoryItemId]!;
  return {
    inventoryItemId: item.inventoryItemId,
    quantity: Number(entry.quantity),
    enteredUnit: entry.enteredUnit,
  };
});

export const validPhysicalCountEntries = (
  items: ExpectedInventoryItem[],
  entries: Record<string, PhysicalCountEntry>,
) => items.every((item) => normalizePhysicalCountPreview(entries[item.inventoryItemId]!, item.unit) !== null);

export const canLeavePhysicalCountEntry = (
  hasUnsavedChanges: boolean,
  confirmLeave: () => boolean,
) => !hasUnsavedChanges || confirmLeave();

export function PhysicalCountBackAction({ onBack }: { onBack: () => void }) {
  return <Btn variant="outline" size="sm" icon={ArrowLeft} onClick={onBack}>Back to Count History</Btn>;
}

export function InventoryCountPage({ onSubmitted, onBackToHistory }: { onSubmitted?: () => void; onBackToHistory?: () => void }) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const requestedCountId = params.get("editCount");
  const currentBusinessDate = businessDate();
  const [countDate, setCountDate] = useState(() => initialPhysicalCountDate(params.get("countDate"), currentBusinessDate));
  const [expected, setExpected] = useState<ExpectedInventoryItem[]>([]);
  const [unavailable, setUnavailable] = useState<UnavailableInventoryCountItem[]>([]);
  const [entries, setEntries] = useState<Record<string, PhysicalCountEntry>>({});
  const [submitted, setSubmitted] = useState<{ id: string; countNo: string; items: CountVarianceItem[] } | null>(null);
  const [editingCountId, setEditingCountId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const visibleItems = useMemo(() => filterPhysicalCountItems(expected, search), [expected, search]);

  const loadExpected = async () => {
    setLoading(true); setError(""); setSubmitted(null); setEditingCountId(null); setUnavailable([]);
    try {
      if (requestedCountId) {
        const count = await inventoryWorkflowService.count(requestedCountId);
        if (!count.canEdit) throw new Error("This count is locked. A newer count or submitted investigation prevents correction.");
        setCountDate(count.countDate); setExpected(count.items);
        setEntries(Object.fromEntries(count.items.map(item => [item.inventoryItemId,physicalCountEntryFromCanonical(item.actualQuantity, item.unit)])));
        setEditingCountId(count.id);
        setHasUnsavedChanges(false);
        return;
      }
      const data = await inventoryWorkflowService.expected(countDate);
      setExpected(data.items);
      setUnavailable(data.unavailableItems ?? []);
      setEntries(Object.fromEntries(data.items.map((item) => [item.inventoryItemId, physicalCountEntryFromCanonical(Math.max(0, Number(item.expectedQuantity.toFixed(4))), item.unit)])));
      setHasUnsavedChanges(false);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to calculate expected inventory"); }
    finally { setLoading(false); }
  };
  useEffect(() => { void loadExpected(); }, [countDate, requestedCountId]);

  const cancelEdit = () => {
    setEditingCountId(null);
    setParams({}, { replace: true });
    setCountDate(businessDate());
  };

  const backToHistory = () => {
    if (!canLeavePhysicalCountEntry(hasUnsavedChanges, () => window.confirm("Discard unsaved physical-count changes and return to Count History?"))) return;
    const nextParams = new URLSearchParams(params);
    nextParams.delete("editCount");
    nextParams.delete("countDate");
    setParams(nextParams, { replace: true });
    setHasUnsavedChanges(false);
    if (onBackToHistory) onBackToHistory();
    else navigate("/inventory/physical-count-history");
  };

  const submit = async () => {
    if (isFutureInventoryCountDate(countDate, currentBusinessDate)) {
      toast.error("Physical counts cannot be recorded for a future date.");
      return;
    }
    if (!validPhysicalCountEntries(expected, entries)) {
      toast.error("Enter a valid non-negative physical count and compatible unit for every item.");
      return;
    }
    setSaving(true);
    try {
      const items = buildPhysicalCountItems(expected, entries);
      const count = editingCountId ? await inventoryWorkflowService.updateCount(editingCountId, countDate, items) : await inventoryWorkflowService.submitCount(countDate, items);
      if (!onSubmitted) setSubmitted({ id: count.id, countNo: count.countNo, items: count.items });
      toast.success(editingCountId ? "Physical count corrections saved" : "Physical count submitted and variances calculated automatically");
      setEditingCountId(null);
      setParams({}, { replace: true });
      onSubmitted?.();
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
        <PhysicalCountBackAction onBack={backToHistory}/>
      </div>
    </div>
  );

  return <div className="p-4 md:p-6 space-y-5">
    <div>
      <PhysicalCountBackAction onBack={backToHistory}/>
    </div>
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
      <CalendarDateField label="Count date" value={countDate} max={currentBusinessDate} onChange={setCountDate} disabled={Boolean(editingCountId)}/>
    </div>

    {!editingCountId && unavailable.length > 0 && (
      <div className="rounded-2xl border p-4 bg-[var(--app-warning-bg)] border-[var(--app-warning)]" role="status">
        <div className="flex items-start gap-3">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-[var(--app-warning)]" />
          <div>
            <p className="text-sm font-semibold text-[var(--app-text)]">
              {unavailable.length} item{unavailable.length === 1 ? "" : "s"} unavailable for this count
            </p>
            <p className="mt-1 text-xs text-[var(--app-text-muted)]">
              These items have no valid inventory baseline on or before {countDate}. They are marked No Baseline and will not be included in this count.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {unavailable.map((item) => (
                <span key={item.inventoryItemId} className="rounded-full border px-2.5 py-1 text-xs font-medium bg-[var(--app-surface)] border-[var(--app-border)] text-[var(--app-text)]">
                  {item.sku} · {item.itemName} — No Baseline
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    )}

    {submitted ? <CountResult countNo={submitted.countNo} items={submitted.items} onEdit={() => { setEntries(Object.fromEntries(submitted.items.map((item) => [item.inventoryItemId, physicalCountEntryFromCanonical(item.actualQuantity, item.unit)]))); setEditingCountId(submitted.id); setSubmitted(null); }} onInvestigate={(item) => item.shrinkageReportId && navigate(`/shrinkage?reportId=${item.shrinkageReportId}`)} onNewCount={() => void loadExpected()} /> : (
      <TableCard
        title={editingCountId ? "Correct Physical Count" : "Physical Count Entry"}
        subtitle="Record and verify the physical stock available at the branch. Expected stock remains system-calculated."
        badge={
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-[var(--app-primary-faint)] text-[var(--app-primary)] border border-[var(--app-border)]">
            {expected.length} item{expected.length === 1 ? "" : "s"}
          </span>
        }
        toolbar={<>
          <SearchInput placeholder="Search ingredient or SKU…" width={260} value={search} onChange={setSearch}/>
          <span className="text-xs font-medium text-[var(--app-text-muted)]">Showing {visibleItems.length} of {expected.length} items</span>
          {search && <Btn variant="outline" size="sm" onClick={() => setSearch("")}>Clear search</Btn>}
          <Btn icon={Send} disabled={saving || expected.length === 0} onClick={() => void submit()}>
            {saving ? "Saving…" : editingCountId ? "Save Corrections" : "Submit Count"}
          </Btn>
        </>}
      >
        <TableWrapper minWidth={900}>
          <THead cols={["SKU", "Ingredient", "Previous Actual", "Received", "Recipe Consumption", "Expected Stock", "Physical Count", "Preview Variance"]} />
          <tbody>
            {expected.length === 0 ? (
              <TableEmptyRow colSpan={8} title="No ingredients available" subtitle="No ingredients are configured for physical counting." />
            ) : visibleItems.length === 0 ? (
              <TableEmptyRow colSpan={8} title="No ingredients found" subtitle="Try a different ingredient name or SKU." />
            ) : (
              visibleItems.map((item) => {
                const entry = entries[item.inventoryItemId] ?? physicalCountEntryFromCanonical(0, item.unit);
                const normalizedActual = normalizePhysicalCountPreview(entry, item.unit);
                const variance = normalizedActual === null ? null : physicalCountPreviewVariance(item.expectedQuantity, normalizedActual);
                return (
                  <TR key={item.inventoryItemId}>
                    <TD mono><span className="font-semibold text-[var(--app-primary)]">{item.sku}</span></TD>
                    <TD><span className="font-semibold text-[var(--app-text)]">{item.itemName}</span></TD>
                    <TD right muted>{item.previousActualQuantity.toFixed(2)} {item.unit}</TD>
                    <TD right muted>{item.stockReceived.toFixed(2)} {item.unit}</TD>
                    <TD right><span className="font-medium text-[var(--app-primary)]">−{item.expectedConsumption.toFixed(2)} {item.unit}</span></TD>
                    <TD right><span className="font-bold text-[var(--app-text)]">{item.expectedQuantity.toFixed(2)} {item.unit}</span></TD>
                    <TD right>
                      <div className="flex flex-col items-end gap-1">
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            min={0}
                            step="any"
                            value={entry.quantity}
                            onChange={(event) => { setHasUnsavedChanges(true); setEntries((current) => ({ ...current, [item.inventoryItemId]: { ...entry, quantity: event.target.value } })); }}
                            className="w-24 px-2.5 py-1.5 rounded-xl border text-right font-semibold text-sm outline-none transition-colors border-[var(--app-border)] bg-[var(--app-surface-elevated)] text-[var(--app-text)] focus:border-[var(--app-primary)] focus:ring-2 focus:ring-[var(--app-primary-faint)]"
                            aria-label={`${item.itemName} physical quantity`}
                          />
                          <select
                            value={entry.enteredUnit}
                            onChange={(event) => { setHasUnsavedChanges(true); setEntries((current) => ({ ...current, [item.inventoryItemId]: { ...entry, enteredUnit: event.target.value as PhysicalCountUnit } })); }}
                            className="w-16 px-2 py-1.5 rounded-xl border text-sm font-semibold outline-none border-[var(--app-border)] bg-[var(--app-surface-elevated)] text-[var(--app-text)] focus:border-[var(--app-primary)]"
                            aria-label={`${item.itemName} physical count unit`}
                          >
                            {allowedPhysicalCountUnits(item.unit).map((unit) => <option key={unit} value={unit}>{unit}</option>)}
                          </select>
                        </div>
                        <span className="text-[10px] whitespace-nowrap text-[var(--app-text-muted)]">
                          {normalizedActual === null
                            ? "Enter a valid quantity"
                            : `Converted to system unit: ${normalizedActual.toLocaleString("en-US", { maximumFractionDigits: 4 })} ${item.unit}`}
                        </span>
                      </div>
                    </TD>
                    <TD right>
                      <span
                        className="font-bold text-sm"
                        style={{
                          color: variance === null ? "var(--app-text-muted)" : Math.abs(variance) < 0.0001
                            ? "var(--app-success)"
                            : variance < 0
                              ? "var(--app-danger)"
                              : "var(--app-info)",
                        }}
                      >
                        {variance === null ? "—" : `${variance > 0 ? "+" : ""}${variance.toFixed(2)} ${item.unit}`}
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
            Variance and possible shrinkage are calculated by the server. {PHYSICAL_COUNT_INVESTIGATION_GUIDANCE}
          </p>
          <div className="flex items-center gap-2">
            {editingCountId && (
              <Btn variant="outline" onClick={cancelEdit}>
                Cancel Correction
              </Btn>
            )}
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
    <div className="grid gap-3">{items.map((item) => <div key={item.id} className="p-4 rounded-2xl border flex items-center gap-4" style={{ borderColor: item.requiresInvestigation ? "var(--app-danger)" : "var(--app-border)", background: "var(--app-surface)" }}><ClipboardList size={18} style={{ color: item.requiresInvestigation ? "var(--app-danger)" : item.varianceQuantity < 0 ? "var(--app-danger)" : item.varianceQuantity > 0 ? "var(--app-info)" : "var(--app-text-faint)" }} /><div className="flex-1"><div className="font-semibold">{item.itemName}</div><div className="text-xs mt-1" style={{ color: "var(--app-text-muted)" }}>Expected {item.expectedQuantity.toFixed(2)}{item.unit} · Actual {item.actualQuantity.toFixed(2)}{item.unit}</div></div><div className="text-right"><div className="font-bold" style={{ color: item.varianceQuantity < 0 ? "var(--app-danger)" : item.varianceQuantity > 0 ? "var(--app-info)" : "var(--app-text-muted)" }}>{item.varianceQuantity > 0 ? "+" : ""}{item.varianceQuantity.toFixed(2)}{item.unit}</div><div className="text-[10px]" style={{ color: "var(--app-text-faint)" }}>{item.varianceValue > 0 ? "+" : ""}₱{item.varianceValue.toFixed(2)}</div></div>{item.requiresInvestigation && <button onClick={() => onInvestigate(item)} className="px-3 py-2 rounded-xl text-xs font-semibold text-white" style={{ background: "var(--app-primary)" }}>Investigate Anomaly</button>}</div>)}</div>
  </div>;
}
