-- Targeted historical anomaly reconciliation for IC-2026-00001.
--
-- This is intentionally not a migration. It may be run only after a separate,
-- explicit production approval. The transaction revalidates the immutable
-- count evidence, serializes with normal branch inventory operations, and is
-- idempotent for an already-created matching DETECTED case.

BEGIN;

DO $reconciliation$
DECLARE
  target_count_item_id constant uuid := '84daf737-0660-4f67-95e7-574fdcac093a';
  target_count_id constant uuid := '4eb49c9b-31d5-4e2f-a9f4-516434306e95';
  evidence record;
  existing_case record;
  created_case_id uuid;
  created_report_no text;
BEGIN
  -- Resolve the branch without locking application rows, then acquire the same
  -- transaction-scoped branch lock used by inventory-count submission.
  SELECT ic.branch_id
    INTO evidence
    FROM public.inventory_count_items ici
    JOIN public.inventory_counts ic ON ic.id = ici.inventory_count_id
   WHERE ici.id = target_count_item_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target inventory count item does not exist';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('libro:inventory:' || evidence.branch_id::text, 0)
  );

  -- Lock and re-read the authoritative evidence after acquiring the branch
  -- lock. Any correction or identity drift makes the reconciliation stop.
  SELECT
    ic.id AS count_id,
    ic.count_no,
    ic.branch_id,
    b.name AS branch_name,
    ic.count_date,
    ic.count_type,
    ic.is_test_data AS count_is_test,
    ic.submitted_by,
    ici.id AS count_item_id,
    ici.inventory_item_id,
    ii.name AS ingredient_name,
    ici.expected_quantity,
    ici.actual_quantity,
    ici.variance_quantity,
    ici.variance_value,
    ici.unit,
    ici.voided_at,
    correction.revision AS latest_correction_revision,
    settings.variance_tolerance_quantity,
    settings.variance_tolerance_percent,
    greatest(
      settings.variance_tolerance_quantity,
      ici.expected_quantity * settings.variance_tolerance_percent / 100
    ) AS materiality_threshold
  INTO STRICT evidence
  FROM public.inventory_count_items ici
  JOIN public.inventory_counts ic ON ic.id = ici.inventory_count_id
  JOIN public.inventory_items ii ON ii.id = ici.inventory_item_id
  JOIN public.branches b ON b.id = ic.branch_id
  CROSS JOIN public.calculation_settings settings
  LEFT JOIN LATERAL (
    SELECT revision
      FROM public.inventory_count_corrections
     WHERE inventory_count_item_id = ici.id
     ORDER BY revision DESC
     LIMIT 1
  ) correction ON true
  WHERE ici.id = target_count_item_id
    AND settings.singleton = true
  FOR UPDATE OF ici, ic;

  IF evidence.count_id <> target_count_id
     OR evidence.count_no <> 'IC-2026-00001'
     OR evidence.branch_name <> 'Lipa'
     OR evidence.count_date <> DATE '2026-08-26'
     OR evidence.count_type <> 'FULL'
     OR evidence.count_is_test
     OR evidence.ingredient_name <> 'Espresso Blend Beans'
     OR evidence.expected_quantity <> 388.0000
     OR evidence.actual_quantity <> 126.0000
     OR evidence.variance_quantity <> -262.0000
     OR evidence.unit <> 'g'
     OR evidence.voided_at IS NOT NULL
     OR evidence.latest_correction_revision IS NOT NULL THEN
    RAISE EXCEPTION 'Target evidence no longer matches the approved reconciliation';
  END IF;

  IF evidence.variance_quantity >= 0
     OR abs(evidence.variance_quantity) <= evidence.materiality_threshold THEN
    RAISE EXCEPTION 'Target evidence no longer qualifies for investigation';
  END IF;

  -- The unique constraint on inventory_count_item_id is the final duplicate
  -- guard. Inspect every existing case, including archived and test cases.
  SELECT sr.*
    INTO existing_case
    FROM public.shrinkage_reports sr
   WHERE sr.inventory_count_item_id = target_count_item_id
   FOR UPDATE;

  IF FOUND THEN
    IF NOT existing_case.is_test_data
       AND existing_case.archived_at IS NULL
       AND existing_case.status = 'DETECTED'
       AND existing_case.classification IS NULL
       AND existing_case.explanation IS NULL
       AND existing_case.branch_id = evidence.branch_id
       AND existing_case.inventory_item_id = evidence.inventory_item_id
       AND existing_case.expected_quantity = evidence.expected_quantity
       AND existing_case.actual_quantity = evidence.actual_quantity
       AND existing_case.variance_quantity = evidence.variance_quantity
       AND existing_case.variance_value = evidence.variance_value
       AND existing_case.unit = evidence.unit THEN
      -- A prior or concurrent successful reconciliation already produced the
      -- exact authoritative case. Repeated execution is a no-op.
      RETURN;
    END IF;

    RAISE EXCEPTION 'A linked case already exists but does not match the approved DETECTED reconciliation';
  END IF;

  SELECT 'SR-' || to_char(now(), 'YYYY') || '-' ||
         lpad(nextval('public.shrinkage_report_number_seq')::text, 5, '0')
    INTO created_report_no;

  INSERT INTO public.shrinkage_reports (
    report_no,
    branch_id,
    inventory_item_id,
    inventory_count_item_id,
    expected_quantity,
    actual_quantity,
    variance_quantity,
    variance_value,
    unit,
    status,
    classification,
    explanation,
    submitted_by,
    detected_at,
    is_test_data
  ) VALUES (
    created_report_no,
    evidence.branch_id,
    evidence.inventory_item_id,
    evidence.count_item_id,
    evidence.expected_quantity,
    evidence.actual_quantity,
    evidence.variance_quantity,
    evidence.variance_value,
    evidence.unit,
    'DETECTED',
    NULL,
    NULL,
    evidence.submitted_by,
    now(),
    false
  )
  RETURNING id INTO created_case_id;

  -- Record the repair truthfully as a database reconciliation. No historical
  -- user is represented as having performed this action.
  INSERT INTO public.audit_logs (
    user_id,
    branch_id,
    action,
    entity_type,
    entity_id,
    description,
    metadata
  ) VALUES (
    NULL,
    evidence.branch_id,
    'RECONCILE_HISTORICAL_ANOMALY',
    'SHRINKAGE_REPORT',
    created_case_id::text,
    'Created missing DETECTED case from unchanged authoritative inventory count evidence',
    jsonb_build_object(
      'inventoryCountId', evidence.count_id,
      'inventoryCountItemId', evidence.count_item_id,
      'countNo', evidence.count_no,
      'countDate', evidence.count_date,
      'reason', 'Approved targeted historical anomaly reconciliation'
    )
  );
END
$reconciliation$;

COMMIT;
