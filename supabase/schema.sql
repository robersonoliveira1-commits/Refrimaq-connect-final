/*
  # Chopeira Connect CRM - Initial Schema

  ## Summary
  Full CRM schema for managing beer tap (chopeira) customers, their purchased products,
  contact history, and scheduled follow-ups.

  ## New Tables

  ### customers
  Core customer records with personal/business info and contact details.
  - id, name, phone, whatsapp, email, address, city, state, zip_code
  - document (CPF/CNPJ), notes, created_at, updated_at
  - last_contact_at (denormalized for fast dashboard queries)

  ### products
  Catalog of chopeiras and accessories sold.
  - id, name, category (chopeira | accessory | other), description

  ### customer_products
  Products purchased by each customer.
  - id, customer_id, product_id, purchase_date, invoice_number
  - warranty_start, warranty_end, notes

  ### contacts
  Full chronological contact history per customer.
  - id, customer_id, contact_type (phone | whatsapp | email | visit | other)
  - contacted_by (rep name), subject (short description), details (long notes)
  - contacted_at, next_contact_at, next_contact_notes

  ### contact_schedules
  Upcoming scheduled contacts (separate for calendar/task-list queries).
  - id, customer_id, contact_id (optional source), scheduled_at
  - assigned_to, notes, completed

  ## Security
  - RLS enabled on all tables
  - Public read/write access policies (single-tenant app, no auth layer yet)
    - Using authenticated OR anon roles for simplified single-tenant use
*/

