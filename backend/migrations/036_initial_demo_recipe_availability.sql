-- Establish the initial availability date of the reviewed SAMPLE / ASSUMED recipe set.
-- This deliberately preserves recipe effective-date lookup; it does not permit a future
-- recipe version to apply to an earlier sale.
DO $$
DECLARE
  affected_recipes integer;
  affected_items integer;
  historical_versions integer;
  usage_references integer;
BEGIN
  SELECT count(*)::int INTO affected_recipes
    FROM recipes r
   WHERE r.version=1
     AND r.status='ACTIVE'
     AND r.effective_from IN (DATE '2026-09-24',DATE '2026-09-25')
     AND r.effective_to IS NULL
     AND r.change_reason IN (
       'SAMPLE / ASSUMED — FOR SYSTEM DEMONSTRATION',
       'SAMPLE / ASSUMED RECIPE QUANTITY — FOR SYSTEM DEMONSTRATION'
     );

  SELECT count(*)::int INTO affected_items
    FROM recipe_items ri
    JOIN recipes r ON r.id=ri.recipe_id
   WHERE r.version=1
     AND r.status='ACTIVE'
     AND r.effective_from IN (DATE '2026-09-24',DATE '2026-09-25')
     AND r.effective_to IS NULL
     AND r.change_reason IN (
       'SAMPLE / ASSUMED — FOR SYSTEM DEMONSTRATION',
       'SAMPLE / ASSUMED RECIPE QUANTITY — FOR SYSTEM DEMONSTRATION'
     );

  SELECT count(*)::int INTO historical_versions
    FROM recipes r
   WHERE r.version=1
     AND r.effective_from IN (DATE '2026-09-24',DATE '2026-09-25')
     AND EXISTS (
       SELECT 1 FROM recipes sibling
        WHERE sibling.menu_item_variant_id=r.menu_item_variant_id
          AND sibling.id<>r.id
     );

  SELECT count(*)::int INTO usage_references
    FROM pos_sale_ingredient_usage usage
    JOIN recipes r ON r.id=usage.recipe_version_id
   WHERE r.version=1
     AND r.effective_from IN (DATE '2026-09-24',DATE '2026-09-25');

  IF affected_recipes<>36 OR affected_items<>141 THEN
    RAISE EXCEPTION 'Initial recipe availability migration expected 36 recipes and 141 items; found % recipes and % items',
      affected_recipes,affected_items;
  END IF;
  IF historical_versions<>0 THEN
    RAISE EXCEPTION 'Initial recipe availability migration found % recipes with sibling versions',historical_versions;
  END IF;
  IF usage_references<>0 THEN
    RAISE EXCEPTION 'Initial recipe availability migration found % existing ingredient-usage references',usage_references;
  END IF;

  UPDATE recipes
     SET effective_from=DATE '2026-01-01'
   WHERE version=1
     AND status='ACTIVE'
     AND effective_from IN (DATE '2026-09-24',DATE '2026-09-25')
     AND effective_to IS NULL
     AND change_reason IN (
       'SAMPLE / ASSUMED — FOR SYSTEM DEMONSTRATION',
       'SAMPLE / ASSUMED RECIPE QUANTITY — FOR SYSTEM DEMONSTRATION'
     );

  IF (SELECT count(*) FROM recipes WHERE effective_from=DATE '2026-01-01')<>36 THEN
    RAISE EXCEPTION 'Initial recipe availability migration did not update exactly 36 recipes';
  END IF;
END $$;

-- Manual rollback, if required before any sales are imported:
-- restore the five first-batch recipes to 2026-09-24 by matching their CREATE_SAMPLE_RECIPE
-- audit metadata source `firstBeverageRecipeBatch.ts`; restore the remaining 31 recipes to
-- 2026-09-25. The application has no automatic down-migration runner, so rollback must be
-- performed as a separately reviewed transaction.
