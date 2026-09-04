import React, { lazy, Suspense, useEffect, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router";
import { Toaster, toast } from "sonner";
import { useAuth } from "./contexts/AuthContext";
import { isPageAllowed, pageFromPath, pagePaths, type AppPage } from "./routes/routeConfig";
import { inventoryWorkflowService } from "./services/inventoryWorkflow.service";
import type { Page, Role } from "./types/navigation";
import { C, ModuleLoadingFallback } from "./components/ModuleUi";
import { Sidebar, TopHeader, NotifDrawer, MessageDrawer, LogoutModal } from "./layouts/AppChrome";
import { LoginPage as RedesignedLoginPage } from "./modules/authentication/LoginPage";

const DashboardPage = lazy(() => import("./modules/dashboard/DashboardPage").then((module) => ({ default: module.DashboardPage })));
const COGSAndPosSalesModule = lazy(() => import("./modules/cogs/CogsSalesModule").then((module) => ({ default: module.COGSAndPosSalesModule })));
const InventoryManagementModule = lazy(() => import("./modules/inventory/InventoryModule").then((module) => ({ default: module.InventoryManagementModule })));
const PhysicalCountsModule = lazy(() => import("./modules/inventory/InventoryModule").then((module) => ({ default: module.PhysicalCountsModule })));
const StandardizedRecipesModule = lazy(() => import("./modules/menu-recipes/RecipeReferenceModule").then((module) => ({ default: module.StandardizedRecipesModule })));
const PurchaseOrders = lazy(() => import("./modules/purchase-orders/PurchaseOrdersPage").then((module) => ({ default: module.PurchaseOrders })));
const PredictiveAnalytics = lazy(() => import("./modules/predictive/PredictiveAnalyticsPage").then((module) => ({ default: module.PredictiveAnalytics })));
const Reports = lazy(() => import("./modules/reports/ReportsPage").then((module) => ({ default: module.Reports })));
const UserManagementPage = lazy(() => import("./modules/users/UserManagementPage").then((module) => ({ default: module.UserManagementPage })));
const BranchManagementPage = lazy(() => import("./modules/branches/BranchManagementPage").then((module) => ({ default: module.BranchManagementPage })));
const MasterDataPage = lazy(() => import("./modules/inventory/InventoryMasterDataPage").then((module) => ({ default: module.MasterDataPage })));
const MenuRecipesPage = lazy(() => import("./modules/menu-recipes/MenuRecipesPage").then((module) => ({ default: module.MenuRecipesPage })));
const ShrinkagePage = lazy(() => import("./modules/shrinkage/ShrinkagePage").then((module) => ({ default: module.ShrinkagePage })));
const VariancePage = lazy(() => import("./modules/shrinkage/VariancePage").then((module) => ({ default: module.VariancePage })));
const AccountSettingsPage = lazy(() => import("./modules/settings/SettingsPage").then((module) => ({ default: module.SettingsPage })));
const StaffMonitoringPage = lazy(() => import("./modules/staff/StaffMonitoringPage").then((module) => ({ default: module.StaffMonitoringPage })));

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
  const page = pageFromPath(location.pathname) as Page;
  const [branch, setBranch] = useState("All Branches");
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("libro.sidebar.collapsed") === "true");
  const [notifOpen, setNotifOpen] = useState(false);
  const [messageOpen, setMessageOpen] = useState(false);
  const [messageTargetId, setMessageTargetId] = useState<string | null>(null);
  const [notifs, setNotifs] = useState(notificationsData);
  const [showLogout, setShowLogout] = useState(false);
  const [theme, setTheme] = useState<ThemeMode>(() =>
    localStorage.getItem("libro.theme") === "dark" ? "dark" : "light"
  );

  const unread = notifs.filter(n => !n.read).length;
  const messageUnread = notifs.filter(n => !n.read && n.entityType === "MESSAGE").length;

  useEffect(() => { localStorage.setItem("libro.sidebar.collapsed", String(collapsed)); }, [collapsed]);
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
    return () => window.removeEventListener("libro-theme-change", handleThemeChange);
  }, []);

  const loadNotifications = async () => {
    if (!user) return;
    try {
      const workflowNotifications = await inventoryWorkflowService.notifications();
      setNotifs(workflowNotifications.map((notification) => ({
        id: notification.id,
        cat: notification.type === "DIRECT_MESSAGE" ? "Message" : "Shrinkage",
        title: notification.title,
        body: notification.message,
        time: new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short" }).format(new Date(notification.createdAt)),
        read: Boolean(notification.readAt),
        icon: notification.type === "DIRECT_MESSAGE" ? "message" : "shrink",
        entityId: notification.entityId,
        entityType: notification.entityType,
      })));
    } catch { setNotifs([]); }
  };
  useEffect(() => {
    void loadNotifications();
    if (!user) return;
    const timer = window.setInterval(() => void loadNotifications(), 15000);
    return () => window.clearInterval(timer);
  }, [user?.id]);

  const setPage = (nextPage: Page) => navigate(pagePaths[nextPage as AppPage] ?? "/dashboard");

  const handleLogin = async (identifier: string, password: string, remember = false) => {
    const authenticatedUser = await login(identifier, password, remember);
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
      case "dashboard": return <DashboardPage role={role} onNavigate={setPage} />;
      case "sales": return <COGSAndPosSalesModule role={role} initialTab="sales" />;
      case "menu": return <MenuRecipesPage />;
      case "recipe-reference": return <StandardizedRecipesModule role={role} />;
      case "ingredient-usage": return <StandardizedRecipesModule role={role} initialTab="usage" />;
      case "inventory": return <InventoryManagementModule role={role} onNavigate={setPage} />;
      case "physical-count": return <PhysicalCountsModule role={role} initialTab="record" />;
      case "physical-count-history": return <PhysicalCountsModule role={role} initialTab="history" />;
      case "expected-stock": return <PhysicalCountsModule role={role} initialTab="expected" />;
      case "stock-levels": return <InventoryManagementModule role={role} onNavigate={setPage} />;
      case "shrinkage": return <ShrinkagePage />;
      case "variance": return <VariancePage />;
      case "purchase-orders": return <PurchaseOrders role={role} />;
      case "cogs": return <COGSAndPosSalesModule role={role} />;
      case "predictive": return <PredictiveAnalytics role={role} />;
      case "reports": return <Reports role={role} />;
      case "staff-monitoring": return <StaffMonitoringPage role={role} />;
      case "users": return <UserManagementPage />;
      case "branches": return <BranchManagementPage />;
      case "master-data": return <MasterDataPage />;
      case "settings": return <AccountSettingsPage />;
      default: return <DashboardPage role={role} onNavigate={setPage} />;
    }
  };

  if (loading) return <div className="h-screen flex items-center justify-center" style={{ color: C.maroon }}>Restoring your session…</div>;

  if (!user) {
    if (location.pathname !== "/login") return <Navigate to="/login" replace />;
    return (
      <>
        <RedesignedLoginPage onLogin={handleLogin} />
        <Toaster position="bottom-right" richColors />
      </>
    );
  }

  if (location.pathname === "/login" || location.pathname === "/") return <Navigate to="/dashboard" replace />;
  if (!isPageAllowed(page as AppPage, user.role)) return <Navigate to="/dashboard" replace />;

  return (
    <div className="app-shell flex h-screen overflow-hidden" style={{ fontFamily: "Inter, sans-serif", background: C.mainBg }}>
      <Toaster position="bottom-right" richColors />

      <Sidebar role={role} page={page} onNavigate={setPage} collapsed={collapsed} onToggle={() => setCollapsed(p => !p)} />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <TopHeader
          role={role} page={page} branch={branch} setBranch={setBranch}
          unreadCount={unread} onBell={() => { setNotifOpen(true); void loadNotifications(); }}
          messageUnreadCount={messageUnread} onMessages={() => { setNotifOpen(false); setMessageTargetId(null); setMessageOpen(true); }}
          onLogout={() => setShowLogout(true)}
          theme={theme} onThemeToggle={() => setTheme(current => current === "dark" ? "light" : "dark")}
        />
        <main className="app-main flex-1 overflow-y-auto">
          <Suspense fallback={<ModuleLoadingFallback />}>
            <div key={page} className="route-page-transition">
              {renderPage()}
            </div>
          </Suspense>
        </main>
      </div>

      <NotifDrawer open={notifOpen} onClose={() => setNotifOpen(false)}
        notifs={notifs}
        markAllRead={() => {
          void Promise.all(notifs.filter((notification) => !notification.read).map((notification) => inventoryWorkflowService.markNotificationRead(notification.id)));
          setNotifs((current) => current.map((notification) => ({ ...notification, read: true })));
        }}
        onOpenNotification={(notification) => {
          if (!notification.read) void inventoryWorkflowService.markNotificationRead(notification.id);
          setNotifs((current) => current.map((item) => item.id === notification.id ? { ...item, read: true } : item));
          setNotifOpen(false);
          if (notification.entityType === "MESSAGE") {
            setMessageTargetId(notification.entityId);
            setMessageOpen(true);
          } else navigate(notification.entityId ? `/shrinkage?reportId=${notification.entityId}` : "/shrinkage");
        }} />

      <MessageDrawer open={messageOpen} messageId={messageTargetId} onClose={() => { setMessageOpen(false); setMessageTargetId(null); void loadNotifications(); }}/>

      {showLogout && <LogoutModal onConfirm={handleLogout} onCancel={() => setShowLogout(false)} />}
    </div>
  );
}
