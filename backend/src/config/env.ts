import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATA_LIFECYCLE_ENV: z.enum(["DEVELOPMENT", "UAT", "PRODUCTION"]).default("PRODUCTION"),
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
  POS_REMINDER_HOUR_MANILA: z.coerce.number().int().min(0).max(23).default(22),
  POS_REMINDER_MINUTE_MANILA: z.coerce.number().int().min(0).max(59).default(0),
  CRON_SECRET: z.string().trim().optional().transform((value) => value || undefined),
  SMTP_HOST: z.preprocess(value=>value===""?undefined:value,z.string().trim().default("smtp.gmail.com")),
  SMTP_PORT: z.preprocess(value=>value===""?undefined:value,z.coerce.number().int().min(1).max(65535).default(465)),
  SMTP_SECURE: z.preprocess(value=>value===""?undefined:value,z.enum(["true","false"]).default("true").transform((value)=>value==="true")),
  SMTP_USER: z.preprocess(value=>value===""?undefined:value,z.string().trim().email().optional()),
  SMTP_APP_PASSWORD: z.preprocess(value=>value===""?undefined:value,z.string().trim().min(16).optional()),
  SMTP_FROM: z.preprocess(value=>value===""?undefined:value,z.string().trim().email().optional()),
  PASSWORD_RESET_URL_BASE: z.preprocess(value=>value===""?undefined:value,z.string().url().optional()),
}).superRefine((value, context) => {
  if (value.CRON_SECRET && value.CRON_SECRET.length < 32) {
    context.addIssue({ code: "custom", path: ["CRON_SECRET"], message: "CRON_SECRET must contain at least 32 characters" });
  }
  if (value.NODE_ENV === "production" && !value.CRON_SECRET) {
    context.addIssue({ code: "custom", path: ["CRON_SECRET"], message: "CRON_SECRET is required in production" });
  }
  const emailValues=[value.SMTP_USER,value.SMTP_APP_PASSWORD,value.SMTP_FROM,value.PASSWORD_RESET_URL_BASE];
  if(emailValues.some(Boolean)&&!emailValues.every(Boolean)) context.addIssue({code:"custom",path:["SMTP_USER"],message:"SMTP credentials, sender, and password reset URL must be configured together"});
  if(emailValues.some(Boolean)&&(value.SMTP_HOST!=="smtp.gmail.com"||value.SMTP_PORT!==465||!value.SMTP_SECURE)) context.addIssue({code:"custom",path:["SMTP_HOST"],message:"Gmail SMTP must use smtp.gmail.com on port 465 with SMTP_SECURE=true"});
  if(value.NODE_ENV==="production"&&value.PASSWORD_RESET_URL_BASE&&!value.PASSWORD_RESET_URL_BASE.startsWith("https://")) context.addIssue({code:"custom",path:["PASSWORD_RESET_URL_BASE"],message:"Production password reset links must use HTTPS"});
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment configuration", parsed.error.flatten().fieldErrors);
  throw new Error("Environment configuration is invalid");
}
export const env = parsed.data;
