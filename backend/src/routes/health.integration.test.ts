import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { app } from "../app.js";
import { pool } from "../config/database.js";

describe("health and readiness", () => {
  afterEach(() => vi.restoreAllMocks());

  it("reports process health and returns a request correlation ID", async () => {
    const response = await request(app).get("/health").set("X-Request-ID", "health-check-1");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
    expect(response.headers["x-request-id"]).toBe("health-check-1");
  });

  it("reports database readiness without exposing an internal error", async () => {
    vi.spyOn(pool, "query").mockRejectedValueOnce(new Error("sensitive connection detail"));
    const response = await request(app).get("/ready");
    expect(response.status).toBe(503);
    expect(response.body).toEqual({ status: "not_ready", database: "unavailable" });
    expect(JSON.stringify(response.body)).not.toContain("sensitive connection detail");
  });

  it("hides stack traces from unexpected production errors", async () => {
    const response = await request(app).get("/route-that-does-not-exist");
    expect(response.status).toBe(404);
    expect(response.body.error).not.toHaveProperty("stack");
    expect(response.body.error.requestId).toBeTruthy();
  });
});
