-- POS imports now proceed directly after Manager validation and preview.
-- Existing approval-linked reconciliations remain intact for historical records.
ALTER TABLE pos_import_reconciliations
  ALTER COLUMN approval_id DROP NOT NULL;
