ALTER TABLE branch_inventory_settings
  ADD COLUMN IF NOT EXISTS reorder_category varchar(10) NOT NULL DEFAULT 'MEDIUM'
  CHECK (reorder_category IN ('FAST', 'MEDIUM', 'SLOW'));

