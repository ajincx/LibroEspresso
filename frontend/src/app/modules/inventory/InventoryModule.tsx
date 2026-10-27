import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { AlertCircle, AlertTriangle, ArrowLeft, ClipboardCheck, DollarSign, Eye, Hash, Info, MoreHorizontal, PackageOpen, RefreshCw, SlidersHorizontal, SunMoon, X, XCircle } from "lucide-react";
import { AnimatedTabPanel, Btn, C, KPICard, ModuleLoadingFallback, ModuleTabSwitcher, SearchInput, SectionHeader, Select, SkeletonBlock, StatusChip, TableCard, TableEmptyRow, TableLoadingRow, TableWrapper, TD, THead, TR } from "../../components/ModuleUi";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../../components/ui/dropdown-menu";
import { masterDataService } from "../../services/masterData.service";
import { operationsService } from "../../services/operations.service";
import { inventoryWorkflowService } from "../../services/inventoryWorkflow.service";
import type { Branch } from "../../types/masterData";
import type { DailyInventoryCountContext, FullInventoryCountContext, InventoryCountSummary, StartingStockSetup } from "../../types/inventoryWorkflow";
import type { InventoryHealthStatus, InventoryOverviewItem, InventoryStockLedger, InventoryLedgerActivityType } from "../../types/operations";
import type { Page, Role } from "../../types/navigation";
import { formatAppCurrency } from "../../utils/appPreferences";
import { businessDate } from "../../utils/businessDate";
import { compatibleUnits, type MeasurementUnit } from "../../utils/units";
import { toast } from "sonner";

const InventoryCountPage = lazy(() => import("./InventoryCountPage").then((module) => ({ default: module.InventoryCountPage })));
const supportPages = () => import("./InventorySupportPages");
const ExpectedInventoryPage = lazy(() => supportPages().then((module) => ({ default: module.ExpectedInventoryPage })));
const PhysicalCountHistoryPage = lazy(() => supportPages().then((module) => ({ default: module.PhysicalCountHistoryPage })));
const OpeningInventoryBaselinePage = lazy(() => supportPages().then((module) => ({ default: module.OpeningInventoryBaselinePage })));
const labels: Record<InventoryHealthStatus, string> = { HEALTHY: "Healthy", LOW_STOCK: "Low Stock", CRITICAL: "Critical", OUT_OF_STOCK: "Out of Stock", NO_BASELINE: "No Baseline" };
const chips: Record<InventoryHealthStatus, string> = { HEALTHY: "healthy", LOW_STOCK: "low", CRITICAL: "critical", OUT_OF_STOCK: "out", NO_BASELINE: "No Baseline" };
const peso = formatAppCurrency;
const formatLedgerDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value)
  ? new Date(`${value}T00:00:00`).toLocaleDateString("en-PH")
  : new Date(value).toLocaleString("en-PH");
const ledgerLabels: Record<InventoryLedgerActivityType, string> = {
  STARTING_STOCK: "Starting Stock",
  ITEM_INITIALIZATION: "Ingredient Initial Stock",
  BALANCE_BASELINE: "Inventory Balance Baseline",
  POS_CONSUMPTION: "POS Consumption",
  RECEIPT: "Stock Receipt",
  APPROVED_INCREASE: "Approved Increase",
  APPROVED_DECREASE: "Approved Decrease",
  PHYSICAL_COUNT: "Physical Count",
};

export const movementCategoryLabel = (category: InventoryStockLedger["movementClassification"]["category"]) =>
  category ? `${category[0]}${category.slice(1).toLowerCase()}` : "Insufficient Data";

export const connectedProductStatusLabel = (product: InventoryStockLedger["connectedProducts"][number]) => {
  const active = product.connectionStatus === "CURRENT" && product.productStatus === "ACTIVE"
    && product.variantStatus === "ACTIVE" && product.branchMenuStatus === "ACTIVE";
  return active ? "Active" : product.connectionStatus === "HISTORICAL" ? "Historical recipe" : "Inactive";
};

export function inventoryOverviewColumns(role: Role) {
  return role === "owner"
    ? ["SKU", "Ingredient", "Branch", "System Stock", "Unit", "Unit Cost", "Value", "Reorder Level", "Status", "Last Physical Count", "Actions"]
    : ["SKU", "Ingredient", "System Stock", "Unit", "Unit Cost", "Value", "Reorder Level", "Status", "Last Physical Count", "Actions"];
}

export const canConfigureBranchReorderPolicy = (role: Role) => role === "manager";
export const canSetIngredientInitialStock = (role: Role, baselineAvailability: InventoryOverviewItem["baselineAvailability"]) => role === "manager" && baselineAvailability === "NO_BASELINE";

export function subscribeToInventoryDataChanges(
  refresh: () => void,
  delayMs = 75,
  eventTarget: Pick<EventTarget, "addEventListener" | "removeEventListener"> = window,
) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const handleDataChanged = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      refresh();
    }, delayMs);
  };
  eventTarget.addEventListener("libro-data-changed", handleDataChanged);
  return () => {
    eventTarget.removeEventListener("libro-data-changed", handleDataChanged);
    if (timer) clearTimeout(timer);
  };
}

