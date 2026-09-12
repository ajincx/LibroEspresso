import type { RequestHandler } from "express";
import { env } from "../config/env.js";
import type { UserRole } from "../types/auth.js";
import { AppError } from "../utils/appError.js";
import { validateSessionToken } from "../services/auth.service.js";
export { getEffectiveBranchId } from "../services/branchScope.js";

export const authenticate: RequestHandler = async (req, _res, next) => {
  const token = req.cookies?.[env.COOKIE_NAME];
  if (!token) return next(new AppError(401, "UNAUTHENTICATED", "Authentication is required"));
  try {
    req.user = await validateSessionToken(token);
    next();
  } catch (error) {
    if (error instanceof AppError) return next(error);
    next(new AppError(401, "INVALID_SESSION", "Your session is invalid or expired"));
  }
};

export const authorize = (...roles: UserRole[]): RequestHandler => (req, _res, next) => {
  if (!req.user) return next(new AppError(401, "UNAUTHENTICATED", "Authentication is required"));
  if (!roles.includes(req.user.role)) return next(new AppError(403, "FORBIDDEN", "You do not have permission to access this resource"));
  next();
};
