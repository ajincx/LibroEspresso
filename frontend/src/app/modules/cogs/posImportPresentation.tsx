import type { PosImportPreview, PosImportRecord } from "../../types/inventoryWorkflow";

export const UNCONFIGURED_POS_LAYOUT_MESSAGE =
  "This workbook uses an unconfigured column layout. Configure its spreadsheet columns for this POS source, then preview it again.";

const MAPPING_RECOVERY_ERROR_CODES = new Set([
  "UNSUPPORTED_POS_FORMAT",
  "POS_FIELD_MAPPING_REQUIRED",
]);

export function requiresPosMappingRecovery(error: unknown) {
  const code = (error as { response?: { data?: { error?: { code?: unknown } } } })
    ?.response?.data?.error?.code;
  return typeof code === "string" && MAPPING_RECOVERY_ERROR_CODES.has(code);
}

export function excludedInvalidRowCount(
  record: Pick<PosImportRecord, "invalidRows">,
) {
  return record.invalidRows;
}

export function deduplicatePosValidationIssues(
  issues: PosImportPreview["validationIssues"] | null | undefined,
) {
  const seen = new Set<string>();
  return (issues ?? []).filter((issue) => {
    const key = JSON.stringify([issue.rowNumber, issue.field, issue.issue]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function PosMappingRecoveryNotice({
  onConfigure,
  message = UNCONFIGURED_POS_LAYOUT_MESSAGE,
  actionLabel = "Configure Mapping",
}: {
  onConfigure: () => void;
  message?: string;
  actionLabel?: string;
}) {
  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
      <p>{message}</p>
      <button
        type="button"
        className="mt-3 rounded-lg border border-amber-500 bg-white px-3 py-2 font-semibold text-amber-950"
        onClick={onConfigure}
      >
        {actionLabel}
      </button>
    </div>
  );
}
