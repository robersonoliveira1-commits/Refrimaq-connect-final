import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { Users, Loader2, TrendingUp, Clock, Settings, RotateCcw, ArrowLeft, FileText, Search } from 'lucide-react';

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

  const [selectedTech, setSelectedTech] = useState<{id: string, name: string} | null>(null);

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

  if (selectedTech) {
    return (
      <TechOrdersDetails 
        tech={selectedTech} 
        dateFrom={dateFrom} 
        dateTo={dateTo} 
        onBack={() => setSelectedTech(null)} 
      />
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
          <Users className="text-amber-500" /> Desempenho Técnico
        </h2>
        
        <div className="flex items-center gap-2 bg-white rounded-xl border border-slate-200 p-2">
          <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} className="text-sm px-2 py-1 outline-none text-slate-600" />
          <span className="text-slate-300">até</span>
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
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
                <tr>
                  <th className="px-4 py-3">Técnico</th>
                  <th className="px-4 py-3 text-center">Serviços Concluídos</th>
                  <th className="px-4 py-3 text-center">Tempo Médio (Hrs)</th>
                  <th className="px-4 py-3 text-center">Índice Retrabalho</th>
                  <th className="px-4 py-3 text-right">Faturamento (MO)</th>
                  <th className="px-4 py-3 text-center">Ações</th>
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
                    <td className="px-4 py-3 text-center">
                      <button 
                        onClick={() => setSelectedTech({id: st.id, name: st.name})}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-blue-500 rounded-lg hover:bg-blue-600 transition-colors"
                      >
                        <Search size={14} /> Detalhes
                      </button>
                    </td>
                  </tr>
                ))}
                {stats.length === 0 && <tr><td colSpan={6} className="text-center py-6 text-slate-500">Nenhum técnico encontrado</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// Sub-componente para exibir os detalhes das ordens
function TechOrdersDetails({ tech, dateFrom, dateTo, onBack }: { tech: {id: string, name: string}, dateFrom: string, dateTo: string, onBack: () => void }) {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadOrders() {
      setLoading(true);
      const { data } = await supabase.from('service_orders')
        .select(`
          id, 
          order_number, 
          created_at, 
          data_conclusao, 
          labor_cost, 
          status, 
          status_financeiro, 
          payment_method, 
          equip_type, 
          equip_brand,
          is_rework,
          customers ( name )
        `)
        .eq('technician_id', tech.id)
        .eq('status', 'Concluída')
        .gte('data_conclusao', dateFrom)
        .lte('data_conclusao', dateTo + 'T23:59:59Z')
        .order('data_conclusao', { ascending: false });
        
      setOrders(data || []);
      setLoading(false);
    }
    loadOrders();
  }, [tech.id, dateFrom, dateTo]);

  const totalLabor = orders.reduce((acc, o) => acc + (Number(o.labor_cost) || 0), 0);

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button 
            onClick={onBack}
            className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors"
            title="Voltar"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <FileText className="text-blue-500" /> Detalhamento de Ordens
            </h2>
            <p className="text-sm text-slate-500">Técnico: <span className="font-semibold text-slate-700">{tech.name}</span></p>
          </div>
        </div>
        
        <div className="bg-white rounded-xl border border-slate-200 px-4 py-2 flex items-center gap-3">
          <div className="text-sm text-slate-500">Total Mão de Obra:</div>
          <div className="text-lg font-black text-green-600">{fmtCurrency(totalLabor)}</div>
        </div>
      </div>

      {loading ? (
         <div className="flex justify-center py-10"><Loader2 className="animate-spin text-blue-500" /></div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
                <tr>
                  <th className="px-4 py-3">Nº OS</th>
                  <th className="px-4 py-3">Data Conclusão</th>
                  <th className="px-4 py-3">Cliente</th>
                  <th className="px-4 py-3">Equipamento</th>
                  <th className="px-4 py-3 text-center">Retrabalho</th>
                  <th className="px-4 py-3 text-center">Financeiro</th>
                  <th className="px-4 py-3 text-right">Valor (M.O.)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {orders.map(o => (
                  <tr key={o.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-bold text-slate-700">#{o.order_number}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {o.data_conclusao ? new Date(o.data_conclusao).toLocaleDateString('pt-BR') : '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-800 font-medium">
                      {o.customers?.name || 'Cliente Excluído'}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {o.equip_type} {o.equip_brand ? `- ${o.equip_brand}` : ''}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {o.is_rework ? (
                        <span className="px-2 py-1 rounded-md text-[10px] font-bold bg-red-100 text-red-700 uppercase">Sim</span>
                      ) : (
                        <span className="px-2 py-1 rounded-md text-[10px] font-bold bg-slate-100 text-slate-500 uppercase">Não</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        o.status_financeiro?.toLowerCase() === 'pago' 
                          ? 'bg-emerald-100 text-emerald-700'
                          : o.status_financeiro?.toLowerCase() === 'cancelada' 
                          ? 'bg-red-100 text-red-700'
                          : 'bg-amber-100 text-amber-700'
                      }`}>
                        {o.status_financeiro || 'Pendente'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-green-600">
                      {fmtCurrency(Number(o.labor_cost) || 0)}
                    </td>
                  </tr>
                ))}
                {orders.length === 0 && (
                  <tr><td colSpan={7} className="text-center py-6 text-slate-500">Nenhuma ordem encontrada neste período.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
