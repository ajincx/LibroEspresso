import { z } from "zod";
import {
  EVIDENCE_BASES,
  MANAGER_CLASSIFICATIONS,
  STAFF_INCIDENT_TYPES,
  requiresPilferageSafeguard,
} from "../services/shrinkageWorkflow.service.js";

const posCsvSourceInput = z.object({
  sourceFilename: z.string().trim().min(1).max(255).refine((value) => value.toLowerCase().endsWith(".csv"), "Select a CSV file"),
  csvText: z.string().min(1).max(4_500_000),
});

export const posPreviewInput = posCsvSourceInput.extend({ posSourceId: z.string().uuid() });
export const posImportInput = posCsvSourceInput.extend({
  expectedContentHash: z.string().regex(/^[a-f0-9]{64}$/i, "Preview the CSV again before importing"),
  expectedResolutionFingerprint: z.string().regex(/^[a-f0-9]{64}$/i),
  expectedInventoryAccountingTreatment: z.enum(["OPERATIONAL", "HISTORICAL_REPORTING_CUTOVER"]),
  posSourceId: z.string().uuid(),
  confirmDayComplete: z.boolean().optional().default(false),
});
export const testDataAuthorizationInput = z.object({ reason: z.string().trim().min(10).max(500) });
export const posCleanupAuthorizationInput = z.object({ reason: z.string().trim().min(10).max(500) });
export const posImportVoidInput = z.object({
  reason: z.string().trim().min(10).max(500),
  confirmed: z.literal(true, { error: "Explicit confirmation is required" }),
});
export const posImportApprovalReviewInput = z.object({
  status: z.enum(["APPROVED", "REJECTED"]),
  approvalNotes: z.string().trim().min(3).max(1000),
});

export const posImportHistoryFilters = z.object({
  branchId: z.string().uuid().optional(),
  search: z.string().trim().max(120).optional(),
});

export const posAnalyticsFilters = z.object({
  branchId: z.string().uuid().optional(),
  startDate: z.iso.date().optional(),
  endDate: z.iso.date().optional(),
}).refine((value) => !value.startDate || !value.endDate || value.startDate <= value.endDate, {
  message: "Start date must be on or before end date",
  path: ["endDate"],
});

export const inventoryMovementInput = z.object({
  inventoryItemId: z.string().uuid(),
  movementType: z.enum([
    "APPROVED_ADJUSTMENT_INCREASE",
    "APPROVED_ADJUSTMENT_DECREASE",
  ]),
  quantity: z.coerce.number().finite().positive(),
  unit: z.enum(["g", "kg", "ml", "L", "pc"]),
  reason: z.string().trim().min(10).max(1000),
  requestId: z.string().uuid(),
});

export const inventoryCountInput = z.object({
  countDate: z.iso.date(),
  countType: z.enum(["FULL", "OPENING", "CLOSING"]).optional().default("FULL"),
  correctionReason: z.string().trim().min(10, "Correction reason must be at least 10 characters").max(1000).optional(),
  items: z.array(z.object({
    inventoryItemId: z.string().uuid(),
    quantity: z.number().finite().min(0),
    enteredUnit: z.enum(["g", "kg", "ml", "L", "pc"]),
  })).min(1).refine((items) => new Set(items.map((item) => item.inventoryItemId)).size === items.length, "Inventory items must be unique"),
});

export const inventoryCountTestClassificationInput = z.object({
  reason: z.string().trim().min(10, "A reason of at least 10 characters is required").max(500),
  currentPassword: z.string().min(1, "Current password is required").max(128),
  confirmed: z.literal(true, { error: "Explicit confirmation is required" }),
});

const openingBaselineItemInput = z.object({
  inventoryItemId: z.string().uuid(),
  quantity: z.coerce.number().min(0),
  unit: z.enum(["g", "ml", "pc"]),
});

