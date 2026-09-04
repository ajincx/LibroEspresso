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
}

export interface InventoryCountSummary {
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
  unit: string;
  requiresInvestigation: boolean;
  shrinkageReportId: string | null;
}

export type ShrinkageClassification = "SPOILAGE" | "WASTAGE" | "PILFERAGE" | "COUNT_ERROR";
export type ShrinkageStatus = "DETECTED" | "PENDING_REVIEW" | "REVIEWED";

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
  unit: string;
  classification: ShrinkageClassification | null;
  explanation: string | null;
  supportingNotes: string | null;
  status: ShrinkageStatus;
  managerName: string;
  detectedAt: string;
  investigatedAt: string | null;
  submittedAt: string;
  reviewedAt: string | null;
  reviewedByName: string | null;
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
