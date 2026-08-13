import { printHtml } from '../utils/print';
import { useState, useEffect, useRef } from 'react';
import {
  Wrench, LogOut, Loader2, ChevronLeft, Clock, CheckCircle2,
  AlertTriangle, Camera, X, Save, FileText, Package, ArrowRight, History,
  MapPin, Phone, User, Wifi, WifiOff, Plus, Trash2, Upload, Edit2, Shield, RefreshCw, Download, Search,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { fetchCompanyConfig, CompanyConfig, EMPTY_CONFIG } from '../lib/companyConfig';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ServiceOrder {
  id: string;
  order_number: number;
  warranty_type?: string | null;
  status: string;
  visit_type: string;
  priority: string;
  diagnosis: string;
  labor_cost: number;
  technician_id: string | null;
  customer_id: string;
  created_at: string;
  updated_at: string;
  equipment_id?: string | null;
  equip_type?: string;
  equip_brand?: string;
  equip_model?: string;
  equip_serial?: string;
  equip_gas?: string;
  equip_voltage?: string;
  customers?: { name: string; phone: string; address: string; city: string };
  user_profiles?: { full_name: string };
}

interface OSPart {
  id?: string;
  service_order_id: string;
  product_id: string | null;
  part_name: string;
  quantity: number;
  unit_price: number;
}

interface Attachment {
  id: string;
  service_order_id: string;
  photo_url: string;
  created_at: string;
}

interface StageHistoryEntry {
  id: string;
  from_status: string;
  to_status: string;
  changed_by_name: string;
  notes: string;
  created_at: string;
}

// ─── Stage flow ───────────────────────────────────────────────────────────────

const TECH_STAGES = [
  'Triagem',
  'Em Diagnóstico',
  'Aguardando Aprovação',
  'Em Manutenção',
  'Concluída',
];

// Stages a technician can advance to from a given status
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  'Triagem':               ['Em Diagnóstico'],
  'Em Diagnóstico':        ['Aguardando Aprovação', 'Em Manutenção'],
  'Aguardando Orçamento':  ['Em Manutenção'],
  'Aguardando Aprovação':  ['Em Manutenção'],
  'Aguardando Peças':      ['Em Manutenção'],
  'Em Manutenção':         ['Concluída'],
};

const STATUS_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
  'Triagem':               { color: 'text-slate-600',  bg: 'bg-slate-100',  label: 'Triagem' },
  'Em Diagnóstico':        { color: 'text-blue-700',   bg: 'bg-blue-100',   label: 'Em Diagnóstico' },
  'Aguardando Aprovação':  { color: 'text-amber-700',  bg: 'bg-amber-100',  label: 'Aguardando Aprovação' },
  'Aguardando Orçamento':  { color: 'text-amber-700',  bg: 'bg-amber-100',  label: 'Aguardando Orçamento' },
  'Aguardando Peças':      { color: 'text-orange-700', bg: 'bg-orange-100', label: 'Aguardando Peças' },
  'Em Manutenção':         { color: 'text-orange-700', bg: 'bg-orange-100', label: 'Em Manutenção' },
  'Concluída':             { color: 'text-green-700',  bg: 'bg-green-100',  label: 'Concluída' },
  'Cancelada':             { color: 'text-red-700',    bg: 'bg-red-100',    label: 'Cancelada' },
};

type View = 'list' | 'detail';

// ─── Main component ───────────────────────────────────────────────────────────

interface TechnicianOSViewProps { embedded?: boolean; }

