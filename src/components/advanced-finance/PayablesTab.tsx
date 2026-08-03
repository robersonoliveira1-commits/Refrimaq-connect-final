import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Expense, CostCenter } from '../../lib/types';
import { CreditCard, Plus, Loader2, RefreshCw, X, FileText, Trash2, Calendar, AlertCircle } from 'lucide-react';
import imageCompression from 'browser-image-compression';

const fmtCurrency = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function PayablesTab() {
  const [loading, setLoading] = useState(true);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  
  const [filterMode, setFilterMode] = useState<'all' | 'month'>('all');
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  
  const [form, setForm] = useState({
    description: '', category: 'Insumos', amount: '', due_date: '', recurrence: 'única', cost_center_id: ''
  });
  const [file, setFile] = useState<File | null>(null);

  const [paymentType, setPaymentType] = useState<'unico' | 'parcelado'>('unico');
  const [installmentsCount, setInstallmentsCount] = useState(2);
  const [installments, setInstallments] = useState<{ date: string; amount: number }[]>([]);

  useEffect(() => {
    if (paymentType === 'parcelado') {
      const total = parseFloat(form.amount.replace(',', '.'));
      if (isNaN(total) || total <= 0 || !form.due_date) return;
      
      const baseAmount = Math.floor((total / installmentsCount) * 100) / 100;
      const remainder = Math.round((total - (baseAmount * installmentsCount)) * 100) / 100;
      
      const newInst = [];
      const [year, month, day] = form.due_date.split('-').map(Number);
      
      for (let i = 0; i < installmentsCount; i++) {
        const d = new Date(year, month - 1 + i, day);
        const isoDate = d.toISOString().slice(0, 10);
        const isLast = i === installmentsCount - 1;
        newInst.push({
          date: isoDate,
          amount: isLast ? baseAmount + remainder : baseAmount
        });
      }
      setInstallments(newInst);
    }
  }, [form.amount, form.due_date, paymentType, installmentsCount]);

  const handleInstallmentChange = (index: number, field: 'date' | 'amount', value: string) => {
    const newInst = [...installments];
    if (field === 'amount') {
      newInst[index].amount = parseFloat(value.replace(',', '.')) || 0;
    } else {
      newInst[index].date = value;
    }
    setInstallments(newInst);
  };

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    const [{ data: expData }, { data: ccData }] = await Promise.all([
      supabase.from('expenses').select('*'),
      supabase.from('cost_centers').select('*').order('name')
    ]);
    
    const sortedExpenses = (expData || []).sort((a, b) => {
      if (a.status !== b.status) {
        if (a.status === 'pendente') return -1;
        if (b.status === 'pendente') return 1;
      }
      return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
    });
    
    setExpenses(sortedExpenses);
    setCostCenters(ccData || []);
    setLoading(false);
  }

  const totalDebt = expenses.filter(e => e.status === 'pendente').reduce((sum, e) => sum + e.amount, 0);
  const monthlyDebt = expenses.filter(e => e.status === 'pendente' && e.due_date.startsWith(selectedMonth)).reduce((sum, e) => sum + e.amount, 0);
  
  const filteredExpenses = filterMode === 'all' 
    ? expenses 
    : expenses.filter(e => e.due_date.startsWith(selectedMonth));

  async function handleSave() {
    if (!form.description || !form.amount || !form.due_date) return;
    setSaving(true);

    let url = '';
    if (file) {
      try {
        const comp = await imageCompression(file, { maxSizeMB: 0.5, maxWidthOrHeight: 1024 });
        const name = `${Date.now()}_${file.name}`;
        const { data: dUpload, error: upErr } = await supabase.storage.from('company-assets').upload(`receipts/${name}`, comp);
        if (!upErr && dUpload) {
          const { data: dUrl } = supabase.storage.from('company-assets').getPublicUrl(dUpload.path);
          url = dUrl.publicUrl;
        }
      } catch (e) {
        console.error(e);
      }
    }

    const val = parseFloat(form.amount.replace(',', '.'));
    
    if (paymentType === 'parcelado') {
      const inserts = installments.map((inst, i) => ({
        description: `${form.description} - Parcela ${i + 1}/${installmentsCount}`,
        category: form.category,
        amount: inst.amount,
        due_date: inst.date,
        status: 'pendente',
        recurrence: 'única',
        attachment_url: url,
        cost_center_id: form.cost_center_id || null
      }));
      await supabase.from('expenses').insert(inserts);
    } else {
      await supabase.from('expenses').insert([{
        description: form.description,
        category: form.category,
        amount: val,
        due_date: form.due_date,
        status: 'pendente',
        recurrence: form.recurrence,
        attachment_url: url,
        cost_center_id: form.cost_center_id || null
      }]);
    }

    setSaving(false);
    setShowModal(false);
    setForm({ description: '', category: 'Insumos', amount: '', due_date: '', recurrence: 'única', cost_center_id: '' });
    setFile(null);
    setPaymentType('unico');
    loadAll();
  }

  async function toggleStatus(expense: Expense) {
    const isPago = expense.status === 'pago';
    await supabase.from('expenses').update({
      status: isPago ? 'pendente' : 'pago',
      paid_at: isPago ? null : new Date().toISOString()
    }).eq('id', expense.id);
    loadAll();
  }

  async function handleDelete(expense: Expense) {
    if (!confirm('Tem certeza que deseja excluir esta conta a pagar?')) return;
    const { error } = await supabase.from('expenses').delete().eq('id', expense.id);
    if (error) alert('Erro ao excluir conta.');
    else loadAll();
  }

  const getVisualStatus = (e: Expense) => {
    if (e.status === 'pago') return { text: 'PAGO', color: 'bg-emerald-100 text-emerald-700' };
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(e.due_date + 'T12:00:00Z');
    due.setHours(0, 0, 0, 0);
    const diffTime = due.getTime() - today.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) return { text: 'ATRASADO', color: 'bg-red-100 text-red-700 border border-red-300 shadow-sm' };
    if (diffDays === 0) return { text: 'VENCE HOJE', color: 'bg-orange-100 text-orange-700 font-bold border border-orange-300 shadow-sm animate-pulse' };
    if (diffDays <= 5) return { text: `VENCE EM ${diffDays} DIAS`, color: 'bg-orange-50 text-orange-700 font-semibold border border-orange-200' };
    return { text: 'PENDENTE', color: 'bg-yellow-100 text-yellow-700' };
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
          <CreditCard className="text-amber-500" /> Contas a Pagar
        </h2>
        <div className="flex items-center gap-4">
          <div className="flex items-center bg-slate-100 p-1 rounded-xl">
            <button 
              onClick={() => setFilterMode('all')} 
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${filterMode === 'all' ? 'bg-white text-amber-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Todas
            </button>
            <button 
              onClick={() => setFilterMode('month')} 
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${filterMode === 'month' ? 'bg-white text-amber-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Por Mês
            </button>
          </div>
          
          {filterMode === 'month' && (
            <div className="flex items-center gap-2">
              <Calendar size={16} className="text-slate-500" />
              <input
                type="month"
                value={selectedMonth}
                onChange={e => setSelectedMonth(e.target.value)}
                className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm text-slate-700 bg-white"
              />
            </div>
          )}
          
          <button onClick={loadAll} className="flex items-center gap-2 text-sm text-slate-500 hover:text-amber-600 px-3 py-2">
            <RefreshCw size={14} /> Atualizar
          </button>
          <button onClick={() => setShowModal(true)} className="flex items-center gap-2 text-sm text-white bg-amber-500 hover:bg-amber-600 px-4 py-2 rounded-xl font-medium">
            <Plus size={14} /> Nova Despesa
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl p-5 border border-slate-200 flex flex-col justify-center">
          <div className="text-sm font-semibold text-slate-500 mb-2 flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-red-100 text-red-600 flex items-center justify-center"><AlertCircle size={16} /></div>
            Total de Dívidas (Geral)
          </div>
          <div className="text-2xl font-black text-slate-800">{fmtCurrency(totalDebt)}</div>
        </div>
        <div className="bg-white rounded-xl p-5 border border-slate-200 flex flex-col justify-center">
          <div className="text-sm font-semibold text-slate-500 mb-2 flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center"><Calendar size={16} /></div>
            Dívidas do Mês ({selectedMonth.split('-').reverse().join('/')})
          </div>
          <div className="text-2xl font-black text-slate-800">{fmtCurrency(monthlyDebt)}</div>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="animate-spin text-amber-500" /></div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
              <tr>
                <th className="px-4 py-3">Descrição</th>
                <th className="px-4 py-3">Categoria</th>
                <th className="px-4 py-3">Centro de Custo</th>
                <th className="px-4 py-3">Vencimento</th>
                <th className="px-4 py-3 text-right">Valor</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredExpenses.map(e => (
                <tr key={e.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-700">{e.description}</td>
                  <td className="px-4 py-3">{e.category}</td>
                  <td className="px-4 py-3">{costCenters.find(c => c.id === e.cost_center_id)?.name || '—'}</td>
                  <td className="px-4 py-3">{new Date(e.due_date).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}</td>
                  <td className="px-4 py-3 text-right font-bold">{fmtCurrency(e.amount)}</td>
                  <td className="px-4 py-3 text-center">
                    <button onClick={() => toggleStatus(e)} className={`px-2 py-1.5 rounded-lg text-[10px] sm:text-xs font-bold cursor-pointer transition-all hover:opacity-80 ${getVisualStatus(e).color}`}>
                      {getVisualStatus(e).text}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-2">
                      {e.attachment_url && (
                        <a href={e.attachment_url} target="_blank" rel="noreferrer" className="text-amber-500 hover:text-amber-600 flex items-center gap-1 text-xs font-medium" title="Ver anexo">
                          <FileText size={16} />
                        </a>
                      )}
                      <button onClick={() => handleDelete(e)} className="text-red-400 hover:text-red-600 p-1 rounded-lg transition-colors" title="Excluir">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredExpenses.length === 0 && <tr><td colSpan={7} className="text-center py-6 text-slate-500">Nenhuma despesa encontrada para este período.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-800">Nova Despesa</h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:bg-slate-100 p-1 rounded-lg"><X size={16} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Descrição</label>
                <input value={form.description} onChange={e => setForm({...form, description: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Ex: Conta de Luz" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Categoria</label>
                  <select value={form.category} onChange={e => setForm({...form, category: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm">
                    <option>Insumos</option><option>Ferramentas</option><option>Aluguel</option><option>Marketing</option><option>Outros</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Centro de Custo</label>
                  <select value={form.cost_center_id} onChange={e => setForm({...form, cost_center_id: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm">
                    <option value="">(Nenhum)</option>
                    {costCenters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Valor (R$)</label>
                  <input type="number" step="0.01" value={form.amount} onChange={e => setForm({...form, amount: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Vencimento {paymentType === 'parcelado' ? '(1ª Parcela)' : ''}</label>
                  <input type="date" value={form.due_date} onChange={e => setForm({...form, due_date: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>

              <div className="flex gap-4 items-center">
                <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                  <input type="radio" checked={paymentType === 'unico'} onChange={() => setPaymentType('unico')} className="text-amber-500" />
                  Pagamento Único
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                  <input type="radio" checked={paymentType === 'parcelado'} onChange={() => setPaymentType('parcelado')} className="text-amber-500" />
                  Parcelado
                </label>
              </div>

              {paymentType === 'parcelado' && (
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Quantidade de Parcelas</label>
                    <input type="number" min="2" max="120" value={installmentsCount} onChange={e => setInstallmentsCount(parseInt(e.target.value) || 2)} className="w-full border rounded-lg px-3 py-2 text-sm" />
                  </div>
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-2">
                    {installments.map((inst, idx) => (
                      <div key={idx} className="flex gap-2 items-center">
                        <span className="text-xs font-medium text-slate-500 w-16">{idx + 1}ª Parc.</span>
                        <input type="date" value={inst.date} onChange={e => handleInstallmentChange(idx, 'date', e.target.value)} className="flex-1 border rounded-lg px-2 py-1.5 text-xs" />
                        <div className="flex-1 relative">
                          <span className="absolute left-2 top-2 text-xs text-slate-400">R$</span>
                          <input type="number" step="0.01" value={inst.amount} onChange={e => handleInstallmentChange(idx, 'amount', e.target.value)} className="w-full border rounded-lg pl-7 pr-2 py-1.5 text-xs" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Anexar Comprovante</label>
                <input type="file" onChange={e => setFile(e.target.files?.[0] || null)} className="w-full border rounded-lg px-3 py-2 text-sm file:mr-4 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-amber-50 file:text-amber-700 hover:file:bg-amber-100" />
              </div>
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end">
              <button disabled={saving} onClick={handleSave} className="bg-amber-500 hover:bg-amber-600 text-white font-medium rounded-xl px-6 py-2.5 flex items-center gap-2">
                {saving ? <Loader2 size={16} className="animate-spin" /> : 'Salvar Despesa'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
