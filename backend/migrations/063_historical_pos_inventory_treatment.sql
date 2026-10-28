-- Historical sales remain accepted business sales while explicitly recording
-- whether their recipe usage participates in the operational stock ledger.
ALTER TABLE pos_imports
  ADD COLUMN IF NOT EXISTS inventory_accounting_treatment varchar(40) NOT NULL DEFAULT 'OPERATIONAL',
  ADD COLUMN IF NOT EXISTS inventory_accounting_reason text,
  ADD COLUMN IF NOT EXISTS inventory_accounting_decided_by uuid REFERENCES users(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS inventory_accounting_decided_at timestamptz,
  ADD COLUMN IF NOT EXISTS cogs_cost_basis varchar(50) NOT NULL DEFAULT 'IMPORT_TIME_CONFIGURED_COST';

ALTER TABLE pos_imports
  DROP CONSTRAINT IF EXISTS pos_imports_inventory_accounting_treatment_check;
ALTER TABLE pos_imports
  ADD CONSTRAINT pos_imports_inventory_accounting_treatment_check
  CHECK (inventory_accounting_treatment IN ('OPERATIONAL','HISTORICAL_REPORTING_CUTOVER'));

ALTER TABLE pos_imports
  DROP CONSTRAINT IF EXISTS pos_imports_inventory_accounting_decision_check;
ALTER TABLE pos_imports
  ADD CONSTRAINT pos_imports_inventory_accounting_decision_check CHECK (
    (inventory_accounting_treatment='OPERATIONAL'
      AND inventory_accounting_reason IS NULL
      AND inventory_accounting_decided_by IS NULL
      AND inventory_accounting_decided_at IS NULL)
    OR
    (inventory_accounting_treatment='HISTORICAL_REPORTING_CUTOVER'
      AND btrim(coalesce(inventory_accounting_reason,'')) <> ''
      AND inventory_accounting_decided_by IS NOT NULL
      AND inventory_accounting_decided_at IS NOT NULL)
  );

ALTER TABLE pos_imports
  DROP CONSTRAINT IF EXISTS pos_imports_cogs_cost_basis_check;
ALTER TABLE pos_imports
  ADD CONSTRAINT pos_imports_cogs_cost_basis_check
  CHECK (cogs_cost_basis IN ('IMPORT_TIME_CONFIGURED_COST','HISTORICAL_CONFIGURED_COST_ESTIMATE'));

CREATE INDEX IF NOT EXISTS pos_imports_inventory_accounting_treatment_idx
  ON pos_imports (branch_id,inventory_accounting_treatment,business_date)
  WHERE voided_at IS NULL;

COMMENT ON COLUMN pos_imports.inventory_accounting_treatment IS
  'OPERATIONAL deducts recipe usage from expected inventory. HISTORICAL_REPORTING_CUTOVER keeps accepted sales, usage, COGS and forecasts but excludes pre-cutover usage from live stock calculations.';
COMMENT ON COLUMN pos_imports.inventory_accounting_reason IS
  'Immutable import-time explanation for a historical reporting cutover decision.';
COMMENT ON COLUMN pos_imports.cogs_cost_basis IS
  'Identifies whether COGS uses an import-time configured cost or an estimated current configured cost for backfilled history.';
