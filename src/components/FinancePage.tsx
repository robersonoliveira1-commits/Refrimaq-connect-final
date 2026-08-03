import { printHtml } from '../utils/print';
import { useEffect, useState, useMemo } from 'react';
import {
  DollarSign, TrendingUp, AlertCircle, Clock, CheckCircle2,
  Filter, Download, Search, ChevronLeft, ChevronRight,
  Loader2, RefreshCw, FileText, CreditCard, Users, BarChart3,
  X, Calendar, Plus,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { fetchCompanyConfig, CompanyConfig, EMPTY_CONFIG } from '../lib/companyConfig';
import Header from './Header';
import { useAuth } from '../lib/auth';
import AdvancedFinance from './AdvancedFinance';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ServiceOrder {
  id: string;
  order_number: number;
  warranty_type?: string | null;
  customer_id: string;
  technician_id: string | null;
  visit_type: string;
  status: string;
  status_financeiro: string;
  labor_cost: number;
  payment_method: string | null;
  paid_at: string | null;
  due_date: string | null;
  data_conclusao: string | null;
  created_at: string;
  customer_name?: string;
  technician_name?: string;
  parts_total?: number;
  total?: number;
  fin_status?: FinStatus;
}

interface OSPart {
  service_order_id: string;
  quantity: number;
  unit_price: number;
}

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

type FinStatus = 'pago' | 'pendente' | 'atrasado' | 'cancelada';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtCurrency = (v: number | null | undefined) =>
  (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const fmtDate = (d: string | null) => {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('pt-BR');
};

function getFinStatus(order: ServiceOrder): FinStatus {
  if (order.status_financeiro === 'cancelada' || order.status === 'Cancelada') return 'cancelada';
  const sf = order.status_financeiro;
  if (sf === 'pago') return 'pago';
  if (sf === 'atrasado') return 'atrasado';
  if (order.due_date && new Date(order.due_date) < new Date() && sf !== 'pago') return 'atrasado';
  return 'pendente';
}

const FIN_STATUS_CONFIG = {
  pago:     { label: 'Pago',     bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  pendente: { label: 'Pendente', bg: 'bg-yellow-50 border-yellow-200',   text: 'text-yellow-700',  dot: 'bg-yellow-400' },
  atrasado: { label: 'Atrasado', bg: 'bg-red-50 border-red-200',         text: 'text-red-700',     dot: 'bg-red-500'    },
  cancelada: { label: 'Cancelada', bg: 'bg-slate-50 border-slate-200',   text: 'text-slate-500',   dot: 'bg-slate-400'  },
};

const BOLETO_STATUS = {
  emitido: { label: 'Emitido',  bg: 'bg-blue-50 border-blue-200',       text: 'text-blue-700' },
  pago:    { label: 'Pago',     bg: 'bg-emerald-50 border-emerald-200',  text: 'text-emerald-700' },
  vencido: { label: 'Vencido',  bg: 'bg-red-50 border-red-200',          text: 'text-red-700' },
};

const PAYMENT_METHODS = ['Dinheiro', 'Pix', 'Cartão de Débito', 'Cartão de Crédito', 'Boleto', 'Transferência'];
const PM_COLORS = ['#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#f97316', '#06b6d4'];
const PAGE_SIZE = 10;

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
          <span className="text-xs text-slate-500 w-32 truncate flex-shrink-0">{d.label}</span>
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
      {data.length === 0 && <p className="text-xs text-slate-400 text-center py-3">Sem dados</p>}
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
          <span className="text-[10px] font-medium text-slate-500">{m.value > 0 ? fmtCurrency(m.value).replace('R$\u00a0', '') : ''}</span>
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
  if (total === 0) return <p className="text-xs text-slate-400 text-center py-4">Sem dados</p>;
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
  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8" />
<title>Boleto #${b.id.slice(0,8).toUpperCase()}</title>
<style>
  * { box-sizing: border-box; margin:0; padding:0; }
  body { font-family: Arial, sans-serif; font-size: 12px; color: #1e293b; background: #fff; }
  .page { padding: 24px; max-width: 760px; margin: 0 auto; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 12px; border-bottom: 2px solid #000; margin-bottom: 16px; }
  .bank-name { font-size: 20px; font-weight: 900; letter-spacing: 2px; }
  .bank-code { font-size: 18px; font-weight: 700; border-left: 2px solid #000; border-right: 2px solid #000; padding: 0 12px; margin: 0 12px; }
  .barcode-line { font-size: 16px; font-weight: 700; letter-spacing: 1px; }
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
    background: ${b.status === 'pago' ? '#d1fae5' : b.status === 'vencido' ? '#fee2e2' : '#dbeafe'};
    color: ${b.status === 'pago' ? '#065f46' : b.status === 'vencido' ? '#991b1b' : '#1e40af'};
    border: 1px solid ${b.status === 'pago' ? '#6ee7b7' : b.status === 'vencido' ? '#fca5a5' : '#93c5fd'};
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
      <div class="status-badge">${b.status === 'pago' ? 'PAGO' : b.status === 'vencido' ? 'VENCIDO' : 'EMITIDO'}</div>
      <div style="font-size:10px;color:#666;margin-top:4px;">Emissão: ${new Date(b.issued_at).toLocaleDateString('pt-BR')}</div>
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
    <div class="cell"><label>Código do Boleto</label><span>${b.id.slice(0,8).toUpperCase()}</span></div>
  </div>

  <div class="section-title">Informações do Pagamento</div>
  <div class="row cols-4">
    <div class="cell"><label>Vencimento</label><span>${new Date(b.due_date + 'T00:00:00').toLocaleDateString('pt-BR')}</span></div>
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
      <strong>Venc:</strong> ${new Date(b.due_date + 'T00:00:00').toLocaleDateString('pt-BR')} &nbsp;|&nbsp;
      <strong>R$</strong> ${(b.amount || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
    </div>
  </div>
  <div class="row cols-2">
    <div class="cell"><label>Pagador</label><span>${b.customer_name}</span></div>
    <div class="cell"><label>Nosso Número</label><span>${b.id.slice(0,8).toUpperCase()}</span></div>
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
  order: ServiceOrder;
  onClose: () => void;
  onCreated: () => void;
  companyConfig: CompanyConfig;
}

function BoletoModal({ order, onClose, onCreated, companyConfig }: BoletoModalProps) {
  const today = new Date();
  const def = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 7).toISOString().slice(0, 10);
  const [dueDate, setDueDate] = useState(order.due_date ?? def);
  const [notes, setNotes] = useState(companyConfig.boleto_message || '');
  const [saving, setSaving] = useState(false);

  async function create() {
    setSaving(true);
    const { data } = await supabase.from('boletos').insert({
      service_order_id: order.id,
      customer_name: order.customer_name ?? '',
      amount: order.total ?? 0,
      due_date: dueDate,
      notes: notes || null,
    }).select().single();

    if (order.due_date !== dueDate) {
      await supabase.from('service_orders').update({ due_date: dueDate }).eq('id', order.id);
    }

    if (data) {
      generateBoletoPDF({ ...(data as Boleto), status: 'emitido' }, companyConfig);
    }
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
            Gerar Boleto — OS #{String(order.order_number).padStart(4, '0')}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors">
            <X size={16} />
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="bg-slate-50 rounded-xl p-4 space-y-1">
            <p className="text-xs text-slate-500">Cliente</p>
            <p className="font-semibold text-slate-800">{order.customer_name}</p>
            <p className="text-xs text-slate-500 mt-1">Valor total</p>
            <p className="text-xl font-extrabold text-green-600">{fmtCurrency(order.total ?? 0)}</p>
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
  order: ServiceOrder;
  onClose: () => void;
  onConfirm: (orderId: string, method: string, amount: number) => Promise<void>;
}

function PaymentModal({ order, onClose, onConfirm }: PaymentModalProps) {
  const [method, setMethod] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!method) return;
    setSaving(true);
    await onConfirm(order.id, method, order.total ?? 0);
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="font-bold text-slate-800 flex items-center gap-2">
            <CreditCard size={16} className="text-emerald-500" />
            Registrar Pagamento — OS #{String(order.order_number).padStart(4, '0')}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Status banner */}
          <div className="bg-slate-50 rounded-xl p-4 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">Cliente</span>
              <span className="text-sm font-semibold text-slate-800">{order.customer_name}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">Status operacional</span>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                order.status === 'Concluída' ? 'bg-emerald-50 text-emerald-700' : 'bg-yellow-50 text-yellow-700'
              }`}>{order.status}</span>
            </div>
            <div className="flex items-center justify-between pt-1 border-t border-slate-200 mt-1">
              <span className="text-xs text-slate-500">Valor a receber</span>
              <span className="text-xl font-extrabold text-green-600">{fmtCurrency(order.total ?? 0)}</span>
            </div>
          </div>

          {/* Payment method */}
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-2">Forma de Pagamento</label>
            <div className="grid grid-cols-2 gap-2">
              {PAYMENT_METHODS.map(pm => (
                <button
                  key={pm}
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
            disabled={saving || !method}
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

interface Props { onMenuClick: () => void; refresh: number }

export default function FinancePage({ onMenuClick, refresh }: Props) {
  const { profile } = useAuth();
  const [activeTab, setActiveTab] = useState<'geral' | 'avancado'>('geral');
  const [loading, setLoading] = useState(true);

  const [orders, setOrders] = useState<ServiceOrder[]>([]);
  const [boletos, setBoletos] = useState<Boleto[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [companyConfig, setCompanyConfig] = useState<CompanyConfig>(EMPTY_CONFIG);

  // Filters
  const formatDate = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  const now = new Date();
  const pastDate = new Date();
  pastDate.setDate(now.getDate() - 30);
  const thirtyDaysAgo = formatDate(pastDate);
  const todayStr = formatDate(now);

  const [dateFrom, setDateFrom] = useState(thirtyDaysAgo);
  const [dateTo, setDateTo] = useState(todayStr);
  const [filterTech, setFilterTech] = useState('');
  const [filterCustomer, setFilterCustomer] = useState('');
  const [filterPM, setFilterPM] = useState('');
  const [filterFinStatus, setFilterFinStatus] = useState<'' | FinStatus>('');

  // Table
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  // Modals
  const [boletoOrder, setBoletoOrder] = useState<ServiceOrder | null>(null);
  const [payOrder, setPayOrder] = useState<ServiceOrder | null>(null);

  useEffect(() => { loadAll(); }, [refresh]);

  async function loadAll() {
    setLoading(true);
    const [
      { data: ordData },
      { data: partsData },
      { data: techData },
      { data: custData },
      { data: boletoData },
      { data: salesData },
      { data: usedSalesData },
      cfg,
    ] = await Promise.all([
      supabase.from('service_orders').select('*, customers(name)').order('created_at', { ascending: false }),
      supabase.from('service_order_parts').select('service_order_id,quantity,unit_price,product_id'),
      supabase.from('user_profiles').select('id,full_name').eq('active', true),
      supabase.from('customers').select('id,name').order('name').limit(500),
      supabase.from('boletos').select('*').order('created_at', { ascending: false }),
      supabase.from('sales').select('*').order('created_at', { ascending: false }),
      supabase.from('used_item_sales').select('*').order('created_at', { ascending: false }),
      fetchCompanyConfig(),
    ]);

    const techs = (techData as unknown as Technician[]) ?? [];
    const techMap = Object.fromEntries(techs.map(t => [t.id, t.full_name]));
    const cust = (custData as unknown as Customer[]) ?? [];

    const partsRaw = (partsData as any[]) ?? [];
    const partsMap: Record<string, number> = {};
    partsRaw.forEach(p => {
      // If product_id is null, the item is a service or manual item, which is already aggregated into labor_cost
      if (p.product_id) {
        partsMap[p.service_order_id] = (partsMap[p.service_order_id] ?? 0) + p.quantity * p.unit_price;
      }
    });

    const enriched: ServiceOrder[] = ((ordData as any) ?? []).map((o: any) => {
      const pt = partsMap[o.id] ?? 0;
      const total = pt + (o.labor_cost ?? 0);
      return {
        ...o,
        customer_name: o.customers?.name ?? '—',
        technician_name: o.technician_id ? (techMap[o.technician_id] ?? '—') : '—',
        payment_method: o.payment_method || (o.status_financeiro === 'pendente' || getFinStatus({ ...o, total }) === 'pendente' ? 'A definir' : '—'),
        parts_total: pt,
        total,
        fin_status: getFinStatus({ ...o, total }),
      };
    });

    const salesRaw = Array.isArray(salesData) ? salesData : [];
    const usedSalesRaw = Array.isArray(usedSalesData) ? usedSalesData : [];
    
    const combinedSales = [
      ...salesRaw.map(s => ({ ...s, _type: 'Venda Avulsa', _notes: s.notes || 'Venda' })),
      ...usedSalesRaw.map(s => ({ ...s, _type: 'Venda de Usado', _notes: s.notes || 'Venda de Usado' }))
    ];

    const salesOrders: ServiceOrder[] = combinedSales.map(s => {
      const isPendente = s.paid_amount != null && s.total != null && s.paid_amount < s.total;
      return {
        id: s.id,
        order_number: 0,
        customer_id: '',
        technician_id: null,
        visit_type: s._type,
        priority: '',
        status: 'Concluída',
        status_financeiro: isPendente ? 'pendente' : 'pago',
        diagnosis: s._notes,
        labor_cost: 0,
        payment_method: s.payment_method || (isPendente ? 'A definir' : '—'),
        paid_at: s.created_at,
      due_date: null,
      data_conclusao: s.created_at,
      equip_type: '',
      equip_brand: '',
      equip_model: '',
      equip_serial: '',
      equip_gas: '',
      equip_voltage: '',
      equip_accessories: '',
      equip_condition: '',
      created_at: s.created_at,
      updated_at: s.created_at,
      created_by: '',
      is_rework: false,
      customer_name: s.customer_name || 'Cliente (Venda)',
      technician_name: '—',
      parts_total: s.total,
      total: s.total,
      fin_status: isPendente ? 'pendente' : 'pago'
    };
  });

    const allOrders = [...enriched, ...salesOrders].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    setOrders(allOrders);
    setBoletos((boletoData as unknown as Boleto[]) ?? []);
    setTechnicians(techs);
    setCustomers(cust);
    setCompanyConfig(cfg);
    setLoading(false);
  }

  async function registerPayment(orderId: string, method: string, amount: number) {
    // ── Financial closure only ────────────────────────────────────────────────
    // Does NOT alter status (operational) — only financial fields.
    await supabase.from('service_orders').update({
      status_financeiro: 'pago',
      payment_method: method,
      paid_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', orderId);

    // Update boleto if one was issued
    await supabase.from('boletos')
      .update({ status: 'pago', paid_at: new Date().toISOString() })
      .eq('service_order_id', orderId)
      .neq('status', 'pago');

    setPayOrder(null);
    loadAll();
  }

  // ─── Filtered orders ────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    return orders.filter(o => {
      const d = o.created_at.slice(0, 10);
      if (dateFrom && d < dateFrom) return false;
      if (dateTo && d > dateTo) return false;
      if (filterTech && o.technician_id !== filterTech) return false;
      if (filterCustomer && o.customer_id !== filterCustomer) return false;
      if (filterPM && o.payment_method !== filterPM) return false;
      if (filterFinStatus && o.fin_status !== filterFinStatus) return false;
      return true;
    });
  }, [orders, dateFrom, dateTo, filterTech, filterCustomer, filterPM, filterFinStatus]);

  // ─── Indicators ─────────────────────────────────────────────────────────────

  const indicators = useMemo(() => {
    const paid = filtered.filter(o => o.fin_status === 'pago');
    const pending = filtered.filter(o => o.fin_status === 'pendente');
    const late = filtered.filter(o => o.fin_status === 'atrasado');
    const totalRevenue = paid.reduce((s, o) => s + (o.total ?? 0), 0);
    const totalPending = pending.reduce((s, o) => s + (o.total ?? 0), 0);
    const totalLate = late.reduce((s, o) => s + (o.total ?? 0), 0);
    const totalBilled = totalRevenue + totalPending + totalLate;
    const ticket = paid.length > 0 ? totalRevenue / paid.length : 0;
    return { total: filtered.length, paid: paid.length, pending: pending.length, late: late.length, totalRevenue, totalPending, totalLate, ticket, totalBilled };
  }, [filtered]);

  // ─── Chart data ──────────────────────────────────────────────────────────────

  const monthlyRevenue = useMemo(() => {
    const map: Record<string, number> = {};
    const n = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(n.getFullYear(), n.getMonth() - i, 1);
      map[d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })] = 0;
    }
    orders.filter(o => o.fin_status === 'pago').forEach(o => {
      const key = new Date(o.paid_at ?? o.created_at).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
      if (key in map) map[key] += o.total ?? 0;
    });
    return Object.entries(map).map(([month, value]) => ({ month, value }));
  }, [orders]);

  const pmRevenue = useMemo(() => {
    const map: Record<string, number> = {};
    filtered.filter(o => o.fin_status === 'pago' && o.payment_method).forEach(o => {
      map[o.payment_method!] = (map[o.payment_method!] ?? 0) + (o.total ?? 0);
    });
    return Object.entries(map)
      .map(([label, value], i) => ({ label, value, color: PM_COLORS[i % PM_COLORS.length] }))
      .sort((a, b) => b.value - a.value);
  }, [filtered]);

  const clientRanking = useMemo(() => {
    const map: Record<string, number> = {};
    filtered.filter(o => o.fin_status === 'pago').forEach(o => {
      map[o.customer_name ?? '—'] = (map[o.customer_name ?? '—'] ?? 0) + (o.total ?? 0);
    });
    return Object.entries(map).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 8);
  }, [filtered]);

  const techRevenue = useMemo(() => {
    const map: Record<string, number> = {};
    filtered.filter(o => o.fin_status === 'pago').forEach(o => {
      map[o.technician_name ?? '—'] = (map[o.technician_name ?? '—'] ?? 0) + (o.total ?? 0);
    });
    return Object.entries(map).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 6);
  }, [filtered]);

  // ─── Table ────────────────────────────────────────────────────────────────────

  const tableFiltered = useMemo(() => {
    const q = search.toLowerCase();
    return filtered.filter(o =>
      !q ||
      String(o.order_number).includes(q) ||
      (o.customer_name ?? '').toLowerCase().includes(q) ||
      (o.technician_name ?? '').toLowerCase().includes(q)
    );
  }, [filtered, search]);

  const pageCount = Math.max(1, Math.ceil(tableFiltered.length / PAGE_SIZE));
  const paged = tableFiltered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // ─── Export ───────────────────────────────────────────────────────────────────

  function exportCsv() {
    const header = 'OS,Cliente,Técnico,Forma Pgto,Status Fin.,Valor Total,Abertura,Vencimento,Conclusão';
    const rows = tableFiltered.map(o => [
      `#${String(o.order_number).padStart(4, '0')}`,
      o.customer_name ?? '',
      o.technician_name ?? '',
      o.payment_method ?? '',
      o.fin_status ?? '',
      (o.total ?? 0).toFixed(2),
      o.created_at.slice(0, 10),
      o.due_date ?? '',
      o.paid_at ? o.paid_at.slice(0, 10) : '',
    ].join(','));
    const csv = [header, ...rows].join('\n');
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    a.download = `financeiro_${dateFrom}_${dateTo}.csv`;
    a.click();
  }

  const ordersWithBoleto = new Set(boletos.map(b => b.service_order_id));

  return (
    <div className="flex flex-col h-full bg-slate-50">
      <Header title="Financeiro" subtitle="Controle de pagamentos e faturamento" onMenuClick={onMenuClick} />

      <div className="bg-white border-b border-slate-200 px-6 py-2 flex gap-4">
        <button
          onClick={() => setActiveTab('geral')}
          className={`py-2 px-4 rounded-xl text-sm font-bold transition-colors ${
            activeTab === 'geral' ? 'bg-amber-100 text-amber-700' : 'text-slate-500 hover:bg-slate-100'
          }`}
        >
          Visão Geral
        </button>
        {(profile?.role === 'admin' || profile?.role === 'financeiro') && (
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
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Filter size={14} className="text-amber-500" />
            <h3 className="text-sm font-semibold text-slate-700">Filtros</h3>
            <button onClick={loadAll} disabled={loading} className="ml-auto flex items-center gap-1.5 text-xs text-slate-500 hover:text-amber-600 transition-colors">
              {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
              Atualizar
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div>
              <label className="text-xs text-slate-400 block mb-1">De</label>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-amber-500/30" />
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Até</label>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-amber-500/30" />
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Técnico</label>
              <select value={filterTech} onChange={e => setFilterTech(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-amber-500/30">
                <option value="">Todos</option>
                {technicians.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Forma de Pagamento</label>
              <select value={filterPM} onChange={e => setFilterPM(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-amber-500/30">
                <option value="">Todas</option>
                {PAYMENT_METHODS.map(m => <option key={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Status Financeiro</label>
              <select value={filterFinStatus} onChange={e => setFilterFinStatus(e.target.value as '' | FinStatus)}
                className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-amber-500/30">
                <option value="">Todos</option>
                <option value="pago">Pago</option>
                <option value="pendente">Pendente</option>
                <option value="atrasado">Atrasado</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Cliente</label>
              <select value={filterCustomer} onChange={e => setFilterCustomer(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-amber-500/30">
                <option value="">Todos</option>
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
            {/* ── Indicator Cards ────────────────────────────────────────── */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-4 xl:grid-cols-8 gap-3">
              {[
                { label: 'Total OS', value: indicators.total, icon: BarChart3, color: 'text-slate-700', bg: 'bg-slate-50' },
                { label: 'Faturamento', value: fmtCurrency(indicators.totalBilled), icon: DollarSign, color: 'text-green-600', bg: 'bg-green-50' },
                { label: 'Total Recebido', value: fmtCurrency(indicators.totalRevenue), icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50' },
                { label: 'Pendente', value: fmtCurrency(indicators.totalPending), icon: Clock, color: 'text-yellow-600', bg: 'bg-yellow-50' },
                { label: 'Atrasado', value: fmtCurrency(indicators.totalLate), icon: AlertCircle, color: 'text-red-600', bg: 'bg-red-50' },
                { label: 'Ticket Médio', value: fmtCurrency(indicators.ticket), icon: TrendingUp, color: 'text-amber-600', bg: 'bg-amber-50' },
                { label: 'OS Pagas', value: indicators.paid, icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50' },
                { label: 'OS Atrasadas', value: indicators.late, icon: AlertCircle, color: 'text-red-600', bg: 'bg-red-50' },
              ].map(card => (
                <div key={card.label} className={`${card.bg} rounded-xl border border-slate-200 p-3.5`}>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <card.icon size={13} className={card.color} />
                    <span className="text-[11px] text-slate-500 leading-none">{card.label}</span>
                  </div>
                  <p className={`text-base font-extrabold ${card.color} leading-none`}>{card.value}</p>
                </div>
              ))}
            </div>

            {/* ── Charts row ──────────────────────────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Monthly revenue */}
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2 text-sm">
                  <TrendingUp size={14} className="text-amber-500" />
                  Faturamento Mensal
                </h3>
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
                <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2 text-sm">
                  <BarChart3 size={14} className="text-amber-500" />
                  Faturamento por Técnico
                </h3>
                <BarList data={techRevenue} valueFormatter={fmtCurrency} />
              </div>
            </div>

            {/* ── Inadimplência ──────────────────────────────────────────── */}
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2 text-sm">
                <AlertCircle size={14} className="text-red-500" />
                Inadimplência
              </h3>
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

            {/* ── OS Table ──────────────────────────────────────────────── */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3 flex-wrap">
                <DollarSign size={14} className="text-amber-500" />
                <h3 className="font-bold text-slate-800 text-sm">Controle de Pagamentos</h3>
                <span className="text-xs text-slate-400">{tableFiltered.length} registros</span>
                <div className="relative ml-auto">
                  <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input type="text" placeholder="Buscar..." value={search}
                    onChange={e => { setSearch(e.target.value); setPage(1); }}
                    className="pl-7 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-amber-500/30 w-36" />
                </div>
                <button onClick={exportCsv} className="flex items-center gap-1.5 text-xs border border-slate-200 text-slate-600 hover:bg-slate-50 px-3 py-1.5 rounded-lg transition-colors">
                  <Download size={12} />
                  CSV
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th className="px-4 py-2.5 text-left font-semibold text-slate-500">OS</th>
                      <th className="px-4 py-2.5 text-left font-semibold text-slate-500">Cliente</th>
                      <th className="px-4 py-2.5 text-left font-semibold text-slate-500 hidden sm:table-cell">Técnico</th>
                      <th className="px-4 py-2.5 text-left font-semibold text-slate-500 hidden md:table-cell">Forma Pgto</th>
                      <th className="px-4 py-2.5 text-left font-semibold text-slate-500">Status</th>
                      <th className="px-4 py-2.5 text-left font-semibold text-slate-500 hidden lg:table-cell">Vencimento</th>
                      <th className="px-4 py-2.5 text-right font-semibold text-slate-500">Total</th>
                      <th className="px-4 py-2.5 text-center font-semibold text-slate-500">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {paged.length === 0 && (
                      <tr><td colSpan={8} className="text-center py-10 text-slate-400">Nenhuma OS encontrada</td></tr>
                    )}
                    {paged.map(o => {
                      const fs = o.fin_status ?? 'pendente';
                      const cfg = FIN_STATUS_CONFIG[fs];
                      const hasBoleto = ordersWithBoleto.has(o.id);
                      return (
                        <tr key={o.id} className={`transition-colors ${fs === 'atrasado' ? 'bg-red-50/40 hover:bg-red-50' : 'hover:bg-slate-50/70'}`}>
                          <td className="px-4 py-2.5 font-semibold text-slate-700">
                            #{String(o.order_number).padStart(4, '0')}
                          </td>
                          <td className="px-4 py-2.5 text-slate-600 max-w-[120px] truncate">{o.customer_name}</td>
                          <td className="px-4 py-2.5 text-slate-500 hidden sm:table-cell">{o.technician_name}</td>
                          <td className="px-4 py-2.5 text-slate-500 hidden md:table-cell">{o.payment_method ?? '—'}</td>
                          <td className="px-4 py-2.5">
                            <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.text}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                              {cfg.label}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-slate-400 hidden lg:table-cell">
                            {o.due_date ? (
                              <span className={o.fin_status === 'atrasado' ? 'text-red-500 font-semibold' : ''}>
                                {fmtDate(o.due_date)}
                              </span>
                            ) : '—'}
                          </td>
                          <td className="px-4 py-2.5 text-right font-bold text-slate-700">{fmtCurrency(o.total ?? 0)}</td>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center justify-center gap-1.5">
                              {fs !== 'pago' && fs !== 'cancelada' && (
                                <button
                                  onClick={() => setPayOrder(o)}
                                  title="Registrar pagamento"
                                  className="p-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 rounded-lg transition-colors"
                                >
                                  <CheckCircle2 size={12} />
                                </button>
                              )}
                              {fs !== 'cancelada' && (
                                <button
                                  onClick={() => setBoletoOrder(o)}
                                  title={hasBoleto ? 'Reimprimir boleto' : 'Gerar boleto'}
                                  className={`p-1.5 rounded-lg transition-colors ${hasBoleto ? 'bg-blue-50 hover:bg-blue-100 text-blue-600' : 'bg-amber-50 hover:bg-amber-100 text-amber-600'}`}
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
                <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3">
                  <FileText size={14} className="text-amber-500" />
                  <h3 className="font-bold text-slate-800 text-sm">Boletos Emitidos</h3>
                  <span className="text-xs text-slate-400">{boletos.length} boletos</span>
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
                        <th className="px-4 py-2.5 text-center font-semibold text-slate-500">PDF</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {boletos.slice(0, 20).map(b => {
                        const cfg = BOLETO_STATUS[b.status];
                        return (
                          <tr key={b.id} className="hover:bg-slate-50/70 transition-colors">
                            <td className="px-4 py-2.5 font-mono font-semibold text-slate-600">{b.id.slice(0, 8).toUpperCase()}</td>
                            <td className="px-4 py-2.5 text-slate-600 max-w-[140px] truncate">{b.customer_name}</td>
                            <td className="px-4 py-2.5">
                              <span className={`inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.text}`}>
                                {cfg.label}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 text-slate-400 hidden sm:table-cell">{fmtDate(b.issued_at)}</td>
                            <td className={`px-4 py-2.5 font-medium ${b.status === 'vencido' ? 'text-red-500' : 'text-slate-600'}`}>
                              {fmtDate(b.due_date)}
                            </td>
                            <td className="px-4 py-2.5 text-right font-bold text-slate-700">{fmtCurrency(b.amount)}</td>
                            <td className="px-4 py-2.5 text-center">
                              <button
                                onClick={() => generateBoletoPDF(b, companyConfig)}
                                className="p-1.5 bg-slate-50 hover:bg-amber-50 text-slate-500 hover:text-amber-600 rounded-lg transition-colors"
                                title="Reimprimir boleto"
                              >
                                <Download size={12} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
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
        />
      )}

      {payOrder && (
        <PaymentModal
          order={payOrder}
          onClose={() => setPayOrder(null)}
          onConfirm={registerPayment}
        />
      )}
    </div>
  );
}
