import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { AlertCircle, AlertTriangle, DollarSign, Eye, Hash, RefreshCw, SlidersHorizontal, X, XCircle } from "lucide-react";
import { AnimatedTabPanel, Btn, C, KPICard, ModuleLoadingFallback, ModuleTabSwitcher, SearchInput, SectionHeader, Select, StatusChip, TableCard, TableEmptyRow, TableLoadingRow, TableWrapper, TD, THead, TR } from "../../components/ModuleUi";
import { masterDataService } from "../../services/masterData.service";
import { operationsService } from "../../services/operations.service";
import type { Branch } from "../../types/masterData";
import type { InventoryHealthStatus, InventoryOverviewItem, InventoryStockLedger, InventoryLedgerActivityType } from "../../types/operations";
import type { Page, Role } from "../../types/navigation";
import { formatAppCurrency } from "../../utils/appPreferences";

const InventoryCountPage = lazy(() => import("./InventoryCountPage").then((module) => ({ default: module.InventoryCountPage })));
const supportPages = () => import("./InventorySupportPages");
const ExpectedInventoryPage = lazy(() => supportPages().then((module) => ({ default: module.ExpectedInventoryPage })));
const PhysicalCountHistoryPage = lazy(() => supportPages().then((module) => ({ default: module.PhysicalCountHistoryPage })));
const OpeningInventoryBaselinePage = lazy(() => supportPages().then((module) => ({ default: module.OpeningInventoryBaselinePage })));
const labels: Record<InventoryHealthStatus, string> = { HEALTHY: "Healthy", LOW_STOCK: "Low Stock", CRITICAL: "Critical", OUT_OF_STOCK: "Out of Stock" };
const chips: Record<InventoryHealthStatus, string> = { HEALTHY: "healthy", LOW_STOCK: "low", CRITICAL: "critical", OUT_OF_STOCK: "out" };
const peso = formatAppCurrency;
const formatLedgerDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value)
  ? new Date(`${value}T00:00:00`).toLocaleDateString("en-PH")
  : new Date(value).toLocaleString("en-PH");
const ledgerLabels: Record<InventoryLedgerActivityType, string> = {
  STARTING_STOCK: "Starting Stock",
  BALANCE_BASELINE: "Inventory Balance Baseline",
  POS_CONSUMPTION: "POS Consumption",
  RECEIPT: "Stock Receipt",
  APPROVED_INCREASE: "Approved Increase",
  APPROVED_DECREASE: "Approved Decrease",
  PHYSICAL_COUNT: "Physical Count",
};

export function inventoryOverviewColumns(role: Role) {
  return role === "owner"
    ? ["SKU", "Ingredient", "Category", "Branch", "System Stock", "Unit", "Unit Cost", "Value", "Reorder Level", "Coverage", "Status", "Last Count", "Actions"]
    : ["SKU", "Ingredient", "Category", "System Stock", "Unit", "Unit Cost", "Value", "Reorder Level", "Coverage", "Status", "Last Count", "Actions"];
}

export const canConfigureBranchReorderPolicy = (role: Role) => role === "owner";

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

