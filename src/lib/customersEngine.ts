export type CustomerContactStatus = 'green' | 'yellow' | 'red' | 'gray';
export type CustomerSortBy = 'name_asc' | 'oldest_contact' | 'newest_created';
export type CustomerGpsFilter = 'all' | 'with_gps' | 'without_gps';

export interface CustomerLike {
  id: string;
  name: string;
  phone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
  document?: string | null;
  notes?: string | null;
  last_contact_at?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  equipment_types?: string[] | null;
  segment?: string | null;
  created_at?: string | null;
}

export interface CustomerMetrics {
  total: number;
  green: number;
  yellow: number;
  red: number;
  gray: number;
}

export interface CustomerListFilters {
  search?: string;
  status?: CustomerContactStatus | 'all';
  city?: string;
  segment?: string;
  gps?: CustomerGpsFilter;
  sortBy?: CustomerSortBy;
}

export interface CustomerDuplicateMatch<T extends CustomerLike = CustomerLike> {
  customer: T;
  reasons: string[];
}

export interface CustomerDependencyCounts {
  serviceOrders: number;
  sales: number;
  budgets: number;
  boletos: number;
  routeStops: number;
  equipments: number;
}

export interface BlockedCustomerSummary {
  customerId: string;
  customerName: string;
  counts: CustomerDependencyCounts;
  totalLinks: number;
  reasons: string[];
}

export interface CustomerDeletionAnalysis {
  blocked: BlockedCustomerSummary[];
  deletableIds: string[];
}

export const CONTACT_RECENCY_THRESHOLDS = {
  greenMaxDays: 90,
  yellowMaxDays: 180,
} as const;

const MS_PER_DAY = 1000 * 60 * 60 * 24;
const SEGMENT_TAG_REGEX = /^\[Segmento:\s*([^\]]+)\]\s*(?:\r?\n)?/i;
const PURE_DATE_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;

// ─── Contact Recency & Local Date/Time ────────────────────────────────────────

export function getCustomerContactStatus(
  lastContactAt: string | null | undefined,
  nowMs: number = Date.now()
): CustomerContactStatus {
  if (!lastContactAt) return 'gray';
  const ts = new Date(lastContactAt).getTime();
  if (!Number.isFinite(ts)) return 'gray';
  const rawDays = Math.floor((nowMs - ts) / MS_PER_DAY);
  const days = Math.max(0, rawDays);
  if (days <= CONTACT_RECENCY_THRESHOLDS.greenMaxDays) return 'green';
  if (days <= CONTACT_RECENCY_THRESHOLDS.yellowMaxDays) return 'yellow';
  return 'red';
}

export function getCustomerStatusLabel(status: CustomerContactStatus): string {
  const labels: Record<CustomerContactStatus, string> = {
    green: 'Em dia',
    yellow: 'Atenção',
    red: 'Urgente',
    gray: 'Novo',
  };
  return labels[status];
}

export function getCustomerStatusRangeLabel(
  status: CustomerContactStatus,
  compact = false
): string {
  if (compact) {
    const compactLabels: Record<CustomerContactStatus, string> = {
      green: 'Em dia (90d)',
      yellow: 'Atenção (91–180d)',
      red: 'Urgente (+180d)',
      gray: 'Novos',
    };
    return compactLabels[status];
  }
  const fullLabels: Record<CustomerContactStatus, string> = {
    green: 'Em dia (até 90 dias)',
    yellow: 'Atenção (91–180 dias)',
    red: 'Urgente (+180 dias)',
    gray: 'Novos (sem contato)',
  };
  return fullLabels[status];
}

export function formatDaysSince(
  dateStr: string | null | undefined,
  nowMs: number = Date.now()
): string {
  if (!dateStr) return 'Nunca';
  const ts = new Date(dateStr).getTime();
  if (!Number.isFinite(ts)) return 'Nunca';
  const days = Math.floor((nowMs - ts) / MS_PER_DAY);
  if (days <= 0) return 'Hoje';
  if (days === 1) return 'Ontem';
  return `${days} dias atrás`;
}

/**
 * Formats pure YYYY-MM-DD dates without UTC shift (-1 day in Brazil) and
 * ISO timestamps in pt-BR local date.
 */
