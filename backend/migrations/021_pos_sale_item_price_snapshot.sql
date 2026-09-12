ALTER TABLE pos_sale_items ADD COLUMN IF NOT EXISTS unit_price_snapshot numeric(12,2);

UPDATE pos_sale_items psi
SET unit_price_snapshot = COALESCE(mi.selling_price, 0)
FROM menu_items mi
WHERE mi.id = psi.menu_item_id AND psi.unit_price_snapshot IS NULL;

UPDATE pos_sale_items
SET unit_price_snapshot = 0
WHERE unit_price_snapshot IS NULL;

ALTER TABLE pos_sale_items ALTER COLUMN unit_price_snapshot SET DEFAULT 0;
ALTER TABLE pos_sale_items ALTER COLUMN unit_price_snapshot SET NOT NULL;