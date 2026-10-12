-- Persist Owner-configured spreadsheet-header mappings without changing existing built-in POS sources.
ALTER TABLE pos_sources
  DROP CONSTRAINT IF EXISTS pos_sources_supported_format_check;

ALTER TABLE pos_sources
  ADD CONSTRAINT pos_sources_supported_format_check
  CHECK (supported_format IN (
    'CANONICAL_CSV',
    'SUMMARY_ITEMS_SOLD_LEGACY_XLS',
    'TRANSACTION_SUMMARY_XLSX',
    'CUSTOM_TABULAR_XLSX'
  ));

ALTER TABLE pos_sources
  ADD COLUMN field_mapping jsonb,
  ADD COLUMN field_mapping_updated_by uuid REFERENCES users(id) ON DELETE RESTRICT,
  ADD COLUMN field_mapping_updated_at timestamptz;

ALTER TABLE pos_sources
  ADD CONSTRAINT pos_sources_custom_mapping_shape_check
  CHECK (
    field_mapping IS NULL OR (
      jsonb_typeof(field_mapping) = 'object'
      AND field_mapping ?& ARRAY['productName','quantitySold','transactionId','businessDate','status','unitPrice']
    )
  );

ALTER TABLE pos_sources
  ADD CONSTRAINT pos_sources_active_custom_mapping_check
  CHECK (supported_format <> 'CUSTOM_TABULAR_XLSX' OR status <> 'ACTIVE' OR field_mapping IS NOT NULL);
