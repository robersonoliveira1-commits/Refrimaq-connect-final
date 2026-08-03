import { useEffect, useState } from 'react';
import {
  Users, AlertCircle, Clock, UserPlus, Map, Calendar,
  UsersRound, ChevronRight, CheckCircle, TrendingUp,
  Phone, MapPin, ArrowRight,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Customer, ContactStatus, getContactStatus, daysSince } from '../lib/types';

interface OverviewProps {
  onNavigate: (page: string) => void;
  onSelectCustomer: (id: string) => void;
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

interface RouteOverview {
  name: string;
  day_index: number;
  total_stops: number;
  completed_stops: number;
}

interface RecentContact {
  id: string;
  customer_name: string;
  customer_id: string;
  contact_type: string;
  contacted_by: string;
  contacted_at: string;
}

interface UpcomingSchedule {
  id: string;
  customer_name: string;
  customer_id: string;
  scheduled_at: string;
  assigned_to: string;
  notes: string;
}

const DAY_LABELS = ['', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex'];

const STATUS_DOT: Record<ContactStatus, string> = {
  green: 'bg-emerald-500',
  yellow: 'bg-amber-500',
  red: 'bg-red-500',
  gray: 'bg-slate-400',
};

export default function Dashboard({ onNavigate, onSelectCustomer, onMenuClick, refresh }: OverviewProps) {
  const [metrics, setMetrics] = useState<Metrics>({ total: 0, green: 0, yellow: 0, red: 0, gray: 0 });
  const [routes, setRoutes] = useState<RouteOverview[]>([]);
  const [recentContacts, setRecentContacts] = useState<RecentContact[]>([]);
  const [urgentCustomers, setUrgentCustomers] = useState<Customer[]>([]);
  const [upcomingSchedules, setUpcomingSchedules] = useState<UpcomingSchedule[]>([]);
  const [teamCount, setTeamCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadOverview();
  }, [refresh]);

  async function loadOverview() {
    setLoading(true);

    const PAGE_SIZE = 1000;

    // Load customer metrics (paginated)
    const allCust: { id: string; name: string; phone: string; city: string; last_contact_at: string | null }[] = [];
    let from = 0;
    let hasMore = true;
    while (hasMore) {
      const { data } = await supabase
        .from('customers')
        .select('id, name, phone, city, last_contact_at')
        .range(from, from + PAGE_SIZE - 1);
      if (data && data.length > 0) {
        allCust.push(...data);
        from += PAGE_SIZE;
        if (data.length < PAGE_SIZE) hasMore = false;
      } else {
        hasMore = false;
      }
    }

    const m: Metrics = { total: allCust.length, green: 0, yellow: 0, red: 0, gray: 0 };
    allCust.forEach(c => m[getContactStatus(c.last_contact_at)]++);
    setMetrics(m);

    // Urgent customers (red status, sorted by oldest contact)
    const urgent = allCust
      .filter(c => getContactStatus(c.last_contact_at) === 'red')
      .sort((a, b) => {
        const da = a.last_contact_at ? new Date(a.last_contact_at).getTime() : 0;
        const db = b.last_contact_at ? new Date(b.last_contact_at).getTime() : 0;
        return da - db;
      })
      .slice(0, 5) as Customer[];
    setUrgentCustomers(urgent);

    // Routes overview
    const { data: routesData } = await supabase
      .from('routes')
      .select('name, day_index, route_stops(visited)')
      .gte('day_index', 1)
      .lte('day_index', 5)
      .order('day_index');

    if (routesData) {
      const routeOverviews: RouteOverview[] = routesData.map(r => {
        const stops = (r.route_stops as unknown as { visited: boolean }[]) || [];
        return {
          name: r.name,
          day_index: r.day_index,
          total_stops: stops.length,
          completed_stops: stops.filter(s => s.visited).length,
        };
      });
      setRoutes(routeOverviews);
    }

    // Recent contacts (last 5)
    const { data: contactsData } = await supabase
      .from('contacts')
      .select('id, customer_id, contact_type, contacted_by, contacted_at, customers(name)')
      .order('contacted_at', { ascending: false })
      .limit(6);

    if (contactsData) {
      setRecentContacts(contactsData.map(c => ({
        id: c.id,
        customer_id: c.customer_id,
        customer_name: (c.customers as unknown as { name: string })?.name || 'Cliente',
        contact_type: c.contact_type,
        contacted_by: c.contacted_by,
        contacted_at: c.contacted_at,
      })));
    }

    // Upcoming schedules
    const { data: scheduleData } = await supabase
      .from('contact_schedules')
      .select('id, customer_id, scheduled_at, assigned_to, notes, customers(name)')
      .eq('completed', false)
      .gte('scheduled_at', new Date().toISOString())
      .order('scheduled_at')
      .limit(5);

    if (scheduleData) {
      setUpcomingSchedules(scheduleData.map(s => ({
        id: s.id,
        customer_id: s.customer_id,
        customer_name: (s.customers as unknown as { name: string })?.name || 'Cliente',
        scheduled_at: s.scheduled_at,
        assigned_to: s.assigned_to,
        notes: s.notes,
      })));
    }

    // Team count
    const { count } = await supabase
      .from('user_profiles')
      .select('id', { count: 'exact', head: true })
      .eq('active', true);
    setTeamCount(count ?? 0);

    setLoading(false);
  }

  const todayDow = new Date().getDay();
  const todayIndex = todayDow >= 1 && todayDow <= 5 ? todayDow : 1;
  const todayRoute = routes.find(r => r.day_index === todayIndex);

  if (loading) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-2 px-4 sm:px-6 py-4 bg-white border-b border-slate-200">
          <button className="lg:hidden text-slate-500" onClick={onMenuClick}>
            <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <h1 className="text-xl font-bold text-slate-800">Painel</h1>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 sm:px-6 py-4 bg-white border-b border-slate-200">
        <button className="lg:hidden text-slate-500" onClick={onMenuClick}>
          <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-slate-800">Painel</h1>
          <p className="text-sm text-slate-500">Visao geral do sistema</p>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4 sm:p-6 space-y-6">
        {/* Top metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <button onClick={() => onNavigate('customers')}
            className="bg-white rounded-xl p-4 border border-slate-200 text-left hover:border-sky-300 hover:shadow-sm transition-all group">
            <div className="w-9 h-9 bg-sky-50 rounded-lg flex items-center justify-center mb-3 group-hover:bg-sky-100 transition-colors">
              <Users size={18} className="text-sky-600" />
            </div>
            <p className="text-2xl font-bold text-slate-800">{metrics.total}</p>
            <p className="text-xs text-slate-500 mt-0.5">Total Clientes</p>
          </button>

          <button onClick={() => onNavigate('customers')}
            className="bg-white rounded-xl p-4 border border-slate-200 text-left hover:border-emerald-300 hover:shadow-sm transition-all">
            <div className="w-9 h-9 bg-emerald-50 rounded-lg flex items-center justify-center mb-3">
              <span className="w-3 h-3 rounded-full bg-emerald-500" />
            </div>
            <p className="text-2xl font-bold text-slate-800">{metrics.green}</p>
            <p className="text-xs text-slate-500 mt-0.5">Em dia (30d)</p>
          </button>

          <button onClick={() => onNavigate('customers')}
            className="bg-white rounded-xl p-4 border border-slate-200 text-left hover:border-amber-300 hover:shadow-sm transition-all">
            <div className="w-9 h-9 bg-amber-50 rounded-lg flex items-center justify-center mb-3">
              <Clock size={18} className="text-amber-600" />
            </div>
            <p className="text-2xl font-bold text-slate-800">{metrics.yellow}</p>
            <p className="text-xs text-slate-500 mt-0.5">Atencao (90-180d)</p>
          </button>

          <button onClick={() => onNavigate('customers')}
            className="bg-white rounded-xl p-4 border border-slate-200 text-left hover:border-red-300 hover:shadow-sm transition-all">
            <div className="w-9 h-9 bg-red-50 rounded-lg flex items-center justify-center mb-3">
              <AlertCircle size={18} className="text-red-600" />
            </div>
            <p className="text-2xl font-bold text-slate-800">{metrics.red}</p>
            <p className="text-xs text-slate-500 mt-0.5">Urgente (+180d)</p>
          </button>

          <button onClick={() => onNavigate('customers')}
            className="bg-white rounded-xl p-4 border border-slate-200 text-left hover:border-slate-300 hover:shadow-sm transition-all">
            <div className="w-9 h-9 bg-slate-50 rounded-lg flex items-center justify-center mb-3">
              <UserPlus size={18} className="text-slate-600" />
            </div>
            <p className="text-2xl font-bold text-slate-800">{metrics.gray}</p>
            <p className="text-xs text-slate-500 mt-0.5">Novos</p>
          </button>
        </div>

        {/* Two-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left column */}
          <div className="space-y-6">
            {/* Today's route */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <Map size={18} className="text-sky-600" />
                  <h2 className="font-semibold text-slate-800">Rota de Hoje</h2>
                </div>
                <button onClick={() => onNavigate('logistics')} className="text-xs text-sky-600 hover:text-sky-700 font-medium flex items-center gap-1">
                  Ver todas <ArrowRight size={12} />
                </button>
              </div>
              <div className="p-5">
                {todayRoute ? (
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <p className="font-medium text-slate-700">{todayRoute.name}</p>
                      <span className="text-sm text-slate-500">{DAY_LABELS[todayRoute.day_index]}</span>
                    </div>
                    <div className="flex items-center gap-3 mb-3">
                      <div className="flex-1 bg-slate-100 rounded-full h-2.5 overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 rounded-full transition-all"
                          style={{ width: todayRoute.total_stops > 0 ? `${(todayRoute.completed_stops / todayRoute.total_stops) * 100}%` : '0%' }}
                        />
                      </div>
                      <span className="text-sm font-medium text-slate-600">
                        {todayRoute.completed_stops}/{todayRoute.total_stops}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500">
                      {todayRoute.total_stops - todayRoute.completed_stops} paradas pendentes
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-slate-500 text-center py-4">Nenhuma rota configurada para hoje</p>
                )}
              </div>

              {/* Week overview */}
              {routes.length > 0 && (
                <div className="border-t border-slate-100 px-5 py-3">
                  <div className="flex gap-2">
                    {[1, 2, 3, 4, 5].map(day => {
                      const r = routes.find(rt => rt.day_index === day);
                      const isToday = day === todayIndex;
                      return (
                        <div key={day} className={`flex-1 text-center py-2 rounded-lg ${isToday ? 'bg-sky-50 border border-sky-200' : 'bg-slate-50'}`}>
                          <p className={`text-[10px] font-medium ${isToday ? 'text-sky-700' : 'text-slate-500'}`}>{DAY_LABELS[day]}</p>
                          <p className={`text-sm font-bold mt-0.5 ${isToday ? 'text-sky-700' : 'text-slate-700'}`}>
                            {r ? r.total_stops : 0}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Urgent customers */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <AlertCircle size={18} className="text-red-500" />
                  <h2 className="font-semibold text-slate-800">Clientes Urgentes</h2>
                </div>
                <button onClick={() => onNavigate('customers')} className="text-xs text-sky-600 hover:text-sky-700 font-medium flex items-center gap-1">
                  Ver todos <ArrowRight size={12} />
                </button>
              </div>
              {urgentCustomers.length > 0 ? (
                <div className="divide-y divide-slate-100">
                  {urgentCustomers.map(c => (
                    <button key={c.id} onClick={() => onSelectCustomer(c.id)}
                      className="w-full flex items-center gap-3 px-5 py-3 hover:bg-slate-50 transition-colors text-left">
                      <div className="relative flex-shrink-0">
                        <div className="w-9 h-9 bg-red-50 rounded-full flex items-center justify-center">
                          <span className="text-red-600 font-semibold text-sm">{c.name.charAt(0)}</span>
                        </div>
                        <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white bg-red-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">{c.name}</p>
                        <p className="text-xs text-red-500">{daysSince(c.last_contact_at)}</p>
                      </div>
                      <ChevronRight size={14} className="text-slate-300 flex-shrink-0" />
                    </button>
                  ))}
                </div>
              ) : (
                <div className="p-6 text-center">
                  <CheckCircle size={24} className="text-emerald-400 mx-auto mb-2" />
                  <p className="text-sm text-slate-500">Nenhum cliente urgente</p>
                </div>
              )}
            </div>
          </div>

          {/* Right column */}
          <div className="space-y-6">
            {/* Recent activity */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <TrendingUp size={18} className="text-emerald-600" />
                  <h2 className="font-semibold text-slate-800">Atividade Recente</h2>
                </div>
                <button onClick={() => onNavigate('reports')} className="text-xs text-sky-600 hover:text-sky-700 font-medium flex items-center gap-1">
                  Relatorios <ArrowRight size={12} />
                </button>
              </div>
              {recentContacts.length > 0 ? (
                <div className="divide-y divide-slate-100">
                  {recentContacts.map(c => (
                    <button key={c.id} onClick={() => onSelectCustomer(c.customer_id)}
                      className="w-full flex items-center gap-3 px-5 py-3 hover:bg-slate-50 transition-colors text-left">
                      <div className="w-8 h-8 bg-emerald-50 rounded-full flex items-center justify-center flex-shrink-0">
                        <Phone size={14} className="text-emerald-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">{c.customer_name}</p>
                        <p className="text-xs text-slate-500">{c.contact_type} - {c.contacted_by}</p>
                      </div>
                      <p className="text-xs text-slate-400 flex-shrink-0">
                        {new Date(c.contacted_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                      </p>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="p-6 text-center">
                  <p className="text-sm text-slate-500">Nenhuma atividade recente</p>
                </div>
              )}
            </div>

            {/* Upcoming schedules */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <Calendar size={18} className="text-amber-600" />
                  <h2 className="font-semibold text-slate-800">Proximos Agendamentos</h2>
                </div>
                <button onClick={() => onNavigate('schedule')} className="text-xs text-sky-600 hover:text-sky-700 font-medium flex items-center gap-1">
                  Ver todos <ArrowRight size={12} />
                </button>
              </div>
              {upcomingSchedules.length > 0 ? (
                <div className="divide-y divide-slate-100">
                  {upcomingSchedules.map(s => (
                    <button key={s.id} onClick={() => onSelectCustomer(s.customer_id)}
                      className="w-full flex items-center gap-3 px-5 py-3 hover:bg-slate-50 transition-colors text-left">
                      <div className="w-8 h-8 bg-amber-50 rounded-full flex items-center justify-center flex-shrink-0">
                        <Calendar size={14} className="text-amber-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">{s.customer_name}</p>
                        <p className="text-xs text-slate-500 truncate">{s.notes || s.assigned_to}</p>
                      </div>
                      <p className="text-xs text-amber-600 font-medium flex-shrink-0">
                        {new Date(s.scheduled_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                      </p>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="p-6 text-center">
                  <p className="text-sm text-slate-500">Nenhum agendamento proximo</p>
                </div>
              )}
            </div>

            {/* Team quick stats */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <UsersRound size={18} className="text-sky-600" />
                  <h2 className="font-semibold text-slate-800">Equipe</h2>
                </div>
                <button onClick={() => onNavigate('team')} className="text-xs text-sky-600 hover:text-sky-700 font-medium flex items-center gap-1">
                  Gerenciar <ArrowRight size={12} />
                </button>
              </div>
              <div className="p-5">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-sky-50 rounded-xl flex items-center justify-center">
                    <UsersRound size={24} className="text-sky-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-slate-800">{teamCount}</p>
                    <p className="text-xs text-slate-500">membros ativos</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
