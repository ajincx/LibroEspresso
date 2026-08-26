import type { PoolClient } from "pg";
import { pool } from "../config/database.js";
import type { TokenUser } from "../types/auth.js";

export async function writeAudit(user: TokenUser, action: string, entityType: string, entityId: string, description: string, metadata: Record<string, unknown> = {}, client: Pick<PoolClient, "query"> = pool) {
  await client.query("INSERT INTO audit_logs (user_id,branch_id,action,entity_type,entity_id,description,metadata) VALUES ($1,$2,$3,$4,$5,$6,$7)", [user.id, user.branchId, action, entityType, entityId, description, metadata]);
}
