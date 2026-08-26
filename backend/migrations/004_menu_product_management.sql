CREATE TABLE IF NOT EXISTS menu_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(100) NOT NULL,
  description text NOT NULL DEFAULT '',
  status record_status NOT NULL DEFAULT 'ACTIVE',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS menu_categories_name_lower_uq ON menu_categories (lower(name));

INSERT INTO menu_categories (name)
SELECT DISTINCT category FROM menu_items WHERE trim(category) <> ''
ON CONFLICT (lower(name)) DO NOTHING;

INSERT INTO menu_categories (name) VALUES
  ('Coffee'),('Non-Coffee'),('Pastries'),('Food'),('Tea'),('Refreshers'),('Desserts'),('Add-ons'),('Others')
ON CONFLICT (lower(name)) DO NOTHING;

ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '';
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS category_id uuid;
UPDATE menu_items m SET category_id=c.id FROM menu_categories c WHERE m.category_id IS NULL AND lower(c.name)=lower(m.category);
DO $$ BEGIN
  ALTER TABLE menu_items ADD CONSTRAINT menu_items_category_id_fk FOREIGN KEY (category_id) REFERENCES menu_categories(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS menu_items_category_id_idx ON menu_items (category_id);

CREATE TABLE IF NOT EXISTS pos_sale_ingredient_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pos_sale_item_id uuid NOT NULL REFERENCES pos_sale_items(id) ON DELETE CASCADE,
  inventory_item_id uuid NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
  quantity_consumed numeric(18,4) NOT NULL CHECK (quantity_consumed >= 0),
  unit varchar(30) NOT NULL,
  unit_cost_snapshot numeric(14,4) NOT NULL CHECK (unit_cost_snapshot >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pos_sale_item_id, inventory_item_id)
);
CREATE INDEX IF NOT EXISTS pos_sale_ingredient_usage_item_idx ON pos_sale_ingredient_usage (inventory_item_id);

INSERT INTO pos_sale_ingredient_usage (pos_sale_item_id,inventory_item_id,quantity_consumed,unit,unit_cost_snapshot)
SELECT psi.id,ri.inventory_item_id,psi.quantity_sold*ri.quantity/r.yield_quantity,ri.unit,ii.unit_cost
FROM pos_sale_items psi
JOIN recipes r ON r.menu_item_id=psi.menu_item_id
JOIN recipe_items ri ON ri.recipe_id=r.id
JOIN inventory_items ii ON ii.id=ri.inventory_item_id
ON CONFLICT (pos_sale_item_id,inventory_item_id) DO NOTHING;
