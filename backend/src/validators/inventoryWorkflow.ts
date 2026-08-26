import { z } from "zod";

export const posImportInput = z.object({
  businessDate: z.iso.date(),
  sourceFilename: z.string().trim().min(1).max(255),
  items: z.array(z.object({
    menuItemId: z.string().uuid(),
    quantitySold: z.coerce.number().positive(),
  })).min(1).refine((items) => new Set(items.map((item) => item.menuItemId)).size === items.length, "Menu products must be unique"),
});

export const inventoryMovementInput = z.object({
  branchId: z.string().uuid().optional(),
  inventoryItemId: z.string().uuid(),
  movementType: z.enum(["RECEIPT", "APPROVED_ADJUSTMENT"]),
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

export const shrinkageReportInput = z.object({
  inventoryCountItemId: z.string().uuid(),
  menuItemId: z.string().uuid().optional(),
  classification: z.enum(["SPOILAGE", "WASTAGE", "PILFERAGE", "COUNT_ERROR"]),
  explanation: z.string().trim().min(10).max(3000),
  supportingNotes: z.string().trim().max(3000).optional(),
});

export const shrinkageFilters = z.object({
  branchId: z.string().uuid().optional(),
  status: z.enum(["PENDING_REVIEW", "REVIEWED"]).optional(),
  classification: z.enum(["SPOILAGE", "WASTAGE", "PILFERAGE", "COUNT_ERROR"]).optional(),
});

export const notificationIdParams = z.object({ id: z.string().uuid() });
