-- Lifecycle markers preserve business history while allowing controlled UAT cleanup.
ALTER TABLE inventory_count_items
  ADD COLUMN IF NOT EXISTS voided_at timestamptz,
  ADD COLUMN IF NOT EXISTS voided_by uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS void_reason text;

ALTER TABLE shrinkage_reports
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS archive_reason text;

ALTER TABLE incident_reports
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS archive_reason text,
  ADD COLUMN IF NOT EXISTS archive_action varchar(20);

ALTER TABLE incident_reports DROP CONSTRAINT IF EXISTS incident_reports_archive_action_check;
ALTER TABLE incident_reports ADD CONSTRAINT incident_reports_archive_action_check
  CHECK (archive_action IS NULL OR archive_action IN ('CANCELLED','ARCHIVED'));

ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS reversed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reversed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reversal_reason text;

CREATE INDEX IF NOT EXISTS inventory_count_items_active_idx
  ON inventory_count_items(inventory_count_id) WHERE voided_at IS NULL;
CREATE INDEX IF NOT EXISTS shrinkage_reports_active_idx
  ON shrinkage_reports(branch_id,detected_at DESC) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS incident_reports_active_idx
  ON incident_reports(branch_id,occurred_at DESC) WHERE archived_at IS NULL;

COMMENT ON COLUMN inventory_count_items.void_reason IS 'Required reason for a controlled void; the variance row is retained.';
COMMENT ON COLUMN shrinkage_reports.archive_reason IS 'Required reason for dismissing/archiving a detected anomaly without deleting its history.';
COMMENT ON COLUMN incident_reports.archive_action IS 'Lifecycle action applied without deleting the incident record.';
COMMENT ON COLUMN purchase_orders.reversal_reason IS 'Reason for a received-PO stock reversal implemented through compensating movements.';
