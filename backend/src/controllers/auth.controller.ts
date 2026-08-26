import type { RequestHandler } from "express";
import { env } from "../config/env.js";
import { authenticateCredentials, findCurrentUser, signSession } from "../services/auth.service.js";
import { loginSchema } from "../validators/auth.js";

const cookieOptions = (remember = false) => ({ httpOnly: true, secure: env.NODE_ENV === "production", sameSite: "lax" as const, ...(remember ? { maxAge: 30 * 24 * 60 * 60 * 1000 } : {}), path: "/" });
export const login: RequestHandler = async (req, res) => {
  const input = loginSchema.parse(req.body);
  const user = await authenticateCredentials(input.identifier, input.password);
  res.cookie(env.COOKIE_NAME, signSession({ id: user.id, role: user.role, branchId: user.branchId }, input.remember), cookieOptions(input.remember));
  res.json({ success: true, data: { user } });
};
export const logout: RequestHandler = async (_req, res) => { res.clearCookie(env.COOKIE_NAME, cookieOptions()); res.json({ success: true, data: {} }); };
export const me: RequestHandler = async (req, res) => { const user = await findCurrentUser(req.user!.id); res.json({ success: true, data: { user } }); };
