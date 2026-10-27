import { z } from "zod";

const userReasons = [
  "Employee resigned.",
  "Employment contract ended.",
  "Transferred to another branch or position.",
  "Account no longer required.",
  "Security or access concern.",
] as const;
const branchReasons = [
  "Branch permanently closed.",
  "Branch temporarily not operating.",
  "Branch relocated.",
  "Branch operations consolidated.",
  "Branch no longer managed by the company.",
] as const;

const reasonFor = (reasons: readonly string[]) => z.object({ reason: z.string().trim().min(1).max(1000) }).superRefine(({reason},ctx)=>{
  if (!reasons.includes(reason) && !reason.startsWith("Other: ")) ctx.addIssue({code:"custom",path:["reason"],message:"Select an approved deactivation reason"});
  if (reason.startsWith("Other: ") && reason.slice(7).trim().length < 10) ctx.addIssue({code:"custom",path:["reason"],message:"Explain the other reason in at least 10 characters"});
});

export const userDeactivationInput = reasonFor(userReasons);
export const branchDeactivationInput = reasonFor(branchReasons);
