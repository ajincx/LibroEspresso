ALTER TABLE shrinkage_reports
  ADD COLUMN IF NOT EXISTS evidence_review_confirmed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS evidence_basis text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS verification_safeguard_version smallint NOT NULL DEFAULT 0;

-- Existing classifications remain untouched; newly written investigations use v1.
ALTER TABLE shrinkage_reports ALTER COLUMN verification_safeguard_version SET DEFAULT 1;

ALTER TABLE shrinkage_reports DROP CONSTRAINT IF EXISTS shrinkage_review_state_check;
ALTER TABLE shrinkage_reports ADD CONSTRAINT shrinkage_review_state_check CHECK (
  (status = 'DETECTED'
    AND classification IS NULL
    AND explanation IS NULL
    AND reviewed_by IS NULL
    AND reviewed_at IS NULL)
  OR
  (status IN ('VERIFIED', 'PENDING_REVIEW')
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

ALTER TABLE shrinkage_reports DROP CONSTRAINT IF EXISTS verified_pilferage_evidence_check;
ALTER TABLE shrinkage_reports ADD CONSTRAINT verified_pilferage_evidence_check CHECK (
  classification <> 'PILFERAGE'
  OR status = 'DETECTED'
  OR verification_safeguard_version = 0
  OR (
    length(trim(explanation)) >= 20
    AND evidence_review_confirmed = true
    AND cardinality(evidence_basis) >= 1
  )
);
