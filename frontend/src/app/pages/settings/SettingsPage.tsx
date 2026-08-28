import { useEffect, useState } from "react";
import { Bell, Building2, Eye, EyeOff, LockKeyhole, MapPin, MonitorCog, Save, ShieldCheck, SlidersHorizontal, UserRound } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../../contexts/AuthContext";
import { accountService } from "../../services/account.service";

const inputClass = "w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none transition-colors bg-[var(--app-surface)] text-[var(--app-text)] border-[var(--app-border)] focus:border-[var(--app-primary)] focus:ring-4 focus:ring-[var(--app-primary-faint)] disabled:cursor-not-allowed disabled:bg-[var(--app-surface-muted)]";

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

type SettingsSection = "profile" | "security" | "notifications" | "preferences" | "branch" | "business";
const defaultNotifications = { lowStock: true, criticalStock: true, highCogs: false, spoilage: true, variance: true, purchaseOrders: true, ai: false, messages: true };

function Toggle({ checked, onChange, disabled = false }: { checked: boolean; onChange: () => void; disabled?: boolean }) {
  return <button type="button" disabled={disabled} onClick={onChange} className="w-11 h-6 rounded-full p-0.5 transition-colors disabled:opacity-60" style={{ background: checked ? "var(--app-primary)" : "var(--app-surface-muted)" }} aria-pressed={checked}><span className="block w-5 h-5 rounded-full bg-white shadow-sm transition-transform" style={{ transform: checked ? "translateX(20px)" : "translateX(0)" }}/></button>;
}

