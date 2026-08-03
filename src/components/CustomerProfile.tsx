import { useEffect, useState } from 'react';
import {
  ArrowLeft, Phone, Mail, MapPin, FileText, Package, MessageSquare,
  Plus, Edit2, Trash2, Calendar, CheckCircle,
  PhoneCall, MessageCircle, AtSign, Navigation, MoreHorizontal, Shield, Wrench, ShoppingCart
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import {
  Customer, CustomerProduct, Contact, ContactSchedule,
  getContactStatus, getStatusLabel, formatDate, formatDateTime, daysSince
} from '../lib/types';
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

interface CustomerProfileProps {
  customerId: string;
  onBack: () => void;
  onAddContact: (customerId: string) => void;
  onEditCustomer: (customer: Customer) => void;
  onMenuClick: () => void;
  refresh: number;
}

export default function CustomerProfile({
  customerId, onBack, onAddContact, onEditCustomer, onMenuClick, refresh
}: CustomerProfileProps) {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [products, setProducts] = useState<CustomerProduct[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [schedules, setSchedules] = useState<ContactSchedule[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [sales, setSales] = useState<any[]>([]);
  const [budgets, setBudgets] = useState<any[]>([]);
  const [equipments, setEquipments] = useState<any[]>([]);
  const [selectedEquipId, setSelectedEquipId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'contacts' | 'products' | 'equipments' | 'schedules'>('contacts');

  useEffect(() => {
    loadAll();
  }, [customerId, refresh]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const eqId = params.get('equipmentId');
    if (eqId) {
      setActiveTab('equipments');
      setSelectedEquipId(eqId);
      // Clean query parameters from URL to avoid re-triggering
      const cleanUrl = window.location.origin + window.location.pathname;
      window.history.replaceState({}, document.title, cleanUrl);
    }
  }, [equipments]);

  async function loadAll() {
    setLoading(true);
    const [customerRes, productsRes, contactsRes, schedulesRes, ordersRes, salesRes, budgetsRes, equipmentsRes] = await Promise.all([
      supabase.from('customers').select('*').eq('id', customerId).maybeSingle(),
      supabase.from('customer_products').select('*').eq('customer_id', customerId).order('purchase_date', { ascending: false }),
      supabase.from('contacts').select('*').eq('customer_id', customerId).order('contacted_at', { ascending: false }),
      supabase.from('contact_schedules').select('*').eq('customer_id', customerId).eq('completed', false).order('scheduled_at'),
      supabase.from('service_orders').select('*').eq('customer_id', customerId).order('created_at', { ascending: false }),
      supabase.from('sales').select('*').eq('customer_id', customerId).order('created_at', { ascending: false }),
      supabase.from('sales_budgets').select('*').eq('customer_id', customerId).order('created_at', { ascending: false }),
      supabase.from('customer_equipments').select('*').eq('customer_id', customerId).order('created_at', { ascending: false }),
    ]);
    if (customerRes.data) setCustomer(customerRes.data);
    if (productsRes.data) setProducts(productsRes.data);
    if (contactsRes.data) setContacts(contactsRes.data);
    if (schedulesRes.data) setSchedules(schedulesRes.data);
    if (ordersRes.data) setOrders(ordersRes.data);
    if (salesRes.data) setSales(salesRes.data);
    if (budgetsRes.data) setBudgets(budgetsRes.data);
    if (equipmentsRes.data) {
      setEquipments(equipmentsRes.data);
      // Auto select first equipment if available and not set
      if (equipmentsRes.data.length > 0 && !selectedEquipId) {
        setSelectedEquipId(equipmentsRes.data[0].id);
      }
    }
    setLoading(false);
  }

  async function deleteContact(id: string) {
    
    await supabase.from('contacts').delete().eq('id', id);
    loadAll();
  }

  async function completeSchedule(id: string) {
    await supabase.from('contact_schedules').update({ completed: true }).eq('id', id);
    loadAll();
  }

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

  const historyItems = [
    ...contacts.map(c => ({ type: 'contact' as const, date: c.contacted_at, data: c })),
    ...orders.map(o => ({ type: 'order' as const, date: o.created_at, data: o })),
    ...sales.map(s => ({ type: 'sale' as const, date: s.created_at, data: s })),
    ...budgets.map(b => ({ type: 'budget' as const, date: b.created_at, data: b }))
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

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
              onClick={() => onAddContact(customerId)}
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
              </div>
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                {customer.phone && (
                  <a href={`tel:${customer.phone}`} className="flex items-center gap-2 text-sm text-slate-600 hover:text-amber-600 transition-colors">
                    <Phone size={14} className="text-slate-400" />
                    {customer.phone}
                  </a>
                )}
                {customer.whatsapp && (
                  <a href={`https://wa.me/${(() => { const digits = customer.whatsapp.replace(/\D/g, ''); return digits.startsWith('55') ? digits : '55' + digits; })()}`} target="_blank" rel="noreferrer"
                    className="flex items-center gap-2 text-sm text-slate-600 hover:text-emerald-600 transition-colors">
                    <MessageCircle size={14} className="text-slate-400" />
                    {customer.whatsapp}
                  </a>
                )}
                {customer.email && (
                  <a href={`mailto:${customer.email}`} className="flex items-center gap-2 text-sm text-slate-600 hover:text-amber-600 transition-colors">
                    <Mail size={14} className="text-slate-400" />
                    {customer.email}
                  </a>
                )}
                {(customer.address || customer.city) && (
                  <span className="flex items-center gap-2 text-sm text-slate-600">
                    <MapPin size={14} className="text-slate-400" />
                    {[customer.address, customer.city, customer.state].filter(Boolean).join(', ')}
                  </span>
                )}
                {customer.document && (
                  <span className="flex items-center gap-2 text-sm text-slate-600">
                    <FileText size={14} className="text-slate-400" />
                    {customer.document}
                  </span>
                )}
              </div>

              {Array.isArray(customer.equipment_types) && customer.equipment_types.length > 0 && (
              <div className="mt-6 pt-6 border-t border-slate-100">
                <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                  <Wrench className="h-4 w-4 text-amber-500" />
                  Equipamentos do Cliente
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

              {customer.notes && (
                <p className="mt-3 text-sm text-slate-500 bg-slate-50 rounded-lg p-3 italic">{customer.notes}</p>
              )}
            </div>
          </div>
        </div>

        {/* upcoming schedules */}
        {schedules.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <p className="text-sm font-semibold text-amber-800 mb-2 flex items-center gap-1.5">
              <Calendar size={14} />
              Contatos Agendados
            </p>
            <div className="space-y-2">
              {schedules.map(s => (
                <div key={s.id} className="flex items-center gap-3 bg-white rounded-lg p-3 border border-amber-100">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-700">{formatDateTime(s.scheduled_at)}</p>
                    {s.assigned_to && <p className="text-xs text-slate-500">Responsável: {s.assigned_to}</p>}
                    {s.notes && <p className="text-xs text-slate-500 mt-0.5">{s.notes}</p>}
                  </div>
                  <button
                    onClick={() => completeSchedule(s.id)}
                    className="flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700 font-medium transition-colors"
                  >
                    <CheckCircle size={14} />
                    Concluído
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* tabs */}
        <div className="bg-white rounded-xl border border-slate-200">
          <div className="flex border-b border-slate-100">
            {[
              { key: 'contacts', label: 'Histórico Geral', count: historyItems.length },
              { key: 'products', label: 'Produtos', count: products.length },
              { key: 'equipments', label: 'Equipamentos (Oficina)', count: equipments.length },
              { key: 'schedules', label: 'Agendamentos', count: schedules.length },
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key as typeof activeTab)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
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

          {/* contact history */}
          {activeTab === 'contacts' && (
            <div>
              {historyItems.length === 0 ? (
                <div className="p-10 text-center">
                  <MessageSquare size={36} className="text-slate-300 mx-auto mb-3" />
                  <p className="text-slate-500 font-medium">Nenhum histórico registrado</p>
                  <button
                    onClick={() => onAddContact(customerId)}
                    className="mt-3 text-amber-600 hover:underline text-sm"
                  >
                    Registrar primeiro contato
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
                                <p className="mt-1 text-sm text-slate-500 leading-relaxed">{contact.details}</p>
                              )}
                              {contact.comprovante_url && (
                                <a href={contact.comprovante_url} target="_blank" rel="noopener noreferrer"
                                  className="mt-2 inline-block rounded-lg overflow-hidden border border-slate-200 hover:border-amber-400 transition-colors">
                                  <img src={contact.comprovante_url} alt="Comprovante" className="w-24 h-24 object-cover" />
                                </a>
                              )}
                              {contact.next_contact_at && (
                                <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 rounded-lg px-2.5 py-1.5 w-fit">
                                  <Calendar size={11} />
                                  Próximo contato: {formatDateTime(contact.next_contact_at)}
                                  {contact.next_contact_notes && ` — ${contact.next_contact_notes}`}
                                </div>
                              )}
                            </div>
                            <button
                              onClick={() => setDeleteConfirm(contact.id)}
                              className="text-slate-300 hover:text-red-400 transition-colors flex-shrink-0"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      );
                    } else if (item.type === 'order') {
                      const o = item.data;
                      return (
                        <div key={`order-${o.id}-${idx}`} className="p-4 hover:bg-slate-50 transition-colors">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div className="flex items-start gap-3">
                              <div className="w-8 h-8 bg-amber-100 text-amber-700 rounded-full flex items-center justify-center flex-shrink-0">
                                <Wrench size={14} />
                              </div>
                              <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">OS</span>
                                  <p className="font-bold text-slate-800 text-sm">#{String(o.order_number).padStart(4, '0')} - {o.visit_type}</p>
                                  <span className="text-xs text-slate-400">{formatDateTime(o.created_at)}</span>
                                </div>
                                {o.diagnosis && <p className="text-sm text-slate-600 mt-1.5">{o.diagnosis}</p>}
                              </div>
                            </div>
                            <div className="flex flex-col items-start sm:items-end gap-2 flex-shrink-0">
                              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                                {o.status}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    } else if (item.type === 'sale') {
                      const s = item.data;
                      return (
                        <div key={`sale-${s.id}-${idx}`} className="p-4 hover:bg-slate-50 transition-colors">
                          <div className="flex items-start gap-3">
                            <div className="w-8 h-8 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center flex-shrink-0">
                              <ShoppingCart size={14} />
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">Venda</span>
                                <span className="text-xs text-slate-400">{formatDateTime(s.created_at)}</span>
                              </div>
                              <p className="text-sm text-slate-700 mt-1.5 font-medium">Venda registrada: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(s.total)}</p>
                            </div>
                          </div>
                        </div>
                      );
                    } else if (item.type === 'budget') {
                      const b = item.data;
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
                              </div>
                              <p className="text-sm text-slate-700 mt-1.5 font-medium">Orçamento gerado: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(b.total)}</p>
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

          {/* products */}
          {activeTab === 'products' && (
            <div>
              {products.length === 0 ? (
                <div className="p-10 text-center">
                  <Package size={36} className="text-slate-300 mx-auto mb-3" />
                  <p className="text-slate-500 font-medium">Nenhum produto registrado</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {products.map(p => (
                    <div key={p.id} className="p-4">
                      <div className="flex items-start gap-3">
                        <div className="w-9 h-9 bg-amber-50 rounded-lg flex items-center justify-center flex-shrink-0">
                          <Package size={16} className="text-amber-600" />
                        </div>
                        <div className="flex-1">
                          <p className="font-medium text-slate-700">{p.product_name}</p>
                          <div className="mt-1 flex flex-wrap gap-3 text-xs text-slate-500">
                            {p.purchase_date && <span>Compra: {formatDate(p.purchase_date)}</span>}
                            {p.invoice_number && <span>NF: {p.invoice_number}</span>}
                            {p.warranty_start && p.warranty_end && (
                              <span className="flex items-center gap-1">
                                <Shield size={10} />
                                Garantia: {formatDate(p.warranty_start)} a {formatDate(p.warranty_end)}
                              </span>
                            )}
                          </div>
                          {p.notes && <p className="mt-1 text-xs text-slate-400">{p.notes}</p>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* equipments list and history */}
          {activeTab === 'equipments' && (
            <div className="flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-slate-100 min-h-[300px]">
              {/* Left Column: Equipment list */}
              <div className="w-full md:w-1/3 p-4 space-y-2">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Máquinas do Cliente</h4>
                {equipments.length === 0 ? (
                  <div className="text-center py-8 text-slate-400 text-sm">
                    Nenhum equipamento cadastrado na oficina.
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
                      <p className="font-bold text-slate-800 text-sm leading-tight uppercase">{eq.equip_brand} {eq.equip_model}</p>
                      <p className="text-[10px] text-slate-400 mt-1 font-semibold">S/N: {eq.equip_serial || '—'}</p>
                      <p className="text-[10px] text-slate-500 uppercase tracking-wide mt-0.5">{eq.equip_type}</p>
                    </button>
                  ))
                )}
              </div>

              {/* Right Column: Service Order Timeline */}
              <div className="flex-1 p-4">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Histórico de OS</h4>
                {!selectedEquipId ? (
                  <div className="text-center py-16 text-slate-400 text-sm">
                    Selecione um equipamento para ver o histórico.
                  </div>
                ) : (
                  (() => {
                    const equipOS = orders.filter(o => o.equipment_id === selectedEquipId || (o.equip_serial && o.equip_serial === equipments.find(e => e.id === selectedEquipId)?.equip_serial));
                    if (equipOS.length === 0) {
                      return (
                        <div className="text-center py-16 text-slate-400 text-sm">
                          Nenhuma ordem de serviço registrada para este equipamento.
                        </div>
                      );
                    }
                    return (
                      <div className="space-y-4 relative before:absolute before:inset-y-1 before:left-4 before:w-0.5 before:bg-slate-100">
                        {equipOS.map(os => (
                          <div key={os.id} className="relative pl-8">
                            <div className="absolute left-2.5 top-1.5 w-3.5 h-3.5 rounded-full border-2 border-amber-500 bg-white -translate-x-1/2 flex items-center justify-center">
                              <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                            </div>
                            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 shadow-sm">
                              <div className="flex items-start justify-between gap-2 mb-2">
                                <div>
                                  <span className="text-[10px] font-bold text-slate-500">OS #{String(os.order_number).padStart(4, '0')}</span>
                                  <h5 className="font-bold text-slate-800 text-sm mt-0.5">{os.visit_type} ({os.status})</h5>
                                </div>
                                <span className="text-[10px] font-semibold text-slate-400">{formatDate(os.created_at)}</span>
                              </div>
                              {os.diagnosis && (
                                <p className="text-xs text-slate-600 bg-white border border-slate-100 rounded-xl p-2.5 mt-2">
                                  <span className="font-bold text-slate-700 block mb-0.5">Laudo / Diagnóstico:</span>
                                  {os.diagnosis}
                                </p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })()
                )}
              </div>
            </div>
          )}

          {/* schedules history */}
          {activeTab === 'schedules' && (
            <div>
              {schedules.length === 0 ? (
                <div className="p-10 text-center">
                  <Calendar size={36} className="text-slate-300 mx-auto mb-3" />
                  <p className="text-slate-500 font-medium">Nenhum agendamento pendente</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {schedules.map(s => (
                    <div key={s.id} className="p-4 flex items-center gap-3">
                      <Calendar size={16} className="text-amber-500 flex-shrink-0" />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-slate-700">{formatDateTime(s.scheduled_at)}</p>
                        {s.assigned_to && <p className="text-xs text-slate-500">Para: {s.assigned_to}</p>}
                        {s.notes && <p className="text-xs text-slate-500">{s.notes}</p>}
                      </div>
                      <button
                        onClick={() => completeSchedule(s.id)}
                        className="text-xs text-emerald-600 hover:text-emerald-700 font-medium transition-colors"
                      >
                        Concluir
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}


        </div>
      </div>
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm flex flex-col items-center">
            <h3 className="text-lg font-bold text-slate-800 mb-2">Confirmar Exclusão</h3>
            <p className="text-sm text-slate-500 text-center mb-4">Excluir este registro de contato? Esta ação não pode ser desfeita.</p>
            <div className="flex gap-3 w-full">
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 py-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">Cancelar</button>
              <button onClick={() => { if (deleteConfirm) deleteContact(deleteConfirm); setDeleteConfirm(null); }} className="flex-1 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600">Sim, excluir</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