export function InventoryOverview({ role, scopeBranchId = "ALL" }: { role: Role; scopeBranchId?: string }) {
  const [items, setItems] = useState<InventoryOverviewItem[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("ALL");
  const [status, setStatus] = useState<InventoryHealthStatus | "ALL">("ALL");
  const [branchId, setBranchId] = useState(scopeBranchId);
  const [settingsItem, setSettingsItem] = useState<InventoryOverviewItem | null>(null);
  const [detailsItem, setDetailsItem] = useState<InventoryOverviewItem | null>(null);
  const [dataRefreshVersion, setDataRefreshVersion] = useState(0);
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
  const categories = useMemo(() => [...new Set(items.map((item) => item.reorderCategory ?? "MEDIUM"))].sort(), [items]);
  const filtered = useMemo(() => items.filter((item) => {
    const q = search.trim().toLowerCase();
    return (!q || `${item.sku} ${item.name} ${item.category} ${item.reorderCategory}`.toLowerCase().includes(q))
      && (category === "ALL" || (item.reorderCategory ?? "MEDIUM") === category) && (status === "ALL" || item.status === status)
      && (role !== "owner" || branchId === "ALL" || item.branchId === branchId);
  }), [branchId, category, items, role, search, status]);
  const scoped = role === "owner" && branchId !== "ALL" ? items.filter((item) => item.branchId === branchId) : items;
  const count = (value: InventoryHealthStatus) => scoped.filter((item) => item.status === value).length;
  const refresh = () => { setSearch(""); setCategory("ALL"); setStatus("ALL"); setBranchId(scopeBranchId); void load(); };

  return <div className="p-4 md:p-6 space-y-5">
    <SectionHeader title="Inventory Overview" sub={role === "owner" ? "Live stock position across all branches" : "Live stock position for your assigned branch"}/>
    {error && <div className="rounded-xl border p-4 flex items-center justify-between gap-3" style={{ borderColor: C.red, background: C.redBg }}><span className="text-sm" style={{ color: C.red }}>{error}</span><Btn variant="outline" size="sm" onClick={() => void load()}>Retry</Btn></div>}
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
      <KPICard label="Inventory Value" value={peso(scoped.reduce((sum, item) => sum + item.inventoryValue, 0))} sub="System-calculated stock value" icon={DollarSign} color={C.blue}/>
      <KPICard label="Inventory Records" value={String(scoped.length)} sub="Branch and ingredient records" icon={Hash} color={C.maroon}/>
      <KPICard label="Low Stock" value={String(count("LOW_STOCK"))} sub="At or below reorder level" icon={AlertCircle} color={C.amber} onClick={() => setStatus("LOW_STOCK")} active={status === "LOW_STOCK"}/>
      <KPICard label="Critical" value={String(count("CRITICAL"))} sub="At or below half reorder level" icon={AlertTriangle} color={C.red} onClick={() => setStatus("CRITICAL")} active={status === "CRITICAL"}/>
      <KPICard label="Out of Stock" value={String(count("OUT_OF_STOCK"))} sub="Immediate attention required" icon={XCircle} color={C.deepMaroon} onClick={() => setStatus("OUT_OF_STOCK")} active={status === "OUT_OF_STOCK"}/>
    </div>
    <TableCard
      title="Live Stock Catalog"
      subtitle={role === "owner" ? "Current on-hand system quantities and reorder thresholds across all branches" : "Current on-hand system quantities and reorder thresholds for your branch"}
      badge={<span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-[var(--app-primary-faint)] text-[var(--app-primary)]">{filtered.length} records</span>}
      toolbar={<>
        <SearchInput placeholder="Search SKU or ingredient…" value={search} onChange={setSearch}/>
        {role === "owner" && <Select value={branchId} onChange={setBranchId} options={[{ value: "ALL", label: "All Branches" }, ...branches.map((b) => ({ value: b.id, label: b.name }))]}/>}
        <Select value={category} onChange={setCategory} options={[{ value: "ALL", label: "All Categories" }, ...categories.map((value) => ({ value, label: value }))]}/>
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
            <TD mono muted>{item.sku}</TD><TD><span className="font-medium">{item.name}</span></TD><TD muted>{(item.reorderCategory ?? "MEDIUM")[0]}{(item.reorderCategory ?? "MEDIUM").slice(1).toLowerCase()}</TD>{role === "owner" && <TD muted>{item.branchName}</TD>}
            <TD right>{item.systemStock.toLocaleString("en-PH")}</TD><TD muted>{item.unit}</TD><TD right muted>{peso(item.unitCost)}</TD><TD right>{peso(item.inventoryValue)}</TD><TD right muted>{item.reorderLevel.toLocaleString("en-PH")}</TD><TD muted>{item.reorderDays} days</TD><TD><StatusChip status={chips[item.status]}/></TD><TD muted>{item.lastCountAt ? new Date(item.lastCountAt).toLocaleString("en-PH") : "No count yet"}</TD><TD><div className="flex items-center gap-2 whitespace-nowrap"><Btn variant="outline" size="sm" icon={Eye} onClick={() => setDetailsItem(item)}>View Details</Btn>{canConfigureBranchReorderPolicy(role) && <Btn variant="outline" size="sm" icon={SlidersHorizontal} onClick={() => setSettingsItem(item)}>Settings</Btn>}</div></TD>
          </TR>)}
        </tbody>
      </TableWrapper>
    </TableCard>
    {detailsItem && <StockLedgerModal item={detailsItem} refreshVersion={dataRefreshVersion} onClose={() => setDetailsItem(null)}/>}
    {settingsItem && <BranchInventorySettingsModal item={settingsItem} onClose={() => setSettingsItem(null)} onSaved={() => { setSettingsItem(null); void load(); }}/>}
  </div>;
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
  const matchesOverview = ledger ? Math.abs(ledger.calculatedBalance - ledger.currentExpectedStock) < 0.0001 : false;
  return <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,.52)" }} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div role="dialog" aria-modal="true" aria-labelledby="stock-ledger-title" className="w-full max-w-5xl max-h-[90vh] overflow-y-auto rounded-2xl border shadow-2xl" style={{ background: C.surface, borderColor: C.border }}>
      <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b p-5" style={{ background: C.surface, borderColor: C.border }}><div><h2 id="stock-ledger-title" className="text-lg font-bold">{item.name.toUpperCase()} — {item.branchName.toUpperCase()}</h2><p className="mt-1 text-xs" style={{ color: C.muted }}>{item.sku} · Stock Details / Stock Ledger</p></div><button aria-label="Close stock details" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: C.grayBg }}><X size={16}/></button></div>
      <div className="p-5 space-y-5">
        {error ? <div className="rounded-xl border p-4 text-sm" style={{ borderColor: C.red, color: C.red }}>{error}</div> : !ledger ? <div className="py-12 text-center text-sm" style={{ color: C.muted }}>Loading stock details…</div> : <>
          <div className="grid gap-3 sm:grid-cols-3"><div className="rounded-xl border p-4" style={{ borderColor: C.border }}><p className="text-xs" style={{ color: C.muted }}>Starting Stock</p><p className="mt-1 text-xl font-bold">{ledger.startingStock === null ? "Not recorded" : `${quantity(ledger.startingStock)} ${ledger.unit}`}</p></div><div className="rounded-xl border p-4" style={{ borderColor: C.border }}><p className="text-xs" style={{ color: C.muted }}>Operational POS Consumption</p><p className="mt-1 text-xl font-bold" style={{ color: C.red }}>−{quantity(ledger.operationalPosConsumption)} {ledger.unit}</p></div><div className="rounded-xl border p-4" style={{ borderColor: C.border }}><p className="text-xs" style={{ color: C.muted }}>Current Expected Stock</p><p className="mt-1 text-xl font-bold" style={{ color: C.primary }}>{quantity(ledger.currentExpectedStock)} {ledger.unit}</p></div></div>
          <p className="text-xs" style={{ color: C.muted }}>Only operational activity used by Inventory Overview is included. A physical count establishes a new verified balance without changing earlier Starting Stock history.</p>
          <TableWrapper minWidth={820}><THead cols={["Date / Time", "Stock Activity", "Reference / Source", "Quantity Change", "Unit", "Running Expected Balance"]}/><tbody>{ledger.activities.map((activity) => <TR key={`${activity.activityType}-${activity.id}`}><TD muted>{formatLedgerDate(activity.occurredAt)}</TD><TD bold>{ledgerLabels[activity.activityType]}</TD><TD muted>{activity.reference}</TD><TD right className={activity.quantityChange !== null && activity.quantityChange < 0 ? "text-[var(--app-danger)]" : "text-[var(--app-success)]"}>{activity.quantityChange === null ? "Balance reset" : `${activity.quantityChange > 0 ? "+" : ""}${quantity(activity.quantityChange)}`}</TD><TD muted>{ledger.unit}</TD><TD right bold>{quantity(activity.runningBalance)} {ledger.unit}</TD></TR>)}</tbody></TableWrapper>
          <div className="rounded-xl border p-3 text-xs" style={{ borderColor: matchesOverview ? C.green : C.amber, color: matchesOverview ? C.green : C.amber }}>{matchesOverview ? "Ledger balance matches Inventory Overview." : "Historical activity is displayed, while Inventory Overview remains the authoritative current balance."}</div>
        </>}
      </div>
    </div>
  </div>;
}

