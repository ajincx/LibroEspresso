CREATE SEQUENCE IF NOT EXISTS menu_product_code_seq;

SELECT setval(
  'menu_product_code_seq',
  COALESCE((
    SELECT max(substring(code FROM '^PRD-([0-9]+)$')::bigint)
      FROM menu_items
     WHERE code ~ '^PRD-[0-9]+$'
  ), 0) + 1,
  false
);
