-- Emergency rollback for 057_supabase_public_function_execute_hardening.sql.
-- This restores the exact pre-057 PUBLIC EXECUTE behavior for existing and
-- future functions created by postgres.

GRANT EXECUTE ON FUNCTION public.deactivate_pos_mappings_for_variant()
  TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.enforce_incident_report_item_unit()
  TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.enforce_opening_baseline_item_unit()
  TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.validate_active_pos_mapping()
  TO PUBLIC;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres
  GRANT EXECUTE ON FUNCTIONS TO PUBLIC;

DELETE FROM public.schema_migrations
WHERE filename = '057_supabase_public_function_execute_hardening.sql';
