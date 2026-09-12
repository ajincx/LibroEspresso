import { useEffect, useState } from "react";
import {
  Bell,
  Building2,
  Eye,
  EyeOff,
  LockKeyhole,
  LogOut,
  MonitorCog,
  Save,
  ShieldCheck,
  SlidersHorizontal,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../../contexts/AuthContext";
import {
  accountService,
  type OrganizationSettings,
} from "../../services/account.service";
import {
  applyAppPreferences,
  defaultAppPreferences,
  type AppPreferences,
} from "../../utils/appPreferences";
import { Select } from "../../components/ModuleUi";

const inputClass =
  "w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none transition-colors bg-[var(--app-surface)] text-[var(--app-text)] border-[var(--app-border)] focus:border-[var(--app-primary)] focus:ring-4 focus:ring-[var(--app-primary-faint)] disabled:cursor-not-allowed disabled:bg-[var(--app-surface-muted)]";

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

type SettingsSection =
  | "profile"
  | "security"
  | "notifications"
  | "preferences"
  | "business";
const defaultNotifications = {
  lowStock: true,
  criticalStock: true,
  highCogs: false,
  spoilage: true,
  variance: true,
  purchaseOrders: true,
  ai: false,
  messages: true,
};

function Toggle({
  checked,
  onChange,
  disabled = false,
}: {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onChange}
      className="w-11 h-6 rounded-full p-0.5 transition-colors disabled:opacity-60"
      style={{
        background: checked ? "var(--app-primary)" : "var(--app-surface-muted)",
      }}
      aria-pressed={checked}
    >
      <span
        className="block w-5 h-5 rounded-full bg-white shadow-sm transition-transform"
        style={{ transform: checked ? "translateX(20px)" : "translateX(0)" }}
      />
    </button>
  );
}

