ALTER TABLE menu_items
  ADD COLUMN IF NOT EXISTS owner_review_comment text;

ALTER TABLE menu_item_branches
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS review_comment text;

-- Preserve the availability of products that were operational before branch-level
-- activation was separated from approval.
UPDATE menu_item_branches
   SET is_active = true
 WHERE availability_status = 'APPROVED';

CREATE INDEX IF NOT EXISTS menu_item_branches_branch_active_idx
  ON menu_item_branches (branch_id,is_active,availability_status,menu_item_id);
