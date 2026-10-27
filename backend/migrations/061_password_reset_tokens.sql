CREATE TABLE password_reset_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash char(64) NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  request_ip varchar(64),
  user_agent varchar(255),
  CONSTRAINT password_reset_expiry_after_creation CHECK (expires_at > created_at)
);
CREATE INDEX password_reset_tokens_user_active_idx ON password_reset_tokens(user_id,expires_at) WHERE consumed_at IS NULL;
ALTER TABLE password_reset_tokens ENABLE ROW LEVEL SECURITY;
DO $security$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
      EXECUTE format('REVOKE ALL ON TABLE public.password_reset_tokens FROM %I',role_name);
    END IF;
  END LOOP;
END
$security$;
