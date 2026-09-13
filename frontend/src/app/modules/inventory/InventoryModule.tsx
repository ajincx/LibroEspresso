import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { AlertCircle, AlertTriangle, ChevronLeft, ClipboardList, DollarSign, Hash, History, RefreshCw, SlidersHorizontal, X, XCircle } from "lucide-react";
import { AnimatedTabPanel, Btn, C, KPICard, ModuleLoadingFallback, ModuleTabSwitcher, Pagination, SearchInput, SectionHeader, Select, StatusChip, TableCard, TableEmptyRow, TableLoadingRow, TableWrapper, TD, THead, TR } from "../../components/ModuleUi";
import { masterDataService } from "../../services/masterData.service";
import { operationsService } from "../../services/operations.service";
import type { Branch } from "../../types/masterData";
import type { InventoryHealthStatus, InventoryOverviewItem } from "../../types/operations";
import type { Page, Role } from "../../types/navigation";
import { formatAppCurrency } from "../../utils/appPreferences";

const InventoryCountPage = lazy(() => import("./InventoryCountPage").then((module) => ({ default: module.InventoryCountPage })));
const supportPages = () => import("./InventorySupportPages");
const ExpectedInventoryPage = lazy(() => supportPages().then((module) => ({ default: module.ExpectedInventoryPage })));
const PhysicalCountHistoryPage = lazy(() => supportPages().then((module) => ({ default: module.PhysicalCountHistoryPage })));
const labels: Record<InventoryHealthStatus, string> = { HEALTHY: "Healthy", LOW_STOCK: "Low Stock", CRITICAL: "Critical", OUT_OF_STOCK: "Out of Stock" };
const chips: Record<InventoryHealthStatus, string> = { HEALTHY: "healthy", LOW_STOCK: "low", CRITICAL: "critical", OUT_OF_STOCK: "out" };
const peso = formatAppCurrency;