-- ─── customers ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customers (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  phone           text NOT NULL DEFAULT '',
  whatsapp        text DEFAULT '',
  email           text DEFAULT '',
  address         text DEFAULT '',
  city            text DEFAULT '',
  state           text DEFAULT '',
  zip_code        text DEFAULT '',
  document        text DEFAULT '',
  notes           text DEFAULT '',
  last_contact_at timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all select on customers"
  ON customers FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Allow all insert on customers"
  ON customers FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Allow all update on customers"
  ON customers FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all delete on customers"
  ON customers FOR DELETE
  TO anon, authenticated
  USING (true);

-- ─── products ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS products (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  category    text NOT NULL DEFAULT 'chopeira',
  description text DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all select on products"
  ON products FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Allow all insert on products"
  ON products FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Allow all update on products"
  ON products FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all delete on products"
  ON products FOR DELETE
  TO anon, authenticated
  USING (true);

-- ─── customer_products ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customer_products (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id    uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  product_id     uuid REFERENCES products(id) ON DELETE SET NULL,
  product_name   text NOT NULL DEFAULT '',
  purchase_date  date,
  invoice_number text DEFAULT '',
  warranty_start date,
  warranty_end   date,
  notes          text DEFAULT '',
  created_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE customer_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all select on customer_products"
  ON customer_products FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Allow all insert on customer_products"
  ON customer_products FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Allow all update on customer_products"
  ON customer_products FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all delete on customer_products"
  ON customer_products FOR DELETE
  TO anon, authenticated
  USING (true);

-- ─── contacts ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contacts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id         uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  contact_type        text NOT NULL DEFAULT 'phone',
  contacted_by        text NOT NULL DEFAULT '',
  subject             text NOT NULL DEFAULT '',
  details             text DEFAULT '',
  contacted_at        timestamptz NOT NULL DEFAULT now(),
  next_contact_at     timestamptz,
  next_contact_notes  text DEFAULT '',
  created_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all select on contacts"
  ON contacts FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Allow all insert on contacts"
  ON contacts FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Allow all update on contacts"
  ON contacts FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all delete on contacts"
  ON contacts FOR DELETE
  TO anon, authenticated
  USING (true);

-- ─── contact_schedules ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contact_schedules (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id  uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  contact_id   uuid REFERENCES contacts(id) ON DELETE SET NULL,
  scheduled_at timestamptz NOT NULL,
  assigned_to  text DEFAULT '',
  notes        text DEFAULT '',
  completed    boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE contact_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all select on contact_schedules"
  ON contact_schedules FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Allow all insert on contact_schedules"
  ON contact_schedules FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Allow all update on contact_schedules"
  ON contact_schedules FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all delete on contact_schedules"
  ON contact_schedules FOR DELETE
  TO anon, authenticated
  USING (true);

-- ─── indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_customers_last_contact ON customers(last_contact_at);
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);
CREATE INDEX IF NOT EXISTS idx_contacts_customer_id ON contacts(customer_id);
CREATE INDEX IF NOT EXISTS idx_contacts_contacted_at ON contacts(contacted_at);
CREATE INDEX IF NOT EXISTS idx_customer_products_customer ON customer_products(customer_id);
CREATE INDEX IF NOT EXISTS idx_schedules_scheduled_at ON contact_schedules(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_schedules_customer ON contact_schedules(customer_id);

-- ─── trigger: keep customers.last_contact_at in sync ─────────────────────────
CREATE OR REPLACE FUNCTION update_customer_last_contact()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE customers
  SET last_contact_at = NEW.contacted_at,
      updated_at = now()
  WHERE id = NEW.customer_id
    AND (last_contact_at IS NULL OR NEW.contacted_at > last_contact_at);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_update_last_contact
AFTER INSERT ON contacts
FOR EACH ROW EXECUTE FUNCTION update_customer_last_contact();

-- ─── seed: default products ───────────────────────────────────────────────────
INSERT INTO products (name, category, description) VALUES
  ('Chopeira Standard 30L', 'chopeira', 'Chopeira residencial padrão 30 litros'),
  ('Chopeira Premium 50L', 'chopeira', 'Chopeira comercial premium 50 litros'),
  ('Chopeira Slim Inox', 'chopeira', 'Chopeira compacta em inox'),
  ('Kit Torneira Italiana', 'accessory', 'Torneira italiana de alta pressão'),
  ('Mangueira 5m', 'accessory', 'Mangueira de cerveja 5 metros'),
  ('Cilindro CO2 2kg', 'accessory', 'Cilindro de CO2 2 quilogramas'),
  ('Regulador de Pressão', 'accessory', 'Regulador de pressão para CO2'),
  ('Kit Limpeza Completo', 'accessory', 'Kit completo para limpeza de chopeiras')
ON CONFLICT DO NOTHING;
ALTER TABLE customers ADD COLUMN latitude double precision;
ALTER TABLE customers ADD COLUMN longitude double precision;
CREATE TABLE routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  day_index smallint NOT NULL CHECK (day_index >= 1 AND day_index <= 5),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE route_stops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id uuid NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  stop_order smallint NOT NULL DEFAULT 0,
  visited boolean NOT NULL DEFAULT false,
  visited_at timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE(route_id, customer_id)
);

ALTER TABLE routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE route_stops ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_routes" ON routes FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert_routes" ON routes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "update_routes" ON routes FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "delete_routes" ON routes FOR DELETE TO authenticated USING (true);

CREATE POLICY "select_route_stops" ON route_stops FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert_route_stops" ON route_stops FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "update_route_stops" ON route_stops FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "delete_route_stops" ON route_stops FOR DELETE TO authenticated USING (true);

-- Seed 5 default routes (Mon-Fri)
INSERT INTO routes (name, day_index) VALUES
  ('Segunda-feira', 1),
  ('Terça-feira', 2),
  ('Quarta-feira', 3),
  ('Quinta-feira', 4),
  ('Sexta-feira', 5);
CREATE TABLE user_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT 'technician' CHECK (role IN ('admin', 'technician')),
  assigned_day_index smallint CHECK (assigned_day_index BETWEEN 1 AND 5),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_own_profile" ON user_profiles FOR SELECT
  TO authenticated USING (auth.uid() = id);

CREATE POLICY "insert_own_profile" ON user_profiles FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = id);

CREATE POLICY "update_own_profile" ON user_profiles FOR UPDATE
  TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- Allow admins to view all profiles
CREATE POLICY "admin_select_all_profiles" ON user_profiles FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Function to auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_profiles (id, full_name, role)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), COALESCE(NEW.raw_user_meta_data->>'role', 'technician'))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION handle_new_user();
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS phone text NOT NULL DEFAULT '';
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;

-- Allow admins to update any profile (for managing team)
CREATE POLICY "admin_update_all_profiles" ON user_profiles FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin')
  ) WITH CHECK (true);

-- Allow admins to insert profiles (when creating technicians)
CREATE POLICY "admin_insert_profiles" ON user_profiles FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Allow admins to delete profiles
CREATE POLICY "admin_delete_profiles" ON user_profiles FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Add route_stops status field (ok, absent, postponed)
ALTER TABLE route_stops ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ok', 'absent', 'postponed'));

