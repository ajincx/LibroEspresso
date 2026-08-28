import { useEffect, useMemo, useState } from "react";
import { Building2, CheckCircle, Edit2, Eye, EyeOff, Plus, RefreshCw, Save, Users, X, XCircle } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../../contexts/AuthContext";
import { masterDataService } from "../../services/masterData.service";
import type { Branch, ManagedUser, RecordStatus } from "../../types/masterData";

type UserRole = "OWNER" | "BRANCH_MANAGER";
type UserForm = {
  firstName: string; lastName: string; username: string; email: string; phoneNumber: string;
  position: string; password: string; confirmPassword: string; role: UserRole; branchId: string; status: RecordStatus;
};

const emptyForm: UserForm = { firstName: "", lastName: "", username: "", email: "", phoneNumber: "", position: "Branch Manager", password: "", confirmPassword: "", role: "BRANCH_MANAGER", branchId: "", status: "ACTIVE" };
const inputClass = "mt-1.5 w-full rounded-xl border px-3 py-2.5 text-sm outline-none bg-[var(--app-surface)] text-[var(--app-text)] border-[var(--app-border)] focus:border-[var(--app-primary)] focus:ring-4 focus:ring-[var(--app-primary-faint)] disabled:bg-[var(--app-surface-muted)] disabled:cursor-not-allowed";

function message(error: unknown, fallback: string) { return error instanceof Error ? error.message : fallback; }

