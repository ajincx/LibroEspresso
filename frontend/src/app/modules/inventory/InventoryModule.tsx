import React, { lazy, Suspense, useEffect, useState } from "react";
import { AlertTriangle, Search, Eye, Edit2, XCircle, Coffee, AlertCircle, DollarSign, ClipboardList, Hash, RefreshCw } from "lucide-react";
import { C, StatusChip, KPICard, Card, SectionHeader, Btn, SearchInput, Select, THead, TR, TD, Pagination, ModuleTabSwitcher, AnimatedTabPanel } from "../../components/ModuleUi";
import { inventoryItems } from "../demoData";
import { toast } from "sonner";
import type { Page, Role } from "../../types/navigation";
const InventoryCountPage = lazy(() => import("./InventoryCountPage").then((module) => ({ default: module.InventoryCountPage })));
const loadOperationalPages = () => import("./InventorySupportPages");
const ExpectedInventoryPage = lazy(() => loadOperationalPages().then((module) => ({ default: module.ExpectedInventoryPage })));
const PhysicalCountHistoryPage = lazy(() => loadOperationalPages().then((module) => ({ default: module.PhysicalCountHistoryPage })));
import { LossRecordModal as SpoilageModal } from "../../components/LossRecordModal";

function InventoryOverview({ role, onNavigate }: { role: Role; onNavigate: (page: Page) => void }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All Categories");
  const [statusFilter, setStatusFilter] = useState("All Status");
  const [branchFilter, setBranchFilter] = useState("All Branches");
  const [showLoss, setShowLoss] = useState(false);
  const statusValues: Record<string, string> = { Healthy: "healthy", "Low Stock": "low", Critical: "critical", "Out of Stock": "out" };
  const itemBranches: Record<string, string> = {
    "RM-001": "Lipa", "RM-002": "Vermosa", "RM-003": "Gulod", "RM-004": "Tagaytay",
    "RM-005": "Lipa", "RM-006": "Evo", "RM-007": "Gulod", "RM-008": "Lipa",
  };
  const filteredItems = inventoryItems.filter(item => {
    const query = searchTerm.trim().toLowerCase();
    const matchesSearch = !query || item.sku.toLowerCase().includes(query) || item.name.toLowerCase().includes(query) || item.cat.toLowerCase().includes(query);
    const matchesCategory = categoryFilter === "All Categories" || item.cat === categoryFilter;
    const matchesStatus = statusFilter === "All Status" || item.status === statusValues[statusFilter];
    const matchesBranch = role !== "owner" || branchFilter === "All Branches" || itemBranches[item.sku] === branchFilter;
    return matchesSearch && matchesCategory && matchesStatus && matchesBranch;
  });
  const resetInventoryFilters = () => {
    setSearchTerm("");
    setCategoryFilter("All Categories");
    setStatusFilter("All Status");
    setBranchFilter("All Branches");
  };

  return (
    <div className="p-6 space-y-5">
      <SectionHeader title="Inventory Overview"
        sub={role === "owner" ? "All branches · 228 active SKUs" : "Lipa Branch · 68 active SKUs"}
        actions={
          <>
            {role === "manager" && (
              <>
                <Btn variant="secondary" icon={ClipboardList} size="sm" onClick={() => onNavigate("physical-count")}>Record Stock Count</Btn>
                <Btn variant="secondary" icon={AlertTriangle} size="sm" onClick={() => setShowLoss(true)}>Record Loss</Btn>
              </>
            )}
          </>
        } />

      <div className="inventory-kpi-grid grid grid-cols-5 gap-4">
        <KPICard label="Inventory Value" value="₱312,450" change="-1.2%" changeDir="down" icon={DollarSign} color={C.blue} />
        <KPICard label="Total SKUs" value="228" sub="Across all branches" icon={Hash} color={C.maroon} />
        <KPICard label="Low Stock" value="34 items" change="+5 this week" changeDir="down" icon={AlertCircle} color={C.amber}
          onClick={() => setStatusFilter("Low Stock")} active={statusFilter === "Low Stock"} />
        <KPICard label="Critical" value="12 items" sub="Below safety threshold" icon={AlertTriangle} color={C.red}
          onClick={() => setStatusFilter("Critical")} active={statusFilter === "Critical"} />
        <KPICard label="Out of Stock" value="4 items" sub="Immediate reorder needed" icon={XCircle} color={C.deepMaroon}
          onClick={() => setStatusFilter("Out of Stock")} active={statusFilter === "Out of Stock"} />
      </div>

      <Card padding={false}>
        <div className="px-5 pt-5 pb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <SearchInput placeholder="Search SKU or item…" value={searchTerm} onChange={setSearchTerm} />
            {role === "owner" && <Select options={["All Branches", "Gulod", "Lipa", "Vermosa", "Tagaytay", "Evo"]} value={branchFilter} onChange={setBranchFilter} />}
            <Select options={["All Categories", "Dairy", "Coffee", "Bakery", "Sweeteners", "Dairy Alt"]} value={categoryFilter} onChange={setCategoryFilter} />
            <Select options={["All Status", "Healthy", "Low Stock", "Critical", "Out of Stock"]} value={statusFilter} onChange={setStatusFilter} />
            <div className="ml-auto">
              <Btn variant="outline" icon={RefreshCw} size="sm" onClick={resetInventoryFilters}>Refresh</Btn>
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
              <table className="data-table w-full">
            <THead cols={role === "owner"
              ? ["SKU", "Ingredient", "Category", "Branch", "On Hand", "Unit Cost", "Value", "Reorder Pt.", "Status", "Last Count"]
              : ["SKU", "Ingredient", "Category", "On Hand", "Unit", "Unit Cost", "Value", "Reorder Pt.", "Status", "Actions"]} />
            <tbody>
              {filteredItems.map(item => (
                <TR key={item.sku}>
                  <TD mono muted>{item.sku}</TD>
                  <TD><span className="font-medium">{item.name}</span></TD>
                  <TD muted>{item.cat}</TD>
                  {role === "owner" && <TD muted>{itemBranches[item.sku] ?? "Lipa"}</TD>}
                  <TD right className={item.status === "out" ? "font-bold" : ""} style={{ color: item.status === "out" ? C.red : undefined }}>{item.onHand}</TD>
                  {role === "manager" && <TD muted>{item.unit}</TD>}
                  <TD right muted>₱{item.unitCost.toLocaleString()}</TD>
                  <TD right>₱{item.value.toLocaleString()}</TD>
                  <TD right muted>{item.reorder}</TD>
                  <TD><StatusChip status={item.status} /></TD>
                  {role === "owner" && <TD muted>{item.lastCount}</TD>}
                  {role === "manager" && (
                    <TD>
                      <div className="flex gap-1">
                        <button className="p-1.5 rounded-md transition-colors" style={{ color: C.secondary }}
                          onMouseEnter={e => (e.currentTarget.style.background = C.grayBg)}
                          onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                          <Eye size={13} />
                        </button>
                        <button className="p-1.5 rounded-md transition-colors" style={{ color: C.secondary }}
                          onMouseEnter={e => (e.currentTarget.style.background = C.grayBg)}
                          onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                          <Edit2 size={13} />
                        </button>
                      </div>
                    </TD>
                  )}
                </TR>
              ))}
              {filteredItems.length === 0 && (
                <tr>
                  <td colSpan={role === "owner" ? 10 : 10} className="px-4 py-12 text-center">
                    <div className="text-sm font-semibold" style={{ color: C.primary }}>No inventory items found</div>
                    <div className="text-xs mt-1" style={{ color: C.secondary }}>Try changing the search or filters, or click Refresh.</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Pagination total={filteredItems.length} page={1} perPage={8} />
      </Card>
      {showLoss && <SpoilageModal onClose={() => setShowLoss(false)} onSave={() => { setShowLoss(false); toast.success("Loss record saved successfully"); }} />}
    </div>
  );
}

// ─── Physical Count ────────────────────────────────────────────────────────────

const inventoryManagementTabs = [
  { id: "overview", label: "Inventory Overview" },
  { id: "counts", label: "Inventory Counts" },
] as const;

const physicalCountTabs = [
  { id: "record", label: "Record Physical Count" },
  { id: "expected", label: "Expected Stock" },
  { id: "history", label: "Physical Count History" },
] as const;

export function PhysicalCountsModule({ role, initialTab = "record" }: {
  role: Role;
  initialTab?: "record" | "expected" | "history";
}) {
  const availableTabs = role === "manager" ? physicalCountTabs : physicalCountTabs.slice(1);
  const safeInitialTab = role === "manager" ? initialTab : initialTab === "expected" ? "expected" : "history";
  const [activeTab, setActiveTab] = useState<"record" | "expected" | "history">(safeInitialTab);

  useEffect(() => {
    setActiveTab(role === "manager" ? initialTab : initialTab === "expected" ? "expected" : "history");
  }, [initialTab, role]);

  return (
    <div>
      <ModuleTabSwitcher tabs={availableTabs} active={activeTab} onChange={setActiveTab} />
      <AnimatedTabPanel panelKey={activeTab}>
        {activeTab === "record" && <InventoryCountPage />}
        {activeTab === "expected" && <ExpectedInventoryPage role={role} view="expected" />}
        {activeTab === "history" && <PhysicalCountHistoryPage role={role} />}
      </AnimatedTabPanel>
    </div>
  );
}

export function InventoryManagementModule({ role, onNavigate, initialTab = "overview" }: {
  role: Role;
  onNavigate: (page: Page) => void;
  initialTab?: "overview" | "counts";
}) {
  const [activeTab, setActiveTab] = useState<"overview" | "counts">(initialTab);

  useEffect(() => setActiveTab(initialTab), [initialTab]);

  return (
    <div>
      <ModuleTabSwitcher tabs={inventoryManagementTabs} active={activeTab} onChange={setActiveTab} />
      <AnimatedTabPanel panelKey={activeTab}>
        {activeTab === "overview"
          ? <InventoryOverview role={role} onNavigate={onNavigate} />
          : <PhysicalCountsModule role={role} initialTab={role === "manager" ? "record" : "history"} />}
      </AnimatedTabPanel>
    </div>
  );
}
