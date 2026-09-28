import { z } from "zod";

export const destructiveActionInput = z.object({
  reason: z.string().trim().min(10, "A reason of at least 10 characters is required").max(500),
  verificationPin: z.string().trim().min(1, "Verification PIN is required"),
});

export const incidentLifecycleInput = destructiveActionInput.extend({
  action: z.enum(["CANCEL", "ARCHIVE"]),
});

export const purchaseOrderLifecycleInput = destructiveActionInput.extend({
  action: z.enum(["DELETE", "CANCEL", "REVERSE"]),
});
