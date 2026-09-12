DO $$ BEGIN
  CREATE TYPE staff_schedule_status AS ENUM ('SCHEDULED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS staff_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  shift_date date NOT NULL,
  scheduled_start time NOT NULL,
  scheduled_end time NOT NULL,
  break_allowance_minutes integer NOT NULL DEFAULT 60 CHECK (break_allowance_minutes BETWEEN 0 AND 480),
  grace_minutes integer NOT NULL DEFAULT 10 CHECK (grace_minutes BETWEEN 0 AND 120),
  status staff_schedule_status NOT NULL DEFAULT 'SCHEDULED',
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, shift_date),
  CONSTRAINT staff_schedule_time_check CHECK (scheduled_end > scheduled_start)
);

CREATE INDEX IF NOT EXISTS staff_schedules_branch_date_idx
  ON staff_schedules (branch_id, shift_date, scheduled_start);

ALTER TABLE attendance_records
  ADD COLUMN IF NOT EXISTS schedule_id uuid REFERENCES staff_schedules(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS late_minutes integer NOT NULL DEFAULT 0 CHECK (late_minutes >= 0),
  ADD COLUMN IF NOT EXISTS late_reason text;

CREATE INDEX IF NOT EXISTS attendance_records_schedule_idx
  ON attendance_records (schedule_id);
