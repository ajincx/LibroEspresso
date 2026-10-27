import { useEffect, useState } from "react";
import { Building2, CheckCircle, Plus, RefreshCw, Power, X, Edit2 } from "lucide-react";
import { toast } from "sonner";
import { Btn, KPICard, Select, SkeletonBlock, StatusBadge, TableCard, TableEmptyRow, TableLoadingRow, TableWrapper, TD, THead, TR } from "../../components/ModuleUi";
import { masterDataService } from "../../services/masterData.service";
import type { Branch, RecordStatus } from "../../types/masterData";
import { formatAppDate } from "../../utils/appPreferences";
import { TwoStepDeactivationDialog } from "../../components/TwoStepDeactivationDialog";
import { controlledActionService } from "../../services/controlledAction.service";

const empty = {
  code: "",
  name: "",
  location: "",
  status: "ACTIVE" as RecordStatus,
};
const branchDeactivationReasons=["Branch permanently closed.","Branch temporarily not operating.","Branch relocated.","Branch operations consolidated.","Branch no longer managed by the company.","Other."] as const;

export function BranchManagementPage({
  scopeBranchId = "ALL",
}: {
  scopeBranchId?: string;
}) {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(empty);
  const [editing,setEditing]=useState<Branch|null>(null);
  const [deactivateTarget,setDeactivateTarget]=useState<Branch|null>(null);
  const [controlledBusy,setControlledBusy]=useState(false);
  const visibleBranches =
    scopeBranchId === "ALL"
      ? branches
      : branches.filter((branch) => branch.id === scopeBranchId);

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    setError("");
    try {
      const rows = await masterDataService.branches();
      setBranches(
        scopeBranchId === "ALL"
          ? rows
          : rows.filter((branch) => branch.id === scopeBranchId),
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to load branches",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    const refresh = window.setInterval(() => void load(true), 10_000);
    const onFocus = () => void load(true);
    const channel =
      "BroadcastChannel" in window
        ? new BroadcastChannel("libro-master-data")
        : null;
    if (channel)
      channel.onmessage = (event) => {
        if (event.data?.type === "user-status-updated") void load(true);
      };
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(refresh);
      window.removeEventListener("focus", onFocus);
      channel?.close();
    };
  }, [scopeBranchId]);

  const save = async () => {
    if (!form.code.trim() || !form.name.trim() || !form.location.trim())
      return toast.error("Complete the branch code, name, and location.");
    setSaving(true);
    try {
      const input={
        ...form,
        code: form.code.trim(),
        name: form.name.trim(),
        location: form.location.trim(),
      };
      if(editing) await masterDataService.updateBranch(editing.id,input); else await masterDataService.createBranch(input);
      setOpen(false);
      setEditing(null);
      setForm(empty);
      toast.success(editing?"Branch updated":"Branch created");
      await load(true);
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : `Unable to ${editing?"update":"create"} branch`,
      );
    } finally {
      setSaving(false);
    }
  };
  const deactivate=async(reason:string)=>{if(!deactivateTarget)return;setControlledBusy(true);try{await controlledActionService.deactivateBranch(deactivateTarget.id,{reason});toast.success("Branch deactivated; operational history was preserved");setDeactivateTarget(null);await load(true);}catch(cause){toast.error(cause instanceof Error?cause.message:"Unable to deactivate branch");}finally{setControlledBusy(false);}};

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Branch Management</h1>
          <p className="text-sm mt-1 text-[var(--app-text-muted)]">
            Manage branches and review their assigned Manager account status.
          </p>
        </div>
        <button
          onClick={() => {setEditing(null);setForm(empty);setOpen(true);}}
          className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-[var(--app-primary)]"
        >
          <Plus size={15} />
          Add Branch
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <KPICard
          loading={loading}
          label={scopeBranchId === "ALL" ? "Total Branches" : "Selected Branch"}
          value={String(visibleBranches.length)}
          icon={Building2}
          color="var(--app-primary)"
        />
        <KPICard
          loading={loading}
          label="Active Branches"
          value={`${visibleBranches.filter((branch) => branch.status === "ACTIVE").length} of ${visibleBranches.length}`}
          icon={CheckCircle}
          color="var(--app-success)"
        />
      </div>

      <TableCard
        title="Branch Locations"
        subtitle="Manage branches and review their assigned Manager account status"
        badge={loading ? <SkeletonBlock w={74} h={22} className="rounded-full"/> : error ? undefined :
          <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-[var(--app-primary-faint)] text-[var(--app-primary)]">
            {visibleBranches.length} branches
          </span>
        }
      >
        <TableWrapper minWidth={880}>
          <THead
            cols={[
              "Code",
              "Branch",
              "Location",
              "Assigned Manager",
              "Manager Account",
              "Branch Status",
              "Last Updated",
              "Action",
            ]}
          />
          <tbody>
            {loading && <TableLoadingRow colSpan={8} label="Loading branches…" />}
            {!loading && error && (
              <TableEmptyRow
                colSpan={8}
                title="Unable to load branches"
                subtitle={error}
              />
            )}
            {!loading && !error && visibleBranches.length === 0 && (
              <TableEmptyRow
                colSpan={8}
                title="No branches found"
                subtitle="No branch records available in the system."
              />
            )}
            {!loading &&
              !error &&
              visibleBranches.map((branch) => (
                <TR key={branch.id}>
                  <TD mono muted>{branch.code}</TD>
                  <TD><span className="font-semibold text-[var(--app-text)]">{branch.name}</span></TD>
                  <TD muted>{branch.location}</TD>
                  <TD>{branch.manager ?? <span className="text-[var(--app-text-muted)]">Unassigned</span>}</TD>
                  <TD center>
                    {branch.managerStatus ? (
                      <StatusBadge status={branch.managerStatus.toLowerCase()} />
                    ) : (
                      <span className="text-xs text-[var(--app-text-muted)]">NO MANAGER</span>
                    )}
                  </TD>
                  <TD center>
                    <StatusBadge status={branch.status.toLowerCase()} />
                  </TD>
                  <TD muted className="text-xs">
                    <span className="block whitespace-nowrap font-medium text-[var(--app-text)]">
                      {formatAppDate(branch.lastActivityAt, true)}
                    </span>
                    <span className="mt-0.5 block max-w-56 text-[var(--app-text-faint)] truncate">
                      {branch.lastActivityDescription}
                    </span>
                  </TD>
                  <TD center><div className="flex justify-center gap-2"><Btn variant="outline" size="sm" icon={Edit2} onClick={()=>{setEditing(branch);setForm({code:branch.code,name:branch.name,location:branch.location,status:branch.status});setOpen(true);}}>Edit</Btn>{branch.status==="ACTIVE"?<Btn variant="outline" size="sm" icon={Power} onClick={()=>setDeactivateTarget(branch)}>Deactivate</Btn>:null}</div></TD>
                </TR>
              ))}
          </tbody>
        </TableWrapper>
      </TableCard>
      {deactivateTarget&&<TwoStepDeactivationDialog message="Are you sure you want to deactivate this branch?" reasons={branchDeactivationReasons} busy={controlledBusy} onCancel={()=>setDeactivateTarget(null)} onConfirm={reason=>void deactivate(reason)}/>}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45" onMouseDown={(event)=>{if(event.target===event.currentTarget)setOpen(false);}}>
          <div role="dialog" aria-modal="true" aria-labelledby="add-branch-title" className="rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto p-6 bg-[var(--app-surface)] border border-[var(--app-border)]">
            <div className="flex justify-between mb-5">
              <div>
                <h2 id="add-branch-title" className="font-bold text-lg">{editing?"Edit Branch":"Add Branch"}</h2>
                <p className="text-xs mt-1 text-[var(--app-text-muted)]">
                  {editing?"Update branch details without changing historical links.":"Create a new Libro Espresso location."}
                </p>
              </div>
              <button
                aria-label="Close branch form"
                onClick={() => setOpen(false)}
                className="w-9 h-9 rounded-xl bg-[var(--app-surface-muted)] flex items-center justify-center"
              >
                <X size={18} />
              </button>
            </div>
            <div className="space-y-4">
              {(["code", "name", "location"] as const).map((key) => (
                <label key={key} className="text-sm block font-medium">
                  {key === "code"
                    ? "Branch Code"
                    : key === "name"
                      ? "Branch Name"
                      : "Location"}
                  <input
                    value={form[key]}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        [key]: event.target.value,
                      }))
                    }
                    className="mt-1.5 w-full px-3 py-2.5 rounded-xl border bg-[var(--app-surface-elevated)] border-[var(--app-border)] outline-none focus:border-[var(--app-primary)] focus:ring-4 focus:ring-[var(--app-primary-faint)]"
                  />
                </label>
              ))}
              <label className="text-sm block font-medium">
                Branch Status
                <Select
                  className="mt-1.5 w-full"
                  value={form.status}
                  onChange={(value) =>
                    setForm((current) => ({
                      ...current,
                      status: value as RecordStatus,
                    }))
                  }
                  options={[
                    { value: "ACTIVE", label: "Active" },
                    { value: "INACTIVE", label: "Inactive" },
                  ]}
                />
              </label>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setOpen(false)}
                className="flex-1 py-2.5 rounded-xl border border-[var(--app-border)]"
              >
                Cancel
              </button>
              <button
                disabled={saving}
                onClick={() => void save()}
                className="flex-1 py-2.5 rounded-xl text-white font-semibold bg-[var(--app-primary)] disabled:opacity-60"
              >
                {saving ? "Saving…" : editing?"Save Changes":"Create Branch"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
