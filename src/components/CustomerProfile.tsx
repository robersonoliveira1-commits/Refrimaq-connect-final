import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, Phone, Mail, MapPin, FileText, Package, MessageSquare,
  Plus, Edit2, Trash2, Calendar, CheckCircle, PhoneCall, MessageCircle,
  AtSign, Navigation, MoreHorizontal, Shield, Wrench, ShoppingCart,
  ExternalLink, QrCode, Copy, Check, Tag, RotateCcw
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import {
  Customer, CustomerProduct, Contact, ContactSchedule, Product,
  getContactStatus, getStatusLabel, formatDate, formatDateTime, daysSince
} from '../lib/types';
import { calculateOrderFinancials, OSPartLike } from '../lib/osCalculations';
import {
  extractCustomerSegment,
  stripSegmentTagFromNotes,
  buildWhatsAppHref,
  buildGoogleMapsHref,
  computeLatestContactAt,
  matchesEquipmentOrder,
  getLocalTodayFileStamp,
} from '../lib/customersEngine';
import Header from './Header';

const CONTACT_TYPE_ICONS: Record<string, React.ReactNode> = {
  phone: <PhoneCall size={14} />,
  whatsapp: <MessageCircle size={14} />,
  email: <AtSign size={14} />,
  visit: <Navigation size={14} />,
  other: <MoreHorizontal size={14} />,
};

const CONTACT_TYPE_COLORS: Record<string, string> = {
  phone: 'bg-blue-100 text-blue-700',
  whatsapp: 'bg-emerald-100 text-emerald-700',
  email: 'bg-violet-100 text-violet-700',
  visit: 'bg-orange-100 text-orange-700',
  other: 'bg-slate-100 text-slate-600',
};

const CONTACT_TYPE_LABELS: Record<string, string> = {
  phone: 'Telefone',
  whatsapp: 'WhatsApp',
  email: 'E-mail',
  visit: 'Visita',
  other: 'Outro',
};

const STATUS_BADGE: Record<string, string> = {
  green: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  yellow: 'bg-amber-100 text-amber-700 border-amber-200',
  red: 'bg-red-100 text-red-700 border-red-200',
  gray: 'bg-slate-100 text-slate-600 border-slate-200',
};

interface CustomerEquipment {
  id: string;
  customer_id: string;
  equip_type: string;
  equip_brand: string;
  equip_model: string;
  equip_serial: string;
  equip_gas: string;
  equip_voltage: string;
  created_at?: string;
}

interface ProfileOrderRow {
  id: string;
  order_number: number;
  visit_type: string;
  status: string;
  status_financeiro?: string | null;
  paid_at?: string | null;
  labor_cost?: number | null;
  diagnosis?: string | null;
  equipment_id?: string | null;
  equip_serial?: string | null;
  created_at: string;
}

interface ProfileSaleRow {
  id: string;
  service_order_id?: string | null;
  total: number;
  payment_method?: string | null;
  status?: string | null;
  notes?: string | null;
  created_at: string;
}

interface ProfileBudgetRow {
  id: string;
  total: number;
  items?: unknown;
  created_at: string;
}

interface CustomerProfileProps {
  customerId: string;
  onBack: () => void;
  onAddContact: (customerId: string, customerName: string) => void;
  onEditCustomer: (customer: Customer) => void;
  onOpenOrder?: (orderId: string) => void;
  onMenuClick: () => void;
  refresh: number;
}

const BLANK_PRODUCT_FORM = {
  id: '',
  product_name: '',
  purchase_date: '',
  invoice_number: '',
  warranty_start: '',
  warranty_end: '',
  notes: '',
};

