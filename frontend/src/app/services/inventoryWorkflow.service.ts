import type { ApiSuccess } from "../types/auth";
import type { CountVarianceItem, DailyPosUploadStatus, EvidenceBasis, ExpectedInventoryItem, InventoryCountSummary, OpeningInventoryBaseline, PosAnalytics, PosImportPreview, PosImportReconciliation, PosImportRecord, PosInventoryDateAssessment, PosMapping, PosMappingReviewStatus, PosSource, ShrinkageAiAnalysisResult, ShrinkageClassification, ShrinkageEvidence, ShrinkageReport, UnavailableInventoryCountItem, VarianceRecord, WorkflowNotification } from "../types/inventoryWorkflow";
import { api } from "./api";

type PosPreviewSource =
  | { sourceFilename: string; csvText: string; file?: never; posSourceId: string }
  | { sourceFilename: string; file: File; csvText?: never; posSourceId: string };
type PosImportSource = PosPreviewSource & { expectedContentHash: string; expectedResolutionFingerprint: string };

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
    return (await api.get<ApiSuccess<{ branchId: string; countDate: string; items: ExpectedInventoryItem[]; unavailableItems: UnavailableInventoryCountItem[] }>>("/inventory-counts/expected", { params: { countDate, branchId } })).data.data;
  },
  async submitCount(countDate: string, items: { inventoryItemId: string; quantity: number; enteredUnit: "g" | "kg" | "ml" | "L" | "pc" }[]) {
    return (await api.post<ApiSuccess<{ count: { id: string; countNo: string; branchId: string; countDate: string; items: CountVarianceItem[] } }>>("/inventory-counts", { countDate, items })).data.data.count;
  },
  async updateCount(id: string, countDate: string, items: { inventoryItemId: string; quantity: number; enteredUnit: "g" | "kg" | "ml" | "L" | "pc" }[]) {
    return (await api.patch<ApiSuccess<{ count: { id: string; countNo: string; branchId: string; countDate: string; items: CountVarianceItem[] } }>>(`/inventory-counts/${id}`, { countDate, items })).data.data.count;
  },
  async counts(branchId?: string) {
    return (await api.get<ApiSuccess<{ counts: InventoryCountSummary[]; uatTestControlsEnabled: boolean }>>("/inventory-counts", { params: { branchId } })).data.data;
  },
  async count(id: string) {
    return (await api.get<ApiSuccess<{ count: { id: string; countNo: string; countDate: string; canEdit: boolean; items: (CountVarianceItem & ExpectedInventoryItem)[] } }>>("/inventory-counts/" + id)).data.data.count;
  },
  async uatCounts(branchId?: string) {
    return (await api.get<ApiSuccess<{ counts: InventoryCountSummary[] }>>("/inventory-counts/uat-history", { params: { branchId } })).data.data.counts;
  },
  async uatCount(id: string) {
    return (await api.get<ApiSuccess<{ count: { id: string; countNo: string; countDate: string; branchId: string; branchName: string; canEdit: false; isTestData: true; items: (CountVarianceItem & ExpectedInventoryItem)[] } }>>(`/inventory-counts/uat-history/${id}`)).data.data.count;
  },
  async classifyCountAsUatTest(id: string, input: { reason: string; verificationPin: string }) {
    return (await api.post<ApiSuccess<{ id: string; countNo: string; classified: true; balanceRowsClassified: number; shrinkageReportNo: string }>>(`/inventory-counts/${id}/classify-uat-test`, { ...input, confirmed: true })).data.data;
  },
  async openingBaselines(branchId?: string) {
    return (await api.get<ApiSuccess<{ baselines: OpeningInventoryBaseline[] }>>("/inventory-opening-baselines", { params: { branchId } })).data.data.baselines;
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
  async shrinkageAiAnalysis(id: string) {
    return (await api.get<ApiSuccess<ShrinkageAiAnalysisResult>>(`/shrinkage-reports/${id}/ai-analysis`)).data.data;
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
      : await api.post<ApiSuccess<{ preview: PosImportPreview }>>("/pos-sales/preview", { sourceFilename: input.sourceFilename, csvText: input.csvText, posSourceId: input.posSourceId });
    return response.data.data.preview;
  },
  async importPosSales(input: PosImportSource) {
    const response = input.file
      ? await api.post<ApiSuccess<{ importId: string; branchId: string; businessDate: string; rowsImported: number; productsMatched: number; totalQuantitySold: number; totalSales: number; fingerprintIndicator: string; quality: "COMPLETE" | "NEEDS_REVIEW"; pricing: PosImportPreview["pricing"]; reconciliation:PosImportReconciliation; inventoryDateAssessment:PosInventoryDateAssessment; consumption: { inventoryItemId: string; sku: string; name: string; unit: string; expectedConsumption: number }[] }>>("/pos-sales/import", input.file, { headers: excelHeaders(input.sourceFilename,input.posSourceId,input.expectedContentHash,input.expectedResolutionFingerprint) })
      : await api.post<ApiSuccess<{ importId: string; branchId: string; businessDate: string; rowsImported: number; productsMatched: number; totalQuantitySold: number; totalSales: number; fingerprintIndicator: string; quality: "COMPLETE" | "NEEDS_REVIEW"; pricing: PosImportPreview["pricing"]; reconciliation:PosImportReconciliation; inventoryDateAssessment:PosInventoryDateAssessment; consumption: { inventoryItemId: string; sku: string; name: string; unit: string; expectedConsumption: number }[] }>>("/pos-sales/import", { sourceFilename: input.sourceFilename, csvText: input.csvText, expectedContentHash: input.expectedContentHash, expectedResolutionFingerprint: input.expectedResolutionFingerprint, posSourceId: input.posSourceId });
    return response.data.data;
  },
  async posSources() {
    return (await api.get<ApiSuccess<{ sources: PosSource[] }>>("/pos-sales/sources")).data.data.sources;
  },
  async createPosSource(input: { sourceCode: string; displayName: string; supportedFormat: PosSource["supportedFormat"]; branchId: string; status?: PosSource["status"] }) {
    return (await api.post<ApiSuccess<{ source: PosSource }>>("/pos-sales/sources", input)).data.data.source;
  },
  async updatePosSource(id: string, input: Partial<Pick<PosSource,"sourceCode"|"displayName"|"supportedFormat"|"branchId"|"status">> & { confirmedSupportedFormat?: PosSource["supportedFormat"] }) {
    return (await api.patch<ApiSuccess<{ source: PosSource }>>(`/pos-sales/sources/${id}`, input)).data.data.source;
  },
  async deletePosSource(id: string, input: { reason: string; verificationPin: string }) {
    return (await api.delete<ApiSuccess<{ id: string; action: string }>>(`/pos-sales/sources/${id}`, { data: input })).data.data;
  },
  async posMappings(posSourceId: string, reviewStatus?: PosMappingReviewStatus) {
    return (await api.get<ApiSuccess<{ mappings: PosMapping[] }>>("/pos-sales/mappings", { params: { posSourceId, reviewStatus } })).data.data.mappings;
  },
  async createPosMapping(input: { posSourceId: string; branchId: string | null; sourceProductName: string; sourceProductCode: string | null; menuItemVariantId: string; status?: "ACTIVE" | "INACTIVE" }) {
    return (await api.post<ApiSuccess<{ id: string }>>("/pos-sales/mappings", input)).data.data;
  },
  async copyPosMappings(sourcePosSourceId: string, targetPosSourceId: string) {
    return (await api.post<ApiSuccess<{ copied: number; skipped: number; eligible: number }>>("/pos-sales/mappings/copy", { sourcePosSourceId, targetPosSourceId })).data.data;
  },
  async reviewPosMapping(id: string, reviewStatus: PosMappingReviewStatus, reviewComment?: string) {
    return (await api.patch<ApiSuccess<{ id: string; status: string; reviewStatus: PosMappingReviewStatus }>>(`/pos-sales/mappings/${id}`, { reviewStatus, ...(reviewComment?.trim() ? { reviewComment: reviewComment.trim() } : {}) })).data.data;
  },
  async revisePendingPosMapping(id: string, input: { branchId: string | null; sourceProductCode: string | null; menuItemId: string; menuItemVariantId: string; revisionReason?: string }) {
    return (await api.put<ApiSuccess<{ mapping: PosMapping }>>(`/pos-sales/mappings/${id}`, input)).data.data.mapping;
  },
  async deactivatePosMapping(id: string) {
    return (await api.post<ApiSuccess<{ mapping: PosMapping }>>(`/pos-sales/mappings/${id}/deactivate`)).data.data.mapping;
  },
  async posImports(filters?: { branchId?: string; search?: string; page?: number; pageSize?: number }) {
    return (await api.get<ApiSuccess<{ imports: PosImportRecord[]; pagination: { page:number;pageSize:number;total:number;totalPages:number } }>>("/pos-sales", { params: filters })).data.data;
  },
  async deletePosImport(id:string, reason:string, verificationPin:string) {
    return (await api.delete<ApiSuccess<{ id:string;deleted:true }>>(`/pos-sales/${id}`, { data: { reason, verificationPin } })).data.data;
  },
  async authorizePosImportCleanup(id:string,reason:string){
    return (await api.post<ApiSuccess<{id:string;authorized:true}>>(`/pos-sales/${id}/authorize-cleanup`,{reason})).data.data;
  },
  async posAnalytics(filters?: { branchId?: string; startDate?: string; endDate?: string }) {
    return (await api.get<ApiSuccess<PosAnalytics>>("/pos-sales/analytics", { params: filters })).data.data;
  },
  async dailyPosStatus(filters?:{startDate?:string;endDate?:string;branchId?:string}) {
    return (await api.get<ApiSuccess<{startDate:string;endDate:string;reminderTime:string;statuses:DailyPosUploadStatus[]}>>("/pos-sales/daily-status",{params:filters})).data.data;
  },
  async declareClosedPosDay(businessDate:string,notes?:string) {
    return (await api.post<ApiSuccess<{declaration:{id:string;businessDate:string;declaration:string;notes:string|null}}>>("/pos-sales/daily-status/closed",{businessDate,...(notes?.trim()?{notes:notes.trim()}:{})})).data.data.declaration;
  },
  async notifications() {
    return (await api.get<ApiSuccess<{ notifications: WorkflowNotification[] }>>("/notifications")).data.data.notifications;
  },
  async markNotificationRead(id: string) { await api.patch(`/notifications/${id}/read`); },
  async markAllNotificationsRead() { await api.patch("/notifications/read-all"); },
};
