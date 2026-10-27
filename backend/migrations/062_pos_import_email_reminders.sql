CREATE TABLE pos_import_email_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  business_date date NOT NULL,
  recipient_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pos_source_id uuid REFERENCES pos_sources(id) ON DELETE SET NULL,
  status varchar(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','SENDING','SENT','FAILED','SUPPRESSED')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 3),
  last_attempt_at timestamptz,
  next_attempt_at timestamptz,
  sent_at timestamptz,
  last_error_code varchar(80),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pos_import_email_reminders_once UNIQUE (branch_id,business_date,recipient_user_id),
  CONSTRAINT pos_import_email_reminders_sent_state CHECK ((status='SENT' AND sent_at IS NOT NULL) OR (status<>'SENT' AND sent_at IS NULL))
);
CREATE INDEX pos_import_email_reminders_due_idx ON pos_import_email_reminders(status,next_attempt_at,created_at) WHERE status<>'SENT';
ALTER TABLE pos_import_email_reminders ENABLE ROW LEVEL SECURITY;
DO $security$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
      EXECUTE format('REVOKE ALL ON TABLE public.pos_import_email_reminders FROM %I',role_name);
    END IF;
  END LOOP;
END
$security$;
