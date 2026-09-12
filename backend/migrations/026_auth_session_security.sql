ALTER TABLE users
  ADD COLUMN IF NOT EXISTS failed_login_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until timestamptz;

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_failed_login_attempts_check;
ALTER TABLE users ADD CONSTRAINT users_failed_login_attempts_check
  CHECK (failed_login_attempts BETWEEN 0 AND 5);

CREATE INDEX IF NOT EXISTS users_locked_until_idx
  ON users (locked_until)
  WHERE locked_until IS NOT NULL;

CREATE TABLE IF NOT EXISTS auth_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_identifier_hash char(64) NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  revoke_reason varchar(80),
  ip_address varchar(64),
  user_agent varchar(255),
  CONSTRAINT auth_sessions_expiry_check CHECK (expires_at > created_at),
  CONSTRAINT auth_sessions_revocation_check CHECK (
    (revoked_at IS NULL AND revoke_reason IS NULL)
    OR (revoked_at IS NOT NULL AND revoke_reason IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS auth_sessions_user_active_idx
  ON auth_sessions (user_id, expires_at DESC)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS auth_sessions_cleanup_idx
  ON auth_sessions (expires_at, revoked_at);
