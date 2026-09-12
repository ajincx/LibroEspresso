CREATE TABLE IF NOT EXISTS branch_inventory_settings (
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  inventory_item_id uuid NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  current_unit_cost numeric(14,4) NOT NULL CHECK (current_unit_cost >= 0),
  reorder_level numeric(14,4) NOT NULL DEFAULT 0 CHECK (reorder_level >= 0),
  reorder_days integer NOT NULL DEFAULT 7 CHECK (reorder_days > 0 AND reorder_days <= 365),
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (branch_id, inventory_item_id)
);

INSERT INTO branch_inventory_settings (branch_id,inventory_item_id,current_unit_cost,reorder_level,reorder_days)
SELECT b.id,ii.id,ii.unit_cost,ii.reorder_level,7
  FROM branches b CROSS JOIN inventory_items ii
ON CONFLICT (branch_id,inventory_item_id) DO NOTHING;

CREATE INDEX IF NOT EXISTS branch_inventory_settings_item_idx
  ON branch_inventory_settings (inventory_item_id,branch_id);
