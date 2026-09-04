import React, { Suspense, useState } from "react";
import { Search, ChevronDown, ChevronRight, ArrowUp, ArrowDown, ChevronLeft, GitCompare, Minus, Calendar } from "lucide-react";

// ─── Color System ──────────────────────────────────────────────────────────────
export const C = {
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
export type DashboardRange = "today" | "7d" | "30d" | "mtd" | "custom";
export type DashboardComparison = "previous" | "lastMonth";

const dashboardRangeLabels: Record<DashboardRange, string> = {
  today: "Today",
  "7d": "Last 7 Days",
  "30d": "Last 30 Days",
  mtd: "Month to Date",
  custom: "Custom Range",
};

export function dashboardPeriodLabel(range: DashboardRange, customStart?: string, customEnd?: string) {
  if (range === "today") return "Aug 26, 2026";
  if (range === "7d") return "Aug 20–26, 2026";
  if (range === "30d") return "Jul 28–Aug 26, 2026";
  if (range === "custom" && customStart && customEnd) return `${customStart} – ${customEnd}`;
  return "Aug 1–26, 2026";
}

export function dashboardRangeFactor(range: DashboardRange) {
  return { today: 0.04, "7d": 0.27, "30d": 1.08, mtd: 1, custom: 0.62 }[range];
}

export const formatPeso = (value: number) => `₱${Math.round(value).toLocaleString("en-PH")}`;


export function cn(...cls: (string | boolean | undefined)[]) {
  return cls.filter(Boolean).join(" ");
}

export function getInitials(name: string) {
  return name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
}

// ─── Skeleton Components ───────────────────────────────────────────────────────
export function SkeletonBlock({ w = "100%", h = 16, className = "" }: { w?: string | number; h?: number; className?: string }) {
  return (
    <div
      className={cn("rounded animate-pulse", className)}
      style={{ width: w, height: h, background: "linear-gradient(90deg, #F0F1F4 25%, #E8E9ED 50%, #F0F1F4 75%)", backgroundSize: "200% 100%" }}
    />
  );
}

export function SkeletonKPICard() {
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

export function SkeletonTable({ rows = 5, cols = 6 }: { rows?: number; cols?: number }) {
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

export function ModuleLoadingFallback() {
  return (
    <div className="p-6 space-y-5" aria-label="Loading module" role="status">
      <div className="space-y-2">
        <SkeletonBlock w={190} h={24} />
        <SkeletonBlock w={310} h={12} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, index) => <SkeletonKPICard key={index} />)}
      </div>
      <div className="rounded-2xl border overflow-hidden" style={{ background: C.surface, borderColor: C.border }}>
        <SkeletonTable rows={4} cols={5} />
      </div>
      <span className="sr-only">Loading module content</span>
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

export function StatusChip({ status }: { status: string }) {
  const v = statusMap[status] || { label: status, bg: C.grayBg, color: C.secondary };
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap"
      style={{ background: v.bg, color: v.color }}>
      {v.label}
    </span>
  );
}

// ─── KPI Card ──────────────────────────────────────────────────────────────────
export function KPICard({ label, value, change, changeDir, sub, color = C.maroon, icon: Icon, sparkData: _sparkData, comparisonLabel = "previous period", onClick, active = false }: {
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
export function Card({ children, className = "", padding = true, style = {} }: { children: React.ReactNode; className?: string; padding?: boolean; style?: React.CSSProperties }) {
  return (
    <div className={cn("app-card bg-white rounded-2xl border", padding ? "p-5" : "", className)}
      style={{ borderColor: C.border, ...style }}>
      {children}
    </div>
  );
}

export function SectionHeader({ title, sub, actions }: { title: string; sub?: string; actions?: React.ReactNode }) {
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
export function Btn({ children, variant = "primary", size = "md", onClick, icon: Icon, disabled, className = "" }: {
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
export function SearchInput({ placeholder = "Search...", width = 220, value, onChange }: { placeholder?: string; width?: number; value?: string; onChange?: (value: string) => void }) {
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

export function Select({ options, value, onChange, small }: { options: string[]; value?: string; onChange?: (v: string) => void; small?: boolean }) {
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
export function DashboardFilters({ range, comparison, customStart, customEnd, onRangeChange, onComparisonChange, onApplyCustom, onReset }: {
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

export function THead({ cols }: { cols: string[] }) {
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

export function TR({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
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

export function TD({ children, right, muted, mono, className = "", style = {} }: { children: React.ReactNode; right?: boolean; muted?: boolean; mono?: boolean; className?: string; style?: React.CSSProperties }) {
  return (
    <td className={cn("px-4 py-3 text-sm", right && "text-right", mono && "font-mono text-xs", className)}
      style={{ color: muted ? C.secondary : C.primary, ...style }}>
      {children}
    </td>
  );
}

export function Pagination({ total, page, perPage }: { total: number; page: number; perPage: number }) {
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
export function ChartTip({ active, payload, label }: any) {
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
export function EmptyState({ icon: Icon, title, body, action, onAction }: {
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

export function ModuleTabSwitcher<T extends string>({ tabs, active, onChange }: {
  tabs: readonly { id: T; label: string }[];
  active: T;
  onChange: (tab: T) => void;
}) {
  return (
    <div className="px-6 pt-6">
      <div className="inline-flex flex-wrap items-center gap-1 rounded-xl border p-1"
        style={{ background: C.surface, borderColor: C.border }}>
        {tabs.map((tab) => {
          const selected = tab.id === active;
          return (
            <button key={tab.id} type="button" onClick={() => onChange(tab.id)}
              className="rounded-lg px-4 py-2 text-sm font-semibold transition-all"
              style={{
                background: selected ? `linear-gradient(135deg, ${C.maroon}, ${C.deepMaroon})` : "transparent",
                color: selected ? "#ffffff" : C.secondary,
                boxShadow: selected ? "0 5px 14px color-mix(in srgb, var(--app-primary) 20%, transparent)" : "none",
              }}>
              {tab.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function AnimatedTabPanel({ panelKey, children }: { panelKey: string; children: React.ReactNode }) {
  return (
    <div key={panelKey} className="module-tab-transition">
      <Suspense fallback={<ModuleLoadingFallback />}>{children}</Suspense>
    </div>
  );
}
