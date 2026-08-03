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
