ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_number varchar(30);
ALTER TABLE users ADD COLUMN IF NOT EXISTS position varchar(100);

UPDATE users
SET position = CASE role
  WHEN 'OWNER' THEN 'Owner / System Administrator'
  ELSE 'Branch Manager'
END
WHERE position IS NULL;

ALTER TABLE users ALTER COLUMN position SET NOT NULL;
ALTER TABLE users ALTER COLUMN position SET DEFAULT 'Branch Manager';

CREATE TABLE IF NOT EXISTS direct_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 2000),
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT direct_messages_not_self CHECK (sender_user_id <> recipient_user_id)
);

CREATE INDEX IF NOT EXISTS direct_messages_conversation_idx
  ON direct_messages (sender_user_id, recipient_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS direct_messages_recipient_unread_idx
  ON direct_messages (recipient_user_id, created_at DESC) WHERE read_at IS NULL;
