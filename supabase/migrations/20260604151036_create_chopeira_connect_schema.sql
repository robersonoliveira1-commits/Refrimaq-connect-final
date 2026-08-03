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
