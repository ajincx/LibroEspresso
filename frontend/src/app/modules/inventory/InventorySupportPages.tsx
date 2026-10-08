import { useEffect, useMemo, useState } from "react";
import { Activity, ClipboardCheck, Edit3, Eye, FileWarning, Plus, RefreshCw, Search, ShieldCheck, TestTube2, Users, X } from "lucide-react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { useAuth } from "../../contexts/AuthContext";
import { inventoryWorkflowService } from "../../services/inventoryWorkflow.service";
import { masterDataService } from "../../services/masterData.service";
import type { CountVarianceItem, ExpectedInventoryItem, InventoryCountSummary, OpeningInventoryBaseline } from "../../types/inventoryWorkflow";
import { Branch } from "../../types/masterData";
import { Btn, CalendarDateField, SearchInput, Select, TableCard, TableEmptyRow, TableLoadingRow, TableWrapper, TD, THead, TR } from "../../components/ModuleUi";
import { businessDate } from "../../utils/businessDate";
import { formatAppDate } from "../../utils/appPreferences";
import { ControlledActionDialog, type ControlledActionValue } from "../../components/ControlledActionDialog";

type AppRole = "owner" | "manager";
type InventoryView = "expected" | "usage";

export function inventoryCountHistoryActions(role: AppRole, canEdit: boolean) {
  return { canView: role === "owner", canEdit: role === "manager" && canEdit, canDelete: false };
}

export const inventoryCountHistoryModes = (role: AppRole, uatEnabled: boolean) =>
  role === "owner" && uatEnabled ? ["operational", "uat"] as const : ["operational"] as const;

export const canRecordPhysicalCount = (role: AppRole) => role === "manager";

