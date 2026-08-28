import type { ApiSuccess } from "../types/auth";
import type { CountVarianceItem, ExpectedInventoryItem, PosImportRecord, ShrinkageClassification, ShrinkageReport, VarianceRecord, WorkflowNotification } from "../types/inventoryWorkflow";
import { api } from "./api";

export const inventoryWorkflowService = {
  async expected(countDate: string, branchId?: string) {
    return (await api.get<ApiSuccess<{ branchId: string; countDate: string; items: ExpectedInventoryItem[] }>>("/inventory-counts/expected", { params: { countDate, branchId } })).data.data;
  },
  async submitCount(countDate: string, items: { inventoryItemId: string; actualQuantity: number }[]) {
    return (await api.post<ApiSuccess<{ count: { id: string; countNo: string; branchId: string; countDate: string; items: CountVarianceItem[] } }>>("/inventory-counts", { countDate, items })).data.data.count;
  },
  async reports(filters?: { branchId?: string; status?: string; classification?: string }) {
    return (await api.get<ApiSuccess<{ reports: ShrinkageReport[] }>>("/shrinkage-reports", { params: filters })).data.data.reports;
  },
  async variances(filters?: { branchId?: string; countDate?: string }) {
    return (await api.get<ApiSuccess<{ variances: VarianceRecord[] }>>("/inventory-counts/variances", { params: filters })).data.data.variances;
  },
  async submitInvestigation(id: string, input: { menuItemId?: string; classification: ShrinkageClassification; explanation: string; supportingNotes?: string }) {
    return (await api.patch<ApiSuccess<{ report: ShrinkageReport }>>(`/shrinkage-reports/${id}/investigation`, input)).data.data.report;
  },
  async reviewReport(id: string) {
    return (await api.post<ApiSuccess<{ report: ShrinkageReport }>>(`/shrinkage-reports/${id}/review`)).data.data.report;
  },
  async importPosSales(input: { businessDate: string; sourceFilename: string; items: { menuItemId: string; quantitySold: number }[] }) {
    return (await api.post<ApiSuccess<{ importId: string; consumption: { inventoryItemId: string; sku: string; name: string; unit: string; expectedConsumption: number }[] }>>("/pos-sales/import", input)).data.data;
  },
  async posImports(branchId?: string) {
    return (await api.get<ApiSuccess<{ imports: PosImportRecord[] }>>("/pos-sales", { params: { branchId } })).data.data.imports;
  },
  async notifications() {
    return (await api.get<ApiSuccess<{ notifications: WorkflowNotification[] }>>("/notifications")).data.data.notifications;
  },
  async markNotificationRead(id: string) { await api.patch(`/notifications/${id}/read`); },
};
