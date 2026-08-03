import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { UsedItemSale } from '../lib/types';
import { DollarSign, Tag, Calendar, Download, Eye, FileText, FileDown, Search } from 'lucide-react';
import { generateUsedSalePdf } from '../utils/usedSalePdf';
import { fetchCompanyConfig } from '../lib/companyConfig';

export default function UsedSalesControlTab() {
  const [sales, setSales] = useState<UsedItemSale[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('');

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from('used_item_sales')
      .select('*, used_items(*)')
      .order('created_at', { ascending: false });
      
    if (data) setSales(data.map(d => ({ ...d, used_item: d.used_items })) as any);
    setLoading(false);
  }

  const filtered = useMemo(() => {
    return sales.filter(s => {
      if (dateFrom && s.created_at.slice(0, 10) < dateFrom) return false;
      if (dateTo && s.created_at.slice(0, 10) > dateTo) return false;
      if (paymentFilter && s.payment_method !== paymentFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        const itemName = s.used_item?.name?.toLowerCase() || '';
        const custName = s.customer_name.toLowerCase();
        if (!itemName.includes(q) && !custName.includes(q)) return false;
      }
      return true;
    });
  }, [sales, search, dateFrom, dateTo, paymentFilter]);

  const indicators = useMemo(() => {
    const totalRevenue = filtered.reduce((acc, s) => acc + s.total, 0);
    const ticket = filtered.length ? totalRevenue / filtered.length : 0;
    return { totalRevenue, totalSales: filtered.length, ticket };
  }, [filtered]);

  async function downloadPdf(sale: UsedItemSale) {
    const cfg = await fetchCompanyConfig();
    generateUsedSalePdf(sale, cfg);
  }

  function downloadCsv() {
    const header = 'ID,Data,Cliente,Telefone,Item,Valor,Pagamento,Status\n';
    const rows = filtered.map(s => 
      `${s.id},${s.created_at.slice(0,10)},"${s.customer_name}","${s.customer_phone || ''}","${s.used_item?.name || 'Item Removido'}",${s.total},${s.payment_method},${s.status}`
    ).join('\n');
    
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vendas_usados_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
  }

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center gap-2 text-slate-500 mb-2 font-medium">
            <DollarSign size={18} className="text-emerald-500" />
            Receita Total (Filtro)
          </div>
          <div className="text-2xl font-black text-slate-800">
            {indicators.totalRevenue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center gap-2 text-slate-500 mb-2 font-medium">
            <Tag size={18} className="text-amber-500" />
            Quantidade de Vendas
          </div>
          <div className="text-2xl font-black text-slate-800">{indicators.totalSales}</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center gap-2 text-slate-500 mb-2 font-medium">
            <FileText size={18} className="text-blue-500" />
            Ticket Médio
          </div>
          <div className="text-2xl font-black text-slate-800">
            {indicators.ticket.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-100 flex flex-wrap gap-3 items-center justify-between">
          <div className="flex flex-wrap gap-3 flex-1">
            <div className="relative w-full max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input type="text" placeholder="Buscar cliente ou item..." value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500/30" />
            </div>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-2 text-sm" />
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-2 text-sm" />
            <select value={paymentFilter} onChange={e => setPaymentFilter(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-2 text-sm">
              <option value="">Todos Pagamentos</option>
              <option value="Dinheiro">Dinheiro</option>
              <option value="Pix">Pix</option>
              <option value="Cartão de Débito">Cartão de Débito</option>
              <option value="Cartão de Crédito">Cartão de Crédito</option>
              <option value="Transferência">Transferência</option>
            </select>
          </div>
          <button onClick={downloadCsv} className="flex items-center gap-2 bg-slate-800 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-900 transition-colors">
            <FileDown size={16} /> Exportar CSV
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase text-xs">
              <tr>
                <th className="px-4 py-3">Data</th>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Item Vendido</th>
                <th className="px-4 py-3">Valor</th>
                <th className="px-4 py-3">Pagamento</th>
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(s => (
                <tr key={s.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                  <td className="px-4 py-3 text-slate-500">{new Date(s.created_at).toLocaleDateString('pt-BR')}</td>
                  <td className="px-4 py-3 font-medium text-slate-800">
                    {s.customer_name}
                    {s.customer_phone && <span className="block text-xs text-slate-400 font-normal">{s.customer_phone}</span>}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {s.used_item?.name || 'Item Removido'}
                    {s.used_item && <span className="block text-xs text-slate-400">{s.used_item.category}</span>}
                  </td>
                  <td className="px-4 py-3 font-bold text-emerald-600">{s.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                  <td className="px-4 py-3">
                    <span className="bg-slate-100 text-slate-600 px-2 py-1 rounded-md text-xs font-medium">{s.payment_method}</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => downloadPdf(s)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Gerar Recibo PDF">
                      <Download size={16} />
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-slate-400">
                    Nenhuma venda encontrada para os filtros selecionados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
