import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  connect: vi.fn(),
  compare: vi.fn(),
  hash: vi.fn(),
  revokeAll: vi.fn(),
  writeAudit: vi.fn(),
  clearCookie: vi.fn(),
}));

vi.mock("bcrypt", () => ({ default: { compare: mocks.compare, hash: mocks.hash } }));
vi.mock("../config/database.js", () => ({ pool: { connect: mocks.connect, query: vi.fn() } }));
vi.mock("../services/auth.service.js", () => ({
  findCurrentUser: vi.fn(),
  revokeAllUserSessions: mocks.revokeAll,
}));
vi.mock("../services/audit.service.js", () => ({ writeAudit: mocks.writeAudit }));
vi.mock("../services/sessionCookie.service.js", () => ({ clearSessionCookie: mocks.clearCookie }));

import { updatePassword } from "./account.controller.js";

const request = {
  body: { currentPassword: "current-password", newPassword: "new-secure-password" },
  user: { id: "user-1", role: "OWNER", branchId: null },
} as never;

function response() {
  return { json: vi.fn() };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.hash.mockResolvedValue("new-bcrypt-hash");
  mocks.revokeAll.mockResolvedValue({ rowCount: 2 });
  mocks.writeAudit.mockResolvedValue(undefined);
});

describe("password-change session policy", () => {
  it("updates the bcrypt hash and revokes every active session transactionally", async () => {
    const calls: Array<{ sql: string; values?: unknown[] }> = [];
    const client = {
      query: vi.fn(async (statement: unknown, values?: unknown[]) => {
        const sql = String(statement); calls.push({ sql, values });
        if (sql.includes("SELECT password_hash")) return { rows: [{ password_hash: "old-bcrypt-hash" }] };
        return { rows: [], rowCount: 1 };
      }),
      release: vi.fn(),
    };
    mocks.connect.mockResolvedValue(client);
    mocks.compare.mockResolvedValue(true);
    const res = response();

    await updatePassword(request, res as never, vi.fn());

    expect(calls.find(({ sql }) => sql.startsWith("UPDATE users"))?.values).toEqual(["user-1", "new-bcrypt-hash"]);
    expect(mocks.revokeAll).toHaveBeenCalledWith("user-1", "PASSWORD_CHANGED", client);
    expect(mocks.writeAudit).toHaveBeenCalledWith(expect.anything(), "PASSWORD_CHANGED", "USER", "user-1", expect.any(String), {}, client);
    expect(calls.at(-1)?.sql).toBe("COMMIT");
    expect(mocks.clearCookie).toHaveBeenCalledWith(res);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: { requiresReauthentication: true } });
  });

  it("rolls back and preserves sessions when the current password is wrong", async () => {
    const calls: string[] = [];
    const client = {
      query: vi.fn(async (statement: unknown) => {
        const sql = String(statement); calls.push(sql);
        if (sql.includes("SELECT password_hash")) return { rows: [{ password_hash: "old-bcrypt-hash" }] };
        return { rows: [], rowCount: 1 };
      }),
      release: vi.fn(),
    };
    mocks.connect.mockResolvedValue(client);
    mocks.compare.mockResolvedValue(false);

    await expect(updatePassword(request, response() as never, vi.fn())).rejects.toMatchObject({ code: "CURRENT_PASSWORD_INCORRECT" });
    expect(calls.at(-1)).toBe("ROLLBACK");
    expect(mocks.revokeAll).not.toHaveBeenCalled();
  });
});
