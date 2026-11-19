import { calculateOrderFinancials, OSPartLike } from './osCalculations';

export type FinanceSource = 'os' | 'sale' | 'used_sale';
export type FinStatus = 'pago' | 'pendente' | 'atrasado' | 'cancelada' | 'garantia';
export type PeriodPreset = 'today' | '7d' | '30d' | 'this_month' | 'last_month' | 'quarter' | 'all';

export interface FinanceEntry {
  id: string;
  source: FinanceSource;
  displayCode: string;
  order_number: number;
  warranty_type?: string | null;
  customer_id: string;
  customer_name: string;
  technician_id: string | null;
  technician_name: string;
  visit_type: string;
  status: string;
  status_financeiro: string;
  isBillable: boolean;
  parts_total: number;
  labor_cost: number;
  total: number;
  payment_method: string | null;
  payment_method_label: string;
  paid_at: string | null;
  due_date: string | null;
  data_conclusao: string | null;
  created_at: string;
  ref_date_key: string;
  fin_status: FinStatus;
  notes?: string;
}

export interface FinanceExpenseLike {
  id: string;
  amount: number;
  due_date: string | null;
  paid_at: string | null;
  status: string;
  created_at?: string | null;
}

export interface FinanceIndicators {
  totalBilled: number;
  totalRevenue: number;
  totalPending: number;
  totalLate: number;
  ticket: number;
  paidCount: number;
  pendingCount: number;
  lateCount: number;
  warrantyCount: number;
  expensesPaid: number;
  expensesPending: number;
  netResult: number;
  osOpenCount: number;
  osAwaitingReviewCount: number;
  osConcludedCount: number;
  salesCount: number;
}

export interface RawServiceOrder {
  id: string;
  order_number: number;
  warranty_type?: string | null;
  customer_id: string;
  technician_id: string | null;
  visit_type: string;
  status: string;
  status_financeiro?: string | null;
  labor_cost?: number | null;
  payment_method?: string | null;
  paid_at?: string | null;
  due_date?: string | null;
  data_conclusao?: string | null;
  created_at: string;
  diagnosis?: string | null;
  customers?: { name?: string } | null;
}

export interface RawPdvSale {
  id: string;
  service_order_id?: string | null;
  customer_id?: string | null;
  customer_name?: string | null;
  payment_method?: string | null;
  total?: number | null;
  amount?: number | null;
  paid_amount?: number | null;
  paid_at?: string | null;
  sold_at?: string | null;
  notes?: string | null;
  created_at: string;
}

export interface RawUsedSale {
  id: string;
  customer_name?: string | null;
  payment_method?: string | null;
  status?: string | null;
  total?: number | null;
  paid_at?: string | null;
  notes?: string | null;
  created_at: string;
}

export interface BoletoLike {
  status: 'emitido' | 'pago' | 'vencido' | string;
  due_date: string;
}

// ─── Local Date Utilities (Zero UTC-3 Shift) ──────────────────────────────────

const DATE_ONLY_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;

export function toLocalDateKey(value: string | Date | null | undefined): string {
  if (!value) return '';
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return '';
    if (DATE_ONLY_REGEX.test(trimmed)) return trimmed;
    const d = new Date(trimmed);
    if (Number.isNaN(d.getTime())) return '';
    return formatDateParts(d);
  }
  if (Number.isNaN(value.getTime())) return '';
  return formatDateParts(value);
}

