export interface ExpectedInventoryItem {
  inventoryItemId: string;
  sku: string;
  itemName: string;
  unit: string;
  unitCost: number;
  previousActualQuantity: number;
  stockReceived: number;
  expectedConsumption: number;
  approvedAdjustments: number;
  expectedQuantity: number;
  baselineDate: string;
}

export interface PosImportRecord {
  id: string;
  businessDate: string;
  sourceFilename: string;
  importedAt: string;
  branchId: string;
  branchName: string;
  importedBy: string;
  productLines: number;
  unitsSold: number;
  totalSales: number;
  status: "COMPLETE" | "NEEDS_REVIEW";
  totalRows: number;
  validRows: number;
  warningRows: number;
  invalidRows: number;
  unmatchedRows: number;
  fingerprintIndicator: string | null;
}

export interface PosImportPreviewRow {
  rowNumber: number;
  sourceProduct: string;
  matchedMenuProduct: string | null;
  menuItemId: string | null;
  menuItemVariantId?: string | null;
  matchedVariant?: string | null;
  mappingStatus?: "APPROVED" | "UNMATCHED" | "AMBIGUOUS" | "DIRECT";
  mappingScope?: "GLOBAL" | "BRANCH" | null;
  mappingId?: string | null;
  sourceProductId?: string | null;
  quantitySold: number | null;
  unitPrice: number | null;
  businessDate: string | null;
  transactionId: string | null;
  sourceLineId: string | null;
  transactionTimestamp: string | null;
  sourceFormat?: "CANONICAL_CSV" | "SUMMARY_ITEMS_SOLD_LEGACY_XLS" | "TRANSACTION_SUMMARY_XLSX";
  sourceWorksheet?: string | null;
  sourceRow?: number | null;
  lineAmount?: number | null;
  sourceOrNumber?: string | null;
  sourceTransactionNumber?: string | null;
  transactionStatus?: string | null;
  transactionTimestampRaw?: string | null;
  status: "VALID" | "WARNING" | "INVALID";
  issues: string[];
}

export interface PosImportPreview {
  sourceFilename: string;
  branchId: string;
  branchName: string;
  businessDate: string | null;
  contentHash: string;
  resolutionFingerprint: string;
  posSourceId: string | null;
  posSourceName: string | null;
  fingerprintIndicator: string;
  sourceFormat: "CANONICAL_CSV" | "SUMMARY_ITEMS_SOLD_LEGACY_XLS" | "TRANSACTION_SUMMARY_XLSX";
  formatLabel: string;
  importBlockedReason: string | null;
  rows: PosImportPreviewRow[];
  summary: {
    totalSourceRows: number;
    validRows: number;
    warningRows: number;
    invalidRows: number;
    unmatchedRows: number;
    duplicate: boolean;
    quality: "COMPLETE" | "NEEDS_REVIEW" | "REJECTED";
    canImport: boolean;
  };
}

export interface PosSource {
  id: string;
  sourceCode: string;
  displayName: string;
  supportedFormat: "CANONICAL_CSV" | "SUMMARY_ITEMS_SOLD_LEGACY_XLS" | "TRANSACTION_SUMMARY_XLSX";
  status: "ACTIVE" | "INACTIVE";
}

export interface PosMapping {
  id: string;
  posSourceId: string;
  branchId: string | null;
  sourceProductName: string;
  sourceProductCode: string | null;
  menuItemVariantId: string;
  menuItemId: string;
  menuItemName: string;
  variantName: string;
  status: "ACTIVE" | "INACTIVE";
  reviewedBy: string | null;
  reviewedAt: string | null;
}