export function InventoryOverview({ role, scopeBranchId = "ALL", onDailyStockCount }: { role: Role; scopeBranchId?: string; onDailyStockCount?: (countType: "OPENING" | "CLOSING") => void }) {
  const [items, setItems] = useState<InventoryOverviewItem[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<InventoryHealthStatus | "ALL">("ALL");
  const [branchId, setBranchId] = useState(scopeBranchId);
  const [settingsItem, setSettingsItem] = useState<InventoryOverviewItem | null>(null);
  const [initialStockItem, setInitialStockItem] = useState<InventoryOverviewItem | null>(null);
  const [detailsItem, setDetailsItem] = useState<InventoryOverviewItem | null>(null);
  const [dataRefreshVersion, setDataRefreshVersion] = useState(0);
  const [dailyShortcutLoading, setDailyShortcutLoading] = useState(false);
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [nextItems, nextBranches] = await Promise.all([operationsService.inventoryOverview(), role === "owner" ? masterDataService.branches() : Promise.resolve([])]);
      setItems(nextItems); setBranches(nextBranches);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to load inventory overview."); }
    finally { setLoading(false); }
  }, [role]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => subscribeToInventoryDataChanges(() => {
    setDataRefreshVersion((version) => version + 1);
    void load();
  }), [load]);
  useEffect(() => { if (role === "owner") setBranchId(scopeBranchId); }, [role, scopeBranchId]);
  const filtered = useMemo(() => items.filter((item) => {
    const q = search.trim().toLowerCase();
    return (!q || `${item.sku} ${item.name} ${item.category}`.toLowerCase().includes(q))
      && (status === "ALL" || item.status === status)
      && (role !== "owner" || branchId === "ALL" || item.branchId === branchId);
  }), [branchId, items, role, search, status]);
  const scoped = role === "owner" && branchId !== "ALL" ? items.filter((item) => item.branchId === branchId) : items;
  const count = (value: InventoryHealthStatus) => scoped.filter((item) => item.status === value).length;
  const refresh = () => { setSearch(""); setStatus("ALL"); setBranchId(scopeBranchId); void load(); };
  const openDailyStockCount = async () => {
    setDailyShortcutLoading(true); setError("");
    try {
      const context = await inventoryWorkflowService.expected(businessDate(), scopeBranchId === "ALL" ? undefined : scopeBranchId, "OPENING");
      if(context.countType==="FULL") throw new Error("Unable to resolve today's Daily Stock Count state.");
      onDailyStockCount?.(dailyCountShortcutDestination(context).countType);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to open today's Daily Stock Count."); }
    finally { setDailyShortcutLoading(false); }
  };

  return <div className="p-4 md:p-6 space-y-5">
    <SectionHeader
      title="Inventory Overview"
      sub={role === "owner" ? "System-calculated stock across all branches; Last Physical Count shows the latest verified count" : "System-calculated stock for your branch; Last Physical Count shows the latest verified count"}
      actions={role === "manager" ? <Btn className="w-full sm:w-auto" disabled={dailyShortcutLoading} onClick={() => void openDailyStockCount()}>{dailyShortcutLoading ? "Opening…" : "+ Daily Stock Count"}</Btn> : undefined}
    />
    {error && <div className="rounded-xl border p-4 flex items-center justify-between gap-3" style={{ borderColor: C.red, background: C.redBg }}><span className="text-sm" style={{ color: C.red }}>{error}</span><Btn variant="outline" size="sm" onClick={() => void load()}>Retry</Btn></div>}
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
      <KPICard loading={loading} label="Inventory Value" value={peso(scoped.reduce((sum, item) => sum + item.inventoryValue, 0))} sub="System-calculated stock value" icon={DollarSign} color={C.blue}/>
      <KPICard loading={loading} label="Inventory Records" value={String(scoped.length)} sub="Branch and ingredient records" icon={Hash} color={C.maroon}/>
      <KPICard loading={loading} label="Low Stock" value={String(count("LOW_STOCK"))} sub="At or below reorder level" icon={AlertCircle} color={C.amber} onClick={() => setStatus("LOW_STOCK")} active={status === "LOW_STOCK"}/>
      <KPICard loading={loading} label="Critical" value={String(count("CRITICAL"))} sub="At or below half reorder level" icon={AlertTriangle} color={C.red} onClick={() => setStatus("CRITICAL")} active={status === "CRITICAL"}/>
      <KPICard loading={loading} label="Out of Stock" value={String(count("OUT_OF_STOCK"))} sub="Immediate attention required" icon={XCircle} color={C.deepMaroon} onClick={() => setStatus("OUT_OF_STOCK")} active={status === "OUT_OF_STOCK"}/>
    </div>
    <TableCard
      title="Live Stock Catalog"
      subtitle={role === "owner" ? "Expected system quantities and reorder thresholds across all branches; these are not automatically physical counts" : "Expected system quantities and reorder thresholds for your branch; these are not automatically physical counts"}
      badge={loading ? <SkeletonBlock w={76} h={22} className="rounded-full"/> : error ? undefined : <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-[var(--app-primary-faint)] text-[var(--app-primary)]">{filtered.length} records</span>}
      toolbar={<>
        <SearchInput placeholder="Search SKU or ingredient…" value={search} onChange={setSearch}/>
        {role === "owner" && <Select value={branchId} onChange={setBranchId} options={[{ value: "ALL", label: "All Branches" }, ...branches.map((b) => ({ value: b.id, label: b.name }))]}/>}
        <Select value={status} onChange={(value) => setStatus(value as InventoryHealthStatus | "ALL")} options={[{ value: "ALL", label: "All Statuses" }, ...Object.entries(labels).map(([value, label]) => ({ value, label }))]}/>
        <div className="ml-auto"><Btn variant="outline" icon={RefreshCw} size="sm" onClick={refresh}>Refresh</Btn></div>
      </>}
    >
      <TableWrapper minWidth={1080}>
        <THead cols={inventoryOverviewColumns(role)}/>
        <tbody>
          {loading && <TableLoadingRow colSpan={inventoryOverviewColumns(role).length} label="Loading inventory records…" />}
          {!loading && filtered.length === 0 && <TableEmptyRow colSpan={inventoryOverviewColumns(role).length} title="No inventory records found" subtitle="Try changing the filters or record a physical count." />}
          {!loading && filtered.map((item) => <TR key={`${item.branchId}-${item.inventoryItemId}`}>
            <TD mono muted>{item.sku}</TD><TD><span className="font-medium">{item.name}</span></TD>{role === "owner" && <TD muted>{item.branchName}</TD>}
            <TD right>{item.baselineAvailability === "NO_BASELINE" ? "No Baseline" : item.systemStock.toLocaleString("en-PH")}</TD><TD muted>{item.unit}</TD><TD right muted>{peso(item.unitCost)}</TD><TD right>{item.baselineAvailability === "NO_BASELINE" ? "—" : peso(item.inventoryValue)}</TD><TD right muted>{item.reorderLevel.toLocaleString("en-PH")}</TD><TD><StatusChip status={chips[item.status]}/></TD><TD muted>{item.lastCountAt ? new Date(item.lastCountAt).toLocaleString("en-PH") : "No count yet"}</TD><TD center><div className="flex items-center justify-center gap-2 whitespace-nowrap"><Btn variant="outline" size="sm" icon={Eye} onClick={() => setDetailsItem(item)}>View</Btn>{canConfigureBranchReorderPolicy(role) && <DropdownMenu><DropdownMenuTrigger asChild><button type="button" aria-label={`More actions for ${item.name}`} className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] text-[var(--app-text-muted)] hover:bg-[var(--app-surface-muted)]"><MoreHorizontal size={16}/></button></DropdownMenuTrigger><DropdownMenuContent align="end" className="min-w-52 border-[var(--app-border)] bg-[var(--app-surface)] text-[var(--app-text)]">{canSetIngredientInitialStock(role, item.baselineAvailability) && <DropdownMenuItem onSelect={() => setInitialStockItem(item)}><PackageOpen/>Set Initial Quantity</DropdownMenuItem>}<DropdownMenuItem onSelect={() => setSettingsItem(item)}><SlidersHorizontal/>Reorder settings</DropdownMenuItem></DropdownMenuContent></DropdownMenu>}</div></TD>
          </TR>)}
        </tbody>
      </TableWrapper>
    </TableCard>
    {detailsItem && <StockLedgerModal item={detailsItem} refreshVersion={dataRefreshVersion} onClose={() => setDetailsItem(null)}/>}
    {settingsItem && <BranchInventorySettingsModal item={settingsItem} onClose={() => setSettingsItem(null)} onSaved={() => { setSettingsItem(null); void load(); }}/>}
    {initialStockItem && (
      <IngredientInitialStockModal
        item={initialStockItem}
        onClose={() => setInitialStockItem(null)}
        onSaved={() => {
          setInitialStockItem(null);
          void load();
        }}
      />
    )}
  </div>;
}

function IngredientInitialStockModal({ item, onClose, onSaved }: { item: InventoryOverviewItem; onClose: () => void; onSaved: () => void }) {
  const availableUnits = compatibleUnits(item.unit);
  const [quantity, setQuantity] = useState("");
  const [enteredUnit, setEnteredUnit] = useState<MeasurementUnit>(availableUnits[0] ?? "pc");
  const [physicallyVerified, setPhysicallyVerified] = useState(false);
  const [preOperationsConfirmed, setPreOperationsConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    const numericQuantity = Number(quantity);
    if (quantity.trim() === "" || !Number.isFinite(numericQuantity) || numericQuantity < 0) {
      setError("Enter the physically verified quantity. Enter 0 only when none is on hand.");
      return;
    }
    if (!physicallyVerified) {
      setError("Confirm that this quantity was physically verified.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const result = await inventoryWorkflowService.confirmIngredientInitialStock(item.inventoryItemId, {
        quantity: numericQuantity,
        enteredUnit,
        preOperationsConfirmed,
      });
      toast.success(`Initial stock confirmed for ${result.effectiveBusinessDate}${result.sameDayEffective ? "" : " (next business date)"}`);
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to confirm initial stock.");
    } finally {
      setSaving(false);
    }
  };

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}>
    <section role="dialog" aria-modal="true" aria-labelledby="ingredient-initial-stock-title" className="w-full max-w-xl rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface)] p-6 shadow-2xl">
      <div className="flex items-start justify-between gap-4"><div><h2 id="ingredient-initial-stock-title" className="text-lg font-bold">Set Initial Quantity</h2><p className="mt-1 text-sm text-[var(--app-text-muted)]">{item.name} · {item.branchName}</p></div><button type="button" aria-label="Close initial quantity" disabled={saving} onClick={onClose}><X size={18}/></button></div>
      <div className="mt-5 rounded-xl border border-[var(--app-border)] bg-[var(--app-primary-faint)] p-4 text-sm text-[var(--app-text-muted)]">Physically verify the quantity available at the start of the business date. Enter 0 only when none is on hand. This one-time checkpoint cannot be replaced.</div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium">Initial quantity<input className="field mt-1.5 w-full" type="number" min="0" step="any" value={quantity} onChange={(event) => setQuantity(event.target.value)} placeholder="Blank is not entered"/></label><label className="text-sm font-medium">Measurement unit<Select className="mt-1.5 w-full" value={enteredUnit} onChange={(value) => setEnteredUnit(value as MeasurementUnit)} options={availableUnits.map((unit) => ({ value: unit, label: unit === "ml" ? "mL" : unit === "pc" ? "pcs" : unit }))}/></label></div>
      <label className="mt-5 flex items-start gap-3 text-sm"><input className="mt-1" type="checkbox" checked={physicallyVerified} onChange={(event) => setPhysicallyVerified(event.target.checked)}/><span>I physically verified this quantity for this branch.</span></label>
      <label className="mt-3 flex items-start gap-3 text-sm"><input className="mt-1" type="checkbox" checked={preOperationsConfirmed} onChange={(event) => setPreOperationsConfirmed(event.target.checked)}/><span>No sales, counts, receipts, or adjustments have started today. Use today only if this is a start-of-day verification; otherwise Libro will use the next business date.</span></label>
      {error && <p role="alert" className="mt-4 text-sm text-[var(--app-danger)]">{error}</p>}
      <div className="mt-6 flex justify-end gap-2"><Btn variant="outline" disabled={saving} onClick={onClose}>Cancel</Btn><Btn disabled={saving} onClick={() => void save()}>{saving ? "Confirming…" : "Confirm Initial Quantity"}</Btn></div>
    </section>
  </div>;
}

