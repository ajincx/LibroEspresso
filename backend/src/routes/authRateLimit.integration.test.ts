import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { LOGIN_RATE_LIMIT_MAX, LOGIN_RATE_LIMIT_WINDOW_MS } from "../middleware/loginRateLimit.js";

let app: Awaited<typeof import("../app.js")>["app"];

beforeAll(async () => {
  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL = "postgresql://unused:unused@localhost:5432/unused";
  process.env.CLIENT_URL = "http://localhost:5173";
  process.env.JWT_SECRET = "test-secret-that-is-at-least-32-characters";
  ({ app } = await import("../app.js"));
});

describe("login IP rate limiting", () => {
  it("keeps the approved 10 attempts per 15 minutes limit", async () => {
    expect(LOGIN_RATE_LIMIT_MAX).toBe(10);
    expect(LOGIN_RATE_LIMIT_WINDOW_MS).toBe(15 * 60 * 1_000);
    const statuses: number[] = [];
    for (let attempt = 0; attempt <= LOGIN_RATE_LIMIT_MAX; attempt += 1) {
      const response = await request(app).post("/api/auth/login").send({});
      statuses.push(response.status);
    }
    expect(statuses.slice(0, LOGIN_RATE_LIMIT_MAX).every((status) => status === 422)).toBe(true);
    expect(statuses.at(-1)).toBe(429);
  });
});
