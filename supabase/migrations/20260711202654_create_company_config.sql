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