function InventoryOverview({ role, onNavigate, scopeBranchId = "ALL" }: { role: Role; onNavigate: (page: Page) => void; scopeBranchId?: string }) {
  const [items, setItems] = useState<InventoryOverviewItem[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("ALL");
  const [status, setStatus] = useState<InventoryHealthStatus | "ALL">("ALL");
  const [branchId, setBranchId] = useState(scopeBranchId);
  const [settingsItem, setSettingsItem] = useState<InventoryOverviewItem | null>(null);
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [nextItems, nextBranches] = await Promise.all([operationsService.inventoryOverview(), role === "owner" ? masterDataService.branches() : Promise.resolve([])]);
      setItems(nextItems); setBranches(nextBranches);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to load inventory overview."); }
    finally { setLoading(false); }
  }, [role]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (role === "owner") setBranchId(scopeBranchId); }, [role, scopeBranchId]);
  const categories = useMemo(() => [...new Set(items.map((item) => item.category))].sort(), [items]);
  const filtered = useMemo(() => items.filter((item) => {
    const q = search.trim().toLowerCase();
    return (!q || `${item.sku} ${item.name} ${item.category}`.toLowerCase().includes(q))
      && (category === "ALL" || item.category === category) && (status === "ALL" || item.status === status)
      && (role !== "owner" || branchId === "ALL" || item.branchId === branchId);
  }), [branchId, category, items, role, search, status]);
  const scoped = role === "owner" && branchId !== "ALL" ? items.filter((item) => item.branchId === branchId) : items;
  const count = (value: InventoryHealthStatus) => scoped.filter((item) => item.status === value).length;
  const refresh = () => { setSearch(""); setCategory("ALL"); setStatus("ALL"); setBranchId(scopeBranchId); void load(); };

  return <div className="p-4 md:p-6 space-y-5">
    <SectionHeader title="Inventory Overview" sub={role === "owner" ? "Live stock position across all branches" : "Live stock position for your assigned branch"} actions={role === "manager" ? <Btn variant="secondary" icon={ClipboardList} size="sm" onClick={() => onNavigate("physical-count")}>Record Stock Count</Btn> : undefined}/>
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
      <TableWrapper minWidth={960}>
        <THead cols={role === "owner" ? ["SKU", "Ingredient", "Category", "Branch", "System Stock", "Unit", "Unit Cost", "Value", "Reorder Level", "Coverage", "Status", "Last Count"] : ["SKU", "Ingredient", "Category", "System Stock", "Unit", "Unit Cost", "Value", "Reorder Level", "Coverage", "Status", "Last Count", "Actions"]}/>
        <tbody>
          {loading && <TableLoadingRow colSpan={12} label="Loading inventory records…" />}
          {!loading && filtered.length === 0 && <TableEmptyRow colSpan={12} title="No inventory records found" subtitle="Try changing the filters or record a physical count." />}
          {!loading && filtered.map((item) => <TR key={`${item.branchId}-${item.inventoryItemId}`}>
            <TD mono muted>{item.sku}</TD><TD><span className="font-medium">{item.name}</span></TD><TD muted>{item.category}</TD>{role === "owner" && <TD muted>{item.branchName}</TD>}
            <TD right>{item.systemStock.toLocaleString("en-PH")}</TD><TD muted>{item.unit}</TD><TD right muted>{peso(item.unitCost)}</TD><TD right>{peso(item.inventoryValue)}</TD><TD right muted>{item.reorderLevel.toLocaleString("en-PH")}</TD><TD muted>{item.reorderDays} days</TD><TD><StatusChip status={chips[item.status]}/></TD><TD muted>{item.lastCountAt ? new Date(item.lastCountAt).toLocaleString("en-PH") : "No count yet"}</TD>{role === "manager" && <TD><Btn variant="outline" size="sm" icon={SlidersHorizontal} onClick={() => setSettingsItem(item)}>Settings</Btn></TD>}
          </TR>)}
        </tbody>
      </TableWrapper>
      <Pagination total={filtered.length} page={1} perPage={Math.max(filtered.length, 1)}/>
    </TableCard>
    {settingsItem && <BranchInventorySettingsModal item={settingsItem} onClose={() => setSettingsItem(null)} onSaved={() => { setSettingsItem(null); void load(); }}/>}
  </div>;
}

function BranchInventorySettingsModal({ item, onClose, onSaved }: { item: InventoryOverviewItem; onClose: () => void; onSaved: () => void }) {
  const [unitCost, setUnitCost] = useState(String(item.unitCost));
  const [reorderLevel, setReorderLevel] = useState(String(item.reorderLevel));
  const [reorderDays, setReorderDays] = useState(String(item.reorderDays));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const save = async () => {
    const input = { currentUnitCost: Number(unitCost), reorderLevel: Number(reorderLevel), reorderDays: Number(reorderDays) };
    if (!Number.isFinite(input.currentUnitCost) || input.currentUnitCost < 0 || !Number.isFinite(input.reorderLevel) || input.reorderLevel < 0 || !Number.isInteger(input.reorderDays) || input.reorderDays < 1) {
      setError("Enter a valid cost, reorder quantity, and coverage of at least one day."); return;
    }
    setSaving(true); setError("");
    try { await operationsService.updateInventorySettings(item.inventoryItemId, input); onSaved(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to update inventory settings."); }
    finally { setSaving(false); }
  };
  return <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,.52)" }} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div role="dialog" aria-modal="true" aria-labelledby="branch-inventory-settings-title" className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border p-6 shadow-2xl" style={{ background: C.surface, borderColor: C.border }}><div className="flex items-start justify-between gap-4"><div><h2 id="branch-inventory-settings-title" className="text-lg font-bold" style={{ color: C.primary }}>Branch Inventory Settings</h2><p className="text-xs mt-1" style={{ color: C.secondary }}>{item.name} · {item.branchName}</p></div><button aria-label="Close branch inventory settings" onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: C.grayBg }}><X size={15}/></button></div><div className="grid sm:grid-cols-2 gap-4 mt-6"><label className="text-sm font-medium">Current Unit Cost ({item.unit})<input className="field mt-1.5" type="number" min="0" step="0.0001" value={unitCost} onChange={(event) => setUnitCost(event.target.value)}/><span className="block text-[11px] mt-1" style={{ color: C.muted }}>Automatically replaced by the latest received PO cost.</span></label><label className="text-sm font-medium">Reorder Quantity<input className="field mt-1.5" type="number" min="0" step="any" value={reorderLevel} onChange={(event) => setReorderLevel(event.target.value)}/><span className="block text-[11px] mt-1" style={{ color: C.muted }}>Low-stock threshold for this branch.</span></label><label className="text-sm font-medium sm:col-span-2">Target Stock Coverage (Days)<input className="field mt-1.5" type="number" min="1" max="365" step="1" value={reorderDays} onChange={(event) => setReorderDays(event.target.value)}/><span className="block text-[11px] mt-1" style={{ color: C.muted }}>Used for branch-specific replenishment planning.</span></label></div>{error && <p className="text-sm mt-4" style={{ color: C.red }}>{error}</p>}<div className="flex justify-end gap-2 mt-6"><Btn variant="outline" onClick={onClose}>Cancel</Btn><Btn disabled={saving} onClick={() => void save()}>{saving ? "Saving…" : "Save Settings"}</Btn></div></div></div>;
}