export function projectedAdjustmentStock(
  currentStock: number,
  movementType: "APPROVED_ADJUSTMENT_INCREASE" | "APPROVED_ADJUSTMENT_DECREASE",
  quantity: number,
) {
  return movementType === "APPROVED_ADJUSTMENT_INCREASE"
    ? currentStock + quantity
    : currentStock - quantity;
}

export function inventoryAdjustmentValidationError(
  currentStock: number,
  movementType: "APPROVED_ADJUSTMENT_INCREASE" | "APPROVED_ADJUSTMENT_DECREASE",
  quantity: string,
  reason: string,
) {
  const numericQuantity = Number(quantity);
  if (quantity.trim() === "" || !Number.isFinite(numericQuantity) || numericQuantity <= 0) {
    return "Enter an adjustment quantity greater than zero.";
  }
  if (movementType === "APPROVED_ADJUSTMENT_DECREASE" && projectedAdjustmentStock(currentStock, movementType, numericQuantity) < 0) {
    return "This decrease would reduce stock below zero. Enter a smaller quantity.";
  }
  if (reason.trim().length < 10) return "Explain the adjustment using at least 10 characters.";
  return null;
}

function InventoryAdjustmentModal({item,onClose,onSaved}:{item:InventoryOverviewItem;onClose:()=>void;onSaved:()=>void}) {
  const [movementType,setMovementType]=useState<"APPROVED_ADJUSTMENT_INCREASE"|"APPROVED_ADJUSTMENT_DECREASE">("APPROVED_ADJUSTMENT_DECREASE");
  const [quantity,setQuantity]=useState("");
  const [reason,setReason]=useState("");
  const [requestId]=useState(()=>crypto.randomUUID());
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState("");
  const numericQuantity=Number(quantity);
  const hasValidQuantity=Number.isFinite(numericQuantity)&&numericQuantity>0;
  const resultingStock=hasValidQuantity?projectedAdjustmentStock(item.systemStock,movementType,numericQuantity):item.systemStock;
  const save=async()=>{
    const validationError=inventoryAdjustmentValidationError(item.systemStock,movementType,quantity,reason);
    if(validationError){setError(validationError);return;}
    setSaving(true);setError("");
    try {await inventoryWorkflowService.createAdjustment({inventoryItemId:item.inventoryItemId,movementType,quantity:numericQuantity,unit:item.unit as "g"|"kg"|"ml"|"L"|"pc",reason:reason.trim(),requestId});onSaved();}
    catch(cause){setError(cause instanceof Error?cause.message:"Unable to record the adjustment.");}
    finally{setSaving(false);}
  };
  return <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{background:"rgba(0,0,0,.52)"}} onMouseDown={(event)=>{if(event.target===event.currentTarget)onClose();}}><div role="dialog" aria-modal="true" aria-labelledby="inventory-adjustment-title" className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border p-6" style={{background:C.surface,borderColor:C.border}}><div className="flex items-start justify-between gap-3"><div><h2 id="inventory-adjustment-title" className="text-lg font-bold">Record Stock Adjustment</h2><p className="mt-1 text-xs" style={{color:C.muted}}>{item.name} · {item.branchName} · canonical unit {item.unit}</p></div><button aria-label="Close adjustment" onClick={onClose}><X size={18}/></button></div><div className="mt-5 space-y-4"><div className="grid grid-cols-1 gap-3 rounded-xl border p-3 sm:grid-cols-2" style={{borderColor:C.border,background:C.grayBg}}><div><p className="text-xs" style={{color:C.muted}}>Current stock</p><p className="mt-1 font-semibold">{item.systemStock.toLocaleString(undefined,{maximumFractionDigits:4})} {item.unit}</p></div><div><p className="text-xs" style={{color:C.muted}}>Result after adjustment</p><p className="mt-1 font-semibold" style={{color:resultingStock<0?C.red:C.primary}}>{resultingStock.toLocaleString(undefined,{maximumFractionDigits:4})} {item.unit}</p></div></div><label className="block text-sm font-medium">Adjustment type<Select className="mt-1.5 w-full" value={movementType} onChange={(value)=>setMovementType(value as typeof movementType)} options={[{value:"APPROVED_ADJUSTMENT_INCREASE",label:"Increase stock"},{value:"APPROVED_ADJUSTMENT_DECREASE",label:"Decrease stock"}]}/></label><label className="block text-sm font-medium">Quantity ({item.unit})<input className="field mt-1.5 w-full" type="number" min="0.0001" step="any" value={quantity} onChange={(event)=>setQuantity(event.target.value)}/></label>{hasValidQuantity&&<p className="text-xs" style={{color:C.secondary}}>{movementType==="APPROVED_ADJUSTMENT_INCREASE"?"Stock to add":"Stock to deduct"}: <strong>{numericQuantity.toLocaleString(undefined,{maximumFractionDigits:4})} {item.unit}</strong></p>}{resultingStock<0&&<p className="text-sm" style={{color:C.red}}>This would reduce stock below zero and will not be saved.</p>}<label className="block text-sm font-medium">Reason<textarea className="field mt-1.5 min-h-24 w-full resize-y" value={reason} onChange={(event)=>setReason(event.target.value)} placeholder="Explain why this stock adjustment is required"/></label>{error&&<p className="text-sm" style={{color:C.red}}>{error}</p>}</div><div className="mt-6 flex justify-end gap-2"><Btn variant="outline" disabled={saving} onClick={onClose}>Cancel</Btn><Btn disabled={saving} onClick={()=>void save()}>{saving?"Saving…":"Record Adjustment"}</Btn></div></div></div>;
}

