import type { ApiSuccess } from "../types/auth";
import type { CountVarianceItem, EvidenceBasis, ExpectedInventoryItem, InventoryCountSummary, PosAnalytics, PosImportPreview, PosImportRecord, ShrinkageClassification, ShrinkageEvidence, ShrinkageReport, VarianceRecord, WorkflowNotification } from "../types/inventoryWorkflow";
import { api } from "./api";

export const inventoryWorkflowService = {
  async expected(countDate: string, branchId?: string) {
    return (await api.get<ApiSuccess<{ branchId: string; countDate: string; items: ExpectedInventoryItem[] }>>("/inventory-counts/expected", { params: { countDate, branchId } })).data.data;
  },
  async submitCount(countDate: string, items: { inventoryItemId: string; actualQuantity: number }[]) {
    return (await api.post<ApiSuccess<{ count: { id: string; countNo: string; branchId: string; countDate: string; items: CountVarianceItem[] } }>>("/inventory-counts", { countDate, items })).data.data.count;
  },
  async updateCount(id: string, countDate: string, items: { inventoryItemId: string; actualQuantity: number }[]) {
    return (await api.patch<ApiSuccess<{ count: { id: string; countNo: string; branchId: string; countDate: string; items: CountVarianceItem[] } }>>(`/inventory-counts/${id}`, { countDate, items })).data.data.count;
  },
  async counts(branchId?: string) {
    return (await api.get<ApiSuccess<{ counts: InventoryCountSummary[] }>>("/inventory-counts", { params: { branchId } })).data.data.counts;
  },
  async count(id: string) {
    return (await api.get<ApiSuccess<{ count: { id: string; countNo: string; countDate: string; canEdit: boolean; items: (CountVarianceItem & ExpectedInventoryItem)[] } }>>("/inventory-counts/" + id)).data.data.count;
  },
  async reports(filters?: { branchId?: string; status?: string; classification?: string; inventoryItemId?: string; incidentType?: string; startDate?: string; endDate?: string }) {
    return (await api.get<ApiSuccess<{ reports: ShrinkageReport[] }>>("/shrinkage-reports", { params: filters })).data.data.reports;
  },
  async variances(filters?: { branchId?: string; countDate?: string }) {
    return (await api.get<ApiSuccess<{ variances: VarianceRecord[] }>>("/inventory-counts/variances", { params: filters })).data.data.variances;
  },
  async evidence(id: string) {
    return (await api.get<ApiSuccess<{ evidence: ShrinkageEvidence }>>(`/shrinkage-reports/${id}/evidence`)).data.data.evidence;
  },
  async submitInvestigation(id: string, input: { menuItemId?: string; classification: ShrinkageClassification; explanation: string; supportingNotes?: string; evidenceReviewConfirmed?: boolean; evidenceBasis?: EvidenceBasis[] }) {
    return (await api.patch<ApiSuccess<{ report: ShrinkageReport }>>(`/shrinkage-reports/${id}/investigation`, input)).data.data.report;
  },
  async reviewReport(id: string) {
    return (await api.post<ApiSuccess<{ report: ShrinkageReport }>>(`/shrinkage-reports/${id}/review`)).data.data.report;
  },
  async previewPosSales(input: { sourceFilename: string; csvText: string }) {
    return (await api.post<ApiSuccess<{ preview: PosImportPreview }>>("/pos-sales/preview", input)).data.data.preview;
  },
  async importPosSales(input: { sourceFilename: string; csvText: string; expectedContentHash: string }) {
    return (await api.post<ApiSuccess<{ importId: string; branchId: string; businessDate: string; rowsImported: number; productsMatched: number; totalQuantitySold: number; totalSales: number; fingerprintIndicator: string; quality: "COMPLETE" | "NEEDS_REVIEW"; consumption: { inventoryItemId: string; sku: string; name: string; unit: string; expectedConsumption: number }[] }>>("/pos-sales/import", input)).data.data;
  },
  async posImports(branchId?: string) {
    return (await api.get<ApiSuccess<{ imports: PosImportRecord[] }>>("/pos-sales", { params: { branchId } })).data.data.imports;
  },
  async posAnalytics(filters?: { branchId?: string; startDate?: string; endDate?: string }) {
    return (await api.get<ApiSuccess<PosAnalytics>>("/pos-sales/analytics", { params: filters })).data.data;
  },
  async notifications() {
    return (await api.get<ApiSuccess<{ notifications: WorkflowNotification[] }>>("/notifications")).data.data.notifications;
  },
  async markNotificationRead(id: string) { await api.patch(`/notifications/${id}/read`); },
  async markAllNotificationsRead() { await api.patch("/notifications/read-all"); },
};
