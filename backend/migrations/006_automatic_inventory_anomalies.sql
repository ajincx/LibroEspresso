ALTER TABLE shrinkage_reports DROP CONSTRAINT IF EXISTS shrinkage_review_state_check;
ALTER TABLE shrinkage_reports ALTER COLUMN status DROP DEFAULT;

CREATE TYPE shrinkage_report_status_v2 AS ENUM ('DETECTED', 'PENDING_REVIEW', 'REVIEWED');
ALTER TABLE shrinkage_reports
  ALTER COLUMN status TYPE shrinkage_report_status_v2
  USING status::text::shrinkage_report_status_v2;
DROP TYPE shrinkage_report_status;
ALTER TYPE shrinkage_report_status_v2 RENAME TO shrinkage_report_status;

ALTER TABLE shrinkage_reports
  ALTER COLUMN status SET DEFAULT 'DETECTED',
  ALTER COLUMN classification DROP NOT NULL,
  ALTER COLUMN explanation DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS detected_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS investigated_at timestamptz;

UPDATE shrinkage_reports
SET detected_at = created_at,
    investigated_at = submitted_at
WHERE status IN ('PENDING_REVIEW', 'REVIEWED');

ALTER TABLE shrinkage_reports
  ADD CONSTRAINT shrinkage_review_state_check CHECK (
    (status = 'DETECTED'
      AND classification IS NULL
      AND explanation IS NULL
      AND reviewed_by IS NULL
      AND reviewed_at IS NULL)
    OR
    (status = 'PENDING_REVIEW'
      AND classification IS NOT NULL
      AND length(trim(explanation)) >= 10
      AND investigated_at IS NOT NULL
      AND reviewed_by IS NULL
      AND reviewed_at IS NULL)
    OR
    (status = 'REVIEWED'
      AND classification IS NOT NULL
      AND length(trim(explanation)) >= 10
      AND investigated_at IS NOT NULL
      AND reviewed_by IS NOT NULL
      AND reviewed_at IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS shrinkage_reports_detected_idx
  ON shrinkage_reports (branch_id, detected_at DESC)
  WHERE status = 'DETECTED';
