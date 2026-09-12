BEGIN;

-- 1. Create a dedicated, non-dropping timestamped backup table for rollback safety
CREATE TABLE IF NOT EXISTS _migration_022_variance_backup_20260907 AS
SELECT id, 'COUNT_ITEM' AS source_table, variance_quantity, variance_value, expected_quantity, actual_quantity, now() AS backed_up_at 
FROM inventory_count_items
UNION ALL
SELECT id, 'SHRINKAGE_REPORT' AS source_table, variance_quantity, variance_value, expected_quantity, actual_quantity, now() AS backed_up_at 
FROM shrinkage_reports;

-- 2. Migrate any legacy APPROVED_ADJUSTMENT movements to APPROVED_ADJUSTMENT_DECREASE to preserve historical meaning
UPDATE inventory_movements 
   SET movement_type = 'APPROVED_ADJUSTMENT_DECREASE' 
 WHERE movement_type = 'APPROVED_ADJUSTMENT';

-- 3. Recalculate historical variance records in inventory_count_items
-- Official formula: Inventory Variance = Expected Ending Inventory - Actual Physical Inventory
-- Positive = Shortage, Zero = Matched, Negative = Excess
UPDATE inventory_count_items
   SET variance_quantity = (expected_quantity - actual_quantity),
       variance_value    = CASE 
         WHEN (expected_quantity - actual_quantity) = 0 THEN 0
         ELSE -variance_value 
       END;

-- 4. Recalculate historical variance records in shrinkage_reports
UPDATE shrinkage_reports
   SET variance_quantity = (expected_quantity - actual_quantity),
       variance_value    = CASE 
         WHEN (expected_quantity - actual_quantity) = 0 THEN 0
         ELSE -variance_value 
       END;

COMMIT;
