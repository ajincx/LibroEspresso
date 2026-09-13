import { useCallback, useEffect, useMemo, useState } from "react";
import { Eye, FileWarning, RefreshCw } from "lucide-react";
import { useSearchParams } from "react-router";
import { toast } from "sonner";
import { operationsService } from "../../services/operations.service";
import type { IncidentReport } from "../../types/operations";
import { IncidentReportDetailsModal } from "../staff/IncidentReportDetailsModal";
import { TableCard, TableWrapper, THead, TR, TD, TableEmptyRow, TableLoadingRow, StatusChip, Btn } from "../../components/ModuleUi";
import { formatAppDate } from "../../utils/appPreferences";
import { incidentTypeLabel } from "../../utils/shrinkageTaxonomy";

const formatDate = (value: string) => formatAppDate(value, true);

export function ShrinkageIncidentReports({ owner, branchId }: { owner: boolean; branchId: string }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [reports, setReports] = useState<IncidentReport[]>([]);
  const [selected, setSelected] = useState<IncidentReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [reviewing, setReviewing] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    try { setReports(await operationsService.incidents({ branchId: branchId || undefined })); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Unable to load Staff incident reports."); }
    finally { setLoading(false); }
  }, [branchId]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const incidentId = searchParams.get("incidentId");
    if (!incidentId || !reports.length) return;
    const report = reports.find((item) => item.id === incidentId);
    if (report) setSelected(report);
    const next = new URLSearchParams(searchParams); next.delete("incidentId"); setSearchParams(next, { replace: true });
  }, [reports, searchParams, setSearchParams]);
  const pending = useMemo(() => reports.filter((report) => report.status === "PENDING").length, [reports]);
  const review = async (status: "VERIFIED" | "REJECTED", managerComment: string) => {
    if (!selected) return;
    setReviewing(true);
    try { const updated = await operationsService.reviewIncident(selected.id, status, managerComment); setSelected(updated); setReports((current) => current.map((item) => item.id === updated.id ? updated : item)); toast.success(`Incident report ${status.toLowerCase()}`); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Unable to review incident report."); }
    finally { setReviewing(false); }
  };
  return <>
    <TableCard
      title="Staff Incident Reports"
      subtitle="Digital incident evidence that may explain a detected inventory variance. These reports do not change stock automatically."
      badge={
        pending > 0 ? (
          <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
            {pending} pending review
          </span>
        ) : undefined
      }
      actions={
        <Btn variant="outline" size="sm" icon={RefreshCw} onClick={() => void load()}>
          Refresh
        </Btn>
      }
    >
      <TableWrapper minWidth={800}>
        <THead cols={["Reported", ...(owner ? ["Branch"] : []), "Staff", "Incident", "Item", "Quantity", "Status", "Action"]} />
        <tbody>
          {loading ? (
            <TableLoadingRow colSpan={owner ? 8 : 7} label="Loading Staff incident reports…" />
          ) : reports.length === 0 ? (
            <TableEmptyRow colSpan={owner ? 8 : 7} icon={FileWarning} title="No Staff incident reports" subtitle="Submitted Staff reports will appear here." />
          ) : (
            reports.map((report) => (
              <TR key={report.id}>
                <TD muted>{formatDate(report.occurredAt)}</TD>
                {owner && <TD muted><span className="font-medium text-[var(--app-text)]">{report.branchName}</span></TD>}
                <TD><span className="font-semibold text-[var(--app-text)]">{report.submittedByName}</span></TD>
              <TD>{incidentTypeLabel(report.incidentType)}{report.incidentType === "OTHER" && report.otherIncidentType ? <span className="block text-xs text-[var(--app-text-muted)]">{report.otherIncidentType}</span> : null}</TD>
                <TD>{report.inventoryItemName}</TD>
                <TD right muted>{report.quantity} {report.unit}</TD>
                <TD center><StatusChip status={report.status.toLowerCase()} /></TD>
                <TD right>
                  <button
                    type="button"
                    onClick={() => setSelected(report)}
                    className="p-2 rounded-lg hover:bg-[var(--app-surface-muted)] transition-colors text-[var(--app-text-muted)] hover:text-[var(--app-primary)]"
                    title="View incident"
                    aria-label="View incident details"
                  >
                    <Eye size={15} />
                  </button>
                </TD>
              </TR>
            ))
          )}
        </tbody>
      </TableWrapper>
    </TableCard>
    {selected && <IncidentReportDetailsModal report={selected} canReview={!owner} reviewing={reviewing} onClose={() => setSelected(null)} onReview={review}/>}
  </>;
}