export function SettingsPage() {
  const { user, refreshUser } = useAuth();
  const [active, setActive] = useState<SettingsSection>("profile");
  const [profile, setProfile] = useState({ firstName: "", lastName: "", email: "", phoneNumber: "" });
  const [password, setPassword] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [showPasswords, setShowPasswords] = useState(false);
  const [notifications, setNotifications] = useState(defaultNotifications);
  const [preferences, setPreferences] = useState({ theme: localStorage.getItem("libro.theme") === "dark" ? "dark" : "light", dateFormat: "MMM d, yyyy", timezone: "Asia/Manila", currency: "PHP", compactSidebar: localStorage.getItem("libro.sidebar.collapsed") === "true" });

  useEffect(() => {
    if (user) {
      setProfile({ firstName: user.firstName, lastName: user.lastName, email: user.email, phoneNumber: user.phoneNumber ?? "" });
      const storedNotifications = localStorage.getItem(`libro.notifications.${user.id}`);
      if (storedNotifications) try { setNotifications({ ...defaultNotifications, ...JSON.parse(storedNotifications) }); } catch { /* Keep safe defaults. */ }
      const storedPreferences = localStorage.getItem(`libro.preferences.${user.id}`);
      if (storedPreferences) try { setPreferences(current => ({ ...current, ...JSON.parse(storedPreferences) })); } catch { /* Keep safe defaults. */ }
    }
  }, [user]);

  if (!user) return null;
  const initials = `${user.firstName[0] ?? ""}${user.lastName[0] ?? ""}`.toUpperCase();
  const isOwner = user.role === "OWNER";
  const menu: { id: SettingsSection; label: string; icon: React.ElementType }[] = isOwner
    ? [{ id: "profile", label: "Profile & Account", icon: UserRound }, { id: "security", label: "Password & Security", icon: LockKeyhole }, { id: "notifications", label: "Notification Preferences", icon: Bell }, { id: "preferences", label: "System Preferences", icon: SlidersHorizontal }, { id: "business", label: "Business Information", icon: Building2 }]
    : [{ id: "profile", label: "Profile", icon: UserRound }, { id: "security", label: "Password & Security", icon: LockKeyhole }, { id: "branch", label: "Assigned Branch", icon: MapPin }, { id: "notifications", label: "Notification Preferences", icon: Bell }, { id: "preferences", label: "UI Preferences", icon: MonitorCog }];

  const saveNotifications = () => {
    localStorage.setItem(`libro.notifications.${user.id}`, JSON.stringify(notifications));
    toast.success("Notification preferences saved");
  };

  const savePreferences = () => {
    localStorage.setItem(`libro.preferences.${user.id}`, JSON.stringify(preferences));
    localStorage.setItem("libro.sidebar.collapsed", String(preferences.compactSidebar));
    localStorage.setItem("libro.theme", preferences.theme);
    window.dispatchEvent(new CustomEvent("libro-theme-change", { detail: preferences.theme }));
    toast.success("Preferences saved");
  };

  const saveProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    setSavingProfile(true);
    try {
      await accountService.updateProfile({ ...profile, phoneNumber: profile.phoneNumber.trim() || null });
      await refreshUser();
      toast.success("Profile updated successfully");
    } catch (error) { toast.error(errorMessage(error, "Unable to update profile")); }
    finally { setSavingProfile(false); }
  };

  const savePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    if (password.newPassword !== password.confirmPassword) return toast.error("New passwords do not match");
    if (password.newPassword.length < 10) return toast.error("New password must be at least 10 characters");
    setSavingPassword(true);
    try {
      await accountService.updatePassword({ currentPassword: password.currentPassword, newPassword: password.newPassword });
      setPassword({ currentPassword: "", newPassword: "", confirmPassword: "" });
      toast.success("Password updated successfully");
    } catch (error) { toast.error(errorMessage(error, "Unable to update password")); }
    finally { setSavingPassword(false); }
  };

  return <div className="p-4 sm:p-6 space-y-5 max-w-6xl mx-auto">
    <div><h1 className="text-2xl font-bold text-[var(--app-text)]">Settings</h1><p className="text-sm mt-1 text-[var(--app-text-muted)]">Manage your database-backed account information and security.</p></div>
    <div className="grid grid-cols-1 lg:grid-cols-[230px_1fr] gap-5">
      <aside className="h-fit rounded-2xl border bg-[var(--app-surface)] border-[var(--app-border)] p-2">
        {menu.map(({ id, label, icon: Icon }) =>
          <button key={id} onClick={() => setActive(id)} className="w-full flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors" style={{ color: active === id ? "var(--app-primary)" : "var(--app-text-muted)", background: active === id ? "var(--app-primary-subtle)" : "transparent" }}><Icon size={16}/>{label}</button>)}
      </aside>

      {active === "profile" && <form onSubmit={saveProfile} className="rounded-2xl border bg-[var(--app-surface)] border-[var(--app-border)] p-5 sm:p-6">
        <div className="flex items-center gap-4 pb-5 mb-5 border-b border-[var(--app-border)]">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-xl font-bold text-white bg-[var(--app-primary)]">{initials}</div>
          <div><h2 className="font-bold text-[var(--app-text)]">{user.firstName} {user.lastName}</h2><p className="text-sm text-[var(--app-text-muted)]">{user.position}</p><p className="text-xs mt-1 text-[var(--app-text-faint)]">{user.branch?.name ?? "All branches"}</p></div>
        </div>
        <h3 className="font-semibold text-[var(--app-text)] mb-4">Profile Information</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="text-sm font-medium text-[var(--app-text)]">First Name<input required value={profile.firstName} onChange={e => setProfile(p => ({ ...p, firstName: e.target.value }))} className={`${inputClass} mt-1.5`}/></label>
          <label className="text-sm font-medium text-[var(--app-text)]">Last Name<input required value={profile.lastName} onChange={e => setProfile(p => ({ ...p, lastName: e.target.value }))} className={`${inputClass} mt-1.5`}/></label>
          <label className="text-sm font-medium text-[var(--app-text)]">Email<input required type="email" value={profile.email} onChange={e => setProfile(p => ({ ...p, email: e.target.value }))} className={`${inputClass} mt-1.5`}/></label>
          <label className="text-sm font-medium text-[var(--app-text)]">Phone Number<input type="tel" value={profile.phoneNumber} onChange={e => setProfile(p => ({ ...p, phoneNumber: e.target.value }))} placeholder="e.g. +63 912 345 6789" className={`${inputClass} mt-1.5`}/></label>
          <label className="text-sm font-medium text-[var(--app-text)]">Position<input disabled value={user.position} className={`${inputClass} mt-1.5`}/><span className="block text-xs mt-1.5 text-[var(--app-text-faint)]">Only the Owner can change user positions in User Management.</span></label>
          <label className="text-sm font-medium text-[var(--app-text)]">Assigned Branch<input disabled value={user.branch?.name ?? "All Branches"} className={`${inputClass} mt-1.5`}/></label>
        </div>
        <div className="flex justify-end mt-6"><button disabled={savingProfile} className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white bg-[var(--app-primary)] disabled:opacity-60"><Save size={15}/>{savingProfile ? "Saving..." : "Save Changes"}</button></div>
      </form>}

      {active === "security" && <form onSubmit={savePassword} className="rounded-2xl border bg-[var(--app-surface)] border-[var(--app-border)] p-5 sm:p-6">
        <div className="flex gap-3 p-4 rounded-xl mb-5 bg-[var(--app-primary-subtle)]"><ShieldCheck size={20} className="text-[var(--app-primary)] mt-0.5"/><div><h2 className="font-semibold text-[var(--app-text)]">Secure your account</h2><p className="text-sm mt-1 text-[var(--app-text-muted)]">Confirm your current password before choosing a new one. Passwords are hashed before storage.</p></div></div>
        <div className="space-y-4 max-w-xl">
          {[{ key: "currentPassword", label: "Current Password" }, { key: "newPassword", label: "New Password" }, { key: "confirmPassword", label: "Confirm New Password" }].map(({ key, label }) => <label key={key} className="block text-sm font-medium text-[var(--app-text)]">{label}<div className="relative mt-1.5"><input required type={showPasswords ? "text" : "password"} value={password[key as keyof typeof password]} onChange={e => setPassword(p => ({ ...p, [key]: e.target.value }))} autoComplete={key === "currentPassword" ? "current-password" : "new-password"} className={`${inputClass} pr-11`}/><button type="button" onClick={() => setShowPasswords(p => !p)} aria-label={showPasswords ? "Hide passwords" : "Show passwords"} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--app-text-faint)]">{showPasswords ? <EyeOff size={17}/> : <Eye size={17}/>}</button></div></label>)}
        </div>
        <div className="flex justify-end mt-6"><button disabled={savingPassword} className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white bg-[var(--app-primary)] disabled:opacity-60"><LockKeyhole size={15}/>{savingPassword ? "Updating..." : "Update Password"}</button></div>
      </form>}

      {active === "notifications" && <section className="rounded-2xl border bg-[var(--app-surface)] border-[var(--app-border)] p-5 sm:p-6">
        <div className="flex items-start gap-3 mb-5"><div className="w-10 h-10 rounded-xl flex items-center justify-center bg-[var(--app-primary-subtle)] text-[var(--app-primary)]"><Bell size={18}/></div><div><h2 className="font-semibold text-[var(--app-text)]">Notification Preferences</h2><p className="text-sm mt-1 text-[var(--app-text-muted)]">Choose which operational alerts you want to receive.</p></div></div>
        <div className="divide-y divide-[var(--app-border)]">{[
          { key: "lowStock", label: "Low Stock Alerts", desc: "When inventory falls below its reorder level" },
          { key: "criticalStock", label: "Critical Stock Alerts", desc: "Urgent notifications for critically low items" },
          { key: "highCogs", label: "High COGS Warnings", desc: "When COGS exceeds configured thresholds" },
          { key: "spoilage", label: "Spoilage and Wastage", desc: "When an inventory loss is recorded" },
          { key: "variance", label: "Unusual Variance", desc: "When an unexplained discrepancy is detected" },
          { key: "purchaseOrders", label: "Purchase Orders", desc: "Updates about purchase requests and approvals" },
          { key: "ai", label: "AI Forecast Alerts", desc: "Restocking and demand recommendations" },
          { key: "messages", label: "Direct Messages", desc: "Notifications when another user sends a message", locked: true },
        ].map(item => <div key={item.key} className="flex items-center justify-between gap-5 py-3.5"><div><p className="text-sm font-semibold text-[var(--app-text)]">{item.label}</p><p className="text-xs mt-1 text-[var(--app-text-muted)]">{item.desc}{item.locked ? " · Required" : ""}</p></div><Toggle disabled={item.locked} checked={notifications[item.key as keyof typeof notifications]} onChange={() => setNotifications(current => ({ ...current, [item.key]: !current[item.key as keyof typeof current] }))}/></div>)}</div>
        <div className="flex justify-end mt-5"><button onClick={saveNotifications} className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white bg-[var(--app-primary)]"><Save size={15}/>Save Preferences</button></div>
      </section>}

      {active === "preferences" && <section className="rounded-2xl border bg-[var(--app-surface)] border-[var(--app-border)] p-5 sm:p-6">
        <div className="flex items-start gap-3 mb-5"><div className="w-10 h-10 rounded-xl flex items-center justify-center bg-[var(--app-primary-subtle)] text-[var(--app-primary)]">{isOwner ? <SlidersHorizontal size={18}/> : <MonitorCog size={18}/>}</div><div><h2 className="font-semibold text-[var(--app-text)]">{isOwner ? "System Preferences" : "UI Preferences"}</h2><p className="text-sm mt-1 text-[var(--app-text-muted)]">Personalize how the management portal appears on this device.</p></div></div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="text-sm font-medium text-[var(--app-text)]">Theme<select value={preferences.theme} onChange={e => setPreferences(current => ({ ...current, theme: e.target.value }))} className={`${inputClass} mt-1.5`}><option value="light">Light</option><option value="dark">Dark</option></select></label>
          <label className="text-sm font-medium text-[var(--app-text)]">Date Format<select value={preferences.dateFormat} onChange={e => setPreferences(current => ({ ...current, dateFormat: e.target.value }))} className={`${inputClass} mt-1.5`}><option value="MMM d, yyyy">Aug 27, 2026</option><option value="MM/dd/yyyy">08/27/2026</option><option value="dd/MM/yyyy">27/08/2026</option></select></label>
          {isOwner && <label className="text-sm font-medium text-[var(--app-text)]">Timezone<select value={preferences.timezone} onChange={e => setPreferences(current => ({ ...current, timezone: e.target.value }))} className={`${inputClass} mt-1.5`}><option value="Asia/Manila">Asia/Manila (UTC+8)</option></select></label>}
          {isOwner && <label className="text-sm font-medium text-[var(--app-text)]">Currency<select value={preferences.currency} onChange={e => setPreferences(current => ({ ...current, currency: e.target.value }))} className={`${inputClass} mt-1.5`}><option value="PHP">Philippine Peso (PHP)</option></select></label>}
        </div>
        <div className="flex items-center justify-between mt-5 py-4 border-y border-[var(--app-border)]"><div><p className="text-sm font-semibold text-[var(--app-text)]">Compact Sidebar</p><p className="text-xs mt-1 text-[var(--app-text-muted)]">Start with the navigation sidebar collapsed.</p></div><Toggle checked={preferences.compactSidebar} onChange={() => setPreferences(current => ({ ...current, compactSidebar: !current.compactSidebar }))}/></div>
        <div className="flex justify-end mt-5"><button onClick={savePreferences} className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white bg-[var(--app-primary)]"><Save size={15}/>Save Preferences</button></div>
      </section>}

      {active === "branch" && !isOwner && <section className="rounded-2xl border bg-[var(--app-surface)] border-[var(--app-border)] p-5 sm:p-6">
        <div className="flex items-center gap-3 p-4 rounded-xl bg-[var(--app-primary-subtle)]"><MapPin size={20} className="text-[var(--app-primary)]"/><div><h2 className="font-semibold text-[var(--app-text)]">{user.branch?.name ?? "No branch assigned"}</h2><p className="text-sm text-[var(--app-text-muted)]">Branch code: {user.branch?.code ?? "Not available"}</p></div></div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-5"><label className="text-sm font-medium text-[var(--app-text)]">Position<input disabled value={user.position} className={`${inputClass} mt-1.5`}/></label><label className="text-sm font-medium text-[var(--app-text)]">Access Scope<input disabled value="Assigned branch only" className={`${inputClass} mt-1.5`}/></label></div>
        <p className="text-xs mt-4 text-[var(--app-text-faint)]">Branch assignment and access position can only be changed by the Owner.</p>
      </section>}

      {active === "business" && isOwner && <section className="rounded-2xl border bg-[var(--app-surface)] border-[var(--app-border)] p-5 sm:p-6">
        <div className="flex items-start gap-3 mb-5"><div className="w-10 h-10 rounded-xl flex items-center justify-center bg-[var(--app-primary-subtle)] text-[var(--app-primary)]"><Building2 size={18}/></div><div><h2 className="font-semibold text-[var(--app-text)]">Business Information</h2><p className="text-sm mt-1 text-[var(--app-text-muted)]">System-wide Libro Espresso organization details.</p></div></div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><label className="text-sm font-medium text-[var(--app-text)]">Business Name<input disabled value="Libro Espresso Cafe" className={`${inputClass} mt-1.5`}/></label><label className="text-sm font-medium text-[var(--app-text)]">Operating Branches<input disabled value="Gulod · Lipa · Tagaytay · Evo · Vermosa" className={`${inputClass} mt-1.5`}/></label><label className="text-sm font-medium text-[var(--app-text)] sm:col-span-2">System<input disabled value="AI-Driven Cost of Goods and Inventory Shrinkage Monitoring" className={`${inputClass} mt-1.5`}/></label></div>
        <p className="text-xs mt-4 text-[var(--app-text-faint)]">Branch records are managed in the Branch Management module.</p>
      </section>}
    </div>
  </div>;
}
