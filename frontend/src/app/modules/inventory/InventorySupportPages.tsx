import { useEffect, useMemo, useState } from "react";
import { Activity, ClipboardCheck, Edit3, Eye, FileWarning, RefreshCw, Search, ShieldCheck, TestTube2, Users, X } from "lucide-react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { useAuth } from "../../contexts/AuthContext";
import { inventoryWorkflowService } from "../../services/inventoryWorkflow.service";
import { masterDataService } from "../../services/masterData.service";
import type { CountVarianceItem, ExpectedInventoryItem, InventoryCountSummary, InventoryCountType, OpeningInventoryBaseline } from "../../types/inventoryWorkflow";
import { Branch } from "../../types/masterData";
import { Btn, CalendarDateField, SearchInput, Select, TableCard, TableEmptyRow, TableLoadingRow, TableWrapper, TD, THead, TR } from "../../components/ModuleUi";
import { businessDate } from "../../utils/businessDate";
import { formatAppDate } from "../../utils/appPreferences";
import { ControlledActionDialog, type ControlledActionValue } from "../../components/ControlledActionDialog";
import { StartingStockSetupPage } from "./StartingStockSetup";

type AppRole = "owner" | "manager";
type InventoryView = "expected" | "usage";

export function inventoryCountHistoryActions(role: AppRole, canEdit: boolean) {
  return { canView: role === "owner", canEdit: role === "manager" && canEdit, canDelete: false };
}

export const inventoryCountHistoryModes = (role: AppRole, uatEnabled: boolean) =>
  role === "owner" && uatEnabled ? ["operational", "uat"] as const : ["operational"] as const;

export function PhysicalCountHistoryHeaderActions({ onRefresh }: {
  onRefresh: () => void;
}) {
  return <Btn variant="outline" size="sm" icon={RefreshCw} onClick={onRefresh}>Refresh</Btn>;
}

export type InventoryCountHistoryTypeFilter = "ALL" | InventoryCountType;
export const filterInventoryCountHistory = (
  counts: InventoryCountSummary[],
  search: string,
  countDate: string,
  countType: InventoryCountHistoryTypeFilter,
) => {
  const query = search.trim().toLowerCase();
  return counts.filter((item) =>
    (!query || [item.countNo, item.branchName, item.submittedBy, item.countDate].some((value) => value.toLowerCase().includes(query)))
    && (!countDate || item.countDate === countDate)
    && (countType === "ALL" || (item.countType ?? "FULL") === countType)
  );
};

export const filterIngredientUsageItems = (items: ExpectedInventoryItem[], search: string) => {
  const query = search.trim().toLocaleLowerCase();
  return query
    ? items.filter((item) => item.itemName.toLocaleLowerCase().includes(query) || item.sku.toLocaleLowerCase().includes(query))
    : items;
};
export const INGREDIENT_USAGE_NO_MATCH_TITLE = "No matching ingredients found";
export const ingredientUsageThroughDateError = (value:string, manilaToday=businessDate()) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "Choose a valid usage-through date.";
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0,10) !== value) return "Choose a valid usage-through date.";
  if (value > manilaToday) return "Usage Through Date cannot be later than today in Asia/Manila.";
  return "";
};

