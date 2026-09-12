import React, { lazy, Suspense, useEffect, useState } from "react";
import "../styles/quality.css";
import { Navigate, useLocation, useNavigate } from "react-router";
import { Toaster, toast } from "sonner";
import { useAuth } from "./contexts/AuthContext";
import {
  isPageAllowed,
  pageFromPath,
  pagePaths,
  type AppPage,
} from "./routes/routeConfig";
import { inventoryWorkflowService } from "./services/inventoryWorkflow.service";
import { masterDataService } from "./services/masterData.service";
import type { Branch } from "./types/masterData";
import type { Page, Role } from "./types/navigation";
import { C, ModuleLoadingFallback } from "./components/ModuleUi";
import {
  Sidebar,
  TopHeader,
  NotifDrawer,
  MessageDrawer,
  LogoutModal,
} from "./layouts/AppChrome";
import { LoginPage as RedesignedLoginPage } from "./modules/authentication/LoginPage";
import { accountService } from "./services/account.service";
import {
  applyAppPreferences,
  formatAppDate,
  type AppPreferences,
} from "./utils/appPreferences";

const DashboardPage = lazy(() =>
  import("./modules/dashboard/DashboardPage").then((module) => ({
    default: module.DashboardPage,
  })),
);
const COGSAndPosSalesModule = lazy(() =>
  import("./modules/cogs/CogsSalesModule").then((module) => ({
    default: module.COGSAndPosSalesModule,
  })),
);
const InventoryManagementModule = lazy(() =>
  import("./modules/inventory/InventoryModule").then((module) => ({
    default: module.InventoryManagementModule,
  })),
);
const PhysicalCountsModule = lazy(() =>
  import("./modules/inventory/InventoryModule").then((module) => ({
    default: module.PhysicalCountsModule,
  })),
);
const MenuRecipeManagementModule = lazy(() =>
  import("./modules/menu-recipes/MenuRecipeManagementModule").then(
    (module) => ({ default: module.MenuRecipeManagementModule }),
  ),
);
const PurchaseOrders = lazy(() =>
  import("./modules/purchase-orders/PurchaseOrdersPage").then((module) => ({
    default: module.PurchaseOrders,
  })),
);
const PredictiveAnalytics = lazy(() =>
  import("./modules/predictive/PredictiveAnalyticsPage").then((module) => ({
    default: module.PredictiveAnalytics,
  })),
);
const Reports = lazy(() =>
  import("./modules/reports/ReportsPage").then((module) => ({
    default: module.Reports,
  })),
);
const UserManagementPage = lazy(() =>
  import("./modules/users/UserManagementPage").then((module) => ({
    default: module.UserManagementPage,
  })),
);
const BranchManagementPage = lazy(() =>
  import("./modules/branches/BranchManagementPage").then((module) => ({
    default: module.BranchManagementPage,
  })),
);
const MasterDataPage = lazy(() =>
  import("./modules/inventory/InventoryMasterDataPage").then((module) => ({
    default: module.MasterDataPage,
  })),
);
const ShrinkagePage = lazy(() =>
  import("./modules/shrinkage/ShrinkagePage").then((module) => ({
    default: module.ShrinkagePage,
  })),
);
const VariancePage = lazy(() =>
  import("./modules/shrinkage/VariancePage").then((module) => ({
    default: module.VariancePage,
  })),
);
const AccountSettingsPage = lazy(() =>
  import("./modules/settings/SettingsPage").then((module) => ({
    default: module.SettingsPage,
  })),
);
const StaffMonitoringPage = lazy(() =>
  import("./modules/staff/StaffMonitoringPage").then((module) => ({
    default: module.StaffMonitoringPage,
  })),
);
const StaffPortalPage = lazy(() =>
  import("./modules/staff/StaffPortalPage").then((module) => ({
    default: module.StaffPortalPage,
  })),
);