function formatDateParts(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function formatLocalDateBR(value: string | null | undefined): string {
  if (!value) return '—';
  const trimmed = value.trim();
  if (!trimmed) return '—';
  const match = DATE_ONLY_REGEX.exec(trimmed);
  if (match) {
    return `${match[3]}/${match[2]}/${match[1]}`;
  }
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR');
}

/**
 * Compares date keys strictly in local calendar days.
 * A bill due TODAY (`dueKey === todayKey`) is NOT past due (remains 'pendente').
 */
export function isDatePastDue(
  dueDate: string | null | undefined,
  todayKey: string = toLocalDateKey(new Date())
): boolean {
  const dueKey = toLocalDateKey(dueDate);
  if (!dueKey || !todayKey) return false;
  return dueKey < todayKey;
}

/**
 * Converts a chosen local date 'YYYY-MM-DD' into an ISO timestamp at 12:00 local time,
 * guaranteeing it never shifts calendar day in UTC or Brazilian timezones.
 */
export function buildLocalMiddayIso(dateKey: string): string {
  const match = DATE_ONLY_REGEX.exec((dateKey || '').trim());
  if (!match) return new Date().toISOString();
  const y = Number(match[1]);
  const m = Number(match[2]) - 1;
  const d = Number(match[3]);
  return new Date(y, m, d, 12, 0, 0).toISOString();
}

export function getPeriodPresetRange(
  preset: PeriodPreset,
  now: Date = new Date()
): { from: string; to: string } {
  const today = toLocalDateKey(now);
  if (preset === 'all') return { from: '', to: '' };
  if (preset === 'today') return { from: today, to: today };
  if (preset === '7d') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
    return { from: toLocalDateKey(start), to: today };
  }
  if (preset === '30d') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30);
    return { from: toLocalDateKey(start), to: today };
  }
  if (preset === 'this_month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: toLocalDateKey(start), to: today };
  }
  if (preset === 'last_month') {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 0);
    return { from: toLocalDateKey(start), to: toLocalDateKey(end) };
  }
  // quarter (90 days)
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 90);
  return { from: toLocalDateKey(start), to: today };
}

// ─── Payment Method Normalization ─────────────────────────────────────────────

export function normalizePaymentMethod(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw.trim();
  if (!cleaned || cleaned === '—' || cleaned === '-') return null;
  const lower = cleaned
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  if (lower === 'a definir' || lower === 'nao informado') return null;
  if (lower === 'pix') return 'Pix';
  if (lower === 'dinheiro' || lower === 'especie') return 'Dinheiro';
  if (lower === 'boleto' || lower === 'boleto bancario') return 'Boleto';
  if (lower.includes('credito')) return 'Cartão de Crédito';
  if (lower.includes('debito')) return 'Cartão de Débito';
  if (lower.includes('transfer') || lower === 'ted' || lower === 'doc') return 'Transferência';
  return cleaned;
}

// ─── Entry Normalizers ────────────────────────────────────────────────────────

export function normalizeServiceOrderEntry(
  order: RawServiceOrder,
  parts: OSPartLike[],
  techMap: Record<string, string>,
  custMap: Record<string, string>,
  todayKey: string = toLocalDateKey(new Date())
): FinanceEntry {
  const { partsTotal, laborCost, grandTotal } = calculateOrderFinancials(
    parts,
    order.labor_cost,
    true
  );

  const rawFin = (order.status_financeiro ?? '').toLowerCase();
  const isCanceled = order.status === 'Cancelada' || rawFin === 'cancelada';
  const isPaid = !isCanceled && (rawFin === 'pago' || Boolean(order.paid_at));
  const isWarrantyZero = !isCanceled && !isPaid && Boolean(order.warranty_type) && grandTotal === 0;
  const isLate =
    !isCanceled &&
    !isPaid &&
    !isWarrantyZero &&
    (rawFin === 'atrasado' || isDatePastDue(order.due_date, todayKey));

  let fin_status: FinStatus = 'pendente';
  if (isCanceled) fin_status = 'cancelada';
  else if (isPaid) fin_status = 'pago';
  else if (isWarrantyZero) fin_status = 'garantia';
  else if (isLate) fin_status = 'atrasado';

  const normalizedPM = normalizePaymentMethod(order.payment_method);
  const payment_method_label =
    normalizedPM ?? (fin_status === 'pendente' || fin_status === 'atrasado' ? 'A definir' : '—');

  // An OS enters billed financial metrics only once operationally Concluída (or if already Paid historically)
  const isBillable = !isCanceled && (order.status === 'Concluída' || isPaid);
  const refDateSource = order.paid_at || order.data_conclusao || order.created_at;

  return {
    id: order.id,
    source: 'os',
    displayCode: `#${String(order.order_number ?? 0).padStart(4, '0')}`,
    order_number: order.order_number ?? 0,
    warranty_type: order.warranty_type ?? null,
    customer_id: order.customer_id ?? '',
    customer_name: order.customers?.name || custMap[order.customer_id] || '—',
    technician_id: order.technician_id ?? null,
    technician_name: order.technician_id ? (techMap[order.technician_id] ?? '—') : '—',
    visit_type: order.visit_type || 'OS',
    status: order.status || 'Triagem',
    status_financeiro: order.status_financeiro ?? 'pendente',
    isBillable,
    parts_total: partsTotal,
    labor_cost: laborCost,
    total: grandTotal,
    payment_method: normalizedPM,
    payment_method_label,
    paid_at: order.paid_at ?? null,
    due_date: order.due_date ?? null,
    data_conclusao: order.data_conclusao ?? null,
    created_at: order.created_at,
    ref_date_key: toLocalDateKey(refDateSource),
    fin_status,
    notes: order.diagnosis ?? '',
  };
}

