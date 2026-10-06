import * as rateLimitModule from "express-rate-limit";
import type { Options, RateLimitRequestHandler } from "express-rate-limit";

type RateLimitFactory = (options?: Partial<Options>) => RateLimitRequestHandler;

const rateLimitCandidate: unknown =
  typeof rateLimitModule.default === "function"
    ? rateLimitModule.default
    : typeof rateLimitModule.rateLimit === "function"
      ? rateLimitModule.rateLimit
      : rateLimitModule;
if (typeof rateLimitCandidate !== "function") {
  throw new TypeError("Login rate-limit middleware factory is unavailable");
}
const rateLimit = rateLimitCandidate as RateLimitFactory;

export const LOGIN_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1_000;
export const LOGIN_RATE_LIMIT_MAX = 10;

export const loginLimiter = rateLimit({
  windowMs: LOGIN_RATE_LIMIT_WINDOW_MS,
  limit: LOGIN_RATE_LIMIT_MAX,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: "LOGIN_RATE_LIMITED",
      message: "Too many sign-in attempts. Please try again later.",
    },
  },
});
