-- Owner-reviewed POS onboarding states and activation safeguards. No data seed.
ALTER TABLE pos_sources
  ADD COLUMN format_verified_by uuid REFERENCES users(id) ON DELETE RESTRICT,
  ADD COLUMN format_verified_at timestamptz;

ALTER TABLE pos_sources
  ADD CONSTRAINT pos_sources_active_format_review_check
  CHECK (status <> 'ACTIVE' OR (format_verified_by IS NOT NULL AND format_verified_at IS NOT NULL));

ALTER TABLE pos_product_variant_mappings
  ADD COLUMN review_status varchar(20) NOT NULL DEFAULT 'PENDING',
  ADD COLUMN review_comment text;

UPDATE pos_product_variant_mappings
   SET review_status = CASE WHEN status='ACTIVE' THEN 'APPROVED' ELSE 'PENDING' END;

ALTER TABLE pos_product_variant_mappings
  ADD CONSTRAINT pos_mapping_review_status_check
  CHECK (review_status IN ('PENDING','APPROVED','REJECTED','AMBIGUOUS')),
  ADD CONSTRAINT pos_mapping_approved_activation_check
  CHECK (status <> 'ACTIVE' OR review_status='APPROVED');

CREATE INDEX pos_mapping_review_status_idx
  ON pos_product_variant_mappings(pos_source_id,review_status);

CREATE OR REPLACE FUNCTION validate_active_pos_mapping() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status='ACTIVE' AND NOT EXISTS (
    SELECT 1
      FROM menu_item_variants v
      JOIN menu_items m ON m.id=v.menu_item_id
      JOIN pos_sources s ON s.id=NEW.pos_source_id
     WHERE v.id=NEW.menu_item_variant_id
       AND v.status='ACTIVE'
       AND m.status='ACTIVE'
       AND m.approval_status='APPROVED'
       AND s.status='ACTIVE'
       AND s.format_verified_by IS NOT NULL
       AND s.format_verified_at IS NOT NULL
       AND EXISTS (
         SELECT 1
           FROM recipes r
          WHERE r.menu_item_variant_id=v.id
            AND r.status='ACTIVE'
            AND r.effective_from<=CURRENT_DATE
            AND (r.effective_to IS NULL OR r.effective_to>CURRENT_DATE)
            AND EXISTS (SELECT 1 FROM recipe_items ri WHERE ri.recipe_id=r.id)
            AND NOT EXISTS (
              SELECT 1
                FROM recipe_items ri
                JOIN inventory_items ii ON ii.id=ri.inventory_item_id
               WHERE ri.recipe_id=r.id
                 AND NOT (
                   (ri.unit IN ('g','kg') AND ii.unit IN ('g','kg')) OR
                   (ri.unit IN ('ml','L') AND ii.unit IN ('ml','L')) OR
                   (ri.unit='pc' AND ii.unit='pc')
                 )
            )
       )
  ) THEN
    RAISE EXCEPTION 'Active POS mapping requires a format-verified source and a valid active variant recipe';
  END IF;
  RETURN NEW;
END $$;
