-- A branch may retain historical/inactive POS sources, but only one source may
-- be active at a time. Abort without modifying data if legacy conflicts exist.
DO $$
BEGIN
  IF EXISTS (
    SELECT branch_id
      FROM pos_sources
     WHERE status = 'ACTIVE'
     GROUP BY branch_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot enforce one active POS source per branch: conflicting active sources exist.';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_pos_sources_one_active_per_branch
  ON pos_sources(branch_id)
  WHERE status = 'ACTIVE';
