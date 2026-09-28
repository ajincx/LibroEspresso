-- POS imports are always business records. Cleanup eligibility is controlled by
-- the runtime lifecycle environment, not by a filename, hash, date, or fixture flag.
ALTER TABLE pos_imports
  ADD COLUMN IF NOT EXISTS created_environment varchar(20) NOT NULL DEFAULT 'PRODUCTION',
  ADD COLUMN IF NOT EXISTS cleanup_authorized_by uuid REFERENCES users(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS cleanup_authorized_at timestamptz,
  ADD COLUMN IF NOT EXISTS cleanup_reason text;

ALTER TABLE pos_imports
  DROP CONSTRAINT IF EXISTS pos_imports_created_environment_check;

ALTER TABLE pos_imports
  ADD CONSTRAINT pos_imports_created_environment_check
  CHECK (created_environment IN ('DEVELOPMENT','UAT','PRODUCTION'));

ALTER TABLE pos_imports
  DROP CONSTRAINT IF EXISTS pos_imports_cleanup_authorization_check;

ALTER TABLE pos_imports
  ADD CONSTRAINT pos_imports_cleanup_authorization_check CHECK (
    (cleanup_authorized_by IS NULL AND cleanup_authorized_at IS NULL AND cleanup_reason IS NULL)
    OR
    (cleanup_authorized_by IS NOT NULL AND cleanup_authorized_at IS NOT NULL AND btrim(cleanup_reason) <> '')
  );

ALTER TABLE pos_sale_items
  ADD COLUMN IF NOT EXISTS pos_source_id uuid REFERENCES pos_sources(id) ON DELETE RESTRICT;

UPDATE pos_sale_items sale
   SET pos_source_id = imported.pos_source_id
  FROM pos_imports imported
 WHERE imported.id = sale.pos_import_id
   AND sale.pos_source_id IS NULL;

DROP INDEX IF EXISTS pos_imports_content_identity_idx;
CREATE UNIQUE INDEX pos_imports_content_identity_idx
  ON pos_imports (
    branch_id,
    (coalesce(pos_source_id,'00000000-0000-0000-0000-000000000000'::uuid)),
    business_date,
    content_hash
  )
  WHERE content_hash IS NOT NULL;

DROP INDEX IF EXISTS pos_sale_items_source_identity_idx;
CREATE UNIQUE INDEX pos_sale_items_source_identity_idx
  ON pos_sale_items (
    branch_id,
    (coalesce(pos_source_id,'00000000-0000-0000-0000-000000000000'::uuid)),
    business_date,
    source_transaction_id,
    source_line_id
  )
  WHERE source_transaction_id IS NOT NULL AND source_line_id IS NOT NULL;

COMMENT ON COLUMN pos_imports.created_environment IS
  'Lifecycle environment in which this business POS import was created; used only for cleanup policy enforcement.';
COMMENT ON COLUMN pos_imports.cleanup_authorized_by IS
  'Owner who explicitly authorized cleanup in UAT. Null outside an authorized UAT cleanup.';
COMMENT ON COLUMN pos_sale_items.pos_source_id IS
  'POS source identity copied from the parent import so source transaction identifiers remain unique per supplier system.';
