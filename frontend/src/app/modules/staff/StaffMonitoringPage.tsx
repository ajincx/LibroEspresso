import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Eye,
  FileWarning,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import {
  Btn,
  C,
  CalendarDateField,
  KPICard,
  Pagination,
  SearchInput,
  SectionHeader,
  Select,
  StatusChip,
  TableCard,
  TableEmptyRow,
  TableLoadingRow,
  TableWrapper,
  TD,
  THead,
  TR,
} from "../../components/ModuleUi";
import { useAuth } from "../../contexts/AuthContext";
import { operationsService } from "../../services/operations.service";
import type {
  IncidentReport,
  IncidentStatus,
  IncidentType,
} from "../../types/operations";
import type { Role } from "../../types/navigation";
import { formatAppDate } from "../../utils/appPreferences";
import { incidentTypeLabel, incidentTypeOptions } from "../../utils/shrinkageTaxonomy";
import { IncidentReportDetailsModal } from "./IncidentReportDetailsModal";
const chips: Record<string, string> = {
  PENDING: "pending_review",
  VERIFIED: "verified",
  REJECTED: "rejected",
};
export function StaffMonitoringPage({
  role,
  scopeBranchId = "ALL",
}: {
  role: Role;
  scopeBranchId?: string;
}) {
  const { user } = useAuth();
  const [incidents, setIncidents] = useState<IncidentReport[]>([]);
  const [date, setDate] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<IncidentStatus | "ALL">("ALL");
  const [type, setType] = useState<IncidentType | "ALL">("ALL");
  const [loading, setLoading] = useState(true);
  const [reviewing, setReviewing] = useState(false);
  const [selected, setSelected] = useState<IncidentReport | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setIncidents(await operationsService.incidents());
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to load incident reports.",
      );
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const branchMatches = useCallback(
    (r: IncidentReport) =>
      role === "manager" ||
      scopeBranchId === "ALL" ||
      r.branchId === scopeBranchId,
    [role, scopeBranchId],
  );
  const query = search.trim().toLowerCase();
  const branchIncidents = useMemo(
    () => incidents.filter(branchMatches),
    [incidents, branchMatches],
  );
  const visible = useMemo(
    () =>
      branchIncidents.filter(
        (r) =>
          (!date || r.occurredAt.slice(0, 10) === date) &&
          (status === "ALL" || r.status === status) &&
          (type === "ALL" || r.incidentType === type) &&
          (!query ||
            `${r.submittedByName} ${r.inventoryItemName} ${r.productName ?? ""} ${r.reason}`
              .toLowerCase()
              .includes(query)),
      ),
    [branchIncidents, date, status, type, query],
  );
  const review = async (next: "VERIFIED" | "REJECTED", comment: string) => {
    if (!selected) return;
    setReviewing(true);
    try {
      const updated = await operationsService.reviewIncident(
        selected.id,
        next,
        comment,
      );
      setSelected(updated);
      setIncidents((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      toast.success(
        next === "VERIFIED"
          ? "Incident report verified"
          : "Incident report rejected",
      );
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : "Unable to review incident.",
      );
    } finally {
      setReviewing(false);
    }
  };
  return (
    <div className="space-y-5 p-4 md:p-6">
      <SectionHeader
        title="Staff Incident Monitoring"
        sub={
          role === "owner"
            ? "Review shrinkage-related staff reports across branches."
            : `Review incident reports for ${user?.branch?.name ?? "your assigned branch"}.`
        }
        actions={
          <Btn variant="outline" icon={RefreshCw} onClick={() => void load()}>
            Refresh
          </Btn>
        }
      />
      {error && (
        <div
          className="rounded-xl border p-4 text-sm"
          style={{ borderColor: C.red, background: C.redBg, color: C.red }}
        >
          {error}
        </div>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KPICard
          label="Total Reports"
          value={String(branchIncidents.length)}
          sub="Shrinkage-related incidents"
          icon={FileWarning}
          color={C.blue}
        />
        <KPICard
          label="Pending Review"
          value={String(
            branchIncidents.filter((r) => r.status === "PENDING").length,
          )}
          sub="Awaiting Manager verification"
          icon={FileWarning}
          color={C.amber}
        />
        <KPICard
          label="Verified"
          value={String(
            branchIncidents.filter((r) => r.status === "VERIFIED").length,
          )}
          sub="Confirmed incident reports"
          icon={CheckCircle2}
          color={C.green}
        />
        <KPICard
          label="Rejected"
          value={String(
            branchIncidents.filter((r) => r.status === "REJECTED").length,
          )}
          sub="Not accepted as evidence"
          icon={XCircle}
          color={C.red}
        />
      </div>
      <TableCard
        title="Incident Log"
        subtitle="Review and verify staff incident reports explaining inventory discrepancies"
        badge={
          <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-[var(--app-primary-faint)] text-[var(--app-primary)]">
            {visible.length} reports
          </span>
        }
        toolbar={
          <>
            <SearchInput
              placeholder="Search staff, product, item, or reason…"
              width={280}
              value={search}
              onChange={setSearch}
            />
            <CalendarDateField
              label="Incident date"
              value={date}
              onChange={setDate}
            />
            <Select
              value={status}
              onChange={(value) => setStatus(value as IncidentStatus | "ALL")}
              options={[
                { value: "ALL", label: "All Statuses" },
                { value: "PENDING", label: "Pending" },
                { value: "VERIFIED", label: "Verified" },
                { value: "REJECTED", label: "Rejected" },
              ]}
            />
            <Select
              value={type}
              onChange={(value) => setType(value as IncidentType | "ALL")}
              options={[
                { value: "ALL", label: "All Classifications" },
              ...incidentTypeOptions,
              ]}
            />
            {(date || status !== "ALL" || type !== "ALL") && (
              <Btn
                variant="outline"
                size="sm"
                onClick={() => {
                  setDate("");
                  setStatus("ALL");
                  setType("ALL");
                }}
              >
                Reset Filters
              </Btn>
            )}
          </>
        }
      >
        <TableWrapper minWidth={960}>
          <THead
            cols={[
              "Reported By",
              "Branch",
              "Incident",
              "Product",
              "Ingredient",
              "Quantity",
              "Occurred",
              "Reason",
              "Status",
              "Action",
            ]}
          />
          <tbody>
            {loading && <TableLoadingRow colSpan={10} label="Loading incident reports…" />}
            {!loading && !visible.length && (
              <TableEmptyRow
                colSpan={10}
                icon={FileWarning}
                title="No incident reports found"
                subtitle="No reports match the current filters."
              />
            )}
            {!loading &&
              visible.map((r) => (
                <TR key={r.id}>
                  <TD>
                    <span className="font-semibold text-[var(--app-text)]">{r.submittedByName}</span>
                  </TD>
                  <TD muted>{r.branchName}</TD>
                  <TD>{incidentTypeLabel(r.incidentType)}</TD>
                  <TD muted>{r.productName ?? "—"}</TD>
                  <TD><span className="font-medium">{r.inventoryItemName}</span></TD>
                  <TD right bold>
                    {r.quantity} {r.unit}
                  </TD>
                  <TD muted className="whitespace-nowrap">{formatAppDate(r.occurredAt, true)}</TD>
                  <TD>
                    <span
                      title={r.reason}
                      className="block max-w-[220px] truncate text-[var(--app-text-muted)]"
                    >
                      {r.reason}
                    </span>
                  </TD>
                  <TD center>
                    <StatusChip status={chips[r.status]} />
                  </TD>
                  <TD center>
                    <Btn
                      variant="outline"
                      size="sm"
                      icon={Eye}
                      onClick={() => setSelected(r)}
                    >
                      View
                    </Btn>
                  </TD>
                </TR>
              ))}
          </tbody>
        </TableWrapper>
        <Pagination total={visible.length} page={1} perPage={Math.max(visible.length, 1)} />
      </TableCard>
      <p className="text-center text-xs text-[var(--app-text-faint)]">
        Incident reports support inventory reconciliation and do not change
        stock until the authorized workflow confirms an adjustment.
      </p>
      {selected && (
        <IncidentReportDetailsModal
          report={selected}
          canReview={role === "manager"}
          reviewing={reviewing}
          onClose={() => setSelected(null)}
          onReview={review}
        />
      )}
    </div>
  );
}
