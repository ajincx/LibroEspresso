import { beforeEach, describe, expect, it, vi } from "vitest";
import jwt from "jsonwebtoken";

const secret = "test-secret-that-is-at-least-32-characters";
const mocks = vi.hoisted(() => ({
  connect: vi.fn(),
  poolQuery: vi.fn(),
  compare: vi.fn(),
}));

vi.mock("../config/database.js", () => ({ pool: { connect: mocks.connect, query: mocks.poolQuery } }));
vi.mock("../config/env.js", () => ({ env: { JWT_SECRET: "test-secret-that-is-at-least-32-characters", NODE_ENV: "test", COOKIE_NAME: "libro_session" } }));
vi.mock("bcrypt", () => ({ default: { compare: mocks.compare, hash: vi.fn() } }));

import {
  authenticateCredentials,
  revokeSessionToken,
  signSession,
  validateSessionToken,
} from "./auth.service.js";
import { hashSessionIdentifier } from "./sessionSecurity.service.js";

const now = new Date("2026-09-09T01:00:00.000Z");
const userRow = {
  id: "00000000-0000-4000-8000-000000000001",
  branch_id: "00000000-0000-4000-8000-000000000002",
  first_name: "Maria",
  last_name: "Santos",
  email: "manager@libro.com",
  username: "libro.manager",
  phone_number: null,
  position: "Branch Manager",
  password_hash: "stored-bcrypt-hash",
  role: "BRANCH_MANAGER" as const,
  status: "ACTIVE",
  branch_code: "LPA",
  branch_name: "Lipa",
  failed_login_attempts: 0,
  locked_until: null as Date | null,
};

function loginClient(row = userRow) {
  const calls: Array<{ sql: string; values?: unknown[] }> = [];
  const query = vi.fn(async (statement: unknown, values?: unknown[]) => {
    const sql = String(statement);
    calls.push({ sql, values });
    if (sql.includes("FROM users u") && sql.includes("FOR UPDATE")) return { rows: row ? [row] : [] };
    return { rows: [], rowCount: 1 };
  });
  return { client: { query, release: vi.fn() }, calls };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("persistent login protection", () => {
  it("increments the persistent failure count and safely audits a wrong password", async () => {
    const { client, calls } = loginClient();
    mocks.connect.mockResolvedValue(client);
    mocks.compare.mockResolvedValue(false);

    await expect(authenticateCredentials("manager@libro.com", "wrong-password", { ipAddress: "127.0.0.1" }, now)).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });

    expect(calls.find(({ sql }) => sql.includes("failed_login_attempts=$2"))?.values).toEqual([userRow.id, 1, null]);
    expect(calls.some(({ values }) => values?.[2] === "LOGIN_FAILED")).toBe(true);
    expect(calls.flatMap(({ values }) => values ?? [])).not.toContain("wrong-password");
    expect(calls.at(-1)?.sql).toBe("COMMIT");
  });

  it("locks the fifth failure for 15 minutes and audits the lock", async () => {
    const { client, calls } = loginClient({ ...userRow, failed_login_attempts: 4 });
    mocks.connect.mockResolvedValue(client);
    mocks.compare.mockResolvedValue(false);

    await expect(authenticateCredentials(userRow.email, "wrong-password", {}, now)).rejects.toMatchObject({ status: 423, code: "ACCOUNT_TEMPORARILY_LOCKED" });

    const update = calls.find(({ sql }) => sql.includes("failed_login_attempts=$2"));
    expect(update?.values?.[1]).toBe(5);
    expect((update?.values?.[2] as Date).getTime()).toBe(now.getTime() + 15 * 60_000);
    expect(calls.some(({ values }) => values?.[2] === "ACCOUNT_LOCKED")).toBe(true);
  });

  it("rejects a currently locked account without checking the password again", async () => {
    const { client } = loginClient({ ...userRow, failed_login_attempts: 5, locked_until: new Date(now.getTime() + 60_000) });
    mocks.connect.mockResolvedValue(client);

    await expect(authenticateCredentials(userRow.email, "correct-password", {}, now)).rejects.toMatchObject({ status: 423, code: "ACCOUNT_TEMPORARILY_LOCKED" });
    expect(mocks.compare).not.toHaveBeenCalled();
  });

  it("allows a valid login after an expired lock, resets failures, and creates a hashed server session", async () => {
    const expired = { ...userRow, failed_login_attempts: 5, locked_until: new Date(now.getTime() - 1) };
    const { client, calls } = loginClient(expired);
    mocks.connect.mockResolvedValue(client);
    mocks.compare.mockResolvedValue(true);

    const authenticated = await authenticateCredentials(userRow.email, "correct-password", { userAgent: "Test Browser" }, now);
    const sessionInsert = calls.find(({ sql }) => sql.includes("INSERT INTO auth_sessions"));
    const storedHash = String(sessionInsert?.values?.[1]);

    expect(authenticated.user.email).toBe(userRow.email);
    expect(calls.find(({ sql }) => sql.includes("failed_login_attempts=0"))).toBeTruthy();
    expect(storedHash).toBe(hashSessionIdentifier(authenticated.sessionIdentifier));
    expect(storedHash).not.toBe(authenticated.sessionIdentifier);
    expect(calls.some(({ values }) => values?.[2] === "LOGIN_SUCCESS")).toBe(true);
  });

  it("associates the JWT with the session identifier and fixes expiry at eight hours", async () => {
    const token = signSession({ id: userRow.id, role: userRow.role, branchId: userRow.branch_id }, "session-id");
    const payload = jwt.verify(token, secret) as jwt.JwtPayload & { sessionId: string };
    expect(payload.sessionId).toBe("session-id");
    expect(payload.exp! - payload.iat!).toBe(8 * 60 * 60);
  });
});

