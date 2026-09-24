-- Menu product variant support. Existing menu_items.selling_price remains for
-- legacy consumers; historical sales and recipe records are not modified.
CREATE TABLE IF NOT EXISTS menu_item_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_item_id uuid NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  name varchar(80) NOT NULL,
  selling_price numeric(14,2) NOT NULL CHECK (selling_price >= 0),
  status record_status NOT NULL DEFAULT 'ACTIVE',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT menu_item_variants_name_not_blank CHECK (trim(name) <> '')
);

CREATE UNIQUE INDEX IF NOT EXISTS menu_item_variants_product_name_uq
  ON menu_item_variants (menu_item_id, lower(name));
CREATE INDEX IF NOT EXISTS menu_item_variants_product_status_idx
  ON menu_item_variants (menu_item_id, status);

-- Existing products retain their IDs, prices, recipes, and sales. The new
-- Standard child simply describes their already-existing current price.
INSERT INTO menu_item_variants (menu_item_id, name, selling_price, status)
SELECT id, 'Standard', selling_price, status FROM menu_items
ON CONFLICT (menu_item_id, lower(name)) DO NOTHING;

INSERT INTO menu_categories (name) VALUES
  ('Warm Tales'), ('Cold Classics'), ('Chilled Chapter'),
  ('The Liter-Egg-y Feast'), ('The Anthology'), ('Fork and Folio'),
  ('Book Bites'), ('The Stacked Stories'), ('Sweet Endings'), ('Oven Edition')
ON CONFLICT (lower(name)) DO NOTHING;
