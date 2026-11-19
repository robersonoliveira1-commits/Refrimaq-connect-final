import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Package, Wrench, ArrowDownCircle, ArrowUpCircle, ClipboardList, BarChart3,
  Plus, Pencil, Trash2, Loader2, X, Save, Search, Download, Upload,
  AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, ChevronLeft, ChevronRight,
  Printer, RefreshCw, ArrowLeftRight, TrendingUp, Eye, Barcode, ShoppingCart,
  DollarSign, Calendar,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { logFinancialAudit } from '../lib/osStockSync';
import { toLocalDateKey, formatLocalDateBR } from '../lib/financeEngine';
import {
  ManualMovementType,
  ReportPeriod,
  safeLower,
  getProductPhotoUrl,
  computeManualMovement,
  getMovementSignedDelta,
  getExpenseIntegrationKind,
  computeGrossMarginPercent,
  filterMovementsByPeriod,
  computeInventoryReport,
  parseProductsCsv,
  buildProductsCsv,
  buildServicesCsv,
  buildMovementsCsv,
} from '../lib/partsServicesEngine';
import { printHtml } from '../utils/print';
import Header from './Header';
import PartsServicesPDVTab from './PartsServicesPDVTab';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Product {
  id: string;
  internal_code: string;
  name: string;
  category: string;
  manufacturer: string;
  unit: string;
  cost_price: number;
  unit_price: number;
  stock_quantity: number;
  stock_min: number;
  location: string;
  part_notes: string;
  photo_url: string;
  description: string;
  created_at: string;
  updated_at: string;
}

interface Service {
  id: string;
  name: string;
  category: string;
  estimated_time: string;
  technician_name: string;
  price: number;
  notes: string;
  active: boolean;
  created_at: string;
}

interface StockMovement {
  id: string;
  product_id: string;
  product_name: string;
  movement_type: string;
  quantity: number;
  quantity_before: number;
  quantity_after: number;
  reason: string;
  responsible: string;
  created_at: string;
}

interface StockAudit {
  id: string;
  responsible: string;
  notes: string;
  status: string;
  created_at: string;
  closed_at: string | null;
}

