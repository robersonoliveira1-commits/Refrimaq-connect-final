import { useEffect, useMemo, useState } from 'react';
import {
  Users, AlertCircle, Clock, UserPlus, Search, Filter, Plus, Phone,
  ChevronRight, Trash2, Download, CheckSquare, Square, X, MapPin, MapPinOff,
  Upload, RotateCcw, ArrowUpDown, ShieldAlert, Loader2, ChevronLeft, Tag
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Customer, ContactStatus, getContactStatus, getStatusLabel, daysSince } from '../lib/types';
import {
  extractCustomerSegment,
  computeCustomerMetrics,
  filterAndSortCustomers,
  getCustomerStatusRangeLabel,
  buildCustomersCsv,
  getLocalTodayFileStamp,
  summarizeCustomerDependencies,
  CustomerDependencyCounts,
  CustomerDeletionAnalysis,
  CustomerGpsFilter,
  CustomerSortBy,
} from '../lib/customersEngine';
import Header from './Header';

const STATUS_COLORS: Record<ContactStatus, string> = {
  green: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  yellow: 'bg-amber-100 text-amber-700 border-amber-200',
  red: 'bg-red-100 text-red-700 border-red-200',
  gray: 'bg-slate-100 text-slate-600 border-slate-200',
};

const STATUS_DOT: Record<ContactStatus, string> = {
  green: 'bg-emerald-500',
  yellow: 'bg-amber-500',
  red: 'bg-red-500',
  gray: 'bg-slate-400',
};

const ITEMS_PER_PAGE = 50;

interface CustomerListProps {
  onSelectCustomer: (id: string) => void;
  onAddCustomer: () => void;
  onImportCustomers?: () => void;
  onMenuClick: () => void;
  refresh: number;
}

interface DeleteModalState {
  mode: 'single' | 'multiple';
  loading: boolean;
  deleting: boolean;
  error: string;
  analysis: CustomerDeletionAnalysis | null;
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

export default function CustomerList({
  onSelectCustomer,
  onAddCustomer,
  onImportCustomers,
  onMenuClick,
  refresh,
}: CustomerListProps) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ContactStatus | 'all'>('all');
  const [cityFilter, setCityFilter] = useState<string>('all');
  const [segmentFilter, setSegmentFilter] = useState<string>('all');
  const [gpsFilter, setGpsFilter] = useState<CustomerGpsFilter>('all');
  const [sortBy, setSortBy] = useState<CustomerSortBy>('name_asc');
  const [currentPage, setCurrentPage] = useState(1);
  const [showAllRows, setShowAllRows] = useState(false);

