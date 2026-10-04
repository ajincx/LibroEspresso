import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  poolConnect: vi.fn(),
  poolQuery: vi.fn(),
  writeAudit: vi.fn(),
}));

vi.mock("../config/database.js", () => ({
  pool: {
    connect: mocks.poolConnect,
    query: mocks.poolQuery,
  },
}));

vi.mock("../services/audit.service.js", () => ({
  writeAudit: mocks.writeAudit,
}));

import { submitShrinkageInvestigation } from "./inventoryWorkflow.controller.js";

const reportId = "11111111-1111-4111-8111-111111111111";
const branchId = "22222222-2222-4222-8222-222222222222";
const ingredientId = "33333333-3333-4333-8333-333333333333";
const managerId = "44444444-4444-4444-8444-444444444444";

const user = { id: managerId, role: "BRANCH_MANAGER", branchId };
const body = {
  classification: "PILFERAGE",
  explanation: "The available records confirm a verified pilferage investigation.",
  evidenceReviewConfirmed: true,
  evidenceBasis: ["PHYSICAL_COUNT"],
};

function request() {
  return { params: { id: reportId }, body, user } as never;
}

function response() {
  return { json: vi.fn() };
}

function createClient(options: {
  matchingNotificationExists?: boolean;
  notificationFailure?: Error;
} = {}) {
  const statements: string[] = [];
  let updateAttempts = 0;
  let insertedNotifications = 0;
  const query = vi.fn(async (statement: unknown, values?: unknown[]) => {
    const sql = String(statement);
    statements.push(sql);
    if (sql.startsWith("UPDATE shrinkage_reports")) {
      updateAttempts += 1;
      return updateAttempts === 1
        ? {
            rows: [{
              reportNo: "SR-2026-00001",
              inventoryItemId: ingredientId,
              varianceQuantity: -262,
              unit: "g",
            }],
            rowCount: 1,
          }
        : { rows: [], rowCount: 0 };
    }
    if (sql.includes("SELECT 1 FROM shrinkage_reports")) {
      return { rows: [{ exists: 1 }], rowCount: 1 };
    }
    if (sql.includes("SELECT ii.name") && sql.includes("CROSS JOIN branches")) {
      return { rows: [{ itemName: "Espresso Blend Beans", branchName: "Lipa" }], rowCount: 1 };
    }
    if (sql.includes("INSERT INTO notifications")) {
      if (options.notificationFailure) throw options.notificationFailure;
      const rowCount = options.matchingNotificationExists ? 0 : 1;
      insertedNotifications += rowCount;
      return { rows: [], rowCount };
    }
    return { rows: [], rowCount: 0, values };
  });
  return {
    query,
    release: vi.fn(),
    statements,
    insertedNotificationCount: () => insertedNotifications,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.writeAudit.mockResolvedValue(undefined);
  mocks.poolQuery.mockResolvedValue({ rows: [{ id: reportId, status: "VERIFIED" }] });
});

describe("shrinkage submission notification regression", () => {
  it("creates exactly one Owner notification and one submission audit for a valid detected report", async () => {
    const client = createClient();
    mocks.poolConnect.mockResolvedValue(client);
    const res = response();

    await submitShrinkageInvestigation(request(), res as never, vi.fn());

    const notificationCalls = client.query.mock.calls.filter(([sql]) =>
      String(sql).includes("INSERT INTO notifications"),
    );
    expect(notificationCalls).toHaveLength(1);
    expect(client.insertedNotificationCount()).toBe(1);
    expect(String(notificationCalls[0]![0])).toContain("'SHRINKAGE_SUBMITTED'");
    expect(String(notificationCalls[0]![0])).toContain("'SHRINKAGE_REPORT'");
    expect(notificationCalls[0]![1]).toEqual([
      branchId,
      "Lipa verified classification for Espresso Blend Beans. Shortage variance: 262g. Classification: PILFERAGE.",
      reportId,
    ]);
    expect(mocks.writeAudit).toHaveBeenCalledOnce();
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      user,
      "VERIFY_PILFERAGE_CLASSIFICATION",
      "SHRINKAGE_REPORT",
      reportId,
      "Verified investigation findings for SR-2026-00001",
      expect.objectContaining({ branchId, classification: "PILFERAGE" }),
      client,
    );
    expect(client.statements.at(-1)).toBe("COMMIT");
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it("rejects a repeated submission without another notification or audit", async () => {
    const client = createClient();
    mocks.poolConnect.mockResolvedValue(client);

    await submitShrinkageInvestigation(request(), response() as never, vi.fn());
    const originalNotificationCall = client.query.mock.calls.find(([sql]) =>
      String(sql).includes("INSERT INTO notifications"),
    );

    await expect(
      submitShrinkageInvestigation(request(), response() as never, vi.fn()),
    ).rejects.toMatchObject({
      status: 409,
      code: "INVESTIGATION_ALREADY_SUBMITTED",
    });

    const notificationCalls = client.query.mock.calls.filter(([sql]) =>
      String(sql).includes("INSERT INTO notifications"),
    );
    expect(notificationCalls).toHaveLength(1);
    expect(notificationCalls[0]).toEqual(originalNotificationCall);
    expect(client.insertedNotificationCount()).toBe(1);
    expect(mocks.writeAudit).toHaveBeenCalledOnce();
    expect(client.statements).toContain("ROLLBACK");
  });

  it("keeps the existing NOT EXISTS event guard when a matching notification already exists", async () => {
    const client = createClient({ matchingNotificationExists: true });
    mocks.poolConnect.mockResolvedValue(client);

    await submitShrinkageInvestigation(request(), response() as never, vi.fn());

    const notificationCall = client.query.mock.calls.find(([sql]) =>
      String(sql).includes("INSERT INTO notifications"),
    );
    const sql = String(notificationCall?.[0]);
    expect(sql).toContain("NOT EXISTS");
    expect(sql).toContain("n.recipient_user_id=u.id");
    expect(sql).toContain("n.type='SHRINKAGE_SUBMITTED'");
    expect(sql).toContain("n.entity_type='SHRINKAGE_REPORT'");
    expect(sql).toContain("n.entity_id=$3");
    expect(client.insertedNotificationCount()).toBe(0);
  });

  it("rolls back the report transition when notification creation fails", async () => {
    const client = createClient({ notificationFailure: new Error("notification insert failed") });
    mocks.poolConnect.mockResolvedValue(client);

    await expect(
      submitShrinkageInvestigation(request(), response() as never, vi.fn()),
    ).rejects.toThrow("notification insert failed");

    expect(client.statements[0]).toBe("BEGIN");
    expect(client.statements).toContain("ROLLBACK");
    expect(client.statements).not.toContain("COMMIT");
    expect(mocks.writeAudit).not.toHaveBeenCalled();
    expect(mocks.poolQuery).not.toHaveBeenCalled();
    expect(client.release).toHaveBeenCalledOnce();
  });
});