const inventoryTabs = [{ id: "overview", label: "Inventory Overview" }, { id: "counts", label: "Inventory Counts" }] as const;
export function PhysicalCountsModule({ role, initialTab = "record", scopeBranchId = "ALL" }: { role: Role; initialTab?: "record" | "expected" | "history"; scopeBranchId?: string }) {
  const [searchParams] = useSearchParams();
  const hasEditCount = Boolean(searchParams.get("editCount"));
  const [showHistory, setShowHistory] = useState(initialTab === "history" && !hasEditCount);
  useEffect(() => {
    if (searchParams.get("editCount")) {
      setShowHistory(false);
    } else {
      setShowHistory(initialTab === "history");
    }
  }, [initialTab, role, searchParams]);
  return <div>
    <div className="flex justify-end px-4 md:px-6 pt-4">
      <Btn variant="outline" size="sm" icon={showHistory ? ChevronLeft : History} onClick={() => setShowHistory((current) => !current)}>
        {showHistory ? (role === "manager" ? "Back to Physical Count" : "Back to Expected Stock") : "View History"}
      </Btn>
    </div>
    <AnimatedTabPanel panelKey={showHistory ? "history" : "current"}>
      <Suspense fallback={<ModuleLoadingFallback/>}>
        {showHistory
          ? <PhysicalCountHistoryPage role={role} scopeBranchId={scopeBranchId} onEditCount={() => setShowHistory(false)}/>
          : role === "manager"
            ? <InventoryCountPage/>
            : <ExpectedInventoryPage role={role} view="expected" scopeBranchId={scopeBranchId}/>}
      </Suspense>
    </AnimatedTabPanel>
  </div>;
}
export function InventoryManagementModule({ role, onNavigate, initialTab = "overview", scopeBranchId = "ALL" }: { role: Role; onNavigate: (page: Page) => void; initialTab?: "overview" | "counts"; scopeBranchId?: string }) {
  const [activeTab, setActiveTab] = useState<"overview" | "counts">(initialTab);
  useEffect(() => setActiveTab(initialTab), [initialTab]);
  return <div><ModuleTabSwitcher tabs={inventoryTabs} active={activeTab} onChange={setActiveTab}/><AnimatedTabPanel panelKey={activeTab}>{activeTab === "overview" ? <InventoryOverview role={role} onNavigate={onNavigate} scopeBranchId={scopeBranchId}/> : <PhysicalCountsModule role={role} initialTab={role === "manager" ? "record" : "expected"} scopeBranchId={scopeBranchId}/>}</AnimatedTabPanel></div>;
}