export interface PosAnalytics {
  scope: { branchId: string | null; branchName: string; startDate: string; endDate: string };
  summary: {
    sales: number;
    theoreticalCogs: number;
    totalCogs: number;
    detectedShortageValue: number;
    verifiedShrinkageCost: number;
    shrinkageCost: number;
    /** @deprecated Retained temporarily for backward-compatible API responses. */
    shrinkageRate: number;
    adjustedCogs: number;
    grossProfit: number;
    grossMargin: number;
    unitsSold: number;
    importCount: number;
  };
  trends: { date: string; sales: number; cogs: number; grossProfit: number }[];
  products: { id: string; name: string; category: string; unitsSold: number; sales: number; cogs: number }[];
  ingredients: { id: string; name: string; category: string; cost: number }[];
}

export interface InventoryCountSummary {
  canEdit: boolean;
  id: string;
  countNo: string;
  countDate: string;
  submittedAt: string;
  branchId: string;
  branchName: string;
  submittedBy: string;
  itemCount: number;
  varianceCount: number;
}

export interface CountVarianceItem {
  id: string;
  inventoryItemId: string;
  sku: string;
  itemName: string;
  expectedConsumption: number;
  expectedQuantity: number;
  actualQuantity: number;
  varianceQuantity: number;
  varianceValue: number;
  variancePercentage?: number | null;
  unit: string;
  requiresInvestigation: boolean;
  shrinkageReportId: string | null;
}

export type ShrinkageClassification =
  | "SPOILAGE"
  | "WASTAGE"
  | "SPILLAGE"
  | "DAMAGED_ITEM"
  | "PREPARATION_ERROR"
  | "OVERPRODUCTION"
  | "EXPIRATION"
  | "UNAUTHORIZED_CONSUMPTION"
  | "PILFERAGE"
  | "COUNT_ERROR";
export type ShrinkageStatus = "DETECTED" | "VERIFIED" | "PENDING_REVIEW" | "REVIEWED";
export type EvidenceBasis = "LINKED_STAFF_INCIDENT" | "PHYSICAL_COUNT" | "INVENTORY_MOVEMENT" | "SUPPORTING_IMAGE" | "WRITTEN_INVESTIGATION" | "OTHER_OPERATIONAL_RECORD";

export interface ShrinkageReport {
  id: string;
  reportNo: string;
  branchId: string;
  branchName: string;
  inventoryItemId: string;
  inventoryItemName: string;
  sku: string;
  menuItemId: string | null;
  menuItemName: string | null;
  expectedQuantity: number;
  actualQuantity: number;
  varianceQuantity: number;
  varianceValue: number;
  variancePercentage?: number | null;
  unit: string;
  classification: ShrinkageClassification | null;
  explanation: string | null;
  supportingNotes: string | null;
  evidenceReviewConfirmed: boolean;
  evidenceBasis: EvidenceBasis[];
  status: ShrinkageStatus;
  managerName: string;
  detectedAt: string;
  investigatedAt: string | null;
  submittedAt: string;
  reviewedAt: string | null;
  reviewedByName: string | null;
  countDate: string;
}

export interface ShrinkageEvidence {
  incidents: {
    id: string; incidentType: string; quantity: number; occurredAt: string; reason: string;
    notes: string | null; photoUrl: string | null; status: string; managerComment: string | null;
    submittedByName: string; explicitlyLinked: boolean;
  }[];
  movements: { movementType: string; quantity: number; occurredAt: string; referenceNo: string | null; notes: string | null }[];
  usage: { date: string; expectedUsage: number }[];
  aiSuggestion: string | null;
  aiAdvisoryLabel: string;
}

export interface VarianceRecord {
  countItemId: string;
  countNo: string;
  countDate: string;
  branchId: string;
  branchName: string;
  inventoryItemId: string;
  sku: string;
  itemName: string;
  expectedQuantity: number;
  actualQuantity: number;
  varianceQuantity: number;
  varianceValue: number;
  variancePercentage: number | null;
  unit: string;
  anomalyId: string | null;
  reportNo: string | null;
  anomalyStatus: ShrinkageStatus | null;
  classification: ShrinkageClassification | null;
}

export interface WorkflowNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  entityType: string | null;
  entityId: string | null;
  readAt: string | null;
  createdAt: string;
}
