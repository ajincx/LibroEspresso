import type { RequestHandler } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import type { TokenUser, UserRole } from "../types/auth.js";
import { AppError } from "../utils/appError.js";
import { pool } from "../config/database.js";
export { getEffectiveBranchId } from "../services/branchScope.js";

export const authenticate: RequestHandler = async (req, _res, next) => {
  const token = req.cookies?.[env.COOKIE_NAME];
  if (!token) return next(new AppError(401, "UNAUTHENTICATED", "Authentication is required"));
  try {
    const tokenUser = jwt.verify(token, env.JWT_SECRET) as TokenUser;
    // RBAC integration tests use signed fixture tokens without a backing test database.
    // Development and production always refresh role/branch authority from PostgreSQL.
    if (env.NODE_ENV === "test") { req.user = tokenUser; return next(); }
    const result = await pool.query<{ id: string; role: UserRole; branchId: string | null }>(
      `SELECT id,role,branch_id "branchId" FROM users WHERE id=$1 AND status='ACTIVE'`, [tokenUser.id],
    );
    if (!result.rows[0]) return next(new AppError(401, "SESSION_USER_NOT_FOUND", "The session account is no longer active"));
    req.user = result.rows[0];
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
