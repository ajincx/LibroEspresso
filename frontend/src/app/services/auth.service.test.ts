import { afterEach, describe, expect, it, vi } from "vitest";
import { loginErrorMessage, REMEMBER_ME_ENABLED } from "../modules/authentication/LoginPage";
import { api } from "./api";
import { authService } from "./auth.service";

afterEach(() => vi.restoreAllMocks());

describe("authentication client", () => {
  it("does not send a Remember Me option", async () => {
    const user = { id: "user-1" };
    const post = vi.spyOn(api, "post").mockResolvedValue({ data: { success: true, data: { user } } });
    await authService.login("manager@libro.com", "secure-password");
    expect(post).toHaveBeenCalledWith("/auth/login", { identifier: "manager@libro.com", password: "secure-password" });
  });

  it("keeps the Remember Me control out of the login page", () => {
    expect(REMEMBER_ME_ENABLED).toBe(false);
  });

  it("presents account-lock errors without exposing extra account details", () => {
    const safeMessage = "Too many unsuccessful sign-in attempts. Please try again later.";
    expect(loginErrorMessage(new Error(safeMessage))).toBe(safeMessage);
    expect(loginErrorMessage(new Error("database connection failed"))).toBe("Unable to sign in. Please try again.");
  });
});
