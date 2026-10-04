import type { RequestHandler } from "express";
import { pool } from "../config/database.js";
import { writeAudit } from "../services/audit.service.js";
import { AppError } from "../utils/appError.js";
import { messageIdParams, messageInput, userIdParams } from "../validators/account.js";
import type { TokenUser, UserRole } from "../types/auth.js";

type MessageParticipant = { id: string; role: UserRole; branchId: string | null; firstName?: string };

export function canMessageRecipient(sender: Pick<TokenUser, "id" | "role" | "branchId">, recipient: MessageParticipant) {
  if (sender.id === recipient.id) return false;
  if (sender.role === "OWNER") return true;
  if (sender.role === "STAFF") {
    return sender.branchId !== null && sender.branchId === recipient.branchId
      && (recipient.role === "STAFF" || recipient.role === "BRANCH_MANAGER");
  }
  return recipient.role === "OWNER"
    || recipient.role === "BRANCH_MANAGER"
    || (recipient.role === "STAFF" && sender.branchId !== null && sender.branchId === recipient.branchId);
}

async function requireMessageRecipient(user: TokenUser, recipientUserId: string) {
  const result = await pool.query<MessageParticipant>(
    `SELECT id,role,branch_id "branchId",first_name "firstName" FROM users WHERE id=$1 AND status='ACTIVE'`,
    [recipientUserId],
  );
  const recipient = result.rows[0];
  if (!recipient) throw new AppError(404, "MESSAGE_RECIPIENT_NOT_FOUND", "Message recipient not found");
  if (!canMessageRecipient(user, recipient)) {
    throw new AppError(403, "MESSAGE_SCOPE_FORBIDDEN", "You are not allowed to communicate with this user");
  }
  return recipient;
}

const messageSelection = `SELECT dm.id,dm.sender_user_id "senderUserId",dm.recipient_user_id "recipientUserId",
  dm.body,dm.read_at "readAt",dm.created_at "createdAt" FROM direct_messages dm`;

export const listMessageContacts: RequestHandler = async (req, res) => {
  const result = await pool.query(
    `SELECT u.id,u.first_name "firstName",u.last_name "lastName",u.email,u.role,u.position,
      u.branch_id "branchId",b.name "branchName",
      COALESCE(unread.count,0)::int "unreadCount",latest.body "lastMessage",latest.created_at "lastMessageAt"
     FROM users u
     LEFT JOIN branches b ON b.id=u.branch_id
     LEFT JOIN LATERAL (
       SELECT count(*) count FROM direct_messages dm
       WHERE dm.sender_user_id=u.id AND dm.recipient_user_id=$1 AND dm.read_at IS NULL AND dm.deleted_at IS NULL
     ) unread ON true
     LEFT JOIN LATERAL (
       SELECT dm.body,dm.created_at FROM direct_messages dm
       WHERE ((dm.sender_user_id=$1 AND dm.recipient_user_id=u.id)
          OR (dm.sender_user_id=u.id AND dm.recipient_user_id=$1))
         AND dm.deleted_at IS NULL
       ORDER BY dm.created_at DESC LIMIT 1
     ) latest ON true
     WHERE u.status='ACTIVE' AND u.id<>$1 AND (
       $2='OWNER'
       OR ($2='STAFF' AND u.branch_id=$3 AND u.role IN ('STAFF','BRANCH_MANAGER'))
       OR ($2='BRANCH_MANAGER' AND (u.role IN ('OWNER','BRANCH_MANAGER') OR (u.role='STAFF' AND u.branch_id=$3)))
     )
     ORDER BY latest.created_at DESC NULLS LAST,u.first_name,u.last_name`,
    [req.user!.id, req.user!.role, req.user!.branchId],
  );
  res.json({ success: true, data: { contacts: result.rows } });
};

export const getConversation: RequestHandler = async (req, res) => {
  const { userId } = userIdParams.parse(req.params);
  await requireMessageRecipient(req.user!, userId);
  const result = await pool.query(
    `${messageSelection} WHERE ((dm.sender_user_id=$1 AND dm.recipient_user_id=$2)
       OR (dm.sender_user_id=$2 AND dm.recipient_user_id=$1))
       AND dm.deleted_at IS NULL
     ORDER BY dm.created_at ASC LIMIT 300`,
    [req.user!.id, userId],
  );
  res.json({ success: true, data: { messages: result.rows } });
};