function StockLedgerModal({ item, refreshVersion, onClose }: { item: InventoryOverviewItem; refreshVersion: number; onClose: () => void }) {
  const [ledger, setLedger] = useState<InventoryStockLedger | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setError("");
    operationsService.inventoryStockLedger(item.inventoryItemId, item.branchId)
      .then((next) => { if (active) setLedger(next); })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "Unable to load stock details."); });
    return () => { active = false; };
  }, [item.branchId, item.inventoryItemId, refreshVersion]);
  const quantity = (value: number) => value.toLocaleString("en-PH", { maximumFractionDigits: 4 });
  const matchesOverview = ledger ? ledger.availability === "AVAILABLE" && Math.abs(ledger.calculatedBalance - ledger.currentExpectedStock) < 0.0001 : false;
  return <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,.52)" }} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div role="dialog" aria-modal="true" aria-labelledby="stock-ledger-title" className="w-full max-w-5xl max-h-[90vh] overflow-y-auto rounded-2xl border shadow-2xl" style={{ background: C.surface, borderColor: C.border }}>
      <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b p-5" style={{ background: C.surface, borderColor: C.border }}><div><h2 id="stock-ledger-title" className="text-lg font-bold">{item.name.toUpperCase()} — {item.branchName.toUpperCase()}</h2><p className="mt-1 text-xs" style={{ color: C.muted }}>{item.sku} · Stock Details / Stock Ledger</p></div><button aria-label="Close stock details" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: C.grayBg }}><X size={16}/></button></div>
      <div className="p-5 space-y-5">
        {error ? <div className="rounded-xl border p-4 text-sm" style={{ borderColor: C.red, color: C.red }}>{error}</div> : !ledger ? <div data-stock-ledger-skeleton role="status" aria-label="Loading stock details" className="space-y-5"><div className="grid gap-3 sm:grid-cols-3">{["Starting Stock","Operational POS Consumption","Current Expected Stock"].map(label=><div key={label} className="rounded-xl border border-[var(--app-border)] p-4"><p className="text-xs text-[var(--app-text-muted)]">{label}</p><SkeletonBlock w="78%" h={24} className="mt-3"/></div>)}</div><div className="overflow-hidden rounded-xl border border-[var(--app-border)]"><TableWrapper minWidth={820}><THead cols={["Date / Time","Stock Activity","Reference / Source","Quantity Change","Unit","Running Expected Balance"]}/><tbody>{Array.from({length:5},(_,index)=><TableLoadingRow key={index} colSpan={6}/>)}</tbody></TableWrapper></div><span className="sr-only">Loading stock details</span></div> : ledger.availability === "NO_BASELINE" ? <div className="rounded-xl border p-8 text-center" style={{ borderColor: C.amber, background: C.amberBg }}><p className="font-semibold" style={{ color: C.amber }}>No Baseline</p><p className="mt-2 text-sm" style={{ color: C.muted }}>No trustworthy Starting Stock or valid physical-count checkpoint is available for this ingredient.</p></div> : <>
          <div className="grid gap-3 sm:grid-cols-3"><div className="rounded-xl border p-4" style={{ borderColor: C.border }}><p className="text-xs" style={{ color: C.muted }}>Starting Stock</p><p className="mt-1 text-xl font-bold">{ledger.startingStock === null ? "Not recorded" : `${quantity(ledger.startingStock)} ${ledger.unit}`}</p></div><div className="rounded-xl border p-4" style={{ borderColor: C.border }}><p className="text-xs" style={{ color: C.muted }}>Operational POS Consumption</p><p className="mt-1 text-xl font-bold" style={{ color: C.red }}>−{quantity(ledger.operationalPosConsumption)} {ledger.unit}</p></div><div className="rounded-xl border p-4" style={{ borderColor: C.border }}><p className="text-xs" style={{ color: C.muted }}>Current Expected Stock</p><p className="mt-1 text-xl font-bold" style={{ color: C.primary }}>{quantity(ledger.currentExpectedStock)} {ledger.unit}</p></div></div>
          <div className="grid gap-3 rounded-xl border p-4 sm:grid-cols-2" style={{ borderColor: C.border, background: C.grayBg }}><div><p className="text-xs" style={{ color: C.muted }}>Reorder level</p><p className="mt-1 font-semibold">{quantity(item.reorderLevel)} {item.unit}</p></div><div><p className="text-xs" style={{ color: C.muted }}>Target coverage</p><p className="mt-1 font-semibold">{item.reorderDays} days</p></div></div>
          <p className="text-xs" style={{ color: C.muted }}>Only operational activity used by Inventory Overview is included. A physical count establishes a new verified balance without changing earlier Starting Stock history.</p>
          <TableWrapper minWidth={820}><THead cols={["Date / Time", "Stock Activity", "Reference / Source", "Quantity Change", "Unit", "Running Expected Balance"]}/><tbody>{ledger.activities.map((activity) => <TR key={`${activity.activityType}-${activity.id}`}><TD muted>{formatLedgerDate(activity.occurredAt)}</TD><TD bold>{ledgerLabels[activity.activityType]}</TD><TD muted>{activity.reference}</TD><TD right className={activity.quantityChange !== null && activity.quantityChange < 0 ? "text-[var(--app-danger)]" : "text-[var(--app-success)]"}>{activity.quantityChange === null ? "Balance reset" : `${activity.quantityChange > 0 ? "+" : ""}${quantity(activity.quantityChange)}`}</TD><TD muted>{ledger.unit}</TD><TD right bold>{quantity(activity.runningBalance)} {ledger.unit}</TD></TR>)}</tbody></TableWrapper>
          <div className="rounded-xl border p-3 text-xs" style={{ borderColor: matchesOverview ? C.green : C.amber, color: matchesOverview ? C.green : C.amber }}>{matchesOverview ? "Ledger balance matches Inventory Overview." : "Historical activity is displayed, while Inventory Overview remains the authoritative current balance."}</div>
        </>}
        {ledger && <section aria-labelledby="automatic-movement-category-title" className="rounded-xl border p-4" style={{ borderColor: C.border, background: C.grayBg }}><div className="flex items-center gap-1"><h3 id="automatic-movement-category-title" className="text-sm font-semibold">Automatic Movement Classification</h3><span title={ledger.movementClassification.explanation}><Info size={14} aria-label="FAST, MEDIUM, and SLOW calculation help"/></span></div><p className="mt-2 text-lg font-bold">{movementCategoryLabel(ledger.movementClassification.category)}</p>{ledger.movementClassification.averageDailyConsumption !== null && <p className="mt-1 text-sm">{quantity(ledger.movementClassification.averageDailyConsumption)} {ledger.movementClassification.unit}/day across {ledger.movementClassification.eligibleBusinessDays} accepted sales dates</p>}<p className="mt-2 text-xs leading-5" style={{ color: C.muted }}>{ledger.movementClassification.explanation}</p></section>}
        {ledger && <section aria-labelledby="connected-menu-products-title" className="rounded-xl border p-4" style={{ borderColor: C.border }}>
          <div><h3 id="connected-menu-products-title" className="font-semibold">Menu Products Using This Ingredient</h3><p className="mt-1 text-xs" style={{ color: C.muted }}>Current and historical recipe connections visible to this branch. Per-sold-unit consumption uses the same recipe quantity ÷ yield and unit conversion as COGS.</p></div>
          {ledger.connectedProducts.length === 0
            ? <div className="mt-4 rounded-lg p-4 text-center text-sm" style={{ background: C.grayBg, color: C.muted }}>This ingredient is not connected to any branch-visible recipe.</div>
            : <div className="mt-4 overflow-hidden rounded-lg border" style={{ borderColor: C.border }}><TableWrapper minWidth={760}><THead cols={["Menu Product", "Variant", "Recipe Quantity", "Recipe Yield", "Per Sold Unit", "Status"]}/><tbody>{ledger.connectedProducts.map((product) => {
              const statusLabel = connectedProductStatusLabel(product);
              return <TR key={`${product.variantId}-${product.recipeId}`}><TD bold>{product.menuProductName}</TD><TD muted>{product.variantName || "Standard"}</TD><TD right>{quantity(product.recipeQuantity)} {product.recipeUnit}</TD><TD right>{quantity(product.recipeYield)}</TD><TD right bold>{quantity(product.consumptionPerSoldUnit)} {product.consumptionUnit}</TD><TD><span className={`rounded-full px-2 py-1 text-xs font-semibold ${statusLabel === "Active" ? "bg-[var(--app-success-bg)] text-[var(--app-success)]" : "bg-[var(--app-surface-muted)] text-[var(--app-text-muted)]"}`}>{statusLabel}</span></TD></TR>;
            })}</tbody></TableWrapper></div>}
        </section>}
      </div>
    </div>
  </div>;
}

