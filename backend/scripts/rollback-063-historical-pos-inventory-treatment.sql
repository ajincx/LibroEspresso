DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pos_imports
     WHERE inventory_accounting_treatment='HISTORICAL_REPORTING_CUTOVER'
  ) THEN
    RAISE EXCEPTION 'Rollback 063 refused: historical reporting cutover imports exist and their accounting evidence must be preserved.';
  END IF;
END $$;

DROP INDEX IF EXISTS pos_imports_inventory_accounting_treatment_idx;
ALTER TABLE pos_imports
  DROP CONSTRAINT IF EXISTS pos_imports_inventory_accounting_decision_check,
  DROP CONSTRAINT IF EXISTS pos_imports_inventory_accounting_treatment_check,
  DROP CONSTRAINT IF EXISTS pos_imports_cogs_cost_basis_check,
  DROP COLUMN IF EXISTS inventory_accounting_reason,
  DROP COLUMN IF EXISTS inventory_accounting_decided_by,
  DROP COLUMN IF EXISTS inventory_accounting_decided_at,
  DROP COLUMN IF EXISTS inventory_accounting_treatment,
  DROP COLUMN IF EXISTS cogs_cost_basis;
