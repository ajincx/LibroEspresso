-- Production already received the exact 057 privilege correction through a
-- controlled transaction. This script records 057 without rerunning it, but
-- only after proving that the expected hardened state is already present.

DO $$
DECLARE
  target_functions regprocedure[] := ARRAY[
    'public.deactivate_pos_mappings_for_variant()'::regprocedure,
    'public.enforce_incident_report_item_unit()'::regprocedure,
    'public.enforce_opening_baseline_item_unit()'::regprocedure,
    'public.validate_active_pos_mapping()'::regprocedure
  ];
  target_role text;
BEGIN
  IF (
    SELECT count(*)
      FROM public.schema_migrations
     WHERE filename = '056_supabase_data_api_hardening.sql'
  ) <> 1 THEN
    RAISE EXCEPTION 'Migration 056 must be recorded exactly once';
  END IF;

  IF (
    SELECT count(*)
      FROM pg_proc
     WHERE oid = ANY(target_functions)
       AND proowner = 'postgres'::regrole
       AND prorettype = 'trigger'::regtype
       AND NOT prosecdef
  ) <> 4 THEN
    RAISE EXCEPTION 'Target function ownership or definition metadata differs';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM pg_proc p
      CROSS JOIN LATERAL aclexplode(
        coalesce(p.proacl, acldefault('f', p.proowner))
      ) privilege
     WHERE p.oid = ANY(target_functions)
       AND privilege.grantee = 0
       AND privilege.privilege_type = 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'PUBLIC still has EXECUTE on a target function';
  END IF;

  FOREACH target_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role']
  LOOP
    IF to_regrole(target_role) IS NULL THEN
      RAISE EXCEPTION 'Required Supabase role % is unavailable', target_role;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM unnest(target_functions) AS target_function(oid)
       WHERE has_function_privilege(
         target_role,
         target_function.oid,
         'EXECUTE'
       )
    ) THEN
      RAISE EXCEPTION '% retains EXECUTE on a target function', target_role;
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1
      FROM unnest(target_functions) AS target_function(oid)
     WHERE NOT has_function_privilege(
       'postgres',
       target_function.oid,
       'EXECUTE'
     )
  ) THEN
    RAISE EXCEPTION 'postgres no longer has EXECUTE on a target function';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_default_acl
     WHERE defaclrole = 'postgres'::regrole
       AND defaclnamespace = 0
       AND defaclobjtype = 'f'
       AND aclcontains(
         defaclacl,
         makeaclitem(
           'postgres'::regrole,
           'postgres'::regrole,
           'EXECUTE',
           false
         )
       )
  ) OR EXISTS (
    SELECT 1
      FROM pg_default_acl
      CROSS JOIN LATERAL aclexplode(defaclacl) privilege
     WHERE defaclrole = 'postgres'::regrole
       AND defaclnamespace = 0
       AND defaclobjtype = 'f'
       AND privilege.grantee = 0
       AND privilege.privilege_type = 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'postgres global function defaults are not owner-only';
  END IF;

  IF (
    SELECT count(*)
      FROM pg_trigger trigger
     WHERE NOT trigger.tgisinternal
       AND trigger.tgfoid = ANY(target_functions)
       AND trigger.tgenabled = 'O'
  ) <> 4 THEN
    RAISE EXCEPTION 'Expected target triggers are not all enabled';
  END IF;

  INSERT INTO public.schema_migrations (filename)
  VALUES ('057_supabase_public_function_execute_hardening.sql')
  ON CONFLICT (filename) DO NOTHING;
END
$$;
