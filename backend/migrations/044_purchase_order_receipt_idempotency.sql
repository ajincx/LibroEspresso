-- A client-generated UUID identifies one logical PO receipt across safe retries.
ALTER TABLE inventory_movements
  ADD COLUMN IF NOT EXISTS receipt_request_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS inventory_movements_po_receipt_request_item_uidx
  ON inventory_movements (branch_id, reference_no, receipt_request_id, inventory_item_id)
  WHERE movement_type = 'RECEIPT' AND receipt_request_id IS NOT NULL;

COMMENT ON COLUMN inventory_movements.receipt_request_id IS
  'Client-generated idempotency key for one purchase-order receiving request; NULL for legacy/non-PO movements.';
