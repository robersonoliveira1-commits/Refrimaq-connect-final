-- Tabela do catálogo público do novo site Refrimaq gerenciado via Refrimaq Connect
CREATE TABLE IF NOT EXISTS public.site_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  category_id text NOT NULL DEFAULT 'acessorios',
  category_label text NOT NULL DEFAULT 'Peças e Acessórios',
  brand text NOT NULL DEFAULT 'Memo',
  price numeric(12, 2),
  specs text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  image_url text NOT NULL DEFAULT '',
  featured boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_site_products_active_cat
  ON public.site_products (active, category_id);

CREATE INDEX IF NOT EXISTS idx_site_products_featured_sort
  ON public.site_products (featured DESC, sort_order ASC, title ASC);

ALTER TABLE public.site_products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "site_products_public_select" ON public.site_products;
CREATE POLICY "site_products_public_select"
  ON public.site_products
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "site_products_auth_insert" ON public.site_products;
CREATE POLICY "site_products_auth_insert"
  ON public.site_products
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "site_products_auth_update" ON public.site_products;
CREATE POLICY "site_products_auth_update"
  ON public.site_products
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "site_products_auth_delete" ON public.site_products;
CREATE POLICY "site_products_auth_delete"
  ON public.site_products
  FOR DELETE
  TO authenticated
  USING (true);
