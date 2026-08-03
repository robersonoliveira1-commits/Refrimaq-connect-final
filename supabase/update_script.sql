-- 1. Updates to products table
ALTER TABLE products 
  ADD COLUMN IF NOT EXISTS internal_code text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS manufacturer  text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS unit          text NOT NULL DEFAULT 'un',
  ADD COLUMN IF NOT EXISTS cost_price    numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS location      text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS part_notes    text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS unit_price    numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stock_quantity integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stock_min     integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS active        boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS updated_at    timestamptz DEFAULT now();

-- 2. Create services table
CREATE TABLE IF NOT EXISTS services (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name             text NOT NULL,
  category         text NOT NULL DEFAULT 'Manutenção',
  estimated_time   text NOT NULL DEFAULT '',
  technician_name  text NOT NULL DEFAULT '',
  price            numeric(12,2) NOT NULL DEFAULT 0,
  notes            text NOT NULL DEFAULT '',
  active           boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE services ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "services_select" ON services;
DROP POLICY IF EXISTS "services_insert" ON services;
DROP POLICY IF EXISTS "services_update" ON services;
DROP POLICY IF EXISTS "services_delete" ON services;
CREATE POLICY "services_select" ON services FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "services_insert" ON services FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "services_update" ON services FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "services_delete" ON services FOR DELETE TO anon, authenticated USING (true);

-- 3. Stock movements and audits
CREATE TABLE IF NOT EXISTS stock_movements (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id          uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  product_name        text NOT NULL DEFAULT '',
  movement_type       text NOT NULL, -- 'entrada' | 'saida' | 'ajuste' | 'os'
  quantity            integer NOT NULL,
  quantity_before     integer NOT NULL DEFAULT 0,
  quantity_after      integer NOT NULL DEFAULT 0,
  reason              text NOT NULL DEFAULT '',
  service_order_id    uuid,
  responsible         text NOT NULL DEFAULT '',
  created_at          timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "movements_select" ON stock_movements;
DROP POLICY IF EXISTS "movements_insert" ON stock_movements;
DROP POLICY IF EXISTS "movements_update" ON stock_movements;
DROP POLICY IF EXISTS "movements_delete" ON stock_movements;
CREATE POLICY "movements_select" ON stock_movements FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "movements_insert" ON stock_movements FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "movements_update" ON stock_movements FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "movements_delete" ON stock_movements FOR DELETE TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS stock_audits (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  responsible text NOT NULL DEFAULT '',
  notes       text DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE stock_audits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "audits_select" ON stock_audits;
DROP POLICY IF EXISTS "audits_insert" ON stock_audits;
DROP POLICY IF EXISTS "audits_update" ON stock_audits;
DROP POLICY IF EXISTS "audits_delete" ON stock_audits;
CREATE POLICY "audits_select" ON stock_audits FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "audits_insert" ON stock_audits FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "audits_update" ON stock_audits FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "audits_delete" ON stock_audits FOR DELETE TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS stock_audit_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id        uuid NOT NULL REFERENCES stock_audits(id) ON DELETE CASCADE,
  product_id      uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  product_name    text NOT NULL DEFAULT '',
  system_quantity integer NOT NULL DEFAULT 0,
  counted_quantity integer,
  divergence      integer GENERATED ALWAYS AS (
    CASE WHEN counted_quantity IS NOT NULL THEN counted_quantity - system_quantity ELSE NULL END
  ) STORED
);
ALTER TABLE stock_audit_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "audit_items_select" ON stock_audit_items;
DROP POLICY IF EXISTS "audit_items_insert" ON stock_audit_items;
DROP POLICY IF EXISTS "audit_items_update" ON stock_audit_items;
DROP POLICY IF EXISTS "audit_items_delete" ON stock_audit_items;
CREATE POLICY "audit_items_select" ON stock_audit_items FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "audit_items_insert" ON stock_audit_items FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "audit_items_update" ON stock_audit_items FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "audit_items_delete" ON stock_audit_items FOR DELETE TO anon, authenticated USING (true);

-- 4. Fix User Profiles (Team) permissions
DROP POLICY IF EXISTS "select_profiles" ON user_profiles;
DROP POLICY IF EXISTS "admin_select_all_profiles" ON user_profiles;
DROP POLICY IF EXISTS "select_own_profile" ON user_profiles;
DROP POLICY IF EXISTS "select_profiles_all" ON user_profiles;

CREATE POLICY "select_profiles_all" ON user_profiles FOR SELECT
  TO authenticated USING (true);

-- 5. Additional tables (boletos, company config, OS history, attachments)
CREATE TABLE IF NOT EXISTS company_config (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name text NOT NULL DEFAULT '',
  razao_social text NOT NULL DEFAULT '',
  cnpj         text NOT NULL DEFAULT '',
  address      text NOT NULL DEFAULT '',
  phone        text NOT NULL DEFAULT '',
  email        text NOT NULL DEFAULT '',
  responsible  text NOT NULL DEFAULT '',
  logo_url     text,
  updated_at   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE company_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "config_select" ON company_config;
DROP POLICY IF EXISTS "config_insert" ON company_config;
DROP POLICY IF EXISTS "config_update" ON company_config;
CREATE POLICY "config_select" ON company_config FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "config_insert" ON company_config FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "config_update" ON company_config FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS os_stage_history (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_order_id uuid NOT NULL,
  stage            text NOT NULL,
  notes            text DEFAULT '',
  created_at       timestamptz NOT NULL DEFAULT now(),
  created_by       text DEFAULT ''
);
ALTER TABLE os_stage_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "history_select" ON os_stage_history;
DROP POLICY IF EXISTS "history_insert" ON os_stage_history;
DROP POLICY IF EXISTS "history_update" ON os_stage_history;
DROP POLICY IF EXISTS "history_delete" ON os_stage_history;
CREATE POLICY "history_select" ON os_stage_history FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "history_insert" ON os_stage_history FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "history_update" ON os_stage_history FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "history_delete" ON os_stage_history FOR DELETE TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS boletos (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id      uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  amount           numeric(12,2) NOT NULL,
  due_date         date NOT NULL,
  status           text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'overdue', 'cancelled')),
  barcode          text,
  pdf_url          text,
  service_order_id uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE boletos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "boletos_select" ON boletos;
DROP POLICY IF EXISTS "boletos_insert" ON boletos;
DROP POLICY IF EXISTS "boletos_update" ON boletos;
DROP POLICY IF EXISTS "boletos_delete" ON boletos;
CREATE POLICY "boletos_select" ON boletos FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "boletos_insert" ON boletos FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "boletos_update" ON boletos FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "boletos_delete" ON boletos FOR DELETE TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS service_order_attachments (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_order_id uuid NOT NULL,
  file_name        text NOT NULL,
  file_url         text NOT NULL,
  file_type        text NOT NULL DEFAULT 'image',
  uploaded_by      text NOT NULL DEFAULT '',
  created_at       timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE service_order_attachments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "attachments_select" ON service_order_attachments;
DROP POLICY IF EXISTS "attachments_insert" ON service_order_attachments;
DROP POLICY IF EXISTS "attachments_delete" ON service_order_attachments;
CREATE POLICY "attachments_select" ON service_order_attachments FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "attachments_insert" ON service_order_attachments FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "attachments_delete" ON service_order_attachments FOR DELETE TO anon, authenticated USING (true);

-- 6. User Profiles updates
ALTER TABLE user_profiles 
  ADD COLUMN IF NOT EXISTS phone text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS email text NOT NULL DEFAULT '';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name LIKE '%user_profiles%role%'
       OR constraint_name LIKE '%role%'
  ) THEN
    ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS user_profiles_role_check;
  END IF;
  
  ALTER TABLE user_profiles
    ADD CONSTRAINT user_profiles_role_check
    CHECK (role IN ('admin', 'technician', 'comercial'));
END $$;
