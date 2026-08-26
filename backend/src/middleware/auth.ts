import type { RequestHandler } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import type { TokenUser, UserRole } from "../types/auth.js";
import { AppError } from "../utils/appError.js";
export { getEffectiveBranchId } from "../services/branchScope.js";

export const authenticate: RequestHandler = (req, _res, next) => {
  const token = req.cookies?.[env.COOKIE_NAME];
  if (!token) return next(new AppError(401, "UNAUTHENTICATED", "Authentication is required"));
  try { req.user = jwt.verify(token, env.JWT_SECRET) as TokenUser; next(); }
  catch { next(new AppError(401, "INVALID_SESSION", "Your session is invalid or expired")); }
};

export const authorize = (...roles: UserRole[]): RequestHandler => (req, _res, next) => {
  if (!req.user) return next(new AppError(401, "UNAUTHENTICATED", "Authentication is required"));
  if (!roles.includes(req.user.role)) return next(new AppError(403, "FORBIDDEN", "You do not have permission to access this resource"));
  next();
};
