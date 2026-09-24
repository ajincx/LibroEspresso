import type { ApiSuccess } from "../types/auth";
import type { CountVarianceItem, EvidenceBasis, ExpectedInventoryItem, InventoryCountSummary, PosAnalytics, PosImportPreview, PosImportRecord, PosMapping, PosSource, ShrinkageClassification, ShrinkageEvidence, ShrinkageReport, VarianceRecord, WorkflowNotification } from "../types/inventoryWorkflow";
import { api } from "./api";

type PosPreviewSource =
  | { sourceFilename: string; csvText: string; file?: never; posSourceId?: string }
  | { sourceFilename: string; file: File; csvText?: never; posSourceId?: string };
type PosImportSource = PosPreviewSource & { expectedContentHash: string; expectedResolutionFingerprint?: string };

function excelHeaders(sourceFilename: string, posSourceId?: string, expectedContentHash?: string, expectedResolutionFingerprint?: string) {
  return {
    "Content-Type": "application/octet-stream",
    "X-POS-Filename": encodeURIComponent(sourceFilename),
    ...(posSourceId ? { "X-POS-Source-Id": posSourceId } : {}),
    ...(expectedContentHash ? { "X-POS-Content-Hash": expectedContentHash } : {}),
    ...(expectedResolutionFingerprint ? { "X-POS-Resolution-Fingerprint": expectedResolutionFingerprint } : {}),
  };
}

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
  async previewPosSales(input: PosPreviewSource) {
    const response = input.file
      ? await api.post<ApiSuccess<{ preview: PosImportPreview }>>("/pos-sales/preview", input.file, { headers: excelHeaders(input.sourceFilename,input.posSourceId) })
      : await api.post<ApiSuccess<{ preview: PosImportPreview }>>("/pos-sales/preview", { sourceFilename: input.sourceFilename, csvText: input.csvText, ...(input.posSourceId ? { posSourceId: input.posSourceId } : {}) });
    return response.data.data.preview;
  },
  async importPosSales(input: PosImportSource) {
    const response = input.file
      ? await api.post<ApiSuccess<{ importId: string; branchId: string; businessDate: string; rowsImported: number; productsMatched: number; totalQuantitySold: number; totalSales: number; fingerprintIndicator: string; quality: "COMPLETE" | "NEEDS_REVIEW"; consumption: { inventoryItemId: string; sku: string; name: string; unit: string; expectedConsumption: number }[] }>>("/pos-sales/import", input.file, { headers: excelHeaders(input.sourceFilename,input.posSourceId,input.expectedContentHash,input.expectedResolutionFingerprint) })
      : await api.post<ApiSuccess<{ importId: string; branchId: string; businessDate: string; rowsImported: number; productsMatched: number; totalQuantitySold: number; totalSales: number; fingerprintIndicator: string; quality: "COMPLETE" | "NEEDS_REVIEW"; consumption: { inventoryItemId: string; sku: string; name: string; unit: string; expectedConsumption: number }[] }>>("/pos-sales/import", { sourceFilename: input.sourceFilename, csvText: input.csvText, expectedContentHash: input.expectedContentHash, ...(input.expectedResolutionFingerprint ? { expectedResolutionFingerprint: input.expectedResolutionFingerprint } : {}), ...(input.posSourceId ? { posSourceId: input.posSourceId } : {}) });
    return response.data.data;
  },
  async posSources() {
    return (await api.get<ApiSuccess<{ sources: PosSource[] }>>("/pos-sales/sources")).data.data.sources;
  },
  async createPosSource(input: { sourceCode: string; displayName: string; supportedFormat: PosSource["supportedFormat"]; status?: PosSource["status"] }) {
    return (await api.post<ApiSuccess<{ source: PosSource }>>("/pos-sales/sources", input)).data.data.source;
  },
  async updatePosSource(id: string, input: Partial<Omit<PosSource,"id">>) {
    return (await api.patch<ApiSuccess<{ source: PosSource }>>(`/pos-sales/sources/${id}`, input)).data.data.source;
  },
  async posMappings(posSourceId: string) {
    return (await api.get<ApiSuccess<{ mappings: PosMapping[] }>>("/pos-sales/mappings", { params: { posSourceId } })).data.data.mappings;
  },
  async createPosMapping(input: { posSourceId: string; branchId: string | null; sourceProductName: string; sourceProductCode: string | null; menuItemVariantId: string; status?: "ACTIVE" | "INACTIVE" }) {
    return (await api.post<ApiSuccess<{ id: string }>>("/pos-sales/mappings", input)).data.data;
  },
  async updatePosMapping(id: string, status: "ACTIVE" | "INACTIVE") {
    return (await api.patch<ApiSuccess<{ id: string; status: string }>>(`/pos-sales/mappings/${id}`, { status })).data.data;
  },
  async posImports(filters?: { branchId?: string; search?: string; page?: number; pageSize?: number }) {
    return (await api.get<ApiSuccess<{ imports: PosImportRecord[]; pagination: { page:number;pageSize:number;total:number;totalPages:number } }>>("/pos-sales", { params: filters })).data.data;
  },
  async deletePosImport(id:string) {
    return (await api.delete<ApiSuccess<{ id:string;deleted:true }>>(`/pos-sales/${id}`)).data.data;
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
