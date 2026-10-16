-- Daily Opening and Closing counts extend the existing physical-count ledger.
-- Legacy rows remain FULL counts and retain their original end-of-day semantics.
ALTER TABLE inventory_counts
  ADD COLUMN IF NOT EXISTS count_type varchar(10) NOT NULL DEFAULT 'FULL',
  ADD COLUMN IF NOT EXISTS effective_at timestamptz;

ALTER TABLE inventory_counts
  DROP CONSTRAINT IF EXISTS inventory_counts_count_type_check;
ALTER TABLE inventory_counts
  ADD CONSTRAINT inventory_counts_count_type_check
  CHECK (count_type IN ('FULL', 'OPENING', 'CLOSING'));

ALTER TABLE inventory_counts
  DROP CONSTRAINT IF EXISTS inventory_counts_daily_effective_at_check;
ALTER TABLE inventory_counts
  ADD CONSTRAINT inventory_counts_daily_effective_at_check
  CHECK (count_type = 'FULL' OR effective_at IS NOT NULL);

-- Replace the legacy one-count-per-day constraint with one count of each type.
-- Test/UAT rows remain historical and do not block an operational submission.
ALTER TABLE inventory_counts
  DROP CONSTRAINT IF EXISTS inventory_counts_branch_id_count_date_key;
CREATE UNIQUE INDEX IF NOT EXISTS inventory_counts_operational_type_unique
  ON inventory_counts(branch_id, count_date, count_type)
  WHERE NOT is_test_data;
CREATE INDEX IF NOT EXISTS inventory_counts_effective_order_idx
  ON inventory_counts(branch_id, count_date, count_type, effective_at, submitted_at)
  WHERE NOT is_test_data;

-- Corrections are append-only. The original inventory_count_items row is never
-- overwritten; readers use the newest correction as the effective quantity.
CREATE TABLE IF NOT EXISTS inventory_count_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_count_item_id uuid NOT NULL REFERENCES inventory_count_items(id) ON DELETE RESTRICT,
  revision integer NOT NULL CHECK (revision > 0),
  previous_actual_quantity numeric(16,4) NOT NULL CHECK (previous_actual_quantity >= 0),
  corrected_actual_quantity numeric(16,4) NOT NULL CHECK (corrected_actual_quantity >= 0),
  previous_variance_quantity numeric(16,4) NOT NULL,
  corrected_variance_quantity numeric(16,4) NOT NULL,
  previous_variance_value numeric(16,4) NOT NULL,
  corrected_variance_value numeric(16,4) NOT NULL,
  reason text NOT NULL CHECK (length(btrim(reason)) >= 10),
  corrected_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  corrected_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(inventory_count_item_id, revision)
);
CREATE INDEX IF NOT EXISTS inventory_count_corrections_latest_idx
  ON inventory_count_corrections(inventory_count_item_id, revision DESC);

-- A successful, reconciled import is only daily-complete after the Manager
-- explicitly confirms that it covers the whole business day.
ALTER TABLE pos_daily_declarations
  ADD COLUMN IF NOT EXISTS pos_source_id uuid REFERENCES pos_sources(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS pos_import_id uuid REFERENCES pos_imports(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz;

ALTER TABLE pos_daily_declarations
  DROP CONSTRAINT IF EXISTS pos_daily_declarations_declaration_check;
ALTER TABLE pos_daily_declarations
  ADD CONSTRAINT pos_daily_declarations_declaration_check
  CHECK (declaration IN ('NO_SALES_CLOSED', 'SALES_COMPLETE'));

ALTER TABLE pos_daily_declarations
  DROP CONSTRAINT IF EXISTS pos_daily_declarations_sales_complete_check;
ALTER TABLE pos_daily_declarations
  ADD CONSTRAINT pos_daily_declarations_sales_complete_check
  CHECK (
    (declaration = 'NO_SALES_CLOSED' AND pos_import_id IS NULL)
    OR
    (declaration = 'SALES_COMPLETE' AND pos_source_id IS NOT NULL AND pos_import_id IS NOT NULL AND confirmed_at IS NOT NULL)
  );

CREATE UNIQUE INDEX IF NOT EXISTS pos_daily_declarations_import_unique
  ON pos_daily_declarations(pos_import_id)
  WHERE pos_import_id IS NOT NULL;
