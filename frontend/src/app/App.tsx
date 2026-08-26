import React, { useState, useEffect } from "react";
import { Navigate, useLocation, useNavigate } from "react-router";
import { Toaster, toast } from "sonner";
import { useAuth } from "./contexts/AuthContext";
import { isPageAllowed, pageFromPath, pagePaths, type AppPage } from "./routes/routeConfig";
import { AdminUsersPage } from "./pages/admin/AdminUsersPage";
import { AdminBranchesPage } from "./pages/admin/AdminBranchesPage";
import { MasterDataPage } from "./pages/admin/MasterDataPage";
import { LoginPage as RedesignedLoginPage } from "./pages/auth/LoginPage";
import { MenuRecipesPage } from "./pages/catalog/MenuRecipesPage";
import { InventoryCountPage } from "./pages/inventory/InventoryCountPage";
import { ShrinkageWorkflowPage } from "./pages/inventory/ShrinkageWorkflowPage";
import { inventoryWorkflowService } from "./services/inventoryWorkflow.service";
import { masterDataService } from "./services/masterData.service";
import type { MenuItem } from "./types/masterData";
import {
  LayoutDashboard, ShoppingCart, Package, AlertTriangle,
  TrendingDown, FileText, BarChart3, Sparkles,
  Users, Building2, Settings, LogOut, Bell, Search,
  ChevronDown, ChevronRight, X, Plus, Upload,
  Download, Eye, Edit2, Check, XCircle, Clock,
  ArrowUp, ArrowDown, Coffee, MapPin, Shield,
  ChevronLeft, AlertCircle, CheckCircle, Info,
  TrendingUp, DollarSign, Activity, Lock,
  ClipboardList, GitCompare, BarChart2, Hash,
  Percent, Minus, RefreshCw, Filter, Calendar,
  Database, Inbox, ChevronUp, Moon, Sun, UtensilsCrossed
} from "lucide-react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, PieChart as RPieChart,
  Pie, Cell, AreaChart, Area, ComposedChart,
  ReferenceLine, LabelList
} from "recharts";

// ─── Color System ──────────────────────────────────────────────────────────────
const C = {
  maroon: "var(--app-primary)",
  deepMaroon: "var(--app-primary-deep)",
  maroonHover: "var(--app-primary-hover)",
  mediumMaroon: "var(--app-primary-soft)",
  softMaroonBg: "var(--app-primary-subtle)",
  veryLightMaroon: "var(--app-primary-faint)",
  mainBg: "var(--app-bg)",
  surface: "var(--app-surface)",
  primary: "var(--app-text)",
  secondary: "var(--app-text-muted)",
  muted: "var(--app-text-faint)",
  border: "var(--app-border)",
  green: "var(--app-success)",
  greenBg: "var(--app-success-bg)",
  greenLight: "var(--app-success-soft)",
  amber: "var(--app-warning)",
  amberBg: "var(--app-warning-bg)",
  red: "var(--app-danger)",
  redBg: "var(--app-danger-bg)",
  blue: "var(--app-info)",
  blueBg: "var(--app-info-bg)",
  grayBg: "var(--app-surface-muted)",
  sidebarWidth: 232,
  headerHeight: 72,
};

type ThemeMode = "light" | "dark";
type DashboardRange = "today" | "7d" | "30d" | "mtd" | "custom";
type DashboardComparison = "previous" | "lastMonth";

const dashboardRangeLabels: Record<DashboardRange, string> = {
  today: "Today",
  "7d": "Last 7 Days",
  "30d": "Last 30 Days",
  mtd: "Month to Date",
  custom: "Custom Range",
};

function dashboardPeriodLabel(range: DashboardRange, customStart?: string, customEnd?: string) {
  if (range === "today") return "Aug 26, 2026";
  if (range === "7d") return "Aug 20–26, 2026";
  if (range === "30d") return "Jul 28–Aug 26, 2026";
  if (range === "custom" && customStart && customEnd) return `${customStart} – ${customEnd}`;
  return "Aug 1–26, 2026";
}

function dashboardRangeFactor(range: DashboardRange) {
  return { today: 0.04, "7d": 0.27, "30d": 1.08, mtd: 1, custom: 0.62 }[range];
}

const formatPeso = (value: number) => `₱${Math.round(value).toLocaleString("en-PH")}`;

// ─── Types ─────────────────────────────────────────────────────────────────────
type Role = "owner" | "manager";
type Page =
  | "login" | "dashboard" | "sales" | "menu" | "inventory" | "physical-count"
  | "shrinkage" | "variance" | "purchase-orders" | "cogs"
  | "predictive" | "reports" | "users" | "branches" | "settings" | "master-data";

// ─── Mock Data ─────────────────────────────────────────────────────────────────
const salesTrend = [
  { date: "Aug 19", sales: 38200, cogs: 16400, gp: 21800 },
  { date: "Aug 20", sales: 41500, cogs: 17800, gp: 23700 },
  { date: "Aug 21", sales: 44200, cogs: 18900, gp: 25300 },
  { date: "Aug 22", sales: 39800, cogs: 17100, gp: 22700 },
  { date: "Aug 23", sales: 46100, cogs: 19800, gp: 26300 },
  { date: "Aug 24", sales: 52400, cogs: 22500, gp: 29900 },
  { date: "Aug 25", sales: 48700, cogs: 20900, gp: 27800 },
];

const kpiSparklines: Record<string, number[]> = {
  sales: [850, 890, 920, 880, 960, 1020, 1120],
  cogs: [380, 400, 415, 395, 430, 458, 482],
  profit: [470, 490, 505, 485, 530, 562, 638],
  inventory: [320, 318, 315, 320, 316, 314, 312],
  shrinkage: [14, 15, 16, 17, 16, 17, 18],
};

const branchPerf = [
  { branch: "Gulod", sales: 285400, cogs: 122500, margin: 57.1, shrinkage: 4200 },
  { branch: "Lipa", sales: 241800, cogs: 103800, margin: 57.1, shrinkage: 3600 },
  { branch: "Vermosa", sales: 198700, cogs: 85300, margin: 57.1, shrinkage: 5100 },
  { branch: "Tagaytay", sales: 221500, cogs: 95100, margin: 57.0, shrinkage: 2900 },
  { branch: "Evo", sales: 173100, cogs: 74300, margin: 57.1, shrinkage: 2650 },
];

const shrinkageBreakdown = [
  { name: "Spoilage", value: 7840, pct: 42.5, color: C.amber },
  { name: "Wastage", value: 5920, pct: 32.1, color: C.blue },
  { name: "Potential Pilferage", value: 4690, pct: 25.4, color: C.red },
];

const inventoryStatus = [
  { name: "Healthy", value: 178, color: C.green },
  { name: "Low Stock", value: 34, color: C.amber },
  { name: "Critical", value: 12, color: C.red },
  { name: "Out of Stock", value: 4, color: C.deepMaroon },
];

const inventoryItems = [
  { sku: "RM-001", name: "Whole Milk", cat: "Dairy", onHand: 45, unit: "L", unitCost: 140, value: 6300, reorder: 60, status: "low", lastCount: "Aug 25" },
  { sku: "RM-002", name: "Arabica Coffee Beans", cat: "Coffee", onHand: 12, unit: "kg", unitCost: 760, value: 9120, reorder: 20, status: "critical", lastCount: "Aug 25" },
  { sku: "RM-003", name: "Almond Milk", cat: "Dairy Alt", onHand: 68, unit: "L", unitCost: 190, value: 12920, reorder: 40, status: "healthy", lastCount: "Aug 25" },
  { sku: "RM-004", name: "Croissants", cat: "Bakery", onHand: 24, unit: "pcs", unitCost: 85, value: 2040, reorder: 30, status: "low", lastCount: "Aug 24" },
  { sku: "RM-005", name: "Butter", cat: "Dairy", onHand: 0, unit: "kg", unitCost: 420, value: 0, reorder: 10, status: "out", lastCount: "Aug 24" },
  { sku: "RM-006", name: "Espresso Blend Beans", cat: "Coffee", onHand: 28, unit: "kg", unitCost: 820, value: 22960, reorder: 25, status: "healthy", lastCount: "Aug 25" },
  { sku: "RM-007", name: "Oat Milk", cat: "Dairy Alt", onHand: 52, unit: "L", unitCost: 210, value: 10920, reorder: 35, status: "healthy", lastCount: "Aug 25" },
  { sku: "RM-008", name: "White Sugar", cat: "Sweeteners", onHand: 8, unit: "kg", unitCost: 90, value: 720, reorder: 15, status: "critical", lastCount: "Aug 25" },
];

const varianceRows = [
  { sku: "RM-001", item: "Whole Milk", expected: 120, actual: 108, unit: "L", variance: -12, pct: -10.0, value: -1680, classification: "Needs Review", status: "needs_review" },
  { sku: "RM-002", item: "Arabica Beans", expected: 45, actual: 38, unit: "kg", variance: -7, pct: -15.6, value: -5320, classification: "Investigation Required", status: "investigation" },
  { sku: "RM-003", item: "Almond Milk", expected: 80, actual: 82, unit: "L", variance: 2, pct: 2.5, value: 280, classification: "Excess", status: "matched" },
  { sku: "RM-004", item: "Croissants", expected: 60, actual: 55, unit: "pcs", variance: -5, pct: -8.3, value: -750, classification: "Explained (Wastage)", status: "explained" },
  { sku: "RM-005", item: "Butter", expected: 24, actual: 24, unit: "kg", variance: 0, pct: 0, value: 0, classification: "Matched", status: "matched" },
  { sku: "RM-006", item: "Sugar", expected: 36, actual: 34, unit: "kg", variance: -2, pct: -5.6, value: -180, classification: "Needs Review", status: "needs_review" },
];

const shrinkageRows = [
  { date: "Aug 25", sku: "RM-001", item: "Whole Milk", branch: "Lipa", expected: 120, actual: 108, variance: -12, classification: "Spoilage", value: 1680, reason: "Temperature issue", recordedBy: "M. Santos", status: "Recorded" },
  { date: "Aug 25", sku: "RM-002", item: "Arabica Beans", branch: "Vermosa", expected: 45, actual: 38, variance: -7, classification: "Potential Pilferage", value: 5320, reason: "Unexplained after reconciliation", recordedBy: "System", status: "Investigation Required" },
  { date: "Aug 24", sku: "RM-004", item: "Croissants", branch: "Lipa", expected: 60, actual: 55, variance: -5, classification: "Wastage", value: 425, reason: "Overproduction", recordedBy: "M. Santos", status: "Recorded" },
  { date: "Aug 24", sku: "RM-008", item: "White Sugar", branch: "Gulod", expected: 36, actual: 33, variance: -3, classification: "Wastage", value: 270, reason: "Spillage during prep", recordedBy: "A. Reyes", status: "Recorded" },
  { date: "Aug 23", sku: "RM-003", item: "Almond Milk", branch: "Tagaytay", expected: 80, actual: 77, variance: -3, classification: "Spoilage", value: 570, reason: "Expired stock", recordedBy: "J. Lim", status: "Recorded" },
];

const purchaseOrders = [
  { id: "PR-2026-0042", branch: "Lipa", supplier: "Metro Dairy Supply", date: "Aug 25, 2026", items: 6, total: 28400, status: "pending", requestedBy: "Maria Santos", aiMatch: true },
  { id: "PR-2026-0041", branch: "Vermosa", supplier: "PH Coffee Traders", date: "Aug 24, 2026", items: 3, total: 41200, status: "pending", requestedBy: "Juan Cruz", aiMatch: false },
  { id: "PR-2026-0040", branch: "Gulod", supplier: "Metro Dairy Supply", date: "Aug 23, 2026", items: 8, total: 34600, status: "approved", requestedBy: "Ana Reyes", aiMatch: true },
  { id: "PR-2026-0039", branch: "Tagaytay", supplier: "Artisan Bakers PH", date: "Aug 22, 2026", items: 4, total: 18900, status: "completed", requestedBy: "Jose Lim", aiMatch: true },
  { id: "PR-2026-0038", branch: "Evo", supplier: "Sysco Philippines", date: "Aug 21, 2026", items: 5, total: 22100, status: "rejected", requestedBy: "Rosa Dela Cruz", aiMatch: false },
];

const userList = [
  { id: 1, name: "Carlos Mendoza", email: "carlos@libroespresso.com", role: "Owner", branch: "All Branches", status: "active", lastLogin: "Aug 26, 2026 08:14" },
  { id: 2, name: "Maria Santos", email: "m.santos@libroespresso.com", role: "Branch Manager", branch: "Lipa", status: "active", lastLogin: "Aug 26, 2026 07:52" },
  { id: 3, name: "Juan Cruz", email: "j.cruz@libroespresso.com", role: "Branch Manager", branch: "Vermosa", status: "active", lastLogin: "Aug 25, 2026 18:30" },
  { id: 4, name: "Ana Reyes", email: "a.reyes@libroespresso.com", role: "Branch Manager", branch: "Gulod – Main", status: "active", lastLogin: "Aug 26, 2026 09:01" },
  { id: 5, name: "Jose Lim", email: "j.lim@libroespresso.com", role: "Branch Manager", branch: "Tagaytay", status: "active", lastLogin: "Aug 24, 2026 16:44" },
  { id: 6, name: "Rosa Dela Cruz", email: "r.delacruz@libroespresso.com", role: "Branch Manager", branch: "Evo", status: "inactive", lastLogin: "Aug 20, 2026 11:22" },
];

const branchList = [
  { code: "GLD", name: "Gulod – Main Branch", loc: "Batangas City", manager: "Ana Reyes", status: "active", invValue: 68400, sales: 285400, shrinkageRate: 1.47, lastSync: "2 min ago" },
  { code: "LPA", name: "Lipa Branch", loc: "Lipa City, Batangas", manager: "Maria Santos", status: "active", invValue: 57800, sales: 241800, shrinkageRate: 1.49, lastSync: "5 min ago" },
  { code: "VRM", name: "Vermosa Branch", loc: "Imus, Cavite", manager: "Juan Cruz", status: "active", invValue: 52100, sales: 198700, shrinkageRate: 2.57, lastSync: "12 min ago" },
  { code: "TAG", name: "Tagaytay Branch", loc: "Tagaytay City, Cavite", manager: "Jose Lim", status: "active", invValue: 61300, sales: 221500, shrinkageRate: 1.31, lastSync: "8 min ago" },
  { code: "EVO", name: "Evo Branch", loc: "Trece Martires, Cavite", manager: "Rosa Dela Cruz", status: "active", invValue: 44700, sales: 173100, shrinkageRate: 1.53, lastSync: "31 min ago" },
];

type AppNotification = {
  id: string;
  cat: string;
  title: string;
  body: string;
  time: string;
  read: boolean;
  icon: string;
  entityId: string | null;
};

const notificationsData: AppNotification[] = [];

const aiInsights = [
  { id: 1, title: "Whole Milk demand likely to rise", desc: "Avg daily usage increased 14% over the last two weeks. Lipa may reach reorder threshold within 3 days.", metric: "↑ 14% avg daily usage", action: "Consider ordering approx. 24 L for Lipa.", urgency: "high" },
  { id: 2, title: "Vermosa wastage rate above threshold", desc: "Wastage at Vermosa is 2.57% of inventory value, significantly above the 1.5% branch average.", metric: "2.57% vs 1.5% avg", action: "Review preparation procedures at Vermosa.", urgency: "medium" },
  { id: 3, title: "Arabica Beans: reorder in 4 days", desc: "Current stock at Lipa (12 kg) and avg daily consumption of 2.8 kg suggests depletion before next delivery.", metric: "12 kg on hand / 2.8 kg per day", action: "Review PR-2026-0042 pending approval.", urgency: "high" },
  { id: 4, title: "Weekend sales uplift forecast — Tagaytay", desc: "Historical data shows 18–22% weekend sales uplift at Tagaytay. Weather forecast may boost this further.", metric: "+18–22% weekend uplift", action: "Ensure adequate stock by Friday.", urgency: "low" },
];

const cogsTrend = [
  { month: "Mar", theo: 95800, actual: 98200, margin: 57.4 },
  { month: "Apr", theo: 98400, actual: 101500, margin: 57.1 },
  { month: "May", theo: 102100, actual: 104800, margin: 56.9 },
  { month: "Jun", theo: 99700, actual: 102100, margin: 57.2 },
  { month: "Jul", theo: 106200, actual: 109400, margin: 56.8 },
  { month: "Aug", theo: 112300, actual: 115600, margin: 56.6 },
];

const topProducts = [
  { product: "Espresso Blend", sales: 187400, pct: 100 },
  { product: "Whole Milk", sales: 162300, pct: 87 },
  { product: "Croissants", sales: 98700, pct: 53 },
  { product: "Almond Milk Latte", sales: 87200, pct: 47 },
  { product: "Sandwich Bread", sales: 74100, pct: 40 },
];

// ─── Utility ───────────────────────────────────────────────────────────────────
function cn(...cls: (string | boolean | undefined)[]) {
  return cls.filter(Boolean).join(" ");
}

function getInitials(name: string) {
  return name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
}

// ─── Skeleton Components ───────────────────────────────────────────────────────
function SkeletonBlock({ w = "100%", h = 16, className = "" }: { w?: string | number; h?: number; className?: string }) {
  return (
    <div
      className={cn("rounded animate-pulse", className)}
      style={{ width: w, height: h, background: "linear-gradient(90deg, #F0F1F4 25%, #E8E9ED 50%, #F0F1F4 75%)", backgroundSize: "200% 100%" }}
    />
  );
}

function SkeletonKPICard() {
  return (
    <div className="bg-white rounded-xl border p-5 flex flex-col gap-3" style={{ borderColor: C.border }}>
      <div className="flex items-start justify-between">
        <SkeletonBlock w={80} h={11} />
        <SkeletonBlock w={32} h={32} className="rounded-lg" />
      </div>
      <SkeletonBlock w={120} h={28} />
      <SkeletonBlock w={100} h={11} />
    </div>
  );
}

function SkeletonTable({ rows = 5, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <div className="p-1">
      <div className="flex gap-3 px-4 py-3 border-b mb-1" style={{ borderColor: C.border }}>
        {Array.from({ length: cols }).map((_, i) => <SkeletonBlock key={i} w={`${100 / cols}%`} h={11} />)}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-3 px-4 py-3.5 border-b" style={{ borderColor: C.border }}>
          {Array.from({ length: cols }).map((_, c) => <SkeletonBlock key={c} w={c === 0 ? "35%" : `${65 / (cols - 1)}%`} h={13} />)}
        </div>
      ))}
    </div>
  );
}

// ─── Status Chip ───────────────────────────────────────────────────────────────
const statusMap: Record<string, { label: string; bg: string; color: string }> = {
  healthy: { label: "Healthy", bg: C.greenBg, color: C.green },
  low: { label: "Low Stock", bg: C.amberBg, color: C.amber },
  critical: { label: "Critical", bg: C.redBg, color: C.red },
  out: { label: "Out of Stock", bg: "#FDE8E8", color: C.deepMaroon },
  draft: { label: "Draft", bg: C.grayBg, color: C.secondary },
  pending: { label: "Pending Approval", bg: C.amberBg, color: C.amber },
  approved: { label: "Approved", bg: C.greenBg, color: C.green },
  rejected: { label: "Rejected", bg: C.redBg, color: C.red },
  completed: { label: "Completed", bg: "#E3F5FF", color: "#1A6FA0" },
  matched: { label: "Matched", bg: C.greenBg, color: C.green },
  explained: { label: "Explained", bg: C.blueBg, color: C.blue },
  needs_review: { label: "Needs Review", bg: C.amberBg, color: C.amber },
  investigation: { label: "Investigation Required", bg: C.redBg, color: C.red },
  active: { label: "Active", bg: C.greenBg, color: C.green },
  inactive: { label: "Inactive", bg: C.grayBg, color: C.secondary },
  imported: { label: "Imported", bg: C.greenBg, color: C.green },
  failed: { label: "Failed", bg: C.redBg, color: C.red },
  duplicate: { label: "Duplicate", bg: C.grayBg, color: C.secondary },
  high: { label: "High", bg: C.redBg, color: C.red },
  medium: { label: "Medium", bg: C.amberBg, color: C.amber },
  low_urgency: { label: "Low", bg: C.greenBg, color: C.green },
  warning: { label: "Warning", bg: C.amberBg, color: C.amber },
};

function StatusChip({ status }: { status: string }) {
  const v = statusMap[status] || { label: status, bg: C.grayBg, color: C.secondary };
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap"
      style={{ background: v.bg, color: v.color }}>
      {v.label}
    </span>
  );
}

