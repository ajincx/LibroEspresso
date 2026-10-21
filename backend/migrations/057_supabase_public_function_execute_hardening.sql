-- PostgreSQL grants EXECUTE on new functions to PUBLIC by default. Remove that
-- global default for backend-owned functions and remove the inherited PUBLIC
-- grant from the four existing Libro Espresso trigger functions.

ALTER DEFAULT PRIVILEGES FOR ROLE postgres
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.deactivate_pos_mappings_for_variant()
  FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.enforce_incident_report_item_unit()
  FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.enforce_opening_baseline_item_unit()
  FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.validate_active_pos_mapping()
  FROM PUBLIC;
