ALTER TABLE pos_imports
  ADD COLUMN IF NOT EXISTS content_hash char(64),
  ADD COLUMN IF NOT EXISTS total_source_rows integer NOT NULL DEFAULT 0 CHECK (total_source_rows >= 0),
  ADD COLUMN IF NOT EXISTS valid_rows integer NOT NULL DEFAULT 0 CHECK (valid_rows >= 0),
  ADD COLUMN IF NOT EXISTS warning_rows integer NOT NULL DEFAULT 0 CHECK (warning_rows >= 0),
  ADD COLUMN IF NOT EXISTS invalid_rows integer NOT NULL DEFAULT 0 CHECK (invalid_rows >= 0),
  ADD COLUMN IF NOT EXISTS unmatched_rows integer NOT NULL DEFAULT 0 CHECK (unmatched_rows >= 0),
  ADD COLUMN IF NOT EXISTS import_status varchar(20) NOT NULL DEFAULT 'COMPLETE',
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;

ALTER TABLE pos_imports DROP CONSTRAINT IF EXISTS pos_import_status_check;
ALTER TABLE pos_imports ADD CONSTRAINT pos_import_status_check
  CHECK (import_status IN ('COMPLETE', 'NEEDS_REVIEW'));

-- Filenames are descriptive only. Idempotency is enforced by normalized content
-- and source transaction/line identifiers so a corrected export may reuse a name.
ALTER TABLE pos_imports DROP CONSTRAINT IF EXISTS pos_imports_branch_id_business_date_source_filename_key;

CREATE UNIQUE INDEX IF NOT EXISTS pos_imports_content_identity_idx
  ON pos_imports (branch_id, business_date, content_hash)
  WHERE content_hash IS NOT NULL;

ALTER TABLE pos_sale_items
  ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES branches(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS business_date date,
  ADD COLUMN IF NOT EXISTS source_product text,
  ADD COLUMN IF NOT EXISTS source_transaction_id varchar(160),
  ADD COLUMN IF NOT EXISTS source_line_id varchar(160),
  ADD COLUMN IF NOT EXISTS transaction_timestamp timestamptz;

UPDATE pos_sale_items psi
   SET branch_id=pi.branch_id,business_date=pi.business_date
  FROM pos_imports pi
 WHERE pi.id=psi.pos_import_id AND (psi.branch_id IS NULL OR psi.business_date IS NULL);

ALTER TABLE pos_sale_items ALTER COLUMN branch_id SET NOT NULL;
ALTER TABLE pos_sale_items ALTER COLUMN business_date SET NOT NULL;
ALTER TABLE pos_sale_items DROP CONSTRAINT IF EXISTS pos_sale_items_pos_import_id_menu_item_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS pos_sale_items_source_identity_idx
  ON pos_sale_items (branch_id,business_date,source_transaction_id,source_line_id)
  WHERE source_transaction_id IS NOT NULL AND source_line_id IS NOT NULL;
