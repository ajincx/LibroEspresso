DO $$ BEGIN CREATE TYPE inventory_movement_type AS ENUM ('RECEIPT', 'APPROVED_ADJUSTMENT'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE shrinkage_classification AS ENUM ('SPOILAGE', 'WASTAGE', 'PILFERAGE', 'COUNT_ERROR'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE shrinkage_report_status AS ENUM ('PENDING_REVIEW', 'REVIEWED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE SEQUENCE IF NOT EXISTS inventory_count_number_seq START 1;
CREATE SEQUENCE IF NOT EXISTS shrinkage_report_number_seq START 1;

CREATE TABLE IF NOT EXISTS branch_inventory_balances (
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  inventory_item_id uuid NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
  actual_quantity numeric(16,4) NOT NULL DEFAULT 0 CHECK (actual_quantity >= 0),
  as_of timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (branch_id, inventory_item_id)
);

CREATE TABLE IF NOT EXISTS inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  inventory_item_id uuid NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
  movement_type inventory_movement_type NOT NULL,
  quantity numeric(16,4) NOT NULL CHECK (quantity > 0),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  reference_no varchar(80),
  notes text,
  approved_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS inventory_movements_scope_idx ON inventory_movements (branch_id, inventory_item_id, occurred_at);

CREATE TABLE IF NOT EXISTS pos_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  business_date date NOT NULL,
  source_filename varchar(255) NOT NULL,
  imported_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  imported_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (branch_id, business_date, source_filename)
);

CREATE TABLE IF NOT EXISTS pos_sale_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pos_import_id uuid NOT NULL REFERENCES pos_imports(id) ON DELETE CASCADE,
  menu_item_id uuid NOT NULL REFERENCES menu_items(id) ON DELETE RESTRICT,
  quantity_sold numeric(14,4) NOT NULL CHECK (quantity_sold > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pos_import_id, menu_item_id)
);
CREATE INDEX IF NOT EXISTS pos_sale_items_menu_idx ON pos_sale_items (menu_item_id);

CREATE TABLE IF NOT EXISTS inventory_counts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  count_no varchar(30) NOT NULL UNIQUE,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  count_date date NOT NULL,
  submitted_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (branch_id, count_date)
);
CREATE INDEX IF NOT EXISTS inventory_counts_branch_date_idx ON inventory_counts (branch_id, count_date DESC);

CREATE TABLE IF NOT EXISTS inventory_count_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_count_id uuid NOT NULL REFERENCES inventory_counts(id) ON DELETE CASCADE,
  inventory_item_id uuid NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
  previous_actual_quantity numeric(16,4) NOT NULL,
  stock_received numeric(16,4) NOT NULL DEFAULT 0,
  expected_consumption numeric(16,4) NOT NULL DEFAULT 0,
  approved_adjustments numeric(16,4) NOT NULL DEFAULT 0,
  expected_quantity numeric(16,4) NOT NULL,
  actual_quantity numeric(16,4) NOT NULL CHECK (actual_quantity >= 0),
  variance_quantity numeric(16,4) NOT NULL,
  variance_value numeric(16,4) NOT NULL,
  unit varchar(30) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (inventory_count_id, inventory_item_id)
);
CREATE INDEX IF NOT EXISTS inventory_count_items_item_idx ON inventory_count_items (inventory_item_id);

CREATE TABLE IF NOT EXISTS shrinkage_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_no varchar(30) NOT NULL UNIQUE,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  inventory_item_id uuid NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
  inventory_count_item_id uuid NOT NULL UNIQUE REFERENCES inventory_count_items(id) ON DELETE RESTRICT,
  menu_item_id uuid REFERENCES menu_items(id) ON DELETE SET NULL,
  expected_quantity numeric(16,4) NOT NULL,
  actual_quantity numeric(16,4) NOT NULL,
  variance_quantity numeric(16,4) NOT NULL,
  variance_value numeric(16,4) NOT NULL,
  unit varchar(30) NOT NULL,
  classification shrinkage_classification NOT NULL,
  explanation text NOT NULL CHECK (length(trim(explanation)) >= 10),
  supporting_notes text,
  status shrinkage_report_status NOT NULL DEFAULT 'PENDING_REVIEW',
  submitted_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT shrinkage_review_state_check CHECK ((status = 'PENDING_REVIEW' AND reviewed_by IS NULL AND reviewed_at IS NULL) OR (status = 'REVIEWED' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS shrinkage_reports_scope_idx ON shrinkage_reports (branch_id, status, submitted_at DESC);

CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES branches(id) ON DELETE SET NULL,
  type varchar(60) NOT NULL,
  title varchar(160) NOT NULL,
  message text NOT NULL,
  entity_type varchar(60),
  entity_id uuid,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_recipient_idx ON notifications (recipient_user_id, created_at DESC);
