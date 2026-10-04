import { useCallback, useEffect, useMemo, useState } from "react";
import { Archive, Eye, FileWarning, RefreshCw } from "lucide-react";
import { useSearchParams } from "react-router";
import { toast } from "sonner";
import { operationsService } from "../../services/operations.service";
import type { IncidentReport } from "../../types/operations";
import { IncidentReportDetailsModal } from "../staff/IncidentReportDetailsModal";
import { TableCard, TableWrapper, THead, TR, TD, TableEmptyRow, TableLoadingRow, StatusChip, Btn } from "../../components/ModuleUi";
import { formatAppDate } from "../../utils/appPreferences";
import { incidentTypeLabel } from "../../utils/shrinkageTaxonomy";
import { ControlledActionDialog, type ControlledActionValue } from "../../components/ControlledActionDialog";
import { controlledActionService } from "../../services/controlledAction.service";

const formatDate = (value: string) => formatAppDate(value, true);

export function ShrinkageIncidentReports({ owner, branchId }: { owner: boolean; branchId: string }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [reports, setReports] = useState<IncidentReport[]>([]);
  const [selected, setSelected] = useState<IncidentReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [reviewing, setReviewing] = useState(false);
  const [archiveTarget,setArchiveTarget]=useState<IncidentReport|null>(null);
  const [controlledValue,setControlledValue]=useState<ControlledActionValue>({reason:"",verificationPin:""});
  const [controlledBusy,setControlledBusy]=useState(false);
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
  const archive=async()=>{if(!archiveTarget)return;setControlledBusy(true);try{await controlledActionService.incidentLifecycle(archiveTarget.id,"ARCHIVE",controlledValue);toast.success("Incident report archived");setArchiveTarget(null);setControlledValue({reason:"",verificationPin:""});await load();}catch(error){toast.error(error instanceof Error?error.message:"Unable to archive incident");}finally{setControlledBusy(false);}};
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
                <TD>{(report.items?.length??0)>1?`${report.items!.length} affected items`:report.items?.[0]?.name??report.inventoryItemName}</TD>
                <TD right muted>{(report.items?.length??0)>1?"See details":`${report.items?.[0]?.quantity??report.quantity} ${report.items?.[0]?.unit??report.unit}`}</TD>
                <TD center><StatusChip status={report.status.toLowerCase()} /></TD>
                <TD right>
                  <div className="flex justify-end gap-1">
                  <button
                    type="button"
                    onClick={() => setSelected(report)}
                    className="p-2 rounded-lg hover:bg-[var(--app-surface-muted)] transition-colors text-[var(--app-text-muted)] hover:text-[var(--app-primary)]"
                    title="View incident"
                    aria-label="View incident details"
                  >
                    <Eye size={15} />
                  </button>
                  <button type="button" onClick={()=>{setArchiveTarget(report);setControlledValue({reason:"",verificationPin:""});}} className="p-2 rounded-lg border border-[var(--app-border)] text-[var(--app-danger)]" title="Archive incident" aria-label="Archive incident"><Archive size={15}/></button>
                  </div>
                </TD>
              </TR>
            ))
          )}
        </tbody>
      </TableWrapper>
    </TableCard>
    {archiveTarget&&<ControlledActionDialog title="Archive incident report?" description="The report remains available in audit history and no inventory quantity is changed." confirmLabel="Archive Report" value={controlledValue} busy={controlledBusy} onChange={setControlledValue} onCancel={()=>setArchiveTarget(null)} onConfirm={()=>void archive()}/>}
    {selected && <IncidentReportDetailsModal report={selected} canReview={!owner} reviewing={reviewing} onClose={() => setSelected(null)} onReview={review}/>}
  </>;
}
