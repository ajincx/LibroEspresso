ALTER TABLE public.inventory_opening_baselines
  ADD COLUMN designated_inventory_item_id uuid
  REFERENCES public.inventory_items(id) ON DELETE RESTRICT;

ALTER TABLE public.inventory_opening_baselines
  DROP CONSTRAINT inventory_opening_baselines_branch_id_effective_at_designat_key;

CREATE UNIQUE INDEX inventory_opening_baselines_legacy_effective_designation_idx
  ON public.inventory_opening_baselines (branch_id, effective_at, designation)
  WHERE designation IN ('UAT_OPENING', 'STARTING_STOCK');

ALTER TABLE public.inventory_opening_baselines
  DROP CONSTRAINT inventory_opening_baselines_designation_check;

ALTER TABLE public.inventory_opening_baselines
  ADD CONSTRAINT inventory_opening_baselines_designation_check CHECK (
    (designation IN ('UAT_OPENING', 'STARTING_STOCK') AND designated_inventory_item_id IS NULL)
    OR
    (designation = 'ITEM_INITIALIZATION' AND designated_inventory_item_id IS NOT NULL)
  );

CREATE UNIQUE INDEX inventory_opening_baselines_one_item_initialization_idx
  ON public.inventory_opening_baselines (branch_id, designated_inventory_item_id)
  WHERE designation = 'ITEM_INITIALIZATION';

CREATE OR REPLACE FUNCTION public.validate_item_initialization_checkpoint()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  checkpoint_id uuid;
  checkpoint_designation varchar(30);
  checkpoint_item_id uuid;
  child_count integer;
  matching_child_count integer;
BEGIN
  IF TG_TABLE_NAME = 'inventory_opening_baselines' THEN
    checkpoint_id := COALESCE(NEW.id, OLD.id);
  ELSE
    checkpoint_id := COALESCE(NEW.opening_baseline_id, OLD.opening_baseline_id);
  END IF;

  SELECT designation, designated_inventory_item_id
    INTO checkpoint_designation, checkpoint_item_id
    FROM public.inventory_opening_baselines
   WHERE id = checkpoint_id;

  IF checkpoint_designation = 'ITEM_INITIALIZATION' THEN
    SELECT count(*)::integer,
           count(*) FILTER (WHERE inventory_item_id = checkpoint_item_id)::integer
      INTO child_count, matching_child_count
      FROM public.inventory_opening_baseline_items
     WHERE opening_baseline_id = checkpoint_id;

    IF child_count <> 1 OR matching_child_count <> 1 THEN
      RAISE EXCEPTION 'ITEM_INITIALIZATION must contain exactly its designated inventory item';
    END IF;
  END IF;

  IF TG_TABLE_NAME = 'inventory_opening_baseline_items' THEN
    IF TG_OP = 'UPDATE'
       AND OLD.opening_baseline_id IS DISTINCT FROM NEW.opening_baseline_id THEN
      SELECT designation, designated_inventory_item_id
        INTO checkpoint_designation, checkpoint_item_id
        FROM public.inventory_opening_baselines
       WHERE id = OLD.opening_baseline_id;

      IF checkpoint_designation = 'ITEM_INITIALIZATION' THEN
        SELECT count(*)::integer,
               count(*) FILTER (WHERE inventory_item_id = checkpoint_item_id)::integer
          INTO child_count, matching_child_count
          FROM public.inventory_opening_baseline_items
         WHERE opening_baseline_id = OLD.opening_baseline_id;

        IF child_count <> 1 OR matching_child_count <> 1 THEN
          RAISE EXCEPTION 'ITEM_INITIALIZATION must contain exactly its designated inventory item';
        END IF;
      END IF;
    END IF;
  END IF;

  RETURN NULL;
END $$;

CREATE CONSTRAINT TRIGGER inventory_opening_baselines_item_initialization_consistency
AFTER INSERT OR UPDATE OF designation, designated_inventory_item_id
ON public.inventory_opening_baselines
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.validate_item_initialization_checkpoint();

CREATE CONSTRAINT TRIGGER inventory_opening_baseline_items_item_initialization_consistency
AFTER INSERT OR UPDATE OR DELETE
ON public.inventory_opening_baseline_items
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.validate_item_initialization_checkpoint();

REVOKE EXECUTE ON FUNCTION public.validate_item_initialization_checkpoint()
  FROM PUBLIC;

COMMENT ON COLUMN public.inventory_opening_baselines.designated_inventory_item_id IS
  'The single branch ingredient established by an ITEM_INITIALIZATION checkpoint; null for legacy and Starting Stock baselines.';

COMMENT ON COLUMN public.inventory_opening_baselines.designation IS
  'Classifies a preserved UAT baseline, the branch Starting Stock baseline, or a one-time branch ingredient initialization.';
