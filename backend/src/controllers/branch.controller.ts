import type { RequestHandler } from "express";
import { pool } from "../config/database.js";
import { getEffectiveBranchId } from "../services/branchScope.js";
import { writeAudit } from "../services/audit.service.js";
import { AppError } from "../utils/appError.js";
import { branchInput, branchPatch, idParams } from "../validators/masterData.js";

const selection = `SELECT b.id,b.code,b.name,b.location,b.status,b.created_at "createdAt",b.updated_at "updatedAt",u.id "managerId",concat(u.first_name,' ',u.last_name) manager FROM branches b LEFT JOIN users u ON u.branch_id=b.id AND u.role='BRANCH_MANAGER' AND u.status='ACTIVE'`;
export const listBranches: RequestHandler = async (req, res) => {
  const branchId = getEffectiveBranchId(req.user!, typeof req.query.branchId === "string" ? req.query.branchId : undefined);
  const result = await pool.query(`${selection} ${branchId ? "WHERE b.id=$1" : ""} ORDER BY b.name`, branchId ? [branchId] : []);
  res.json({ success: true, data: { branches: result.rows } });
};
export const getBranch: RequestHandler = async (req, res) => {
  const { id } = idParams.parse(req.params); const scoped = getEffectiveBranchId(req.user!, id);
  if (scoped !== id) throw new AppError(403, "FORBIDDEN", "You cannot access another branch");
  const result = await pool.query(`${selection} WHERE b.id=$1`, [id]);
  if (!result.rows[0]) throw new AppError(404, "BRANCH_NOT_FOUND", "Branch not found");
  res.json({ success: true, data: { branch: result.rows[0] } });
};
export const createBranch: RequestHandler = async (req, res) => {
  const input = branchInput.parse(req.body);
  const result = await pool.query(`INSERT INTO branches (code,name,location,status) VALUES ($1,$2,$3,$4) RETURNING id,code,name,location,status,created_at "createdAt",updated_at "updatedAt"`, [input.code,input.name,input.location,input.status]);
  await writeAudit(req.user!, "CREATE_BRANCH", "BRANCH", result.rows[0].id, `Created branch ${input.name}`);
  res.status(201).json({ success: true, data: { branch: result.rows[0] } });
};
export const updateBranch: RequestHandler = async (req, res) => {
  const { id } = idParams.parse(req.params); const input = branchPatch.parse(req.body);
  const result = await pool.query(`UPDATE branches SET code=COALESCE($2,code),name=COALESCE($3,name),location=COALESCE($4,location),status=COALESCE($5,status),updated_at=now() WHERE id=$1 RETURNING id,code,name,location,status,created_at "createdAt",updated_at "updatedAt"`, [id,input.code ?? null,input.name ?? null,input.location ?? null,input.status ?? null]);
  if (!result.rows[0]) throw new AppError(404, "BRANCH_NOT_FOUND", "Branch not found");
  await writeAudit(req.user!, "UPDATE_BRANCH", "BRANCH", id, `Updated branch ${result.rows[0].name}`, { fields: Object.keys(input) });
  res.json({ success: true, data: { branch: result.rows[0] } });
};