export function PhysicalCountHistoryHeaderActions({ role, historyMode, onRecordCount, onRefresh }: {
  role: AppRole;
  historyMode: "operational" | "uat";
  onRecordCount?: () => void;
  onRefresh: () => void;
}) {
  return <>
    {historyMode === "operational" && canRecordPhysicalCount(role) && (
      <Btn size="sm" icon={Plus} onClick={onRecordCount}>Record Stock Count</Btn>
    )}
    <Btn variant="outline" size="sm" icon={RefreshCw} onClick={onRefresh}>Refresh</Btn>
  </>;
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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
              {items.length} records
            </span>
          ) : undefined
        }
        toolbar={
          <>
            <BranchScope owner={owner} branches={branches} branchId={branchId} onChange={setBranchId} />
            <CalendarDateField label="As of date" value={countDate} onChange={setCountDate} />
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
            ) : (
              items.map((item) => (
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

export function PhysicalCountHistoryPage({ role, scopeBranchId = "ALL", onEditCount, onRecordCount }: { role: AppRole; scopeBranchId?: string; onEditCount?: (countId: string) => void; onRecordCount?: () => void }) {
  const owner = role === "owner";
  const navigate = useNavigate();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState(scopeBranchId === "ALL" ? "" : scopeBranchId);
  const [counts, setCounts] = useState<InventoryCountSummary[]>([]);
  const [search, setSearch] = useState("");
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
    const query = search.trim().toLowerCase();
    return counts.filter((item) => !query || [item.countNo, item.branchName, item.submittedBy, item.countDate].some((value) => value.toLowerCase().includes(query)));
  }, [counts, search]);

  const cols = [...(owner ? ["Branch"] : []), "Count No.", "Count Date", "Recorded By", "Items Counted", "Variances", "Submitted", "Actions"];
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
        title={historyMode === "uat" ? "UAT/Test Physical Count History" : "Physical Count History"}
        subtitle={historyMode === "uat" ? "Owner-only audit view of preserved UAT/Test count snapshots. These records do not reset operational inventory." : "Record and verify the physical stock available at the branch."}
        actions={<PhysicalCountHistoryHeaderActions role={role} historyMode={historyMode} onRecordCount={onRecordCount} onRefresh={() => void load()}/>}
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
                  <TD>{formatAppDate(item.countDate)}</TD>
                  <TD muted>{item.submittedBy}</TD>
                  <TD right>{item.itemCount}</TD>
                  <TD right bold className={item.varianceCount ? "text-[var(--app-danger)]" : "text-[var(--app-success)]"}>
                    {item.varianceCount}
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
                          onEditCount?.(item.id);
                          navigate(`/inventory/physical-count?editCount=${encodeURIComponent(item.id)}`);
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
                    <TD right bold className={Math.abs(item.varianceQuantity) > 0.0001 ? "text-[var(--app-danger)]" : "text-[var(--app-success)]"}>{number(item.varianceQuantity)}</TD>
                    <TD right>{number(item.varianceValue)}</TD><TD muted>{item.unit}</TD>
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
  return <div className="p-4 md:p-6 space-y-5">
    <TableCard title="Starting Stock" subtitle="Initial stock recorded when a branch begins using Libro." toolbar={<div className="ml-auto"><Btn variant="outline" size="sm" icon={RefreshCw} onClick={() => void load()}>Refresh</Btn></div>}>
      <TableWrapper minWidth={850}><THead cols={["Branch", "Baseline No.", "Effective At", "Designation", "Items", "Created By", "Actions"]}/><tbody>
        {loading ? <TableLoadingRow colSpan={7} label="Loading starting stock…"/> : error ? <TableEmptyRow colSpan={7} icon={FileWarning} title="Unable to load starting stock" subtitle={error}/> : baselines.length===0 ? <TableEmptyRow colSpan={7} icon={ClipboardCheck} title="No starting stock" subtitle="No starting stock has been recorded for this scope."/> : baselines.map((baseline)=><TR key={baseline.id}>
          <TD>{baseline.branchName}</TD><TD mono muted>{baseline.baselineNo}</TD><TD>{new Date(baseline.effectiveAt).toLocaleString("en-PH")}</TD><TD><span className="inline-flex rounded-full px-2.5 py-1 text-xs font-semibold bg-[var(--app-primary-faint)] text-[var(--app-primary)]">Starting Stock</span></TD><TD right>{baseline.items.length}</TD><TD muted>{baseline.createdBy}</TD><TD><Btn size="sm" variant="outline" icon={Eye} onClick={()=>setSelected(baseline)}>View</Btn></TD>
        </TR>)}</tbody></TableWrapper>
    </TableCard>
    {selected && <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{background:"rgba(0,0,0,.52)"}} onMouseDown={(event)=>{if(event.target===event.currentTarget)setSelected(null);}}><div role="dialog" aria-modal="true" aria-labelledby="starting-stock-detail-title" className="w-full max-w-5xl max-h-[90vh] overflow-y-auto rounded-2xl border shadow-2xl bg-[var(--app-surface)] border-[var(--app-border)]"><div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b p-5 bg-[var(--app-surface)] border-[var(--app-border)]"><div><h2 id="starting-stock-detail-title" className="text-lg font-bold">{selected.baselineNo}</h2><p className="mt-1 text-xs text-[var(--app-text-muted)]">{selected.branchName} · {new Date(selected.effectiveAt).toLocaleString("en-PH")} · {selected.notes}</p></div><button aria-label="Close starting stock details" onClick={()=>setSelected(null)} className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--app-surface-elevated)]"><X size={16}/></button></div><div className="p-5"><TableWrapper minWidth={700}><THead cols={["SKU","Inventory Item","Starting Quantity","Unit"]}/><tbody>{selected.items.map((item)=><TR key={item.id}><TD mono muted>{item.sku}</TD><TD bold>{item.name}</TD><TD right>{number(item.quantity)}</TD><TD muted>{item.unit}</TD></TR>)}</tbody></TableWrapper></div></div></div>}
  </div>;
}
