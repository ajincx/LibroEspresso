import React, { lazy, Suspense, useEffect, useState } from "react";
import {
  LayoutDashboard, Package, TrendingDown, FileText, Sparkles, Users, Building2, Settings,
  LogOut, Bell, Search, ChevronDown, ChevronRight, X, Coffee, MapPin, Shield,
  ChevronLeft, BarChart2, ClipboardList, Moon, Sun, MessageCircle, Lock, Info, Inbox,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import type { Page, Role } from "../types/navigation";
import { C, cn, getInitials, EmptyState, Btn, ModuleLoadingFallback } from "../components/ModuleUi";

const MessagesPanel = lazy(() => import("../modules/messages/MessagesPanel").then((module) => ({ default: module.MessagesPanel })));

type ThemeMode = "light" | "dark";
export type AppNotification = {
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

const ownerNav = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "cogs-group", label: "COGS Analysis", icon: BarChart2, children: [
    { id: "cogs", label: "COGS & POS Sales" },
    { id: "recipe-reference", label: "Standardized Recipes" },
  ]},
  { id: "shrinkage-group", label: "Shrinkage Monitoring", icon: TrendingDown, children: [
    { id: "variance", label: "Variance & Discrepancies" },
    { id: "shrinkage", label: "Verified Classifications" },
  ]},
  { id: "inventory", label: "Inventory Management", icon: Package },
  { id: "purchase-orders", label: "Purchase Orders", icon: ClipboardList },
  { id: "menu", label: "Menu & Standard Recipes", icon: Coffee },
  { id: "predictive", label: "Predictive Analytics", icon: Sparkles },
  { id: "reports", label: "Reports", icon: FileText },
  { id: "staff-monitoring", label: "Staff Monitoring", icon: Users },
  { id: "__div" },
  { id: "users", label: "User Management", icon: Users },
  { id: "branches", label: "Branch Management", icon: Building2 },
  { id: "settings", label: "Settings", icon: Settings },
];

const managerNav = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "cogs-group", label: "COGS Analysis", icon: BarChart2, children: [
    { id: "cogs", label: "COGS & POS Sales" },
    { id: "recipe-reference", label: "Standardized Recipes" },
  ]},
  { id: "shrinkage-group", label: "Shrinkage Monitoring", icon: TrendingDown, children: [
    { id: "variance", label: "Variance & Discrepancies" },
    { id: "shrinkage", label: "Classification Review" },
  ]},
  { id: "inventory", label: "Inventory Management", icon: Package },
  { id: "purchase-orders", label: "Purchase Orders", icon: ClipboardList },
  { id: "menu", label: "Menu & Standard Recipes", icon: Coffee },
  { id: "predictive", label: "Predictive Analytics", icon: Sparkles },
  { id: "reports", label: "Reports", icon: FileText },
  { id: "staff-monitoring", label: "Staff Monitoring", icon: Users },
  { id: "__div" },
  { id: "settings", label: "Settings", icon: Settings },
];

