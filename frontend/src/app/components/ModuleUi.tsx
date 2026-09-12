import React, { Suspense, useEffect, useState } from "react";
import { Search, ChevronDown, ChevronRight, ArrowUp, ArrowDown, ChevronLeft, GitCompare, Minus, Calendar } from "lucide-react";
import * as Popover from "@radix-ui/react-popover";
import { format, isValid, parseISO } from "date-fns";
import { DayPicker } from "react-day-picker";
import "react-day-picker/dist/style.css";

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
  const readableRange = (start: Date, end: Date) => {
    if (format(start,"yyyy-MM-dd") === format(end,"yyyy-MM-dd")) return format(start,"MMM d, yyyy");
    if (start.getFullYear() !== end.getFullYear()) return `${format(start,"MMM d, yyyy")}–${format(end,"MMM d, yyyy")}`;
    if (start.getMonth() !== end.getMonth()) return `${format(start,"MMM d")}–${format(end,"MMM d, yyyy")}`;
    return `${format(start,"MMM d")}–${format(end,"d, yyyy")}`;
  };
  if (range === "custom" && customStart && customEnd) {
    const start=parseISO(customStart);
    const end=parseISO(customEnd);
    if (isValid(start) && isValid(end)) {
      return readableRange(start,end);
    }
  }
  const end=new Date();
  const start=new Date(end);
  if(range==="7d") start.setDate(end.getDate()-6);
  if(range==="30d") start.setDate(end.getDate()-29);
  if(range==="mtd") start.setDate(1);
  return readableRange(range==="today"?end:start,end);
}

export function dashboardRangeFactor(range: DashboardRange) {
  return { today: 0.04, "7d": 0.27, "30d": 1.08, mtd: 1, custom: 0.62 }[range];
}

export const formatPeso = (value: number) => new Intl.NumberFormat("en-PH", { style: "currency", currency: (()=>{try{return JSON.parse(localStorage.getItem("libro.preferences.active")??"{}").currency??"PHP";}catch{return "PHP";}})(), maximumFractionDigits: 0 }).format(Math.round(value));


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
  low_stock: { label: "Low Stock", bg: C.amberBg, color: C.amber },
  critical: { label: "Critical", bg: C.redBg, color: C.red },
  out: { label: "Out of Stock", bg: C.redBg, color: C.deepMaroon },
  out_of_stock: { label: "Out of Stock", bg: C.redBg, color: C.deepMaroon },
  draft: { label: "Draft", bg: C.grayBg, color: C.secondary },
  pending: { label: "Pending Approval", bg: C.amberBg, color: C.amber },
  ordered: { label: "Ordered", bg: C.blueBg, color: C.blue },
  partially_received: { label: "Partially Received", bg: C.amberBg, color: C.amber },
  received: { label: "Received", bg: C.greenBg, color: C.green },
  cancelled: { label: "Cancelled", bg: C.redBg, color: C.red },
  pending_review: { label: "Pending Review", bg: C.amberBg, color: C.amber },
  verified: { label: "Verified", bg: C.greenBg, color: C.green },
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
  shortage: { label: "Shortage", bg: C.redBg, color: C.red },
  shortage_within_tolerance: { label: "Shortage (Tolerance)", bg: C.amberBg, color: C.amber },
  excess: { label: "Excess", bg: C.blueBg, color: C.blue },
  excess_within_tolerance: { label: "Excess (Tolerance)", bg: C.blueBg, color: C.blue },
  detected: { label: "Needs Investigation", bg: C.redBg, color: C.red },
  reviewed: { label: "Reviewed", bg: C.greenBg, color: C.green },
  safe: { label: "Safe", bg: C.greenBg, color: C.green },
};

export function StatusChip({ status, kind = "status", className = "" }: { status: string; kind?: "status" | "confidence" | "urgency"; className?: string }) {
  const normKey = status.toLowerCase().trim();
  const level = {
    high: { bg: C.redBg, color: C.red },
    medium: { bg: C.amberBg, color: C.amber },
    low: { bg: C.greenBg, color: C.green },
  }[normKey];
  const v = kind === "status"
    ? statusMap[normKey] || statusMap[status] || { label: status.replaceAll("_", " "), bg: C.grayBg, color: C.secondary }
    : {
        label: `${status.charAt(0).toUpperCase()}${status.slice(1).toLowerCase()} ${kind}`,
        bg: level?.bg ?? C.grayBg,
        color: level?.color ?? C.secondary,
      };
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap border", className)}
      style={{
        background: v.bg,
        color: v.color,
        borderColor: `color-mix(in srgb, ${v.color} 25%, transparent)`,
      }}
    >
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: v.color }} />
      <span>{v.label}</span>
    </span>
  );
}

