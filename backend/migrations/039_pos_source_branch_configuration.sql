ALTER TABLE pos_sources
  ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES branches(id);

-- Backfill only where existing imports prove one unambiguous branch.
WITH used_by_one_branch AS (
  SELECT pos_source_id, min(branch_id::text)::uuid branch_id
  FROM pos_imports
  WHERE pos_source_id IS NOT NULL
  GROUP BY pos_source_id
  HAVING count(DISTINCT branch_id) = 1
)
UPDATE pos_sources source
SET branch_id = usage.branch_id
FROM used_by_one_branch usage
WHERE source.id = usage.pos_source_id AND source.branch_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_pos_sources_branch_status
  ON pos_sources(branch_id, status);

ALTER TABLE pos_sources DROP CONSTRAINT IF EXISTS pos_sources_active_branch_check;
ALTER TABLE pos_sources ADD CONSTRAINT pos_sources_active_branch_check
  CHECK (status <> 'ACTIVE' OR branch_id IS NOT NULL) NOT VALID;
ALTER TABLE pos_sources VALIDATE CONSTRAINT pos_sources_active_branch_check;

CREATE TABLE IF NOT EXISTS pos_daily_declarations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES branches(id),
  business_date date NOT NULL,
  declaration varchar(30) NOT NULL CHECK (declaration = 'NO_SALES_CLOSED'),
  notes text,
  declared_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(branch_id, business_date)
);

CREATE INDEX IF NOT EXISTS idx_pos_daily_declarations_date
  ON pos_daily_declarations(business_date, branch_id);
