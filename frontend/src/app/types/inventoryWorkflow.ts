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
  requiresShrinkageReport: boolean;
}

export type ShrinkageClassification = "SPOILAGE" | "WASTAGE" | "PILFERAGE" | "COUNT_ERROR";
export type ShrinkageStatus = "PENDING_REVIEW" | "REVIEWED";

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
  classification: ShrinkageClassification;
  explanation: string;
  supportingNotes: string | null;
  status: ShrinkageStatus;
  managerName: string;
  submittedAt: string;
  reviewedAt: string | null;
  reviewedByName: string | null;
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
