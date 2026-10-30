-- Append-only Manager decisions for Staff Incident evidence suggestions.
-- Original incident reports and investigation evidence remain immutable.
CREATE TABLE IF NOT EXISTS incident_shrinkage_evidence_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_report_id uuid NOT NULL REFERENCES incident_reports(id) ON DELETE RESTRICT,
  incident_report_item_id uuid NOT NULL REFERENCES incident_report_items(id) ON DELETE RESTRICT,
  shrinkage_report_id uuid NOT NULL REFERENCES shrinkage_reports(id) ON DELETE RESTRICT,
  decision varchar(20) NOT NULL CHECK (decision IN ('ACCEPTED','REJECTED','UNLINKED')),
  reason text NOT NULL CHECK (length(btrim(reason)) >= 3),
  decided_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  decided_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS incident_evidence_decisions_lookup_idx
  ON incident_shrinkage_evidence_decisions
  (shrinkage_report_id,incident_report_item_id,decided_at DESC);

ALTER TABLE incident_shrinkage_evidence_decisions ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE target_role text;
BEGIN
  FOREACH target_role IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF to_regrole(target_role) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE incident_shrinkage_evidence_decisions FROM %I',target_role);
    END IF;
  END LOOP;
END $$;

COMMENT ON TABLE incident_shrinkage_evidence_decisions IS
  'Append-only audit history of Manager accept, reject, and unlink decisions for incident evidence candidates.';