export function formatLocalDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const trimmed = dateStr.trim();
  const pureMatch = trimmed.match(PURE_DATE_REGEX);
  if (pureMatch) {
    const [, year, month, day] = pureMatch;
    return `${day}/${month}/${year}`;
  }
  const parsed = new Date(trimmed);
  if (!Number.isFinite(parsed.getTime())) return '—';
  return parsed.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function formatLocalDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const trimmed = dateStr.trim();
  if (PURE_DATE_REGEX.test(trimmed)) {
    return formatLocalDate(trimmed);
  }
  const parsed = new Date(trimmed);
  if (!Number.isFinite(parsed.getTime())) return '—';
  return parsed.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Formats a Date into `YYYY-MM-DDTHH:mm` using LOCAL wall-clock time
 * (suitable for `<input type="datetime-local">`).
 */
export function toLocalDateTimeInput(date: Date = new Date()): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}T${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

/**
 * Converts a `<input type="datetime-local">` value (`YYYY-MM-DDTHH:mm`) interpreted
 * in the user's local timezone into an unambiguous UTC ISO-8601 string for Postgres `timestamptz`.
 */
export function localDateTimeInputToIso(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  // Already carries timezone info (Z or ±HH:MM)
  if (/(?:Z|[+-]\d{2}:?\d{2})$/i.test(trimmed)) {
    const d = new Date(trimmed);
    return Number.isFinite(d.getTime()) ? d.toISOString() : null;
  }

  const m = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) {
    const fallback = new Date(trimmed);
    return Number.isFinite(fallback.getTime()) ? fallback.toISOString() : null;
  }
  const [, y, mo, d, h, mi, s] = m;
  const local = new Date(
    Number(y),
    Number(mo) - 1,
    Number(d),
    Number(h),
    Number(mi),
    Number(s ?? '0'),
    0
  );
  if (!Number.isFinite(local.getTime())) return null;
  return local.toISOString();
}

export function getLocalTodayFileStamp(date: Date = new Date()): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

// ─── Segment & Schema-Safe Persistence ────────────────────────────────────────

export function extractCustomerSegment(
  customer: { segment?: string | null; notes?: string | null } | null | undefined
): string {
  if (!customer) return '';
  const direct = (customer.segment ?? '').trim();
  if (direct) return direct;
  const notes = customer.notes ?? '';
  const match = notes.match(SEGMENT_TAG_REGEX);
  return match ? match[1].trim() : '';
}

export function stripSegmentTagFromNotes(notes: string | null | undefined): string {
  if (!notes) return '';
  return notes.replace(SEGMENT_TAG_REGEX, '').trim();
}

export function composeNotesWithSegment(
  notes: string | null | undefined,
  segment: string | null | undefined
): string {
  const cleanNotes = stripSegmentTagFromNotes(notes);
  const cleanSegment = (segment ?? '').trim();
  if (!cleanSegment) return cleanNotes;
  return cleanNotes
    ? `[Segmento: ${cleanSegment}]\n${cleanNotes}`
    : `[Segmento: ${cleanSegment}]`;
}

export function hasSchemaColumn(row: unknown, column: string): boolean {
  return Boolean(row && typeof row === 'object' && Object.prototype.hasOwnProperty.call(row, column));
}

export function isMissingColumnSchemaError(
  error: { message?: string | null; details?: string | null; code?: string | null } | null | undefined,
  columnName: string
): boolean {
  if (!error) return false;
  const combined = `${error.message ?? ''} ${error.details ?? ''}`.toLowerCase();
  const col = columnName.toLowerCase();
  if (!combined.includes(col)) return false;
  return (
    combined.includes('schema cache') ||
    combined.includes('does not exist') ||
    combined.includes('could not find') ||
    error.code === 'PGRST204' ||
    error.code === '42703'
  );
}

export interface CustomerWriteInput {
  name: string;
  phone: string;
  whatsapp: string;
  email: string;
  address: string;
  city: string;
  state: string;
  zip_code: string;
  document: string;
  segment: string;
  notes: string;
  equipment_types: string[];
  latitude: number | null;
  longitude: number | null;
}

