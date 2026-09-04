import { useEffect, useMemo, useState } from "react";
import { Activity, ClipboardCheck, FileWarning, RefreshCw, Search, Users } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { inventoryWorkflowService } from "../../services/inventoryWorkflow.service";
import { masterDataService } from "../../services/masterData.service";
import type { ExpectedInventoryItem, InventoryCountSummary } from "../../types/inventoryWorkflow";
import type { Branch } from "../../types/masterData";

type AppRole = "owner" | "manager";
type InventoryView = "expected" | "usage";

const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
const number = (value: number) => Number(value).toLocaleString("en-PH", { maximumFractionDigits: 4 });
const dateTime = (value: string) => new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));

function BranchScope({ owner, branches, branchId, onChange }: {
  owner: boolean;
  branches: Branch[];
  branchId: string;
  onChange: (value: string) => void;
}) {
  if (!owner) return null;
  return (
    <select value={branchId} onChange={(event) => onChange(event.target.value)}
      className="px-3 py-2.5 rounded-xl border text-sm"
      style={{ borderColor: "var(--app-border)", background: "var(--app-surface)", color: "var(--app-text)" }}>
      <option value="">Select branch...</option>
      {branches.filter((branch) => branch.status === "ACTIVE").map((branch) => (
        <option key={branch.id} value={branch.id}>{branch.name}</option>
      ))}
    </select>
  );
}

