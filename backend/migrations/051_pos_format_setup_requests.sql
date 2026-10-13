-- Retain an unconfigured Manager workbook until an Owner maps its columns.
-- Official POS sales tables remain untouched until the normal import pipeline succeeds.
CREATE TABLE pos_format_setup_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  pos_source_id uuid NOT NULL REFERENCES pos_sources(id) ON DELETE RESTRICT,
  source_filename varchar(255) NOT NULL,
  workbook_content bytea NOT NULL,
  content_hash char(64) NOT NULL,
  worksheet_name varchar(255) NOT NULL,
  header_row integer NOT NULL CHECK (header_row > 0),
  detected_headers jsonb NOT NULL CHECK (
    jsonb_typeof(detected_headers) = 'array'
    AND jsonb_array_length(detected_headers) >= 2
  ),
  status varchar(20) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','CONFIGURED','BLOCKED','COMPLETED')),
  validation_issues jsonb,
  requested_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  requested_at timestamptz NOT NULL DEFAULT now(),
  configured_by uuid REFERENCES users(id) ON DELETE RESTRICT,
  configured_at timestamptz,
  completed_at timestamptz,
  pos_import_id uuid REFERENCES pos_imports(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_pos_format_setup_requests_open_file
  ON pos_format_setup_requests(branch_id, pos_source_id, content_hash)
  WHERE status IN ('PENDING','CONFIGURED','BLOCKED');

CREATE INDEX idx_pos_format_setup_requests_status_requested
  ON pos_format_setup_requests(status, requested_at DESC);

