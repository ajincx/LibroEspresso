-- Libro Espresso uses a server-side PostgreSQL connection and does not expose
-- application tables through Supabase's Data API. Remove the legacy grants
-- that made public-schema objects reachable by Data API roles.
--
-- Role checks keep this migration compatible with ordinary local PostgreSQL
-- installations where Supabase's API roles do not exist.

DO $$
DECLARE
  target_role text;
  application_tables text :=
    'public.pos_sources, '
    'public.pos_format_setup_requests, '
    'public.inventory_movements, '
    'public.inventory_counts, '
    'public._migration_022_variance_backup_20260907, '
    'public.inventory_count_corrections, '
    'public.pos_daily_declarations, '
    'public.schema_migrations, '
    'public.incident_report_items, '
    'public.inventory_opening_baseline_items, '
    'public.pos_product_variant_mappings, '
    'public.menu_item_variants, '
    'public.branches, '
    'public.audit_logs, '
    'public.users, '
    'public.auth_sessions, '
    'public.branch_inventory_balances, '
    'public.inventory_items, '
    'public.branch_inventory_settings, '
    'public.business_settings, '
    'public.calculation_settings, '
    'public.direct_messages, '
    'public.incident_reports, '
    'public.menu_items, '
    'public.shrinkage_reports, '
    'public.incident_shrinkage_links, '
    'public.inventory_count_items, '
    'public.menu_item_branches, '
    'public.menu_categories, '
    'public.notifications, '
    'public.pos_import_approvals, '
    'public.pos_imports, '
    'public.pos_import_reconciliations, '
    'public.pos_sale_ingredient_usage, '
    'public.pos_sale_items, '
    'public.recipes, '
    'public.pos_test_fixture_authorizations, '
    'public.purchase_order_items, '
    'public.inventory_opening_baselines, '
    'public.purchase_orders, '
    'public.recipe_items, '
    'public.user_preferences';
BEGIN
  FOREACH target_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role']
  LOOP
    IF to_regrole(target_role) IS NOT NULL THEN
      EXECUTE format(
        'REVOKE ALL PRIVILEGES ON TABLE %s FROM %I',
        application_tables,
        target_role
      );
      EXECUTE format(
        'REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM %I',
        target_role
      );
      EXECUTE format(
        'REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM %I',
        target_role
      );

      -- Prevent migrations run by the backend database owner from exposing
      -- future public-schema objects through legacy default privileges.
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public '
        'REVOKE ALL PRIVILEGES ON TABLES FROM %I',
        target_role
      );
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public '
        'REVOKE ALL PRIVILEGES ON SEQUENCES FROM %I',
        target_role
      );
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public '
        'REVOKE EXECUTE ON FUNCTIONS FROM %I',
        target_role
      );
    END IF;
  END LOOP;
END
$$;

ALTER TABLE public.pos_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_format_setup_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_counts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._migration_022_variance_backup_20260907 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_count_corrections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_daily_declarations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schema_migrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incident_report_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_opening_baseline_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_product_variant_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_item_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auth_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branch_inventory_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branch_inventory_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calculation_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.direct_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incident_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shrinkage_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incident_shrinkage_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_count_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_item_branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_import_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_import_reconciliations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_sale_ingredient_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_test_fixture_authorizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_opening_baselines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipe_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