-- Update existing visited=true stops to have status='ok'
UPDATE route_stops SET status = 'ok' WHERE visited = true AND status = 'pending';
-- Add comprovante_url to contacts table for photo proof
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS comprovante_url text DEFAULT '';

-- Create storage bucket for comprovantes (visit proofs)
INSERT INTO storage.buckets (id, name, public) VALUES ('comprovantes', 'comprovantes', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload to comprovantes bucket
CREATE POLICY "allow_auth_upload_comprovantes" ON storage.objects FOR INSERT
  TO authenticated WITH CHECK (bucket_id = 'comprovantes');

-- Allow public read on comprovantes bucket
CREATE POLICY "allow_public_read_comprovantes" ON storage.objects FOR SELECT
  TO anon, authenticated USING (bucket_id = 'comprovantes');
-- Drop and recreate the trigger function with proper permissions
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_profiles (id, full_name, role, phone, active)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'role', 'technician'),
    '',
    true
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Ensure function has access
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT ALL ON public.user_profiles TO supabase_auth_admin;

-- Recreate trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
-- Drop the recursive admin policies that don't work
DROP POLICY IF EXISTS "admin_select_all_profiles" ON user_profiles;
DROP POLICY IF EXISTS "admin_update_all_profiles" ON user_profiles;
DROP POLICY IF EXISTS "admin_delete_profiles" ON user_profiles;
DROP POLICY IF EXISTS "admin_insert_profiles" ON user_profiles;

-- Recreate admin policies using auth.jwt() to avoid recursion
-- The role is stored in user_metadata during signup
CREATE POLICY "admin_select_all_profiles" ON user_profiles FOR SELECT
  TO authenticated USING (
    auth.uid() = id
    OR (SELECT role FROM user_profiles WHERE id = auth.uid()) = 'admin'
  );

-- Drop the old select_own_profile since the new admin policy covers it
DROP POLICY IF EXISTS "select_own_profile" ON user_profiles;

-- Admin can update any profile
CREATE POLICY "admin_update_all_profiles" ON user_profiles FOR UPDATE
  TO authenticated USING (
    auth.uid() = id
    OR (SELECT role FROM user_profiles WHERE id = auth.uid()) = 'admin'
  ) WITH CHECK (
    auth.uid() = id
    OR (SELECT role FROM user_profiles WHERE id = auth.uid()) = 'admin'
  );

-- Admin can insert profiles (for creating technicians via edge function)
CREATE POLICY "admin_insert_profiles" ON user_profiles FOR INSERT
  TO authenticated WITH CHECK (
    auth.uid() = id
    OR (SELECT role FROM user_profiles WHERE id = auth.uid()) = 'admin'
  );

-- Admin can delete profiles
CREATE POLICY "admin_delete_profiles" ON user_profiles FOR DELETE
  TO authenticated USING (
    (SELECT role FROM user_profiles WHERE id = auth.uid()) = 'admin'
  );
-- Drop all existing policies on user_profiles
DROP POLICY IF EXISTS "admin_select_all_profiles" ON user_profiles;
DROP POLICY IF EXISTS "admin_update_all_profiles" ON user_profiles;
DROP POLICY IF EXISTS "admin_delete_profiles" ON user_profiles;
DROP POLICY IF EXISTS "admin_insert_profiles" ON user_profiles;
DROP POLICY IF EXISTS "insert_own_profile" ON user_profiles;
DROP POLICY IF EXISTS "update_own_profile" ON user_profiles;
DROP POLICY IF EXISTS "select_own_profile" ON user_profiles;

-- Create a security definer function to check admin without RLS recursion
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- SELECT: own row always, all rows if admin
CREATE POLICY "select_profiles" ON user_profiles FOR SELECT
  TO authenticated USING (
    auth.uid() = id OR public.is_admin()
  );

-- INSERT: own row or admin
CREATE POLICY "insert_profiles" ON user_profiles FOR INSERT
  TO authenticated WITH CHECK (
    auth.uid() = id OR public.is_admin()
  );

-- UPDATE: own row or admin
CREATE POLICY "update_profiles" ON user_profiles FOR UPDATE
  TO authenticated USING (
    auth.uid() = id OR public.is_admin()
  ) WITH CHECK (
    auth.uid() = id OR public.is_admin()
  );

-- DELETE: admin only
CREATE POLICY "delete_profiles" ON user_profiles FOR DELETE
  TO authenticated USING (
    public.is_admin()
  );
