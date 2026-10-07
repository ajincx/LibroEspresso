import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../utils/appError.js";

const mocks = vi.hoisted(() => ({ validateSessionToken: vi.fn() }));
vi.mock("../config/env.js", () => ({ env: { COOKIE_NAME: "libro_session" } }));
vi.mock("../services/auth.service.js", () => ({ validateSessionToken: mocks.validateSessionToken }));

import { authenticate } from "./auth.js";

const response = () => ({ setHeader: vi.fn() });

describe("authentication middleware error classification", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns a retryable service error for session-store infrastructure failures", async () => {
    mocks.validateSessionToken.mockRejectedValue(new Error("timeout exceeded when trying to connect"));
    const next = vi.fn();

    await authenticate({ cookies: { libro_session: "signed-token" } } as never, response() as never, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({
      status: 503,
      code: "AUTH_SESSION_UNAVAILABLE",
      message: "Authentication service is temporarily unavailable",
    }));
  });

  it("preserves explicit invalid and expired session errors", async () => {
    const invalid = new AppError(401, "INVALID_SESSION", "Your session is invalid or expired");
    mocks.validateSessionToken.mockRejectedValue(invalid);
    const next = vi.fn();

    await authenticate({ cookies: { libro_session: "invalid-token" } } as never, response() as never, next);

    expect(next).toHaveBeenCalledWith(invalid);
  });

  it("marks authenticated responses private and non-cacheable", async () => {
    mocks.validateSessionToken.mockResolvedValue({ id: "owner", role: "OWNER", branchId: null, sessionId: "session" });
    const res = response();
    const next = vi.fn();

    await authenticate({ cookies: { libro_session: "signed-token" } } as never, res as never, next);

    expect(res.setHeader).toHaveBeenCalledWith("Cache-Control", "private, no-store");
    expect(next).toHaveBeenCalledWith();
  });
});