export const getMessageContext: RequestHandler = async (req, res) => {
  const { messageId } = messageIdParams.parse(req.params);
  const result = await pool.query<{ senderUserId: string; recipientUserId: string }>(
    `SELECT sender_user_id "senderUserId",recipient_user_id "recipientUserId" FROM direct_messages
     WHERE id=$1 AND deleted_at IS NULL AND (sender_user_id=$2 OR recipient_user_id=$2)`, [messageId, req.user!.id],
  );
  const row = result.rows[0];
  if (!row) throw new AppError(404, "MESSAGE_NOT_FOUND", "Message not found");
  const contactUserId = row.senderUserId === req.user!.id ? row.recipientUserId : row.senderUserId;
  await requireMessageRecipient(req.user!, contactUserId);
  res.json({ success: true, data: { contactUserId } });
};

export const sendMessage: RequestHandler = async (req, res) => {
  const input = messageInput.parse(req.body);
  if (input.recipientUserId === req.user!.id) throw new AppError(422, "SELF_MESSAGE", "You cannot message yourself");
  const recipient = await requireMessageRecipient(req.user!, input.recipientUserId);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO direct_messages (sender_user_id,recipient_user_id,body) VALUES ($1,$2,$3) RETURNING id`,
      [req.user!.id, input.recipientUserId, input.body],
    );
    const sender = await client.query<{ name: string }>(`SELECT concat(first_name,' ',last_name) name FROM users WHERE id=$1`, [req.user!.id]);
    const preview = input.body.length > 120 ? `${input.body.slice(0, 117)}...` : input.body;
    await client.query(
      `INSERT INTO notifications (recipient_user_id,type,title,message,entity_type,entity_id)
       VALUES ($1,'DIRECT_MESSAGE','New message from ' || $2,$3,'MESSAGE',$4)`,
      [input.recipientUserId, sender.rows[0]!.name, preview, inserted.rows[0]!.id],
    );
    await writeAudit(req.user!, "SEND_MESSAGE", "DIRECT_MESSAGE", inserted.rows[0]!.id, `Sent a direct message to ${recipient.firstName}`, { recipientUserId: input.recipientUserId }, client);
    await client.query("COMMIT");
    const message = await pool.query(`${messageSelection} WHERE dm.id=$1`, [inserted.rows[0]!.id]);
    res.status(201).json({ success: true, data: { message: message.rows[0] } });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
};

export const markConversationRead: RequestHandler = async (req, res) => {
  const { userId } = userIdParams.parse(req.params);
  await requireMessageRecipient(req.user!, userId);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const updated = await client.query<{ id: string }>(
      `UPDATE direct_messages SET read_at=COALESCE(read_at,now())
       WHERE sender_user_id=$1 AND recipient_user_id=$2 AND read_at IS NULL AND deleted_at IS NULL RETURNING id`,
      [userId, req.user!.id],
    );
    if (updated.rows.length) {
      await client.query(
        `UPDATE notifications SET read_at=COALESCE(read_at,now())
         WHERE recipient_user_id=$1 AND type='DIRECT_MESSAGE' AND entity_id=ANY($2::uuid[])`,
        [req.user!.id, updated.rows.map((row) => row.id)],
      );
    }
    await client.query("COMMIT");
    res.json({ success: true, data: { readCount: updated.rowCount ?? 0 } });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
};

export const deleteMessage: RequestHandler = async (req, res) => {
  const { messageId } = messageIdParams.parse(req.params);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const selected = await client.query<{ senderUserId: string; recipientUserId: string }>(
      `SELECT sender_user_id "senderUserId",recipient_user_id "recipientUserId"
       FROM direct_messages WHERE id=$1 AND deleted_at IS NULL FOR UPDATE`,
      [messageId],
    );
    const message = selected.rows[0];
    if (!message) throw new AppError(404, "MESSAGE_NOT_FOUND", "Message not found");
    if (message.senderUserId !== req.user!.id) {
      throw new AppError(403, "MESSAGE_DELETE_FORBIDDEN", "You can delete only messages that you sent");
    }
    await client.query(
      `UPDATE direct_messages SET deleted_at=now(),deleted_by_user_id=$2 WHERE id=$1`,
      [messageId, req.user!.id],
    );
    await client.query(`DELETE FROM notifications WHERE type='DIRECT_MESSAGE' AND entity_id=$1`, [messageId]);
    await writeAudit(req.user!, "DELETE_MESSAGE", "DIRECT_MESSAGE", messageId, "Deleted own sent direct message", { recipientUserId: message.recipientUserId }, client);
    await client.query("COMMIT");
    res.json({ success: true, data: { messageId } });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
};
