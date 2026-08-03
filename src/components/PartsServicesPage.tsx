import { useState, useEffect, useRef, useMemo } from 'react';
import {
  Package, Wrench, ArrowDownCircle, ArrowUpCircle, ClipboardList, BarChart3,
  Plus, Pencil, Trash2, Loader2, X, Save, Search, Filter, Download, Upload,
  AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Printer, RefreshCw,
  ArrowLeftRight, TrendingUp, Eye, Barcode, ShoppingCart
} from 'lucide-react';
import { supabase } from '../lib/supabase';
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
const MOVE_TYPES      = ['entrada', 'saida', 'ajuste'];
const JUSTIFICATIONS  = ['Compra', 'Devolução de cliente', 'Ajuste de inventário', 'Uso em OS', 'Perda', 'Quebra', 'Furto', 'Erro de lançamento', 'Outros'];

const fmtCurrency = (v: number | undefined | null) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtDate = (d: string | null | undefined) => d ? new Date(d).toLocaleDateString('pt-BR') : '-';
const fmtDateTime = (d: string | null | undefined) => d ? new Date(d).toLocaleString('pt-BR') : '-';

const inputCls = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-400 bg-white';
const labelCls = 'text-xs font-semibold text-slate-600 block mb-1';

type Tab = 'pecas' | 'servicos' | 'pdv' | 'movimentacoes' | 'auditoria' | 'relatorios';

interface Props { onMenuClick: () => void; refresh: number }

// ─── PartsServicesPage ────────────────────────────────────────────────────────

export default function PartsServicesPage({ onMenuClick, refresh }: Props) {
  const [tab, setTab] = useState<Tab>('pecas');

  const tabs: { id: Tab; label: string; icon: typeof Package }[] = [
    { id: 'pecas',         label: 'Peças',          icon: Package },
    { id: 'servicos',      label: 'Serviços',        icon: Wrench },
    { id: 'pdv',           label: 'PDV / Orçamentos',icon: ShoppingCart as any },
    { id: 'movimentacoes', label: 'Movimentações',   icon: ArrowLeftRight },
    { id: 'auditoria',     label: 'Auditoria',       icon: ClipboardList },
    { id: 'relatorios',    label: 'Relatórios',      icon: BarChart3 },
  ];

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Peças e Serviços"
        subtitle="Estoque, serviços, movimentações e auditoria"
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
        {tab === 'pecas'         && <PecasTab refresh={refresh} />}
        {tab === 'servicos'      && <ServicosTab refresh={refresh} />}
        {tab === 'pdv'           && <PartsServicesPDVTab />}
        {tab === 'movimentacoes' && <MovimentacoesTab refresh={refresh} />}
        {tab === 'auditoria'     && <AuditoriaTab />}
        {tab === 'relatorios'    && <RelatoriosTab refresh={refresh} />}
      </div>
    </div>
  );
}

// ─── EAN-13 generator ─────────────────────────────────────────────────────────

function generateEAN13(): string {
  // 12 random digits then calculate check digit
  const digits: number[] = Array.from({ length: 12 }, () => Math.floor(Math.random() * 10));
  const sum = digits.reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 1 : 3), 0);
  const check = (10 - (sum % 10)) % 10;
  return [...digits, check].join('');
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB: PEÇAS
// ═══════════════════════════════════════════════════════════════════════════════

