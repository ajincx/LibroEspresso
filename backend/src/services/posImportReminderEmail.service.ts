import { pool } from "../config/database.js";
import { env } from "../config/env.js";
import { emailDeliveryConfigured, sanitizeEmailDeliveryErrorCode, sendExternalEmail } from "./emailTransport.service.js";

const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MINUTES = 15;
const STALE_CLAIM_MINUTES = 15;

type ClaimedReminder = {
  id: string;
  branchId: string;
  businessDate: string;
  recipientUserId: string;
  recipientEmail: string;
  recipientName: string;
  branchName: string;
  sourceName: string;
};

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}

function displayBusinessDate(value:string) {
  const [year,month,day]=value.split("-").map(Number);
  if(!year||!month||!day)return value;
  return new Intl.DateTimeFormat("en-PH",{timeZone:"Asia/Manila",year:"numeric",month:"long",day:"numeric"}).format(new Date(Date.UTC(year,month-1,day)));
}

export function buildPosImportReminderEmail(input:{recipientName:string;branchName:string;businessDate:string;appUrl:string}) {
  const name=input.recipientName.trim()||"Branch Manager";
  const date=displayBusinessDate(input.businessDate);
  const safeName=escapeHtml(name);
  const safeBranch=escapeHtml(input.branchName);
  const safeDate=escapeHtml(date);
  const safeAppUrl=escapeHtml(input.appUrl);
  return {
    subject:`Reminder: Pending POS Sales Import – ${input.branchName} | Libro Espresso`,
    text:[`Hello ${name},`,"",`This is an automated reminder that the POS sales data for ${date} has not yet been confirmed as complete for ${input.branchName}.`,"","To ensure accurate sales reporting, inventory monitoring, and Cost of Goods Sold (COGS) calculations, please review and complete the POS import process.","",`Open Libro Espresso: ${input.appUrl}`,"","If the POS sales data has already been submitted, please verify that the daily import has been successfully completed and reconciled.","","Thank you,","Libro Espresso Team","","This is an automated notification. Please do not reply."].join("\n"),
    html:`<!doctype html><html><body style="margin:0;background:#f5f1ed;color:#2d2526;font-family:Arial,sans-serif"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f1ed;padding:24px 12px"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border:1px solid #eadfe0;border-radius:16px;overflow:hidden"><tr><td style="height:6px;background:#7b1e2b"></td></tr><tr><td style="padding:32px"><p style="margin:0 0 8px;color:#7b1e2b;font-size:13px;font-weight:700;letter-spacing:.08em">LIBRO ESPRESSO</p><h1 style="margin:0 0 24px;font-size:26px;line-height:1.25">Pending POS sales import</h1><p style="margin:0 0 16px;line-height:1.6">Hello ${safeName},</p><p style="margin:0 0 16px;line-height:1.6">This is an automated reminder that the POS sales data for <strong>${safeDate}</strong> has not yet been confirmed as complete for <strong>${safeBranch}</strong>.</p><p style="margin:0 0 24px;line-height:1.6">To ensure accurate sales reporting, inventory monitoring, and Cost of Goods Sold (COGS) calculations, please review and complete the POS import process.</p><p style="margin:0 0 24px"><a href="${safeAppUrl}" style="display:inline-block;border-radius:10px;background:#7b1e2b;padding:13px 22px;color:#ffffff;font-weight:700;text-decoration:none">Open Libro Espresso</a></p><p style="margin:0;line-height:1.6">If the POS sales data has already been submitted, please verify that the daily import has been successfully completed and reconciled.</p><p style="margin:24px 0 0;line-height:1.6">Thank you,<br><strong>Libro Espresso Team</strong></p></td></tr><tr><td style="border-top:1px solid #eadfe0;background:#fbf8f6;padding:18px 32px;color:#766b6d;font-size:12px;text-align:center">This is an automated notification. Please do not reply.</td></tr></table></td></tr></table></body></html>`,
  };
}

