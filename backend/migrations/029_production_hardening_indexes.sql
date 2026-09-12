-- Sprint 9: support the existing latest-activity lookups without sorting all audit rows.
-- These indexes add a small write/storage cost whenever an audit row is inserted.
CREATE INDEX IF NOT EXISTS audit_logs_user_created_idx
  ON audit_logs (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS audit_logs_branch_created_idx
  ON audit_logs (branch_id, created_at DESC);
