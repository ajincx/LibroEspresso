-- Emergency rollback for 058_function_search_path_hardening.sql.
-- Restore the exact pre-058 function bodies and remove their search_path settings.

CREATE OR REPLACE FUNCTION public.deactivate_pos_mappings_for_variant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  IF NEW.status='INACTIVE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    UPDATE pos_product_variant_mappings SET status='INACTIVE',updated_at=now()
      WHERE menu_item_variant_id=NEW.id AND status='ACTIVE';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.enforce_incident_report_item_unit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE canonical_unit varchar(20);
BEGIN
  SELECT unit INTO canonical_unit FROM inventory_items WHERE id=NEW.inventory_item_id;
  IF canonical_unit IS NULL THEN
    RAISE EXCEPTION 'Incident inventory item does not exist';
  END IF;
  NEW.unit := canonical_unit;
  NEW.updated_at := now();
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.enforce_opening_baseline_item_unit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
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

CREATE OR REPLACE FUNCTION public.validate_active_pos_mapping()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
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

ALTER FUNCTION public.deactivate_pos_mappings_for_variant() RESET search_path;
ALTER FUNCTION public.enforce_incident_report_item_unit() RESET search_path;
ALTER FUNCTION public.enforce_opening_baseline_item_unit() RESET search_path;
ALTER FUNCTION public.validate_active_pos_mapping() RESET search_path;

DELETE FROM public.schema_migrations
WHERE filename = '058_function_search_path_hardening.sql';