export interface CustomerWriteOptions {
  includeSegmentColumn: boolean;
  includeEquipmentTypesColumn: boolean;
}

export function buildCustomerWritePayload(
  input: CustomerWriteInput,
  options: CustomerWriteOptions
): Record<string, unknown> {
  const cleanSegment = input.segment.trim();
  const cleanNotes = stripSegmentTagFromNotes(input.notes);
  const payload: Record<string, unknown> = {
    name: input.name.trim(),
    phone: input.phone.trim(),
    whatsapp: input.whatsapp.trim(),
    email: input.email.trim(),
    address: input.address.trim(),
    city: input.city.trim(),
    state: input.state.trim().toUpperCase(),
    zip_code: input.zip_code.trim(),
    document: input.document.trim(),
    notes: options.includeSegmentColumn
      ? cleanNotes
      : composeNotesWithSegment(cleanNotes, cleanSegment),
    latitude: input.latitude,
    longitude: input.longitude,
  };

  if (options.includeSegmentColumn) {
    payload.segment = cleanSegment;
  }
  if (options.includeEquipmentTypesColumn) {
    payload.equipment_types = input.equipment_types;
  }

  return payload;
}

// ─── Normalization, Duplicate Check & Quick Links ─────────────────────────────

export function normalizeDigits(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\D/g, '');
}

