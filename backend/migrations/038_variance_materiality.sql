ALTER TABLE calculation_settings
  ADD COLUMN IF NOT EXISTS variance_tolerance_percent numeric(6,2) NOT NULL DEFAULT 2
    CHECK (variance_tolerance_percent BETWEEN 0 AND 100);

ALTER TABLE calculation_settings
  ALTER COLUMN variance_tolerance_quantity SET DEFAULT 1;

UPDATE calculation_settings
   SET variance_tolerance_quantity = 1
 WHERE variance_tolerance_quantity <= 0.0001;

ALTER TABLE purchase_order_items
  ADD COLUMN IF NOT EXISTS purchase_uom varchar(10),
  ADD COLUMN IF NOT EXISTS conversion_factor numeric(16,6);

UPDATE purchase_order_items poi
   SET purchase_uom = ii.unit,
       conversion_factor = 1
  FROM inventory_items ii
 WHERE ii.id = poi.inventory_item_id
   AND (poi.purchase_uom IS NULL OR poi.conversion_factor IS NULL);

ALTER TABLE purchase_order_items
  ALTER COLUMN purchase_uom SET NOT NULL,
  ALTER COLUMN conversion_factor SET NOT NULL,
  ALTER COLUMN conversion_factor SET DEFAULT 1;

ALTER TABLE purchase_order_items
  DROP CONSTRAINT IF EXISTS purchase_order_items_conversion_factor_check;

ALTER TABLE purchase_order_items
  ADD CONSTRAINT purchase_order_items_conversion_factor_check
  CHECK (conversion_factor > 0);