function BranchInventorySettingsModal({ item, onClose, onSaved }: { item: InventoryOverviewItem; onClose: () => void; onSaved: () => void }) {
  const [reorderCategory, setReorderCategory] = useState<"FAST" | "MEDIUM" | "SLOW">(item.reorderCategory ?? "MEDIUM");
  const [reorderLevel, setReorderLevel] = useState(String(item.reorderLevel));
  const [reorderDays, setReorderDays] = useState(String(item.reorderDays));
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const save = async () => {
    const input = { branchId: item.branchId, category: reorderCategory, reorderLevel: Number(reorderLevel), reorderDays: Number(reorderDays), reason: reason.trim() };
    if (!Number.isFinite(input.reorderLevel) || input.reorderLevel < 0 || !Number.isInteger(input.reorderDays) || input.reorderDays < 1 || input.reorderDays > 365 || input.reason.length < 10) {
      setError("Enter a valid reorder quantity, coverage of 1–365 days, and a reason of at least 10 characters."); return;
    }
    setSaving(true); setError("");
    try { await operationsService.updateInventorySettings(item.inventoryItemId, input); onSaved(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to update inventory settings."); }
    finally { setSaving(false); }
  };
  return <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,.52)" }} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div role="dialog" aria-modal="true" aria-labelledby="branch-inventory-settings-title" className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border p-6 shadow-2xl" style={{ background: C.surface, borderColor: C.border }}><div className="flex items-start justify-between gap-4"><div><h2 id="branch-inventory-settings-title" className="text-lg font-bold" style={{ color: C.primary }}>Branch Reorder Configuration</h2><p className="text-xs mt-1" style={{ color: C.secondary }}>{item.name} · {item.branchName}</p></div><button aria-label="Close branch inventory settings" onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: C.grayBg }}><X size={15}/></button></div><div className="grid sm:grid-cols-2 gap-4 mt-6"><label className="text-sm font-medium sm:col-span-2">Business Category<Select className="mt-1.5" value={reorderCategory} onChange={(value) => setReorderCategory(value as "FAST" | "MEDIUM" | "SLOW")} options={[{ value: "FAST", label: "Fast" }, { value: "MEDIUM", label: "Medium" }, { value: "SLOW", label: "Slow" }]}/></label><label className="text-sm font-medium">Reorder Quantity ({item.unit})<input className="field mt-1.5" type="number" min="0" step="any" value={reorderLevel} onChange={(event) => setReorderLevel(event.target.value)}/><span className="block text-[11px] mt-1" style={{ color: C.muted }}>Explicit low-stock threshold for this branch.</span></label><label className="text-sm font-medium">Target Coverage (Days)<input className="field mt-1.5" type="number" min="1" max="365" step="1" value={reorderDays} onChange={(event) => setReorderDays(event.target.value)}/><span className="block text-[11px] mt-1" style={{ color: C.muted }}>Changing coverage does not recalculate the threshold.</span></label><label className="text-sm font-medium sm:col-span-2">Reason<textarea className="field mt-1.5 min-h-24 resize-y" value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)} placeholder="Explain why this branch-specific policy is changing."/></label></div>{error && <p className="text-sm mt-4" style={{ color: C.red }}>{error}</p>}<div className="flex justify-end gap-2 mt-6"><Btn variant="outline" onClick={onClose}>Cancel</Btn><Btn disabled={saving} onClick={() => void save()}>{saving ? "Saving…" : "Save Configuration"}</Btn></div></div></div>;
}

