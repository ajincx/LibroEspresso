import type { PoolClient } from "pg";

/**
 * Serializes balance-affecting work for one branch for the lifetime of the
 * caller's current transaction. The lock is connection-local and is released
 * automatically by PostgreSQL on COMMIT or ROLLBACK, which makes it safe for
 * pooled/serverless execution.
 */
export async function lockBranchInventoryOperation(
  client: Pick<PoolClient, "query">,
  branchId: string,
) {
  await client.query(
    `SELECT pg_advisory_xact_lock(hashtextextended('libro:inventory:' || $1::text, 0))`,
    [branchId],
  );
}
