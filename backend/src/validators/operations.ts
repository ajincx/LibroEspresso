import { z } from "zod";
import { STAFF_INCIDENT_TYPES } from "../services/shrinkageWorkflow.service.js";

const optionalUuid = z.string().uuid().optional();

export const inventoryOverviewFilters = z.object({ branchId: optionalUuid });
export const inventorySettingsParams = z.object({
  inventoryItemId: z.string().uuid(),
});
export const branchInventorySettingsInput = z.object({
  currentUnitCost: z.coerce.number().min(0),
  reorderLevel: z.coerce.number().min(0),
  reorderDays: z.coerce.number().int().min(1).max(365),
});

export const incidentFilters = z.object({
  branchId: optionalUuid,
  status: z.enum(["PENDING", "VERIFIED", "REJECTED"]).optional(),
  incidentType: z.enum(STAFF_INCIDENT_TYPES).optional(),
  inventoryItemId: optionalUuid,
  shrinkageReportId: optionalUuid,
  startDate: z.iso.date().optional(),
  endDate: z.iso.date().optional(),
}).refine((value) => !value.startDate || !value.endDate || value.startDate <= value.endDate, {
  message: "Start date must be on or before end date",
  path: ["endDate"],
});

export const incidentCreateInput = z.object({
  inventoryItemId: z.string().uuid(),
  productId: z.string().uuid().optional(),
  shrinkageReportId: z.string().uuid().optional(),
  incidentType: z.enum(STAFF_INCIDENT_TYPES),
  quantity: z.coerce.number().positive(),
  occurredAt: z.iso.datetime(),
  reason: z.string().trim().min(3).max(1000),
  notes: z.string().trim().max(3000).optional(),
  photoUrl: z
    .string()
    .trim()
    .max(4_200_000)
    .refine(
      (value) => /^data:image\/(jpeg|png|webp);base64,/i.test(value),
      "Evidence must be a JPEG, PNG, or WebP image",
    )
    .optional(),
});

export const incidentReviewInput = z.object({
  status: z.enum(["VERIFIED", "REJECTED"]),
  managerComment: z.string().trim().max(2000).optional(),
});

export const incidentLinkInput = z.object({
  shrinkageReportId: z.string().uuid(),
});

const purchaseOrderItem = z.object({
  inventoryItemId: z.string().uuid(),
  quantityOrdered: z.coerce.number().positive(),
  unitCost: z.coerce.number().min(0),
});

export const purchaseOrderCreateInput = z
  .object({
    supplierName: z.string().trim().min(2).max(160),
    orderDate: z.iso.date(),
    expectedDeliveryDate: z.iso.date(),
    status: z.enum(["DRAFT", "ORDERED"]).default("ORDERED"),
    notes: z.string().trim().max(3000).optional(),
    items: z
      .array(purchaseOrderItem)
      .min(1)
      .refine(
        (items) =>
          new Set(items.map((item) => item.inventoryItemId)).size ===
          items.length,
        "Purchase order ingredients must be unique",
      ),
  })
  .refine((value) => value.expectedDeliveryDate >= value.orderDate, {
    message: "Expected delivery date cannot be before the order date",
    path: ["expectedDeliveryDate"],
  });

export const purchaseOrderFilters = z.object({
  branchId: optionalUuid,
  status: z
    .enum(["DRAFT", "ORDERED", "PARTIALLY_RECEIVED", "RECEIVED", "CANCELLED"])
    .optional(),
});

export const purchaseOrderStatusInput = z.object({
  status: z.enum(["ORDERED", "CANCELLED"]),
});

export const purchaseOrderReceiveInput = z.object({
  receivedDate: z.iso.date(),
  items: z
    .array(
      z.object({
        purchaseOrderItemId: z.string().uuid(),
        quantityReceived: z.coerce.number().positive(),
      }),
    )
    .min(1)
    .refine(
      (items) =>
        new Set(items.map((item) => item.purchaseOrderItemId)).size ===
        items.length,
      "Received purchase order items must be unique",
    ),
});
