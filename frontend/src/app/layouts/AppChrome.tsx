import React, { lazy, Suspense, useEffect, useState } from "react";
import {
  LayoutDashboard, Package, TrendingDown, FileText, Sparkles, Users, Building2, Settings,
  LogOut, Bell, Search, ChevronDown, ChevronRight, X, Coffee, MapPin, Shield,
  ChevronLeft, BarChart2, ClipboardList, Moon, Sun, MessageCircle, Lock, Info, Inbox, BookOpen, ShoppingCart,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import type { Page, Role } from "../types/navigation";
import { C, cn, getInitials, EmptyState, Btn, ModuleLoadingFallback, Select } from "../components/ModuleUi";

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

export const ownerNav = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "cogs-group", label: "Cost & Sales Management", icon: BarChart2, children: [
    { id: "cogs", label: "COGS & POS Sales" },
    { id: "recipe-reference", label: "Menu & Recipe Management" },
  ]},
  { id: "shrinkage-group", label: "Shrinkage Monitoring", icon: TrendingDown, children: [
    { id: "variance", label: "Variance & Discrepancies" },
    { id: "shrinkage", label: "Verified Classifications" },
  ]},
  { id: "inventory", label: "Inventory Management", icon: Package },
  { id: "purchase-orders", label: "Purchase Orders", icon: ClipboardList },
  { id: "predictive", label: "Predictive Analytics", icon: Sparkles },
  { id: "reports", label: "Reports", icon: FileText },
  { id: "staff-monitoring", label: "Staff Monitoring", icon: Users },
  { id: "__div" },
  { id: "users", label: "User Management", icon: Users },
  { id: "branches", label: "Branch Management", icon: Building2 },
  { id: "settings", label: "Settings", icon: Settings },
];

export const managerNav = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "cogs-group", label: "Cost & Sales Management", icon: BarChart2, children: [
    { id: "cogs", label: "COGS & POS Sales" },
    { id: "recipe-reference", label: "Menu & Recipe Management" },
  ]},
  { id: "shrinkage-group", label: "Shrinkage Monitoring", icon: TrendingDown, children: [
    { id: "variance", label: "Variance & Discrepancies" },
    { id: "shrinkage", label: "Classification Review" },
  ]},
  { id: "inventory", label: "Inventory Management", icon: Package },
  { id: "purchase-orders", label: "Purchase Orders", icon: ClipboardList },
  { id: "predictive", label: "Predictive Analytics", icon: Sparkles },
  { id: "reports", label: "Reports", icon: FileText },
  { id: "staff-monitoring", label: "Staff Monitoring", icon: Users },
  { id: "__div" },
  { id: "settings", label: "Settings", icon: Settings },
];

