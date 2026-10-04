import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ connect: vi.fn(), poolQuery: vi.fn(), writeAudit: vi.fn() }));
vi.mock("../config/database.js", () => ({ pool: { connect: mocks.connect, query: mocks.poolQuery } }));
vi.mock("../services/audit.service.js", () => ({ writeAudit: mocks.writeAudit }));

import { canMessageRecipient, deleteMessage, getConversation, listMessageContacts, sendMessage } from "./message.controller.js";

const branchA = "00000000-0000-4000-8000-000000000001";
const branchB = "00000000-0000-4000-8000-000000000002";
const users = {
  staffA: { id: "00000000-0000-4000-8000-000000000011", role: "STAFF", branchId: branchA },
  staffA2: { id: "00000000-0000-4000-8000-000000000012", role: "STAFF", branchId: branchA },
  staffB: { id: "00000000-0000-4000-8000-000000000013", role: "STAFF", branchId: branchB },
  managerA: { id: "00000000-0000-4000-8000-000000000021", role: "BRANCH_MANAGER", branchId: branchA },
  managerB: { id: "00000000-0000-4000-8000-000000000022", role: "BRANCH_MANAGER", branchId: branchB },
  owner: { id: "00000000-0000-4000-8000-000000000031", role: "OWNER", branchId: null },
} as const;
const response = () => ({ json: vi.fn() });

beforeEach(() => { vi.clearAllMocks(); mocks.writeAudit.mockResolvedValue(undefined); });

describe("direct-message recipient eligibility", () => {
  it.each([
    ["Staff to same-branch Staff", users.staffA, users.staffA2, true],
    ["Staff to same-branch Manager", users.staffA, users.managerA, true],
    ["Staff to other-branch Staff", users.staffA, users.staffB, false],
    ["Staff to other-branch Manager", users.staffA, users.managerB, false],
    ["Staff to Owner", users.staffA, users.owner, false],
    ["Manager to own-branch Staff", users.managerA, users.staffA, true],
    ["Manager to other Manager", users.managerA, users.managerB, true],
    ["Manager to Owner", users.managerA, users.owner, true],
    ["Manager to other-branch Staff", users.managerA, users.staffB, false],
    ["Owner to cross-branch Staff", users.owner, users.staffB, true],
    ["Owner to Manager", users.owner, users.managerA, true],
  ])("enforces %s", (_label, sender, recipient, expected) => {
    expect(canMessageRecipient(sender, recipient)).toBe(expected);
  });

  it("rejects a forged direct send to an ineligible recipient before any transaction starts", async () => {
    mocks.poolQuery.mockResolvedValueOnce({ rows: [{ ...users.staffB, firstName: "Other" }] });
    await expect(sendMessage({ user: users.staffA, body: { recipientUserId: users.staffB.id, body: "Hello" } } as never, {} as never, vi.fn()))
      .rejects.toMatchObject({ status: 403, code: "MESSAGE_SCOPE_FORBIDDEN" });
    expect(mocks.connect).not.toHaveBeenCalled();
  });

  it("returns only backend-scoped contacts for the authenticated role and branch", async () => {
    mocks.poolQuery.mockResolvedValueOnce({ rows: [] });
    const res=response();
    await listMessageContacts({ user: users.managerA } as never,res as never,vi.fn());
    expect(mocks.poolQuery.mock.calls[0]?.[0]).toContain("u.role='STAFF' AND u.branch_id=$3");
    expect(mocks.poolQuery.mock.calls[0]?.[1]).toEqual([users.managerA.id,"BRANCH_MANAGER",branchA]);
    expect(res.json).toHaveBeenCalledWith({success:true,data:{contacts:[]}});
  });

  it("denies opening a conversation with an ineligible participant", async () => {
    mocks.poolQuery.mockResolvedValueOnce({ rows: [{ ...users.staffB, firstName: "Other" }] });
    await expect(getConversation({user:users.staffA,params:{userId:users.staffB.id}} as never,response() as never,vi.fn()))
      .rejects.toMatchObject({status:403,code:"MESSAGE_SCOPE_FORBIDDEN"});
    expect(mocks.poolQuery).toHaveBeenCalledTimes(1);
  });
});

describe("direct-message soft deletion", () => {
  const messageId = "00000000-0000-4000-8000-000000000041";
  const client = (senderUserId: string) => ({
    query: vi.fn(async (statement: unknown) => {
      const sql = String(statement);
      if (sql.includes("FROM direct_messages WHERE id=$1")) return { rows: [{ senderUserId, recipientUserId: users.staffA2.id }] };
      return { rows: [] };
    }),
    release: vi.fn(),
  });

  it("soft-deletes the sender's own message and writes an audit entry", async () => {
    const db = client(users.staffA.id);
    mocks.connect.mockResolvedValue(db);
    const res = response();
    await deleteMessage({ user: users.staffA, params: { messageId } } as never, res as never, vi.fn());
    expect(db.query.mock.calls.some(([sql]) => String(sql).includes("SET deleted_at=now()"))).toBe(true);
    expect(mocks.writeAudit).toHaveBeenCalledWith(users.staffA, "DELETE_MESSAGE", "DIRECT_MESSAGE", messageId, expect.any(String), expect.any(Object), db);
    expect(db.query.mock.calls.at(-1)?.[0]).toBe("COMMIT");
    expect(res.json).toHaveBeenCalledWith({ success: true, data: { messageId } });
  });

  it("rejects deletion of another user's message and rolls back", async () => {
    const db = client(users.staffA2.id);
    mocks.connect.mockResolvedValue(db);
    await expect(deleteMessage({ user: users.staffA, params: { messageId } } as never, response() as never, vi.fn()))
      .rejects.toMatchObject({ status: 403, code: "MESSAGE_DELETE_FORBIDDEN" });
    expect(db.query.mock.calls.some(([sql]) => String(sql).includes("SET deleted_at=now()"))).toBe(false);
    expect(db.query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
  });
});