export function normalizeSearchText(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function findPotentialCustomerDuplicates<T extends CustomerLike>(
  customers: T[],
  draft: { name?: string; document?: string; phone?: string; whatsapp?: string },
  excludeId?: string | null
): CustomerDuplicateMatch<T>[] {
  const draftName = normalizeSearchText(draft.name);
  const draftDoc = normalizeDigits(draft.document);
  const draftPhones = new Set<string>();
  const p1 = normalizeDigits(draft.phone);
  const p2 = normalizeDigits(draft.whatsapp);
  if (p1.length >= 10) draftPhones.add(p1.slice(-10));
  if (p2.length >= 10) draftPhones.add(p2.slice(-10));

  const matches: CustomerDuplicateMatch<T>[] = [];

  for (const c of customers) {
    if (excludeId && c.id === excludeId) continue;
    const reasons: string[] = [];

    if (draftDoc.length >= 11) {
      const cDoc = normalizeDigits(c.document);
      if (cDoc && cDoc === draftDoc) {
        reasons.push('Mesmo CPF/CNPJ');
      }
    }

    if (draftName.length >= 3) {
      const cName = normalizeSearchText(c.name);
      if (cName && cName === draftName) {
        reasons.push('Mesmo nome');
      }
    }

    if (draftPhones.size > 0) {
      const cp1 = normalizeDigits(c.phone);
      const cp2 = normalizeDigits(c.whatsapp);
      const phoneHit =
        (cp1.length >= 10 && draftPhones.has(cp1.slice(-10))) ||
        (cp2.length >= 10 && draftPhones.has(cp2.slice(-10)));
      if (phoneHit) {
        reasons.push('Mesmo telefone/WhatsApp');
      }
    }

    if (reasons.length > 0) {
      matches.push({ customer: c, reasons });
    }
  }

  return matches;
}

export function buildWhatsAppHref(
  customer: { whatsapp?: string | null; phone?: string | null } | null | undefined
): string | null {
  if (!customer) return null;
  const raw = (customer.whatsapp ?? '').trim() || (customer.phone ?? '').trim();
  const digits = normalizeDigits(raw);
  if (digits.length < 8) return null;
  const full = digits.startsWith('55') && digits.length >= 12 ? digits : `55${digits}`;
  return `https://wa.me/${full}`;
}

export function buildGoogleMapsHref(
  customer: {
    latitude?: number | null;
    longitude?: number | null;
    address?: string | null;
    city?: string | null;
    state?: string | null;
  } | null | undefined
): string | null {
  if (!customer) return null;
  if (
    typeof customer.latitude === 'number' &&
    typeof customer.longitude === 'number' &&
    Number.isFinite(customer.latitude) &&
    Number.isFinite(customer.longitude)
  ) {
    return `https://www.google.com/maps/search/?api=1&query=${customer.latitude},${customer.longitude}`;
  }
  const parts = [customer.address, customer.city, customer.state, 'Brasil']
    .map(p => (p ?? '').trim())
    .filter(Boolean);
  if (parts.length <= 1) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(parts.join(', '))}`;
}

// ─── Filtering, Sorting & Metrics ─────────────────────────────────────────────

export function computeCustomerMetrics(
  customers: CustomerLike[],
  nowMs: number = Date.now()
): CustomerMetrics {
  const m: CustomerMetrics = { total: customers.length, green: 0, yellow: 0, red: 0, gray: 0 };
  for (const c of customers) {
    m[getCustomerContactStatus(c.last_contact_at, nowMs)]++;
  }
  return m;
}

export function filterAndSortCustomers<T extends CustomerLike>(
  customers: T[],
  filters: CustomerListFilters,
  nowMs: number = Date.now()
): T[] {
  let list = [...customers];

  const searchTerm = (filters.search ?? '').trim();
  if (searchTerm) {
    const qNorm = normalizeSearchText(searchTerm);
    const qDigits = normalizeDigits(searchTerm);
    list = list.filter(c => {
      const segment = extractCustomerSegment(c);
      const textHit =
        normalizeSearchText(c.name).includes(qNorm) ||
        normalizeSearchText(c.email).includes(qNorm) ||
        normalizeSearchText(c.city).includes(qNorm) ||
        normalizeSearchText(c.address).includes(qNorm) ||
        normalizeSearchText(segment).includes(qNorm) ||
        normalizeSearchText(c.notes).includes(qNorm) ||
        normalizeSearchText(c.document).includes(qNorm) ||
        normalizeSearchText(c.phone).includes(qNorm) ||
        normalizeSearchText(c.whatsapp).includes(qNorm);

      if (textHit) return true;
      if (qDigits.length >= 3) {
        return (
          normalizeDigits(c.document).includes(qDigits) ||
          normalizeDigits(c.phone).includes(qDigits) ||
          normalizeDigits(c.whatsapp).includes(qDigits)
        );
      }
      return false;
    });
  }

  if (filters.status && filters.status !== 'all') {
    list = list.filter(c => getCustomerContactStatus(c.last_contact_at, nowMs) === filters.status);
  }

  if (filters.city && filters.city !== 'all') {
    const cityNorm = normalizeSearchText(filters.city);
    list = list.filter(c => normalizeSearchText(c.city) === cityNorm);
  }

  if (filters.segment && filters.segment !== 'all') {
    const segNorm = normalizeSearchText(filters.segment);
    list = list.filter(c => normalizeSearchText(extractCustomerSegment(c)) === segNorm);
  }

  if (filters.gps === 'with_gps') {
    list = list.filter(c => c.latitude !== null && c.latitude !== undefined && c.longitude !== null && c.longitude !== undefined);
  } else if (filters.gps === 'without_gps') {
    list = list.filter(c => c.latitude === null || c.latitude === undefined || c.longitude === null || c.longitude === undefined);
  }

  const sortBy = filters.sortBy ?? 'name_asc';
  list.sort((a, b) => {
    if (sortBy === 'oldest_contact') {
      // Prioritize customers never contacted or oldest contact first
      const ta = a.last_contact_at ? new Date(a.last_contact_at).getTime() : -Infinity;
      const tb = b.last_contact_at ? new Date(b.last_contact_at).getTime() : -Infinity;
      if (ta !== tb) return ta - tb;
      return (a.name || '').localeCompare(b.name || '', 'pt-BR');
    }
    if (sortBy === 'newest_created') {
      const ca = a.created_at ? new Date(a.created_at).getTime() : 0;
      const cb = b.created_at ? new Date(b.created_at).getTime() : 0;
      if (cb !== ca) return cb - ca;
      return (a.name || '').localeCompare(b.name || '', 'pt-BR');
    }
    return (a.name || '').localeCompare(b.name || '', 'pt-BR');
  });

  return list;
}

// ─── CSV PT-BR Export & Robust Import Helpers ─────────────────────────────────

export function coerceCellToString(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return '';
    return String(value).trim();
  }
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? getLocalTodayFileStamp(value) : '';
  }
  return String(value).trim();
}

function escapeCsvCell(value: unknown): string {
  const str = value === null || value === undefined ? '' : String(value);
  if (!str) return '';
  if (str.includes(';') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function buildCustomersCsv(customers: CustomerLike[]): string {
  const BOM = '\uFEFF';
  const header = [
    'Nome',
    'Telefone',
    'WhatsApp',
    'E-mail',
    'Segmento',
    'Endereço',
    'Cidade',
    'Estado',
    'CEP',
    'CPF/CNPJ',
    'Equipamentos',
    'Latitude',
    'Longitude',
    'Observações',
    'Último Contato',
    'Cadastro',
  ];

  const rows = customers.map(c => {
    const segment = extractCustomerSegment(c);
    const cleanNotes = stripSegmentTagFromNotes(c.notes);
    const equips = Array.isArray(c.equipment_types) ? c.equipment_types.join(', ') : '';
    return [
      escapeCsvCell(c.name),
      escapeCsvCell(c.phone),
      escapeCsvCell(c.whatsapp),
      escapeCsvCell(c.email),
      escapeCsvCell(segment),
      escapeCsvCell(c.address),
      escapeCsvCell(c.city),
      escapeCsvCell(c.state),
      escapeCsvCell(c.zip_code),
      escapeCsvCell(c.document),
      escapeCsvCell(equips),
      escapeCsvCell(c.latitude ?? ''),
      escapeCsvCell(c.longitude ?? ''),
      escapeCsvCell(cleanNotes),
      escapeCsvCell(c.last_contact_at ? formatLocalDate(c.last_contact_at) : ''),
      escapeCsvCell(c.created_at ? formatLocalDate(c.created_at) : ''),
    ].join(';');
  });

  return BOM + header.join(';') + '\n' + rows.join('\n');
}

function detectCsvDelimiter(firstLine: string): string {
  let inQuotes = false;
  let tabs = 0;
  let semis = 0;
  let commas = 0;
  for (let i = 0; i < firstLine.length; i++) {
    const ch = firstLine[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (!inQuotes) {
      if (ch === '\t') tabs++;
      else if (ch === ';') semis++;
      else if (ch === ',') commas++;
    }
  }
  if (tabs >= semis && tabs >= commas && tabs > 0) return '\t';
  if (semis >= commas && semis > 0) return ';';
  return ',';
}

/**
 * RFC-4180 compliant CSV parser:
 * - Strips UTF-8 BOM (\uFEFF)
 * - Auto-detects `\t`, `;`, or `,`
 * - Supports escaped quotes (`""`) and multi-line quoted cells
 */
export function parseSpreadsheetCsv(rawText: string): string[][] {
  const text = rawText.replace(/^\uFEFF/, '').trim();
  if (!text) return [];

  const firstNewline = text.search(/\r?\n/);
  const firstLine = firstNewline === -1 ? text : text.slice(0, firstNewline);
  const delimiter = detectCsvDelimiter(firstLine);

  const rows: string[][] = [];
  let row: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && ch === delimiter) {
      row.push(current.trim());
      current = '';
      continue;
    }

    if (!inQuotes && (ch === '\n' || ch === '\r')) {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(current.trim());
      if (row.some(cell => cell !== '')) {
        rows.push(row);
      }
      row = [];
      current = '';
      continue;
    }

    current += ch;
  }

  row.push(current.trim());
  if (row.some(cell => cell !== '')) {
    rows.push(row);
  }

  return rows;
}

export function isSameCustomerImportMatch(
  existing: Pick<CustomerLike, 'name' | 'document' | 'email'>,
  incoming: { name?: string; document?: string; email?: string }
): boolean {
  const incDoc = normalizeDigits(incoming.document);
  const extDoc = normalizeDigits(existing.document);
  if (incDoc.length >= 11 && extDoc && incDoc === extDoc) return true;

  const incEmail = normalizeSearchText(incoming.email);
  const extEmail = normalizeSearchText(existing.email);
  if (incEmail && extEmail && incEmail === extEmail) return true;

  const incName = normalizeSearchText(incoming.name);
  const extName = normalizeSearchText(existing.name);
  if (incName && extName && incName === extName) return true;

  return false;
}

/**
 * Idempotently merges imported notes & segment without duplicating text on re-imports.
 */
export function mergeImportNotes(
  existingNotes: string | null | undefined,
  incomingNotes: string | null | undefined,
  segment: string | null | undefined,
  hasSegmentColumn: boolean
): string {
  const existingSeg = extractCustomerSegment({ notes: existingNotes });
  const baseExisting = stripSegmentTagFromNotes(existingNotes);
  const baseIncoming = stripSegmentTagFromNotes(incomingNotes);

  let mergedNotes = baseExisting;
  if (baseIncoming) {
    if (!baseExisting) {
      mergedNotes = baseIncoming;
    } else if (!normalizeSearchText(baseExisting).includes(normalizeSearchText(baseIncoming))) {
      mergedNotes = `${baseExisting}\n${baseIncoming}`;
    }
  }

  const finalSegment = (segment ?? '').trim() || existingSeg;
  if (hasSegmentColumn) {
    return mergedNotes;
  }
  return composeNotesWithSegment(mergedNotes, finalSegment);
}

// ─── Deletion Dependency Guard ────────────────────────────────────────────────

export function emptyDependencyCounts(): CustomerDependencyCounts {
  return {
    serviceOrders: 0,
    sales: 0,
    budgets: 0,
    boletos: 0,
    routeStops: 0,
    equipments: 0,
  };
}

export function summarizeCustomerDependencies(
  customerIds: string[],
  namesById: Record<string, string>,
  countsByCustomerId: Record<string, Partial<CustomerDependencyCounts>>
): CustomerDeletionAnalysis {
  const blocked: BlockedCustomerSummary[] = [];
  const deletableIds: string[] = [];

  for (const id of customerIds) {
    const raw = countsByCustomerId[id] ?? {};
    const counts: CustomerDependencyCounts = {
      serviceOrders: raw.serviceOrders ?? 0,
      sales: raw.sales ?? 0,
      budgets: raw.budgets ?? 0,
      boletos: raw.boletos ?? 0,
      routeStops: raw.routeStops ?? 0,
      equipments: raw.equipments ?? 0,
    };

    const reasons: string[] = [];
    if (counts.serviceOrders > 0) reasons.push(`${counts.serviceOrders} OS(s)`);
    if (counts.sales > 0) reasons.push(`${counts.sales} venda(s)`);
    if (counts.budgets > 0) reasons.push(`${counts.budgets} orçamento(s)`);
    if (counts.boletos > 0) reasons.push(`${counts.boletos} boleto(s)`);
    if (counts.routeStops > 0) reasons.push(`${counts.routeStops} parada(s) em rota`);
    if (counts.equipments > 0) reasons.push(`${counts.equipments} equipamento(s)`);

    const totalLinks =
      counts.serviceOrders +
      counts.sales +
      counts.budgets +
      counts.boletos +
      counts.routeStops +
      counts.equipments;

    if (totalLinks > 0) {
      blocked.push({
        customerId: id,
        customerName: namesById[id] ?? 'Cliente',
        counts,
        totalLinks,
        reasons,
      });
    } else {
      deletableIds.push(id);
    }
  }

  return { blocked, deletableIds };
}

// ─── Contact Recalculation & Equipment Matching ───────────────────────────────

export function computeLatestContactAt(
  contacts: Array<{ contacted_at?: string | null }>
): string | null {
  let latestIso: string | null = null;
  let latestMs = -Infinity;

  for (const c of contacts) {
    if (!c.contacted_at) continue;
    const ms = new Date(c.contacted_at).getTime();
    if (Number.isFinite(ms) && ms > latestMs) {
      latestMs = ms;
      latestIso = c.contacted_at;
    }
  }

  return latestIso;
}

export function matchesEquipmentOrder(
  order: { equipment_id?: string | null; equip_serial?: string | null },
  equipment: { id: string; equip_serial?: string | null } | null | undefined
): boolean {
  if (!equipment) return false;
  if (order.equipment_id && order.equipment_id === equipment.id) return true;
  const orderSerial = (order.equip_serial ?? '').trim().toLowerCase();
  const equipSerial = (equipment.equip_serial ?? '').trim().toLowerCase();
  return Boolean(orderSerial && equipSerial && orderSerial === equipSerial);
}
