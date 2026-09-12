import { useEffect, useMemo, useState } from "react";
import { Activity, ClipboardCheck, Edit3, FileWarning, RefreshCw, Search, Users } from "lucide-react";
import { useNavigate } from "react-router";
import { useAuth } from "../../contexts/AuthContext";
import { inventoryWorkflowService } from "../../services/inventoryWorkflow.service";
import { masterDataService } from "../../services/masterData.service";
import type { ExpectedInventoryItem, InventoryCountSummary } from "../../types/inventoryWorkflow";
import { Branch } from "../../types/masterData";
import { Btn, CalendarDateField, SearchInput, Select, TableCard, TableEmptyRow, TableLoadingRow, TableWrapper, TD, THead, TR } from "../../components/ModuleUi";
import { businessDate } from "../../utils/businessDate";
import { formatAppDate } from "../../utils/appPreferences";

type AppRole = "owner" | "manager";
type InventoryView = "expected" | "usage";

const today = businessDate();
const number = (value: number) => Number(value).toLocaleString("en-PH", { maximumFractionDigits: 4 });
const dateTime = (value: string) => formatAppDate(value, true);

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
    ? ["SKU", "Ingredient", "Previous Actual", "Received", "Expected Usage", "Unit"]
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

export function PhysicalCountHistoryPage({ role, scopeBranchId = "ALL", onEditCount }: { role: AppRole; scopeBranchId?: string; onEditCount?: (countId: string) => void }) {
  const owner = role === "owner";
  const navigate = useNavigate();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState(scopeBranchId === "ALL" ? "" : scopeBranchId);
  const [counts, setCounts] = useState<InventoryCountSummary[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!owner) return;
    void masterDataService.branches().then(setBranches).catch(() => setBranches([]));
  }, [owner]);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      setCounts(await inventoryWorkflowService.counts(owner ? branchId || undefined : undefined));
    } catch (reason) {
      setCounts([]);
      setError(reason instanceof Error ? reason.message : "Unable to load physical-count history.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [branchId, owner]);
  useEffect(() => { if (owner) setBranchId(scopeBranchId === "ALL" ? "" : scopeBranchId); }, [owner, scopeBranchId]);
  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return counts.filter((item) => !query || [item.countNo, item.branchName, item.submittedBy, item.countDate].some((value) => value.toLowerCase().includes(query)));
  }, [counts, search]);

  const cols = ["Count No.", "Count Date", ...(owner ? ["Branch"] : []), "Recorded By", "Items Counted", "Variances", "Submitted", "Actions"];
  const colCount = cols.length;

  return (
    <div className="p-4 md:p-6 space-y-5">
      <TableCard
        title="Physical Count History"
        subtitle="Recorded counts and the number of discrepancies detected during reconciliation."
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
            <div className="ml-auto">
              <Btn variant="outline" size="sm" icon={RefreshCw} onClick={() => void load()}>
                Refresh
              </Btn>
            </div>
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
              visible.map((item) => (
                <TR key={item.id}>
                  <TD mono muted>{item.countNo}</TD>
                  <TD>{item.countDate}</TD>
                  {owner && <TD muted>{item.branchName}</TD>}
                  <TD muted>{item.submittedBy}</TD>
                  <TD right>{item.itemCount}</TD>
                  <TD right bold className={item.varianceCount ? "text-[var(--app-danger)]" : "text-[var(--app-success)]"}>
                    {item.varianceCount}
                  </TD>
                  <TD muted className="whitespace-nowrap">{dateTime(item.submittedAt)}</TD>
                  <TD center className="whitespace-nowrap">
                    {item.canEdit ? (
                      <Btn
                        size="sm"
                        icon={Edit3}
                        onClick={() => {
                          onEditCount?.(item.id);
                          navigate(`/inventory/physical-count?editCount=${encodeURIComponent(item.id)}`);
                        }}
                        title="Reopen count for correction"
                      >
                        Correct Count
                      </Btn>
                    ) : (
                      <span className="text-xs font-medium text-[var(--app-text-muted)]">
                        {owner ? "—" : "Locked"}
                      </span>
                    )}
                  </TD>
                </TR>
              ))
            )}
          </tbody>
        </TableWrapper>
      </TableCard>
    </div>
  );
}
