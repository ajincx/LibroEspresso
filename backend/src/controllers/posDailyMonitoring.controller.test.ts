import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ poolQuery: vi.fn() }));

vi.mock("../config/database.js", () => ({ pool: { query: mocks.poolQuery } }));
vi.mock("../config/env.js", () => ({ env: { POS_REMINDER_HOUR_MANILA: 22, POS_REMINDER_MINUTE_MANILA: 0 } }));

import { listDailyPosStatus, runDailyPosReminderJob } from "./posDailyMonitoring.controller.js";

describe("daily POS reminder persistence", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses an idempotent in-app notification insert after the Manila cutoff", async () => {
    mocks.poolQuery.mockResolvedValueOnce({ rows: [{ id: "notification-1" }], rowCount: 1 });
    const result = await runDailyPosReminderJob(new Date("2026-09-27T14:05:00.000Z"));
    expect(result).toEqual({ created: 1 });
    const [sql, values] = mocks.poolQuery.mock.calls[0]!;
    expect(String(sql)).toContain("NOT EXISTS(SELECT 1 FROM notifications existing");
    expect(String(sql)).toContain("existing.entity_id=source.id");
    expect(values).toEqual(["2026-09-27"]);
  });

  it("does not create reminders before the configured cutoff", async () => {
    expect(await runDailyPosReminderJob(new Date("2026-09-27T13:59:00.000Z"))).toEqual({ created: 0 });
    expect(mocks.poolQuery).not.toHaveBeenCalled();
  });

  it("rejects an unassigned Branch Manager instead of exposing all branches", async () => {
    await expect(listDailyPosStatus({
      query: {},
      user: { id: "manager-1", role: "BRANCH_MANAGER", branchId: null },
    } as never, { json: vi.fn() } as never, vi.fn())).rejects.toMatchObject({ status: 403, code: "BRANCH_NOT_ASSIGNED" });
    expect(mocks.poolQuery).not.toHaveBeenCalled();
  });

  it("allows the Owner to retrieve all active branches over a historical range", async () => {
    mocks.poolQuery.mockResolvedValueOnce({ rows: [] });
    const json=vi.fn();
    await listDailyPosStatus({
      query:{startDate:"2026-09-21",endDate:"2026-09-27"},
      user:{id:"00000000-0000-4000-8000-000000000001",role:"OWNER",branchId:null},
    } as never,{json} as never,vi.fn());
    const [sql,values]=mocks.poolQuery.mock.calls[0]!;
    expect(String(sql)).toContain("CROSS JOIN dates");
    expect(String(sql)).toContain("pi.completed_at IS NOT NULL");
    expect(String(sql)).not.toContain("pi.is_test_data");
    expect(String(sql)).not.toContain("inventory_counts");
    expect(values).toEqual(["2026-09-21","2026-09-27",null]);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({success:true,data:expect.objectContaining({startDate:"2026-09-21",endDate:"2026-09-27"})}));
  });

  it("enforces the Manager's assigned branch even when another branch is requested", async () => {
    mocks.poolQuery.mockResolvedValueOnce({ rows: [] });
    await listDailyPosStatus({
      query:{businessDate:"2026-09-27",branchId:"00000000-0000-4000-8000-000000000099"},
      user:{id:"00000000-0000-4000-8000-000000000002",role:"BRANCH_MANAGER",branchId:"00000000-0000-4000-8000-000000000003"},
    } as never,{json:vi.fn()} as never,vi.fn());
    expect(mocks.poolQuery.mock.calls[0]![1]).toEqual(["2026-09-27","2026-09-27","00000000-0000-4000-8000-000000000003"]);
  });
});