ALTER TABLE products ADD COLUMN IF NOT EXISTS photo_url text DEFAULT '';

INSERT INTO storage.buckets (id, name, public) VALUES ('product-photos', 'product-photos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "allow_auth_upload_product_photos" ON storage.objects FOR INSERT
  TO authenticated WITH CHECK (bucket_id = 'product-photos');

CREATE POLICY "allow_public_read_product_photos" ON storage.objects FOR SELECT
  TO anon, authenticated USING (bucket_id = 'product-photos');

CREATE POLICY "allow_auth_delete_product_photos" ON storage.objects FOR DELETE
  TO authenticated USING (bucket_id = 'product-photos');
CREATE TABLE IF NOT EXISTS service_order_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_order_id uuid NOT NULL REFERENCES service_orders(id) ON DELETE CASCADE,
  photo_url text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE service_order_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_service_order_attachments" ON service_order_attachments FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "insert_service_order_attachments" ON service_order_attachments FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE POLICY "delete_service_order_attachments" ON service_order_attachments FOR DELETE
  TO authenticated USING (true);

INSERT INTO storage.buckets (id, name, public) VALUES ('service-order-attachments', 'service-order-attachments', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "allow_auth_upload_os_attachments" ON storage.objects FOR INSERT
  TO authenticated WITH CHECK (bucket_id = 'service-order-attachments');

CREATE POLICY "allow_public_read_os_attachments" ON storage.objects FOR SELECT
  TO anon, authenticated USING (bucket_id = 'service-order-attachments');

CREATE POLICY "allow_auth_delete_os_attachments" ON storage.objects FOR DELETE
  TO authenticated USING (bucket_id = 'service-order-attachments');
ALTER TABLE products ADD COLUMN IF NOT EXISTS stock_min integer NOT NULL DEFAULT 0;
-- Add due_date to service_orders
ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS due_date date;

-- Boletos table
CREATE TABLE IF NOT EXISTS boletos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_order_id uuid NOT NULL REFERENCES service_orders(id) ON DELETE CASCADE,
  customer_name text NOT NULL,
  amount numeric(10,2) NOT NULL,
  due_date date NOT NULL,
  status text NOT NULL DEFAULT 'emitido', -- emitido | pago | vencido
  issued_at timestamptz DEFAULT now(),
  paid_at timestamptz,
  notes text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE boletos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_boletos" ON boletos FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert_boletos" ON boletos FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "update_boletos" ON boletos FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "delete_boletos" ON boletos FOR DELETE TO authenticated USING (true);
-- Separate operational and financial status on service_orders
ALTER TABLE service_orders
  ADD COLUMN IF NOT EXISTS status_financeiro text NOT NULL DEFAULT 'pendente',
  ADD COLUMN IF NOT EXISTS data_conclusao timestamptz;

-- Backfill: OS already marked as Concluída with paid_at → set financeiro = 'pago'
UPDATE service_orders
SET status_financeiro = 'pago'
WHERE status = 'Concluída' AND paid_at IS NOT NULL;

-- For OS Concluída without paid_at → financeiro = 'pendente' (already default)

-- Index for financial module queries
CREATE INDEX IF NOT EXISTS idx_service_orders_status_fin ON service_orders(status_financeiro);

CREATE TABLE IF NOT EXISTS customer_equipments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id  uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  equip_type   text NOT NULL DEFAULT '',
  equip_brand  text NOT NULL DEFAULT '',
  equip_model  text NOT NULL DEFAULT '',
  equip_serial text NOT NULL DEFAULT '',
  equip_gas    text NOT NULL DEFAULT '',
  equip_voltage text NOT NULL DEFAULT '',
  created_at   timestamptz DEFAULT now()
);

ALTER TABLE customer_equipments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "equipments_select" ON customer_equipments FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "equipments_insert" ON customer_equipments FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "equipments_update" ON customer_equipments FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "equipments_delete" ON customer_equipments FOR DELETE TO anon, authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_equipments_customer_serial ON customer_equipments(customer_id, equip_serial);

CREATE TABLE IF NOT EXISTS service_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number serial NOT NULL,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  technician_id uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  equipment_id uuid REFERENCES customer_equipments(id) ON DELETE SET NULL,
  visit_type text NOT NULL DEFAULT '',
  priority text NOT NULL DEFAULT 'Baixa',
  status text NOT NULL DEFAULT 'Triagem',
  status_financeiro text NOT NULL DEFAULT 'Pendente',
  diagnosis text DEFAULT '',
  labor_cost numeric(12,2) DEFAULT 0,
  payment_method text,
  paid_at timestamptz,
  due_date date,
  data_conclusao timestamptz,
  equip_type text DEFAULT '',
  equip_brand text DEFAULT '',
  equip_model text DEFAULT '',
  equip_serial text DEFAULT '',
  equip_gas text DEFAULT '',
  equip_voltage text DEFAULT '',
  equip_accessories text DEFAULT '',
  equip_condition text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text
);
ALTER TABLE service_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_orders_select" ON service_orders FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "service_orders_insert" ON service_orders FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "service_orders_update" ON service_orders FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "service_orders_delete" ON service_orders FOR DELETE TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS company_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Company data
  company_name text NOT NULL DEFAULT '',
  razao_social text NOT NULL DEFAULT '',
  cnpj text NOT NULL DEFAULT '',
  address text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  responsible text NOT NULL DEFAULT '',
  logo_url text NOT NULL DEFAULT '',
  -- Payment data
  pix_key text NOT NULL DEFAULT '',
  pix_key_type text NOT NULL DEFAULT '',
  account_holder text NOT NULL DEFAULT '',
  bank_name text NOT NULL DEFAULT '',
  agency text NOT NULL DEFAULT '',
  account_number text NOT NULL DEFAULT '',
  account_type text NOT NULL DEFAULT 'corrente',
  financial_notes text NOT NULL DEFAULT '',
  -- General config
  pdf_footer text NOT NULL DEFAULT '',
  boleto_message text NOT NULL DEFAULT '',
  warranty_policy text NOT NULL DEFAULT '',
  return_policy text NOT NULL DEFAULT '',
  os_notes text NOT NULL DEFAULT '',
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE company_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_company_config" ON company_config FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert_company_config" ON company_config FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "update_company_config" ON company_config FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "delete_company_config" ON company_config FOR DELETE TO authenticated USING (true);

