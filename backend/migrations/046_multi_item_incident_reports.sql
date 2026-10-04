-- Multi-item incident reports. Legacy parent item/quantity/link columns remain
-- populated for backward compatibility; child rows are authoritative.
ALTER TABLE incident_reports
  ADD COLUMN IF NOT EXISTS menu_item_variant_id uuid
  REFERENCES menu_item_variants(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS incident_report_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_report_id uuid NOT NULL REFERENCES incident_reports(id) ON DELETE CASCADE,
  inventory_item_id uuid NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
  quantity numeric(16,4) NOT NULL CHECK (quantity > 0),
  unit varchar(20) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (incident_report_id, inventory_item_id)
);

CREATE INDEX IF NOT EXISTS incident_report_items_incident_idx
  ON incident_report_items (incident_report_id);
CREATE INDEX IF NOT EXISTS incident_report_items_inventory_idx
  ON incident_report_items (inventory_item_id, incident_report_id);

CREATE OR REPLACE FUNCTION enforce_incident_report_item_unit()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE canonical_unit varchar(20);
BEGIN
  SELECT unit INTO canonical_unit FROM inventory_items WHERE id=NEW.inventory_item_id;
  IF canonical_unit IS NULL THEN
    RAISE EXCEPTION 'Incident inventory item does not exist';
  END IF;
  NEW.unit := canonical_unit;
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS incident_report_items_canonical_unit ON incident_report_items;
CREATE TRIGGER incident_report_items_canonical_unit
BEFORE INSERT OR UPDATE OF inventory_item_id,unit,quantity ON incident_report_items
FOR EACH ROW EXECUTE FUNCTION enforce_incident_report_item_unit();

INSERT INTO incident_report_items
  (incident_report_id,inventory_item_id,quantity,unit,created_at,updated_at)
SELECT ir.id,ir.inventory_item_id,ir.quantity,ii.unit,ir.created_at,ir.updated_at
  FROM incident_reports ir
  JOIN inventory_items ii ON ii.id=ir.inventory_item_id
ON CONFLICT (incident_report_id,inventory_item_id) DO NOTHING;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM incident_reports ir
    LEFT JOIN incident_report_items iri ON iri.incident_report_id=ir.id
    GROUP BY ir.id HAVING count(iri.id)<>1
  ) THEN
    RAISE EXCEPTION 'Existing incident backfill did not create exactly one child item per incident';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS incident_shrinkage_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_report_id uuid NOT NULL REFERENCES incident_reports(id) ON DELETE CASCADE,
  incident_report_item_id uuid NOT NULL REFERENCES incident_report_items(id) ON DELETE CASCADE,
  shrinkage_report_id uuid NOT NULL REFERENCES shrinkage_reports(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (incident_report_item_id, shrinkage_report_id),
  UNIQUE (incident_report_id, shrinkage_report_id)
);

CREATE INDEX IF NOT EXISTS incident_shrinkage_links_report_idx
  ON incident_shrinkage_links (shrinkage_report_id);
CREATE INDEX IF NOT EXISTS incident_shrinkage_links_incident_idx
  ON incident_shrinkage_links (incident_report_id);

INSERT INTO incident_shrinkage_links
  (incident_report_id,incident_report_item_id,shrinkage_report_id,created_at)
SELECT ir.id,iri.id,ir.shrinkage_report_id,ir.updated_at
  FROM incident_reports ir
  JOIN incident_report_items iri ON iri.incident_report_id=ir.id
    AND iri.inventory_item_id=ir.inventory_item_id
 WHERE ir.shrinkage_report_id IS NOT NULL
ON CONFLICT (incident_report_item_id,shrinkage_report_id) DO NOTHING;

COMMENT ON COLUMN incident_reports.inventory_item_id IS
  'Legacy compatibility field mirroring the first incident_report_items inventory item.';
COMMENT ON COLUMN incident_reports.quantity IS
  'Legacy compatibility field mirroring the first incident_report_items quantity.';
COMMENT ON COLUMN incident_reports.shrinkage_report_id IS
  'Legacy compatibility field for the first item-specific shrinkage link.';
COMMENT ON TABLE incident_report_items IS
  'Authoritative collection of inventory items and quantities affected by one incident event.';
COMMENT ON TABLE incident_shrinkage_links IS
  'Item-specific evidence links between incident items and shrinkage investigations.';