describe("server-side session enforcement", () => {
  const token = signSession({ id: userRow.id, role: userRow.role, branchId: userRow.branch_id }, "session-id");

  it("accepts an active session and refreshes authoritative role and branch", async () => {
    mocks.poolQuery.mockResolvedValueOnce({ rows: [{ userId: userRow.id, role: "BRANCH_MANAGER", branchId: userRow.branch_id, accountStatus: "ACTIVE", lastActivityAt: new Date(now.getTime() - 60_000), expiresAt: new Date(now.getTime() + 60_000), revokedAt: null }] });
    await expect(validateSessionToken(token, now)).resolves.toMatchObject({ id: userRow.id, role: "BRANCH_MANAGER", branchId: userRow.branch_id });
  });

  it("expires and audits a session after more than 30 minutes idle", async () => {
    mocks.poolQuery.mockImplementation(async (statement: unknown) => {
      const sql = String(statement);
      if (sql.includes("FROM auth_sessions s")) return { rows: [{ userId: userRow.id, role: userRow.role, branchId: userRow.branch_id, accountStatus: "ACTIVE", lastActivityAt: new Date(now.getTime() - 30 * 60_000 - 1), expiresAt: new Date(now.getTime() + 60_000), revokedAt: null }] };
      return { rows: [], rowCount: 1 };
    });
    await expect(validateSessionToken(token, now)).rejects.toMatchObject({ code: "SESSION_EXPIRED_IDLE" });
    expect(mocks.poolQuery.mock.calls.some(([sql, values]) => String(sql).includes("audit_logs") && values[2] === "SESSION_EXPIRED_IDLE")).toBe(true);
  });

  it("enforces and audits the absolute eight-hour expiry despite recent activity", async () => {
    mocks.poolQuery.mockImplementation(async (statement: unknown) => {
      const sql = String(statement);
      if (sql.includes("FROM auth_sessions s")) return { rows: [{ userId: userRow.id, role: userRow.role, branchId: userRow.branch_id, accountStatus: "ACTIVE", lastActivityAt: new Date(now.getTime() - 1_000), expiresAt: now, revokedAt: null }] };
      return { rows: [], rowCount: 1 };
    });
    await expect(validateSessionToken(token, now)).rejects.toMatchObject({ code: "SESSION_EXPIRED_ABSOLUTE" });
    expect(mocks.poolQuery.mock.calls.some(([sql, values]) => String(sql).includes("audit_logs") && values[2] === "SESSION_EXPIRED_ABSOLUTE")).toBe(true);
  });

  it("rejects a copied token after its session has been revoked", async () => {
    mocks.poolQuery.mockResolvedValueOnce({ rows: [{ userId: userRow.id, role: userRow.role, branchId: userRow.branch_id, accountStatus: "ACTIVE", lastActivityAt: now, expiresAt: new Date(now.getTime() + 60_000), revokedAt: now }] });
    await expect(validateSessionToken(token, now)).rejects.toMatchObject({ code: "SESSION_REVOKED" });
  });

  it("revokes all sessions when an account becomes inactive", async () => {
    mocks.poolQuery.mockResolvedValueOnce({ rows: [{ userId: userRow.id, role: userRow.role, branchId: userRow.branch_id, accountStatus: "INACTIVE", lastActivityAt: now, expiresAt: new Date(now.getTime() + 60_000), revokedAt: null }] }).mockResolvedValueOnce({ rows: [], rowCount: 2 });
    await expect(validateSessionToken(token, now)).rejects.toMatchObject({ code: "ACCOUNT_INACTIVE" });
    expect(mocks.poolQuery.mock.calls[1]?.[1]).toEqual([userRow.id, expect.any(Date), "ACCOUNT_DISABLED"]);
  });

  it("logout revokes the server session and writes a safe audit event", async () => {
    const calls: Array<{ sql: string; values?: unknown[] }> = [];
    const client = {
      query: vi.fn(async (statement: unknown, values?: unknown[]) => {
        const sql = String(statement); calls.push({ sql, values });
        if (sql.includes("WITH revoked AS")) return { rows: [{ userId: userRow.id, branchId: userRow.branch_id }] };
        return { rows: [], rowCount: 1 };
      }),
      release: vi.fn(),
    };
    mocks.connect.mockResolvedValue(client);
    await revokeSessionToken(token, { ipAddress: "127.0.0.1" }, now);
    expect(calls.some(({ sql }) => sql.includes("revoke_reason='LOGOUT'"))).toBe(true);
    expect(calls.some(({ values }) => values?.[2] === "LOGOUT")).toBe(true);
    expect(calls.flatMap(({ values }) => values ?? [])).not.toContain(token);
  });
});
