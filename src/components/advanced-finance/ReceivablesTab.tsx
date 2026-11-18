import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { calculateOrderFinancials, OSPartLike } from '../../lib/osStockSync';
import { FileText, Loader2, RefreshCw, AlertCircle, TrendingUp } from 'lucide-react';

interface ReceivableOrder {
  id: string;
  order_number: number;
  status: string;
  status_financeiro?: string | null;
  due_date: string | null;
  labor_cost: number | null;
  customer_name: string;
  total: number;
  fin_status: 'pago' | 'pendente' | 'atrasado';
}

const fmtCurrency = (v: number | null | undefined) =>
  (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function ReceivablesTab() {
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<ReceivableOrder[]>([]);

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    const { data: ordData } = await supabase.from('service_orders').select('*, customers(name)').order('created_at', { ascending: false });
    const { data: partsData } = await supabase.from('service_order_parts').select('service_order_id,quantity,unit_price,product_id').limit(10000);

    const partsByOrder: Record<string, OSPartLike[]> = {};
    (partsData ?? []).forEach(p => {
      if (!partsByOrder[p.service_order_id]) partsByOrder[p.service_order_id] = [];
      partsByOrder[p.service_order_id].push(p as OSPartLike);
    });

    const enriched: ReceivableOrder[] = (ordData ?? [])
      .filter(o => o.status !== 'Cancelada' && o.status_financeiro !== 'cancelada')
      .map(o => {
        const { grandTotal } = calculateOrderFinancials(partsByOrder[o.id] ?? [], o.labor_cost, true);
        let fin_status: 'pago' | 'pendente' | 'atrasado' = 'pendente';
        if (o.status_financeiro === 'pago') {
          fin_status = 'pago';
        } else if (o.status_financeiro === 'atrasado' || (o.due_date && new Date(o.due_date) < new Date())) {
          fin_status = 'atrasado';
        }

        const customerName = (o as { customers?: { name?: string } | null }).customers?.name ?? '—';
        return {
          id: o.id,
          order_number: o.order_number,
          status: o.status,
          status_financeiro: o.status_financeiro,
          due_date: o.due_date,
          labor_cost: o.labor_cost,
          customer_name: customerName,
          total: grandTotal,
          fin_status,
        };
      });

    setOrders(enriched);
    setLoading(false);
  }

  const indicators = useMemo(() => {
    const pendentes = orders.filter(o => o.fin_status === 'pendente');
    const atrasados = orders.filter(o => o.fin_status === 'atrasado');
    const recebidos = orders.filter(o => o.fin_status === 'pago');

    const totalPendente = pendentes.reduce((acc, o) => acc + o.total, 0);
    const totalAtrasado = atrasados.reduce((acc, o) => acc + o.total, 0);
    const totalRecebido = recebidos.reduce((acc, o) => acc + o.total, 0);
    const ticket = recebidos.length ? totalRecebido / recebidos.length : 0;

    return { totalPendente, totalAtrasado, totalRecebido, ticket };
  }, [orders]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
          <FileText className="text-amber-500" /> Contas a Receber
        </h2>
        <button onClick={loadAll} className="flex items-center gap-2 text-sm text-slate-500 hover:text-amber-600">
          <RefreshCw size={14} /> Atualizar
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-yellow-50 rounded-xl p-4 border border-yellow-100">
          <div className="text-sm text-yellow-700 mb-1">Total Pendente</div>
          <div className="text-2xl font-black text-yellow-600">{fmtCurrency(indicators.totalPendente)}</div>
        </div>
        <div className="bg-red-50 rounded-xl p-4 border border-red-100">
          <div className="text-sm text-red-700 mb-1 flex items-center gap-1"><AlertCircle size={14} /> Total Atrasado</div>
          <div className="text-2xl font-black text-red-600">{fmtCurrency(indicators.totalAtrasado)}</div>
        </div>
        <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-100">
          <div className="text-sm text-emerald-700 mb-1">Total Recebido</div>
          <div className="text-2xl font-black text-emerald-600">{fmtCurrency(indicators.totalRecebido)}</div>
        </div>
        <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
          <div className="text-sm text-blue-700 mb-1 flex items-center gap-1"><TrendingUp size={14} /> Ticket Médio</div>
          <div className="text-2xl font-black text-blue-600">{fmtCurrency(indicators.ticket)}</div>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="animate-spin text-amber-500" /></div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
              <tr>
                <th className="px-4 py-3">OS</th>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Vencimento</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Valor Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {orders.map(o => (
                <tr key={o.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">#{String(o.order_number).padStart(4, '0')}</td>
                  <td className="px-4 py-3">{o.customer_name}</td>
                  <td className="px-4 py-3">{o.due_date ? new Date(o.due_date).toLocaleDateString('pt-BR') : '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${o.fin_status === 'pago' ? 'bg-emerald-100 text-emerald-700' : o.fin_status === 'atrasado' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
                      {o.fin_status.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-slate-700">{fmtCurrency(o.total)}</td>
                </tr>
              ))}
              {orders.length === 0 && <tr><td colSpan={5} className="text-center py-6 text-slate-500">Nenhum registro encontrado</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
