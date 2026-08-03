import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { BarChart3, TrendingUp, TrendingDown, DollarSign, Download } from 'lucide-react';
import { Expense } from '../../lib/types';

const fmtCurrency = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function CashFlowTab() {
  const [loading, setLoading] = useState(true);
  const [incomes, setIncomes] = useState<{ date: string; amount: number }[]>([]);
  const [expenses, setExpenses] = useState<{ date: string; amount: number }[]>([]);
  const [transactions, setTransactions] = useState<{ id: string; date: string; datetime: string; description: string; type: 'entrada'|'saida'; amount: number }[]>([]);
  const [filterType, setFilterType] = useState<'todos' | 'entrada' | 'saida'>('todos');

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    // Fetch incomes from service_orders, used_item_sales, and sales
    const [
      { data: osData },
      { data: usedSalesData },
      { data: salesData },
      { data: expData }
    ] = await Promise.all([
      supabase.from('service_orders').select('id, paid_at, created_at, labor_cost, order_number').eq('status_financeiro', 'pago'),
      supabase.from('used_item_sales').select('id, created_at, total').eq('status', 'Paga'),
      supabase.from('sales').select('id, created_at, total'), // Legacy or standalone sales
      supabase.from('expenses').select('id, paid_at, amount, description, created_at').eq('status', 'pago')
    ]);

    // For service orders we must fetch parts_total to know the real total, but since we didn't join service_order_parts in the above query for simplicity,
    // actually, let's fetch total directly from an RPC or just approximate with labor_cost if parts are too heavy to fetch here.
    // Wait, the main dashboard fetches `service_order_parts`. Cash flow should too.
    const { data: partsData } = await supabase.from('service_order_parts').select('service_order_id, quantity, unit_price, product_id');
    const partsMap: Record<string, number> = {};
    (partsData || []).forEach(p => {
      if (p.product_id) {
        partsMap[p.service_order_id] = (partsMap[p.service_order_id] || 0) + (p.quantity * p.unit_price);
      }
    });

    const incs: { date: string; amount: number }[] = [];
    const exps: { date: string; amount: number }[] = [];
    const allTrans: { id: string; date: string; datetime: string; description: string; type: 'entrada'|'saida'; amount: number }[] = [];
    
    (osData || []).forEach((o: any) => {
      const pt = partsMap[o.id] || 0;
      const amt = pt + (o.labor_cost || 0);
      const datetime = o.paid_at || o.created_at;
      const dt = datetime.slice(0, 10);
      incs.push({ date: dt, amount: amt });
      allTrans.push({ id: o.id, date: dt, datetime, description: `Ordem de Serviço #${o.order_number}`, type: 'entrada', amount: amt });
    });

    (usedSalesData || []).forEach((s: any) => {
      const datetime = s.created_at;
      const dt = datetime.slice(0, 10);
      incs.push({ date: dt, amount: s.total || 0 });
      allTrans.push({ id: s.id, date: dt, datetime, description: `Venda de Usado`, type: 'entrada', amount: s.total || 0 });
    });

    (salesData || []).forEach(s => {
      const datetime = s.created_at;
      const dt = datetime.slice(0, 10);
      incs.push({ date: dt, amount: s.total || 0 });
      allTrans.push({ id: s.id, date: dt, datetime, description: `Venda PDV`, type: 'entrada', amount: s.total || 0 });
    });

    (expData || []).forEach(e => {
      const datetime = e.paid_at || e.created_at;
      const dt = datetime.slice(0, 10);
      exps.push({ date: dt, amount: e.amount });
      allTrans.push({ id: e.id, date: dt, datetime, description: e.description || 'Despesa', type: 'saida', amount: e.amount });
    });

    setIncomes(incs);
    setExpenses(exps);
    setTransactions(allTrans.sort((a, b) => new Date(b.datetime).getTime() - new Date(a.datetime).getTime()));
    setLoading(false);
  }

  const chartData = useMemo(() => {
    const map: Record<string, { in: number; out: number }> = {};
    const today = new Date();
    
    // Ultimos 6 meses
    for (let i = 5; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const k = d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
      map[k] = { in: 0, out: 0 };
    }

    incomes.forEach(inc => {
      const k = new Date(inc.date).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
      if (map[k]) map[k].in += inc.amount;
    });

    expenses.forEach(exp => {
      const k = new Date(exp.date).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
      if (map[k]) map[k].out += exp.amount;
    });

    return Object.entries(map).map(([month, vals]) => ({ month, in: vals.in, out: vals.out, bal: vals.in - vals.out }));
  }, [incomes, expenses]);

  const indicators = useMemo(() => {
    const totalIn = incomes.reduce((s, i) => s + i.amount, 0);
    const totalOut = expenses.reduce((s, e) => s + e.amount, 0);
    return { totalIn, totalOut, balance: totalIn - totalOut };
  }, [incomes, expenses]);

  const visibleTransactions = transactions.filter(t => filterType === 'todos' ? true : t.type === filterType);

  function handleExportCSV() {
    const headers = ['Data', 'Descrição', 'Tipo', 'Valor (R$)'];
    const rows = visibleTransactions.map(t => [
      new Date(t.date).toLocaleDateString('pt-BR', { timeZone: 'UTC' }),
      `"${t.description.replace(/"/g, '""')}"`,
      t.type === 'entrada' ? 'Entrada' : 'Saída',
      t.amount.toFixed(2).replace('.', ',')
    ]);
    
    const csvContent = [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
    const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `extrato_financeiro_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  return (
    <div className="p-6 space-y-6">
      <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
        <BarChart3 className="text-amber-500" /> Fluxo de Caixa
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl p-5 border border-slate-200">
          <div className="text-sm font-semibold text-slate-500 mb-2 flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center"><TrendingUp size={16} /></div>
            Entradas
          </div>
          <div className="text-2xl font-black text-slate-800">{fmtCurrency(indicators.totalIn)}</div>
        </div>
        <div className="bg-white rounded-xl p-5 border border-slate-200">
          <div className="text-sm font-semibold text-slate-500 mb-2 flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-red-100 text-red-600 flex items-center justify-center"><TrendingDown size={16} /></div>
            Saídas
          </div>
          <div className="text-2xl font-black text-slate-800">{fmtCurrency(indicators.totalOut)}</div>
        </div>
        <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
          <div className="text-sm font-semibold text-slate-400 mb-2 flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-slate-700 text-white flex items-center justify-center"><DollarSign size={16} /></div>
            Saldo Total
          </div>
          <div className={`text-2xl font-black ${indicators.balance >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {fmtCurrency(indicators.balance)}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h3 className="font-bold text-slate-800 mb-6">Comparativo Mensal</h3>
        <div className="h-64 flex items-end gap-2 mb-8">
          {chartData.map((d, i) => {
            const maxVal = Math.max(...chartData.map(c => Math.max(c.in, c.out)), 1);
            return (
              <div key={i} className="flex-1 flex flex-col items-center justify-end h-full gap-2 relative group">
                <div className="w-full flex justify-center gap-1 items-end h-full relative">
                  {/* Entradas */}
                  <div className="w-1/3 bg-emerald-400 rounded-t-sm transition-all duration-300 min-h-[4px]" style={{ height: `${(d.in / maxVal) * 100}%` }}></div>
                  {/* Saidas */}
                  <div className="w-1/3 bg-red-400 rounded-t-sm transition-all duration-300 min-h-[4px]" style={{ height: `${(d.out / maxVal) * 100}%` }}></div>
                </div>
                <span className="text-[10px] text-slate-400 font-medium">{d.month}</span>
                
                {/* Tooltip */}
                <div className="absolute bottom-full mb-2 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-800 text-white text-xs rounded-lg p-3 w-40 z-10 pointer-events-none shadow-xl border border-slate-700">
                  <div className="font-bold mb-2 border-b border-slate-700 pb-1">{d.month}</div>
                  <div className="flex justify-between text-emerald-400 mb-1"><span>Entradas:</span> <span>{fmtCurrency(d.in)}</span></div>
                  <div className="flex justify-between text-red-400 mb-1"><span>Saídas:</span> <span>{fmtCurrency(d.out)}</span></div>
                  <div className="flex justify-between text-white font-bold mt-2 pt-1 border-t border-slate-700"><span>Saldo:</span> <span>{fmtCurrency(d.bal)}</span></div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="border-t border-slate-200 pt-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
            <div className="flex items-center gap-4">
              <h3 className="font-bold text-slate-800">Extrato Detalhado</h3>
              <div className="flex bg-slate-100 p-1 rounded-lg">
                <button
                  onClick={() => setFilterType('todos')}
                  className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${filterType === 'todos' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  Todos
                </button>
                <button
                  onClick={() => setFilterType('entrada')}
                  className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${filterType === 'entrada' ? 'bg-emerald-100 text-emerald-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  Entradas
                </button>
                <button
                  onClick={() => setFilterType('saida')}
                  className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${filterType === 'saida' ? 'bg-red-100 text-red-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  Saídas
                </button>
              </div>
            </div>
            <button
              onClick={handleExportCSV}
              className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-lg text-sm font-semibold transition-colors"
            >
              <Download size={16} />
              Exportar
            </button>
          </div>
          <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
            {visibleTransactions.map((t, idx) => (
              <div key={`${t.id}-${idx}`} className="flex items-center justify-between p-3 rounded-lg border border-slate-100 bg-slate-50 hover:bg-white transition-colors">
                <div className="flex flex-col">
                  <span className="text-sm font-semibold text-slate-700">{t.description}</span>
                  <span className="text-xs text-slate-400">{new Date(t.date).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}</span>
                </div>
                <div className={`font-bold text-sm ${t.type === 'entrada' ? 'text-emerald-600' : 'text-red-500'}`}>
                  {t.type === 'entrada' ? '+' : '-'} {fmtCurrency(t.amount)}
                </div>
              </div>
            ))}
            {visibleTransactions.length === 0 && (
              <div className="text-center py-8 text-slate-400 text-sm">
                Nenhuma movimentação encontrada para o filtro selecionado.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
