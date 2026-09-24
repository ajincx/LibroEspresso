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

export const posPreviewInput = posCsvSourceInput.extend({ posSourceId: z.string().uuid().optional() });
export const posImportInput = posCsvSourceInput.extend({
  expectedContentHash: z.string().regex(/^[a-f0-9]{64}$/i, "Preview the CSV again before importing"),
  expectedResolutionFingerprint: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
  posSourceId: z.string().uuid().optional(),
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
  branchId: z.string().uuid().optional(),
  inventoryItemId: z.string().uuid(),
  movementType: z.enum([
    "RECEIPT",
    "APPROVED_ADJUSTMENT",
    "APPROVED_ADJUSTMENT_INCREASE",
    "APPROVED_ADJUSTMENT_DECREASE",
  ]),
  quantity: z.coerce.number().positive(),
  occurredAt: z.iso.datetime().optional(),
  referenceNo: z.string().trim().max(80).optional(),
  notes: z.string().trim().max(1000).optional(),
});

export const inventoryCountInput = z.object({
  countDate: z.iso.date(),
  items: z.array(z.object({
    inventoryItemId: z.string().uuid(),
    actualQuantity: z.coerce.number().min(0),
  })).min(1).refine((items) => new Set(items.map((item) => item.inventoryItemId)).size === items.length, "Inventory items must be unique"),
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
});

export const notificationIdParams = z.object({ id: z.string().uuid() });
