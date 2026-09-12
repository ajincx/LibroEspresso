-- Migration 022: Align calculation logic with finalized thesis formulas
-- 1. Ensure enum values exist (run outside transaction block for PostgreSQL safety)
ALTER TYPE inventory_movement_type ADD VALUE IF NOT EXISTS 'APPROVED_ADJUSTMENT_INCREASE';
ALTER TYPE inventory_movement_type ADD VALUE IF NOT EXISTS 'APPROVED_ADJUSTMENT_DECREASE';

ALTER TYPE shrinkage_classification ADD VALUE IF NOT EXISTS 'DAMAGED_ITEM';
ALTER TYPE shrinkage_classification ADD VALUE IF NOT EXISTS 'PREPARATION_ERROR';

ALTER TYPE shrinkage_report_status ADD VALUE IF NOT EXISTS 'VERIFIED';
