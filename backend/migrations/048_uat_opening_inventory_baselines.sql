CREATE SEQUENCE IF NOT EXISTS inventory_opening_baseline_no_seq START WITH 1;

CREATE TABLE IF NOT EXISTS inventory_opening_baselines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  baseline_no varchar(30) NOT NULL UNIQUE,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  effective_at timestamptz NOT NULL,
  designation varchar(30) NOT NULL CHECK (designation IN ('UAT_OPENING')),
  notes text NOT NULL,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (branch_id, effective_at, designation)
);

CREATE TABLE IF NOT EXISTS inventory_opening_baseline_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opening_baseline_id uuid NOT NULL REFERENCES inventory_opening_baselines(id) ON DELETE RESTRICT,
  inventory_item_id uuid NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
  quantity numeric(16,4) NOT NULL CHECK (quantity >= 0),
  unit varchar(20) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (opening_baseline_id, inventory_item_id)
);

CREATE INDEX IF NOT EXISTS inventory_opening_baselines_branch_effective_idx
  ON inventory_opening_baselines (branch_id, effective_at DESC);
CREATE INDEX IF NOT EXISTS inventory_opening_baseline_items_item_idx
  ON inventory_opening_baseline_items (inventory_item_id, opening_baseline_id);

CREATE OR REPLACE FUNCTION enforce_opening_baseline_item_unit()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE canonical_unit varchar(20);
BEGIN
  SELECT unit INTO canonical_unit FROM inventory_items WHERE id=NEW.inventory_item_id;
  IF canonical_unit IS NULL THEN
    RAISE EXCEPTION 'Opening-baseline inventory item does not exist';
  END IF;
  IF NEW.unit <> canonical_unit THEN
    RAISE EXCEPTION 'Opening-baseline unit must match inventory canonical unit %', canonical_unit;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS inventory_opening_baseline_items_canonical_unit ON inventory_opening_baseline_items;
CREATE TRIGGER inventory_opening_baseline_items_canonical_unit
BEFORE INSERT OR UPDATE OF inventory_item_id,unit,quantity ON inventory_opening_baseline_items
FOR EACH ROW EXECUTE FUNCTION enforce_opening_baseline_item_unit();

COMMENT ON TABLE inventory_opening_baselines IS
  'Auditable opening inventory headers; these are not physical inventory counts.';
COMMENT ON TABLE inventory_opening_baseline_items IS
  'Immutable item quantities for an opening inventory baseline in canonical inventory units.';
COMMENT ON COLUMN inventory_opening_baselines.designation IS
  'Explicit classification preventing UAT opening inventory from being represented as a physical count.';
