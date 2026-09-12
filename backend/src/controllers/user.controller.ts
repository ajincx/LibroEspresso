import bcrypt from "bcrypt";
import type { RequestHandler } from "express";
import { pool } from "../config/database.js";
import { writeAudit } from "../services/audit.service.js";
import { revokeAllUserSessions } from "../services/auth.service.js";
import { AppError } from "../utils/appError.js";
import { idParams, statusSchema, userCreate, userPatch } from "../validators/masterData.js";

const selection = `SELECT u.id,u.branch_id "branchId",u.first_name "firstName",u.last_name "lastName",u.email,u.username,u.phone_number "phoneNumber",u.position,u.role,u.status,u.last_login_at "lastLoginAt",u.created_at "createdAt",u.updated_at "updatedAt",b.code "branchCode",b.name "branchName",
  GREATEST(u.updated_at,u.last_login_at,activity.created_at) "lastActivityAt",
  CASE WHEN activity.created_at IS NOT NULL AND activity.created_at>=u.updated_at AND (u.last_login_at IS NULL OR activity.created_at>=u.last_login_at) THEN activity.description
       WHEN u.last_login_at IS NOT NULL AND u.last_login_at>=u.updated_at THEN 'Signed in to the system'
       ELSE 'Account information updated' END "lastActivityDescription"
  FROM users u LEFT JOIN branches b ON b.id=u.branch_id
  LEFT JOIN LATERAL (SELECT al.created_at,al.description FROM audit_logs al WHERE al.user_id=u.id ORDER BY al.created_at DESC LIMIT 1) activity ON true`;