export function AdminUsersPage() {
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

  const load = async () => {
    setLoading(true); setError("");
    try {
      const [userRows, branchRows] = await Promise.all([masterDataService.users(), masterDataService.branches()]);
      setUsers(userRows); setBranches(branchRows);
    } catch (reason) { setError(message(reason, "Unable to load users")); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);
  const activeBranches = branches.filter(branch => branch.status === "ACTIVE");
  const counts = useMemo(() => ({ active: users.filter(item => item.status === "ACTIVE").length, managers: users.filter(item => item.role === "BRANCH_MANAGER").length }), [users]);

  const changeRole = (role: UserRole) => setForm(current => ({ ...current, role, branchId: role === "OWNER" ? "" : current.branchId, position: role === "OWNER" && current.position === "Branch Manager" ? "Owner / System Administrator" : role === "BRANCH_MANAGER" && current.position === "Owner / System Administrator" ? "Branch Manager" : current.position }));

  const openCreate = () => { setEditing(null); setForm(emptyForm); setShowPassword(false); setCreateOpen(true); };
  const openEdit = (selected: ManagedUser) => {
    setCreateOpen(false); setEditing(selected); setShowPassword(false);
    setForm({ firstName: selected.firstName, lastName: selected.lastName, username: selected.username, email: selected.email, phoneNumber: selected.phoneNumber ?? "", position: selected.position, password: "", confirmPassword: "", role: selected.role, branchId: selected.branchId ?? "", status: selected.status });
  };
  const closeModal = () => { setCreateOpen(false); setEditing(null); setForm(emptyForm); setShowPassword(false); };

  const validate = (creating: boolean) => {
    if (!form.firstName.trim() || !form.lastName.trim() || !form.username.trim() || !form.email.trim()) return "Complete all required account fields";
    if (creating && form.password.length < 10) return "Temporary password must be at least 10 characters";
    if (!creating && form.password && form.password.length < 10) return "New password must be at least 10 characters";
    if (form.password !== form.confirmPassword) return "New password and confirmation do not match";
    if (form.role === "BRANCH_MANAGER" && !form.branchId) return "Select an assigned branch for the Branch Manager";
    if (form.position.trim().length < 2) return "Position must contain at least 2 characters";
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
          firstName: form.firstName.trim(), lastName: form.lastName.trim(), username: form.username.trim(),
          email: form.email.trim(), phoneNumber: form.phoneNumber.trim() || null, position: form.position.trim(),
          role: form.role, branchId, ...(form.password ? { password: form.password } : {}),
        });
        if (editing.id === currentUser?.id) await refreshUser();
        toast.success("User account updated");
      } else {
        await masterDataService.createUser({
          firstName: form.firstName.trim(), lastName: form.lastName.trim(), username: form.username.trim(),
          email: form.email.trim(), phoneNumber: form.phoneNumber.trim() || null, position: form.position.trim(),
          password: form.password, role: form.role, branchId, status: form.status,
        });
        toast.success("User account created");
      }
      closeModal(); await load();
    } catch (reason) { toast.error(message(reason, editing ? "Unable to update user" : "Unable to create user")); }
    finally { setSaving(false); }
  };

  const toggleStatus = async (selected: ManagedUser) => {
    try { await masterDataService.setUserStatus(selected.id, selected.status === "ACTIVE" ? "INACTIVE" : "ACTIVE"); toast.success("User status updated"); await load(); }
    catch (reason) { toast.error(message(reason, "Unable to update user status")); }
  };

  const stats = [["Total Users", users.length, Users, "var(--app-primary)"], ["Active", counts.active, CheckCircle, "var(--app-success)"], ["Inactive", users.length - counts.active, XCircle, "var(--app-text-faint)"], ["Branch Managers", counts.managers, Building2, "var(--app-info)"]] as const;
  const modalOpen = createOpen || Boolean(editing);

  return <div className="p-4 sm:p-6 space-y-5">
    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3"><div><h1 className="text-2xl font-bold text-[var(--app-text)]">User Management</h1><p className="text-sm mt-1 text-[var(--app-text-muted)]">Manage accounts, credentials, roles, and branch access.</p></div><button onClick={openCreate} className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-[var(--app-primary)]"><Plus size={15}/>Add User</button></div>

    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">{stats.map(([label, value, Icon, color]) => <div key={label} className="rounded-2xl border p-5 bg-[var(--app-surface)] border-[var(--app-border)]"><div className="flex justify-between"><div><p className="text-xs font-semibold text-[var(--app-text-muted)]">{label}</p><p className="text-2xl font-bold mt-2 text-[var(--app-text)]">{value}</p></div><div className="w-10 h-10 rounded-xl flex items-center justify-center bg-[var(--app-surface-muted)]" style={{ color }}><Icon size={18}/></div></div></div>)}</div>

    <div className="rounded-2xl border overflow-hidden bg-[var(--app-surface)] border-[var(--app-border)]">
      {loading ? <div className="p-12 text-center text-sm text-[var(--app-text-muted)]">Loading users...</div> : error ? <div className="p-12 text-center"><p className="text-sm text-[var(--app-danger)] mb-3">{error}</p><button onClick={() => void load()} className="inline-flex gap-2 text-sm font-semibold text-[var(--app-primary)]"><RefreshCw size={14}/>Retry</button></div> : users.length === 0 ? <div className="p-12 text-center text-sm text-[var(--app-text-muted)]">No user accounts found.</div> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="text-left bg-[var(--app-surface-muted)]"><tr>{["User", "Email", "Role & Position", "Assigned Branch", "Status", "Last Login", "Actions"].map(heading => <th className="px-4 py-3 text-xs text-[var(--app-text-muted)]" key={heading}>{heading}</th>)}</tr></thead><tbody>{users.map(selected => <tr key={selected.id} className="border-t border-[var(--app-border)]"><td className="px-4 py-3 font-semibold text-[var(--app-text)]">{selected.firstName} {selected.lastName}<div className="text-xs font-normal text-[var(--app-text-muted)]">@{selected.username}</div></td><td className="px-4 py-3 text-[var(--app-text-muted)]">{selected.email}</td><td className="px-4 py-3"><span className="text-xs font-bold px-2 py-1 rounded-lg bg-[var(--app-primary-subtle)] text-[var(--app-primary)]">{selected.role === "OWNER" ? "Owner" : "Branch Manager"}</span><div className="text-xs mt-1.5 text-[var(--app-text-muted)]">{selected.position}</div></td><td className="px-4 py-3 text-[var(--app-text-muted)]">{selected.branchName ?? "All Branches"}</td><td className="px-4 py-3"><span className="text-xs font-bold" style={{ color: selected.status === "ACTIVE" ? "var(--app-success)" : "var(--app-text-faint)" }}>{selected.status}</span></td><td className="px-4 py-3 text-xs text-[var(--app-text-muted)]">{selected.lastLoginAt ? new Date(selected.lastLoginAt).toLocaleString() : "Never"}</td><td className="px-4 py-3"><div className="flex items-center gap-2"><button onClick={() => openEdit(selected)} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border text-[var(--app-primary)] border-[var(--app-border)]"><Edit2 size={13}/>Edit</button><button onClick={() => void toggleStatus(selected)} disabled={selected.id === currentUser?.id} className="px-2.5 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-40 bg-[var(--app-surface-muted)] text-[var(--app-text-muted)]">{selected.status === "ACTIVE" ? "Deactivate" : "Activate"}</button></div></td></tr>)}</tbody></table></div>}
    </div>

    {modalOpen && <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,.48)" }}><div className="w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-2xl shadow-2xl p-5 sm:p-6 bg-[var(--app-surface)] border border-[var(--app-border)]">
      <div className="flex items-start justify-between mb-5"><div><h2 className="font-bold text-lg text-[var(--app-text)]">{editing ? "Edit User Account" : "Add New User"}</h2><p className="text-xs mt-1 text-[var(--app-text-muted)]">{editing ? "Update account details, credentials, role, and assigned branch." : "Create a secure account and assign its access scope."}</p></div><button onClick={closeModal} className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--app-text-muted)] bg-[var(--app-surface-muted)]"><X size={16}/></button></div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <label className="text-sm font-medium text-[var(--app-text)]">First Name *<input value={form.firstName} onChange={e => setForm(current => ({ ...current, firstName: e.target.value }))} className={inputClass}/></label>
        <label className="text-sm font-medium text-[var(--app-text)]">Last Name *<input value={form.lastName} onChange={e => setForm(current => ({ ...current, lastName: e.target.value }))} className={inputClass}/></label>
        <label className="text-sm font-medium text-[var(--app-text)]">Username *<input value={form.username} onChange={e => setForm(current => ({ ...current, username: e.target.value }))} className={inputClass}/></label>
        <label className="text-sm font-medium text-[var(--app-text)]">Email *<input type="email" value={form.email} onChange={e => setForm(current => ({ ...current, email: e.target.value }))} className={inputClass}/></label>
        <label className="text-sm font-medium text-[var(--app-text)]">Phone Number<input type="tel" value={form.phoneNumber} onChange={e => setForm(current => ({ ...current, phoneNumber: e.target.value }))} className={inputClass}/></label>
        <label className="text-sm font-medium text-[var(--app-text)]">Position *<input value={form.position} onChange={e => setForm(current => ({ ...current, position: e.target.value }))} className={inputClass}/></label>
        <label className="text-sm font-medium text-[var(--app-text)]">Role *<select value={form.role} disabled={editing?.id === currentUser?.id} onChange={e => changeRole(e.target.value as UserRole)} className={inputClass}><option value="BRANCH_MANAGER">Branch Manager</option><option value="OWNER">Owner</option></select>{editing?.id === currentUser?.id && <span className="block text-xs mt-1 text-[var(--app-text-faint)]">You cannot remove your own Owner access.</span>}</label>
        <label className="text-sm font-medium text-[var(--app-text)]">Assigned Branch {form.role === "BRANCH_MANAGER" ? "*" : ""}<select value={form.branchId} disabled={form.role === "OWNER"} onChange={e => setForm(current => ({ ...current, branchId: e.target.value }))} className={inputClass}><option value="">{form.role === "OWNER" ? "All Branches" : "Select branch..."}</option>{activeBranches.map(branch => <option value={branch.id} key={branch.id}>{branch.name}</option>)}</select></label>
        {editing && <label className="text-sm font-medium text-[var(--app-text)] sm:col-span-2">Current Saved Password<input type="password" value="securely-hashed" disabled readOnly aria-label="Current password is securely hashed and cannot be revealed" className={inputClass}/><span className="block text-xs mt-1 text-[var(--app-text-faint)]">The saved password is securely hashed and cannot be viewed or recovered.</span></label>}
        <label className="text-sm font-medium text-[var(--app-text)]">{editing ? "New Password (optional)" : "Temporary Password *"}<div className="relative"><input type={showPassword ? "text" : "password"} value={form.password} onChange={e => setForm(current => ({ ...current, password: e.target.value }))} autoComplete="new-password" placeholder={editing ? "Blank keeps current password" : "At least 10 characters"} className={`${inputClass} pr-11`}/><button type="button" onClick={() => setShowPassword(current => !current)} className="absolute right-3 top-[22px] text-[var(--app-text-faint)]" aria-label={showPassword ? "Hide new passwords" : "Show new passwords"}>{showPassword ? <EyeOff size={17}/> : <Eye size={17}/>}</button></div></label>
        <label className="text-sm font-medium text-[var(--app-text)]">{editing ? "Confirm New Password" : "Confirm Temporary Password *"}<input type={showPassword ? "text" : "password"} value={form.confirmPassword} onChange={e => setForm(current => ({ ...current, confirmPassword: e.target.value }))} autoComplete="new-password" placeholder={editing ? "Repeat the new password" : "Repeat the temporary password"} className={inputClass}/>{editing && <span className="block text-xs mt-1 text-[var(--app-text-faint)]">Leave both new-password fields blank to keep the current password.</span>}</label>
      </div>
      <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 mt-6"><button onClick={closeModal} className="px-4 py-2.5 rounded-xl border text-sm font-semibold text-[var(--app-text-muted)] border-[var(--app-border)]">Cancel</button><button disabled={saving} onClick={() => void save()} className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-[var(--app-primary)] disabled:opacity-60"><Save size={15}/>{saving ? "Saving..." : editing ? "Save User Changes" : "Create User"}</button></div>
    </div></div>}
  </div>;
}
