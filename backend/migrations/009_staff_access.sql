ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_branch_check;
ALTER TABLE users ADD CONSTRAINT users_role_branch_check CHECK (
  (role = 'OWNER' AND branch_id IS NULL)
  OR (role IN ('BRANCH_MANAGER', 'STAFF') AND branch_id IS NOT NULL)
);

ALTER TABLE attendance_records DROP CONSTRAINT IF EXISTS attendance_time_order_check;
ALTER TABLE attendance_records ADD CONSTRAINT attendance_time_order_check CHECK (
  (clock_in IS NULL OR clock_out IS NULL OR clock_out >= clock_in)
  AND (break_start IS NULL OR clock_in IS NOT NULL)
  AND (break_end IS NULL OR break_start IS NOT NULL)
  AND (break_end IS NULL OR break_end >= break_start)
  AND (clock_out IS NULL OR break_start IS NULL OR break_end IS NOT NULL)
);
