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
