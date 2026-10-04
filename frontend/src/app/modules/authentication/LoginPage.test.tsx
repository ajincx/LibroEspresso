import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loginErrorMessage, loginValidationMessage } from "./LoginPage";

describe("login input validation", () => {
  it.each([
    ["", "", "Enter your email address and password."],
    ["", "password123", "Enter your email address."],
    ["john@gmail.com", "", "Enter your password."],
    ["john@gmail.com", "short", "Password must be at least 8 characters."],
    ["john", "password123", "Enter a valid email address."],
    ["john@", "password123", "Enter a valid email address."],
    ["gmail.com", "password123", "Enter a valid email address."],
    ["john@gmail", "password123", "Enter a valid email address."],
    ["john@gmail.com", "12345678", null],
    ["john@gmail.com", "password123", null],
    [" john.doe@company.com ", "password123", null],
  ])("validates email %j and the current password state", (email, password, expected) => {
    expect(loginValidationMessage(email, password)).toBe(expected);
  });

  it("keeps invalid input out of the authentication-request path", () => {
    const onLogin = vi.fn();
    for (const [email, password] of [["", ""], ["john", "password123"], ["john@gmail.com", ""], ["john@gmail.com", "short"]]) {
      expect(loginValidationMessage(email, password)).not.toBeNull();
      if (!loginValidationMessage(email, password)) onLogin(email, password);
    }
    expect(onLogin).not.toHaveBeenCalled();
  });

  it.each(["12345678", "password123"])("allows an authentication request for an %s password", (password) => {
    const onLogin = vi.fn();
    const email = "john@gmail.com";
    if (!loginValidationMessage(email, password)) onLogin(email, password);
    expect(onLogin).toHaveBeenCalledWith(email, password);
  });
});

describe("login authentication errors", () => {
  it("distinguishes an unknown email from an incorrect password using stable backend codes", () => {
    const unknownEmail = { response: { data: { error: { code: "ACCOUNT_NOT_FOUND" } } } };
    const wrongPassword = { response: { data: { error: { code: "INVALID_PASSWORD" } } } };
    expect(loginErrorMessage(unknownEmail)).toBe("Account not found. Please check your email address.");
    expect(loginErrorMessage(wrongPassword)).toBe("Incorrect password. Please try again.");
  });

  it("preserves the existing inactive-account and lockout presentations", () => {
    expect(loginErrorMessage({ response: { data: { error: { code: "ACCOUNT_INACTIVE" } } } }))
      .toBe("This account is inactive. Please contact your administrator.");
    expect(loginErrorMessage(new Error("Too many unsuccessful sign-in attempts. Please try again later.")))
      .toBe("Too many unsuccessful sign-in attempts. Please try again later.");
  });

  it("uses the generic fallback only for an unexpected server or network failure", () => {
    expect(loginErrorMessage(new Error("Network Error"))).toBe("Unable to sign in. Please try again.");
  });

  it("does not silently accept the removed INVALID_CREDENTIALS contract", () => {
    expect(loginErrorMessage({ response: { data: { error: { code: "INVALID_CREDENTIALS" } } } }))
      .toBe("Unable to sign in. Please try again.");
  });
});

describe("rendered login errors", () => {
  afterEach(() => {
    vi.doUnmock("react");
    vi.resetModules();
  });

  async function renderLoginWithRejectedReason(reason: unknown) {
    let stateCall = 0;
    let renderedError = "";
    vi.resetModules();
    vi.doMock("react", async () => {
      const actual = await vi.importActual<typeof import("react")>("react");
      return {
        ...actual,
        useEffect: vi.fn(),
        useState: vi.fn((initial: unknown) => {
          const states: unknown[] = ["manager@libro.com", "password", false, false, renderedError];
          const value = states[stateCall] ?? initial;
          stateCall += 1;
          return [value, vi.fn()];
        }),
      };
    });
    const React = await import("react");
    const loginModule = await import("./LoginPage");
    renderedError = loginModule.loginErrorMessage(reason);
    const markup = renderToStaticMarkup(
      React.createElement(loginModule.LoginPage, { onLogin: vi.fn() }),
    );
    return markup;
  }

  it.each([
    [
      "ACCOUNT_NOT_FOUND",
      { response: { data: { error: { code: "ACCOUNT_NOT_FOUND" } } } },
      "Account not found. Please check your email address.",
    ],
    [
      "INVALID_PASSWORD",
      { response: { data: { error: { code: "INVALID_PASSWORD" } } } },
      "Incorrect password. Please try again.",
    ],
    [
      "ACCOUNT_INACTIVE",
      { response: { data: { error: { code: "ACCOUNT_INACTIVE" } } } },
      "This account is inactive. Please contact your administrator.",
    ],
    ["unexpected error", new Error("Network Error"), "Unable to sign in. Please try again."],
  ])("renders the %s rejection in the real LoginPage alert", async (_caseName, reason, expected) => {
    const markup = await renderLoginWithRejectedReason(reason);
    expect(markup).toContain('class="login-error"');
    expect(markup).toContain('role="alert"');
    expect(markup).toContain(expected);
  });
});
