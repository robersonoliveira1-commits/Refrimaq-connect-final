import { useState, useEffect } from 'react';
import { Wrench, Plus, Search, Clock, CheckCircle2, XCircle, Loader2, AlertTriangle, Smartphone, Shield, RefreshCw, ClipboardList, BarChart3, User, MapPin, Package, QrCode } from 'lucide-react';
import { printHtml } from '../utils/print';
import { supabase } from '../lib/supabase';
import TechnicianOSView from './TechnicianOSView';
import WorkshopReportTab from './WorkshopReportTab';
import WorkshopStats from './WorkshopStats';

interface ServiceOrder {
  id: string;
  order_number: number;
  warranty_type?: string | null;
  status: string;
  visit_type: string;
  priority: string;
  diagnosis: string;
  labor_cost: number;
  created_at: string;
  updated_at: string;
  customer_id: string;
  equip_model: string | null;
  equip_serial: string | null;
  equip_type?: string | null;
  equip_brand?: string | null;
  equip_accessories?: string | null;
  equip_condition?: string | null;
  customers?: { name: string; city: string };
  user_profiles?: { full_name: string };
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  'Triagem':               { label: 'Triagem',           color: 'bg-slate-100 text-slate-700',   icon: Clock },
  'Aguardando Orçamento':  { label: 'Orçamento',         color: 'bg-blue-100 text-blue-700',     icon: Clock },
  'Aguardando Peças':      { label: 'Aguardando Peças',  color: 'bg-amber-100 text-amber-700',   icon: AlertTriangle },
  'Em Manutenção':         { label: 'Em Manutenção',     color: 'bg-orange-100 text-orange-700', icon: Wrench },
  'Concluída':             { label: 'Concluída',         color: 'bg-green-100 text-green-700',   icon: CheckCircle2 },
  'Cancelada':             { label: 'Cancelada',         color: 'bg-red-100 text-red-700',       icon: XCircle },
};

const ALL_STATUSES = ['Triagem', 'Aguardando Orçamento', 'Aguardando Peças', 'Em Manutenção', 'Concluída', 'Cancelada'];

type WorkshopTab = 'orders' | 'equipments' | 'mobile' | 'report' | 'stats';

interface Props {
  onMenuClick: () => void;
  onSelectOrder: (id: string) => void;
  onNewOrder: () => void;
  refresh: number;
}

