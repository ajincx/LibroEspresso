import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcrypt";
import { pool } from "../config/database.js";
import { env } from "../config/env.js";
import { AppError } from "../utils/appError.js";
import { revokeAllUserSessions } from "./auth.service.js";
import { emailDeliveryConfigured, sendExternalEmail } from "./emailTransport.service.js";

const RESET_TTL_MS=30*60*1000;
const tokenHash=(token:string)=>createHash("sha256").update(token).digest("hex");
export const passwordResetEmailConfigured=()=>emailDeliveryConfigured();

function escapeHtml(value:string) {
  return value.replace(/[&<>"']/g,(character)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[character]!);
}

export function buildPasswordResetEmail(resetUrl:string) {
  const safeUrl=escapeHtml(resetUrl);
  return {
    subject:"Reset Your Password | Libro Espresso",
    text:[
      "Hello,",
      "",
      "We received a request to reset the password for your Libro Espresso account.",
      "",
      "To create a new password, open this secure link:",
      resetUrl,
      "",
      "For your security, this link will expire in 30 minutes and can only be used once.",
      "",
      "If you did not request a password reset, you can safely ignore this email. Your password will remain unchanged.",
      "For security reasons, please do not share this link with anyone.",
      "",
      "Best regards,",
      "Libro Espresso Team",
      "",
      "This is an automated message. Please do not reply.",
    ].join("\n"),
    html:`<!doctype html><html><body style="margin:0;background:#f5f1ed;color:#2d2526;font-family:Arial,sans-serif"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f1ed;padding:24px 12px"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border:1px solid #eadfe0;border-radius:16px;overflow:hidden"><tr><td style="height:6px;background:#7b1e2b"></td></tr><tr><td style="padding:32px"><p style="margin:0 0 8px;color:#7b1e2b;font-size:13px;font-weight:700;letter-spacing:.08em">LIBRO ESPRESSO</p><h1 style="margin:0 0 24px;font-size:26px;line-height:1.25">Reset your password</h1><p style="margin:0 0 16px;line-height:1.6">Hello,</p><p style="margin:0 0 16px;line-height:1.6">We received a request to reset the password for your Libro Espresso account.</p><p style="margin:0 0 24px;line-height:1.6">To create a new password, please click the button below.</p><p style="margin:0 0 24px"><a href="${safeUrl}" style="display:inline-block;border-radius:10px;background:#7b1e2b;padding:13px 22px;color:#ffffff;font-weight:700;text-decoration:none">Reset Password</a></p><p style="margin:0 0 16px;line-height:1.6">For your security, this link will expire in 30 minutes and can only be used once.</p><p style="margin:0 0 16px;line-height:1.6">If you did not request a password reset, you can safely ignore this email. Your password will remain unchanged.</p><p style="margin:0 0 24px;line-height:1.6">For security reasons, please do not share this link with anyone.</p><p style="margin:0;line-height:1.6">Best regards,<br><strong>Libro Espresso Team</strong></p></td></tr><tr><td style="border-top:1px solid #eadfe0;background:#fbf8f6;padding:18px 32px;color:#766b6d;font-size:12px;text-align:center">This is an automated message. Please do not reply.</td></tr></table></td></tr></table></body></html>`,
  };
}

export async function deliverResetEmail(email:string,token:string) {
  if(!passwordResetEmailConfigured()) return false;
  const url=new URL(env.PASSWORD_RESET_URL_BASE!);url.searchParams.set("token",token);
  await sendExternalEmail({to:email,...buildPasswordResetEmail(url.toString())});
  return true;
}

export async function requestPasswordReset(email:string,context:{ipAddress?:string|null;userAgent?:string|null},now=new Date()) {
  if(!passwordResetEmailConfigured()) return {deliveryConfigured:false};
  const result=await pool.query<{id:string;email:string;branch_id:string|null}>("SELECT id,email,branch_id FROM users WHERE lower(email)=lower($1) AND status='ACTIVE' LIMIT 1",[email]);
  const user=result.rows[0];if(!user)return {deliveryConfigured:true};
  const rawToken=randomBytes(32).toString("hex");
  const client=await pool.connect();
  try{await client.query("BEGIN");await client.query("SELECT id FROM users WHERE id=$1 FOR UPDATE",[user.id]);await client.query("UPDATE password_reset_tokens SET consumed_at=$2 WHERE user_id=$1 AND consumed_at IS NULL",[user.id,now]);await client.query("INSERT INTO password_reset_tokens(user_id,token_hash,expires_at,request_ip,user_agent) VALUES($1,$2,$3,$4,$5)",[user.id,tokenHash(rawToken),new Date(now.getTime()+RESET_TTL_MS),context.ipAddress?.slice(0,64)||null,context.userAgent?.slice(0,255)||null]);await client.query("COMMIT");}
  catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
  try{await deliverResetEmail(user.email,rawToken);}catch(error){await pool.query("UPDATE password_reset_tokens SET consumed_at=now() WHERE token_hash=$1 AND consumed_at IS NULL",[tokenHash(rawToken)]);throw error;}
  return {deliveryConfigured:true};
}

export async function consumePasswordReset(token:string,password:string,now=new Date()) {
  const client=await pool.connect();
  try{await client.query("BEGIN");const result=await client.query<{id:string;user_id:string;branch_id:string|null;status:string}>(`SELECT prt.id,prt.user_id,u.branch_id,u.status FROM password_reset_tokens prt JOIN users u ON u.id=prt.user_id WHERE prt.token_hash=$1 FOR UPDATE OF prt,u`,[tokenHash(token)]);const row=result.rows[0];if(!row||row.status!=="ACTIVE")throw new AppError(400,"PASSWORD_RESET_INVALID","This password reset link is invalid or has already been used");const claimed=await client.query("UPDATE password_reset_tokens SET consumed_at=$2 WHERE id=$1 AND consumed_at IS NULL AND expires_at>$2 RETURNING id",[row.id,now]);if(!claimed.rowCount)throw new AppError(400,"PASSWORD_RESET_INVALID","This password reset link is invalid, expired, or has already been used");const hash=await bcrypt.hash(password,12);await client.query("UPDATE users SET password_hash=$2,failed_login_attempts=0,locked_until=NULL,updated_at=$3 WHERE id=$1",[row.user_id,hash,now]);await revokeAllUserSessions(row.user_id,"PASSWORD_RESET",client,now);await client.query(`INSERT INTO audit_logs(user_id,branch_id,action,entity_type,entity_id,description,metadata) VALUES($1::uuid,$2,'PASSWORD_RESET','AUTH_SESSION',$1::text,'Password reset completed; active sessions revoked','{}'::jsonb)`,[row.user_id,row.branch_id]);await client.query("COMMIT");}
  catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
}