export function branchReorderSettingsInput(item:InventoryOverviewItem,reorderLevel:string,reorderDays:string,reason:string){
  const category:NonNullable<InventoryOverviewItem["reorderCategory"]>=item.reorderCategory??"MEDIUM";
  return { branchId:item.branchId,category,reorderLevel:Number(reorderLevel),reorderDays:Number(reorderDays),reason:reason.trim() };
}

function BranchInventorySettingsModal({ item, onClose, onSaved }: { item: InventoryOverviewItem; onClose: () => void; onSaved: () => void }) {
  const [reorderLevel, setReorderLevel] = useState(String(item.reorderLevel));
  const [reorderDays, setReorderDays] = useState(String(item.reorderDays));
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const save = async () => {
    const input = branchReorderSettingsInput(item,reorderLevel,reorderDays,reason);
    if (!Number.isFinite(input.reorderLevel) || input.reorderLevel < 0 || !Number.isInteger(input.reorderDays) || input.reorderDays < 1 || input.reorderDays > 365 || input.reason.length < 10) {
      setError("Enter a valid reorder quantity, coverage of 1–365 days, and a reason of at least 10 characters."); return;
    }
    setSaving(true); setError("");
    try { await operationsService.updateInventorySettings(item.inventoryItemId, input); onSaved(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to update inventory settings."); }
    finally { setSaving(false); }
  };
  return <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,.52)" }} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div role="dialog" aria-modal="true" aria-labelledby="branch-inventory-settings-title" className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border p-6 shadow-2xl" style={{ background: C.surface, borderColor: C.border }}><div className="flex items-start justify-between gap-4"><div><h2 id="branch-inventory-settings-title" className="text-lg font-bold" style={{ color: C.primary }}>Branch Reorder Configuration</h2><p className="text-xs mt-1" style={{ color: C.secondary }}>{item.name} · {item.branchName}</p></div><button aria-label="Close branch inventory settings" onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: C.grayBg }}><X size={15}/></button></div><div className="grid sm:grid-cols-2 gap-4 mt-6"><label className="block text-sm font-medium">Reorder Quantity ({item.unit})<input className="field mt-1.5 w-full" type="number" min="0" step="any" value={reorderLevel} onChange={(event) => setReorderLevel(event.target.value)}/><span className="block text-[11px] mt-1" style={{ color: C.muted }}>Stock threshold used to identify low inventory for this branch.</span></label><label className="block text-sm font-medium">Target Coverage (Days)<input className="field mt-1.5 w-full" type="number" min="1" max="365" step="1" value={reorderDays} onChange={(event) => setReorderDays(event.target.value)}/><span className="block text-[11px] mt-1" style={{ color: C.muted }}>Desired days of stock coverage. Changing this does not automatically recalculate Reorder Quantity.</span></label><label className="block text-sm font-medium sm:col-span-2">Reason<textarea className="field mt-1.5 min-h-24 w-full resize-y" value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)} placeholder="Explain why this branch-specific policy is changing."/></label></div>{error && <p className="text-sm mt-4" style={{ color: C.red }}>{error}</p>}<div className="flex justify-end gap-2 mt-6"><Btn variant="outline" disabled={saving} onClick={onClose}>Cancel</Btn><Btn disabled={saving} onClick={() => void save()}>{saving ? "Saving…" : "Save Configuration"}</Btn></div></div></div>;
}

