import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ClipboardCheck, FileWarning, Save, Search, X } from "lucide-react";
import { toast } from "sonner";
import { Btn, Select, SkeletonTable, TableEmptyRow, TableWrapper, TD, THead, TR } from "../../components/ModuleUi";
import { inventoryWorkflowService } from "../../services/inventoryWorkflow.service";
import type { OpeningInventoryBaseline, StartingStockSetup, StartingStockSetupItem } from "../../types/inventoryWorkflow";
import { compatibleUnits, type MeasurementUnit } from "../../utils/units";

export type StartingStockEntry = { quantity: string; enteredUnit: MeasurementUnit };

const unitFactor = (unit: MeasurementUnit) => unit === "kg" || unit === "L" ? 1000 : 1;
const unitLabel = (unit: string) => unit === "ml" ? "mL" : unit === "pc" ? "pcs" : unit;
const quantityLabel = (value: number) => value.toLocaleString("en-PH", { maximumFractionDigits: 4 });
export const startingStockDraftKey = (branchId: string) => `libro.starting-stock.draft.${branchId}`;
export const startingStockStatusLabel = (confirmed:boolean) => confirmed ? "Confirmed" : "Not Yet Set Up";

export function allowedStartingStockUnits(canonicalUnit: string): MeasurementUnit[] {
  return compatibleUnits(canonicalUnit);
}

export function normalizeStartingStockEntry(entry: StartingStockEntry | undefined, canonicalUnit: string) {
  if (!entry || entry.quantity.trim() === "") return null;
  const quantity = Number(entry.quantity);
  if (!Number.isFinite(quantity) || quantity < 0 || !allowedStartingStockUnits(canonicalUnit).includes(entry.enteredUnit)) return null;
  return quantity * unitFactor(entry.enteredUnit);
}

export function changeStartingStockUnit(entry: StartingStockEntry, canonicalUnit: string, enteredUnit: MeasurementUnit): StartingStockEntry {
  if (!allowedStartingStockUnits(canonicalUnit).includes(enteredUnit)) return entry;
  const canonicalQuantity = normalizeStartingStockEntry(entry, canonicalUnit);
  if (canonicalQuantity === null) return { ...entry, enteredUnit };
  return { quantity: String(Number((canonicalQuantity / unitFactor(enteredUnit)).toFixed(4))), enteredUnit };
}

export function startingStockCompletion(items: StartingStockSetupItem[], entries: Record<string, StartingStockEntry>) {
  const completed = items.filter((item) => normalizeStartingStockEntry(entries[item.inventoryItemId], item.unit) !== null).length;
  return { completed, total: items.length, remaining: items.length - completed, complete: items.length > 0 && completed === items.length };
}

function initialEntries(items: StartingStockSetupItem[], draft: Record<string, StartingStockEntry> = {}) {
  return Object.fromEntries(items.map((item) => {
    const saved = draft[item.inventoryItemId];
    const enteredUnit = saved && allowedStartingStockUnits(item.unit).includes(saved.enteredUnit) ? saved.enteredUnit : allowedStartingStockUnits(item.unit)[0]!;
    return [item.inventoryItemId, { quantity: typeof saved?.quantity === "string" ? saved.quantity : "", enteredUnit }];
  }));
}

