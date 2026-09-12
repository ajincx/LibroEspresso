import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(5000),
  DATABASE_URL: z.string().min(1),
  CLIENT_URL: z.string().url().default("http://localhost:5173"),
  JWT_SECRET: z.string().min(32),
  COOKIE_NAME: z.string().default("libro_session"),
  DB_POOL_MAX: z.coerce.number().int().min(1).max(20).default(10),
  DB_IDLE_TIMEOUT_MS: z.coerce.number().int().min(1_000).default(30_000),
  DB_CONNECTION_TIMEOUT_MS: z.coerce.number().int().min(1_000).default(5_000),
  DATABASE_SSL_MODE: z.enum(["disable", "require", "verify-full"]).default("disable"),
  TRUST_PROXY: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(30_000).default(10_000),
  BENCHMARK_MODE: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  GEMINI_API_KEY: z.string().trim().optional().transform((value) => value || undefined),
  GEMINI_MODEL: z.string().trim().default("gemini-2.5-flash-lite"),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment configuration", parsed.error.flatten().fieldErrors);
  throw new Error("Environment configuration is invalid");
}
export const env = parsed.data;
