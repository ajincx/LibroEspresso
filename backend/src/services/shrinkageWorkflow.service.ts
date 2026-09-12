export const STAFF_INCIDENT_TYPES = [
  "SPOILAGE",
  "WASTAGE",
  "SPILLAGE",
  "DAMAGED_ITEM",
  "PREPARATION_ERROR",
  "OVERPRODUCTION",
  "EXPIRATION",
  "UNAUTHORIZED_CONSUMPTION",
  "OTHER",
] as const;

export type StaffIncidentType = (typeof STAFF_INCIDENT_TYPES)[number];

// PILFERAGE is retained as the persisted value for historical compatibility.
// The application always presents it to users as "Verified Pilferage".
export const VERIFIED_SHRINKAGE_CLASSIFICATIONS = [
  "SPOILAGE",
  "WASTAGE",
  "SPILLAGE",
  "DAMAGED_ITEM",
  "PREPARATION_ERROR",
  "OVERPRODUCTION",
  "EXPIRATION",
  "UNAUTHORIZED_CONSUMPTION",
  "PILFERAGE",
] as const;

export const MANAGER_CLASSIFICATIONS = [
  ...VERIFIED_SHRINKAGE_CLASSIFICATIONS,
  "COUNT_ERROR",
] as const;

export type ManagerClassification = (typeof MANAGER_CLASSIFICATIONS)[number];

export const EVIDENCE_BASES = [
  "LINKED_STAFF_INCIDENT",
  "PHYSICAL_COUNT",
  "INVENTORY_MOVEMENT",
  "SUPPORTING_IMAGE",
  "WRITTEN_INVESTIGATION",
  "OTHER_OPERATIONAL_RECORD",
] as const;

export type EvidenceBasis = (typeof EVIDENCE_BASES)[number];

export const VERIFIED_SHRINKAGE_CLASSIFICATIONS_SQL =
  VERIFIED_SHRINKAGE_CLASSIFICATIONS.map((value) => `'${value}'`).join(", ");

export function isVerifiedShrinkageClassification(
  value: string | null,
): value is (typeof VERIFIED_SHRINKAGE_CLASSIFICATIONS)[number] {
  return VERIFIED_SHRINKAGE_CLASSIFICATIONS.some((item) => item === value);
}

export function requiresPilferageSafeguard(value: ManagerClassification) {
  return value === "PILFERAGE";
}

export function validatePilferageSafeguard(input: {
  classification: ManagerClassification;
  explanation: string;
  evidenceReviewConfirmed?: boolean;
  evidenceBasis?: readonly EvidenceBasis[];
}) {
  if (!requiresPilferageSafeguard(input.classification)) return true;
  return (
    input.explanation.trim().length >= 20 &&
    input.evidenceReviewConfirmed === true &&
    (input.evidenceBasis?.length ?? 0) > 0
  );
}