export const StatusBadge = StatusChip;

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
    <div className={cn("app-card kpi-card relative overflow-hidden bg-white rounded-2xl border p-5 flex flex-col gap-3", onClick && "cursor-pointer kpi-card--interactive")}
      style={{ borderColor: active ? color : C.border, boxShadow: active ? `0 14px 30px rgb(52 27 34 / 0.13), 0 0 0 2px color-mix(in srgb, ${color} 14%, transparent), inset 0 1px 0 rgb(255 255 255 / 0.72)` : undefined }}
      onClick={onClick} role={onClick ? "button" : undefined} tabIndex={onClick ? 0 : undefined}
      aria-pressed={onClick ? active : undefined}
      onKeyDown={event => { if (onClick && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); onClick(); } }}>
      <div className="kpi-card__header flex items-start justify-between gap-2 min-w-0">
        <span className="kpi-card__label min-w-0 text-xs font-semibold uppercase tracking-wider leading-tight" style={{ color: C.secondary }}>
          {label}
        </span>
        {Icon && (
          <div className="kpi-card__badge inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-semibold uppercase tracking-wide flex-shrink-0 max-w-full"
            style={{ background: `color-mix(in srgb, ${color} 10%, transparent)`, color }}>
            <Icon size={12} strokeWidth={1.8} />
            <span className="kpi-card__badge-text whitespace-nowrap">{label.includes("Sales") ? "Revenue" : label.includes("COGS") ? "Direct costs" : label.includes("Margin") || label.includes("Profit") ? "Margin" : label.includes("Shrinkage") ? "Variance" : "Overview"}</span>
          </div>
        )}
      </div>
      <div>
        <div className="kpi-card__value text-[24px] font-bold leading-tight tracking-tight" style={{ color: C.primary }}>{value}</div>
        {sub && <div className="kpi-card__sub text-xs mt-1.5" style={{ color: C.muted }}>{sub}</div>}
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
    <div className="section-header flex flex-col sm:flex-row sm:items-start sm:justify-between mb-5 gap-4 min-w-0">
      <div className="min-w-0">
        <h1 className="text-xl font-bold" style={{ color: C.primary }}>{title}</h1>
        {sub && <p className="text-sm mt-0.5" style={{ color: C.secondary }}>{sub}</p>}
      </div>
      {actions && <div className="section-header__actions flex items-center gap-2 flex-wrap sm:justify-end">{actions}</div>}
    </div>
  );
}

