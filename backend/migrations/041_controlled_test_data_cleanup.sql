ALTER TABLE pos_imports
  ADD COLUMN IF NOT EXISTS is_test_data boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_pos_imports_test_data
  ON pos_imports(branch_id,business_date,is_test_data);

CREATE TABLE IF NOT EXISTS pos_test_fixture_authorizations (
  content_hash char(64) PRIMARY KEY,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  source_format varchar(80) NOT NULL CHECK (source_format IN ('SUMMARY_ITEMS_SOLD_LEGACY_XLS','TRANSACTION_SUMMARY_XLSX')),
  business_date date NOT NULL,
  reason text NOT NULL CHECK (btrim(reason) <> ''),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO pos_test_fixture_authorizations(content_hash,branch_id,source_format,business_date,reason)
SELECT fixture.content_hash,b.id,fixture.source_format,DATE '2026-09-16','User-authorized capstone POS format fixture for repeatable development testing'
FROM branches b
CROSS JOIN (VALUES
  ('60532d73d2f88bcf240311d9bbe782bc18ac4fe23a700146e9780c953c573457'::char(64),'SUMMARY_ITEMS_SOLD_LEGACY_XLS'),
  ('8da596614654a0bd5ff7626f1cb4d105e39cf2039f2c60de9e99a3cdbd39f52b'::char(64),'TRANSACTION_SUMMARY_XLSX')
) fixture(content_hash,source_format)
WHERE b.name='Gulod / Main Branch'
ON CONFLICT(content_hash) DO NOTHING;

ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS test_authorized_by uuid REFERENCES users(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS test_authorized_at timestamptz,
  ADD COLUMN IF NOT EXISTS test_authorization_reason text;

ALTER TABLE purchase_order_items
  ADD COLUMN IF NOT EXISTS test_prior_setting_existed boolean,
  ADD COLUMN IF NOT EXISTS test_prior_unit_cost numeric(14,4),
  ADD COLUMN IF NOT EXISTS test_cost_applied_at timestamptz;

COMMENT ON COLUMN pos_imports.is_test_data IS
  'Explicit development/test classification. Never inferred from filename, extension, branch, source, or date.';
COMMENT ON COLUMN purchase_order_items.test_prior_unit_cost IS
  'Cost snapshot used only to reverse an Owner-authorized test purchase-order receipt cleanup.';
