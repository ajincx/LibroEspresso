-- Preserve incorrect POS imports for audit while removing them from
-- authoritative accounting and allowing a corrected report to be imported.
ALTER TABLE pos_imports
  ADD COLUMN IF NOT EXISTS voided_at timestamptz,
  ADD COLUMN IF NOT EXISTS voided_by uuid REFERENCES users(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS void_reason text;

ALTER TABLE pos_imports
  DROP CONSTRAINT IF EXISTS pos_imports_void_state_check;
ALTER TABLE pos_imports
  ADD CONSTRAINT pos_imports_void_state_check CHECK (
    (voided_at IS NULL AND voided_by IS NULL AND void_reason IS NULL)
    OR
    (voided_at IS NOT NULL AND voided_by IS NOT NULL AND length(btrim(void_reason)) >= 10)
  );

-- The child marker is used only by the active transaction-line uniqueness
-- index. Original sale rows and ingredient snapshots remain unchanged.
ALTER TABLE pos_sale_items
  ADD COLUMN IF NOT EXISTS voided_at timestamptz;

DROP INDEX IF EXISTS pos_imports_content_identity_idx;
CREATE UNIQUE INDEX pos_imports_content_identity_idx
  ON pos_imports (
    branch_id,
    (coalesce(pos_source_id,'00000000-0000-0000-0000-000000000000'::uuid)),
    business_date,
    content_hash
  )
  WHERE content_hash IS NOT NULL AND voided_at IS NULL;

DROP INDEX IF EXISTS pos_sale_items_source_identity_idx;
CREATE UNIQUE INDEX pos_sale_items_source_identity_idx
  ON pos_sale_items (
    branch_id,
    (coalesce(pos_source_id,'00000000-0000-0000-0000-000000000000'::uuid)),
    business_date,
    source_transaction_id,
    source_line_id
  )
  WHERE source_transaction_id IS NOT NULL
    AND source_line_id IS NOT NULL
    AND voided_at IS NULL;

CREATE INDEX IF NOT EXISTS pos_imports_authoritative_scope_idx
  ON pos_imports(branch_id,business_date,pos_source_id)
  WHERE NOT is_test_data AND voided_at IS NULL;

-- A void makes any existing whole-day confirmation stale. Keep the original
-- declaration, mark it invalid, and allow a new active declaration after the
-- corrected file is accepted.
ALTER TABLE pos_daily_declarations
  ADD COLUMN IF NOT EXISTS invalidated_at timestamptz,
  ADD COLUMN IF NOT EXISTS invalidated_by uuid REFERENCES users(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS invalidation_reason text;

ALTER TABLE pos_daily_declarations
  DROP CONSTRAINT IF EXISTS pos_daily_declarations_invalidation_check;
ALTER TABLE pos_daily_declarations
  ADD CONSTRAINT pos_daily_declarations_invalidation_check CHECK (
    (invalidated_at IS NULL AND invalidated_by IS NULL AND invalidation_reason IS NULL)
    OR
    (invalidated_at IS NOT NULL AND invalidated_by IS NOT NULL AND length(btrim(invalidation_reason)) >= 10)
  );

ALTER TABLE pos_daily_declarations
  DROP CONSTRAINT IF EXISTS pos_daily_declarations_branch_id_business_date_key;
CREATE UNIQUE INDEX IF NOT EXISTS pos_daily_declarations_active_day_unique
  ON pos_daily_declarations(branch_id,business_date)
  WHERE invalidated_at IS NULL;