export const listUsers: RequestHandler = async (_req, res) => { res.set("Cache-Control", "no-store"); const result = await pool.query(`${selection} ORDER BY u.created_at`); res.json({ success: true, data: { users: result.rows } }); };
export const getUser: RequestHandler = async (req, res) => { const { id } = idParams.parse(req.params); const result = await pool.query(`${selection} WHERE u.id=$1`, [id]); if (!result.rows[0]) throw new AppError(404,"USER_NOT_FOUND","User not found"); res.json({ success: true, data: { user: result.rows[0] } }); };
export const createUser: RequestHandler = async (req, res) => {
  const input = userCreate.parse(req.body); const passwordHash = await bcrypt.hash(input.password, 12);
  const defaultPosition = input.role === "OWNER" ? "Owner / System Administrator" : input.role === "BRANCH_MANAGER" ? "Branch Manager" : "Staff";
  const result = await pool.query(`INSERT INTO users (branch_id,first_name,last_name,email,username,phone_number,position,password_hash,role,status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`, [input.branchId,input.firstName,input.lastName,input.email,input.username,input.phoneNumber??null,input.position??defaultPosition,passwordHash,input.role,input.status]);
  await writeAudit(req.user!,"CREATE_USER","USER",result.rows[0].id,`Created ${input.role} account`,{ role: input.role, branchId: input.branchId });
  const created = await pool.query(`${selection} WHERE u.id=$1`, [result.rows[0].id]); res.status(201).json({ success: true, data: { user: created.rows[0] } });
};
export const updateUser: RequestHandler = async (req, res) => {
  const { id } = idParams.parse(req.params);
  const input = userPatch.parse(req.body);
  const current = await pool.query<{ role: "OWNER"|"BRANCH_MANAGER"|"STAFF"; branch_id: string|null }>("SELECT role,branch_id FROM users WHERE id=$1", [id]);
  if (!current.rows[0]) throw new AppError(404, "USER_NOT_FOUND", "User not found");
  const role = input.role ?? current.rows[0].role;
  const branchId = input.branchId !== undefined ? input.branchId : current.rows[0].branch_id;
  if ((role === "OWNER" && branchId !== null) || (role !== "OWNER" && !branchId)) {
    throw new AppError(422, "INVALID_BRANCH_ASSIGNMENT", "Owner branch must be empty; Manager and Staff require an assigned branch");
  }
  if (id === req.user!.id && role !== "OWNER") {
    throw new AppError(409, "SELF_ROLE_CHANGE", "You cannot remove your own Owner access");
  }
  if (current.rows[0].role === "OWNER" && role !== "OWNER") {
    const owners = await pool.query<{ count: string }>("SELECT count(*) count FROM users WHERE role='OWNER' AND status='ACTIVE'");
    if (Number(owners.rows[0]?.count ?? 0) <= 1) throw new AppError(409, "LAST_OWNER", "The system must retain at least one active Owner");
  }
  if (role === "BRANCH_MANAGER" || role === "STAFF") {
    const branch = await pool.query("SELECT 1 FROM branches WHERE id=$1 AND status='ACTIVE'", [branchId]);
    if (!branch.rows[0]) throw new AppError(422, "INVALID_BRANCH", "Select an active branch for the Manager or Staff account");
  }
  const passwordHash = input.password ? await bcrypt.hash(input.password, 12) : null;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE users SET first_name=COALESCE($2,first_name),last_name=COALESCE($3,last_name),email=COALESCE($4,email),username=COALESCE($5,username),role=$6,branch_id=$7,status=COALESCE($8,status),password_hash=COALESCE($9,password_hash),phone_number=COALESCE($10,phone_number),position=COALESCE($11,position),updated_at=now() WHERE id=$1`,
      [id,input.firstName??null,input.lastName??null,input.email??null,input.username??null,role,branchId,input.status??null,passwordHash,input.phoneNumber??null,input.position??null],
    );
    if (input.password) {
      const revoked = await revokeAllUserSessions(id, "PASSWORD_CHANGED", client);
      if (revoked.rowCount) await writeAudit(req.user!, "SESSION_REVOKED", "USER", id, "Revoked active sessions after administrator password change", { reason: "PASSWORD_CHANGED" }, client);
      await writeAudit(req.user!, "PASSWORD_CHANGED", "USER", id, "Administrator changed account password and revoked active sessions", {}, client);
    }
    if (input.status === "INACTIVE") {
      const revoked = await revokeAllUserSessions(id, "ACCOUNT_DISABLED", client);
      if (revoked.rowCount) await writeAudit(req.user!, "SESSION_REVOKED", "USER", id, "Revoked active sessions because the account was disabled", { reason: "ACCOUNT_DISABLED" }, client);
      await writeAudit(req.user!, "ACCOUNT_DISABLED", "USER", id, "Disabled account and revoked active sessions", {}, client);
    }
    await writeAudit(req.user!, "UPDATE_USER", "USER", id, "Updated user account", { fields: Object.keys(input).filter((key) => key !== "password"), passwordChanged: Boolean(input.password) }, client);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
      throw new AppError(409, "USER_IDENTITY_IN_USE", "That email address or username is already in use");
    }
    throw error;
  } finally {
    client.release();
  }
  const result = await pool.query(`${selection} WHERE u.id=$1`, [id]);
  res.json({ success: true, data: { user: result.rows[0] } });
};
export const updateUserStatus: RequestHandler = async (req,res) => {
  const {id}=idParams.parse(req.params); const {status}=statusSchema.parse(req.body);
  if(id===req.user!.id && status==="INACTIVE") throw new AppError(409,"SELF_DEACTIVATION","You cannot deactivate your own account");
  const client=await pool.connect();
  try {
    await client.query("BEGIN");
    const result=await client.query(`UPDATE users SET status=$2,updated_at=now() WHERE id=$1 RETURNING id`,[id,status]);
    if(!result.rows[0]) throw new AppError(404,"USER_NOT_FOUND","User not found");
    if(status==="INACTIVE") {
      const revoked=await revokeAllUserSessions(id,"ACCOUNT_DISABLED",client);
      if(revoked.rowCount) await writeAudit(req.user!,"SESSION_REVOKED","USER",id,"Revoked active sessions because the account was disabled",{reason:"ACCOUNT_DISABLED"},client);
      await writeAudit(req.user!,"ACCOUNT_DISABLED","USER",id,"Disabled account and revoked active sessions",{},client);
    }
    await writeAudit(req.user!,"UPDATE_USER_STATUS","USER",id,`Changed user status to ${status}`,{status},client);
    await client.query("COMMIT");
  } catch(error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  res.json({success:true,data:{id,status}});
};

export const deleteUserAccount: RequestHandler = async (req, res) => {
  const { id } = idParams.parse(req.params);
  if (id === req.user!.id) throw new AppError(409, "SELF_DELETION", "You cannot delete your own account");
  const current = await pool.query<{ role: "OWNER" | "BRANCH_MANAGER" | "STAFF" }>("SELECT role FROM users WHERE id=$1", [id]);
  if (!current.rows[0]) throw new AppError(404, "USER_NOT_FOUND", "User not found");
  if (current.rows[0].role === "OWNER") {
    const owners = await pool.query<{ count: string }>("SELECT count(*) count FROM users WHERE role='OWNER' AND status='ACTIVE'");
    if (Number(owners.rows[0]?.count ?? 0) <= 1) throw new AppError(409, "LAST_OWNER", "The system must retain at least one active Owner");
  }
  const client=await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("UPDATE users SET status='INACTIVE',updated_at=now() WHERE id=$1", [id]);
    const revoked=await revokeAllUserSessions(id,"ACCOUNT_DISABLED",client);
    if(revoked.rowCount) await writeAudit(req.user!,"SESSION_REVOKED","USER",id,"Revoked active sessions because the account was soft-deleted",{reason:"ACCOUNT_DISABLED"},client);
    await writeAudit(req.user!,"ACCOUNT_DISABLED","USER",id,"Soft-deleted account disabled and active sessions revoked",{},client);
    await writeAudit(req.user!, "DELETE_USER", "USER", id, "Soft-deleted user account", { retainedForAudit: true },client);
    await client.query("COMMIT");
  } catch(error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  res.json({ success: true, data: { id, deleted: true } });
};
