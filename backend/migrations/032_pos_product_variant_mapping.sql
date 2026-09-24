-- POS source and reviewed product/variant mapping infrastructure. No data seed.
CREATE TABLE pos_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_code varchar(80) NOT NULL UNIQUE,
  display_name varchar(160) NOT NULL,
  supported_format varchar(80) NOT NULL CHECK (supported_format IN
    ('CANONICAL_CSV','SUMMARY_ITEMS_SOLD_LEGACY_XLS','TRANSACTION_SUMMARY_XLSX')),
  status record_status NOT NULL DEFAULT 'INACTIVE',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (btrim(source_code) <> '' AND btrim(display_name) <> '')
);

CREATE TABLE pos_product_variant_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pos_source_id uuid NOT NULL REFERENCES pos_sources(id) ON DELETE RESTRICT,
  branch_id uuid REFERENCES branches(id) ON DELETE RESTRICT,
  source_product_name varchar(240) NOT NULL,
  normalized_source_product_name varchar(240) GENERATED ALWAYS AS
    (lower(regexp_replace(btrim(source_product_name), '[[:space:]]+', ' ', 'g'))) STORED,
  source_product_code varchar(160),
  menu_item_variant_id uuid NOT NULL REFERENCES menu_item_variants(id) ON DELETE RESTRICT,
  status record_status NOT NULL DEFAULT 'INACTIVE',
  reviewed_by uuid REFERENCES users(id) ON DELETE RESTRICT,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (btrim(source_product_name) <> ''),
  CHECK (source_product_code IS NULL OR btrim(source_product_code) <> ''),
  CHECK (status <> 'ACTIVE' OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL))
);

-- An exact external code cannot have two active targets in the same scope.
CREATE UNIQUE INDEX pos_mapping_active_code_uq ON pos_product_variant_mappings
  (pos_source_id, coalesce(branch_id,'00000000-0000-0000-0000-000000000000'::uuid), lower(btrim(source_product_code)))
  WHERE status='ACTIVE' AND source_product_code IS NOT NULL;
CREATE UNIQUE INDEX pos_mapping_active_name_uq ON pos_product_variant_mappings
  (pos_source_id, coalesce(branch_id,'00000000-0000-0000-0000-000000000000'::uuid), normalized_source_product_name)
  WHERE status='ACTIVE' AND source_product_code IS NULL;
CREATE INDEX pos_mapping_variant_idx ON pos_product_variant_mappings(menu_item_variant_id);
CREATE INDEX pos_mapping_branch_idx ON pos_product_variant_mappings(branch_id);

CREATE FUNCTION validate_active_pos_mapping() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status='ACTIVE' AND NOT EXISTS (
    SELECT 1 FROM menu_item_variants v JOIN menu_items m ON m.id=v.menu_item_id
    JOIN pos_sources s ON s.id=NEW.pos_source_id
    WHERE v.id=NEW.menu_item_variant_id AND v.status='ACTIVE'
      AND m.status='ACTIVE' AND m.approval_status='APPROVED' AND s.status='ACTIVE'
  ) THEN
    RAISE EXCEPTION 'Active POS mapping requires an active source, approved product, and active variant';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pos_mapping_active_target_guard BEFORE INSERT OR UPDATE ON pos_product_variant_mappings
  FOR EACH ROW EXECUTE FUNCTION validate_active_pos_mapping();

-- Deactivation never leaves an active mapping pointing at an inactive target.
CREATE FUNCTION deactivate_pos_mappings_for_variant() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status='INACTIVE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    UPDATE pos_product_variant_mappings SET status='INACTIVE',updated_at=now()
      WHERE menu_item_variant_id=NEW.id AND status='ACTIVE';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pos_mapping_variant_deactivation AFTER UPDATE OF status ON menu_item_variants
  FOR EACH ROW EXECUTE FUNCTION deactivate_pos_mappings_for_variant();

ALTER TABLE pos_imports ADD COLUMN pos_source_id uuid REFERENCES pos_sources(id) ON DELETE RESTRICT;
ALTER TABLE pos_sale_items ADD COLUMN menu_item_variant_id uuid REFERENCES menu_item_variants(id) ON DELETE RESTRICT;
ALTER TABLE menu_item_variants ADD CONSTRAINT menu_item_variants_parent_id_uq UNIQUE (menu_item_id,id);
ALTER TABLE pos_sale_items ADD CONSTRAINT pos_sale_items_variant_parent_fk
  FOREIGN KEY (menu_item_id,menu_item_variant_id)
  REFERENCES menu_item_variants(menu_item_id,id) ON DELETE RESTRICT;
-- Null for every historical sale; the composite FK prevents parent/variant disagreement.
