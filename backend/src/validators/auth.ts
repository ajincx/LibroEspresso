import { z } from "zod";
export const loginSchema = z.object({
  identifier: z.string().trim().min(3).max(255),
  password: z.string().min(8).max(128),
  remember: z.boolean().optional().default(false),
});
