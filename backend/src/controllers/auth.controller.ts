import type { RequestHandler } from "express";
import { env } from "../config/env.js";
import { authenticateCredentials, findCurrentUser, revokeSessionToken, signSession } from "../services/auth.service.js";
import { clearSessionCookie, sessionCookieOptions } from "../services/sessionCookie.service.js";
import { loginSchema } from "../validators/auth.js";
import { forgotPasswordInput,resetPasswordInput } from "../validators/passwordReset.js";
import { consumePasswordReset,requestPasswordReset } from "../services/passwordReset.service.js";

const requestContext = (req: Parameters<RequestHandler>[0]) => ({
  ipAddress: req.ip,
  userAgent: req.get("user-agent"),
});
export const login: RequestHandler = async (req, res) => {
  const input = loginSchema.parse(req.body);
  const authenticated = await authenticateCredentials(input.identifier, input.password, requestContext(req));
  const user = authenticated.user;
  res.cookie(env.COOKIE_NAME, signSession({ id: user.id, role: user.role, branchId: user.branchId }, authenticated.sessionIdentifier), sessionCookieOptions());
  res.json({ success: true, data: { user } });
};
export const logout: RequestHandler = async (req, res) => {
  await revokeSessionToken(req.cookies?.[env.COOKIE_NAME], requestContext(req));
  clearSessionCookie(res);
  res.json({ success: true, data: {} });
};
export const me: RequestHandler = async (req, res) => { const user = await findCurrentUser(req.user!.id); res.json({ success: true, data: { user } }); };
export const forgotPassword:RequestHandler=async(req,res)=>{const {email}=forgotPasswordInput.parse(req.body);try{await requestPasswordReset(email,requestContext(req));}catch{console.error("Password reset delivery failed");}res.json({success:true,data:{message:"If an active account uses that email, a password reset link will be sent."}});};
export const resetPassword:RequestHandler=async(req,res)=>{const input=resetPasswordInput.parse(req.body);await consumePasswordReset(input.token,input.password);clearSessionCookie(res);res.json({success:true,data:{message:"Password reset completed. Sign in with your new password."}});};