export function SettingsPage({ onLogout }: { onLogout?: () => void } = {}) {
  const { user, refreshUser, logout } = useAuth();
  const [active, setActive] = useState<SettingsSection | null>(null);
  const [profile, setProfile] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phoneNumber: "",
  });
  const [password, setPassword] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [showPasswords, setShowPasswords] = useState(false);
  const [notifications, setNotifications] = useState(defaultNotifications);
  const [preferences, setPreferences] = useState<AppPreferences>({
    ...defaultAppPreferences,
    theme: localStorage.getItem("libro.theme") === "dark" ? "dark" : "light",
    compactSidebar: localStorage.getItem("libro.sidebar.collapsed") === "true",
  });
  const [organization, setOrganization] = useState<OrganizationSettings | null>(
    null,
  );
  const [confirming, setConfirming] = useState<
    "profile" | "password" | "business" | null
  >(null);
  const [savingSettings, setSavingSettings] = useState(false);

  useEffect(() => {
    if (user) {
      setProfile({
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phoneNumber: user.phoneNumber ?? "",
      });
      void accountService
        .settings()
        .then((data) => {
          setPreferences({ ...defaultAppPreferences, ...data.preferences });
          setNotifications({
            ...defaultNotifications,
            ...data.preferences.notifications,
          });
          setOrganization(data.organization);
        })
        .catch((error) =>
          toast.error(errorMessage(error, "Unable to load settings")),
        );
    }
  }, [user]);

  if (!user) return null;
  const initials =
    `${user.firstName[0] ?? ""}${user.lastName[0] ?? ""}`.toUpperCase();
  const isOwner = user.role === "OWNER";
  const isStaff = user.role === "STAFF";
  const menu: {
    id: SettingsSection;
    label: string;
    icon: React.ElementType;
  }[] = isOwner
    ? [
        { id: "profile", label: "Profile & Account", icon: UserRound },
        { id: "security", label: "Password & Security", icon: LockKeyhole },
        { id: "notifications", label: "Notification Preferences", icon: Bell },
        {
          id: "preferences",
          label: "System Preferences",
          icon: SlidersHorizontal,
        },
        { id: "business", label: "Business Information", icon: Building2 },
      ]
    : [
        { id: "profile", label: "Profile", icon: UserRound },
        { id: "security", label: "Password & Security", icon: LockKeyhole },
        { id: "notifications", label: "Notification Preferences", icon: Bell },
        { id: "preferences", label: "UI Preferences", icon: MonitorCog },
      ];

  const persistPreferences = async (includeSystemSettings = false) => {
    setSavingSettings(true);
    try {
      await accountService.updatePreferences({ ...preferences, notifications });
      if (includeSystemSettings && organization) {
        const {
          branchCount: _b,
          activeBranchCount: _a,
          ...input
        } = organization;
        await accountService.updateBusiness(input);
      }
      localStorage.setItem(
        "libro.notifications.active",
        JSON.stringify(notifications),
      );
      applyAppPreferences(preferences);
      window.dispatchEvent(new Event("libro-notification-preferences-change"));
      toast.success(
        includeSystemSettings
          ? "System preferences saved and applied to all branches"
          : "Preferences saved and applied",
      );
    } catch (error) {
      toast.error(errorMessage(error, "Unable to save preferences"));
    } finally {
      setSavingSettings(false);
    }
  };
  const saveNotifications = () => void persistPreferences();
  const savePreferences = () => void persistPreferences(isOwner);
  const changeTheme = async (theme: string) => {
    const previous = preferences;
    const next = { ...preferences, theme };
    setPreferences(next);
    applyAppPreferences(next);
    try {
      await accountService.updatePreferences({ ...next, notifications });
    } catch (error) {
      setPreferences(previous);
      applyAppPreferences(previous);
      toast.error(errorMessage(error, "Unable to save the theme"));
    }
  };

  const commitProfile = async () => {
    setSavingProfile(true);
    try {
      await accountService.updateProfile({
        ...profile,
        phoneNumber: profile.phoneNumber.trim() || null,
      });
      await refreshUser();
      toast.success("Profile updated successfully");
    } catch (error) {
      toast.error(errorMessage(error, "Unable to update profile"));
    } finally {
      setSavingProfile(false);
    }
  };

  const requestProfileSave = (event: React.FormEvent) => {
    event.preventDefault();
    setConfirming("profile");
  };
  const commitPassword = async () => {
    setSavingPassword(true);
    try {
      await accountService.updatePassword({
        currentPassword: password.currentPassword,
        newPassword: password.newPassword,
      });
      setPassword({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
      await logout();
      toast.success("Password updated. Please sign in again.");
    } catch (error) {
      toast.error(errorMessage(error, "Unable to update password"));
    } finally {
      setSavingPassword(false);
    }
  };
  const requestPasswordSave = (event: React.FormEvent) => {
    event.preventDefault();
    if (password.newPassword !== password.confirmPassword)
      return toast.error("New passwords do not match");
    if (password.newPassword.length < 10)
      return toast.error("New password must be at least 10 characters");
    setConfirming("password");
  };
  const saveBusiness = async () => {
    if (!organization) return;
    setSavingSettings(true);
    try {
      const { branchCount: _b, activeBranchCount: _a, ...input } = organization;
      await accountService.updateBusiness(input);
      toast.success("Business information updated");
    } catch (error) {
      toast.error(errorMessage(error, "Unable to update business settings"));
    } finally {
      setSavingSettings(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-[var(--app-text)]">Settings</h1>
        <p className="text-sm mt-1 text-[var(--app-text-muted)]">
          Manage your database-backed account information and security.
        </p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[230px_1fr] gap-5">
        <aside className="h-fit rounded-2xl border bg-[var(--app-surface)] border-[var(--app-border)] p-2">
          {menu.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActive(id)}
              className="w-full flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors"
              style={{
                color:
                  active === id
                    ? "var(--app-primary)"
                    : "var(--app-text-muted)",
                background:
                  active === id ? "var(--app-primary-subtle)" : "transparent",
              }}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </aside>
        {active === null && (
          <section className="flex min-h-48 items-center justify-center rounded-2xl border border-dashed bg-[var(--app-surface)] border-[var(--app-border)] p-8 text-center">
            <div>
              <SlidersHorizontal className="mx-auto text-[var(--app-text-faint)]" />
              <p className="mt-3 font-semibold text-[var(--app-text)]">
                Choose a setting
              </p>
              <p className="mt-1 text-sm text-[var(--app-text-muted)]">
                Select an option above to view or update it.
              </p>
            </div>
          </section>
        )}

        {active === "profile" && (
          <form
            onSubmit={requestProfileSave}
            className="rounded-2xl border bg-[var(--app-surface)] border-[var(--app-border)] p-5 sm:p-6"
          >
            <div className="flex items-center gap-4 pb-5 mb-5 border-b border-[var(--app-border)]">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-xl font-bold text-white bg-[var(--app-primary)]">
                {initials}
              </div>
              <div>
                <h2 className="font-bold text-[var(--app-text)]">
                  {user.firstName} {user.lastName}
                </h2>
                <p className="text-sm text-[var(--app-text-muted)]">
                  {user.position}
                </p>
                <p className="text-xs mt-1 text-[var(--app-text-faint)]">
                  {user.branch?.name ?? "All branches"}
                </p>
              </div>
            </div>
            <h3 className="font-semibold text-[var(--app-text)] mb-4">
              Profile Information
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="text-sm font-medium text-[var(--app-text)]">
                First Name
                <input
                  required
                  value={profile.firstName}
                  onChange={(e) =>
                    setProfile((p) => ({ ...p, firstName: e.target.value }))
                  }
                  className={`${inputClass} mt-1.5`}
                />
              </label>
              <label className="text-sm font-medium text-[var(--app-text)]">
                Last Name
                <input
                  required
                  value={profile.lastName}
                  onChange={(e) =>
                    setProfile((p) => ({ ...p, lastName: e.target.value }))
                  }
                  className={`${inputClass} mt-1.5`}
                />
              </label>
              <label className="text-sm font-medium text-[var(--app-text)]">
                Email
                <input
                  required
                  type="email"
                  value={profile.email}
                  onChange={(e) =>
                    setProfile((p) => ({ ...p, email: e.target.value }))
                  }
                  className={`${inputClass} mt-1.5`}
                />
              </label>
              <label className="text-sm font-medium text-[var(--app-text)]">
                Phone Number
                <input
                  type="tel"
                  value={profile.phoneNumber}
                  onChange={(e) =>
                    setProfile((p) => ({ ...p, phoneNumber: e.target.value }))
                  }
                  placeholder="e.g. +63 912 345 6789"
                  className={`${inputClass} mt-1.5`}
                />
              </label>
              <label className="text-sm font-medium text-[var(--app-text)]">
                Position
                <input
                  disabled
                  value={user.position}
                  className={`${inputClass} mt-1.5`}
                />
                <span className="block text-xs mt-1.5 text-[var(--app-text-faint)]">
                  Only the Owner can change user positions in User Management.
                </span>
              </label>
              <label className="text-sm font-medium text-[var(--app-text)]">
                Assigned Branch
                <input
                  disabled
                  value={user.branch?.name ?? "All Branches"}
                  className={`${inputClass} mt-1.5`}
                />
              </label>
            </div>
            <div className="flex justify-end mt-6">
              <button
                disabled={savingProfile}
                className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white bg-[var(--app-primary)] disabled:opacity-60"
              >
                <Save size={15} />
                {savingProfile ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </form>
        )}

        {active === "security" && (
          <form
            onSubmit={requestPasswordSave}
            className="rounded-2xl border bg-[var(--app-surface)] border-[var(--app-border)] p-5 sm:p-6"
          >
            <div className="flex gap-3 p-4 rounded-xl mb-5 bg-[var(--app-primary-subtle)]">
              <ShieldCheck
                size={20}
                className="text-[var(--app-primary)] mt-0.5"
              />
              <div>
                <h2 className="font-semibold text-[var(--app-text)]">
                  Secure your account
                </h2>
                <p className="text-sm mt-1 text-[var(--app-text-muted)]">
                  Confirm your current password before choosing a new one.
                  Passwords are hashed before storage.
                </p>
              </div>
            </div>
            <div className="max-w-xl mb-4">
              <label className="block text-sm font-medium text-[var(--app-text)]">
                Saved Current Password
                <input
                  disabled
                  readOnly
                  value="••••••••••••"
                  aria-label="A password is currently saved securely"
                  className={`${inputClass} mt-1.5 font-mono tracking-[.3em]`}
                />
                <span className="block mt-1.5 text-xs text-[var(--app-text-faint)]">
                  Your saved password is securely hashed and cannot be
                  displayed.
                </span>
              </label>
            </div>
            <div className="space-y-4 max-w-xl">
              {[
                { key: "currentPassword", label: "Current Password" },
                { key: "newPassword", label: "New Password" },
                { key: "confirmPassword", label: "Confirm New Password" },
              ].map(({ key, label }) => (
                <label
                  key={key}
                  className="block text-sm font-medium text-[var(--app-text)]"
                >
                  {label}
                  <div className="relative mt-1.5">
                    <input
                      required
                      type={showPasswords ? "text" : "password"}
                      value={password[key as keyof typeof password]}
                      onChange={(e) =>
                        setPassword((p) => ({ ...p, [key]: e.target.value }))
                      }
                      autoComplete={
                        key === "currentPassword"
                          ? "current-password"
                          : "new-password"
                      }
                      className={`${inputClass} pr-11`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPasswords((p) => !p)}
                      aria-label={
                        showPasswords ? "Hide passwords" : "Show passwords"
                      }
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--app-text-faint)]"
                    >
                      {showPasswords ? <EyeOff size={17} /> : <Eye size={17} />}
                    </button>
                  </div>
                </label>
              ))}
            </div>
            <div className="flex justify-end mt-6">
              <button
                disabled={savingPassword}
                className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white bg-[var(--app-primary)] disabled:opacity-60"
              >
                <LockKeyhole size={15} />
                {savingPassword ? "Updating..." : "Update Password"}
              </button>
            </div>
          </form>
        )}

        {active === "notifications" && (
          <section className="rounded-2xl border bg-[var(--app-surface)] border-[var(--app-border)] p-5 sm:p-6">
            <div className="flex items-start gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-[var(--app-primary-subtle)] text-[var(--app-primary)]">
                <Bell size={18} />
              </div>
              <div>
                <h2 className="font-semibold text-[var(--app-text)]">
                  Notification Preferences
                </h2>
                <p className="text-sm mt-1 text-[var(--app-text-muted)]">
                  Choose which operational alerts you want to receive.
                </p>
              </div>
            </div>
            <div className="divide-y divide-[var(--app-border)]">
              {[
                {
                  key: "lowStock",
                  label: "Low Stock Alerts",
                  desc: "When inventory falls below its reorder level",
                },
                {
                  key: "criticalStock",
                  label: "Critical Stock Alerts",
                  desc: "Urgent notifications for critically low items",
                },
                {
                  key: "highCogs",
                  label: "High COGS Warnings",
                  desc: "When COGS exceeds configured thresholds",
                },
                {
                  key: "spoilage",
                  label: "Spoilage and Wastage",
                  desc: "When an inventory loss is recorded",
                },
                {
                  key: "variance",
                  label: "Unusual Variance",
                  desc: "When an unexplained discrepancy is detected",
                },
                {
                  key: "purchaseOrders",
                  label: "Purchase Orders",
                  desc: "Updates about purchase requests and approvals",
                },
                {
                  key: "ai",
                  label: "AI Forecast Alerts",
                  desc: "Restocking and demand recommendations",
                },
                {
                  key: "messages",
                  label: "Direct Messages",
                  desc: "Notifications when another user sends a message",
                  locked: true,
                },
              ]
                .filter(
                  (item) =>
                    !isStaff ||
                    item.key === "spoilage" ||
                    item.key === "messages",
                )
                .map((item) => (
                  <div
                    key={item.key}
                    className="flex items-center justify-between gap-5 py-3.5"
                  >
                    <div>
                      <p className="text-sm font-semibold text-[var(--app-text)]">
                        {isStaff && item.key === "spoilage"
                          ? "Incident Report Updates"
                          : item.label}
                      </p>
                      <p className="text-xs mt-1 text-[var(--app-text-muted)]">
                        {isStaff && item.key === "spoilage"
                          ? "When your submitted report is reviewed"
                          : item.desc}
                        {item.locked ? " · Required" : ""}
                      </p>
                    </div>
                    <Toggle
                      disabled={item.locked}
                      checked={
                        notifications[item.key as keyof typeof notifications]
                      }
                      onChange={() =>
                        setNotifications((current) => ({
                          ...current,
                          [item.key]:
                            !current[item.key as keyof typeof current],
                        }))
                      }
                    />
                  </div>
                ))}
            </div>
            <div className="flex justify-end mt-5">
              <button
                disabled={savingSettings}
                onClick={saveNotifications}
                className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white bg-[var(--app-primary)] disabled:opacity-60"
              >
                <Save size={15} />
                Save Preferences
              </button>
            </div>
          </section>
        )}

        {active === "preferences" && (
          <section className="rounded-2xl border bg-[var(--app-surface)] border-[var(--app-border)] p-5 sm:p-6">
            <div className="flex items-start gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-[var(--app-primary-subtle)] text-[var(--app-primary)]">
                {isOwner ? (
                  <SlidersHorizontal size={18} />
                ) : (
                  <MonitorCog size={18} />
                )}
              </div>
              <div>
                <h2 className="font-semibold text-[var(--app-text)]">
                  {isOwner ? "System Preferences" : "UI Preferences"}
                </h2>
                <p className="text-sm mt-1 text-[var(--app-text-muted)]">
                  {isOwner
                    ? "Manage display options and the system-wide alert settings used by every branch."
                    : "Personalize how the management portal appears on this device."}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="text-sm font-medium text-[var(--app-text)]">
                Theme
                <Select
                  className="mt-1.5 w-full"
                  value={preferences.theme}
                  onChange={(value) => void changeTheme(value)}
                  options={[
                    { value: "light", label: "Light" },
                    { value: "dark", label: "Dark" },
                  ]}
                />
              </label>
              <label className="text-sm font-medium text-[var(--app-text)]">
                Date Format
                <Select
                  className="mt-1.5 w-full"
                  value={preferences.dateFormat}
                  onChange={(value) =>
                    setPreferences((current) => ({
                      ...current,
                      dateFormat: value,
                    }))
                  }
                  options={[
                    { value: "MMM d, yyyy", label: "Aug 27, 2026" },
                    { value: "MM/dd/yyyy", label: "08/27/2026" },
                    { value: "dd/MM/yyyy", label: "27/08/2026" },
                  ]}
                />
              </label>
              {isOwner && (
                <label className="text-sm font-medium text-[var(--app-text)]">
                  Timezone
                  <Select
                    className="mt-1.5 w-full"
                    value={preferences.timezone}
                    onChange={(value) =>
                      setPreferences((current) => ({
                        ...current,
                        timezone: value,
                      }))
                    }
                    options={[
                      { value: "Asia/Manila", label: "Asia/Manila (UTC+8)" },
                      {
                        value: "Asia/Singapore",
                        label: "Asia/Singapore (UTC+8)",
                      },
                      { value: "Asia/Tokyo", label: "Asia/Tokyo (UTC+9)" },
                      { value: "UTC", label: "UTC" },
                    ]}
                  />
                </label>
              )}
              {isOwner && (
                <label className="text-sm font-medium text-[var(--app-text)]">
                  Currency
                  <Select
                    className="mt-1.5 w-full"
                    value={preferences.currency}
                    onChange={(value) =>
                      setPreferences((current) => ({
                        ...current,
                        currency: value,
                      }))
                    }
                    options={[
                      { value: "PHP", label: "Philippine Peso (PHP)" },
                      { value: "USD", label: "US Dollar (USD)" },
                      { value: "EUR", label: "Euro (EUR)" },
                    ]}
                  />
                </label>
              )}
            </div>
            {!isStaff && (
              <div className="flex items-center justify-between mt-5 py-4 border-y border-[var(--app-border)]">
                <div>
                  <p className="text-sm font-semibold text-[var(--app-text)]">
                    Compact Sidebar
                  </p>
                  <p className="text-xs mt-1 text-[var(--app-text-muted)]">
                    Start with the navigation sidebar collapsed.
                  </p>
                </div>
                <Toggle
                  checked={preferences.compactSidebar}
                  onChange={() =>
                    setPreferences((current) => ({
                      ...current,
                      compactSidebar: !current.compactSidebar,
                    }))
                  }
                />
              </div>
            )}
            {isOwner && organization && (
              <div className="mt-6 border-t border-[var(--app-border)] pt-6">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 className="font-semibold text-[var(--app-text)]">
                      Calculation and Alert Settings
                    </h3>
                    <p className="mt-1 max-w-2xl text-xs leading-5 text-[var(--app-text-muted)]">
                      These values tell the system when to flag unusual results
                      or suggest restocking. They do not change inventory by
                      themselves.
                    </p>
                  </div>
                  <span className="w-fit rounded-full bg-[var(--app-primary-subtle)] px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-[var(--app-primary)]">
                    Applies to all branches
                  </span>
                </div>
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {(
                    [
                      {
                        key: "varianceToleranceQuantity",
                        title: "Allowed Count Difference",
                        description:
                          "The smallest difference the system ignores when comparing expected stock with the physical count.",
                        example:
                          "0.0001 means only differences smaller than 0.0001 unit are ignored.",
                        suffix: "unit",
                        step: "0.0001",
                      },
                      {
                        key: "highCogsPercent",
                        title: "High COGS Warning Level",
                        description:
                          "Shows a warning when COGS reaches this percentage of sales.",
                        example:
                          "45% means warn when COGS reaches ₱45 for every ₱100 in sales.",
                        suffix: "%",
                        step: "0.1",
                      },
                      {
                        key: "defaultReorderDays",
                        title: "Default Stock Coverage",
                        description:
                          "The number of future days used for a reorder suggestion when an ingredient has no custom setting.",
                        example:
                          "7 days means recommend enough stock for the next 7 days.",
                        suffix: "days",
                        step: "1",
                      },
                    ] as const
                  ).map((item) => (
                    <label
                      key={item.key}
                      className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface-muted)] p-4"
                    >
                      <span className="text-sm font-semibold text-[var(--app-text)]">
                        {item.title}
                      </span>
                      <span className="mt-1 block min-h-10 text-xs leading-5 text-[var(--app-text-muted)]">
                        {item.description}
                      </span>
                      <span className="relative mt-3 block">
                        <input
                          type="number"
                          min="0"
                          step={item.step}
                          value={organization[item.key]}
                          onChange={(event) =>
                            setOrganization({
                              ...organization,
                              [item.key]: Number(event.target.value),
                            })
                          }
                          className={`${inputClass} pr-16 font-semibold`}
                        />
                        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-[var(--app-text-faint)]">
                          {item.suffix}
                        </span>
                      </span>
                      <span className="mt-2 block text-[11px] leading-4 text-[var(--app-text-faint)]">
                        Example: {item.example}
                      </span>
                    </label>
                  ))}
                </div>
                <div className="mt-4 rounded-2xl bg-[var(--app-primary-subtle)] p-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-[var(--app-primary)]">
                    What the system calculates
                  </p>
                  <div className="mt-3 grid gap-3 text-xs leading-5 text-[var(--app-text-muted)] sm:grid-cols-2">
                    <p>
                      <b className="text-[var(--app-text)]">Recipe COGS:</b> the
                      ingredient cost needed to make the products sold.
                    </p>
                    <p>
                      <b className="text-[var(--app-text)]">Total COGS:</b>{" "}
                      the sum of recipe-based product COGS only. Inventory shortages are reported separately.
                    </p>
                    <p>
                      <b className="text-[var(--app-text)]">
                        Inventory difference:
                      </b>{" "}
                      expected stock minus physical count. A positive result
                      means stock is missing, while a negative result means excess stock.
                    </p>
                    <p>
                      <b className="text-[var(--app-text)]">Gross margin:</b>{" "}
                      the percentage of sales remaining after official Total COGS.
                    </p>
                  </div>
                </div>
              </div>
            )}
            <div className="flex justify-end mt-5">
              <button
                disabled={savingSettings}
                onClick={savePreferences}
                className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white bg-[var(--app-primary)] disabled:opacity-60"
              >
                <Save size={15} />
                {isOwner ? "Save System Preferences" : "Save Preferences"}
              </button>
            </div>
          </section>
        )}

        {active === "business" && isOwner && (
          <section className="rounded-2xl border bg-[var(--app-surface)] border-[var(--app-border)] p-5 sm:p-6 space-y-6">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-[var(--app-primary-subtle)] text-[var(--app-primary)]">
                <Building2 size={18} />
              </div>
              <div>
                <h2 className="font-semibold text-[var(--app-text)]">
                  Business Information
                </h2>
                <p className="text-sm mt-1 text-[var(--app-text-muted)]">
                  Organization identity, contact details, and reporting cycle.
                </p>
              </div>
            </div>
            {organization && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {(
                    [
                      ["businessName", "Business Name"],
                      ["legalName", "Legal / Registered Name"],
                      ["contactEmail", "Business Email"],
                      ["contactPhone", "Business Phone"],
                      ["headOfficeAddress", "Head Office Address"],
                      ["taxIdentifier", "Tax Identifier"],
                    ] as const
                  ).map(([key, label]) => (
                    <label
                      key={key}
                      className="text-sm font-medium text-[var(--app-text)]"
                    >
                      {label}
                      <input
                        type={key === "contactEmail" ? "email" : "text"}
                        value={organization[key]}
                        onChange={(e) =>
                          setOrganization((v) =>
                            v ? { ...v, [key]: e.target.value } : v,
                          )
                        }
                        className={`${inputClass} mt-1.5`}
                      />
                    </label>
                  ))}
                  <label className="text-sm font-medium text-[var(--app-text)]">
                    Reporting Cycle
                    <Select
                      className="mt-1.5 w-full"
                      value={organization.reportingCycle}
                      onChange={(value) =>
                        setOrganization({
                          ...organization,
                          reportingCycle:
                            value as OrganizationSettings["reportingCycle"],
                        })
                      }
                      options={[
                        { value: "WEEKLY", label: "Weekly" },
                        { value: "MONTHLY", label: "Monthly" },
                        { value: "QUARTERLY", label: "Quarterly" },
                      ]}
                    />
                  </label>
                  <label className="text-sm font-medium text-[var(--app-text)]">
                    Operating Branches
                    <input
                      disabled
                      value={`${organization.activeBranchCount} active of ${organization.branchCount} total`}
                      className={`${inputClass} mt-1.5`}
                    />
                  </label>
                </div>
                <div className="flex justify-end">
                  <button
                    disabled={savingSettings}
                    onClick={() => setConfirming("business")}
                    className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white bg-[var(--app-primary)] disabled:opacity-60"
                  >
                    <Save size={15} />
                    Save Business Settings
                  </button>
                </div>
              </>
            )}
          </section>
        )}
      </div>
      {onLogout && (
        <div className="flex justify-center pt-2">
          <button
            type="button"
            onClick={onLogout}
            className="inline-flex items-center gap-2 rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] px-5 py-2.5 text-sm font-semibold text-[var(--app-danger)] shadow-sm"
          >
            <LogOut size={16} />
            Log out
          </button>
        </div>
      )}
      {confirming && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/50">
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-md rounded-2xl border p-6 shadow-2xl bg-[var(--app-surface)] border-[var(--app-border)]"
          >
            <h2 className="text-lg font-bold text-[var(--app-text)]">
              Confirm changes
            </h2>
            <p className="mt-2 text-sm text-[var(--app-text-muted)]">
              {confirming === "password"
                ? "Your account password will be replaced. Use the new password the next time you sign in."
                : confirming === "business"
                  ? "These organization details and calculation thresholds will apply system-wide."
                  : "Your name, email, and phone number will update throughout the system."}
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setConfirming(null)}
                className="rounded-xl border px-4 py-2.5 text-sm font-semibold border-[var(--app-border)]"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const action = confirming;
                  setConfirming(null);
                  if (action === "profile") void commitProfile();
                  else if (action === "password") void commitPassword();
                  else void saveBusiness();
                }}
                className="rounded-xl px-4 py-2.5 text-sm font-semibold text-white bg-[var(--app-primary)]"
              >
                Confirm & Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
