import { afterEach, describe, expect, it, vi } from "vitest";
import { api, subscribeToSessionExpired } from "./api";

afterEach(() => vi.unstubAllGlobals());

describe("API Client Configuration & Interceptors", () => {
  it("configures withCredentials and default JSON headers", () => {
    expect(api.defaults.withCredentials).toBe(true);
    expect(api.defaults.headers["Content-Type"]).toBe("application/json");
  });

  it("extracts and formats error messages from backend response payloads", async () => {
    const customError = Object.assign(new Error("Default Axios Error"), {
      response: {
        data: {
          error: {
            code: "BRANCH_REQUIRED",
            message: "A branch is required for this operation",
          },
        },
      },
    });

    const request = api.get("/test-error", {
      adapter: async () => Promise.reject(customError),
    });

    await expect(request).rejects.toMatchObject({
      message: "A branch is required for this operation",
    });
  });

  it("signals authentication cleanup for a backend-expired session", async () => {
    const values = new Map<string, string>();
    const fakeWindow = Object.assign(new EventTarget(), {
      sessionStorage: {
        setItem: (key: string, value: string) => values.set(key, value),
        getItem: (key: string) => values.get(key) ?? null,
        removeItem: (key: string) => values.delete(key),
      },
    });
    vi.stubGlobal("window", fakeWindow);
    const clearAuth = vi.fn();
    const unsubscribe = subscribeToSessionExpired(clearAuth);
    const expired = Object.assign(new Error("expired"), {
      response: { status: 401, data: { error: { code: "SESSION_EXPIRED_IDLE", message: "Session expired" } } },
    });

    await expect(api.get("/protected", { adapter: async () => Promise.reject(expired) })).rejects.toBe(expired);

    expect(clearAuth).toHaveBeenCalledOnce();
    expect(values.get("libro.auth.message")).toBe("Your session has expired. Please sign in again.");
    unsubscribe();
  });

  it("does not treat an ordinary authorization failure as session expiration", async () => {
    const dispatchEvent = vi.fn();
    vi.stubGlobal("window", { sessionStorage: { setItem: vi.fn() }, dispatchEvent });
    const forbidden = Object.assign(new Error("forbidden"), {
      response: { status: 403, data: { error: { code: "FORBIDDEN", message: "Not allowed" } } },
    });
    await expect(api.get("/owner-only", { adapter: async () => Promise.reject(forbidden) })).rejects.toBe(forbidden);
    expect(dispatchEvent).not.toHaveBeenCalled();
  });
});