function loadDraft(branchId: string): Record<string, StartingStockEntry> {
  try {
    const parsed = JSON.parse(localStorage.getItem(startingStockDraftKey(branchId)) ?? "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch { return {}; }
}

function BaselineReadOnly({ baseline }: { baseline: OpeningInventoryBaseline }) {
  return <section className="rounded-2xl border bg-[var(--app-surface)] border-[var(--app-border)] overflow-hidden">
    <div className="border-b border-[var(--app-border)] bg-[var(--app-primary-faint)] p-5">
      <div className="flex items-start gap-3"><CheckCircle2 className="mt-0.5 shrink-0 text-[var(--app-success)]" size={20}/><div><h2 className="font-bold">Starting Stock — <strong className="text-[var(--app-success)]">{startingStockStatusLabel(true)}</strong></h2><p className="mt-1 text-sm text-[var(--app-text-muted)]">{baseline.branchName} - {new Date(baseline.effectiveAt).toLocaleString("en-PH")} - {baseline.baselineNo}</p><p className="mt-1 text-xs text-[var(--app-text-muted)]">Starting Stock is established once and cannot be replaced by another baseline. Use Physical Counts for normal inventory verification.</p></div></div>
    </div>
    <TableWrapper minWidth={640}><THead cols={["SKU", "Ingredient", "Starting Quantity", "System Unit"]}/><tbody>{baseline.items.map((item)=><TR key={item.id}><TD mono muted>{item.sku}</TD><TD bold>{item.name}</TD><TD right>{quantityLabel(item.quantity)}</TD><TD muted>{unitLabel(item.unit)}</TD></TR>)}</tbody></TableWrapper>
  </section>;
}

export function StartingStockSetupPage() {
  const [setup, setSetup] = useState<StartingStockSetup | null>(null);
  const [entries, setEntries] = useState<Record<string, StartingStockEntry>>({});
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [error, setError] = useState("");
  const load = async () => {
    setLoading(true); setError("");
    try {
      const next = await inventoryWorkflowService.startingStockSetup();
      setSetup(next);
      setEntries(next.status === "READY" ? initialEntries(next.items, loadDraft(next.branchId)) : {});
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to load Starting Stock setup."); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);
  const completion = useMemo(() => startingStockCompletion(setup?.items ?? [], entries), [entries, setup?.items]);
  const visibleItems = useMemo(() => (setup?.items ?? []).filter((item) => `${item.sku} ${item.name} ${item.category}`.toLowerCase().includes(search.trim().toLowerCase())), [search, setup?.items]);
  const saveDraft = () => {
    if (!setup) return;
    localStorage.setItem(startingStockDraftKey(setup.branchId), JSON.stringify(entries));
    toast.success("Starting Stock draft saved on this device");
  };
  const confirm = async () => {
    if (!setup || !completion.complete) return;
    setSaving(true); setError("");
    try {
      const baseline = await inventoryWorkflowService.confirmStartingStock(setup.items.map((item) => ({
        inventoryItemId: item.inventoryItemId,
        quantity: Number(entries[item.inventoryItemId]!.quantity),
        enteredUnit: entries[item.inventoryItemId]!.enteredUnit,
      })));
      localStorage.removeItem(startingStockDraftKey(setup.branchId));
      setSetup({ ...setup, status: "INITIALIZED", message: "Starting Stock is established for this branch.", baseline });
      setReviewing(false);
      toast.success("Starting Stock confirmed");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to confirm Starting Stock."); setReviewing(false); }
    finally { setSaving(false); }
  };

  if (loading) return <div data-starting-stock-skeleton role="status" aria-label="Loading Starting Stock setup" className="overflow-hidden rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface)] p-1"><SkeletonTable rows={7} cols={4}/><span className="sr-only">Loading Starting Stock setup</span></div>;
  if (error && !setup) return <div className="p-4 md:p-6"><TableEmptyRow colSpan={4} icon={FileWarning} title="Unable to load Starting Stock" subtitle={error}/></div>;
  if (!setup) return null;
  if (setup.status === "INITIALIZED" && setup.baseline) return <div className="p-4 md:p-6"><BaselineReadOnly baseline={setup.baseline}/></div>;
  if (setup.status === "BLOCKED") return <div className="p-4 md:p-6"><section role="alert" className="rounded-2xl border border-[var(--app-warning)] bg-[var(--app-warning-bg)] p-5"><div className="flex items-start gap-3"><FileWarning className="mt-0.5 shrink-0 text-[var(--app-warning)]" size={20}/><div><h2 className="font-bold">Starting Stock cannot be added</h2><p className="mt-1 text-sm text-[var(--app-text-muted)]">{setup.message}</p></div></div></section></div>;

  return <div className="min-w-0 space-y-5 p-4 md:p-6">
    <section className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface)] p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><h1 className="text-xl font-bold">Starting Stock — <strong className="text-[var(--app-text-muted)]">{startingStockStatusLabel(false)}</strong></h1><p className="mt-1 text-sm text-[var(--app-text-muted)]">{setup.branchName} - Record the actual stock available when this branch begins using Libro.</p><p className="mt-1 text-xs text-[var(--app-text-muted)]">This is a one-time setup. Daily stock verification belongs in Inventory Counts.</p></div><div className="rounded-xl bg-[var(--app-primary-faint)] px-4 py-3 text-sm font-semibold text-[var(--app-primary)]">{completion.completed} of {completion.total} entered</div></div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-[var(--app-surface-muted)]"><div className="h-full rounded-full bg-[var(--app-primary)] transition-[width]" style={{width:`${completion.total ? completion.completed / completion.total * 100 : 0}%`}}/></div>
      <p className="mt-2 text-xs text-[var(--app-text-muted)]">{completion.remaining ? `${completion.remaining} ingredient${completion.remaining === 1 ? "" : "s"} still need a quantity. Blank means not entered; enter 0 when there is no stock.` : "All ingredient quantities are ready for review."}</p>
    </section>
    <section className="overflow-hidden rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface)]">
      <div className="flex flex-col gap-3 border-b border-[var(--app-border)] p-4 lg:flex-row lg:items-center lg:justify-between"><div><h2 className="font-bold">Ingredient quantities</h2><p className="text-xs text-[var(--app-text-muted)]">Choose a practical entry unit; Libro stores the converted system quantity.</p></div><div className="flex flex-col gap-2 sm:flex-row sm:items-center"><label className="relative min-w-0 sm:w-64"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--app-text-muted)]" size={14}/><input aria-label="Search Starting Stock ingredients" className="field w-full pl-9" value={search} onChange={(event)=>setSearch(event.target.value)} placeholder="Search ingredients..."/></label><Btn variant="outline" icon={Save} onClick={saveDraft}>Save Draft</Btn><Btn icon={ClipboardCheck} disabled={!completion.complete} onClick={()=>setReviewing(true)}>Confirm Starting Stock</Btn></div></div>
      <TableWrapper minWidth={760} paginate={false}><THead cols={["SKU", "Ingredient", "Starting Quantity", "Measurement Unit", "System Unit"]}/><tbody>{visibleItems.map((item)=>{
        const entry=entries[item.inventoryItemId] ?? {quantity:"",enteredUnit:allowedStartingStockUnits(item.unit)[0]!};
        const normalized=normalizeStartingStockEntry(entry,item.unit);
        return <TR key={item.inventoryItemId}><TD mono muted>{item.sku}</TD><TD><div className="font-semibold">{item.name}</div><div className="text-xs text-[var(--app-text-muted)]">{item.category}</div></TD><TD><input aria-label={`Starting quantity for ${item.name}`} type="number" min="0" step="any" className="field mx-auto w-32" value={entry.quantity} onChange={(event)=>setEntries((current)=>({...current,[item.inventoryItemId]:{...entry,quantity:event.target.value}}))} placeholder="Not entered"/></TD><TD><Select small className="mx-auto w-24 [&_.custom-select-trigger]:min-w-0" aria-label={`Entry unit for ${item.name}`} value={entry.enteredUnit} onChange={(value)=>setEntries((current)=>({...current,[item.inventoryItemId]:changeStartingStockUnit(entry,item.unit,value as MeasurementUnit)}))} options={allowedStartingStockUnits(item.unit).map((unit)=>({value:unit,label:unitLabel(unit)}))}/></TD><TD>{normalized===null?<span className="text-[var(--app-text-muted)]">--</span>:<span className="font-semibold">{quantityLabel(normalized)} {unitLabel(item.unit)}</span>}</TD></TR>;
      })}</tbody></TableWrapper>
      <div className="border-t border-[var(--app-border)] p-4"><p className="text-xs text-[var(--app-text-muted)]">Confirmation is available after all {completion.total} assigned ingredients have a valid quantity. Saving a draft does not confirm or lock Starting Stock.</p></div>
      {error&&<p role="alert" className="px-4 pb-4 text-sm text-[var(--app-danger)]">{error}</p>}
    </section>
      {reviewing&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onMouseDown={(event)=>{if(event.target===event.currentTarget&&!saving)setReviewing(false);}}><section role="dialog" aria-modal="true" aria-labelledby="starting-stock-review-title" className="flex max-h-[calc(100dvh-2rem)] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface)] shadow-2xl"><header className="flex items-start justify-between gap-4 border-b border-[var(--app-border)] p-5"><div><h2 id="starting-stock-review-title" className="text-lg font-bold">Review Starting Stock</h2><p className="mt-1 text-sm text-[var(--app-text-muted)]">Confirm {completion.total} ingredient quantities for {setup.branchName}. This starting point can be recorded only once.</p></div><button disabled={saving} aria-label="Close Starting Stock review" onClick={()=>setReviewing(false)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--app-surface-muted)]"><X size={16}/></button></header><div className="min-h-0 flex-1 overflow-y-auto"><TableWrapper minWidth={620} paginate={false}><THead cols={["SKU","Ingredient","Entered Quantity","Stored System Quantity"]}/><tbody>{setup.items.map((item)=>{const entry=entries[item.inventoryItemId]!;return <TR key={item.inventoryItemId}><TD mono muted>{item.sku}</TD><TD bold>{item.name}</TD><TD>{quantityLabel(Number(entry.quantity))} {unitLabel(entry.enteredUnit)}</TD><TD right>{quantityLabel(normalizeStartingStockEntry(entry,item.unit)!)} {unitLabel(item.unit)}</TD></TR>;})}</tbody></TableWrapper></div><footer className="border-t border-[var(--app-border)] p-5"><p className="mb-4 text-xs text-[var(--app-text-muted)]">Confirm only after physically verifying these quantities. Future checks must use Inventory Counts, not another Starting Stock baseline.</p><div className="flex justify-end gap-2"><Btn variant="outline" disabled={saving} onClick={()=>setReviewing(false)}>Back</Btn><Btn disabled={saving} onClick={()=>void confirm()}>{saving?"Confirming...":"Confirm Starting Stock"}</Btn></div></footer></section></div>}
  </div>;
}
