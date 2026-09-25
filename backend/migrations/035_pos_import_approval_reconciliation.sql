-- Approval is bound to immutable preview fingerprints before any sales rows exist.
CREATE TABLE pos_import_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  pos_source_id uuid REFERENCES pos_sources(id) ON DELETE RESTRICT,
  source_filename varchar(255) NOT NULL,
  business_date date NOT NULL,
  content_hash char(64) NOT NULL,
  resolution_fingerprint char(64) NOT NULL,
  source_sales_total numeric(16,4) NOT NULL CHECK (source_sales_total >= 0),
  source_quantity numeric(16,4) NOT NULL CHECK (source_quantity >= 0),
  status varchar(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED','CONSUMED')),
  requested_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  requested_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid REFERENCES users(id) ON DELETE RESTRICT,
  approval_notes text,
  reviewed_at timestamptz,
  consumed_at timestamptz,
  pos_import_id uuid UNIQUE REFERENCES pos_imports(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status IN ('APPROVED','REJECTED','CONSUMED')) = (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)),
  CHECK (status <> 'CONSUMED' OR (consumed_at IS NOT NULL AND pos_import_id IS NOT NULL))
);

CREATE UNIQUE INDEX pos_import_approval_open_identity_idx
  ON pos_import_approvals(branch_id,content_hash,resolution_fingerprint)
  WHERE status IN ('PENDING','APPROVED');
CREATE INDEX pos_import_approval_review_idx ON pos_import_approvals(status,requested_at DESC);

CREATE TABLE pos_import_reconciliations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pos_import_id uuid NOT NULL UNIQUE REFERENCES pos_imports(id) ON DELETE CASCADE,
  approval_id uuid NOT NULL UNIQUE REFERENCES pos_import_approvals(id) ON DELETE RESTRICT,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  pos_sales_total numeric(16,4) NOT NULL,
  imported_sales_total numeric(16,4) NOT NULL,
  pos_quantity numeric(16,4) NOT NULL,
  imported_quantity numeric(16,4) NOT NULL,
  expected_consumption_cost numeric(16,4) NOT NULL,
  generated_cogs numeric(16,4) NOT NULL,
  sales_total_matches boolean NOT NULL,
  quantity_matches boolean NOT NULL,
  recipe_consumption_matches boolean NOT NULL,
  cogs_matches boolean NOT NULL,
  branch_isolated boolean NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX pos_import_reconciliation_branch_idx ON pos_import_reconciliations(branch_id,generated_at DESC);
