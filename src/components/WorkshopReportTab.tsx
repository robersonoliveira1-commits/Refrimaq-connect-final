import { useState, useEffect, useMemo, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '../lib/supabase';
import { getLocalTodayFileStamp } from '../lib/customersEngine';
import {
  ProductStockMeta,
  WorkshopReportOrder,
  buildWorkshopReportWorkbook,
  calculateWorkshopOrderFinancials,
  computeWorkshopReportSummary,
  matchesLocalDateRange,
  matchesWorkshopOrderSearch,
  parseMultiOsQuery,
} from '../lib/workshopReportExport';
import { Search, Loader2, FileSpreadsheet, Calendar, AlertCircle, AlertTriangle, CheckSquare, Square, X } from 'lucide-react';

const ALL_STATUSES = [
  'Triagem',
  'Em Diagnóstico',
  'Aguardando Orçamento',
  'Aguardando Aprovação',
  'Aguardando Peças',
  'Em Manutenção',
  'Aguardando Conferência',
  'Concluída',
  'Cancelada',
];

const STATUS_COLOR: Record<string, string> = {
  'Triagem': 'bg-slate-100 text-slate-700 border-slate-200',
  'Em Diagnóstico': 'bg-sky-50 text-sky-700 border-sky-200',
  'Aguardando Orçamento': 'bg-blue-50 text-blue-700 border-blue-200',
  'Aguardando Aprovação': 'bg-amber-50 text-amber-700 border-amber-200',
  'Aguardando Peças': 'bg-amber-50 text-amber-700 border-amber-200',
  'Em Manutenção': 'bg-orange-50 text-orange-700 border-orange-200',
  'Aguardando Conferência': 'bg-indigo-50 text-indigo-700 border-indigo-200',
  'Concluída': 'bg-green-50 text-green-700 border-green-200',
  'Cancelada': 'bg-red-50 text-red-700 border-red-200',
};

async function loadAllProductsMeta(): Promise<Record<string, ProductStockMeta>> {
  const map: Record<string, ProductStockMeta> = {};
  const PAGE_SIZE = 1000;
  let from = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from('products')
      .select('id, name, category, unit, stock_quantity')
      .range(from, from + PAGE_SIZE - 1);

    if (error || !data || data.length === 0) {
      hasMore = false;
    } else {
      for (const p of data as ProductStockMeta[]) {
        map[p.id] = p;
      }
      from += PAGE_SIZE;
      if (data.length < PAGE_SIZE) hasMore = false;
    }
  }
  return map;
}

