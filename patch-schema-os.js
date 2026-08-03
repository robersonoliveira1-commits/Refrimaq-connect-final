import fs from 'fs';
const path = 'supabase/schema.sql';
let content = fs.readFileSync(path, 'utf8');

const serviceOrdersSQL = `
-- ─── service_orders ─────────────────────────────────────────────────────────
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
`;

if (!content.includes('CREATE TABLE IF NOT EXISTS service_orders')) {
  // Insert it right after user_profiles to ensure it exists before referencing tables
  const target = '-- ─── user_profiles ────────────────────────────────────────────────────────────';
  const parts = content.split(target);
  if (parts.length > 1) {
    // wait, we need it after user_profiles is created
    const nextTarget = '-- ─── company_config ─────────────────────────────────────────────────────────';
    const parts2 = content.split(nextTarget);
    if (parts2.length > 1) {
      content = parts2[0] + serviceOrdersSQL + '\n' + nextTarget + parts2[1];
      fs.writeFileSync(path, content, 'utf8');
      console.log('Patched schema.sql');
    }
  }
}
