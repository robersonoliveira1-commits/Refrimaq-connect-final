import { useEffect, useState } from 'react';
import { BarChart3, Users, TrendingUp, Phone, MessageCircle, Mail, Navigation, MoreHorizontal } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getContactStatus } from '../lib/types';
import Header from './Header';

interface ReportsProps {
  onMenuClick: () => void;
  refresh: number;
}

interface CustomerStats {
  total: number;
  green: number;
  yellow: number;
  red: number;
  gray: number;
}

interface TeamStats {
  rep: string;
  count: number;
}

interface ContactTypeStats {
  type: string;
  count: number;
}

interface MonthlyStats {
  month: string;
  count: number;
}

const CONTACT_TYPE_LABELS: Record<string, string> = {
  phone: 'Telefone',
  whatsapp: 'WhatsApp',
  email: 'E-mail',
  visit: 'Visita',
  other: 'Outro',
};

const CONTACT_TYPE_ICONS: Record<string, React.ReactNode> = {
  phone: <Phone size={14} />,
  whatsapp: <MessageCircle size={14} />,
  email: <Mail size={14} />,
  visit: <Navigation size={14} />,
  other: <MoreHorizontal size={14} />,
};

const CONTACT_TYPE_COLORS: Record<string, string> = {
  phone: 'bg-blue-500',
  whatsapp: 'bg-emerald-500',
  email: 'bg-amber-500',
  visit: 'bg-orange-500',
  other: 'bg-slate-400',
};

