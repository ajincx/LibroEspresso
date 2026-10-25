BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM public.inventory_opening_baselines
     WHERE designation = 'ITEM_INITIALIZATION'
  ) THEN
    RAISE EXCEPTION 'Rollback 060 refused: ITEM_INITIALIZATION business records exist';
  END IF;
END $$;

DROP TRIGGER IF EXISTS inventory_opening_baseline_items_item_initialization_consistency
  ON public.inventory_opening_baseline_items;
DROP TRIGGER IF EXISTS inventory_opening_baselines_item_initialization_consistency
  ON public.inventory_opening_baselines;
DROP FUNCTION IF EXISTS public.validate_item_initialization_checkpoint();
DROP INDEX IF EXISTS public.inventory_opening_baselines_one_item_initialization_idx;
DROP INDEX IF EXISTS public.inventory_opening_baselines_legacy_effective_designation_idx;

ALTER TABLE public.inventory_opening_baselines
  DROP CONSTRAINT inventory_opening_baselines_designation_check;

ALTER TABLE public.inventory_opening_baselines
  ADD CONSTRAINT inventory_opening_baselines_designation_check
  CHECK (designation IN ('UAT_OPENING', 'STARTING_STOCK'));

ALTER TABLE public.inventory_opening_baselines
  DROP COLUMN designated_inventory_item_id;

ALTER TABLE public.inventory_opening_baselines
  ADD CONSTRAINT inventory_opening_baselines_branch_id_effective_at_designat_key
  UNIQUE (branch_id, effective_at, designation);

COMMENT ON COLUMN public.inventory_opening_baselines.designation IS
  'Classifies a preserved UAT opening baseline or the single operational Starting Stock baseline for a branch.';

COMMIT;
