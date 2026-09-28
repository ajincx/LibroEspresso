import type { RequestHandler } from "express";
import { pool } from "../config/database.js";
import { getEffectiveBranchId } from "../services/branchScope.js";
import { writeAudit } from "../services/audit.service.js";
import { AppError } from "../utils/appError.js";
import { branchInput, branchPatch, idParams } from "../validators/masterData.js";
import { destructiveActionInput } from "../validators/destructiveAction.js";
import { verifyDestructiveAction, writeDestructiveActionAudit } from "../services/destructiveAction.service.js";
import { revokeAllUserSessions } from "../services/auth.service.js";

const selection = `SELECT b.id,b.code,b.name,b.location,b.status,b.created_at "createdAt",b.updated_at "updatedAt",
  manager.id "managerId",manager.name manager,manager.status "managerStatus",
  GREATEST(b.updated_at,manager.updated_at,activity.created_at) "lastActivityAt",
  CASE WHEN activity.created_at IS NOT NULL AND activity.created_at>=b.updated_at AND (manager.updated_at IS NULL OR activity.created_at>=manager.updated_at) THEN activity.description
       WHEN manager.updated_at IS NOT NULL AND manager.updated_at>=b.updated_at THEN 'Manager account updated'
       ELSE 'Branch information updated' END "lastActivityDescription"
  FROM branches b
  LEFT JOIN LATERAL (
    SELECT u.id,concat(u.first_name,' ',u.last_name) name,u.status,u.updated_at
      FROM users u WHERE u.branch_id=b.id AND u.role='BRANCH_MANAGER'
      ORDER BY (u.status='ACTIVE') DESC,u.updated_at DESC LIMIT 1
  ) manager ON true
  LEFT JOIN LATERAL (
    SELECT al.created_at,al.description FROM audit_logs al WHERE al.branch_id=b.id ORDER BY al.created_at DESC LIMIT 1
  ) activity ON true`;
export const listBranches: RequestHandler = async (req, res) => {
  res.set("Cache-Control", "no-store");
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
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(`INSERT INTO branches (code,name,location,status) VALUES ($1,$2,$3,$4) RETURNING id,code,name,location,status,created_at "createdAt",updated_at "updatedAt"`, [input.code,input.name,input.location,input.status]);
    if (input.status === "ACTIVE") await client.query(`INSERT INTO menu_item_branches (menu_item_id,branch_id,availability_status) SELECT id,$1,'PENDING_MANAGER' FROM menu_items WHERE product_scope='GLOBAL' AND approval_status='APPROVED' ON CONFLICT DO NOTHING`, [result.rows[0].id]);
    await writeAudit(req.user!, "CREATE_BRANCH", "BRANCH", result.rows[0].id, `Created branch ${input.name}`, {}, client);
    await client.query("COMMIT");
    res.status(201).json({ success: true, data: { branch: result.rows[0] } });
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
};
export const updateBranch: RequestHandler = async (req, res) => {
  const { id } = idParams.parse(req.params); const input = branchPatch.parse(req.body);
  if (input.status === "INACTIVE") throw new AppError(409, "CONTROLLED_DEACTIVATION_REQUIRED", "Use the controlled branch deactivation action and provide a reason and verification PIN");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(`UPDATE branches SET code=COALESCE($2,code),name=COALESCE($3,name),location=COALESCE($4,location),status=COALESCE($5,status),updated_at=now() WHERE id=$1 RETURNING id,code,name,location,status,created_at "createdAt",updated_at "updatedAt"`, [id,input.code ?? null,input.name ?? null,input.location ?? null,input.status ?? null]);
    if (!result.rows[0]) throw new AppError(404, "BRANCH_NOT_FOUND", "Branch not found");
    if (result.rows[0].status === "ACTIVE") await client.query(`INSERT INTO menu_item_branches (menu_item_id,branch_id,availability_status) SELECT id,$1,'PENDING_MANAGER' FROM menu_items WHERE product_scope='GLOBAL' AND approval_status='APPROVED' ON CONFLICT DO NOTHING`, [id]);
    await writeAudit(req.user!, "UPDATE_BRANCH", "BRANCH", id, `Updated branch ${result.rows[0].name}`, { fields: Object.keys(input) }, client);
    await client.query("COMMIT");
    res.json({ success: true, data: { branch: result.rows[0] } });
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
};

export const deactivateBranch: RequestHandler = async (req, res) => {
  if (req.user!.role !== "OWNER") throw new AppError(403, "FORBIDDEN", "Only the Owner can deactivate a branch");
  const { id } = idParams.parse(req.params); const input = destructiveActionInput.parse(req.body);
  await verifyDestructiveAction(req.user!, input.verificationPin, { module: "BRANCH", action: "DEACTIVATE", recordId: id, reason: input.reason });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query<{ name: string }>(`UPDATE branches SET status='INACTIVE',updated_at=now() WHERE id=$1 AND status='ACTIVE' RETURNING name`, [id]);
    if (!result.rows[0]) throw new AppError(404, "ACTIVE_BRANCH_NOT_FOUND", "Active branch not found");
    const affectedUsers = await client.query<{ id: string }>(`UPDATE users SET status='INACTIVE',updated_at=now() WHERE branch_id=$1 AND status='ACTIVE' RETURNING id`, [id]);
    for (const user of affectedUsers.rows) await revokeAllUserSessions(user.id, "BRANCH_DEACTIVATED", client);
    await client.query(`UPDATE menu_item_branches SET is_active=false,updated_at=now() WHERE branch_id=$1`, [id]);
    await writeDestructiveActionAudit(req.user!, { module: "BRANCH", action: "DEACTIVATE", recordId: id, reason: input.reason }, `Deactivated branch ${result.rows[0].name}`, { operationalHistoryPreserved: true, deactivatedUserCount: affectedUsers.rowCount ?? 0 }, client);
    await client.query("COMMIT"); res.json({ success: true, data: { id, action: "DEACTIVATED" } });
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
};
