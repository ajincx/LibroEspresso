-- Emergency rollback for 056_supabase_data_api_hardening.sql.
-- This intentionally restores the legacy Supabase privileges captured before
-- the security rehearsal. Run only if the application fails after migration
-- 056 and the failure is confirmed to be permission/RLS related.

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
        'GRANT ALL PRIVILEGES ON TABLE %s TO %I',
        application_tables,
        target_role
      );
      EXECUTE format(
        'GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO %I',
        target_role
      );
      EXECUTE format(
        'GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO %I',
        target_role
      );
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public '
        'GRANT ALL PRIVILEGES ON TABLES TO %I',
        target_role
      );
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public '
        'GRANT ALL PRIVILEGES ON SEQUENCES TO %I',
        target_role
      );
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public '
        'GRANT EXECUTE ON FUNCTIONS TO %I',
        target_role
      );
    END IF;
  END LOOP;
END
$$;

ALTER TABLE public.pos_sources DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_format_setup_requests DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_counts DISABLE ROW LEVEL SECURITY;
ALTER TABLE public._migration_022_variance_backup_20260907 DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_count_corrections DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_daily_declarations DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.schema_migrations DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.incident_report_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_opening_baseline_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_product_variant_mappings DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_item_variants DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.branches DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.auth_sessions DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.branch_inventory_balances DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.branch_inventory_settings DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_settings DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.calculation_settings DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.direct_messages DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.incident_reports DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.shrinkage_reports DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.incident_shrinkage_links DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_count_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_item_branches DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_categories DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_import_approvals DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_imports DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_import_reconciliations DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_sale_ingredient_usage DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_sale_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipes DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_test_fixture_authorizations DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_order_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_opening_baselines DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_orders DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipe_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_preferences DISABLE ROW LEVEL SECURITY;

-- Let the controlled migration runner reapply 056 after the cause of the
-- rollback has been corrected.
DELETE FROM public.schema_migrations
WHERE filename = '056_supabase_data_api_hardening.sql';
