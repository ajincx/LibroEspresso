ALTER TABLE incident_reports
  ADD COLUMN IF NOT EXISTS manager_comment text;

ALTER TABLE incident_reports
  DROP CONSTRAINT IF EXISTS incident_manager_comment_length_check;

ALTER TABLE incident_reports
  ADD CONSTRAINT incident_manager_comment_length_check
  CHECK (manager_comment IS NULL OR char_length(manager_comment) <= 2000);
