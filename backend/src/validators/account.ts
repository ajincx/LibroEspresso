import { z } from "zod";

export const profilePatch = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(255),
  phoneNumber: z.string().trim().max(30).nullable().optional(),
});

export const passwordPatch = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(10).max(128),
}).refine((value) => value.currentPassword !== value.newPassword, {
  message: "New password must be different from the current password",
  path: ["newPassword"],
});

export const messageInput = z.object({
  recipientUserId: z.string().uuid(),
  body: z.string().trim().min(1).max(2000),
});

export const userIdParams = z.object({ userId: z.string().uuid() });
export const messageIdParams = z.object({ messageId: z.string().uuid() });
