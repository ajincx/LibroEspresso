CREATE TABLE IF NOT EXISTS inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku varchar(40) NOT NULL UNIQUE,
  name varchar(160) NOT NULL,
  category varchar(100) NOT NULL,
  unit varchar(30) NOT NULL,
  unit_cost numeric(14,4) NOT NULL CHECK (unit_cost >= 0),
  reorder_level numeric(14,4) NOT NULL DEFAULT 0 CHECK (reorder_level >= 0),
  status record_status NOT NULL DEFAULT 'ACTIVE',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS inventory_items_category_idx ON inventory_items (category);
CREATE INDEX IF NOT EXISTS inventory_items_status_idx ON inventory_items (status);

CREATE TABLE IF NOT EXISTS menu_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code varchar(40) NOT NULL UNIQUE,
  name varchar(160) NOT NULL,
  category varchar(100) NOT NULL,
  selling_price numeric(14,2) NOT NULL CHECK (selling_price >= 0),
  status record_status NOT NULL DEFAULT 'ACTIVE',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS menu_items_category_idx ON menu_items (category);
CREATE INDEX IF NOT EXISTS menu_items_status_idx ON menu_items (status);

CREATE TABLE IF NOT EXISTS recipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_item_id uuid NOT NULL UNIQUE REFERENCES menu_items(id) ON DELETE RESTRICT,
  name varchar(160) NOT NULL,
  yield_quantity numeric(12,4) NOT NULL DEFAULT 1 CHECK (yield_quantity > 0),
  status record_status NOT NULL DEFAULT 'ACTIVE',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS recipe_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id uuid NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  inventory_item_id uuid NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
  quantity numeric(14,4) NOT NULL CHECK (quantity > 0),
  unit varchar(30) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (recipe_id, inventory_item_id)
);
CREATE INDEX IF NOT EXISTS recipe_items_recipe_idx ON recipe_items (recipe_id);
CREATE INDEX IF NOT EXISTS recipe_items_inventory_item_idx ON recipe_items (inventory_item_id);