async function claimReminders(businessDate: string) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO pos_import_email_reminders(branch_id,business_date,recipient_user_id,pos_source_id)
       SELECT b.id,$1::date,manager.id,source.id
       FROM branches b
       JOIN pos_sources source ON source.branch_id=b.id AND source.status='ACTIVE'
       JOIN users manager ON manager.branch_id=b.id AND manager.role='BRANCH_MANAGER' AND manager.status='ACTIVE'
       WHERE b.status='ACTIVE' AND manager.email IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM pos_imports imported
           WHERE imported.branch_id=b.id AND imported.business_date=$1::date
             AND imported.completed_at IS NOT NULL AND imported.voided_at IS NULL AND NOT imported.is_test_data
         )
         AND NOT EXISTS (
           SELECT 1 FROM pos_daily_declarations declaration
           WHERE declaration.branch_id=b.id AND declaration.business_date=$1::date AND declaration.invalidated_at IS NULL
         )
       ORDER BY b.id,manager.id
       ON CONFLICT (branch_id,business_date,recipient_user_id) DO NOTHING`,
      [businessDate],
    );
    const claimed = await client.query<ClaimedReminder>(
      `WITH due AS (
         SELECT reminder.id
         FROM pos_import_email_reminders reminder
         WHERE reminder.business_date<=$1::date
           AND reminder.attempt_count < $2
           AND (
             reminder.status='PENDING'
             OR (reminder.status='FAILED' AND reminder.next_attempt_at<=now())
             OR (reminder.status='SENDING' AND reminder.last_attempt_at<now()-($3::text||' minutes')::interval)
           )
         ORDER BY reminder.created_at
         FOR UPDATE SKIP LOCKED
         LIMIT 100
       )
       UPDATE pos_import_email_reminders reminder
       SET status='SENDING',attempt_count=attempt_count+1,last_attempt_at=now(),next_attempt_at=NULL,last_error_code=NULL,updated_at=now()
       FROM due
       WHERE reminder.id=due.id
       RETURNING reminder.id,reminder.branch_id "branchId",reminder.business_date::text "businessDate",
         reminder.recipient_user_id "recipientUserId",
         (SELECT recipient.email FROM users recipient WHERE recipient.id=reminder.recipient_user_id) "recipientEmail",
         (SELECT concat_ws(' ',recipient.first_name,recipient.last_name) FROM users recipient WHERE recipient.id=reminder.recipient_user_id) "recipientName",
         (SELECT branch.name FROM branches branch WHERE branch.id=reminder.branch_id) "branchName",
         coalesce((SELECT source.display_name FROM pos_sources source WHERE source.id=reminder.pos_source_id),'configured POS source') "sourceName"`,
      [businessDate, MAX_ATTEMPTS, STALE_CLAIM_MINUTES],
    );
    await client.query("COMMIT");
    return claimed.rows;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function stillMissing(reminder: ClaimedReminder) {
  const result = await pool.query(
    `SELECT NOT EXISTS (
       SELECT 1 FROM pos_imports imported
       WHERE imported.branch_id=$1 AND imported.business_date=$2::date
         AND imported.completed_at IS NOT NULL AND imported.voided_at IS NULL AND NOT imported.is_test_data
     ) AND NOT EXISTS (
       SELECT 1 FROM pos_daily_declarations declaration
       WHERE declaration.branch_id=$1 AND declaration.business_date=$2::date AND declaration.invalidated_at IS NULL
     ) AS missing`,
    [reminder.branchId, reminder.businessDate],
  );
  return result.rows[0]?.missing === true;
}

async function markSuppressed(id: string) {
  await pool.query(`UPDATE pos_import_email_reminders SET status='SUPPRESSED',updated_at=now() WHERE id=$1 AND status='SENDING'`, [id]);
}

async function markSent(reminder: ClaimedReminder) {
  await pool.query(
    `WITH updated AS (
       UPDATE pos_import_email_reminders SET status='SENT',sent_at=now(),updated_at=now()
       WHERE id=$1 AND status='SENDING' RETURNING id,branch_id,recipient_user_id,business_date
     )
     INSERT INTO audit_logs(user_id,branch_id,action,entity_type,entity_id,description,metadata)
     SELECT NULL,branch_id,'POS_IMPORT_REMINDER_SENT','POS_IMPORT_EMAIL_REMINDER',id::text,
       'Daily missing POS sales import reminder email sent',
       jsonb_build_object('businessDate',business_date,'recipientUserId',recipient_user_id)
     FROM updated`,
    [reminder.id],
  );
}

async function markFailed(reminder: ClaimedReminder, error: unknown) {
  await pool.query(
    `WITH updated AS (
       UPDATE pos_import_email_reminders
       SET status='FAILED',next_attempt_at=CASE WHEN attempt_count<$2 THEN now()+($3::text||' minutes')::interval ELSE NULL END,
         last_error_code=$4,updated_at=now()
       WHERE id=$1 AND status='SENDING' RETURNING id,branch_id,recipient_user_id,business_date,attempt_count
     )
     INSERT INTO audit_logs(user_id,branch_id,action,entity_type,entity_id,description,metadata)
     SELECT NULL,branch_id,'POS_IMPORT_REMINDER_FAILED','POS_IMPORT_EMAIL_REMINDER',id::text,
       'Daily missing POS sales import reminder email failed',
       jsonb_build_object('businessDate',business_date,'recipientUserId',recipient_user_id,'attempt',attempt_count,'errorCode',$4::text)
     FROM updated`,
    [reminder.id, MAX_ATTEMPTS, RETRY_DELAY_MINUTES, sanitizeEmailDeliveryErrorCode(error)],
  );
}

export async function sendMissingPosImportReminderEmails(businessDate: string) {
  if (!emailDeliveryConfigured()) return { configured: false, claimed: 0, sent: 0, failed: 0, suppressed: 0 };
  const reminders = await claimReminders(businessDate);
  let sent = 0;
  let failed = 0;
  let suppressed = 0;
  for (const reminder of reminders) {
    if (!(await stillMissing(reminder))) {
      await markSuppressed(reminder.id);
      suppressed += 1;
      continue;
    }
    try {
      await sendExternalEmail({
        to: reminder.recipientEmail,
        ...buildPosImportReminderEmail({recipientName:reminder.recipientName,branchName:reminder.branchName,businessDate:reminder.businessDate,appUrl:env.CLIENT_URL}),
      });
      await markSent(reminder);
      sent += 1;
    } catch (error) {
      await markFailed(reminder, error);
      failed += 1;
    }
  }
  return { configured: true, claimed: reminders.length, sent, failed, suppressed };
}