-- Seed a single default row so upsert always works
INSERT INTO company_config (company_name, razao_social, cnpj, address, phone, email, responsible)
VALUES ('Refrimaq', 'Refrimaq Serviços de Refrigeração LTDA', '', '', '', '', '')
ON CONFLICT DO NOTHING;
-- Create company-assets storage bucket for logo uploads
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'company-assets',
  'company-assets',
  true,
  2097152,
  ARRAY['image/png','image/jpeg','image/jpg','image/webp','image/svg+xml']
)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Allow authenticated users to manage objects in company-assets
CREATE POLICY "company_assets_select" ON storage.objects FOR SELECT
  TO authenticated USING (bucket_id = 'company-assets');

CREATE POLICY "company_assets_insert" ON storage.objects FOR INSERT
  TO authenticated WITH CHECK (bucket_id = 'company-assets');

CREATE POLICY "company_assets_update" ON storage.objects FOR UPDATE
  TO authenticated USING (bucket_id = 'company-assets');

CREATE POLICY "company_assets_delete" ON storage.objects FOR DELETE
  TO authenticated USING (bucket_id = 'company-assets');

-- Allow public (anon) to read so logos load in PDFs and previews
CREATE POLICY "company_assets_public_select" ON storage.objects FOR SELECT
  TO anon USING (bucket_id = 'company-assets');
-- Enhance products table with fields for full parts management
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS internal_code text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS manufacturer  text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS unit          text NOT NULL DEFAULT 'un',
  ADD COLUMN IF NOT EXISTS cost_price    numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS location      text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS part_notes    text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS unit_price    numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stock_quantity integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at    timestamptz DEFAULT now();

-- Ensure stock_min exists (already added via earlier migration but safe to repeat)
ALTER TABLE products ADD COLUMN IF NOT EXISTS stock_min integer NOT NULL DEFAULT 0;

-- ─── services ────────────────────────────────────────────────────────────────
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
CREATE POLICY "services_select" ON services FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "services_insert" ON services FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "services_update" ON services FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "services_delete" ON services FOR DELETE TO anon, authenticated USING (true);

