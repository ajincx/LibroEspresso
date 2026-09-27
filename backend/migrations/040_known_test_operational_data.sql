ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS is_test_data boolean NOT NULL DEFAULT false;
ALTER TABLE inventory_counts ADD COLUMN IF NOT EXISTS is_test_data boolean NOT NULL DEFAULT false;
ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS is_test_data boolean NOT NULL DEFAULT false;
ALTER TABLE branch_inventory_balances ADD COLUMN IF NOT EXISTS is_test_data boolean NOT NULL DEFAULT false;
ALTER TABLE shrinkage_reports ADD COLUMN IF NOT EXISTS is_test_data boolean NOT NULL DEFAULT false;
ALTER TABLE incident_reports ADD COLUMN IF NOT EXISTS is_test_data boolean NOT NULL DEFAULT false;

-- Explicitly identified in the capstone audit as development-only records.
UPDATE purchase_orders SET is_test_data=true WHERE po_no='PO-2026-00002' AND supplier_name='Bumbie';
UPDATE inventory_counts SET is_test_data=true WHERE count_no='IC-2026-00005';
UPDATE branch_inventory_balances balance SET is_test_data=true
WHERE EXISTS (
  SELECT 1 FROM inventory_counts count_record
  WHERE count_record.count_no='IC-2026-00005'
    AND count_record.branch_id=balance.branch_id
    AND balance.as_of=count_record.count_date+time '23:59:59'
);
UPDATE inventory_movements SET is_test_data=true WHERE reference_no='PO-2026-00002';
UPDATE shrinkage_reports SET is_test_data=true WHERE report_no='SR-2026-00002';
UPDATE incident_reports SET is_test_data=true WHERE id IN (
  'fb0f2dad-4c99-4dc6-adf5-f9bc0ca6ca9d',
  '4cefbf4f-e726-44f2-b23a-b930395505b5',
  '98ec1f66-ce3c-4c7c-8174-e879d5a55cc4',
  'a8327b15-7513-4e7a-8a74-292e0a7ee1dd'
);

CREATE INDEX IF NOT EXISTS idx_inventory_counts_official ON inventory_counts(branch_id,count_date) WHERE NOT is_test_data;
CREATE INDEX IF NOT EXISTS idx_purchase_orders_official ON purchase_orders(branch_id,status) WHERE NOT is_test_data;
CREATE INDEX IF NOT EXISTS idx_shrinkage_reports_official ON shrinkage_reports(branch_id,detected_at) WHERE NOT is_test_data;
