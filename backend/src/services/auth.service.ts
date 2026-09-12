import bcrypt from "bcrypt";
import jwt, { type JwtPayload, type SignOptions } from "jsonwebtoken";
import type { PoolClient } from "pg";
import { pool } from "../config/database.js";
import { env } from "../config/env.js";
import type { TokenUser, UserRole } from "../types/auth.js";
import { AppError } from "../utils/appError.js";
import {
  absoluteSessionExpiry,
  evaluateSessionTime,
  hashSessionIdentifier,
  newSessionIdentifier,
  nextFailedLoginState,
  shouldPersistActivity,
} from "./sessionSecurity.service.js";

interface UserRow { id: string; branch_id: string | null; first_name: string; last_name: string; email: string; username: string; phone_number: string | null; position: string; password_hash: string; role: UserRole; status: string; branch_code: string | null; branch_name: string | null; failed_login_attempts: number; locked_until: Date | null }
interface SessionRow { userId: string; role: UserRole; branchId: string | null; accountStatus: string; lastActivityAt: Date; expiresAt: Date; revokedAt: Date | null }
export interface LoginSecurityContext { ipAddress?: string | null; userAgent?: string | null }

const DUMMY_PASSWORD_HASH = "$2b$12$1Gb3c9d2GMKbOIQ.TsJTJeNH98ZyLk0rFKFZs/qKhqDMy7ySv91v2";

const publicUser = (row: UserRow) => ({
  id: row.id, firstName: row.first_name, lastName: row.last_name, email: row.email,
  username: row.username, phoneNumber: row.phone_number, position: row.position, role: row.role, branchId: row.branch_id,
  branch: row.branch_id ? { id: row.branch_id, code: row.branch_code!, name: row.branch_name! } : null,
});

const safeContext = (context: LoginSecurityContext) => ({
  ipAddress: context.ipAddress?.slice(0, 64) || null,
  userAgent: context.userAgent?.slice(0, 255) || null,
});

async function securityAudit(client: Pick<PoolClient, "query">, action: string, user: { id: string; branchId: string | null } | null, description: string, metadata: Record<string, unknown> = {}) {
  await client.query(
    `INSERT INTO audit_logs (user_id,branch_id,action,entity_type,entity_id,description,metadata)
     VALUES ($1,$2,$3,'AUTH_SESSION',$4,$5,$6)`,
    [user?.id ?? null, user?.branchId ?? null, action, user?.id ?? null, description, metadata],
  );
}

