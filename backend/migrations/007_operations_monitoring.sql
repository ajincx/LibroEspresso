DO $$ BEGIN CREATE TYPE purchase_order_status AS ENUM ('DRAFT', 'ORDERED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE incident_type AS ENUM ('SPOILAGE', 'WASTAGE', 'DAMAGED_ITEM', 'PREPARATION_ERROR', 'OTHER'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE incident_report_status AS ENUM ('PENDING', 'VERIFIED', 'REJECTED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE SEQUENCE IF NOT EXISTS purchase_order_number_seq START 1;
CREATE TABLE IF NOT EXISTS purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), po_no varchar(30) NOT NULL UNIQUE,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  supplier_name varchar(160) NOT NULL, order_date date NOT NULL,
  expected_delivery_date date NOT NULL, received_date date,
  status purchase_order_status NOT NULL DEFAULT 'DRAFT', notes text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT purchase_order_dates_check CHECK (expected_delivery_date >= order_date),
  CONSTRAINT purchase_order_received_state_check CHECK ((status = 'RECEIVED' AND received_date IS NOT NULL) OR status <> 'RECEIVED')
);
CREATE INDEX IF NOT EXISTS purchase_orders_scope_idx ON purchase_orders (branch_id, order_date DESC, status);

CREATE TABLE IF NOT EXISTS purchase_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id uuid NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  inventory_item_id uuid NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
  quantity_ordered numeric(16,4) NOT NULL CHECK (quantity_ordered > 0),
  quantity_received numeric(16,4) NOT NULL DEFAULT 0 CHECK (quantity_received >= 0 AND quantity_received <= quantity_ordered),
  unit_cost numeric(14,4) NOT NULL CHECK (unit_cost >= 0),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (purchase_order_id, inventory_item_id)
);
CREATE INDEX IF NOT EXISTS purchase_order_items_order_idx ON purchase_order_items (purchase_order_id);

CREATE TABLE IF NOT EXISTS attendance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT, work_date date NOT NULL,
  clock_in timestamptz, break_start timestamptz, break_end timestamptz, clock_out timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, work_date)
);
CREATE INDEX IF NOT EXISTS attendance_records_scope_idx ON attendance_records (branch_id, work_date DESC);

CREATE TABLE IF NOT EXISTS incident_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submitted_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  verified_by uuid REFERENCES users(id) ON DELETE SET NULL,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  inventory_item_id uuid NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
  shrinkage_report_id uuid REFERENCES shrinkage_reports(id) ON DELETE SET NULL,
  incident_type incident_type NOT NULL, quantity numeric(16,4) NOT NULL CHECK (quantity > 0),
  occurred_at timestamptz NOT NULL, reason text NOT NULL CHECK (char_length(btrim(reason)) >= 3),
  notes text, photo_url text, status incident_report_status NOT NULL DEFAULT 'PENDING',
  verified_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT incident_review_state_check CHECK ((status = 'PENDING' AND verified_by IS NULL AND verified_at IS NULL) OR (status IN ('VERIFIED', 'REJECTED') AND verified_by IS NOT NULL AND verified_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS incident_reports_scope_idx ON incident_reports (branch_id, status, occurred_at DESC);