-- ─── stock_movements ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stock_movements (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id          uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  product_name        text NOT NULL DEFAULT '',
  movement_type       text NOT NULL, -- 'entrada' | 'saida' | 'ajuste' | 'os'
  quantity            integer NOT NULL,
  quantity_before     integer NOT NULL DEFAULT 0,
  quantity_after      integer NOT NULL DEFAULT 0,
  reason              text NOT NULL DEFAULT '',
  service_order_id    uuid REFERENCES service_orders(id) ON DELETE SET NULL,
  responsible         text NOT NULL DEFAULT '',
  created_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "movements_select" ON stock_movements FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "movements_insert" ON stock_movements FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "movements_update" ON stock_movements FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "movements_delete" ON stock_movements FOR DELETE TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_movements_product ON stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_movements_created ON stock_movements(created_at DESC);

-- ─── stock_audits ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stock_audits (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  responsible text NOT NULL DEFAULT '',
  notes       text NOT NULL DEFAULT '',
  status      text NOT NULL DEFAULT 'aberta', -- 'aberta' | 'concluída'
  created_at  timestamptz NOT NULL DEFAULT now(),
  closed_at   timestamptz
);

ALTER TABLE stock_audits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audits_select" ON stock_audits FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "audits_insert" ON stock_audits FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "audits_update" ON stock_audits FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "audits_delete" ON stock_audits FOR DELETE TO anon, authenticated USING (true);

-- ─── stock_audit_items ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stock_audit_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id        uuid NOT NULL REFERENCES stock_audits(id) ON DELETE CASCADE,
  product_id      uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  product_name    text NOT NULL DEFAULT '',
  system_quantity integer NOT NULL DEFAULT 0,
  counted_quantity integer,
  divergence      integer GENERATED ALWAYS AS (
    CASE WHEN counted_quantity IS NOT NULL THEN counted_quantity - system_quantity ELSE NULL END
  ) STORED,
  justification   text NOT NULL DEFAULT '',
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE stock_audit_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_items_select" ON stock_audit_items FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "audit_items_insert" ON stock_audit_items FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "audit_items_update" ON stock_audit_items FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "audit_items_delete" ON stock_audit_items FOR DELETE TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_audit_items_audit ON stock_audit_items(audit_id);
-- Track every OS stage transition
CREATE TABLE IF NOT EXISTS os_stage_history (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_order_id uuid NOT NULL REFERENCES service_orders(id) ON DELETE CASCADE,
  from_status      text NOT NULL DEFAULT '',
  to_status        text NOT NULL,
  changed_by_name  text NOT NULL DEFAULT '',
  changed_by_id    uuid,
  notes            text NOT NULL DEFAULT '',
  created_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE os_stage_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stage_history_select" ON os_stage_history FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "stage_history_insert" ON os_stage_history FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_stage_history_order ON os_stage_history(service_order_id);
CREATE INDEX IF NOT EXISTS idx_stage_history_created ON os_stage_history(created_at DESC);
-- Add equipment identification fields to service_orders
ALTER TABLE service_orders
  ADD COLUMN IF NOT EXISTS equip_type        text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS equip_brand       text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS equip_model       text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS equip_serial      text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS equip_gas         text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS equip_voltage     text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS equip_accessories text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS equip_condition   text NOT NULL DEFAULT '';
-- Alter the role column to accept 'comercial' (currently may have a check constraint)
DO $$
BEGIN
  -- Add comercial to the check constraint if one exists
  IF EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name LIKE '%user_profiles%role%'
       OR constraint_name LIKE '%role%'
  ) THEN
    -- Drop and recreate the constraint
    ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS user_profiles_role_check;
  END IF;
  
  ALTER TABLE user_profiles
    ADD CONSTRAINT user_profiles_role_check
    CHECK (role IN ('admin', 'technician', 'comercial'));
END $$;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS email text NOT NULL DEFAULT '';

-- Update trigger to also capture email
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_profiles (id, full_name, role, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'role', 'technician'),
    COALESCE(NEW.email, '')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
-- ─── service_order_parts ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS service_order_parts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_order_id uuid NOT NULL REFERENCES service_orders(id) ON DELETE CASCADE,
  product_id       uuid REFERENCES products(id) ON DELETE SET NULL,
  part_name        text NOT NULL,
  quantity         integer NOT NULL DEFAULT 1,
  unit_price       numeric(12,2) NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE service_order_parts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_order_parts_select" ON service_order_parts FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "service_order_parts_insert" ON service_order_parts FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "service_order_parts_update" ON service_order_parts FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "service_order_parts_delete" ON service_order_parts FOR DELETE TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_service_order_parts_os ON service_order_parts(service_order_id);
