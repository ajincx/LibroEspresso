CREATE SEQUENCE IF NOT EXISTS inventory_item_code_seq;

SELECT setval(
  'inventory_item_code_seq',
  COALESCE((
    SELECT max(substring(sku FROM '^ING-([0-9]+)$')::bigint)
      FROM inventory_items
     WHERE sku ~ '^ING-[0-9]+$'
  ), 0) + 1,
  false
);

ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS item_scope varchar(10) NOT NULL DEFAULT 'GLOBAL',
  ADD COLUMN IF NOT EXISTS origin_branch_id uuid REFERENCES branches(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE inventory_items
  DROP CONSTRAINT IF EXISTS inventory_items_scope_check;

ALTER TABLE inventory_items
  ADD CONSTRAINT inventory_items_scope_check
  CHECK (
    (item_scope = 'GLOBAL' AND origin_branch_id IS NULL)
    OR
    (item_scope = 'BRANCH' AND origin_branch_id IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS inventory_items_scope_branch_idx
  ON inventory_items (item_scope, origin_branch_id, status);
