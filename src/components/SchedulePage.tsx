import { useEffect, useState } from 'react';
import { Calendar, CheckCircle, User, Clock } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { ContactSchedule, Customer, formatDateTime } from '../lib/types';
import Header from './Header';

interface SchedulePageProps {
  onSelectCustomer: (id: string) => void;
  onMenuClick: () => void;
  refresh: number;
}

export default function SchedulePage({ onSelectCustomer, onMenuClick, refresh }: SchedulePageProps) {
  const [schedules, setSchedules] = useState<(ContactSchedule & { customers: Customer })[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'pending' | 'completed' | 'all'>('pending');

  useEffect(() => {
    loadSchedules();
  }, [refresh, filter]);

  async function loadSchedules() {
    setLoading(true);
    let query = supabase
      .from('contact_schedules')
      .select('*, customers(*)')
      .order('scheduled_at');

    if (filter === 'pending') query = query.eq('completed', false);
    if (filter === 'completed') query = query.eq('completed', true);

    const { data } = await query;
    if (data) setSchedules(data as (ContactSchedule & { customers: Customer })[]);
    setLoading(false);
  }

  async function completeSchedule(id: string) {
    await supabase.from('contact_schedules').update({ completed: true }).eq('id', id);
    loadSchedules();
  }

  function isOverdue(scheduledAt: string) {
    return !schedules.find(s => s.id === scheduledAt)?.completed && new Date(scheduledAt) < new Date();
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const nextWeek = new Date(today);
  nextWeek.setDate(nextWeek.getDate() + 7);

  function groupLabel(scheduledAt: string) {
    const d = new Date(scheduledAt);
    if (d < today) return 'Atrasados';
    if (d < tomorrow) return 'Hoje';
    if (d < new Date(tomorrow.getTime() + 86400000)) return 'Amanhã';
    if (d < nextWeek) return 'Esta Semana';
    return 'Futuro';
  }

  const grouped = schedules.reduce((acc, s) => {
    const label = groupLabel(s.scheduled_at);
    if (!acc[label]) acc[label] = [];
    acc[label].push(s);
    return acc;
  }, {} as Record<string, typeof schedules>);

  const ORDER = ['Atrasados', 'Hoje', 'Amanhã', 'Esta Semana', 'Futuro'];

  return (
    <div className="flex flex-col h-full">
      <Header title="Agendamentos" subtitle="Contatos programados" onMenuClick={onMenuClick} />

      <div className="flex-1 overflow-auto p-4 sm:p-6 space-y-4">
        {/* tabs */}
        <div className="flex gap-2 bg-slate-100 p-1 rounded-xl w-fit">
          {[
            { value: 'pending', label: 'Pendentes' },
            { value: 'all', label: 'Todos' },
            { value: 'completed', label: 'Concluídos' },
          ].map(tab => (
            <button
              key={tab.value}
              onClick={() => setFilter(tab.value as typeof filter)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                filter === tab.value
                  ? 'bg-white text-slate-800 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-7 h-7 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : schedules.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
            <Calendar size={36} className="text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">Nenhum agendamento {filter === 'pending' ? 'pendente' : filter === 'completed' ? 'concluído' : ''}</p>
          </div>
        ) : (
          ORDER.filter(g => grouped[g]).map(group => (
            <div key={group}>
              <h3 className={`text-xs font-bold uppercase tracking-wide mb-2 ${
                group === 'Atrasados' ? 'text-red-600' : 'text-slate-500'
              }`}>{group}</h3>
              <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
                {grouped[group].map(s => (
                  <div key={s.id} className={`p-4 flex items-start gap-4 ${s.completed ? 'opacity-60' : ''}`}>
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                      s.completed ? 'bg-emerald-50' : group === 'Atrasados' ? 'bg-red-50' : 'bg-amber-50'
                    }`}>
                      {s.completed
                        ? <CheckCircle size={18} className="text-emerald-500" />
                        : <Clock size={18} className={group === 'Atrasados' ? 'text-red-500' : 'text-amber-500'} />
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <button
                        onClick={() => onSelectCustomer(s.customer_id)}
                        className="font-medium text-slate-700 hover:text-amber-600 transition-colors text-sm"
                      >
                        {s.customers?.name ?? 'Cliente'}
                      </button>
                      <p className="text-xs text-slate-400 mt-0.5">{formatDateTime(s.scheduled_at)}</p>
                      {s.assigned_to && (
                        <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                          <User size={10} /> {s.assigned_to}
                        </p>
                      )}
                      {s.notes && <p className="text-xs text-slate-500 mt-1">{s.notes}</p>}
                    </div>
                    {!s.completed && (
                      <button
                        onClick={() => completeSchedule(s.id)}
                        className="flex items-center gap-1.5 text-xs text-emerald-600 hover:text-emerald-700 font-medium transition-colors flex-shrink-0"
                      >
                        <CheckCircle size={14} />
                        Concluir
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
