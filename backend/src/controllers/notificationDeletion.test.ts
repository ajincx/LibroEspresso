import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const mocks = vi.hoisted(() => ({
  poolConnect: vi.fn(),
  poolQuery: vi.fn(),
}));

vi.mock("../config/database.js", () => ({
  pool: {
    connect: mocks.poolConnect,
    query: mocks.poolQuery,
  },
}));

import {
  deleteAllNotifications,
  deleteNotification,
} from "./inventoryWorkflow.controller.js";
import { notificationRouter } from "../routes/inventoryWorkflow.routes.js";
import { errorHandler } from "../middleware/error.js";

const notificationId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";

const controllerRequest = (params: Record<string, string> = {}) =>
  ({ params, user: { id: userId, role: "OWNER", branchId: null } }) as never;
const response = () => ({ json: vi.fn() });

beforeEach(() => vi.clearAllMocks());

describe("notification deletion", () => {
  it("requires authentication for both delete endpoints", async () => {
    const app = express();
    app.use("/notifications", notificationRouter);
    app.use(errorHandler);

    await request(app).delete(`/notifications/${notificationId}`).expect(401);
    await request(app).delete("/notifications").expect(401);
    expect(mocks.poolQuery).not.toHaveBeenCalled();
    expect(mocks.poolConnect).not.toHaveBeenCalled();
  });

  it("deletes one notification only when it belongs to the authenticated user", async () => {
    mocks.poolQuery.mockResolvedValue({ rows: [{ id: notificationId }], rowCount: 1 });
    const res = response();

    await deleteNotification(controllerRequest({ id: notificationId }), res as never, vi.fn());

    const [sql, values] = mocks.poolQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("DELETE FROM notifications");
    expect(sql).toContain("id=$1 AND recipient_user_id=$2");
    expect(values).toEqual([notificationId, userId]);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { id: notificationId, deleted: true },
    });
  });

  it("is idempotent and does not reveal a missing or differently owned notification", async () => {
    mocks.poolQuery.mockResolvedValue({ rows: [], rowCount: 0 });
    const res = response();

    await deleteNotification(controllerRequest({ id: notificationId }), res as never, vi.fn());

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { id: notificationId, deleted: false },
    });
  });

  it("deletes all rows for only the authenticated recipient in one transaction", async () => {
    const client = {
      query: vi.fn()
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rowCount: 3 })
        .mockResolvedValueOnce({}),
      release: vi.fn(),
    };
    mocks.poolConnect.mockResolvedValue(client);
    const res = response();

    await deleteAllNotifications(controllerRequest(), res as never, vi.fn());

    expect(client.query).toHaveBeenNthCalledWith(1, "BEGIN");
    expect(client.query).toHaveBeenNthCalledWith(
      2,
      "DELETE FROM notifications WHERE recipient_user_id=$1",
      [userId],
    );
    expect(client.query).toHaveBeenNthCalledWith(3, "COMMIT");
    expect(client.release).toHaveBeenCalledOnce();
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { deleted: 3 },
    });
  });

  it("rolls back and releases the client when delete all fails", async () => {
    const client = {
      query: vi.fn(async (sql: string) => {
        if (sql.startsWith("DELETE")) throw new Error("database unavailable");
        return {};
      }),
      release: vi.fn(),
    };
    mocks.poolConnect.mockResolvedValue(client);

    await expect(
      deleteAllNotifications(controllerRequest(), response() as never, vi.fn()),
    ).rejects.toThrow("database unavailable");

    expect(client.query).toHaveBeenCalledWith("ROLLBACK");
    expect(client.release).toHaveBeenCalledOnce();
    expect(client.query.mock.calls.flat().join(" ")).not.toMatch(
      /pos_sales|inventory_counts|purchase_orders|shrinkage_reports|audit_logs/i,
    );
  });
});
