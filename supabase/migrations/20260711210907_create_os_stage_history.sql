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