export function Sidebar({ role, page, onNavigate, onCloseMobile, collapsed, onToggle }: {
  role: Role; page: Page; onNavigate: (p: Page) => void; onCloseMobile?: () => void; collapsed: boolean; onToggle: () => void;
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
  const handleNav = (targetPage: Page) => {
    onNavigate(targetPage);
    onCloseMobile?.();
  };

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
        <button onClick={onCloseMobile}
          className="mobile-sidebar-close w-7 h-7 rounded-lg flex md:hidden items-center justify-center ml-auto flex-shrink-0"
          style={{ color: C.muted }} aria-label="Close navigation">
          <X size={16} />
        </button>
        <button onClick={onToggle}
          className="sidebar-collapse-button hidden md:flex w-6 h-6 rounded-md items-center justify-center ml-auto flex-shrink-0"
          style={{ color: C.muted }} aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}>
          {collapsed ? <ChevronRight size={13} /> : <ChevronLeft size={13} />}
        </button>
      </div>

      {/* Nav items */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-1.5">
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
                  <div className="ml-4 pl-3 border-l space-y-1 mt-2 mb-1" style={{ borderColor: C.border }}>
                    {item.children.map((child: any) => (
                      <button key={child.id} onClick={() => handleNav(child.id as Page)}
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
            <button key={item.id} onClick={() => handleNav(item.id as Page)}
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
  menu: "Menu & Recipe Management",
  inventory: "Inventory Management", "physical-count": "Inventory Counts",
  "physical-count-history": "Inventory Counts",
  "expected-stock": "Inventory Counts", "stock-levels": "Inventory Overview",
  "recipe-reference": "Menu & Recipe Management", "ingredient-usage": "Menu & Recipe Management",
  shrinkage: "Classification & Investigation", variance: "Variance & Discrepancies",
  "purchase-orders": "Purchase Orders", cogs: "COGS & POS Sales",
  predictive: "Predictive Analytics", reports: "Reports",
  "staff-monitoring": "Staff Monitoring",
  users: "User Management", branches: "Branch Management", settings: "Settings", "master-data": "Inventory Master Data",
};

type HeaderBranch = { id: string; name: string };

export function TopHeader({ role, page, branch, branches, setBranch, unreadCount, messageUnreadCount, onMessages, onBell, onNavigate, onSettings, onLogout, theme, onThemeToggle, onMenu }: {
  onMenu?: () => void;
  role: Role; page: Page; branch: string; branches: HeaderBranch[]; setBranch: (b: string) => void;
  unreadCount: number; messageUnreadCount: number; onMessages: () => void; onBell: () => void; onLogout: () => void;
  onNavigate: (page: Page) => void; onSettings: () => void;
  theme: ThemeMode; onThemeToggle: () => void;
}) {
  const { user } = useAuth();
  const [uMenuOpen, setUMenuOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const nav = role === "owner" ? ownerNav : managerNav;
  const searchItems = nav.flatMap((item: any) => item.children ?? (item.id === "__div" ? [] : [item]))
    .filter((item: any) => item.label.toLowerCase().includes(search.trim().toLowerCase()));
  const openSearchResult = (item: any) => {
    setSearch(item.label);
    setSearchOpen(false);
    onNavigate(item.id as Page);
  };

  return (
    <header className="app-header flex items-center px-6 border-b flex-shrink-0 relative z-10"
      style={{ height: C.headerHeight, background: C.surface, borderColor: C.border }}>
      <button type="button" className="mobile-nav-trigger" aria-label="Open navigation" onClick={onMenu}>☰</button>
      <div className="header-page-title min-w-0">
        <div className="text-lg font-bold leading-tight" style={{ color: C.primary }}>{pageTitles[page]}</div>
        <div className="text-xs mt-0.5 hidden sm:block" style={{ color: C.secondary }}>
          {page === "dashboard"
            ? role === "owner" ? "Monitor business performance across all branches." : "Monitor daily operations for your assigned branch."
            : "Libro Espresso management portal"}
        </div>
      </div>
      <div className="flex-1" />

      {/* Global search */}
      <form className="header-global-search relative mr-2" onSubmit={(event) => { event.preventDefault(); if (searchItems[0]) openSearchResult(searchItems[0]); }}>
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: C.muted }} />
        <input className="pl-8 pr-3 py-1.5 text-sm rounded-lg border outline-none transition-colors"
          style={{ borderColor: C.border, background: C.mainBg, width: 196, color: C.primary }}
          placeholder="Search…"
          value={search}
          onChange={(event) => { setSearch(event.target.value); setSearchOpen(true); }}
          onFocus={e => (e.target.style.borderColor = C.maroon)}
          onBlur={e => (e.target.style.borderColor = C.border)} />
        {searchOpen && search.trim() && (
          <>
            <button type="button" className="fixed inset-0 z-20 cursor-default" aria-label="Close search" onClick={() => setSearchOpen(false)} />
            <div className="app-popover absolute left-0 top-full mt-2 w-72 rounded-xl border shadow-xl py-1.5 z-30" style={{ background: C.surface, borderColor: C.border }}>
              {searchItems.length ? searchItems.slice(0, 7).map((item: any) => (
                <button type="button" key={item.id} onClick={() => openSearchResult(item)} className="w-full px-3 py-2.5 flex items-center gap-2 text-left text-sm hover:bg-[var(--app-surface-muted)]">
                  <Search size={13} style={{ color: C.maroon }} /><span>{item.label}</span>
                </button>
              )) : <p className="px-4 py-3 text-sm" style={{ color: C.muted }}>No matching module found.</p>}
            </div>
          </>
        )}
      </form>

      {/* Branch selector */}
      {role === "owner" ? (
        <div className="header-branch-selector mr-2">
          <Select value={branch} onChange={setBranch} small options={[{ value: "ALL", label: "All Branches" }, ...branches.map((item) => ({ value: item.id, label: item.name }))]}/>
        </div>
      ) : (
        <div className="header-branch-selector flex items-center gap-1.5 px-3 py-1.5 rounded-lg border mr-2 text-sm font-medium"
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
      <button type="button" className="header-info-button w-9 h-9 rounded-lg flex items-center justify-center mr-2 transition-colors"
        style={{ color: C.secondary }}
        onClick={() => setHelpOpen(true)}
        aria-label="Open system information" title="System information"
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
          <span className="header-profile-name text-sm font-medium">{user?.firstName} {user?.lastName?.[0]}.</span>
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
                style={{ color: C.primary }}
                onClick={() => { setUMenuOpen(false); onSettings(); }}>
                <Settings size={13} /> Profile &amp; Settings
              </button>
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
      {helpOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,.45)" }} onMouseDown={(event) => { if (event.target === event.currentTarget) setHelpOpen(false); }}>
          <div className="w-full max-w-md rounded-2xl border p-6 shadow-2xl" style={{ background: C.surface, borderColor: C.border }}>
            <div className="flex items-start justify-between gap-4">
              <div><h2 className="text-lg font-bold">Libro Espresso</h2><p className="text-sm mt-1" style={{ color: C.secondary }}>COGS, inventory, shrinkage, and branch operations platform.</p></div>
              <button onClick={() => setHelpOpen(false)} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: C.grayBg }} aria-label="Close information"><X size={15}/></button>
            </div>
            <div className="mt-5 rounded-xl p-4" style={{ background: C.mainBg }}>
              <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: C.muted }}>Current access</p>
              <p className="font-semibold mt-1">{role === "owner" ? "Owner · All branches" : `Manager · ${user?.branch?.name ?? "Assigned branch"}`}</p>
              <p className="text-xs mt-2 leading-relaxed" style={{ color: C.secondary }}>Use Search to open a module, the branch selector to scope Owner records, Messages for internal communication, and Notifications for operational updates.</p>
            </div>
            <button onClick={() => { setHelpOpen(false); onSettings(); }} className="mt-5 w-full py-2.5 rounded-xl text-sm font-semibold text-white" style={{ background: C.maroon }}>Open Profile &amp; Settings</button>
          </div>
        </div>
      )}
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
  menu: { Icon: BookOpen, bg: C.softMaroonBg, color: C.maroon },
  sales: { Icon: ShoppingCart, bg: C.softMaroonBg, color: C.maroon },
};

