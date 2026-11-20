export type SiteVisitActivity = 'corretivo' | 'sanitizacao' | 'projeto_instalacao';
export type SiteVisitStatus =
  | 'novo'
  | 'em_contato'
  | 'agendado'
  | 'convertido_os'
  | 'concluido'
  | 'cancelado';
export type SiteVisitUrgency = 'alta' | 'media' | 'baixa';

export interface SiteVisitRequestRow {
  id: string;
  protocol_code: string;
  activity_type: SiteVisitActivity;
  status: SiteVisitStatus;
  urgency: SiteVisitUrgency;
  customer_name: string;
  company_name: string;
  phone: string;
  phone_digits: string;
  city: string;
  address: string;
  preferred_date: string | null;
  preferred_period: string;
  questionnaire: Record<string, unknown>;
  summary_text: string;
  internal_notes: string;
  converted_customer_id: string | null;
  converted_order_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CustomerLookupRecord {
  id: string;
  name: string;
  phone?: string | null;
  whatsapp?: string | null;
  city?: string | null;
}

export const SITE_VISIT_ACTIVITY_LABELS: Record<SiteVisitActivity, string> = {
  corretivo: 'Chamado Corretivo',
  sanitizacao: 'Sanitização / Assepsia',
  projeto_instalacao: 'Projeto e Instalação',
};

export const SITE_VISIT_STATUS_META: Record<
  SiteVisitStatus,
  { label: string; badgeClass: string }
> = {
  novo: { label: 'Novo', badgeClass: 'bg-sky-100 text-sky-800 border-sky-200' },
  em_contato: { label: 'Em Contato', badgeClass: 'bg-amber-100 text-amber-800 border-amber-200' },
  agendado: { label: 'Agendado', badgeClass: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
  convertido_os: {
    label: 'Convertido em OS',
    badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  },
  concluido: { label: 'Concluído', badgeClass: 'bg-green-100 text-green-800 border-green-200' },
  cancelado: { label: 'Cancelado', badgeClass: 'bg-slate-100 text-slate-600 border-slate-200' },
};

export const SITE_VISIT_URGENCY_META: Record<
  SiteVisitUrgency,
  { label: string; badgeClass: string }
> = {
  alta: { label: 'Urgente', badgeClass: 'bg-red-100 text-red-700 border-red-200' },
  media: { label: 'Média', badgeClass: 'bg-amber-100 text-amber-800 border-amber-200' },
  baixa: { label: 'Normal', badgeClass: 'bg-slate-100 text-slate-700 border-slate-200' },
};

export const SERVICE_REQUESTS_SETUP_SQL = `-- Execute uma única vez no SQL Editor do Supabase (Refrimaq Connect)
CREATE TABLE IF NOT EXISTS public.service_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol_code text NOT NULL UNIQUE,
  activity_type text NOT NULL CHECK (activity_type IN ('corretivo', 'sanitizacao', 'projeto_instalacao')),
  status text NOT NULL DEFAULT 'novo' CHECK (status IN ('novo', 'em_contato', 'agendado', 'convertido_os', 'concluido', 'cancelado')),
  urgency text NOT NULL DEFAULT 'media' CHECK (urgency IN ('alta', 'media', 'baixa')),
  customer_name text NOT NULL,
  company_name text NOT NULL DEFAULT '',
  phone text NOT NULL,
  phone_digits text NOT NULL,
  city text NOT NULL,
  address text NOT NULL DEFAULT '',
  preferred_date date,
  preferred_period text NOT NULL DEFAULT 'qualquer',
  questionnaire jsonb NOT NULL DEFAULT '{}'::jsonb,
  summary_text text NOT NULL DEFAULT '',
  internal_notes text NOT NULL DEFAULT '',
  converted_customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  converted_order_id uuid REFERENCES public.service_orders(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_service_requests_status_created
  ON public.service_requests (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_service_requests_activity
  ON public.service_requests (activity_type);
CREATE INDEX IF NOT EXISTS idx_service_requests_phone_digits
  ON public.service_requests (phone_digits);

ALTER TABLE public.service_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_requests_anon_insert" ON public.service_requests;
CREATE POLICY "service_requests_anon_insert"
  ON public.service_requests FOR INSERT TO anon
  WITH CHECK (
    length(trim(customer_name)) >= 2
    AND length(trim(phone_digits)) >= 10
    AND length(trim(city)) >= 2
  );

DROP POLICY IF EXISTS "service_requests_auth_select" ON public.service_requests;
CREATE POLICY "service_requests_auth_select"
  ON public.service_requests FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "service_requests_auth_insert" ON public.service_requests;
CREATE POLICY "service_requests_auth_insert"
  ON public.service_requests FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "service_requests_auth_update" ON public.service_requests;
CREATE POLICY "service_requests_auth_update"
  ON public.service_requests FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_requests_auth_delete" ON public.service_requests;
CREATE POLICY "service_requests_auth_delete"
  ON public.service_requests FOR DELETE TO authenticated USING (true);`;

export function normalizeVisitPhoneDigits(raw: string | null | undefined): string {
  const digits = (raw ?? '').replace(/\D/g, '');
  if (digits.length > 11 && digits.startsWith('55')) {
    return digits.slice(2, 13);
  }
  return digits.slice(0, 11);
}

export function isMissingServiceRequestsTableError(
  error: { code?: string; message?: string } | null | undefined
): boolean {
  if (!error) return false;
  const msg = (error.message ?? '').toLowerCase();
  return (
    error.code === '42P01' ||
    error.code === 'PGRST205' ||
    msg.includes("could not find the table 'public.service_requests'") ||
    msg.includes('relation "public.service_requests" does not exist') ||
    msg.includes('relation "service_requests" does not exist')
  );
}

export function mapActivityToOsVisitType(
  activity: SiteVisitActivity
): 'Corretiva' | 'Assepsia' | 'Instalação' {
  if (activity === 'corretivo') return 'Corretiva';
  if (activity === 'sanitizacao') return 'Assepsia';
  return 'Instalação';
}

export function mapUrgencyToOsPriority(urgency: SiteVisitUrgency): 'Alta' | 'Média' | 'Baixa' {
  if (urgency === 'alta') return 'Alta';
  if (urgency === 'baixa') return 'Baixa';
  return 'Média';
}

export function formatVisitDateBr(isoDate: string | null | undefined): string {
  if (!isoDate) return '—';
  const match = isoDate.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return isoDate;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

export function formatPeriodPtBr(period: string | null | undefined): string {
  if (period === 'manha') return 'Manhã (08h–12h)';
  if (period === 'tarde') return 'Tarde (13h30–18h)';
  return 'Qualquer horário';
}

export function findMatchingCustomerByPhone(
  customers: CustomerLookupRecord[],
  phoneOrDigits: string
): CustomerLookupRecord | null {
  const target = normalizeVisitPhoneDigits(phoneOrDigits);
  if (target.length < 10) return null;

  for (const c of customers) {
    const p1 = normalizeVisitPhoneDigits(c.whatsapp);
    const p2 = normalizeVisitPhoneDigits(c.phone);
    if ((p1 && p1 === target) || (p2 && p2 === target)) {
      return c;
    }
  }
  return null;
}

export function extractEquipmentFromVisit(visit: SiteVisitRequestRow): {
  equip_type: string;
  equip_brand: string;
  equip_voltage: string;
} {
  const q = visit.questionnaire ?? {};
  if (visit.activity_type === 'corretivo') {
    const voltageRaw = String(q.voltage ?? '');
    return {
      equip_type: String(q.equipment ?? 'Chopeira'),
      equip_brand: String(q.brandModel ?? ''),
      equip_voltage: voltageRaw && voltageRaw !== 'Não sei' ? voltageRaw : '',
    };
  }
  if (visit.activity_type === 'sanitizacao') {
    const count = String(q.equipmentCount ?? '1');
    const taps = String(q.tapsRange ?? '');
    return {
      equip_type: `Sanitização (${count} equip.${taps ? ` · ${taps}` : ''})`,
      equip_brand: '',
      equip_voltage: '',
    };
  }
  return {
    equip_type: String(q.projectType ?? 'Projeto / Instalação'),
    equip_brand: '',
    equip_voltage: '',
  };
}

export function buildOsDiagnosisFromVisit(visit: SiteVisitRequestRow): string {
  const lines: string[] = [
    `[Agendamento pelo Site · Protocolo ${visit.protocol_code}]`,
    `Atividade: ${SITE_VISIT_ACTIVITY_LABELS[visit.activity_type] ?? visit.activity_type}`,
  ];
  if (visit.preferred_date) {
    lines.push(
      `Preferência informada: ${formatVisitDateBr(visit.preferred_date)} (${formatPeriodPtBr(visit.preferred_period)})`
    );
  }
  if (visit.summary_text?.trim()) {
    lines.push('');
    lines.push(visit.summary_text.trim());
  }
  if (visit.internal_notes?.trim()) {
    lines.push('');
    lines.push(`Obs. internas: ${visit.internal_notes.trim()}`);
  }
  return lines.join('\n');
}

export function formatQuestionnaireHighlights(visit: SiteVisitRequestRow): string[] {
  const q = visit.questionnaire ?? {};
  const badges: string[] = [];

  if (visit.activity_type === 'corretivo') {
    if (q.equipment) badges.push(String(q.equipment));
    if (Array.isArray(q.symptoms) && q.symptoms.length > 0) {
      badges.push((q.symptoms as string[]).join(' · '));
    }
    if (q.brandModel) badges.push(String(q.brandModel));
    if (q.voltage && q.voltage !== 'Não sei') badges.push(String(q.voltage));
  } else if (visit.activity_type === 'sanitizacao') {
    if (q.placeType) badges.push(String(q.placeType));
    if (q.equipmentCount) badges.push(`${String(q.equipmentCount)} equipamento(s)`);
    if (q.tapsRange) badges.push(String(q.tapsRange));
    if (q.lastSanitization) badges.push(`Última: ${String(q.lastSanitization)}`);
    if (q.frequency) badges.push(String(q.frequency));
  } else {
    if (q.projectType) badges.push(String(q.projectType));
    if (q.environmentType) badges.push(String(q.environmentType));
    if (q.hasEquipment) badges.push(String(q.hasEquipment));
    if (q.pointsRange) badges.push(String(q.pointsRange));
    if (q.timeline) badges.push(String(q.timeline));
  }

  return badges;
}

function normalizeSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function filterSiteVisits(
  visits: SiteVisitRequestRow[],
  options: {
    search?: string;
    activity?: 'all' | SiteVisitActivity;
    status?: 'all' | SiteVisitStatus;
  }
): SiteVisitRequestRow[] {
  const q = normalizeSearch(options.search ?? '');
  const activity = options.activity ?? 'all';
  const status = options.status ?? 'all';

  return visits.filter(v => {
    if (activity !== 'all' && v.activity_type !== activity) return false;
    if (status !== 'all' && v.status !== status) return false;
    if (!q) return true;
    const hay = normalizeSearch(
      `${v.protocol_code} ${v.customer_name} ${v.company_name} ${v.city} ${v.phone} ${v.phone_digits} ${v.summary_text}`
    );
    return hay.includes(q);
  });
}

export function computeSiteVisitsStats(visits: SiteVisitRequestRow[]) {
  let novos = 0;
  let urgentes = 0;
  let corretivos = 0;
  let sanitizacoes = 0;
  let projetos = 0;

  for (const v of visits) {
    if (v.status === 'novo') novos++;
    if (v.urgency === 'alta' && v.status !== 'concluido' && v.status !== 'cancelado') urgentes++;
    if (v.activity_type === 'corretivo') corretivos++;
    else if (v.activity_type === 'sanitizacao') sanitizacoes++;
    else if (v.activity_type === 'projeto_instalacao') projetos++;
  }

  return { total: visits.length, novos, urgentes, corretivos, sanitizacoes, projetos };
}

export function buildClientWhatsAppReplyUrl(visit: SiteVisitRequestRow): string {
  const digits = normalizeVisitPhoneDigits(visit.phone_digits || visit.phone);
  const fullPhone = digits.startsWith('55') ? digits : `55${digits}`;
  const activityLabel = SITE_VISIT_ACTIVITY_LABELS[visit.activity_type] ?? visit.activity_type;
  const msg = [
    `Olá, ${visit.customer_name}! Aqui é da equipe técnica da Refrimaq.`,
    `Recebemos sua solicitação de ${activityLabel} pelo site (Protocolo ${visit.protocol_code}).`,
    'Podemos confirmar o melhor horário para a visita técnica?',
  ].join('\n');
  return `https://wa.me/${fullPhone}?text=${encodeURIComponent(msg)}`;
}

function escapeCsvCell(value: string): string {
  const clean = value.replace(/\r?\n/g, ' | ');
  if (clean.includes(';') || clean.includes('"')) {
    return `"${clean.replace(/"/g, '""')}"`;
  }
  return clean;
}

export function buildSiteVisitsCsv(visits: SiteVisitRequestRow[]): string {
  const header = [
    'Protocolo',
    'Data Registro',
    'Atividade',
    'Status',
    'Urgência',
    'Cliente',
    'Empresa',
    'Telefone',
    'Cidade',
    'Endereço',
    'Data Preferencial',
    'Turno',
    'Resumo Triagem',
  ];

  const rows = visits.map(v => [
    v.protocol_code,
    v.created_at,
    SITE_VISIT_ACTIVITY_LABELS[v.activity_type] ?? v.activity_type,
    SITE_VISIT_STATUS_META[v.status]?.label ?? v.status,
    SITE_VISIT_URGENCY_META[v.urgency]?.label ?? v.urgency,
    v.customer_name,
    v.company_name,
    v.phone,
    v.city,
    v.address,
    formatVisitDateBr(v.preferred_date),
    formatPeriodPtBr(v.preferred_period),
    v.summary_text,
  ]);

  const lines = [header, ...rows].map(cols => cols.map(c => escapeCsvCell(String(c ?? ''))).join(';'));
  return '\uFEFF' + lines.join('\r\n');
}
