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
