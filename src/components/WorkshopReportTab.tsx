import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Search, Loader2, FileSpreadsheet, Calendar, AlertCircle } from 'lucide-react';

interface OSPart {
  product_id: string | null;
  quantity: number;
  unit_price: number;
}

interface ServiceOrder {
  id: string;
  order_number: number;
  status: string;
  visit_type: string;
  equip_type: string | null;
  equip_model: string | null;
  equip_serial: string | null;
  diagnosis: string | null;
  created_at: string;
  customers: { name: string } | null;
  service_order_parts: OSPart[];
}

const ALL_STATUSES = ['Triagem', 'Aguardando Orçamento', 'Aguardando Peças', 'Em Manutenção', 'Concluída', 'Cancelada'];

const STATUS_COLOR: Record<string, string> = {
  'Triagem': 'bg-slate-100 text-slate-700 border-slate-200',
  'Aguardando Orçamento': 'bg-blue-50 text-blue-700 border-blue-200',
  'Aguardando Peças': 'bg-amber-50 text-amber-700 border-amber-200',
  'Em Manutenção': 'bg-orange-50 text-orange-700 border-orange-200',
  'Concluída': 'bg-green-50 text-green-700 border-green-200',
  'Cancelada': 'bg-red-50 text-red-700 border-red-200',
};

