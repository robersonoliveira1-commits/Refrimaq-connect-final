import { useEffect, useState, useMemo } from 'react';
import {
  Wrench, TrendingUp, Clock, DollarSign, AlertTriangle,
  Package, Users, BarChart3, Filter, Download, Search,
  ChevronLeft, ChevronRight, RefreshCw, CheckCircle2, Loader2,
} from 'lucide-react';
import { supabase } from '../lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ServiceOrder {
  id: string;
  order_number: number;
  warranty_type?: string | null;
  customer_id: string;
  technician_id: string | null;
  visit_type: string;
  status: string;
  labor_cost: number;
  payment_method: string | null;
  paid_at: string | null;
  data_conclusao?: string | null;
  created_at: string;
  updated_at: string;
  customer_name?: string;
  technician_name?: string;
}

interface OSPart {
  id: string;
  service_order_id: string;
  product_id: string | null;
  part_name: string;
  quantity: number;
  unit_price: number;
  created_at: string;
  category?: string;
  order_visit_type?: string;
  technician_name?: string;
}

interface Product {
  id: string;
  name: string;
  category: string;
  stock_quantity: number;
  stock_min: number;
  unit_price: number;
  active?: boolean;
}

interface Service {
  id: string;
  name: string;
  category: string;
}

interface Technician { id: string; full_name: string }
interface Customer { id: string; name: string }

const STATUS_COLORS: Record<string, string> = {
  'Triagem': 'bg-slate-400',
  'Aguardando Orçamento': 'bg-yellow-400',
  'Aguardando Peças': 'bg-orange-400',
  'Em Manutenção': 'bg-blue-400',
  'Concluída': 'bg-emerald-500',
  'Cancelada': 'bg-red-400',
};

const STATUS_TEXT: Record<string, string> = {
  'Triagem': 'text-slate-600',
  'Aguardando Orçamento': 'text-yellow-700',
  'Aguardando Peças': 'text-orange-700',
  'Em Manutenção': 'text-blue-700',
  'Concluída': 'text-emerald-700',
  'Cancelada': 'text-red-700',
};

const STATUS_BG: Record<string, string> = {
  'Triagem': 'bg-slate-50 border-slate-200',
  'Aguardando Orçamento': 'bg-yellow-50 border-yellow-200',
  'Aguardando Peças': 'bg-orange-50 border-orange-200',
  'Em Manutenção': 'bg-blue-50 border-blue-200',
  'Concluída': 'bg-emerald-50 border-emerald-200',
  'Cancelada': 'bg-red-50 border-red-200',
};

const PAGE_SIZE = 10;

// ─── Helper ───────────────────────────────────────────────────────────────────