export default function TechnicianOSView({ embedded }: TechnicianOSViewProps = {}) {
  const { profile, signOut } = useAuth();
  const [view, setView] = useState<View>('list');
  const [orders, setOrders] = useState<ServiceOrder[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<ServiceOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<'mine' | 'all'>('mine');
  const [companyConfig, setCompanyConfig] = useState<CompanyConfig>(EMPTY_CONFIG);
  const [online, setOnline] = useState(navigator.onLine);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    load();
    fetchCompanyConfig().then(setCompanyConfig);
    const handleOnline  = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from('service_orders')
      .select('*, customers(name,phone,address,city), user_profiles(full_name)')
      .not('status', 'in', '("Concluída","Cancelada")')
      .order('created_at', { ascending: false });
    setOrders((data as unknown as ServiceOrder[]) ?? []);
    setLoading(false);
  }

  function openOrder(order: ServiceOrder) {
    setSelectedOrder(order);
    setView('detail');
  }

  function handleStatusChanged(orderId: string, newStatus: string) {
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: newStatus } : o));
    if (selectedOrder?.id === orderId) setSelectedOrder(o => o ? { ...o, status: newStatus } : o);
    // If order is now Concluída/Cancelada, remove from list and go back
    if (['Concluída', 'Cancelada'].includes(newStatus)) {
      setOrders(prev => prev.filter(o => o.id !== orderId));
      setView('list');
    }
  }

  const myOrders  = orders.filter(o => o.technician_id === profile?.id);
  const allOrders = orders;
  const displayed = filterStatus === 'mine' ? myOrders : allOrders;

  const filteredOrders = displayed.filter(o => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    const orderNum = String(o.order_number ?? '');
    const clientName = o.customers?.name?.toLowerCase() ?? '';
    const city = o.customers?.city?.toLowerCase() ?? '';
    const equip = [o.equip_model, o.equip_brand, o.equip_type].filter(Boolean).join(' ').toLowerCase();
    const diagnosis = o.diagnosis?.toLowerCase() ?? '';
    
    return orderNum.includes(query) || 
           clientName.includes(query) || 
           city.includes(query) ||
           equip.includes(query) ||
           diagnosis.includes(query);
  });

  if (view === 'detail' && selectedOrder) {
    return (
      <OSDetailView
        order={selectedOrder}
        profile={profile}
        companyConfig={companyConfig}
        onBack={() => setView('list')}
        onStatusChanged={handleStatusChanged}
        online={online}
        embedded={embedded}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <div className="bg-gradient-to-r from-amber-500 to-amber-600 px-4 pt-safe pt-4 pb-4 sticky top-0 z-10 shadow-md">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
              <Wrench size={18} className="text-white" />
            </div>
            <div>
              <p className="font-bold text-white text-sm leading-tight">Ordens de Serviço</p>
              <p className="text-amber-100 text-xs">{profile?.full_name ?? 'Técnico'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium ${online ? 'bg-white/20 text-white' : 'bg-red-500/40 text-red-100'}`}>
              {online ? <Wifi size={11} /> : <WifiOff size={11} />}
              {online ? 'Online' : 'Offline'}
            </span>
            <button onClick={signOut} className={`w-9 h-9 flex items-center justify-center rounded-xl bg-white/20 text-white ${embedded ? 'hidden' : ''}`}>
              <LogOut size={16} />
            </button>
          </div>
        </div>

        {/* Toggle mine / all */}
        <div className="mt-3 flex gap-1 bg-white/10 rounded-xl p-1">
          {(['mine', 'all'] as const).map(f => (
            <button key={f} onClick={() => setFilterStatus(f)}
              className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors ${filterStatus === f ? 'bg-white text-amber-600' : 'text-white/70'}`}>
              {f === 'mine' ? `Minhas OS (${myOrders.length})` : `Todas (${allOrders.length})`}
            </button>
          ))}
        </div>

        {/* Search bar */}
        <div className="mt-3 relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/60" />
          <input
            type="text"
            placeholder="Buscar por OS, cliente, cidade, modelo..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-8 py-2 bg-white/15 border border-white/20 rounded-xl text-xs text-white placeholder-white/60 focus:outline-none focus:ring-2 focus:ring-white/30 focus:bg-white/20 transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-white/60 hover:text-white"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-auto p-4 space-y-3 pb-24">
        {loading ? (
          <div className="flex justify-center py-20"><Loader2 size={32} className="text-amber-500 animate-spin" /></div>
        ) : filteredOrders.length === 0 ? (
          <div className="text-center py-20">
            <CheckCircle2 size={48} className="mx-auto text-slate-300 mb-4" />
            <p className="text-slate-600 font-semibold">Nenhuma OS encontrada</p>
            <p className="text-slate-400 text-sm mt-1">
              {searchQuery ? 'Tente buscar com outros termos.' : (filterStatus === 'mine' ? 'Não há OS atribuídas a você.' : 'Não há OS abertas.')}
            </p>
          </div>
        ) : (
          filteredOrders.map(order => {
            const st = STATUS_CONFIG[order.status] ?? STATUS_CONFIG['Triagem'];
            
            // Modern gradients for the left badge
            const gradientMap: Record<string, string> = {
              'Triagem':               'from-slate-100 to-slate-200/70 text-slate-700',
              'Em Diagnóstico':        'from-blue-50 to-indigo-100/70 text-blue-800',
              'Aguardando Aprovação':  'from-amber-50 to-amber-100/70 text-amber-800',
              'Aguardando Orçamento':  'from-amber-50 to-amber-100/70 text-amber-800',
              'Aguardando Peças':      'from-orange-50 to-amber-100/60 text-orange-800',
              'Em Manutenção':         'from-orange-50 to-red-100/60 text-orange-800',
              'Concluída':             'from-emerald-50 to-green-100/70 text-emerald-800',
            };
            const leftBg = gradientMap[order.status] ?? 'from-slate-100 to-slate-200/70 text-slate-700';

            const prioBg: Record<string, string> = {
              'Baixa':   'bg-slate-400 text-white',
              'Média':   'bg-amber-500 text-white',
              'Alta':    'bg-orange-500 text-white',
              'Urgente': 'bg-red-600 text-white animate-pulse',
            };
            const leftPrioClass = prioBg[order.priority] ?? 'bg-slate-400 text-white';

            return (
              <button key={order.id} onClick={() => openOrder(order)}
                className="w-full bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden flex flex-row text-left active:scale-[0.99] hover:shadow-md transition-all">
                
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
                    {st.label}
                  </span>
                </div>

                {/* Right section (Atendimento details) */}
                <div className="flex-1 p-3.5 flex flex-col justify-between min-w-0">
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
          })
        )}
      </div>
    </div>
  );
}