// ─── KPI Card ──────────────────────────────────────────────────────────────────
function KPICard({ label, value, change, changeDir, sub, color = C.maroon, icon: Icon, sparkData: _sparkData, comparisonLabel = "previous period", onClick, active = false }: {
  label: string; value: string; change?: string; changeDir?: "up" | "down" | "neutral";
  sub?: string; color?: string; icon?: React.ElementType; sparkData?: number[]; comparisonLabel?: string;
  onClick?: () => void; active?: boolean;
}) {
  const isPositiveChange = changeDir === "up";
  const isNegativeChange = changeDir === "down";
  const changeColor = isPositiveChange ? C.green : isNegativeChange ? C.red : C.secondary;

  return (
    <div className={cn("app-card kpi-card relative overflow-hidden bg-white rounded-2xl border p-5 flex flex-col gap-3", onClick && "cursor-pointer")}
      style={{ borderColor: active ? color : C.border, boxShadow: active ? `0 0 0 2px color-mix(in srgb, ${color} 14%, transparent)` : undefined }}
      onClick={onClick} role={onClick ? "button" : undefined} tabIndex={onClick ? 0 : undefined}
      aria-pressed={onClick ? active : undefined}
      onKeyDown={event => { if (onClick && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); onClick(); } }}>
      <span className="absolute inset-x-0 top-0 h-0.5" style={{ background: color }} />
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider leading-tight" style={{ color: C.secondary }}>
          {label}
        </span>
        {Icon && (
          <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-semibold uppercase tracking-wide"
            style={{ background: `color-mix(in srgb, ${color} 10%, transparent)`, color }}>
            <Icon size={12} strokeWidth={1.8} />
            <span>{label.includes("Sales") ? "Revenue" : label.includes("COGS") ? "Direct costs" : label.includes("Margin") || label.includes("Profit") ? "Margin" : label.includes("Shrinkage") ? "Variance" : "Overview"}</span>
          </div>
        )}
      </div>
      <div>
        <div className="text-[28px] font-bold leading-tight tracking-tight" style={{ color: C.primary }}>{value}</div>
        {sub && <div className="text-xs mt-1.5" style={{ color: C.muted }}>{sub}</div>}
      </div>
      {change && (
        <div className="flex items-center gap-1.5 text-xs font-medium pt-2.5 mt-auto border-t" style={{ borderColor: C.border, color: changeColor }}>
          {isPositiveChange ? <ArrowUp size={11} /> : isNegativeChange ? <ArrowDown size={11} /> : <Minus size={11} />}
          <span>{change} vs {comparisonLabel}</span>
        </div>
      )}
    </div>
  );
}

// ─── Card & Layout Primitives ──────────────────────────────────────────────────
function Card({ children, className = "", padding = true, style = {} }: { children: React.ReactNode; className?: string; padding?: boolean; style?: React.CSSProperties }) {
  return (
    <div className={cn("app-card bg-white rounded-2xl border", padding ? "p-5" : "", className)}
      style={{ borderColor: C.border, ...style }}>
      {children}
    </div>
  );
}

function SectionHeader({ title, sub, actions }: { title: string; sub?: string; actions?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between mb-5 gap-4">
      <div>
        <h1 className="text-xl font-bold" style={{ color: C.primary }}>{title}</h1>
        {sub && <p className="text-sm mt-0.5" style={{ color: C.secondary }}>{sub}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
    </div>
  );
}

// ─── Button ────────────────────────────────────────────────────────────────────
function Btn({ children, variant = "primary", size = "md", onClick, icon: Icon, disabled, className = "" }: {
  children?: React.ReactNode; variant?: "primary" | "secondary" | "outline" | "ghost" | "danger";
  size?: "sm" | "md" | "lg"; onClick?: () => void; icon?: React.ElementType; disabled?: boolean; className?: string;
}) {
  const vstyle: Record<string, React.CSSProperties> = {
    primary: { background: C.maroon, color: "#fff", border: "1px solid transparent" },
    secondary: { background: C.softMaroonBg, color: C.maroon, border: `1px solid transparent` },
    outline: { background: C.surface, color: C.primary, border: `1px solid ${C.border}` },
    ghost: { background: "transparent", color: C.secondary, border: "1px solid transparent" },
    danger: { background: C.red, color: "#fff", border: "1px solid transparent" },
  };
  const sclass = { sm: "px-2.5 py-1.5 text-xs gap-1.5", md: "px-3.5 py-2 text-sm gap-2", lg: "px-5 py-2.5 text-sm gap-2" };
  return (
    <button onClick={onClick} disabled={disabled}
      className={cn("inline-flex items-center font-medium rounded-lg transition-opacity hover:opacity-85 active:opacity-75",
        sclass[size], disabled && "opacity-40 cursor-not-allowed", className)}
      style={vstyle[variant]}>
      {Icon && <Icon size={size === "sm" ? 13 : 14} />}
      {children}
    </button>
  );
}

// ─── Form Controls ─────────────────────────────────────────────────────────────
function SearchInput({ placeholder = "Search...", width = 220, value, onChange }: { placeholder?: string; width?: number; value?: string; onChange?: (value: string) => void }) {
  return (
    <div className="relative">
      <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: C.muted }} />
      <input className="pl-8 pr-3 py-2 text-sm rounded-lg border outline-none transition-colors"
        style={{ borderColor: C.border, color: C.primary, width }}
        placeholder={placeholder} value={value} onChange={event => onChange?.(event.target.value)}
        onFocus={e => (e.target.style.borderColor = C.maroon)}
        onBlur={e => (e.target.style.borderColor = C.border)} />
    </div>
  );
}

function Select({ options, value, onChange, small }: { options: string[]; value?: string; onChange?: (v: string) => void; small?: boolean }) {
  return (
    <div className="relative">
      <select className={cn("appearance-none pl-3 pr-8 rounded-lg border outline-none cursor-pointer transition-colors",
        small ? "py-1.5 text-xs" : "py-2 text-sm")}
        style={{ borderColor: C.border, background: C.surface, color: C.primary }}
        value={value}
        onChange={e => onChange?.(e.target.value)}>
        {options.map(o => <option key={o}>{o}</option>)}
      </select>
      <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: C.muted }} />
    </div>
  );
}

// ─── Table Primitives ──────────────────────────────────────────────────────────
function DashboardFilters({ range, comparison, customStart, customEnd, onRangeChange, onComparisonChange, onApplyCustom, onReset }: {
  range: DashboardRange;
  comparison: DashboardComparison;
  customStart: string;
  customEnd: string;
  onRangeChange: (range: DashboardRange) => void;
  onComparisonChange: (comparison: DashboardComparison) => void;
  onApplyCustom: (start: string, end: string) => void;
  onReset: () => void;
}) {
  const [draftStart, setDraftStart] = useState(customStart);
  const [draftEnd, setDraftEnd] = useState(customEnd);

  return (
    <div className="dashboard-filters flex items-center gap-2 flex-wrap justify-end">
      <div className="filter-control relative">
        <Calendar size={13} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: C.maroon }} />
        <select value={range} onChange={event => onRangeChange(event.target.value as DashboardRange)}
          className="appearance-none pl-8 pr-8 py-2 text-xs font-semibold rounded-xl border outline-none cursor-pointer"
          style={{ background: C.surface, borderColor: C.border, color: C.primary }} aria-label="Dashboard date range">
          {(Object.entries(dashboardRangeLabels) as [DashboardRange, string][]).map(([option, label]) => (
            <option key={option} value={option}>{label}</option>
          ))}
        </select>
        <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: C.muted }} />
      </div>
      <div className="filter-control relative">
        <GitCompare size={13} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: C.muted }} />
        <select value={comparison} onChange={event => onComparisonChange(event.target.value as DashboardComparison)}
          className="appearance-none pl-8 pr-8 py-2 text-xs font-semibold rounded-xl border outline-none cursor-pointer"
          style={{ background: C.surface, borderColor: C.border, color: C.primary }} aria-label="Dashboard comparison period">
          <option value="previous">vs Previous Period</option>
          <option value="lastMonth">vs Last Month</option>
        </select>
        <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: C.muted }} />
      </div>
      {range === "custom" && (
        <div className="custom-range-controls flex items-center gap-2 p-1 rounded-xl border" style={{ borderColor: C.border, background: C.surface }}>
          <input type="date" value={draftStart} max={draftEnd} onChange={event => setDraftStart(event.target.value)}
            className="px-2 py-1 text-xs rounded-lg border" aria-label="Custom range start date" />
          <span className="text-xs" style={{ color: C.muted }}>to</span>
          <input type="date" value={draftEnd} min={draftStart} onChange={event => setDraftEnd(event.target.value)}
            className="px-2 py-1 text-xs rounded-lg border" aria-label="Custom range end date" />
          <button type="button" onClick={() => onApplyCustom(draftStart, draftEnd)} disabled={!draftStart || !draftEnd}
            className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-40" style={{ background: C.maroon }}>Apply</button>
          <button type="button" onClick={() => { setDraftStart("2026-08-01"); setDraftEnd("2026-08-26"); onReset(); }}
            className="px-2 py-1.5 text-xs font-semibold" style={{ color: C.secondary }}>Reset</button>
        </div>
      )}
      <span className="period-pill px-3 py-2 rounded-xl text-xs font-medium border" style={{ color: C.secondary, borderColor: C.border, background: C.mainBg }}>
        {dashboardPeriodLabel(range, customStart, customEnd)}
      </span>
    </div>
  );
}

function THead({ cols }: { cols: string[] }) {
  return (
    <thead style={{ background: C.mainBg }}>
      <tr>
        {cols.map(c => (
          <th key={c} className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide border-b whitespace-nowrap"
            style={{ color: C.secondary, borderColor: C.border }}>
            {c}
          </th>
        ))}
      </tr>
    </thead>
  );
}

function TR({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <tr className={cn("transition-colors", onClick && "cursor-pointer")}
      style={{ borderBottom: `1px solid ${C.border}` }}
      onMouseEnter={e => { if (onClick) (e.currentTarget as HTMLElement).style.background = "#FAFBFC"; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
      onClick={onClick}>
      {children}
    </tr>
  );
}

function TD({ children, right, muted, mono, className = "", style = {} }: { children: React.ReactNode; right?: boolean; muted?: boolean; mono?: boolean; className?: string; style?: React.CSSProperties }) {
  return (
    <td className={cn("px-4 py-3 text-sm", right && "text-right", mono && "font-mono text-xs", className)}
      style={{ color: muted ? C.secondary : C.primary, ...style }}>
      {children}
    </td>
  );
}

function Pagination({ total, page, perPage }: { total: number; page: number; perPage: number }) {
  const pages = Math.ceil(total / perPage);
  return (
    <div className="flex items-center justify-between px-4 py-3 border-t" style={{ borderColor: C.border }}>
      <span className="text-sm" style={{ color: C.secondary }}>
        Showing {((page - 1) * perPage) + 1}–{Math.min(page * perPage, total)} of {total}
      </span>
      <div className="flex items-center gap-1">
        <button className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ color: C.secondary }}>
          <ChevronLeft size={14} />
        </button>
        {Array.from({ length: Math.min(pages, 4) }, (_, i) => i + 1).map(p => (
          <button key={p} className="w-7 h-7 rounded-lg text-xs font-medium flex items-center justify-center"
            style={{ background: p === page ? C.maroon : "transparent", color: p === page ? "#fff" : C.secondary }}>
            {p}
          </button>
        ))}
        <button className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ color: C.secondary }}>
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}

// ─── Chart Tooltip ─────────────────────────────────────────────────────────────
function ChartTip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border rounded-xl shadow-lg p-3 text-xs" style={{ borderColor: C.border }}>
      <p className="font-semibold mb-2" style={{ color: C.primary }}>{label}</p>
      {payload.map((p: any) => (
        <div key={p.name} className="flex items-center gap-2 mb-1">
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: p.color }} />
          <span style={{ color: C.secondary }}>{p.name}:</span>
          <span className="font-semibold ml-auto pl-3" style={{ color: C.primary }}>
            {typeof p.value === "number"
              ? (p.name.includes("%") || p.name.includes("Margin") ? `${p.value.toFixed(1)}%` : `₱${p.value.toLocaleString()}`)
              : p.value}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Empty State ───────────────────────────────────────────────────────────────
function EmptyState({ icon: Icon, title, body, action, onAction }: {
  icon: React.ElementType; title: string; body: string; action?: string; onAction?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-8 text-center">
      <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4" style={{ background: C.grayBg }}>
        <Icon size={22} style={{ color: C.muted }} />
      </div>
      <h4 className="font-semibold mb-1.5" style={{ color: C.primary }}>{title}</h4>
      <p className="text-sm max-w-xs leading-relaxed" style={{ color: C.secondary }}>{body}</p>
      {action && onAction && (
        <button className="mt-4 px-4 py-2 rounded-lg text-sm font-medium text-white" style={{ background: C.maroon }} onClick={onAction}>
          {action}
        </button>
      )}
    </div>
  );
}

// ─── Sidebar Navigation ────────────────────────────────────────────────────────
const ownerNav = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "sales", label: "Sales Analysis", icon: ShoppingCart },
  { id: "menu", label: "Menu & Recipes", icon: UtensilsCrossed },
  { id: "inventory-group", label: "Inventory", icon: Package, children: [
    { id: "inventory", label: "Overview" },
    { id: "master-data", label: "Master Data" },
    { id: "shrinkage", label: "Shrinkage" },
    { id: "variance", label: "Variance" },
  ]},
  { id: "purchase-orders", label: "Purchase Orders", icon: ClipboardList },
  { id: "cogs", label: "COGS Analysis", icon: BarChart2 },
  { id: "predictive", label: "Predictive Analytics", icon: Sparkles },
  { id: "reports", label: "Reports", icon: FileText },
  { id: "__div" },
  { id: "users", label: "User Management", icon: Users },
  { id: "branches", label: "Branch Management", icon: Building2 },
  { id: "settings", label: "Settings", icon: Settings },
];

const managerNav = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "sales", label: "Sales Analysis", icon: ShoppingCart },
  { id: "menu", label: "Menu & Recipes", icon: UtensilsCrossed },
  { id: "inventory-group", label: "Inventory", icon: Package, children: [
    { id: "inventory", label: "Overview" },
    { id: "physical-count", label: "Physical Count" },
    { id: "shrinkage", label: "Shrinkage" },
    { id: "variance", label: "Variance" },
  ]},
  { id: "purchase-orders", label: "Purchase Orders", icon: ClipboardList },
  { id: "cogs", label: "COGS Analysis", icon: BarChart2 },
  { id: "predictive", label: "Predictive Analytics", icon: Sparkles },
  { id: "reports", label: "Reports", icon: FileText },
  { id: "__div" },
  { id: "settings", label: "Settings", icon: Settings },
];

