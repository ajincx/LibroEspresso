import pg from "pg";
import { env } from "./env.js";

export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  max: env.DB_POOL_MAX,
  idleTimeoutMillis: env.DB_IDLE_TIMEOUT_MS,
  connectionTimeoutMillis: env.DB_CONNECTION_TIMEOUT_MS,
  ssl: env.DATABASE_SSL_MODE === "disable"
    ? undefined
    : { rejectUnauthorized: env.DATABASE_SSL_MODE === "verify-full" },
});
pool.on("error", (error) => console.error(JSON.stringify({
  timestamp: new Date().toISOString(),
  severity: "error",
  category: "DATABASE_POOL_ERROR",
  message: error.message,
})));

export async function verifyDatabaseConnection() {
  await pool.query("SELECT 1");
}