export default function WorkshopReportTab() {
  const [orders, setOrders] = useState<ServiceOrder[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  useEffect(() => {
    loadReportData();
  }, []);

  async function loadReportData() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('service_orders')
        .select(`
          id,
          order_number,
          status,
          visit_type,
          equip_type,
          equip_model,
          equip_serial,
          diagnosis,
          created_at,
          customers (name),
          service_order_parts (
            product_id,
            quantity,
            unit_price
          )
        `)
        .order('order_number', { ascending: false });

      if (error) throw error;
      setOrders((data as unknown as ServiceOrder[]) ?? []);
    } catch (err) {
      console.error('Error fetching report data:', err);
    } finally {
      setLoading(false);
    }
  }

  // Calculate totals for a specific order
  const getOrderTotals = (order: ServiceOrder) => {
    let partsTotal = 0;
    let servicesTotal = 0;

    if (order.service_order_parts) {
      order.service_order_parts.forEach(part => {
        const subtotal = (part.quantity || 0) * (part.unit_price || 0);
        if (part.product_id) {
          partsTotal += subtotal;
        } else {
          servicesTotal += subtotal;
        }
      });
    }

    return {
      partsTotal,
      servicesTotal,
      grandTotal: partsTotal + servicesTotal,
    };
  };

  // Filtered orders
  const filtered = orders.filter(o => {
    // Status Filter
    const matchStatus = statusFilter === 'all' || o.status === statusFilter;

    // Date Filter
    let matchDate = true;
    if (startDate || endDate) {
      const orderDate = new Date(o.created_at);
      // Strip time for clean date comparisons
      orderDate.setHours(0, 0, 0, 0);

      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        if (orderDate < start) matchDate = false;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        if (orderDate > end) matchDate = false;
      }
    }

    // Text Search
    const q = search.toLowerCase();
    const matchSearch = !q
      || String(o.order_number).includes(q)
      || (o.customers?.name ?? '').toLowerCase().includes(q)
      || (o.equip_model ?? '').toLowerCase().includes(q)
      || (o.equip_serial ?? '').toLowerCase().includes(q)
      || (o.visit_type ?? '').toLowerCase().includes(q)
      || (o.equip_type ?? '').toLowerCase().includes(q)
      || (o.diagnosis ?? '').toLowerCase().includes(q);

    return matchStatus && matchDate && matchSearch;
  });

  // Calculate accumulated totals of filtered rows
  const summary = filtered.reduce(
    (acc, o) => {
      const { partsTotal, servicesTotal, grandTotal } = getOrderTotals(o);
      acc.parts += partsTotal;
      acc.services += servicesTotal;
      acc.grand += grandTotal;
      return acc;
    },
    { parts: 0, services: 0, grand: 0 }
  );

  const formatCurrency = (val: number) => {
    return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  const handleExportCSV = () => {
    if (filtered.length === 0) return;

    // Excel compatibility setup: semicolons as separators and UTF-8 BOM
    const headers = [
      'OS',
      'Cliente',
      'Tipo Visita',
      'Tipo Equipamento',
      'Modelo',
      'Nº Série',
      'Status',
      'Diagnóstico',
      'Total Peças',
      'Total Serviços',
      'Valor Total OS',
      'Data de Criação'
    ];

    const rows = filtered.map(o => {
      const { partsTotal, servicesTotal, grandTotal } = getOrderTotals(o);
      const cleanDiagnosis = (o.diagnosis || '').replace(/[\r\n\t]+/g, ' ').replace(/"/g, '""');
      
      return [
        `#${String(o.order_number).padStart(4, '0')}`,
        o.customers?.name || '',
        o.visit_type || '',
        o.equip_type || '',
        o.equip_model || '',
        o.equip_serial || '',
        o.status || '',
        `"${cleanDiagnosis}"`,
        partsTotal.toFixed(2).replace('.', ','),
        servicesTotal.toFixed(2).replace('.', ','),
        grandTotal.toFixed(2).replace('.', ','),
        new Date(o.created_at).toLocaleDateString('pt-BR')
      ];
    });

    const csvContent = [
      headers.join(';'),
      ...rows.map(r => r.join(';'))
    ].join('\r\n');

    // Add BOM for UTF-8 Excel support
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `relatorio_os_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* Dashboard Summary & Charts */}
      <div className="bg-white border-b border-slate-200 px-4 sm:px-6 py-5 grid grid-cols-1 lg:grid-cols-3 gap-6 shadow-sm">
        {/* Total OS KPI Card */}
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 flex flex-col justify-center relative overflow-hidden">
          <div className="absolute right-4 top-4 text-slate-200 font-bold text-7xl select-none pointer-events-none">OS</div>
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Total de Ordens de Serviço</span>
          <span className="text-4xl font-extrabold text-slate-800 mt-2 z-10">{filtered.length}</span>
          <span className="text-xs text-slate-500 mt-1 z-10">
            {statusFilter !== 'all' ? `Filtradas por status: ${statusFilter}` : 'Todas as OS ativas na lista'}
          </span>
        </div>

        {/* Status Breakdown Bar Chart */}
        <div className="lg:col-span-2 space-y-3">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block">Distribuição por Status</span>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
            {ALL_STATUSES.map(status => {
              const count = filtered.filter(o => o.status === status).length;
              const percentage = filtered.length > 0 ? (count / filtered.length) * 100 : 0;
              
              // Color config mapping
              const barColor = {
                'Triagem': 'bg-slate-400',
                'Aguardando Orçamento': 'bg-blue-500',
                'Aguardando Peças': 'bg-amber-500',
                'Em Manutenção': 'bg-orange-500',
                'Concluída': 'bg-emerald-500',
                'Cancelada': 'bg-red-500',
              }[status] || 'bg-slate-500';

              return (
                <div key={status} className="space-y-1">
                  <div className="flex justify-between text-xs font-medium text-slate-600">
                    <span className="truncate pr-2">{status}</span>
                    <span className="font-mono font-semibold text-slate-700">{count} ({percentage.toFixed(0)}%)</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${barColor} transition-all duration-500 rounded-full`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Filter panel */}
      <div className="bg-white border-b border-slate-200 p-4 sm:p-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {/* Text Search */}
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar OS, cliente, modelo, série..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-400"
            />
          </div>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-400"
          >
            <option value="all">Todos os Status</option>
            {ALL_STATUSES.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          {/* Date range filters */}
          <div className="flex gap-2 items-center md:col-span-2">
            <div className="relative flex-1">
              <Calendar size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="w-full pl-8 pr-2 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-400"
                placeholder="Início"
              />
            </div>
            <span className="text-slate-400 text-xs">até</span>
            <div className="relative flex-1">
              <Calendar size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="w-full pl-8 pr-2 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-400"
                placeholder="Fim"
              />
            </div>
          </div>
        </div>

        {/* Action / Quick Info Row */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2 border-t border-slate-100">
          <div className="text-sm text-slate-500">
            Mostrando <span className="font-semibold text-slate-700">{filtered.length}</span> de{' '}
            <span className="font-semibold text-slate-700">{orders.length}</span> ordens de serviço
          </div>
          <button
            onClick={handleExportCSV}
            disabled={filtered.length === 0}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm w-full sm:w-auto justify-center"
          >
            <FileSpreadsheet size={16} />
            Exportar Planilha
          </button>
        </div>
      </div>

      {/* Main Report Table Container */}
      <div className="flex-1 overflow-auto p-4 sm:p-6">
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 size={36} className="text-amber-500 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 bg-white border border-slate-200 rounded-2xl text-slate-400 shadow-sm">
            <AlertCircle size={44} className="mb-3 text-slate-300" />
            <p className="font-medium text-slate-600">Nenhuma ordem de serviço corresponde aos filtros.</p>
            <p className="text-sm text-slate-400 mt-1">Tente ajustar a busca ou os limites de datas.</p>
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  <th className="px-4 py-3.5">OS</th>
                  <th className="px-4 py-3.5">Cliente</th>
                  <th className="px-4 py-3.5">Tipo</th>
                  <th className="px-4 py-3.5">Modelo</th>
                  <th className="px-4 py-3.5">Nº Série</th>
                  <th className="px-4 py-3.5 text-center">Status</th>
                  <th className="px-4 py-3.5 max-w-[200px]">Diagnóstico</th>
                  <th className="px-4 py-3.5 text-right">Peças</th>
                  <th className="px-4 py-3.5 text-right">Serviços</th>
                  <th className="px-4 py-3.5 text-right">Total OS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
                {filtered.map(o => {
                  const { partsTotal, servicesTotal, grandTotal } = getOrderTotals(o);
                  return (
                    <tr key={o.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-4 font-mono font-bold text-slate-900">
                        #{String(o.order_number).padStart(4, '0')}
                      </td>
                      <td className="px-4 py-4 font-medium text-slate-800">
                        {o.customers?.name || '—'}
                      </td>
                      <td className="px-4 py-4 text-xs">
                        <div className="font-medium text-slate-600">{o.visit_type}</div>
                        <div className="text-slate-400 text-[10px] mt-0.5">{o.equip_type || '—'}</div>
                      </td>
                      <td className="px-4 py-4 text-xs font-semibold text-slate-600">
                        {o.equip_model || '—'}
                      </td>
                      <td className="px-4 py-4 font-mono text-xs text-slate-500">
                        {o.equip_serial || '—'}
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold border ${STATUS_COLOR[o.status] || 'bg-slate-50 text-slate-600'}`}>
                          {o.status}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-xs text-slate-400 max-w-[200px] truncate" title={o.diagnosis || ''}>
                        {o.diagnosis || '—'}
                      </td>
                      <td className="px-4 py-4 text-right font-medium font-mono text-slate-600">
                        {formatCurrency(partsTotal)}
                      </td>
                      <td className="px-4 py-4 text-right font-medium font-mono text-slate-600">
                        {formatCurrency(servicesTotal)}
                      </td>
                      <td className="px-4 py-4 text-right font-bold font-mono text-slate-900">
                        {formatCurrency(grandTotal)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50/80 border-t-2 border-slate-200 font-bold text-slate-900">
                  <td colSpan={7} className="px-4 py-4 text-right text-xs uppercase tracking-wider text-slate-500">
                    Totais Gerais Filtrados:
                  </td>
                  <td className="px-4 py-4 text-right font-mono text-slate-800">
                    {formatCurrency(summary.parts)}
                  </td>
                  <td className="px-4 py-4 text-right font-mono text-slate-800">
                    {formatCurrency(summary.services)}
                  </td>
                  <td className="px-4 py-4 text-right font-mono text-amber-600 text-base">
                    {formatCurrency(summary.grand)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