const BLANK_EQUIP_FORM = {
  id: '',
  equip_type: '',
  equip_brand: '',
  equip_model: '',
  equip_serial: '',
  equip_gas: '',
  equip_voltage: '',
};

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export default function CustomerProfile({
  customerId,
  onBack,
  onAddContact,
  onEditCustomer,
  onOpenOrder,
  onMenuClick,
  refresh,
}: CustomerProfileProps) {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [products, setProducts] = useState<CustomerProduct[]>([]);
  const [catalogProducts, setCatalogProducts] = useState<Product[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [schedules, setSchedules] = useState<ContactSchedule[]>([]);
  const [orders, setOrders] = useState<ProfileOrderRow[]>([]);
  const [orderPartsMap, setOrderPartsMap] = useState<Record<string, OSPartLike[]>>({});
  const [sales, setSales] = useState<ProfileSaleRow[]>([]);
  const [budgets, setBudgets] = useState<ProfileBudgetRow[]>([]);
  const [equipments, setEquipments] = useState<CustomerEquipment[]>([]);
  const [selectedEquipId, setSelectedEquipId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState('');

  // Tabs & subfilters
  const [activeTab, setActiveTab] = useState<'contacts' | 'products' | 'equipments' | 'schedules'>('contacts');
  const [historyFilter, setHistoryFilter] = useState<'all' | 'contact' | 'order' | 'sale' | 'budget'>('all');
  const [scheduleFilter, setScheduleFilter] = useState<'pending' | 'completed' | 'all'>('pending');

  // Confirmation dialogs
  const [deleteContactId, setDeleteContactId] = useState<string | null>(null);
  const [deleteProductId, setDeleteProductId] = useState<string | null>(null);

  // Product CRUD modal state
  const [showProductForm, setShowProductForm] = useState(false);
  const [productForm, setProductForm] = useState(BLANK_PRODUCT_FORM);
  const [savingProduct, setSavingProduct] = useState(false);

  // Equipment CRUD modal state
  const [showEquipForm, setShowEquipForm] = useState(false);
  const [equipForm, setEquipForm] = useState(BLANK_EQUIP_FORM);
  const [savingEquip, setSavingEquip] = useState(false);
  const [copiedQrId, setCopiedQrId] = useState<string | null>(null);

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId, refresh]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const eqId = params.get('equipmentId');
    if (eqId) {
      setActiveTab('equipments');
      setSelectedEquipId(eqId);
      const cleanUrl = window.location.origin + window.location.pathname;
      window.history.replaceState({}, document.title, cleanUrl);
    }
  }, [equipments]);

  async function loadAll() {
    setLoading(true);
    setActionError('');
    const [
      customerRes,
      productsRes,
      contactsRes,
      schedulesRes,
      ordersRes,
      salesRes,
      budgetsRes,
      equipmentsRes,
      catalogRes,
    ] = await Promise.all([
      supabase.from('customers').select('*').eq('id', customerId).maybeSingle(),
      supabase.from('customer_products').select('*').eq('customer_id', customerId).order('purchase_date', { ascending: false }),
      supabase.from('contacts').select('*').eq('customer_id', customerId).order('contacted_at', { ascending: false }),
      supabase.from('contact_schedules').select('*').eq('customer_id', customerId).order('scheduled_at', { ascending: false }),
      supabase.from('service_orders').select('*').eq('customer_id', customerId).order('created_at', { ascending: false }),
      supabase.from('sales').select('*').eq('customer_id', customerId).order('created_at', { ascending: false }),
      supabase.from('sales_budgets').select('*').eq('customer_id', customerId).order('created_at', { ascending: false }),
      supabase.from('customer_equipments').select('*').eq('customer_id', customerId).order('created_at', { ascending: false }),
      supabase.from('products').select('id, name, category, description, unit_price, stock_quantity, created_at').eq('active', true).order('name').limit(1000),
    ]);

    if (customerRes.data) setCustomer(customerRes.data as Customer);
    if (productsRes.data) setProducts(productsRes.data as CustomerProduct[]);
    if (contactsRes.data) setContacts(contactsRes.data as Contact[]);
    if (schedulesRes.data) setSchedules(schedulesRes.data as ContactSchedule[]);
    if (salesRes.data) setSales(salesRes.data as ProfileSaleRow[]);
    if (budgetsRes.data) setBudgets(budgetsRes.data as ProfileBudgetRow[]);
    if (catalogRes.data) setCatalogProducts(catalogRes.data as Product[]);

    const loadedOrders = (ordersRes.data ?? []) as ProfileOrderRow[];
    setOrders(loadedOrders);

    // Load service_order_parts to compute accurate unified OS totals
    if (loadedOrders.length > 0) {
      const orderIds = loadedOrders.map(o => o.id);
      const { data: partsData } = await supabase
        .from('service_order_parts')
        .select('service_order_id, product_id, quantity, unit_price')
        .in('service_order_id', orderIds);
      const grouped: Record<string, OSPartLike[]> = {};
      if (partsData) {
        for (const p of partsData as Array<OSPartLike & { service_order_id: string }>) {
          if (!grouped[p.service_order_id]) grouped[p.service_order_id] = [];
          grouped[p.service_order_id].push(p);
        }
      }
      setOrderPartsMap(grouped);
    } else {
      setOrderPartsMap({});
    }

    if (equipmentsRes.data) {
      const eqList = equipmentsRes.data as CustomerEquipment[];
      setEquipments(eqList);
      if (eqList.length > 0 && (!selectedEquipId || !eqList.some(e => e.id === selectedEquipId))) {
        setSelectedEquipId(eqList[0].id);
      } else if (eqList.length === 0) {
        setSelectedEquipId(null);
      }
    }

    setLoading(false);
  }

  async function deleteContact(id: string) {
    setActionError('');
    const { error } = await supabase.from('contacts').delete().eq('id', id);
    if (error) {
      setActionError(`Erro ao excluir contato: ${error.message}`);
      return;
    }

    // Recalculate customer.last_contact_at from remaining contacts (SQL trigger only runs on INSERT)
    const remaining = contacts.filter(c => c.id !== id);
    const nextLastContactAt = computeLatestContactAt(remaining);
    const { error: updateErr } = await supabase
      .from('customers')
      .update({ last_contact_at: nextLastContactAt })
      .eq('id', customerId);

    if (updateErr) {
      setActionError(`Contato excluído, mas erro ao atualizar último contato: ${updateErr.message}`);
    }
    loadAll();
  }

  async function toggleScheduleCompleted(schedule: ContactSchedule) {
    setActionError('');
    const { error } = await supabase
      .from('contact_schedules')
      .update({ completed: !schedule.completed })
      .eq('id', schedule.id);
    if (error) {
      setActionError(`Erro ao atualizar agendamento: ${error.message}`);
      return;
    }
    loadAll();
  }

  // ── Customer Products CRUD ───────────────────────────────────────────────
  function openNewProductForm() {
    setProductForm(BLANK_PRODUCT_FORM);
    setShowProductForm(true);
    setActionError('');
  }

  function openEditProductForm(p: CustomerProduct) {
    setProductForm({
      id: p.id,
      product_name: p.product_name ?? '',
      purchase_date: p.purchase_date ?? '',
      invoice_number: p.invoice_number ?? '',
      warranty_start: p.warranty_start ?? '',
      warranty_end: p.warranty_end ?? '',
      notes: p.notes ?? '',
    });
    setShowProductForm(true);
    setActionError('');
  }

  async function saveProductForm(e: React.FormEvent) {
    e.preventDefault();
    const trimmedName = productForm.product_name.trim();
    if (!trimmedName) {
      setActionError('Informe o nome do produto.');
      return;
    }
    setSavingProduct(true);
    setActionError('');

    const catalogMatch = catalogProducts.find(
      cp => cp.name.trim().toLowerCase() === trimmedName.toLowerCase()
    );

    const payload = {
      customer_id: customerId,
      product_id: catalogMatch?.id ?? null,
      product_name: trimmedName,
      purchase_date: productForm.purchase_date || null,
      invoice_number: productForm.invoice_number.trim(),
      warranty_start: productForm.warranty_start || null,
      warranty_end: productForm.warranty_end || null,
      notes: productForm.notes.trim(),
    };

    const res = productForm.id
      ? await supabase.from('customer_products').update(payload).eq('id', productForm.id)
      : await supabase.from('customer_products').insert(payload);

    setSavingProduct(false);
    if (res.error) {
      setActionError(`Erro ao salvar produto: ${res.error.message}`);
      return;
    }

    setShowProductForm(false);
    setProductForm(BLANK_PRODUCT_FORM);
    loadAll();
  }

  async function deleteCustomerProduct(id: string) {
    setActionError('');
    const { error } = await supabase.from('customer_products').delete().eq('id', id);
    if (error) {
      setActionError(`Erro ao excluir produto: ${error.message}`);
      return;
    }
    loadAll();
  }

  // ── Customer Equipments CRUD ─────────────────────────────────────────────
  function openNewEquipForm() {
    setEquipForm(BLANK_EQUIP_FORM);
    setShowEquipForm(true);
    setActionError('');
  }

  function openEditEquipForm(eq: CustomerEquipment) {
    setEquipForm({
      id: eq.id,
      equip_type: eq.equip_type ?? '',
      equip_brand: eq.equip_brand ?? '',
      equip_model: eq.equip_model ?? '',
      equip_serial: eq.equip_serial ?? '',
      equip_gas: eq.equip_gas ?? '',
      equip_voltage: eq.equip_voltage ?? '',
    });
    setShowEquipForm(true);
    setActionError('');
  }

  async function saveEquipForm(e: React.FormEvent) {
    e.preventDefault();
    if (!equipForm.equip_type.trim() && !equipForm.equip_brand.trim() && !equipForm.equip_model.trim()) {
      setActionError('Preencha pelo menos tipo, marca ou modelo do equipamento.');
      return;
    }
    setSavingEquip(true);
    setActionError('');

    const payload = {
      customer_id: customerId,
      equip_type: equipForm.equip_type.trim(),
      equip_brand: equipForm.equip_brand.trim(),
      equip_model: equipForm.equip_model.trim(),
      equip_serial: equipForm.equip_serial.trim(),
      equip_gas: equipForm.equip_gas.trim(),
      equip_voltage: equipForm.equip_voltage.trim(),
    };

    const res = equipForm.id
      ? await supabase.from('customer_equipments').update(payload).eq('id', equipForm.id).select('id').single()
      : await supabase.from('customer_equipments').insert(payload).select('id').single();

    setSavingEquip(false);
    if (res.error) {
      setActionError(`Erro ao salvar equipamento: ${res.error.message}`);
      return;
    }

    if (res.data?.id) setSelectedEquipId(res.data.id);
    setShowEquipForm(false);
    setEquipForm(BLANK_EQUIP_FORM);
    loadAll();
  }

  function getPublicQrUrl(equipId: string): string {
    return `${window.location.origin}/?publicEquipmentId=${equipId}`;
  }

  async function copyPublicQrUrl(equipId: string) {
    try {
      await navigator.clipboard.writeText(getPublicQrUrl(equipId));
      setCopiedQrId(equipId);
      setTimeout(() => setCopiedQrId(prev => (prev === equipId ? null : prev)), 2000);
    } catch {
      window.open(getPublicQrUrl(equipId), '_blank', 'noopener,noreferrer');
    }
  }

  // Deduplicate legacy sales linked to OS (same rule as Financeiro)
  const standaloneSales = useMemo(
    () => sales.filter(s => !s.service_order_id),
    [sales]
  );

  const pendingSchedules = useMemo(
    () => schedules.filter(s => !s.completed).sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()),
    [schedules]
  );

  const completedSchedules = useMemo(
    () => schedules.filter(s => s.completed),
    [schedules]
  );

  const visibleSchedules = useMemo(() => {
    if (scheduleFilter === 'pending') return pendingSchedules;
    if (scheduleFilter === 'completed') return completedSchedules;
    return schedules;
  }, [schedules, pendingSchedules, completedSchedules, scheduleFilter]);

  const historyItems = useMemo(() => {
    const items = [
      ...contacts.map(c => ({ type: 'contact' as const, date: c.contacted_at, data: c })),
      ...orders.map(o => ({ type: 'order' as const, date: o.created_at, data: o })),
      ...standaloneSales.map(s => ({ type: 'sale' as const, date: s.created_at, data: s })),
      ...budgets.map(b => ({ type: 'budget' as const, date: b.created_at, data: b })),
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    if (historyFilter === 'all') return items;
    return items.filter(item => item.type === historyFilter);
  }, [contacts, orders, standaloneSales, budgets, historyFilter]);

  const totalHistoryCount = contacts.length + orders.length + standaloneSales.length + budgets.length;
  const todayKey = getLocalTodayFileStamp();

  if (loading) {
    return (
      <div className="flex flex-col h-full">
        <Header title="Carregando..." onMenuClick={onMenuClick} />
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="flex flex-col h-full">
        <Header title="Cliente não encontrado" onMenuClick={onMenuClick} />
        <div className="flex-1 flex items-center justify-center">
          <button onClick={onBack} className="text-amber-600 hover:underline text-sm">Voltar</button>
        </div>
      </div>
    );
  }

  const status = getContactStatus(customer.last_contact_at);
  const segment = extractCustomerSegment(customer);
  const cleanNotes = stripSegmentTagFromNotes(customer.notes);
  const whatsAppHref = buildWhatsAppHref(customer);
  const mapsHref = buildGoogleMapsHref(customer);
  const selectedEquip = equipments.find(e => e.id === selectedEquipId) ?? null;

  return (
    <div className="flex flex-col h-full">
      <Header
        title={customer.name}
        subtitle={`${customer.city ? customer.city + (customer.state ? `, ${customer.state}` : '') : 'Sem localização'}`}
        onMenuClick={onMenuClick}
        actions={
          <div className="flex gap-2">
            <button
              onClick={() => onEditCustomer(customer)}
              className="flex items-center gap-1.5 border border-slate-200 hover:bg-slate-50 text-slate-600 px-3 py-1.5 rounded-lg text-sm transition-colors"
            >
              <Edit2 size={14} />
              <span className="hidden sm:inline">Editar</span>
            </button>
            <button
              onClick={() => onAddContact(customerId, customer.name)}
              className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
            >
              <Plus size={14} />
              <span className="hidden sm:inline">Registrar Contato</span>
            </button>
          </div>
        }
      />

      <div className="flex-1 overflow-auto p-4 sm:p-6 space-y-4">
        {/* back button */}
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors"
        >
          <ArrowLeft size={16} />
          Voltar para a lista
        </button>

        {actionError && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3 flex items-center justify-between gap-2">
            <span>{actionError}</span>
            <button onClick={() => setActionError('')} className="text-red-500 hover:text-red-700 text-xs font-semibold">
              Fechar
            </button>
          </div>
        )}

        {/* customer info card */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-amber-700 font-bold text-xl">
                {customer.name.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-bold text-slate-800">{customer.name}</h2>
                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${STATUS_BADGE[status]}`}>
                  {getStatusLabel(status)} — {daysSince(customer.last_contact_at)}
                </span>
                {segment && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
                    <Tag size={11} />
                    {segment}
                  </span>
                )}
              </div>

              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                {customer.phone && (
                  <a href={`tel:${customer.phone}`} className="flex items-center gap-2 text-sm text-slate-600 hover:text-amber-600 transition-colors">
                    <Phone size={14} className="text-slate-400 shrink-0" />
                    {customer.phone}
                  </a>
                )}
                {whatsAppHref && (
                  <a
                    href={whatsAppHref}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 text-sm text-emerald-700 hover:text-emerald-800 font-medium transition-colors"
                  >
                    <MessageCircle size={14} className="text-emerald-500 shrink-0" />
                    {customer.whatsapp || customer.phone} (WhatsApp)
                  </a>
                )}
                {customer.email && (
                  <a href={`mailto:${customer.email}`} className="flex items-center gap-2 text-sm text-slate-600 hover:text-amber-600 transition-colors">
                    <Mail size={14} className="text-slate-400 shrink-0" />
                    {customer.email}
                  </a>
                )}
                {(customer.address || customer.city) && (
                  <div className="flex items-center gap-2 text-sm text-slate-600 flex-wrap">
                    <MapPin size={14} className="text-slate-400 shrink-0" />
                    <span>{[customer.address, customer.city, customer.state, customer.zip_code].filter(Boolean).join(', ')}</span>
                    {mapsHref && (
                      <a
                        href={mapsHref}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-semibold text-amber-600 hover:text-amber-700 hover:underline"
                      >
                        <ExternalLink size={11} /> Maps
                      </a>
                    )}
                  </div>
                )}
                {customer.document && (
                  <span className="flex items-center gap-2 text-sm text-slate-600 font-mono">
                    <FileText size={14} className="text-slate-400 shrink-0" />
                    {customer.document}
                  </span>
                )}
              </div>

              {Array.isArray(customer.equipment_types) && customer.equipment_types.length > 0 && (
                <div className="mt-5 pt-4 border-t border-slate-100">
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2.5 flex items-center gap-1.5">
                    <Wrench className="h-3.5 w-3.5 text-amber-500" />
                    Tipos de Equipamento
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {customer.equipment_types.map(eq => (
                      <span key={eq} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-100 text-slate-700 text-xs font-medium border border-slate-200">
                        {eq}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {cleanNotes && (
                <p className="mt-3 text-sm text-slate-600 bg-slate-50 rounded-lg p-3 whitespace-pre-line">{cleanNotes}</p>
              )}
            </div>
          </div>
        </div>

        {/* compact pending schedule alert (links directly to Agendamentos tab, avoiding duplication) */}
        {pendingSchedules.length > 0 && activeTab !== 'schedules' && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 text-sm text-amber-900 min-w-0">
              <Calendar size={16} className="text-amber-600 shrink-0" />
              <p className="truncate">
                <strong>{pendingSchedules.length} agendamento(s) pendente(s)</strong>
                {' — próximo em '}
                <span className="font-semibold">{formatDateTime(pendingSchedules[0].scheduled_at)}</span>
                {pendingSchedules[0].notes ? ` (${pendingSchedules[0].notes})` : ''}
              </p>
            </div>
            <button
              onClick={() => { setActiveTab('schedules'); setScheduleFilter('pending'); }}
              className="text-xs font-semibold text-amber-800 bg-white border border-amber-300 hover:bg-amber-100 px-3 py-1.5 rounded-lg shrink-0 transition-colors"
            >
              Ver agendamentos
            </button>
          </div>
        )}

        {/* tabs */}
        <div className="bg-white rounded-xl border border-slate-200">
          <div className="flex border-b border-slate-100 overflow-x-auto">
            {[
              { key: 'contacts', label: 'Histórico Geral', count: totalHistoryCount },
              { key: 'products', label: 'Produtos', count: products.length },
              { key: 'equipments', label: 'Equipamentos (Oficina)', count: equipments.length },
              { key: 'schedules', label: 'Agendamentos', count: pendingSchedules.length },
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key as typeof activeTab)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === tab.key
                    ? 'border-amber-500 text-amber-600'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                {tab.label}
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                  activeTab === tab.key ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'
                }`}>
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          {/* ── TAB 1: Histórico Geral ─────────────────────────────────────── */}
          {activeTab === 'contacts' && (
            <div>
              {totalHistoryCount > 0 && (
                <div className="px-4 py-2.5 border-b border-slate-100 flex flex-wrap gap-1.5 bg-slate-50/60">
                  {[
                    { key: 'all', label: `Todos (${totalHistoryCount})` },
                    { key: 'contact', label: `Contatos (${contacts.length})` },
                    { key: 'order', label: `OS (${orders.length})` },
                    { key: 'sale', label: `Vendas (${standaloneSales.length})` },
                    { key: 'budget', label: `Orçamentos (${budgets.length})` },
                  ].map(f => (
                    <button
                      key={f.key}
                      onClick={() => setHistoryFilter(f.key as typeof historyFilter)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                        historyFilter === f.key
                          ? 'bg-amber-500 text-white'
                          : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              )}

              {historyItems.length === 0 ? (
                <div className="p-10 text-center">
                  <MessageSquare size={36} className="text-slate-300 mx-auto mb-3" />
                  <p className="text-slate-500 font-medium">Nenhum registro encontrado nesta categoria</p>
                  <button
                    onClick={() => onAddContact(customerId, customer.name)}
                    className="mt-3 text-amber-600 hover:underline text-sm"
                  >
                    Registrar novo contato
                  </button>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {historyItems.map((item, idx) => {
                    if (item.type === 'contact') {
                      const contact = item.data;
                      return (
                        <div key={`contact-${contact.id}-${idx}`} className="p-4 hover:bg-slate-50 transition-colors">
                          <div className="flex items-start gap-3">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${CONTACT_TYPE_COLORS[contact.contact_type] || CONTACT_TYPE_COLORS.other}`}>
                              {CONTACT_TYPE_ICONS[contact.contact_type] || CONTACT_TYPE_ICONS.other}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${CONTACT_TYPE_COLORS[contact.contact_type] || CONTACT_TYPE_COLORS.other}`}>
                                  {CONTACT_TYPE_LABELS[contact.contact_type] || 'Outro'}
                                </span>
                                <span className="text-xs text-slate-400">{formatDateTime(contact.contacted_at)}</span>
                                {contact.contacted_by && (
                                  <span className="text-xs text-slate-400">por {contact.contacted_by}</span>
                                )}
                              </div>
                              <p className="mt-1.5 font-medium text-slate-700 text-sm">{contact.subject}</p>
                              {contact.details && (
                                <p className="mt-1 text-sm text-slate-500 leading-relaxed whitespace-pre-line">{contact.details}</p>
                              )}
                              {contact.comprovante_url && (
                                <a href={contact.comprovante_url} target="_blank" rel="noopener noreferrer"
                                  className="mt-2 inline-block rounded-lg overflow-hidden border border-slate-200 hover:border-amber-400 transition-colors">
                                  <img src={contact.comprovante_url} alt="Comprovante" className="w-24 h-24 object-cover" />
                                </a>
                              )}
                              {contact.next_contact_at && (
                                <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 rounded-lg px-2.5 py-1.5 w-fit">
                                  <Calendar size={11} />
                                  Próximo contato: {formatDateTime(contact.next_contact_at)}
                                  {contact.next_contact_notes && ` — ${contact.next_contact_notes}`}
                                </div>
                              )}
                            </div>
                            <button
                              onClick={() => setDeleteContactId(contact.id)}
                              title="Excluir contato"
                              className="text-slate-300 hover:text-red-500 transition-colors flex-shrink-0 p-1"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      );
                    }

                    if (item.type === 'order') {
                      const o = item.data;
                      const financials = calculateOrderFinancials(orderPartsMap[o.id] ?? [], o.labor_cost, true);
                      const isPaid = o.status_financeiro === 'pago' || Boolean(o.paid_at);
                      return (
                        <div key={`order-${o.id}-${idx}`} className="p-4 hover:bg-slate-50 transition-colors">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="flex items-start gap-3">
                              <div className="w-8 h-8 bg-amber-100 text-amber-700 rounded-full flex items-center justify-center flex-shrink-0">
                                <Wrench size={14} />
                              </div>
                              <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">OS</span>
                                  <p className="font-bold text-slate-800 text-sm">
                                    #{String(o.order_number ?? 0).padStart(4, '0')} - {o.visit_type}
                                  </p>
                                  <span className="text-xs text-slate-400">{formatDateTime(o.created_at)}</span>
                                </div>
                                {o.diagnosis && <p className="text-sm text-slate-600 mt-1">{o.diagnosis}</p>}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 flex-wrap sm:justify-end shrink-0">
                              <span className="text-sm font-bold text-slate-800 tabular-nums">
                                {BRL.format(financials.grandTotal)}
                              </span>
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                                {o.status}
                              </span>
                              {o.status === 'Concluída' && financials.grandTotal > 0 && (
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${
                                  isPaid
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                    : 'bg-amber-50 text-amber-700 border-amber-200'
                                }`}>
                                  {isPaid ? 'Pago' : 'Pendente'}
                                </span>
                              )}
                              {onOpenOrder && (
                                <button
                                  onClick={() => onOpenOrder(o.id)}
                                  className="inline-flex items-center gap-1 text-xs font-semibold text-amber-600 hover:text-amber-700 bg-amber-50 hover:bg-amber-100 px-2.5 py-1 rounded-lg transition-colors"
                                >
                                  Abrir OS <ExternalLink size={11} />
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    }

                    if (item.type === 'sale') {
                      const s = item.data;
                      const saleStatus = (s.status ?? 'Pago').trim();
                      const isSalePaid = saleStatus.toLowerCase() === 'pago';
                      return (
                        <div key={`sale-${s.id}-${idx}`} className="p-4 hover:bg-slate-50 transition-colors">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-3">
                              <div className="w-8 h-8 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center flex-shrink-0">
                                <ShoppingCart size={14} />
                              </div>
                              <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">Venda PDV</span>
                                  <span className="text-xs text-slate-400">{formatDateTime(s.created_at)}</span>
                                  {s.payment_method && (
                                    <span className="text-xs text-slate-500">· {s.payment_method}</span>
                                  )}
                                </div>
                                <p className="text-sm text-slate-800 mt-1 font-semibold tabular-nums">
                                  {BRL.format(Number(s.total) || 0)}
                                </p>
                                {s.notes && <p className="text-xs text-slate-500 mt-0.5">{s.notes}</p>}
                              </div>
                            </div>
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border shrink-0 ${
                              isSalePaid
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'bg-amber-50 text-amber-700 border-amber-200'
                            }`}>
                              {saleStatus}
                            </span>
                          </div>
                        </div>
                      );
                    }

                    if (item.type === 'budget') {
                      const b = item.data;
                      const itemCount = Array.isArray(b.items) ? b.items.length : 0;
                      return (
                        <div key={`budget-${b.id}-${idx}`} className="p-4 hover:bg-slate-50 transition-colors">
                          <div className="flex items-start gap-3">
                            <div className="w-8 h-8 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center flex-shrink-0">
                              <FileText size={14} />
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200">Orçamento</span>
                                <span className="text-xs text-slate-400">{formatDateTime(b.created_at)}</span>
                                {itemCount > 0 && (
                                  <span className="text-xs text-slate-500">· {itemCount} item(ns)</span>
                                )}
                              </div>
                              <p className="text-sm text-slate-700 mt-1 font-semibold tabular-nums">
                                Orçamento gerado: {BRL.format(Number(b.total) || 0)}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── TAB 2: Produtos Adquiridos (CRUD Completo) ─────────────────── */}
          {activeTab === 'products' && (
            <div>
              <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-2 bg-slate-50/50">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                  Produtos & Garantias do Cliente
                </span>
                <button
                  onClick={openNewProductForm}
                  className="flex items-center gap-1.5 text-xs font-semibold bg-amber-500 hover:bg-amber-600 text-white px-3 py-1.5 rounded-lg transition-colors"
                >
                  <Plus size={13} /> Adicionar Produto
                </button>
              </div>

              {products.length === 0 ? (
                <div className="p-10 text-center">
                  <Package size={36} className="text-slate-300 mx-auto mb-3" />
                  <p className="text-slate-500 font-medium">Nenhum produto registrado</p>
                  <button onClick={openNewProductForm} className="mt-2 text-sm text-amber-600 hover:underline">
                    Cadastrar primeiro produto
                  </button>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {products.map(p => {
                    const hasWarranty = Boolean(p.warranty_end);
                    const warrantyActive = p.warranty_end ? p.warranty_end >= todayKey : false;
                    return (
                      <div key={p.id} className="p-4 hover:bg-slate-50/60 transition-colors">
                        <div className="flex items-start gap-3">
                          <div className="w-9 h-9 bg-amber-50 rounded-lg flex items-center justify-center flex-shrink-0">
                            <Package size={16} className="text-amber-600" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-semibold text-slate-800 text-sm">{p.product_name}</p>
                              {hasWarranty && (
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
                                  warrantyActive
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                    : 'bg-slate-100 text-slate-500 border-slate-200'
                                }`}>
                                  <Shield size={10} />
                                  {warrantyActive ? 'Garantia ativa' : 'Garantia expirada'}
                                </span>
                              )}
                            </div>
                            <div className="mt-1 flex flex-wrap gap-3 text-xs text-slate-500">
                              {p.purchase_date && <span>Compra: {formatDate(p.purchase_date)}</span>}
                              {p.invoice_number && <span>NF: {p.invoice_number}</span>}
                              {(p.warranty_start || p.warranty_end) && (
                                <span>
                                  Garantia: {formatDate(p.warranty_start)} a {formatDate(p.warranty_end)}
                                </span>
                              )}
                            </div>
                            {p.notes && <p className="mt-1 text-xs text-slate-500">{p.notes}</p>}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={() => openEditProductForm(p)}
                              title="Editar produto"
                              className="p-1.5 text-slate-400 hover:text-amber-600 rounded-lg hover:bg-amber-50 transition-colors"
                            >
                              <Edit2 size={14} />
                            </button>
                            <button
                              onClick={() => setDeleteProductId(p.id)}
                              title="Excluir produto"
                              className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── TAB 3: Equipamentos (Oficina) + QR + Abrir OS ──────────────── */}
          {activeTab === 'equipments' && (
            <div className="flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-slate-100 min-h-[320px]">
              {/* Left Column: Equipment list */}
              <div className="w-full md:w-1/3 p-4 space-y-2.5">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Máquinas do Cliente</h4>
                  <button
                    onClick={openNewEquipForm}
                    className="flex items-center gap-1 text-xs font-semibold text-amber-600 hover:text-amber-700"
                  >
                    <Plus size={13} /> Novo
                  </button>
                </div>
                {equipments.length === 0 ? (
                  <div className="text-center py-8 text-slate-400 text-sm space-y-2">
                    <p>Nenhum equipamento cadastrado na oficina.</p>
                    <button onClick={openNewEquipForm} className="text-xs font-semibold text-amber-600 hover:underline">
                      Cadastrar equipamento
                    </button>
                  </div>
                ) : (
                  equipments.map(eq => (
                    <button
                      key={eq.id}
                      onClick={() => setSelectedEquipId(eq.id)}
                      className={`w-full text-left p-3 rounded-xl border transition-all ${
                        selectedEquipId === eq.id
                          ? 'border-amber-500 bg-amber-50/50 shadow-sm'
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                    >
                      <p className="font-bold text-slate-800 text-sm leading-tight uppercase">
                        {[eq.equip_brand, eq.equip_model].filter(Boolean).join(' ') || eq.equip_type || 'Equipamento'}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-1 font-mono">S/N: {eq.equip_serial || '—'}</p>
                      <p className="text-[10px] text-slate-400 uppercase tracking-wide mt-0.5">
                        {[eq.equip_type, eq.equip_voltage, eq.equip_gas].filter(Boolean).join(' · ') || 'Sem especificações'}
                      </p>
                    </button>
                  ))
                )}
              </div>

              {/* Right Column: Equipment Actions + Service Order Timeline */}
              <div className="flex-1 p-4 space-y-4">
                {!selectedEquip ? (
                  <div className="text-center py-16 text-slate-400 text-sm">
                    Selecione ou cadastre um equipamento para ver os detalhes e o histórico de OS.
                  </div>
                ) : (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
                      <div>
                        <h4 className="text-sm font-bold text-slate-800 uppercase">
                          {[selectedEquip.equip_type, selectedEquip.equip_brand, selectedEquip.equip_model].filter(Boolean).join(' · ')}
                        </h4>
                        <p className="text-xs text-slate-500">
                          S/N: <span className="font-mono">{selectedEquip.equip_serial || '—'}</span>
                          {' · '}Voltagem: {selectedEquip.equip_voltage || '—'}
                          {' · '}Gás: {selectedEquip.equip_gas || '—'}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <button
                          onClick={() => openEditEquipForm(selectedEquip)}
                          className="flex items-center gap-1 text-xs font-medium border border-slate-200 hover:bg-slate-50 text-slate-600 px-2.5 py-1.5 rounded-lg"
                        >
                          <Edit2 size={12} /> Editar
                        </button>
                        <button
                          onClick={() => copyPublicQrUrl(selectedEquip.id)}
                          className="flex items-center gap-1 text-xs font-medium border border-slate-200 hover:bg-slate-50 text-slate-600 px-2.5 py-1.5 rounded-lg"
                        >
                          {copiedQrId === selectedEquip.id ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
                          {copiedQrId === selectedEquip.id ? 'Copiado!' : 'Link QR'}
                        </button>
                        <a
                          href={getPublicQrUrl(selectedEquip.id)}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1 text-xs font-semibold bg-amber-50 border border-amber-200 hover:bg-amber-100 text-amber-700 px-2.5 py-1.5 rounded-lg"
                        >
                          <QrCode size={12} /> Ficha QR
                        </a>
                      </div>
                    </div>

                    {(() => {
                      const equipOS = orders.filter(o => matchesEquipmentOrder(o, selectedEquip));
                      if (equipOS.length === 0) {
                        return (
                          <div className="text-center py-12 text-slate-400 text-sm">
                            Nenhuma ordem de serviço registrada para este equipamento.
                          </div>
                        );
                      }
                      return (
                        <div className="space-y-4 relative before:absolute before:inset-y-1 before:left-4 before:w-0.5 before:bg-slate-100">
                          {equipOS.map(os => {
                            const financials = calculateOrderFinancials(orderPartsMap[os.id] ?? [], os.labor_cost, true);
                            return (
                              <div key={os.id} className="relative pl-8">
                                <div className="absolute left-2.5 top-1.5 w-3.5 h-3.5 rounded-full border-2 border-amber-500 bg-white -translate-x-1/2 flex items-center justify-center">
                                  <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                                </div>
                                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 shadow-sm">
                                  <div className="flex items-start justify-between gap-2 mb-2">
                                    <div>
                                      <span className="text-[10px] font-bold text-slate-500">
                                        OS #{String(os.order_number ?? 0).padStart(4, '0')}
                                      </span>
                                      <h5 className="font-bold text-slate-800 text-sm mt-0.5">
                                        {os.visit_type} ({os.status})
                                      </h5>
                                    </div>
                                    <div className="text-right shrink-0">
                                      <span className="text-[11px] font-semibold text-slate-400 block">{formatDate(os.created_at)}</span>
                                      <span className="text-xs font-bold text-slate-700 tabular-nums">{BRL.format(financials.grandTotal)}</span>
                                    </div>
                                  </div>
                                  {os.diagnosis && (
                                    <p className="text-xs text-slate-600 bg-white border border-slate-100 rounded-xl p-2.5 mt-2">
                                      <span className="font-bold text-slate-700 block mb-0.5">Laudo / Diagnóstico:</span>
                                      {os.diagnosis}
                                    </p>
                                  )}
                                  {onOpenOrder && (
                                    <div className="mt-2.5 flex justify-end">
                                      <button
                                        onClick={() => onOpenOrder(os.id)}
                                        className="inline-flex items-center gap-1 text-xs font-semibold text-amber-600 hover:text-amber-700"
                                      >
                                        Abrir OS na Oficina <ExternalLink size={11} />
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </>
                )}
              </div>
            </div>
          )}

          {/* ── TAB 4: Agendamentos (Pendentes + Concluídos) ───────────────── */}
          {activeTab === 'schedules' && (
            <div>
              <div className="px-4 py-2.5 border-b border-slate-100 flex flex-wrap items-center gap-2 bg-slate-50/60">
                {[
                  { key: 'pending', label: `Pendentes (${pendingSchedules.length})` },
                  { key: 'completed', label: `Concluídos (${completedSchedules.length})` },
                  { key: 'all', label: `Todos (${schedules.length})` },
                ].map(f => (
                  <button
                    key={f.key}
                    onClick={() => setScheduleFilter(f.key as typeof scheduleFilter)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                      scheduleFilter === f.key
                        ? 'bg-amber-500 text-white'
                        : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              {visibleSchedules.length === 0 ? (
                <div className="p-10 text-center">
                  <Calendar size={36} className="text-slate-300 mx-auto mb-3" />
                  <p className="text-slate-500 font-medium">
                    Nenhum agendamento {scheduleFilter === 'pending' ? 'pendente' : scheduleFilter === 'completed' ? 'concluído' : ''}
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {visibleSchedules.map(s => (
                    <div key={s.id} className={`p-4 flex items-center gap-3 ${s.completed ? 'opacity-70 bg-slate-50/40' : ''}`}>
                      <Calendar size={16} className={s.completed ? 'text-emerald-500 flex-shrink-0' : 'text-amber-500 flex-shrink-0'} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium text-slate-700">{formatDateTime(s.scheduled_at)}</p>
                          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                            s.completed ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                          }`}>
                            {s.completed ? 'Concluído' : 'Pendente'}
                          </span>
                        </div>
                        {s.assigned_to && <p className="text-xs text-slate-500">Para: {s.assigned_to}</p>}
                        {s.notes && <p className="text-xs text-slate-500 mt-0.5">{s.notes}</p>}
                      </div>
                      <button
                        onClick={() => toggleScheduleCompleted(s)}
                        className={`flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg border transition-colors shrink-0 ${
                          s.completed
                            ? 'text-slate-600 border-slate-200 hover:bg-white'
                            : 'text-emerald-700 border-emerald-200 bg-emerald-50 hover:bg-emerald-100'
                        }`}
                      >
                        {s.completed ? <RotateCcw size={12} /> : <CheckCircle size={12} />}
                        {s.completed ? 'Reabrir' : 'Concluir'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Confirm Delete Contact */}
      {deleteContactId && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm flex flex-col items-center">
            <h3 className="text-lg font-bold text-slate-800 mb-2">Confirmar Exclusão</h3>
            <p className="text-sm text-slate-500 text-center mb-4">
              Excluir este registro de contato? O status de último contato do cliente será recalculado automaticamente.
            </p>
            <div className="flex gap-3 w-full">
              <button onClick={() => setDeleteContactId(null)} className="flex-1 py-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">Cancelar</button>
              <button
                onClick={() => {
                  const id = deleteContactId;
                  setDeleteContactId(null);
                  deleteContact(id);
                }}
                className="flex-1 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600"
              >
                Sim, excluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Delete Product */}
      {deleteProductId && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm flex flex-col items-center">
            <h3 className="text-lg font-bold text-slate-800 mb-2">Excluir Produto</h3>
            <p className="text-sm text-slate-500 text-center mb-4">
              Remover este produto/garantia do perfil do cliente? Esta ação não pode ser desfeita.
            </p>
            <div className="flex gap-3 w-full">
              <button onClick={() => setDeleteProductId(null)} className="flex-1 py-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">Cancelar</button>
              <button
                onClick={() => {
                  const id = deleteProductId;
                  setDeleteProductId(null);
                  deleteCustomerProduct(id);
                }}
                className="flex-1 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600"
              >
                Sim, excluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Product Create/Edit Modal */}
      {showProductForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-800">{productForm.id ? 'Editar Produto do Cliente' : 'Adicionar Produto ao Cliente'}</h3>
              <button onClick={() => setShowProductForm(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
            <form onSubmit={saveProductForm} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Nome do Produto *</label>
                <input
                  list="profile-catalog-products"
                  value={productForm.product_name}
                  onChange={e => setProductForm(prev => ({ ...prev, product_name: e.target.value }))}
                  placeholder="Ex: Chopeira Premium 50L"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
                <datalist id="profile-catalog-products">
                  {catalogProducts.map(cp => <option key={cp.id} value={cp.name} />)}
                </datalist>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Data Compra</label>
                  <input
                    type="date"
                    value={productForm.purchase_date}
                    onChange={e => setProductForm(prev => ({ ...prev, purchase_date: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Nota Fiscal</label>
                  <input
                    type="text"
                    value={productForm.invoice_number}
                    onChange={e => setProductForm(prev => ({ ...prev, invoice_number: e.target.value }))}
                    placeholder="Número da NF"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Início Garantia</label>
                  <input
                    type="date"
                    value={productForm.warranty_start}
                    onChange={e => setProductForm(prev => ({ ...prev, warranty_start: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Fim Garantia</label>
                  <input
                    type="date"
                    value={productForm.warranty_end}
                    onChange={e => setProductForm(prev => ({ ...prev, warranty_end: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Observações</label>
                <textarea
                  rows={2}
                  value={productForm.notes}
                  onChange={e => setProductForm(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="Detalhes adicionais..."
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowProductForm(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">
                  Cancelar
                </button>
                <button type="submit" disabled={savingProduct} className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded-lg disabled:opacity-50">
                  {savingProduct ? 'Salvando...' : 'Salvar Produto'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Equipment Create/Edit Modal */}
      {showEquipForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-800">{equipForm.id ? 'Editar Equipamento' : 'Novo Equipamento (Oficina)'}</h3>
              <button onClick={() => setShowEquipForm(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
            <form onSubmit={saveEquipForm} className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Tipo</label>
                  <input
                    type="text"
                    value={equipForm.equip_type}
                    onChange={e => setEquipForm(prev => ({ ...prev, equip_type: e.target.value }))}
                    placeholder="Ex: Chopeira, Expositor, Freezer"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Marca</label>
                  <input
                    type="text"
                    value={equipForm.equip_brand}
                    onChange={e => setEquipForm(prev => ({ ...prev, equip_brand: e.target.value }))}
                    placeholder="Ex: Metalfrio, Memo, Carmomaq"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Modelo</label>
                  <input
                    type="text"
                    value={equipForm.equip_model}
                    onChange={e => setEquipForm(prev => ({ ...prev, equip_model: e.target.value }))}
                    placeholder="Ex: VN50, 50L Inox"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Nº de Série / Patrimônio</label>
                  <input
                    type="text"
                    value={equipForm.equip_serial}
                    onChange={e => setEquipForm(prev => ({ ...prev, equip_serial: e.target.value }))}
                    placeholder="Série da etiqueta"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Gás Refrigerante</label>
                  <input
                    type="text"
                    value={equipForm.equip_gas}
                    onChange={e => setEquipForm(prev => ({ ...prev, equip_gas: e.target.value }))}
                    placeholder="Ex: R134a, R290"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Voltagem</label>
                  <input
                    type="text"
                    value={equipForm.equip_voltage}
                    onChange={e => setEquipForm(prev => ({ ...prev, equip_voltage: e.target.value }))}
                    placeholder="Ex: 127V, 220V"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowEquipForm(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">
                  Cancelar
                </button>
                <button type="submit" disabled={savingEquip} className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded-lg disabled:opacity-50">
                  {savingEquip ? 'Salvando...' : 'Salvar Equipamento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