type ThemeMode = "light" | "dark";
type AppNotification = {
  id: string;
  cat: string;
  title: string;
  body: string;
  time: string;
  read: boolean;
  icon: string;
  entityId: string | null;
  entityType: string | null;
};

const notificationsData: AppNotification[] = [];

// ─── Sidebar Navigation ────────────────────────────────────────────────────────
export default function App() {
  const { user, loading, login, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const role: Role = user?.role === "BRANCH_MANAGER" ? "manager" : "owner";
  const isStaff = user?.role === "STAFF";
  const page = pageFromPath(location.pathname) as Page;
  const [branch, setBranch] = useState(
    () => localStorage.getItem("libro.owner.branch") ?? "ALL",
  );
  const [branches, setBranches] = useState<Branch[]>([]);
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem("libro.sidebar.collapsed") === "true",
  );
  const [notifOpen, setNotifOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  useEffect(() => { setMobileNavOpen(false); }, [location.pathname]);
  const [messageOpen, setMessageOpen] = useState(false);
  const [messageTargetId, setMessageTargetId] = useState<string | null>(null);
  const [notifs, setNotifs] = useState(notificationsData);
  const [showLogout, setShowLogout] = useState(false);
  const [theme, setTheme] = useState<ThemeMode>(() =>
    localStorage.getItem("libro.theme") === "dark" ? "dark" : "light",
  );

  const unread = notifs.filter((n) => !n.read).length;
  const messageUnread = notifs.filter(
    (n) => !n.read && n.entityType === "MESSAGE",
  ).length;

  useEffect(() => {
    localStorage.setItem("libro.sidebar.collapsed", String(collapsed));
  }, [collapsed]);
  useEffect(() => {
    localStorage.setItem("libro.owner.branch", branch);
  }, [branch]);
  useEffect(() => {
    if (user?.role !== "OWNER") {
      setBranches([]);
      setBranch("ALL");
      return;
    }
    void masterDataService
      .branches()
      .then((rows) => {
        const active = rows.filter((item) => item.status === "ACTIVE");
        setBranches(active);
        setBranch((current) =>
          current === "ALL" || active.some((item) => item.id === current)
            ? current
            : "ALL",
        );
      })
      .catch(() => {
        setBranches([]);
        setBranch("ALL");
      });
  }, [user?.role]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("libro.theme", theme);
  }, [theme]);
  useEffect(() => {
    const handleThemeChange = (event: Event) => {
      const nextTheme = (event as CustomEvent<ThemeMode>).detail;
      if (nextTheme === "light" || nextTheme === "dark") setTheme(nextTheme);
    };
    window.addEventListener("libro-theme-change", handleThemeChange);
    return () =>
      window.removeEventListener("libro-theme-change", handleThemeChange);
  }, []);
  useEffect(() => {
    if (!user) return;
    void accountService
      .settings()
      .then(({ preferences }) => {
        localStorage.setItem(
          "libro.notifications.active",
          JSON.stringify(preferences.notifications),
        );
        applyAppPreferences(preferences);
        window.dispatchEvent(
          new Event("libro-notification-preferences-change"),
        );
      })
      .catch(() => undefined);
  }, [user?.id]);
  useEffect(() => {
    const handler = (event: Event) => {
      const p = (event as CustomEvent<AppPreferences>).detail;
      if (!p) return;
      if (p.theme === "light" || p.theme === "dark") setTheme(p.theme);
      setCollapsed(p.compactSidebar);
      document.documentElement.dataset.dateFormat = p.dateFormat;
      document.documentElement.dataset.timezone = p.timezone;
      document.documentElement.dataset.currency = p.currency;
    };
    window.addEventListener("libro-preferences-change", handler);
    return () =>
      window.removeEventListener("libro-preferences-change", handler);
  }, []);

  const loadNotifications = async () => {
    if (!user) return;
    try {
      const workflowNotifications =
        await inventoryWorkflowService.notifications();
      let notificationPreferences: Record<string, boolean> = {};
      try {
        notificationPreferences = JSON.parse(
          localStorage.getItem("libro.notifications.active") ?? "{}",
        );
      } catch {
        notificationPreferences = {};
      }
      const notificationEnabled = (type: string) => {
        const key =
          type === "DIRECT_MESSAGE"
            ? "messages"
            : type.startsWith("INCIDENT")
              ? "spoilage"
              : type.includes("ANOMALY") || type.includes("VARIANCE")
                ? "variance"
                : type.includes("PURCHASE")
                  ? "purchaseOrders"
                  : type.includes("POS") || type.includes("SALES")
                    ? "sales"
                    : type.includes("FORECAST") || type.includes("PREDICTIVE")
                      ? "ai"
                      : "messages";
        return notificationPreferences[key] !== false;
      };
      setNotifs(
        workflowNotifications
          .filter((notification) => notificationEnabled(notification.type))
          .map((notification) => ({
            id: notification.id,
            cat:
              notification.type === "DIRECT_MESSAGE"
                ? "Message"
                : notification.type.startsWith("INCIDENT")
                  ? "Incident"
                  : notification.type.startsWith("MENU_PRODUCT")
                    ? "Menu & Recipe"
                    : notification.type.startsWith("POS_SALES")
                      ? "Sales Import"
                      : "Shrinkage",
            title: notification.title,
            body: notification.message,
            time: formatAppDate(notification.createdAt, true),
            read: Boolean(notification.readAt),
            icon:
              notification.type === "DIRECT_MESSAGE"
                ? "message"
                : notification.type.startsWith("INCIDENT")
                  ? "report"
                  : notification.type.startsWith("MENU_PRODUCT")
                    ? "menu"
                    : notification.type.startsWith("POS_SALES")
                      ? "sales"
                      : "shrink",
            entityId: notification.entityId,
            entityType: notification.entityType,
          })),
      );
    } catch {
      setNotifs([]);
    }
  };
  useEffect(() => {
    void loadNotifications();
    if (!user) return;
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void loadNotifications();
    };
    const timer = window.setInterval(refreshWhenVisible, 30000);
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [user?.id]);
  useEffect(() => {
    const refresh = () => void loadNotifications();
    window.addEventListener("libro-notification-preferences-change", refresh);
    return () =>
      window.removeEventListener(
        "libro-notification-preferences-change",
        refresh,
      );
  }, [user?.id]);

  const setPage = (nextPage: Page) => {
    setMobileNavOpen(false);
    navigate(pagePaths[nextPage as AppPage] ?? "/dashboard");
  };

  const handleLogin = async (
    identifier: string,
    password: string,
  ) => {
    const authenticatedUser = await login(identifier, password);
    navigate("/dashboard", { replace: true });
    toast.success(`Welcome back, ${authenticatedUser.firstName}`);
  };

  const handleLogout = async () => {
    await logout();
    setShowLogout(false);
    navigate("/login", { replace: true });
    toast.success("You have been logged out");
  };

  const renderPage = () => {
    switch (page) {
      case "dashboard":
        return (
          <DashboardPage
            role={role}
            scopeBranchId={branch}
            onNavigate={setPage}
            scopeBranchName={
              branches.find((item) => item.id === branch)?.name ??
              "All Branches"
            }
          />
        );
      case "sales":
        return (
          <COGSAndPosSalesModule
            role={role}
            initialTab="sales"
            scopeBranchName={
              branches.find((item) => item.id === branch)?.name ??
              "All Branches"
            }
          />
        );
      case "menu":
        return <Navigate to="/cogs/menu-recipes" replace />;
      case "recipe-reference":
        return <MenuRecipeManagementModule role={role} />;
      case "ingredient-usage":
        return <MenuRecipeManagementModule role={role} initialTab="usage" />;
      case "inventory":
        return (
          <InventoryManagementModule
            role={role}
            onNavigate={setPage}
            scopeBranchId={branch}
          />
        );
      case "physical-count":
        return (
          <InventoryManagementModule
            role={role}
            onNavigate={setPage}
            initialTab="counts"
            scopeBranchId={branch}
          />
        );
      case "physical-count-history":
        return (
          <PhysicalCountsModule
            role={role}
            initialTab="history"
            scopeBranchId={branch}
          />
        );
      case "expected-stock":
        return (
          <PhysicalCountsModule
            role={role}
            initialTab="expected"
            scopeBranchId={branch}
          />
        );
      case "stock-levels":
        return <InventoryManagementModule role={role} onNavigate={setPage} />;
      case "shrinkage":
        return <ShrinkagePage scopeBranchId={branch} />;
      case "variance":
        return <VariancePage scopeBranchId={branch} />;
      case "purchase-orders":
        return <PurchaseOrders role={role} scopeBranchId={branch} />;
      case "cogs":
        return (
          <COGSAndPosSalesModule
            role={role}
            scopeBranchName={
              branches.find((item) => item.id === branch)?.name ??
              "All Branches"
            }
          />
        );
      case "predictive":
        return (
          <PredictiveAnalytics
            role={role}
            scopeBranchId={branch === "ALL" ? undefined : branch}
            scopeBranchName={
              branches.find((item) => item.id === branch)?.name ??
              "All Branches"
            }
          />
        );
      case "reports":
        return (
          <Reports
            role={role}
            scopeBranchId={branch}
            scopeBranchName={
              branches.find((item) => item.id === branch)?.name ??
              "All Branches"
            }
          />
        );
      case "staff-monitoring":
        return <StaffMonitoringPage role={role} scopeBranchId={branch} />;
      case "users":
        return <UserManagementPage scopeBranchId={branch} />;
      case "branches":
        return <BranchManagementPage scopeBranchId={branch} />;
      case "master-data":
        return <MasterDataPage />;
      case "settings":
        return <AccountSettingsPage />;
      default:
        return <DashboardPage role={role} onNavigate={setPage} />;
    }
  };

  if (loading)
    return (
      <div
        className="h-screen flex items-center justify-center"
        style={{ color: C.maroon }}
      >
        Restoring your session…
      </div>
    );

  if (!user) {
    if (location.pathname !== "/login") return <Navigate to="/login" replace />;
    return (
      <>
        <RedesignedLoginPage onLogin={handleLogin} />
        <Toaster position="bottom-right" richColors />
      </>
    );
  }

  if (location.pathname === "/login" || location.pathname === "/")
    return <Navigate to="/dashboard" replace />;
  if (!isPageAllowed(page as AppPage, user.role))
    return <Navigate to="/dashboard" replace />;

  const notificationDrawers = (
    <>
      <NotifDrawer
        open={notifOpen}
        onClose={() => setNotifOpen(false)}
        notifs={notifs}
        markAllRead={() => {
          void inventoryWorkflowService.markAllNotificationsRead();
          setNotifs((current) =>
            current.map((notification) => ({ ...notification, read: true })),
          );
        }}
        onOpenNotification={(notification) => {
          if (!notification.read)
            void inventoryWorkflowService.markNotificationRead(notification.id);
          setNotifs((current) =>
            current.map((item) =>
              item.id === notification.id ? { ...item, read: true } : item,
            ),
          );
          setNotifOpen(false);
          if (notification.entityType === "MESSAGE") {
            setMessageTargetId(notification.entityId);
            setMessageOpen(true);
          } else if (!isStaff && notification.entityType === "MENU_ITEM")
            navigate("/cogs/menu-recipes");
          else if (!isStaff && notification.entityType === "POS_IMPORT")
            navigate("/sales");
          else if (!isStaff)
            navigate(
              notification.entityType === "INCIDENT_REPORT" &&
                notification.entityId
                ? `/shrinkage?incidentId=${notification.entityId}`
                : notification.entityId
                  ? `/shrinkage?reportId=${notification.entityId}`
                  : "/shrinkage",
            );
        }}
      />
      <MessageDrawer
        open={messageOpen}
        messageId={messageTargetId}
        onClose={() => {
          setMessageOpen(false);
          setMessageTargetId(null);
          void loadNotifications();
        }}
      />
      {showLogout && (
        <LogoutModal
          onConfirm={handleLogout}
          onCancel={() => setShowLogout(false)}
        />
      )}
    </>
  );

  if (isStaff)
    return (
      <div className="min-h-screen bg-[var(--app-bg)]">
        <Toaster position="bottom-right" richColors />
        <Suspense fallback={<ModuleLoadingFallback />}>
          {page === "settings" ? (
            <>
              <div className="sticky top-0 z-20 border-b border-[var(--app-border)] bg-[var(--app-surface)]">
                <div className="max-w-6xl mx-auto h-16 px-4 flex items-center">
                  <div className="rounded-2xl border border-[var(--app-primary)] bg-[var(--app-primary-subtle)] p-1 shadow-[0_5px_16px_rgba(123,30,43,.18)] ring-2 ring-[var(--app-primary-faint)]">
                    <button
                      onClick={() => navigate("/dashboard")}
                      aria-label="Back to Staff Portal"
                      title="Back to Staff Portal"
                      className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--app-surface)] text-xl font-bold text-[var(--app-primary)] transition-transform hover:scale-105"
                    >
                      ←
                    </button>
                  </div>
                </div>
              </div>
              <AccountSettingsPage onLogout={() => setShowLogout(true)} />
            </>
          ) : (
            <StaffPortalPage
              unreadCount={unread}
              messageUnreadCount={messageUnread}
              theme={theme}
              onBell={() => {
                setNotifOpen(true);
                void loadNotifications();
              }}
              onMessages={() => {
                setNotifOpen(false);
                setMessageTargetId(null);
                setMessageOpen(true);
              }}
              onSettings={() => navigate("/settings")}
              onLogout={() => setShowLogout(true)}
              onThemeToggle={() =>
                setTheme((current) => (current === "dark" ? "light" : "dark"))
              }
            />
          )}
        </Suspense>
        {notificationDrawers}
      </div>
    );

  return (
    <div
      className="app-shell flex h-screen overflow-hidden"
      style={{ fontFamily: "Inter, sans-serif", background: C.mainBg }}
    >
      <Toaster position="bottom-right" richColors />

      {mobileNavOpen && <button className="mobile-nav-backdrop" aria-label="Close navigation" onClick={() => setMobileNavOpen(false)} />}
      <div className="navigation-container" data-open={mobileNavOpen}>
      <Sidebar
        role={role}
        page={page}
        onNavigate={setPage}
        onCloseMobile={() => setMobileNavOpen(false)}
        collapsed={collapsed}
        onToggle={() => setCollapsed((p) => !p)}
      />
      </div>

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <TopHeader
          onMenu={() => setMobileNavOpen(true)}
          role={role}
          page={page}
          branch={branch}
          branches={branches}
          setBranch={setBranch}
          unreadCount={unread}
          onBell={() => {
            setNotifOpen(true);
            void loadNotifications();
          }}
          messageUnreadCount={messageUnread}
          onMessages={() => {
            setNotifOpen(false);
            setMessageTargetId(null);
            setMessageOpen(true);
          }}
          onNavigate={setPage}
          onSettings={() => navigate("/settings")}
          onLogout={() => setShowLogout(true)}
          theme={theme}
          onThemeToggle={() =>
            setTheme((current) => (current === "dark" ? "light" : "dark"))
          }
        />
        <main className="app-main flex-1 overflow-y-auto">
          <Suspense fallback={<ModuleLoadingFallback />}>
            <div key={page} className="route-page-transition">
              {renderPage()}
            </div>
          </Suspense>
        </main>
      </div>

      {notificationDrawers}
    </div>
  );
}
