import { describe, expect, it, vi } from "vitest";

vi.mock("../config/env.js", () => ({ env: { NODE_ENV: "production", COOKIE_NAME: "libro_session" } }));

import { sessionCookieOptions } from "./sessionCookie.service.js";

describe("authentication cookie", () => {
  it("is protected and cannot outlive the eight-hour server session", () => {
    expect(sessionCookieOptions()).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 8 * 60 * 60 * 1_000,
      path: "/",
    });
  });
});
