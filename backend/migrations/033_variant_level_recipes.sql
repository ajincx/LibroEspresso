-- Scope recipe versions to a menu variant while preserving their parent product.
-- Legacy rows are mapped only when exactly one Standard variant belongs to the parent.
ALTER TABLE recipes ADD COLUMN menu_item_variant_id uuid;

UPDATE recipes r SET menu_item_variant_id=v.id
FROM menu_item_variants v
WHERE v.menu_item_id=r.menu_item_id AND lower(v.name)='standard'
  AND (SELECT count(*) FROM menu_item_variants sibling WHERE sibling.menu_item_id=r.menu_item_id)=1;

DO $$
DECLARE unresolved text;
BEGIN
  SELECT string_agg(id::text, ', ') INTO unresolved FROM recipes WHERE menu_item_variant_id IS NULL;
  IF unresolved IS NOT NULL THEN
    RAISE EXCEPTION 'Variant recipe migration requires review of recipe IDs: %', unresolved;
  END IF;
END $$;

ALTER TABLE recipes ALTER COLUMN menu_item_variant_id SET NOT NULL;
ALTER TABLE recipes ADD CONSTRAINT recipes_variant_parent_fk
  FOREIGN KEY (menu_item_id,menu_item_variant_id)
  REFERENCES menu_item_variants(menu_item_id,id) ON DELETE RESTRICT;

DROP INDEX IF EXISTS recipes_menu_version_uq;
DROP INDEX IF EXISTS recipes_one_open_version_uq;
DROP INDEX IF EXISTS recipes_effective_lookup_idx;
CREATE UNIQUE INDEX recipes_variant_version_uq ON recipes(menu_item_variant_id,version);
CREATE UNIQUE INDEX recipes_one_open_variant_version_uq
  ON recipes(menu_item_variant_id) WHERE effective_to IS NULL;
CREATE INDEX recipes_variant_effective_lookup_idx
  ON recipes(menu_item_variant_id,effective_from,effective_to,status);
