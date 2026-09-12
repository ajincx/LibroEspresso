-- Scheduling is outside the approved system scope. Preserve attendance as factual clock events only.
ALTER TABLE attendance_records
  DROP COLUMN IF EXISTS schedule_id,
  DROP COLUMN IF EXISTS late_minutes,
  DROP COLUMN IF EXISTS late_reason;

DROP TABLE IF EXISTS staff_schedules;
DROP TYPE IF EXISTS staff_schedule_status;