function PecasTab({ refresh }: { refresh: number }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [alertFilter, setAlertFilter] = useState<'' | 'min' | 'zero'>('');
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState<Partial<Product> | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [sortField, setSortField] = useState<keyof Product>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const csvRef = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState('');
  const [importing, setImporting] = useState(false);

  const dynamicCategories = useMemo(() => {
    const cats = new Set(PART_CATEGORIES);
    products.forEach(p => {
      if (p.category) cats.add(p.category);
    });
    return Array.from(cats);
  }, [products]);

  useEffect(() => { load(); }, [refresh]);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('products').select('*').eq('active', true).order('name');
    setProducts((data as unknown as Product[]) ?? []);
    setLoading(false);
  }

  const filtered = useMemo(() => {
    let list = products.filter(p => {
      const q = search.toLowerCase();
      const matchSearch = !q || p.name.toLowerCase().includes(q) || p.internal_code.toLowerCase().includes(q)
        || p.manufacturer.toLowerCase().includes(q) || p.location.toLowerCase().includes(q);
      const matchCat = !catFilter || p.category === catFilter;
      const matchAlert = !alertFilter
        || (alertFilter === 'zero' && p.stock_quantity === 0)
        || (alertFilter === 'min' && p.stock_quantity > 0 && p.stock_quantity <= p.stock_min);
      return matchSearch && matchCat && matchAlert;
    });
    list = [...list].sort((a, b) => {
      const av = a[sortField] ?? '';
      const bv = b[sortField] ?? '';
      const cmp = String(av).localeCompare(String(bv), 'pt-BR', { numeric: true });
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [products, search, catFilter, alertFilter, sortField, sortDir]);

  function sort(f: keyof Product) {
    if (sortField === f) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(f); setSortDir('asc'); }
  }

  function SortIcon({ field }: { field: keyof Product }) {
    if (sortField !== field) return null;
    return sortDir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />;
  }

  const zeros = products.filter(p => p.stock_quantity === 0).length;
  const mins  = products.filter(p => p.stock_quantity > 0 && p.stock_quantity <= p.stock_min).length;

  function openNew() {
    setEditItem({ internal_code: '', name: '', category: 'Refrigeração', manufacturer: '', unit: 'un', cost_price: 0, unit_price: 0, stock_quantity: 0, stock_min: 0, location: '', part_notes: '', description: '' });
    setShowModal(true);
  }

  function openEdit(p: Product) {
    setEditItem({ ...p });
    setShowModal(true);
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const ext = file.name.split('.').pop();
      const path = `parts_${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;
      const { error, data } = await supabase.storage.from('used-items-photos').upload(path, file);
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from('used-items-photos').getPublicUrl(data.path);
      setEditItem(prev => prev ? { ...prev, description: publicUrl } : prev);
    } catch (err) {
      console.error('Erro ao fazer upload da foto:', err);
      alert('Erro ao enviar a foto.');
    }
  }

  async function handleSave() {
    if (!editItem?.name?.trim()) { alert('Nome obrigatório.'); return; }
    setSaving(true);
    const payload = { ...editItem, updated_at: new Date().toISOString() };
    if (editItem.id) {
      const { error: err } = await supabase.from('products').update(payload).eq('id', editItem.id); if(err) alert('Erro: ' + err.message);
    } else {
      const { error } = await supabase.from('products').insert(payload); if(error) alert('Erro: ' + error.message);
    }
    setSaving(false);
    setShowModal(false);
    load();
  }

  async function handleDelete(id: string) {
    setDeleting(id);
    const { error } = await supabase.from('products').update({ active: false }).eq('id', id);
    if (error) console.error('Erro ao excluir peça: ' + error.message);
    setDeleting(null);
    setDeleteConfirm(null);
    load();
  }

  function exportCSV() {
    const header = ['Código,Nome,Categoria,Fabricante,Unidade,Custo,Venda,Estoque,Mínimo,Localização,Observações'];
    const rows = filtered.map(p =>
      [p.internal_code, p.name, p.category, p.manufacturer, p.unit,
       p.cost_price, p.unit_price, p.stock_quantity, p.stock_min, p.location, p.part_notes]
      .map(v => `"${String(v ?? '').replace(/"/g, '""')}"`)
      .join(',')
    );
    const csv = [...header, ...rows].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `pecas_${new Date().toISOString().slice(0,10)}.csv`; a.click();
  }

  function printCount() {
    const catList = catFilter ? filtered : products;
    const groups: Record<string, Product[]> = {};
    catList.forEach(p => { (groups[p.category] = groups[p.category] ?? []).push(p); });
    const rows = Object.entries(groups).map(([cat, items]) => `
      <tr class="cat-row"><td colspan="6">${cat}</td></tr>
      ${items.map(p => `
        <tr>
          <td>${p.internal_code || '—'}</td>
          <td>${p.name}</td>
          <td>${p.location || '—'}</td>
          <td class="c">${p.stock_quantity}</td>
          <td class="c">${p.unit}</td>
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
<div class="sub">Gerado em: ${new Date().toLocaleString('pt-BR')}${catFilter ? ` · Categoria: ${catFilter}` : ''}</div>
<table>
  <thead><tr><th>Código</th><th>Nome</th><th>Localização</th><th class="c">Sistema</th><th class="c">Un.</th><th class="c">Contagem</th></tr></thead>
  <tbody>${rows}</tbody>
</table></body></html>`;
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 400);
  }

  async function handleCSVImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError(''); setImporting(true);
    const text = await file.text();
    const lines = text.replace(/\r/g, '').split('\n').filter(l => l.trim());
    if (lines.length < 2) { setImportError('Arquivo vazio.'); setImporting(false); return; }
    const sep = lines[0].includes(';') ? ';' : ',';
    const header = lines[0].split(sep).map(h => h.trim().toLowerCase().replace(/["\s]/g, ''));
    const col = (names: string[]) => names.reduce((f, n) => f >= 0 ? f : header.indexOf(n), -1);

    const colName  = col(['nome', 'name', 'descricao', 'peça']);
    const colCode  = col(['codigo', 'código', 'code', 'internal_code', 'codigointerno']);
    const colCat   = col(['categoria', 'category']);
    const colMfr   = col(['fabricante', 'manufacturer']);
    const colUnit  = col(['unidade', 'unit', 'un']);
    const colCost  = col(['custo', 'cost', 'cost_price', 'precocusto']);
    const colSell  = col(['venda', 'unit_price', 'preco', 'preçodevenda', 'precodevenda']);
    const colStock = col(['estoque', 'stock', 'stock_quantity', 'quantidade']);
    const colMin   = col(['minimo', 'mínimo', 'stock_min', 'estoqueminimo']);
    const colLoc   = col(['localizacao', 'localização', 'location']);

    if (colName < 0) { setImportError('Coluna "nome" não encontrada.'); setImporting(false); return; }

    const parseCell = (row: string[], idx: number) => idx >= 0 ? row[idx]?.replace(/^["']|["']$/g, '').trim() ?? '' : '';
    const parseNum  = (s: string) => parseFloat(s.replace(/[^\d.,]/g, '').replace(',', '.')) || 0;

    let count = 0;
    for (const line of lines.slice(1)) {
      if (!line.trim()) continue;
      const row = line.split(sep);
      const name = parseCell(row, colName);
      if (!name) continue;
      const payload: Partial<Product> = {
        name,
        internal_code: parseCell(row, colCode),
        category:      parseCell(row, colCat) || 'Outros',
        manufacturer:  parseCell(row, colMfr),
        unit:          parseCell(row, colUnit) || 'un',
        cost_price:    parseNum(parseCell(row, colCost)),
        unit_price:    parseNum(parseCell(row, colSell)),
        stock_quantity: parseInt(parseCell(row, colStock)) || 0,
        stock_min:     parseInt(parseCell(row, colMin)) || 0,
        location:      parseCell(row, colLoc),
        updated_at:    new Date().toISOString(),
      };
      const { error } = await supabase.from('products').insert(payload); if(error) alert('Erro: ' + error.message);
      count++;
    }
    setImportError(`${count} peça(s) importada(s) com sucesso.`);
    setImporting(false);
    load();
    if (csvRef.current) csvRef.current.value = '';
  }

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-full">
      {/* Alert summary */}
      {(zeros > 0 || mins > 0) && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {zeros > 0 && (
            <button onClick={() => setAlertFilter(alertFilter === 'zero' ? '' : 'zero')}
              className={`flex items-center gap-2 p-3 rounded-xl border transition-colors ${alertFilter === 'zero' ? 'bg-red-100 border-red-300' : 'bg-red-50 border-red-200 hover:bg-red-100'}`}>
              <AlertTriangle size={18} className="text-red-500 flex-shrink-0" />
              <div className="text-left"><p className="text-xs font-semibold text-red-700">Estoque Zerado</p><p className="text-xl font-bold text-red-600">{zeros}</p></div>
            </button>
          )}
          {mins > 0 && (
            <button onClick={() => setAlertFilter(alertFilter === 'min' ? '' : 'min')}
              className={`flex items-center gap-2 p-3 rounded-xl border transition-colors ${alertFilter === 'min' ? 'bg-amber-100 border-amber-300' : 'bg-amber-50 border-amber-200 hover:bg-amber-100'}`}>
              <AlertTriangle size={18} className="text-amber-500 flex-shrink-0" />
              <div className="text-left"><p className="text-xs font-semibold text-amber-700">Abaixo do Mínimo</p><p className="text-xl font-bold text-amber-600">{mins}</p></div>
            </button>
          )}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Pesquisar peças..." className={inputCls + ' pl-8'} />
        </div>
        <select value={catFilter} onChange={e => setCatFilter(e.target.value)} className={inputCls + ' w-auto'}>
          <option value="">Todas as categorias</option>
          {dynamicCategories.map(c => <option key={c}>{c}</option>)}
        </select>
        {alertFilter && (
          <button onClick={() => setAlertFilter('')} className="flex items-center gap-1 text-xs px-2 py-1.5 bg-amber-100 text-amber-700 rounded-lg border border-amber-200">
            <X size={12} /> Limpar filtro
          </button>
        )}
        <div className="flex gap-1.5 ml-auto">
          <button onClick={printCount} title="Imprimir para contagem" className="p-2 border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600 transition-colors"><Printer size={15} /></button>
          <button onClick={exportCSV} title="Exportar CSV" className="p-2 border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600 transition-colors"><Download size={15} /></button>
          <label title="Importar CSV" className="cursor-pointer p-2 border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600 transition-colors">
            {importing ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
            <input ref={csvRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleCSVImport} />
          </label>
          <button onClick={openNew} className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-white px-3 py-2 rounded-lg text-sm font-semibold transition-colors">
            <Plus size={14} /> Nova Peça
          </button>
        </div>
      </div>

      {importError && (
        <div className={`text-sm p-3 rounded-lg border ${importError.includes('sucesso') ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
          {importError}
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 size={28} className="text-amber-500 animate-spin" /></div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  {([['internal_code','Código'],['name','Nome'],['category','Categoria'],['manufacturer','Fabricante'],['location','Localização'],['unit_price','Preço'],['cost_price','Custo'],['stock_quantity','Estoque'],['stock_min','Mínimo']] as [keyof Product, string][]).map(([f, label]) => (
                    <th key={f} onClick={() => sort(f)} className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide cursor-pointer hover:text-slate-700 select-none whitespace-nowrap">
                      <span className="flex items-center gap-1">{label}<SortIcon field={f} /></span>
                    </th>
                  ))}
                  <th className="px-3 py-2.5 text-right text-xs font-semibold text-slate-500 uppercase">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={10} className="text-center py-12 text-slate-400 text-sm">Nenhuma peça encontrada.</td></tr>
                ) : filtered.map(p => {
                  const isZero = p.stock_quantity === 0;
                  const isMin  = !isZero && p.stock_quantity <= p.stock_min;
                  return (
                    <tr key={p.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                      <td className="px-3 py-2.5 text-xs text-slate-500 font-mono">{p.internal_code || '—'}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          {p.description && p.description.startsWith('http') && <img src={p.description} alt="" className="w-12 h-12 rounded object-cover flex-shrink-0 border border-slate-100" />}
                          <span className="text-sm font-medium text-slate-800">{p.name}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5"><span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-medium">{p.category}</span></td>
                      <td className="px-3 py-2.5 text-sm text-slate-600">{p.manufacturer || '—'}</td>
                      <td className="px-3 py-2.5 text-sm text-slate-500">{p.location || '—'}</td>
                      <td className="px-3 py-2.5 text-sm font-semibold text-slate-700">{fmtCurrency(p.unit_price)}</td>
                      <td className="px-3 py-2.5 text-sm text-slate-500">{fmtCurrency(p.cost_price)}</td>
                      <td className="px-3 py-2.5">
                        <span className={`flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full w-fit ${isZero ? 'bg-red-100 text-red-700' : isMin ? 'bg-amber-100 text-amber-700' : 'bg-green-50 text-green-700'}`}>
                          {(isZero || isMin) && <AlertTriangle size={10} />}
                          {p.stock_quantity} {p.unit}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-slate-400">{p.stock_min}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center justify-end gap-1">
                          {deleteConfirm === p.id ? (
                            <div className="flex items-center gap-1.5 mr-1">
                              <span className="text-xs text-red-600 font-medium">Excluir?</span>
                              <button onClick={() => handleDelete(p.id)} className="p-1 px-2 bg-red-500 text-white rounded hover:bg-red-600 text-xs font-semibold">Sim</button>
                              <button onClick={() => setDeleteConfirm(null)} className="p-1 px-2 bg-slate-200 text-slate-700 rounded hover:bg-slate-300 text-xs">Não</button>
                            </div>
                          ) : (
                            <>
                              <button onClick={() => openEdit(p)} className="p-1.5 hover:bg-amber-50 text-amber-600 rounded-lg transition-colors"><Pencil size={13} /></button>
                              <button onClick={() => setDeleteConfirm(p.id)} disabled={deleting === p.id} className="p-1.5 hover:bg-red-50 text-red-500 rounded-lg transition-colors">
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
          <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200 text-xs text-slate-400">
            {filtered.length} de {products.length} peça(s)
          </div>
        </div>
      )}

      {/* Modal */}
      {showModal && editItem && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="font-bold text-slate-800">{editItem.id ? 'Editar Peça' : 'Nova Peça'}</h2>
              <button onClick={() => setShowModal(false)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"><X size={16} /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
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
                      <Barcode size={14} />
                      Gerar
                    </button>
                  </div>
                </div>
                <div>
                  <label className={labelCls}>Nome da Peça <span className="text-red-400">*</span></label>
                  <input type="text" value={editItem.name ?? ''} onChange={e => setEditItem(v => ({ ...v!, name: e.target.value }))} className={inputCls} placeholder="Nome da peça" />
                </div>
                <div>
                  <label className={labelCls}>Categoria</label>
                  <select value={editItem.category ?? ''} onChange={e => setEditItem(v => ({ ...v!, category: e.target.value }))} className={inputCls}>
                    {Array.from(new Set([...dynamicCategories, ...(editItem.category ? [editItem.category] : [])])).map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Fabricante</label>
                  <input type="text" value={editItem.manufacturer ?? ''} onChange={e => setEditItem(v => ({ ...v!, manufacturer: e.target.value }))} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Unidade</label>
                  <select value={editItem.unit ?? 'un'} onChange={e => setEditItem(v => ({ ...v!, unit: e.target.value }))} className={inputCls}>
                    {UNITS.map(u => <option key={u}>{u}</option>)}
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
                    <label className="text-xs font-medium text-slate-600">Preço de Venda (R$)</label>
                    {(editItem.unit_price || 0) > 0 && (editItem.cost_price || 0) > 0 && (
                      <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded" title="Margem de Lucro Bruto">
                        Margem: {((((editItem.unit_price || 0) - (editItem.cost_price || 0)) / (editItem.unit_price || 1)) * 100).toFixed(1)}%
                      </span>
                    )}
                  </div>
                  <input type="number" min={0} step={0.01} value={editItem.unit_price ?? 0} onChange={e => setEditItem(v => ({ ...v!, unit_price: parseFloat(e.target.value) || 0 }))} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Estoque Atual</label>
                  <input type="number" min={0} value={editItem.stock_quantity ?? 0} onChange={e => setEditItem(v => ({ ...v!, stock_quantity: parseInt(e.target.value) || 0 }))} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Estoque Mínimo</label>
                  <input type="number" min={0} value={editItem.stock_min ?? 0} onChange={e => setEditItem(v => ({ ...v!, stock_min: parseInt(e.target.value) || 0 }))} className={inputCls} />
                </div>
                <div className="col-span-2">
                  <label className={labelCls}>Observações</label>
                  <textarea rows={2} value={editItem.part_notes ?? ''} onChange={e => setEditItem(v => ({ ...v!, part_notes: e.target.value }))} className={inputCls + ' resize-none'} />
                </div>
                <div className="col-span-2">
                  <label className={labelCls}>Foto da Peça</label>
                  <div className="flex items-center gap-4">
                    {editItem.description ? (
                      <div className="relative group">
                        <img 
                          src={editItem.description} 
                          alt="Preview" 
                          onDoubleClick={() => window.open(editItem.description, '_blank')}
                          title="Duplo clique para ver em tamanho natural"
                          className="w-20 h-20 object-cover rounded-lg border border-slate-200 shadow-sm cursor-pointer hover:opacity-90 transition-opacity" 
                        />
                        <button
                          type="button"
                          onClick={() => setEditItem(v => ({ ...v!, description: '' }))}
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
                      <Upload size={16} />
                      {editItem.description ? 'Trocar Foto' : 'Adicionar Foto'}
                      <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
                    </label>
                  </div>
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 flex gap-3">
              <button onClick={() => setShowModal(false)} className="flex-1 border border-slate-200 text-slate-600 hover:bg-slate-50 py-2.5 rounded-xl text-sm font-medium">Cancelar</button>
              <button onClick={handleSave} disabled={saving} className="flex-1 flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white py-2.5 rounded-xl text-sm font-semibold">
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
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const dynamicSvcCategories = useMemo(() => {
    const cats = new Set(SVC_CATEGORIES);
    services.forEach(s => {
      if (s.category) cats.add(s.category);
    });
    return Array.from(cats);
  }, [services]);

  useEffect(() => { load(); }, [refresh]);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('services').select('*').eq('active', true).order('name');
    setServices((data as unknown as Service[]) ?? []);
    setLoading(false);
  }

  const filtered = services.filter(s => {
    const q = search.toLowerCase();
    return (!q || s.name.toLowerCase().includes(q) || s.notes.toLowerCase().includes(q))
      && (!catFilter || s.category === catFilter);
  });

  function openNew() {
    setEditItem({ name: '', category: 'Manutenção', estimated_time: '', technician_name: '', price: 0, notes: '', active: true });
    setShowModal(true);
  }

  async function handleSave() {
    if (!editItem?.name?.trim()) { alert('Nome obrigatório.'); return; }
    setSaving(true);
    const payload = { ...editItem, updated_at: new Date().toISOString() };
    if (editItem.id) {
      await supabase.from('services').update(payload).eq('id', editItem.id);
    } else {
      await supabase.from('services').insert(payload);
    }
    setSaving(false); setShowModal(false); load();
  }

  async function handleDelete(id: string) {
    setDeleting(id);
    const { error } = await supabase.from('services').update({ active: false }).eq('id', id);
    if (error) console.error('Erro ao excluir serviço: ' + error.message);
    setDeleting(null);
    setDeleteConfirm(null);
    load();
  }

  function exportCSV() {
    const header = ['Nome,Categoria,Tempo Estimado,Técnico,Valor,Observações'];
    const rows = services.map(s =>
      [s.name, s.category, s.estimated_time, s.technician_name, s.price, s.notes]
      .map(v => `"${String(v ?? '').replace(/"/g, '""')}"`)
      .join(',')
    );
    const csv = [...header, ...rows].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `servicos_${new Date().toISOString().slice(0,10)}.csv`; a.click();
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
          {dynamicSvcCategories.map(c => <option key={c}>{c}</option>)}
        </select>
        <div className="flex gap-1.5 ml-auto">
          <button onClick={exportCSV} className="p-2 border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600"><Download size={15} /></button>
          <button onClick={openNew} className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-white px-3 py-2 rounded-lg text-sm font-semibold">
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
                      <button onClick={() => handleDelete(s.id)} className="bg-red-500 hover:bg-red-600 text-white px-2 py-0.5 rounded text-xs">Sim</button>
                      <button onClick={() => setDeleteConfirm(null)} className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-2 py-0.5 rounded text-xs">Não</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <button onClick={() => { setEditItem({ ...s }); setShowModal(true); }} className="flex-1 flex items-center justify-center gap-1 text-xs py-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600">
                      <Pencil size={11} /> Editar
                    </button>
                    <button onClick={() => setDeleteConfirm(s.id)} disabled={deleting === s.id} className="flex-1 flex items-center justify-center gap-1 text-xs py-1.5 border border-red-200 rounded-lg hover:bg-red-50 text-red-500">
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
              <button onClick={() => setShowModal(false)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"><X size={16} /></button>
            </div>
            <div className="px-6 py-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className={labelCls}>Nome do Serviço <span className="text-red-400">*</span></label>
                  <input type="text" value={editItem.name ?? ''} onChange={e => setEditItem(v => ({ ...v!, name: e.target.value }))} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Categoria</label>
                  <select value={editItem.category ?? 'Manutenção'} onChange={e => setEditItem(v => ({ ...v!, category: e.target.value }))} className={inputCls}>
                    {Array.from(new Set([...dynamicSvcCategories, ...(editItem.category ? [editItem.category] : [])])).map(c => <option key={c} value={c}>{c}</option>)}
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
              <button onClick={() => setShowModal(false)} className="flex-1 border border-slate-200 text-slate-600 py-2.5 rounded-xl text-sm font-medium">Cancelar</button>
              <button onClick={handleSave} disabled={saving} className="flex-1 flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white py-2.5 rounded-xl text-sm font-semibold">
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

function MovimentacoesTab({ refresh }: { refresh: number }) {
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<{ product_id: string; movement_type: string; quantity: number; reason: string; responsible: string }>({
    product_id: '', movement_type: 'entrada', quantity: 1, reason: '', responsible: ''
  });
  const [saving, setSaving] = useState(false);
  const [typeFilter, setTypeFilter] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => { load(); }, [refresh]);

  async function load() {
    setLoading(true);
    const [{ data: mv }, { data: pr }] = await Promise.all([
      supabase.from('stock_movements').select('*').order('created_at', { ascending: false }).limit(200),
      supabase.from('products').select('id,name,stock_quantity,unit,cost_price').eq('active', true).order('name'),
    ]);
    setMovements((mv as unknown as StockMovement[]) ?? []);
    setProducts((pr as unknown as Product[]) ?? []);
    setLoading(false);
  }

  async function handleRegister() {
    if (!form.product_id) { alert('Selecione a peça.'); return; }
    if (!form.quantity || form.quantity <= 0) { alert('Quantidade inválida.'); return; }
    setSaving(true);
    const prod = products.find(p => p.id === form.product_id)!;
    const before = prod.stock_quantity;
    const delta = form.movement_type === 'saida' ? -form.quantity : form.quantity;
    const after = Math.max(0, before + delta);

    const { error: updErr } = await supabase.from('products').update({ stock_quantity: after, updated_at: new Date().toISOString() }).eq('id', form.product_id);
    if (updErr) { alert('Erro ao atualizar estoque: ' + updErr.message); setSaving(false); return; }
    const { error: insErr } = await supabase.from('stock_movements').insert({
      product_id: form.product_id,
      product_name: prod.name,
      movement_type: form.movement_type,
      quantity: form.quantity,
      quantity_before: before,
      quantity_after: after,
      reason: form.reason,
      responsible: form.responsible,
    });
    
    if (insErr) {
      alert('A tabela de movimentações pode não existir. Por favor, execute a migração SQL no seu banco de dados Supabase: ' + insErr.message);
      setSaving(false);
      return;
    }

    // --- Integração Financeira ---
    if ((form.movement_type === 'entrada' && form.reason.toLowerCase() === 'compra') || 
        (form.movement_type === 'saida' && ['quebra', 'perda', 'roubo'].includes(form.reason.toLowerCase()))) {
      
      const category = form.movement_type === 'entrada' ? 'Compra de Estoque' : 'Perda/Quebra de Estoque';
      const description = form.movement_type === 'entrada' 
        ? `Compra de ${form.quantity}x ${prod.name}`
        : `Baixa de Estoque (${form.reason}) - ${form.quantity}x ${prod.name}`;
      
      const amount = form.quantity * (prod.cost_price || 0);

      if (amount > 0) {
        const { error: expErr } = await supabase.from('expenses').insert({
          description,
          category,
          amount,
          due_date: new Date().toISOString().slice(0, 10),
          paid_at: new Date().toISOString().slice(0, 10),
          status: 'pago',
          recurrence: 'única',
          attachment_url: '',
          cost_center_id: null
        });
        
        if (expErr) {
          alert('Atenção: A movimentação foi salva, mas ocorreu um erro ao registrar no financeiro: ' + expErr.message);
        }
      } else {
        alert('Movimentação salva, mas NENHUM valor foi lançado no Financeiro pois esta peça está com o "Preço de Custo" zerado.');
      }
    }
    // ----------------------------

    setSaving(false);
    setShowModal(false);
    setForm({ product_id: '', movement_type: 'entrada', quantity: 1, reason: '', responsible: '' });
    load();
  }

  const filtered = movements.filter(m => {
    const q = search.toLowerCase();
    return (!q || m.product_name.toLowerCase().includes(q) || m.reason.toLowerCase().includes(q) || m.responsible.toLowerCase().includes(q))
      && (!typeFilter || m.movement_type === typeFilter);
  });

  const TYPE_CONFIG: Record<string, { label: string; color: string; icon: typeof ArrowDownCircle }> = {
    entrada: { label: 'Entrada', color: 'text-emerald-600 bg-emerald-50 border-emerald-200', icon: ArrowDownCircle },
    saida:   { label: 'Saída',   color: 'text-red-600 bg-red-50 border-red-200',             icon: ArrowUpCircle },
    ajuste:  { label: 'Ajuste',  color: 'text-blue-600 bg-blue-50 border-blue-200',          icon: RefreshCw },
    os:      { label: 'OS',      color: 'text-amber-600 bg-amber-50 border-amber-200',       icon: Wrench },
  };

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Pesquisar movimentações..." className={inputCls + ' pl-8'} />
        </div>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className={inputCls + ' w-auto'}>
          <option value="">Todos os tipos</option>
          {MOVE_TYPES.map(t => <option key={t} value={t}>{TYPE_CONFIG[t]?.label ?? t}</option>)}
        </select>
        <button onClick={() => setShowModal(true)} className="ml-auto flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-white px-3 py-2 rounded-lg text-sm font-semibold">
          <Plus size={14} /> Registrar Movimentação
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 size={28} className="text-amber-500 animate-spin" /></div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px]">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  {['Data','Peça','Tipo','Quantidade','Antes → Depois','Motivo','Responsável'].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-12 text-slate-400 text-sm">Nenhuma movimentação registrada.</td></tr>
                ) : filtered.map(m => {
                  const cfg = TYPE_CONFIG[m.movement_type] ?? TYPE_CONFIG.ajuste;
                  const Icon = cfg.icon;
                  return (
                    <tr key={m.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-3 py-2.5 text-xs text-slate-500 whitespace-nowrap">{fmtDateTime(m.created_at)}</td>
                      <td className="px-3 py-2.5 text-sm font-medium text-slate-700">{m.product_name}</td>
                      <td className="px-3 py-2.5">
                        <span className={`flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border w-fit ${cfg.color}`}>
                          <Icon size={11} />{cfg.label}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-sm font-bold text-slate-700">{m.movement_type === 'saida' ? '-' : '+'}{m.quantity}</td>
                      <td className="px-3 py-2.5 text-xs text-slate-500 font-mono">{m.quantity_before} → {m.quantity_after}</td>
                      <td className="px-3 py-2.5 text-sm text-slate-600">{m.reason || '—'}</td>
                      <td className="px-3 py-2.5 text-sm text-slate-500">{m.responsible || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {filtered.length > 0 && (
            <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200 text-xs text-slate-400">
              {filtered.length} movimentação(ões)
            </div>
          )}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="font-bold text-slate-800 flex items-center gap-2"><ArrowLeftRight size={16} className="text-amber-500" /> Registrar Movimentação</h2>
              <button onClick={() => setShowModal(false)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"><X size={16} /></button>
            </div>
            <div className="px-6 py-4 space-y-3">
              <div>
                <label className={labelCls}>Peça <span className="text-red-400">*</span></label>
                <select value={form.product_id} onChange={e => setForm(f => ({ ...f, product_id: e.target.value }))} className={inputCls}>
                  <option value="">Selecionar...</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.name} (estoque: {p.stock_quantity} {p.unit})</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Tipo</label>
                  <select value={form.movement_type} onChange={e => setForm(f => ({ ...f, movement_type: e.target.value }))} className={inputCls}>
                    {MOVE_TYPES.map(t => <option key={t} value={t}>{TYPE_CONFIG[t]?.label ?? t}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Quantidade</label>
                  <input type="number" min={1} value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: parseInt(e.target.value) || 1 }))} className={inputCls} />
                </div>
              </div>
              <div>
                <label className={labelCls}>Motivo</label>
                <select value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} className={inputCls}>
                  <option value="">Selecionar...</option>
                  {JUSTIFICATIONS.map(j => <option key={j}>{j}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Responsável</label>
                <input type="text" value={form.responsible} onChange={e => setForm(f => ({ ...f, responsible: e.target.value }))} className={inputCls} placeholder="Nome do responsável" />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 flex gap-3">
              <button onClick={() => setShowModal(false)} className="flex-1 border border-slate-200 text-slate-600 py-2.5 rounded-xl text-sm font-medium">Cancelar</button>
              <button onClick={handleRegister} disabled={saving} className="flex-1 flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white py-2.5 rounded-xl text-sm font-semibold">
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

function AuditoriaTab() {
  const [audits, setAudits] = useState<StockAudit[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeAudit, setActiveAudit] = useState<StockAudit | null>(null);
  const [auditItems, setAuditItems] = useState<AuditItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [newAuditModal, setNewAuditModal] = useState(false);
  const [newForm, setNewForm] = useState({ responsible: '', notes: '' });
  const [creating, setCreating] = useState(false);
  const [savingItems, setSavingItems] = useState(false);
  const [catFilter, setCatFilter] = useState('');
  const [closeConfirm, setCloseConfirm] = useState<{ apply: boolean } | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const [{ data: au }, { data: pr }] = await Promise.all([
      supabase.from('stock_audits').select('*').order('created_at', { ascending: false }),
      supabase.from('products').select('id,name,category,stock_quantity,unit,stock_min').eq('active', true).order('name'),
    ]);
    setAudits((au as unknown as StockAudit[]) ?? []);
    setProducts((pr as unknown as Product[]) ?? []);
    setLoading(false);
  }

  async function openAudit(audit: StockAudit) {
    setActiveAudit(audit);
    setLoadingItems(true);
    const { data } = await supabase.from('stock_audit_items').select('*').eq('audit_id', audit.id).order('product_name');
    setAuditItems((data as unknown as AuditItem[]) ?? []);
    setLoadingItems(false);
  }

  async function createAudit() {
    if (!newForm.responsible.trim()) { alert('Informe o responsável.'); return; }
    setCreating(true);
    const { data: audit, error: auditErr } = await supabase.from('stock_audits').insert({ ...newForm, status: 'aberta' }).select().single();
    if (auditErr) {
      alert('Erro ao criar auditoria: ' + auditErr.message + '\n\nCertifique-se de ter executado as migrações SQL mais recentes no Supabase.');
      setCreating(false);
      return;
    }
    if (audit) {
      // Insert a row for every active product
      const items = products.map(p => ({
        audit_id: audit.id,
        product_id: p.id,
        product_name: p.name,
        system_quantity: p.stock_quantity,
        justification: '',
      }));
      if (items.length > 0) {
         const { error: itemsErr } = await supabase.from('stock_audit_items').insert(items);
         if (itemsErr) console.error('Erro ao inserir itens da auditoria:', itemsErr);
      }
    }
    setCreating(false);
    setNewAuditModal(false);
    setNewForm({ responsible: '', notes: '' });
    await load();
    if (audit) openAudit(audit as StockAudit);
  }

  async function saveCounted(itemId: string, val: number | null) {
    await supabase.from('stock_audit_items').update({ counted_quantity: val }).eq('id', itemId);
    setAuditItems(items => items.map(i => i.id === itemId ? { ...i, counted_quantity: val, divergence: val !== null ? val - i.system_quantity : null } : i));
  }

  async function saveJustification(itemId: string, val: string) {
    await supabase.from('stock_audit_items').update({ justification: val }).eq('id', itemId);
    setAuditItems(items => items.map(i => i.id === itemId ? { ...i, justification: val } : i));
  }

  async function closeAudit(applyAdjustments: boolean) {
    if (!activeAudit) return;
    
    setSavingItems(true);

    if (applyAdjustments) {
      for (const item of auditItems.filter(i => i.counted_quantity !== null && i.divergence !== 0)) {
        await supabase.from('products').update({ stock_quantity: item.counted_quantity, updated_at: new Date().toISOString() }).eq('id', item.product_id);
        await supabase.from('stock_movements').insert({
          product_id: item.product_id,
          product_name: item.product_name,
          movement_type: 'ajuste',
          quantity: Math.abs(item.divergence ?? 0),
          quantity_before: item.system_quantity,
          quantity_after: item.counted_quantity,
          reason: item.justification || 'Ajuste de auditoria',
          responsible: activeAudit.responsible,
        });
      }
    }

    await supabase.from('stock_audits').update({ status: 'concluída', closed_at: new Date().toISOString() }).eq('id', activeAudit.id);
    setSavingItems(false);
    setActiveAudit(null);
    load();
  }

  const filteredItems = auditItems.filter(i => !catFilter || products.find(p => p.id === i.product_id)?.category === catFilter);
  const divergences = auditItems.filter(i => i.divergence !== null && i.divergence !== 0);
  const counted = auditItems.filter(i => i.counted_quantity !== null).length;

  if (activeAudit) {
    return (
      <div className="p-4 sm:p-6 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <button onClick={() => setActiveAudit(null)} className="text-xs text-slate-500 hover:text-slate-700 mb-1 flex items-center gap-1">← Voltar</button>
            <h2 className="font-bold text-slate-800">Auditoria — {fmtDate(activeAudit.created_at)}</h2>
            <p className="text-sm text-slate-500">Responsável: {activeAudit.responsible} · {counted}/{auditItems.length} contados · {divergences.length} divergências</p>
          </div>
          {activeAudit.status === 'aberta' && (
            <div className="flex gap-2">
              <button onClick={() => setCloseConfirm({ apply: false })} disabled={savingItems} className="border border-slate-200 text-slate-600 hover:bg-slate-50 px-3 py-2 rounded-lg text-sm font-medium">
                Fechar sem ajustar
              </button>
              <button onClick={() => setCloseConfirm({ apply: true })} disabled={savingItems || divergences.some(d => !d.justification)} className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${divergences.some(d => !d.justification) ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-700 text-white'}`}>
                {savingItems ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                Fechar e ajustar estoque
              </button>
            </div>
          )}
        </div>

        {divergences.some(d => !d.justification) && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
            <strong>{divergences.filter(d => !d.justification).length}</strong> divergência(s) sem justificativa no total da auditoria. Informe as justificativas antes de fechar.
            {divergences.filter(d => !d.justification && (!catFilter || products.find(p => p.id === d.product_id)?.category === catFilter) === false).length > 0 && (
              <span className="block mt-1 font-semibold">⚠️ Atenção: Existem itens sem justificativa que estão ocultos pelo seu filtro atual de categoria.</span>
            )}
          </div>
        )}

        <div className="flex gap-2 flex-wrap">
          <select value={catFilter} onChange={e => setCatFilter(e.target.value)} className={inputCls + ' w-auto'}>
            <option value="">Todas as categorias</option>
            {PART_CATEGORIES.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>

        {loadingItems ? (
          <div className="flex justify-center py-16"><Loader2 size={28} className="text-amber-500 animate-spin" /></div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px]">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    {['Peça','Sistema','Contagem','Divergência','Justificativa'].map(h => (
                      <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map(item => {
                    const hasDivergence = item.divergence !== null && item.divergence !== 0;
                    return (
                      <tr key={item.id} className={`border-b border-slate-100 ${hasDivergence ? 'bg-red-50/30' : ''}`}>
                        <td className="px-3 py-2 text-sm font-medium text-slate-700">{item.product_name}</td>
                        <td className="px-3 py-2 text-sm text-slate-500">{item.system_quantity}</td>
                        <td className="px-3 py-2">
                          <input
                            type="number" min={0}
                            disabled={activeAudit.status !== 'aberta'}
                            defaultValue={item.counted_quantity ?? ''}
                            onBlur={e => saveCounted(item.id, e.target.value !== '' ? parseInt(e.target.value) : null)}
                            className="w-20 border border-slate-200 rounded-lg px-2 py-1 text-sm text-center focus:outline-none focus:ring-2 focus:ring-amber-500/30 disabled:bg-slate-50"
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
                              className="w-full border border-slate-200 rounded-lg px-2 py-1 text-xs focus:outline-none disabled:bg-slate-50"
                            >
                              <option value="">Selecionar...</option>
                              {JUSTIFICATIONS.map(j => <option key={j}>{j}</option>)}
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
                ? 'Deseja fechar esta auditoria e aplicar os ajustes no estoque? As diferenças serão lançadas como movimentos de "ajuste".'
                : 'Deseja fechar esta auditoria sem alterar o estoque atual?'}
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setCloseConfirm(null)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 rounded-lg border border-slate-200">Cancelar</button>
              <button 
                onClick={() => {
                  closeAudit(closeConfirm.apply);
                  setCloseConfirm(null);
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
        <button onClick={() => setNewAuditModal(true)} className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-white px-3 py-2 rounded-lg text-sm font-semibold">
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
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${a.status === 'concluída' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>{a.status}</span>
                  <p className="font-semibold text-slate-800 text-sm">{fmtDate(a.created_at)}</p>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">Responsável: {a.responsible}{a.notes ? ` · ${a.notes}` : ''}</p>
                {a.closed_at && <p className="text-xs text-slate-400">Encerrada: {fmtDate(a.closed_at)}</p>}
              </div>
              <button onClick={() => openAudit(a)} className="flex items-center gap-1.5 text-xs px-3 py-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600">
                <Eye size={12} /> Ver
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
              <button onClick={() => setNewAuditModal(false)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"><X size={16} /></button>
            </div>
            <div className="px-6 py-4 space-y-3">
              <div>
                <label className={labelCls}>Responsável <span className="text-red-400">*</span></label>
                <input type="text" value={newForm.responsible} onChange={e => setNewForm(f => ({ ...f, responsible: e.target.value }))} className={inputCls} placeholder="Nome do responsável pela contagem" />
              </div>
              <div>
                <label className={labelCls}>Observações</label>
                <textarea rows={2} value={newForm.notes} onChange={e => setNewForm(f => ({ ...f, notes: e.target.value }))} className={inputCls + ' resize-none'} placeholder="Ex: Auditoria mensal de julho..." />
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700">
                Serão criados registros para todos os <strong>{products.length}</strong> produtos. Preencha as contagens físicas na tela seguinte.
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 flex gap-3">
              <button onClick={() => setNewAuditModal(false)} className="flex-1 border border-slate-200 text-slate-600 py-2.5 rounded-xl text-sm font-medium">Cancelar</button>
              <button onClick={createAudit} disabled={creating} className="flex-1 flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white py-2.5 rounded-xl text-sm font-semibold">
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
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, [refresh]);

  async function load() {
    setLoading(true);
    const [{ data: pr }, { data: mv }, { data: sv }] = await Promise.all([
      supabase.from('products').select('*').eq('active', true),
      supabase.from('stock_movements').select('*').order('created_at', { ascending: false }).limit(500),
      supabase.from('services').select('*').eq('active', true),
    ]);
    setProducts((pr as unknown as Product[]) ?? []);
    setMovements((mv as unknown as StockMovement[]) ?? []);
    setServices((sv as unknown as Service[]) ?? []);
    setLoading(false);
  }

  if (loading) return <div className="flex justify-center py-16"><Loader2 size={28} className="text-amber-500 animate-spin" /></div>;

  const totalParts  = products.length;
  const totalValue  = products.reduce((s, p) => s + p.unit_price * p.stock_quantity, 0);
  const totalCost   = products.reduce((s, p) => s + p.cost_price * p.stock_quantity, 0);
  const zeroStock   = products.filter(p => p.stock_quantity === 0).length;
  const belowMin    = products.filter(p => p.stock_quantity > 0 && p.stock_quantity <= p.stock_min).length;
  const noMovement  = products.filter(p => !movements.some(m => m.product_id === p.id)).length;

  // Most used parts (by saida + os movements)
  const usageMap: Record<string, { name: string; qty: number }> = {};
  movements.filter(m => m.movement_type === 'saida' || m.movement_type === 'os').forEach(m => {
    usageMap[m.product_id] = { name: m.product_name, qty: (usageMap[m.product_id]?.qty ?? 0) + m.quantity };
  });
  const topParts = Object.values(usageMap).sort((a, b) => b.qty - a.qty).slice(0, 8);

  // Movement type distribution
  const mvTypes: Record<string, number> = {};
  movements.forEach(m => { mvTypes[m.movement_type] = (mvTypes[m.movement_type] ?? 0) + m.quantity; });

  // Category stock value
  const catMap: Record<string, number> = {};
  products.forEach(p => { catMap[p.category] = (catMap[p.category] ?? 0) + p.unit_price * p.stock_quantity; });
  const catValues = Object.entries(catMap).sort((a, b) => b[1] - a[1]);

  // Margin per product (top 8 by margin value)
  const topMargin = products
    .filter(p => p.cost_price > 0)
    .map(p => ({ name: p.name, margin: ((p.unit_price - p.cost_price) / p.unit_price) * 100 }))
    .sort((a, b) => b.margin - a.margin)
    .slice(0, 8);

  const barMax = (vals: number[]) => Math.max(...vals, 1);

  function Bar({ value, max, color = 'bg-amber-400' }: { value: number; max: number; color?: string }) {
    return (
      <div className="flex-1 h-4 bg-slate-100 rounded overflow-hidden">
        <div className={`h-full ${color} rounded transition-all duration-500 flex items-center justify-end pr-1.5`} style={{ width: `${Math.max((value / max) * 100, value > 0 ? 4 : 0)}%` }}>
          <span className="text-white text-[9px] font-bold leading-none whitespace-nowrap">{value > 0 ? value : ''}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* KPI summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {[
          { label: 'Total de Peças', value: totalParts, color: 'text-slate-800' },
          { label: 'Valor em Estoque', value: fmtCurrency(totalValue), color: 'text-green-600' },
          { label: 'Custo em Estoque', value: fmtCurrency(totalCost), color: 'text-blue-600' },
          { label: 'Estoque Zerado', value: zeroStock, color: 'text-red-600' },
          { label: 'Abaixo do Mínimo', value: belowMin, color: 'text-amber-600' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-xs text-slate-400 mb-1">{label}</p>
            <p className={`text-xl font-extrabold ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Most used parts */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2"><TrendingUp size={14} className="text-amber-500" /> Peças Mais Utilizadas</h3>
          {topParts.length === 0 ? <p className="text-xs text-slate-400 text-center py-4">Nenhuma movimentação de saída registrada.</p> : (
            <div className="space-y-2">
              {topParts.map((p, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-xs text-slate-400 w-4 text-right flex-shrink-0">{i + 1}</span>
                  <span className="text-xs text-slate-600 w-36 truncate flex-shrink-0">{p.name}</span>
                  <Bar value={p.qty} max={barMax(topParts.map(x => x.qty))} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Category stock value */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2"><BarChart3 size={14} className="text-amber-500" /> Valor em Estoque por Categoria</h3>
          {catValues.length === 0 ? <p className="text-xs text-slate-400 text-center py-4">Sem dados.</p> : (
            <div className="space-y-2">
              {catValues.map(([cat, val]) => (
                <div key={cat} className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 w-28 truncate flex-shrink-0">{cat}</span>
                  <Bar value={Math.round(val)} max={barMax(catValues.map(x => x[1]))} color="bg-blue-400" />
                  <span className="text-xs font-semibold text-slate-600 flex-shrink-0 w-20 text-right">{fmtCurrency(val)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top margin products */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2"><TrendingUp size={14} className="text-emerald-500" /> Maior Margem de Lucro (%)</h3>
          {topMargin.length === 0 ? <p className="text-xs text-slate-400 text-center py-4">Cadastre preço de custo e venda.</p> : (
            <div className="space-y-2">
              {topMargin.map((p, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 w-36 truncate flex-shrink-0">{p.name}</span>
                  <Bar value={Math.round(p.margin)} max={100} color="bg-emerald-400" />
                  <span className="text-xs font-semibold text-emerald-600 flex-shrink-0 w-12 text-right">{p.margin.toFixed(0)}%</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Alerts */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
          <h3 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2"><AlertTriangle size={14} className="text-amber-500" /> Alertas de Estoque</h3>
          {[
            { label: 'Estoque zerado', count: zeroStock, color: 'text-red-600', bg: 'bg-red-50 border-red-200' },
            { label: 'Abaixo do mínimo', count: belowMin, color: 'text-amber-600', bg: 'bg-amber-50 border-amber-200' },
            { label: 'Sem movimentação', count: noMovement, color: 'text-blue-600', bg: 'bg-blue-50 border-blue-200' },
            { label: 'Total de serviços cadastrados', count: services.length, color: 'text-slate-700', bg: 'bg-slate-50 border-slate-200' },
          ].map(({ label, count, color, bg }) => (
            <div key={label} className={`flex items-center justify-between px-3 py-2 rounded-lg border ${bg}`}>
              <span className="text-xs text-slate-600">{label}</span>
              <span className={`text-sm font-bold ${color}`}>{count}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