// ─── Button ────────────────────────────────────────────────────────────────────
export function Btn({ children, variant = "primary", size = "md", onClick, icon: Icon, disabled, className = "", title }: {
  children?: React.ReactNode; variant?: "primary" | "secondary" | "outline" | "ghost" | "danger";
  size?: "sm" | "md" | "lg"; onClick?: () => void; icon?: React.ElementType; disabled?: boolean; className?: string; title?: string;
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
    <button type="button" onClick={onClick} disabled={disabled} title={title}
      className={cn(`app-btn app-btn--${variant}`, "inline-flex items-center justify-center font-semibold rounded-xl",
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

type SelectOption = string | { value: string; label: string };

export function Select({ options, value, onChange, small, icon: Icon, disabled = false, className = "", ariaLabel }: { options: SelectOption[]; value?: string; onChange?: (v: string) => void; small?: boolean; icon?: React.ElementType; disabled?: boolean; className?: string; ariaLabel?: string }) {
  const [open, setOpen] = useState(false);
  const normalized = options.map((option) => typeof option === "string" ? { value: option, label: option } : option);
  const selected = normalized.find((option) => option.value === value) ?? normalized[0];
  return (
    <div className={cn("dropdown-control relative", className)}>
      <button type="button" disabled={disabled} onClick={() => setOpen((current) => !current)}
        className={cn("custom-select-trigger w-full min-w-[150px] flex items-center gap-2 rounded-xl border text-left font-semibold",
          small ? "min-h-9 px-3 py-1.5 text-xs" : "min-h-10 px-3 py-2 text-sm")}
        aria-haspopup="listbox" aria-expanded={open} aria-label={ariaLabel}>
        {Icon && <Icon size={13} className="flex-shrink-0 text-[var(--app-primary)]"/>}
        <span className="min-w-0 flex-1 truncate">{selected?.label ?? "Select"}</span>
        <span className={cn("dropdown-chevron flex flex-shrink-0 items-center justify-center", open && "is-open")}><ChevronDown size={12}/></span>
      </button>
      {open && <>
        <button type="button" className="fixed inset-0 z-40 cursor-default" aria-label="Close dropdown" onClick={() => setOpen(false)}/>
        <div className="custom-select-menu absolute left-0 top-full z-50 mt-2 min-w-full w-max max-w-[280px] rounded-2xl border p-1.5 shadow-2xl" role="listbox">
          {normalized.map((option) => {
            const active = option.value === selected?.value;
            return <button type="button" key={option.value} role="option" aria-selected={active}
              className={cn("custom-select-option w-full rounded-xl px-3 py-2.5 flex items-center gap-2 text-left text-sm", active && "is-selected")}
              onClick={() => { onChange?.(option.value); setOpen(false); }}>
              <span className="flex-1">{option.label}</span>
              {active && <span className="w-1.5 h-1.5 rounded-full bg-white"/>}
            </button>;
          })}
        </div>
      </>}
    </div>
  );
}

export function CalendarDateField({ label, value, min, max, onChange, className="", disabled=false }: { label:string;value:string;min?:string;max?:string;onChange:(value:string)=>void;className?:string;disabled?:boolean }) {
  const [open,setOpen]=useState(false);
  const parsed=value?parseISO(value):undefined;
  const selected=parsed&&isValid(parsed)?parsed:undefined;
  const minDate=min?parseISO(min):undefined;
  const maxDate=max?parseISO(max):undefined;
  return <Popover.Root open={open} onOpenChange={(next)=>{ if (!disabled) setOpen(next); }}>
    <Popover.Trigger asChild>
      <button type="button" disabled={disabled} className={cn("calendar-date-trigger min-w-[154px] rounded-xl border px-3 py-2 text-left disabled:cursor-not-allowed disabled:opacity-60",className)} aria-label={label}>
        <span className="block text-[9px] font-bold uppercase tracking-wider" style={{color:C.muted}}>{label}</span>
        <span className="mt-0.5 flex items-center gap-2 text-xs font-semibold" style={{color:selected?C.primary:C.secondary}}><Calendar size={13} style={{color:C.maroon}}/><span>{selected?format(selected,"MMM d, yyyy"):"Select date"}</span></span>
      </button>
    </Popover.Trigger>
    <Popover.Portal>
      <Popover.Content align="start" sideOffset={8} collisionPadding={16} className="calendar-popover z-[100] rounded-3xl border p-3 shadow-2xl">
        <DayPicker mode="single" selected={selected} defaultMonth={selected??minDate??new Date()} fromDate={minDate} toDate={maxDate} showOutsideDays fixedWeeks
          onSelect={(date)=>{if(date){onChange(format(date,"yyyy-MM-dd"));setOpen(false);}}}
          className="libro-calendar"/>
        <div className="flex items-center justify-between border-t px-2 pt-2" style={{borderColor:C.border}}>
          <button type="button" onClick={()=>onChange("")} className="rounded-lg px-2.5 py-1.5 text-xs font-semibold" style={{color:C.secondary}}>Clear</button>
          <button type="button" onClick={()=>{const today=new Date();if((!minDate||today>=minDate)&&(!maxDate||today<=maxDate)){onChange(format(today,"yyyy-MM-dd"));setOpen(false);}}} className="rounded-lg px-2.5 py-1.5 text-xs font-semibold" style={{color:C.maroon}}>Today</button>
        </div>
        <Popover.Arrow className="calendar-popover-arrow"/>
      </Popover.Content>
    </Popover.Portal>
  </Popover.Root>;
}

export function CalendarDateTimeField({label,value,onChange}:{label:string;value:string;onChange:(value:string)=>void}) {
  const date=value.slice(0,10);
  const time=value.length>=16?value.slice(11,16):"";
  const update=(nextDate:string,nextTime:string)=>onChange(nextDate?`${nextDate}T${nextTime||"00:00"}`:"");
  return <div className="grid grid-cols-1 sm:grid-cols-[minmax(170px,1fr)_130px] gap-2">
    <CalendarDateField label={label} value={date} onChange={(next)=>update(next,time)}/>
    <label className="calendar-time-field rounded-xl border px-3 py-2"><span className="block text-[9px] font-bold uppercase tracking-wider" style={{color:C.muted}}>Time</span><input type="time" value={time} onChange={(event)=>update(date,event.target.value)} className="mt-0.5 w-full border-0 bg-transparent p-0 text-xs font-semibold outline-none" aria-label={`${label} time`}/></label>
  </div>;
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
  useEffect(() => { setDraftStart(customStart); setDraftEnd(customEnd); }, [customStart, customEnd]);

  return (
    <div className="dashboard-filters flex items-center gap-2 flex-wrap justify-end">
      <div className="filter-control"><Select options={(Object.entries(dashboardRangeLabels) as [DashboardRange,string][]).map(([option,label])=>({value:option,label}))} value={range} onChange={(value)=>onRangeChange(value as DashboardRange)} icon={Calendar} small ariaLabel="Dashboard date range"/></div>
      {range !== "custom" && <div className="filter-control"><Select options={[{value:"previous",label:"vs Previous Period"},{value:"lastMonth",label:"vs Last Month"}]} value={comparison} onChange={(value)=>onComparisonChange(value as DashboardComparison)} icon={GitCompare} small ariaLabel="Dashboard comparison period"/></div>}
      {range === "custom" && (
        <div className="custom-range-controls flex items-end gap-2 rounded-2xl border p-2 shadow-lg" style={{ borderColor:C.border,background:C.surface }}>
          <CalendarDateField label="Start date" value={draftStart} max={draftEnd} onChange={setDraftStart}/>
          <span className="pb-3 text-[10px] font-bold uppercase" style={{color:C.muted}}>to</span>
          <CalendarDateField label="End date" value={draftEnd} min={draftStart} onChange={setDraftEnd}/>
          <button type="button" onClick={() => onApplyCustom(draftStart, draftEnd)} disabled={!draftStart || !draftEnd}
            className="min-h-12 px-4 py-2 rounded-xl text-xs font-semibold text-white shadow-sm disabled:opacity-40" style={{ background:C.maroon }}>Apply</button>
          <button type="button" onClick={() => { setDraftStart(customStart); setDraftEnd(customEnd); onReset(); }}
            className="min-h-12 px-3 py-2 rounded-xl text-xs font-semibold" style={{ color:C.secondary }}>Reset</button>
        </div>
      )}
      <span className="period-pill px-3 py-2 rounded-xl text-xs font-medium border" style={{ color: C.secondary, borderColor: C.border, background: C.mainBg }}>
        {dashboardPeriodLabel(range, customStart, customEnd)}
      </span>
    </div>
  );
}

export type TableColDef = string | {
  label: React.ReactNode;
  align?: "left" | "right" | "center";
  className?: string;
  width?: string | number;
  colSpan?: number;
};

const numericTableHeaders = new Set(["sales", "theoretical cost", "actual cost", "cogs variance", "gross profit", "margin", "cogs", "recipe cogs", "recipe cost", "selling price", "total", "total sales", "total amount", "units sold", "system stock", "current stock", "reorder level", "shortfall", "stock value", "inventory value", "unit cost", "expected", "actual", "variance", "variance %", "variance value", "value", "loss value", "quantity", "quantity ordered", "quantity received", "coverage", "days", "reorder", "suggested reorder", "recent daily use", "items", "items counted", "variances", "price"]);
const centeredTableHeaders = new Set(["health status", "status", "health", "action", "actions", "date", "business date", "count date", "order date", "expected delivery", "last count", "last updated", "created", "updated"]);
export const tableHeaderAlignment = (label:React.ReactNode,align?:"left"|"right"|"center") => {
  if (align === "left") return "left";
  const text=typeof label==="string"?label.trim().toLowerCase():"";
  const dataLabel=/\b(quantity|cost|price|sales|revenue|profit|margin|variance|stock|total|amount|value|days?|counts?|coverage|reorder|mae|percentage)\b|%/.test(text);
  const compactIdentifier=/^(id|sku|code|po number|product code|ingredient code)$/.test(text);
  return align === "right" || align === "center" || numericTableHeaders.has(text) || centeredTableHeaders.has(text) || dataLabel || compactIdentifier ? "center" : "left";
};
export const isTableDataValue = (children:React.ReactNode) => {
  const textValue=typeof children==="string"?children.trim():"";
  return typeof children==="number" || /^[-+]?\s*(?:₱|PHP\s*)?[\d,.]+(?:\s*%|\s+[a-z]+)?$/i.test(textValue) || /^\w{3}\s+\d{1,2},\s+\d{4}/.test(textValue) || /^\d{4}-\d{2}-\d{2}/.test(textValue) || /^\d{1,2}[/-]\d{1,2}[/-]\d{4}/.test(textValue);
};

export function THead({ cols, className = "" }: { cols: readonly TableColDef[] | TableColDef[]; className?: string }) {
  return (
    <thead style={{ background: "var(--app-bg)" }} className={className}>
      <tr style={{ borderBottom: `1px solid ${C.border}` }}>
        {cols.map((c, i) => {
          const isObj = typeof c === "object" && c !== null && "label" in c;
          const label = isObj ? (c as any).label : c;
          const align = isObj ? (c as any).align : undefined;
          const colClassName = isObj ? (c as any).className : "";
          const width = isObj ? (c as any).width : undefined;
          const colSpan = isObj ? (c as any).colSpan : undefined;

          // Auto-align common numeric/action headers if align not explicitly provided
          const alignClass = tableHeaderAlignment(label,align) === "center" ? "text-center" : "text-left";

          return (
            <th
              key={typeof label === "string" ? label : i}
              colSpan={colSpan}
              style={{ color: C.secondary, borderColor: C.border, width }}
              className={cn(
                "py-3 px-4 text-xs font-semibold uppercase tracking-wider whitespace-nowrap",
                alignClass,
                colClassName
              )}
            >
              {label}
            </th>
          );
        })}
      </tr>
    </thead>
  );
}

export function TR({
  children,
  onClick,
  className = "",
  style = {},
}: {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <tr
      className={cn(
        "border-b transition-colors duration-150 hover:bg-[var(--app-primary-faint)]",
        onClick && "cursor-pointer",
        className
      )}
      style={{ borderColor: C.border, ...style }}
      onClick={onClick}
    >
      {children}
    </tr>
  );
}

export function TD({
  children,
  right,
  center,
  muted,
  mono,
  bold,
  className = "",
  style = {},
  colSpan,
  onClick,
}: {
  children: React.ReactNode;
  right?: boolean;
  center?: boolean;
  muted?: boolean;
  mono?: boolean;
  bold?: boolean;
  className?: string;
  style?: React.CSSProperties;
  colSpan?: number;
  onClick?: React.MouseEventHandler<HTMLTableCellElement>;
}) {
  const inferredDataValue = isTableDataValue(children);
  const alignCenter = Boolean(right || center || mono || inferredDataValue || (React.isValidElement(children) && (children.type === StatusChip || children.type === Btn)));
  return (
    <td
      colSpan={colSpan}
      onClick={onClick}
      className={cn(
        "py-3.5 px-4 text-sm transition-colors",
        alignCenter ? "text-center" : "text-left",
        mono && "font-mono text-xs",
        bold && "font-bold",
        muted ? "text-[var(--app-text-muted)] font-medium" : "text-[var(--app-text)]",
        className
      )}
      style={{ color: muted ? C.secondary : undefined, ...style }}
    >
      {children}
    </td>
  );
}

export function TableCard({
  title,
  subtitle,
  badge,
  actions,
  toolbar,
  children,
  className = "",
  headerClassName = "",
  padding = false,
}: {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
  toolbar?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  headerClassName?: string;
  padding?: boolean;
}) {
  const hasHeader = Boolean(title || subtitle || badge || actions || toolbar);
  return (
    <div
      className={cn(
        "app-card bg-white rounded-2xl border overflow-hidden shadow-sm",
        padding && "p-5",
        className
      )}
      style={{ borderColor: C.border, background: C.surface }}
    >
      {hasHeader && (
        <div className={cn("px-5 pt-5 pb-3.5 space-y-3", headerClassName)}>
          {(title || actions || badge) && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2.5 flex-wrap">
                  {typeof title === "string" ? (
                    <h2 className="font-bold text-base text-[var(--app-text)] tracking-tight">
                      {title}
                    </h2>
                  ) : (
                    title
                  )}
                  {badge}
                </div>
                {subtitle && (
                  <p className="text-xs text-[var(--app-text-muted)]">
                    {subtitle}
                  </p>
                )}
              </div>
              {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
            </div>
          )}
          {toolbar && (
            <div className="cogs-table-filters flex items-center gap-2 flex-wrap pt-0.5">
              {toolbar}
            </div>
          )}
        </div>
      )}
      {children}
    </div>
  );
}

export function TableWrapper({
  children,
  minWidth = 720,
  className = "",
}: {
  children: React.ReactNode;
  minWidth?: number | string;
  className?: string;
}) {
  return (
    <div className={cn("overflow-x-auto border-t border-[var(--app-border)]", className)}>
      <table className="data-table w-full text-left border-collapse" style={{ minWidth }}>
        {children}
      </table>
    </div>
  );
}

export function TableEmptyRow({
  colSpan,
  icon: Icon,
  title = "No records found",
  subtitle = "No data is available for the selected filters.",
  className = "",
}: {
  colSpan: number;
  icon?: React.ElementType;
  title?: string;
  subtitle?: string;
  className?: string;
}) {
  return (
    <tr>
      <td colSpan={colSpan} className={cn("py-12 px-4 text-center", className)}>
        <div className="flex flex-col items-center justify-center gap-1.5">
          {Icon && (
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center mb-2"
              style={{ background: C.grayBg, color: C.muted }}
            >
              <Icon size={18} />
            </div>
          )}
          <p className="font-semibold text-sm text-[var(--app-text)]">{title}</p>
          <p className="text-xs text-[var(--app-text-muted)] max-w-sm">{subtitle}</p>
        </div>
      </td>
    </tr>
  );
}

export function TableLoadingRow({
  colSpan,
  label = "Loading records…",
}: {
  colSpan: number;
  label?: string;
}) {
  return (
    <tr>
      <td colSpan={colSpan} className="py-12 px-4 text-center text-sm" style={{ color: C.muted }}>
        <div className="flex items-center justify-center gap-2">
          <div className="w-4 h-4 rounded-full border-2 border-[var(--app-primary)] border-t-transparent animate-spin" />
          <span>{label}</span>
        </div>
      </td>
    </tr>
  );
}

export function Pagination({
  total,
  page,
  perPage,
  onPageChange,
}: {
  total: number;
  page: number;
  perPage: number;
  onPageChange?: (nextPage: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / perPage));
  const start = total === 0 ? 0 : (page - 1) * perPage + 1;
  const end = Math.min(page * perPage, total);

  return (
    <div
      className="flex items-center justify-between px-5 py-3 border-t bg-[var(--app-surface)]"
      style={{ borderColor: C.border }}
    >
      <span className="text-xs font-medium text-[var(--app-text-muted)]">
        Showing <span className="font-semibold text-[var(--app-text)]">{start}</span>–<span className="font-semibold text-[var(--app-text)]">{end}</span> of <span className="font-semibold text-[var(--app-text)]">{total}</span>
      </span>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onPageChange?.(Math.max(1, page - 1))}
          disabled={page <= 1}
          className="w-8 h-8 rounded-lg flex items-center justify-center border border-[var(--app-border)] text-[var(--app-text-muted)] hover:bg-[var(--app-primary-faint)] hover:text-[var(--app-primary)] disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-[var(--app-text-muted)] transition-colors"
          aria-label="Previous page"
        >
          <ChevronLeft size={14} />
        </button>
        {Array.from({ length: Math.min(pages, 5) }, (_, i) => i + 1).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onPageChange?.(p)}
            className="w-8 h-8 rounded-lg text-xs font-semibold flex items-center justify-center transition-colors"
            style={{
              background: p === page ? C.maroon : "transparent",
              color: p === page ? "#fff" : C.secondary,
              border: p === page ? "none" : `1px solid ${C.border}`,
            }}
          >
            {p}
          </button>
        ))}
        <button
          type="button"
          onClick={() => onPageChange?.(Math.min(pages, page + 1))}
          disabled={page >= pages}
          className="w-8 h-8 rounded-lg flex items-center justify-center border border-[var(--app-border)] text-[var(--app-text-muted)] hover:bg-[var(--app-primary-faint)] hover:text-[var(--app-primary)] disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-[var(--app-text-muted)] transition-colors"
          aria-label="Next page"
        >
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