export const openingInventoryBaselineInput = z.object({
  branchId: z.string().uuid(),
  effectiveAt: z.iso.datetime({ offset: true }),
  designation: z.literal("UAT_OPENING"),
  notes: z.string().trim().min(10).max(1000),
  items: z.array(openingBaselineItemInput).min(1).max(500)
    .refine((items) => new Set(items.map((item) => item.inventoryItemId)).size === items.length, "Opening-baseline inventory items must be unique"),
});

export const openingInventoryBaselineBatchInput = z.object({
  baselines: z.array(openingInventoryBaselineInput).min(1).max(20)
    .refine((baselines) => new Set(baselines.map((baseline) => `${baseline.branchId}|${baseline.effectiveAt}|${baseline.designation}`)).size === baselines.length, "Opening baselines must be unique by branch, effective time, and designation"),
});

export const openingInventoryBaselineFilters = z.object({
  branchId: z.string().uuid().optional(),
});

export const startingStockConfirmationInput = z.object({
  confirmed: z.literal(true, { error: "Explicit confirmation is required" }),
  items: z.array(z.object({
    inventoryItemId: z.string().uuid(),
    quantity: z.number().finite().min(0),
    enteredUnit: z.enum(["g", "kg", "ml", "L", "pc"]),
  })).min(1).max(500)
    .refine((items) => new Set(items.map((item) => item.inventoryItemId)).size === items.length, "Starting Stock items must be unique"),
});

export const ingredientInitialStockInput = z.object({
  quantity: z.number().finite().min(0),
  enteredUnit: z.enum(["g", "kg", "ml", "L", "pc"]),
  preOperationsConfirmed: z.boolean().default(false),
  confirmed: z.literal(true, { error: "Physical-verification confirmation is required" }),
});

export const shrinkageInvestigationInput = z.object({
  menuItemId: z.string().uuid().optional(),
  classification: z.enum(MANAGER_CLASSIFICATIONS),
  explanation: z.string().trim().min(10).max(3000),
  supportingNotes: z.string().trim().max(3000).optional(),
  evidenceReviewConfirmed: z.boolean().optional(),
  evidenceBasis: z.array(z.enum(EVIDENCE_BASES)).max(EVIDENCE_BASES.length).optional(),
}).superRefine((value, context) => {
  if (!requiresPilferageSafeguard(value.classification)) return;
  if (value.explanation.length < 20) context.addIssue({ code: "custom", path: ["explanation"], message: "Verified Pilferage requires meaningful investigation notes of at least 20 characters" });
  if (value.evidenceReviewConfirmed !== true) context.addIssue({ code: "custom", path: ["evidenceReviewConfirmed"], message: "Confirm that the available records and supporting evidence were reviewed" });
  if (!value.evidenceBasis?.length) context.addIssue({ code: "custom", path: ["evidenceBasis"], message: "Select at least one evidence basis for Verified Pilferage" });
});

export const shrinkageFilters = z.object({
  branchId: z.string().uuid().optional(),
  archiveScope: z.enum(["ACTIVE", "ARCHIVED", "ALL"]).default("ACTIVE"),
  status: z.enum(["DETECTED", "VERIFIED", "PENDING_REVIEW", "REVIEWED"]).optional(),
  classification: z.enum(MANAGER_CLASSIFICATIONS).optional(),
  inventoryItemId: z.string().uuid().optional(),
  incidentType: z.enum(STAFF_INCIDENT_TYPES).optional(),
  startDate: z.iso.date().optional(),
  endDate: z.iso.date().optional(),
}).refine((value) => !value.startDate || !value.endDate || value.startDate <= value.endDate, {
  message: "Start date must be on or before end date",
  path: ["endDate"],
});

export const varianceFilters = z.object({
  branchId: z.string().uuid().optional(),
  countDate: z.iso.date().optional(),
  varianceScope: z.enum(["DISCREPANCIES", "MATCHED", "ALL"]).default("DISCREPANCIES"),
});

export const notificationIdParams = z.object({ id: z.string().uuid() });
