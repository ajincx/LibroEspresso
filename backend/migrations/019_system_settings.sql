CREATE TABLE IF NOT EXISTS user_preferences (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  theme varchar(10) NOT NULL DEFAULT 'light' CHECK (theme IN ('light','dark')),
  date_format varchar(20) NOT NULL DEFAULT 'MMM d, yyyy' CHECK (date_format IN ('MMM d, yyyy','MM/dd/yyyy','dd/MM/yyyy')),
  timezone varchar(60) NOT NULL DEFAULT 'Asia/Manila', currency varchar(3) NOT NULL DEFAULT 'PHP', compact_sidebar boolean NOT NULL DEFAULT false,
  notification_preferences jsonb NOT NULL DEFAULT '{"lowStock":true,"criticalStock":true,"highCogs":false,"spoilage":true,"variance":true,"purchaseOrders":true,"ai":false,"messages":true}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS business_settings (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton), business_name varchar(160) NOT NULL DEFAULT 'Libro Espresso Cafe',
  legal_name varchar(180) NOT NULL DEFAULT 'Libro Espresso Cafe', contact_email varchar(255), contact_phone varchar(30),
  head_office_address varchar(255), tax_identifier varchar(80), reporting_cycle varchar(30) NOT NULL DEFAULT 'MONTHLY',
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL, updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO business_settings (singleton) VALUES (true) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS calculation_settings (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton), variance_tolerance_quantity numeric(14,4) NOT NULL DEFAULT 0.0001 CHECK (variance_tolerance_quantity >= 0),
  high_cogs_percent numeric(6,2) NOT NULL DEFAULT 45 CHECK (high_cogs_percent BETWEEN 0 AND 100),
  shrinkage_alert_percent numeric(6,2) NOT NULL DEFAULT 2 CHECK (shrinkage_alert_percent BETWEEN 0 AND 100),
  default_reorder_days integer NOT NULL DEFAULT 7 CHECK (default_reorder_days BETWEEN 1 AND 365),
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL, updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO calculation_settings (singleton) VALUES (true) ON CONFLICT DO NOTHING;
