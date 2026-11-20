export type SiteCategoryId =
  | 'chopeiras-eletricas'
  | 'chopeiras-gelo'
  | 'torres'
  | 'pre-resfriadores'
  | 'barris'
  | 'gela-canecas'
  | 'acessorios';

export interface SiteProductRow {
  id: string;
  slug: string;
  item_code: string;
  title: string;
  category_id: SiteCategoryId;
  category_label: string;
  brand: string;
  price: number | null;
  specs: string;
  description: string;
  image_url: string;
  featured: boolean;
  active: boolean;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
}

export interface SiteCategoryOption {
  id: SiteCategoryId;
  label: string;
}

export const SITE_CATEGORIES: SiteCategoryOption[] = [
  { id: 'chopeiras-eletricas', label: 'Chopeiras Elétricas' },
  { id: 'chopeiras-gelo', label: 'Chopeiras a Gelo' },
  { id: 'torres', label: 'Torres de Chopp' },
  { id: 'pre-resfriadores', label: 'Pré-Resfriadores' },
  { id: 'barris', label: 'Barris Kegsbrasil' },
  { id: 'gela-canecas', label: 'Gela Canecas' },
  { id: 'acessorios', label: 'Peças e Acessórios' },
];

export const SITE_PRODUCTS_ADD_ITEM_CODE_SQL = `-- Execute uma vez no SQL Editor do Supabase para criar a coluna oficial item_code
ALTER TABLE public.site_products
  ADD COLUMN IF NOT EXISTS item_code text NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_site_products_item_code
  ON public.site_products (item_code)
  WHERE item_code <> '';`;

export const SITE_PRODUCTS_SETUP_SQL = `-- Execute uma vez no SQL Editor do Supabase da Refrimaq
CREATE TABLE IF NOT EXISTS public.site_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  item_code text NOT NULL DEFAULT '',
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

CREATE INDEX IF NOT EXISTS idx_site_products_active_cat ON public.site_products (active, category_id);
CREATE INDEX IF NOT EXISTS idx_site_products_featured_sort ON public.site_products (featured DESC, sort_order ASC, title ASC);
CREATE INDEX IF NOT EXISTS idx_site_products_item_code ON public.site_products (item_code) WHERE item_code <> '';

ALTER TABLE public.site_products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "site_products_public_select" ON public.site_products;
CREATE POLICY "site_products_public_select" ON public.site_products FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "site_products_auth_insert" ON public.site_products;
CREATE POLICY "site_products_auth_insert" ON public.site_products FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "site_products_auth_update" ON public.site_products;
CREATE POLICY "site_products_auth_update" ON public.site_products FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "site_products_auth_delete" ON public.site_products;
CREATE POLICY "site_products_auth_delete" ON public.site_products FOR DELETE TO authenticated USING (true);`;

const BRL_FORMATTER = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

export function getSiteCategoryLabel(id: string): string {
  return SITE_CATEGORIES.find(c => c.id === id)?.label ?? 'Peças e Acessórios';
}

export function slugifySiteProduct(title: string): string {
  const base = title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72);
  return base || `produto-${Date.now()}`;
}

export function parseSitePriceInput(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Accepts "4490", "4490.50", "4.490,50", "R$ 4.490,00"
  const cleaned = trimmed.replace(/R\$\s*/i, '').replace(/\s+/g, '');
  let normalized = cleaned;
  if (cleaned.includes(',')) {
    normalized = cleaned.replace(/\./g, '').replace(',', '.');
  }
  const num = Number(normalized);
  if (!Number.isFinite(num) || num <= 0) return null;
  return Math.round(num * 100) / 100;
}

export function formatSitePrice(price: number | null | undefined): string {
  if (price === null || price === undefined || !Number.isFinite(price) || price <= 0) {
    return 'Valor sob consulta';
  }
  return BRL_FORMATTER.format(price);
}

export function suggestSiteSpecs(title: string, description = ''): string {
  const source = `${title} ${description}`;
  const parts: string[] = [];

  const flowMatch = source.match(/(\d+)\s*(?:l\/h|litros\/hora|litros\s*\/\s*hora)/i);
  if (flowMatch) {
    parts.push(`${flowMatch[1]} L/h`);
  } else {
    const volMatch = source.match(/(\d+)\s*(?:litros|l\b)/i);
    if (volMatch) parts.push(`${volMatch[1]} L`);
  }

  const tapsMatch = source.match(/(\d+)\s*(?:torneiras?|vias?)/i);
  if (tapsMatch) {
    const n = Number(tapsMatch[1]);
    parts.push(n === 1 ? '1 via' : `${n} vias`);
  }

  const voltMatch = source.match(/(127\s*v|220\s*v|110\s*v|bivolt|autovolt)/i);
  if (voltMatch && parts.length < 2) {
    const v = voltMatch[1].replace(/\s+/g, '');
    parts.push(v.toLowerCase() === 'autovolt' ? 'Autovolt' : v.toUpperCase());
  }

  if (parts.length === 0) {
    if (/barril/i.test(source)) parts.push('Inox 304');
    else if (/gela caneca/i.test(source)) parts.push('Ultracongelador');
    else if (/torre/i.test(source)) parts.push('Torre Memo');
    else parts.push('Linha Memo');
  }

  return parts.slice(0, 2).join(' · ');
}

