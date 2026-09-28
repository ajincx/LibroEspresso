import type { PoolClient } from "pg";
import { pool } from "../config/database.js";
import type { TokenUser } from "../types/auth.js";
import { AppError } from "../utils/appError.js";
import { writeAudit } from "./audit.service.js";

type DestructiveContext = {
  module: string;
  action: string;
  recordId: string;
  reason: string;
};

// TODO(PRODUCTION): replace this temporary capstone PIN with a short-lived,
// user-bound email OTP that is hashed, expires, and cannot be replayed.
const TEMPORARY_DESTRUCTIVE_ACTION_PIN = "12345";

export async function verifyDestructiveAction(
  user: TokenUser,
  verificationPin: string,
  context: DestructiveContext,
) {
  if (verificationPin !== TEMPORARY_DESTRUCTIVE_ACTION_PIN) {
    await writeAudit(
      user,
      "DESTRUCTIVE_ACTION_VERIFICATION_FAILED",
      context.module,
      context.recordId,
      `Rejected ${context.action.toLowerCase()} request because verification failed`,
      { ...context, verificationResult: "FAILED" },
      pool,
    );
    throw new AppError(403, "DESTRUCTIVE_ACTION_VERIFICATION_FAILED", "The verification PIN is incorrect");
  }
}

export async function writeDestructiveActionAudit(
  user: TokenUser,
  context: DestructiveContext,
  description: string,
  metadata: Record<string, unknown>,
  client: Pick<PoolClient, "query">,
) {
  await writeAudit(
    user,
    `CONTROLLED_${context.action}`,
    context.module,
    context.recordId,
    description,
    { ...metadata, reason: context.reason, verificationResult: "VERIFIED" },
    client,
  );
}
