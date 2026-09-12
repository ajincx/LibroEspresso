-- Support multiple recorded breaks per attendance day and optional product context for incidents.
CREATE TABLE IF NOT EXISTS attendance_breaks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attendance_id uuid NOT NULL REFERENCES attendance_records(id) ON DELETE CASCADE,
  break_start timestamptz NOT NULL DEFAULT now(),
  break_end timestamptz,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT attendance_break_period_check CHECK (break_end IS NULL OR break_end >= break_start),
  CONSTRAINT attendance_break_reason_check CHECK (reason IS NULL OR char_length(btrim(reason)) >= 3)
);

CREATE INDEX IF NOT EXISTS attendance_breaks_attendance_idx
  ON attendance_breaks (attendance_id, break_start);
CREATE UNIQUE INDEX IF NOT EXISTS attendance_breaks_one_active_idx
  ON attendance_breaks (attendance_id) WHERE break_end IS NULL;

INSERT INTO attendance_breaks (attendance_id,break_start,break_end)
SELECT id,break_start,break_end FROM attendance_records WHERE break_start IS NOT NULL
ON CONFLICT DO NOTHING;

ALTER TABLE attendance_records
  DROP COLUMN IF EXISTS break_start,
  DROP COLUMN IF EXISTS break_end;

ALTER TABLE incident_reports
  ADD COLUMN IF NOT EXISTS menu_item_id uuid REFERENCES menu_items(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS incident_reports_menu_item_idx ON incident_reports (menu_item_id);
