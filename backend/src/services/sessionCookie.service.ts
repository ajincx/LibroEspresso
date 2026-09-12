import type { CookieOptions, Response } from "express";
import { env } from "../config/env.js";
import { SESSION_ABSOLUTE_TIMEOUT_MS } from "./sessionSecurity.service.js";

export const sessionCookieOptions = (): CookieOptions => ({
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: "lax",
  maxAge: SESSION_ABSOLUTE_TIMEOUT_MS,
  path: "/",
});

export const clearSessionCookie = (res: Response) => {
  const { maxAge: _maxAge, ...options } = sessionCookieOptions();
  res.clearCookie(env.COOKIE_NAME, options);
};
