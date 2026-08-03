import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { Users, Loader2, TrendingUp, Clock, Settings, RotateCcw } from 'lucide-react';
import { ServiceOrder } from '../../lib/types';

const fmtCurrency = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

interface TechStats {
  id: string;
  name: string;
  servicesDone: number;
  laborRevenue: number;
  avgTimeHrs: number;
  reworkCount: number;
  reworkRate: number;
}

export default function TechnicianPerformanceTab() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<TechStats[]>([]);
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0,10);
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0,10));

  useEffect(() => { loadAll(); }, [dateFrom, dateTo]);

  async function loadAll() {
    setLoading(true);
    const { data: techData } = await supabase.from('user_profiles').select('id, full_name').eq('active', true);
    const { data: osData } = await supabase.from('service_orders')
      .select('id, technician_id, labor_cost, created_at, data_conclusao, is_rework, status')
      .eq('status', 'Concluída')
      .gte('data_conclusao', dateFrom)
      .lte('data_conclusao', dateTo + 'T23:59:59Z');

    const techs = techData || [];
    const osList = (osData || []) as any[];

    const statsMap: Record<string, TechStats> = {};
    techs.forEach(t => {
      statsMap[t.id] = { id: t.id, name: t.full_name, servicesDone: 0, laborRevenue: 0, avgTimeHrs: 0, reworkCount: 0, reworkRate: 0 };
    });

    const timeAcc: Record<string, number[]> = {};

    osList.forEach(os => {
      const tid = os.technician_id;
      if (!tid || !statsMap[tid]) return;

      statsMap[tid].servicesDone += 1;
      statsMap[tid].laborRevenue += (os.labor_cost || 0);
      if (os.is_rework) {
        statsMap[tid].reworkCount += 1;
      }

      if (os.created_at && os.data_conclusao) {
        const start = new Date(os.created_at).getTime();
        const end = new Date(os.data_conclusao).getTime();
        const diffHrs = (end - start) / (1000 * 60 * 60);
        if (diffHrs > 0) {
          if (!timeAcc[tid]) timeAcc[tid] = [];
          timeAcc[tid].push(diffHrs);
        }
      }
    });

    const finalStats = Object.values(statsMap).map(st => {
      if (timeAcc[st.id] && timeAcc[st.id].length > 0) {
        st.avgTimeHrs = timeAcc[st.id].reduce((a,b)=>a+b, 0) / timeAcc[st.id].length;
      }
      if (st.servicesDone > 0) {
        st.reworkRate = (st.reworkCount / st.servicesDone) * 100;
      }
      return st;
    }).sort((a,b) => b.laborRevenue - a.laborRevenue);

    setStats(finalStats);
    setLoading(false);
  }

  const totals = useMemo(() => {
    return stats.reduce((acc, st) => {
      acc.services += st.servicesDone;
      acc.revenue += st.laborRevenue;
      acc.reworks += st.reworkCount;
      return acc;
    }, { services: 0, revenue: 0, reworks: 0 });
  }, [stats]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
          <Users className="text-amber-500" /> Desempenho Técnico
        </h2>
        
        <div className="flex items-center gap-2 bg-white rounded-xl border border-slate-200 p-2">
          <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} className="text-sm px-2 py-1 outline-none text-slate-600" />
          <span className="text-slate-300">ate</span>
          <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)} className="text-sm px-2 py-1 outline-none text-slate-600" />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl p-5 border border-slate-200">
          <div className="text-sm font-semibold text-slate-500 mb-2 flex items-center gap-2">
            <Settings size={16} className="text-blue-500" /> Total Serviços (Período)
          </div>
          <div className="text-2xl font-black text-slate-800">{totals.services}</div>
        </div>
        <div className="bg-white rounded-xl p-5 border border-slate-200">
          <div className="text-sm font-semibold text-slate-500 mb-2 flex items-center gap-2">
            <TrendingUp size={16} className="text-green-500" /> Faturamento Mão de Obra
          </div>
          <div className="text-2xl font-black text-green-600">{fmtCurrency(totals.revenue)}</div>
        </div>
        <div className="bg-white rounded-xl p-5 border border-slate-200">
          <div className="text-sm font-semibold text-slate-500 mb-2 flex items-center gap-2">
            <RotateCcw size={16} className="text-red-500" /> Retrabalhos Totais
          </div>
          <div className="text-2xl font-black text-red-600">{totals.reworks}</div>
        </div>
      </div>

      {loading ? (
         <div className="flex justify-center py-10"><Loader2 className="animate-spin text-amber-500" /></div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
              <tr>
                <th className="px-4 py-3">Técnico</th>
                <th className="px-4 py-3 text-center">Serviços Concluídos</th>
                <th className="px-4 py-3 text-center">Tempo Médio (Hrs)</th>
                <th className="px-4 py-3 text-center">Índice Retrabalho</th>
                <th className="px-4 py-3 text-right">Faturamento (Mão de Obra)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {stats.map(st => (
                <tr key={st.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-semibold text-slate-800">{st.name}</td>
                  <td className="px-4 py-3 text-center font-medium">{st.servicesDone}</td>
                  <td className="px-4 py-3 text-center">
                    <span className="flex items-center justify-center gap-1">
                      <Clock size={12} className="text-slate-400" />
                      {st.avgTimeHrs.toFixed(1)}h
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-1 rounded-full text-xs font-bold ${st.reworkRate > 10 ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                      {st.reworkRate.toFixed(1)}%
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-green-600">
                    {fmtCurrency(st.laborRevenue)}
                  </td>
                </tr>
              ))}
              {stats.length === 0 && <tr><td colSpan={5} className="text-center py-6 text-slate-500">Nenhum técnico encontrado</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
