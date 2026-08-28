import bcrypt from "bcrypt";
import jwt, { type SignOptions } from "jsonwebtoken";
import { pool } from "../config/database.js";
import { env } from "../config/env.js";
import type { TokenUser, UserRole } from "../types/auth.js";
import { AppError } from "../utils/appError.js";

interface UserRow { id: string; branch_id: string | null; first_name: string; last_name: string; email: string; username: string; phone_number: string | null; position: string; password_hash: string; role: UserRole; status: string; branch_code: string | null; branch_name: string | null }

const publicUser = (row: UserRow) => ({
  id: row.id, firstName: row.first_name, lastName: row.last_name, email: row.email,
  username: row.username, phoneNumber: row.phone_number, position: row.position, role: row.role, branchId: row.branch_id,
  branch: row.branch_id ? { id: row.branch_id, code: row.branch_code!, name: row.branch_name! } : null,
});

export async function authenticateCredentials(identifier: string, password: string) {
  const result = await pool.query<UserRow>(`SELECT u.*, b.code branch_code, b.name branch_name FROM users u LEFT JOIN branches b ON b.id = u.branch_id WHERE lower(u.email) = lower($1) OR lower(u.username) = lower($1) LIMIT 1`, [identifier]);
  const row = result.rows[0];
  if (!row || !(await bcrypt.compare(password, row.password_hash))) throw new AppError(401, "INVALID_CREDENTIALS", "Invalid email/username or password");
  if (row.status !== "ACTIVE") throw new AppError(403, "ACCOUNT_INACTIVE", "This account is inactive");
  await pool.query("UPDATE users SET last_login_at = now(), updated_at = now() WHERE id = $1", [row.id]);
  await pool.query("INSERT INTO audit_logs (user_id, branch_id, action, entity_type, entity_id, description) VALUES ($1,$2,'LOGIN','USER',$1::uuid::text,'User signed in')", [row.id, row.branch_id]);
  return publicUser(row);
}

export async function findCurrentUser(id: string) {
  const result = await pool.query<UserRow>(`SELECT u.*, b.code branch_code, b.name branch_name FROM users u LEFT JOIN branches b ON b.id = u.branch_id WHERE u.id = $1 AND u.status = 'ACTIVE'`, [id]);
  if (!result.rows[0]) throw new AppError(401, "SESSION_USER_NOT_FOUND", "The session account is no longer active");
  return publicUser(result.rows[0]);
}

export function signSession(user: TokenUser, remember = false) {
  return jwt.sign(user, env.JWT_SECRET, { expiresIn: remember ? "30d" : env.JWT_EXPIRES_IN } as SignOptions);
}
