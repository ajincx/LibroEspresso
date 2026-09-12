import { useEffect, useMemo, useState } from "react";
import {
  Building2,
  CheckCircle,
  Edit2,
  Eye,
  EyeOff,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../../contexts/AuthContext";
import { masterDataService } from "../../services/masterData.service";
import type { Branch, ManagedUser, RecordStatus } from "../../types/masterData";
import { formatAppDate } from "../../utils/appPreferences";
import { Btn, KPICard, Select, StatusBadge, TableCard, TableEmptyRow, TableLoadingRow, TableWrapper, TD, THead, TR } from "../../components/ModuleUi";

type UserRole = "OWNER" | "BRANCH_MANAGER" | "STAFF";
type UserForm = {
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  phoneNumber: string;
  position: string;
  password: string;
  confirmPassword: string;
  role: UserRole;
  branchId: string;
  status: RecordStatus;
};

const emptyForm: UserForm = {
  firstName: "",
  lastName: "",
  username: "",
  email: "",
  phoneNumber: "",
  position: "Branch Manager",
  password: "",
  confirmPassword: "",
  role: "BRANCH_MANAGER",
  branchId: "",
  status: "ACTIVE",
};
const inputClass =
  "mt-1.5 w-full rounded-xl border px-3 py-2.5 text-sm outline-none bg-[var(--app-surface)] text-[var(--app-text)] border-[var(--app-border)] focus:border-[var(--app-primary)] focus:ring-4 focus:ring-[var(--app-primary-faint)] disabled:bg-[var(--app-surface-muted)] disabled:cursor-not-allowed";

function message(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function UserManagementPage({
  scopeBranchId = "ALL",
}: {
  scopeBranchId?: string;
}) {
  const { user: currentUser, refreshUser } = useAuth();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<ManagedUser | null>(null);
  const [form, setForm] = useState<UserForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [branchFilter, setBranchFilter] = useState("ALL");
  const [roleFilter, setRoleFilter] = useState("ALL");

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    setError("");
    try {
      const [userRows, branchRows] = await Promise.all([
        masterDataService.users(),
        masterDataService.branches(),
      ]);
      setUsers(userRows);
      setBranches(branchRows);
    } catch (reason) {
      setError(message(reason, "Unable to load users"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    const refresh = window.setInterval(() => void load(true), 10_000);
    const onFocus = () => void load(true);
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(refresh);
      window.removeEventListener("focus", onFocus);
    };
  }, []);
  useEffect(() => {
    setBranchFilter(scopeBranchId);
  }, [scopeBranchId]);
  const activeBranches = branches.filter(
    (branch) => branch.status === "ACTIVE",
  );
  const counts = useMemo(
    () => ({
      active: users.filter((item) => item.status === "ACTIVE").length,
      managers: users.filter((item) => item.role === "BRANCH_MANAGER").length,
      staff: users.filter((item) => item.role === "STAFF").length,
    }),
    [users],
  );
  const visibleUsers = useMemo(
    () =>
      users.filter((item) => {
        const branchMatches =
          branchFilter === "ALL" ||
          (branchFilter === "UNASSIGNED"
            ? item.branchId === null
            : item.branchId === branchFilter);
        const roleMatches = roleFilter === "ALL" || item.role === roleFilter;
        return branchMatches && roleMatches;
      }),
    [users, branchFilter, roleFilter],
  );

  const changeRole = (role: UserRole) =>
    setForm((current) => {
      const defaults = [
        "Owner / System Administrator",
        "Branch Manager",
        "Staff",
      ];
      const position = defaults.includes(current.position)
        ? role === "OWNER"
          ? defaults[0]
          : role === "BRANCH_MANAGER"
            ? defaults[1]
            : defaults[2]
        : current.position;
      return {
        ...current,
        role,
        branchId: role === "OWNER" ? "" : current.branchId,
        position,
      };
    });

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setShowPassword(false);
    setCreateOpen(true);
  };
  const openEdit = (selected: ManagedUser) => {
    setCreateOpen(false);
    setEditing(selected);
    setShowPassword(false);
    setForm({
      firstName: selected.firstName,
      lastName: selected.lastName,
      username: selected.username,
      email: selected.email,
      phoneNumber: selected.phoneNumber ?? "",
      position: selected.position,
      password: "",
      confirmPassword: "",
      role: selected.role,
      branchId: selected.branchId ?? "",
      status: selected.status,
    });
  };
  const closeModal = () => {
    setCreateOpen(false);
    setEditing(null);
    setForm(emptyForm);
    setShowPassword(false);
  };

  const validate = (creating: boolean) => {
    if (
      !form.firstName.trim() ||
      !form.lastName.trim() ||
      !form.username.trim() ||
      !form.email.trim()
    )
      return "Complete all required account fields";
    if (creating && form.password.length < 10)
      return "Temporary password must be at least 10 characters";
    if (!creating && form.password && form.password.length < 10)
      return "New password must be at least 10 characters";
    if (form.password !== form.confirmPassword)
      return "New password and confirmation do not match";
    if (form.role !== "OWNER" && !form.branchId)
      return "Select an assigned branch for the Manager or Staff account";
    if (form.position.trim().length < 2)
      return "Position must contain at least 2 characters";
    return "";
  };

  const save = async () => {
    const validation = validate(!editing);
    if (validation) return toast.error(validation);
    setSaving(true);
    try {
      const branchId = form.role === "OWNER" ? null : form.branchId;
      if (editing) {
        await masterDataService.updateUser(editing.id, {
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          username: form.username.trim(),
          email: form.email.trim(),
          phoneNumber: form.phoneNumber.trim() || null,
          position: form.position.trim(),
          role: form.role,
          branchId,
          ...(form.password ? { password: form.password } : {}),
        });
        if (editing.id === currentUser?.id) await refreshUser();
        toast.success("User account updated");
      } else {
        await masterDataService.createUser({
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          username: form.username.trim(),
          email: form.email.trim(),
          phoneNumber: form.phoneNumber.trim() || null,
          position: form.position.trim(),
          password: form.password,
          role: form.role,
          branchId,
          status: form.status,
        });
        toast.success("User account created");
      }
      closeModal();
      await load();
    } catch (reason) {
      toast.error(
        message(
          reason,
          editing ? "Unable to update user" : "Unable to create user",
        ),
      );
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (selected: ManagedUser) => {
    try {
      await masterDataService.setUserStatus(
        selected.id,
        selected.status === "ACTIVE" ? "INACTIVE" : "ACTIVE",
      );
      toast.success("User status updated");
      await load(true);
      if ("BroadcastChannel" in window) {
        const channel = new BroadcastChannel("libro-master-data");
        channel.postMessage({
          type: "user-status-updated",
          userId: selected.id,
        });
        channel.close();
      }
    } catch (reason) {
      toast.error(message(reason, "Unable to update user status"));
    }
  };

  const deleteAccount = async (selected: ManagedUser) => {
    if (
      !window.confirm(
        `Delete ${selected.firstName} ${selected.lastName}'s account? Historical records will be retained for audit purposes.`,
      )
    )
      return;
    try {
      await masterDataService.deleteUser(selected.id);
      toast.success("User account deleted");
      await load();
    } catch (reason) {
      toast.error(message(reason, "Unable to delete user account"));
    }
  };

  const stats = [
    ["Total Users", users.length, Users, "var(--app-primary)"],
    ["Active", counts.active, CheckCircle, "var(--app-success)"],
    ["Branch Managers", counts.managers, Building2, "var(--app-info)"],
    ["Staff Accounts", counts.staff, Users, "var(--app-warning)"],
  ] as const;
  const modalOpen = createOpen || Boolean(editing);

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--app-text)]">
            User Management
          </h1>
          <p className="text-sm mt-1 text-[var(--app-text-muted)]">
            Manage accounts, credentials, roles, and branch access.
          </p>
        </div>
        <button
          onClick={openCreate}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-[var(--app-primary)]"
        >
          <Plus size={15} />
          Add User
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {stats.map(([label, value, Icon, color]) => (
          <KPICard
            key={label}
            label={label}
            value={String(value)}
            icon={Icon}
            color={color}
          />
        ))}
      </div>

      <TableCard
        title="User Accounts"
        subtitle="Manage accounts, credentials, roles, and branch access"
        badge={
          <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-[var(--app-primary-faint)] text-[var(--app-primary)]">
            {visibleUsers.length} users
          </span>
        }
        toolbar={
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end w-full">
            <label className="min-w-0 flex-1 text-xs font-semibold text-[var(--app-text-muted)]">
              Branch
              <Select
                className="mt-1.5 w-full"
                value={branchFilter}
                onChange={setBranchFilter}
                options={[
                  { value: "ALL", label: "All Branches" },
                  { value: "UNASSIGNED", label: "Owner / All-Branch Accounts" },
                  ...branches.map((branch) => ({
                    value: branch.id,
                    label: branch.name,
                  })),
                ]}
              />
            </label>
            <label className="min-w-0 flex-1 text-xs font-semibold text-[var(--app-text-muted)]">
              Role
              <Select
                className="mt-1.5 w-full"
                value={roleFilter}
                onChange={setRoleFilter}
                options={[
                  { value: "ALL", label: "All Roles" },
                  { value: "OWNER", label: "Owner" },
                  { value: "BRANCH_MANAGER", label: "Branch Manager" },
                  { value: "STAFF", label: "Staff" },
                ]}
              />
            </label>
            {(branchFilter !== "ALL" || roleFilter !== "ALL") && (
              <Btn
                variant="outline"
                onClick={() => {
                  setBranchFilter("ALL");
                  setRoleFilter("ALL");
                }}
              >
                Reset Filters
              </Btn>
            )}
          </div>
        }
      >
        <TableWrapper minWidth={940}>
          <THead
            cols={[
              "User",
              "Email",
              "Phone Number",
              "Role & Position",
              "Assigned Branch",
              "Status",
              "Last Updated",
              "Actions",
            ]}
          />
          <tbody>
            {loading && <TableLoadingRow colSpan={8} label="Loading users…" />}
            {!loading && error && (
              <TableEmptyRow
                colSpan={8}
                title="Unable to load users"
                subtitle={error}
              />
            )}
            {!loading && !error && visibleUsers.length === 0 && (
              <TableEmptyRow
                colSpan={8}
                title="No user accounts found"
                subtitle="No user accounts match the selected filters."
              />
            )}
            {!loading &&
              !error &&
              visibleUsers.map((selected) => (
                <TR key={selected.id}>
                  <TD>
                    <div className="font-semibold text-[var(--app-text)]">
                      {selected.firstName} {selected.lastName}
                    </div>
                    <div className="text-xs font-normal text-[var(--app-text-muted)]">
                      @{selected.username}
                    </div>
                  </TD>
                  <TD muted>{selected.email}</TD>
                  <TD muted className="whitespace-nowrap">
                    {selected.phoneNumber || "Not provided"}
                  </TD>
                  <TD>
                    <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-[var(--app-primary-faint)] text-[var(--app-primary)]">
                      {selected.role === "OWNER"
                        ? "Owner"
                        : selected.role === "BRANCH_MANAGER"
                          ? "Branch Manager"
                          : "Staff"}
                    </span>
                    <div className="text-xs mt-1 text-[var(--app-text-muted)]">
                      {selected.position}
                    </div>
                  </TD>
                  <TD muted>{selected.branchName ?? "All Branches"}</TD>
                  <TD center>
                    <StatusBadge status={selected.status.toLowerCase()} />
                  </TD>
                  <TD muted className="text-xs">
                    <span className="block whitespace-nowrap font-medium text-[var(--app-text)]">
                      {formatAppDate(selected.lastActivityAt, true)}
                    </span>
                    <span className="mt-0.5 block max-w-56 text-[var(--app-text-faint)] truncate">
                      {selected.lastActivityDescription}
                    </span>
                  </TD>
                  <TD center>
                    <div className="flex items-center justify-center gap-1.5 whitespace-nowrap">
                      <Btn
                        variant="outline"
                        size="sm"
                        icon={Edit2}
                        onClick={() => openEdit(selected)}
                      >
                        Edit
                      </Btn>
                      <Btn
                        variant="outline"
                        size="sm"
                        disabled={selected.id === currentUser?.id}
                        onClick={() => void toggleStatus(selected)}
                      >
                        {selected.status === "ACTIVE" ? "Deactivate" : "Activate"}
                      </Btn>
                      <button
                        onClick={() => void deleteAccount(selected)}
                        disabled={selected.id === currentUser?.id}
                        title="Delete account while retaining audit records"
                        className="w-8 h-8 inline-flex items-center justify-center rounded-lg border text-[var(--app-danger)] border-[var(--app-border)] hover:bg-[var(--app-danger-bg)] transition-colors disabled:opacity-40"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </TD>
                </TR>
              ))}
          </tbody>
        </TableWrapper>
      </TableCard>

      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,.48)" }}
        >
          <div className="w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-2xl shadow-2xl p-5 sm:p-6 bg-[var(--app-surface)] border border-[var(--app-border)]">
            <div className="flex items-start justify-between mb-5">
              <div>
                <h2 className="font-bold text-lg text-[var(--app-text)]">
                  {editing ? "Edit User Account" : "Add New User"}
                </h2>
                <p className="text-xs mt-1 text-[var(--app-text-muted)]">
                  {editing
                    ? "Update account details, credentials, role, and assigned branch."
                    : "Create a secure account and assign its access scope."}
                </p>
              </div>
              <button
                onClick={closeModal}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--app-text-muted)] bg-[var(--app-surface-muted)]"
              >
                <X size={16} />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="text-sm font-medium text-[var(--app-text)]">
                First Name *
                <input
                  value={form.firstName}
                  onChange={(e) =>
                    setForm((current) => ({
                      ...current,
                      firstName: e.target.value,
                    }))
                  }
                  className={inputClass}
                />
              </label>
              <label className="text-sm font-medium text-[var(--app-text)]">
                Last Name *
                <input
                  value={form.lastName}
                  onChange={(e) =>
                    setForm((current) => ({
                      ...current,
                      lastName: e.target.value,
                    }))
                  }
                  className={inputClass}
                />
              </label>
              <label className="text-sm font-medium text-[var(--app-text)]">
                Username *
                <input
                  value={form.username}
                  onChange={(e) =>
                    setForm((current) => ({
                      ...current,
                      username: e.target.value,
                    }))
                  }
                  className={inputClass}
                />
              </label>
              <label className="text-sm font-medium text-[var(--app-text)]">
                Email *
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) =>
                    setForm((current) => ({
                      ...current,
                      email: e.target.value,
                    }))
                  }
                  className={inputClass}
                />
              </label>
              <label className="text-sm font-medium text-[var(--app-text)]">
                Phone Number
                <input
                  type="tel"
                  value={form.phoneNumber}
                  onChange={(e) =>
                    setForm((current) => ({
                      ...current,
                      phoneNumber: e.target.value,
                    }))
                  }
                  className={inputClass}
                />
              </label>
              <label className="text-sm font-medium text-[var(--app-text)]">
                Position *
                <input
                  value={form.position}
                  onChange={(e) =>
                    setForm((current) => ({
                      ...current,
                      position: e.target.value,
                    }))
                  }
                  className={inputClass}
                />
              </label>
              <label className="text-sm font-medium text-[var(--app-text)]">
                Role *
                <Select
                  className="mt-1.5 w-full"
                  value={form.role}
                  disabled={editing?.id === currentUser?.id}
                  onChange={(value) => changeRole(value as UserRole)}
                  options={[
                    { value: "STAFF", label: "Staff" },
                    { value: "BRANCH_MANAGER", label: "Branch Manager" },
                    { value: "OWNER", label: "Owner" },
                  ]}
                />
                {editing?.id === currentUser?.id && (
                  <span className="block text-xs mt-1 text-[var(--app-text-faint)]">
                    You cannot remove your own Owner access.
                  </span>
                )}
              </label>
              <label className="text-sm font-medium text-[var(--app-text)]">
                Assigned Branch {form.role !== "OWNER" ? "*" : ""}
                <Select
                  className="mt-1.5 w-full"
                  value={form.branchId}
                  disabled={form.role === "OWNER"}
                  onChange={(value) =>
                    setForm((current) => ({ ...current, branchId: value }))
                  }
                  options={[
                    {
                      value: "",
                      label:
                        form.role === "OWNER"
                          ? "All Branches"
                          : "Select branch...",
                    },
                    ...activeBranches.map((branch) => ({
                      value: branch.id,
                      label: branch.name,
                    })),
                  ]}
                />
              </label>
              {editing && (
                <label className="text-sm font-medium text-[var(--app-text)] sm:col-span-2">
                  Current Saved Password
                  <input
                    type="password"
                    value="securely-hashed"
                    disabled
                    readOnly
                    aria-label="Current password is securely hashed and cannot be revealed"
                    className={inputClass}
                  />
                  <span className="block text-xs mt-1 text-[var(--app-text-faint)]">
                    The saved password is securely hashed and cannot be viewed
                    or recovered.
                  </span>
                </label>
              )}
              <label className="text-sm font-medium text-[var(--app-text)]">
                {editing ? "New Password (optional)" : "Temporary Password *"}
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={form.password}
                    onChange={(e) =>
                      setForm((current) => ({
                        ...current,
                        password: e.target.value,
                      }))
                    }
                    autoComplete="new-password"
                    placeholder={
                      editing
                        ? "Blank keeps current password"
                        : "At least 10 characters"
                    }
                    className={`${inputClass} pr-11`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((current) => !current)}
                    className="absolute right-3 top-[22px] text-[var(--app-text-faint)]"
                    aria-label={
                      showPassword ? "Hide new passwords" : "Show new passwords"
                    }
                  >
                    {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
              </label>
              <label className="text-sm font-medium text-[var(--app-text)]">
                {editing
                  ? "Confirm New Password"
                  : "Confirm Temporary Password *"}
                <input
                  type={showPassword ? "text" : "password"}
                  value={form.confirmPassword}
                  onChange={(e) =>
                    setForm((current) => ({
                      ...current,
                      confirmPassword: e.target.value,
                    }))
                  }
                  autoComplete="new-password"
                  placeholder={
                    editing
                      ? "Repeat the new password"
                      : "Repeat the temporary password"
                  }
                  className={inputClass}
                />
                {editing && (
                  <span className="block text-xs mt-1 text-[var(--app-text-faint)]">
                    Leave both new-password fields blank to keep the current
                    password.
                  </span>
                )}
              </label>
            </div>
            <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 mt-6">
              <button
                onClick={closeModal}
                className="px-4 py-2.5 rounded-xl border text-sm font-semibold text-[var(--app-text-muted)] border-[var(--app-border)]"
              >
                Cancel
              </button>
              <button
                disabled={saving}
                onClick={() => void save()}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-[var(--app-primary)] disabled:opacity-60"
              >
                <Save size={15} />
                {saving
                  ? "Saving..."
                  : editing
                    ? "Save User Changes"
                    : "Create User"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