export function ExpectedInventoryPage({ role, view }: { role: AppRole; view: InventoryView }) {
  const owner = role === "owner";
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState("");
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

  const isUsage = view === "usage";
  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{isUsage ? "Ingredient Usage" : "Expected Stock"}</h1>
          <p className="text-sm mt-1" style={{ color: "var(--app-text-muted)" }}>
            {isUsage
              ? "Recipe-based ingredient consumption calculated from validated POS sales."
              : "System stock calculated from prior counts, receipts, recipe consumption, and approved adjustments."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <BranchScope owner={owner} branches={branches} branchId={branchId} onChange={setBranchId} />
          <input type="date" value={countDate} onChange={(event) => setCountDate(event.target.value)}
            className="px-3 py-2.5 rounded-xl border text-sm"
            style={{ borderColor: "var(--app-border)", background: "var(--app-surface)", color: "var(--app-text)" }} />
          <button onClick={() => void load()} className="inline-flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-semibold"
            style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }}>
            <RefreshCw size={14} />Refresh
          </button>
        </div>
      </div>

      <div className="rounded-2xl border overflow-hidden" style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }}>
        {owner && !branchId ? (
          <EmptyModule icon={Search} title="Select a branch" body="Choose a branch to view its inventory calculations." />
        ) : loading ? (
          <div className="p-14 text-center text-sm" style={{ color: "var(--app-text-muted)" }}>Loading inventory calculations...</div>
        ) : error ? (
          <EmptyModule icon={FileWarning} title="Unable to load data" body={error} />
        ) : items.length === 0 ? (
          <EmptyModule icon={ClipboardCheck} title="No calculation records" body="No inventory calculation is available for the selected branch and date." />
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table w-full text-sm">
              <thead style={{ background: "var(--app-bg)" }}>
                <tr>
                  {(isUsage
                    ? ["SKU", "Ingredient", "Previous Actual", "Received", "Expected Usage", "Unit"]
                    : ["SKU", "Ingredient", "Previous Actual", "Received", "Expected Usage", "Adjustments", "Expected Stock", "Unit"]
                  ).map((heading) => <th key={heading} className="px-4 py-3 text-left text-xs whitespace-nowrap" style={{ color: "var(--app-text-muted)" }}>{heading}</th>)}
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.inventoryItemId} className="border-t" style={{ borderColor: "var(--app-border)" }}>
                    <td className="px-4 py-3 font-mono text-xs" style={{ color: "var(--app-primary)" }}>{item.sku}</td>
                    <td className="px-4 py-3 font-semibold">{item.itemName}</td>
                    <td className="px-4 py-3">{number(item.previousActualQuantity)}</td>
                    <td className="px-4 py-3">{number(item.stockReceived)}</td>
                    <td className="px-4 py-3 font-semibold" style={{ color: "var(--app-primary)" }}>{number(item.expectedConsumption)}</td>
                    {!isUsage && <td className="px-4 py-3">{number(item.approvedAdjustments)}</td>}
                    {!isUsage && <td className="px-4 py-3 font-bold">{number(item.expectedQuantity)}</td>}
                    <td className="px-4 py-3" style={{ color: "var(--app-text-muted)" }}>{item.unit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export function PhysicalCountHistoryPage({ role }: { role: AppRole }) {
  const owner = role === "owner";
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState("");
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
  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return counts.filter((item) => !query || [item.countNo, item.branchName, item.submittedBy, item.countDate].some((value) => value.toLowerCase().includes(query)));
  }, [counts, search]);

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
        <div><h1 className="text-2xl font-bold">Physical Count History</h1><p className="text-sm mt-1" style={{ color: "var(--app-text-muted)" }}>Recorded counts and the number of discrepancies detected during reconciliation.</p></div>
        <div className="flex flex-wrap gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--app-text-faint)" }} />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search count records..."
              className="pl-9 pr-3 py-2.5 rounded-xl border text-sm"
              style={{ borderColor: "var(--app-border)", background: "var(--app-surface)", color: "var(--app-text)" }} />
          </div>
          <BranchScope owner={owner} branches={branches} branchId={branchId} onChange={setBranchId} />
          <button onClick={() => void load()} className="inline-flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-semibold"
            style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }}><RefreshCw size={14} />Refresh</button>
        </div>
      </div>
      <div className="rounded-2xl border overflow-hidden" style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }}>
        {loading ? <div className="p-14 text-center text-sm" style={{ color: "var(--app-text-muted)" }}>Loading physical-count history...</div>
          : error ? <EmptyModule icon={FileWarning} title="Unable to load records" body={error} />
          : visible.length === 0 ? <EmptyModule icon={ClipboardCheck} title="No physical counts found" body="No count records match the selected scope." />
          : <div className="overflow-x-auto"><table className="data-table w-full text-sm">
            <thead style={{ background: "var(--app-bg)" }}><tr>{["Count No.", "Count Date", ...(owner ? ["Branch"] : []), "Recorded By", "Items Counted", "Variances", "Submitted"].map((heading) => <th key={heading} className="px-4 py-3 text-left text-xs whitespace-nowrap" style={{ color: "var(--app-text-muted)" }}>{heading}</th>)}</tr></thead>
            <tbody>{visible.map((item) => <tr key={item.id} className="border-t" style={{ borderColor: "var(--app-border)" }}>
              <td className="px-4 py-3 font-mono text-xs" style={{ color: "var(--app-primary)" }}>{item.countNo}</td>
              <td className="px-4 py-3">{item.countDate}</td>
              {owner && <td className="px-4 py-3">{item.branchName}</td>}
              <td className="px-4 py-3">{item.submittedBy}</td>
              <td className="px-4 py-3">{item.itemCount}</td>
              <td className="px-4 py-3 font-semibold" style={{ color: item.varianceCount ? "var(--app-danger)" : "var(--app-success)" }}>{item.varianceCount}</td>
              <td className="px-4 py-3 whitespace-nowrap" style={{ color: "var(--app-text-muted)" }}>{dateTime(item.submittedAt)}</td>
            </tr>)}</tbody>
          </table></div>}
      </div>
    </div>
  );
}

function EmptyModule({ icon: Icon, title, body }: { icon: typeof ClipboardCheck; title: string; body: string }) {
  return <div className="flex flex-col items-center justify-center p-12 text-center">
    <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-3" style={{ background: "var(--app-primary-faint)", color: "var(--app-primary)" }}><Icon size={20} /></div>
    <h2 className="font-semibold">{title}</h2>
    <p className="text-sm mt-1 max-w-md leading-relaxed" style={{ color: "var(--app-text-muted)" }}>{body}</p>
  </div>;
}
