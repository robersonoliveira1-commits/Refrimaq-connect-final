-- Tabela para o módulo de Venda de Peças e Máquinas Usadas
CREATE TABLE IF NOT EXISTS used_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  internal_code text NOT NULL DEFAULT '',
  name text NOT NULL,
  category text NOT NULL, -- 'Peças Usadas' ou 'Máquinas Usadas'
  brand_model text NOT NULL DEFAULT '',
  year integer,
  condition text NOT NULL DEFAULT 'Bom',
  description text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  photos text[] NOT NULL DEFAULT '{}',
  price numeric(12,2) NOT NULL DEFAULT 0,
  promotional_price numeric(12,2),
  payment_conditions text NOT NULL DEFAULT '',
  specs text NOT NULL DEFAULT '',
  dimensions text NOT NULL DEFAULT '',
  weight text NOT NULL DEFAULT '',
  voltage text NOT NULL DEFAULT '',
  compatibility text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'Disponível', -- 'Disponível' ou 'Vendido'
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Habilitar segurança a nível de linha (RLS)
ALTER TABLE used_items ENABLE ROW LEVEL SECURITY;

-- Políticas de acesso (neste módulo, apenas perfis administrativos verão a tela no front-end,
-- mas podemos garantir que autenticados possam interagir com a tabela por enquanto)
CREATE POLICY "select_used_items" ON used_items FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "admin_insert_used_items" ON used_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "admin_update_used_items" ON used_items FOR UPDATE TO authenticated USING (true);
CREATE POLICY "admin_delete_used_items" ON used_items FOR DELETE TO authenticated USING (true);

-- Criar bucket de storage para as fotos dos itens usados
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'used-items-photos',
  'used-items-photos',
  true,
  10485760, -- 10MB limit
  ARRAY['image/png','image/jpeg','image/jpg','image/webp']
)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Políticas de acesso para o bucket
CREATE POLICY "allow_public_read_used_items_photos" ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id = 'used-items-photos');
CREATE POLICY "allow_auth_insert_used_items_photos" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'used-items-photos');
CREATE POLICY "allow_auth_update_used_items_photos" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'used-items-photos');
CREATE POLICY "allow_auth_delete_used_items_photos" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'used-items-photos');
