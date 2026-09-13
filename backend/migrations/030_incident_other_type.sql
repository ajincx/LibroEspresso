ALTER TABLE incident_reports
  ADD COLUMN IF NOT EXISTS other_incident_type varchar(120);

ALTER TABLE incident_reports
  DROP CONSTRAINT IF EXISTS incident_other_type_consistency_check;

ALTER TABLE incident_reports
  ADD CONSTRAINT incident_other_type_consistency_check CHECK (
    (
      incident_type = 'OTHER'
      AND other_incident_type IS NOT NULL
      AND char_length(btrim(other_incident_type)) BETWEEN 1 AND 120
    )
    OR (
      incident_type <> 'OTHER'
      AND other_incident_type IS NULL
    )
  ) NOT VALID;

COMMENT ON COLUMN incident_reports.other_incident_type IS
  'Staff-provided clarification required for newly submitted OTHER incidents; separate from the incident description.';