export default function Reports({ onMenuClick, refresh }: ReportsProps) {
  const [customerStats, setCustomerStats] = useState<CustomerStats>({ total: 0, green: 0, yellow: 0, red: 0, gray: 0 });
  const [teamStats, setTeamStats] = useState<TeamStats[]>([]);
  const [typeStats, setTypeStats] = useState<ContactTypeStats[]>([]);
  const [monthlyStats, setMonthlyStats] = useState<MonthlyStats[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAll();
  }, [refresh]);

  async function loadAll() {
    setLoading(true);

    const allCust: { last_contact_at: string | null }[] = [];
    const PAGE_SIZE = 1000;
    let from = 0;
    let hasMore = true;
    while (hasMore) {
      const { data } = await supabase.from('customers').select('last_contact_at').range(from, from + PAGE_SIZE - 1);
      if (data && data.length > 0) {
        allCust.push(...data);
        from += PAGE_SIZE;
        if (data.length < PAGE_SIZE) hasMore = false;
      } else {
        hasMore = false;
      }
    }

    const stats: CustomerStats = { total: allCust.length, green: 0, yellow: 0, red: 0, gray: 0 };
    allCust.forEach(c => stats[getContactStatus(c.last_contact_at)]++);
    setCustomerStats(stats);

    const allContacts: { contact_type: string; contacted_by: string; contacted_at: string }[] = [];
    from = 0;
    hasMore = true;
    while (hasMore) {
      const { data } = await supabase.from('contacts').select('contact_type, contacted_by, contacted_at').order('contacted_at', { ascending: false }).range(from, from + PAGE_SIZE - 1);
      if (data && data.length > 0) {
        allContacts.push(...data);
        from += PAGE_SIZE;
        if (data.length < PAGE_SIZE) hasMore = false;
      } else {
        hasMore = false;
      }
    }

    if (allContacts.length > 0) {
      const teamMap: Record<string, number> = {};
      allContacts.forEach(c => {
        if (c.contacted_by) teamMap[c.contacted_by] = (teamMap[c.contacted_by] ?? 0) + 1;
      });
      setTeamStats(Object.entries(teamMap).map(([rep, count]) => ({ rep, count })).sort((a, b) => b.count - a.count).slice(0, 10));

      const typeMap: Record<string, number> = {};
      allContacts.forEach(c => {
        typeMap[c.contact_type] = (typeMap[c.contact_type] ?? 0) + 1;
      });
      setTypeStats(Object.entries(typeMap).map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count));

      const monthMap: Record<string, number> = {};
      const now = new Date();
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
        monthMap[key] = 0;
      }
      allContacts.forEach(c => {
        const d = new Date(c.contacted_at);
        const key = d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
        if (key in monthMap) monthMap[key] = (monthMap[key] ?? 0) + 1;
      });
      setMonthlyStats(Object.entries(monthMap).map(([month, count]) => ({ month, count })));
    }

    setLoading(false);
  }

  const maxMonthly = Math.max(...monthlyStats.map(m => m.count), 1);
  const maxTeam = Math.max(...teamStats.map(t => t.count), 1);
  const totalContacts = typeStats.reduce((s, t) => s + t.count, 0);

  const statusItems = [
    { label: 'Recente (até 30 dias)', value: customerStats.green, color: 'bg-emerald-500', text: 'text-emerald-700' },
    { label: 'Atenção (90–180 dias)', value: customerStats.yellow, color: 'bg-amber-500', text: 'text-amber-700' },
    { label: 'Urgente (+180 dias)', value: customerStats.red, color: 'bg-red-500', text: 'text-red-700' },
    { label: 'Novos (sem contato)', value: customerStats.gray, color: 'bg-slate-400', text: 'text-slate-600' },
  ];

  return (
    <div className="flex flex-col h-full">
      <Header title="Relatórios" subtitle="Análises e métricas" onMenuClick={onMenuClick} />

      <div className="flex-1 overflow-auto p-4 sm:p-6">
        <div className="space-y-6">
          {loading ? (
            <div className="flex justify-center py-16">
              <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {/* status breakdown */}
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <h3 className="font-bold text-slate-800 mb-1 flex items-center gap-2">
                  <Users size={16} className="text-amber-500" />
                  Clientes por Status de Contato
                </h3>
                <p className="text-xs text-slate-500 mb-4">Total: {customerStats.total} clientes</p>
                <div className="space-y-3">
                  {statusItems.map(item => (
                    <div key={item.label}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm text-slate-600">{item.label}</span>
                        <span className={`text-sm font-bold ${item.text}`}>{item.value}</span>
                      </div>
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${item.color} rounded-full transition-all duration-500`}
                          style={{ width: customerStats.total > 0 ? `${(item.value / customerStats.total) * 100}%` : '0%' }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* monthly contacts */}
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                  <TrendingUp size={16} className="text-amber-500" />
                  Contatos por Mês (últimos 6 meses)
                </h3>
                <div className="flex items-end gap-2 h-32">
                  {monthlyStats.map(m => (
                    <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
                      <span className="text-xs font-medium text-slate-600">{m.count}</span>
                      <div
                        className="w-full bg-amber-400 rounded-t-sm transition-all duration-500 min-h-[4px]"
                        style={{ height: `${(m.count / maxMonthly) * 100}px` }}
                      />
                      <span className="text-xs text-slate-400 text-center leading-tight">{m.month}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* contact type breakdown */}
                <div className="bg-white rounded-xl border border-slate-200 p-5">
                  <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                    <BarChart3 size={16} className="text-amber-500" />
                    Tipo de Contato
                  </h3>
                  {typeStats.length === 0 ? (
                    <p className="text-slate-400 text-sm text-center py-4">Sem dados</p>
                  ) : (
                    <div className="space-y-3">
                      {typeStats.map(t => (
                        <div key={t.type}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm text-slate-600 flex items-center gap-1.5">
                              {CONTACT_TYPE_ICONS[t.type] ?? CONTACT_TYPE_ICONS.other}
                              {CONTACT_TYPE_LABELS[t.type] ?? t.type}
                            </span>
                            <span className="text-sm font-bold text-slate-700">{t.count}</span>
                          </div>
                          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full ${CONTACT_TYPE_COLORS[t.type] ?? 'bg-slate-400'} rounded-full transition-all duration-500`}
                              style={{ width: totalContacts > 0 ? `${(t.count / totalContacts) * 100}%` : '0%' }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* team productivity */}
                <div className="bg-white rounded-xl border border-slate-200 p-5">
                  <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                    <Users size={16} className="text-amber-500" />
                    Produtividade da Equipe
                  </h3>
                  {teamStats.length === 0 ? (
                    <p className="text-slate-400 text-sm text-center py-4">Sem dados</p>
                  ) : (
                    <div className="space-y-3">
                      {teamStats.map((t, i) => (
                        <div key={t.rep} className="flex items-center gap-3">
                          <span className="w-5 h-5 bg-amber-100 text-amber-700 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">
                            {i + 1}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-sm text-slate-600 truncate">{t.rep}</span>
                              <span className="text-sm font-bold text-slate-700 ml-2">{t.count}</span>
                            </div>
                            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-amber-400 rounded-full transition-all duration-500"
                                style={{ width: `${(t.count / maxTeam) * 100}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
