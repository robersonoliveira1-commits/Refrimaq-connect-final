-- 1. Permite o perfil "comercial" na tabela de usuários
ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS user_profiles_role_check;
ALTER TABLE user_profiles ADD CONSTRAINT user_profiles_role_check CHECK (role IN ('admin', 'technician', 'comercial'));

-- 2. Cria a tabela de OS caso não exista
CREATE TABLE IF NOT EXISTS service_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number serial NOT NULL,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  technician_id uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
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

-- 3. Cria a tabela de peças de OS
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
