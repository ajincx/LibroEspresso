import bcrypt from "bcrypt";
import type { RequestHandler } from "express";
import { pool } from "../config/database.js";
import { writeAudit } from "../services/audit.service.js";
import { findCurrentUser } from "../services/auth.service.js";
import { AppError } from "../utils/appError.js";
import { passwordPatch, profilePatch } from "../validators/account.js";

function isUniqueViolation(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}

export const getProfile: RequestHandler = async (req, res) => {
  res.json({ success: true, data: { user: await findCurrentUser(req.user!.id) } });
};

export const updateProfile: RequestHandler = async (req, res) => {
  const input = profilePatch.parse(req.body);
  try {
    await pool.query(
      `UPDATE users SET first_name=$2,last_name=$3,email=$4,phone_number=$5,updated_at=now() WHERE id=$1`,
      [req.user!.id, input.firstName, input.lastName, input.email, input.phoneNumber || null],
    );
  } catch (error) {
    if (isUniqueViolation(error)) throw new AppError(409, "EMAIL_IN_USE", "That email address is already in use");
    throw error;
  }
  await writeAudit(req.user!, "UPDATE_OWN_PROFILE", "USER", req.user!.id, "Updated own profile", { fields: ["firstName", "lastName", "email", "phoneNumber"] });
  res.json({ success: true, data: { user: await findCurrentUser(req.user!.id) } });
};

export const updatePassword: RequestHandler = async (req, res) => {
  const input = passwordPatch.parse(req.body);
  const result = await pool.query<{ password_hash: string }>("SELECT password_hash FROM users WHERE id=$1", [req.user!.id]);
  if (!result.rows[0] || !(await bcrypt.compare(input.currentPassword, result.rows[0].password_hash))) {
    throw new AppError(400, "CURRENT_PASSWORD_INCORRECT", "Current password is incorrect");
  }
  const passwordHash = await bcrypt.hash(input.newPassword, 12);
  await pool.query("UPDATE users SET password_hash=$2,updated_at=now() WHERE id=$1", [req.user!.id, passwordHash]);
  await writeAudit(req.user!, "CHANGE_OWN_PASSWORD", "USER", req.user!.id, "Changed own password");
  res.json({ success: true, data: {} });
};
