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

export async function deliverResetEmail(email:string,token:string) {
  if(!passwordResetEmailConfigured()) return false;
  const url=new URL(env.PASSWORD_RESET_URL_BASE!);url.searchParams.set("token",token);
  await sendExternalEmail({to:email,subject:"Reset your Libro Espresso password",text:`Use this secure link within 30 minutes: ${url.toString()}`,html:`<p>Use this secure link within 30 minutes:</p><p><a href="${url.toString()}">Reset password</a></p>`});
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
