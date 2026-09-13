import { useState } from "react";
import { Check, ExternalLink, FileImage, ShieldCheck, X } from "lucide-react";
import type { IncidentReport } from "../../types/operations";
import { formatAppDate } from "../../utils/appPreferences";
import { incidentTypeLabel } from "../../utils/shrinkageTaxonomy";
const formatDate = (value: string | null) => value ? formatAppDate(value, true) : "Not available";
const fieldClass =
  "mt-1.5 min-h-11 w-full rounded-xl border border-[var(--app-border)] bg-[var(--app-surface-muted)] px-3.5 py-2.5 text-sm text-[var(--app-text)]";

function ReadOnlyField({
  label,
  value,
  wide = false,
}: {
  label: string;
  value: string;
  wide?: boolean;
}) {
  return (
    <label
      className={`block min-w-0 text-xs font-semibold text-[var(--app-text-muted)] ${wide ? "sm:col-span-2" : ""}`}
    >
      <span>{label}</span>
      <div className={fieldClass}>{value}</div>
    </label>
  );
}

export function IncidentReportDetailsModal({
  report,
  canReview,
  reviewing,
  onClose,
  onReview,
}: {
  report: IncidentReport;
  canReview: boolean;
  reviewing?: boolean;
  onClose: () => void;
  onReview?: (status: "VERIFIED" | "REJECTED", managerComment: string) => void;
}) {
  const [managerComment, setManagerComment] = useState(
    report.managerComment ?? "",
  );
  const pendingReview = canReview && report.status === "PENDING";
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/55">
      <div role="dialog" aria-modal="true" aria-labelledby="incident-details-title" className="w-full sm:max-w-2xl max-h-[95vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl border border-[var(--app-border)] bg-[var(--app-surface)] p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4 pb-5 border-b border-[var(--app-border)]">
          <div>
            <p className="text-xs font-bold tracking-[.14em] text-[var(--app-primary)]">
              INCIDENT REPORT DETAILS
            </p>
            <h2 id="incident-details-title" className="text-xl font-bold mt-1">
              {incidentTypeLabel(report.incidentType)}
            </h2>
            <p className="text-xs mt-1 text-[var(--app-text-muted)]">
              Submitted {formatDate(report.createdAt)}
            </p>
          </div>
          <button
            autoFocus
            onClick={onClose}
            className="w-9 h-9 shrink-0 rounded-xl bg-[var(--app-surface-muted)] flex items-center justify-center"
            aria-label="Close report details"
          >
            <X size={16} />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-5">
          <ReadOnlyField label="Submitted By" value={report.submittedByName} />
          <ReadOnlyField
            label="User Role"
            value={report.submittedByRole.replaceAll("_", " ")}
          />
          <ReadOnlyField label="Assigned Branch" value={report.branchName} />
          <ReadOnlyField label="Report Status" value={report.status} />
          <ReadOnlyField
            label="Incident Type"
            value={incidentTypeLabel(report.incidentType)}
          />
          {report.incidentType === "OTHER" && (
            <ReadOnlyField
              label="Specified Incident Type"
              value={report.otherIncidentType?.trim() || "Not specified in this legacy report"}
            />
          )}
          <ReadOnlyField
            label="Date and Time of Incident"
            value={formatDate(report.occurredAt)}
          />
          <ReadOnlyField
            label="Related Product"
            value={
              report.productName
                ? `${report.productName}${report.productCode ? ` (${report.productCode})` : ""}`
                : "Not related to a specific product"
            }
          />
          <ReadOnlyField
            label="Inventory Item"
            value={report.inventoryItemName}
          />
          <ReadOnlyField label="SKU" value={report.sku} />
          <ReadOnlyField
            label="Quantity Affected"
            value={`${report.quantity} ${report.unit}`}
          />
          <ReadOnlyField
            label="Linked Variance Case"
            value={report.shrinkageReportNo ?? "Not yet matched"}
          />
          <label className="block sm:col-span-2 text-xs font-semibold text-[var(--app-text-muted)]">
            <span>Reason / Incident Description</span>
            <div className={`${fieldClass} min-h-24 whitespace-pre-wrap`}>
              {report.reason}
            </div>
          </label>
          <label className="block sm:col-span-2 text-xs font-semibold text-[var(--app-text-muted)]">
            <span>Additional Notes</span>
            <div className={`${fieldClass} min-h-16 whitespace-pre-wrap`}>
              {report.notes?.trim() || "No additional notes provided."}
            </div>
          </label>
          <ReadOnlyField
            label="Reviewed By"
            value={report.verifiedByName ?? "Awaiting Manager verification"}
          />
          <ReadOnlyField
            label="Reviewed At"
            value={formatDate(report.verifiedAt)}
          />
          {pendingReview ? (
            <label className="block sm:col-span-2 text-xs font-semibold text-[var(--app-text-muted)]">
              <span>
                Manager Comment <span className="font-normal">(optional)</span>
              </span>
              <textarea
                value={managerComment}
                onChange={(event) => setManagerComment(event.target.value)}
                maxLength={2000}
                rows={4}
                placeholder="Add a clarification, instruction, or follow-up for the Staff member…"
                className="mt-1.5 w-full rounded-xl border border-[var(--app-border)] bg-[var(--app-surface-elevated)] px-3.5 py-3 text-sm text-[var(--app-text)] outline-none resize-y focus:border-[var(--app-primary)] focus:ring-4 focus:ring-[var(--app-primary-faint)]"
              />
              <span className="block mt-1 text-right font-normal text-[var(--app-text-faint)]">
                {managerComment.length}/2000
              </span>
            </label>
          ) : (
            <ReadOnlyField
              label="Manager Comment"
              value={report.managerComment?.trim() || "No comment provided."}
              wide
            />
          )}
        </div>

        <div className="mt-5">
          <p className="text-xs font-semibold text-[var(--app-text-muted)]">
            Photo Evidence
          </p>
          {report.photoUrl ? (
            <a
              href={report.photoUrl}
              target="_blank"
              rel="noreferrer"
              className="block mt-2 group"
            >
              <img
                src={report.photoUrl}
                alt="Incident evidence"
                className="w-full max-h-72 object-contain rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface-muted)]"
              />
              <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[var(--app-primary)]">
                Open full image <ExternalLink size={12} />
              </span>
            </a>
          ) : (
            <div
              className={`${fieldClass} flex items-center gap-2 text-[var(--app-text-faint)]`}
            >
              <FileImage size={16} />
              No photo evidence attached.
            </div>
          )}
        </div>

        <div className="mt-5 flex gap-3 rounded-xl p-3 bg-[var(--app-primary-subtle)]">
          <ShieldCheck
            size={18}
            className="shrink-0 text-[var(--app-primary)]"
          />
          <p className="text-xs leading-relaxed text-[var(--app-text-muted)]">
            This report is supporting evidence for inventory reconciliation.
            Reviewing it does not automatically deduct inventory or confirm a
            variance classification.
          </p>
        </div>

        <div className="mt-6 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <button
            onClick={onClose}
            className="h-11 px-5 rounded-xl border border-[var(--app-border)] text-sm font-semibold"
          >
            Close
          </button>
          {pendingReview && (
            <>
              <button
                disabled={reviewing}
                onClick={() => onReview?.("REJECTED", managerComment)}
                className="h-11 px-5 rounded-xl border border-[var(--app-danger)] text-[var(--app-danger)] text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <X size={15} />
                Reject Report
              </button>
              <button
                disabled={reviewing}
                onClick={() => onReview?.("VERIFIED", managerComment)}
                className="h-11 px-5 rounded-xl bg-[var(--app-primary)] text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Check size={15} />
                {reviewing ? "Saving…" : "Verify Report"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
