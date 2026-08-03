-- ─── Centros de Custo ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cost_centers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE cost_centers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cost_centers_select" ON cost_centers FOR SELECT TO authenticated USING (true);
CREATE POLICY "cost_centers_insert" ON cost_centers FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "cost_centers_update" ON cost_centers FOR UPDATE TO authenticated USING (true);
CREATE POLICY "cost_centers_delete" ON cost_centers FOR DELETE TO authenticated USING (true);

-- Inserir centros de custo padrão
INSERT INTO cost_centers (name) VALUES 
('Oficina'), ('Logística'), ('Administrativo'), ('Comercial')
ON CONFLICT DO NOTHING;

-- ─── Contas a Pagar (Despesas) ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  description text NOT NULL,
  category text NOT NULL, -- 'Insumos', 'Ferramentas', 'Aluguel', 'Marketing', etc
  amount numeric(12,2) NOT NULL DEFAULT 0,
  due_date date NOT NULL,
  paid_at timestamptz,
  status text NOT NULL DEFAULT 'pendente', -- 'pendente', 'pago', 'atrasado'
  recurrence text NOT NULL DEFAULT 'única', -- 'única', 'mensal', 'anual'
  attachment_url text DEFAULT '',
  cost_center_id uuid REFERENCES cost_centers(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "expenses_select" ON expenses FOR SELECT TO authenticated USING (true);
CREATE POLICY "expenses_insert" ON expenses FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "expenses_update" ON expenses FOR UPDATE TO authenticated USING (true);
CREATE POLICY "expenses_delete" ON expenses FOR DELETE TO authenticated USING (true);

-- Bucket para comprovantes de despesas
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'expenses-attachments',
  'expenses-attachments',
  true,
  10485760, -- 10MB limit
  ARRAY['image/png','image/jpeg','image/jpg','image/webp','application/pdf']
)
ON CONFLICT (id) DO UPDATE SET public = true;

CREATE POLICY "allow_public_read_expenses_attachments" ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id = 'expenses-attachments');
CREATE POLICY "allow_auth_insert_expenses_attachments" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'expenses-attachments');
CREATE POLICY "allow_auth_update_expenses_attachments" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'expenses-attachments');
CREATE POLICY "allow_auth_delete_expenses_attachments" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'expenses-attachments');

-- ─── Retrabalho ───────────────────────────────────────────────────────────────
-- Adicionar campo is_rework na tabela service_orders
ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS is_rework boolean NOT NULL DEFAULT false;

-- ─── Auditoria Financeira ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS financial_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_type text NOT NULL, -- 'insert', 'update', 'delete'
  table_name text NOT NULL,
  record_id uuid NOT NULL,
  user_name text NOT NULL DEFAULT 'Sistema', -- Nome de quem alterou ou 'Sistema'
  changes jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE financial_audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_logs_select" ON financial_audit_logs FOR SELECT TO authenticated USING (true);
-- Inserções feitas pelo front-end para simplificar auditoria (poderia ser trigger)
CREATE POLICY "audit_logs_insert" ON financial_audit_logs FOR INSERT TO authenticated WITH CHECK (true);
