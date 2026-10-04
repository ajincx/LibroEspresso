ALTER TABLE direct_messages
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS direct_messages_active_conversation_idx
  ON direct_messages (sender_user_id, recipient_user_id, created_at DESC)
  WHERE deleted_at IS NULL;