export function Sidebar({ role, page, onNavigate, collapsed, onToggle }: {
  role: Role; page: Page; onNavigate: (p: Page) => void; collapsed: boolean; onToggle: () => void;
}) {
  const { user } = useAuth();
  const [expanded, setExpanded] = useState<string[]>([]);
  const nav = role === "owner" ? ownerNav : managerNav;

  useEffect(() => {
    const activeGroup = nav.find((item: any) => item.children?.some((child: any) => child.id === page));
    if (activeGroup) setExpanded((current) => current.includes(activeGroup.id) ? current : [...current, activeGroup.id]);
  }, [nav, page]);

  const toggleGroup = (id: string) => setExpanded(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
  const isActive = (id: string) => id === page;

  return (
    <aside className="app-sidebar flex flex-col h-full relative z-10 flex-shrink-0"
      style={{ width: collapsed ? 64 : C.sidebarWidth, background: C.surface, borderRight: `1px solid ${C.border}`, transition: "width 0.2s ease" }}>
      {/* Logo */}
      <div className="flex items-center px-4 border-b flex-shrink-0" style={{ borderColor: C.border, height: C.headerHeight }}>
        <div className="sidebar-brand-mark w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: C.maroon }}>
          <Coffee size={17} color="#fff" />
        </div>
        {!collapsed && (
          <div className="ml-3 min-w-0 flex-1">
            <div className="text-sm font-bold leading-tight" style={{ color: C.primary }}>Libro Espresso</div>
            <div className="text-[10px] font-medium leading-tight mt-0.5" style={{ color: C.muted }}>COGS & Inventory Intel</div>
          </div>
        )}
        <button onClick={onToggle}
          className="sidebar-collapse-button w-6 h-6 rounded-md flex items-center justify-center ml-auto flex-shrink-0"
          style={{ color: C.muted }} aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}>
          {collapsed ? <ChevronRight size={13} /> : <ChevronLeft size={13} />}
        </button>
      </div>

      {/* Nav items */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {nav.map((item: any) => {
          if (item.id === "__div") return <div key={item.id} className="mx-2 my-2 border-t" style={{ borderColor: C.border }} />;

          if (item.children) {
            const isExp = expanded.includes(item.id);
            const anyActive = item.children.some((c: any) => isActive(c.id));
            return (
              <div key={item.id}>
                <button onClick={() => !collapsed && toggleGroup(item.id)}
                  className={`sidebar-nav-item w-full flex items-center gap-2.5 px-2.5 py-2.5 rounded-xl text-sm font-medium ${anyActive && collapsed ? "is-active" : anyActive ? "is-group-active" : ""}`}
                  title={collapsed ? item.label : undefined} aria-expanded={!collapsed ? isExp : undefined}>
                  <item.icon size={16} className="flex-shrink-0" />
                  {!collapsed && (
                    <>
                      <span className="flex-1 text-left">{item.label}</span>
                      <ChevronDown size={12} className="sidebar-group-chevron" style={{ transform: isExp ? "rotate(180deg)" : "" }} />
                    </>
                  )}
                </button>
                {!collapsed && isExp && (
                  <div className="ml-4 pl-3 border-l space-y-0.5 my-0.5" style={{ borderColor: C.border }}>
                    {item.children.map((child: any) => (
                      <button key={child.id} onClick={() => onNavigate(child.id as Page)}
                        className={`sidebar-nav-item sidebar-nav-child w-full text-left px-3 py-2 rounded-xl text-sm ${isActive(child.id) ? "is-active" : ""}`}
                        aria-current={isActive(child.id) ? "page" : undefined}>
                        {child.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          }

          const active = isActive(item.id);
          return (
            <button key={item.id} onClick={() => onNavigate(item.id as Page)}
              className={`sidebar-nav-item w-full flex items-center gap-2.5 px-2.5 py-2.5 rounded-xl text-sm font-medium relative ${active ? "is-active" : ""}`}
              title={collapsed ? item.label : undefined} aria-current={active ? "page" : undefined}>
              <item.icon size={16} className="flex-shrink-0" />
              {!collapsed && <span>{item.label}</span>}
              {active && collapsed && <span className="absolute right-2 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-white/85" />}
            </button>
          );
        })}
      </nav>

      {/* User profile */}
      <div className="border-t p-3 flex-shrink-0" style={{ borderColor: C.border }}>
        <div className="sidebar-profile flex items-center gap-2.5 rounded-xl p-1.5 -m-1.5">
          <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold text-white"
            style={{ background: C.maroon }}>
            {`${user?.firstName[0] ?? ""}${user?.lastName[0] ?? ""}`.toUpperCase()}
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold truncate" style={{ color: C.primary }}>{user?.firstName} {user?.lastName}</div>
              <div className="text-xs truncate" style={{ color: C.muted }}>{user?.position}</div>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

// ─── Top Header ────────────────────────────────────────────────────────────────
const pageTitles: Record<Page, string> = {
  login: "Login", dashboard: "Dashboard", sales: "COGS & POS Sales",
  menu: "Menu & Standard Recipes",
  inventory: "Inventory Management", "physical-count": "Inventory Counts",
  "physical-count-history": "Inventory Counts",
  "expected-stock": "Inventory Counts", "stock-levels": "Inventory Overview",
  "recipe-reference": "Standardized Recipes", "ingredient-usage": "Standardized Recipes",
  shrinkage: "Classification & Investigation", variance: "Variance & Discrepancies",
  "purchase-orders": "Purchase Orders", cogs: "COGS & POS Sales",
  predictive: "Predictive Analytics", reports: "Reports",
  "staff-monitoring": "Staff Monitoring",
  users: "User Management", branches: "Branch Management", settings: "Settings", "master-data": "Inventory Master Data",
};

export function TopHeader({ role, page, branch, setBranch, unreadCount, messageUnreadCount, onMessages, onBell, onLogout, theme, onThemeToggle }: {
  role: Role; page: Page; branch: string; setBranch: (b: string) => void;
  unreadCount: number; messageUnreadCount: number; onMessages: () => void; onBell: () => void; onLogout: () => void;
  theme: ThemeMode; onThemeToggle: () => void;
}) {
  const { user } = useAuth();
  const [uMenuOpen, setUMenuOpen] = useState(false);
  const branches = ["All Branches", "Gulod – Main", "Lipa", "Vermosa", "Tagaytay", "Evo"];

  return (
    <header className="app-header flex items-center px-6 border-b flex-shrink-0 relative z-10"
      style={{ height: C.headerHeight, background: C.surface, borderColor: C.border }}>
      <div className="min-w-0">
        <div className="text-lg font-bold leading-tight" style={{ color: C.primary }}>{pageTitles[page]}</div>
        <div className="text-xs mt-0.5 hidden sm:block" style={{ color: C.secondary }}>
          {page === "dashboard"
            ? role === "owner" ? "Monitor business performance across all branches." : "Monitor daily operations for your assigned branch."
            : "Libro Espresso management portal"}
        </div>
      </div>
      <div className="flex-1" />

      {/* Global search */}
      <div className="relative mr-2">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: C.muted }} />
        <input className="pl-8 pr-3 py-1.5 text-sm rounded-lg border outline-none transition-colors"
          style={{ borderColor: C.border, background: C.mainBg, width: 196, color: C.primary }}
          placeholder="Search…"
          onFocus={e => (e.target.style.borderColor = C.maroon)}
          onBlur={e => (e.target.style.borderColor = C.border)} />
      </div>

      {/* Branch selector */}
      {role === "owner" ? (
        <div className="relative mr-2">
          <select value={branch} onChange={e => setBranch(e.target.value)}
            className="appearance-none pl-3 pr-8 py-1.5 text-sm rounded-lg border outline-none font-medium cursor-pointer"
            style={{ borderColor: C.border, background: C.mainBg, color: C.primary }}>
            {branches.map(b => <option key={b}>{b}</option>)}
          </select>
          <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: C.muted }} />
        </div>
      ) : (
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border mr-2 text-sm font-medium"
          style={{ borderColor: C.border, background: C.mainBg, color: C.primary }}>
          <MapPin size={12} style={{ color: C.maroon }} />
          <span>{user?.branch?.name ?? "Assigned Branch"}</span>
          <Lock size={10} style={{ color: C.muted }} />
        </div>
      )}

      {/* Theme toggle — deliberately beside notifications. */}
      <button type="button" onClick={onThemeToggle}
        className="header-icon-button relative w-10 h-10 rounded-xl border flex items-center justify-center mr-1 transition-colors"
        style={{ color: C.secondary, borderColor: C.border, background: C.surface }}
        aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}>
        {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
      </button>

      {/* Messages are a global communication feature, not a navigation module. */}
      <button type="button" onClick={onMessages}
        className="header-icon-button relative w-10 h-10 rounded-xl border flex items-center justify-center mr-1 transition-colors"
        style={{ color: C.secondary, borderColor: C.border, background: C.surface }}
        aria-label="Open messages" title="Messages">
        <MessageCircle size={17} />
        {messageUnreadCount > 0 && <span className="absolute top-1.5 right-1.5 min-w-4 h-4 px-1 rounded-full text-[9px] font-bold flex items-center justify-center text-white" style={{ background: C.maroon }}>{messageUnreadCount}</span>}
      </button>

      {/* Bell */}
      <button onClick={onBell}
        className="header-icon-button relative w-10 h-10 rounded-xl border flex items-center justify-center mr-1 transition-colors"
        style={{ color: C.secondary, borderColor: C.border, background: C.surface }}
        aria-label="Open notifications" title="Notifications"
        onMouseEnter={e => (e.currentTarget.style.background = C.grayBg)}
        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
        <Bell size={17} />
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full text-[9px] font-bold flex items-center justify-center text-white"
            style={{ background: C.maroon }}>{unreadCount}</span>
        )}
      </button>

      {/* Help */}
      <button className="w-9 h-9 rounded-lg flex items-center justify-center mr-2 transition-colors"
        style={{ color: C.secondary }}
        onMouseEnter={e => (e.currentTarget.style.background = C.grayBg)}
        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
        <Info size={17} />
      </button>

      {/* User menu */}
      <div className="relative">
        <button onClick={() => setUMenuOpen(p => !p)}
          className="flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors"
          style={{ color: C.primary }}
          onMouseEnter={e => (e.currentTarget.style.background = C.grayBg)}
          onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
          <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold"
            style={{ background: C.maroon }}>
            {`${user?.firstName[0] ?? ""}${user?.lastName[0] ?? ""}`.toUpperCase()}
          </div>
          <span className="text-sm font-medium">{user?.firstName} {user?.lastName?.[0]}.</span>
          <ChevronDown size={12} style={{ color: C.muted }} />
        </button>
        {uMenuOpen && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setUMenuOpen(false)} />
            <div className="app-popover absolute right-0 top-full mt-1 w-52 bg-white border rounded-xl shadow-xl py-1.5 z-40" style={{ borderColor: C.border }}>
              <div className="px-3 py-2.5 border-b mb-1" style={{ borderColor: C.border }}>
                <div className="text-sm font-semibold" style={{ color: C.primary }}>{user?.firstName} {user?.lastName}</div>
                <div className="text-xs mt-0.5" style={{ color: C.muted }}>{user?.position}{user?.branch ? ` · ${user.branch.name}` : ""}</div>
              </div>
              <button className="w-full text-left px-3 py-2 text-sm flex items-center gap-2 transition-colors"
                style={{ color: C.red }}
                onMouseEnter={e => (e.currentTarget.style.background = C.redBg)}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                onClick={() => { setUMenuOpen(false); onLogout(); }}>
                <LogOut size={13} /> Log Out
              </button>
            </div>
          </>
        )}
      </div>
    </header>
  );
}

// ─── Notification Drawer ────────────────────────────────────────────────────────
const notifIcons: Record<string, { Icon: React.ElementType; bg: string; color: string }> = {
  po: { Icon: ClipboardList, bg: C.blueBg, color: C.blue },
  inv: { Icon: Package, bg: C.amberBg, color: C.amber },
  shrink: { Icon: TrendingDown, bg: C.redBg, color: C.red },
  ai: { Icon: Sparkles, bg: C.softMaroonBg, color: C.maroon },
  message: { Icon: MessageCircle, bg: C.softMaroonBg, color: C.maroon },
};

export function NotifDrawer({ open, onClose, notifs, markAllRead, onOpenNotification }: {
  open: boolean; onClose: () => void; notifs: AppNotification[]; markAllRead: () => void;
  onOpenNotification: (notification: AppNotification) => void;
}) {
  return (
    <>
      {open && <div className="fixed inset-0 z-40" onClick={onClose} />}
      <div className="app-drawer fixed right-0 top-0 h-full z-50 flex flex-col bg-white border-l"
        style={{ width: 384, borderColor: C.border, boxShadow: "-4px 0 24px rgba(0,0,0,0.08)", transform: open ? "translateX(0)" : "translateX(100%)", transition: "transform 0.2s ease" }}>
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: C.border }}>
          <div>
            <h3 className="font-semibold" style={{ color: C.primary }}>Notifications</h3>
            <p className="text-xs mt-0.5" style={{ color: C.secondary }}>{notifs.filter(n => !n.read).length} unread</p>
          </div>
          <div className="flex items-center gap-2">
            <button className="text-xs font-semibold" style={{ color: C.maroon }} onClick={markAllRead}>Mark all read</button>
            <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
              style={{ color: C.secondary }}
              onMouseEnter={e => (e.currentTarget.style.background = C.grayBg)}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
              <X size={14} />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {notifs.length === 0 ? (
            <EmptyState icon={Inbox} title="No notifications" body="All monitored items are currently within configured thresholds." />
          ) : notifs.map(n => {
            const ni = notifIcons[n.icon] || { Icon: Bell, bg: C.grayBg, color: C.secondary };
            return (
              <div key={n.id} className="flex gap-3 px-5 py-4 border-b cursor-pointer transition-colors"
                style={{ borderColor: C.border, background: !n.read ? C.veryLightMaroon : C.surface }}
                onClick={() => onOpenNotification(n)}
                onMouseEnter={e => (e.currentTarget.style.background = C.mainBg)}
                onMouseLeave={e => (e.currentTarget.style.background = !n.read ? C.veryLightMaroon : C.surface)}>
                <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: ni.bg }}>
                  <ni.Icon size={15} style={{ color: ni.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider" style={{ color: ni.color }}>{n.cat}</span>
                    {!n.read && <span className="w-2 h-2 rounded-full flex-shrink-0 mt-0.5" style={{ background: C.maroon }} />}
                  </div>
                  <p className="text-sm font-medium mt-0.5 leading-snug" style={{ color: C.primary }}>{n.title}</p>
                  <p className="text-xs mt-1 leading-relaxed" style={{ color: C.secondary }}>{n.body}</p>
                  <p className="text-xs mt-1.5" style={{ color: C.muted }}>{n.time}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

export function MessageDrawer({ open, onClose, messageId }: { open: boolean; onClose: () => void; messageId: string | null }) {
  return <>
    {open && <div className="fixed inset-0 z-40 bg-black/25" onClick={onClose}/>}
    <aside className="app-drawer fixed right-0 top-0 h-full z-50 flex flex-col border-l bg-[var(--app-surface)] border-[var(--app-border)]"
      style={{ width: "min(900px, 100vw)", boxShadow: "-8px 0 32px rgba(0,0,0,.12)", transform: open ? "translateX(0)" : "translateX(100%)", transition: "transform 200ms ease" }}>
      <header className="h-[72px] px-5 flex items-center justify-between border-b border-[var(--app-border)]">
        <div className="flex items-center gap-3"><div className="w-9 h-9 rounded-xl flex items-center justify-center bg-[var(--app-primary-subtle)] text-[var(--app-primary)]"><MessageCircle size={17}/></div><div><h2 className="font-semibold text-[var(--app-text)]">Messages</h2><p className="text-xs text-[var(--app-text-muted)]">Libro Espresso communication</p></div></div>
        <button onClick={onClose} className="w-9 h-9 rounded-xl flex items-center justify-center bg-[var(--app-surface-muted)] text-[var(--app-text-muted)]" aria-label="Close messages"><X size={16}/></button>
      </header>
      <div className="flex-1 min-h-0">
        {open && (
          <Suspense fallback={<ModuleLoadingFallback />}>
            <MessagesPanel embedded initialMessageId={messageId}/>
          </Suspense>
        )}
      </div>
    </aside>
  </>;
}

// ─── Login Page ────────────────────────────────────────────────────────────────

export function LogoutModal({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.45)" }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" style={{ border: `1px solid ${C.border}` }}>
        <div className="text-center mb-6">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-3" style={{ background: C.softMaroonBg }}>
            <LogOut size={20} style={{ color: C.maroon }} />
          </div>
          <h3 className="font-bold text-lg" style={{ color: C.primary }}>Log out?</h3>
          <p className="text-sm mt-1.5" style={{ color: C.secondary }}>Are you sure you want to end your current session?</p>
        </div>
        <div className="flex gap-3">
          <Btn variant="outline" onClick={onCancel}>Cancel</Btn>
          <button className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white" style={{ background: C.maroon }} onClick={onConfirm}>
            Log Out
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main App ──────────────────────────────────────────────────────────────────
