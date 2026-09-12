-- Sprint 7: indexes used by date-scoped, branch-scoped management analytics.
CREATE INDEX IF NOT EXISTS pos_imports_branch_business_date_idx
  ON pos_imports (branch_id, business_date);
CREATE INDEX IF NOT EXISTS shrinkage_reports_analytics_idx
  ON shrinkage_reports (branch_id, detected_at, status, classification);
CREATE INDEX IF NOT EXISTS inventory_count_items_count_item_value_idx
  ON inventory_count_items (inventory_count_id, inventory_item_id, variance_value);
CREATE INDEX IF NOT EXISTS purchase_orders_open_delivery_idx
  ON purchase_orders (branch_id, expected_delivery_date)
  WHERE status IN ('ORDERED', 'PARTIALLY_RECEIVED');
