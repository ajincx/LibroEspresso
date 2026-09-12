import { useEffect, useState } from "react";
import { Building2, CheckCircle, Plus, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";
import { Btn, KPICard, Select, StatusBadge, TableCard, TableEmptyRow, TableLoadingRow, TableWrapper, TD, THead, TR } from "../../components/ModuleUi";
import { masterDataService } from "../../services/masterData.service";
import type { Branch, RecordStatus } from "../../types/masterData";
import { formatAppDate } from "../../utils/appPreferences";

const empty = {
  code: "",
  name: "",
  location: "",
  status: "ACTIVE" as RecordStatus,
};

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

  const create = async () => {
    if (!form.code.trim() || !form.name.trim() || !form.location.trim())
      return toast.error("Complete the branch code, name, and location.");
    setSaving(true);
    try {
      await masterDataService.createBranch({
        ...form,
        code: form.code.trim(),
        name: form.name.trim(),
        location: form.location.trim(),
      });
      setOpen(false);
      setForm(empty);
      toast.success("Branch created");
      await load(true);
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : "Unable to create branch",
      );
    } finally {
      setSaving(false);
    }
  };

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
          onClick={() => setOpen(true)}
          className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-[var(--app-primary)]"
        >
          <Plus size={15} />
          Add Branch
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <KPICard
          label={scopeBranchId === "ALL" ? "Total Branches" : "Selected Branch"}
          value={String(visibleBranches.length)}
          icon={Building2}
          color="var(--app-primary)"
        />
        <KPICard
          label="Active Branches"
          value={`${visibleBranches.filter((branch) => branch.status === "ACTIVE").length} of ${visibleBranches.length}`}
          icon={CheckCircle}
          color="var(--app-success)"
        />
      </div>

      <TableCard
        title="Branch Locations"
        subtitle="Manage branches and review their assigned Manager account status"
        badge={
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
            ]}
          />
          <tbody>
            {loading && <TableLoadingRow colSpan={7} label="Loading branches…" />}
            {!loading && error && (
              <TableEmptyRow
                colSpan={7}
                title="Unable to load branches"
                subtitle={error}
              />
            )}
            {!loading && !error && visibleBranches.length === 0 && (
              <TableEmptyRow
                colSpan={7}
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
                </TR>
              ))}
          </tbody>
        </TableWrapper>
      </TableCard>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45">
          <div className="rounded-2xl shadow-2xl w-full max-w-md p-6 bg-[var(--app-surface)] border border-[var(--app-border)]">
            <div className="flex justify-between mb-5">
              <div>
                <h2 className="font-bold text-lg">Add Branch</h2>
                <p className="text-xs mt-1 text-[var(--app-text-muted)]">
                  Create a new Libro Espresso location.
                </p>
              </div>
              <button
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
                onClick={() => void create()}
                className="flex-1 py-2.5 rounded-xl text-white font-semibold bg-[var(--app-primary)] disabled:opacity-60"
              >
                {saving ? "Creating…" : "Create Branch"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
