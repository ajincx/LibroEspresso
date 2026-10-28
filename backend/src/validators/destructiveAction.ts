import { z } from "zod";

export const destructiveActionInput = z.object({
  reason: z.string().trim().min(10, "A reason of at least 10 characters is required").max(500),
  currentPassword: z.string().min(1, "Current password is required").max(128),
});

export const reasonedDeletionInput = z.object({
  reason: z.string().trim().min(10, "A reason of at least 10 characters is required").max(500),
});

export const testDataProductRetirementInput = destructiveActionInput.extend({
  confirmed: z.literal(true, {
    error: "Explicit confirmation is required",
  }),
});

export const incidentLifecycleInput = destructiveActionInput.extend({
  action: z.enum(["CANCEL", "ARCHIVE"]),
});

export const purchaseOrderLifecycleInput = z.discriminatedUnion("action", [
  destructiveActionInput.extend({ action: z.literal("CANCEL") }),
  z.object({
    action: z.literal("REVERSE"),
    reason: z.string().trim().min(1, "A correction reason is required").max(500),
  }),
]);
