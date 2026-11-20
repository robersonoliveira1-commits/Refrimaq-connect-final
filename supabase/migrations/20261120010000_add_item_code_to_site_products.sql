-- Adiciona código do item (SKU / código Memo ou interno) aos produtos do site para agilizar orçamentos
ALTER TABLE public.site_products
  ADD COLUMN IF NOT EXISTS item_code text NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_site_products_item_code
  ON public.site_products (item_code)
  WHERE item_code <> '';