/**
 * Normalizes a PDV sale (`sales` table).
 * Returns null for legacy rows linked to a `service_order_id` to prevent double counting.
 */
export function normalizePdvSaleEntry(sale: RawPdvSale): FinanceEntry | null {
  if (sale.service_order_id) {
    return null;
  }

  const total = Number(sale.total ?? sale.amount ?? 0);
  const isPending = sale.paid_amount != null && Number(sale.paid_amount) < total;
  const fin_status: FinStatus = isPending ? 'pendente' : 'pago';
  const paid_at = isPending ? null : (sale.paid_at || sale.sold_at || sale.created_at);
  const normalizedPM = normalizePaymentMethod(sale.payment_method);

  return {
    id: sale.id,
    source: 'sale',
    displayCode: 'PDV',
    order_number: 0,
    warranty_type: null,
    customer_id: sale.customer_id ?? '',
    customer_name: sale.customer_name || 'Cliente Avulso',
    technician_id: null,
    technician_name: '—',
    visit_type: 'Venda Avulsa',
    status: 'Concluída',
    status_financeiro: fin_status,
    isBillable: true,
    parts_total: total,
    labor_cost: 0,
    total,
    payment_method: normalizedPM,
    payment_method_label: normalizedPM ?? (isPending ? 'A definir' : '—'),
    paid_at,
    due_date: null,
    data_conclusao: sale.created_at,
    created_at: sale.created_at,
    ref_date_key: toLocalDateKey(paid_at || sale.created_at),
    fin_status,
    notes: sale.notes || 'Venda via PDV',
  };
}

/**
 * Normalizes a Used Item Sale (`used_item_sales` table), respecting its `status` column.
 */
export function normalizeUsedSaleEntry(sale: RawUsedSale): FinanceEntry {
  const total = Number(sale.total ?? 0);
  const rawStatus = (sale.status ?? 'Paga').trim().toLowerCase();
  const isCanceled = rawStatus.includes('cancel');
  const isPending = !isCanceled && rawStatus.includes('pend');
  const fin_status: FinStatus = isCanceled ? 'cancelada' : isPending ? 'pendente' : 'pago';
  const paid_at = fin_status === 'pago' ? (sale.paid_at || sale.created_at) : null;
  const normalizedPM = normalizePaymentMethod(sale.payment_method);

  return {
    id: sale.id,
    source: 'used_sale',
    displayCode: 'USADO',
    order_number: 0,
    warranty_type: null,
    customer_id: '',
    customer_name: sale.customer_name || 'Cliente (Usados)',
    technician_id: null,
    technician_name: '—',
    visit_type: 'Venda de Usado',
    status: isCanceled ? 'Cancelada' : 'Concluída',
    status_financeiro: fin_status,
    isBillable: !isCanceled,
    parts_total: total,
    labor_cost: 0,
    total,
    payment_method: normalizedPM,
    payment_method_label: normalizedPM ?? (isPending ? 'A definir' : '—'),
    paid_at,
    due_date: null,
    data_conclusao: sale.created_at,
    created_at: sale.created_at,
    ref_date_key: toLocalDateKey(paid_at || sale.created_at),
    fin_status,
    notes: sale.notes || 'Venda de Usado',
  };
}

// ─── Effective Boleto Status ──────────────────────────────────────────────────

export function getEffectiveBoletoStatus(
  boleto: BoletoLike,
  todayKey: string = toLocalDateKey(new Date())
): 'emitido' | 'pago' | 'vencido' {
  const raw = (boleto.status || 'emitido').toLowerCase();
  if (raw === 'pago') return 'pago';
  if (raw === 'vencido') return 'vencido';
  if (isDatePastDue(boleto.due_date, todayKey)) return 'vencido';
  return 'emitido';
}

