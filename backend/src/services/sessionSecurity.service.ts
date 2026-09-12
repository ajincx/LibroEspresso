import { createHash, randomUUID } from "node:crypto";

export const SESSION_IDLE_TIMEOUT_MS = 30 * 60 * 1_000;
export const SESSION_ABSOLUTE_TIMEOUT_MS = 8 * 60 * 60 * 1_000;
export const SESSION_ACTIVITY_WRITE_THROTTLE_MS = 5 * 60 * 1_000;
export const ACCOUNT_LOCK_DURATION_MS = 15 * 60 * 1_000;
export const MAX_FAILED_LOGIN_ATTEMPTS = 5;

export type SessionTimeStatus =
  | "ACTIVE"
  | "EXPIRED_IDLE"
  | "EXPIRED_ABSOLUTE"
  | "REVOKED";

export function hashSessionIdentifier(identifier: string) {
  return createHash("sha256").update(identifier, "utf8").digest("hex");
}

export function newSessionIdentifier() {
  return randomUUID();
}

export function absoluteSessionExpiry(createdAt: Date) {
  return new Date(createdAt.getTime() + SESSION_ABSOLUTE_TIMEOUT_MS);
}

export function evaluateSessionTime(
  session: {
    lastActivityAt: Date;
    expiresAt: Date;
    revokedAt: Date | null;
  },
  now = new Date(),
): SessionTimeStatus {
  if (session.revokedAt) return "REVOKED";
  if (now.getTime() >= session.expiresAt.getTime()) return "EXPIRED_ABSOLUTE";
  if (now.getTime() - session.lastActivityAt.getTime() > SESSION_IDLE_TIMEOUT_MS) {
    return "EXPIRED_IDLE";
  }
  return "ACTIVE";
}

export function shouldPersistActivity(lastActivityAt: Date, now = new Date()) {
  return now.getTime() - lastActivityAt.getTime() >= SESSION_ACTIVITY_WRITE_THROTTLE_MS;
}

export function nextFailedLoginState(currentAttempts: number, now = new Date()) {
  const failedLoginAttempts = Math.min(
    Math.max(0, currentAttempts) + 1,
    MAX_FAILED_LOGIN_ATTEMPTS,
  );
  return {
    failedLoginAttempts,
    lockedUntil:
      failedLoginAttempts >= MAX_FAILED_LOGIN_ATTEMPTS
        ? new Date(now.getTime() + ACCOUNT_LOCK_DURATION_MS)
        : null,
  };
}
