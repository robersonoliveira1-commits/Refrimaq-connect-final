import { printHtml } from '../utils/print';
import { useEffect, useState, useMemo, useCallback } from 'react';
import {
  DollarSign, TrendingUp, TrendingDown, AlertCircle, Clock, CheckCircle2,
  Filter, Download, Search, ChevronLeft, ChevronRight,
  Loader2, RefreshCw, FileText, CreditCard, Users, BarChart3,
  X, Pencil, Wallet, RotateCcw, Calendar, Wrench,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { fetchCompanyConfig, CompanyConfig, EMPTY_CONFIG } from '../lib/companyConfig';
import { OSPartLike, logFinancialAudit } from '../lib/osStockSync';
import {
  FinanceEntry,
  FinanceExpenseLike,
  FinanceSource,
  FinStatus,
  PeriodPreset,
  RawServiceOrder,
  RawPdvSale,
  RawUsedSale,
  toLocalDateKey,
  formatLocalDateBR,
  buildLocalMiddayIso,
  getPeriodPresetRange,
  normalizeServiceOrderEntry,
  normalizePdvSaleEntry,
  normalizeUsedSaleEntry,
  getEffectiveBoletoStatus,
  computeFinanceIndicators,
  buildFinanceCsv,
} from '../lib/financeEngine';
import Header from './Header';
import { useAuth } from '../lib/auth';
import AdvancedFinance from './AdvancedFinance';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Boleto {
  id: string;
  service_order_id: string;
  customer_name: string;
  amount: number;
  due_date: string;
  status: 'emitido' | 'pago' | 'vencido';
  issued_at: string;
  paid_at: string | null;
  notes: string | null;
}

interface Technician { id: string; full_name: string }
interface Customer { id: string; name: string }
interface RawPartRow extends OSPartLike { service_order_id: string }

type FinStatusFilter = '' | FinStatus | 'conferencia' | 'em_aberto';
type BoletoFilter = 'all' | 'emitido' | 'vencido' | 'pago';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtCurrency = (v: number | null | undefined) =>
  (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const FIN_STATUS_CONFIG: Record<FinStatus, { label: string; bg: string; text: string; dot: string }> = {
  pago:      { label: 'Pago',      bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  pendente:  { label: 'Pendente',  bg: 'bg-yellow-50 border-yellow-200',   text: 'text-yellow-700',  dot: 'bg-yellow-400' },
  atrasado:  { label: 'Atrasado',  bg: 'bg-red-50 border-red-200',         text: 'text-red-700',     dot: 'bg-red-500'    },
  garantia:  { label: 'Garantia',  bg: 'bg-sky-50 border-sky-200',         text: 'text-sky-700',     dot: 'bg-sky-500'    },
  cancelada: { label: 'Cancelada', bg: 'bg-slate-50 border-slate-200',     text: 'text-slate-500',   dot: 'bg-slate-400'  },
};

const BOLETO_STATUS: Record<'emitido' | 'pago' | 'vencido', { label: string; bg: string; text: string }> = {
  emitido: { label: 'Emitido',  bg: 'bg-blue-50 border-blue-200',       text: 'text-blue-700' },
  pago:    { label: 'Pago',     bg: 'bg-emerald-50 border-emerald-200',  text: 'text-emerald-700' },
  vencido: { label: 'Vencido',  bg: 'bg-red-50 border-red-200',          text: 'text-red-700' },
};

const PERIOD_PRESETS: { id: PeriodPreset; label: string }[] = [
  { id: 'today', label: 'Hoje' },
  { id: '7d', label: '7 dias' },
  { id: '30d', label: '30 dias' },
  { id: 'this_month', label: 'Este Mês' },
  { id: 'last_month', label: 'Mês Anterior' },
  { id: 'quarter', label: 'Trimestre' },
  { id: 'all', label: 'Tudo' },
];

const PAYMENT_METHODS = ['Dinheiro', 'Pix', 'Cartão de Débito', 'Cartão de Crédito', 'Boleto', 'Transferência'];
const PM_COLORS = ['#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#f97316', '#06b6d4', '#64748b'];
const PAGE_SIZE = 10;
const BOLETO_PAGE_SIZE = 10;

async function fetchAllPages<T>(
  queryPage: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>,
  pageSize = 1000,
  maxPages = 20
): Promise<T[]> {
  const all: T[] = [];
  for (let p = 0; p < maxPages; p++) {
    const from = p * pageSize;
    const to = from + pageSize - 1;
    const { data, error } = await queryPage(from, to);
    if (error || !data || data.length === 0) break;
    all.push(...(data as T[]));
    if (data.length < pageSize) break;
  }
  return all;
}

// ─── Mini bar chart ───────────────────────────────────────────────────────────

function BarList({ data, valueFormatter = String }: {
  data: { label: string; value: number }[];
  valueFormatter?: (v: number) => string;
}) {
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <div className="space-y-2">
      {data.map((d, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="text-xs text-slate-500 w-32 truncate flex-shrink-0" title={d.label}>{d.label}</span>
          <div className="flex-1 h-5 bg-slate-100 rounded-md overflow-hidden">
            <div
              className="h-full bg-amber-400 rounded-md transition-all duration-500 flex items-center justify-end pr-1.5"
              style={{ width: `${(d.value / max) * 100}%`, minWidth: d.value > 0 ? '2rem' : 0 }}
            >
              <span className="text-white text-[10px] font-bold leading-none whitespace-nowrap">
                {valueFormatter(d.value)}
              </span>
            </div>
          </div>
        </div>
      ))}
      {data.length === 0 && <p className="text-xs text-slate-400 text-center py-3">Sem dados no período</p>}
    </div>
  );
}

// ─── Monthly bar chart ────────────────────────────────────────────────────────

function MonthBars({ data }: { data: { month: string; value: number }[] }) {
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <div className="flex items-end gap-2 h-32">
      {data.map(m => (
        <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
          <span className="text-[10px] font-medium text-slate-500">
            {m.value > 0 ? fmtCurrency(m.value).replace('R$\u00a0', '') : ''}
          </span>
          <div
            className="w-full bg-amber-400 rounded-t transition-all duration-500 min-h-[4px]"
            style={{ height: `${(m.value / max) * 96}px` }}
          />
          <span className="text-[10px] text-slate-400 text-center leading-tight">{m.month}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Donut chart ──────────────────────────────────────────────────────────────

function DonutChart({ data }: { data: { label: string; value: number; color: string }[] }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return <p className="text-xs text-slate-400 text-center py-4">Sem dados no período</p>;
  let offset = 0;
  const r = 38, cx = 50, cy = 50, circ = 2 * Math.PI * r;
  return (
    <div className="flex items-center gap-4">
      <svg width="100" height="100" viewBox="0 0 100 100" className="flex-shrink-0">
        {data.map((d, i) => {
          const pct = d.value / total;
          const dash = pct * circ;
          const seg = (
            <circle key={i} cx={cx} cy={cy} r={r} fill="none"
              stroke={d.color} strokeWidth="20"
              strokeDasharray={`${dash} ${circ - dash}`}
              strokeDashoffset={-offset * circ}
              style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%' }}
            />
          );
          offset += pct;
          return seg;
        })}
        <text x="50" y="54" textAnchor="middle" fontSize="11" fontWeight="700" fill="#1e293b">
          {fmtCurrency(total).replace('R$\u00a0', '')}
        </text>
      </svg>
      <div className="flex-1 space-y-1.5 min-w-0">
        {data.map((d, i) => (
          <div key={i} className="flex items-center justify-between gap-1">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: d.color }} />
              <span className="text-xs text-slate-600 truncate">{d.label}</span>
            </div>
            <span className="text-xs font-semibold text-slate-700 flex-shrink-0">{fmtCurrency(d.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Boleto PDF generator ─────────────────────────────────────────────────────

function generateBoletoPDF(b: Boleto, cfg: CompanyConfig = EMPTY_CONFIG) {
  const effectiveStatus = getEffectiveBoletoStatus(b);
  const logoHtml = cfg.logo_url
    ? `<img src="${cfg.logo_url}" alt="Logo" style="height:44px;object-fit:contain;max-width:100px;" />`
    : '';
  const cedente = cfg.razao_social || cfg.company_name || 'Refrimaq';
  const cnpj = cfg.cnpj ? ` · CNPJ: ${cfg.cnpj}` : '';
  const address = cfg.address || '';
  const pixLine = cfg.pix_key
    ? `Chave PIX (${cfg.pix_key_type || 'PIX'}): ${cfg.pix_key}${cfg.account_holder ? ' — ' + cfg.account_holder : ''}`
    : '';
  const bankLine = [cfg.bank_name, cfg.agency ? `Ag. ${cfg.agency}` : '', cfg.account_number ? `Cc. ${cfg.account_number}` : ''].filter(Boolean).join(' · ');
  const boletoMsg = b.notes || cfg.boleto_message || cfg.financial_notes || '';
  const dueBR = formatLocalDateBR(b.due_date);
  const issuedBR = formatLocalDateBR(b.issued_at);

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8" />
<title>Boleto #${b.id.slice(0, 8).toUpperCase()}</title>
<style>
  * { box-sizing: border-box; margin:0; padding:0; }
  body { font-family: Arial, sans-serif; font-size: 12px; color: #1e293b; background: #fff; }
  .page { padding: 24px; max-width: 760px; margin: 0 auto; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 12px; border-bottom: 2px solid #000; margin-bottom: 16px; }
  .bank-name { font-size: 20px; font-weight: 900; letter-spacing: 2px; }
  .row { display: grid; gap: 0; border: 1px solid #000; margin-bottom: -1px; }
  .row.cols-3 { grid-template-columns: 1fr 1fr 1fr; }
  .row.cols-2 { grid-template-columns: 2fr 1fr; }
  .row.cols-4 { grid-template-columns: 2fr 1fr 1fr 1fr; }
  .cell { border-right: 1px solid #000; padding: 4px 6px; }
  .cell:last-child { border-right: none; }
  .cell label { font-size: 9px; color: #666; text-transform: uppercase; letter-spacing: 0.05em; display: block; }
  .cell span { font-size: 13px; font-weight: 600; }
  .barcode-area { margin-top: 16px; padding: 12px 0; border-top: 1px solid #000; }
  .bars { display: flex; align-items: stretch; height: 48px; gap: 0; }
  .b { background: #000; }
  .w { background: #fff; }
  .cut-line { border-top: 1px dashed #999; margin: 20px 0; text-align: center; }
  .cut-line span { background: #fff; padding: 0 8px; font-size: 10px; color: #999; position: relative; top: -8px; }
  .section-title { font-size: 10px; font-weight: 700; color: #475569; text-transform: uppercase; letter-spacing: 0.08em; background: #f8fafc; padding: 4px 6px; border: 1px solid #000; border-bottom: none; }
  .amount-box { border: 2px solid #000; padding: 8px 12px; text-align: right; display: inline-block; }
  .amount-box label { font-size: 9px; display: block; color: #666; text-transform: uppercase; }
  .amount-box span { font-size: 22px; font-weight: 900; }
  .status-badge { display: inline-block; padding: 3px 10px; border-radius: 4px; font-size: 11px; font-weight: 700;
    background: ${effectiveStatus === 'pago' ? '#d1fae5' : effectiveStatus === 'vencido' ? '#fee2e2' : '#dbeafe'};
    color: ${effectiveStatus === 'pago' ? '#065f46' : effectiveStatus === 'vencido' ? '#991b1b' : '#1e40af'};
    border: 1px solid ${effectiveStatus === 'pago' ? '#6ee7b7' : effectiveStatus === 'vencido' ? '#fca5a5' : '#93c5fd'};
  }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
<div class="page">
  <div class="header">
    <div style="display:flex;align-items:center;gap:10px;">
      ${logoHtml}
      <div>
        <div class="bank-name">${cfg.company_name || 'EMPRESA'}</div>
        ${cfg.cnpj ? `<div style="font-size:10px;color:#666;margin-top:1px;">CNPJ: ${cfg.cnpj}</div>` : ''}
        ${address ? `<div style="font-size:10px;color:#666;">${address}</div>` : ''}
      </div>
    </div>
    <div style="text-align:right">
      <div class="status-badge">${effectiveStatus === 'pago' ? 'PAGO' : effectiveStatus === 'vencido' ? 'VENCIDO' : 'EMITIDO'}</div>
      <div style="font-size:10px;color:#666;margin-top:4px;">Emissão: ${issuedBR}</div>
    </div>
  </div>

  <div class="section-title">Cedente / Local de Pagamento</div>
  <div class="row">
    <div class="cell" style="padding:6px 6px 8px;">
      <label>Beneficiário</label>
      <span>${cedente}${cnpj}</span>
    </div>
  </div>
  ${(pixLine || bankLine) ? `
  <div class="row">
    <div class="cell" style="padding:5px 6px 7px;">
      <label>Dados para Pagamento</label>
      <span style="font-size:11px;font-weight:500;">${[pixLine, bankLine].filter(Boolean).join(' &nbsp;·&nbsp; ')}</span>
    </div>
  </div>` : ''}

  <div class="section-title" style="margin-top:12px;">Sacado (Pagador)</div>
  <div class="row cols-2">
    <div class="cell"><label>Nome</label><span>${b.customer_name}</span></div>
    <div class="cell"><label>Código do Boleto</label><span>${b.id.slice(0, 8).toUpperCase()}</span></div>
  </div>

  <div class="section-title">Informações do Pagamento</div>
  <div class="row cols-4">
    <div class="cell"><label>Vencimento</label><span>${dueBR}</span></div>
    <div class="cell"><label>Nosso Número</label><span>${b.id.slice(-8).toUpperCase()}</span></div>
    <div class="cell"><label>Espécie Doc.</label><span>DM</span></div>
    <div class="cell"><label>Aceite</label><span>N</span></div>
  </div>
  <div class="row cols-3">
    <div class="cell"><label>Uso do Banco</label><span></span></div>
    <div class="cell"><label>Carteira</label><span>SR</span></div>
    <div class="cell" style="text-align:right">
      <div class="amount-box">
        <label>Valor do Documento (R$)</label>
        <span>${(b.amount || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
      </div>
    </div>
  </div>

  ${boletoMsg ? `<div class="row"><div class="cell"><label>Instruções / Observações</label><span style="font-size:11px;font-weight:400;">${boletoMsg}</span></div></div>` : ''}

  <div class="cut-line"><span>✂ Corte aqui</span></div>

  <div class="header" style="margin-bottom:12px;">
    <div style="display:flex;align-items:center;gap:8px;">
      ${logoHtml}
      <div class="bank-name" style="font-size:16px;">${cfg.company_name || 'EMPRESA'}</div>
    </div>
    <div style="text-align:right;font-size:11px;">
      <strong>Venc:</strong> ${dueBR} &nbsp;|&nbsp;
      <strong>R$</strong> ${(b.amount || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
    </div>
  </div>
  <div class="row cols-2">
    <div class="cell"><label>Pagador</label><span>${b.customer_name}</span></div>
    <div class="cell"><label>Nosso Número</label><span>${b.id.slice(0, 8).toUpperCase()}</span></div>
  </div>

  <div class="barcode-area">
    <div class="bars">
      ${Array.from({ length: 80 }, (_, i) => {
        const w = [1,2,3,2,1,3,1,2,1,1,3,2,1,2,3,1,2,1,1,2,3,1,2,3,1,1,2,3,1,2,
                    1,3,2,1,2,1,1,3,2,1,2,3,1,2,1,1,2,1,3,2,1,3,1,2,1,1,2,3,2,1,
                    3,1,2,1,2,3,1,1,2,1,3,2,1,3,2,1,1,2,3,1][i] ?? 1;
        const type = i % 2 === 0 ? 'b' : 'w';
        return `<div class="${type}" style="width:${w * 2}px;"></div>`;
      }).join('')}
    </div>
    <p style="margin-top:6px;font-size:11px;text-align:center;letter-spacing:4px;font-weight:600;">
      ${b.id.replace(/-/g, '').toUpperCase().slice(0, 10)}.${b.id.replace(/-/g, '').toUpperCase().slice(10, 20)} &nbsp;
      ${b.id.replace(/-/g, '').toUpperCase().slice(20, 30)}.${b.id.replace(/-/g, '').toUpperCase().slice(30, 40)}
    </p>
  </div>
</div>
</body>
</html>`;

  printHtml(html, `Boleto_${b.id.slice(0, 8)}.pdf`);
}

// ─── Boleto Modal ──────────────────────────────────────────────────────────────

interface BoletoModalProps {
  order: FinanceEntry;
  onClose: () => void;
  onCreated: () => void;
  companyConfig: CompanyConfig;
  userName: string;
}

function BoletoModal({ order, onClose, onCreated, companyConfig, userName }: BoletoModalProps) {
  const today = new Date();
  const def = toLocalDateKey(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 7));
  const [dueDate, setDueDate] = useState(order.due_date ?? def);
  const [notes, setNotes] = useState(companyConfig.boleto_message || '');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function create() {
    if (!dueDate) return;
    setSaving(true);
    setErrorMsg(null);
    const { data, error } = await supabase.from('boletos').insert({
      service_order_id: order.id,
      customer_name: order.customer_name,
      amount: order.total,
      due_date: dueDate,
      notes: notes || null,
    }).select().single();

    if (error || !data) {
      setErrorMsg(error?.message || 'Não foi possível emitir o boleto. Tente novamente.');
      setSaving(false);
      return;
    }

    if (order.due_date !== dueDate) {
      await supabase.from('service_orders').update({ due_date: dueDate }).eq('id', order.id);
    }

    const created = data as unknown as Boleto;
    await logFinancialAudit({
      actionType: 'insert',
      tableName: 'boletos',
      recordId: created.id,
      userName,
      changes: {
        action: 'issue_boleto',
        service_order_id: order.id,
        order_code: order.displayCode,
        amount: order.total,
        due_date: dueDate,
      },
    });

    generateBoletoPDF({ ...created, status: 'emitido' }, companyConfig);
    setSaving(false);
    onCreated();
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="font-bold text-slate-800 flex items-center gap-2">
            <FileText size={16} className="text-amber-500" />
            Gerar Boleto — OS {order.displayCode}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors">
            <X size={16} />
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          {errorMsg && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl p-3 flex items-start gap-2">
              <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}
          <div className="bg-slate-50 rounded-xl p-4 space-y-1">
            <p className="text-xs text-slate-500">Cliente</p>
            <p className="font-semibold text-slate-800">{order.customer_name}</p>
            <p className="text-xs text-slate-500 mt-1">Valor total</p>
            <p className="text-xl font-extrabold text-green-600">{fmtCurrency(order.total)}</p>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">Data de Vencimento</label>
            <input
              type="date"
              value={dueDate}
              onChange={e => setDueDate(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">Observações / Instruções</label>
            <textarea
              rows={2}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Ex: Após vencimento cobrar multa de 2%..."
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 resize-none"
            />
          </div>
        </div>
        <div className="px-6 py-4 border-t border-slate-100 flex gap-3">
          <button onClick={onClose} className="flex-1 border border-slate-200 text-slate-600 hover:bg-slate-50 py-2.5 rounded-xl text-sm font-medium transition-colors">
            Cancelar
          </button>
          <button
            onClick={create}
            disabled={saving || !dueDate}
            className="flex-1 flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white py-2.5 rounded-xl text-sm font-semibold transition-colors"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
            Gerar e Imprimir
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Payment Modal ────────────────────────────────────────────────────────────

interface PaymentModalProps {
  entry: FinanceEntry;
  onClose: () => void;
  onConfirm: (entry: FinanceEntry, method: string, paidDateKey: string) => Promise<string | null>;
  onOpenOrder?: (orderId: string) => void;
}

function PaymentModal({ entry, onClose, onConfirm, onOpenOrder }: PaymentModalProps) {
  const initialMethod =
    entry.payment_method && PAYMENT_METHODS.includes(entry.payment_method)
      ? entry.payment_method
      : '';
  const [method, setMethod] = useState(initialMethod);
  const [paidDate, setPaidDate] = useState(toLocalDateKey(new Date()));
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const needsOsAdjustment =
    entry.source === 'os' &&
    (entry.total === 0 || entry.status === 'Aguardando Conferência' || !entry.isBillable);

  const titleLabel =
    entry.source === 'os'
      ? `OS ${entry.displayCode}`
      : entry.source === 'sale'
        ? 'Venda PDV'
        : 'Venda de Usado';

  async function submit() {
    if (!method || !paidDate) return;
    setSaving(true);
    setErrorMsg(null);
    const err = await onConfirm(entry, method, paidDate);
    setSaving(false);
    if (err) {
      setErrorMsg(err);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="font-bold text-slate-800 flex items-center gap-2">
            <CreditCard size={16} className="text-emerald-500" />
            Registrar Pagamento — {titleLabel}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {errorMsg && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl p-3 flex items-start gap-2">
              <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {needsOsAdjustment && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 text-xs text-amber-900 space-y-2">
              <div className="flex items-start gap-2">
                <AlertCircle size={15} className="text-amber-600 flex-shrink-0 mt-0.5" />
                <p>
                  {entry.status === 'Aguardando Conferência'
                    ? 'Esta OS ainda está Aguardando Conferência Administrativa.'
                    : !entry.isBillable
                      ? `Esta OS ainda está em "${entry.status}" na Oficina (não concluída).`
                      : 'Esta OS está com valor total R$ 0,00 (sem peças ou serviços lançados).'}{' '}
                  Recomenda-se abrir a OS para revisar peças/valores antes de registrar o pagamento.
                </p>
              </div>
              {onOpenOrder && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenOrder(entry.id);
                  }}
                  className="w-full flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-lg text-xs font-semibold transition-colors"
                >
                  <Pencil size={13} />
                  Abrir OS para Lançar Peças e Valores
                </button>
              )}
            </div>
          )}

          {/* Status banner */}
          <div className="bg-slate-50 rounded-xl p-4 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">Cliente</span>
              <span className="text-sm font-semibold text-slate-800">{entry.customer_name}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">Origem / Status</span>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                entry.status === 'Concluída' ? 'bg-emerald-50 text-emerald-700' : 'bg-yellow-50 text-yellow-700'
              }`}>{entry.visit_type} · {entry.status}</span>
            </div>
            <div className="flex items-center justify-between pt-1.5 border-t border-slate-200 mt-1">
              <span className="text-xs text-slate-500">Valor a receber</span>
              <span className="text-xl font-extrabold text-green-600">{fmtCurrency(entry.total)}</span>
            </div>
          </div>

          {/* Payment date */}
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1 flex items-center gap-1.5">
              <Calendar size={12} className="text-slate-400" />
              Data Efetiva do Pagamento
            </label>
            <input
              type="date"
              value={paidDate}
              onChange={e => setPaidDate(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
            />
          </div>

          {/* Payment method */}
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-2">Forma de Pagamento</label>
            <div className="grid grid-cols-2 gap-2">
              {PAYMENT_METHODS.map(pm => (
                <button
                  key={pm}
                  type="button"
                  onClick={() => setMethod(pm)}
                  className={`px-3 py-2.5 rounded-xl text-sm font-medium border transition-colors ${
                    method === pm
                      ? 'bg-emerald-500 text-white border-emerald-500'
                      : 'border-slate-200 text-slate-600 hover:border-emerald-300 hover:bg-emerald-50'
                  }`}
                >
                  {pm}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex gap-3">
          <button onClick={onClose} className="flex-1 border border-slate-200 text-slate-600 hover:bg-slate-50 py-2.5 rounded-xl text-sm font-medium transition-colors">
            Cancelar
          </button>
          <button
            onClick={submit}
            disabled={saving || !method || !paidDate}
            className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white py-2.5 rounded-xl text-sm font-semibold transition-colors"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
            Confirmar Pagamento
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface Props {
  onMenuClick: () => void;
  refresh: number;
  onOpenOrder?: (orderId: string) => void;
}

export default function FinancePage({ onMenuClick, refresh, onOpenOrder }: Props) {
  const { profile } = useAuth();
  const [activeTab, setActiveTab] = useState<'geral' | 'avancado'>('geral');
  const [loading, setLoading] = useState(true);

  const [entries, setEntries] = useState<FinanceEntry[]>([]);
  const [expenses, setExpenses] = useState<FinanceExpenseLike[]>([]);
  const [boletos, setBoletos] = useState<Boleto[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [companyConfig, setCompanyConfig] = useState<CompanyConfig>(EMPTY_CONFIG);

  // Filters
  const initialRange = useMemo(() => getPeriodPresetRange('30d'), []);
  const [activePreset, setActivePreset] = useState<PeriodPreset | 'custom'>('30d');
  const [dateFrom, setDateFrom] = useState(initialRange.from);
  const [dateTo, setDateTo] = useState(initialRange.to);
  const [filterTech, setFilterTech] = useState('');
  const [filterCustomer, setFilterCustomer] = useState('');
  const [filterPM, setFilterPM] = useState('');
  const [filterSource, setFilterSource] = useState<'' | FinanceSource>('');
  const [filterFinStatus, setFilterFinStatus] = useState<FinStatusFilter>('');

  // Table state
  const [applyDateToTable, setApplyDateToTable] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  // Boletos table state
  const [boletoFilter, setBoletoFilter] = useState<BoletoFilter>('all');
  const [boletoPage, setBoletoPage] = useState(1);
  const [payingBoletoId, setPayingBoletoId] = useState<string | null>(null);

  // Modals
  const [boletoOrder, setBoletoOrder] = useState<FinanceEntry | null>(null);
  const [payEntry, setPayEntry] = useState<FinanceEntry | null>(null);

  const todayKey = toLocalDateKey(new Date());

  const loadAll = useCallback(async () => {
    setLoading(true);
    const [
      ordData,
      partsData,
      techRes,
      custData,
      boletoData,
      salesData,
      usedSalesData,
      expData,
      cfg,
    ] = await Promise.all([
      fetchAllPages<RawServiceOrder>((from, to) =>
        supabase
          .from('service_orders')
          .select('id,order_number,warranty_type,customer_id,technician_id,visit_type,status,status_financeiro,labor_cost,payment_method,paid_at,due_date,data_conclusao,created_at,diagnosis,customers(name)')
          .order('created_at', { ascending: false })
          .range(from, to)
      ),
      fetchAllPages<RawPartRow>((from, to) =>
        supabase
          .from('service_order_parts')
          .select('service_order_id,quantity,unit_price,product_id')
          .range(from, to)
      ),
      supabase.from('user_profiles').select('id,full_name').eq('active', true).order('full_name'),
      fetchAllPages<Customer>((from, to) =>
        supabase.from('customers').select('id,name').order('name').range(from, to)
      ),
      fetchAllPages<Boleto>((from, to) =>
        supabase.from('boletos').select('*').order('created_at', { ascending: false }).range(from, to)
      ),
      fetchAllPages<RawPdvSale>((from, to) =>
        supabase.from('sales').select('*').order('created_at', { ascending: false }).range(from, to)
      ),
      fetchAllPages<RawUsedSale>((from, to) =>
        supabase.from('used_item_sales').select('*').order('created_at', { ascending: false }).range(from, to)
      ),
      fetchAllPages<FinanceExpenseLike>((from, to) =>
        supabase.from('expenses').select('id,amount,due_date,paid_at,status,created_at').range(from, to)
      ),
      fetchCompanyConfig(),
    ]);

    const techs = (techRes.data as unknown as Technician[]) ?? [];
    const techMap = Object.fromEntries(techs.map(t => [t.id, t.full_name]));
    const custMap = Object.fromEntries(custData.map(c => [c.id, c.name]));

    const partsByOrder: Record<string, OSPartLike[]> = {};
    for (const p of partsData) {
      if (!partsByOrder[p.service_order_id]) partsByOrder[p.service_order_id] = [];
      partsByOrder[p.service_order_id].push(p);
    }

    const nowKey = toLocalDateKey(new Date());

    const osEntries: FinanceEntry[] = ordData.map(o =>
      normalizeServiceOrderEntry(o, partsByOrder[o.id] ?? [], techMap, custMap, nowKey)
    );

    const pdvEntries: FinanceEntry[] = [];
    for (const s of salesData) {
      const normalized = normalizePdvSaleEntry(s);
      if (normalized) pdvEntries.push(normalized);
    }

    const usedEntries: FinanceEntry[] = usedSalesData.map(s => normalizeUsedSaleEntry(s));

    const allEntries = [...osEntries, ...pdvEntries, ...usedEntries].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    setEntries(allEntries);
    setExpenses(expData);
    setBoletos(boletoData);
    setTechnicians(techs);
    setCustomers(custData);
    setCompanyConfig(cfg);
    setLoading(false);
  }, []);

  useEffect(() => { loadAll(); }, [refresh, loadAll]);

  // Reset pagination whenever filters or search change
  useEffect(() => {
    setPage(1);
  }, [search, filterTech, filterCustomer, filterPM, filterFinStatus, filterSource, applyDateToTable, dateFrom, dateTo]);

  useEffect(() => {
    setBoletoPage(1);
  }, [boletoFilter]);

  function applyPreset(preset: PeriodPreset) {
    const range = getPeriodPresetRange(preset);
    setActivePreset(preset);
    setDateFrom(range.from);
    setDateTo(range.to);
  }

  function clearAllFilters() {
    const range = getPeriodPresetRange('30d');
    setActivePreset('30d');
    setDateFrom(range.from);
    setDateTo(range.to);
    setFilterTech('');
    setFilterCustomer('');
    setFilterPM('');
    setFilterSource('');
    setFilterFinStatus('');
    setSearch('');
  }

  const hasActiveFilters = Boolean(
    filterTech || filterCustomer || filterPM || filterSource || filterFinStatus || search || activePreset !== '30d'
  );

  // ─── Polymorphic Payment Registration with Audit Trail ─────────────────────

  async function registerPayment(
    entry: FinanceEntry,
    method: string,
    paidDateKey: string
  ): Promise<string | null> {
    const paidIso = buildLocalMiddayIso(paidDateKey);
    const nowIso = new Date().toISOString();
    const userName = profile?.full_name || 'Operador';

    if (entry.source === 'os') {
      const { error } = await supabase
        .from('service_orders')
        .update({
          status_financeiro: 'pago',
          payment_method: method,
          paid_at: paidIso,
          updated_at: nowIso,
        })
        .eq('id', entry.id);

      if (error) {
        return `Erro ao registrar pagamento da OS ${entry.displayCode}: ${error.message}`;
      }

      await supabase
        .from('boletos')
        .update({ status: 'pago', paid_at: paidIso })
        .eq('service_order_id', entry.id)
        .neq('status', 'pago');

      await logFinancialAudit({
        actionType: 'update',
        tableName: 'service_orders',
        recordId: entry.id,
        userName,
        changes: {
          action: 'register_payment',
          source: 'os',
          code: entry.displayCode,
          amount: entry.total,
          payment_method: method,
          paid_at: paidIso,
        },
      });
    } else if (entry.source === 'sale') {
      const { error } = await supabase
        .from('sales')
        .update({
          paid_amount: entry.total,
          payment_method: method,
        })
        .eq('id', entry.id);

      if (error) {
        return `Erro ao registrar pagamento da Venda PDV: ${error.message}`;
      }

      await logFinancialAudit({
        actionType: 'update',
        tableName: 'sales',
        recordId: entry.id,
        userName,
        changes: {
          action: 'register_payment',
          source: 'sale',
          amount: entry.total,
          payment_method: method,
          paid_at: paidIso,
        },
      });
    } else {
      const { error } = await supabase
        .from('used_item_sales')
        .update({
          status: 'Paga',
          payment_method: method,
        })
        .eq('id', entry.id);

      if (error) {
        return `Erro ao registrar pagamento da Venda de Usado: ${error.message}`;
      }

      await logFinancialAudit({
        actionType: 'update',
        tableName: 'used_item_sales',
        recordId: entry.id,
        userName,
        changes: {
          action: 'register_payment',
          source: 'used_sale',
          amount: entry.total,
          payment_method: method,
          paid_at: paidIso,
        },
      });
    }

    setPayEntry(null);
    await loadAll();
    return null;
  }

  async function markBoletoAsPaid(b: Boleto) {
    if (!confirm(`Confirmar baixa do boleto #${b.id.slice(0, 8).toUpperCase()} (${b.customer_name} — ${fmtCurrency(b.amount)})?`)) {
      return;
    }
    setPayingBoletoId(b.id);
    const paidIso = buildLocalMiddayIso(toLocalDateKey(new Date()));
    const nowIso = new Date().toISOString();
    const userName = profile?.full_name || 'Operador';

    const { error } = await supabase
      .from('boletos')
      .update({ status: 'pago', paid_at: paidIso })
      .eq('id', b.id);

    if (error) {
      alert(`Erro ao dar baixa no boleto: ${error.message}`);
      setPayingBoletoId(null);
      return;
    }

    if (b.service_order_id) {
      await supabase
        .from('service_orders')
        .update({
          status_financeiro: 'pago',
          payment_method: 'Boleto',
          paid_at: paidIso,
          updated_at: nowIso,
        })
        .eq('id', b.service_order_id);
    }

    await logFinancialAudit({
      actionType: 'update',
      tableName: 'boletos',
      recordId: b.id,
      userName,
      changes: {
        action: 'pay_boleto',
        service_order_id: b.service_order_id,
        amount: b.amount,
        paid_at: paidIso,
      },
    });

    setPayingBoletoId(null);
    await loadAll();
  }

  // ─── Period-filtered dataset (KPIs & Charts) ────────────────────────────────

  const periodFiltered = useMemo(() => {
    return entries.filter(o => {
      if (dateFrom && o.ref_date_key && o.ref_date_key < dateFrom) return false;
      if (dateTo && o.ref_date_key && o.ref_date_key > dateTo) return false;
      if (filterTech && o.technician_id !== filterTech) return false;
      if (filterCustomer && o.customer_id !== filterCustomer) return false;
      if (filterPM && o.payment_method !== filterPM) return false;
      if (filterSource && o.source !== filterSource) return false;
      return true;
    });
  }, [entries, dateFrom, dateTo, filterTech, filterCustomer, filterPM, filterSource]);

  // ─── Indicators ─────────────────────────────────────────────────────────────

  const indicators = useMemo(
    () => computeFinanceIndicators(periodFiltered, expenses, dateFrom, dateTo),
    [periodFiltered, expenses, dateFrom, dateTo]
  );

  // ─── Chart data ──────────────────────────────────────────────────────────────

  const monthlyRevenue = useMemo(() => {
    const n = new Date();
    const buckets: { ym: string; month: string; value: number }[] = [];
    const indexByYm: Record<string, number> = {};
    for (let i = 5; i >= 0; i--) {
      const d = new Date(n.getFullYear(), n.getMonth() - i, 1);
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
      indexByYm[ym] = buckets.length;
      buckets.push({ ym, month: label, value: 0 });
    }

    entries.forEach(o => {
      if (!o.isBillable || o.fin_status !== 'pago') return;
      if (filterTech && o.technician_id !== filterTech) return;
      if (filterCustomer && o.customer_id !== filterCustomer) return;
      if (filterPM && o.payment_method !== filterPM) return;
      if (filterSource && o.source !== filterSource) return;

      const dateKey = toLocalDateKey(o.paid_at || o.data_conclusao || o.created_at);
      if (!dateKey) return;
      const idx = indexByYm[dateKey.slice(0, 7)];
      if (idx !== undefined) {
        buckets[idx].value += o.total;
      }
    });

    return buckets.map(({ month, value }) => ({ month, value }));
  }, [entries, filterTech, filterCustomer, filterPM, filterSource]);

  const pmRevenue = useMemo(() => {
    const map: Record<string, number> = {};
    periodFiltered
      .filter(o => o.isBillable && o.fin_status === 'pago')
      .forEach(o => {
        const key = o.payment_method || 'Não informado';
        map[key] = (map[key] ?? 0) + o.total;
      });
    return Object.entries(map)
      .map(([label, value], i) => ({ label, value, color: PM_COLORS[i % PM_COLORS.length] }))
      .sort((a, b) => b.value - a.value);
  }, [periodFiltered]);

  const clientRanking = useMemo(() => {
    const map: Record<string, number> = {};
    periodFiltered
      .filter(o => o.isBillable && o.fin_status === 'pago')
      .forEach(o => {
        const key = o.customer_name || '—';
        map[key] = (map[key] ?? 0) + o.total;
      });
    return Object.entries(map)
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [periodFiltered]);

  const techRevenue = useMemo(() => {
    const map: Record<string, number> = {};
    periodFiltered
      .filter(o => o.source === 'os' && o.isBillable && o.fin_status === 'pago' && o.technician_id)
      .forEach(o => {
        const key = o.technician_name || 'Sem técnico';
        map[key] = (map[key] ?? 0) + o.total;
      });
    return Object.entries(map)
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [periodFiltered]);

  // ─── Payment Control Table ──────────────────────────────────────────────────

  const tableFiltered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter(o => {
      if (applyDateToTable) {
        if (dateFrom && o.ref_date_key && o.ref_date_key < dateFrom) return false;
        if (dateTo && o.ref_date_key && o.ref_date_key > dateTo) return false;
      }
      if (filterTech && o.technician_id !== filterTech) return false;
      if (filterCustomer && o.customer_id !== filterCustomer) return false;
      if (filterPM && o.payment_method !== filterPM) return false;
      if (filterSource && o.source !== filterSource) return false;

      if (filterFinStatus === 'conferencia') {
        if (o.source !== 'os' || o.status !== 'Aguardando Conferência') return false;
      } else if (filterFinStatus === 'em_aberto') {
        if (o.source !== 'os' || ['Concluída', 'Cancelada', 'Aguardando Conferência'].includes(o.status)) return false;
      } else if (filterFinStatus === 'pendente') {
        if (!o.isBillable || o.fin_status !== 'pendente') return false;
      } else if (filterFinStatus === 'atrasado') {
        if (!o.isBillable || o.fin_status !== 'atrasado') return false;
      } else if (filterFinStatus) {
        if (o.fin_status !== filterFinStatus) return false;
      }

      if (q) {
        const matchCode = o.displayCode.toLowerCase().includes(q) || String(o.order_number).includes(q);
        const matchCustomer = o.customer_name.toLowerCase().includes(q);
        const matchTech = o.technician_name.toLowerCase().includes(q);
        const matchType = o.visit_type.toLowerCase().includes(q);
        if (!matchCode && !matchCustomer && !matchTech && !matchType) return false;
      }
      return true;
    });
  }, [entries, applyDateToTable, dateFrom, dateTo, filterTech, filterCustomer, filterPM, filterSource, filterFinStatus, search]);

  const pageCount = Math.max(1, Math.ceil(tableFiltered.length / PAGE_SIZE));
  const paged = tableFiltered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // ─── Boletos lookup & pagination ────────────────────────────────────────────

  const boletoByOrderId = useMemo(() => {
    const map: Record<string, Boleto> = {};
    for (const b of boletos) {
      if (!b.service_order_id) continue;
      const existing = map[b.service_order_id];
      // Prefer an open/overdue boleto over a paid one; otherwise keep the most recent
      if (!existing) {
        map[b.service_order_id] = b;
      } else {
        const existingEff = getEffectiveBoletoStatus(existing, todayKey);
        const currentEff = getEffectiveBoletoStatus(b, todayKey);
        if (existingEff === 'pago' && currentEff !== 'pago') {
          map[b.service_order_id] = b;
        }
      }
    }
    return map;
  }, [boletos, todayKey]);

  const enrichedBoletos = useMemo(
    () => boletos.map(b => ({ ...b, effectiveStatus: getEffectiveBoletoStatus(b, todayKey) })),
    [boletos, todayKey]
  );

  const boletoCounts = useMemo(() => {
    let emitido = 0;
    let vencido = 0;
    let pago = 0;
    for (const b of enrichedBoletos) {
      if (b.effectiveStatus === 'pago') pago += 1;
      else if (b.effectiveStatus === 'vencido') vencido += 1;
      else emitido += 1;
    }
    return { all: enrichedBoletos.length, emitido, vencido, pago };
  }, [enrichedBoletos]);

  const filteredBoletos = useMemo(() => {
    if (boletoFilter === 'all') return enrichedBoletos;
    return enrichedBoletos.filter(b => b.effectiveStatus === boletoFilter);
  }, [enrichedBoletos, boletoFilter]);

  const boletoPageCount = Math.max(1, Math.ceil(filteredBoletos.length / BOLETO_PAGE_SIZE));
  const pagedBoletos = filteredBoletos.slice((boletoPage - 1) * BOLETO_PAGE_SIZE, boletoPage * BOLETO_PAGE_SIZE);

  // ─── Export CSV (Excel PT-BR) ───────────────────────────────────────────────

  function exportCsv() {
    const csv = buildFinanceCsv(tableFiltered);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const suffix = dateFrom || dateTo ? `${dateFrom || 'inicio'}_${dateTo || 'fim'}` : 'todos';
    a.download = `financeiro_${suffix}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function toggleStatusFilter(target: FinStatusFilter) {
    setFilterFinStatus(prev => (prev === target ? '' : target));
  }

  const pipelineTotal = indicators.osAwaitingReviewCount + indicators.osOpenCount;

  return (
    <div className="flex flex-col h-full bg-slate-50">
      <Header title="Financeiro" subtitle="Controle de pagamentos, receitas e resultado" onMenuClick={onMenuClick} />

      <div className="bg-white border-b border-slate-200 px-6 py-2 flex gap-4">
        <button
          onClick={() => setActiveTab('geral')}
          className={`py-2 px-4 rounded-xl text-sm font-bold transition-colors ${
            activeTab === 'geral' ? 'bg-amber-100 text-amber-700' : 'text-slate-500 hover:bg-slate-100'
          }`}
        >
          Visão Geral
        </button>
        {(profile?.role === 'admin' || (profile?.role as string) === 'financeiro') && (
          <button
            onClick={() => setActiveTab('avancado')}
            className={`py-2 px-4 rounded-xl text-sm font-bold transition-colors ${
              activeTab === 'avancado' ? 'bg-amber-100 text-amber-700' : 'text-slate-500 hover:bg-slate-100'
            }`}
          >
            Controle Avançado
          </button>
        )}
      </div>

      {activeTab === 'avancado' ? (
        <AdvancedFinance profile={profile} />
      ) : (
      <div className="flex-1 overflow-auto p-4 sm:p-6 space-y-6">

        {/* ── Filters ─────────────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Filter size={14} className="text-amber-500" />
            <h3 className="text-sm font-semibold text-slate-700">Filtros</h3>

            {/* Quick Period Presets */}
            <div className="flex items-center gap-1 flex-wrap ml-1">
              {PERIOD_PRESETS.map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => applyPreset(p.id)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
                    activePreset === p.id
                      ? 'bg-amber-500 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-600 hover:bg-amber-50 hover:text-amber-700'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <div className="ml-auto flex items-center gap-3">
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={clearAllFilters}
                  className="flex items-center gap-1 text-xs text-slate-500 hover:text-red-600 transition-colors"
                >
                  <RotateCcw size={12} />
                  Limpar filtros
                </button>
              )}
              <button onClick={loadAll} disabled={loading} className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-amber-600 transition-colors">
                {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                Atualizar
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
            <div>
              <label className="text-xs text-slate-400 block mb-1">De</label>
              <input
                type="date"
                value={dateFrom}
                onChange={e => { setDateFrom(e.target.value); setActivePreset('custom'); }}
                className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-amber-500/30"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Até</label>
              <input
                type="date"
                value={dateTo}
                onChange={e => { setDateTo(e.target.value); setActivePreset('custom'); }}
                className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-amber-500/30"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Origem</label>
              <select
                value={filterSource}
                onChange={e => setFilterSource(e.target.value as '' | FinanceSource)}
                className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-amber-500/30"
              >
                <option value="">Todas</option>
                <option value="os">Ordens de Serviço</option>
                <option value="sale">Venda PDV</option>
                <option value="used_sale">Venda de Usados</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Técnico</label>
              <select
                value={filterTech}
                onChange={e => setFilterTech(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-amber-500/30"
              >
                <option value="">Todos</option>
                {technicians.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Forma de Pagamento</label>
              <select
                value={filterPM}
                onChange={e => setFilterPM(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-amber-500/30"
              >
                <option value="">Todas</option>
                {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Status</label>
              <select
                value={filterFinStatus}
                onChange={e => setFilterFinStatus(e.target.value as FinStatusFilter)}
                className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-amber-500/30"
              >
                <option value="">Todos</option>
                <option value="pago">Pago</option>
                <option value="pendente">Pendente (Concluídas)</option>
                <option value="atrasado">Atrasado</option>
                <option value="garantia">Isento / Garantia</option>
                <option value="cancelada">Cancelada</option>
                <option value="conferencia">OS Aguardando Conferência</option>
                <option value="em_aberto">OS em Aberto (Oficina)</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Cliente</label>
              <select
                value={filterCustomer}
                onChange={e => setFilterCustomer(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-amber-500/30"
              >
                <option value="">Todos ({customers.length})</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 size={28} className="text-amber-500 animate-spin" />
          </div>
        ) : (
          <>
            {/* ── Indicator Cards Row 1: Saúde Financeira ────────────────── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <button
                type="button"
                onClick={() => setFilterFinStatus('')}
                className={`text-left bg-green-50/80 hover:bg-green-50 rounded-xl border p-4 transition-all ${
                  filterFinStatus === '' ? 'border-green-300 ring-1 ring-green-200' : 'border-slate-200'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <DollarSign size={14} className="text-green-600" />
                    <span className="text-xs font-semibold text-slate-600">Faturamento (Concluído)</span>
                  </div>
                </div>
                <p className="text-xl font-extrabold text-green-700 leading-tight">{fmtCurrency(indicators.totalBilled)}</p>
                <p className="text-[11px] text-slate-500 mt-1.5">
                  {indicators.osConcludedCount} OS concluídas · {indicators.salesCount} vendas
                </p>
              </button>

              <button
                type="button"
                onClick={() => toggleStatusFilter('pago')}
                className={`text-left bg-emerald-50/80 hover:bg-emerald-50 rounded-xl border p-4 transition-all ${
                  filterFinStatus === 'pago' ? 'border-emerald-400 ring-2 ring-emerald-200' : 'border-slate-200'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 size={14} className="text-emerald-600" />
                    <span className="text-xs font-semibold text-slate-600">Total Recebido</span>
                  </div>
                  {filterFinStatus === 'pago' && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-600 text-white">Filtro</span>
                  )}
                </div>
                <p className="text-xl font-extrabold text-emerald-700 leading-tight">{fmtCurrency(indicators.totalRevenue)}</p>
                <p className="text-[11px] text-slate-500 mt-1.5">{indicators.paidCount} recebimentos quitados</p>
              </button>

              <button
                type="button"
                onClick={() => toggleStatusFilter('pendente')}
                className={`text-left bg-yellow-50/80 hover:bg-yellow-50 rounded-xl border p-4 transition-all ${
                  filterFinStatus === 'pendente' ? 'border-yellow-400 ring-2 ring-yellow-200' : 'border-slate-200'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <Clock size={14} className="text-yellow-600" />
                    <span className="text-xs font-semibold text-slate-600">A Receber (Pendente)</span>
                  </div>
                  {filterFinStatus === 'pendente' && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-yellow-500 text-white">Filtro</span>
                  )}
                </div>
                <p className="text-xl font-extrabold text-yellow-700 leading-tight">{fmtCurrency(indicators.totalPending)}</p>
                <p className="text-[11px] text-slate-500 mt-1.5">{indicators.pendingCount} títulos no prazo</p>
              </button>

              <button
                type="button"
                onClick={() => toggleStatusFilter('atrasado')}
                className={`text-left bg-red-50/80 hover:bg-red-50 rounded-xl border p-4 transition-all ${
                  filterFinStatus === 'atrasado' ? 'border-red-400 ring-2 ring-red-200' : 'border-slate-200'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <AlertCircle size={14} className="text-red-600" />
                    <span className="text-xs font-semibold text-slate-600">Em Atraso</span>
                  </div>
                  {filterFinStatus === 'atrasado' && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-600 text-white">Filtro</span>
                  )}
                </div>
                <p className="text-xl font-extrabold text-red-600 leading-tight">{fmtCurrency(indicators.totalLate)}</p>
                <p className="text-[11px] text-slate-500 mt-1.5">{indicators.lateCount} títulos vencidos</p>
              </button>
            </div>

            {/* ── Indicator Cards Row 2: Resultado & Operação ────────────── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="bg-rose-50/60 rounded-xl border border-slate-200 p-4">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <TrendingDown size={14} className="text-rose-600" />
                  <span className="text-xs font-semibold text-slate-600">Despesas do Período</span>
                </div>
                <p className="text-xl font-extrabold text-rose-700 leading-tight">{fmtCurrency(indicators.expensesPaid)}</p>
                <p className="text-[11px] text-slate-500 mt-1.5">
                  Pagas · Pendentes: {fmtCurrency(indicators.expensesPending)}
                </p>
              </div>

              <div className={`rounded-xl border border-slate-200 p-4 ${indicators.netResult >= 0 ? 'bg-teal-50/70' : 'bg-red-50/70'}`}>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Wallet size={14} className={indicators.netResult >= 0 ? 'text-teal-600' : 'text-red-600'} />
                  <span className="text-xs font-semibold text-slate-600">Resultado Líquido</span>
                </div>
                <p className={`text-xl font-extrabold leading-tight ${indicators.netResult >= 0 ? 'text-teal-700' : 'text-red-600'}`}>
                  {fmtCurrency(indicators.netResult)}
                </p>
                <p className="text-[11px] text-slate-500 mt-1.5">Recebido − Despesas pagas</p>
              </div>

              <div className="bg-amber-50/70 rounded-xl border border-slate-200 p-4">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <TrendingUp size={14} className="text-amber-600" />
                  <span className="text-xs font-semibold text-slate-600">Ticket Médio</span>
                </div>
                <p className="text-xl font-extrabold text-amber-700 leading-tight">{fmtCurrency(indicators.ticket)}</p>
                <p className="text-[11px] text-slate-500 mt-1.5">
                  Base: {indicators.paidCount} pagos
                  {indicators.warrantyCount > 0 ? ` · ${indicators.warrantyCount} garantias` : ''}
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  toggleStatusFilter(
                    indicators.osAwaitingReviewCount > 0 ? 'conferencia' : 'em_aberto'
                  )
                }
                className={`text-left bg-indigo-50/70 hover:bg-indigo-50 rounded-xl border p-4 transition-all ${
                  filterFinStatus === 'conferencia' || filterFinStatus === 'em_aberto'
                    ? 'border-indigo-400 ring-2 ring-indigo-200'
                    : 'border-slate-200'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <Wrench size={14} className="text-indigo-600" />
                    <span className="text-xs font-semibold text-slate-600">Pipeline Oficina</span>
                  </div>
                  {(filterFinStatus === 'conferencia' || filterFinStatus === 'em_aberto') && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-indigo-600 text-white">Filtro</span>
                  )}
                </div>
                <p className="text-xl font-extrabold text-indigo-700 leading-tight">{pipelineTotal} OS</p>
                <p className="text-[11px] text-slate-500 mt-1.5">
                  Conferência: {indicators.osAwaitingReviewCount} · Em aberto: {indicators.osOpenCount}
                </p>
              </button>
            </div>

            {/* ── Charts row ──────────────────────────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Monthly revenue */}
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold text-slate-800 flex items-center gap-2 text-sm">
                    <TrendingUp size={14} className="text-amber-500" />
                    Recebimentos Mensais (Últimos 6 meses)
                  </h3>
                  <span className="text-[10px] text-slate-400">Respeita filtros ativos</span>
                </div>
                <MonthBars data={monthlyRevenue} />
              </div>

              {/* Payment method donut */}
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2 text-sm">
                  <CreditCard size={14} className="text-amber-500" />
                  Recebimentos por Forma de Pagamento
                </h3>
                <DonutChart data={pmRevenue} />
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Client ranking */}
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2 text-sm">
                  <Users size={14} className="text-amber-500" />
                  Clientes que Mais Geram Receita
                </h3>
                <BarList data={clientRanking} valueFormatter={fmtCurrency} />
              </div>

              {/* Tech revenue */}
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold text-slate-800 flex items-center gap-2 text-sm">
                    <BarChart3 size={14} className="text-amber-500" />
                    Faturamento por Técnico (OS)
                  </h3>
                  <span className="text-[10px] text-slate-400">Apenas OSs com técnico</span>
                </div>
                <BarList data={techRevenue} valueFormatter={fmtCurrency} />
              </div>
            </div>

            {/* ── Inadimplência ──────────────────────────────────────────── */}
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-slate-800 flex items-center gap-2 text-sm">
                  <AlertCircle size={14} className="text-red-500" />
                  Inadimplência (Títulos Concluídos / Faturáveis)
                </h3>
                <span className="text-[11px] text-slate-400">
                  Base: {fmtCurrency(indicators.totalBilled)}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-4">
                {[
                  { label: 'Recebido', value: indicators.totalRevenue, color: '#10b981' },
                  { label: 'Pendente', value: indicators.totalPending, color: '#f59e0b' },
                  { label: 'Atrasado', value: indicators.totalLate, color: '#ef4444' },
                ].map(item => {
                  const total = indicators.totalRevenue + indicators.totalPending + indicators.totalLate;
                  const pct = total > 0 ? (item.value / total) * 100 : 0;
                  return (
                    <div key={item.label} className="text-center">
                      <div className="w-16 h-16 rounded-full mx-auto mb-2 flex items-center justify-center text-white font-bold text-sm"
                        style={{ background: `conic-gradient(${item.color} ${pct}%, #f1f5f9 0)` }}>
                        <span className="bg-white rounded-full w-10 h-10 flex items-center justify-center text-[10px] font-bold" style={{ color: item.color }}>
                          {pct.toFixed(0)}%
                        </span>
                      </div>
                      <p className="text-xs font-semibold text-slate-700">{item.label}</p>
                      <p className="text-xs text-slate-500">{fmtCurrency(item.value)}</p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── Payment Control Table ──────────────────────────────────── */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3 flex-wrap">
                <DollarSign size={14} className="text-amber-500" />
                <h3 className="font-bold text-slate-800 text-sm">Controle de Pagamentos</h3>
                <span className="text-xs text-slate-400">{tableFiltered.length} registros</span>

                {/* Explicit Date Scope Toggle */}
                <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-lg cursor-pointer select-none hover:border-amber-300">
                  <input
                    type="checkbox"
                    checked={applyDateToTable}
                    onChange={e => setApplyDateToTable(e.target.checked)}
                    className="rounded border-slate-300 text-amber-500 focus:ring-amber-500/30"
                  />
                  <span>Filtrar por período</span>
                </label>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                  applyDateToTable
                    ? 'bg-amber-50 text-amber-700 border border-amber-200'
                    : 'bg-slate-100 text-slate-500'
                }`}>
                  {applyDateToTable
                    ? `${dateFrom ? formatLocalDateBR(dateFrom) : 'Início'} a ${dateTo ? formatLocalDateBR(dateTo) : 'Hoje'}`
                    : 'Todos os períodos'}
                </span>

                <div className="relative ml-auto">
                  <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Buscar nº, cliente..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="pl-7 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-amber-500/30 w-44"
                  />
                </div>
                <button
                  type="button"
                  onClick={exportCsv}
                  className="flex items-center gap-1.5 text-xs border border-slate-200 text-slate-600 hover:bg-slate-50 px-3 py-1.5 rounded-lg transition-colors"
                  title="Exportar CSV compatível com Excel PT-BR"
                >
                  <Download size={12} />
                  CSV
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th className="px-4 py-2.5 text-left font-semibold text-slate-500">Origem / Nº</th>
                      <th className="px-4 py-2.5 text-left font-semibold text-slate-500">Cliente</th>
                      <th className="px-4 py-2.5 text-left font-semibold text-slate-500 hidden sm:table-cell">Técnico</th>
                      <th className="px-4 py-2.5 text-left font-semibold text-slate-500 hidden md:table-cell">Forma Pgto</th>
                      <th className="px-4 py-2.5 text-left font-semibold text-slate-500">Status</th>
                      <th className="px-4 py-2.5 text-left font-semibold text-slate-500 hidden lg:table-cell">Vencimento / Pgto</th>
                      <th className="px-4 py-2.5 text-right font-semibold text-slate-500">Total</th>
                      <th className="px-4 py-2.5 text-center font-semibold text-slate-500">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {paged.length === 0 && (
                      <tr><td colSpan={8} className="text-center py-10 text-slate-400">Nenhum lançamento encontrado</td></tr>
                    )}
                    {paged.map(o => {
                      const fs = o.fin_status;
                      const cfg = FIN_STATUS_CONFIG[fs];
                      const existingBoleto = o.source === 'os' ? boletoByOrderId[o.id] : undefined;
                      return (
                        <tr
                          key={`${o.source}-${o.id}`}
                          className={`transition-colors ${fs === 'atrasado' && o.isBillable ? 'bg-red-50/40 hover:bg-red-50' : 'hover:bg-slate-50/70'}`}
                        >
                          <td className="px-4 py-2.5 whitespace-nowrap">
                            {o.source === 'os' && (
                              <span className="font-semibold text-slate-700">{o.displayCode}</span>
                            )}
                            {o.source === 'sale' && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200 font-bold text-[10px]">
                                PDV
                              </span>
                            )}
                            {o.source === 'used_sale' && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 border border-purple-200 font-bold text-[10px]">
                                USADO
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-slate-600 max-w-[160px] truncate" title={o.customer_name}>
                            {o.customer_name}
                          </td>
                          <td className="px-4 py-2.5 text-slate-500 hidden sm:table-cell">{o.technician_name}</td>
                          <td className="px-4 py-2.5 text-slate-500 hidden md:table-cell">{o.payment_method_label}</td>
                          <td className="px-4 py-2.5">
                            <div className="flex flex-col items-start gap-1">
                              <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.text}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                                {cfg.label}
                              </span>
                              {o.source === 'os' && o.status === 'Aguardando Conferência' && (
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200">
                                  Em Conferência
                                </span>
                              )}
                              {o.source === 'os' && !o.isBillable && o.status !== 'Aguardando Conferência' && fs !== 'cancelada' && (
                                <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                                  {o.status}
                                </span>
                              )}
                              {o.source === 'os' && o.total === 0 && fs !== 'cancelada' && fs !== 'garantia' && (
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
                                  Sem valor
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-2.5 text-slate-500 hidden lg:table-cell whitespace-nowrap">
                            {fs === 'pago' && o.paid_at ? (
                              <span className="text-emerald-600 font-medium">
                                Pago: {formatLocalDateBR(o.paid_at)}
                              </span>
                            ) : o.due_date ? (
                              <span className={fs === 'atrasado' && o.isBillable ? 'text-red-500 font-semibold' : ''}>
                                Venc: {formatLocalDateBR(o.due_date)}
                              </span>
                            ) : (
                              <span className="text-slate-400">{formatLocalDateBR(o.created_at)}</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-right font-bold text-slate-700 whitespace-nowrap">
                            {fmtCurrency(o.total)}
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center justify-center gap-1.5">
                              {o.source === 'os' && onOpenOrder && fs !== 'cancelada' && (
                                <button
                                  type="button"
                                  onClick={() => onOpenOrder(o.id)}
                                  title="Abrir / editar OS na Oficina"
                                  className="p-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-lg transition-colors"
                                >
                                  <Pencil size={12} />
                                </button>
                              )}
                              {fs !== 'pago' && fs !== 'cancelada' && fs !== 'garantia' && (
                                <button
                                  type="button"
                                  onClick={() => setPayEntry(o)}
                                  title="Registrar pagamento"
                                  className="p-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 rounded-lg transition-colors"
                                >
                                  <CheckCircle2 size={12} />
                                </button>
                              )}
                              {o.source === 'os' && fs !== 'cancelada' && fs !== 'garantia' && (existingBoleto || fs !== 'pago') && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (existingBoleto) {
                                      generateBoletoPDF(existingBoleto, companyConfig);
                                    } else {
                                      setBoletoOrder(o);
                                    }
                                  }}
                                  title={existingBoleto ? 'Reimprimir boleto emitido (sem duplicar)' : 'Gerar boleto'}
                                  className={`p-1.5 rounded-lg transition-colors ${
                                    existingBoleto
                                      ? 'bg-blue-50 hover:bg-blue-100 text-blue-600'
                                      : 'bg-amber-50 hover:bg-amber-100 text-amber-600'
                                  }`}
                                >
                                  <FileText size={12} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between">
                <span className="text-xs text-slate-400">Página {page} de {pageCount}</span>
                <div className="flex gap-1">
                  <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
                    className="p-1 rounded hover:bg-slate-100 disabled:opacity-30 transition-colors">
                    <ChevronLeft size={14} />
                  </button>
                  <button disabled={page >= pageCount} onClick={() => setPage(p => p + 1)}
                    className="p-1 rounded hover:bg-slate-100 disabled:opacity-30 transition-colors">
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            </div>

            {/* ── Boletos Table ────────────────────────────────────────────── */}
            {boletos.length > 0 && (
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3 flex-wrap">
                  <FileText size={14} className="text-amber-500" />
                  <h3 className="font-bold text-slate-800 text-sm">Boletos Emitidos</h3>
                  <span className="text-xs text-slate-400">{filteredBoletos.length} de {boletos.length}</span>

                  <div className="flex items-center gap-1 ml-auto flex-wrap">
                    {(
                      [
                        { id: 'all', label: `Todos (${boletoCounts.all})` },
                        { id: 'emitido', label: `Em aberto (${boletoCounts.emitido})` },
                        { id: 'vencido', label: `Vencidos (${boletoCounts.vencido})` },
                        { id: 'pago', label: `Pagos (${boletoCounts.pago})` },
                      ] as { id: BoletoFilter; label: string }[]
                    ).map(chip => (
                      <button
                        key={chip.id}
                        type="button"
                        onClick={() => setBoletoFilter(chip.id)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
                          boletoFilter === chip.id
                            ? 'bg-amber-500 text-white'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        {chip.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100">
                        <th className="px-4 py-2.5 text-left font-semibold text-slate-500">Código</th>
                        <th className="px-4 py-2.5 text-left font-semibold text-slate-500">Cliente</th>
                        <th className="px-4 py-2.5 text-left font-semibold text-slate-500">Status</th>
                        <th className="px-4 py-2.5 text-left font-semibold text-slate-500 hidden sm:table-cell">Emissão</th>
                        <th className="px-4 py-2.5 text-left font-semibold text-slate-500">Vencimento</th>
                        <th className="px-4 py-2.5 text-right font-semibold text-slate-500">Valor</th>
                        <th className="px-4 py-2.5 text-center font-semibold text-slate-500">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {pagedBoletos.length === 0 && (
                        <tr><td colSpan={7} className="text-center py-8 text-slate-400">Nenhum boleto neste filtro</td></tr>
                      )}
                      {pagedBoletos.map(b => {
                        const cfg = BOLETO_STATUS[b.effectiveStatus];
                        const isPaying = payingBoletoId === b.id;
                        return (
                          <tr
                            key={b.id}
                            className={`transition-colors ${b.effectiveStatus === 'vencido' ? 'bg-red-50/30 hover:bg-red-50/60' : 'hover:bg-slate-50/70'}`}
                          >
                            <td className="px-4 py-2.5 font-mono font-semibold text-slate-600">{b.id.slice(0, 8).toUpperCase()}</td>
                            <td className="px-4 py-2.5 text-slate-600 max-w-[160px] truncate" title={b.customer_name}>{b.customer_name}</td>
                            <td className="px-4 py-2.5">
                              <span className={`inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.text}`}>
                                {cfg.label}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 text-slate-400 hidden sm:table-cell">{formatLocalDateBR(b.issued_at)}</td>
                            <td className={`px-4 py-2.5 font-medium ${b.effectiveStatus === 'vencido' ? 'text-red-500 font-semibold' : 'text-slate-600'}`}>
                              {formatLocalDateBR(b.due_date)}
                            </td>
                            <td className="px-4 py-2.5 text-right font-bold text-slate-700">{fmtCurrency(b.amount)}</td>
                            <td className="px-4 py-2.5">
                              <div className="flex items-center justify-center gap-1.5">
                                {b.effectiveStatus !== 'pago' && (
                                  <button
                                    type="button"
                                    disabled={isPaying}
                                    onClick={() => markBoletoAsPaid(b)}
                                    className="p-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 rounded-lg transition-colors disabled:opacity-50"
                                    title="Dar baixa no boleto (marca boleto e OS como pagos)"
                                  >
                                    {isPaying ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => generateBoletoPDF(b, companyConfig)}
                                  className="p-1.5 bg-slate-50 hover:bg-amber-50 text-slate-500 hover:text-amber-600 rounded-lg transition-colors"
                                  title="Reimprimir boleto PDF"
                                >
                                  <Download size={12} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {boletoPageCount > 1 && (
                  <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-xs text-slate-400">Página {boletoPage} de {boletoPageCount}</span>
                    <div className="flex gap-1">
                      <button
                        disabled={boletoPage <= 1}
                        onClick={() => setBoletoPage(p => p - 1)}
                        className="p-1 rounded hover:bg-slate-100 disabled:opacity-30 transition-colors"
                      >
                        <ChevronLeft size={14} />
                      </button>
                      <button
                        disabled={boletoPage >= boletoPageCount}
                        onClick={() => setBoletoPage(p => p + 1)}
                        className="p-1 rounded hover:bg-slate-100 disabled:opacity-30 transition-colors"
                      >
                        <ChevronRight size={14} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
      )}

      {boletoOrder && (
        <BoletoModal
          order={boletoOrder}
          onClose={() => setBoletoOrder(null)}
          onCreated={loadAll}
          companyConfig={companyConfig}
          userName={profile?.full_name || 'Operador'}
        />
      )}

      {payEntry && (
        <PaymentModal
          entry={payEntry}
          onClose={() => setPayEntry(null)}
          onConfirm={registerPayment}
          onOpenOrder={onOpenOrder}
        />
      )}
    </div>
  );
}
