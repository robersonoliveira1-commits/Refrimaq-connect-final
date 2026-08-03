import { useEffect, useState } from 'react';
import {
  Users, AlertCircle, Clock, UserPlus, Search, Filter, Plus, Phone,
  ChevronRight, Trash2, Download, CheckSquare, Square, X, MapPin, MapPinOff
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Customer, ContactStatus, getContactStatus, getStatusLabel, daysSince } from '../lib/types';
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

const getCustomerSegment = (c: Customer): string => {
  if (c.segment) return c.segment;
  if (!c.notes) return '';
  const match = c.notes.match(/^\[Segmento:\s*([^\]]+)\]/);
  return match ? match[1].trim() : '';
};

interface DashboardProps {
  onSelectCustomer: (id: string) => void;
  onAddCustomer: () => void;
  onMenuClick: () => void;
  refresh: number;
}

interface Metrics {
  total: number;
  green: number;
  yellow: number;
  red: number;
  gray: number;
}

export default function CustomerList({ onSelectCustomer, onAddCustomer, onMenuClick, refresh }: DashboardProps) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [filtered, setFiltered] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ContactStatus | 'all'>('all');
  const [cityFilter, setCityFilter] = useState<string>('all');
  const [segmentFilter, setSegmentFilter] = useState<string>('all');
  const [metrics, setMetrics] = useState<Metrics>({ total: 0, green: 0, yellow: 0, red: 0, gray: 0 });

  // selection state
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'single' | 'multiple'; id?: string; name?: string } | null>(null);

  useEffect(() => {
    loadCustomers();
  }, [refresh]);

  useEffect(() => {
    applyFilters();
  }, [customers, search, statusFilter, cityFilter, segmentFilter]);

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
        all.push(...data);
        from += PAGE_SIZE;
        if (data.length < PAGE_SIZE) hasMore = false;
      } else {
        hasMore = false;
      }
    }

    setCustomers(all);
    const m: Metrics = { total: all.length, green: 0, yellow: 0, red: 0, gray: 0 };
    all.forEach(c => m[getContactStatus(c.last_contact_at)]++);
    setMetrics(m);
    setLoading(false);
  }

  function applyFilters() {
    let list = [...customers];
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(c =>
        (c.name || '').toLowerCase().includes(q) ||
        (c.phone || '').includes(q) ||
        (c.email || '').toLowerCase().includes(q) ||
        (c.city || '').toLowerCase().includes(q)
      );
    }
    if (statusFilter !== 'all') {
      list = list.filter(c => getContactStatus(c.last_contact_at) === statusFilter);
    }
    if (cityFilter !== 'all') {
      list = list.filter(c => (c.city || '').trim().toLowerCase() === cityFilter.toLowerCase());
    }
    if (segmentFilter !== 'all') {
      list = list.filter(c => getCustomerSegment(c).toLowerCase() === segmentFilter.toLowerCase());
    }
    setFiltered(list);
  }

  // ── selection helpers ────────────────────────────────────────────────────
  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
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

  // ── delete ───────────────────────────────────────────────────────────────
  async function deleteSelected() {
    const count = selected.size;
    const ids = [...selected];
    const { error } = await supabase.from('customers').delete().in('id', ids);
    if (error) {
      alert('Erro ao excluir: ' + error.message);
      return;
    }
    exitSelectMode();
    loadCustomers();
  }

  async function deleteOne(id: string, name: string) {
    const { error } = await supabase.from('customers').delete().eq('id', id);
    if (error) {
      alert('Erro ao excluir: ' + error.message);
      return;
    }
    loadCustomers();
  }

  // ── export / backup CSV ──────────────────────────────────────────────────
  function exportCSV(customerList: Customer[], filename: string) {
    const BOM = '\uFEFF';
    const header = ['Nome', 'Telefone', 'WhatsApp', 'E-mail', 'Endereço', 'Cidade', 'Estado', 'CEP', 'CPF/CNPJ', 'Observações', 'Último Contato', 'Cadastro'];
    const escape = (v: string) => {
      if (!v) return '';
      if (v.includes(',') || v.includes('"') || v.includes('\n')) {
        return '"' + v.replace(/"/g, '""') + '"';
      }
      return v;
    };
    const rows = customerList.map(c => [
      escape(c.name), escape(c.phone), escape(c.whatsapp), escape(c.email),
      escape(c.address), escape(c.city), escape(c.state), escape(c.zip_code),
      escape(c.document), escape(c.notes),
      c.last_contact_at ? new Date(c.last_contact_at).toLocaleDateString('pt-BR') : '',
      new Date(c.created_at).toLocaleDateString('pt-BR'),
    ].join(','));
    const csv = BOM + header.join(',') + '\n' + rows.join('\n');
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
    exportCSV(list, `refrimaq_connect_backup_${new Date().toISOString().slice(0, 10)}.csv`);
    exitSelectMode();
  }

  function handleExportAll() {
    exportCSV(customers, `refrimaq_connect_backup_${new Date().toISOString().slice(0, 10)}.csv`);
  }

  const metricCards = [
    { label: 'Total de Clientes', value: metrics.total, icon: Users, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Recente (até 30 dias)', value: metrics.green, icon: Users, color: 'text-emerald-600', bg: 'bg-emerald-50', dot: 'bg-emerald-500' },
    { label: 'Atenção (90–180 dias)', value: metrics.yellow, icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50', dot: 'bg-amber-500' },
    { label: 'Urgente (+180 dias)', value: metrics.red, icon: AlertCircle, color: 'text-red-600', bg: 'bg-red-50', dot: 'bg-red-500' },
    { label: 'Novos', value: metrics.gray, icon: UserPlus, color: 'text-slate-600', bg: 'bg-slate-50', dot: 'bg-slate-400' },
  ];

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Painel"
        subtitle="Visão geral dos seus clientes"
        onMenuClick={onMenuClick}
        actions={
          <div className="flex items-center gap-2">
            {!selectMode && (
              <>
                <button
                  onClick={handleExportAll}
                  title="Exportar backup CSV"
                  className="flex items-center gap-1.5 border border-slate-200 hover:bg-slate-50 text-slate-600 px-3 py-2 rounded-lg text-sm transition-colors"
                >
                  <Download size={15} />
                  <span className="hidden sm:inline">Backup</span>
                </button>
                <button
                  onClick={() => setSelectMode(true)}
                  title="Selecionar clientes"
                  className="flex items-center gap-1.5 border border-slate-200 hover:bg-slate-50 text-slate-600 px-3 py-2 rounded-lg text-sm transition-colors"
                >
                  <CheckSquare size={15} />
                  <span className="hidden sm:inline">Selecionar</span>
                </button>
                <button
                  onClick={onAddCustomer}
                  className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
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
                  {allSelected ? 'Desmarcar todos' : 'Selecionar todos'}
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
                  onClick={() => setDeleteConfirm({ type: 'multiple' })}
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
          {metricCards.map((card) => (
            <button
              key={card.label}
              onClick={() => {
                if (card.label === 'Total de Clientes') setStatusFilter('all');
                else if (card.label === 'Recente (até 30 dias)') setStatusFilter('green');
                else if (card.label === 'Atenção (90–180 dias)') setStatusFilter('yellow');
                else if (card.label === 'Urgente (+180 dias)') setStatusFilter('red');
                else setStatusFilter('gray');
              }}
              className="bg-white rounded-xl p-4 border border-slate-200 text-left hover:border-amber-300 hover:shadow-sm transition-all"
            >
              <div className={`w-9 h-9 ${card.bg} rounded-lg flex items-center justify-center mb-3`}>
                {'dot' in card && <span className={`w-3 h-3 rounded-full ${card.dot}`} />}
                {!('dot' in card) && <card.icon size={18} className={card.color} />}
              </div>
              <p className="text-2xl font-bold text-slate-800">{card.value}</p>
              <p className="text-xs text-slate-500 mt-0.5">{card.label}</p>
            </button>
          ))}
        </div>

        {/* filters */}
        <div className="bg-white rounded-xl border border-slate-200">
          <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar por nome, telefone, email ou cidade..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Filter size={16} className="text-slate-400" />
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value as ContactStatus | 'all')}
                className="border border-slate-200 rounded-lg text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent bg-white"
              >
                <option value="all">Todos os status</option>
                <option value="green">Recente (até 30 dias)</option>
                <option value="yellow">Atenção (90–180 dias)</option>
                <option value="red">Urgente (+180 dias)</option>
                <option value="gray">Novos</option>
              </select>

              <select
                value={cityFilter}
                onChange={e => setCityFilter(e.target.value)}
                className="border border-slate-200 rounded-lg text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent bg-white"
              >
                <option value="all">Todas as cidades</option>
                {Array.from(new Set(customers.map(c => c.city?.trim()).filter(Boolean))).sort().map(city => (
                  <option key={city} value={city}>{city}</option>
                ))}
              </select>

              <select
                value={segmentFilter}
                onChange={e => setSegmentFilter(e.target.value)}
                className="border border-slate-200 rounded-lg text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent bg-white"
              >
                <option value="all">Todos os segmentos</option>
                {Array.from(new Set(customers.map(c => getCustomerSegment(c)).filter(Boolean))).sort().map(seg => (
                  <option key={seg} value={seg}>{seg}</option>
                ))}
              </select>
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
                {search || statusFilter !== 'all' ? 'Tente ajustar os filtros' : 'Adicione seu primeiro cliente'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filtered.map(customer => {
                const status = getContactStatus(customer.last_contact_at);
                const isSelected = selected.has(customer.id);
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
                        onClick={(e) => { e.stopPropagation(); toggleSelect(customer.id); }}
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
                            {customer.name.charAt(0).toUpperCase()}
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
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-slate-800 truncate">{customer.name}</p>
                        {customer.latitude && customer.longitude ? (
                          <span title="Localização cadastrada">
                            <MapPin size={13} className="text-emerald-500 flex-shrink-0" />
                          </span>
                        ) : (
                          <span title="Localização não cadastrada">
                            <MapPinOff size={13} className="text-slate-300 flex-shrink-0" />
                          </span>
                        )}
                        <span className={`hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${STATUS_COLORS[status]}`}>
                          {getStatusLabel(status)}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-0.5">
                        {customer.phone && (
                          <span className="flex items-center gap-1 text-xs text-slate-500">
                            <Phone size={11} />
                            {customer.phone}
                          </span>
                        )}
                        {customer.city && (
                          <span className="text-xs text-slate-400 hidden sm:inline">{customer.city}{customer.state ? `, ${customer.state}` : ''}</span>
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
                        onClick={(e) => { e.stopPropagation(); setDeleteConfirm({ type: 'single', id: customer.id, name: customer.name }); }}
                        className="text-slate-300 hover:text-red-400 transition-colors flex-shrink-0"
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
          )}
        </div>
      </div>
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm flex flex-col items-center">
            <h3 className="text-lg font-bold text-slate-800 mb-2">Confirmar Exclusão</h3>
            <p className="text-sm text-slate-500 text-center mb-4">
              {deleteConfirm.type === 'single' 
                ? `Excluir o cliente "${deleteConfirm.name}"? Esta ação não pode ser desfeita.`
                : `Excluir ${selected.size} cliente(s)? Esta ação não pode ser desfeita.`
              }
            </p>
            <div className="flex gap-3 w-full">
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 py-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">Cancelar</button>
              <button onClick={() => { 
                if (deleteConfirm.type === 'single' && deleteConfirm.id && deleteConfirm.name) deleteOne(deleteConfirm.id, deleteConfirm.name);
                else deleteSelected();
                setDeleteConfirm(null);
              }} className="flex-1 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600">Sim, excluir</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
