-- Sprint 6: canonical UOM controls and immutable recipe history.
-- Existing recipes predate version tracking, so Version 1 uses PostgreSQL's
-- semantic '-infinity' date to mean "legacy start date unknown" rather than
-- inventing a historical effective date.

ALTER TABLE recipes DROP CONSTRAINT IF EXISTS recipes_menu_item_id_key;

ALTER TABLE recipes
  ADD COLUMN IF NOT EXISTS version integer,
  ADD COLUMN IF NOT EXISTS effective_from date,
  ADD COLUMN IF NOT EXISTS effective_to date,
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS change_reason text;

UPDATE recipes SET version=1 WHERE version IS NULL;
UPDATE recipes SET effective_from='-infinity'::date WHERE effective_from IS NULL;

ALTER TABLE recipes ALTER COLUMN version SET NOT NULL;
ALTER TABLE recipes ALTER COLUMN version SET DEFAULT 1;
ALTER TABLE recipes ALTER COLUMN effective_from SET NOT NULL;
ALTER TABLE recipes ALTER COLUMN effective_from SET DEFAULT CURRENT_DATE;

ALTER TABLE recipes DROP CONSTRAINT IF EXISTS recipes_version_positive_check;
ALTER TABLE recipes ADD CONSTRAINT recipes_version_positive_check CHECK (version > 0);
ALTER TABLE recipes DROP CONSTRAINT IF EXISTS recipes_effective_period_check;
ALTER TABLE recipes ADD CONSTRAINT recipes_effective_period_check
  CHECK (effective_to IS NULL OR effective_to > effective_from);

CREATE UNIQUE INDEX IF NOT EXISTS recipes_menu_version_uq ON recipes(menu_item_id,version);
CREATE INDEX IF NOT EXISTS recipes_effective_lookup_idx
  ON recipes(menu_item_id,effective_from,effective_to,status);
CREATE UNIQUE INDEX IF NOT EXISTS recipes_one_open_version_uq
  ON recipes(menu_item_id) WHERE effective_to IS NULL;

ALTER TABLE pos_sale_ingredient_usage
  ADD COLUMN IF NOT EXISTS recipe_version_id uuid REFERENCES recipes(id) ON DELETE RESTRICT;

UPDATE pos_sale_ingredient_usage usage
   SET recipe_version_id=r.id
  FROM pos_sale_items psi
  JOIN recipes r ON r.menu_item_id=psi.menu_item_id AND r.version=1
 WHERE usage.pos_sale_item_id=psi.id AND usage.recipe_version_id IS NULL;

CREATE INDEX IF NOT EXISTS pos_sale_usage_recipe_version_idx
  ON pos_sale_ingredient_usage(recipe_version_id);

-- Count aliases are exactly equivalent and require no quantity conversion.
UPDATE inventory_items SET unit='pc',updated_at=now()
 WHERE lower(trim(unit)) IN ('pc','pcs','piece','pieces') AND unit<>'pc';
UPDATE recipe_items SET unit='pc',updated_at=now()
 WHERE lower(trim(unit)) IN ('pc','pcs','piece','pieces') AND unit<>'pc';

ALTER TABLE inventory_items DROP CONSTRAINT IF EXISTS inventory_items_supported_unit_check;
ALTER TABLE inventory_items ADD CONSTRAINT inventory_items_supported_unit_check
  CHECK (unit IN ('g','kg','ml','L','pc'));
ALTER TABLE recipe_items DROP CONSTRAINT IF EXISTS recipe_items_supported_unit_check;
ALTER TABLE recipe_items ADD CONSTRAINT recipe_items_supported_unit_check
  CHECK (unit IN ('g','kg','ml','L','pc'));
