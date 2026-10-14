ALTER TABLE inventory_opening_baselines
  DROP CONSTRAINT IF EXISTS inventory_opening_baselines_designation_check;

ALTER TABLE inventory_opening_baselines
  ADD CONSTRAINT inventory_opening_baselines_designation_check
  CHECK (designation IN ('UAT_OPENING', 'STARTING_STOCK'));

CREATE UNIQUE INDEX IF NOT EXISTS inventory_opening_baselines_one_starting_stock_per_branch_idx
  ON inventory_opening_baselines (branch_id)
  WHERE designation = 'STARTING_STOCK';

COMMENT ON COLUMN inventory_opening_baselines.designation IS
  'Classifies a preserved UAT opening baseline or the single operational Starting Stock baseline for a branch.';