function fmtCurrency(v: number | null | undefined) {
  return (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('pt-BR');
}

// ─── Mini bar chart ───────────────────────────────────────────────────────────

function BarChart({ data, labelKey, valueKey, color = 'bg-amber-400' }: {
  data: Record<string, string | number>[];
  labelKey: string;
  valueKey: string;
  color?: string;
}) {
  const max = Math.max(...data.map(d => Number(d[valueKey])), 1);
  return (
    <div className="space-y-2">
      {data.map((d, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="text-xs text-slate-500 w-28 truncate flex-shrink-0">{String(d[labelKey])}</span>
          <div className="flex-1 h-5 bg-slate-100 rounded-md overflow-hidden">
            <div
              className={`h-full ${color} rounded-md transition-all duration-500 flex items-center justify-end pr-1.5`}
              style={{ width: `${(Number(d[valueKey]) / max) * 100}%` }}
            >
              <span className="text-white text-[10px] font-bold leading-none">
                {typeof d[valueKey] === 'number' && (d[valueKey] as number) > 99
                  ? fmtCurrency(d[valueKey] as number)
                  : d[valueKey]}
              </span>
            </div>
          </div>
        </div>
      ))}
      {data.length === 0 && <p className="text-xs text-slate-400 text-center py-3">Sem dados</p>}
    </div>
  );
}

// ─── Donut ring chart ─────────────────────────────────────────────────────────

const RING_COLORS = ['#f59e0b', '#3b82f6', '#10b981', '#f97316', '#ef4444', '#94a3b8'];

function DonutChart({ data }: { data: { label: string; value: number }[] }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return <p className="text-xs text-slate-400 text-center py-3">Sem dados</p>;
  let offset = 0;
  const r = 40, cx = 50, cy = 50, circ = 2 * Math.PI * r;
  return (
    <div className="flex items-center gap-4">
      <svg width="100" height="100" viewBox="0 0 100 100" className="flex-shrink-0">
        {data.map((d, i) => {
          const pct = d.value / total;
          const dash = pct * circ;
          const seg = (
            <circle
              key={i}
              cx={cx} cy={cy} r={r}
              fill="none"
              stroke={RING_COLORS[i % RING_COLORS.length]}
              strokeWidth="18"
              strokeDasharray={`${dash} ${circ - dash}`}
              strokeDashoffset={-offset * circ}
              style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%' }}
            />
          );
          offset += pct;
          return seg;
        })}
        <text x="50" y="54" textAnchor="middle" fontSize="14" fontWeight="700" fill="#1e293b">{total}</text>
      </svg>
      <div className="flex-1 space-y-1.5">
        {data.map((d, i) => (
          <div key={i} className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: RING_COLORS[i % RING_COLORS.length] }} />
              <span className="text-xs text-slate-600 truncate">{d.label}</span>
            </div>
            <span className="text-xs font-semibold text-slate-700">{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Monthly line chart ───────────────────────────────────────────────────────

function LineChart({ data }: { data: { month: string; value: number }[] }) {
  const max = Math.max(...data.map(d => d.value), 1);
  const W = 320, H = 80, pad = 20;
  const pts = data.map((d, i) => {
    const x = pad + (i / (data.length - 1 || 1)) * (W - 2 * pad);
    const y = H - pad - (d.value / max) * (H - 2 * pad);
    return { x, y, ...d };
  });
  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const fill = `${path} L ${pts[pts.length - 1]?.x ?? W} ${H} L ${pts[0]?.x ?? 0} ${H} Z`;
  return (
    <div className="overflow-x-auto">
      <svg width={W} height={H + 24} className="min-w-full">
        <defs>
          <linearGradient id="lg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
          </linearGradient>
        </defs>
        {pts.length > 1 && <path d={fill} fill="url(#lg)" />}
        {pts.length > 1 && <path d={path} fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" />}
        {pts.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r="4" fill="#f59e0b" />
            <text x={p.x} y={H + 18} textAnchor="middle" fontSize="9" fill="#94a3b8">{p.month}</text>
            <text x={p.x} y={p.y - 7} textAnchor="middle" fontSize="9" fontWeight="600" fill="#475569">{p.value}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface Props { refresh: number }

export default function WorkshopStats({ refresh }: Props) {
  const [loading, setLoading] = useState(true);

  // Raw data
  const [orders, setOrders] = useState<ServiceOrder[]>([]);
  const [parts, setParts] = useState<OSPart[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);

  // Filters
  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const [dateFrom, setDateFrom] = useState(firstDay);
  const [dateTo, setDateTo] = useState(now.toISOString().slice(0, 10));
  const [filterTech, setFilterTech] = useState('');
  const [filterCustomer, setFilterCustomer] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterVisitType, setFilterVisitType] = useState('');

  // OS table state
  const [osSearch, setOsSearch] = useState('');
  const [osPage, setOsPage] = useState(1);

  // Ranking table state
  const [rankingPage, setRankingPage] = useState(1);

  // Parts table state
  const [partsSearch, setPartsSearch] = useState('');
  const [partsPage, setPartsPage] = useState(1);

  useEffect(() => { loadAll(); }, [refresh]);

  async function loadAll() {
    setLoading(true);
    const [
      { data: ordData },
      { data: partsData },
      { data: prodData },
      { data: techData },
      { data: custData },
      { data: svcData },
    ] = await Promise.all([
      supabase.from('service_orders').select('*, customers(name)').order('created_at', { ascending: false }),
      supabase.from('service_order_parts').select('*').order('created_at', { ascending: false }),
      supabase.from('products').select('id,name,category,stock_quantity,stock_min,unit_price,active').order('name'),
      supabase.from('user_profiles').select('id,full_name').eq('active', true),
      supabase.from('customers').select('id,name').order('name').limit(2000),
      supabase.from('services').select('id,name,category'),
    ]);

    const techs = (techData as unknown as Technician[]) ?? [];
    const techMap = Object.fromEntries(techs.map(t => [t.id, t.full_name]));
    const cust = (custData as unknown as Customer[]) ?? [];
    const custMap = Object.fromEntries(cust.map(c => [c.id, c.name]));

    const rawOrders = (ordData as any[]) ?? [];
    const enrichedOrders = rawOrders.map(o => ({
      ...o,
      customer_name: o.customers?.name || custMap[o.customer_id] || '—',
      technician_name: o.technician_id ? (techMap[o.technician_id] ?? '—') : '—',
    }));

    const rawParts = (partsData as unknown as OSPart[]) ?? [];
    const orderMap = Object.fromEntries(enrichedOrders.map(o => [o.id, o]));
    const productsList = (prodData as unknown as Product[]) ?? [];
    const prodMap = Object.fromEntries(productsList.map(p => [p.id, p]));
    const servicesList = (svcData as unknown as Service[]) ?? [];

    const enrichedParts = rawParts.map(p => {
      let category = '—';
      if (p.product_id && prodMap[p.product_id]) {
        category = prodMap[p.product_id].category || '—';
      } else {
        const nameKey = p.part_name.toLowerCase().trim();
        const matchedProd = productsList.find(prod => prod.name.toLowerCase().trim() === nameKey);
        if (matchedProd && matchedProd.category) {
          category = matchedProd.category;
        } else {
          const matchedSvc = servicesList.find(s => s.name.toLowerCase().trim() === nameKey);
          if (matchedSvc && matchedSvc.category) {
            category = matchedSvc.category;
          }
        }
      }
      return {
        ...p,
        category,
        order_visit_type: orderMap[p.service_order_id]?.visit_type ?? '—',
        technician_name: orderMap[p.service_order_id]?.technician_name ?? '—',
      };
    });

    setOrders(enrichedOrders);
    setParts(enrichedParts);
    setProducts(productsList);
    setTechnicians(techs);
    setCustomers(cust);
    setLoading(false);
  }

  // ─── Derived / filtered data ────────────────────────────────────────────────

  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      const d = o.created_at.slice(0, 10);
      if (dateFrom && d < dateFrom) return false;
      if (dateTo && d > dateTo) return false;
      if (filterTech && o.technician_id !== filterTech) return false;
      if (filterCustomer && o.customer_id !== filterCustomer) return false;
      if (filterStatus && o.status !== filterStatus) return false;
      if (filterVisitType && o.visit_type !== filterVisitType) return false;
      return true;
    });
  }, [orders, dateFrom, dateTo, filterTech, filterCustomer, filterStatus, filterVisitType]);

  const filteredParts = useMemo(() => {
    const orderIds = new Set(filteredOrders.map(o => o.id));
    return parts.filter(p => orderIds.has(p.service_order_id));
  }, [parts, filteredOrders]);

  // ─── Indicators ─────────────────────────────────────────────────────────────

  const indicators = useMemo(() => {
    const total = filteredOrders.length;
    const abertas = filteredOrders.filter(o => ['Triagem', 'Aguardando Orçamento', 'Aguardando Peças'].includes(o.status)).length;
    const andamento = filteredOrders.filter(o => o.status === 'Em Manutenção').length;
    const concluidas = filteredOrders.filter(o => o.status === 'Concluída').length;

    const durations = filteredOrders
      .filter(o => o.paid_at)
      .map(o => new Date(o.paid_at!).getTime() - new Date(o.created_at).getTime());
    const avgMs = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
    const avgDays = avgMs / (1000 * 60 * 60 * 24);

    const partsTotal = filteredParts.reduce((s, p) => s + p.quantity * p.unit_price, 0);
    const laborTotal = filteredOrders.filter(o => o.status === 'Concluída').reduce((s, o) => s + (o.labor_cost ?? 0), 0);
    const revenue = partsTotal + laborTotal;
    const ticket = concluidas > 0 ? revenue / concluidas : 0;

    return { total, abertas, andamento, concluidas, avgDays, revenue, ticket, partsTotal };
  }, [filteredOrders, filteredParts]);

  // ─── Chart data ──────────────────────────────────────────────────────────────

  const statusChartData = useMemo(() => {
    const map: Record<string, number> = {};
    filteredOrders.forEach(o => { map[o.status] = (map[o.status] ?? 0) + 1; });
    return Object.entries(map).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  }, [filteredOrders]);

  const techChartData = useMemo(() => {
    const map: Record<string, number> = {};
    filteredOrders.forEach(o => {
      const name = o.technician_name ?? '—';
      map[name] = (map[name] ?? 0) + 1;
    });
    return Object.entries(map).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 8);
  }, [filteredOrders]);

  const serviceRanking = useMemo(() => {
    const map: Record<string, number> = {};
    filteredOrders.forEach(o => { map[o.visit_type] = (map[o.visit_type] ?? 0) + 1; });
    return Object.entries(map).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  }, [filteredOrders]);

  const monthlyOS = useMemo(() => {
    const map: Record<string, number> = {};
    const n = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(n.getFullYear(), n.getMonth() - i, 1);
      map[d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })] = 0;
    }
    filteredOrders.forEach(o => {
      const key = new Date(o.created_at).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
      if (key in map) map[key]++;
    });
    return Object.entries(map).map(([month, value]) => ({ month, value }));
  }, [filteredOrders]);

  const topParts = useMemo(() => {
    const map: Record<string, number> = {};
    filteredParts.forEach(p => { map[p.part_name] = (map[p.part_name] ?? 0) + p.quantity; });
    return Object.entries(map).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 8);
  }, [filteredParts]);

  const partsByCategory = useMemo(() => {
    const map: Record<string, number> = {};
    filteredParts.forEach(p => { map[p.category ?? '—'] = (map[p.category ?? '—'] ?? 0) + p.quantity; });
    return Object.entries(map).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  }, [filteredParts]);

  const partsByTech = useMemo(() => {
    const map: Record<string, number> = {};
    filteredParts.forEach(p => { map[p.technician_name ?? '—'] = (map[p.technician_name ?? '—'] ?? 0) + p.quantity; });
    return Object.entries(map).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 8);
  }, [filteredParts]);

  // ─── Stock alerts ────────────────────────────────────────────────────────────

  const zeroStock = useMemo(() => products.filter(p => p.active && p.stock_quantity <= 0), [products]);
  const lowStock = useMemo(() => products.filter(p => p.active && p.stock_quantity > 0 && p.stock_quantity <= p.stock_min), [products]);

  // ─── OS Open Days Ranking ───────────────────────────────────────────────────

  const osRankingOpenDays = useMemo(() => {
    return filteredOrders
      .filter(o => o.status !== 'Concluída' && o.status !== 'Cancelada')
      .map(o => {
        const start = new Date(o.created_at);
        const end = new Date();
        const diffTime = end.getTime() - start.getTime();
        const diffDays = Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)));
        
        return {
          ...o,
          openDays: diffDays,
          isClosed: false
        };
      })
      .sort((a, b) => b.openDays - a.openDays);
  }, [filteredOrders]);

  const rankingPageCount = Math.max(1, Math.ceil(osRankingOpenDays.length / PAGE_SIZE));
  const rankingPaged = osRankingOpenDays.slice((rankingPage - 1) * PAGE_SIZE, rankingPage * PAGE_SIZE);

  // ─── OS table ────────────────────────────────────────────────────────────────

  const osFiltered = useMemo(() => {
    const q = osSearch.toLowerCase();
    return filteredOrders.filter(o =>
      !q ||
      String(o.order_number).includes(q) ||
      (o.customer_name ?? '').toLowerCase().includes(q) ||
      (o.technician_name ?? '').toLowerCase().includes(q) ||
      o.status.toLowerCase().includes(q)
    );
  }, [filteredOrders, osSearch]);

  const osPageCount = Math.max(1, Math.ceil(osFiltered.length / PAGE_SIZE));
  const osPaged = osFiltered.slice((osPage - 1) * PAGE_SIZE, osPage * PAGE_SIZE);

  // ─── Parts table ─────────────────────────────────────────────────────────────

  const partsFiltered = useMemo(() => {
    const q = partsSearch.toLowerCase();
    return filteredParts.filter(p =>
      !q ||
      p.part_name.toLowerCase().includes(q) ||
      (p.category ?? '').toLowerCase().includes(q) ||
      (p.technician_name ?? '').toLowerCase().includes(q)
    );
  }, [filteredParts, partsSearch]);

  const partsPageCount = Math.max(1, Math.ceil(partsFiltered.length / PAGE_SIZE));
  const partsPaged = partsFiltered.slice((partsPage - 1) * PAGE_SIZE, partsPage * PAGE_SIZE);

  // ─── Export CSV ──────────────────────────────────────────────────────────────

  function exportOSCsv() {
    const header = 'OS,Cliente,Técnico,Tipo,Status,Abertura,Conclusão,Peças (R$),M.O. (R$),Total (R$)';
    const partsTotalByOS: Record<string, number> = {};
    filteredParts.forEach(p => { partsTotalByOS[p.service_order_id] = (partsTotalByOS[p.service_order_id] ?? 0) + p.quantity * p.unit_price; });
    const rows = filteredOrders.map(o => {
      const pt = partsTotalByOS[o.id] ?? 0;
      const total = pt + (o.labor_cost ?? 0);
      return [
        `#${String(o.order_number).padStart(4, '0')}`,
        o.customer_name ?? '',
        o.technician_name ?? '',
        o.visit_type,
        o.status,
        fmtDate(o.created_at),
        fmtDate(o.paid_at),
        pt.toFixed(2),
        (o.labor_cost ?? 0).toFixed(2),
        total.toFixed(2),
      ].join(',');
    });
    const csv = [header, ...rows].join('\n');
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    a.download = `os_${dateFrom}_${dateTo}.csv`;
    a.click();
  }

  function exportPartsCsv() {
    const header = 'Peça,Categoria,Qtd,Preço Unit.,Subtotal,Técnico,Tipo OS';
    const rows = filteredParts.map(p => [
      p.part_name,
      p.category ?? '',
      p.quantity,
      p.unit_price.toFixed(2),
      (p.quantity * p.unit_price).toFixed(2),
      p.technician_name ?? '',
      p.order_visit_type ?? '',
    ].join(','));
    const csv = [header, ...rows].join('\n');
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    a.download = `pecas_${dateFrom}_${dateTo}.csv`;
    a.click();
  }

  // ─── Render ───────────────────────────────────────────────────────────────────

  const VISIT_TYPES = ['Corretiva', 'Instalação', 'Assepsia', 'Preventiva'];
  const STATUSES = ['Triagem', 'Aguardando Orçamento', 'Aguardando Peças', 'Em Manutenção', 'Concluída', 'Cancelada'];

  return (
    <div className="space-y-6">

      {/* ── Stock Alerts ─────────────────────────────────────────────────── */}
      {(zeroStock.length > 0 || lowStock.length > 0) && (
        <div className="bg-white rounded-xl border border-red-200 overflow-hidden">
          <div className="px-5 py-3 bg-red-50 border-b border-red-200 flex items-center gap-2">
            <AlertTriangle size={16} className="text-red-500" />
            <h3 className="font-bold text-red-700 text-sm">Peças com Estoque Crítico</h3>
            <span className="ml-auto text-xs text-red-500 font-medium">
              {zeroStock.length} sem estoque · {lowStock.length} abaixo do mínimo
            </span>
          </div>
          <div className="divide-y divide-slate-100 max-h-60 overflow-y-auto">
            {zeroStock.map(p => (
              <div key={p.id} className="flex items-center justify-between px-5 py-2.5 bg-red-50/60 hover:bg-red-50 transition-colors">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />
                  <span className="text-sm font-medium text-slate-800 truncate">{p.name}</span>
                  <span className="text-xs text-slate-400 flex-shrink-0">{p.category}</span>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0 ml-3">
                  <span className="text-xs font-bold text-red-600 bg-red-100 px-2 py-0.5 rounded-full">Estoque: 0</span>
                  <span className="text-xs text-slate-400">Mín: {p.stock_min}</span>
                </div>
              </div>
            ))}
            {lowStock.map(p => (
              <div key={p.id} className="flex items-center justify-between px-5 py-2.5 hover:bg-orange-50 transition-colors">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-2 h-2 rounded-full bg-orange-400 flex-shrink-0" />
                  <span className="text-sm font-medium text-slate-800 truncate">{p.name}</span>
                  <span className="text-xs text-slate-400 flex-shrink-0">{p.category}</span>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0 ml-3">
                  <span className="text-xs font-bold text-orange-600 bg-orange-100 px-2 py-0.5 rounded-full">Estoque: {p.stock_quantity}</span>
                  <span className="text-xs text-slate-400">Mín: {p.stock_min}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Global Filters ──────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter size={14} className="text-amber-500" />
          <h3 className="text-sm font-semibold text-slate-700">Filtros Globais</h3>
          <button
            onClick={loadAll}
            disabled={loading}
            className="ml-auto flex items-center gap-1.5 text-xs text-slate-500 hover:text-amber-600 transition-colors"
          >
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
            <label className="text-xs text-slate-400 block mb-1">Status</label>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-amber-500/30">
              <option value="">Todos</option>
              {STATUSES.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-400 block mb-1">Tipo de Serviço</label>
            <select value={filterVisitType} onChange={e => setFilterVisitType(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-amber-500/30">
              <option value="">Todos</option>
              {VISIT_TYPES.map(v => <option key={v}>{v}</option>)}
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
          {/* ── Indicator Cards ──────────────────────────────────────────── */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
            {[
              { label: 'Total OS', value: indicators.total, icon: Wrench, color: 'text-slate-700', bg: 'bg-slate-50' },
              { label: 'Abertas', value: indicators.abertas, icon: Clock, color: 'text-yellow-600', bg: 'bg-yellow-50' },
              { label: 'Em andamento', value: indicators.andamento, icon: RefreshCw, color: 'text-blue-600', bg: 'bg-blue-50' },
              { label: 'Concluídas', value: indicators.concluidas, icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50' },
              { label: 'Tempo médio', value: indicators.avgDays > 0 ? `${indicators.avgDays.toFixed(1)}d` : '—', icon: Clock, color: 'text-purple-600', bg: 'bg-purple-50' },
              { label: 'Faturamento', value: fmtCurrency(indicators.revenue), icon: DollarSign, color: 'text-green-600', bg: 'bg-green-50' },
              { label: 'Ticket médio', value: fmtCurrency(indicators.ticket), icon: TrendingUp, color: 'text-amber-600', bg: 'bg-amber-50' },
            ].map(card => (
              <div key={card.label} className={`${card.bg} rounded-xl border border-slate-200 p-3.5`}>
                <div className="flex items-center gap-2 mb-1.5">
                  <card.icon size={14} className={card.color} />
                  <span className="text-xs text-slate-500">{card.label}</span>
                </div>
                <p className={`text-lg font-extrabold ${card.color} leading-none`}>{card.value}</p>
              </div>
            ))}
          </div>

          {/* ── Charts row 1 ─────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Status donut */}
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2 text-sm">
                <BarChart3 size={14} className="text-amber-500" />
                OS por Status
              </h3>
              <DonutChart data={statusChartData} />
            </div>

            {/* OS by tech */}
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2 text-sm">
                <Users size={14} className="text-amber-500" />
                OS por Técnico
              </h3>
              <BarChart data={techChartData} labelKey="label" valueKey="value" color="bg-blue-400" />
            </div>

            {/* Service ranking */}
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2 text-sm">
                <TrendingUp size={14} className="text-amber-500" />
                Serviços Mais Executados
              </h3>
              <BarChart data={serviceRanking} labelKey="label" valueKey="value" color="bg-amber-400" />
            </div>
          </div>

          {/* ── Monthly trend ──────────────────────────────────────────────── */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2 text-sm">
              <TrendingUp size={14} className="text-amber-500" />
              Evolução de OS (últimos 6 meses)
            </h3>
            <LineChart data={monthlyOS} />
          </div>

          {/* ── OS Open Days Ranking ────────────────────────────────────────── */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3">
              <Clock size={14} className="text-amber-500" />
              <h3 className="font-bold text-slate-800 text-sm">Ranking de OS por Dias em Aberto</h3>
              <span className="text-xs text-slate-400">Tempo de abertura das ordens ativas (ordenado do maior para o menor)</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="px-4 py-2.5 text-left font-semibold text-slate-500">OS</th>
                    <th className="px-4 py-2.5 text-left font-semibold text-slate-500">Cliente</th>
                    <th className="px-4 py-2.5 text-left font-semibold text-slate-500">Técnico</th>
                    <th className="px-4 py-2.5 text-left font-semibold text-slate-500">Status</th>
                    <th className="px-4 py-2.5 text-center font-semibold text-slate-500">Abertura</th>
                    <th className="px-4 py-2.5 text-right font-semibold text-slate-500">Dias em Aberto</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {rankingPaged.length === 0 && (
                    <tr><td colSpan={6} className="text-center py-8 text-slate-400">Nenhuma OS em aberto encontrada</td></tr>
                  )}
                  {rankingPaged.map(o => (
                    <tr key={o.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-4 py-2.5 font-semibold text-slate-700">#{String(o.order_number).padStart(4, '0')}</td>
                      <td className="px-4 py-2.5 text-slate-600 max-w-[120px] truncate">{o.customer_name}</td>
                      <td className="px-4 py-2.5 text-slate-500">{o.technician_name}</td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${STATUS_BG[o.status] ?? 'bg-slate-50 border-slate-200'} ${STATUS_TEXT[o.status] ?? 'text-slate-600'}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${STATUS_COLORS[o.status] ?? 'bg-slate-400'}`} />
                          {o.status}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-center text-slate-500">{fmtDate(o.created_at)}</td>
                      <td className="px-4 py-2.5 text-right font-bold text-slate-700">
                        <span className="px-2 py-1 rounded-lg bg-red-50 text-red-600 font-semibold">
                          {o.openDays === 0 ? 'Menos de 1 dia' : `${o.openDays} ${o.openDays === 1 ? 'dia' : 'dias'}`}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Pagination */}
            <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between">
              <span className="text-xs text-slate-400">Página {rankingPage} de {rankingPageCount}</span>
              <div className="flex gap-1">
                <button disabled={rankingPage <= 1} onClick={() => setRankingPage(p => p - 1)}
                  className="p-1 rounded hover:bg-slate-100 disabled:opacity-30 transition-colors">
                  <ChevronLeft size={14} />
                </button>
                <button disabled={rankingPage >= rankingPageCount} onClick={() => setRankingPage(p => p + 1)}
                  className="p-1 rounded hover:bg-slate-100 disabled:opacity-30 transition-colors">
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          </div>

          {/* ── OS Table ──────────────────────────────────────────────────── */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3 flex-wrap">
              <Wrench size={14} className="text-amber-500" />
              <h3 className="font-bold text-slate-800 text-sm">Ordens de Serviço</h3>
              <span className="text-xs text-slate-400">{osFiltered.length} registros</span>
              <div className="relative ml-auto">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Buscar..."
                  value={osSearch}
                  onChange={e => { setOsSearch(e.target.value); setOsPage(1); }}
                  className="pl-7 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-amber-500/30 w-40"
                />
              </div>
              <button onClick={exportOSCsv} className="flex items-center gap-1.5 text-xs border border-slate-200 text-slate-600 hover:bg-slate-50 px-3 py-1.5 rounded-lg transition-colors">
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
                    <th className="px-4 py-2.5 text-left font-semibold text-slate-500 hidden md:table-cell">Tipo</th>
                    <th className="px-4 py-2.5 text-left font-semibold text-slate-500">Status</th>
                    <th className="px-4 py-2.5 text-left font-semibold text-slate-500 hidden lg:table-cell">Abertura</th>
                    <th className="px-4 py-2.5 text-right font-semibold text-slate-500">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {osPaged.length === 0 && (
                    <tr><td colSpan={7} className="text-center py-8 text-slate-400">Nenhuma OS encontrada</td></tr>
                  )}
                  {osPaged.map(o => {
                    const pt = filteredParts.filter(p => p.service_order_id === o.id).reduce((s, p) => s + p.quantity * p.unit_price, 0);
                    const total = pt + (o.labor_cost ?? 0);
                    return (
                      <tr key={o.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="px-4 py-2.5 font-semibold text-slate-700">#{String(o.order_number).padStart(4, '0')}</td>
                        <td className="px-4 py-2.5 text-slate-600 max-w-[120px] truncate">{o.customer_name}</td>
                        <td className="px-4 py-2.5 text-slate-500 hidden sm:table-cell">{o.technician_name}</td>
                        <td className="px-4 py-2.5 text-slate-500 hidden md:table-cell">{o.visit_type}</td>
                        <td className="px-4 py-2.5">
                          <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${STATUS_BG[o.status] ?? 'bg-slate-50 border-slate-200'} ${STATUS_TEXT[o.status] ?? 'text-slate-600'}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${STATUS_COLORS[o.status] ?? 'bg-slate-400'}`} />
                            {o.status}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-slate-400 hidden lg:table-cell">{fmtDate(o.created_at)}</td>
                        <td className="px-4 py-2.5 text-right font-semibold text-slate-700">{fmtCurrency(total)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {/* Pagination */}
            <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between">
              <span className="text-xs text-slate-400">Página {osPage} de {osPageCount}</span>
              <div className="flex gap-1">
                <button disabled={osPage <= 1} onClick={() => setOsPage(p => p - 1)}
                  className="p-1 rounded hover:bg-slate-100 disabled:opacity-30 transition-colors">
                  <ChevronLeft size={14} />
                </button>
                <button disabled={osPage >= osPageCount} onClick={() => setOsPage(p => p + 1)}
                  className="p-1 rounded hover:bg-slate-100 disabled:opacity-30 transition-colors">
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          </div>

          {/* ── Parts charts ──────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h3 className="font-bold text-slate-800 mb-1 flex items-center gap-2 text-sm">
                <Package size={14} className="text-amber-500" />
                Peças Mais Utilizadas
              </h3>
              <p className="text-xs text-slate-400 mb-3">
                {filteredParts.reduce((s, p) => s + p.quantity, 0)} unidades · {fmtCurrency(filteredParts.reduce((s, p) => s + p.quantity * p.unit_price, 0))} em custo
              </p>
              <BarChart data={topParts} labelKey="label" valueKey="value" color="bg-emerald-400" />
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2 text-sm">
                <BarChart3 size={14} className="text-amber-500" />
                Peças por Categoria
              </h3>
              <DonutChart data={partsByCategory} />
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2 text-sm">
                <Users size={14} className="text-amber-500" />
                Peças por Técnico
              </h3>
              <BarChart data={partsByTech} labelKey="label" valueKey="value" color="bg-purple-400" />
            </div>
          </div>

          {/* ── Parts Table ───────────────────────────────────────────────── */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3 flex-wrap">
              <Package size={14} className="text-amber-500" />
              <h3 className="font-bold text-slate-800 text-sm">Peças Utilizadas</h3>
              <span className="text-xs text-slate-400">{partsFiltered.length} registros</span>
              <div className="relative ml-auto">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Buscar..."
                  value={partsSearch}
                  onChange={e => { setPartsSearch(e.target.value); setPartsPage(1); }}
                  className="pl-7 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-amber-500/30 w-40"
                />
              </div>
              <button onClick={exportPartsCsv} className="flex items-center gap-1.5 text-xs border border-slate-200 text-slate-600 hover:bg-slate-50 px-3 py-1.5 rounded-lg transition-colors">
                <Download size={12} />
                CSV
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="px-4 py-2.5 text-left font-semibold text-slate-500">Peça</th>
                    <th className="px-4 py-2.5 text-left font-semibold text-slate-500 hidden sm:table-cell">Categoria</th>
                    <th className="px-4 py-2.5 text-center font-semibold text-slate-500">Qtd</th>
                    <th className="px-4 py-2.5 text-right font-semibold text-slate-500">Unit.</th>
                    <th className="px-4 py-2.5 text-right font-semibold text-slate-500">Subtotal</th>
                    <th className="px-4 py-2.5 text-left font-semibold text-slate-500 hidden md:table-cell">Técnico</th>
                    <th className="px-4 py-2.5 text-left font-semibold text-slate-500 hidden lg:table-cell">Tipo OS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {partsPaged.length === 0 && (
                    <tr><td colSpan={7} className="text-center py-8 text-slate-400">Nenhuma peça encontrada</td></tr>
                  )}
                  {partsPaged.map(p => (
                    <tr key={p.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-4 py-2.5 font-medium text-slate-700">{p.part_name}</td>
                      <td className="px-4 py-2.5 text-slate-500 hidden sm:table-cell">{p.category}</td>
                      <td className="px-4 py-2.5 text-center font-semibold text-slate-700">{p.quantity}</td>
                      <td className="px-4 py-2.5 text-right text-slate-500">{fmtCurrency(p.unit_price)}</td>
                      <td className="px-4 py-2.5 text-right font-semibold text-slate-700">{fmtCurrency(p.quantity * p.unit_price)}</td>
                      <td className="px-4 py-2.5 text-slate-500 hidden md:table-cell">{p.technician_name}</td>
                      <td className="px-4 py-2.5 text-slate-400 hidden lg:table-cell">{p.order_visit_type}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50 border-t border-slate-200">
                    <td colSpan={4} className="px-4 py-2.5 text-right text-xs font-semibold text-slate-500">Total no período</td>
                    <td className="px-4 py-2.5 text-right text-xs font-bold text-slate-700">
                      {fmtCurrency(filteredParts.reduce((s, p) => s + p.quantity * p.unit_price, 0))}
                    </td>
                    <td colSpan={2} className="hidden md:table-cell" />
                  </tr>
                </tfoot>
              </table>
            </div>
            <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between">
              <span className="text-xs text-slate-400">Página {partsPage} de {partsPageCount}</span>
              <div className="flex gap-1">
                <button disabled={partsPage <= 1} onClick={() => setPartsPage(p => p - 1)}
                  className="p-1 rounded hover:bg-slate-100 disabled:opacity-30 transition-colors">
                  <ChevronLeft size={14} />
                </button>
                <button disabled={partsPage >= partsPageCount} onClick={() => setPartsPage(p => p + 1)}
                  className="p-1 rounded hover:bg-slate-100 disabled:opacity-30 transition-colors">
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          </div>

          {/* ── Cost summary cards ───────────────────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { label: 'Custo total de peças', value: fmtCurrency(indicators.partsTotal), sub: 'no período filtrado', icon: Package, color: 'text-blue-600', bg: 'bg-blue-50' },
              { label: 'Custo médio por OS', value: fmtCurrency(indicators.concluidas > 0 ? indicators.partsTotal / indicators.concluidas : 0), sub: 'apenas OS concluídas', icon: DollarSign, color: 'text-purple-600', bg: 'bg-purple-50' },
              { label: 'Peças utilizadas', value: filteredParts.reduce((s, p) => s + p.quantity, 0), sub: 'unidades no período', icon: Package, color: 'text-emerald-600', bg: 'bg-emerald-50' },
            ].map(card => (
              <div key={card.label} className={`${card.bg} rounded-xl border border-slate-200 p-5`}>
                <div className="flex items-center gap-2 mb-3">
                  <card.icon size={16} className={card.color} />
                  <span className="text-sm font-semibold text-slate-700">{card.label}</span>
                </div>
                <p className={`text-2xl font-extrabold ${card.color}`}>{card.value}</p>
                <p className="text-xs text-slate-400 mt-1">{card.sub}</p>
              </div>
            ))}
          </div>

          {/* ── Zero stock alert if none ──────────────────────────────────── */}
          {zeroStock.length === 0 && lowStock.length === 0 && (
            <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-emerald-700">
              <CheckCircle2 size={16} />
              <p className="text-sm font-medium">Nenhuma peça com estoque crítico. Tudo em dia!</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