export async function authenticateCredentials(identifier: string, password: string, context: LoginSecurityContext = {}, now = new Date()) {
  const client = await pool.connect();
  let committed = false;
  try {
    await client.query("BEGIN");
    const result = await client.query<UserRow>(
      `SELECT u.*,b.code branch_code,b.name branch_name FROM users u
       LEFT JOIN branches b ON b.id=u.branch_id
       WHERE lower(u.email)=lower($1) OR lower(u.username)=lower($1)
       LIMIT 1 FOR UPDATE OF u`,
      [identifier],
    );
    const row = result.rows[0];
    const metadata = safeContext(context);

    if (!row) {
      await bcrypt.compare(password, DUMMY_PASSWORD_HASH);
      await securityAudit(client, "LOGIN_FAILED", null, "Unsuccessful sign-in attempt", metadata);
      await client.query("COMMIT");
      committed = true;
      throw new AppError(401, "INVALID_CREDENTIALS", "Invalid email/username or password");
    }

    const userRef = { id: row.id, branchId: row.branch_id };
    if (row.locked_until && row.locked_until.getTime() > now.getTime()) {
      await securityAudit(client, "LOGIN_FAILED", userRef, "Sign-in rejected while account was temporarily locked", metadata);
      await client.query("COMMIT");
      committed = true;
      throw new AppError(423, "ACCOUNT_TEMPORARILY_LOCKED", "Too many unsuccessful sign-in attempts. Please try again later.");
    }

    const attempts = row.locked_until && row.locked_until.getTime() <= now.getTime() ? 0 : row.failed_login_attempts;
    const passwordMatches = await bcrypt.compare(password, row.password_hash);
    if (!passwordMatches) {
      const next = nextFailedLoginState(attempts, now);
      await client.query("UPDATE users SET failed_login_attempts=$2,locked_until=$3,updated_at=now() WHERE id=$1", [row.id, next.failedLoginAttempts, next.lockedUntil]);
      await securityAudit(client, "LOGIN_FAILED", userRef, "Unsuccessful sign-in attempt", { ...metadata, failedAttemptCount: next.failedLoginAttempts });
      if (next.lockedUntil) {
        await securityAudit(client, "ACCOUNT_LOCKED", userRef, "Account temporarily locked after repeated unsuccessful sign-in attempts", { ...metadata, lockDurationMinutes: 15 });
      }
      await client.query("COMMIT");
      committed = true;
      throw new AppError(next.lockedUntil ? 423 : 401, next.lockedUntil ? "ACCOUNT_TEMPORARILY_LOCKED" : "INVALID_CREDENTIALS", next.lockedUntil ? "Too many unsuccessful sign-in attempts. Please try again later." : "Invalid email/username or password");
    }

    if (row.status !== "ACTIVE") {
      await securityAudit(client, "LOGIN_FAILED", userRef, "Sign-in rejected for an inactive account", metadata);
      await client.query("COMMIT");
      committed = true;
      throw new AppError(403, "ACCOUNT_INACTIVE", "This account is inactive");
    }

    const sessionIdentifier = newSessionIdentifier();
    const expiresAt = absoluteSessionExpiry(now);
    await client.query("UPDATE users SET failed_login_attempts=0,locked_until=NULL,last_login_at=$2,updated_at=now() WHERE id=$1", [row.id, now]);
    await client.query(`DELETE FROM auth_sessions WHERE expires_at < $1::timestamptz - interval '7 days' OR (revoked_at IS NOT NULL AND revoked_at < $1::timestamptz - interval '7 days')`, [now]);
    await client.query(
      `INSERT INTO auth_sessions (user_id,session_identifier_hash,created_at,last_activity_at,expires_at,ip_address,user_agent)
       VALUES ($1,$2,$3,$3,$4,$5,$6)`,
      [row.id, hashSessionIdentifier(sessionIdentifier), now, expiresAt, metadata.ipAddress, metadata.userAgent],
    );
    await securityAudit(client, "LOGIN_SUCCESS", userRef, "User signed in", metadata);
    await client.query("COMMIT");
    committed = true;
    return { user: publicUser(row), sessionIdentifier, expiresAt };
  } catch (error) {
    if (!committed) await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function findCurrentUser(id: string) {
  const result = await pool.query<UserRow>(`SELECT u.*, b.code branch_code, b.name branch_name FROM users u LEFT JOIN branches b ON b.id = u.branch_id WHERE u.id = $1 AND u.status = 'ACTIVE'`, [id]);
  if (!result.rows[0]) throw new AppError(401, "SESSION_USER_NOT_FOUND", "The session account is no longer active");
  return publicUser(result.rows[0]);
}

export async function validateSessionToken(token: string, now = new Date()): Promise<TokenUser> {
  const payload = jwt.verify(token, env.JWT_SECRET, { ignoreExpiration: true }) as JwtPayload & Partial<TokenUser>;
  if (!payload.id || !payload.sessionId) throw new AppError(401, "INVALID_SESSION", "Your session is invalid or expired");
  const sessionHash = hashSessionIdentifier(payload.sessionId);
  const result = await pool.query<SessionRow>(
    `SELECT s.user_id "userId",u.role,u.branch_id "branchId",u.status "accountStatus",
            s.last_activity_at "lastActivityAt",s.expires_at "expiresAt",s.revoked_at "revokedAt"
       FROM auth_sessions s JOIN users u ON u.id=s.user_id
      WHERE s.session_identifier_hash=$1`,
    [sessionHash],
  );
  const session = result.rows[0];
  if (!session || session.userId !== payload.id) throw new AppError(401, "SESSION_REVOKED", "Your session has expired. Please sign in again.");
  if (session.accountStatus !== "ACTIVE") {
    await revokeAllUserSessions(session.userId, "ACCOUNT_DISABLED");
    throw new AppError(401, "ACCOUNT_INACTIVE", "Your session has expired. Please sign in again.");
  }
  const timeStatus = evaluateSessionTime(session, now);
  if (timeStatus !== "ACTIVE") {
    if (timeStatus !== "REVOKED") {
      const action = timeStatus === "EXPIRED_IDLE" ? "SESSION_EXPIRED_IDLE" : "SESSION_EXPIRED_ABSOLUTE";
      const revoked = await pool.query(`UPDATE auth_sessions SET revoked_at=$2,revoke_reason=$3 WHERE session_identifier_hash=$1 AND revoked_at IS NULL RETURNING user_id`, [sessionHash, now, action]);
      if (revoked.rowCount) await securityAudit(pool, action, { id: session.userId, branchId: session.branchId }, timeStatus === "EXPIRED_IDLE" ? "Session expired after inactivity" : "Session reached its maximum duration");
    }
    throw new AppError(401, timeStatus === "EXPIRED_IDLE" ? "SESSION_EXPIRED_IDLE" : timeStatus === "EXPIRED_ABSOLUTE" ? "SESSION_EXPIRED_ABSOLUTE" : "SESSION_REVOKED", "Your session has expired. Please sign in again.");
  }
  if (shouldPersistActivity(session.lastActivityAt, now)) {
    await pool.query("UPDATE auth_sessions SET last_activity_at=$2 WHERE session_identifier_hash=$1 AND revoked_at IS NULL", [sessionHash, now]);
  }
  return { id: session.userId, role: session.role, branchId: session.branchId, sessionId: payload.sessionId };
}

export async function revokeAllUserSessions(userId: string, reason: string, client: Pick<PoolClient, "query"> = pool, now = new Date()) {
  return client.query("UPDATE auth_sessions SET revoked_at=$2,revoke_reason=$3 WHERE user_id=$1 AND revoked_at IS NULL", [userId, now, reason]);
}

export async function revokeSessionToken(token: string | undefined, context: LoginSecurityContext = {}, now = new Date()) {
  if (!token) return;
  let payload: JwtPayload & Partial<TokenUser>;
  try { payload = jwt.verify(token, env.JWT_SECRET, { ignoreExpiration: true }) as JwtPayload & Partial<TokenUser>; } catch { return; }
  if (!payload.id || !payload.sessionId) return;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const revoked = await client.query<{ userId: string; branchId: string | null }>(
      `WITH revoked AS (
         UPDATE auth_sessions SET revoked_at=$2,revoke_reason='LOGOUT'
          WHERE session_identifier_hash=$1 AND revoked_at IS NULL RETURNING user_id
       ) SELECT revoked.user_id "userId",u.branch_id "branchId" FROM revoked JOIN users u ON u.id=revoked.user_id`,
      [hashSessionIdentifier(payload.sessionId), now],
    );
    const user = revoked.rows[0];
    if (user) await securityAudit(client, "LOGOUT", { id: user.userId, branchId: user.branchId }, "User signed out", safeContext(context));
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}

export function signSession(user: Omit<TokenUser, "sessionId">, sessionIdentifier: string) {
  return jwt.sign({ id: user.id, role: user.role, branchId: user.branchId, sessionId: sessionIdentifier }, env.JWT_SECRET, { expiresIn: "8h" } as SignOptions);
}