export function IngredientUsageSearch({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <div data-ingredient-usage-search className="flex min-w-0 flex-1 flex-wrap items-center gap-2 md:min-w-72">
    <SearchInput placeholder="Search ingredient name or SKU..." width={360} value={value} onChange={onChange}/>
    {value && <Btn variant="ghost" size="sm" icon={X} onClick={() => onChange("")}>Clear Search</Btn>}
  </div>;
}

export function IngredientUsageToolbar({ date, search, onDateChange, onSearchChange }: {
  date: string;
  search: string;
  onDateChange: (value: string) => void;
  onSearchChange: (value: string) => void;
}) {
  return <div data-ingredient-usage-toolbar className="flex w-full min-w-0 flex-col gap-3 md:w-auto md:flex-1 md:flex-row md:items-end">
    <div className="shrink-0"><CalendarDateField label="Usage Through Date" value={date} max={today} onChange={onDateChange}/><p className="mt-1 max-w-64 text-[10px] text-[var(--app-text-muted)]">Shows ingredient consumption from validated POS sales up to this date.</p></div>
    <IngredientUsageSearch value={search} onChange={onSearchChange}/>
  </div>;
}

const today = businessDate();
const number = (value: number) => Number(value).toLocaleString("en-PH", { maximumFractionDigits: 4 });

function BranchScope({ owner, branches, branchId, onChange }: {
  owner: boolean;
  branches: Branch[];
  branchId: string;
  onChange: (value: string) => void;
}) {
  if (!owner) return null;
  return (
    <Select value={branchId} onChange={onChange} options={[{ value: "", label: "Select branch..." }, ...branches.filter((branch) => branch.status === "ACTIVE").map((branch) => ({ value: branch.id, label: branch.name }))]}/>
  );
}

export function ExpectedInventoryPage({ role, view, scopeBranchId = "ALL" }: { role: AppRole; view: InventoryView; scopeBranchId?: string }) {
  const owner = role === "owner";
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState(scopeBranchId === "ALL" ? "" : scopeBranchId);
  const [countDate, setCountDate] = useState(today);
  const [items, setItems] = useState<ExpectedInventoryItem[]>([]);
  const [usageSearch, setUsageSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [usageDateError, setUsageDateError] = useState("");

  useEffect(() => {
    if (!owner) return;
    void masterDataService.branches().then(setBranches).catch(() => setBranches([]));
  }, [owner]);

  const load = async () => {
    if (owner && !branchId) {
      setItems([]);
      setError("");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const result = await inventoryWorkflowService.expected(countDate, owner ? branchId : undefined);
      setItems(result.items);
    } catch (reason) {
      setItems([]);
      setError(reason instanceof Error ? reason.message : "Unable to load inventory calculations.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [branchId, countDate, owner]);
  useEffect(() => { if (owner) setBranchId(scopeBranchId === "ALL" ? "" : scopeBranchId); }, [owner, scopeBranchId]);

  const isUsage = view === "usage";
  const cols = isUsage
    ? ["SKU", "Ingredient", "Previous Stock Count", "Received", "Expected Usage", "Unit"]
    : ["SKU", "Ingredient", "Previous Actual", "Received", "Expected Usage", "Adjustments", "Expected Stock", "Unit"];
  const colCount = cols.length;
  const visibleItems = useMemo(() => isUsage ? filterIngredientUsageItems(items, usageSearch) : items, [isUsage, items, usageSearch]);
  const changeUsageThroughDate = (value:string) => {
    const validationError = ingredientUsageThroughDateError(value, today);
    setUsageDateError(validationError);
    if (!validationError) setCountDate(value);
  };

  return (
    <div className="p-4 md:p-6 space-y-5">
      <TableCard
        title={isUsage ? "Ingredient Usage" : "Expected Stock"}
        subtitle={
          isUsage
            ? "Recipe-based ingredient consumption calculated from validated POS sales."
            : "System stock calculated from prior counts, receipts, recipe consumption, and approved adjustments."
        }
        badge={
          items.length > 0 ? (
            <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-[var(--app-primary-faint)] text-[var(--app-primary)]">
              {isUsage && usageSearch.trim() ? `${visibleItems.length} of ${items.length}` : items.length} records
            </span>
          ) : undefined
        }
        toolbar={
          <>
            <BranchScope owner={owner} branches={branches} branchId={branchId} onChange={setBranchId} />
            {isUsage
              ? <div><IngredientUsageToolbar date={countDate} search={usageSearch} onDateChange={changeUsageThroughDate} onSearchChange={setUsageSearch}/>{usageDateError&&<p role="alert" className="mt-1 text-xs text-[var(--app-danger)]">{usageDateError}</p>}</div>
              : <CalendarDateField label="As of date" value={countDate} onChange={setCountDate}/>}
            <div className="ml-auto">
              <Btn variant="outline" size="sm" icon={RefreshCw} onClick={() => void load()}>
                Refresh
              </Btn>
            </div>
          </>
        }
      >
        <TableWrapper minWidth={840}>
          <THead cols={cols} />
          <tbody>
            {owner && !branchId ? (
              <TableEmptyRow
                colSpan={colCount}
                icon={Search}
                title="Select a branch"
                subtitle="Choose a branch from the filter to view its inventory calculations."
              />
            ) : loading ? (
              <TableLoadingRow colSpan={colCount} label="Loading inventory calculations…" />
            ) : error ? (
              <TableEmptyRow
                colSpan={colCount}
                icon={FileWarning}
                title="Unable to load data"
                subtitle={error}
              />
            ) : items.length === 0 ? (
              <TableEmptyRow
                colSpan={colCount}
                icon={ClipboardCheck}
                title="No calculation records"
                subtitle="No inventory calculation is available for the selected branch and date."
              />
            ) : visibleItems.length === 0 ? (
              <TableEmptyRow
                colSpan={colCount}
                icon={Search}
                title={INGREDIENT_USAGE_NO_MATCH_TITLE}
                subtitle="Try another ingredient name or SKU."
              />
            ) : (
              visibleItems.map((item) => (
                <TR key={item.inventoryItemId}>
                  <TD mono muted>{item.sku}</TD>
                  <TD bold>{item.itemName}</TD>
                  <TD right>{number(item.previousActualQuantity)}</TD>
                  <TD right>{number(item.stockReceived)}</TD>
                  <TD right bold className="text-[var(--app-primary)]">{number(item.expectedConsumption)}</TD>
                  {!isUsage && <TD right>{number(item.approvedAdjustments)}</TD>}
                  {!isUsage && <TD right bold>{number(item.expectedQuantity)}</TD>}
                  <TD muted>{item.unit}</TD>
                </TR>
              ))
            )}
          </tbody>
        </TableWrapper>
      </TableCard>
    </div>
  );
}

export function PhysicalCountHistoryPage({ role, scopeBranchId = "ALL", onEditCount, onOperationalCountsLoaded }: { role: AppRole; scopeBranchId?: string; onEditCount?: (count: {id:string;countType:"OPENING"|"CLOSING"|"FULL"}) => void; onOperationalCountsLoaded?: (counts: InventoryCountSummary[]) => void }) {
  const owner = role === "owner";
  const navigate = useNavigate();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState(scopeBranchId === "ALL" ? "" : scopeBranchId);
  const [counts, setCounts] = useState<InventoryCountSummary[]>([]);
  const [search, setSearch] = useState("");
  const [historyDate, setHistoryDate] = useState("");
  const [countType, setCountType] = useState<InventoryCountHistoryTypeFilter>("ALL");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [viewTarget, setViewTarget] = useState<InventoryCountSummary | null>(null);
  const [viewItems, setViewItems] = useState<CountVarianceItem[]>([]);
  const [viewLoading, setViewLoading] = useState(false);
  const [historyMode, setHistoryMode] = useState<"operational" | "uat">("operational");
  const [uatControlsEnabled, setUatControlsEnabled] = useState(false);
  const [classifyTarget, setClassifyTarget] = useState<InventoryCountSummary | null>(null);
  const [classification, setClassification] = useState<ControlledActionValue>({ reason: "", verificationPin: "" });
  const [classifying, setClassifying] = useState(false);

  useEffect(() => {
    if (!owner) return;
    void masterDataService.branches().then(setBranches).catch(() => setBranches([]));
  }, [owner]);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      if (historyMode === "uat") {
        setCounts(await inventoryWorkflowService.uatCounts(owner ? branchId || undefined : undefined));
      } else {
        const result = await inventoryWorkflowService.counts(owner ? branchId || undefined : undefined);
        setCounts(result.counts);
        setUatControlsEnabled(result.uatTestControlsEnabled);
        onOperationalCountsLoaded?.(result.counts);
      }
    } catch (reason) {
      setCounts([]);
      setError(reason instanceof Error ? reason.message : "Unable to load physical-count history.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [branchId, owner, historyMode]);
  useEffect(() => { if (owner) setBranchId(scopeBranchId === "ALL" ? "" : scopeBranchId); }, [owner, scopeBranchId]);
  const visible = useMemo(() => {
    return filterInventoryCountHistory(counts, search, historyDate, countType);
  }, [countType, counts, historyDate, search]);

  const cols = [...(owner ? ["Branch"] : []), "Count No.", "Type", "Count Date", "Recorded By", "Items Counted", "Variances", "Submitted", "Actions"];
  const colCount = cols.length;
  const viewCount = async (count: InventoryCountSummary) => {
    setViewTarget(count);
    setViewItems([]);
    setViewLoading(true);
    try {
      const detail = historyMode === "uat"
        ? await inventoryWorkflowService.uatCount(count.id)
        : await inventoryWorkflowService.count(count.id);
      setViewItems(detail.items);
    } catch (reason) {
      setViewTarget(null);
      setError(reason instanceof Error ? reason.message : "Unable to load count details.");
    } finally {
      setViewLoading(false);
    }
  };

  const classifyAsUatTest = async () => {
    if (!classifyTarget) return;
    setClassifying(true);
    try {
      await inventoryWorkflowService.classifyCountAsUatTest(classifyTarget.id, classification);
      toast.success(`${classifyTarget.countNo} classified as UAT/Test Data`);
      setClassifyTarget(null);
      setClassification({ reason: "", verificationPin: "" });
      await load();
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Unable to classify the physical count");
    } finally {
      setClassifying(false);
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-5">
      <TableCard
        title={historyMode === "uat" ? "UAT/Test Stock History" : "Stock History"}
        subtitle={historyMode === "uat" ? "Owner-only audit view of preserved UAT/Test count snapshots. These records do not reset operational inventory." : undefined}
        actions={<PhysicalCountHistoryHeaderActions onRefresh={() => void load()}/>}
        badge={
          visible.length > 0 ? (
            <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-[var(--app-primary-faint)] text-[var(--app-primary)]">
              {visible.length} records
            </span>
          ) : undefined
        }
        toolbar={
          <>
            <SearchInput placeholder="Search count records…" value={search} onChange={setSearch} />
            <BranchScope owner={owner} branches={branches} branchId={branchId} onChange={setBranchId} />
            <CalendarDateField label="Count date" value={historyDate} max={businessDate()} onChange={setHistoryDate} />
            <Select small ariaLabel="Count type" value={countType} onChange={(value) => setCountType(value as InventoryCountHistoryTypeFilter)} options={[{ value: "ALL", label: "All Types" }, { value: "OPENING", label: "Opening Count" }, { value: "CLOSING", label: "Closing Count" }, { value: "FULL", label: "Full Physical Count" }]}/>
            {inventoryCountHistoryModes(role, uatControlsEnabled).length > 1 && (
              <div className="inline-flex rounded-xl border border-[var(--app-border)] p-1">
                <Btn size="sm" variant={historyMode === "operational" ? "primary" : "outline"} onClick={() => setHistoryMode("operational")}>Operational</Btn>
                <Btn size="sm" variant={historyMode === "uat" ? "primary" : "outline"} icon={TestTube2} onClick={() => setHistoryMode("uat")}>UAT/Test History</Btn>
              </div>
            )}
          </>
        }
      >
        <TableWrapper minWidth={880}>
          <THead cols={cols} />
          <tbody>
            {loading ? (
              <TableLoadingRow colSpan={colCount} label="Loading physical-count history…" />
            ) : error ? (
              <TableEmptyRow
                colSpan={colCount}
                icon={FileWarning}
                title="Unable to load records"
                subtitle={error}
              />
            ) : visible.length === 0 ? (
              <TableEmptyRow
                colSpan={colCount}
                icon={ClipboardCheck}
                title="No physical counts found"
                subtitle="No count records match the selected scope."
              />
            ) : (
              visible.map((item) => {
                const actions = inventoryCountHistoryActions(role, item.canEdit);
                return <TR key={item.id}>
                  {owner && <TD muted>{item.branchName}</TD>}
                  <TD mono muted>{item.countNo}</TD>
                  <TD><span className="inline-flex rounded-full px-2.5 py-1 text-xs font-semibold bg-[var(--app-primary-faint)] text-[var(--app-primary)]">{item.countType === "OPENING" ? "Opening" : item.countType === "CLOSING" ? "Closing" : "Full"}</span></TD>
                  <TD>{formatAppDate(item.countDate)}</TD>
                  <TD muted>{item.submittedBy}</TD>
                  <TD right>{item.itemCount}</TD>
                  <TD right bold className={item.varianceCount ? "text-[var(--app-danger)]" : "text-[var(--app-success)]"}>
                    {item.countType === "OPENING" ? "—" : item.varianceCount}
                  </TD>
                  <TD><span className="inline-flex rounded-full px-2.5 py-1 text-xs font-semibold bg-[var(--app-success-bg)] text-[var(--app-success)]">Yes</span></TD>
                  <TD center className="whitespace-nowrap">
                    {actions.canView ? (
                      <div className="flex items-center justify-center gap-2">
                        <Btn size="sm" variant="outline" icon={Eye} onClick={() => void viewCount(item)}>View</Btn>
                        {historyMode === "operational" && item.canClassifyAsTestData && (
                          <Btn size="sm" variant="outline" icon={ShieldCheck} onClick={() => setClassifyTarget(item)}>Classify UAT/Test</Btn>
                        )}
                      </div>
                    ) : actions.canEdit ? (
                      <Btn
                        size="sm"
                        icon={Edit3}
                        onClick={() => {
                          const selectedCountType=item.countType??"FULL";
                          if (onEditCount) onEditCount({ id:item.id, countType:selectedCountType });
                          else navigate(`/inventory/physical-count?editCount=${encodeURIComponent(item.id)}&countType=${selectedCountType}`);
                        }}
                        title="Reopen count for correction"
                      >
                        Edit
                      </Btn>
                    ) : (
                      <span className="text-xs font-medium text-[var(--app-text-muted)]">
                        {owner ? "—" : "Locked"}
                      </span>
                    )}
                  </TD>
                </TR>;
              })
            )}
          </tbody>
        </TableWrapper>
      </TableCard>
      {viewTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,.52)" }} onMouseDown={(event) => { if (event.target === event.currentTarget) setViewTarget(null); }}>
          <div role="dialog" aria-modal="true" aria-labelledby="inventory-count-detail-title" className="w-full max-w-5xl max-h-[90vh] overflow-y-auto rounded-2xl border shadow-2xl bg-[var(--app-surface)] border-[var(--app-border)]">
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b p-5 bg-[var(--app-surface)] border-[var(--app-border)]">
              <div><h2 id="inventory-count-detail-title" className="text-lg font-bold">{viewTarget.countNo}</h2><p className="mt-1 text-xs text-[var(--app-text-muted)]">{viewTarget.branchName} · {viewTarget.countDate} · Recorded by {viewTarget.submittedBy}</p></div>
              <button aria-label="Close count details" onClick={() => setViewTarget(null)} className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--app-surface-elevated)]"><X size={16}/></button>
            </div>
            <div className="p-5">
              <TableWrapper minWidth={820}>
                <THead cols={["SKU", "Ingredient", "Expected", "Physical Count", "Variance", "Variance Value", "Unit"]}/>
                <tbody>
                  {viewLoading ? <TableLoadingRow colSpan={7} label="Loading count details…"/> : viewItems.map((item) => <TR key={item.id}>
                    <TD mono muted>{item.sku}</TD><TD bold>{item.itemName}</TD><TD right>{number(item.expectedQuantity)}</TD><TD right>{number(item.actualQuantity)}</TD>
                    <TD right bold className={viewTarget.countType === "OPENING" ? "text-[var(--app-text-muted)]" : Math.abs(item.varianceQuantity) > 0.0001 ? "text-[var(--app-danger)]" : "text-[var(--app-success)]"}>{viewTarget.countType === "OPENING" ? "—" : number(item.varianceQuantity)}</TD>
                    <TD right>{viewTarget.countType === "OPENING" ? "—" : number(item.varianceValue)}</TD><TD muted>{item.unit}</TD>
                  </TR>)}
                </tbody>
              </TableWrapper>
            </div>
          </div>
        </div>
      )}
      {classifyTarget && (
        <ControlledActionDialog
          title={`Classify ${classifyTarget.countNo} as UAT/Test Data?`}
          description="This preserves the count, item snapshots, notifications, incident links, shrinkage history, and audits. The authorized count, linked shrinkage record, and any exact derived current-balance rows will be excluded from operational inventory calculations. Quantities and timestamps are not changed."
          confirmLabel="Classify as UAT/Test"
          value={classification}
          busy={classifying}
          onChange={setClassification}
          onCancel={() => { setClassifyTarget(null); setClassification({ reason: "", verificationPin: "" }); }}
          onConfirm={() => void classifyAsUatTest()}
        />
      )}
    </div>
  );
}

export function OpeningInventoryBaselinePage({ role, scopeBranchId = "ALL" }: { role: AppRole; scopeBranchId?: string }) {
  const owner = role === "owner";
  const [baselines, setBaselines] = useState<OpeningInventoryBaseline[]>([]);
  const [selected, setSelected] = useState<OpeningInventoryBaseline | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = async () => {
    setLoading(true); setError("");
    try { setBaselines(await inventoryWorkflowService.openingBaselines(owner && scopeBranchId !== "ALL" ? scopeBranchId : undefined)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to load starting stock."); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [owner, scopeBranchId]);
  if (!owner) return <StartingStockSetupPage/>;
  return <div className="p-4 md:p-6 space-y-5">
    <TableCard title="Starting Stock" subtitle="Initial stock recorded when a branch begins using Libro." toolbar={<div className="ml-auto"><Btn variant="outline" size="sm" icon={RefreshCw} onClick={() => void load()}>Refresh</Btn></div>}>
      <TableWrapper minWidth={850}><THead cols={["Branch", "Baseline No.", "Effective At", "Type", "Items", "Created By", "Actions"]}/><tbody>
        {loading ? <TableLoadingRow colSpan={7} label="Loading starting stock…"/> : error ? <TableEmptyRow colSpan={7} icon={FileWarning} title="Unable to load starting stock" subtitle={error}/> : baselines.length===0 ? <TableEmptyRow colSpan={7} icon={ClipboardCheck} title="No starting stock" subtitle="No starting stock has been recorded for this scope."/> : baselines.map((baseline)=><TR key={baseline.id}>
          <TD>{baseline.branchName}</TD><TD mono muted>{baseline.baselineNo}</TD><TD>{new Date(baseline.effectiveAt).toLocaleString("en-PH")}</TD><TD><span className="inline-flex rounded-full px-2.5 py-1 text-xs font-semibold bg-[var(--app-primary-faint)] text-[var(--app-primary)]">Starting Stock</span></TD><TD right>{baseline.items.length}</TD><TD muted>{baseline.createdBy}</TD><TD><Btn size="sm" variant="outline" icon={Eye} onClick={()=>setSelected(baseline)}>View</Btn></TD>
        </TR>)}</tbody></TableWrapper>
    </TableCard>
    {selected && <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{background:"rgba(0,0,0,.52)"}} onMouseDown={(event)=>{if(event.target===event.currentTarget)setSelected(null);}}><div role="dialog" aria-modal="true" aria-labelledby="starting-stock-detail-title" className="w-full max-w-5xl max-h-[90vh] overflow-y-auto rounded-2xl border shadow-2xl bg-[var(--app-surface)] border-[var(--app-border)]"><div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b p-5 bg-[var(--app-surface)] border-[var(--app-border)]"><div><h2 id="starting-stock-detail-title" className="text-lg font-bold">{selected.baselineNo}</h2><p className="mt-1 text-xs text-[var(--app-text-muted)]">{selected.branchName} · {new Date(selected.effectiveAt).toLocaleString("en-PH")} · {selected.notes}</p></div><button aria-label="Close starting stock details" onClick={()=>setSelected(null)} className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--app-surface-elevated)]"><X size={16}/></button></div><div className="p-5"><TableWrapper minWidth={700}><THead cols={["SKU","Inventory Item","Starting Quantity","Unit"]}/><tbody>{selected.items.map((item)=><TR key={item.id}><TD mono muted>{item.sku}</TD><TD bold>{item.name}</TD><TD right>{number(item.quantity)}</TD><TD muted>{item.unit}</TD></TR>)}</tbody></TableWrapper></div></div></div>}
  </div>;
}
