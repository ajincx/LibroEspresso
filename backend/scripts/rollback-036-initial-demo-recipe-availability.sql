-- Manual rollback companion for migration 036.
-- Run only as a separately reviewed operation before any POS sales are imported.
BEGIN;

DO $$
DECLARE
  eligible_recipes integer;
  usage_references integer;
BEGIN
  SELECT count(*)::int INTO eligible_recipes
    FROM recipes
   WHERE version=1
     AND status='ACTIVE'
     AND effective_from=DATE '2026-01-01'
     AND effective_to IS NULL
     AND change_reason IN (
       'SAMPLE / ASSUMED — FOR SYSTEM DEMONSTRATION',
       'SAMPLE / ASSUMED RECIPE QUANTITY — FOR SYSTEM DEMONSTRATION'
     );

  SELECT count(*)::int INTO usage_references
    FROM pos_sale_ingredient_usage usage
    JOIN recipes r ON r.id=usage.recipe_version_id
   WHERE r.version=1
     AND r.effective_from=DATE '2026-01-01';

  IF eligible_recipes<>36 THEN
    RAISE EXCEPTION 'Rollback expected 36 initial recipes; found %',eligible_recipes;
  END IF;
  IF usage_references<>0 THEN
    RAISE EXCEPTION 'Rollback refused because % ingredient-usage snapshots reference the initial recipes',usage_references;
  END IF;

  UPDATE recipes r
     SET effective_from=CASE WHEN EXISTS (
       SELECT 1 FROM audit_logs audit
        WHERE audit.entity_type='RECIPE'
          AND audit.entity_id=r.id
          AND audit.action='CREATE_SAMPLE_RECIPE'
          AND audit.metadata->>'source'='firstBeverageRecipeBatch.ts'
     ) THEN DATE '2026-09-24' ELSE DATE '2026-09-25' END
   WHERE r.version=1
     AND r.status='ACTIVE'
     AND r.effective_from=DATE '2026-01-01'
     AND r.effective_to IS NULL
     AND r.change_reason IN (
       'SAMPLE / ASSUMED — FOR SYSTEM DEMONSTRATION',
       'SAMPLE / ASSUMED RECIPE QUANTITY — FOR SYSTEM DEMONSTRATION'
     );

  IF (SELECT count(*) FROM recipes WHERE effective_from IN (DATE '2026-09-24',DATE '2026-09-25'))<>36 THEN
    RAISE EXCEPTION 'Rollback did not restore exactly 36 recipe dates';
  END IF;
END $$;

COMMIT;
