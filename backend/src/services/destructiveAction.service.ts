import bcrypt from "bcrypt";
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

export const DESTRUCTIVE_VERIFICATION_WINDOW_MINUTES = 15;
export const DESTRUCTIVE_VERIFICATION_MAX_FAILURES = 5;

export async function verifyDestructiveAction(
  user: TokenUser,
  currentPassword: string,
  context: DestructiveContext,
) {
  const client = await pool.connect();
  let committed = false;
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`destructive-reauth:${user.id}`]);
    const recentFailures = await client.query<{ count: number }>(
      `SELECT count(*)::int count
         FROM audit_logs
        WHERE user_id=$1 AND action='DESTRUCTIVE_ACTION_VERIFICATION_FAILED'
          AND created_at>=now()-($2::text||' minutes')::interval`,
      [user.id, DESTRUCTIVE_VERIFICATION_WINDOW_MINUTES],
    );
    if (Number(recentFailures.rows[0]?.count ?? 0) >= DESTRUCTIVE_VERIFICATION_MAX_FAILURES) {
      await client.query("COMMIT");
      committed = true;
      throw new AppError(429, "DESTRUCTIVE_ACTION_VERIFICATION_RATE_LIMITED", "Too many verification attempts. Please try again later.");
    }
    const account = await client.query<{ passwordHash: string }>(
      `SELECT password_hash "passwordHash" FROM users WHERE id=$1 AND status='ACTIVE' FOR UPDATE`,
      [user.id],
    );
    const verified = account.rows[0]
      ? await bcrypt.compare(currentPassword, account.rows[0].passwordHash)
      : false;
    if (!verified) {
      await writeAudit(
        user,
        "DESTRUCTIVE_ACTION_VERIFICATION_FAILED",
        context.module,
        context.recordId,
        `Rejected ${context.action.toLowerCase()} request because verification failed`,
        { ...context, verificationResult: "FAILED" },
        client,
      );
      await client.query("COMMIT");
      committed = true;
      throw new AppError(403, "DESTRUCTIVE_ACTION_VERIFICATION_FAILED", "Verification failed");
    }
    await client.query("COMMIT");
    committed = true;
  } catch (error) {
    if (!committed) await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function writeDestructiveActionAudit(
  user: TokenUser,
  context: DestructiveContext,
  description: string,
  metadata: Record<string, unknown>,
  client: Pick<PoolClient, "query">,
  verificationResult: "VERIFIED" | "NOT_REQUIRED" = "VERIFIED",
) {
  await writeAudit(
    user,
    `CONTROLLED_${context.action}`,
    context.module,
    context.recordId,
    description,
    { ...metadata, reason: context.reason, verificationResult },
    client,
  );
}