const ITEM_CODE_TAG_RE = /\s*\[C[oó]d:\s*([^\]]+)\]\s*/gi;

export function normalizeItemCode(raw: string | null | undefined): string {
  return (raw ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);
}

export function extractItemCodeTag(description: string | null | undefined): string {
  const src = description ?? '';
  const match = src.match(/\[C[oó]d:\s*([^\]]+)\]/i);
  return match ? normalizeItemCode(match[1]) : '';
}

export function stripItemCodeTag(description: string | null | undefined): string {
  return (description ?? '').replace(ITEM_CODE_TAG_RE, ' ').replace(/\s+\n/g, '\n').trim();
}

export function resolveSiteProductItemCode(rawItemCode: unknown, description: unknown): string {
  const col = normalizeItemCode(
    rawItemCode !== null && rawItemCode !== undefined ? String(rawItemCode) : ''
  );
  if (col) return col;
  return extractItemCodeTag(
    description !== null && description !== undefined ? String(description) : ''
  );
}

export function embedItemCodeInDescription(description: string, itemCode: string): string {
  const cleanDesc = stripItemCodeTag(description);
  const code = normalizeItemCode(itemCode);
  if (!code) return cleanDesc;
  return cleanDesc ? `${cleanDesc}\n[Cód: ${code}]` : `[Cód: ${code}]`;
}

export function isMissingItemCodeColumnError(
  error: { message?: string | null; code?: string | null } | null | undefined
): boolean {
  if (!error) return false;
  const msg = (error.message ?? '').toLowerCase();
  return (
    msg.includes('item_code') &&
    (error.code === '42703' ||
      error.code === 'PGRST204' ||
      msg.includes('does not exist') ||
      msg.includes('schema cache') ||
      msg.includes('could not find'))
  );
}

export function isMissingSiteProductsTableError(
  error: { message?: string | null; code?: string | null } | null | undefined
): boolean {
  if (!error) return false;
  const msg = (error.message ?? '').toLowerCase();
  return (
    error.code === '42P01' ||
    error.code === 'PGRST205' ||
    (msg.includes('site_products') &&
      (msg.includes('does not exist') || msg.includes('schema cache') || msg.includes('could not find')))
  );
}

export function filterSiteProducts(
  items: SiteProductRow[],
  filters: {
    search?: string;
    category?: SiteCategoryId | 'all';
    status?: 'all' | 'active' | 'hidden' | 'featured' | 'priced' | 'coded' | 'no_code';
  }
): SiteProductRow[] {
  const q = (filters.search ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

  return items.filter(item => {
    if (filters.category && filters.category !== 'all' && item.category_id !== filters.category) {
      return false;
    }
    if (filters.status === 'active' && !item.active) return false;
    if (filters.status === 'hidden' && item.active) return false;
    if (filters.status === 'featured' && !item.featured) return false;
    if (filters.status === 'priced' && (item.price === null || item.price <= 0)) return false;
    if (filters.status === 'coded' && !normalizeItemCode(item.item_code)) return false;
    if (filters.status === 'no_code' && Boolean(normalizeItemCode(item.item_code))) return false;

    if (q) {
      const hay = `${item.item_code} ${item.title} ${item.slug} ${item.brand} ${item.specs} ${item.category_label} ${item.description}`
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function escapeCsv(v: unknown): string {
  const str = v === null || v === undefined ? '' : String(v);
  if (!str) return '';
  if (str.includes(';') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function buildSiteCatalogCsv(items: SiteProductRow[]): string {
  const BOM = '\uFEFF';
  const header = [
    'Código',
    'Slug',
    'Título',
    'Categoria',
    'Marca',
    'Especificação',
    'Preço',
    'Destaque',
    'Publicado',
    'Imagem',
    'Descrição',
  ];
  const rows = items.map(item =>
    [
      escapeCsv(item.item_code),
      escapeCsv(item.slug),
      escapeCsv(item.title),
      escapeCsv(item.category_label),
      escapeCsv(item.brand),
      escapeCsv(item.specs),
      escapeCsv(item.price !== null ? item.price.toFixed(2).replace('.', ',') : 'Sob consulta'),
      escapeCsv(item.featured ? 'Sim' : 'Não'),
      escapeCsv(item.active ? 'Sim' : 'Não'),
      escapeCsv(item.image_url),
      escapeCsv(item.description),
    ].join(';')
  );
  return BOM + header.join(';') + '\n' + rows.join('\n');
}
