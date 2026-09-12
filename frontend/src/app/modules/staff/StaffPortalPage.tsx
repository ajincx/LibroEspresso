import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bell,
  ChevronRight,
  Coffee,
  FileText,
  LogOut,
  MessageCircle,
  Moon,
  Plus,
  ShieldCheck,
  Sun,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../../contexts/AuthContext";
import { operationsService } from "../../services/operations.service";
import type {
  IncidentItemOption,
  IncidentProductOption,
  IncidentReport,
  IncidentStatus,
} from "../../types/operations";
import { formatAppDate } from "../../utils/appPreferences";
import { StaffIncidentModal } from "./StaffIncidentModal";
import { IncidentReportDetailsModal } from "./IncidentReportDetailsModal";
type StaffTab = "home" | "reports";
type Props = {
  unreadCount: number;
  messageUnreadCount: number;
  theme: "light" | "dark";
  onBell: () => void;
  onMessages: () => void;
  onSettings: () => void;
  onLogout: () => void;
  onThemeToggle: () => void;
};
const reportLabel = (value: string) =>
  value
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
function ReportRows({
  reports,
  onSelect,
}: {
  reports: IncidentReport[];
  onSelect: (report: IncidentReport) => void;
}) {
  if (!reports.length)
    return (
      <div className="py-12 text-center">
        <FileText className="mx-auto text-[var(--app-text-faint)]" />
        <p className="mt-3 font-semibold">No incident reports yet</p>
        <p className="mt-1 text-xs text-[var(--app-text-muted)]">
          Your submitted shrinkage-related reports will appear here.
        </p>
      </div>
    );
  return (
    <div className="divide-y divide-[var(--app-border)]">
      {reports.map((report) => (
        <button
          key={report.id}
          type="button"
          onClick={() => onSelect(report)}
          className="group block w-full rounded-2xl px-2 py-4 text-left transition-colors hover:bg-[var(--app-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-primary)]"
          aria-label={`View ${report.status.toLowerCase()} incident report details`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">
                {report.productName ?? report.inventoryItemName}
              </p>
              <p className="mt-1 text-xs text-[var(--app-text-muted)]">
                {reportLabel(report.incidentType)} · {report.quantity}{" "}
                {report.unit} · {formatAppDate(report.occurredAt, true)}
              </p>
              <p className="mt-1 truncate text-xs text-[var(--app-text-faint)]">
                {report.reason}
              </p>
            </div>
            <span
              className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold"
              style={{
                color:
                  report.status === "VERIFIED"
                    ? "#2E8B57"
                    : report.status === "REJECTED"
                      ? "#D9534F"
                      : "#9A6700",
                background:
                  report.status === "VERIFIED"
                    ? "rgba(46,139,87,.1)"
                    : report.status === "REJECTED"
                      ? "rgba(217,83,79,.1)"
                      : "rgba(217,158,35,.12)",
              }}
            >
              {report.status}
            </span>
            <ChevronRight
              size={17}
              className="mt-0.5 shrink-0 text-[var(--app-text-faint)] transition-transform group-hover:translate-x-0.5"
            />
          </div>
          {report.managerComment && (
            <div className="mt-3 rounded-xl bg-[var(--app-primary-subtle)] px-3 py-2.5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--app-primary)]">
                Manager Comment
              </p>
              <p className="mt-1 whitespace-pre-wrap text-xs text-[var(--app-text-muted)]">
                {report.managerComment}
              </p>
            </div>
          )}
        </button>
      ))}
    </div>
  );
}
export function StaffPortalPage({
  unreadCount,
  messageUnreadCount,
  theme,
  onBell,
  onMessages,
  onSettings,
  onLogout,
  onThemeToggle,
}: Props) {
  const { user } = useAuth();
  const [tab, setTab] = useState<StaffTab>("home");
  const [reports, setReports] = useState<IncidentReport[]>([]);
  const [options, setOptions] = useState<IncidentItemOption[]>([]);
  const [products, setProducts] = useState<IncidentProductOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showIncident, setShowIncident] = useState(false);
  const [selectedReport, setSelectedReport] = useState<IncidentReport | null>(
    null,
  );
  const [reportStatus, setReportStatus] = useState<IncidentStatus | "ALL">(
    "ALL",
  );
  const load = useCallback(async (silent = false) => {
    try {
      const [incidents, incidentOptions] = await Promise.all([
        operationsService.incidents(),
        operationsService.incidentOptions(),
      ]);
      setReports(incidents);
      setOptions(incidentOptions.items);
      setProducts(incidentOptions.products);
    } catch (error) {
      if (!silent)
        toast.error(
          error instanceof Error
            ? error.message
            : "Unable to load the Staff portal.",
        );
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
    const refresh = window.setInterval(() => void load(true), 10000);
    return () => window.clearInterval(refresh);
  }, [load]);
  const visibleReports = useMemo(
    () =>
      reportStatus === "ALL"
        ? reports
        : reports.filter((report) => report.status === reportStatus),
    [reports, reportStatus],
  );
  if (!user) return null;
  const pending = reports.filter((r) => r.status === "PENDING").length;
  const verified = reports.filter((r) => r.status === "VERIFIED").length;
  const nav = [
    { id: "home" as const, label: "Home", icon: Coffee },
    { id: "reports" as const, label: "Incident Reports", icon: FileText },
  ];
  return (
    <div
      className="min-h-screen pb-24 lg:pb-8 text-[var(--app-text)]"
      style={{
        background:
          "radial-gradient(circle at 50% 0%,var(--app-primary-faint),transparent 34%),var(--app-bg)",
      }}
    >
      <header className="sticky top-0 z-30 border-b border-[var(--app-border)] bg-[color:var(--app-surface)]/95 backdrop-blur">
        <div className="mx-auto flex h-20 max-w-6xl items-center gap-3 px-4 sm:px-6">
          <img
            src="/images/logo.jpg"
            className="h-11 w-11 rounded-xl object-cover"
            alt="Libro Espresso"
          />
          <div className="min-w-0">
            <p className="truncate font-bold">Libro Espresso</p>
            <p className="truncate text-xs text-[var(--app-text-muted)]">
              Staff Portal · {user.branch?.name}
            </p>
          </div>
          <nav className="ml-auto mr-2 hidden rounded-xl bg-[var(--app-surface-muted)] p-1 lg:flex">
            {nav.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold"
                style={{
                  background: tab === id ? "var(--app-primary)" : "transparent",
                  color: tab === id ? "white" : "var(--app-text-muted)",
                }}
              >
                <Icon size={15} />
                {label}
              </button>
            ))}
          </nav>
          <div className="ml-auto flex gap-1.5 lg:ml-0">
            {[
              [onThemeToggle, theme === "dark" ? Sun : Moon, 0, "Theme"],
              [onMessages, MessageCircle, messageUnreadCount, "Messages"],
              [onBell, Bell, unreadCount, "Notifications"],
              [onSettings, UserRound, 0, "Profile"],
            ].map(([action, Icon, count, label]) => {
              const I = Icon as typeof Bell;
              return (
                <button
                  key={String(label)}
                  onClick={action as () => void}
                  aria-label={String(label)}
                  className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] text-[var(--app-text-muted)]"
                >
                  <I size={17} />
                  {Number(count) > 0 && (
                    <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--app-primary)] px-1 text-[9px] text-white">
                      {String(count)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-semibold text-[var(--app-primary)]">
              {formatAppDate(new Date())}
            </p>
            <h1 className="mt-1 text-2xl font-bold sm:text-3xl">
              Hello, {user.firstName}
            </h1>
            <p className="mt-1 text-sm text-[var(--app-text-muted)]">
              {tab === "home"
                ? "Report spoilage, wastage, damaged items, or preparation errors."
                : "Track your submitted incident reports and Manager feedback."}
            </p>
          </div>
          <button
            onClick={onLogout}
            className="hidden items-center gap-2 p-2 text-xs font-semibold text-[var(--app-text-muted)] sm:flex"
          >
            <LogOut size={15} />
            Log out
          </button>
        </div>
        {loading ? (
          <div className="mt-6 h-[420px] animate-pulse rounded-[32px] bg-[var(--app-surface-muted)]" />
        ) : (
          <div className="mt-6">
            {tab === "home" ? (
              <section className="overflow-hidden rounded-[32px] border border-[var(--app-border)] bg-[var(--app-surface)] p-6 shadow-[0_22px_60px_rgba(77,20,31,.13)] sm:p-9">
                <div className="mx-auto max-w-2xl text-center">
                  <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--app-primary-subtle)] text-[var(--app-primary)]">
                    <ShieldCheck size={30} />
                  </span>
                  <p className="mt-5 text-xs font-bold tracking-[.2em] text-[var(--app-primary)]">
                    SHRINKAGE INCIDENT REPORTING
                  </p>
                  <h2 className="mt-2 text-2xl font-bold">
                    Record an operational incident
                  </h2>
                  <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-[var(--app-text-muted)]">
                    Submit accurate details about spoilage, wastage, damage, or
                    preparation errors. Your Manager will review the report and
                    return its status and comments here.
                  </p>
                  <button
                    onClick={() => setShowIncident(true)}
                    className="mx-auto mt-6 flex h-12 items-center justify-center gap-2 rounded-2xl bg-[var(--app-primary)] px-6 text-sm font-bold text-white shadow-lg"
                  >
                    <Plus size={18} />
                    Create Incident Report
                  </button>
                </div>
                <div className="mx-auto mt-8 grid max-w-2xl grid-cols-2 gap-3">
                  <div className="rounded-2xl bg-[var(--app-surface-muted)] p-4 text-center">
                    <p className="text-2xl font-bold">{pending}</p>
                    <p className="mt-1 text-xs text-[var(--app-text-muted)]">
                      Awaiting review
                    </p>
                  </div>
                  <div className="rounded-2xl bg-[var(--app-surface-muted)] p-4 text-center">
                    <p className="text-2xl font-bold">{verified}</p>
                    <p className="mt-1 text-xs text-[var(--app-text-muted)]">
                      Verified reports
                    </p>
                  </div>
                </div>
              </section>
            ) : (
              <section className="rounded-3xl border border-[var(--app-border)] bg-[var(--app-surface)] px-5">
                <div className="pt-5">
                  <div>
                    <h2 className="text-lg font-bold">My incident reports</h2>
                    <p className="mt-1 text-xs text-[var(--app-text-muted)]">
                      Review your submissions, verification results, and Manager
                      feedback. Create new reports from Home.
                    </p>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    {(["ALL", "PENDING", "VERIFIED", "REJECTED"] as const).map(
                      (value) => (
                        <button
                          key={value}
                          onClick={() => setReportStatus(value)}
                          className="w-full whitespace-nowrap rounded-xl border px-3.5 py-2.5 text-xs font-bold"
                          style={{
                            background:
                              reportStatus === value
                                ? "var(--app-primary)"
                                : "var(--app-surface)",
                            color:
                              reportStatus === value
                                ? "white"
                                : "var(--app-text-muted)",
                            borderColor:
                              reportStatus === value
                                ? "var(--app-primary)"
                                : "var(--app-border)",
                          }}
                        >
                          {value === "ALL"
                            ? `All (${reports.length})`
                            : `${reportLabel(value)} (${reports.filter((report) => report.status === value).length})`}
                        </button>
                      ),
                    )}
                  </div>
                </div>
                <ReportRows
                  reports={visibleReports}
                  onSelect={setSelectedReport}
                />
              </section>
            )}
          </div>
        )}
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-30 flex justify-around border-t border-[var(--app-border)] bg-[var(--app-surface)] px-3 py-2 lg:hidden">
        {nav.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className="flex min-w-24 flex-col items-center gap-1 py-1.5 text-[10px] font-semibold"
            style={{
              color:
                tab === id ? "var(--app-primary)" : "var(--app-text-muted)",
            }}
          >
            <Icon size={19} />
            {label}
          </button>
        ))}
      </nav>
      {showIncident && (
        <StaffIncidentModal
          options={options}
          products={products}
          onClose={() => setShowIncident(false)}
          onSaved={() => {
            setShowIncident(false);
            void load();
          }}
        />
      )}
      {selectedReport && (
        <IncidentReportDetailsModal
          report={selectedReport}
          canReview={false}
          onClose={() => setSelectedReport(null)}
        />
      )}
    </div>
  );
}