export default function WorkshopPage({ onMenuClick, onSelectOrder, onNewOrder, refresh }: Props) {
  const [workshopTab, setWorkshopTab] = useState<WorkshopTab>('orders');
  const [orders, setOrders] = useState<ServiceOrder[]>([]);
  const [equipments, setEquipments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingEquips, setLoadingEquips] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedEquipHistory, setSelectedEquipHistory] = useState<any[] | null>(null);
  const [viewingEquipName, setViewingEquipName] = useState('');

  useEffect(() => {
    loadOrders();
    loadEquipments();
  }, [refresh]);

  async function loadOrders() {
    setLoading(true);
    const { data } = await supabase
      .from('service_orders')
      .select('*, customers(name, city), user_profiles(full_name)')
      .order('order_number', { ascending: false });
    setOrders((data as unknown as ServiceOrder[]) ?? []);
    setLoading(false);
  }

  async function loadEquipments() {
    setLoadingEquips(true);
    const { data } = await supabase
      .from('customer_equipments')
      .select('*, customers(name, city)')
      .order('created_at', { ascending: false });
    setEquipments(data ?? []);
    setLoadingEquips(false);
  }

  async function viewHistory(equip: any) {
    setViewingEquipName(`${equip.equip_brand} ${equip.equip_model} (S/N: ${equip.equip_serial || '—'})`);
    const { data } = await supabase
      .from('service_orders')
      .select('*, user_profiles(full_name)')
      .eq('equipment_id', equip.id)
      .order('created_at', { ascending: false });
    setSelectedEquipHistory(data ?? []);
  }

  const filtered = orders.filter(o => {
    const matchStatus = statusFilter === 'all' || o.status === statusFilter;
    const q = search.toLowerCase();
    const matchSearch = !q
      || String(o.order_number).includes(q)
      || (o.customers?.name ?? '').toLowerCase().includes(q)
      || (o.customers?.city ?? '').toLowerCase().includes(q)
      || (o.visit_type ?? '').toLowerCase().includes(q)
      || (o.diagnosis ?? '').toLowerCase().includes(q)
      || (o.equip_serial ?? '').toLowerCase().includes(q)
      || (o.equip_model ?? '').toLowerCase().includes(q)
      || (o.equip_brand ?? '').toLowerCase().includes(q)
      || (o.equip_type ?? '').toLowerCase().includes(q)
      || (o.equip_accessories ?? '').toLowerCase().includes(q)
      || (o.equip_condition ?? '').toLowerCase().includes(q)
      || (o.warranty_type ?? '').toLowerCase().includes(q);
    return matchStatus && matchSearch;
  });

  const filteredEquips = equipments.filter(eq => {
    const q = search.toLowerCase().replace('#', '').trim();
    return !q ||
      (eq.id || '').toLowerCase().includes(q) ||
      (eq.customers?.name || '').toLowerCase().includes(q) ||
      (eq.equip_brand || '').toLowerCase().includes(q) ||
      (eq.equip_model || '').toLowerCase().includes(q) ||
      (eq.equip_serial || '').toLowerCase().includes(q) ||
      (eq.equip_type || '').toLowerCase().includes(q);
  });

  const counts = ALL_STATUSES.reduce<Record<string, number>>((acc, s) => {
    acc[s] = orders.filter(o => o.status === s).length;
    return acc;
  }, {});

  function handlePrintQRCode(eq: any, e: React.MouseEvent) {
    e.stopPropagation(); // Avoid triggering viewHistory when clicking print button
    const qrUrl = `${window.location.origin}/?publicEquipmentId=${eq.id}`;
    const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Etiqueta Equipamento</title>
  <style>
    @page { 
      size: 48mm 65mm; 
      margin: 0; 
    }
    html, body {
      margin: 0;
      padding: 0;
      width: 48mm;
      height: auto;
      box-sizing: border-box;
      font-family: sans-serif;
      background-color: #fff;
    }
    .label-card {
      padding: 2mm 1mm 8mm 1mm;
      width: 48mm;
      height: auto;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      margin: 0 auto;
    }
    .header {
      font-weight: bold;
      color: #d97706;
      font-size: 8px;
      width: 100%;
      border-bottom: 0.8px solid #f59e0b;
      padding-bottom: 1.5px;
      margin-top: 0;
      text-transform: uppercase;
      letter-spacing: 0.3px;
      text-align: center;
    }
    .qr-code {
      margin: 1.5mm auto;
      width: 22mm;
      height: 22mm;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .qr-code img {
      width: 100%;
      height: 100%;
    }
    .details {
      text-align: left;
      font-size: 8px;
      color: #374151;
      width: 100%;
      line-height: 1.35;
      margin-top: 1.5mm;
    }
    .details div {
      margin-bottom: 0.8mm;
      word-wrap: break-word;
    }
    .details span {
      font-weight: bold;
      color: #1f2937;
    }
  </style>
</head>
<body>
  <div class="label-card">
    <div class="header">REFRIMAQ CONNECT</div>
    <div class="qr-code">
      <img src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(qrUrl)}" />
    </div>
    <div class="details">
      <div><span>Equipamento:</span> ${eq.equip_type || '—'}</div>
      <div><span>Marca/Mod:</span> ${eq.equip_brand || '—'} / ${eq.equip_model || '—'}</div>
      <div><span>Nº Série:</span> ${eq.equip_serial || '—'}</div>
      <div><span>CPF Máquina:</span> ${eq.id ? eq.id.substring(0, 8).toUpperCase() : '—'}</div>
      <div style="font-size: 7.5px; white-space: normal; line-height: 1.25;"><span>Cliente:</span> ${eq.customers?.name || '—'}</div>
    </div>
  </div>
</body>
</html>
    `;
    printHtml(html, `Etiqueta_Equipamento_${eq.equip_serial || 'S-N'}.pdf`);
  }

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 sm:px-6 py-4">
        <div className="flex items-center gap-3 mb-3">
          <button className="lg:hidden text-slate-500" onClick={onMenuClick}>
            <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-slate-800">Oficina</h1>
          </div>
          {workshopTab === 'orders' && (
            <button
              onClick={onNewOrder}
              className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              <Plus size={16} />
              <span className="hidden sm:inline">Nova OS</span>
            </button>
          )}
        </div>

        {/* Tab switcher */}
        <div className="flex gap-1 bg-slate-100 rounded-xl p-1 mb-3">
          <button
            onClick={() => setWorkshopTab('orders')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-semibold transition-all ${workshopTab === 'orders' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <Wrench size={13} />
            Ordens de Serviço
          </button>
          <button
            onClick={() => setWorkshopTab('equipments')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-semibold transition-all ${workshopTab === 'equipments' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <Package size={13} />
            Equipamentos
          </button>
          <button
            onClick={() => setWorkshopTab('mobile')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-semibold transition-all ${workshopTab === 'mobile' ? 'bg-white text-amber-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <Smartphone size={13} />
            Acesso Mobile
          </button>
          <button
            onClick={() => setWorkshopTab('report')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-semibold transition-all ${workshopTab === 'report' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <ClipboardList size={13} />
            Relatório de OS
          </button>
          <button
            onClick={() => setWorkshopTab('stats')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-semibold transition-all ${workshopTab === 'stats' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <BarChart3 size={13} />
            Estatísticas
          </button>
        </div>

        {/* Orders/Equipments filters */}
        {(workshopTab === 'orders' || workshopTab === 'equipments') && (
          <>
            <div className="relative mb-3">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar por número, cliente, tipo..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-400"
              />
            </div>
            {workshopTab === 'orders' && (
              <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                <button
                  onClick={() => setStatusFilter('all')}
                  className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${statusFilter === 'all' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                >
                  Todas ({orders.length})
                </button>
                {ALL_STATUSES.map(s => (
                  <button
                    key={s}
                    onClick={() => setStatusFilter(s)}
                    className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${statusFilter === s ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                  >
                    {STATUS_CONFIG[s].label} ({counts[s] ?? 0})
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Equipments Tab Content */}
      {workshopTab === 'equipments' && (
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {loadingEquips && (
            <div className="flex items-center justify-center py-16">
              <Loader2 size={28} className="text-amber-500 animate-spin" />
            </div>
          )}
          {!loadingEquips && filteredEquips.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <Package size={40} className="mb-3 opacity-30" />
              <p className="font-medium">Nenhum equipamento cadastrado</p>
            </div>
          )}
          {!loadingEquips && filteredEquips.length > 0 && (
            <div className="space-y-2">
              {filteredEquips.map((eq) => {
                const shortId = eq.id.substring(0, 8).toUpperCase();
                
                return (
                  <button 
                    key={eq.id} 
                    onClick={() => viewHistory(eq)}
                    className="w-full rounded-3xl border overflow-hidden flex flex-row text-left active:scale-[0.99] hover:shadow-md transition-all bg-white border-slate-200/80 shadow-sm"
                  >
                    {/* Left section (Equip Badge/Panel) */}
                    <div className="w-28 sm:w-32 flex-shrink-0 p-3 bg-gradient-to-br from-amber-50 to-amber-100/60 text-amber-900 flex flex-col justify-between items-center text-center border-r border-slate-100">
                      <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-white/80 shadow-sm border border-amber-200/30 text-amber-800 uppercase tracking-wider truncate max-w-full">
                        {eq.equip_type || 'Equipamento'}
                      </span>
                      
                      <div className="my-2">
                        <p className="text-[9px] font-bold text-amber-700/70 uppercase tracking-wider leading-none">CPF Máquina</p>
                        <p className="text-base font-black tracking-tight text-amber-900 mt-1">
                          #{shortId}
                        </p>
                      </div>
                      
                      <span className="text-[9px] font-extrabold px-2 py-1 rounded-full shadow-sm bg-white border border-amber-200/50 text-amber-800 leading-none">
                        Ficha Ativa
                      </span>
                    </div>

                    {/* Right section (Details) */}
                    <div className="flex-1 p-3.5 flex flex-col justify-between min-w-0">
                      <div>
                        {/* Top row: technical characteristics & print button */}
                        <div className="flex items-center justify-between text-[10px] text-slate-400 font-bold mb-1.5 gap-2 uppercase tracking-wider">
                          <span>Gás: {eq.equip_gas || '—'} | Voltagem: {eq.equip_voltage || '—'}</span>
                          <button
                            type="button"
                            onClick={(e) => handlePrintQRCode(eq, e)}
                            className="flex items-center gap-1 bg-amber-50 hover:bg-amber-100 text-amber-700 px-2 py-0.5 rounded-lg border border-amber-200 transition-colors uppercase tracking-wider text-[9px] font-extrabold"
                          >
                            <QrCode size={11} />
                            Imprimir QR
                          </button>
                        </div>

                        {/* Client name */}
                        <h3 className="font-extrabold text-slate-800 text-sm sm:text-base leading-tight mb-2 uppercase tracking-wide truncate">
                          {eq.customers?.name || '—'}
                        </h3>

                        {/* Brand and Model */}
                        <div className="flex items-center gap-2 mb-2 p-1.5 bg-slate-50 rounded-xl border border-slate-100">
                          <div className="w-6 h-6 rounded-lg bg-amber-100 flex items-center justify-center text-amber-600 flex-shrink-0">
                            <Wrench size={12} className="text-amber-600" />
                          </div>
                          <p className="text-xs text-slate-600 font-bold truncate leading-none uppercase">
                            {eq.equip_brand} {eq.equip_model}
                          </p>
                        </div>
                      </div>

                      {/* Bottom row (City and Serial) */}
                      <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-100/80">
                        <span className="text-[10px] text-slate-500 font-bold flex items-center gap-1 flex-shrink-0">
                          <MapPin size={11} className="text-slate-400" />
                          {eq.customers?.city || '—'}
                        </span>
                        <span className="text-[10px] text-slate-500 font-bold flex-1 text-right">
                          S/N: <code className="bg-slate-100 px-1 py-0.5 rounded text-slate-700 font-mono text-[9px]">{eq.equip_serial || '—'}</code>
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Mobile tab content */}
      {workshopTab === 'mobile' && (
        <div className="flex-1 min-h-0 overflow-y-auto">
          <TechnicianOSView embedded />
        </div>
      )}

      {/* Report tab content */}
      {workshopTab === 'report' && (
        <div className="flex-1 min-h-0 overflow-y-auto">
          <WorkshopReportTab />
        </div>
      )}

      {/* Stats tab content */}
      {workshopTab === 'stats' && (
        <div className="flex-1 min-h-0 overflow-y-auto">
          <WorkshopStats refresh={refresh} />
        </div>
      )}

      {/* Orders list content */}
      {workshopTab === 'orders' && (
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {loading && (
            <div className="flex items-center justify-center py-16">
              <Loader2 size={28} className="text-amber-500 animate-spin" />
            </div>
          )}
            {!loading && filtered.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                <Wrench size={40} className="mb-3 opacity-30" />
                <p className="font-medium">Nenhuma OS encontrada</p>
              </div>
            )}
            {!loading && filtered.map(order => {
              const sc = STATUS_CONFIG[order.status] ?? STATUS_CONFIG['Triagem'];
              
              // Modern gradients for the left badge
              const gradientMap: Record<string, string> = {
                'Triagem':               'from-slate-100 to-slate-200/70 text-slate-700',
                'Aguardando Orçamento':  'from-blue-50 to-indigo-100/70 text-blue-800',
                'Aguardando Peças':      'from-orange-50 to-amber-100/60 text-orange-800',
                'Em Manutenção':         'from-orange-50 to-red-100/60 text-orange-800',
                'Concluída':             'from-emerald-50 to-green-100/70 text-emerald-800',
                'Cancelada':             'from-red-50 to-red-100/70 text-red-800',
              };
              const leftBg = gradientMap[order.status] ?? 'from-slate-100 to-slate-200/70 text-slate-700';

              const prioBg: Record<string, string> = {
                'Baixa':   'bg-slate-400 text-white',
                'Média':   'bg-amber-500 text-white',
                'Alta':    'bg-orange-500 text-white',
                'Urgente': 'bg-red-600 text-white animate-pulse',
              };
              const leftPrioClass = prioBg[order.priority] ?? 'bg-slate-400 text-white';

              const isCanceled = order.status === 'Cancelada';
              return (
                <button key={order.id} onClick={() => onSelectOrder(order.id)}
                  className={`w-full rounded-3xl border overflow-hidden flex flex-row text-left active:scale-[0.99] hover:shadow-md transition-all relative ${
                    isCanceled 
                      ? 'bg-red-50/40 border-red-300 shadow-sm shadow-red-100' 
                      : 'bg-white border-slate-200/80 shadow-sm'
                  }`}>
                  
                  {/* Left section (OS badge/panel) */}
                  <div className={`w-28 sm:w-32 flex-shrink-0 p-3 bg-gradient-to-br ${leftBg} flex flex-col justify-between items-center text-center border-r border-slate-100`}>
                    <div className="flex flex-col gap-1 w-full items-center">
                      <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-white/80 shadow-sm border border-slate-200/30 text-slate-600 uppercase tracking-wider truncate max-w-full">
                        {order.visit_type || 'Visita'}
                      </span>
                      <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded uppercase tracking-wider truncate max-w-full ${leftPrioClass}`}>
                        {order.priority}
                      </span>
                    </div>
                    
                    <div className="my-2">
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider leading-none">Ordem</p>
                      <p className="text-base sm:text-lg font-black tracking-tight text-slate-800">
                        #{String(order.order_number ?? 0).padStart(4, '0')}
                      </p>
                    </div>
                    
                    <span className="text-[9px] font-extrabold px-2 py-1 rounded-full shadow-sm bg-white border border-slate-200/50 text-slate-700 truncate max-w-full leading-none">
                      {sc.label}
                    </span>
                  </div>

                  {/* Right section (Atendimento details) */}
                  <div className="flex-1 p-3.5 flex flex-col justify-between min-w-0 relative">
                    {isCanceled && (
                      <div className="absolute top-3 right-3 bg-red-600 text-white text-[9px] font-black px-2 py-0.5 rounded uppercase tracking-wider shadow-sm z-10 border border-red-700">
                        Cancelada
                      </div>
                    )}
                    <div>
                      {/* Top row (Warranty and Tech) */}
                      <div className="flex items-center justify-between text-[10px] text-slate-400 font-bold mb-1.5 gap-2 uppercase tracking-wider">
                        {order.warranty_type ? (
                          <span className="flex items-center gap-0.5 text-amber-600">
                            {order.warranty_type === 'Garantia Memo' ? <Shield size={10} /> : <RefreshCw size={10} />}
                            {order.warranty_type}
                          </span>
                        ) : (
                          <span className="text-slate-400">Sem Garantia</span>
                        )}
                        <span className="truncate flex items-center gap-1 font-semibold text-slate-500">
                          <User size={10} className="text-slate-400" />
                          {order.user_profiles?.full_name || 'Técnico'}
                        </span>
                      </div>

                      {/* Client name */}
                      <h3 className="font-extrabold text-slate-800 text-sm sm:text-base leading-tight mb-2 uppercase tracking-wide truncate">
                        {order.customers?.name ?? '—'}
                      </h3>

                      {/* Equipment Details */}
                      <div className="flex items-center gap-2 mb-2 p-1.5 bg-slate-50 rounded-xl border border-slate-100">
                        <div className="w-6 h-6 rounded-lg bg-amber-100 flex items-center justify-center text-amber-600 flex-shrink-0">
                          <Package size={12} />
                        </div>
                        <p className="text-xs text-slate-600 font-semibold truncate leading-none">
                          {[order.equip_model, order.equip_serial ? `S/N: ${order.equip_serial}` : null].filter(Boolean).join(' - ') || 'Equipamento —'}
                        </p>
                      </div>
                    </div>

                    {/* Bottom row (City and Defect) */}
                    <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-100/80">
                      <span className="text-[10px] text-slate-500 font-bold flex items-center gap-1 flex-shrink-0">
                        <MapPin size={11} className="text-slate-400" />
                        {order.customers?.city || '—'}
                      </span>
                      <span className="text-[10px] text-slate-400 italic truncate flex-1 text-right">
                        {order.diagnosis || 'Sem diagnóstico técnico cadastrado'}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
      )}

      {/* Equipment History Modal */}
      {selectedEquipHistory !== null && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh]">
            {/* Header */}
            <div className="bg-slate-900 px-6 py-4 flex items-center justify-between text-white border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Wrench size={20} className="text-amber-500" />
                <div>
                  <h3 className="font-bold text-base leading-tight">Histórico de Manutenções</h3>
                  <p className="text-[10px] text-slate-400 mt-0.5">{viewingEquipName}</p>
                </div>
              </div>
              <button 
                onClick={() => setSelectedEquipHistory(null)}
                className="text-white/80 hover:text-white transition-colors"
              >
                <XCircle size={20} />
              </button>
            </div>

            {/* List */}
            <div className="p-6 overflow-y-auto flex-1 space-y-4">
              {selectedEquipHistory.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                  <ClipboardList size={32} className="mx-auto mb-2 opacity-30" />
                  <p className="font-medium">Nenhuma ordem de serviço registrada para esta máquina</p>
                </div>
              ) : (
                <div className="space-y-4 relative before:absolute before:inset-y-1 before:left-4 before:w-0.5 before:bg-slate-100">
                  {selectedEquipHistory.map((os) => {
                    const date = new Date(os.created_at).toLocaleDateString('pt-BR');
                    return (
                      <div key={os.id} className="relative pl-8">
                        {/* Timeline bubble */}
                        <div className="absolute left-2.5 top-1.5 w-3.5 h-3.5 rounded-full border-2 border-amber-500 bg-white -translate-x-1/2 flex items-center justify-center">
                          <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                        </div>

                        {/* OS Card */}
                        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 shadow-sm">
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <div>
                              <span className="text-[10px] font-bold text-slate-500">OS #{String(os.order_number).padStart(4, '0')}</span>
                              <h4 className="font-bold text-slate-800 text-sm mt-0.5">{os.visit_type} ({os.status})</h4>
                            </div>
                            <span className="text-[10px] font-semibold text-slate-400">{date}</span>
                          </div>
                          
                          {os.diagnosis && (
                            <div className="text-xs text-slate-600 bg-white border border-slate-100 rounded-xl p-2.5 mt-2">
                              <span className="font-bold text-slate-700 block mb-0.5">Laudo / Diagnóstico:</span>
                              {os.diagnosis}
                            </div>
                          )}

                          <div className="text-[10px] text-slate-400 font-medium mt-3 flex items-center gap-1">
                            <span>Técnico:</span>
                            <span className="font-bold text-slate-600">{os.user_profiles?.full_name || 'Não atribuído'}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="bg-slate-50 px-6 py-4 flex justify-end border-t border-slate-100">
              <button
                onClick={() => setSelectedEquipHistory(null)}
                className="px-5 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
