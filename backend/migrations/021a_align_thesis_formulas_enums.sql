-- Add the enum values required by the finalized inventory formulas before
-- the data-alignment migration uses them.
ALTER TYPE inventory_movement_type ADD VALUE IF NOT EXISTS 'APPROVED_ADJUSTMENT_INCREASE';
ALTER TYPE inventory_movement_type ADD VALUE IF NOT EXISTS 'APPROVED_ADJUSTMENT_DECREASE';

ALTER TYPE shrinkage_classification ADD VALUE IF NOT EXISTS 'DAMAGED_ITEM';
ALTER TYPE shrinkage_classification ADD VALUE IF NOT EXISTS 'PREPARATION_ERROR';

ALTER TYPE shrinkage_report_status ADD VALUE IF NOT EXISTS 'VERIFIED';