interface AuditItem {
  id: string;
  audit_id: string;
  product_id: string;
  product_name: string;
  system_quantity: number;
  counted_quantity: number | null;
  divergence: number | null;
  justification: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PART_CATEGORIES = ['Refrigeração', 'Elétrico', 'Hidráulico', 'Mecânico', 'Insumo', 'Ferramenta', 'Componente', 'Outros'];
const SVC_CATEGORIES  = ['Manutenção', 'Instalação', 'Revisão', 'Limpeza', 'Diagnóstico', 'Emergência', 'Outros'];
const UNITS           = ['un', 'pc', 'par', 'kit', 'mt', 'cm', 'kg', 'g', 'ml', 'L', 'cx', 'rolo'];
const MANUAL_MOVE_TYPES: ManualMovementType[] = ['entrada', 'saida', 'ajuste'];
const FILTER_MOVE_TYPES = ['entrada', 'saida', 'os', 'ajuste'];
const JUSTIFICATIONS  = ['Compra', 'Devolução de cliente', 'Ajuste de inventário', 'Uso em OS', 'Perda', 'Quebra', 'Furto', 'Erro de lançamento', 'Outros'];

const PECAS_PAGE_SIZE = 25;
const MV_PAGE_SIZE = 20;

const fmtCurrency = (v: number | undefined | null) =>
  (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtDate = (d: string | null | undefined) => formatLocalDateBR(d);
const fmtDateTime = (d: string | null | undefined) => (d ? new Date(d).toLocaleString('pt-BR') : '—');

const inputCls = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-400 bg-white';
const labelCls = 'text-xs font-semibold text-slate-600 block mb-1';

type Tab = 'pecas' | 'servicos' | 'pdv' | 'movimentacoes' | 'auditoria' | 'relatorios';

interface Props { onMenuClick: () => void; refresh: number }

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

function downloadCsvFile(csv: string, filename: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function escapeHtml(val: string | null | undefined): string {
  return String(val ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── EAN-13 generator ─────────────────────────────────────────────────────────

function generateEAN13(): string {
  const digits: number[] = Array.from({ length: 12 }, () => Math.floor(Math.random() * 10));
  const sum = digits.reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 1 : 3), 0);
  const check = (10 - (sum % 10)) % 10;
  return [...digits, check].join('');
}

// ─── PartsServicesPage ────────────────────────────────────────────────────────

export default function PartsServicesPage({ onMenuClick, refresh }: Props) {
  const { profile } = useAuth();
  const userName = profile?.full_name || 'Operador';
  const [tab, setTab] = useState<Tab>('pecas');
  const [quickMoveProductId, setQuickMoveProductId] = useState<string | null>(null);

  const tabs: { id: Tab; label: string; icon: typeof Package }[] = [
    { id: 'pecas',         label: 'Peças',           icon: Package },
    { id: 'servicos',      label: 'Serviços',        icon: Wrench },
    { id: 'pdv',           label: 'PDV / Orçamentos', icon: ShoppingCart },
    { id: 'movimentacoes', label: 'Movimentações',   icon: ArrowLeftRight },
    { id: 'auditoria',     label: 'Auditoria',       icon: ClipboardList },
    { id: 'relatorios',    label: 'Relatórios',      icon: BarChart3 },
  ];

  function handleQuickMove(productId: string) {
    setQuickMoveProductId(productId);
    setTab('movimentacoes');
  }

  return (
    <div className="flex flex-col h-full bg-slate-50">
      <Header
        title="Peças e Serviços"
        subtitle="Estoque, serviços, PDV, movimentações e auditoria"
        onMenuClick={onMenuClick}
      />

      {/* Tab bar */}
      <div className="bg-white border-b border-slate-200 px-4 overflow-x-auto">
        <div className="flex gap-0 min-w-max">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                tab === id
                  ? 'border-amber-500 text-amber-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <Icon size={15} />
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {tab === 'pecas' && (
          <PecasTab refresh={refresh} userName={userName} onQuickMove={handleQuickMove} />
        )}
        {tab === 'servicos' && <ServicosTab refresh={refresh} />}
        {tab === 'pdv' && <PartsServicesPDVTab />}
        {tab === 'movimentacoes' && (
          <MovimentacoesTab
            refresh={refresh}
            userName={userName}
            initialProductId={quickMoveProductId}
            onConsumedInitialProduct={() => setQuickMoveProductId(null)}
          />
        )}
        {tab === 'auditoria' && <AuditoriaTab userName={userName} />}
        {tab === 'relatorios' && <RelatoriosTab refresh={refresh} />}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB: PEÇAS
// ═══════════════════════════════════════════════════════════════════════════════

function PecasTab({
  refresh,
  userName,
  onQuickMove,
}: {
  refresh: number;
  userName: string;
  onQuickMove: (productId: string) => void;
}) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [alertFilter, setAlertFilter] = useState<'' | 'min' | 'zero' | 'pricing'>('');
  const [page, setPage] = useState(1);

  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState<Partial<Product> | null>(null);
  const [originalStock, setOriginalStock] = useState<number>(0);
  const [stockReason, setStockReason] = useState<string>('');
  const [formError, setFormError] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [sortField, setSortField] = useState<keyof Product>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const csvRef = useRef<HTMLInputElement>(null);
  const [importFeedback, setImportFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [importing, setImporting] = useState(false);

  const dynamicCategories = useMemo(() => {
    const cats = new Set(PART_CATEGORIES);
    products.forEach(p => { if (p.category) cats.add(p.category); });
    return Array.from(cats);
  }, [products]);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await fetchAllPages<Product>((from, to) =>
      supabase.from('products').select('*').eq('active', true).order('name').range(from, to)
    );
    setProducts(data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [refresh, load]);

  useEffect(() => {
    setPage(1);
  }, [search, catFilter, alertFilter, sortField, sortDir]);

  const filtered = useMemo(() => {
    const q = safeLower(search.trim());
    let list = products.filter(p => {
      const matchSearch =
        !q ||
        safeLower(p.name).includes(q) ||
        safeLower(p.internal_code).includes(q) ||
        safeLower(p.manufacturer).includes(q) ||
        safeLower(p.location).includes(q);
      const matchCat = !catFilter || p.category === catFilter;
      const qty = Number(p.stock_quantity) || 0;
      const min = Number(p.stock_min) || 0;
      const margin = computeGrossMarginPercent(p.unit_price, p.cost_price);
      const hasPricingIssue = (Number(p.unit_price) || 0) <= 0 || (margin !== null && margin < 0);

      const matchAlert =
        !alertFilter ||
        (alertFilter === 'zero' && qty === 0) ||
        (alertFilter === 'min' && qty > 0 && min > 0 && qty <= min) ||
        (alertFilter === 'pricing' && hasPricingIssue);

      return matchSearch && matchCat && matchAlert;
    });

    list = [...list].sort((a, b) => {
      const av = a[sortField] ?? '';
      const bv = b[sortField] ?? '';
      if (typeof av === 'number' && typeof bv === 'number') {
        return sortDir === 'asc' ? av - bv : bv - av;
      }
      const cmp = String(av).localeCompare(String(bv), 'pt-BR', { numeric: true });
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [products, search, catFilter, alertFilter, sortField, sortDir]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PECAS_PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PECAS_PAGE_SIZE, page * PECAS_PAGE_SIZE);

  function sort(f: keyof Product) {
    if (sortField === f) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortField(f); setSortDir('asc'); }
  }

  function SortIcon({ field }: { field: keyof Product }) {
    if (sortField !== field) return null;
    return sortDir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />;
  }

  const zeros = products.filter(p => (Number(p.stock_quantity) || 0) === 0).length;
  const mins = products.filter(p => {
    const qty = Number(p.stock_quantity) || 0;
    const min = Number(p.stock_min) || 0;
    return qty > 0 && min > 0 && qty <= min;
  }).length;
  const pricingIssues = products.filter(p => {
    const margin = computeGrossMarginPercent(p.unit_price, p.cost_price);
    return (Number(p.unit_price) || 0) <= 0 || (margin !== null && margin < 0);
  }).length;

  function openNew() {
    setFormError(null);
    setOriginalStock(0);
    setStockReason('');
    setEditItem({
      internal_code: '',
      name: '',
      category: 'Refrigeração',
      manufacturer: '',
      unit: 'un',
      cost_price: 0,
      unit_price: 0,
      stock_quantity: 0,
      stock_min: 0,
      location: '',
      part_notes: '',
      photo_url: '',
      description: '',
    });
    setShowModal(true);
  }

  function openEdit(p: Product) {
    setFormError(null);
    setOriginalStock(Number(p.stock_quantity) || 0);
    setStockReason('');
    setEditItem({
      ...p,
      photo_url: getProductPhotoUrl(p),
    });
    setShowModal(true);
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPhoto(true);
    setFormError(null);
    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `parts_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${ext}`;
      let publicUrl = '';

      const primary = await supabase.storage.from('product-photos').upload(path, file, { upsert: true });
      if (!primary.error && primary.data) {
        publicUrl = supabase.storage.from('product-photos').getPublicUrl(primary.data.path).data.publicUrl;
      } else {
        const fallback = await supabase.storage.from('used-items-photos').upload(path, file, { upsert: true });
        if (fallback.error || !fallback.data) throw fallback.error || new Error('Falha no upload');
        publicUrl = supabase.storage.from('used-items-photos').getPublicUrl(fallback.data.path).data.publicUrl;
      }

      setEditItem(prev => (prev ? { ...prev, photo_url: publicUrl } : prev));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido';
      setFormError(`Erro ao enviar a foto: ${msg}`);
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function handleSave() {
    if (!editItem) return;
    if (!editItem.name?.trim()) {
      setFormError('O nome da peça é obrigatório.');
      return;
    }

    const newStock = Math.max(0, Math.round(Number(editItem.stock_quantity) || 0));
    const isEditing = Boolean(editItem.id);
    const stockChanged = isEditing && newStock !== originalStock;

    if (stockChanged && !stockReason.trim()) {
      setFormError('Informe o motivo da alteração de estoque para registrar no livro-razão.');
      return;
    }

    setSaving(true);
    setFormError(null);

    const nowIso = new Date().toISOString();
    const cleanDesc =
      editItem.description && /^https?:\/\//i.test(editItem.description.trim())
        ? (editItem.photo_url ? '' : '')
        : (editItem.description ?? '');

    const payload = {
      internal_code: (editItem.internal_code ?? '').trim(),
      name: editItem.name.trim(),
      category: editItem.category || 'Outros',
      manufacturer: (editItem.manufacturer ?? '').trim(),
      unit: editItem.unit || 'un',
      cost_price: Math.max(0, Number(editItem.cost_price) || 0),
      unit_price: Math.max(0, Number(editItem.unit_price) || 0),
      stock_quantity: newStock,
      stock_min: Math.max(0, Math.round(Number(editItem.stock_min) || 0)),
      location: (editItem.location ?? '').trim(),
      part_notes: (editItem.part_notes ?? '').trim(),
      photo_url: (editItem.photo_url ?? '').trim(),
      description: cleanDesc,
      updated_at: nowIso,
    };

    if (isEditing && editItem.id) {
      const { error } = await supabase.from('products').update(payload).eq('id', editItem.id);
      if (error) {
        setFormError(`Erro ao salvar peça: ${error.message}`);
        setSaving(false);
        return;
      }

      if (stockChanged) {
        const delta = newStock - originalStock;
        const { error: mvErr } = await supabase.from('stock_movements').insert({
          product_id: editItem.id,
          product_name: payload.name,
          movement_type: 'ajuste',
          quantity: Math.abs(delta),
          quantity_before: originalStock,
          quantity_after: newStock,
          reason: stockReason.trim(),
          responsible: userName,
        });
        if (mvErr) {
          console.warn('Falha ao gravar stock_movements no ajuste de cadastro:', mvErr.message);
        }
      }
    } else {
      const { data: created, error } = await supabase
        .from('products')
        .insert({ ...payload, active: true })
        .select('id')
        .single();

      if (error || !created) {
        setFormError(`Erro ao cadastrar peça: ${error?.message || 'Erro desconhecido'}`);
        setSaving(false);
        return;
      }

      if (newStock > 0) {
        await supabase.from('stock_movements').insert({
          product_id: created.id,
          product_name: payload.name,
          movement_type: 'entrada',
          quantity: newStock,
          quantity_before: 0,
          quantity_after: newStock,
          reason: 'Saldo inicial de cadastro',
          responsible: userName,
        });
      }
    }

    setSaving(false);
    setShowModal(false);
    await load();
  }

  async function handleDelete(id: string) {
    setDeleting(id);
    const { error } = await supabase.from('products').update({ active: false, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) {
      alert(`Erro ao excluir peça: ${error.message}`);
    }
    setDeleting(null);
    setDeleteConfirm(null);
    await load();
  }

  function exportCSV() {
    const csv = buildProductsCsv(filtered);
    downloadCsvFile(csv, `pecas_${toLocalDateKey(new Date())}.csv`);
  }

  function printCount() {
    const catList = catFilter || search || alertFilter ? filtered : products;
    const groups: Record<string, Product[]> = {};
    catList.forEach(p => {
      const cat = p.category || 'Outros';
      (groups[cat] = groups[cat] ?? []).push(p);
    });
    const rows = Object.entries(groups).map(([cat, items]) => `
      <tr class="cat-row"><td colspan="6">${escapeHtml(cat)}</td></tr>
      ${items.map(p => `
        <tr>
          <td>${escapeHtml(p.internal_code || '—')}</td>
          <td>${escapeHtml(p.name)}</td>
          <td>${escapeHtml(p.location || '—')}</td>
          <td class="c">${p.stock_quantity}</td>
          <td class="c">${escapeHtml(p.unit || 'un')}</td>
          <td class="count-box"></td>
        </tr>`).join('')}
    `).join('');

    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/>
<title>Contagem de Estoque</title>
<style>
  * { box-sizing:border-box; margin:0; padding:0; }
  body { font-family:Arial,sans-serif; font-size:11px; padding:20px; color:#1e293b; }
  h1 { font-size:16px; margin-bottom:4px; }
  .sub { font-size:11px; color:#64748b; margin-bottom:16px; }
  table { width:100%; border-collapse:collapse; }
  th { background:#f8fafc; border:1px solid #cbd5e1; padding:5px 7px; text-align:left; font-size:10px; text-transform:uppercase; letter-spacing:.05em; }
  td { border:1px solid #e2e8f0; padding:5px 7px; }
  .cat-row td { background:#f1f5f9; font-weight:700; font-size:11px; letter-spacing:.04em; padding:4px 7px; }
  .c { text-align:center; }
  .count-box { width:80px; background:#fffbeb; border:1px solid #f59e0b !important; }
  @media print { body { padding:0; } }
</style></head><body>
<h1>Lista para Contagem Física de Estoque</h1>
<div class="sub">Gerado em: ${new Date().toLocaleString('pt-BR')}${catFilter ? ` · Categoria: ${escapeHtml(catFilter)}` : ''} · ${catList.length} itens</div>
<table>
  <thead><tr><th>Código</th><th>Nome</th><th>Localização</th><th class="c">Sistema</th><th class="c">Un.</th><th class="c">Contagem</th></tr></thead>
  <tbody>${rows}</tbody>
</table></body></html>`;

    printHtml(html, `Contagem_Estoque_${toLocalDateKey(new Date())}.pdf`);
  }

  async function handleCSVImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportFeedback(null);
    setImporting(true);

    try {
      const text = await file.text();
      const { rows, errors } = parseProductsCsv(text);

      if (rows.length === 0) {
        setImportFeedback({ ok: false, text: errors[0] || 'Nenhuma peça válida encontrada no arquivo CSV.' });
        return;
      }

      const byCode = new Map<string, Product>();
      for (const p of products) {
        const codeKey = safeLower(p.internal_code).trim();
        if (codeKey) byCode.set(codeKey, p);
      }

      let inserted = 0;
      let updated = 0;
      let failed = 0;
      const nowIso = new Date().toISOString();

      for (const row of rows) {
        const codeKey = safeLower(row.internal_code).trim();
        const existing = codeKey ? byCode.get(codeKey) : undefined;

        if (existing) {
          const { error } = await supabase
            .from('products')
            .update({ ...row, updated_at: nowIso })
            .eq('id', existing.id);

          if (error) {
            failed += 1;
            continue;
          }
          updated += 1;

          const prevQty = Number(existing.stock_quantity) || 0;
          if (row.stock_quantity !== prevQty) {
            await supabase.from('stock_movements').insert({
              product_id: existing.id,
              product_name: row.name,
              movement_type: 'ajuste',
              quantity: Math.abs(row.stock_quantity - prevQty),
              quantity_before: prevQty,
              quantity_after: row.stock_quantity,
              reason: 'Importação CSV (atualização)',
              responsible: userName,
            });
          }
        } else {
          const { data: created, error } = await supabase
            .from('products')
            .insert({ ...row, active: true, updated_at: nowIso })
            .select('id')
            .single();

          if (error || !created) {
            failed += 1;
            continue;
          }
          inserted += 1;

          if (row.stock_quantity > 0) {
            await supabase.from('stock_movements').insert({
              product_id: created.id,
              product_name: row.name,
              movement_type: 'entrada',
              quantity: row.stock_quantity,
              quantity_before: 0,
              quantity_after: row.stock_quantity,
              reason: 'Importação CSV (saldo inicial)',
              responsible: userName,
            });
          }
        }
      }

      const parts = [
        `${inserted} cadastrada(s)`,
        updated > 0 ? `${updated} atualizada(s) por código` : '',
        failed > 0 ? `${failed} erro(s) ao gravar` : '',
        errors.length > 0 ? `${errors.length} linha(s) ignorada(s)` : '',
      ].filter(Boolean);

      setImportFeedback({
        ok: failed === 0,
        text: `Importação concluída: ${parts.join(' · ')}.`,
      });
      await load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido';
      setImportFeedback({ ok: false, text: `Erro ao ler CSV: ${msg}` });
    } finally {
      setImporting(false);
      if (csvRef.current) csvRef.current.value = '';
    }
  }

  const editMargin = editItem ? computeGrossMarginPercent(editItem.unit_price, editItem.cost_price) : null;
  const editStockDelta = editItem?.id ? (Math.round(Number(editItem.stock_quantity) || 0) - originalStock) : 0;

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-full">
      {/* Alert summary */}
      {(zeros > 0 || mins > 0 || pricingIssues > 0) && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {zeros > 0 && (
            <button
              type="button"
              onClick={() => setAlertFilter(alertFilter === 'zero' ? '' : 'zero')}
              className={`flex items-center gap-2 p-3 rounded-xl border transition-colors ${alertFilter === 'zero' ? 'bg-red-100 border-red-400 ring-1 ring-red-300' : 'bg-red-50 border-red-200 hover:bg-red-100'}`}
            >
              <AlertTriangle size={18} className="text-red-500 flex-shrink-0" />
              <div className="text-left">
                <p className="text-xs font-semibold text-red-700">Estoque Zerado</p>
                <p className="text-xl font-bold text-red-600">{zeros}</p>
              </div>
            </button>
          )}
          {mins > 0 && (
            <button
              type="button"
              onClick={() => setAlertFilter(alertFilter === 'min' ? '' : 'min')}
              className={`flex items-center gap-2 p-3 rounded-xl border transition-colors ${alertFilter === 'min' ? 'bg-amber-100 border-amber-400 ring-1 ring-amber-300' : 'bg-amber-50 border-amber-200 hover:bg-amber-100'}`}
            >
              <AlertTriangle size={18} className="text-amber-500 flex-shrink-0" />
              <div className="text-left">
                <p className="text-xs font-semibold text-amber-700">Abaixo do Mínimo</p>
                <p className="text-xl font-bold text-amber-600">{mins}</p>
              </div>
            </button>
          )}
          {pricingIssues > 0 && (
            <button
              type="button"
              onClick={() => setAlertFilter(alertFilter === 'pricing' ? '' : 'pricing')}
              className={`flex items-center gap-2 p-3 rounded-xl border transition-colors ${alertFilter === 'pricing' ? 'bg-rose-100 border-rose-400 ring-1 ring-rose-300' : 'bg-rose-50 border-rose-200 hover:bg-rose-100'}`}
            >
              <DollarSign size={18} className="text-rose-500 flex-shrink-0" />
              <div className="text-left">
                <p className="text-xs font-semibold text-rose-700">Preço / Margem Alerta</p>
                <p className="text-xl font-bold text-rose-600">{pricingIssues}</p>
              </div>
            </button>
          )}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Pesquisar por nome, código, fabricante ou local..."
            className={inputCls + ' pl-8'}
          />
        </div>
        <select value={catFilter} onChange={e => setCatFilter(e.target.value)} className={inputCls + ' w-auto'}>
          <option value="">Todas as categorias</option>
          {dynamicCategories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        {alertFilter && (
          <button
            type="button"
            onClick={() => setAlertFilter('')}
            className="flex items-center gap-1 text-xs px-2.5 py-2 bg-amber-100 text-amber-700 rounded-lg border border-amber-200 font-semibold"
          >
            <X size={12} /> Limpar alerta
          </button>
        )}
        <div className="flex gap-1.5 ml-auto">
          <button type="button" onClick={printCount} title="Imprimir lista para contagem física" className="p-2 border border-slate-200 bg-white rounded-lg hover:bg-slate-50 text-slate-600 transition-colors">
            <Printer size={15} />
          </button>
          <button type="button" onClick={exportCSV} title="Exportar CSV (Excel PT-BR)" className="p-2 border border-slate-200 bg-white rounded-lg hover:bg-slate-50 text-slate-600 transition-colors">
            <Download size={15} />
          </button>
          <label title="Importar CSV (atualiza por código ou cadastra novas)" className="cursor-pointer p-2 border border-slate-200 bg-white rounded-lg hover:bg-slate-50 text-slate-600 transition-colors">
            {importing ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
            <input ref={csvRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleCSVImport} />
          </label>
          <button type="button" onClick={openNew} className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-white px-3 py-2 rounded-lg text-sm font-semibold transition-colors">
            <Plus size={14} /> Nova Peça
          </button>
        </div>
      </div>

      {importFeedback && (
        <div className={`text-sm p-3 rounded-xl border flex items-center justify-between gap-2 ${
          importFeedback.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-700'
        }`}>
          <span>{importFeedback.text}</span>
          <button type="button" onClick={() => setImportFeedback(null)} className="opacity-60 hover:opacity-100"><X size={14} /></button>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 size={28} className="text-amber-500 animate-spin" /></div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px]">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  {([
                    ['internal_code', 'Código'],
                    ['name', 'Nome'],
                    ['category', 'Categoria'],
                    ['manufacturer', 'Fabricante'],
                    ['location', 'Localização'],
                    ['unit_price', 'Venda'],
                    ['cost_price', 'Custo'],
                  ] as [keyof Product, string][]).map(([f, label]) => (
                    <th key={f} onClick={() => sort(f)} className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide cursor-pointer hover:text-slate-700 select-none whitespace-nowrap">
                      <span className="flex items-center gap-1">{label}<SortIcon field={f} /></span>
                    </th>
                  ))}
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase whitespace-nowrap">Margem</th>
                  {([
                    ['stock_quantity', 'Estoque'],
                    ['stock_min', 'Mínimo'],
                  ] as [keyof Product, string][]).map(([f, label]) => (
                    <th key={f} onClick={() => sort(f)} className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide cursor-pointer hover:text-slate-700 select-none whitespace-nowrap">
                      <span className="flex items-center gap-1">{label}<SortIcon field={f} /></span>
                    </th>
                  ))}
                  <th className="px-3 py-2.5 text-right text-xs font-semibold text-slate-500 uppercase">Ações</th>
                </tr>
              </thead>
              <tbody>
                {paged.length === 0 ? (
                  <tr><td colSpan={11} className="text-center py-12 text-slate-400 text-sm">Nenhuma peça encontrada.</td></tr>
                ) : paged.map(p => {
                  const qty = Number(p.stock_quantity) || 0;
                  const min = Number(p.stock_min) || 0;
                  const isZero = qty === 0;
                  const isMin = !isZero && min > 0 && qty <= min;
                  const photoUrl = getProductPhotoUrl(p);
                  const margin = computeGrossMarginPercent(p.unit_price, p.cost_price);

                  return (
                    <tr key={p.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                      <td className="px-3 py-2.5 text-xs text-slate-500 font-mono">{p.internal_code || '—'}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          {photoUrl && (
                            <img src={photoUrl} alt="" className="w-10 h-10 rounded object-cover flex-shrink-0 border border-slate-100" />
                          )}
                          <span className="text-sm font-medium text-slate-800">{p.name}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-medium">{p.category || 'Outros'}</span>
                      </td>
                      <td className="px-3 py-2.5 text-sm text-slate-600">{p.manufacturer || '—'}</td>
                      <td className="px-3 py-2.5 text-sm text-slate-500">{p.location || '—'}</td>
                      <td className="px-3 py-2.5 text-sm font-semibold text-slate-700 whitespace-nowrap">{fmtCurrency(p.unit_price)}</td>
                      <td className="px-3 py-2.5 text-sm text-slate-500 whitespace-nowrap">{fmtCurrency(p.cost_price)}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        {(Number(p.unit_price) || 0) <= 0 ? (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
                            Sem preço
                          </span>
                        ) : margin === null ? (
                          <span className="text-xs text-slate-300">—</span>
                        ) : (
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                            margin < 0
                              ? 'bg-red-100 text-red-700'
                              : margin < 20
                                ? 'bg-amber-50 text-amber-700'
                                : 'bg-emerald-50 text-emerald-700'
                          }`}>
                            {margin.toFixed(0)}%
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span className={`flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full w-fit ${isZero ? 'bg-red-100 text-red-700' : isMin ? 'bg-amber-100 text-amber-700' : 'bg-green-50 text-green-700'}`}>
                          {(isZero || isMin) && <AlertTriangle size={10} />}
                          {qty} {p.unit || 'un'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-slate-400">{min}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center justify-end gap-1">
                          {deleteConfirm === p.id ? (
                            <div className="flex items-center gap-1.5 mr-1">
                              <span className="text-xs text-red-600 font-medium">Excluir?</span>
                              <button type="button" onClick={() => handleDelete(p.id)} className="p-1 px-2 bg-red-500 text-white rounded hover:bg-red-600 text-xs font-semibold">Sim</button>
                              <button type="button" onClick={() => setDeleteConfirm(null)} className="p-1 px-2 bg-slate-200 text-slate-700 rounded hover:bg-slate-300 text-xs">Não</button>
                            </div>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => onQuickMove(p.id)}
                                title="Movimentar estoque (Entrada / Saída / Ajuste)"
                                className="p-1.5 hover:bg-blue-50 text-blue-600 rounded-lg transition-colors"
                              >
                                <ArrowLeftRight size={13} />
                              </button>
                              <button type="button" onClick={() => openEdit(p)} title="Editar peça" className="p-1.5 hover:bg-amber-50 text-amber-600 rounded-lg transition-colors">
                                <Pencil size={13} />
                              </button>
                              <button type="button" onClick={() => setDeleteConfirm(p.id)} disabled={deleting === p.id} title="Excluir peça" className="p-1.5 hover:bg-red-50 text-red-500 rounded-lg transition-colors">
                                {deleting === p.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
            <span>{filtered.length} de {products.length} peça(s) · Página {page} de {pageCount}</span>
            {pageCount > 1 && (
              <div className="flex gap-1">
                <button type="button" disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="p-1 rounded hover:bg-slate-200 disabled:opacity-30">
                  <ChevronLeft size={14} />
                </button>
                <button type="button" disabled={page >= pageCount} onClick={() => setPage(p => p + 1)} className="p-1 rounded hover:bg-slate-200 disabled:opacity-30">
                  <ChevronRight size={14} />
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal Peça */}
      {showModal && editItem && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="font-bold text-slate-800">{editItem.id ? 'Editar Peça' : 'Nova Peça'}</h2>
              <button type="button" onClick={() => setShowModal(false)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
                <X size={16} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {formError && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl p-3 flex items-start gap-2">
                  <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Código Interno</label>
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={editItem.internal_code ?? ''}
                      onChange={e => setEditItem(v => ({ ...v!, internal_code: e.target.value }))}
                      className={inputCls + ' font-mono tracking-widest'}
                      placeholder="Ex: RF-001 ou EAN-13"
                    />
                    <button
                      type="button"
                      title="Gerar código de barras EAN-13 automático"
                      onClick={() => setEditItem(v => ({ ...v!, internal_code: generateEAN13() }))}
                      className="flex-shrink-0 flex items-center gap-1 px-2.5 border border-slate-200 rounded-lg hover:bg-amber-50 hover:border-amber-300 text-slate-500 hover:text-amber-600 transition-colors text-xs font-medium"
                    >
                      <Barcode size={14} /> Gerar
                    </button>
                  </div>
                </div>
                <div>
                  <label className={labelCls}>Nome da Peça <span className="text-red-400">*</span></label>
                  <input type="text" value={editItem.name ?? ''} onChange={e => setEditItem(v => ({ ...v!, name: e.target.value }))} className={inputCls} placeholder="Nome da peça" />
                </div>
                <div>
                  <label className={labelCls}>Categoria</label>
                  <select value={editItem.category ?? 'Refrigeração'} onChange={e => setEditItem(v => ({ ...v!, category: e.target.value }))} className={inputCls}>
                    {Array.from(new Set([...dynamicCategories, ...(editItem.category ? [editItem.category] : [])])).map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Fabricante</label>
                  <input type="text" value={editItem.manufacturer ?? ''} onChange={e => setEditItem(v => ({ ...v!, manufacturer: e.target.value }))} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Unidade</label>
                  <select value={editItem.unit ?? 'un'} onChange={e => setEditItem(v => ({ ...v!, unit: e.target.value }))} className={inputCls}>
                    {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Localização (prateleira/caixa)</label>
                  <input type="text" value={editItem.location ?? ''} onChange={e => setEditItem(v => ({ ...v!, location: e.target.value }))} className={inputCls} placeholder="Ex: A3, Caixa 2" />
                </div>
                <div>
                  <label className={labelCls}>Preço de Custo (R$)</label>
                  <input type="number" min={0} step={0.01} value={editItem.cost_price ?? 0} onChange={e => setEditItem(v => ({ ...v!, cost_price: parseFloat(e.target.value) || 0 }))} className={inputCls} />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-slate-600">Preço de Venda (R$)</label>
                    {editMargin !== null && (
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        editMargin < 0 ? 'bg-red-100 text-red-700' : 'bg-emerald-50 text-emerald-700'
                      }`}>
                        Margem: {editMargin.toFixed(1)}%
                      </span>
                    )}
                  </div>
                  <input type="number" min={0} step={0.01} value={editItem.unit_price ?? 0} onChange={e => setEditItem(v => ({ ...v!, unit_price: parseFloat(e.target.value) || 0 }))} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Estoque Atual</label>
                  <input type="number" min={0} value={editItem.stock_quantity ?? 0} onChange={e => setEditItem(v => ({ ...v!, stock_quantity: Math.max(0, parseInt(e.target.value, 10) || 0) }))} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Estoque Mínimo</label>
                  <input type="number" min={0} value={editItem.stock_min ?? 0} onChange={e => setEditItem(v => ({ ...v!, stock_min: Math.max(0, parseInt(e.target.value, 10) || 0) }))} className={inputCls} />
                </div>

                {/* Mandatory Stock Adjustment Reason when editing stock directly */}
                {editItem.id && editStockDelta !== 0 && (
                  <div className="sm:col-span-2 bg-amber-50 border border-amber-200 rounded-xl p-3.5 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-amber-800 flex items-center gap-1.5">
                        <ArrowLeftRight size={13} />
                        Alteração manual de estoque detectada ({originalStock} → {editItem.stock_quantity})
                      </span>
                      <span className={`font-bold px-2 py-0.5 rounded-full ${editStockDelta > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                        {editStockDelta > 0 ? `+${editStockDelta}` : editStockDelta}
                      </span>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-amber-900 block mb-1">
                        Motivo do ajuste <span className="text-red-500">*</span> (será registrado em Movimentações)
                      </label>
                      <select
                        value={stockReason}
                        onChange={e => setStockReason(e.target.value)}
                        className={inputCls}
                      >
                        <option value="">Selecionar motivo...</option>
                        {JUSTIFICATIONS.map(j => <option key={j} value={j}>{j}</option>)}
                      </select>
                    </div>
                  </div>
                )}

                <div className="sm:col-span-2">
                  <label className={labelCls}>Observações</label>
                  <textarea rows={2} value={editItem.part_notes ?? ''} onChange={e => setEditItem(v => ({ ...v!, part_notes: e.target.value }))} className={inputCls + ' resize-none'} />
                </div>

                <div className="sm:col-span-2">
                  <label className={labelCls}>Foto da Peça</label>
                  <div className="flex items-center gap-4">
                    {getProductPhotoUrl(editItem) ? (
                      <div className="relative group">
                        <img
                          src={getProductPhotoUrl(editItem)}
                          alt="Preview"
                          onDoubleClick={() => window.open(getProductPhotoUrl(editItem), '_blank')}
                          title="Duplo clique para ver em tamanho natural"
                          className="w-20 h-20 object-cover rounded-lg border border-slate-200 shadow-sm cursor-pointer hover:opacity-90 transition-opacity"
                        />
                        <button
                          type="button"
                          onClick={() => setEditItem(v => (v ? { ...v, photo_url: '', description: /^https?:\/\//i.test(v.description ?? '') ? '' : v.description } : v))}
                          className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full hover:bg-red-600 shadow-md opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ) : (
                      <div className="w-20 h-20 rounded-lg border-2 border-dashed border-slate-300 flex items-center justify-center bg-slate-50">
                        <Package size={24} className="text-slate-300" />
                      </div>
                    )}
                    <label className="cursor-pointer flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 text-sm font-medium rounded-lg transition-colors">
                      {uploadingPhoto ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                      {getProductPhotoUrl(editItem) ? 'Trocar Foto' : 'Adicionar Foto'}
                      <input type="file" accept="image/*" className="hidden" disabled={uploadingPhoto} onChange={handlePhotoUpload} />
                    </label>
                  </div>
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 flex gap-3">
              <button type="button" onClick={() => setShowModal(false)} className="flex-1 border border-slate-200 text-slate-600 hover:bg-slate-50 py-2.5 rounded-xl text-sm font-medium">Cancelar</button>
              <button type="button" onClick={handleSave} disabled={saving || uploadingPhoto} className="flex-1 flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white py-2.5 rounded-xl text-sm font-semibold">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB: SERVIÇOS
// ═══════════════════════════════════════════════════════════════════════════════

function ServicosTab({ refresh }: { refresh: number }) {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState<Partial<Service> | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const dynamicSvcCategories = useMemo(() => {
    const cats = new Set(SVC_CATEGORIES);
    services.forEach(s => { if (s.category) cats.add(s.category); });
    return Array.from(cats);
  }, [services]);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await fetchAllPages<Service>((from, to) =>
      supabase.from('services').select('*').eq('active', true).order('name').range(from, to)
    );
    setServices(data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [refresh, load]);

  const filtered = useMemo(() => {
    const q = safeLower(search.trim());
    return services.filter(s =>
      (!q || safeLower(s.name).includes(q) || safeLower(s.notes).includes(q) || safeLower(s.technician_name).includes(q)) &&
      (!catFilter || s.category === catFilter)
    );
  }, [services, search, catFilter]);

  function openNew() {
    setFormError(null);
    setEditItem({ name: '', category: 'Manutenção', estimated_time: '', technician_name: '', price: 0, notes: '', active: true });
    setShowModal(true);
  }

  async function handleSave() {
    if (!editItem?.name?.trim()) {
      setFormError('O nome do serviço é obrigatório.');
      return;
    }
    setSaving(true);
    setFormError(null);
    const payload = {
      name: editItem.name.trim(),
      category: editItem.category || 'Manutenção',
      estimated_time: (editItem.estimated_time ?? '').trim(),
      technician_name: (editItem.technician_name ?? '').trim(),
      price: Math.max(0, Number(editItem.price) || 0),
      notes: (editItem.notes ?? '').trim(),
      active: true,
      updated_at: new Date().toISOString(),
    };

    const res = editItem.id
      ? await supabase.from('services').update(payload).eq('id', editItem.id)
      : await supabase.from('services').insert(payload);

    if (res.error) {
      setFormError(`Erro ao salvar serviço: ${res.error.message}`);
      setSaving(false);
      return;
    }

    setSaving(false);
    setShowModal(false);
    await load();
  }

  async function handleDelete(id: string) {
    setDeleting(id);
    const { error } = await supabase.from('services').update({ active: false, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) alert(`Erro ao excluir serviço: ${error.message}`);
    setDeleting(null);
    setDeleteConfirm(null);
    await load();
  }

  function exportCSV() {
    const csv = buildServicesCsv(filtered);
    downloadCsvFile(csv, `servicos_${toLocalDateKey(new Date())}.csv`);
  }

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Pesquisar serviços..." className={inputCls + ' pl-8'} />
        </div>
        <select value={catFilter} onChange={e => setCatFilter(e.target.value)} className={inputCls + ' w-auto'}>
          <option value="">Todas as categorias</option>
          {dynamicSvcCategories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <div className="flex gap-1.5 ml-auto">
          <button type="button" onClick={exportCSV} title="Exportar CSV (Excel PT-BR)" className="p-2 border border-slate-200 bg-white rounded-lg hover:bg-slate-50 text-slate-600">
            <Download size={15} />
          </button>
          <button type="button" onClick={openNew} className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-white px-3 py-2 rounded-lg text-sm font-semibold">
            <Plus size={14} /> Novo Serviço
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 size={28} className="text-amber-500 animate-spin" /></div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.length === 0 && <p className="col-span-full text-center py-12 text-slate-400 text-sm">Nenhum serviço cadastrado.</p>}
          {filtered.map(s => (
            <div key={s.id} className="bg-white rounded-xl border border-slate-200 p-4 flex flex-col gap-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-slate-800 text-sm">{s.name}</p>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-medium mt-1 inline-block">{s.category}</span>
                </div>
                <p className="text-lg font-extrabold text-green-600 flex-shrink-0">{fmtCurrency(s.price)}</p>
              </div>
              {s.estimated_time && <p className="text-xs text-slate-500">Tempo estimado: <strong>{s.estimated_time}</strong></p>}
              {s.technician_name && <p className="text-xs text-slate-500">Técnico: <strong>{s.technician_name}</strong></p>}
              {s.notes && <p className="text-xs text-slate-400 line-clamp-2">{s.notes}</p>}
              <div className="flex gap-1.5 pt-1 mt-auto border-t border-slate-100">
                {deleteConfirm === s.id ? (
                  <div className="flex-1 flex items-center justify-between px-2 py-1 bg-red-50 rounded-lg border border-red-100">
                    <span className="text-xs text-red-600 font-semibold">Excluir?</span>
                    <div className="flex gap-1">
                      <button type="button" onClick={() => handleDelete(s.id)} className="bg-red-500 hover:bg-red-600 text-white px-2 py-0.5 rounded text-xs">Sim</button>
                      <button type="button" onClick={() => setDeleteConfirm(null)} className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-2 py-0.5 rounded text-xs">Não</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <button type="button" onClick={() => { setFormError(null); setEditItem({ ...s }); setShowModal(true); }} className="flex-1 flex items-center justify-center gap-1 text-xs py-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600">
                      <Pencil size={11} /> Editar
                    </button>
                    <button type="button" onClick={() => setDeleteConfirm(s.id)} disabled={deleting === s.id} className="flex-1 flex items-center justify-center gap-1 text-xs py-1.5 border border-red-200 rounded-lg hover:bg-red-50 text-red-500">
                      {deleting === s.id ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
                      Excluir
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && editItem && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="font-bold text-slate-800">{editItem.id ? 'Editar Serviço' : 'Novo Serviço'}</h2>
              <button type="button" onClick={() => setShowModal(false)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"><X size={16} /></button>
            </div>
            <div className="px-6 py-4 space-y-3">
              {formError && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl p-3 flex items-start gap-2">
                  <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
                  <span>{formError}</span>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className={labelCls}>Nome do Serviço <span className="text-red-400">*</span></label>
                  <input type="text" value={editItem.name ?? ''} onChange={e => setEditItem(v => ({ ...v!, name: e.target.value }))} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Categoria</label>
                  <select value={editItem.category ?? 'Manutenção'} onChange={e => setEditItem(v => ({ ...v!, category: e.target.value }))} className={inputCls}>
                    {Array.from(new Set([...dynamicSvcCategories, ...(editItem.category ? [editItem.category] : [])])).map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Valor (R$)</label>
                  <input type="number" min={0} step={0.01} value={editItem.price ?? 0} onChange={e => setEditItem(v => ({ ...v!, price: parseFloat(e.target.value) || 0 }))} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Tempo Estimado</label>
                  <input type="text" value={editItem.estimated_time ?? ''} onChange={e => setEditItem(v => ({ ...v!, estimated_time: e.target.value }))} className={inputCls} placeholder="Ex: 2h, 30min" />
                </div>
                <div>
                  <label className={labelCls}>Técnico Responsável</label>
                  <input type="text" value={editItem.technician_name ?? ''} onChange={e => setEditItem(v => ({ ...v!, technician_name: e.target.value }))} className={inputCls} />
                </div>
                <div className="col-span-2">
                  <label className={labelCls}>Observações</label>
                  <textarea rows={2} value={editItem.notes ?? ''} onChange={e => setEditItem(v => ({ ...v!, notes: e.target.value }))} className={inputCls + ' resize-none'} />
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 flex gap-3">
              <button type="button" onClick={() => setShowModal(false)} className="flex-1 border border-slate-200 text-slate-600 py-2.5 rounded-xl text-sm font-medium">Cancelar</button>
              <button type="button" onClick={handleSave} disabled={saving} className="flex-1 flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white py-2.5 rounded-xl text-sm font-semibold">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB: MOVIMENTAÇÕES
// ═══════════════════════════════════════════════════════════════════════════════

function MovimentacoesTab({
  refresh,
  userName,
  initialProductId,
  onConsumedInitialProduct,
}: {
  refresh: number;
  userName: string;
  initialProductId: string | null;
  onConsumedInitialProduct: () => void;
}) {
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  const [form, setForm] = useState<{
    product_id: string;
    movement_type: ManualMovementType;
    quantity: number;
    target_stock: number;
    reason: string;
    responsible: string;
  }>({
    product_id: '',
    movement_type: 'entrada',
    quantity: 1,
    target_stock: 0,
    reason: '',
    responsible: userName,
  });

  // Configurable Financial Integration (A2)
  const [launchExpense, setLaunchExpense] = useState(true);
  const [expenseUnitCost, setExpenseUnitCost] = useState<number>(0);
  const [updateProductCost, setUpdateProductCost] = useState(false);
  const [expenseStatus, setExpenseStatus] = useState<'pago' | 'pendente'>('pago');
  const [expenseDate, setExpenseDate] = useState<string>(toLocalDateKey(new Date()));

  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Filters & Pagination
  const [typeFilter, setTypeFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    const [mv, pr] = await Promise.all([
      fetchAllPages<StockMovement>((from, to) =>
        supabase.from('stock_movements').select('*').order('created_at', { ascending: false }).range(from, to)
      ),
      fetchAllPages<Product>((from, to) =>
        supabase.from('products').select('id,name,stock_quantity,unit,cost_price').eq('active', true).order('name').range(from, to)
      ),
    ]);
    setMovements(mv);
    setProducts(pr);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [refresh, load]);

  useEffect(() => {
    setPage(1);
  }, [search, typeFilter, dateFrom, dateTo]);

  // Open modal automatically when coming from quick move button in PecasTab
  useEffect(() => {
    if (!initialProductId || loading || products.length === 0) return;
    const prod = products.find(p => p.id === initialProductId);
    if (prod) {
      setForm({
        product_id: prod.id,
        movement_type: 'entrada',
        quantity: 1,
        target_stock: Number(prod.stock_quantity) || 0,
        reason: '',
        responsible: userName,
      });
      setExpenseUnitCost(Number(prod.cost_price) || 0);
      setUpdateProductCost(false);
      setLaunchExpense(true);
      setExpenseStatus('pago');
      setExpenseDate(toLocalDateKey(new Date()));
      setFormError(null);
      setShowModal(true);
    }
    onConsumedInitialProduct();
  }, [initialProductId, loading, products, userName, onConsumedInitialProduct]);

  const selectedProduct = useMemo(
    () => products.find(p => p.id === form.product_id),
    [products, form.product_id]
  );

  const expenseSpec = useMemo(
    () => getExpenseIntegrationKind(form.movement_type, form.reason),
    [form.movement_type, form.reason]
  );

  const previewCalc = useMemo(() => {
    if (!selectedProduct) return null;
    return computeManualMovement({
      movementType: form.movement_type,
      currentStock: Number(selectedProduct.stock_quantity) || 0,
      quantity: form.quantity,
      targetStock: form.target_stock,
    });
  }, [selectedProduct, form.movement_type, form.quantity, form.target_stock]);

  function openNewModal() {
    setFormError(null);
    setForm({
      product_id: '',
      movement_type: 'entrada',
      quantity: 1,
      target_stock: 0,
      reason: '',
      responsible: userName,
    });
    setExpenseUnitCost(0);
    setUpdateProductCost(false);
    setLaunchExpense(true);
    setExpenseStatus('pago');
    setExpenseDate(toLocalDateKey(new Date()));
    setShowModal(true);
  }

  function handleSelectProduct(productId: string) {
    const prod = products.find(p => p.id === productId);
    setForm(f => ({
      ...f,
      product_id: productId,
      target_stock: Number(prod?.stock_quantity) || 0,
    }));
    setExpenseUnitCost(Number(prod?.cost_price) || 0);
    setUpdateProductCost(false);
  }

  async function handleRegister() {
    setFormError(null);
    if (!form.product_id) {
      setFormError('Selecione a peça.');
      return;
    }

    setSaving(true);
    try {
      // Read LIVE stock from DB to avoid overwriting concurrent changes
      const { data: liveProd, error: fetchErr } = await supabase
        .from('products')
        .select('id,name,stock_quantity,cost_price')
        .eq('id', form.product_id)
        .single();

      if (fetchErr || !liveProd) {
        setFormError(`Erro ao consultar estoque atual da peça: ${fetchErr?.message || 'Não encontrada'}`);
        setSaving(false);
        return;
      }

      const calc = computeManualMovement({
        movementType: form.movement_type,
        currentStock: Number(liveProd.stock_quantity) || 0,
        quantity: form.quantity,
        targetStock: form.target_stock,
      });

      if (!calc.ok) {
        setFormError(calc.error);
        setSaving(false);
        return;
      }

      const nowIso = new Date().toISOString();
      const prodUpdate: Record<string, unknown> = {
        stock_quantity: calc.after,
        updated_at: nowIso,
      };
      if (expenseSpec?.kind === 'purchase' && launchExpense && updateProductCost && expenseUnitCost > 0) {
        prodUpdate.cost_price = expenseUnitCost;
      }

      const { error: updErr } = await supabase
        .from('products')
        .update(prodUpdate)
        .eq('id', form.product_id);

      if (updErr) {
        setFormError(`Erro ao atualizar estoque: ${updErr.message}`);
        setSaving(false);
        return;
      }

      const responsibleFinal = form.responsible.trim() || userName;
      const { error: insErr } = await supabase.from('stock_movements').insert({
        product_id: form.product_id,
        product_name: liveProd.name,
        movement_type: form.movement_type,
        quantity: calc.movementQuantity,
        quantity_before: calc.before,
        quantity_after: calc.after,
        reason: form.reason.trim() || (form.movement_type === 'ajuste' ? 'Ajuste manual' : ''),
        responsible: responsibleFinal,
      });

      if (insErr) {
        setFormError(`Estoque atualizado, mas erro ao gravar histórico: ${insErr.message}`);
        setSaving(false);
        return;
      }

      // Configurable Financial Integration (Compra / Perda / Quebra / Furto)
      if (expenseSpec && launchExpense) {
        const unitCost = Math.max(0, Number(expenseUnitCost) || 0);
        const totalAmount = calc.movementQuantity * unitCost;
        const chosenDate = expenseDate || toLocalDateKey(new Date());

        if (totalAmount > 0) {
          const description =
            expenseSpec.kind === 'purchase'
              ? `Compra de ${calc.movementQuantity}x ${liveProd.name}`
              : `Baixa de Estoque (${form.reason}) - ${calc.movementQuantity}x ${liveProd.name}`;

          const { data: createdExp, error: expErr } = await supabase
            .from('expenses')
            .insert({
              description,
              category: expenseSpec.category,
              amount: totalAmount,
              due_date: chosenDate,
              paid_at: expenseStatus === 'pago' ? chosenDate : null,
              status: expenseStatus,
              recurrence: 'única',
              attachment_url: '',
              cost_center_id: null,
            })
            .select('id')
            .single();

          if (expErr) {
            alert(`Movimentação salva, mas erro ao lançar despesa no Financeiro: ${expErr.message}`);
          } else if (createdExp) {
            await logFinancialAudit({
              actionType: 'insert',
              tableName: 'expenses',
              recordId: String(createdExp.id),
              userName: responsibleFinal,
              changes: {
                action: 'stock_movement_expense',
                product_id: form.product_id,
                product_name: liveProd.name,
                quantity: calc.movementQuantity,
                unit_cost: unitCost,
                amount: totalAmount,
                status: expenseStatus,
                date: chosenDate,
              },
            });
          }
        } else {
          alert('Movimentação salva, mas NENHUM valor foi lançado no Financeiro pois o Custo Unitário informado está zerado.');
        }
      }

      setSaving(false);
      setShowModal(false);
      await load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido';
      setFormError(`Erro inesperado: ${msg}`);
      setSaving(false);
    }
  }

  const filtered = useMemo(() => {
    const q = safeLower(search.trim());
    return movements.filter(m => {
      const matchSearch =
        !q ||
        safeLower(m.product_name).includes(q) ||
        safeLower(m.reason).includes(q) ||
        safeLower(m.responsible).includes(q);
      const matchType = !typeFilter || m.movement_type === typeFilter;
      const dateKey = toLocalDateKey(m.created_at);
      const matchFrom = !dateFrom || !dateKey || dateKey >= dateFrom;
      const matchTo = !dateTo || !dateKey || dateKey <= dateTo;
      return matchSearch && matchType && matchFrom && matchTo;
    });
  }, [movements, search, typeFilter, dateFrom, dateTo]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / MV_PAGE_SIZE));
  const paged = filtered.slice((page - 1) * MV_PAGE_SIZE, page * MV_PAGE_SIZE);

  const TYPE_CONFIG: Record<string, { label: string; color: string; icon: typeof ArrowDownCircle }> = {
    entrada: { label: 'Entrada', color: 'text-emerald-600 bg-emerald-50 border-emerald-200', icon: ArrowDownCircle },
    saida:   { label: 'Saída',   color: 'text-red-600 bg-red-50 border-red-200',             icon: ArrowUpCircle },
    ajuste:  { label: 'Ajuste',  color: 'text-blue-600 bg-blue-50 border-blue-200',          icon: RefreshCw },
    os:      { label: 'OS',      color: 'text-amber-600 bg-amber-50 border-amber-200',       icon: Wrench },
  };

  function exportCSV() {
    const csv = buildMovementsCsv(filtered);
    downloadCsvFile(csv, `movimentacoes_${toLocalDateKey(new Date())}.csv`);
  }

  const estimatedExpenseTotal =
    expenseSpec && previewCalc?.ok ? previewCalc.movementQuantity * Math.max(0, Number(expenseUnitCost) || 0) : 0;

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Pesquisar peça, motivo ou responsável..." className={inputCls + ' pl-8'} />
        </div>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className={inputCls + ' w-auto'}>
          <option value="">Todos os tipos</option>
          {FILTER_MOVE_TYPES.map(t => <option key={t} value={t}>{TYPE_CONFIG[t]?.label ?? t}</option>)}
        </select>
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} title="Data inicial" className={inputCls + ' w-auto text-xs'} />
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} title="Data final" className={inputCls + ' w-auto text-xs'} />
        {(dateFrom || dateTo || typeFilter || search) && (
          <button
            type="button"
            onClick={() => { setSearch(''); setTypeFilter(''); setDateFrom(''); setDateTo(''); }}
            className="text-xs px-2.5 py-2 text-slate-500 hover:text-red-600 border border-slate-200 bg-white rounded-lg"
          >
            Limpar
          </button>
        )}
        <button type="button" onClick={exportCSV} title="Exportar CSV (Excel PT-BR)" className="p-2 border border-slate-200 bg-white rounded-lg hover:bg-slate-50 text-slate-600">
          <Download size={15} />
        </button>
        <button type="button" onClick={openNewModal} className="ml-auto flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-white px-3 py-2 rounded-lg text-sm font-semibold">
          <Plus size={14} /> Registrar Movimentação
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 size={28} className="text-amber-500 animate-spin" /></div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px]">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  {['Data', 'Peça', 'Tipo', 'Variação', 'Antes → Depois', 'Motivo', 'Responsável'].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paged.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-12 text-slate-400 text-sm">Nenhuma movimentação encontrada.</td></tr>
                ) : paged.map(m => {
                  const cfg = TYPE_CONFIG[m.movement_type] ?? TYPE_CONFIG.ajuste;
                  const Icon = cfg.icon;
                  const signedDelta = getMovementSignedDelta(m);
                  return (
                    <tr key={m.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-3 py-2.5 text-xs text-slate-500 whitespace-nowrap">{fmtDateTime(m.created_at)}</td>
                      <td className="px-3 py-2.5 text-sm font-medium text-slate-700">{m.product_name}</td>
                      <td className="px-3 py-2.5">
                        <span className={`flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border w-fit ${cfg.color}`}>
                          <Icon size={11} />{cfg.label}
                        </span>
                      </td>
                      <td className={`px-3 py-2.5 text-sm font-bold ${signedDelta < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                        {signedDelta > 0 ? `+${signedDelta}` : signedDelta}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-slate-500 font-mono">{m.quantity_before} → {m.quantity_after}</td>
                      <td className="px-3 py-2.5 text-sm text-slate-600">{m.reason || '—'}</td>
                      <td className="px-3 py-2.5 text-sm text-slate-500">{m.responsible || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
            <span>{filtered.length} de {movements.length} movimentação(ões) · Página {page} de {pageCount}</span>
            {pageCount > 1 && (
              <div className="flex gap-1">
                <button type="button" disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="p-1 rounded hover:bg-slate-200 disabled:opacity-30">
                  <ChevronLeft size={14} />
                </button>
                <button type="button" disabled={page >= pageCount} onClick={() => setPage(p => p + 1)} className="p-1 rounded hover:bg-slate-200 disabled:opacity-30">
                  <ChevronRight size={14} />
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="font-bold text-slate-800 flex items-center gap-2">
                <ArrowLeftRight size={16} className="text-amber-500" /> Registrar Movimentação
              </h2>
              <button type="button" onClick={() => setShowModal(false)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
                <X size={16} />
              </button>
            </div>
            <div className="px-6 py-4 space-y-3 overflow-y-auto">
              {formError && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl p-3 flex items-start gap-2">
                  <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
                  <span>{formError}</span>
                </div>
              )}

              <div>
                <label className={labelCls}>Peça <span className="text-red-400">*</span></label>
                <select value={form.product_id} onChange={e => handleSelectProduct(e.target.value)} className={inputCls}>
                  <option value="">Selecionar...</option>
                  {products.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} (estoque: {p.stock_quantity} {p.unit || 'un'})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Tipo</label>
                  <select
                    value={form.movement_type}
                    onChange={e => setForm(f => ({ ...f, movement_type: e.target.value as ManualMovementType }))}
                    className={inputCls}
                  >
                    {MANUAL_MOVE_TYPES.map(t => (
                      <option key={t} value={t}>{TYPE_CONFIG[t]?.label ?? t}</option>
                    ))}
                  </select>
                </div>

                {form.movement_type === 'ajuste' ? (
                  <div>
                    <label className={labelCls}>Novo Saldo Físico</label>
                    <input
                      type="number"
                      min={0}
                      value={form.target_stock}
                      onChange={e => setForm(f => ({ ...f, target_stock: Math.max(0, parseInt(e.target.value, 10) || 0) }))}
                      className={inputCls}
                    />
                  </div>
                ) : (
                  <div>
                    <label className={labelCls}>Quantidade</label>
                    <input
                      type="number"
                      min={1}
                      value={form.quantity}
                      onChange={e => setForm(f => ({ ...f, quantity: Math.max(1, parseInt(e.target.value, 10) || 1) }))}
                      className={inputCls}
                    />
                  </div>
                )}
              </div>

              {/* Live stock preview */}
              {selectedProduct && previewCalc && (
                <div className={`rounded-xl px-3.5 py-2.5 text-xs border flex items-center justify-between ${
                  previewCalc.ok ? 'bg-slate-50 border-slate-200 text-slate-700' : 'bg-red-50 border-red-200 text-red-700'
                }`}>
                  {previewCalc.ok ? (
                    <>
                      <span>Saldo: <strong>{previewCalc.before} → {previewCalc.after}</strong> {selectedProduct.unit || 'un'}</span>
                      <span className={`font-bold ${previewCalc.delta < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                        {previewCalc.delta > 0 ? `+${previewCalc.delta}` : previewCalc.delta}
                      </span>
                    </>
                  ) : (
                    <span>{previewCalc.error}</span>
                  )}
                </div>
              )}

              <div>
                <label className={labelCls}>Motivo</label>
                <select value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} className={inputCls}>
                  <option value="">Selecionar...</option>
                  {JUSTIFICATIONS.map(j => <option key={j} value={j}>{j}</option>)}
                </select>
              </div>

              <div>
                <label className={labelCls}>Responsável</label>
                <input type="text" value={form.responsible} onChange={e => setForm(f => ({ ...f, responsible: e.target.value }))} className={inputCls} placeholder="Nome do responsável" />
              </div>

              {/* Configurable Financial Integration (A2) */}
              {expenseSpec && (
                <div className="bg-blue-50/70 border border-blue-200 rounded-xl p-3.5 space-y-3">
                  <label className="flex items-center gap-2 text-xs font-bold text-blue-900 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={launchExpense}
                      onChange={e => setLaunchExpense(e.target.checked)}
                      className="rounded border-blue-300 text-blue-600"
                    />
                    Lançar automaticamente no Financeiro ({expenseSpec.label})
                  </label>

                  {launchExpense && (
                    <div className="space-y-2.5 pt-1 border-t border-blue-200/70">
                      <div className="grid grid-cols-2 gap-2.5">
                        <div>
                          <label className="text-[11px] font-semibold text-blue-900 block mb-1">Custo Unitário (R$)</label>
                          <input
                            type="number"
                            min={0}
                            step={0.01}
                            value={expenseUnitCost}
                            onChange={e => {
                              const v = Math.max(0, parseFloat(e.target.value) || 0);
                              setExpenseUnitCost(v);
                              if (expenseSpec.kind === 'purchase' && selectedProduct && v !== Number(selectedProduct.cost_price)) {
                                setUpdateProductCost(true);
                              }
                            }}
                            className={inputCls + ' py-1.5 text-xs'}
                          />
                        </div>
                        <div>
                          <label className="text-[11px] font-semibold text-blue-900 block mb-1">Total da Despesa</label>
                          <div className="px-3 py-1.5 rounded-lg bg-white border border-blue-200 text-xs font-extrabold text-blue-800">
                            {fmtCurrency(estimatedExpenseTotal)}
                          </div>
                        </div>
                      </div>

                      {expenseSpec.kind === 'purchase' && (
                        <label className="flex items-center gap-2 text-[11px] text-blue-800 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={updateProductCost}
                            onChange={e => setUpdateProductCost(e.target.checked)}
                            className="rounded border-blue-300 text-blue-600"
                          />
                          Atualizar Preço de Custo no cadastro da peça
                        </label>
                      )}

                      <div className="grid grid-cols-2 gap-2.5">
                        <div>
                          <label className="text-[11px] font-semibold text-blue-900 block mb-1">Status Financeiro</label>
                          <select
                            value={expenseStatus}
                            onChange={e => setExpenseStatus(e.target.value as 'pago' | 'pendente')}
                            className={inputCls + ' py-1.5 text-xs'}
                          >
                            <option value="pago">Pago</option>
                            <option value="pendente">Pendente (A Pagar)</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-[11px] font-semibold text-blue-900 block mb-1 flex items-center gap-1">
                            <Calendar size={11} />
                            {expenseStatus === 'pago' ? 'Data do Pgto' : 'Vencimento'}
                          </label>
                          <input
                            type="date"
                            value={expenseDate}
                            onChange={e => setExpenseDate(e.target.value)}
                            className={inputCls + ' py-1.5 text-xs'}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-slate-100 flex gap-3">
              <button type="button" onClick={() => setShowModal(false)} className="flex-1 border border-slate-200 text-slate-600 py-2.5 rounded-xl text-sm font-medium">
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleRegister}
                disabled={saving || !form.product_id || (previewCalc !== null && !previewCalc.ok)}
                className="flex-1 flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white py-2.5 rounded-xl text-sm font-semibold"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB: AUDITORIA
// ═══════════════════════════════════════════════════════════════════════════════

type AuditStatusChip = 'all' | 'uncounted' | 'divergences' | 'missing_justification';

function AuditoriaTab({ userName }: { userName: string }) {
  const [audits, setAudits] = useState<StockAudit[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeAudit, setActiveAudit] = useState<StockAudit | null>(null);
  const [auditItems, setAuditItems] = useState<AuditItem[]>([]);
  const [draftCounts, setDraftCounts] = useState<Record<string, string>>({});
  const [loadingItems, setLoadingItems] = useState(false);

  const [newAuditModal, setNewAuditModal] = useState(false);
  const [newForm, setNewForm] = useState({ responsible: userName, notes: '' });
  const [creating, setCreating] = useState(false);
  const [savingItems, setSavingItems] = useState(false);

  const [itemSearch, setItemSearch] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [statusChip, setStatusChip] = useState<AuditStatusChip>('all');
  const [closeConfirm, setCloseConfirm] = useState<{ apply: boolean } | null>(null);

  const productById = useMemo(
    () => Object.fromEntries(products.map(p => [p.id, p])),
    [products]
  );

  const dynamicCategories = useMemo(() => {
    const cats = new Set(PART_CATEGORIES);
    products.forEach(p => { if (p.category) cats.add(p.category); });
    return Array.from(cats);
  }, [products]);

  const load = useCallback(async () => {
    setLoading(true);
    const [au, pr] = await Promise.all([
      fetchAllPages<StockAudit>((from, to) =>
        supabase.from('stock_audits').select('*').order('created_at', { ascending: false }).range(from, to)
      ),
      fetchAllPages<Product>((from, to) =>
        supabase.from('products').select('id,internal_code,name,category,stock_quantity,unit,stock_min,location').eq('active', true).order('name').range(from, to)
      ),
    ]);
    setAudits(au);
    setProducts(pr);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function openAudit(audit: StockAudit) {
    setActiveAudit(audit);
    setLoadingItems(true);
    setItemSearch('');
    setCatFilter('');
    setStatusChip('all');

    const data = await fetchAllPages<AuditItem>((from, to) =>
      supabase.from('stock_audit_items').select('*').eq('audit_id', audit.id).order('product_name').range(from, to)
    );
    setAuditItems(data);
    const initialDrafts: Record<string, string> = {};
    for (const item of data) {
      initialDrafts[item.id] = item.counted_quantity !== null && item.counted_quantity !== undefined ? String(item.counted_quantity) : '';
    }
    setDraftCounts(initialDrafts);
    setLoadingItems(false);
  }

  async function createAudit() {
    if (!newForm.responsible.trim()) { alert('Informe o responsável.'); return; }
    setCreating(true);
    const { data: audit, error: auditErr } = await supabase
      .from('stock_audits')
      .insert({ responsible: newForm.responsible.trim(), notes: newForm.notes.trim(), status: 'aberta' })
      .select()
      .single();

    if (auditErr || !audit) {
      alert(`Erro ao criar auditoria: ${auditErr?.message || 'Erro desconhecido'}`);
      setCreating(false);
      return;
    }

    const items = products.map(p => ({
      audit_id: audit.id,
      product_id: p.id,
      product_name: p.name,
      system_quantity: Number(p.stock_quantity) || 0,
      justification: '',
    }));

    // Insert in chunks of 500 to avoid PostgREST payload limits
    for (let i = 0; i < items.length; i += 500) {
      const chunk = items.slice(i, i + 500);
      const { error: itemsErr } = await supabase.from('stock_audit_items').insert(chunk);
      if (itemsErr) {
        alert(`Erro ao gerar itens da auditoria: ${itemsErr.message}`);
        break;
      }
    }

    setCreating(false);
    setNewAuditModal(false);
    setNewForm({ responsible: userName, notes: '' });
    await load();
    openAudit(audit as StockAudit);
  }

  async function deleteOpenAudit(audit: StockAudit) {
    if (!confirm('Cancelar e excluir esta auditoria em aberto? Nenhuma alteração foi aplicada ao estoque.')) return;
    const { error } = await supabase.from('stock_audits').delete().eq('id', audit.id);
    if (error) {
      alert(`Erro ao excluir auditoria: ${error.message}`);
      return;
    }
    setActiveAudit(null);
    await load();
  }

  function handleDraftChange(item: AuditItem, raw: string) {
    setDraftCounts(prev => ({ ...prev, [item.id]: raw }));
    const parsed = raw.trim() === '' ? null : parseInt(raw, 10);
    const cleanVal = parsed !== null && !Number.isNaN(parsed) && parsed >= 0 ? parsed : null;
    setAuditItems(prev =>
      prev.map(i =>
        i.id === item.id
          ? { ...i, counted_quantity: cleanVal, divergence: cleanVal !== null ? cleanVal - i.system_quantity : null }
          : i
      )
    );
  }

  async function persistCounted(item: AuditItem) {
    const raw = (draftCounts[item.id] ?? '').trim();
    const parsed = raw === '' ? null : parseInt(raw, 10);
    const cleanVal = parsed !== null && !Number.isNaN(parsed) && parsed >= 0 ? parsed : null;

    const { error } = await supabase
      .from('stock_audit_items')
      .update({ counted_quantity: cleanVal })
      .eq('id', item.id);

    if (error) {
      alert(`Erro ao salvar contagem de ${item.product_name}: ${error.message}`);
    }
  }

  async function saveJustification(itemId: string, val: string) {
    const { error } = await supabase.from('stock_audit_items').update({ justification: val }).eq('id', itemId);
    if (error) {
      alert(`Erro ao salvar justificativa: ${error.message}`);
      return;
    }
    setAuditItems(items => items.map(i => (i.id === itemId ? { ...i, justification: val } : i)));
  }

  async function closeAudit(applyAdjustments: boolean) {
    if (!activeAudit) return;
    setSavingItems(true);

    try {
      // Flush all current counted values to guarantee zero race condition from unblurred inputs
      const updatedItems = auditItems.map(item => {
        const raw = (draftCounts[item.id] ?? '').trim();
        const parsed = raw === '' ? null : parseInt(raw, 10);
        const cleanVal = parsed !== null && !Number.isNaN(parsed) && parsed >= 0 ? parsed : null;
        return {
          ...item,
          counted_quantity: cleanVal,
          divergence: cleanVal !== null ? cleanVal - item.system_quantity : null,
        };
      });

      const toPersist = updatedItems.filter(i => i.counted_quantity !== null);
      for (const item of toPersist) {
        await supabase
          .from('stock_audit_items')
          .update({ counted_quantity: item.counted_quantity, justification: item.justification })
          .eq('id', item.id);
      }

      if (applyAdjustments) {
        const divergent = updatedItems.filter(i => i.counted_quantity !== null && i.divergence !== 0);
        const ids = divergent.map(d => d.product_id);

        // Fetch LIVE stock quantities to ensure stock_movements before -> after continuity
        const liveStockMap: Record<string, number> = {};
        if (ids.length > 0) {
          const { data: liveProds } = await supabase
            .from('products')
            .select('id,stock_quantity')
            .in('id', ids);
          for (const p of (liveProds as { id: string; stock_quantity: number }[] | null) ?? []) {
            liveStockMap[p.id] = Number(p.stock_quantity) || 0;
          }
        }

        const nowIso = new Date().toISOString();
        for (const item of divergent) {
          const countedVal = item.counted_quantity ?? 0;
          const liveBefore = liveStockMap[item.product_id] ?? item.system_quantity;
          const realDelta = countedVal - liveBefore;

          const { error: updErr } = await supabase
            .from('products')
            .update({ stock_quantity: countedVal, updated_at: nowIso })
            .eq('id', item.product_id);

          if (updErr) {
            alert(`Erro ao ajustar ${item.product_name}: ${updErr.message}`);
            continue;
          }

          if (realDelta !== 0) {
            const movedNote =
              liveBefore !== item.system_quantity
                ? ` (saldo variou de ${item.system_quantity} para ${liveBefore} durante a auditoria)`
                : '';
            await supabase.from('stock_movements').insert({
              product_id: item.product_id,
              product_name: item.product_name,
              movement_type: 'ajuste',
              quantity: Math.abs(realDelta),
              quantity_before: liveBefore,
              quantity_after: countedVal,
              reason: `${item.justification || 'Ajuste de auditoria'}${movedNote}`,
              responsible: activeAudit.responsible || userName,
            });
          }
        }
      }

      const { error: closeErr } = await supabase
        .from('stock_audits')
        .update({ status: 'concluída', closed_at: new Date().toISOString() })
        .eq('id', activeAudit.id);

      if (closeErr) {
        alert(`Erro ao fechar auditoria: ${closeErr.message}`);
      } else {
        setActiveAudit(null);
        await load();
      }
    } finally {
      setSavingItems(false);
    }
  }

  function printAuditSheet() {
    if (!activeAudit) return;
    const rows = auditItems.map(item => {
      const prod = productById[item.product_id];
      return `<tr>
        <td>${escapeHtml(prod?.internal_code || '—')}</td>
        <td>${escapeHtml(item.product_name)}</td>
        <td>${escapeHtml(prod?.location || '—')}</td>
        <td style="text-align:center;">${item.system_quantity}</td>
        <td style="text-align:center;">${item.counted_quantity ?? ''}</td>
        <td style="text-align:center;">${item.divergence ?? ''}</td>
      </tr>`;
    }).join('');
    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8" />
<title>Auditoria de Estoque</title>
<style>
  body { font-family: Arial, sans-serif; font-size: 11px; padding: 20px; color: #1e293b; }
  table { width: 100%; border-collapse: collapse; margin-top: 12px; }
  th, td { border: 1px solid #cbd5e1; padding: 5px 7px; text-align: left; }
  th { background: #f8fafc; font-size: 10px; text-transform: uppercase; }
</style></head><body>
<h2>Folha de Auditoria — ${fmtDate(activeAudit.created_at)}</h2>
<p>Responsável: ${escapeHtml(activeAudit.responsible)} · Status: ${escapeHtml(activeAudit.status)}</p>
<table>
  <thead><tr><th>Código</th><th>Peça</th><th>Local</th><th style="text-align:center;">Sistema</th><th style="text-align:center;">Contagem</th><th style="text-align:center;">Diverg.</th></tr></thead>
  <tbody>${rows}</tbody>
</table></body></html>`;
    printHtml(html, `Auditoria_${toLocalDateKey(activeAudit.created_at)}.pdf`);
  }

  const divergences = auditItems.filter(i => i.divergence !== null && i.divergence !== 0);
  const missingJustifications = divergences.filter(d => !d.justification);
  const uncountedCount = auditItems.filter(i => i.counted_quantity === null).length;
  const counted = auditItems.length - uncountedCount;

  const filteredItems = useMemo(() => {
    const q = safeLower(itemSearch.trim());
    return auditItems.filter(item => {
      const prod = productById[item.product_id];
      if (catFilter && prod?.category !== catFilter) return false;
      if (q && !safeLower(item.product_name).includes(q) && !safeLower(prod?.internal_code).includes(q)) return false;
      if (statusChip === 'uncounted' && item.counted_quantity !== null) return false;
      if (statusChip === 'divergences' && !(item.divergence !== null && item.divergence !== 0)) return false;
      if (statusChip === 'missing_justification' && !(item.divergence !== null && item.divergence !== 0 && !item.justification)) return false;
      return true;
    });
  }, [auditItems, productById, catFilter, itemSearch, statusChip]);

  if (activeAudit) {
    return (
      <div className="p-4 sm:p-6 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <button type="button" onClick={() => setActiveAudit(null)} className="text-xs text-slate-500 hover:text-slate-700 mb-1 flex items-center gap-1">
              ← Voltar ao histórico
            </button>
            <h2 className="font-bold text-slate-800">Auditoria — {fmtDate(activeAudit.created_at)}</h2>
            <p className="text-sm text-slate-500">
              Responsável: {activeAudit.responsible} · {counted}/{auditItems.length} contados · {divergences.length} divergências
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button type="button" onClick={printAuditSheet} className="flex items-center gap-1.5 border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 px-3 py-2 rounded-lg text-sm font-medium">
              <Printer size={14} /> Imprimir
            </button>
            {activeAudit.status === 'aberta' && (
              <>
                <button type="button" onClick={() => deleteOpenAudit(activeAudit)} disabled={savingItems} className="border border-red-200 text-red-600 hover:bg-red-50 px-3 py-2 rounded-lg text-sm font-medium">
                  Cancelar Auditoria
                </button>
                <button type="button" onClick={() => setCloseConfirm({ apply: false })} disabled={savingItems} className="border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 px-3 py-2 rounded-lg text-sm font-medium">
                  Fechar sem ajustar
                </button>
                <button
                  type="button"
                  onClick={() => setCloseConfirm({ apply: true })}
                  disabled={savingItems || missingJustifications.length > 0}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${
                    missingJustifications.length > 0
                      ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                      : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  }`}
                >
                  {savingItems ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                  Fechar e ajustar estoque
                </button>
              </>
            )}
          </div>
        </div>

        {missingJustifications.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700 flex items-center justify-between gap-2 flex-wrap">
            <span>
              <strong>{missingJustifications.length}</strong> divergência(s) sem justificativa. Preencha antes de fechar com ajuste.
            </span>
            <button
              type="button"
              onClick={() => { setCatFilter(''); setItemSearch(''); setStatusChip('missing_justification'); }}
              className="text-xs font-bold bg-red-600 text-white px-2.5 py-1 rounded-lg hover:bg-red-700"
            >
              Ver pendentes
            </button>
          </div>
        )}

        {/* Filter bar */}
        <div className="flex gap-2 flex-wrap items-center">
          <div className="relative flex-1 min-w-48">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="text" value={itemSearch} onChange={e => setItemSearch(e.target.value)} placeholder="Buscar peça ou código na auditoria..." className={inputCls + ' pl-8'} />
          </div>
          <select value={catFilter} onChange={e => setCatFilter(e.target.value)} className={inputCls + ' w-auto'}>
            <option value="">Todas as categorias</option>
            {dynamicCategories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <div className="flex gap-1 flex-wrap">
            {(
              [
                { id: 'all', label: `Todos (${auditItems.length})` },
                { id: 'uncounted', label: `Não contados (${uncountedCount})` },
                { id: 'divergences', label: `Divergências (${divergences.length})` },
                { id: 'missing_justification', label: `Sem justificativa (${missingJustifications.length})` },
              ] as { id: AuditStatusChip; label: string }[]
            ).map(chip => (
              <button
                key={chip.id}
                type="button"
                onClick={() => setStatusChip(chip.id)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  statusChip === chip.id
                    ? 'bg-amber-500 text-white'
                    : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {chip.label}
              </button>
            ))}
          </div>
        </div>

        {loadingItems ? (
          <div className="flex justify-center py-16"><Loader2 size={28} className="text-amber-500 animate-spin" /></div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px]">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    {['Peça', 'Sistema', 'Contagem', 'Divergência', 'Justificativa'].map(h => (
                      <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.length === 0 ? (
                    <tr><td colSpan={5} className="text-center py-10 text-slate-400 text-sm">Nenhum item neste filtro.</td></tr>
                  ) : filteredItems.map(item => {
                    const hasDivergence = item.divergence !== null && item.divergence !== 0;
                    const prod = productById[item.product_id];
                    return (
                      <tr key={item.id} className={`border-b border-slate-100 ${hasDivergence ? 'bg-red-50/30' : ''}`}>
                        <td className="px-3 py-2">
                          <p className="text-sm font-medium text-slate-700">{item.product_name}</p>
                          {(prod?.internal_code || prod?.location) && (
                            <p className="text-[11px] text-slate-400">
                              {[prod?.internal_code, prod?.location].filter(Boolean).join(' · ')}
                            </p>
                          )}
                        </td>
                        <td className="px-3 py-2 text-sm text-slate-500">{item.system_quantity}</td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min={0}
                            disabled={activeAudit.status !== 'aberta'}
                            value={draftCounts[item.id] ?? ''}
                            onChange={e => handleDraftChange(item, e.target.value)}
                            onBlur={() => persistCounted(item)}
                            className="w-24 border border-slate-200 rounded-lg px-2 py-1 text-sm text-center focus:outline-none focus:ring-2 focus:ring-amber-500/30 disabled:bg-slate-50"
                          />
                        </td>
                        <td className="px-3 py-2">
                          {item.divergence !== null ? (
                            <span className={`text-sm font-bold ${item.divergence > 0 ? 'text-emerald-600' : item.divergence < 0 ? 'text-red-600' : 'text-slate-400'}`}>
                              {item.divergence > 0 ? '+' : ''}{item.divergence}
                            </span>
                          ) : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-3 py-2">
                          {hasDivergence ? (
                            <select
                              disabled={activeAudit.status !== 'aberta'}
                              value={item.justification || ''}
                              onChange={e => saveJustification(item.id, e.target.value)}
                              className={`w-full border rounded-lg px-2 py-1 text-xs focus:outline-none disabled:bg-slate-50 ${
                                !item.justification ? 'border-red-300 bg-red-50/50' : 'border-slate-200'
                              }`}
                            >
                              <option value="">Selecionar...</option>
                              {JUSTIFICATIONS.map(j => <option key={j} value={j}>{j}</option>)}
                            </select>
                          ) : <span className="text-xs text-slate-300">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {closeConfirm && (
          <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6">
              <h3 className="text-lg font-bold text-slate-800 mb-2">Confirmar Fechamento</h3>
              <p className="text-sm text-slate-600 mb-6">
                {closeConfirm.apply
                  ? 'Deseja fechar esta auditoria e aplicar os ajustes no estoque? O sistema relerá o saldo atual de cada peça divergente e registrará movimentos de "ajuste".'
                  : 'Deseja fechar esta auditoria sem alterar o estoque atual?'}
              </p>
              <div className="flex justify-end gap-3">
                <button type="button" onClick={() => setCloseConfirm(null)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 rounded-lg border border-slate-200">
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const apply = closeConfirm.apply;
                    setCloseConfirm(null);
                    closeAudit(apply);
                  }}
                  className={`px-4 py-2 text-sm font-bold text-white rounded-lg ${closeConfirm.apply ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-slate-800 hover:bg-slate-900'}`}
                >
                  Confirmar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-slate-800">Histórico de Auditorias</h2>
        <button
          type="button"
          onClick={() => { setNewForm({ responsible: userName, notes: '' }); setNewAuditModal(true); }}
          className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-white px-3 py-2 rounded-lg text-sm font-semibold"
        >
          <Plus size={14} /> Nova Auditoria
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 size={28} className="text-amber-500 animate-spin" /></div>
      ) : audits.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <ClipboardList size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">Nenhuma auditoria realizada.</p>
          <p className="text-xs mt-1">Crie uma auditoria para comparar estoque físico × sistema.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {audits.map(a => (
            <div key={a.id} className="bg-white rounded-xl border border-slate-200 p-4 flex items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${a.status === 'concluída' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                    {a.status}
                  </span>
                  <p className="font-semibold text-slate-800 text-sm">{fmtDate(a.created_at)}</p>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">Responsável: {a.responsible}{a.notes ? ` · ${a.notes}` : ''}</p>
                {a.closed_at && <p className="text-xs text-slate-400">Encerrada: {fmtDate(a.closed_at)}</p>}
              </div>
              <button type="button" onClick={() => openAudit(a)} className="flex items-center gap-1.5 text-xs px-3 py-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600">
                <Eye size={12} /> Abrir
              </button>
            </div>
          ))}
        </div>
      )}

      {newAuditModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="font-bold text-slate-800">Nova Auditoria de Estoque</h2>
              <button type="button" onClick={() => setNewAuditModal(false)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"><X size={16} /></button>
            </div>
            <div className="px-6 py-4 space-y-3">
              <div>
                <label className={labelCls}>Responsável <span className="text-red-400">*</span></label>
                <input type="text" value={newForm.responsible} onChange={e => setNewForm(f => ({ ...f, responsible: e.target.value }))} className={inputCls} placeholder="Nome do responsável pela contagem" />
              </div>
              <div>
                <label className={labelCls}>Observações</label>
                <textarea rows={2} value={newForm.notes} onChange={e => setNewForm(f => ({ ...f, notes: e.target.value }))} className={inputCls + ' resize-none'} placeholder="Ex: Inventário mensal..." />
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700">
                Serão criados registros para todos os <strong>{products.length}</strong> produtos ativos. Preencha as contagens físicas na tela seguinte.
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 flex gap-3">
              <button type="button" onClick={() => setNewAuditModal(false)} className="flex-1 border border-slate-200 text-slate-600 py-2.5 rounded-xl text-sm font-medium">Cancelar</button>
              <button type="button" onClick={createAudit} disabled={creating} className="flex-1 flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white py-2.5 rounded-xl text-sm font-semibold">
                {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                Iniciar Auditoria
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB: RELATÓRIOS
// ═══════════════════════════════════════════════════════════════════════════════

function RelatoriosTab({ refresh }: { refresh: number }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [servicesCount, setServicesCount] = useState(0);
  const [period, setPeriod] = useState<ReportPeriod>('90d');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [pr, mv, sv] = await Promise.all([
      fetchAllPages<Product>((from, to) =>
        supabase.from('products').select('*').eq('active', true).range(from, to)
      ),
      fetchAllPages<StockMovement>((from, to) =>
        supabase.from('stock_movements').select('*').order('created_at', { ascending: false }).range(from, to)
      ),
      fetchAllPages<Service>((from, to) =>
        supabase.from('services').select('id').eq('active', true).range(from, to)
      ),
    ]);
    setProducts(pr);
    setMovements(mv);
    setServicesCount(sv.length);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [refresh, load]);

  const periodMovements = useMemo(
    () => filterMovementsByPeriod(movements, period),
    [movements, period]
  );

  const report = useMemo(
    () => computeInventoryReport(products, periodMovements, servicesCount),
    [products, periodMovements, servicesCount]
  );

  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 size={28} className="text-amber-500 animate-spin" /></div>;
  }

  const barMax = (vals: number[]) => Math.max(...vals, 1);

  function Bar({ value, max, color = 'bg-amber-500' }: { value: number; max: number; color?: string; label?: string }) {
    const pct = Math.min(100, Math.max(0, (Math.max(0, value) / max) * 100));
    return (
      <div className="flex-1 h-3.5 bg-slate-100 rounded-full overflow-hidden">
        <div
          className={`h-full ${color} rounded-full transition-all duration-500`}
          style={{ width: `${pct}%`, minWidth: value > 0 ? '6px' : 0 }}
        />
      </div>
    );
  }

  const PERIOD_OPTIONS: { id: ReportPeriod; label: string }[] = [
    { id: '30d', label: 'Últimos 30 dias' },
    { id: '90d', label: 'Últimos 90 dias' },
    { id: 'year', label: 'Este Ano' },
    { id: 'all', label: 'Todo o Histórico' },
  ];

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Period Selector */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-xs text-slate-500">
          Analisando <strong>{report.totalParts}</strong> peças ativas e <strong>{periodMovements.length}</strong> movimentações no período.
        </p>
        <div className="flex gap-1 bg-white border border-slate-200 rounded-xl p-1">
          {PERIOD_OPTIONS.map(opt => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setPeriod(opt.id)}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                period === opt.id ? 'bg-amber-500 text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* KPI summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'Total de Peças', value: report.totalParts, color: 'text-slate-800' },
          { label: 'Valor em Estoque', value: fmtCurrency(report.totalValue), color: 'text-green-600' },
          { label: 'Custo em Estoque', value: fmtCurrency(report.totalCost), color: 'text-blue-600' },
          { label: 'Lucro Potencial', value: fmtCurrency(report.potentialProfit), color: report.potentialProfit >= 0 ? 'text-teal-600' : 'text-red-600' },
          { label: 'Estoque Zerado', value: report.zeroStock, color: 'text-red-600' },
          { label: 'Abaixo do Mínimo', value: report.belowMin, color: 'text-amber-600' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-xs text-slate-400 mb-1">{label}</p>
            <p className={`text-lg font-extrabold ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Most used parts */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
            <TrendingUp size={14} className="text-amber-500" /> Peças Mais Utilizadas (Saídas + OS)
          </h3>
          {report.topUsedParts.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-4">Nenhuma movimentação de saída no período.</p>
          ) : (
            <div className="space-y-2">
              {report.topUsedParts.map((p, i) => (
                <div key={p.productId} className="flex items-center gap-2">
                  <span className="text-xs text-slate-400 w-4 text-right flex-shrink-0">{i + 1}</span>
                  <span className="text-xs font-medium text-slate-700 w-36 truncate flex-shrink-0" title={p.name}>{p.name}</span>
                  <Bar value={p.qty} max={barMax(report.topUsedParts.map(x => x.qty))} />
                  <span className="text-xs font-bold text-slate-800 tabular-nums w-12 text-right flex-shrink-0">{p.qty} un</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Category stock value */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
            <BarChart3 size={14} className="text-amber-500" /> Valor em Estoque por Categoria
          </h3>
          {report.categoryValues.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-4">Sem dados.</p>
          ) : (
            <div className="space-y-2">
              {report.categoryValues.map(({ category, value }) => (
                <div key={category} className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 w-28 truncate flex-shrink-0">{category}</span>
                  <Bar value={Math.round(value)} max={barMax(report.categoryValues.map(x => x.value))} color="bg-blue-400" label="" />
                  <span className="text-xs font-semibold text-slate-600 flex-shrink-0 w-24 text-right">{fmtCurrency(value)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top margin products */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
            <TrendingUp size={14} className="text-emerald-500" /> Maior Margem de Lucro (%)
          </h3>
          {report.topMargins.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-4">Cadastre preço de custo e venda maiores que zero.</p>
          ) : (
            <div className="space-y-2">
              {report.topMargins.map(p => {
                const isNeg = p.margin < 0;
                return (
                  <div key={p.id} className="flex items-center gap-2">
                    <span className="text-xs text-slate-500 w-36 truncate flex-shrink-0" title={p.name}>{p.name}</span>
                    <Bar value={Math.max(0, Math.round(p.margin))} max={100} color={isNeg ? 'bg-red-400' : 'bg-emerald-400'} label="" />
                    <span className={`text-xs font-semibold flex-shrink-0 w-14 text-right ${isNeg ? 'text-red-600' : 'text-emerald-600'}`}>
                      {p.margin.toFixed(0)}%
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Movement Distribution by Type */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
            <ArrowLeftRight size={14} className="text-blue-500" /> Movimentações por Tipo (Período)
          </h3>
          <div className="space-y-2.5">
            {report.movementSummary.map(s => {
              const colorMap = {
                entrada: 'bg-emerald-400',
                saida: 'bg-red-400',
                os: 'bg-amber-400',
                ajuste: 'bg-blue-400',
              };
              return (
                <div key={s.type} className="flex items-center gap-2">
                  <span className="text-xs text-slate-600 w-24 flex-shrink-0 font-medium">{s.label}</span>
                  <Bar
                    value={s.units}
                    max={barMax(report.movementSummary.map(x => x.units))}
                    color={colorMap[s.type]}
                    label=""
                  />
                  <span className="text-xs text-slate-600 flex-shrink-0 w-28 text-right">
                    <strong>{s.units}</strong> un ({s.count} reg.)
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Alerts */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-2.5 lg:col-span-2">
          <h3 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
            <AlertTriangle size={14} className="text-amber-500" /> Alertas de Estoque e Precificação
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {[
              { label: 'Estoque zerado', count: report.zeroStock, color: 'text-red-600', bg: 'bg-red-50 border-red-200' },
              { label: 'Abaixo do mínimo', count: report.belowMin, color: 'text-amber-600', bg: 'bg-amber-50 border-amber-200' },
              { label: 'Sem preço de venda (R$ 0)', count: report.zeroPriceCount, color: 'text-rose-600', bg: 'bg-rose-50 border-rose-200' },
              { label: 'Margem negativa (venda < custo)', count: report.negativeMarginCount, color: 'text-red-700', bg: 'bg-red-50 border-red-200' },
              { label: 'Sem movimentação no período', count: report.noMovementCount, color: 'text-blue-600', bg: 'bg-blue-50 border-blue-200' },
              { label: 'Serviços ativos cadastrados', count: report.servicesCount, color: 'text-slate-700', bg: 'bg-slate-50 border-slate-200' },
            ].map(({ label, count, color, bg }) => (
              <div key={label} className={`flex items-center justify-between px-3 py-2.5 rounded-lg border ${bg}`}>
                <span className="text-xs text-slate-600">{label}</span>
                <span className={`text-sm font-bold ${color}`}>{count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
