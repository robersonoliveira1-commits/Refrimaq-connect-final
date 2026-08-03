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
