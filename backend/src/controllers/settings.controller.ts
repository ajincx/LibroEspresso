import type { RequestHandler } from "express";
import { z } from "zod";
import { pool } from "../config/database.js";
import { writeAudit } from "../services/audit.service.js";
import { AppError } from "../utils/appError.js";

const preferencesSchema = z.object({
  theme: z.enum(["light", "dark"]),
  dateFormat: z.enum(["MMM d, yyyy", "MM/dd/yyyy", "dd/MM/yyyy"]),
  timezone: z.enum(["Asia/Manila", "Asia/Singapore", "Asia/Tokyo", "UTC"]),
  currency: z.enum(["PHP", "USD", "EUR"]),
  compactSidebar: z.boolean(),
  notifications: z.record(z.string(), z.boolean()),
});
const businessSchema = z.object({
  businessName: z.string().trim().min(2).max(160),
  legalName: z.string().trim().min(2).max(180),
  contactEmail: z.union([z.string().trim().email(), z.literal("")]),
  contactPhone: z.string().trim().max(30),
  headOfficeAddress: z.string().trim().max(255),
  taxIdentifier: z.string().trim().max(80),
  reportingCycle: z.enum(["WEEKLY", "MONTHLY", "QUARTERLY"]),
  varianceToleranceQuantity: z.coerce.number().min(0).max(100000),
  highCogsPercent: z.coerce.number().min(0).max(100),
  shrinkageAlertPercent: z.coerce.number().min(0).max(100),
  defaultReorderDays: z.coerce.number().int().min(1).max(365),
});

export const getSettings: RequestHandler = async (req, res) => {
  const preferenceResult = await pool.query(
    `SELECT theme,date_format "dateFormat",timezone,currency,compact_sidebar "compactSidebar",notification_preferences notifications FROM user_preferences WHERE user_id=$1`,
    [req.user!.id],
  );
  const preferences = preferenceResult.rows[0] ?? {
    theme: "light",
    dateFormat: "MMM d, yyyy",
    timezone: "Asia/Manila",
    currency: "PHP",
    compactSidebar: false,
    notifications: {},
  };
  let organization = null;
  if (req.user!.role === "OWNER") {
    const result = await pool.query(
      `SELECT b.business_name "businessName",b.legal_name "legalName",COALESCE(b.contact_email,'') "contactEmail",COALESCE(b.contact_phone,'') "contactPhone",COALESCE(b.head_office_address,'') "headOfficeAddress",COALESCE(b.tax_identifier,'') "taxIdentifier",b.reporting_cycle "reportingCycle",c.variance_tolerance_quantity::float8 "varianceToleranceQuantity",c.high_cogs_percent::float8 "highCogsPercent",c.shrinkage_alert_percent::float8 "shrinkageAlertPercent",c.default_reorder_days "defaultReorderDays",(SELECT count(*)::int FROM branches) "branchCount",(SELECT count(*)::int FROM branches WHERE status='ACTIVE') "activeBranchCount" FROM business_settings b CROSS JOIN calculation_settings c WHERE b.singleton=true AND c.singleton=true`,
    );
    organization = result.rows[0] ?? null;
  }
  res
    .set("Cache-Control", "no-store")
    .json({ success: true, data: { preferences, organization } });
};
export const updatePreferences: RequestHandler = async (req, res) => {
  const input = preferencesSchema.parse(req.body);
  input.notifications.messages = true;
  await pool.query(
    `INSERT INTO user_preferences (user_id,theme,date_format,timezone,currency,compact_sidebar,notification_preferences) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (user_id) DO UPDATE SET theme=excluded.theme,date_format=excluded.date_format,timezone=excluded.timezone,currency=excluded.currency,compact_sidebar=excluded.compact_sidebar,notification_preferences=excluded.notification_preferences,updated_at=now()`,
    [
      req.user!.id,
      input.theme,
      input.dateFormat,
      input.timezone,
      input.currency,
      input.compactSidebar,
      input.notifications,
    ],
  );
  await writeAudit(
    req.user!,
    "UPDATE_PREFERENCES",
    "USER_PREFERENCES",
    req.user!.id,
    "Updated account preferences",
  );
  res.json({ success: true, data: { preferences: input } });
};
export const updateBusinessSettings: RequestHandler = async (req, res) => {
  if (req.user!.role !== "OWNER")
    throw new AppError(
      403,
      "FORBIDDEN",
      "Only the Owner can update organization settings",
    );
  const input = businessSchema.parse(req.body);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE business_settings SET business_name=$1,legal_name=$2,contact_email=NULLIF($3,''),contact_phone=NULLIF($4,''),head_office_address=NULLIF($5,''),tax_identifier=NULLIF($6,''),reporting_cycle=$7,updated_by=$8,updated_at=now() WHERE singleton=true`,
      [
        input.businessName,
        input.legalName,
        input.contactEmail,
        input.contactPhone,
        input.headOfficeAddress,
        input.taxIdentifier,
        input.reportingCycle,
        req.user!.id,
      ],
    );
    await client.query(
      `UPDATE calculation_settings SET variance_tolerance_quantity=$1,high_cogs_percent=$2,shrinkage_alert_percent=$3,default_reorder_days=$4,updated_by=$5,updated_at=now() WHERE singleton=true`,
      [
        input.varianceToleranceQuantity,
        input.highCogsPercent,
        input.shrinkageAlertPercent,
        input.defaultReorderDays,
        req.user!.id,
      ],
    );
    await writeAudit(
      req.user!,
      "UPDATE_SYSTEM_SETTINGS",
      "BUSINESS_SETTINGS",
      "GLOBAL",
      "Updated business information and calculation rules",
      {},
      client,
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  res.json({ success: true, data: { organization: input } });
};
