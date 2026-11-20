-- Campanhas e Banners do Hero do Site Público Refrimaq (refrimaqrs.com.br)
-- Gerenciado pela aba Site Refrimaq -> Banners / Hero no Refrimaq Connect.

CREATE TABLE IF NOT EXISTS public.site_banners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  mode text NOT NULL DEFAULT 'editorial' CHECK (mode IN ('editorial', 'artwork')),
  theme_preset text NOT NULL DEFAULT 'default' CHECK (theme_preset IN ('default', 'black_friday', 'natal', 'promocao', 'verao')),
  eyebrow text NOT NULL DEFAULT '',
  headline text NOT NULL DEFAULT '',
  subtitle text NOT NULL DEFAULT '',
  badge_text text NOT NULL DEFAULT '',
  announcement_bar text NOT NULL DEFAULT '',
  cta_label text NOT NULL DEFAULT 'Explorar catálogo',
  secondary_cta_label text NOT NULL DEFAULT 'Falar no WhatsApp',
  action_type text NOT NULL DEFAULT 'catalog' CHECK (action_type IN ('catalog', 'category', 'product', 'service_visit', 'whatsapp', 'url')),
  action_value text NOT NULL DEFAULT '',
  desktop_image_url text NOT NULL DEFAULT '',
  mobile_image_url text NOT NULL DEFAULT '',
  image_alt text NOT NULL DEFAULT '',
  featured_product_slugs text[] NOT NULL DEFAULT '{}',
  starts_on date,
  ends_on date,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_site_banners_active_order
  ON public.site_banners (active, sort_order ASC, created_at DESC);

ALTER TABLE public.site_banners ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "site_banners_public_select" ON public.site_banners;
CREATE POLICY "site_banners_public_select"
  ON public.site_banners
  FOR SELECT
  TO anon
  USING (active = true);

DROP POLICY IF EXISTS "site_banners_auth_select" ON public.site_banners;
CREATE POLICY "site_banners_auth_select"
  ON public.site_banners
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "site_banners_auth_insert" ON public.site_banners;
CREATE POLICY "site_banners_auth_insert"
  ON public.site_banners
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "site_banners_auth_update" ON public.site_banners;
CREATE POLICY "site_banners_auth_update"
  ON public.site_banners
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "site_banners_auth_delete" ON public.site_banners;
CREATE POLICY "site_banners_auth_delete"
  ON public.site_banners
  FOR DELETE
  TO authenticated
  USING (true);