// ─── Indicators Aggregation ───────────────────────────────────────────────────

export function computeFinanceIndicators(
  filteredEntries: FinanceEntry[],
  allExpenses: FinanceExpenseLike[],
  dateFrom: string,
  dateTo: string
): FinanceIndicators {
  const billable = filteredEntries.filter(
    e => e.isBillable && e.fin_status !== 'cancelada' && e.fin_status !== 'garantia'
  );

  const paid = billable.filter(e => e.fin_status === 'pago');
  const pending = billable.filter(e => e.fin_status === 'pendente');
  const late = billable.filter(e => e.fin_status === 'atrasado');

  const totalRevenue = paid.reduce((s, e) => s + e.total, 0);
  const totalPending = pending.reduce((s, e) => s + e.total, 0);
  const totalLate = late.reduce((s, e) => s + e.total, 0);
  const totalBilled = totalRevenue + totalPending + totalLate;

  const paidWithValue = paid.filter(e => e.total > 0);
  const ticket = paidWithValue.length > 0 ? totalRevenue / paidWithValue.length : 0;

  let expensesPaid = 0;
  let expensesPending = 0;

  for (const exp of allExpenses) {
    const isExpPaid = (exp.status || '').toLowerCase() === 'pago';
    const expDateKey = toLocalDateKey(
      isExpPaid ? (exp.paid_at || exp.due_date || exp.created_at) : (exp.due_date || exp.created_at)
    );
    if (dateFrom && expDateKey && expDateKey < dateFrom) continue;
    if (dateTo && expDateKey && expDateKey > dateTo) continue;

    const amt = Number(exp.amount) || 0;
    if (isExpPaid) expensesPaid += amt;
    else expensesPending += amt;
  }

  const osEntries = filteredEntries.filter(e => e.source === 'os');
  const osAwaitingReviewCount = osEntries.filter(e => e.status === 'Aguardando Conferência').length;
  const osConcludedCount = osEntries.filter(e => e.status === 'Concluída').length;
  const osOpenCount = osEntries.filter(
    e => !['Concluída', 'Cancelada', 'Aguardando Conferência'].includes(e.status)
  ).length;
  const salesCount = filteredEntries.filter(e => e.source !== 'os' && e.fin_status !== 'cancelada').length;
  const warrantyCount = filteredEntries.filter(e => e.fin_status === 'garantia').length;

  return {
    totalBilled,
    totalRevenue,
    totalPending,
    totalLate,
    ticket,
    paidCount: paid.length,
    pendingCount: pending.length,
    lateCount: late.length,
    warrantyCount,
    expensesPaid,
    expensesPending,
    netResult: totalRevenue - expensesPaid,
    osOpenCount,
    osAwaitingReviewCount,
    osConcludedCount,
    salesCount,
  };
}

// ─── Excel PT-BR CSV Export (Semicolon + UTF-8 BOM) ───────────────────────────

function csvEscape(value: string): string {
  const clean = value.replace(/[\r\n]+/g, ' ').replace(/"/g, '""');
  return `"${clean}"`;
}

export function buildFinanceCsv(entries: FinanceEntry[]): string {
  const header = [
    'Origem',
    'Código',
    'Cliente',
    'Técnico',
    'Status Operacional',
    'Forma Pgto',
    'Status Fin.',
    'Valor Total (R$)',
    'Abertura',
    'Vencimento',
    'Data Pagamento',
  ].join(';');

  const sourceLabels: Record<FinanceSource, string> = {
    os: 'Ordem de Serviço',
    sale: 'Venda PDV',
    used_sale: 'Venda Usado',
  };

  const rows = entries.map(e =>
    [
      csvEscape(sourceLabels[e.source]),
      csvEscape(e.displayCode),
      csvEscape(e.customer_name),
      csvEscape(e.technician_name),
      csvEscape(e.status),
      csvEscape(e.payment_method_label),
      csvEscape(e.fin_status),
      e.total.toFixed(2).replace('.', ','),
      formatLocalDateBR(e.created_at),
      formatLocalDateBR(e.due_date),
      formatLocalDateBR(e.paid_at),
    ].join(';')
  );

  return '\uFEFF' + [header, ...rows].join('\r\n');
}
