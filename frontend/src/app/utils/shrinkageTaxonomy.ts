import type { IncidentType } from "../types/operations";
import type { EvidenceBasis, ShrinkageClassification } from "../types/inventoryWorkflow";

export const incidentTypeOptions: { value: IncidentType; label: string }[] = [
  { value: "SPOILAGE", label: "Spoilage" },
  { value: "WASTAGE", label: "Wastage" },
  { value: "SPILLAGE", label: "Spillage" },
  { value: "DAMAGED_ITEM", label: "Damaged or Broken Items" },
  { value: "PREPARATION_ERROR", label: "Preparation or Portioning Error" },
  { value: "OVERPRODUCTION", label: "Overproduction" },
  { value: "EXPIRATION", label: "Expiration" },
  { value: "UNAUTHORIZED_CONSUMPTION", label: "Unauthorized Consumption" },
  { value: "OTHER", label: "Other" },
];

export const incidentTypeLabel = (value: string) =>
  incidentTypeOptions.find((option) => option.value === value)?.label ?? value.replaceAll("_", " ");

export const managerClassificationOptions: { value: ShrinkageClassification; label: string; definition: string }[] = [
  { value: "SPOILAGE", label: "Spoilage", definition: "Stock became unusable due to quality deterioration." },
  { value: "WASTAGE", label: "Wastage", definition: "Stock was lost during routine handling or preparation." },
  { value: "SPILLAGE", label: "Spillage", definition: "Stock was accidentally spilled during operations." },
  { value: "DAMAGED_ITEM", label: "Damaged or Broken Items", definition: "Stock was damaged or broken and could not be used." },
  { value: "PREPARATION_ERROR", label: "Preparation or Portioning Error", definition: "Incorrect preparation or portioning caused the loss." },
  { value: "OVERPRODUCTION", label: "Overproduction", definition: "More product was prepared than could be used or sold." },
  { value: "EXPIRATION", label: "Expiration", definition: "Stock passed its usable expiration date." },
  { value: "UNAUTHORIZED_CONSUMPTION", label: "Unauthorized Consumption", definition: "Stock was consumed without an authorized transaction." },
  { value: "PILFERAGE", label: "Verified Pilferage", definition: "Use only after reviewing sufficient evidence and explicitly confirming the finding." },
  { value: "COUNT_ERROR", label: "Count Error", definition: "A verified physical-count or encoding error; this is not shrinkage." },
];

export const classificationLabel = (value: ShrinkageClassification | null) =>
  value ? managerClassificationOptions.find((option) => option.value === value)?.label ?? value.replaceAll("_", " ") : "Unexplained Variance – For Investigation";

export const evidenceBasisOptions: { value: EvidenceBasis; label: string }[] = [
  { value: "LINKED_STAFF_INCIDENT", label: "Linked Staff incident report" },
  { value: "PHYSICAL_COUNT", label: "Physical inventory count" },
  { value: "INVENTORY_MOVEMENT", label: "Inventory movement or adjustment record" },
  { value: "SUPPORTING_IMAGE", label: "Supporting image" },
  { value: "WRITTEN_INVESTIGATION", label: "Written investigation evidence or notes" },
  { value: "OTHER_OPERATIONAL_RECORD", label: "Other traceable operational record" },
];
