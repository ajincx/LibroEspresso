import { pool } from "../config/database.js";
import { emailDeliveryConfigured, sendExternalEmail } from "./emailTransport.service.js";

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

function safeErrorCode(error: unknown) {
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : "SMTP_DELIVERY_FAILED";
  return /^[A-Z0-9_-]{1,80}$/i.test(code) ? code.toUpperCase() : "SMTP_DELIVERY_FAILED";
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
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
    [reminder.id, MAX_ATTEMPTS, RETRY_DELAY_MINUTES, safeErrorCode(error)],
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
      const recipientName = escapeHtml(reminder.recipientName);
      const branchName = escapeHtml(reminder.branchName);
      const sourceName = escapeHtml(reminder.sourceName);
      await sendExternalEmail({
        to: reminder.recipientEmail,
        subject: `POS sales import reminder — ${reminder.branchName}`,
        text: `Hello ${reminder.recipientName}, the POS sales report for ${reminder.branchName} on ${reminder.businessDate} is still pending. Please import the completed ${reminder.sourceName} report or record a valid no-sales/closed day in Libro Espresso.`,
        html: `<p>Hello ${recipientName},</p><p>The POS sales report for <strong>${branchName}</strong> on <strong>${reminder.businessDate}</strong> is still pending.</p><p>Please import the completed ${sourceName} report or record a valid no-sales/closed day in Libro Espresso.</p>`,
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