export const inventoryTabs = [{ id: "overview", label: "Inventory Overview" }, { id: "operations", label: "Stock Operations" }, { id: "history", label: "Stock History" }] as const;
export type StockOperationId = "starting" | "daily" | "full";

export const stockOperationCards = (role: Role) => [
  {
    id: "starting" as const,
    title: "Starting Stock",
    description: role === "owner"
      ? "View the one-time opening quantities established for each branch."
      : "Set the branch's opening quantities once, or review the confirmed starting point.",
    action: role === "owner" ? "View Starting Stock" : "Open Starting Stock",
    enabled: true,
  },
  {
    id: "daily" as const,
    title: "Daily Stock Count",
    description: "Record selected ingredients at opening and closing without changing ingredients left blank.",
    action: role === "manager" ? "Record Daily Count" : "View Daily Counts",
    enabled: true,
  },
  {
    id: "full" as const,
    title: "Full Physical Count",
    description: role === "owner"
      ? "Branch Managers record complete operational counts; Owners monitor them in Stock History."
      : "Count every active ingredient before the purchase-order cycle using the existing verified workflow.",
    action: role === "owner" ? "Manager operation" : "Record Full Count",
    enabled: role === "manager",
  },
];

const stockOperationIcons = { starting: PackageOpen, daily: SunMoon, full: ClipboardCheck } satisfies Record<StockOperationId, typeof PackageOpen>;

export const shouldShowStockOperationCards = (selected: StockOperationId | null) => selected === null;
export const dailyCountStatusLabel = (count: DailyInventoryCountContext["openingCount"] | DailyInventoryCountContext["closingCount"]) => count ? "Recorded" : "Pending";
export const canOpenClosingCount = (context: DailyInventoryCountContext | null) => Boolean(context?.openingCount && context.posDayComplete);
export const startingStockOperationStatus = (setup: StartingStockSetup | null) => setup?.status === "INITIALIZED" || (setup?.status === "BLOCKED" && Boolean(setup.baseline)) ? "Completed" : "Setup Required";
export const closingCountOperationStatus = (context: DailyInventoryCountContext | null) => context?.closingCount
  ? "Recorded"
  : !context?.openingCount
    ? "Not Yet Available"
    : context.posDayComplete
      ? "Ready to Record"
      : "Awaiting POS Import";
export const fullCountOperationStatus = (context: FullInventoryCountContext | null) => context?.fullCount
  ? "Recorded"
  : !context?.closingCount
    ? "Closing Required"
    : context.weeklyFullCount >= context.weeklyFullLimit
      ? "Weekly Limit Reached"
      : "Ready to Record";
export const dailyCountShortcutDestination = (context: DailyInventoryCountContext) => ({
  countType: context.openingCount ? "CLOSING" as const : "OPENING" as const,
  completed: Boolean(context.closingCount),
});
export const stockOperationSelectionAfterDailySubmit = (): StockOperationId | null => null;

type CountCorrectionTarget = { id:string; countType:"OPENING"|"CLOSING"|"FULL" };
export const countCorrectionOperation = (countType:CountCorrectionTarget["countType"]):StockOperationId => countType==="FULL"?"full":"daily";
export const dailyCountCorrectionTarget = (count:DailyInventoryCountContext["openingCount"]|DailyInventoryCountContext["closingCount"],countType:"OPENING"|"CLOSING"):CountCorrectionTarget|null => count?{id:count.id,countType}:null;
export const countCorrectionBackLabel = (openedFromHistory:boolean) => openedFromHistory ? "Back to Count History" : "Back to Operations";

function DailyStockCountWorkflow({role,countType,editCountId,onSubmitted,onBackToHistory}:{role:Role;countType:"OPENING"|"CLOSING";editCountId?:string|null;onSubmitted:()=>void;onBackToHistory?:()=>void}){
  const [revision,setRevision]=useState(0);
  if(role!=="manager") return <div className="p-4 md:p-6"><p className="rounded-xl bg-[var(--app-surface-muted)] p-4 text-sm text-[var(--app-text-muted)]">Daily Opening and Closing Counts are recorded by the assigned Branch Manager. Review submitted entries in Stock History.</p></div>;
  return <InventoryCountPage key={`${countType}-${editCountId??"new"}-${revision}`} countType={countType} editCountId={editCountId} embedded onBackToHistory={onBackToHistory} onSubmitted={()=>{setRevision((value)=>value+1);onSubmitted();}}/>;
}