export function NotifDrawer({ open, onClose, notifs, markAllRead, onOpenNotification }: {
  open: boolean; onClose: () => void; notifs: AppNotification[]; markAllRead: () => void;
  onOpenNotification: (notification: AppNotification) => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 backdrop-blur-sm" style={{ background:"rgba(24,10,14,.55)" }} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-label="Notifications" className="w-full max-w-lg max-h-[82vh] overflow-hidden rounded-3xl border flex flex-col"
        style={{ background:"var(--app-surface)",borderColor:"var(--app-border)",boxShadow:"0 28px 80px rgba(43,14,22,.28)" }}>
        <div className="flex items-center justify-between px-5 sm:px-6 py-5 border-b" style={{ borderColor:"var(--app-border)",background:"linear-gradient(135deg,var(--app-primary-faint),var(--app-surface))" }}>
          <div>
            <div className="flex items-center gap-2.5"><span className="w-9 h-9 rounded-xl flex items-center justify-center text-white" style={{background:C.maroon}}><Bell size={16}/></span><h3 className="font-bold" style={{color:C.primary}}>Notifications</h3></div>
            <p className="text-xs mt-0.5" style={{ color: C.secondary }}>{notifs.filter(n => !n.read).length} unread</p>
          </div>
          <div className="flex items-center gap-2">
            {notifs.some(n => !n.read) && <button className="rounded-xl px-3 py-2 text-xs font-semibold" style={{color:C.maroon,background:"var(--app-primary-subtle)"}} onClick={markAllRead}>Mark all read</button>}
            <button onClick={onClose} className="w-9 h-9 rounded-xl flex items-center justify-center" style={{color:C.secondary,background:"var(--app-surface-muted)"}} aria-label="Close notifications">
              <X size={16} />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-2">
          {notifs.length === 0 ? (
            <EmptyState icon={Inbox} title="No notifications" body="All monitored items are currently within configured thresholds." />
          ) : notifs.map(n => {
            const ni = notifIcons[n.icon] || { Icon: Bell, bg: C.grayBg, color: C.secondary };
            return (
              <button type="button" key={n.id} className="w-full text-left flex gap-3.5 px-4 py-3.5 rounded-2xl border cursor-pointer transition-all hover:-translate-y-0.5"
                style={{borderColor:"var(--app-border)",background:!n.read?"var(--app-primary-faint)":"var(--app-surface-elevated)",boxShadow:"0 5px 16px rgba(43,14,22,.06)"}}
                onClick={() => onOpenNotification(n)}>
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
              </button>
            );
          })}
        </div>
      </section>
    </div>
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
