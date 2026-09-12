import { describe, expect, it } from "vitest";
import {
  ACCOUNT_LOCK_DURATION_MS,
  MAX_FAILED_LOGIN_ATTEMPTS,
  SESSION_ABSOLUTE_TIMEOUT_MS,
  SESSION_IDLE_TIMEOUT_MS,
  absoluteSessionExpiry,
  evaluateSessionTime,
  hashSessionIdentifier,
  nextFailedLoginState,
  shouldPersistActivity,
} from "./sessionSecurity.service.js";

const at = (value: string) => new Date(value);

describe("account lock timing", () => {
  it("locks the fifth consecutive failure for exactly 15 minutes", () => {
    const now = at("2026-09-09T01:00:00.000Z");
    const result = nextFailedLoginState(4, now);
    expect(result.failedLoginAttempts).toBe(MAX_FAILED_LOGIN_ATTEMPTS);
    expect(result.lockedUntil?.getTime()).toBe(now.getTime() + ACCOUNT_LOCK_DURATION_MS);
  });

  it("caps the counter instead of incrementing indefinitely", () => {
    expect(nextFailedLoginState(99).failedLoginAttempts).toBe(5);
  });
});

describe("session timing", () => {
  const created = at("2026-09-09T00:00:00.000Z");
  const expiresAt = absoluteSessionExpiry(created);

  it("sets a fixed eight-hour absolute expiry", () => {
    expect(expiresAt.getTime() - created.getTime()).toBe(SESSION_ABSOLUTE_TIMEOUT_MS);
  });

  it("accepts activity within the 30-minute idle period", () => {
    expect(evaluateSessionTime({ lastActivityAt: created, expiresAt, revokedAt: null }, new Date(created.getTime() + SESSION_IDLE_TIMEOUT_MS))).toBe("ACTIVE");
  });

  it("expires after more than 30 minutes of inactivity", () => {
    expect(evaluateSessionTime({ lastActivityAt: created, expiresAt, revokedAt: null }, new Date(created.getTime() + SESSION_IDLE_TIMEOUT_MS + 1))).toBe("EXPIRED_IDLE");
  });

  it("does not let recent activity extend the absolute eight-hour limit", () => {
    const recent = new Date(expiresAt.getTime() - 60_000);
    expect(evaluateSessionTime({ lastActivityAt: recent, expiresAt, revokedAt: null }, expiresAt)).toBe("EXPIRED_ABSOLUTE");
  });

  it("recognizes explicit revocation", () => {
    expect(evaluateSessionTime({ lastActivityAt: created, expiresAt, revokedAt: created }, created)).toBe("REVOKED");
  });

  it("throttles activity persistence to avoid writing on every request", () => {
    expect(shouldPersistActivity(created, new Date(created.getTime() + 60_000))).toBe(false);
    expect(shouldPersistActivity(created, new Date(created.getTime() + 5 * 60_000))).toBe(true);
  });

  it("hashes session identifiers instead of storing their raw value", () => {
    const raw = "2e65269c-b97b-4ed7-a453-83efc65d83ac";
    const hash = hashSessionIdentifier(raw);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).not.toContain(raw);
  });
});
