import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  compare: vi.fn(),
  connect: vi.fn(),
  writeAudit: vi.fn(),
}));

vi.mock("bcrypt", () => ({ default: { compare: mocks.compare } }));
vi.mock("../config/database.js", () => ({ pool: { connect: mocks.connect } }));
vi.mock("./audit.service.js", () => ({ writeAudit: mocks.writeAudit }));

import {
  DESTRUCTIVE_VERIFICATION_MAX_FAILURES,
  verifyDestructiveAction,
} from "./destructiveAction.service.js";

const user = { id: "00000000-0000-4000-8000-000000000001", role: "OWNER", branchId: null } as const;
const context = { module: "POS_SOURCE", action: "DELETE", recordId: "source-1", reason: "Remove unused source" };

function verificationClient(failures = 0, activeUser = true) {
  const statements: string[] = [];
  const query = vi.fn(async (statement: unknown) => {
    const sql = String(statement);
    statements.push(sql);
    if (sql.includes("count(*)::int count")) return { rows: [{ count: failures }] };
    if (sql.includes("SELECT password_hash")) return { rows: activeUser ? [{ passwordHash: "$2b$hash" }] : [] };
    return { rows: [] };
  });
  return { query, release: vi.fn(), statements };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.writeAudit.mockResolvedValue(undefined);
});

describe("destructive action current-password verification", () => {
  it("verifies the active authenticated user's password under a user-scoped transaction lock", async () => {
    const client = verificationClient();
    mocks.connect.mockResolvedValue(client);
    mocks.compare.mockResolvedValue(true);

    await verifyDestructiveAction(user, "correct password", context);

    expect(mocks.compare).toHaveBeenCalledWith("correct password", "$2b$hash");
    expect(client.statements[0]).toBe("BEGIN");
    expect(client.statements.findIndex((sql) => sql.includes("pg_advisory_xact_lock")))
      .toBeLessThan(client.statements.findIndex((sql) => sql.includes("SELECT password_hash")));
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining("pg_advisory_xact_lock"), [`destructive-reauth:${user.id}`]);
    expect(client.statements).toContain("COMMIT");
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("returns a generic error and audits a failed password without persisting the password", async () => {
    const client = verificationClient();
    mocks.connect.mockResolvedValue(client);
    mocks.compare.mockResolvedValue(false);

    await expect(verifyDestructiveAction(user, "wrong password", context)).rejects.toMatchObject({
      status: 403,
      code: "DESTRUCTIVE_ACTION_VERIFICATION_FAILED",
      message: "Verification failed",
    });

    expect(mocks.writeAudit).toHaveBeenCalledWith(
      user,
      "DESTRUCTIVE_ACTION_VERIFICATION_FAILED",
      context.module,
      context.recordId,
      expect.any(String),
      expect.not.objectContaining({ currentPassword: expect.anything() }),
      client,
    );
    expect(JSON.stringify(mocks.writeAudit.mock.calls)).not.toContain("wrong password");
    expect(client.statements).toContain("COMMIT");
  });

  it("rate limits repeated failures before password comparison", async () => {
    const client = verificationClient(DESTRUCTIVE_VERIFICATION_MAX_FAILURES);
    mocks.connect.mockResolvedValue(client);

    await expect(verifyDestructiveAction(user, "any password", context)).rejects.toMatchObject({
      status: 429,
      code: "DESTRUCTIVE_ACTION_VERIFICATION_RATE_LIMITED",
    });

    expect(mocks.compare).not.toHaveBeenCalled();
    expect(client.statements).toContain("COMMIT");
  });

  it("fails generically for inactive or missing users", async () => {
    const client = verificationClient(0, false);
    mocks.connect.mockResolvedValue(client);

    await expect(verifyDestructiveAction(user, "correct password", context)).rejects.toMatchObject({
      status: 403,
      code: "DESTRUCTIVE_ACTION_VERIFICATION_FAILED",
    });
    expect(mocks.compare).not.toHaveBeenCalled();
  });

  it("uses the same user-scoped advisory lock for concurrent verification requests", async () => {
    const first = verificationClient();
    const second = verificationClient();
    mocks.connect.mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    mocks.compare.mockResolvedValue(true);

    await Promise.all([
      verifyDestructiveAction(user, "correct password", context),
      verifyDestructiveAction(user, "correct password", { ...context, recordId: "source-2" }),
    ]);

    for (const client of [first, second]) {
      expect(client.query).toHaveBeenCalledWith(expect.stringContaining("pg_advisory_xact_lock"), [`destructive-reauth:${user.id}`]);
      expect(client.statements).toContain("COMMIT");
    }
  });
});
