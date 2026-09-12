ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS product_scope varchar(20) NOT NULL DEFAULT 'GLOBAL';
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS origin_branch_id uuid REFERENCES branches(id) ON DELETE RESTRICT;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS approval_status varchar(30) NOT NULL DEFAULT 'APPROVED';

DO $$ BEGIN
  ALTER TABLE menu_items ADD CONSTRAINT menu_items_product_scope_check
    CHECK (product_scope IN ('GLOBAL','BRANCH'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE menu_items ADD CONSTRAINT menu_items_approval_status_check
    CHECK (approval_status IN ('PENDING_OWNER','APPROVED','REJECTED'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE menu_items ADD CONSTRAINT menu_items_scope_branch_check
    CHECK ((product_scope='GLOBAL' AND origin_branch_id IS NULL) OR (product_scope='BRANCH' AND origin_branch_id IS NOT NULL));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS menu_item_branches (
  menu_item_id uuid NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  availability_status varchar(30) NOT NULL,
  reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (menu_item_id,branch_id),
  CONSTRAINT menu_item_branches_status_check CHECK (availability_status IN ('PENDING_OWNER','PENDING_MANAGER','APPROVED','REJECTED'))
);

CREATE INDEX IF NOT EXISTS menu_item_branches_branch_status_idx
  ON menu_item_branches (branch_id,availability_status,menu_item_id);

INSERT INTO menu_item_branches (menu_item_id,branch_id,availability_status)
SELECT m.id,b.id,'APPROVED' FROM menu_items m CROSS JOIN branches b
ON CONFLICT (menu_item_id,branch_id) DO NOTHING;