// ─── OS Detail View ───────────────────────────────────────────────────────────

interface DetailProps {
  order: ServiceOrder;
  profile: import('../lib/auth').UserProfile | null;
  companyConfig: CompanyConfig;
  onBack: () => void;
  onStatusChanged: (id: string, status: string) => void;
  online: boolean;
  embedded?: boolean;
}

function OSDetailView({ order, profile, companyConfig, onBack, onStatusChanged, online, embedded }: DetailProps) {
  const [parts, setParts] = useState<OSPart[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [stageHistory, setStageHistory] = useState<StageHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [diagnosis, setDiagnosis] = useState(order.diagnosis ?? '');
  const [savingDiag, setSavingDiag] = useState(false);
  const [diagSaved, setDiagSaved] = useState(false);
  const [activeTab, setActiveTab] = useState<'info' | 'diagnosis' | 'parts' | 'photos' | 'history'>('info');
  const [advancingTo, setAdvancingTo] = useState<string | null>(null);
  const [advanceNote, setAdvanceNote] = useState('');
  const [showAdvanceModal, setShowAdvanceModal] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [addingPart, setAddingPart] = useState(false);
  const [newPart, setNewPart] = useState({ part_name: '', quantity: 1, unit_price: 0 });
  const [exportingPDF, setExportingPDF] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { loadDetail(); }, [order.id]);

  async function loadDetail() {
    setLoading(true);
    const [{ data: pData }, { data: aData }, { data: hData }] = await Promise.all([
      supabase.from('service_order_parts').select('*').eq('service_order_id', order.id),
      supabase.from('service_order_attachments').select('*').eq('service_order_id', order.id).order('created_at'),
      supabase.from('os_stage_history').select('*').eq('service_order_id', order.id).order('created_at', { ascending: false }),
    ]);
    setParts((pData as unknown as OSPart[]) ?? []);
    setAttachments((aData as unknown as Attachment[]) ?? []);
    setStageHistory((hData as unknown as StageHistoryEntry[]) ?? []);
    setLoading(false);
  }

  async function saveDiagnosis() {
    if (!diagnosis.trim()) return;
    setSavingDiag(true);
    await supabase.from('service_orders').update({ diagnosis, updated_at: new Date().toISOString() }).eq('id', order.id);
    setSavingDiag(false);
    setDiagSaved(true);
    setTimeout(() => setDiagSaved(false), 2000);
  }

  async function advanceStage(toStatus: string) {
    setAdvancingTo(toStatus);
    const now = new Date().toISOString();
    await supabase.from('service_orders').update({ status: toStatus, updated_at: now }).eq('id', order.id);
    await supabase.from('os_stage_history').insert({
      service_order_id: order.id,
      from_status: order.status,
      to_status: toStatus,
      changed_by_name: profile?.full_name ?? 'Técnico',
      changed_by_id: profile?.id ?? null,
      notes: advanceNote,
    });
    setAdvancingTo(null);
    setShowAdvanceModal(null);
    setAdvanceNote('');
    onStatusChanged(order.id, toStatus);
    setStageHistory(h => [{
      id: now,
      from_status: order.status,
      to_status: toStatus,
      changed_by_name: profile?.full_name ?? 'Técnico',
      notes: advanceNote,
      created_at: now,
    }, ...h]);
  }

  async function uploadPhoto(file: File) {
    setUploadingPhoto(true);
    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
    const path = `${order.id}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('service-order-attachments').upload(path, file, { contentType: file.type });
    if (!error) {
      const { data: urlData } = supabase.storage.from('service-order-attachments').getPublicUrl(path);
      const { data: att } = await supabase.from('service_order_attachments').insert({
        service_order_id: order.id, photo_url: urlData.publicUrl,
      }).select().single();
      if (att) setAttachments(a => [...a, att as unknown as Attachment]);
    } else {
      alert('Erro ao enviar foto: ' + error.message);
    }
    setUploadingPhoto(false);
    if (photoInputRef.current) photoInputRef.current.value = '';
  }

  const handleDownloadPhoto = async (url: string, index: number) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      const extension = url.split('.').pop()?.split('?')[0] || 'jpg';
      const orderNum = order.order_number ? String(order.order_number).padStart(4, '0') : 'OS';
      a.download = `OS_${orderNum}_foto_${index + 1}.${extension}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch (e) {
      console.error(e);
      window.open(url, '_blank');
    }
  };

  async function addPart() {
    if (!newPart.part_name.trim()) return;
    const payload = { service_order_id: order.id, product_id: null, ...newPart };
    const { data } = await supabase.from('service_order_parts').insert(payload).select().single();
    if (data) setParts(p => [...p, data as unknown as OSPart]);
    setNewPart({ part_name: '', quantity: 1, unit_price: 0 });
    setAddingPart(false);
  }

  async function removePart(part: OSPart) {
    if (!part.id) return;
    await supabase.from('service_order_parts').delete().eq('id', part.id);
    setParts(p => p.filter(x => x.id !== part.id));
  }

  function exportPDF() {
    setExportingPDF(true);
    const cfg = companyConfig;
    const totalParts = parts.reduce((s, p) => s + p.quantity * p.unit_price, 0);
    const totalAmount = totalParts + (order.labor_cost ?? 0);

    const logoHtml = cfg.logo_url
      ? `<img src="${cfg.logo_url}" alt="Logo" style="height:48px;object-fit:contain;max-width:120px;" />`
      : '';

    const partsRows = parts.length > 0
      ? parts.map(p => `<tr><td>${p.part_name}</td><td style="text-align:center">${p.quantity}</td><td style="text-align:right">R$ ${p.unit_price.toFixed(2)}</td><td style="text-align:right">R$ ${(p.quantity * p.unit_price).toFixed(2)}</td></tr>`).join('')
      : '<tr><td colspan="4" style="text-align:center;color:#94a3b8">Nenhuma peça registrada</td></tr>';

    const photosHtml = attachments.length > 0
      ? `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:8px;">${attachments.map(a => `<img src="${a.photo_url}" style="width:100%;height:120px;object-fit:cover;border-radius:6px;border:1px solid #e2e8f0;" />`).join('')}</div>`
      : '';

    const pixBlock = (cfg.pix_key || cfg.bank_name) ? `
      <div style="margin-top:8px;padding:8px 12px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;font-size:11px;color:#166534;">
        ${cfg.pix_key ? `<strong>PIX (${cfg.pix_key_type || 'PIX'}):</strong> ${cfg.pix_key}` : ''}
        ${cfg.bank_name ? ` &nbsp;·&nbsp; <strong>Banco:</strong> ${cfg.bank_name}` : ''}
        ${cfg.account_holder ? ` — ${cfg.account_holder}` : ''}
      </div>` : '';

    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/>
<title>OS #${String(order.order_number ?? 0).padStart(4,'0')}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Segoe UI',Arial,sans-serif;font-size:13px;color:#1e293b;padding:24px}
  .hdr{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;padding-bottom:14px;border-bottom:2px solid #f59e0b}
  .sec{margin-bottom:16px} .sec-t{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#94a3b8;margin-bottom:6px}
  .card{border:1px solid #e2e8f0;border-radius:8px;padding:12px 14px}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:8px 20px}
  .item label{font-size:10px;color:#94a3b8;display:block;margin-bottom:1px} .item span{font-weight:600}
  table{width:100%;border-collapse:collapse} th{background:#f8fafc;padding:6px 8px;text-align:left;font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;border-bottom:1px solid #e2e8f0}
  td{padding:6px 8px;border-bottom:1px solid #f1f5f9;font-size:12px}
  .foot{margin-top:24px;padding-top:10px;border-top:1px solid #e2e8f0;font-size:11px;color:#94a3b8;display:flex;justify-content:space-between}
  @media print{body{padding:0}}
</style></head><body>
<div class="hdr">
  <div style="display:flex;align-items:center;gap:10px">
    ${logoHtml}
    <div>
      <div style="font-size:17px;font-weight:800">${cfg.company_name || 'Empresa'}</div>
      ${cfg.cnpj ? `<div style="font-size:10px;color:#64748b">CNPJ: ${cfg.cnpj}</div>` : ''}
      ${cfg.address ? `<div style="font-size:10px;color:#64748b">${cfg.address}</div>` : ''}
      ${cfg.phone ? `<div style="font-size:10px;color:#64748b">${cfg.phone}</div>` : ''}
    </div>
  </div>
  <div style="text-align:right">
    <div style="font-size:20px;font-weight:800">OS #${String(order.order_number ?? 0).padStart(4,'0')}</div>
    <div style="font-size:11px;color:#64748b;margin-top:4px;line-height:1.6">
      <div><strong>Status:</strong> ${order.status}</div>
      <div><strong>Tipo:</strong> ${order.visit_type}</div>
      <div><strong>Emissão:</strong> ${new Date(order.created_at).toLocaleDateString('pt-BR')}</div>
      <div><strong>Técnico:</strong> ${profile?.full_name ?? '—'}</div>
    </div>
  </div>
</div>
<div class="sec">
  <div class="sec-t">Cliente</div>
  <div class="card"><div class="grid">
    <div class="item"><label>Nome</label><span>${order.customers?.name ?? '—'}</span></div>
    <div class="item"><label>Cidade</label><span>${order.customers?.city ?? '—'}</span></div>
    <div class="item"><label>Telefone</label><span>${order.customers?.phone ?? '—'}</span></div>
  </div></div>
</div>
<div class="sec">
  <div class="sec-t">Diagnóstico Técnico</div>
  <div class="card"><p style="white-space:pre-wrap;color:#475569;line-height:1.5">${diagnosis ? diagnosis.replace(/</g,'&lt;') : 'Não informado.'}</p></div>
</div>
<div class="sec">
  <div class="sec-t">Peças e Serviços Indicados</div>
  <div class="card" style="padding:0;overflow:hidden">
    <table>
      <thead><tr><th>Descrição</th><th>Qtd</th><th style="text-align:right">Unit.</th><th style="text-align:right">Total</th></tr></thead>
      <tbody>${partsRows}</tbody>
      <tfoot>
        <tr><td colspan="3" style="text-align:right;font-weight:600">Peças</td><td style="text-align:right;font-weight:600">R$ ${totalParts.toFixed(2)}</td></tr>
        <tr><td colspan="3" style="text-align:right;font-weight:600">Mão de obra</td><td style="text-align:right;font-weight:600">R$ ${(order.labor_cost ?? 0).toFixed(2)}</td></tr>
        <tr><td colspan="3" style="text-align:right;font-size:14px;font-weight:800;color:#16a34a">Total</td><td style="text-align:right;font-size:14px;font-weight:800;color:#16a34a">R$ ${totalAmount.toFixed(2)}</td></tr>
      </tfoot>
    </table>
  </div>
</div>
${photosHtml ? `<div class="sec"><div class="sec-t">Fotos do Atendimento</div>${photosHtml}</div>` : ''}
${pixBlock}
${cfg.pdf_footer ? `<div style="margin-top:12px;font-size:11px;color:#64748b;padding:8px;background:#f8fafc;border-radius:6px">${cfg.pdf_footer}</div>` : ''}
<div class="foot">
  <span>Gerado em ${new Date().toLocaleString('pt-BR')}</span>
  <span>OS #${String(order.order_number ?? 0).padStart(4,'0')} · ${order.customers?.name ?? ''}</span>
</div>
</body></html>`;

    const cleanCustomerName = (order.customers?.name ?? '').replace(/[/\\?%*:|"<>]/g, '').trim();
    printHtml(html, `${String(order.order_number ?? 0).padStart(4, '0')} ${cleanCustomerName}.pdf`);
    setExportingPDF(false);
  }

  const nextStages = ALLOWED_TRANSITIONS[order.status] ?? [];
  const totalParts = parts.reduce((s, p) => s + p.quantity * p.unit_price, 0);
  const totalAmount = totalParts + (order.labor_cost ?? 0);

  const tabs: { id: typeof activeTab; label: string; icon: typeof FileText }[] = [
    { id: 'info',      label: 'Dados',     icon: FileText },
    { id: 'diagnosis', label: 'Diagnóst.', icon: Wrench },
    { id: 'parts',     label: 'Peças',     icon: Package },
    { id: 'photos',    label: 'Fotos',     icon: Camera },
    { id: 'history',   label: 'Histórico', icon: History },
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <div className="bg-gradient-to-r from-amber-500 to-amber-600 px-4 pt-4 pb-3 sticky top-0 z-10 shadow-md">
        <div className="flex items-center gap-3 mb-3">
          <button onClick={onBack} className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/20 text-white">
            <ChevronLeft size={20} />
          </button>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-white text-sm">OS #{String(order.order_number ?? 0).padStart(4,'0')}</p>
            <p className="text-amber-100 text-xs truncate">{order.customers?.name ?? '—'}</p>
          </div>
          <button onClick={exportPDF} disabled={exportingPDF} className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/20 text-white">
            {exportingPDF ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
          </button>
        </div>

        {/* Status + advance */}
        <div className="flex items-center justify-between gap-2">
          {(() => {
            const st = STATUS_CONFIG[order.status] ?? STATUS_CONFIG['Triagem'];
            return <span className={`text-xs font-bold px-3 py-1 rounded-full ${st.bg} ${st.color}`}>{st.label}</span>;
          })()}
          {nextStages.length > 0 && (
            <button onClick={() => setShowAdvanceModal(nextStages[0])}
              className="flex items-center gap-1.5 bg-white text-amber-600 font-bold text-xs px-3 py-1.5 rounded-xl shadow-sm active:scale-95 transition-transform">
              <ArrowRight size={13} />
              {nextStages.length === 1 ? nextStages[0] : 'Avançar'}
            </button>
          )}
        </div>
      </div>

      {/* If multiple next stages, show all */}
      {nextStages.length > 1 && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex gap-2">
          {nextStages.map(ns => (
            <button key={ns} onClick={() => setShowAdvanceModal(ns)}
              className="flex-1 text-xs font-semibold py-2 bg-amber-100 text-amber-700 rounded-xl border border-amber-200 active:scale-95">
              → {ns}
            </button>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="bg-white border-b border-slate-200 overflow-x-auto sticky top-[calc(var(--header-h,90px))] z-[5]">
        <div className="flex min-w-max">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setActiveTab(id)}
              className={`flex flex-col items-center gap-0.5 px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${activeTab === id ? 'border-amber-500 text-amber-600' : 'border-transparent text-slate-400'}`}>
              <Icon size={15} />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-auto pb-24">
        {loading ? (
          <div className="flex justify-center py-20"><Loader2 size={32} className="text-amber-500 animate-spin" /></div>
        ) : (
          <>
            {/* INFO */}
            {activeTab === 'info' && (
              <div className="p-4 space-y-3">
                <InfoCard title="Cliente">
                  <InfoRow label="Nome"     value={order.customers?.name ?? '—'} />
                  <InfoRow label="Telefone" value={order.customers?.phone} link={order.customers?.phone ? `tel:${order.customers.phone}` : undefined} />
                  <InfoRow label="Endereço" value={[order.customers?.address, order.customers?.city].filter(Boolean).join(', ')} />
                </InfoCard>
                <InfoCard title="Ordem de Serviço">
                  <InfoRow label="Tipo"       value={order.visit_type} />
                  <InfoRow label="Prioridade" value={order.priority} />
                  <InfoRow label="Status"     value={order.status} />
                  <InfoRow label="Abertura"   value={new Date(order.created_at).toLocaleDateString('pt-BR')} />
                </InfoCard>
                <InfoCard title="Equipamento">
                  <InfoRow label="Equipamento" value={order.equip_type || '—'} />
                  <InfoRow label="Modelo"      value={order.equip_model || '—'} />
                  <InfoRow label="Fabricante"  value={order.equip_brand || '—'} />
                  <InfoRow label="Nº de Série" value={order.equip_serial || '—'} />
                  <InfoRow label="Voltagem"    value={order.equip_voltage || '—'} />
                  <InfoRow label="Tipo de Gás" value={order.equip_gas || '—'} />
                </InfoCard>
                {(totalParts > 0 || order.labor_cost) && (
                  <InfoCard title="Resumo Financeiro">
                    <InfoRow label="Peças"      value={`R$ ${totalParts.toFixed(2)}`} />
                    <InfoRow label="Mão de obra" value={`R$ ${(order.labor_cost ?? 0).toFixed(2)}`} />
                    <InfoRow label="Total"      value={`R$ ${totalAmount.toFixed(2)}`} bold />
                  </InfoCard>
                )}
              </div>
            )}

            {/* DIAGNOSIS */}
            {activeTab === 'diagnosis' && (
              <div className="p-4 space-y-3">
                <div className="bg-white rounded-2xl border border-slate-200 p-4">
                  <label className="text-xs font-semibold text-slate-500 uppercase block mb-2">Diagnóstico Técnico</label>
                  <textarea
                    rows={8}
                    value={diagnosis}
                    onChange={e => setDiagnosis(e.target.value)}
                    placeholder="Descreva o problema encontrado, causas, procedimentos realizados e recomendações..."
                    className="w-full text-sm text-slate-700 border border-slate-200 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-amber-500/30 resize-none"
                  />
                  <button onClick={saveDiagnosis} disabled={savingDiag || !diagnosis.trim()}
                    className="mt-3 w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-semibold py-3 rounded-xl text-sm transition-colors active:scale-[0.98]">
                    {savingDiag ? <Loader2 size={16} className="animate-spin" /> : diagSaved ? <CheckCircle2 size={16} /> : <Save size={16} />}
                    {savingDiag ? 'Salvando...' : diagSaved ? 'Salvo!' : 'Salvar Diagnóstico'}
                  </button>
                </div>
              </div>
            )}

            {/* PARTS */}
            {activeTab === 'parts' && (
              <div className="p-4 space-y-3">
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700">
                  Peças sugeridas aqui são para aprovação. O estoque só é movimentado após aprovação pelo gestor.
                </div>
                {parts.map((p, i) => (
                  <div key={p.id ?? i} className="bg-white rounded-xl border border-slate-200 p-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-800 text-sm truncate">{p.part_name}</p>
                      <p className="text-xs text-slate-500">{p.quantity}x · R$ {p.unit_price.toFixed(2)} un. = <strong>R$ {(p.quantity * p.unit_price).toFixed(2)}</strong></p>
                    </div>
                    <button onClick={() => removePart(p)} className="p-2 text-red-400 hover:text-red-600 active:scale-90">
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
                {parts.length === 0 && !addingPart && (
                  <p className="text-center text-slate-400 text-sm py-6">Nenhuma peça adicionada.</p>
                )}
                {addingPart ? (
                  <div className="bg-white rounded-xl border border-amber-200 p-4 space-y-3">
                    <input type="text" value={newPart.part_name} onChange={e => setNewPart(f => ({ ...f, part_name: e.target.value }))}
                      placeholder="Nome da peça" className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30" />
                    <div className="grid grid-cols-2 gap-2">
                      <input type="number" min={0} step="any" value={newPart.quantity} onChange={e => setNewPart(f => ({ ...f, quantity: parseFloat(e.target.value) || 0 }))}
                        placeholder="Qtd" className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-amber-500/30" />
                      <input type="number" min={0} step={0.01} value={newPart.unit_price} onChange={e => setNewPart(f => ({ ...f, unit_price: parseFloat(e.target.value) || 0 }))}
                        placeholder="Valor unit." className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-amber-500/30" />
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => setAddingPart(false)} className="flex-1 border border-slate-200 text-slate-600 py-2.5 rounded-xl text-sm font-medium">Cancelar</button>
                      <button onClick={addPart} disabled={!newPart.part_name.trim()} className="flex-1 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white py-2.5 rounded-xl text-sm font-semibold">Adicionar</button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => setAddingPart(true)}
                    className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-amber-300 text-amber-600 font-semibold py-4 rounded-xl text-sm active:scale-[0.98] transition-transform">
                    <Plus size={18} /> Adicionar Peça
                  </button>
                )}
                {parts.length > 0 && (
                  <div className="bg-white rounded-xl border border-slate-200 p-3 flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-600">Total sugerido</span>
                    <span className="text-lg font-extrabold text-green-600">R$ {totalParts.toFixed(2)}</span>
                  </div>
                )}
              </div>
            )}

            {/* PHOTOS */}
            {activeTab === 'photos' && (
              <div className="p-4 space-y-3">
                <button onClick={() => photoInputRef.current?.click()} disabled={uploadingPhoto}
                  className="w-full flex items-center justify-center gap-3 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white font-bold py-5 rounded-2xl text-base transition-colors active:scale-[0.98]">
                  {uploadingPhoto ? <Loader2 size={22} className="animate-spin" /> : <Camera size={22} />}
                  {uploadingPhoto ? 'Enviando...' : 'Tirar Foto / Selecionar'}
                </button>
                <input ref={photoInputRef} type="file" accept="image/*" capture="environment"
                  className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) uploadPhoto(f); }} />

                {attachments.length === 0 ? (
                  <p className="text-center text-slate-400 text-sm py-6">Nenhuma foto anexada.</p>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {attachments.map((a, idx) => (
                      <div key={a.id} className="relative group rounded-xl overflow-hidden border border-slate-200 aspect-square bg-slate-100">
                        <img src={a.photo_url} alt="Foto" className="w-full h-full object-cover cursor-pointer" onClick={() => handleDownloadPhoto(a.photo_url, idx)} />
                        <button
                          onClick={() => handleDownloadPhoto(a.photo_url, idx)}
                          className="absolute bottom-2 right-2 bg-black/60 hover:bg-black/80 text-white rounded-full p-2 transition-colors shadow-md"
                          title="Baixar Foto"
                        >
                          <Download size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* HISTORY */}
            {activeTab === 'history' && (
              <div className="p-4 space-y-2">
                {stageHistory.length === 0 ? (
                  <p className="text-center text-slate-400 text-sm py-6">Nenhuma alteração de etapa registrada.</p>
                ) : (
                  stageHistory.map((h, i) => (
                    <div key={h.id + i} className="bg-white rounded-xl border border-slate-200 p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-semibold text-slate-500">{h.from_status}</span>
                        <ArrowRight size={12} className="text-amber-500 flex-shrink-0" />
                        <span className="text-xs font-bold text-amber-600">{h.to_status}</span>
                      </div>
                      <p className="text-xs text-slate-500 flex items-center gap-1"><User size={11} /> {h.changed_by_name}</p>
                      {h.notes && <p className="text-xs text-slate-400 mt-1 italic">"{h.notes}"</p>}
                      <p className="text-xs text-slate-300 mt-1"><Clock size={10} className="inline mr-1" />{new Date(h.created_at).toLocaleString('pt-BR')}</p>
                    </div>
                  ))
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Advance stage modal */}
      {showAdvanceModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden">
            <div className="px-5 pt-5 pb-3">
              <h2 className="font-bold text-slate-800 text-lg mb-1 flex items-center gap-2">
                <ArrowRight size={18} className="text-amber-500" /> Avançar Etapa
              </h2>
              <p className="text-sm text-slate-500">
                <span className="font-semibold">{order.status}</span> → <span className="font-bold text-amber-600">{showAdvanceModal}</span>
              </p>
            </div>
            <div className="px-5 pb-3">
              <label className="text-xs font-semibold text-slate-500 block mb-1.5">Observação (opcional)</label>
              <textarea rows={3} value={advanceNote} onChange={e => setAdvanceNote(e.target.value)}
                placeholder="Informe o motivo ou observações desta mudança..."
                className="w-full text-sm border border-slate-200 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-amber-500/30 resize-none" />
            </div>
            <div className="px-5 pb-5 flex gap-3">
              <button onClick={() => setShowAdvanceModal(null)} className="flex-1 border border-slate-200 text-slate-600 py-3 rounded-xl text-sm font-medium">Cancelar</button>
              <button onClick={() => advanceStage(showAdvanceModal)} disabled={!!advancingTo}
                className="flex-1 flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white py-3 rounded-xl text-sm font-bold active:scale-[0.98]">
                {advancingTo ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function InfoCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100">
        <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">{title}</p>
      </div>
      <div className="divide-y divide-slate-100">{children}</div>
    </div>
  );
}

function InfoRow({ label, value, bold, link }: { label: string; value?: string; bold?: boolean; link?: string }) {
  if (!value) return null;
  return (
    <div className="px-4 py-3 flex items-start justify-between gap-3">
      <span className="text-xs text-slate-400 flex-shrink-0 w-24">{label}</span>
      {link ? (
        <a href={link} className={`text-sm text-right text-blue-600 underline ${bold ? 'font-bold' : ''}`}>{value}</a>
      ) : (
        <span className={`text-sm text-slate-700 text-right ${bold ? 'font-bold text-green-700 text-base' : ''}`}>{value}</span>
      )}
    </div>
  );
}
