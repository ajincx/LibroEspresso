import type { ApiSuccess } from "../types/auth";
import type {
  IncidentItemOption,
  IncidentProductOption,
  IncidentReport,
  IncidentStatus,
  IncidentType,
  InventoryOverviewItem,
  InventoryStockLedger,
  PurchaseOrder,
  PurchaseOrderStatus,
} from "../types/operations";
import { api } from "./api";

export const operationsService = {
  async inventoryOverview(branchId?: string) {
    return (
      await api.get<ApiSuccess<{ items: InventoryOverviewItem[] }>>(
        "/inventory-overview",
        { params: { branchId } },
      )
    ).data.data.items;
  },
  async inventoryStockLedger(inventoryItemId: string, branchId: string) {
    return (
      await api.get<ApiSuccess<{ ledger: InventoryStockLedger }>>(
        `/inventory-overview/${inventoryItemId}/ledger`,
        { params: { branchId } },
      )
    ).data.data.ledger;
  },
  async updateInventorySettings(
    inventoryItemId: string,
    input: {
      branchId: string;
      category: "FAST" | "MEDIUM" | "SLOW";
      reorderLevel: number;
      reorderDays: number;
      reason: string;
    },
  ) {
    return (
      await api.patch<
        ApiSuccess<{
          settings: {
            inventoryItemId: string;
            category: "FAST" | "MEDIUM" | "SLOW";
            reorderLevel: number;
            reorderDays: number;
          };
        }>
      >(`/inventory-overview/${inventoryItemId}/settings`, input)
    ).data.data.settings;
  },
  async incidents(filters?: {
    branchId?: string;
    status?: IncidentStatus;
    incidentType?: IncidentType;
    inventoryItemId?: string;
    shrinkageReportId?: string;
    startDate?: string;
    endDate?: string;
  }) {
    return (
      await api.get<ApiSuccess<{ incidents: IncidentReport[] }>>("/incidents", {
        params: filters,
      })
    ).data.data.incidents;
  },
  async incidentOptions() {
    return (
      await api.get<
        ApiSuccess<{
          items: IncidentItemOption[];
          products: IncidentProductOption[];
        }>
      >("/incidents/options")
    ).data.data;
  },
  async createIncident(input: {
    items?: { inventoryItemId: string; quantity: number }[];
    inventoryItemId?: string;
    quantity?: number;
    productId?: string;
    productVariantId?: string;
    shrinkageReportId?: string;
    incidentType: IncidentType;
    otherIncidentType?: string;
    occurredAt: string;
    reason: string;
    notes?: string;
    photoUrl?: string;
  }) {
    return (
      await api.post<ApiSuccess<{ incident: IncidentReport }>>(
        "/incidents",
        input,
      )
    ).data.data.incident;
  },
  async reviewIncident(
    id: string,
    status: "VERIFIED" | "REJECTED",
    managerComment?: string,
  ) {
    return (
      await api.patch<ApiSuccess<{ incident: IncidentReport }>>(
        `/incidents/${id}/review`,
        { status, managerComment: managerComment?.trim() || undefined },
      )
    ).data.data.incident;
  },
  async linkIncident(id: string, shrinkageReportId: string, incidentReportItemId?: string) {
    return (await api.patch<ApiSuccess<{ incident: IncidentReport }>>(`/incidents/${id}/link`, { shrinkageReportId, incidentReportItemId })).data.data.incident;
  },
  async purchaseOrders(filters?: {
    branchId?: string;
    status?: PurchaseOrderStatus;
  }) {
    return (
      await api.get<ApiSuccess<{ purchaseOrders: PurchaseOrder[] }>>(
        "/purchase-orders",
        { params: filters },
      )
    ).data.data.purchaseOrders;
  },
  async createPurchaseOrder(input: {
    supplierName: string;
    orderDate: string;
    expectedDeliveryDate: string;
    status: "DRAFT" | "ORDERED";
    notes?: string;
    items: {
      inventoryItemId: string;
      quantityOrdered: number;
      unitCost: number;
      purchaseUom: "g" | "kg" | "ml" | "L" | "pc";
      conversionFactor: number;
    }[];
  }) {
    return (
      await api.post<ApiSuccess<{ purchaseOrder: PurchaseOrder }>>(
        "/purchase-orders",
        input,
      )
    ).data.data.purchaseOrder;
  },
  async updatePurchaseOrderStatus(id: string, status: "ORDERED" | "CANCELLED") {
    return (
      await api.patch<ApiSuccess<{ purchaseOrder: PurchaseOrder }>>(
        `/purchase-orders/${id}/status`,
        { status },
      )
    ).data.data.purchaseOrder;
  },
  async receivePurchaseOrder(
    id: string,
    receiptRequestId: string,
    receivedDate: string,
    items: { purchaseOrderItemId: string; quantityReceived: number }[],
  ) {
    return (
      await api.post<ApiSuccess<{ purchaseOrder: PurchaseOrder }>>(
        `/purchase-orders/${id}/receive`,
        { receiptRequestId, receivedDate, items },
      )
    ).data.data.purchaseOrder;
  },
  async authorizePurchaseOrderTestCleanup(id: string, reason: string) {
    return (
      await api.post<ApiSuccess<{ purchaseOrder: PurchaseOrder }>>(
        `/purchase-orders/${id}/authorize-test-cleanup`,
        { reason },
      )
    ).data.data.purchaseOrder;
  },
  async deletePurchaseOrderTestData(id: string, reason: string) {
    return (
      await api.delete<ApiSuccess<{ deletedId: string }>>(`/purchase-orders/${id}`, {
        data: { reason },
      })
    ).data.data;
  },
};