export function StockOperations({ role, scopeBranchId = "ALL", initialOperation = null, initialDailyCountType = "OPENING", correctionTarget=null, onCorrectionExit }: { role: Role; scopeBranchId?: string; initialOperation?: StockOperationId | null; initialDailyCountType?: "OPENING" | "CLOSING"; correctionTarget?:CountCorrectionTarget|null; onCorrectionExit?:()=>void }) {
  const [selected, setSelected] = useState<StockOperationId | null>(initialOperation);
  const [dailyCountType,setDailyCountType]=useState<"OPENING"|"CLOSING">(initialDailyCountType);
  const [localCorrectionTarget,setLocalCorrectionTarget]=useState<CountCorrectionTarget|null>(null);
  const [dailyContext,setDailyContext]=useState<DailyInventoryCountContext|null>(null);
  const [fullContext,setFullContext]=useState<FullInventoryCountContext|null>(null);
  const [startingSetup,setStartingSetup]=useState<StartingStockSetup|null>(null);
  const [dailyRefresh,setDailyRefresh]=useState(0);
  const activeCorrection=correctionTarget??localCorrectionTarget;
  useEffect(() => setSelected(initialOperation), [initialOperation]);
  useEffect(() => setDailyCountType(initialDailyCountType), [initialDailyCountType]);
  useEffect(()=>{
    if(!correctionTarget)return;
    setSelected(countCorrectionOperation(correctionTarget.countType));
    if(correctionTarget.countType!=="FULL")setDailyCountType(correctionTarget.countType);
  },[correctionTarget]);
  useEffect(()=>{
    if(role!=="manager") return;
    let active=true;
    Promise.all([
      inventoryWorkflowService.expected(businessDate(),scopeBranchId==="ALL"?undefined:scopeBranchId,"OPENING"),
      inventoryWorkflowService.expected(businessDate(),scopeBranchId==="ALL"?undefined:scopeBranchId,"FULL"),
      inventoryWorkflowService.startingStockSetup(scopeBranchId==="ALL"?undefined:scopeBranchId),
    ]).then(([daily,full,setup])=>{if(active){setDailyContext(daily.countType==="FULL"?null:daily);setFullContext(full.countType==="FULL"?full:null);setStartingSetup(setup);}})
      .catch(()=>{if(active){setDailyContext(null);setFullContext(null);setStartingSetup(null);}});
    return()=>{active=false;};
  },[dailyRefresh,role,scopeBranchId,selected]);
  const cards = stockOperationCards(role);
  const fullStatus=fullCountOperationStatus(fullContext);
  const leaveCorrection=()=>{
    setLocalCorrectionTarget(null);
    if(correctionTarget) onCorrectionExit?.();
    else setSelected(null);
  };
  const finishCount=()=>{setDailyRefresh((value)=>value+1);if(activeCorrection)leaveCorrection();else setSelected(stockOperationSelectionAfterDailySubmit());};
  return <div className="p-4 md:p-6 space-y-5">
    {!selected&&<SectionHeader title="Stock Operations" sub="Use the existing inventory workflows for branch setup and verified physical counting."/>}
    {shouldShowStockOperationCards(selected)&&<div className="grid gap-4 md:grid-cols-3">
      {cards.map((card) => {
        const Icon = stockOperationIcons[card.id];
        return <section key={card.id} className="flex min-h-56 flex-col rounded-2xl border p-5 bg-[var(--app-surface)] border-[var(--app-border)]">
          <div className="flex items-start justify-between gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--app-primary-faint)] text-[var(--app-primary)]"><Icon size={21}/></span><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${card.enabled ? "bg-[var(--app-success-bg)] text-[var(--app-success)]" : "bg-[var(--app-surface-muted)] text-[var(--app-text-muted)]"}`}>{role!=="manager"?"Read only":card.id==="starting"?startingStockOperationStatus(startingSetup):card.id==="daily"?"Daily workflow":fullStatus}</span></div>
          <h2 className="mt-4 text-lg font-bold">{card.title}</h2><p className="mt-2 flex-1 text-sm leading-6 text-[var(--app-text-muted)]">{card.description}</p>
          {card.id==="daily"&&role==="manager"?<div className="mt-5 grid grid-cols-2 gap-3"><div className="flex flex-col gap-2"><p className="text-center text-xs font-semibold">Opening Count</p><Btn className="w-full" variant="outline" title={dailyContext?.openingCount?"Correct today's Opening Count":"Record today's Opening Count"} onClick={()=>{setDailyCountType("OPENING");setLocalCorrectionTarget(dailyCountCorrectionTarget(dailyContext?.openingCount??null,"OPENING"));setSelected("daily");}}>{dailyCountStatusLabel(dailyContext?.openingCount??null)}</Btn></div><div className="flex flex-col gap-2"><p className="text-center text-xs font-semibold">Closing Count</p><Btn className="w-full" variant="outline" title={dailyContext?.closingCount?"Correct today's Closing Count":closingCountOperationStatus(dailyContext)} disabled={!dailyContext?.closingCount&&!canOpenClosingCount(dailyContext)} onClick={()=>{setDailyCountType("CLOSING");setLocalCorrectionTarget(dailyCountCorrectionTarget(dailyContext?.closingCount??null,"CLOSING"));setSelected("daily");}}>{closingCountOperationStatus(dailyContext)}</Btn></div></div>:card.id==="full"&&role==="manager"?<Btn className="mt-5 w-full" variant="outline" disabled={fullStatus!=="Ready to Record"&&fullStatus!=="Recorded"} onClick={() => setSelected(card.id)}>{fullStatus==="Recorded"?"View Full Count":"Record Full Count"}</Btn>:<Btn className="mt-5 w-full" variant="outline" disabled={!card.enabled} onClick={() => setSelected(card.id)}>{card.action}</Btn>}
        </section>;
      })}
    </div>}
    {selected && <section className="overflow-hidden rounded-2xl border bg-[var(--app-surface)] border-[var(--app-border)]">
      <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between border-[var(--app-border)]"><div><p className="text-xs font-semibold uppercase tracking-wide text-[var(--app-primary)]">Stock Operations</p><h2 className="mt-1 font-bold">{activeCorrection?`Correct ${activeCorrection.countType === "OPENING" ? "Opening Count" : activeCorrection.countType === "CLOSING" ? "Closing Count" : "Full Physical Count"}`:cards.find((card) => card.id === selected)?.title}</h2></div><Btn variant="outline" size="sm" icon={ArrowLeft} onClick={()=>activeCorrection?leaveCorrection():setSelected(null)}>{activeCorrection?countCorrectionBackLabel(Boolean(correctionTarget)):"Back to Operations"}</Btn></div>
      {selected === "starting"
        ? <Suspense fallback={<ModuleLoadingFallback/>}><OpeningInventoryBaselinePage role={role} scopeBranchId={scopeBranchId}/></Suspense>
        : selected === "daily"
          ? <Suspense fallback={<ModuleLoadingFallback/>}><DailyStockCountWorkflow role={role} countType={dailyCountType} editCountId={activeCorrection?.countType!=="FULL"?activeCorrection?.id:null} onBackToHistory={activeCorrection?leaveCorrection:undefined} onSubmitted={finishCount}/></Suspense>
        : selected === "full"
          ? activeCorrection?.countType==="FULL"
            ? <Suspense fallback={<ModuleLoadingFallback/>}><InventoryCountPage countType="FULL" editCountId={activeCorrection.id} embedded onBackToHistory={leaveCorrection} onSubmitted={finishCount}/></Suspense>
            : <PhysicalCountsModule role={role} initialTab={fullStatus==="Recorded"?"history":"record"} scopeBranchId={scopeBranchId} embedded onOperationalCountSubmitted={()=>setDailyRefresh((value)=>value+1)}/>
          : null}
    </section>}
    {!selected && <div className="rounded-xl border p-4 text-sm border-[var(--app-border)] bg-[var(--app-surface-muted)] text-[var(--app-text-muted)]">Choose the stock operation that matches the branch task. Starting Stock is one-time setup; Daily Count is Opening/Closing; Full Physical Count remains the complete inventory workflow.</div>}
  </div>;
}

export function StockHistory({ role, scopeBranchId = "ALL", onEditCount }: { role: Role; scopeBranchId?: string; onEditCount?:(count:CountCorrectionTarget)=>void }) {
  return <Suspense fallback={<ModuleLoadingFallback/>}><PhysicalCountHistoryPage role={role} scopeBranchId={scopeBranchId} onEditCount={onEditCount}/></Suspense>;
}

export type PhysicalCountInitialView = "record" | "expected" | "history";
export function recordCountShortcutDestination(counts: InventoryCountSummary[], countDate: string, branchId?: string | null) {
  return counts.some((count) => count.countDate === countDate && (!branchId || count.branchId === branchId)) ? "history" : "record";
}
export function shouldShowInventoryCountHistory(initialView: PhysicalCountInitialView, editCountId: string | null) {
  return initialView === "history" && !editCountId;
}
export function resolveInventoryCountHistoryVisibility(current: boolean, initialView: PhysicalCountInitialView, editCountId: string | null) {
  if (editCountId) return false;
  return initialView === "history" ? true : current;
}

export function PhysicalCountsModule({ role, initialTab = "history", scopeBranchId = "ALL", embedded=false, onOperationalCountSubmitted }: { role: Role; initialTab?: PhysicalCountInitialView; scopeBranchId?: string; embedded?:boolean; onOperationalCountSubmitted?:()=>void }) {
  const [searchParams] = useSearchParams();
  const editCountId = searchParams.get("editCount");
  const requestedCountType=searchParams.get("countType");
  const [correctionTarget,setCorrectionTarget]=useState<CountCorrectionTarget|null>(editCountId?{id:editCountId,countType:requestedCountType==="OPENING"||requestedCountType==="CLOSING"?requestedCountType:"FULL"}:null);
  const shortcutDate = searchParams.get("countIntent") === "record" ? searchParams.get("countDate") : null;
  const shortcutBranchId = searchParams.get("branchId");
  const [showHistory, setShowHistory] = useState(shouldShowInventoryCountHistory(initialTab, editCountId));
  useEffect(() => {
    setShowHistory((current) => resolveInventoryCountHistoryVisibility(current, initialTab, searchParams.get("editCount")));
  }, [initialTab, role, searchParams]);
  const resolveShortcut = useCallback((counts: InventoryCountSummary[]) => {
    if (!shortcutDate) return;
    setShowHistory(recordCountShortcutDestination(counts, shortcutDate, shortcutBranchId) === "history");
  }, [shortcutDate, shortcutBranchId]);
  return <div>
    <AnimatedTabPanel panelKey={showHistory ? "history" : "current"}>
      <Suspense fallback={<ModuleLoadingFallback/>}>
        {showHistory
          ? <PhysicalCountHistoryPage role={role} scopeBranchId={scopeBranchId} onOperationalCountsLoaded={resolveShortcut} onEditCount={(count) => {setCorrectionTarget(count);setShowHistory(false);}}/>
          : role === "manager"
            ? <InventoryCountPage countType={correctionTarget?.countType??"FULL"} editCountId={correctionTarget?.id??editCountId} embedded={embedded} onSubmitted={() => {setCorrectionTarget(null);setShowHistory(true);onOperationalCountSubmitted?.();}} onBackToHistory={() => {setCorrectionTarget(null);setShowHistory(true);}}/>
            : <ExpectedInventoryPage role={role} view="expected" scopeBranchId={scopeBranchId}/>}
      </Suspense>
    </AnimatedTabPanel>
  </div>;
}
export function InventoryManagementModule({ role, initialTab = "overview", scopeBranchId = "ALL" }: { role: Role; onNavigate: (page: Page) => void; initialTab?: "overview" | "operations" | "history" | "counts" | "opening"; scopeBranchId?: string }) {
  const [searchParams] = useSearchParams();
  const tabParameter = searchParams.get("tab");
  const requestedTab = tabParameter === "counts" || tabParameter === "opening" || tabParameter === "operations" || initialTab === "counts" || initialTab === "opening"
    ? "operations"
    : tabParameter === "history" || initialTab === "history" ? "history" : "overview";
  const requestedOperation: StockOperationId | null = tabParameter === "opening" || initialTab === "opening"
    ? "starting"
    : searchParams.get("countIntent") === "record" || initialTab === "counts" ? "full" : null;
  const [activeTab, setActiveTab] = useState<"overview" | "operations" | "history">(requestedTab);
  const [overviewDailyCountType, setOverviewDailyCountType] = useState<"OPENING" | "CLOSING" | null>(null);
  const [correctionTarget,setCorrectionTarget]=useState<CountCorrectionTarget|null>(null);
  useEffect(() => setActiveTab(requestedTab), [requestedTab]);
  const changeTab = (tab: "overview" | "operations" | "history") => { setOverviewDailyCountType(null); setCorrectionTarget(null); setActiveTab(tab); };
  const openDailyStockCount = (countType: "OPENING" | "CLOSING") => { setOverviewDailyCountType(countType); setActiveTab("operations"); };
  const editCount=(count:CountCorrectionTarget)=>{setCorrectionTarget(count);setOverviewDailyCountType(count.countType==="FULL"?null:count.countType);setActiveTab("operations");};
  const returnToHistory=()=>{setCorrectionTarget(null);setOverviewDailyCountType(null);setActiveTab("history");};
  return <div><ModuleTabSwitcher tabs={inventoryTabs} active={activeTab} onChange={changeTab}/><AnimatedTabPanel panelKey={activeTab}>{activeTab === "overview" ? <InventoryOverview role={role} scopeBranchId={scopeBranchId} onDailyStockCount={openDailyStockCount}/> : activeTab === "operations" ? <StockOperations role={role} scopeBranchId={scopeBranchId} initialOperation={correctionTarget?countCorrectionOperation(correctionTarget.countType):overviewDailyCountType ? "daily" : requestedOperation} initialDailyCountType={correctionTarget?.countType==="OPENING"||correctionTarget?.countType==="CLOSING"?correctionTarget.countType:overviewDailyCountType ?? "OPENING"} correctionTarget={correctionTarget} onCorrectionExit={returnToHistory}/> : <StockHistory role={role} scopeBranchId={scopeBranchId} onEditCount={editCount}/>}</AnimatedTabPanel></div>;
}
