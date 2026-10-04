export type InventoryHealthStatus =
  | "HEALTHY"
  | "LOW_STOCK"
  | "CRITICAL"
  | "OUT_OF_STOCK";

export interface InventoryOverviewItem {
  branchId: string;
  branchName: string;
  inventoryItemId: string;
  sku: string;
  name: string;
  category: string;
  unit: string;
  unitCost: number;
  reorderLevel: number;
  reorderDays: number;
  reorderCategory?: "FAST" | "MEDIUM" | "SLOW";
  lastActualQuantity: number;
  lastCountAt: string | null;
  systemStock: number;
  inventoryValue: number;
  status: InventoryHealthStatus;
}

export type InventoryLedgerActivityType =
  | "STARTING_STOCK"
  | "BALANCE_BASELINE"
  | "POS_CONSUMPTION"
  | "RECEIPT"
  | "APPROVED_INCREASE"
  | "APPROVED_DECREASE"
  | "PHYSICAL_COUNT";

export interface InventoryLedgerActivity {
  id: string;
  occurredAt: string;
  activityType: InventoryLedgerActivityType;
  reference: string;
  quantity: number;
  quantityChange: number | null;
  runningBalance: number;
}

export interface InventoryStockLedger {
  branchId: string;
  branchName: string;
  inventoryItemId: string;
  sku: string;
  name: string;
  unit: string;
  startingStock: number | null;
  operationalPosConsumption: number;
  calculatedBalance: number;
  currentExpectedStock: number;
  activities: InventoryLedgerActivity[];
}

export type IncidentType =
  | "SPOILAGE"
  | "WASTAGE"
  | "SPILLAGE"
  | "DAMAGED_ITEM"
  | "PREPARATION_ERROR"
  | "OVERPRODUCTION"
  | "EXPIRATION"
  | "UNAUTHORIZED_CONSUMPTION"
  | "OTHER";
export type IncidentStatus = "PENDING" | "VERIFIED" | "REJECTED";
export interface IncidentAffectedItem { id: string; inventoryItemId: string; sku: string; name: string; quantity: number; unit: string; }
export interface IncidentShrinkageLink { id: string; incidentReportItemId: string; shrinkageReportId: string; shrinkageReportNo: string; }

export interface IncidentReport {
  id: string;
  branchId: string;
  branchName: string;
  inventoryItemId: string;
  inventoryItemName: string;
  sku: string;
  unit: string;
  productId: string | null;
  productCode: string | null;
  productName: string | null;
  productVariantId?: string | null;
  productVariantName?: string | null;
  shrinkageReportId: string | null;
  shrinkageReportNo: string | null;
  incidentType: IncidentType;
  otherIncidentType?: string | null;
  quantity: number;
  occurredAt: string;
  reason: string;
  notes: string | null;
  photoUrl: string | null;
  status: IncidentStatus;
  submittedByUserId: string;
  submittedByName: string;
  submittedByRole: string;
  verifiedByUserId: string | null;
  verifiedByName: string | null;
  verifiedAt: string | null;
  managerComment: string | null;
  createdAt: string;
  items?: IncidentAffectedItem[];
  shrinkageLinks?: IncidentShrinkageLink[];
}

export type PurchaseOrderStatus =
  | "DRAFT"
  | "ORDERED"
  | "PARTIALLY_RECEIVED"
  | "RECEIVED"
  | "CANCELLED";

export interface PurchaseOrderItem {
  id: string;
  inventoryItemId: string;
  sku: string;
  name: string;
  unit: string;
  quantityOrdered: number;
  quantityReceived: number;
  unitCost: number;
  purchaseUom: string;
  conversionFactor: number;
  latestPhysicalCountDate: string | null;
}

export interface PurchaseOrder {
  id: string;
  poNo: string;
  branchId: string;
  branchName: string;
  createdByUserId: string;
  createdByName: string;
  supplierName: string;
  orderDate: string;
  expectedDeliveryDate: string;
  receivedDate: string | null;
  status: PurchaseOrderStatus;
  notes: string | null;
  isTestData: boolean;
  testAuthorizedAt: string | null;
  createdAt: string;
  updatedAt: string;
  itemCount: number;
  totalAmount: number;
  items: PurchaseOrderItem[];
}

export interface IncidentItemOption {
  inventoryItemId: string;
  sku: string;
  name: string;
  unit: string;
}

export interface IncidentProductOption {
  productId: string;
  code: string;
  name: string;
  variantId: string;
  variantName: string;
  ingredientIds: string[];
}
