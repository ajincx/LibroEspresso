import pg from "pg";
import { env } from "./env.js";

export const pool = new pg.Pool({ connectionString: env.DATABASE_URL });
pool.on("error", (error) => console.error("Unexpected PostgreSQL pool error", error));

export async function verifyDatabaseConnection() {
  await pool.query("SELECT 1");
}