  // selection state
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleteModal, setDeleteModal] = useState<DeleteModalState | null>(null);

  useEffect(() => {
    loadCustomers();
  }, [refresh]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, statusFilter, cityFilter, segmentFilter, gpsFilter, sortBy]);

  async function loadCustomers() {
    setLoading(true);
    const all: Customer[] = [];
    const PAGE_SIZE = 1000;
    let from = 0;
    let hasMore = true;

    while (hasMore) {
      const { data } = await supabase
        .from('customers')
        .select('*')
        .order('name')
        .range(from, from + PAGE_SIZE - 1);
      if (data && data.length > 0) {
        all.push(...(data as Customer[]));
        from += PAGE_SIZE;
        if (data.length < PAGE_SIZE) hasMore = false;
      } else {
        hasMore = false;
      }
    }

    setCustomers(all);
    setLoading(false);
  }

  const metrics = useMemo(() => computeCustomerMetrics(customers), [customers]);

  const filtered = useMemo(
    () =>
      filterAndSortCustomers(customers, {
        search,
        status: statusFilter,
        city: cityFilter,
        segment: segmentFilter,
        gps: gpsFilter,
        sortBy,
      }),
    [customers, search, statusFilter, cityFilter, segmentFilter, gpsFilter, sortBy]
  );

  const cities = useMemo(
    () =>
      Array.from(new Set(customers.map(c => (c.city ?? '').trim()).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b, 'pt-BR')
      ),
    [customers]
  );

  const segments = useMemo(
    () =>
      Array.from(new Set(customers.map(c => extractCustomerSegment(c)).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b, 'pt-BR')
      ),
    [customers]
  );

  const hasActiveFilters =
    search.trim().length > 0 ||
    statusFilter !== 'all' ||
    cityFilter !== 'all' ||
    segmentFilter !== 'all' ||
    gpsFilter !== 'all';

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);
  const displayedCustomers = useMemo(() => {
    if (showAllRows) return filtered;
    const start = (safePage - 1) * ITEMS_PER_PAGE;
    return filtered.slice(start, start + ITEMS_PER_PAGE);
  }, [filtered, safePage, showAllRows]);

  function clearFilters() {
    setSearch('');
    setStatusFilter('all');
    setCityFilter('all');
    setSegmentFilter('all');
    setGpsFilter('all');
    setCurrentPage(1);
  }

  // ── selection helpers ────────────────────────────────────────────────────
  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(filtered.map(c => c.id)));
  }

  function deselectAll() {
    setSelected(new Set());
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelected(new Set());
  }

  const allSelected = filtered.length > 0 && filtered.every(c => selected.has(c.id));

  // ── safe delete dependency check ─────────────────────────────────────────
  async function inspectAndOpenDeleteModal(ids: string[], mode: 'single' | 'multiple') {
    if (ids.length === 0) return;
    setDeleteModal({ mode, loading: true, deleting: false, error: '', analysis: null });

    const namesById: Record<string, string> = {};
    const countsByCustomer: Record<string, CustomerDependencyCounts> = {};
    for (const id of ids) {
      const found = customers.find(c => c.id === id);
      namesById[id] = found?.name ?? 'Cliente';
      countsByCustomer[id] = {
        serviceOrders: 0,
        sales: 0,
        budgets: 0,
        boletos: 0,
        routeStops: 0,
        equipments: 0,
      };
    }

    try {
      const chunks = chunkArray(ids, 100);
      const osCustomerMap = new Map<string, string>();

      for (const chunk of chunks) {
        const [osRes, salesRes, budgetsRes, routesRes, equipRes] = await Promise.all([
          supabase.from('service_orders').select('id, customer_id').in('customer_id', chunk),
          supabase.from('sales').select('id, customer_id').in('customer_id', chunk),
          supabase.from('sales_budgets').select('id, customer_id').in('customer_id', chunk),
          supabase.from('route_stops').select('id, customer_id').in('customer_id', chunk),
          supabase.from('customer_equipments').select('id, customer_id').in('customer_id', chunk),
        ]);

        if (osRes.data) {
          for (const row of osRes.data as Array<{ id: string; customer_id: string }>) {
            if (countsByCustomer[row.customer_id]) {
              countsByCustomer[row.customer_id].serviceOrders++;
              osCustomerMap.set(row.id, row.customer_id);
            }
          }
        }
        if (salesRes.data) {
          for (const row of salesRes.data as Array<{ customer_id: string }>) {
            if (countsByCustomer[row.customer_id]) countsByCustomer[row.customer_id].sales++;
          }
        }
        if (budgetsRes.data) {
          for (const row of budgetsRes.data as Array<{ customer_id: string }>) {
            if (countsByCustomer[row.customer_id]) countsByCustomer[row.customer_id].budgets++;
          }
        }
        if (routesRes.data) {
          for (const row of routesRes.data as Array<{ customer_id: string }>) {
            if (countsByCustomer[row.customer_id]) countsByCustomer[row.customer_id].routeStops++;
          }
        }
        if (equipRes.data) {
          for (const row of equipRes.data as Array<{ customer_id: string }>) {
            if (countsByCustomer[row.customer_id]) countsByCustomer[row.customer_id].equipments++;
          }
        }
      }

      // Check boletos linked via customer's service_orders
      const osIds = Array.from(osCustomerMap.keys());
      for (const osChunk of chunkArray(osIds, 100)) {
        const { data: boletoRows } = await supabase
          .from('boletos')
          .select('id, service_order_id')
          .in('service_order_id', osChunk);
        if (boletoRows) {
          for (const b of boletoRows as Array<{ service_order_id: string }>) {
            const cId = osCustomerMap.get(b.service_order_id);
            if (cId && countsByCustomer[cId]) {
              countsByCustomer[cId].boletos++;
            }
          }
        }
      }

      const analysis = summarizeCustomerDependencies(ids, namesById, countsByCustomer);
      setDeleteModal({ mode, loading: false, deleting: false, error: '', analysis });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao verificar vínculos do cliente.';
      setDeleteModal({ mode, loading: false, deleting: false, error: msg, analysis: null });
    }
  }

  async function confirmSafeDelete() {
    if (!deleteModal?.analysis || deleteModal.analysis.deletableIds.length === 0) return;
    const targetIds = deleteModal.analysis.deletableIds;

    setDeleteModal(prev => (prev ? { ...prev, deleting: true, error: '' } : null));

    for (const chunk of chunkArray(targetIds, 100)) {
      const { error } = await supabase.from('customers').delete().in('id', chunk);
      if (error) {
        setDeleteModal(prev =>
          prev ? { ...prev, deleting: false, error: `Erro ao excluir: ${error.message}` } : null
        );
        return;
      }
    }

    setDeleteModal(null);
    if (selectMode) exitSelectMode();
    loadCustomers();
  }

  // ── export CSV PT-BR (; + BOM) ───────────────────────────────────────────
  function downloadCsv(customerList: Customer[], filename: string) {
    const csv = buildCustomersCsv(customerList);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleExportSelected() {
    const list = customers.filter(c => selected.has(c.id));
    downloadCsv(list, `refrimaq_clientes_selecionados_${getLocalTodayFileStamp()}.csv`);
    exitSelectMode();
  }

  function handleExportCurrent() {
    const list = hasActiveFilters ? filtered : customers;
    const suffix = hasActiveFilters ? 'filtrados' : 'backup';
    downloadCsv(list, `refrimaq_clientes_${suffix}_${getLocalTodayFileStamp()}.csv`);
  }

  const metricCards: Array<{
    key: ContactStatus | 'all';
    label: string;
    value: number;
    icon: typeof Users;
    color: string;
    bg: string;
    dot?: string;
  }> = [
    { key: 'all', label: 'Total de Clientes', value: metrics.total, icon: Users, color: 'text-blue-600', bg: 'bg-blue-50' },
    { key: 'green', label: getCustomerStatusRangeLabel('green'), value: metrics.green, icon: Users, color: 'text-emerald-600', bg: 'bg-emerald-50', dot: 'bg-emerald-500' },
    { key: 'yellow', label: getCustomerStatusRangeLabel('yellow'), value: metrics.yellow, icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50', dot: 'bg-amber-500' },
    { key: 'red', label: getCustomerStatusRangeLabel('red'), value: metrics.red, icon: AlertCircle, color: 'text-red-600', bg: 'bg-red-50', dot: 'bg-red-500' },
    { key: 'gray', label: 'Novos (sem contato)', value: metrics.gray, icon: UserPlus, color: 'text-slate-600', bg: 'bg-slate-50', dot: 'bg-slate-400' },
  ];

  const subtitleText = hasActiveFilters
    ? `Exibindo ${filtered.length} de ${customers.length} clientes`
    : `${customers.length} clientes cadastrados`;

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Clientes"
        subtitle={subtitleText}
        onMenuClick={onMenuClick}
        actions={
          <div className="flex items-center gap-2">
            {!selectMode && (
              <>
                {onImportCustomers && (
                  <button
                    onClick={onImportCustomers}
                    title="Importar planilha CSV ou Excel"
                    className="flex items-center gap-1.5 border border-slate-200 hover:bg-slate-50 text-slate-600 px-3 py-2 rounded-lg text-sm transition-colors"
                  >
                    <Upload size={15} />
                    <span className="hidden sm:inline">Importar</span>
                  </button>
                )}
                <button
                  onClick={handleExportCurrent}
                  title={hasActiveFilters ? 'Exportar clientes filtrados (CSV Excel PT-BR)' : 'Exportar todos os clientes (CSV Excel PT-BR)'}
                  className="flex items-center gap-1.5 border border-slate-200 hover:bg-slate-50 text-slate-600 px-3 py-2 rounded-lg text-sm transition-colors"
                >
                  <Download size={15} />
                  <span className="hidden md:inline">{hasActiveFilters ? `Exportar (${filtered.length})` : 'Exportar CSV'}</span>
                </button>
                <button
                  onClick={() => setSelectMode(true)}
                  title="Selecionar clientes em lote"
                  className="flex items-center gap-1.5 border border-slate-200 hover:bg-slate-50 text-slate-600 px-3 py-2 rounded-lg text-sm transition-colors"
                >
                  <CheckSquare size={15} />
                  <span className="hidden md:inline">Selecionar</span>
                </button>
                <button
                  onClick={onAddCustomer}
                  className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-white px-3.5 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  <Plus size={16} />
                  <span className="hidden sm:inline">Novo Cliente</span>
                </button>
              </>
            )}
            {selectMode && (
              <>
                <button
                  onClick={allSelected ? deselectAll : selectAll}
                  className="flex items-center gap-1.5 border border-slate-200 hover:bg-slate-50 text-slate-600 px-3 py-2 rounded-lg text-sm transition-colors"
                >
                  {allSelected ? <CheckSquare size={15} className="text-amber-500" /> : <Square size={15} />}
                  <span className="hidden sm:inline">{allSelected ? 'Desmarcar todos' : `Selecionar todos (${filtered.length})`}</span>
                </button>
                <button
                  onClick={handleExportSelected}
                  disabled={selected.size === 0}
                  className="flex items-center gap-1.5 border border-slate-200 hover:bg-slate-50 text-slate-600 px-3 py-2 rounded-lg text-sm transition-colors disabled:opacity-40"
                >
                  <Download size={15} />
                  Exportar {selected.size > 0 ? `(${selected.size})` : ''}
                </button>
                <button
                  onClick={() => inspectAndOpenDeleteModal([...selected], 'multiple')}
                  disabled={selected.size === 0}
                  className="flex items-center gap-1.5 bg-red-500 hover:bg-red-600 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-40"
                >
                  <Trash2 size={15} />
                  Excluir {selected.size > 0 ? `(${selected.size})` : ''}
                </button>
                <button
                  onClick={exitSelectMode}
                  className="flex items-center gap-1 text-slate-400 hover:text-slate-600 px-2 py-2 transition-colors"
                  title="Cancelar seleção"
                >
                  <X size={18} />
                </button>
              </>
            )}
          </div>
        }
      />

      <div className="flex-1 overflow-auto p-4 sm:p-6 space-y-6">
        {/* metric cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {metricCards.map(card => {
            const isActive = statusFilter === card.key;
            return (
              <button
                key={card.key}
                onClick={() => setStatusFilter(prev => (prev === card.key && card.key !== 'all' ? 'all' : card.key))}
                className={`bg-white rounded-xl p-4 border text-left transition-all ${
                  isActive
                    ? 'border-amber-500 ring-2 ring-amber-400/30 shadow-sm'
                    : 'border-slate-200 hover:border-amber-300 hover:shadow-sm'
                }`}
              >
                <div className={`w-9 h-9 ${card.bg} rounded-lg flex items-center justify-center mb-3`}>
                  {card.dot ? (
                    <span className={`w-3 h-3 rounded-full ${card.dot}`} />
                  ) : (
                    <card.icon size={18} className={card.color} />
                  )}
                </div>
                <p className="text-2xl font-bold text-slate-800 tabular-nums">{card.value}</p>
                <p className="text-xs text-slate-500 mt-0.5">{card.label}</p>
              </button>
            );
          })}
        </div>

        {/* filters & list */}
        <div className="bg-white rounded-xl border border-slate-200">
          <div className="p-4 border-b border-slate-100 space-y-3">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Buscar por nome, CPF/CNPJ, telefone, WhatsApp, email, cidade ou segmento..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full pl-9 pr-9 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
                />
                {search && (
                  <button
                    onClick={() => setSearch('')}
                    title="Limpar busca"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X size={15} />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <ArrowUpDown size={15} className="text-slate-400 shrink-0" />
                <select
                  value={sortBy}
                  onChange={e => setSortBy(e.target.value as CustomerSortBy)}
                  className="border border-slate-200 rounded-lg text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
                >
                  <option value="name_asc">Ordenar: Nome (A–Z)</option>
                  <option value="oldest_contact">Mais tempo sem contato</option>
                  <option value="newest_created">Cadastro mais recente</option>
                </select>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Filter size={15} className="text-slate-400 shrink-0" />
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value as ContactStatus | 'all')}
                className="border border-slate-200 rounded-lg text-xs sm:text-sm px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
              >
                <option value="all">Todos os status</option>
                <option value="green">{getCustomerStatusRangeLabel('green')}</option>
                <option value="yellow">{getCustomerStatusRangeLabel('yellow')}</option>
                <option value="red">{getCustomerStatusRangeLabel('red')}</option>
                <option value="gray">Novos (sem contato)</option>
              </select>

              <select
                value={cityFilter}
                onChange={e => setCityFilter(e.target.value)}
                className="border border-slate-200 rounded-lg text-xs sm:text-sm px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
              >
                <option value="all">Todas as cidades</option>
                {cities.map(city => (
                  <option key={city} value={city}>{city}</option>
                ))}
              </select>

              <select
                value={segmentFilter}
                onChange={e => setSegmentFilter(e.target.value)}
                className="border border-slate-200 rounded-lg text-xs sm:text-sm px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
              >
                <option value="all">Todos os segmentos</option>
                {segments.map(seg => (
                  <option key={seg} value={seg}>{seg}</option>
                ))}
              </select>

              <select
                value={gpsFilter}
                onChange={e => setGpsFilter(e.target.value as CustomerGpsFilter)}
                className="border border-slate-200 rounded-lg text-xs sm:text-sm px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
              >
                <option value="all">GPS: Todos</option>
                <option value="with_gps">Com GPS</option>
                <option value="without_gps">Sem GPS</option>
              </select>

              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-2.5 py-1.5 rounded-lg transition-colors"
                >
                  <RotateCcw size={12} />
                  Limpar filtros
                </button>
              )}

              <span className="ml-auto text-xs text-slate-400 tabular-nums">
                {filtered.length} resultado(s)
              </span>
            </div>
          </div>

          {/* customer list */}
          {loading ? (
            <div className="p-8 text-center">
              <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-slate-500 text-sm">Carregando clientes...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center">
              <Users size={40} className="text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 font-medium">Nenhum cliente encontrado</p>
              <p className="text-slate-400 text-sm mt-1">
                {hasActiveFilters ? 'Tente ajustar ou limpar os filtros ativos' : 'Adicione seu primeiro cliente'}
              </p>
              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="mt-3 text-xs font-semibold text-amber-600 hover:underline"
                >
                  Limpar filtros
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="divide-y divide-slate-100">
                {displayedCustomers.map(customer => {
                  const status = getContactStatus(customer.last_contact_at);
                  const isSelected = selected.has(customer.id);
                  const seg = extractCustomerSegment(customer);
                  const hasGps = customer.latitude !== null && customer.longitude !== null;
                  return (
                    <div
                      key={customer.id}
                      className={`w-full flex items-center gap-4 px-4 py-3.5 hover:bg-slate-50 transition-colors text-left ${
                        isSelected ? 'bg-amber-50' : ''
                      }`}
                    >
                      {/* checkbox or avatar */}
                      {selectMode ? (
                        <button
                          onClick={e => { e.stopPropagation(); toggleSelect(customer.id); }}
                          className="flex-shrink-0"
                        >
                          {isSelected
                            ? <CheckSquare size={20} className="text-amber-500" />
                            : <Square size={20} className="text-slate-300 hover:text-slate-400" />
                          }
                        </button>
                      ) : (
                        <button
                          onClick={() => onSelectCustomer(customer.id)}
                          className="relative flex-shrink-0"
                        >
                          <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center">
                            <span className="text-slate-600 font-semibold text-sm">
                              {(customer.name || '?').charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${STATUS_DOT[status]}`} />
                        </button>
                      )}

                      {/* main content - clickable */}
                      <button
                        onClick={() => { if (!selectMode) onSelectCustomer(customer.id); else toggleSelect(customer.id); }}
                        className="flex-1 min-w-0 text-left"
                      >
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium text-slate-800 truncate">{customer.name}</p>
                          {hasGps ? (
                            <span title="GPS cadastrado">
                              <MapPin size={13} className="text-emerald-500 flex-shrink-0" />
                            </span>
                          ) : (
                            <span title="Sem coordenadas GPS">
                              <MapPinOff size={13} className="text-slate-300 flex-shrink-0" />
                            </span>
                          )}
                          <span className={`hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${STATUS_COLORS[status]}`}>
                            {getStatusLabel(status)}
                          </span>
                          {seg && (
                            <span className="hidden md:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-600">
                              <Tag size={10} /> {seg}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                          {(customer.phone || customer.whatsapp) && (
                            <span className="flex items-center gap-1 text-xs text-slate-500">
                              <Phone size={11} />
                              {customer.phone || customer.whatsapp}
                            </span>
                          )}
                          {customer.city && (
                            <span className="text-xs text-slate-400 hidden sm:inline">
                              {customer.city}{customer.state ? `, ${customer.state}` : ''}
                            </span>
                          )}
                          {customer.document && (
                            <span className="text-xs text-slate-400 hidden lg:inline font-mono">
                              {customer.document}
                            </span>
                          )}
                        </div>
                      </button>

                      {/* last contact */}
                      <div className="flex-shrink-0 text-right hidden sm:block">
                        <p className="text-xs text-slate-400">Último contato</p>
                        <p className="text-xs font-medium text-slate-600">{daysSince(customer.last_contact_at)}</p>
                      </div>

                      {/* individual delete (only when not in select mode) */}
                      {!selectMode && (
                        <button
                          onClick={e => { e.stopPropagation(); inspectAndOpenDeleteModal([customer.id], 'single'); }}
                          className="text-slate-300 hover:text-red-500 transition-colors flex-shrink-0 p-1"
                          title="Excluir cliente"
                        >
                          <Trash2 size={15} />
                        </button>
                      )}

                      {!selectMode && <ChevronRight size={16} className="text-slate-300 flex-shrink-0" />}
                    </div>
                  );
                })}
              </div>

              {/* pagination footer */}
              {filtered.length > ITEMS_PER_PAGE && (
                <div className="px-4 py-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 bg-slate-50/50 text-xs text-slate-600">
                  <span className="tabular-nums">
                    {showAllRows
                      ? `Exibindo todos os ${filtered.length} clientes`
                      : `Exibindo ${(safePage - 1) * ITEMS_PER_PAGE + 1}–${Math.min(safePage * ITEMS_PER_PAGE, filtered.length)} de ${filtered.length} clientes`}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setShowAllRows(prev => !prev)}
                      className="px-2.5 py-1.5 border border-slate-200 bg-white hover:bg-slate-50 rounded-lg font-medium text-slate-600"
                    >
                      {showAllRows ? `Paginar (${ITEMS_PER_PAGE}/pág)` : 'Mostrar todos'}
                    </button>
                    {!showAllRows && (
                      <>
                        <button
                          onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                          disabled={safePage <= 1}
                          className="p-1.5 border border-slate-200 bg-white hover:bg-slate-50 rounded-lg disabled:opacity-40"
                          title="Página anterior"
                        >
                          <ChevronLeft size={14} />
                        </button>
                        <span className="font-medium tabular-nums">
                          {safePage} / {totalPages}
                        </span>
                        <button
                          onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                          disabled={safePage >= totalPages}
                          className="p-1.5 border border-slate-200 bg-white hover:bg-slate-50 rounded-lg disabled:opacity-40"
                          title="Próxima página"
                        >
                          <ChevronRight size={14} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Safe Deletion Modal */}
      {deleteModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md space-y-4">
            {deleteModal.loading ? (
              <div className="py-8 flex flex-col items-center gap-3 text-center">
                <Loader2 size={28} className="text-amber-500 animate-spin" />
                <p className="text-sm font-medium text-slate-700">Verificando vínculos operacionais e financeiros...</p>
                <p className="text-xs text-slate-400">Checando OSs, vendas, orçamentos, boletos, rotas e equipamentos</p>
              </div>
            ) : deleteModal.error && !deleteModal.analysis ? (
              <div className="space-y-4">
                <h3 className="text-lg font-bold text-slate-800">Erro na Verificação</h3>
                <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3">{deleteModal.error}</p>
                <button
                  onClick={() => setDeleteModal(null)}
                  className="w-full py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50"
                >
                  Fechar
                </button>
              </div>
            ) : deleteModal.analysis && deleteModal.analysis.deletableIds.length === 0 ? (
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center shrink-0">
                    <ShieldAlert size={20} className="text-red-600" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-800">Exclusão Bloqueada por Segurança</h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Para preservar o histórico financeiro, de oficina e rotas, não é permitido excluir clientes com registros vinculados.
                    </p>
                  </div>
                </div>

                <div className="max-h-52 overflow-auto space-y-2">
                  {deleteModal.analysis.blocked.map(b => (
                    <div key={b.customerId} className="bg-red-50/70 border border-red-200 rounded-xl p-3">
                      <p className="text-sm font-semibold text-slate-800 truncate">{b.customerName}</p>
                      <p className="text-xs text-red-700 mt-1">{b.reasons.join(' · ')}</p>
                    </div>
                  ))}
                </div>

                <button
                  onClick={() => setDeleteModal(null)}
                  className="w-full py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  Entendi
                </button>
              </div>
            ) : deleteModal.analysis ? (
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                    deleteModal.analysis.blocked.length > 0 ? 'bg-amber-50' : 'bg-red-50'
                  }`}>
                    {deleteModal.analysis.blocked.length > 0
                      ? <ShieldAlert size={20} className="text-amber-600" />
                      : <Trash2 size={20} className="text-red-500" />
                    }
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-800">Confirmar Exclusão</h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {deleteModal.analysis.blocked.length > 0
                        ? `${deleteModal.analysis.blocked.length} cliente(s) possuem vínculos e serão preservados. Apenas os ${deleteModal.analysis.deletableIds.length} cliente(s) sem histórico serão excluídos.`
                        : deleteModal.mode === 'single'
                          ? `Nenhum vínculo operacional ou financeiro encontrado. Excluir "${customers.find(c => c.id === deleteModal.analysis?.deletableIds[0])?.name ?? 'este cliente'}" permanentemente?`
                          : `Nenhum vínculo encontrado. Excluir ${deleteModal.analysis.deletableIds.length} cliente(s) permanentemente?`}
                    </p>
                  </div>
                </div>

                {deleteModal.analysis.blocked.length > 0 && (
                  <div className="max-h-40 overflow-auto space-y-1.5 bg-amber-50/70 border border-amber-200 rounded-xl p-3">
                    <p className="text-[11px] font-bold text-amber-800 uppercase">Preservados (bloqueados):</p>
                    {deleteModal.analysis.blocked.map(b => (
                      <p key={b.customerId} className="text-xs text-amber-900">
                        <strong>{b.customerName}:</strong> {b.reasons.join(', ')}
                      </p>
                    ))}
                  </div>
                )}

                {deleteModal.error && (
                  <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{deleteModal.error}</p>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={() => setDeleteModal(null)}
                    disabled={deleteModal.deleting}
                    className="flex-1 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={confirmSafeDelete}
                    disabled={deleteModal.deleting}
                    className="flex-1 py-2 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600 disabled:opacity-50"
                  >
                    {deleteModal.deleting
                      ? 'Excluindo...'
                      : deleteModal.analysis.blocked.length > 0
                        ? `Excluir ${deleteModal.analysis.deletableIds.length} sem vínculo`
                        : 'Sim, excluir'}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
