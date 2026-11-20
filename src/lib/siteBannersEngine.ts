export type SiteBannerMode = 'editorial' | 'artwork';
export type SiteBannerThemePreset = 'default' | 'black_friday' | 'natal' | 'promocao' | 'verao';
export type SiteBannerActionType =
  | 'catalog'
  | 'category'
  | 'product'
  | 'service_visit'
  | 'whatsapp'
  | 'url';

export type BannerScheduleStatus = 'live' | 'scheduled' | 'expired' | 'inactive';

export interface SiteBannerRow {
  id: string;
  name: string;
  mode: SiteBannerMode;
  theme_preset: SiteBannerThemePreset;
  eyebrow: string;
  headline: string;
  subtitle: string;
  badge_text: string;
  announcement_bar: string;
  cta_label: string;
  secondary_cta_label: string;
  action_type: SiteBannerActionType;
  action_value: string;
  desktop_image_url: string;
  mobile_image_url: string;
  image_alt: string;
  featured_product_slugs: string[];
  starts_on: string | null;
  ends_on: string | null;
  sort_order: number;
  active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface BannerThemePresetMeta {
  id: SiteBannerThemePreset;
  label: string;
  sectionBg: string;
  accentBg: string;
  badgeBg: string;
  badgeText: string;
  description: string;
}

export const BANNER_THEME_PRESETS: BannerThemePresetMeta[] = [
  {
    id: 'default',
    label: 'Institucional Refrimaq',
    sectionBg: '#0D1014',
    accentBg: '#0B4F9C',
    badgeBg: 'rgba(11, 79, 156, 0.30)',
    badgeText: '#DBEAFE',
    description: 'Grafite industrial + azul cobalto oficial',
  },
  {
    id: 'black_friday',
    label: 'Black Friday',
    sectionBg: '#09090B',
    accentBg: '#D97706',
    badgeBg: 'rgba(217, 119, 6, 0.25)',
    badgeText: '#FDE68A',
    description: 'Carbono profundo + destaque dourado/âmbar',
  },
  {
    id: 'natal',
    label: 'Natal / Festas',
    sectionBg: '#121318',
    accentBg: '#B91C1C',
    badgeBg: 'rgba(185, 28, 28, 0.30)',
    badgeText: '#FECACA',
    description: 'Grafite escuro + bordô festivo de alto contraste',
  },
  {
    id: 'promocao',
    label: 'Promoção / Oferta',
    sectionBg: '#0A1628',
    accentBg: '#C2410C',
    badgeBg: 'rgba(234, 88, 12, 0.28)',
    badgeText: '#FED7AA',
    description: 'Azul marinho + laranja comercial vibrante',
  },
  {
    id: 'verao',
    label: 'Verão / Chopp Gelado',
    sectionBg: '#0B1520',
    accentBg: '#0369A1',
    badgeBg: 'rgba(2, 132, 199, 0.28)',
    badgeText: '#BAE6FD',
    description: 'Ardósia + azul glacial refrescante',
  },
];

export const BANNER_ACTION_LABELS: Record<SiteBannerActionType, string> = {
  catalog: 'Ir para o Catálogo Completo',
  category: 'Filtrar uma Categoria',
  product: 'Abrir Produto Específico',
  service_visit: 'Abrir Agendamento de Visita Técnica',
  whatsapp: 'Abrir WhatsApp da Refrimaq',
  url: 'Abrir Link Personalizado',
};

export interface BannerFormDraft {
  id: string;
  name: string;
  mode: SiteBannerMode;
  theme_preset: SiteBannerThemePreset;
  eyebrow: string;
  headline: string;
  subtitle: string;
  badge_text: string;
  announcement_bar: string;
  cta_label: string;
  secondary_cta_label: string;
  action_type: SiteBannerActionType;
  action_value: string;
  desktop_image_url: string;
  mobile_image_url: string;
  image_alt: string;
  starts_on: string;
  ends_on: string;
  sort_order: string;
  active: boolean;
}

export const BLANK_BANNER_DRAFT: BannerFormDraft = {
  id: '',
  name: '',
  mode: 'editorial',
  theme_preset: 'default',
  eyebrow: 'Representante exclusiva Memo no RS · Assistência técnica',
  headline: '',
  subtitle: '',
  badge_text: '',
  announcement_bar: '',
  cta_label: 'Ver ofertas',
  secondary_cta_label: 'Falar no WhatsApp',
  action_type: 'catalog',
  action_value: '',
  desktop_image_url: '',
  mobile_image_url: '',
  image_alt: '',
  starts_on: '',
  ends_on: '',
  sort_order: '1',
  active: true,
};

export const BANNER_QUICK_TEMPLATES: {
  key: string;
  label: string;
  draft: Partial<BannerFormDraft>;
}[] = [
  {
    key: 'black_friday',
    label: '+ Black Friday',
    draft: {
      name: 'Black Friday Refrimaq',
      mode: 'editorial',
      theme_preset: 'black_friday',
      badge_text: 'BLACK FRIDAY · CONDIÇÕES ESPECIAIS',
      eyebrow: 'Linha oficial Memo · Estoque promocional',
      headline: 'Black Friday em chopeiras elétricas e torres Memo',
      subtitle:
        'Descontos exclusivos à vista e parcelamento em até 10x sem juros com entrega para todo o Brasil.',
      announcement_bar: 'Black Friday Refrimaq: condições especiais em chopeiras e torres · Ver ofertas',
      cta_label: 'Ver chopeiras em oferta',
      secondary_cta_label: 'Cotar no WhatsApp',
      action_type: 'category',
      action_value: 'chopeiras-eletricas',
    },
  },
  {
    key: 'natal',
    label: '+ Natal / Festas',
    draft: {
      name: 'Campanha de Natal Refrimaq',
      mode: 'editorial',
      theme_preset: 'natal',
      badge_text: 'ESPECIAL DE FIM DE ANO',
      eyebrow: 'Chopp gelado para confraternizações e festas',
      headline: 'Prepare seu espaço para o Natal e Ano Novo',
      subtitle:
        'Chopeiras residenciais, torres de chopp e agendamento de sanitização preventiva para as festas.',
      announcement_bar: 'Especial de Fim de Ano Refrimaq · Garanta sua chopeira ou assepsia antes das festas',
      cta_label: 'Explorar linha festiva',
      secondary_cta_label: 'Falar no WhatsApp',
      action_type: 'catalog',
      action_value: '',
    },
  },
  {
    key: 'promocao',
    label: '+ Promoção / Oferta',
    draft: {
      name: 'Promoção Especial Refrimaq',
      mode: 'editorial',
      theme_preset: 'promocao',
      badge_text: 'OFERTA POR TEMPO LIMITADO',
      eyebrow: 'Representante oficial Memo no RS',
      headline: 'Condições especiais em torres e pré-resfriadores',
      subtitle:
        'Equipe seu bar, restaurante ou área gourmet com peças originais, garantia e suporte técnico próprio.',
      announcement_bar: '',
      cta_label: 'Conferir oferta',
      secondary_cta_label: 'Solicitar orçamento',
      action_type: 'category',
      action_value: 'torres',
    },
  },
  {
    key: 'artwork',
    label: '+ Arte Pronta (Canva)',
    draft: {
      name: 'Banner Arte Promocional',
      mode: 'artwork',
      theme_preset: 'default',
      badge_text: '',
      eyebrow: '',
      headline: '',
      subtitle: '',
      announcement_bar: '',
      cta_label: 'Ver campanha',
      secondary_cta_label: '',
      action_type: 'catalog',
      action_value: '',
    },
  },
];

export const SITE_BANNERS_SETUP_SQL = `-- Execute uma única vez no SQL Editor do Supabase (Refrimaq Connect)
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
  ON public.site_banners FOR SELECT TO anon USING (active = true);

DROP POLICY IF EXISTS "site_banners_auth_select" ON public.site_banners;
CREATE POLICY "site_banners_auth_select"
  ON public.site_banners FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "site_banners_auth_insert" ON public.site_banners;
CREATE POLICY "site_banners_auth_insert"
  ON public.site_banners FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "site_banners_auth_update" ON public.site_banners;
CREATE POLICY "site_banners_auth_update"
  ON public.site_banners FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "site_banners_auth_delete" ON public.site_banners;
CREATE POLICY "site_banners_auth_delete"
  ON public.site_banners FOR DELETE TO authenticated USING (true);`;

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function getLocalTodayIso(reference: Date = new Date()): string {
  const y = reference.getFullYear();
  const m = String(reference.getMonth() + 1).padStart(2, '0');
  const d = String(reference.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function compareIsoDates(a: string, b: string): number {
  const ma = a.match(ISO_DATE_RE);
  const mb = b.match(ISO_DATE_RE);
  if (!ma || !mb) return a.localeCompare(b);
  const ka = Number(ma[1]) * 10000 + Number(ma[2]) * 100 + Number(ma[3]);
  const kb = Number(mb[1]) * 10000 + Number(mb[2]) * 100 + Number(mb[3]);
  return ka < kb ? -1 : ka > kb ? 1 : 0;
}

export function formatBannerDateBr(iso: string | null | undefined): string {
  if (!iso) return '—';
  const m = iso.trim().match(ISO_DATE_RE);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

export function getBannerScheduleStatus(
  banner: Pick<SiteBannerRow, 'active' | 'starts_on' | 'ends_on'>,
  todayIso: string = getLocalTodayIso()
): BannerScheduleStatus {
  if (!banner.active) return 'inactive';
  if (banner.starts_on && ISO_DATE_RE.test(banner.starts_on)) {
    if (compareIsoDates(todayIso, banner.starts_on) < 0) return 'scheduled';
  }
  if (banner.ends_on && ISO_DATE_RE.test(banner.ends_on)) {
    if (compareIsoDates(todayIso, banner.ends_on) > 0) return 'expired';
  }
  return 'live';
}

export function getBannerThemePresetMeta(preset: SiteBannerThemePreset): BannerThemePresetMeta {
  return BANNER_THEME_PRESETS.find(t => t.id === preset) ?? BANNER_THEME_PRESETS[0];
}

export function validateBannerDraft(draft: BannerFormDraft): string | null {
  if (draft.name.trim().length < 2) {
    return 'Informe um nome interno para identificar esta campanha (ex.: Black Friday 2026).';
  }
  if (draft.mode === 'artwork' && !draft.desktop_image_url.trim()) {
    return 'No modo Arte Pronta, envie a imagem principal (Desktop) ou informe a URL da imagem.';
  }
  if (draft.mode === 'editorial' && draft.headline.trim().length < 3) {
    return 'No modo Editorial, informe o título principal que aparecerá no topo do site.';
  }
  if (draft.starts_on && draft.ends_on && compareIsoDates(draft.ends_on, draft.starts_on) < 0) {
    return 'A data de término não pode ser anterior à data de início.';
  }
  if (draft.action_type === 'url' && !draft.action_value.trim()) {
    return 'Informe a URL ou âncora de destino para a ação de link personalizado.';
  }
  return null;
}

export function isMissingSiteBannersTableError(
  error: { code?: string; message?: string } | null | undefined
): boolean {
  if (!error) return false;
  const msg = (error.message ?? '').toLowerCase();
  return (
    error.code === '42P01' ||
    error.code === 'PGRST205' ||
    msg.includes("could not find the table 'public.site_banners'") ||
    msg.includes('relation "public.site_banners" does not exist') ||
    msg.includes('relation "site_banners" does not exist')
  );
}