export default function WorkshopReportTab() {
  const [orders, setOrders] = useState<WorkshopReportOrder[]>([]);
  const [productsById, setProductsById] = useState<Record<string, ProductStockMeta>>({});
  const [loading, setLoading] = useState(true);

  // Filters & manual selection
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const loadReportData = useCallback(async () => {
    setLoading(true);
    try {
      const [ordersRes, productsMap] = await Promise.all([
        supabase
          .from('service_orders')
          .select(`
            id,
            order_number,
            status,
            visit_type,
            labor_cost,
            equip_type,
            equip_brand,
            equip_model,
            equip_serial,
            equip_voltage,
            diagnosis,
            created_at,
            customers (name),
            service_order_parts (
              product_id,
              part_name,
              quantity,
              unit_price
            )
          `)
          .order('order_number', { ascending: false }),
        loadAllProductsMeta(),
      ]);

      if (ordersRes.error) throw ordersRes.error;
      setOrders((ordersRes.data as unknown as WorkshopReportOrder[]) ?? []);
      setProductsById(productsMap);
    } catch (err) {
      console.error('Error fetching report data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadReportData();
  }, [loadReportData]);

  // Calculate totals for a specific order using the unified formula
  const getOrderTotals = (order: WorkshopReportOrder) => {
    const { partsTotal, laborCost, grandTotal } = calculateWorkshopOrderFinancials(order);

    return {
      partsTotal,
      servicesTotal: laborCost,
      grandTotal,
    };
  };

  const multiOsActive = useMemo(() => parseMultiOsQuery(search), [search]);

  // Filtered orders (supports multi-OS list paste and local date comparison without UTC shift)
  const filtered = useMemo(
    () =>
      orders.filter(o => {
        const matchStatus = statusFilter === 'all' || o.status === statusFilter;
        const matchDate = matchesLocalDateRange(o.created_at, startDate, endDate);
        const matchSearch = matchesWorkshopOrderSearch(o, search);
        return matchStatus && matchDate && matchSearch;
      }),
    [orders, statusFilter, startDate, endDate, search]
  );

  // Target orders for export: manually checked rows (within current filter) OR all filtered rows
  const exportTargets = useMemo(() => {
    if (selectedIds.size === 0) return filtered;
    const picked = filtered.filter(o => selectedIds.has(o.id));
    return picked.length > 0 ? picked : filtered;
  }, [filtered, selectedIds]);

  const allFilteredSelected =
    filtered.length > 0 && filtered.every(o => selectedIds.has(o.id));

  function toggleSelectOrder(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAllFiltered() {
    if (allFilteredSelected) {
      setSelectedIds(prev => {
        const next = new Set(prev);
        for (const o of filtered) next.delete(o.id);
        return next;
      });
    } else {
      setSelectedIds(prev => {
        const next = new Set(prev);
        for (const o of filtered) next.add(o.id);
        return next;
      });
    }
  }

  const summary = useMemo(
    () => computeWorkshopReportSummary(exportTargets, productsById),
    [exportTargets, productsById]
  );

  const formatCurrency = (val: number) => {
    return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  const handleExportExcel = () => {
    if (exportTargets.length === 0) return;
    const wb = buildWorkshopReportWorkbook(exportTargets, productsById);
    XLSX.writeFile(wb, `relatorio_os_${getLocalTodayFileStamp()}.xlsx`);
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

              const barColor = {
                'Triagem': 'bg-slate-400',
                'Em Diagnóstico': 'bg-sky-500',
                'Aguardando Orçamento': 'bg-blue-500',
                'Aguardando Aprovação': 'bg-amber-400',
                'Aguardando Peças': 'bg-amber-500',
                'Em Manutenção': 'bg-orange-500',
                'Aguardando Conferência': 'bg-indigo-500',
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
          {/* Text & Multi-OS Search */}
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar cliente, modelo ou colar OSs (#0178 #0170)..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-8 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-400"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label="Limpar busca"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X size={14} />
              </button>
            )}
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
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pt-2 border-t border-slate-100">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-slate-500">
            <span>
              Mostrando <span className="font-semibold text-slate-700">{filtered.length}</span> de{' '}
              <span className="font-semibold text-slate-700">{orders.length}</span> ordens de serviço
            </span>
            {multiOsActive && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-sky-100 text-sky-800">
                Lote multi-OS ({multiOsActive.size} códigos)
              </span>
            )}
            {selectedIds.size > 0 && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">
                {exportTargets.length} selecionada(s)
                <button
                  type="button"
                  onClick={() => setSelectedIds(new Set())}
                  className="hover:text-amber-950 underline"
                >
                  Limpar
                </button>
              </span>
            )}
            {exportTargets.length > 0 && (
              <span className="text-xs text-slate-500">
                · 3 abas Excel ({summary.materialsDistinctCount} materiais · {summary.servicesDistinctCount} serviços)
              </span>
            )}
            {summary.voltageAlertsCount > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                <AlertTriangle size={12} />
                {summary.voltageAlertsCount} alerta(s) 110V×220V na Aba 2
              </span>
            )}
          </div>

          <button
            onClick={handleExportExcel}
            disabled={exportTargets.length === 0}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm w-full lg:w-auto justify-center shrink-0"
          >
            <FileSpreadsheet size={16} />
            {selectedIds.size > 0
              ? `Exportar Planilha (${exportTargets.length} OSs · 3 Abas)`
              : 'Exportar Planilha (.xlsx · 3 Abas)'}
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
                  <th className="pl-4 pr-2 py-3.5 w-10">
                    <button
                      type="button"
                      onClick={toggleSelectAllFiltered}
                      title={allFilteredSelected ? 'Desmarcar todas filtradas' : 'Selecionar todas filtradas'}
                      className="text-slate-400 hover:text-amber-600 flex items-center"
                    >
                      {allFilteredSelected ? <CheckSquare size={16} className="text-amber-600" /> : <Square size={16} />}
                    </button>
                  </th>
                  <th className="px-3 py-3.5">OS</th>
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
                  const isSelected = selectedIds.has(o.id);
                  return (
                    <tr
                      key={o.id}
                      className={`hover:bg-slate-50/70 transition-colors ${isSelected ? 'bg-amber-50/40' : ''}`}
                    >
                      <td className="pl-4 pr-2 py-4">
                        <button
                          type="button"
                          onClick={() => toggleSelectOrder(o.id)}
                          aria-label={`Selecionar OS #${String(o.order_number).padStart(4, '0')}`}
                          className="text-slate-400 hover:text-amber-600 flex items-center"
                        >
                          {isSelected ? <CheckSquare size={16} className="text-amber-600" /> : <Square size={16} />}
                        </button>
                      </td>
                      <td className="px-3 py-4 font-mono font-bold text-slate-900">
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
                  <td colSpan={8} className="px-4 py-4 text-right text-xs uppercase tracking-wider text-slate-500">
                    {selectedIds.size > 0
                      ? `Totais das ${exportTargets.length} OS(s) Selecionadas:`
                      : 'Totais Gerais Filtrados:'}
                  </td>
                  <td className="px-4 py-4 text-right font-mono text-slate-800">
                    {formatCurrency(summary.partsTotal)}
                  </td>
                  <td className="px-4 py-4 text-right font-mono text-slate-800">
                    {formatCurrency(summary.servicesTotal)}
                  </td>
                  <td className="px-4 py-4 text-right font-mono text-amber-600 text-base">
                    {formatCurrency(summary.grandTotal)}
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
