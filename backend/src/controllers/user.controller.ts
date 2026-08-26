import bcrypt from "bcrypt";
import type { RequestHandler } from "express";
import { pool } from "../config/database.js";
import { writeAudit } from "../services/audit.service.js";
import { AppError } from "../utils/appError.js";
import { idParams, statusSchema, userCreate, userPatch } from "../validators/masterData.js";

const selection = `SELECT u.id,u.branch_id "branchId",u.first_name "firstName",u.last_name "lastName",u.email,u.username,u.role,u.status,u.last_login_at "lastLoginAt",u.created_at "createdAt",u.updated_at "updatedAt",b.code "branchCode",b.name "branchName" FROM users u LEFT JOIN branches b ON b.id=u.branch_id`;
export const listUsers: RequestHandler = async (_req, res) => { const result = await pool.query(`${selection} ORDER BY u.created_at`); res.json({ success: true, data: { users: result.rows } }); };
export const getUser: RequestHandler = async (req, res) => { const { id } = idParams.parse(req.params); const result = await pool.query(`${selection} WHERE u.id=$1`, [id]); if (!result.rows[0]) throw new AppError(404,"USER_NOT_FOUND","User not found"); res.json({ success: true, data: { user: result.rows[0] } }); };
export const createUser: RequestHandler = async (req, res) => {
  const input = userCreate.parse(req.body); const passwordHash = await bcrypt.hash(input.password, 12);
  const result = await pool.query(`INSERT INTO users (branch_id,first_name,last_name,email,username,password_hash,role,status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`, [input.branchId,input.firstName,input.lastName,input.email,input.username,passwordHash,input.role,input.status]);
  await writeAudit(req.user!,"CREATE_USER","USER",result.rows[0].id,`Created ${input.role} account`,{ role: input.role, branchId: input.branchId });
  const created = await pool.query(`${selection} WHERE u.id=$1`, [result.rows[0].id]); res.status(201).json({ success: true, data: { user: created.rows[0] } });
};
export const updateUser: RequestHandler = async (req, res) => {
  const { id } = idParams.parse(req.params); const input = userPatch.parse(req.body);
  const current = await pool.query<{ role: "OWNER"|"BRANCH_MANAGER"; branch_id: string|null }>("SELECT role,branch_id FROM users WHERE id=$1",[id]); if (!current.rows[0]) throw new AppError(404,"USER_NOT_FOUND","User not found");
  const role = input.role ?? current.rows[0].role; const branchId = input.branchId !== undefined ? input.branchId : current.rows[0].branch_id;
  if ((role === "OWNER" && branchId !== null) || (role === "BRANCH_MANAGER" && !branchId)) throw new AppError(422,"INVALID_BRANCH_ASSIGNMENT","Owner branch must be null and Branch Manager branch is required");
  const passwordHash = input.password ? await bcrypt.hash(input.password,12) : null;
  await pool.query(`UPDATE users SET first_name=COALESCE($2,first_name),last_name=COALESCE($3,last_name),email=COALESCE($4,email),username=COALESCE($5,username),role=$6,branch_id=$7,status=COALESCE($8,status),password_hash=COALESCE($9,password_hash),updated_at=now() WHERE id=$1`,[id,input.firstName??null,input.lastName??null,input.email??null,input.username??null,role,branchId,input.status??null,passwordHash]);
  await writeAudit(req.user!,"UPDATE_USER","USER",id,"Updated user account",{ fields: Object.keys(input).filter((key)=>key!=="password"), passwordChanged: Boolean(input.password) });
  const result = await pool.query(`${selection} WHERE u.id=$1`,[id]); res.json({ success:true,data:{ user:result.rows[0] } });
};
export const updateUserStatus: RequestHandler = async (req,res) => { const {id}=idParams.parse(req.params); const {status}=statusSchema.parse(req.body); if(id===req.user!.id && status==="INACTIVE") throw new AppError(409,"SELF_DEACTIVATION","You cannot deactivate your own account"); const result=await pool.query(`UPDATE users SET status=$2,updated_at=now() WHERE id=$1 RETURNING id`,[id,status]); if(!result.rows[0]) throw new AppError(404,"USER_NOT_FOUND","User not found"); await writeAudit(req.user!,"UPDATE_USER_STATUS","USER",id,`Changed user status to ${status}`,{status}); res.json({success:true,data:{id,status}}); };
