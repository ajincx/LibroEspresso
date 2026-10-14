-- Additive provenance and idempotency support for future Manager adjustments.
-- Existing movements remain unchanged and retain NULL values in these fields.
ALTER TABLE inventory_movements
  ADD COLUMN IF NOT EXISTS adjustment_request_id uuid,
  ADD COLUMN IF NOT EXISTS entered_quantity numeric(16,4),
  ADD COLUMN IF NOT EXISTS entered_unit varchar(10),
  ADD COLUMN IF NOT EXISTS adjustment_reason text;

CREATE UNIQUE INDEX IF NOT EXISTS inventory_movements_adjustment_request_uidx
  ON inventory_movements (branch_id, adjustment_request_id)
  WHERE adjustment_request_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'inventory_movements_adjustment_provenance_check'
       AND conrelid = 'inventory_movements'::regclass
  ) THEN
    ALTER TABLE inventory_movements
      ADD CONSTRAINT inventory_movements_adjustment_provenance_check CHECK (
        adjustment_request_id IS NULL
        OR (
          movement_type IN ('APPROVED_ADJUSTMENT_INCREASE', 'APPROVED_ADJUSTMENT_DECREASE')
          AND entered_quantity IS NOT NULL
          AND entered_quantity > 0
          AND entered_unit IS NOT NULL
          AND length(trim(adjustment_reason)) >= 10
        )
      ) NOT VALID;
  END IF;
END $$;

COMMENT ON COLUMN inventory_movements.adjustment_request_id IS
  'Client-generated UUID for one Manager stock adjustment; NULL for legacy movements and PO receipts.';
COMMENT ON COLUMN inventory_movements.entered_quantity IS
  'Original quantity entered for a controlled adjustment before canonical normalization.';
COMMENT ON COLUMN inventory_movements.entered_unit IS
  'Original unit entered for a controlled adjustment.';
COMMENT ON COLUMN inventory_movements.adjustment_reason IS
  'Mandatory operational reason for a controlled adjustment.';