export const inventoryTabs = [{ id: "overview", label: "Inventory Overview" }, { id: "counts", label: "Inventory Counts" }, { id: "opening", label: "Starting Stock" }] as const;
export type PhysicalCountInitialView = "record" | "expected" | "history";
export function shouldShowInventoryCountHistory(initialView: PhysicalCountInitialView, editCountId: string | null) {
  return initialView === "history" && !editCountId;
}
export function resolveInventoryCountHistoryVisibility(current: boolean, initialView: PhysicalCountInitialView, editCountId: string | null) {
  if (editCountId) return false;
  return initialView === "history" ? true : current;
}

export function PhysicalCountsModule({ role, initialTab = "history", scopeBranchId = "ALL" }: { role: Role; initialTab?: PhysicalCountInitialView; scopeBranchId?: string }) {
  const [searchParams] = useSearchParams();
  const editCountId = searchParams.get("editCount");
  const [showHistory, setShowHistory] = useState(shouldShowInventoryCountHistory(initialTab, editCountId));
  useEffect(() => {
    setShowHistory((current) => resolveInventoryCountHistoryVisibility(current, initialTab, searchParams.get("editCount")));
  }, [initialTab, role, searchParams]);
  return <div>
    <AnimatedTabPanel panelKey={showHistory ? "history" : "current"}>
      <Suspense fallback={<ModuleLoadingFallback/>}>
        {showHistory
          ? <PhysicalCountHistoryPage role={role} scopeBranchId={scopeBranchId} onEditCount={() => setShowHistory(false)} onRecordCount={() => setShowHistory(false)}/>
          : role === "manager"
            ? <InventoryCountPage onSubmitted={() => setShowHistory(true)} onBackToHistory={() => setShowHistory(true)}/>
            : <ExpectedInventoryPage role={role} view="expected" scopeBranchId={scopeBranchId}/>}
      </Suspense>
    </AnimatedTabPanel>
  </div>;
}
export function InventoryManagementModule({ role, initialTab = "overview", scopeBranchId = "ALL" }: { role: Role; onNavigate: (page: Page) => void; initialTab?: "overview" | "counts" | "opening"; scopeBranchId?: string }) {
  const [activeTab, setActiveTab] = useState<"overview" | "counts" | "opening">(initialTab);
  useEffect(() => setActiveTab(initialTab), [initialTab]);
  return <div><ModuleTabSwitcher tabs={inventoryTabs} active={activeTab} onChange={setActiveTab}/><AnimatedTabPanel panelKey={activeTab}>{activeTab === "overview" ? <InventoryOverview role={role} scopeBranchId={scopeBranchId}/> : activeTab === "counts" ? <PhysicalCountsModule role={role} initialTab="history" scopeBranchId={scopeBranchId}/> : <Suspense fallback={<ModuleLoadingFallback/>}><OpeningInventoryBaselinePage role={role} scopeBranchId={scopeBranchId}/></Suspense>}</AnimatedTabPanel></div>;
}
