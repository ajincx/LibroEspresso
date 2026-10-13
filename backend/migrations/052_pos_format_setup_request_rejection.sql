-- Allow an Owner to reject a pending POS format setup request without deleting its audit history.
ALTER TABLE pos_format_setup_requests
  ADD COLUMN rejection_reason varchar(500),
  ADD COLUMN rejected_by uuid REFERENCES users(id) ON DELETE RESTRICT,
  ADD COLUMN rejected_at timestamptz;

ALTER TABLE pos_format_setup_requests
  DROP CONSTRAINT pos_format_setup_requests_status_check,
  ADD CONSTRAINT pos_format_setup_requests_status_check
    CHECK (status IN ('PENDING','CONFIGURED','BLOCKED','COMPLETED','REJECTED')),
  ADD CONSTRAINT pos_format_setup_requests_rejection_check
    CHECK (
      status <> 'REJECTED'
      OR (rejection_reason IS NOT NULL AND rejected_by IS NOT NULL AND rejected_at IS NOT NULL)
    );