function Sidebar({ role, page, onNavigate, collapsed, onToggle }: {
  role: Role; page: Page; onNavigate: (p: Page) => void; collapsed: boolean; onToggle: () => void;
}) {
  const [expanded, setExpanded] = useState<string[]>(["inventory-group"]);
  const nav = role === "owner" ? ownerNav : managerNav;

  const toggleGroup = (id: string) => setExpanded(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
  const isActive = (id: string) => id === page;

  return (
    <aside className="app-sidebar flex flex-col h-full relative z-10 flex-shrink-0"
      style={{ width: collapsed ? 64 : C.sidebarWidth, background: C.surface, borderRight: `1px solid ${C.border}`, transition: "width 0.2s ease" }}>
      {/* Logo */}
      <div className="flex items-center px-4 border-b flex-shrink-0" style={{ borderColor: C.border, height: C.headerHeight }}>
        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: C.maroon }}>
          <Coffee size={17} color="#fff" />
        </div>
        {!collapsed && (
          <div className="ml-3 min-w-0 flex-1">
            <div className="text-sm font-bold leading-tight" style={{ color: C.primary }}>Libro Espresso</div>
            <div className="text-[10px] font-medium leading-tight mt-0.5" style={{ color: C.muted }}>COGS & Inventory Intel</div>
          </div>
        )}
        <button onClick={onToggle}
          className="w-6 h-6 rounded-md flex items-center justify-center ml-auto flex-shrink-0 transition-colors"
          style={{ color: C.muted }}
          onMouseEnter={e => (e.currentTarget.style.background = C.grayBg)}
          onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
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
                  className="w-full flex items-center gap-2.5 px-2.5 py-2.5 rounded-lg text-sm font-medium transition-colors"
                  style={{ color: anyActive ? C.maroon : C.secondary, background: anyActive && collapsed ? C.softMaroonBg : "transparent" }}
                  onMouseEnter={e => { if (!anyActive) (e.currentTarget as HTMLElement).style.background = C.grayBg; }}
                  onMouseLeave={e => { if (!anyActive) (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
                  <item.icon size={16} className="flex-shrink-0" style={{ color: anyActive ? C.maroon : C.secondary }} />
                  {!collapsed && (
                    <>
                      <span className="flex-1 text-left">{item.label}</span>
                      <ChevronDown size={12} style={{ color: C.muted, transform: isExp ? "rotate(180deg)" : "", transition: "transform 0.15s" }} />
                    </>
                  )}
                </button>
                {!collapsed && isExp && (
                  <div className="ml-4 pl-3 border-l space-y-0.5 my-0.5" style={{ borderColor: C.border }}>
                    {item.children.map((child: any) => (
                      <button key={child.id} onClick={() => onNavigate(child.id as Page)}
                        className="w-full text-left px-3 py-2 rounded-lg text-sm transition-colors"
                        style={{ color: isActive(child.id) ? C.maroon : C.secondary, background: isActive(child.id) ? C.softMaroonBg : "transparent", fontWeight: isActive(child.id) ? 600 : 400 }}
                        onMouseEnter={e => { if (!isActive(child.id)) (e.currentTarget as HTMLElement).style.background = C.grayBg; }}
                        onMouseLeave={e => { if (!isActive(child.id)) (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
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
              className="w-full flex items-center gap-2.5 px-2.5 py-2.5 rounded-lg text-sm font-medium transition-colors relative"
              style={{ color: active ? C.maroon : C.secondary, background: active ? C.softMaroonBg : "transparent" }}
              onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = C.grayBg; }}
              onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
              title={collapsed ? item.label : undefined}>
              <item.icon size={16} className="flex-shrink-0" style={{ color: active ? C.maroon : C.secondary }} />
              {!collapsed && <span>{item.label}</span>}
              {active && collapsed && <span className="absolute right-2 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full" style={{ background: C.maroon }} />}
            </button>
          );
        })}
      </nav>

      {/* User profile */}
      <div className="border-t p-3 flex-shrink-0" style={{ borderColor: C.border }}>
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold text-white"
            style={{ background: C.maroon }}>
            {role === "owner" ? "CM" : "MS"}
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold truncate" style={{ color: C.primary }}>{role === "owner" ? "Carlos Mendoza" : "Maria Santos"}</div>
              <div className="text-xs truncate" style={{ color: C.muted }}>{role === "owner" ? "Owner · Admin" : "Branch Manager"}</div>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

// ─── Top Header ────────────────────────────────────────────────────────────────
const pageTitles: Record<Page, string> = {
  login: "Login", dashboard: "Dashboard", sales: "Sales Analysis",
  menu: "Menu & Recipes",
  inventory: "Inventory Overview", "physical-count": "Physical Count",
  shrinkage: "Shrinkage Monitoring", variance: "Variance Monitoring",
  "purchase-orders": "Purchase Orders", cogs: "COGS Analysis",
  predictive: "Predictive Analytics", reports: "Reports",
  users: "User Management", branches: "Branch Management", settings: "Settings", "master-data": "Inventory Master Data",
};

function TopHeader({ role, page, branch, setBranch, unreadCount, onBell, onLogout, theme, onThemeToggle }: {
  role: Role; page: Page; branch: string; setBranch: (b: string) => void;
  unreadCount: number; onBell: () => void; onLogout: () => void;
  theme: ThemeMode; onThemeToggle: () => void;
}) {
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
          <span>Lipa Branch</span>
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
            {role === "owner" ? "CM" : "MS"}
          </div>
          <span className="text-sm font-medium">{role === "owner" ? "Carlos M." : "Maria S."}</span>
          <ChevronDown size={12} style={{ color: C.muted }} />
        </button>
        {uMenuOpen && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setUMenuOpen(false)} />
            <div className="app-popover absolute right-0 top-full mt-1 w-52 bg-white border rounded-xl shadow-xl py-1.5 z-40" style={{ borderColor: C.border }}>
              <div className="px-3 py-2.5 border-b mb-1" style={{ borderColor: C.border }}>
                <div className="text-sm font-semibold" style={{ color: C.primary }}>{role === "owner" ? "Carlos Mendoza" : "Maria Santos"}</div>
                <div className="text-xs mt-0.5" style={{ color: C.muted }}>{role === "owner" ? "Owner / System Administrator" : "Branch Manager · Lipa"}</div>
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
};

function NotifDrawer({ open, onClose, notifs, markAllRead, onOpenNotification }: {
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

// ─── Login Page ────────────────────────────────────────────────────────────────
function LoginPage({ onLogin }: { onLogin: (identifier: string, password: string) => Promise<void> }) {
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [remember, setRemember] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try { await onLogin(email.trim(), pass); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to sign in"); }
    finally { setSubmitting(false); }
  };

  return (
    <div className="flex h-screen overflow-hidden" style={{ fontFamily: "Inter, sans-serif", background: "#fff" }}>
      {/* Left brand */}
      <div className="w-[52%] flex flex-col relative overflow-hidden" style={{ background: C.deepMaroon }}>
        {/* Abstract geometric background */}
        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 600 900" preserveAspectRatio="xMidYMid slice">
          <defs>
            <radialGradient id="rg1" cx="50%" cy="40%" r="60%">
              <stop offset="0%" stopColor="#923544" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#351015" stopOpacity="0" />
            </radialGradient>
          </defs>
          <rect width="600" height="900" fill="url(#rg1)" />
          {/* Grid of subtle dots */}
          {Array.from({ length: 12 }, (_, row) =>
            Array.from({ length: 8 }, (_, col) => (
              <circle key={`${row}-${col}`}
                cx={col * 80 + 20} cy={row * 80 + 20}
                r="1.5" fill="rgba(255,255,255,0.06)" />
            ))
          )}
          {/* Decorative geometric shapes */}
          <circle cx="480" cy="180" r="120" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="40" />
          <circle cx="480" cy="180" r="60" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="2" />
          <circle cx="120" cy="700" r="80" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="30" />
          {/* Chart-like decoration */}
          <g transform="translate(60, 400)">
            {[40, 65, 50, 80, 70, 95, 85].map((h, i) => (
              <rect key={i} x={i * 36} y={100 - h} width="24" height={h}
                fill="rgba(255,255,255,0.06)" rx="3" />
            ))}
            <line x1="0" y1="100" x2="240" y2="100" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
          </g>
          {/* Line chart decoration */}
          <polyline points="40,580 110,560 180,540 250,555 320,530 390,510 460,520"
            fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="2" />
          <circle cx="460" cy="520" r="4" fill="rgba(255,255,255,0.2)" />
        </svg>

        <div className="relative z-10 flex flex-col h-full p-12">
          {/* Logo */}
          <div className="flex items-center gap-3 mb-16">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "rgba(255,255,255,0.15)" }}>
              <Coffee size={20} color="#fff" />
            </div>
            <div>
              <div className="text-white font-bold text-base leading-tight">Libro Espresso Cafe</div>
              <div className="text-xs" style={{ color: "rgba(255,255,255,0.55)" }}>Internal Management Platform</div>
            </div>
          </div>

          {/* Hero */}
          <div className="flex-1 flex flex-col justify-center max-w-md">
            <h1 className="text-4xl font-bold leading-[1.15] mb-4" style={{ color: "#fff" }}>
              Smarter Inventory.<br />Better Decisions.
            </h1>
            <p className="text-base leading-relaxed mb-10" style={{ color: "rgba(255,255,255,0.65)" }}>
              AI-powered COGS, inventory and shrinkage intelligence across every Libro Espresso branch.
            </p>
            <div className="space-y-3.5">
              {[
                { Icon: BarChart3, text: "Real-time COGS tracking and gross margin analysis" },
                { Icon: AlertTriangle, text: "Automated shrinkage detection and variance flagging" },
                { Icon: Sparkles, text: "Gemini AI-powered demand forecasts and reorder alerts" },
              ].map(({ Icon, text }) => (
                <div key={text} className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: "rgba(255,255,255,0.1)" }}>
                    <Icon size={13} color="#fff" />
                  </div>
                  <span className="text-sm" style={{ color: "rgba(255,255,255,0.75)" }}>{text}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Bottom */}
          <div className="flex items-center gap-2">
            <Shield size={11} style={{ color: "rgba(255,255,255,0.4)" }} />
            <span className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>
              Role-based access · End-to-end encryption · Multi-branch architecture
            </span>
          </div>
        </div>
      </div>

      {/* Right form */}
      <div className="flex-1 flex items-center justify-center p-12" style={{ background: "#fff" }}>
        <form className="w-full max-w-sm" onSubmit={submit}>
          <div className="mb-8">
            <h2 className="text-2xl font-bold" style={{ color: C.primary }}>Welcome back</h2>
            <p className="text-sm mt-1.5" style={{ color: C.secondary }}>Sign in to your Libro Espresso account</p>
          </div>

          <div className="space-y-4 mb-5">
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: C.primary }}>Email or Username</label>
              <input value={email} onChange={e => setEmail(e.target.value)} required autoComplete="username"
                className="w-full px-3.5 py-2.5 text-sm rounded-xl border outline-none transition-colors"
                style={{ borderColor: C.border, color: C.primary }}
                placeholder="carlos@libroespresso.com"
                onFocus={e => (e.target.style.borderColor = C.maroon)}
                onBlur={e => (e.target.style.borderColor = C.border)} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: C.primary }}>Password</label>
              <div className="relative">
                <input type={showPass ? "text" : "password"} value={pass} onChange={e => setPass(e.target.value)} required autoComplete="current-password"
                  className="w-full px-3.5 py-2.5 pr-10 text-sm rounded-xl border outline-none transition-colors"
                  style={{ borderColor: C.border, color: C.primary }}
                  placeholder="••••••••••"
                  onFocus={e => (e.target.style.borderColor = C.maroon)}
                  onBlur={e => (e.target.style.borderColor = C.border)} />
                <button onClick={() => setShowPass(p => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                  style={{ color: C.muted }}>
                  <Eye size={15} />
                </button>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between mb-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)}
                className="w-4 h-4 rounded" style={{ accentColor: C.maroon }} />
              <span className="text-sm" style={{ color: C.secondary }}>Remember me</span>
            </label>
            <button className="text-sm font-medium" style={{ color: C.maroon }}>Forgot password?</button>
          </div>

          {error && <div className="mb-4 rounded-xl px-3.5 py-2.5 text-sm" style={{ color: C.red, background: C.redBg }}>{error}</div>}
          <button type="submit" disabled={submitting}
            className="w-full py-2.5 rounded-xl text-sm font-semibold text-white mb-3 transition-opacity hover:opacity-90"
            style={{ background: C.maroon }}>
            {submitting ? "Signing in…" : "Sign In"}
          </button>

          <div className="flex items-center justify-center gap-1.5">
            <Shield size={11} style={{ color: C.muted }} />
            <p className="text-xs text-center" style={{ color: C.muted }}>
              Authorized personnel only. All access is logged.
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Owner Dashboard ───────────────────────────────────────────────────────────
function OwnerDashboard({ onNavigate }: { onNavigate: (p: Page) => void }) {
  const [metric, setMetric] = useState<"sales" | "cogs" | "margin" | "shrinkage">("sales");
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<DashboardRange>("mtd");
  const [comparison, setComparison] = useState<DashboardComparison>("previous");
  const [customStart, setCustomStart] = useState("2026-08-01");
  const [customEnd, setCustomEnd] = useState("2026-08-26");
  const customDays = Math.max(1, Math.round((new Date(customEnd).getTime() - new Date(customStart).getTime()) / 86400000) + 1);
  const rangeFactor = range === "custom" ? Math.min(customDays / 26, 2) : dashboardRangeFactor(range);
  const grossMargin = range === "custom" ? 56.7 + Math.min(customDays, 30) * 0.01 : { today: 58.2, "7d": 57.4, "30d": 56.8, mtd: 57 }[range];
  const shrinkageRate = range === "custom" ? 1.42 + Math.min(customDays, 30) * 0.008 : { today: 1.31, "7d": 1.48, "30d": 1.72, mtd: 1.65 }[range];
  const periodLabel = dashboardPeriodLabel(range, customStart, customEnd);
  const comparisonLabel = comparison === "previous" ? "previous period" : "last month";
  const ownerChanges = comparison === "previous"
    ? { sales: "+8.3%", cogs: "+5.1%", margin: "+1.2pp", shrinkage: "+0.2pp" }
    : { sales: "+6.9%", cogs: "+4.4%", margin: "+0.8pp", shrinkage: "+0.1pp" };
  const rankedBranchData = branchPerf
    .map(branch => ({
      ...branch,
      sales: Math.round(branch.sales * rangeFactor),
      cogs: Math.round(branch.cogs * rangeFactor),
      margin: Number((branch.margin + grossMargin - 57).toFixed(1)),
      shrinkage: Math.round(branch.shrinkage * rangeFactor),
    }))
    .sort((a, b) => Number(b[metric]) - Number(a[metric]));
  const visibleSalesTrend = range === "today" ? salesTrend.slice(-1) : range === "custom" ? salesTrend.slice(-Math.min(customDays, 7)) : salesTrend;

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 1200);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="dashboard-page p-6 space-y-6">
      <div className="dashboard-intro flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: C.primary }}>Good morning, Carlos 👋</h1>
          <p className="text-sm mt-1" style={{ color: C.secondary }}>Here's how Libro Espresso is performing across all branches.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <DashboardFilters range={range} comparison={comparison} customStart={customStart} customEnd={customEnd}
            onRangeChange={setRange} onComparisonChange={setComparison}
            onApplyCustom={(start, end) => { setCustomStart(start); setCustomEnd(end); }}
            onReset={() => { setRange("mtd"); setCustomStart("2026-08-01"); setCustomEnd("2026-08-26"); }} />
        </div>
      </div>

      {/* KPI Row */}
      {loading ? (
        <div className="dashboard-kpi-grid grid grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonKPICard key={i} />)}
        </div>
      ) : (
        <div className="dashboard-kpi-grid grid grid-cols-4 gap-4">
          <KPICard label="Total Sales" value={formatPeso(1120500 * rangeFactor)} change={ownerChanges.sales} changeDir="up" sub={`All branches · ${periodLabel}`} icon={ShoppingCart} color={C.maroon} comparisonLabel={comparisonLabel} />
          <KPICard label="Total COGS" value={formatPeso(482100 * rangeFactor)} change={ownerChanges.cogs} changeDir="up" sub="43.0% of sales" icon={Package} color={C.amber} comparisonLabel={comparisonLabel} />
          <KPICard label="Gross Margin" value={`${grossMargin.toFixed(1)}%`} change={ownerChanges.margin} changeDir="up" sub={`${formatPeso(638400 * rangeFactor)} gross profit`} icon={Percent} color={C.green} comparisonLabel={comparisonLabel} />
          <KPICard label="Shrinkage Rate" value={`${shrinkageRate.toFixed(2)}%`} change={ownerChanges.shrinkage} changeDir="down" sub={`${formatPeso(18450 * rangeFactor)} loss this period`} icon={TrendingDown} color={C.red} comparisonLabel={comparisonLabel} />
        </div>
      )}

      {/* Row 2: Branch Perf + AI Insights */}
      <div className="grid grid-cols-5 gap-5">
        <Card className="col-span-3" padding={false}>
          <div className="px-5 pt-5 pb-0 flex items-center justify-between mb-3">
            <div>
              <h3 className="font-semibold" style={{ color: C.primary }}>Cross-Branch Performance</h3>
              <p className="text-xs mt-0.5" style={{ color: C.secondary }}>{periodLabel} · Ranked by {metric}</p>
            </div>
            <div className="flex gap-1 p-0.5 rounded-lg border" style={{ borderColor: C.border }}>
              {(["sales", "cogs", "margin", "shrinkage"] as const).map(m => (
                <button key={m} onClick={() => setMetric(m)}
                  className="px-2.5 py-1 rounded-md text-xs font-medium capitalize transition-colors"
                  style={{ background: metric === m ? C.maroon : "transparent", color: metric === m ? "#fff" : C.secondary }}>
                  {m === "margin" ? "Margin" : m.charAt(0).toUpperCase() + m.slice(1)}
                </button>
              ))}
            </div>
          </div>
          {loading ? <div className="h-52 px-5 pb-5"><SkeletonBlock w="100%" h={200} className="rounded-lg" /></div> : (
            <div className="h-60 px-3 pb-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={rankedBranchData} barSize={28} margin={{ left: 8, right: 8, top: 18 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                  <XAxis dataKey="branch" tick={{ fontSize: 11, fill: C.secondary }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: C.secondary }} axisLine={false} tickLine={false}
                    tickFormatter={v => metric === "margin" ? `${v}%` : `₱${(v / 1000).toFixed(0)}k`} />
                  <Tooltip content={<ChartTip />} />
                  <Bar dataKey={metric} name={metric === "margin" ? "Margin %" : metric.charAt(0).toUpperCase() + metric.slice(1)}
                    fill={metric === "shrinkage" ? C.red : metric === "cogs" ? C.amber : metric === "margin" ? C.green : C.maroon}
                    radius={[7, 7, 0, 0]}>
                    <LabelList dataKey={metric} position="top" style={{ fill: C.secondary, fontSize: 10, fontWeight: 600 }}
                      formatter={(value: any) => metric === "margin" ? `${value}%` : `₱${(Number(value) / 1000).toFixed(0)}k`} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card className="col-span-2">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: C.softMaroonBg }}>
              <Activity size={14} style={{ color: C.maroon }} />
            </div>
            <div>
              <h3 className="text-sm font-semibold" style={{ color: C.primary }}>Business Insight</h3>
              <p className="text-xs" style={{ color: C.muted }}>Forecast model · Updated 08:02 AM</p>
            </div>
          </div>
          <div className="space-y-2.5">
            {aiInsights.slice(0, 1).map(ins => (
              <div key={ins.id} className="p-3 rounded-xl border"
                style={{ borderColor: C.border, background: C.veryLightMaroon }}>
                <div className="flex items-start justify-between gap-2 mb-1">
                  <p className="text-xs font-semibold leading-snug" style={{ color: C.primary }}>{ins.title}</p>
                  <StatusChip status={ins.urgency === "high" ? "high" : ins.urgency === "medium" ? "medium" : "low_urgency"} />
                </div>
                <p className="text-xs leading-relaxed" style={{ color: C.secondary }}>{ins.desc}</p>
                <div className="mt-1.5 flex items-center gap-1.5">
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: C.softMaroonBg, color: C.maroon }}>
                    {ins.metric}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <button className="mt-3 text-xs font-semibold flex items-center gap-1" style={{ color: C.maroon }}
            onClick={() => onNavigate("predictive")}>
            View Predictive Analytics <ChevronRight size={11} />
          </button>
        </Card>
      </div>

      {/* Row 3: Inventory Health + Shrinkage */}
      <div className="grid grid-cols-5 gap-5">
        <Card className="col-span-2">
          <h3 className="font-semibold" style={{ color: C.primary }}>Inventory Health</h3>
          <p className="text-xs mt-0.5 mb-4" style={{ color: C.secondary }}>228 SKUs · All branches</p>
          {loading ? <SkeletonBlock w="100%" h={160} className="rounded-lg" /> : (
            <>
              <div className="flex justify-center mb-4">
                <ResponsiveContainer width={200} height={180}>
                  <RPieChart>
                    <Pie data={inventoryStatus} cx="50%" cy="50%" innerRadius={55} outerRadius={85}
                      paddingAngle={3} cornerRadius={7} dataKey="value" startAngle={90} endAngle={-270}
                      stroke={C.surface} strokeWidth={2}>
                      {inventoryStatus.map((e, i) => <Cell key={i} fill={e.color} />)}
                    </Pie>
                    <Tooltip formatter={(v: any, n: any) => [`${v} SKUs`, n]} />
                  </RPieChart>
                </ResponsiveContainer>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {inventoryStatus.map(s => (
                  <div key={s.name} className="flex items-center gap-2 py-1">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: s.color }} />
                    <div>
                      <div className="text-xs font-semibold" style={{ color: C.primary }}>{s.value}</div>
                      <div className="text-xs" style={{ color: C.secondary }}>{s.name}</div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>

        <Card className="col-span-3" padding={false}>
          <div className="px-5 pt-5 flex items-center justify-between">
            <div>
              <h3 className="font-semibold" style={{ color: C.primary }}>Sales &amp; COGS Performance</h3>
              <p className="text-xs mt-0.5" style={{ color: C.secondary }}>Aug 19–25, 2026 · All branches</p>
            </div>
            <Btn variant="ghost" size="sm" onClick={() => onNavigate("sales")}>View analysis</Btn>
          </div>
          {loading ? <div className="p-5"><SkeletonBlock w="100%" h={210} className="rounded-lg" /></div> : (
            <div className="h-64 px-3 pb-4 pt-3">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={visibleSalesTrend}>
                  <defs>
                    <linearGradient id="owner-sales-area" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={C.maroon} stopOpacity={0.16} />
                      <stop offset="95%" stopColor={C.maroon} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: C.secondary }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: C.secondary }} axisLine={false} tickLine={false}
                    tickFormatter={v => `₱${(v / 1000).toFixed(0)}k`} />
                  <Tooltip content={<ChartTip />} />
                  <Legend iconSize={9} wrapperStyle={{ fontSize: 11 }} />
                  <Area type="monotone" dataKey="sales" name="Sales" fill="url(#owner-sales-area)" stroke={C.maroon} strokeWidth={2.25} dot={false} />
                  <Line type="monotone" dataKey="cogs" name="COGS" stroke={C.amber} strokeWidth={1.75} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>

      {/* Row 4: Alerts + Branch Table */}
      <div className="grid grid-cols-5 gap-5">
        <Card className="col-span-3" padding={false}>
          <div className="px-5 pt-5 pb-3 flex items-center justify-between">
            <h3 className="font-semibold" style={{ color: C.primary }}>Recent Inventory Alerts</h3>
            <Btn variant="ghost" size="sm" onClick={() => onNavigate("inventory")}>View all</Btn>
          </div>
          {loading ? <SkeletonTable rows={4} cols={6} /> : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <THead cols={["Item", "Branch", "Alert Type", "Stock / Threshold", "Detected", "Severity"]} />
                <tbody>
                  {[
                    { item: "Arabica Beans", branch: "Vermosa", type: "Potential Pilferage", stock: "38 kg / 20 kg", detected: "Aug 25", sev: "critical" },
                    { item: "Whole Milk", branch: "Lipa", type: "Low Stock", stock: "45 L / 60 L", detected: "Aug 26", sev: "warning" },
                    { item: "Butter", branch: "Lipa", type: "Out of Stock", stock: "0 kg / 10 kg", detected: "Aug 26", sev: "critical" },
                    { item: "White Sugar", branch: "Lipa", type: "Critical Stock", stock: "8 kg / 15 kg", detected: "Aug 25", sev: "critical" },
                    { item: "Croissants", branch: "Gulod", type: "Low Stock", stock: "24 pcs / 30 pcs", detected: "Aug 26", sev: "warning" },
                  ].slice(0, 3).map((a, i) => (
                    <TR key={i}>
                      <TD><span className="font-medium">{a.item}</span></TD>
                      <TD muted>{a.branch}</TD>
                      <TD muted>{a.type}</TD>
                      <TD muted><span className="font-mono text-xs">{a.stock}</span></TD>
                      <TD muted>{a.detected}</TD>
                      <TD><StatusChip status={a.sev} /></TD>
                    </TR>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card className="col-span-2" padding={false}>
          <div className="px-5 pt-5 pb-3">
            <h3 className="font-semibold" style={{ color: C.primary }}>Branch Performance</h3>
          </div>
          {loading ? <SkeletonTable rows={5} cols={4} /> : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <THead cols={["Branch", "Sales", "Margin", "Shrinkage"]} />
                <tbody>
                  {branchPerf.map((b, i) => (
                    <TR key={i} onClick={() => onNavigate("inventory")}>
                      <TD><span className="font-semibold" style={{ color: C.maroon }}>{b.branch}</span></TD>
                      <TD right>₱{(b.sales / 1000).toFixed(0)}k</TD>
                      <TD right><span className="font-semibold text-xs" style={{ color: C.green }}>{b.margin}%</span></TD>
                      <TD right><span className="text-xs" style={{ color: C.red }}>₱{(b.shrinkage / 1000).toFixed(1)}k</span></TD>
                    </TR>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

// ─── Branch Manager Dashboard ──────────────────────────────────────────────────
function ManagerDashboard({ onNavigate }: { onNavigate: (p: Page) => void }) {
  const [showSpoilage, setShowSpoilage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<DashboardRange>("today");
  const [comparison, setComparison] = useState<DashboardComparison>("previous");
  const [customStart, setCustomStart] = useState("2026-08-01");
  const [customEnd, setCustomEnd] = useState("2026-08-26");
  const customDays = Math.max(1, Math.round((new Date(customEnd).getTime() - new Date(customStart).getTime()) / 86400000) + 1);
  const managerRangeFactor = range === "custom" ? customDays * 0.9 : { today: 1, "7d": 6.36, "30d": 25.1, mtd: 21.7 }[range];
  const branchMargin = range === "custom" ? 56.9 + Math.min(customDays, 30) * 0.008 : { today: 57.1, "7d": 57.4, "30d": 56.8, mtd: 57 }[range];
  const branchShrinkage = range === "custom" ? 1.31 + Math.min(customDays, 30) * 0.007 : { today: 1.18, "7d": 1.36, "30d": 1.58, mtd: 1.49 }[range];
  const periodLabel = dashboardPeriodLabel(range, customStart, customEnd);
  const comparisonLabel = comparison === "previous" ? "previous period" : "last month";
  const managerChanges = comparison === "previous"
    ? { sales: "+4.8%", cogs: "+3.1%", profit: "+6.1%", shrinkage: "+0.2pp" }
    : { sales: "+3.9%", cogs: "+2.6%", profit: "+5.0%", shrinkage: "+0.1pp" };
  const visibleSalesTrend = range === "today" ? salesTrend.slice(-1) : range === "custom" ? salesTrend.slice(-Math.min(customDays, 7)) : salesTrend;

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 1000);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="dashboard-page p-6 space-y-6">
      {/* Header */}
      <div className="dashboard-intro flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 mb-0.5">
            <h1 className="text-2xl font-bold" style={{ color: C.primary }}>Good morning, Maria 👋</h1>
            <span className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold" style={{ background: C.softMaroonBg, color: C.maroon }}>
              <MapPin size={10} /> Lipa Branch
            </span>
          </div>
          <p className="text-sm" style={{ color: C.secondary }}>Here's what needs your attention today — August 26, 2026</p>
        </div>
        <DashboardFilters range={range} comparison={comparison} customStart={customStart} customEnd={customEnd}
          onRangeChange={setRange} onComparisonChange={setComparison}
          onApplyCustom={(start, end) => { setCustomStart(start); setCustomEnd(end); }}
          onReset={() => { setRange("today"); setCustomStart("2026-08-01"); setCustomEnd("2026-08-26"); }} />
      </div>

      {/* Quick actions */}
      <div className="dashboard-quick-actions grid grid-cols-3 gap-3">
        {[
          { label: "Record Stock Count", Icon: ClipboardList, action: () => onNavigate("physical-count"), accent: C.blue, bg: C.blueBg },
          { label: "Record Spoilage / Wastage", Icon: AlertTriangle, action: () => setShowSpoilage(true), accent: C.amber, bg: C.amberBg },
          { label: "Create Purchase Request", Icon: Plus, action: () => onNavigate("purchase-orders"), accent: C.green, bg: C.greenBg },
        ].map(qa => (
          <button key={qa.label} onClick={qa.action}
            className="flex items-center gap-3 px-4 py-3.5 rounded-xl border font-medium text-sm transition-all hover:shadow-sm group"
            style={{ background: C.surface, borderColor: C.border, color: qa.accent }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = qa.bg; (e.currentTarget as HTMLElement).style.borderColor = qa.accent; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = C.surface; (e.currentTarget as HTMLElement).style.borderColor = C.border; }}>
            <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: qa.bg }}>
              <qa.Icon size={15} style={{ color: qa.accent }} />
            </div>
            {qa.label}
          </button>
        ))}
      </div>

      {/* KPIs */}
      {loading ? (
        <div className="dashboard-kpi-grid grid grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonKPICard key={i} />)}
        </div>
      ) : (
        <div className="dashboard-kpi-grid grid grid-cols-4 gap-4">
          <KPICard label="Branch Sales" value={formatPeso(48700 * managerRangeFactor)} change={managerChanges.sales} changeDir="up" sub={`Lipa Branch · ${periodLabel}`} icon={ShoppingCart} color={C.maroon} comparisonLabel={comparisonLabel} />
          <KPICard label="Branch COGS" value={formatPeso(20900 * managerRangeFactor)} change={managerChanges.cogs} changeDir="up" sub="42.9% of sales" icon={Package} color={C.amber} comparisonLabel={comparisonLabel} />
          <KPICard label="Gross Profit" value={formatPeso(27800 * managerRangeFactor)} change={managerChanges.profit} changeDir="up" sub={`${branchMargin.toFixed(1)}% margin`} icon={Percent} color={C.green} comparisonLabel={comparisonLabel} />
          <KPICard label="Shrinkage Rate" value={`${branchShrinkage.toFixed(2)}%`} change={managerChanges.shrinkage} changeDir="down" sub={`${formatPeso(3620 * Math.max(1, managerRangeFactor / 21.7))} loss this period`} icon={TrendingDown} color={C.red} comparisonLabel={comparisonLabel} />
        </div>
      )}

      {/* Row 2: Sales + Inventory */}
      <div className="grid grid-cols-5 gap-5">
        <Card className="col-span-3" padding={false}>
          <div className="px-5 pt-5 pb-0 flex items-start justify-between mb-3">
            <div>
              <h3 className="font-semibold" style={{ color: C.primary }}>Sales Performance</h3>
              <p className="text-xs mt-0.5" style={{ color: C.secondary }}>{periodLabel} · Lipa Branch</p>
            </div>
            <button className="text-xs font-semibold" style={{ color: C.maroon }} onClick={() => onNavigate("sales")}>View Analysis →</button>
          </div>
          <div className="h-52 px-3 pb-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={visibleSalesTrend}>
                <defs>
                  <linearGradient id="sgm" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={C.maroon} stopOpacity={0.12} />
                    <stop offset="95%" stopColor={C.maroon} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: C.secondary }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: C.secondary }} axisLine={false} tickLine={false}
                  tickFormatter={v => `₱${(v / 1000).toFixed(0)}k`} />
                <Tooltip content={<ChartTip />} />
                <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                <Area type="monotone" dataKey="sales" name="Sales" stroke={C.maroon} strokeWidth={2} fill="url(#sgm)" dot={false} />
                <Area type="monotone" dataKey="cogs" name="COGS" stroke={C.amber} strokeWidth={1.5} fill="none" dot={false} strokeDasharray="4 3" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="col-span-2">
          <h3 className="font-semibold mb-0.5" style={{ color: C.primary }}>Inventory Status</h3>
          <p className="text-xs mb-4" style={{ color: C.secondary }}>Lipa Branch · 68 SKUs</p>
          <div className="flex justify-center mb-4">
            <ResponsiveContainer width={180} height={175}>
              <RPieChart>
                <Pie data={[
                  { name: "Healthy", value: 46, color: C.green },
                  { name: "Low Stock", value: 14, color: C.amber },
                  { name: "Critical", value: 6, color: C.red },
                  { name: "Out of Stock", value: 2, color: C.deepMaroon },
                ]} cx="50%" cy="50%" innerRadius={52} outerRadius={80} paddingAngle={3} cornerRadius={7}
                  dataKey="value" stroke={C.surface} strokeWidth={2}>
                  {[C.green, C.amber, C.red, C.deepMaroon].map((c, i) => <Cell key={i} fill={c} />)}
                </Pie>
              </RPieChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {[
              { l: "Healthy", v: 46, c: C.green },
              { l: "Low Stock", v: 14, c: C.amber },
              { l: "Critical", v: 6, c: C.red },
              { l: "Out of Stock", v: 2, c: C.deepMaroon },
            ].map(s => (
              <div key={s.l} className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: s.c }} />
                <span className="text-xs" style={{ color: C.secondary }}>{s.l}</span>
                <span className="text-xs font-bold ml-auto" style={{ color: C.primary }}>{s.v}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Row 3: Low Stock + AI */}
      <div className="grid grid-cols-5 gap-5">
        <Card className="col-span-3" padding={false}>
          <div className="px-5 pt-5 pb-3 flex items-center justify-between">
            <h3 className="font-semibold" style={{ color: C.primary }}>Low Stock & Critical Items</h3>
            <Btn variant="ghost" size="sm" onClick={() => onNavigate("inventory")}>View all</Btn>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <THead cols={["SKU", "Item", "On Hand", "Reorder", "Status", "Action"]} />
              <tbody>
                {inventoryItems.filter(i => i.status !== "healthy").map(item => (
                  <TR key={item.sku}>
                    <TD mono muted>{item.sku}</TD>
                    <TD><span className="font-medium">{item.name}</span></TD>
                    <TD right>{item.onHand} {item.unit}</TD>
                    <TD right muted>{item.reorder}</TD>
                    <TD><StatusChip status={item.status} /></TD>
                    <TD>
                      <button className="text-xs font-semibold px-2.5 py-1 rounded-lg border transition-colors"
                        style={{ borderColor: C.maroon, color: C.maroon }}
                        onClick={() => { onNavigate("purchase-orders"); toast.success("Opening purchase request form"); }}>
                        Request
                      </button>
                    </TD>
                  </TR>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="col-span-2">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: C.softMaroonBg }}>
              <Activity size={14} style={{ color: C.maroon }} />
            </div>
            <div>
              <h3 className="text-sm font-semibold" style={{ color: C.primary }}>Operational Insight</h3>
              <p className="text-xs" style={{ color: C.muted }}>Forecast model · Lipa · Updated 08:02 AM</p>
            </div>
          </div>
          <div className="space-y-3">
            {[
              { item: "Whole Milk", sku: "RM-001", reorder: 24, unit: "L", stockout: "3 days", reason: "Higher consumption detected over last 7 days.", urgency: "high" },
              { item: "Arabica Beans", sku: "RM-002", reorder: 10, unit: "kg", stockout: "4 days", reason: "Usage trending above seasonal average.", urgency: "high" },
              { item: "White Sugar", sku: "RM-008", reorder: 20, unit: "kg", stockout: "6 days", reason: "Consistent daily depletion detected.", urgency: "medium" },
            ].slice(0, 1).map(r => (
              <div key={r.sku} className="p-3 rounded-xl border" style={{ borderColor: C.border, background: C.veryLightMaroon }}>
                <div className="flex items-start justify-between mb-1.5">
                  <div>
                    <p className="text-sm font-semibold" style={{ color: C.primary }}>{r.item}</p>
                    <p className="text-xs" style={{ color: C.muted }}>{r.sku}</p>
                  </div>
                  <StatusChip status={r.urgency} />
                </div>
                <div className="flex gap-3 text-xs mb-1.5">
                  <span style={{ color: C.secondary }}>Reorder: <strong style={{ color: C.primary }}>{r.reorder} {r.unit}</strong></span>
                  <span style={{ color: C.secondary }}>Stockout: <strong style={{ color: C.red }}>{r.stockout}</strong></span>
                </div>
                <p className="text-xs italic mb-2.5" style={{ color: C.secondary }}>&ldquo;{r.reason}&rdquo;</p>
                <div className="flex gap-2">
                  <button className="flex-1 py-1.5 rounded-lg text-xs font-semibold text-white"
                    style={{ background: C.maroon }}
                    onClick={() => { onNavigate("purchase-orders"); toast.success("Opening create PO form"); }}>
                    Create PO
                  </button>
                  <button className="px-3 py-1.5 rounded-lg text-xs font-semibold border"
                    style={{ borderColor: C.border, color: C.secondary }}>
                    Review
                  </button>
                </div>
              </div>
            ))}
          </div>
          <button className="mt-3 text-xs font-semibold flex items-center gap-1" style={{ color: C.maroon }}
            onClick={() => onNavigate("predictive")}>View Predictive Analytics <ChevronRight size={11} /></button>
          <p className="text-xs mt-3 pt-3 border-t" style={{ borderColor: C.border, color: C.muted }}>
            Forecast-assisted · Management approval required before ordering.
          </p>
        </Card>
      </div>

      {/* Row 4: Branch Operations */}
      <Card>
        <div className="mb-4">
          <h3 className="font-semibold" style={{ color: C.primary }}>Branch Operations</h3>
          <p className="text-xs mt-0.5" style={{ color: C.secondary }}>Recent inventory, shrinkage, and POS activity for Lipa Branch</p>
        </div>
        <div className="space-y-2.5">
          {[
            { Icon: CheckCircle, color: C.green, label: "POS CSV successfully imported", sub: "Aug 26, 2026 · 540 transactions · ₱48,700 total sales", time: "2 hr ago" },
            { Icon: ClipboardList, color: C.blue, label: "Physical stock count submitted", sub: "Aug 25 end-of-day · 68 items counted · 3 variances noted", time: "Yesterday" },
            { Icon: AlertTriangle, color: C.amber, label: "Spoilage record created", sub: "Whole Milk · 12 L · Temperature issue · ₱1,680 estimated loss", time: "Yesterday" },
            { Icon: ClipboardList, color: C.maroon, label: "Purchase request submitted", sub: "PR-2026-0042 · ₱28,400 · Metro Dairy Supply · Pending approval", time: "2 days ago" },
          ].map((a, i) => (
            <div key={i} className="flex items-start gap-3 p-3 rounded-xl" style={{ background: C.mainBg }}>
              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: `color-mix(in srgb, ${a.color} 10%, transparent)` }}>
                <a.Icon size={14} style={{ color: a.color }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium" style={{ color: C.primary }}>{a.label}</p>
                <p className="text-xs mt-0.5" style={{ color: C.secondary }}>{a.sub}</p>
              </div>
              <span className="text-xs flex-shrink-0" style={{ color: C.muted }}>{a.time}</span>
            </div>
          ))}
        </div>
      </Card>

      {showSpoilage && <SpoilageModal onClose={() => setShowSpoilage(false)}
        onSave={() => { setShowSpoilage(false); toast.success("Loss record saved successfully"); }} />}
    </div>
  );
}

// ─── Spoilage / Wastage Modal ──────────────────────────────────────────────────
function SpoilageModal({ onClose, onSave }: { onClose: () => void; onSave: () => void }) {
  const [classification, setClassification] = useState<"Spoilage" | "Wastage">("Spoilage");

  const reasons = {
    Spoilage: ["Expired", "Contaminated", "Damaged", "Temperature issue", "Quality deterioration", "Other"],
    Wastage: ["Overproduction", "Preparation error", "Spillage", "Improper handling", "Other"],
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.45)" }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6" style={{ border: `1px solid ${C.border}` }}>
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="font-bold text-lg" style={{ color: C.primary }}>Record Inventory Loss</h3>
            <p className="text-xs mt-0.5" style={{ color: C.secondary }}>Lipa Branch · August 26, 2026</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ color: C.secondary, background: C.grayBg }}>
            <X size={15} />
          </button>
        </div>

        <div className="flex rounded-xl border overflow-hidden mb-5" style={{ borderColor: C.border }}>
          {(["Spoilage", "Wastage"] as const).map(c => (
            <button key={c} onClick={() => setClassification(c)}
              className="flex-1 py-2.5 text-sm font-semibold transition-colors"
              style={{ background: classification === c ? C.maroon : C.surface, color: classification === c ? "#fff" : C.secondary }}>
              {c}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4">
          {[
            { label: "Date", type: "date", def: "2026-08-26" },
          ].map(f => (
            <div key={f.label}>
              <label className="block text-sm font-medium mb-1.5" style={{ color: C.primary }}>{f.label}</label>
              <input type={f.type} defaultValue={f.def}
                className="w-full px-3 py-2 text-sm rounded-lg border outline-none"
                style={{ borderColor: C.border, color: C.primary }} />
            </div>
          ))}
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: C.primary }}>Item / SKU</label>
            <select className="w-full px-3 py-2 text-sm rounded-lg border outline-none" style={{ borderColor: C.border, color: C.primary }}>
              <option>Select ingredient…</option>
              <option>Whole Milk (RM-001)</option>
              <option>Arabica Beans (RM-002)</option>
              <option>Croissants (RM-004)</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: C.primary }}>Quantity</label>
            <input type="number" placeholder="0.00" className="w-full px-3 py-2 text-sm rounded-lg border outline-none" style={{ borderColor: C.border, color: C.primary }} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: C.primary }}>Unit</label>
            <select className="w-full px-3 py-2 text-sm rounded-lg border outline-none" style={{ borderColor: C.border, color: C.primary }}>
              <option>L (liters)</option>
              <option>kg (kilograms)</option>
              <option>pcs (pieces)</option>
            </select>
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium mb-1.5" style={{ color: C.primary }}>Reason</label>
            <select className="w-full px-3 py-2 text-sm rounded-lg border outline-none" style={{ borderColor: C.border, color: C.primary }}>
              <option>Select reason…</option>
              {reasons[classification].map(r => <option key={r}>{r}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium mb-1.5" style={{ color: C.primary }}>Notes (optional)</label>
            <textarea rows={2} placeholder="Additional context…"
              className="w-full px-3 py-2 text-sm rounded-lg border outline-none resize-none"
              style={{ borderColor: C.border, color: C.primary }} />
          </div>
        </div>

        <div className="flex items-center justify-between p-3 rounded-xl mb-5" style={{ background: C.mainBg }}>
          <span className="text-sm font-medium" style={{ color: C.secondary }}>Estimated Loss Value</span>
          <span className="text-sm font-bold" style={{ color: C.primary }}>₱0.00 (calculated on save)</span>
        </div>

        <div className="flex gap-3">
          <Btn variant="outline" onClick={onClose}>Cancel</Btn>
          <button className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white" style={{ background: C.maroon }} onClick={onSave}>
            Record Loss
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Sales Analysis ────────────────────────────────────────────────────────────
function SalesAnalysis({ role }: { role: Role }) {
  const [uploadStep, setUploadStep] = useState<"idle" | "select" | "preview" | "done">("idle");
  const [posMenu, setPosMenu] = useState<MenuItem[]>([]);
  const [posLines, setPosLines] = useState<{ menuItemId: string; product: string; quantitySold: number }[]>([]);
  const [posFilename, setPosFilename] = useState("");
  const [posImportError, setPosImportError] = useState("");
  const [posImporting, setPosImporting] = useState(false);
  const [posConsumption, setPosConsumption] = useState<{ name: string; unit: string; expectedConsumption: number }[]>([]);
  const [tab, setTab] = useState("overview");
  const [range, setRange] = useState<DashboardRange>("mtd");
  const [comparison, setComparison] = useState<DashboardComparison>("previous");
  const [customStart, setCustomStart] = useState("2026-08-01");
  const [customEnd, setCustomEnd] = useState("2026-08-26");
  const customDays = Math.max(1, Math.round((new Date(customEnd).getTime() - new Date(customStart).getTime()) / 86400000) + 1);
  const rangeFactor = range === "custom" ? Math.min(customDays / 26, 2) : dashboardRangeFactor(range);
  const periodLabel = dashboardPeriodLabel(range, customStart, customEnd);
  const comparisonLabel = comparison === "previous" ? "previous period" : "last month";
  const visibleSalesTrend = range === "today" ? salesTrend.slice(-1) : range === "custom" ? salesTrend.slice(-Math.min(customDays, 7)) : salesTrend;

  useEffect(() => {
    if (role !== "manager") return;
    void masterDataService.menuItems().then((items) => setPosMenu(items.filter((item) => item.status === "ACTIVE"))).catch(() => setPosMenu([]));
  }, [role]);

  const selectPosFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setPosImportError("");
    try {
      const rows = (await file.text()).split(/\r?\n/).map((row) => row.trim()).filter(Boolean).map((row) => row.split(",").map((cell) => cell.trim().replace(/^\"|\"$/g, "")));
      if (rows.length < 2) throw new Error("The CSV file has no sales rows.");
      const headers = rows[0]!.map((header) => header.toLowerCase().replace(/[\s-]+/g, "_"));
      const productColumn = headers.findIndex((header) => ["product_code", "menu_code", "code", "product", "product_name", "menu_item"].includes(header));
      const quantityColumn = headers.findIndex((header) => ["quantity", "qty", "quantity_sold", "sold"].includes(header));
      if (productColumn < 0 || quantityColumn < 0) throw new Error("CSV headers must include product_code (or product_name) and quantity_sold.");
      const grouped = new Map<string, { menuItemId: string; product: string; quantitySold: number }>();
      for (const row of rows.slice(1)) {
        const productValue = row[productColumn]?.toLowerCase();
        const quantity = Number(row[quantityColumn]);
        const menuItem = posMenu.find((item) => item.code.toLowerCase() === productValue || item.name.toLowerCase() === productValue);
        if (!menuItem) throw new Error(`Unknown or inactive menu product: ${row[productColumn] || "blank value"}`);
        if (!Number.isFinite(quantity) || quantity <= 0) throw new Error(`Invalid quantity for ${menuItem.name}.`);
        const current = grouped.get(menuItem.id);
        grouped.set(menuItem.id, { menuItemId: menuItem.id, product: menuItem.name, quantitySold: (current?.quantitySold ?? 0) + quantity });
      }
      setPosLines([...grouped.values()]);
      setPosFilename(file.name);
      setUploadStep("preview");
    } catch (reason) {
      setPosLines([]);
      setPosImportError(reason instanceof Error ? reason.message : "Unable to read the POS CSV file.");
    } finally {
      event.target.value = "";
    }
  };

  const confirmPosImport = async () => {
    if (!posLines.length) return;
    setPosImporting(true); setPosImportError("");
    try {
      const result = await inventoryWorkflowService.importPosSales({
        businessDate: new Date().toISOString().slice(0, 10),
        sourceFilename: posFilename,
        items: posLines.map(({ menuItemId, quantitySold }) => ({ menuItemId, quantitySold })),
      });
      setPosConsumption(result.consumption);
      setUploadStep("done");
    } catch (reason) {
      setPosImportError(reason instanceof Error ? reason.message : "Unable to import POS sales.");
    } finally { setPosImporting(false); }
  };

  return (
    <div className="p-6 space-y-5">
      <SectionHeader title="Sales Analysis"
        sub={`${role === "owner" ? "All branches" : "Lipa Branch"} · ${periodLabel}`}
        actions={
          <>
            {role === "manager" && <Btn variant="primary" icon={Upload} onClick={() => setUploadStep("select")}>Import POS CSV</Btn>}
            {role === "owner" && <Select options={["All Branches", "Gulod", "Lipa", "Vermosa", "Tagaytay", "Evo"]} small />}
            <DashboardFilters range={range} comparison={comparison} customStart={customStart} customEnd={customEnd}
              onRangeChange={setRange} onComparisonChange={setComparison}
              onApplyCustom={(start, end) => { setCustomStart(start); setCustomEnd(end); }}
              onReset={() => { setRange("mtd"); setCustomStart("2026-08-01"); setCustomEnd("2026-08-26"); }} />
          </>
        } />

      <div className="grid grid-cols-4 gap-4">
        <KPICard label="Total Sales" value={formatPeso(1120500 * rangeFactor)} change={comparison === "previous" ? "+8.3%" : "+6.9%"} changeDir="up" sub={periodLabel} icon={ShoppingCart} color={C.maroon} comparisonLabel={comparisonLabel} />
        <KPICard label="Total COGS" value={formatPeso(482100 * rangeFactor)} change={comparison === "previous" ? "+5.1%" : "+4.4%"} changeDir="up" sub="43.0% of sales" icon={Package} color={C.amber} comparisonLabel={comparisonLabel} />
        <KPICard label="Gross Profit" value={formatPeso(638400 * rangeFactor)} change={comparison === "previous" ? "+10.7%" : "+8.8%"} changeDir="up" sub="57.0% margin" icon={TrendingUp} color={C.green} comparisonLabel={comparisonLabel} />
        <KPICard label="Transactions" value={Math.round(12420 * rangeFactor).toLocaleString()} change={comparison === "previous" ? "+6.4%" : "+5.2%"} changeDir="up" sub="Completed POS sales" icon={Hash} color={C.blue} comparisonLabel={comparisonLabel} />
      </div>

      <div className="flex gap-1 border-b" style={{ borderColor: C.border }}>
        {["overview", "products", role === "owner" ? "branches" : "import_history"].map(t => (
          <button key={t} onClick={() => setTab(t)}
            className="px-4 py-2.5 text-sm font-medium border-b-2 transition-colors capitalize"
            style={{ borderColor: tab === t ? C.maroon : "transparent", color: tab === t ? C.maroon : C.secondary }}>
            {t === "import_history" ? "Import History" : t}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="grid grid-cols-3 gap-5">
          <Card className="col-span-2" padding={false}>
            <div className="px-5 pt-5 pb-0">
              <h3 className="font-semibold mb-4" style={{ color: C.primary }}>Sales vs COGS Trend</h3>
            </div>
            <div className="h-64 px-3 pb-4">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={visibleSalesTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: C.secondary }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: C.secondary }} axisLine={false} tickLine={false}
                    tickFormatter={v => `₱${(v / 1000).toFixed(0)}k`} />
                  <Tooltip content={<ChartTip />} />
                  <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="sales" name="Sales" fill={`color-mix(in srgb, ${C.maroon} 18%, transparent)`} stroke={C.maroon} strokeWidth={1} radius={[3, 3, 0, 0]} />
                  <Line dataKey="cogs" name="COGS" stroke={C.amber} strokeWidth={2} dot={false} />
                  <Line dataKey="gp" name="Gross Profit" stroke={C.green} strokeWidth={2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </Card>
          <Card>
            <h3 className="font-semibold mb-4" style={{ color: C.primary }}>Top Products</h3>
            <div className="space-y-3.5">
              {topProducts.map((p, i) => (
                <div key={p.product}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm" style={{ color: C.primary }}>{p.product}</span>
                    <span className="text-sm font-semibold" style={{ color: C.primary }}>₱{(p.sales / 1000).toFixed(0)}k</span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: C.grayBg }}>
                    <div className="h-full rounded-full" style={{
                      width: `${p.pct}%`,
                      background: i === 0 ? C.maroon : i === 1 ? C.mediumMaroon : C.blue
                    }} />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {(tab === "import_history" || tab === "branches") && (
        <Card padding={false}>
          <div className="px-5 pt-5 pb-3">
            <div className="flex items-center gap-2 mb-4">
              <SearchInput placeholder="Search imports…" />
              {role === "owner" && <Select options={["All Branches", "Gulod", "Lipa", "Vermosa", "Tagaytay", "Evo"]} />}
              <Select options={["All Status", "Imported", "Pending", "Failed", "Duplicate"]} />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <THead cols={role === "owner"
                ? ["Branch", "Business Date", "Filename", "Uploaded By", "Time", "Transactions", "Status"]
                : ["Business Date", "Filename", "Upload Time", "Transactions", "Total Sales", "Status"]} />
              <tbody>
                {[
                  { branch: "Lipa", date: "Aug 26, 2026", file: "lipa_20260826_pos.csv", by: "M. Santos", time: "08:14 AM", txns: 540, sales: "₱48,700", status: "imported" },
                  { branch: "Gulod", date: "Aug 26, 2026", file: "gulod_20260826_pos.csv", by: "A. Reyes", time: "07:58 AM", txns: 612, sales: "₱56,400", status: "imported" },
                  { branch: "Vermosa", date: "Aug 25, 2026", file: "vermosa_20260825_pos.csv", by: "J. Cruz", time: "09:22 PM", txns: 489, sales: "₱44,200", status: "imported" },
                  { branch: "Lipa", date: "Aug 25, 2026", file: "lipa_20260825_pos.csv", by: "M. Santos", time: "08:47 PM", txns: 0, sales: "—", status: "failed" },
                  { branch: "Tagaytay", date: "Aug 25, 2026", file: "tagaytay_20260825_pos.csv", by: "J. Lim", time: "09:01 PM", txns: 524, sales: "₱48,900", status: "imported" },
                ].map((row, i) => (
                  <TR key={i}>
                    {role === "owner" && <TD><span className="font-semibold" style={{ color: C.maroon }}>{row.branch}</span></TD>}
                    <TD muted>{row.date}</TD>
                    <TD><span className="font-mono text-xs" style={{ color: C.primary }}>{row.file}</span></TD>
                    {role === "owner" && <TD muted>{row.by}</TD>}
                    <TD muted>{row.time}</TD>
                    <TD right>{row.txns > 0 ? row.txns.toLocaleString() : <span style={{ color: C.muted }}>—</span>}</TD>
                    <TD right>{row.sales}</TD>
                    <TD><StatusChip status={row.status} /></TD>
                  </TR>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination total={28} page={1} perPage={5} />
        </Card>
      )}

      {/* CSV Upload Modal */}
      {role === "manager" && uploadStep !== "idle" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.45)" }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6" style={{ border: `1px solid ${C.border}` }}>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="font-bold text-lg" style={{ color: C.primary }}>Upload POS CSV</h3>
                <p className="text-xs mt-0.5" style={{ color: C.secondary }}>Lipa Branch — Import daily sales data</p>
              </div>
              <button onClick={() => setUploadStep("idle")} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ color: C.secondary, background: C.grayBg }}>
                <X size={15} />
              </button>
            </div>

            {/* Step indicators */}
            <div className="flex items-center gap-2 mb-6">
              {["Select File", "Validate", "Confirm"].map((s, i) => {
                const stepIdx = uploadStep === "select" ? 0 : uploadStep === "preview" ? 1 : 2;
                const done = i < stepIdx;
                const active = i === stepIdx;
                return (
                  <React.Fragment key={s}>
                    <div className="flex items-center gap-1.5">
                      <div className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold"
                        style={{ background: done || active ? C.maroon : C.grayBg, color: done || active ? "#fff" : C.muted }}>
                        {done ? <Check size={11} /> : i + 1}
                      </div>
                      <span className="text-xs font-medium" style={{ color: active ? C.maroon : C.muted }}>{s}</span>
                    </div>
                    {i < 2 && <div className="flex-1 h-px" style={{ background: done ? C.maroon : C.border }} />}
                  </React.Fragment>
                );
              })}
            </div>

            {uploadStep === "select" && (
              <>
                <label className="block border-2 border-dashed rounded-xl p-8 text-center mb-4 cursor-pointer transition-all"
                  style={{ borderColor: C.border }}>
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-3" style={{ background: C.grayBg }}>
                    <Upload size={20} style={{ color: C.muted }} />
                  </div>
                  <p className="text-sm font-semibold" style={{ color: C.primary }}>Drop your POS CSV file here</p>
                  <p className="text-xs mt-1" style={{ color: C.secondary }}>Click to browse · Headers: product_code, quantity_sold</p>
                  <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(event) => void selectPosFile(event)} />
                </label>
                {posImportError && <div className="mb-4 p-3 rounded-xl text-sm" style={{ color: C.red, background: C.redBg }}>{posImportError}</div>}
                <div className="flex gap-3">
                  <Btn variant="outline" onClick={() => setUploadStep("idle")}>Cancel</Btn>
                  <label className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white text-center cursor-pointer" style={{ background: C.maroon }}>
                    Select File<input type="file" accept=".csv,text/csv" className="sr-only" onChange={(event) => void selectPosFile(event)} />
                  </label>
                </div>
              </>
            )}

            {uploadStep === "preview" && (
              <>
                <div className="p-4 rounded-xl border mb-4" style={{ borderColor: C.border, background: C.mainBg }}>
                  <p className="text-sm font-semibold mb-3" style={{ color: C.primary }}>Validation Preview</p>
                  <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-sm">
                    {[
                      ["File", posFilename],
                      ["Business Date", new Date().toLocaleDateString("en-PH")],
                      ["Products", `${posLines.length} valid product lines`],
                      ["Units Sold", posLines.reduce((sum, line) => sum + line.quantitySold, 0).toLocaleString()],
                    ].map(([label, value]) => (
                      <div key={label}>
                        <span style={{ color: C.secondary }}>{label}: </span>
                        <span className="font-semibold" style={{ color: label.includes("Error") || label.includes("Duplicate") ? C.green : C.primary }}>{value}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 pt-3 border-t space-y-2" style={{ borderColor: C.border }}>
                    {posLines.map((line) => <div key={line.menuItemId} className="flex justify-between text-sm"><span style={{ color: C.secondary }}>{line.product}</span><strong style={{ color: C.primary }}>{line.quantitySold} sold</strong></div>)}
                  </div>
                </div>
                {posImportError && <div className="mb-4 p-3 rounded-xl text-sm" style={{ color: C.red, background: C.redBg }}>{posImportError}</div>}
                <div className="flex items-center gap-2 mb-4 p-3 rounded-xl" style={{ background: C.greenBg }}>
                  <CheckCircle size={14} style={{ color: C.green }} />
                  <span className="text-sm font-medium" style={{ color: C.green }}>File validated successfully. Ready to import.</span>
                </div>
                <div className="flex gap-3">
                  <Btn variant="outline" onClick={() => setUploadStep("select")}>Back</Btn>
                  <button disabled={posImporting || !posLines.length} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-50" style={{ background: C.maroon }}
                    onClick={() => void confirmPosImport()}>{posImporting ? "Importing…" : "Confirm Import"}</button>
                </div>
              </>
            )}

            {uploadStep === "done" && (
              <>
                <div className="text-center py-8">
                  <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: C.greenBg }}>
                    <CheckCircle size={32} style={{ color: C.green }} />
                  </div>
                  <h4 className="font-bold text-lg mb-1" style={{ color: C.primary }}>Import Successful</h4>
                  <p className="text-sm" style={{ color: C.secondary }}>{posLines.reduce((sum, line) => sum + line.quantitySold, 0)} units sold were connected to their configured recipes.</p>
                  <p className="text-xs mt-1" style={{ color: C.muted }}>{posFilename}</p>
                  <div className="mt-4 p-3 rounded-xl text-left space-y-1.5" style={{ background: C.mainBg }}>
                    <p className="text-xs font-bold uppercase tracking-wide" style={{ color: C.secondary }}>Expected ingredient consumption</p>
                    {posConsumption.map((item) => <div key={`${item.name}-${item.unit}`} className="flex justify-between text-xs"><span>{item.name}</span><strong>{item.expectedConsumption.toFixed(2)} {item.unit}</strong></div>)}
                  </div>
                </div>
                <button className="w-full py-2.5 rounded-xl text-sm font-bold text-white" style={{ background: C.maroon }}
                  onClick={() => { setUploadStep("idle"); setPosLines([]); setPosConsumption([]); setPosFilename(""); toast.success("POS CSV imported successfully"); }}>
                  Done
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Inventory Overview ────────────────────────────────────────────────────────
function InventoryOverview({ role, onNavigate }: { role: Role; onNavigate: (page: Page) => void }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All Categories");
  const [statusFilter, setStatusFilter] = useState("All Status");
  const [branchFilter, setBranchFilter] = useState("All Branches");
  const [showLoss, setShowLoss] = useState(false);
  const statusValues: Record<string, string> = { Healthy: "healthy", "Low Stock": "low", Critical: "critical", "Out of Stock": "out" };
  const itemBranches: Record<string, string> = {
    "RM-001": "Lipa", "RM-002": "Vermosa", "RM-003": "Gulod", "RM-004": "Tagaytay",
    "RM-005": "Lipa", "RM-006": "Evo", "RM-007": "Gulod", "RM-008": "Lipa",
  };
  const filteredItems = inventoryItems.filter(item => {
    const query = searchTerm.trim().toLowerCase();
    const matchesSearch = !query || item.sku.toLowerCase().includes(query) || item.name.toLowerCase().includes(query) || item.cat.toLowerCase().includes(query);
    const matchesCategory = categoryFilter === "All Categories" || item.cat === categoryFilter;
    const matchesStatus = statusFilter === "All Status" || item.status === statusValues[statusFilter];
    const matchesBranch = role !== "owner" || branchFilter === "All Branches" || itemBranches[item.sku] === branchFilter;
    return matchesSearch && matchesCategory && matchesStatus && matchesBranch;
  });
  const resetInventoryFilters = () => {
    setSearchTerm("");
    setCategoryFilter("All Categories");
    setStatusFilter("All Status");
    setBranchFilter("All Branches");
  };

  return (
    <div className="p-6 space-y-5">
      <SectionHeader title="Inventory Overview"
        sub={role === "owner" ? "All branches · 228 active SKUs" : "Lipa Branch · 68 active SKUs"}
        actions={
          <>
            {role === "manager" && (
              <>
                <Btn variant="secondary" icon={ClipboardList} size="sm" onClick={() => onNavigate("physical-count")}>Record Stock Count</Btn>
                <Btn variant="secondary" icon={AlertTriangle} size="sm" onClick={() => setShowLoss(true)}>Record Loss</Btn>
              </>
            )}
          </>
        } />

      <div className="inventory-kpi-grid grid grid-cols-5 gap-4">
        <KPICard label="Inventory Value" value="₱312,450" change="-1.2%" changeDir="down" icon={DollarSign} color={C.blue} />
        <KPICard label="Total SKUs" value="228" sub="Across all branches" icon={Hash} color={C.maroon} />
        <KPICard label="Low Stock" value="34 items" change="+5 this week" changeDir="down" icon={AlertCircle} color={C.amber}
          onClick={() => setStatusFilter("Low Stock")} active={statusFilter === "Low Stock"} />
        <KPICard label="Critical" value="12 items" sub="Below safety threshold" icon={AlertTriangle} color={C.red}
          onClick={() => setStatusFilter("Critical")} active={statusFilter === "Critical"} />
        <KPICard label="Out of Stock" value="4 items" sub="Immediate reorder needed" icon={XCircle} color={C.deepMaroon}
          onClick={() => setStatusFilter("Out of Stock")} active={statusFilter === "Out of Stock"} />
      </div>

      <Card padding={false}>
        <div className="px-5 pt-5 pb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <SearchInput placeholder="Search SKU or item…" value={searchTerm} onChange={setSearchTerm} />
            {role === "owner" && <Select options={["All Branches", "Gulod", "Lipa", "Vermosa", "Tagaytay", "Evo"]} value={branchFilter} onChange={setBranchFilter} />}
            <Select options={["All Categories", "Dairy", "Coffee", "Bakery", "Sweeteners", "Dairy Alt"]} value={categoryFilter} onChange={setCategoryFilter} />
            <Select options={["All Status", "Healthy", "Low Stock", "Critical", "Out of Stock"]} value={statusFilter} onChange={setStatusFilter} />
            <div className="ml-auto">
              <Btn variant="outline" icon={RefreshCw} size="sm" onClick={resetInventoryFilters}>Refresh</Btn>
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <THead cols={role === "owner"
              ? ["SKU", "Ingredient", "Category", "Branch", "On Hand", "Unit Cost", "Value", "Reorder Pt.", "Status", "Last Count"]
              : ["SKU", "Ingredient", "Category", "On Hand", "Unit", "Unit Cost", "Value", "Reorder Pt.", "Status", "Actions"]} />
            <tbody>
              {filteredItems.map(item => (
                <TR key={item.sku}>
                  <TD mono muted>{item.sku}</TD>
                  <TD><span className="font-medium">{item.name}</span></TD>
                  <TD muted>{item.cat}</TD>
                  {role === "owner" && <TD muted>{itemBranches[item.sku] ?? "Lipa"}</TD>}
                  <TD right className={item.status === "out" ? "font-bold" : ""} style={{ color: item.status === "out" ? C.red : undefined }}>{item.onHand}</TD>
                  {role === "manager" && <TD muted>{item.unit}</TD>}
                  <TD right muted>₱{item.unitCost.toLocaleString()}</TD>
                  <TD right>₱{item.value.toLocaleString()}</TD>
                  <TD right muted>{item.reorder}</TD>
                  <TD><StatusChip status={item.status} /></TD>
                  {role === "owner" && <TD muted>{item.lastCount}</TD>}
                  {role === "manager" && (
                    <TD>
                      <div className="flex gap-1">
                        <button className="p-1.5 rounded-md transition-colors" style={{ color: C.secondary }}
                          onMouseEnter={e => (e.currentTarget.style.background = C.grayBg)}
                          onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                          <Eye size={13} />
                        </button>
                        <button className="p-1.5 rounded-md transition-colors" style={{ color: C.secondary }}
                          onMouseEnter={e => (e.currentTarget.style.background = C.grayBg)}
                          onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                          <Edit2 size={13} />
                        </button>
                      </div>
                    </TD>
                  )}
                </TR>
              ))}
              {filteredItems.length === 0 && (
                <tr>
                  <td colSpan={role === "owner" ? 10 : 10} className="px-4 py-12 text-center">
                    <div className="text-sm font-semibold" style={{ color: C.primary }}>No inventory items found</div>
                    <div className="text-xs mt-1" style={{ color: C.secondary }}>Try changing the search or filters, or click Refresh.</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Pagination total={filteredItems.length} page={1} perPage={8} />
      </Card>
      {showLoss && <SpoilageModal onClose={() => setShowLoss(false)} onSave={() => { setShowLoss(false); toast.success("Loss record saved successfully"); }} />}
    </div>
  );
}

// ─── Physical Count ────────────────────────────────────────────────────────────
function PhysicalCount() {
  const [counts, setCounts] = useState<Record<string, number>>(
    Object.fromEntries(inventoryItems.map(i => [i.sku, i.onHand]))
  );
  const [submitted, setSubmitted] = useState(false);

  const getVar = (sku: string) => counts[sku] - (inventoryItems.find(i => i.sku === sku)?.onHand ?? 0);

  if (submitted) {
    return (
      <div className="p-6">
        <div className="max-w-md mx-auto text-center py-20">
          <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: C.greenBg }}>
            <CheckCircle size={30} style={{ color: C.green }} />
          </div>
          <h2 className="text-xl font-bold mb-2" style={{ color: C.primary }}>Count Submitted</h2>
          <p className="text-sm mb-6 leading-relaxed" style={{ color: C.secondary }}>
            Physical count for Lipa Branch (Aug 26, 2026) has been submitted for review. 3 variances detected and flagged for reconciliation.
          </p>
          <div className="flex gap-3 justify-center">
            <Btn variant="outline" onClick={() => setSubmitted(false)}>New Count</Btn>
            <Btn variant="primary">View Variance Report</Btn>
          </div>
        </div>
      </div>
    );
  }

  const hasNegativeVariance = Object.keys(counts).some(sku => getVar(sku) < 0);

  return (
    <div className="p-6 space-y-5">
      <SectionHeader title="Physical Inventory Count"
        sub="Lipa Branch · August 26, 2026 · In Progress"
        actions={
          <>
            <Btn variant="outline" size="sm">Save Draft</Btn>
            <Btn variant="primary" size="sm" onClick={() => { setSubmitted(true); toast.success("Count submitted for review"); }}>
              Submit Count
            </Btn>
          </>
        } />

      <div className="flex items-center gap-2.5 p-3.5 rounded-xl border" style={{ borderColor: C.amber + "80", background: C.amberBg }}>
        <AlertCircle size={14} style={{ color: C.amber }} />
        <p className="text-sm" style={{ color: "#7A4A00" }}>
          Enter the physical count for each item. Variance is calculated automatically. Submit when all items are counted.
        </p>
      </div>

      <Card padding={false}>
        <div className="overflow-x-auto">
          <table className="w-full">
            <THead cols={["SKU", "Ingredient", "System Qty", "Physical Count", "Variance", "Unit", "Notes"]} />
            <tbody>
              {inventoryItems.map(item => {
                const v = getVar(item.sku);
                const vColor = v === 0 ? C.secondary : v < 0 ? C.red : C.green;
                return (
                  <TR key={item.sku}>
                    <TD mono muted>{item.sku}</TD>
                    <TD><span className="font-medium">{item.name}</span></TD>
                    <TD right muted>{item.onHand}</TD>
                    <TD right>
                      <input type="number" value={counts[item.sku]}
                        onChange={e => setCounts(p => ({ ...p, [item.sku]: parseFloat(e.target.value) || 0 }))}
                        className="w-20 px-2 py-1 text-sm rounded-lg border text-right outline-none font-semibold"
                        style={{ borderColor: C.border, color: C.primary }}
                        onFocus={e => (e.target.style.borderColor = C.maroon)}
                        onBlur={e => (e.target.style.borderColor = C.border)} />
                    </TD>
                    <TD right>
                      <span className="text-sm font-bold" style={{ color: vColor }}>
                        {v > 0 ? "+" : ""}{v !== 0 ? v : <span style={{ color: C.muted }}>—</span>}
                      </span>
                    </TD>
                    <TD muted>{item.unit}</TD>
                    <TD>
                      <input className="w-36 px-2 py-1 text-xs rounded-lg border outline-none"
                        style={{ borderColor: C.border, color: C.secondary }}
                        placeholder="Add note…" />
                    </TD>
                  </TR>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between px-5 py-4 border-t" style={{ borderColor: C.border }}>
          {hasNegativeVariance ? (
            <div className="flex items-center gap-2" style={{ color: C.amber }}>
              <AlertCircle size={14} />
              <span className="text-sm font-semibold">Variance requires reconciliation before final submission.</span>
            </div>
          ) : (
            <div className="flex items-center gap-2" style={{ color: C.green }}>
              <CheckCircle size={14} />
              <span className="text-sm font-semibold">All counts entered. Ready to submit.</span>
            </div>
          )}
          <div className="flex gap-3">
            <Btn variant="outline">Save Draft</Btn>
            <Btn variant="primary" onClick={() => { setSubmitted(true); toast.success("Count submitted for review"); }}>
              Submit Count
            </Btn>
          </div>
        </div>
      </Card>
    </div>
  );
}

// ─── Shrinkage Monitoring ──────────────────────────────────────────────────────
function ShrinkageMonitoring({ role }: { role: Role }) {
  return (
    <div className="p-6 space-y-5">
      <SectionHeader title="Shrinkage Monitoring"
        sub={role === "owner" ? "All branches · August 2026" : "Lipa Branch · August 2026"}
        actions={
          <>
            <Btn variant="outline" icon={Calendar} size="sm">Aug 1–26, 2026</Btn>
            {role === "owner" && <Select options={["All Branches", "Gulod", "Lipa", "Vermosa", "Tagaytay", "Evo"]} />}
          </>
        } />

      <div className={`grid gap-4 ${role === "owner" ? "grid-cols-5" : "grid-cols-4"}`}>
        <KPICard label="Total Shrinkage" value="₱18,450" change="+4.2%" changeDir="down" icon={TrendingDown} color={C.red} />
        <KPICard label="Spoilage" value="₱7,840" sub="42.5% of shrinkage" icon={AlertCircle} color={C.amber} />
        <KPICard label="Wastage" value="₱5,920" sub="32.1% of shrinkage" icon={AlertTriangle} color={C.blue} />
        <KPICard label="Unexplained Variance" value="₱4,690" sub="Potential pilferage" icon={Shield} color={C.red} />
        {role === "owner" && <KPICard label="Highest Shrinkage" value="Vermosa" sub="₱5,100 · 2.57% rate" icon={Building2} color={C.maroon} />}
      </div>

      <div className="grid grid-cols-3 gap-5">
        <Card className="col-span-2" padding={false}>
          <div className="px-5 pt-5 pb-0">
            <h3 className="font-semibold mb-1" style={{ color: C.primary }}>Shrinkage Trend</h3>
            <p className="text-xs mb-4" style={{ color: C.secondary }}>6-month overview · Classification breakdown</p>
          </div>
          <div className="h-56 px-3 pb-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={[
                { month: "Mar", spoilage: 2800, wastage: 1900, pilferage: 1100 },
                { month: "Apr", spoilage: 3100, wastage: 2100, pilferage: 1400 },
                { month: "May", spoilage: 2600, wastage: 1800, pilferage: 1200 },
                { month: "Jun", spoilage: 3400, wastage: 2300, pilferage: 1500 },
                { month: "Jul", spoilage: 3700, wastage: 2600, pilferage: 1800 },
                { month: "Aug", spoilage: 7840, wastage: 5920, pilferage: 4690 },
              ]}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: C.secondary }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: C.secondary }} axisLine={false} tickLine={false}
                  tickFormatter={v => `₱${(v / 1000).toFixed(0)}k`} />
                <Tooltip content={<ChartTip />} />
                <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                <Area type="monotone" dataKey="spoilage" name="Spoilage" stackId="1" fill={`color-mix(in srgb, ${C.amber} 22%, transparent)`} stroke={C.amber} strokeWidth={1.5} />
                <Area type="monotone" dataKey="wastage" name="Wastage" stackId="1" fill={`color-mix(in srgb, ${C.blue} 22%, transparent)`} stroke={C.blue} strokeWidth={1.5} />
                <Area type="monotone" dataKey="pilferage" name="Potential Pilferage" stackId="1" fill={`color-mix(in srgb, ${C.red} 19%, transparent)`} stroke={C.red} strokeWidth={1.5} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card>
          <h3 className="font-semibold mb-4" style={{ color: C.primary }}>Shrinkage by Classification</h3>
          <div className="flex justify-center mb-4">
            <ResponsiveContainer width={170} height={160}>
              <RPieChart>
                <Pie data={shrinkageBreakdown} cx="50%" cy="50%" innerRadius={48} outerRadius={75}
                  paddingAngle={3} dataKey="value">
                  {shrinkageBreakdown.map((s, i) => <Cell key={i} fill={s.color} />)}
                </Pie>
              </RPieChart>
            </ResponsiveContainer>
          </div>
          {shrinkageBreakdown.map((s) => (
            <div key={s.name} className="flex items-center justify-between py-1.5 border-b last:border-0" style={{ borderColor: C.border }}>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: s.color }} />
                <span className="text-sm" style={{ color: C.secondary }}>{s.name}</span>
              </div>
              <div className="text-right">
                <div className="text-sm font-bold" style={{ color: C.primary }}>₱{s.value.toLocaleString()}</div>
                <div className="text-xs" style={{ color: C.muted }}>{s.pct}%</div>
              </div>
            </div>
          ))}
        </Card>
      </div>

      <Card padding={false}>
        <div className="px-5 pt-5 pb-3">
          <h3 className="font-semibold mb-3" style={{ color: C.primary }}>Shrinkage Detail</h3>
          <div className="flex items-center gap-2">
            <SearchInput placeholder="Search item or SKU…" />
            {role === "owner" && <Select options={["All Branches", "Gulod", "Lipa", "Vermosa", "Tagaytay", "Evo"]} />}
            <Select options={["All Classifications", "Spoilage", "Wastage", "Potential Pilferage"]} />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <THead cols={["Date", "Item", ...(role === "owner" ? ["Branch"] : []), "Expected", "Actual", "Variance", "Classification", "Value Loss", "Reason", "Recorded By", "Status"]} />
            <tbody>
              {shrinkageRows.map((s, i) => (
                <TR key={i}>
                  <TD muted>{s.date}</TD>
                  <TD><span className="font-medium">{s.item}</span></TD>
                  {role === "owner" && <TD muted>{s.branch}</TD>}
                  <TD right muted>{s.expected}</TD>
                  <TD right muted>{s.actual}</TD>
                  <TD right><span className="font-bold" style={{ color: C.red }}>{s.variance}</span></TD>
                  <TD>
                    <span className="text-xs font-semibold" style={{ color: s.classification === "Potential Pilferage" ? C.red : C.secondary }}>
                      {s.classification}
                    </span>
                  </TD>
                  <TD right><span style={{ color: C.red }}>₱{s.value.toLocaleString()}</span></TD>
                  <TD muted><span className="text-xs">{s.reason}</span></TD>
                  <TD muted>{s.recordedBy}</TD>
                  <TD>
                    {s.status === "Investigation Required" ? <StatusChip status="investigation" /> : <StatusChip status="matched" />}
                  </TD>
                </TR>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination total={24} page={1} perPage={5} />
      </Card>
    </div>
  );
}

// ─── Variance Monitoring ───────────────────────────────────────────────────────
function VarianceMonitoring({ role }: { role: Role }) {
  return (
    <div className="p-6 space-y-5">
      <SectionHeader title="Variance Monitoring"
        sub="Comparing expected inventory vs. physical count results"
        actions={
          <>
            <Btn variant="outline" icon={Calendar} size="sm">Aug 26, 2026</Btn>
            {role === "owner" && <Select options={["All Branches", "Gulod", "Lipa", "Vermosa", "Tagaytay", "Evo"]} />}
          </>
        } />

      <div className="grid grid-cols-4 gap-4">
        <KPICard label="Total Variance" value="-₱7,950" sub="Net inventory gap" icon={GitCompare} color={C.red} />
        <KPICard label="Shortage Value" value="₱9,250" sub="Below expected" icon={ArrowDown} color={C.red} />
        <KPICard label="Excess Value" value="₱1,300" sub="Above expected" icon={ArrowUp} color={C.green} />
        <KPICard label="Investigation Required" value="1 item" sub="Arabica Beans — Vermosa" icon={AlertTriangle} color={C.amber} />
      </div>

      <Card padding={false}>
        <div className="px-5 pt-5 pb-0">
          <h3 className="font-semibold mb-1" style={{ color: C.primary }}>Expected vs. Actual Inventory</h3>
          <p className="text-xs mb-4" style={{ color: C.secondary }}>August 26, 2026 end-of-day physical count</p>
        </div>
        <div className="h-52 px-3 pb-4">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={varianceRows} barSize={22} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
              <XAxis dataKey="item" tick={{ fontSize: 10, fill: C.secondary }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: C.secondary }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTip />} />
              <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="expected" name="Expected" fill={`color-mix(in srgb, ${C.blue} 38%, transparent)`} stroke={C.blue} strokeWidth={1} radius={[3, 3, 0, 0]} />
              <Bar dataKey="actual" name="Actual" fill={C.maroon} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card padding={false}>
        <div className="px-5 pt-5 pb-3">
          <div className="flex items-center gap-2">
            <SearchInput placeholder="Search item…" />
            <Select options={["All Status", "Matched", "Explained", "Needs Review", "Investigation Required", "Resolved"]} />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <THead cols={["SKU", "Item", "Expected", "Actual", "Variance", "Variance %", "Est. Value", "Classification", "Status"]} />
            <tbody>
              {varianceRows.map((v, i) => (
                <TR key={i}>
                  <TD mono muted>{v.sku}</TD>
                  <TD><span className="font-medium">{v.item}</span></TD>
                  <TD right muted>{v.expected}</TD>
                  <TD right muted>{v.actual}</TD>
                  <TD right>
                    <span className="font-bold" style={{ color: v.variance < 0 ? C.red : v.variance > 0 ? C.green : C.secondary }}>
                      {v.variance > 0 ? "+" : ""}{v.variance || "—"}
                    </span>
                  </TD>
                  <TD right>
                    <span style={{ color: v.pct < 0 ? C.red : v.pct > 0 ? C.green : C.secondary }}>
                      {v.pct > 0 ? "+" : ""}{v.pct.toFixed(1)}%
                    </span>
                  </TD>
                  <TD right>
                    {v.value !== 0 ? <span style={{ color: v.value < 0 ? C.red : C.green }}>₱{Math.abs(v.value).toLocaleString()}</span> : <span style={{ color: C.muted }}>—</span>}
                  </TD>
                  <TD muted><span className="text-xs">{v.classification}</span></TD>
                  <TD><StatusChip status={v.status} /></TD>
                </TR>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ─── Purchase Orders ───────────────────────────────────────────────────────────
function PurchaseOrders({ role }: { role: Role }) {
  const [tab, setTab] = useState(role === "owner" ? "pending" : "all");
  const [selectedPO, setSelectedPO] = useState<typeof purchaseOrders[0] | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [actionModal, setActionModal] = useState<{ po: typeof purchaseOrders[0]; type: "approve" | "reject" } | null>(null);

  const tabs = role === "owner"
    ? ["pending", "approved", "rejected", "completed"]
    : ["all", "draft", "pending", "approved", "rejected", "completed"];

  const filtered = tab === "all" ? purchaseOrders : purchaseOrders.filter(p => p.status === tab);
  const pendingCount = purchaseOrders.filter(p => p.status === "pending").length;

  return (
    <div className="p-6 space-y-5">
      <SectionHeader
        title={role === "owner" ? "Purchase Order Approvals" : "Purchase Requests"}
        sub={role === "owner" ? "Review and approve branch purchase requests" : "Lipa Branch"}
        actions={
          <>
            {role === "manager" && <Btn variant="primary" icon={Plus} onClick={() => setShowCreate(true)}>Create Purchase Request</Btn>}
          </>
        } />

      {role === "owner" && pendingCount > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl border" style={{ borderColor: C.amber + "80", background: C.amberBg }}>
          <Clock size={14} style={{ color: C.amber }} />
          <p className="text-sm font-medium" style={{ color: "#7A4A00" }}>
            <strong>{pendingCount} purchase requests</strong> are awaiting your approval.
          </p>
          <button className="ml-auto text-sm font-bold" style={{ color: C.amber }}>Review All</button>
        </div>
      )}

      <div className="flex gap-1 border-b" style={{ borderColor: C.border }}>
        {tabs.map(t => {
          const cnt = t === "all" ? purchaseOrders.length : purchaseOrders.filter(p => p.status === t).length;
          return (
            <button key={t} onClick={() => setTab(t)}
              className="px-4 py-2.5 text-sm font-medium capitalize border-b-2 flex items-center gap-1.5 transition-colors"
              style={{ borderColor: tab === t ? C.maroon : "transparent", color: tab === t ? C.maroon : C.secondary }}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
              {cnt > 0 && (
                <span className="px-1.5 py-0.5 rounded text-xs font-bold"
                  style={{ background: t === "pending" ? C.amberBg : C.grayBg, color: t === "pending" ? C.amber : C.secondary }}>
                  {cnt}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <Card>
          <EmptyState icon={Inbox} title="No purchase requests"
            body="Purchase requests submitted by branch managers will appear here."
            action={role === "manager" ? "Create Purchase Request" : undefined}
            onAction={() => setShowCreate(true)} />
        </Card>
      ) : (
        <Card padding={false}>
          <div className="px-5 pt-5 pb-3">
            <div className="flex items-center gap-2">
              <SearchInput placeholder="Search PO number…" />
              {role === "owner" && <Select options={["All Branches", "Gulod", "Lipa", "Vermosa", "Tagaytay", "Evo"]} />}
              <Select options={["All Suppliers", "Metro Dairy Supply", "PH Coffee Traders", "Artisan Bakers PH"]} />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <THead cols={role === "owner"
                ? ["PO Number", "Branch", "Supplier", "Requested By", "Date", "Amount", "AI Match", "Status", "Actions"]
                : ["PO Number", "Supplier", "Date", "Items", "Total", "Status", "Actions"]} />
              <tbody>
                {filtered.map(po => (
                  <TR key={po.id} onClick={() => setSelectedPO(po)}>
                    <TD><span className="font-mono text-xs font-bold" style={{ color: C.maroon }}>{po.id}</span></TD>
                    {role === "owner" && <TD muted>{po.branch}</TD>}
                    <TD muted>{po.supplier}</TD>
                    {role === "owner" && <TD muted>{po.requestedBy}</TD>}
                    <TD muted>{po.date}</TD>
                    {role === "manager" && <TD right muted>{po.items} items</TD>}
                    <TD right className="font-semibold">₱{po.total.toLocaleString()}</TD>
                    {role === "owner" && (
                      <TD>
                        <span className="flex items-center gap-1 text-xs font-medium" style={{ color: po.aiMatch ? C.green : C.muted }}>
                          {po.aiMatch ? <CheckCircle size={12} /> : <XCircle size={12} />}
                          {po.aiMatch ? "Aligned" : "Differs"}
                        </span>
                      </TD>
                    )}
                    <TD><StatusChip status={po.status} /></TD>
                    <TD>
                      <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                        <button className="p-1.5 rounded-md" style={{ color: C.secondary }}
                          onMouseEnter={e => (e.currentTarget.style.background = C.grayBg)}
                          onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                          onClick={() => setSelectedPO(po)}>
                          <Eye size={13} />
                        </button>
                        {role === "owner" && po.status === "pending" && (
                          <>
                            <button className="px-2 py-1 rounded-lg text-xs font-bold"
                              style={{ background: C.greenBg, color: C.green }}
                              onClick={() => setActionModal({ po, type: "approve" })}>
                              Approve
                            </button>
                            <button className="px-2 py-1 rounded-lg text-xs font-bold"
                              style={{ background: C.redBg, color: C.red }}
                              onClick={() => setActionModal({ po, type: "reject" })}>
                              Reject
                            </button>
                          </>
                        )}
                        {role === "manager" && po.status === "draft" && (
                          <button className="px-2 py-1 rounded-lg text-xs font-bold text-white"
                            style={{ background: C.maroon }}>
                            Submit
                          </button>
                        )}
                      </div>
                    </TD>
                  </TR>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination total={filtered.length} page={1} perPage={5} />
        </Card>
      )}

      {/* PO Detail Drawer */}
      {selectedPO && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setSelectedPO(null)} />
          <div className="fixed right-0 top-0 h-full z-50 bg-white border-l flex flex-col"
            style={{ width: 440, borderColor: C.border, boxShadow: "-4px 0 24px rgba(0,0,0,0.08)" }}>
            <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: C.border }}>
              <div>
                <h3 className="font-bold" style={{ color: C.primary }}>{selectedPO.id}</h3>
                <p className="text-xs mt-0.5" style={{ color: C.secondary }}>{selectedPO.supplier} · {selectedPO.date}</p>
              </div>
              <button onClick={() => setSelectedPO(null)} className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ color: C.secondary, background: C.grayBg }}>
                <X size={14} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div className="flex items-center justify-between">
                <StatusChip status={selectedPO.status} />
                <span className="text-xs" style={{ color: C.muted }}>{selectedPO.date}</span>
              </div>
              <div className="grid grid-cols-2 gap-y-3 text-sm p-4 rounded-xl" style={{ background: C.mainBg }}>
                {[["Branch", selectedPO.branch], ["Requested By", selectedPO.requestedBy], ["Supplier", selectedPO.supplier], ["Items", `${selectedPO.items} items`]].map(([l, v]) => (
                  <div key={l}>
                    <span style={{ color: C.secondary }}>{l}: </span>
                    <span className="font-semibold" style={{ color: C.primary }}>{v}</span>
                  </div>
                ))}
              </div>
              <div className="border rounded-xl overflow-hidden" style={{ borderColor: C.border }}>
                <div className="px-4 py-2.5 text-xs font-bold uppercase tracking-wider" style={{ background: "#FAFBFC", color: C.secondary }}>
                  Request Items
                </div>
                {[
                  { name: "Whole Milk", sku: "RM-001", qty: 24, unit: "L", cost: 140 },
                  { name: "Arabica Beans", sku: "RM-002", qty: 10, unit: "kg", cost: 760 },
                  { name: "White Sugar", sku: "RM-008", qty: 20, unit: "kg", cost: 90 },
                ].map(item => (
                  <div key={item.sku} className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: C.border }}>
                    <div>
                      <p className="text-sm font-semibold" style={{ color: C.primary }}>{item.name}</p>
                      <p className="text-xs mt-0.5" style={{ color: C.muted }}>{item.sku} · {item.qty} {item.unit} @ ₱{item.cost}</p>
                    </div>
                    <span className="text-sm font-bold" style={{ color: C.primary }}>₱{(item.qty * item.cost).toLocaleString()}</span>
                  </div>
                ))}
                <div className="px-4 py-3 flex items-center justify-between">
                  <span className="text-sm font-bold" style={{ color: C.primary }}>Total</span>
                  <span className="text-base font-bold" style={{ color: C.maroon }}>₱{selectedPO.total.toLocaleString()}</span>
                </div>
              </div>
              {selectedPO.aiMatch && (
                <div className="p-3 rounded-xl border flex items-start gap-2.5" style={{ borderColor: "#C3E8D4", background: C.greenBg }}>
                  <Sparkles size={13} style={{ color: C.green, flexShrink: 0, marginTop: 1 }} />
                  <p className="text-xs leading-relaxed" style={{ color: "#1A6B3C" }}>
                    AI recommendation aligns with requested quantities based on current stock and projected demand at {selectedPO.branch}.
                  </p>
                </div>
              )}
            </div>
            {role === "owner" && selectedPO.status === "pending" && (
              <div className="border-t p-4 flex gap-3" style={{ borderColor: C.border }}>
                <button className="flex-1 py-2.5 rounded-xl text-sm font-bold border flex items-center justify-center gap-2"
                  style={{ borderColor: C.red, color: C.red, background: C.redBg }}
                  onClick={() => setActionModal({ po: selectedPO, type: "reject" })}>
                  <XCircle size={14} /> Reject
                </button>
                <button className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2"
                  style={{ background: C.green }}
                  onClick={() => setActionModal({ po: selectedPO, type: "approve" })}>
                  <Check size={14} /> Approve
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {/* Approve/Reject Modal */}
      {actionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.45)" }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" style={{ border: `1px solid ${C.border}` }}>
            <h3 className="font-bold text-lg mb-2" style={{ color: C.primary }}>
              {actionModal.type === "approve" ? "Approve Purchase Request?" : "Reject Purchase Request?"}
            </h3>
            <p className="text-sm mb-4" style={{ color: C.secondary }}>
              {actionModal.po.id} · {actionModal.po.branch} · ₱{actionModal.po.total.toLocaleString()}
            </p>
            {actionModal.type === "reject" && (
              <div className="mb-4">
                <label className="block text-sm font-medium mb-1.5" style={{ color: C.primary }}>Reason for rejection *</label>
                <textarea rows={3} placeholder="Provide a reason for rejecting this request…"
                  className="w-full px-3 py-2 text-sm rounded-xl border outline-none resize-none"
                  style={{ borderColor: C.border, color: C.primary }} />
              </div>
            )}
            <div className="flex gap-3">
              <Btn variant="outline" onClick={() => setActionModal(null)}>Cancel</Btn>
              <button className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white"
                style={{ background: actionModal.type === "approve" ? C.green : C.red }}
                onClick={() => {
                  setActionModal(null); setSelectedPO(null);
                  toast.success(actionModal.type === "approve" ? `${actionModal.po.id} approved successfully` : `${actionModal.po.id} rejected`);
                }}>
                {actionModal.type === "approve" ? "Approve Request" : "Reject Request"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create PO Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.45)" }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl p-6" style={{ border: `1px solid ${C.border}` }}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-bold text-lg" style={{ color: C.primary }}>Create Purchase Request</h3>
              <button onClick={() => setShowCreate(false)} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ color: C.secondary, background: C.grayBg }}>
                <X size={15} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-4 mb-5">
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: C.primary }}>Supplier</label>
                <select className="w-full px-3 py-2.5 text-sm rounded-xl border outline-none" style={{ borderColor: C.border, color: C.primary }}>
                  <option>Metro Dairy Supply</option>
                  <option>PH Coffee Traders</option>
                  <option>Artisan Bakers PH</option>
                  <option>Sysco Philippines</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: C.primary }}>Requested Delivery Date</label>
                <input type="date" defaultValue="2026-08-29" className="w-full px-3 py-2.5 text-sm rounded-xl border outline-none" style={{ borderColor: C.border, color: C.primary }} />
              </div>
            </div>
            <div className="border rounded-xl overflow-hidden mb-4" style={{ borderColor: C.border }}>
              <div className="grid text-xs font-bold uppercase tracking-wider px-4 py-2.5" style={{ color: C.secondary, gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr", background: "#FAFBFC" }}>
                <span>Ingredient</span><span className="text-right">On Hand</span><span className="text-right">AI Qty</span><span className="text-right">Requested</span><span className="text-right">Est. Total</span>
              </div>
              {[
                { name: "Whole Milk", on: "45 L", ai: 24, unit: "L", cost: 140 },
                { name: "Arabica Beans", on: "12 kg", ai: 10, unit: "kg", cost: 760 },
                { name: "White Sugar", on: "8 kg", ai: 20, unit: "kg", cost: 90 },
              ].map(item => (
                <div key={item.name} className="grid items-center px-4 py-3 border-b" style={{ borderColor: C.border, gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr" }}>
                  <span className="text-sm font-semibold" style={{ color: C.primary }}>{item.name}</span>
                  <span className="text-sm text-right" style={{ color: C.red }}>{item.on}</span>
                  <span className="text-sm text-right" style={{ color: C.green }}>{item.ai} {item.unit}</span>
                  <div className="flex justify-end">
                    <input type="number" defaultValue={item.ai} className="w-16 px-2 py-1 text-sm rounded-lg border text-right outline-none" style={{ borderColor: C.border, color: C.primary }} />
                  </div>
                  <span className="text-sm text-right font-semibold" style={{ color: C.primary }}>₱{(item.ai * item.cost).toLocaleString()}</span>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between px-4 py-3 rounded-xl mb-4" style={{ background: C.mainBg }}>
              <span className="text-sm font-bold" style={{ color: C.primary }}>Estimated Total</span>
              <span className="text-lg font-bold" style={{ color: C.maroon }}>₱28,400</span>
            </div>
            <p className="text-xs mb-4 flex items-center gap-1.5" style={{ color: C.muted }}>
              <Sparkles size={11} />
              AI quantities are suggestions based on stock levels and demand. Adjust as needed before submitting.
            </p>
            <div className="flex gap-3">
              <Btn variant="outline" onClick={() => setShowCreate(false)}>Cancel</Btn>
              <Btn variant="outline" onClick={() => setShowCreate(false)}>Save Draft</Btn>
              <button className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white" style={{ background: C.maroon }}
                onClick={() => { setShowCreate(false); toast.success("Purchase request submitted for approval"); }}>
                Submit for Approval
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── COGS Analysis ─────────────────────────────────────────────────────────────
function COGSAnalysis({ role }: { role: Role }) {
  return (
    <div className="p-6 space-y-5">
      <SectionHeader title="COGS Analysis"
        sub={role === "owner" ? "Cost of Goods Sold · All branches · August 2026" : "Lipa Branch · August 2026"}
        actions={
          <>
            <Btn variant="outline" icon={Calendar} size="sm">Aug 1–26, 2026</Btn>
            {role === "owner" && <Select options={["All Branches", "Gulod", "Lipa", "Vermosa", "Tagaytay", "Evo"]} />}
          </>
        } />

      <div className="grid grid-cols-3 gap-4">
        <KPICard label="Total Sales" value="₱1,120,500" change="+8.3%" changeDir="up" icon={DollarSign} color={C.blue} sparkData={kpiSparklines.sales} />
        <KPICard label="Theoretical COGS" value="₱468,800" sub="41.8% of sales" icon={BarChart2} color={C.amber} />
        <KPICard label="Actual COGS" value="₱482,100" sub="43.0% of sales" icon={TrendingDown} color={C.red} />
        <KPICard label="Gross Profit" value="₱638,400" change="+10.7%" changeDir="up" icon={TrendingUp} color={C.green} sparkData={kpiSparklines.profit} />
        <KPICard label="Gross Margin" value="57.0%" change="-0.4pp" changeDir="down" icon={Percent} color={C.maroon} />
        <KPICard label="COGS Variance" value="₱13,300" sub="Actual exceeds theoretical" icon={GitCompare} color={C.red} />
      </div>

      <div className="grid grid-cols-3 gap-5">
        <Card className="col-span-2" padding={false}>
          <div className="px-5 pt-5 pb-0">
            <h3 className="font-semibold mb-1" style={{ color: C.primary }}>COGS Trend — Theoretical vs. Actual</h3>
            <p className="text-xs mb-4" style={{ color: C.secondary }}>6-month view with gross margin overlay</p>
          </div>
          <div className="h-56 px-3 pb-4">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={cogsTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: C.secondary }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="l" tick={{ fontSize: 11, fill: C.secondary }} axisLine={false} tickLine={false}
                  tickFormatter={v => `₱${(v / 1000).toFixed(0)}k`} />
                <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 11, fill: C.secondary }} axisLine={false} tickLine={false}
                  tickFormatter={v => `${v}%`} domain={[55, 60]} />
                <Tooltip content={<ChartTip />} />
                <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                <Bar yAxisId="l" dataKey="theo" name="Theoretical COGS" fill={`color-mix(in srgb, ${C.blue} 25%, transparent)`} stroke={C.blue} strokeWidth={1} radius={[3, 3, 0, 0]} />
                <Bar yAxisId="l" dataKey="actual" name="Actual COGS" fill={`color-mix(in srgb, ${C.maroon} 38%, transparent)`} stroke={C.maroon} strokeWidth={1} radius={[3, 3, 0, 0]} />
                <Line yAxisId="r" type="monotone" dataKey="margin" name="Gross Margin %" stroke={C.green} strokeWidth={2} dot={{ fill: C.green, r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card>
          <h3 className="font-semibold mb-4" style={{ color: C.primary }}>Ingredient Cost Distribution</h3>
          {[
            { name: "Coffee Beans", pct: 38.2, color: C.maroon },
            { name: "Dairy (Milk)", pct: 24.7, color: C.blue },
            { name: "Alternative Milks", pct: 16.4, color: C.amber },
            { name: "Bakery/Food", pct: 12.8, color: C.green },
            { name: "Other", pct: 7.9, color: C.muted },
          ].map(c => (
            <div key={c.name} className="mb-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium" style={{ color: C.primary }}>{c.name}</span>
                <span className="text-xs font-bold" style={{ color: C.primary }}>{c.pct}%</span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: C.grayBg }}>
                <div className="h-full rounded-full" style={{ width: `${c.pct * 2.3}%`, background: c.color }} />
              </div>
            </div>
          ))}
        </Card>
      </div>

      <Card padding={false}>
        <div className="px-5 pt-5 pb-3">
          <h3 className="font-semibold mb-3" style={{ color: C.primary }}>Product Profitability</h3>
          <div className="flex items-center gap-2">
            <SearchInput placeholder="Search product…" />
            <Select options={["All Categories", "Coffee Drinks", "Food", "Cold Drinks"]} />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <THead cols={["Product", "Sales", "Theoretical Cost", "Actual Cost", "COGS Variance", "Gross Profit", "Margin"]} />
            <tbody>
              {[
                { name: "Espresso Blend", sales: 187400, theo: 62800, actual: 64900 },
                { name: "Whole Milk", sales: 162300, theo: 78900, actual: 82100 },
                { name: "Almond Milk Latte", sales: 98700, theo: 41200, actual: 43400 },
                { name: "Oat Milk Cappuccino", sales: 87200, theo: 35600, actual: 37100 },
                { name: "Croissants", sales: 74100, theo: 28400, actual: 29200 },
              ].map((p, i) => {
                const gp = p.sales - p.actual;
                const margin = ((gp / p.sales) * 100).toFixed(1);
                const variance = p.actual - p.theo;
                return (
                  <TR key={i}>
                    <TD><span className="font-medium">{p.name}</span></TD>
                    <TD right>₱{p.sales.toLocaleString()}</TD>
                    <TD right muted>₱{p.theo.toLocaleString()}</TD>
                    <TD right muted>₱{p.actual.toLocaleString()}</TD>
                    <TD right><span style={{ color: variance > 0 ? C.red : C.green }}>₱{variance.toLocaleString()}</span></TD>
                    <TD right>₱{gp.toLocaleString()}</TD>
                    <TD right><span className="font-bold" style={{ color: parseFloat(margin) > 60 ? C.green : parseFloat(margin) > 50 ? C.amber : C.red }}>{margin}%</span></TD>
                  </TR>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ─── Predictive Analytics ──────────────────────────────────────────────────────
function PredictiveAnalytics({ role }: { role: Role }) {
  const [horizon, setHorizon] = useState("7");

  return (
    <div className="p-6 space-y-5">
      <SectionHeader title="Predictive Analytics"
        sub="AI-assisted demand forecasting and inventory intelligence"
        actions={
          <>
            {role === "owner" && <Select options={["All Branches", "Gulod", "Lipa", "Vermosa", "Tagaytay", "Evo"]} />}
            <div className="flex items-center gap-0.5 border rounded-lg p-0.5" style={{ borderColor: C.border }}>
              {["7", "14", "30"].map(d => (
                <button key={d} onClick={() => setHorizon(d)}
                  className="px-3 py-1.5 rounded-md text-xs font-semibold transition-colors"
                  style={{ background: horizon === d ? C.maroon : "transparent", color: horizon === d ? "#fff" : C.secondary }}>
                  {d}d
                </button>
              ))}
            </div>
          </>
        } />

      <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl" style={{ background: C.softMaroonBg }}>
        <Sparkles size={14} style={{ color: C.maroon }} />
        <p className="text-xs font-medium" style={{ color: C.maroon }}>
          Powered by Google Gemini · Forecasts are decision-support tools only. All purchasing decisions require human review and authorization.
        </p>
      </div>

      <div className="grid grid-cols-5 gap-4">
        <KPICard label="Forecasted Inv. Cost" value="₱328,400" change="+4.8% projected" changeDir="down" icon={TrendingUp} color={C.blue} />
        <KPICard label="Demand Change" value="+7.2%" sub="Next 7 days" icon={Activity} color={C.green} />
        <KPICard label="Critical Items" value="3 items" sub="Stockout < 7 days" icon={AlertTriangle} color={C.red} />
        <KPICard label="Projected Shrinkage" value="1.72%" sub="+0.07pp above target" icon={TrendingDown} color={C.amber} />
        <KPICard label="Recommended Reorders" value="8 items" sub="Across all branches" icon={Package} color={C.maroon} />
      </div>

      <div className="grid grid-cols-2 gap-5">
        <Card padding={false}>
          <div className="px-5 pt-5 pb-0">
            <h3 className="font-semibold mb-1" style={{ color: C.primary }}>Demand Forecast</h3>
            <p className="text-xs mb-4" style={{ color: C.secondary }}>Historical vs. {horizon}-day AI forecast</p>
          </div>
          <div className="h-52 px-3 pb-4">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={[
                { date: "Aug 19", actual: 38200, forecast: null },
                { date: "Aug 20", actual: 41500, forecast: null },
                { date: "Aug 21", actual: 44200, forecast: null },
                { date: "Aug 22", actual: 39800, forecast: null },
                { date: "Aug 23", actual: 46100, forecast: null },
                { date: "Aug 24", actual: 52400, forecast: null },
                { date: "Aug 25", actual: 48700, forecast: 48700 },
                { date: "Aug 26", actual: null, forecast: 50200 },
                { date: "Aug 27", actual: null, forecast: 53100 },
                { date: "Aug 28", actual: null, forecast: 51800 },
                { date: "Aug 29", actual: null, forecast: 54600 },
                { date: "Aug 30", actual: null, forecast: 56200 },
                { date: "Aug 31", actual: null, forecast: 58900 },
              ]}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: C.secondary }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: C.secondary }} axisLine={false} tickLine={false}
                  tickFormatter={v => `₱${(v / 1000).toFixed(0)}k`} />
                <Tooltip content={<ChartTip />} />
                <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="actual" name="Actual Sales" stroke={C.maroon} strokeWidth={2} dot={{ fill: C.maroon, r: 3 }} connectNulls={false} />
                <Line type="monotone" dataKey="forecast" name="AI Forecast" stroke={C.blue} strokeWidth={2} strokeDasharray="5 4" dot={{ fill: C.blue, r: 3 }} connectNulls={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card padding={false}>
          <div className="px-5 pt-5 pb-0">
            <h3 className="font-semibold mb-1" style={{ color: C.primary }}>Projected Inventory Levels</h3>
            <p className="text-xs mb-4" style={{ color: C.secondary }}>Critical items — predicted depletion trajectory</p>
          </div>
          <div className="h-52 px-3 pb-4">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={[
                { date: "Aug 26", milk: 45, beans: 12, sugar: 8 },
                { date: "Aug 27", milk: 36, beans: 9.2, sugar: 6.7 },
                { date: "Aug 28", milk: 27, beans: 6.4, sugar: 5.4 },
                { date: "Aug 29", milk: 18, beans: 3.6, sugar: 4.1 },
                { date: "Aug 30", milk: 9, beans: 0.8, sugar: 2.8 },
                { date: "Aug 31", milk: 0, beans: 0, sugar: 1.5 },
              ]}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: C.secondary }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: C.secondary }} axisLine={false} tickLine={false} />
                <Tooltip />
                <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="milk" name="Whole Milk (L)" stroke={C.blue} strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="beans" name="Arabica Beans (kg)" stroke={C.maroon} strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="sugar" name="White Sugar (kg)" stroke={C.amber} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-3 gap-5">
        <Card className="col-span-2" padding={false}>
          <div className="px-5 pt-5 pb-3">
            <h3 className="font-semibold mb-3" style={{ color: C.primary }}>Low Stock Prediction</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <THead cols={["Ingredient", ...(role === "owner" ? ["Branch"] : []), "Current Qty", "Daily Usage", "Predicted Stockout", "Recommended Reorder", "Urgency"]} />
              <tbody>
                {[
                  { item: "Whole Milk", branch: "Lipa", qty: "45 L", usage: "9 L/day", stockout: "5 days", reorder: "24 L", urgency: "high" },
                  { item: "Arabica Beans", branch: "Lipa", qty: "12 kg", usage: "2.8 kg/day", stockout: "4 days", reorder: "10 kg", urgency: "high" },
                  { item: "White Sugar", branch: "Lipa", qty: "8 kg", usage: "1.3 kg/day", stockout: "6 days", reorder: "20 kg", urgency: "high" },
                  { item: "Croissants", branch: "Vermosa", qty: "18 pcs", usage: "28 pcs/day", stockout: "1 day", reorder: "60 pcs", urgency: "high" },
                  { item: "Oat Milk", branch: "Gulod", qty: "52 L", usage: "8 L/day", stockout: "6 days", reorder: "30 L", urgency: "medium" },
                ].map((r, i) => (
                  <TR key={i}>
                    <TD><span className="font-medium">{r.item}</span></TD>
                    {role === "owner" && <TD muted>{r.branch}</TD>}
                    <TD right muted>{r.qty}</TD>
                    <TD right muted>{r.usage}</TD>
                    <TD right><span style={{ color: parseInt(r.stockout) <= 4 ? C.red : C.amber }}>{r.stockout}</span></TD>
                    <TD right muted>{r.reorder}</TD>
                    <TD><StatusChip status={r.urgency} /></TD>
                  </TR>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: C.softMaroonBg }}>
              <Sparkles size={13} style={{ color: C.maroon }} />
            </div>
            <h3 className="text-sm font-semibold" style={{ color: C.primary }}>AI Insights</h3>
          </div>
          <div className="space-y-3">
            {aiInsights.slice(0, 3).map(ins => (
              <div key={ins.id} className="p-3 rounded-xl border"
                style={{ borderColor: ins.urgency === "high" ? C.red : C.border, background: ins.urgency === "high" ? C.redBg : C.mainBg }}>
                <div className="flex items-start justify-between mb-1.5 gap-2">
                  <p className="text-xs font-bold leading-snug" style={{ color: C.primary }}>{ins.title}</p>
                  <StatusChip status={ins.urgency === "high" ? "high" : ins.urgency === "medium" ? "medium" : "low_urgency"} />
                </div>
                <p className="text-xs leading-relaxed mb-1.5" style={{ color: C.secondary }}>{ins.desc}</p>
                <p className="text-xs font-semibold" style={{ color: C.maroon }}>↗ {ins.action.split(".")[0]}</p>
              </div>
            ))}
          </div>
          <p className="text-xs mt-3 pt-3 border-t" style={{ borderColor: C.border, color: C.muted }}>
            Management approval required before acting on AI recommendations.
          </p>
        </Card>
      </div>
    </div>
  );
}

// ─── Reports ───────────────────────────────────────────────────────────────────
function Reports({ role }: { role: Role }) {
  const [generated, setGenerated] = useState(false);
  const reportTypes = [
    { name: "Sales Report", description: "Revenue and transactions", Icon: ShoppingCart, accent: C.maroon },
    { name: "COGS Report", description: "Direct cost performance", Icon: BarChart2, accent: C.amber },
    { name: "Inventory Status Report", description: "Stock levels and value", Icon: Package, accent: C.blue },
    { name: "Shrinkage Report", description: "Loss and spoilage trends", Icon: TrendingDown, accent: C.red },
    { name: "Variance Report", description: "Expected versus actual", Icon: GitCompare, accent: C.mediumMaroon },
    { name: "Purchase Order Report", description: "Requests and approvals", Icon: ClipboardList, accent: C.green },
    { name: "Predictive Forecast Report", description: "Demand and stock outlook", Icon: Activity, accent: C.maroon },
  ];
  const [selectedReports, setSelectedReports] = useState<string[]>([]);
  const [selectionError, setSelectionError] = useState(false);

  const toggleReport = (report: string) => {
    setGenerated(false);
    setSelectionError(false);
    setSelectedReports(current => {
      if (report === "All Reports") return current.includes("All Reports") ? [] : ["All Reports"];
      const withoutAll = current.filter(item => item !== "All Reports");
      if (withoutAll.includes(report)) {
        return withoutAll.filter(item => item !== report);
      }
      return [...withoutAll, report];
    });
  };

  const generateReport = () => {
    if (selectedReports.length === 0) {
      setSelectionError(true);
      toast.error("Select at least one report type first.");
      return;
    }
    setSelectionError(false);
    setGenerated(true);
    toast.success("Report generated successfully");
  };

  const reportHeading = selectedReports.includes("All Reports")
    ? "All Reports"
    : selectedReports.length === 1 ? selectedReports[0] : selectedReports.length > 1 ? `${selectedReports.length} Reports Selected` : "Choose Reports";

  return (
    <div className="reports-page p-6 space-y-5">
      <SectionHeader title="Reports"
        sub="Generate, view and export operational reports"
        actions={generated ? <Btn variant="primary" icon={Download} size="sm">Export Excel</Btn> : undefined} />

      <div className="reports-layout grid grid-cols-5 gap-5">
        <Card className="reports-builder col-span-2 h-fit">
          <h3 className="font-semibold mb-4" style={{ color: C.primary }}>Report Builder</h3>
          <div className="space-y-4">
            <div>
              <div className="flex items-end justify-between gap-3 mb-2.5">
                <div>
                  <label className="block text-sm font-semibold" style={{ color: C.primary }}>Report Types</label>
                  <p className="text-xs mt-0.5" style={{ color: C.muted }}>Choose one report or combine several.</p>
                </div>
                <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide"
                  style={{ background: C.softMaroonBg, color: C.maroon }}>
                  {selectedReports.includes("All Reports") ? "All selected" : selectedReports.length ? `${selectedReports.length} selected` : "Choose reports"}
                </span>
              </div>
              {selectedReports.length === 0 && (
                <div className="flex items-start gap-2 mt-2.5 px-3 py-2.5 rounded-xl border"
                  style={{ borderColor: selectionError ? C.red : C.border, background: selectionError ? C.redBg : C.surface }}
                  role={selectionError ? "alert" : "status"}>
                  <Info size={14} className="mt-0.5 flex-shrink-0" style={{ color: selectionError ? C.red : C.maroon }} />
                  <p className="text-xs leading-relaxed" style={{ color: selectionError ? C.red : C.secondary }}>
                    Select at least one report type before generating a report.
                  </p>
                </div>
              )}
              <div className="report-type-picker rounded-2xl border p-2.5" style={{ borderColor: C.border, background: C.mainBg }}>
                {(() => {
                  const selected = selectedReports.includes("All Reports");
                  return (
                    <button type="button" onClick={() => toggleReport("All Reports")}
                      className="w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-colors"
                      style={{ borderColor: selected ? C.maroon : C.border, background: selected ? C.softMaroonBg : C.surface }}
                      aria-pressed={selected}>
                      <span className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ background: selected ? C.maroon : C.softMaroonBg, color: selected ? "#fff" : C.maroon }}>
                        <FileText size={18} strokeWidth={1.8} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold" style={{ color: C.primary }}>All Reports</span>
                        <span className="block text-xs mt-0.5" style={{ color: C.secondary }}>Generate the complete operational report package.</span>
                      </span>
                      <span className="w-5 h-5 rounded-full flex items-center justify-center border flex-shrink-0"
                        style={{ borderColor: selected ? C.maroon : C.border, background: selected ? C.maroon : C.surface }}>
                        {selected && <Check size={12} color="#fff" strokeWidth={3} />}
                      </span>
                    </button>
                  );
                })()}

                <div className="flex items-center gap-2 my-3">
                  <span className="h-px flex-1" style={{ background: C.border }} />
                  <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: C.muted }}>Individual reports</span>
                  <span className="h-px flex-1" style={{ background: C.border }} />
                </div>

                <div className="report-type-grid grid grid-cols-2 gap-2">
                  {reportTypes.map(({ name, description, Icon, accent }) => {
                    const selected = selectedReports.includes(name);
                    return (
                      <button key={name} type="button" onClick={() => toggleReport(name)}
                        className="relative min-h-[84px] p-3 rounded-xl border text-left transition-colors"
                        style={{ borderColor: selected ? accent : C.border, background: selected ? `color-mix(in srgb, ${accent} 8%, ${C.surface})` : C.surface }}
                        aria-pressed={selected}>
                        <div className="flex items-start justify-between gap-2">
                          <span className="w-8 h-8 rounded-lg flex items-center justify-center"
                            style={{ background: `color-mix(in srgb, ${accent} 11%, transparent)`, color: accent }}>
                            <Icon size={15} strokeWidth={1.8} />
                          </span>
                          <span className="w-4 h-4 rounded-full flex items-center justify-center border"
                            style={{ borderColor: selected ? accent : C.border, background: selected ? accent : C.surface }}>
                            {selected && <Check size={10} color="#fff" strokeWidth={3} />}
                          </span>
                        </div>
                        <span className="block text-xs font-semibold mt-2" style={{ color: C.primary }}>{name}</span>
                        <span className="block text-[10px] mt-0.5 leading-snug" style={{ color: C.muted }}>{description}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            {role === "owner" && (
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: C.primary }}>Branch</label>
                <select className="w-full px-3 py-2.5 text-sm rounded-xl border outline-none" style={{ borderColor: C.border, color: C.primary }}>
                  {["All Branches", "Gulod – Main Branch", "Lipa", "Vermosa", "Tagaytay", "Evo"].map(b => <option key={b}>{b}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: C.primary }}>Date Range</label>
              <div className="grid grid-cols-2 gap-2">
                <input type="date" defaultValue="2026-08-01" className="px-3 py-2 text-sm rounded-xl border outline-none" style={{ borderColor: C.border, color: C.primary }} />
                <input type="date" defaultValue="2026-08-26" className="px-3 py-2 text-sm rounded-xl border outline-none" style={{ borderColor: C.border, color: C.primary }} />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: C.primary }}>Category</label>
              <select className="w-full px-3 py-2.5 text-sm rounded-xl border outline-none" style={{ borderColor: C.border, color: C.primary }}>
                <option>All Categories</option>
                <option>Coffee</option>
                <option>Dairy</option>
                <option>Food</option>
              </select>
            </div>
            <div className="flex gap-2 pt-1">
              <Btn variant="outline" onClick={() => { setGenerated(false); setSelectedReports([]); setSelectionError(false); }}>Reset</Btn>
              <button className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white" style={{ background: C.maroon }}
                onClick={generateReport}>
                Generate Report
              </button>
            </div>
          </div>
        </Card>

        <div className="reports-preview col-span-3 space-y-4">
          {!generated ? (
            <Card>
              <EmptyState icon={FileText} title="No report generated yet"
                body="Configure your report parameters on the left and click Generate Report to view results."
                action="Generate Report"
                onAction={generateReport} />
            </Card>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold" style={{ color: C.primary }}>{reportHeading}</h3>
                  {!selectedReports.includes("All Reports") && selectedReports.length > 1 && (
                    <p className="text-xs mt-1" style={{ color: C.secondary }}>{selectedReports.join(" · ")}</p>
                  )}
                  <p className="text-xs mt-0.5" style={{ color: C.muted }}>Generated Aug 26, 2026 · 10:14 AM · All branches · Aug 1–26</p>
                </div>
              </div>
              <div className="reports-kpi-grid grid grid-cols-3 gap-3">
                <KPICard label="Total Sales" value="₱1,120,500" change="+8.3%" changeDir="up" icon={DollarSign} color={C.blue} />
                <KPICard label="Gross Profit" value="₱638,400" change="+10.7%" changeDir="up" icon={TrendingUp} color={C.green} />
                <KPICard label="Avg Margin" value="57.0%" change="-0.4pp" changeDir="down" icon={Percent} color={C.maroon} />
              </div>
              <Card padding={false}>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <THead cols={["Branch", "Sales", "COGS", "Gross Profit", "Margin", "Shrinkage"]} />
                    <tbody>
                      {branchPerf.map((b, i) => (
                        <TR key={i}>
                          <TD><span className="font-semibold">{b.branch}</span></TD>
                          <TD right>₱{b.sales.toLocaleString()}</TD>
                          <TD right muted>₱{b.cogs.toLocaleString()}</TD>
                          <TD right>₱{(b.sales - b.cogs).toLocaleString()}</TD>
                          <TD right><span style={{ color: C.green }}>{b.margin}%</span></TD>
                          <TD right><span style={{ color: C.red }}>₱{b.shrinkage.toLocaleString()}</span></TD>
                        </TR>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── User Management ───────────────────────────────────────────────────────────
function UserManagement() {
  const [showAdd, setShowAdd] = useState(false);
  const [selRole, setSelRole] = useState("Branch Manager");

  return (
    <div className="p-6 space-y-5">
      <SectionHeader title="User Management"
        sub="Manage system accounts and access roles"
        actions={
          <>
            <Btn variant="outline" size="sm">Activity Logs</Btn>
            <Btn variant="primary" icon={Plus} onClick={() => setShowAdd(true)}>Add User</Btn>
          </>
        } />

      <div className="grid grid-cols-4 gap-4">
        <KPICard label="Total Users" value="6" icon={Users} color={C.maroon} />
        <KPICard label="Active" value="5" icon={CheckCircle} color={C.green} />
        <KPICard label="Inactive" value="1" icon={XCircle} color={C.muted} />
        <KPICard label="Branch Managers" value="5" icon={Building2} color={C.blue} />
      </div>

      <Card padding={false}>
        <div className="px-5 pt-5 pb-3">
          <div className="flex items-center gap-2">
            <SearchInput placeholder="Search name or email…" />
            <Select options={["All Roles", "Owner", "Branch Manager"]} />
            <Select options={["All Status", "Active", "Inactive"]} />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <THead cols={["User", "Email", "Role", "Assigned Branch", "Status", "Last Login", "Actions"]} />
            <tbody>
              {userList.map(u => (
                <TR key={u.id}>
                  <TD>
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                        style={{ background: u.role === "Owner" ? C.maroon : C.blue }}>
                        {getInitials(u.name)}
                      </div>
                      <span className="font-semibold">{u.name}</span>
                    </div>
                  </TD>
                  <TD muted>{u.email}</TD>
                  <TD>
                    <span className="text-xs font-bold px-2 py-1 rounded-lg"
                      style={{ background: u.role === "Owner" ? C.softMaroonBg : C.blueBg, color: u.role === "Owner" ? C.maroon : C.blue }}>
                      {u.role}
                    </span>
                  </TD>
                  <TD muted>{u.branch}</TD>
                  <TD><StatusChip status={u.status} /></TD>
                  <TD muted>{u.lastLogin}</TD>
                  <TD>
                    <div className="flex gap-1">
                      <button className="p-1.5 rounded-md" style={{ color: C.secondary }}
                        onMouseEnter={e => (e.currentTarget.style.background = C.grayBg)}
                        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                        <Eye size={13} />
                      </button>
                      <button className="p-1.5 rounded-md" style={{ color: C.secondary }}
                        onMouseEnter={e => (e.currentTarget.style.background = C.grayBg)}
                        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                        <Edit2 size={13} />
                      </button>
                      {u.status === "active"
                        ? <button className="px-2 py-1 rounded-lg text-xs font-bold" style={{ background: C.redBg, color: C.red }}>Deactivate</button>
                        : <button className="px-2 py-1 rounded-lg text-xs font-bold" style={{ background: C.greenBg, color: C.green }}>Activate</button>
                      }
                    </div>
                  </TD>
                </TR>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination total={6} page={1} perPage={10} />
      </Card>

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.45)" }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" style={{ border: `1px solid ${C.border}` }}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-bold text-lg" style={{ color: C.primary }}>Add New User</h3>
              <button onClick={() => setShowAdd(false)} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ color: C.secondary, background: C.grayBg }}>
                <X size={15} />
              </button>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: C.primary }}>Full Name</label>
                  <input className="w-full px-3 py-2.5 text-sm rounded-xl border outline-none" style={{ borderColor: C.border, color: C.primary }} placeholder="Full name" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: C.primary }}>Username</label>
                  <input className="w-full px-3 py-2.5 text-sm rounded-xl border outline-none" style={{ borderColor: C.border, color: C.primary }} placeholder="username" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: C.primary }}>Email</label>
                <input type="email" className="w-full px-3 py-2.5 text-sm rounded-xl border outline-none" style={{ borderColor: C.border, color: C.primary }} placeholder="email@libroespresso.com" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: C.primary }}>Role</label>
                <select value={selRole} onChange={e => setSelRole(e.target.value)}
                  className="w-full px-3 py-2.5 text-sm rounded-xl border outline-none" style={{ borderColor: C.border, color: C.primary }}>
                  <option>Branch Manager</option>
                  <option>Owner</option>
                </select>
              </div>
              {selRole === "Branch Manager" && (
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: C.primary }}>
                    Assigned Branch <span style={{ color: C.red }}>*</span>
                  </label>
                  <select className="w-full px-3 py-2.5 text-sm rounded-xl border outline-none" style={{ borderColor: C.border, color: C.primary }}>
                    <option value="">Select branch…</option>
                    {["Gulod – Main Branch", "Lipa", "Vermosa", "Tagaytay", "Evo"].map(b => <option key={b}>{b}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: C.primary }}>Initial Status</label>
                <select className="w-full px-3 py-2.5 text-sm rounded-xl border outline-none" style={{ borderColor: C.border, color: C.primary }}>
                  <option>Active</option>
                  <option>Inactive</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <Btn variant="outline" onClick={() => setShowAdd(false)}>Cancel</Btn>
              <button className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white" style={{ background: C.maroon }}
                onClick={() => { setShowAdd(false); toast.success("User account created successfully"); }}>
                Create User
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Branch Management ─────────────────────────────────────────────────────────
function BranchManagement() {
  return (
    <div className="p-6 space-y-5">
      <SectionHeader title="Branch Management"
        sub="Manage Libro Espresso branch configurations and assignments"
        actions={<Btn variant="primary" icon={Plus}>Add Branch</Btn>} />

      <div className="grid grid-cols-2 gap-4">
        <KPICard label="Total Branches" value="5" icon={Building2} color={C.maroon} />
        <KPICard label="Active Branches" value="5 of 5" sub="All branches operational" icon={CheckCircle} color={C.green} />
      </div>

      <Card padding={false}>
        <div className="overflow-x-auto">
          <table className="w-full">
            <THead cols={["Code", "Branch Name", "Location", "Manager", "Status", "Inv. Value", "Sales (Aug)", "Shrinkage Rate", "Last Sync", "Actions"]} />
            <tbody>
              {branchList.map(b => (
                <TR key={b.code}>
                  <TD mono muted>{b.code}</TD>
                  <TD><span className="font-semibold">{b.name}</span></TD>
                  <TD muted><span className="text-xs">{b.loc}</span></TD>
                  <TD muted>{b.manager}</TD>
                  <TD><StatusChip status={b.status} /></TD>
                  <TD right>₱{(b.invValue / 1000).toFixed(1)}k</TD>
                  <TD right>₱{(b.sales / 1000).toFixed(0)}k</TD>
                  <TD right>
                    <span className="font-semibold" style={{ color: b.shrinkageRate > 2 ? C.red : b.shrinkageRate > 1.5 ? C.amber : C.green }}>
                      {b.shrinkageRate}%
                    </span>
                  </TD>
                  <TD muted><span className="text-xs">{b.lastSync}</span></TD>
                  <TD>
                    <div className="flex gap-1">
                      <button className="p-1.5 rounded-md" style={{ color: C.secondary }}
                        onMouseEnter={e => (e.currentTarget.style.background = C.grayBg)}
                        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                        <Eye size={13} />
                      </button>
                      <button className="p-1.5 rounded-md" style={{ color: C.secondary }}
                        onMouseEnter={e => (e.currentTarget.style.background = C.grayBg)}
                        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                        <Edit2 size={13} />
                      </button>
                    </div>
                  </TD>
                </TR>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ─── Settings ──────────────────────────────────────────────────────────────────
function SettingsPage({ role }: { role: Role }) {
  const sections = role === "owner"
    ? ["Profile & Account", "Security", "Notification Preferences", "System Preferences", "Business Information"]
    : ["Profile", "Password & Security", "Assigned Branch", "Notification Preferences", "UI Preferences"];
  const [active, setActive] = useState(sections[0]);
  const [notif, setNotif] = useState({ lowStock: true, criticalStock: true, highCogs: false, spoilage: true, variance: true, po: true, ai: false });

  return (
    <div className="p-6">
      <SectionHeader title="Settings" sub={role === "owner" ? "System and account settings" : "Account and branch settings"} />
      <div className="grid grid-cols-4 gap-6">
        <Card className="col-span-1 h-fit" padding={false}>
          <nav className="py-2">
            {sections.map(s => (
              <button key={s} onClick={() => setActive(s)}
                className="w-full text-left px-4 py-2.5 text-sm transition-colors"
                style={{ color: active === s ? C.maroon : C.secondary, background: active === s ? C.softMaroonBg : "transparent", fontWeight: active === s ? 600 : 400 }}>
                {s}
              </button>
            ))}
          </nav>
        </Card>

        <div className="col-span-3 space-y-5">
          {active.includes("Profile") && (
            <Card>
              <h3 className="font-semibold mb-4" style={{ color: C.primary }}>Profile Information</h3>
              <div className="flex items-center gap-4 mb-5 p-4 rounded-xl" style={{ background: C.mainBg }}>
                <div className="w-16 h-16 rounded-full flex items-center justify-center text-white text-xl font-bold flex-shrink-0"
                  style={{ background: C.maroon }}>
                  {role === "owner" ? "CM" : "MS"}
                </div>
                <div>
                  <p className="font-bold" style={{ color: C.primary }}>{role === "owner" ? "Carlos Mendoza" : "Maria Santos"}</p>
                  <p className="text-sm" style={{ color: C.secondary }}>{role === "owner" ? "Owner / System Administrator" : "Branch Manager · Lipa"}</p>
                  <button className="text-xs mt-1 font-semibold" style={{ color: C.maroon }}>Change photo</button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                {[["Full Name", role === "owner" ? "Carlos Mendoza" : "Maria Santos"], ["Email", role === "owner" ? "carlos@libroespresso.com" : "m.santos@libroespresso.com"], ["Phone", "+63 912 345 6789"], ["Position", role === "owner" ? "Owner" : "Branch Manager"]].map(([l, v]) => (
                  <div key={l}>
                    <label className="block text-sm font-medium mb-1.5" style={{ color: C.primary }}>{l}</label>
                    <input defaultValue={v} className="w-full px-3 py-2.5 text-sm rounded-xl border outline-none" style={{ borderColor: C.border, color: C.primary }}
                      onFocus={e => (e.target.style.borderColor = C.maroon)}
                      onBlur={e => (e.target.style.borderColor = C.border)} />
                  </div>
                ))}
              </div>
              <div className="mt-4 flex justify-end">
                <Btn variant="primary" onClick={() => toast.success("Profile updated successfully")}>Save Changes</Btn>
              </div>
            </Card>
          )}

          {active.includes("Notification") && (
            <Card>
              <h3 className="font-semibold mb-4" style={{ color: C.primary }}>Notification Preferences</h3>
              <div className="space-y-1">
                {[
                  { key: "lowStock", label: "Low Stock Alerts", desc: "When items fall below reorder threshold" },
                  { key: "criticalStock", label: "Critical Stock Alerts", desc: "Urgent notifications for critically low inventory" },
                  { key: "highCogs", label: "High COGS Warnings", desc: "When COGS exceeds configured threshold" },
                  { key: "spoilage", label: "Spoilage / Wastage Recorded", desc: "When branch records an inventory loss" },
                  { key: "variance", label: "Unusual Variance Detected", desc: "Unexplained inventory discrepancies flagged" },
                  { key: "po", label: "Purchase Request Submitted", desc: "New branch purchase requests awaiting approval" },
                  { key: "ai", label: "AI Forecast Alerts", desc: "AI-generated restocking recommendations" },
                ].map(({ key, label, desc }) => (
                  <div key={key} className="flex items-center justify-between py-3 border-b last:border-0" style={{ borderColor: C.border }}>
                    <div>
                      <p className="text-sm font-semibold" style={{ color: C.primary }}>{label}</p>
                      <p className="text-xs mt-0.5" style={{ color: C.secondary }}>{desc}</p>
                    </div>
                    <button
                      onClick={() => setNotif(p => ({ ...p, [key]: !p[key as keyof typeof p] }))}
                      className="w-11 h-6 rounded-full flex-shrink-0 flex items-center transition-colors"
                      style={{ background: notif[key as keyof typeof notif] ? C.maroon : C.grayBg, padding: "2px" }}>
                      <span className="w-5 h-5 rounded-full bg-white shadow-sm transition-transform"
                        style={{ transform: notif[key as keyof typeof notif] ? "translateX(20px)" : "translateX(0)" }} />
                    </button>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex justify-end">
                <Btn variant="primary" onClick={() => toast.success("Notification preferences saved")}>Save Preferences</Btn>
              </div>
            </Card>
          )}

          {active.includes("Security") && (
            <Card>
              <h3 className="font-semibold mb-4" style={{ color: C.primary }}>Password & Security</h3>
              <div className="space-y-4">
                {["Current Password", "New Password", "Confirm New Password"].map(l => (
                  <div key={l}>
                    <label className="block text-sm font-medium mb-1.5" style={{ color: C.primary }}>{l}</label>
                    <input type="password" className="w-full px-3 py-2.5 text-sm rounded-xl border outline-none" style={{ borderColor: C.border }}
                      placeholder="••••••••"
                      onFocus={e => (e.target.style.borderColor = C.maroon)}
                      onBlur={e => (e.target.style.borderColor = C.border)} />
                  </div>
                ))}
                <div className="pt-3 border-t" style={{ borderColor: C.border }}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold" style={{ color: C.primary }}>Two-Factor Authentication</p>
                      <p className="text-xs mt-0.5" style={{ color: C.secondary }}>Add extra security to your account</p>
                    </div>
                    <button className="px-3 py-1.5 rounded-xl text-xs font-bold border" style={{ borderColor: C.maroon, color: C.maroon }}>Enable 2FA</button>
                  </div>
                </div>
                <div className="flex justify-end">
                  <Btn variant="primary" onClick={() => toast.success("Password updated successfully")}>Update Password</Btn>
                </div>
              </div>
            </Card>
          )}

          {active.includes("Branch") && role === "manager" && (
            <Card>
              <h3 className="font-semibold mb-4" style={{ color: C.primary }}>Assigned Branch Information</h3>
              <div className="flex items-center gap-3 p-4 rounded-xl mb-4" style={{ background: C.softMaroonBg }}>
                <MapPin size={18} style={{ color: C.maroon }} />
                <div>
                  <p className="text-sm font-bold" style={{ color: C.maroon }}>Lipa Branch</p>
                  <p className="text-xs" style={{ color: C.secondary }}>Branch code: LPA · Lipa City, Batangas</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                {[["Contact Number", "+63 912 345 6789"], ["Branch Email", "lipa@libroespresso.com"]].map(([l, v]) => (
                  <div key={l}>
                    <label className="block text-sm font-medium mb-1.5" style={{ color: C.primary }}>{l}</label>
                    <input defaultValue={v} className="w-full px-3 py-2.5 text-sm rounded-xl border outline-none" style={{ borderColor: C.border, color: C.primary }} />
                  </div>
                ))}
              </div>
              <div className="mt-4 flex justify-end">
                <Btn variant="primary" onClick={() => toast.success("Branch information saved")}>Save Changes</Btn>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Logout Modal ──────────────────────────────────────────────────────────────
function LogoutModal({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
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
export default function App() {
  const { user, loading, login, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const role: Role = user?.role === "BRANCH_MANAGER" ? "manager" : "owner";
  const page = pageFromPath(location.pathname) as Page;
  const [branch, setBranch] = useState("All Branches");
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("libro.sidebar.collapsed") === "true");
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifs, setNotifs] = useState(notificationsData);
  const [showLogout, setShowLogout] = useState(false);
  const [theme, setTheme] = useState<ThemeMode>(() =>
    localStorage.getItem("libro.theme") === "dark" ? "dark" : "light"
  );

  const unread = notifs.filter(n => !n.read).length;

  useEffect(() => { localStorage.setItem("libro.sidebar.collapsed", String(collapsed)); }, [collapsed]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("libro.theme", theme);
  }, [theme]);

  const loadNotifications = async () => {
    if (!user) return;
    try {
      const workflowNotifications = await inventoryWorkflowService.notifications();
      setNotifs(workflowNotifications.map((notification) => ({
        id: notification.id,
        cat: "Shrinkage",
        title: notification.title,
        body: notification.message,
        time: new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short" }).format(new Date(notification.createdAt)),
        read: Boolean(notification.readAt),
        icon: "shrink",
        entityId: notification.entityId,
      })));
    } catch { setNotifs([]); }
  };
  useEffect(() => { void loadNotifications(); }, [user?.id]);

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
      case "dashboard": return role === "owner" ? <OwnerDashboard onNavigate={setPage} /> : <ManagerDashboard onNavigate={setPage} />;
      case "sales": return <SalesAnalysis role={role} />;
      case "menu": return <MenuRecipesPage />;
      case "inventory": return <InventoryOverview role={role} onNavigate={setPage} />;
      case "physical-count": return <InventoryCountPage />;
      case "shrinkage": return <ShrinkageWorkflowPage />;
      case "variance": return <VarianceMonitoring role={role} />;
      case "purchase-orders": return <PurchaseOrders role={role} />;
      case "cogs": return <COGSAnalysis role={role} />;
      case "predictive": return <PredictiveAnalytics role={role} />;
      case "reports": return <Reports role={role} />;
      case "users": return <AdminUsersPage />;
      case "branches": return <AdminBranchesPage />;
      case "master-data": return <MasterDataPage />;
      case "settings": return <SettingsPage role={role} />;
      default: return role === "owner" ? <OwnerDashboard onNavigate={setPage} /> : <ManagerDashboard onNavigate={setPage} />;
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
          onLogout={() => setShowLogout(true)}
          theme={theme} onThemeToggle={() => setTheme(current => current === "dark" ? "light" : "dark")}
        />
        <main className="app-main flex-1 overflow-y-auto">
          {renderPage()}
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
          navigate(notification.entityId ? `/shrinkage?reportId=${notification.entityId}` : "/shrinkage");
        }} />

      {showLogout && <LogoutModal onConfirm={handleLogout} onCancel={() => setShowLogout(false)} />}
    </div>
  );
}
