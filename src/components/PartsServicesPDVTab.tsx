import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { Customer, Product, Service, SalesBudget } from '../lib/types';
import { fetchCompanyConfig, CompanyConfig, EMPTY_CONFIG } from '../lib/companyConfig';
import { Search, Plus, Minus, Trash2, CheckCircle2, FileText, ShoppingCart, Loader2, Tag, User, Package, Calculator, DollarSign, FolderOpen, X, Edit, Save, FilePlus2 } from 'lucide-react';
import { printHtml } from '../utils/print';

// ─── Format Utils ─────────────────────────────────────────────────────────────
function fmtCurrency(val: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
}
function formatDateTime(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleString('pt-BR');
}

// ─── Interfaces ───────────────────────────────────────────────────────────────
interface CartItem {
  id: string; // Will use product.id or service.id
  type: 'product' | 'service';
  name: string;
  unit_price: number;
  quantity: number;
  max_quantity?: number; // for products
}

export default function PartsServicesPDVTab() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [config, setConfig] = useState<CompanyConfig>(EMPTY_CONFIG);
  const [loading, setLoading] = useState(true);

  // PDV State
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [paymentMethod, setPaymentMethod] = useState('PIX');
  const [statusFinanceiro, setStatusFinanceiro] = useState<'Pago' | 'Pendente'>('Pago');
  const [discount, setDiscount] = useState<number>(0);
  
  // Search States
  const [customerSearch, setCustomerSearch] = useState('');
  const [itemSearch, setItemSearch] = useState('');

  // Processing States
  const [saving, setSaving] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);

  // Budget States
  const [savedBudgets, setSavedBudgets] = useState<SalesBudget[]>([]);
  const [editingBudgetId, setEditingBudgetId] = useState<string | null>(null);
  const [showBudgetsModal, setShowBudgetsModal] = useState(false);
  const [budgetLoading, setBudgetLoading] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    const [cRes, pRes, sRes, cfg, bRes] = await Promise.all([
      supabase.from('customers').select('*').order('name').limit(5000),
      supabase.from('products').select('*').eq('active', true).gt('stock_quantity', 0).order('name'),
      supabase.from('services').select('*').eq('active', true).order('name'),
      fetchCompanyConfig(),
      supabase.from('sales_budgets').select('*').order('created_at', { ascending: false })
    ]);
    
    setCustomers((cRes.data as unknown as Customer[]) ?? []);
    setProducts((pRes.data as unknown as Product[]) ?? []);
    setServices((sRes.data as unknown as Service[]) ?? []);
    setSavedBudgets((bRes.data as unknown as SalesBudget[]) ?? []);
    setConfig(cfg);
    setLoading(false);
  }

  // ─── Filtering ──────────────────────────────────────────────────────────────
  const filteredCustomers = useMemo(() => {
    if (!customerSearch) return customers;
    const q = customerSearch.toLowerCase();
    return customers.filter(c => 
      c.name.toLowerCase().includes(q) || 
      (c.phone && c.phone.includes(q)) ||
      (c.document && c.document.includes(q)) ||
      (c.city && c.city.toLowerCase().includes(q))
    );
  }, [customers, customerSearch]);

  const filteredItems = useMemo(() => {
    if (!itemSearch) return [];
    const q = itemSearch.toLowerCase();
    
    const pMatched = products.filter(p => p.name.toLowerCase().includes(q) || p.internal_code.toLowerCase().includes(q));
    const sMatched = services.filter(s => s.name.toLowerCase().includes(q));
    
    return [
      ...pMatched.map(p => ({ ...p, _type: 'product' as const })),
      ...sMatched.map(s => ({ ...s, _type: 'service' as const }))
    ];
  }, [products, services, itemSearch]);

  // ─── Cart Logic ─────────────────────────────────────────────────────────────
  function addToCart(item: any, type: 'product' | 'service') {
    setCart(prev => {
      const existing = prev.find(i => i.id === item.id && i.type === type);
      if (existing) {
        if (type === 'product' && existing.quantity >= item.stock_quantity) {
          alert('Quantidade máxima em estoque atingida.');
          return prev;
        }
        return prev.map(i => i.id === item.id && i.type === type ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, {
        id: item.id,
        type,
        name: item.name,
        unit_price: type === 'product' ? item.unit_price : item.price,
        quantity: 1,
        max_quantity: type === 'product' ? item.stock_quantity : undefined
      }];
    });
    setItemSearch(''); // Clear search after adding
  }

  function updateQuantity(idx: number, delta: number) {
    setCart(prev => {
      const copy = [...prev];
      const item = copy[idx];
      const newQ = item.quantity + delta;
      
      if (newQ <= 0) return copy.filter((_, i) => i !== idx);
      if (item.type === 'product' && item.max_quantity !== undefined && newQ > item.max_quantity) {
        alert('Quantidade máxima em estoque atingida.');
        return copy;
      }
      
      copy[idx] = { ...item, quantity: newQ };
      return copy;
    });
  }

  function removeFromCart(idx: number) {
    setCart(prev => prev.filter((_, i) => i !== idx));
  }

  const subtotal = cart.reduce((acc, curr) => acc + (curr.unit_price * curr.quantity), 0);
  const total = Math.max(0, subtotal - discount);

  // ─── Save Sale ──────────────────────────────────────────────────────────────
  async function handleSaveSale() {
    if (cart.length === 0) { alert('Carrinho vazio.'); return; }
    
    const customer = customers.find(c => c.id === selectedCustomerId);
    
    setSaving(true);
    try {
      // 1. Create Sale Record
      const salePayload = {
        customer_id: customer?.id || null,
        customer_name: customer?.name || 'Cliente Avulso',
        payment_method: paymentMethod,
        subtotal: subtotal,
        tax: discount, // Using tax field to store discount temporarily for this logic
        total: total,
        paid_amount: statusFinanceiro === 'Pago' ? total : 0,
        change: 0,
        notes: `Venda via PDV Peças e Serviços. Itens: ${cart.map(c => `${c.quantity}x ${c.name}`).join(', ')}`,
        created_at: new Date().toISOString()
      };
      
      const { data: saleData, error: saleErr } = await supabase.from('sales').insert(salePayload).select().single();
      if (saleErr) throw saleErr;

      // 2. Update Stock and register movements
      for (const item of cart) {
        if (item.type === 'product') {
          const product = products.find(p => p.id === item.id);
          if (product) {
            const newStock = Math.max(0, product.stock_quantity - item.quantity);
            
            await supabase.from('products').update({ stock_quantity: newStock }).eq('id', product.id);
            
            await supabase.from('stock_movements').insert({
              product_id: product.id,
              product_name: product.name,
              movement_type: 'saida',
              quantity: item.quantity,
              quantity_before: product.stock_quantity,
              quantity_after: newStock,
              reason: 'Venda via PDV',
              responsible: 'PDV', // Could use user profile name here
              created_at: new Date().toISOString()
            });
          }
        }
      }

      alert('Venda registrada com sucesso! Ela já consta no módulo Financeiro e o estoque foi baixado.');
      
      // se estava editando orçamento, apagar ele
      if (editingBudgetId) {
        await supabase.from('sales_budgets').delete().eq('id', editingBudgetId);
        setEditingBudgetId(null);
      }

      // Reset Form
      setCart([]);
      setDiscount(0);
      setSelectedCustomerId('');
      setCustomerSearch('');
      loadData(); // Reload products to get fresh stock
    } catch (err: any) {
      console.error(err);
      alert('Erro ao registrar venda: ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  // ─── Save Budget to DB ──────────────────────────────────────────────────────
  async function saveBudgetToDB() {
    const customer = customers.find(c => c.id === selectedCustomerId);
    
    try {
      const payload = {
        customer_id: customer?.id || null,
        customer_name: customer?.name || 'Cliente Avulso',
        items: cart,
        subtotal,
        discount,
        total,
      };

      if (editingBudgetId) {
        await supabase.from('sales_budgets').update(payload).eq('id', editingBudgetId);
      } else {
        const { data: newBudget, error } = await supabase.from('sales_budgets').insert(payload).select().single();
        if (error) throw error;
        if (newBudget) setEditingBudgetId(newBudget.id);
      }
      
      const { data } = await supabase.from('sales_budgets').select('*').order('created_at', { ascending: false });
      if (data) setSavedBudgets(data as unknown as SalesBudget[]);
      return true;
    } catch (err) {
      console.error('Error saving budget', err);
      alert('Erro ao salvar orçamento no banco de dados.');
      return false;
    }
  }

  async function handleSaveBudgetOnly() {
    if (cart.length === 0) { alert('Carrinho vazio para salvar orçamento.'); return; }
    setSaving(true);
    const success = await saveBudgetToDB();
    setSaving(false);
    if (success) {
      alert('Orçamento salvo com sucesso!');
    }
  }

  // ─── Generate Budget PDF ────────────────────────────────────────────────────
  async function handleGenerateBudget() {
    if (cart.length === 0) { alert('Carrinho vazio para gerar orçamento.'); return; }
    
    setGeneratingPdf(true);
    const customer = customers.find(c => c.id === selectedCustomerId);
    
    await saveBudgetToDB();
    
    const dateStr = new Date().toLocaleDateString('pt-BR');
    
    const logoHtml = config.logo_url
      ? `<img src="${config.logo_url}" alt="Logo" style="height:60px;object-fit:contain;margin-bottom:10px;" />`
      : '';
      
    const address = config.address ? `<p style="color:#666;font-size:12px;">${config.address}</p>` : '';
    const cnpjStr = config.cnpj ? ` · CNPJ: ${config.cnpj}` : '';
    
    const clientHtml = customer ? `
      <div style="margin-top:20px;padding:15px;border:1px solid #e2e8f0;border-radius:8px;background:#f8fafc;">
        <h4 style="margin:0 0 8px 0;color:#334155;font-size:12px;text-transform:uppercase;">Dados do Cliente</h4>
        <p style="margin:0;font-weight:bold;font-size:16px;">${customer.name}</p>
        <p style="margin:4px 0 0 0;color:#64748b;">
          ${customer.phone || ''} ${customer.phone && customer.city ? '·' : ''} ${customer.city || ''} ${customer.state ? '- ' + customer.state : ''}
        </p>
      </div>
    ` : `
      <div style="margin-top:20px;padding:15px;border:1px solid #e2e8f0;border-radius:8px;background:#f8fafc;">
        <p style="margin:0;color:#64748b;">Cliente Avulso (Não identificado)</p>
      </div>
    `;

    const itemsHtml = cart.map(item => `
      <tr>
        <td style="padding:10px;border-bottom:1px solid #e2e8f0;">${item.name} <span style="font-size:11px;color:#94a3b8;margin-left:5px;">(${item.type === 'product' ? 'Peça' : 'Serviço'})</span></td>
        <td style="padding:10px;border-bottom:1px solid #e2e8f0;text-align:center;">${item.quantity}</td>
        <td style="padding:10px;border-bottom:1px solid #e2e8f0;text-align:right;">${fmtCurrency(item.unit_price)}</td>
        <td style="padding:10px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:bold;">${fmtCurrency(item.quantity * item.unit_price)}</td>
      </tr>
    `).join('');

    const html = `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <title>Orçamento de Peças e Serviços</title>
        <style>
          body { font-family: 'Segoe UI', system-ui, sans-serif; padding: 30px; color: #1e293b; line-height: 1.5; }
          .header { text-align: center; border-bottom: 2px solid #e2e8f0; padding-bottom: 20px; }
          .title { font-size: 24px; font-weight: 800; color: #0f172a; margin: 10px 0 5px 0; text-transform: uppercase; letter-spacing: 1px; }
          table { width: 100%; border-collapse: collapse; margin-top: 25px; }
          th { text-align: left; background: #f1f5f9; padding: 10px; font-size: 12px; text-transform: uppercase; color: #475569; border-bottom: 2px solid #cbd5e1; }
          .totals { margin-top: 30px; width: 300px; float: right; border-top: 2px solid #0f172a; padding-top: 15px; }
          .totals-row { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 14px; }
          .totals-row.final { font-size: 18px; font-weight: 800; color: #0f172a; margin-top: 10px; padding-top: 10px; border-top: 1px dashed #cbd5e1; }
          .footer { clear: both; margin-top: 60px; padding-top: 20px; border-top: 1px solid #e2e8f0; text-align: center; font-size: 12px; color: #94a3b8; }
        </style>
      </head>
      <body>
        <div class="header">
          ${logoHtml}
          <div style="font-size:16px;font-weight:bold;">${config.company_name || 'Nossa Empresa'}${cnpjStr}</div>
          ${address}
          <div class="title">Orçamento Comercial</div>
          <div style="color:#64748b;font-size:14px;">Data: ${dateStr}</div>
        </div>
        
        ${clientHtml}
        
        <table>
          <thead>
            <tr>
              <th>Descrição do Item</th>
              <th style="text-align:center;">Qtd</th>
              <th style="text-align:right;">V. Unitário</th>
              <th style="text-align:right;">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>
        
        <div class="totals">
          <div class="totals-row">
            <span style="color:#64748b;">Subtotal</span>
            <span>${fmtCurrency(subtotal)}</span>
          </div>
          ${discount > 0 ? `
          <div class="totals-row">
            <span style="color:#ef4444;">Desconto</span>
            <span style="color:#ef4444;">- ${fmtCurrency(discount)}</span>
          </div>
          ` : ''}
          <div class="totals-row final">
            <span>TOTAL A PAGAR</span>
            <span>${fmtCurrency(total)}</span>
          </div>
        </div>
        
        <div class="footer">
          <p>Este orçamento é válido por 7 dias. Os valores estão sujeitos a alteração sem aviso prévio.</p>
          <p>Dúvidas? Entre em contato conosco.</p>
        </div>
      </body>
      </html>
    `;
    
    printHtml(html, `Orcamento_${customer?.name?.replace(/\s+/g, '_') || 'Avulso'}.pdf`)
      .finally(() => setGeneratingPdf(false));
  }

  // ─── Load / Delete Budget ───────────────────────────────────────────────────
  function handleEditBudget(b: SalesBudget) {
    setCart(b.items || []);
    setDiscount(b.discount || 0);
    if (b.customer_id) {
      setSelectedCustomerId(b.customer_id);
    } else {
      setSelectedCustomerId('');
    }
    setEditingBudgetId(b.id);
    setShowBudgetsModal(false);
  }

  async function handleDeleteBudget(id: string) {
    if (!confirm('Deseja realmente apagar este orçamento?')) return;
    setBudgetLoading(true);
    try {
      await supabase.from('sales_budgets').delete().eq('id', id);
      setSavedBudgets(prev => prev.filter(b => b.id !== id));
      if (editingBudgetId === id) {
        setEditingBudgetId(null);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setBudgetLoading(false);
    }
  }

  function handleCancelEdit() {
    setCart([]);
    setDiscount(0);
    setSelectedCustomerId('');
    setEditingBudgetId(null);
  }

  // ─── Render ─────────────────────────────────────────────────────────────────
  if (loading) return <div className="flex justify-center py-16"><Loader2 size={32} className="text-amber-500 animate-spin" /></div>;

  return (
    <div className="p-4 sm:p-6 bg-slate-50 min-h-full">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Lado Esquerdo - Busca e Itens */}
        <div className="lg:col-span-7 xl:col-span-8 space-y-6">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <Package size={20} className="text-amber-500" /> 
                Busca de Peças e Serviços
              </h2>
              <button
                onClick={() => setShowBudgetsModal(true)}
                className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 py-2 px-4 rounded-xl text-sm font-semibold transition-colors"
              >
                <FolderOpen size={16} className="text-amber-500" />
                Orçamentos Salvos ({savedBudgets.length})
              </button>
            </div>
            
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="text"
                placeholder="Busque pelo nome ou código do produto / serviço..."
                value={itemSearch}
                onChange={e => setItemSearch(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-400 transition-all"
              />
            </div>
            
            {itemSearch && (
              <div className="mt-3 max-h-[300px] overflow-y-auto border border-slate-100 rounded-xl divide-y divide-slate-100">
                {filteredItems.length === 0 ? (
                  <div className="p-4 text-center text-sm text-slate-500">Nenhum item encontrado.</div>
                ) : (
                  filteredItems.map((item: any, i) => (
                    <div key={i} className="p-3 hover:bg-slate-50 flex items-center justify-between transition-colors">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${item._type === 'product' ? 'bg-emerald-100 text-emerald-600' : 'bg-blue-100 text-blue-600'}`}>
                          {item._type === 'product' ? <Package size={16} /> : <Tag size={16} />}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-800">{item.name}</p>
                          <div className="flex gap-2 text-xs">
                            {item._type === 'product' ? (
                              <span className="text-slate-500">Estoque: <strong className="text-emerald-600">{item.stock_quantity}</strong></span>
                            ) : (
                              <span className="text-slate-500">Serviço</span>
                            )}
                            <span className="text-slate-300">|</span>
                            <span className="text-slate-600 font-semibold">{fmtCurrency(item._type === 'product' ? item.unit_price : item.price)}</span>
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => addToCart(item, item._type)}
                        className="p-2 bg-amber-50 hover:bg-amber-100 text-amber-600 rounded-lg transition-colors font-medium text-sm flex items-center gap-1"
                      >
                        <Plus size={16} /> Adicionar
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
          
          {/* Carrinho de Compras */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex-1 min-h-[400px] flex flex-col relative">
            {editingBudgetId && (
              <div className="absolute -top-3 left-4 bg-amber-500 text-white text-xs font-bold px-3 py-1 rounded-full shadow-sm flex items-center gap-2">
                Editando Orçamento Salvo
                <button onClick={handleCancelEdit} className="hover:bg-amber-600 rounded-full p-0.5" title="Cancelar edição">
                  <X size={12} />
                </button>
              </div>
            )}
            
            <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
              <ShoppingCart size={20} className="text-amber-500" />
              Carrinho ({cart.length} itens)
            </h2>
            
            {cart.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-400 py-12">
                <ShoppingCart size={48} className="mb-4 opacity-20" />
                <p>Nenhum item adicionado à venda.</p>
                <p className="text-sm mt-1">Busque acima para começar.</p>
              </div>
            ) : (
              <div className="space-y-3 flex-1 overflow-auto">
                {cart.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 border border-slate-100 rounded-xl hover:border-slate-200 transition-colors">
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-slate-800">{item.name}</p>
                      <p className="text-xs text-slate-500">{fmtCurrency(item.unit_price)} unitário</p>
                    </div>
                    
                    <div className="flex items-center gap-6">
                      <div className="flex items-center gap-2 bg-slate-50 p-1 rounded-lg border border-slate-200">
                        <button onClick={() => updateQuantity(idx, -1)} className="p-1 hover:bg-white rounded text-slate-600 hover:shadow-sm"><Minus size={14} /></button>
                        <span className="w-8 text-center text-sm font-bold text-slate-800">{item.quantity}</span>
                        <button onClick={() => updateQuantity(idx, 1)} className="p-1 hover:bg-white rounded text-slate-600 hover:shadow-sm"><Plus size={14} /></button>
                      </div>
                      
                      <div className="w-24 text-right font-bold text-slate-800">
                        {fmtCurrency(item.unit_price * item.quantity)}
                      </div>
                      
                      <button onClick={() => removeFromCart(idx)} className="p-2 text-red-400 hover:bg-red-50 hover:text-red-600 rounded-lg transition-colors">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Lado Direito - Pagamento e Conclusão */}
        <div className="lg:col-span-5 xl:col-span-4 space-y-6">
          
          {/* Cliente */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
              <User size={16} className="text-slate-400" /> Vender para
            </h3>
            
            {!selectedCustomerId ? (
              <div className="space-y-3">
                <input
                  type="text"
                  placeholder="Busque cliente por nome ou celular..."
                  value={customerSearch}
                  onChange={e => setCustomerSearch(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                />
                
                {customerSearch && (
                  <div className="max-h-[200px] overflow-y-auto border border-slate-100 rounded-xl divide-y divide-slate-100">
                    {filteredCustomers.length === 0 ? (
                      <div className="p-3 text-center text-xs text-slate-500">Cliente não encontrado.</div>
                    ) : (
                      filteredCustomers.map(c => (
                        <button
                          key={c.id}
                          onClick={() => { setSelectedCustomerId(c.id); setCustomerSearch(''); }}
                          className="w-full text-left p-3 hover:bg-blue-50 transition-colors flex justify-between items-center"
                        >
                          <div>
                            <p className="text-sm font-semibold text-slate-800">{c.name}</p>
                            <p className="text-xs text-slate-500">
                              {[c.document, c.city, c.phone].filter(Boolean).join(' - ')}
                            </p>
                          </div>
                          <CheckCircle2 size={16} className="text-blue-500 opacity-0 hover:opacity-100" />
                        </button>
                      ))
                    )}
                  </div>
                )}
                <div className="text-xs text-slate-500 text-center">Deixe vazio para Venda Avulsa.</div>
              </div>
            ) : (
              <div className="flex items-center justify-between p-3 bg-blue-50 border border-blue-200 rounded-xl">
                <div>
                  <p className="text-sm font-semibold text-blue-900">{customers.find(c => c.id === selectedCustomerId)?.name}</p>
                  <p className="text-xs text-blue-700">
                    {[customers.find(c => c.id === selectedCustomerId)?.document, customers.find(c => c.id === selectedCustomerId)?.city, customers.find(c => c.id === selectedCustomerId)?.phone].filter(Boolean).join(' - ') || 'Sem detalhes adicionais'}
                  </p>
                </div>
                <button onClick={() => setSelectedCustomerId('')} className="p-2 hover:bg-blue-100 text-blue-600 rounded-lg">
                  Remover
                </button>
              </div>
            )}
          </div>
          
          {/* Pagamento */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-6">
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
              <Calculator size={16} className="text-slate-400" /> Pagamento
            </h3>
            
            <div className="space-y-3">
              <div className="flex justify-between items-center text-sm text-slate-600">
                <span>Subtotal</span>
                <span>{fmtCurrency(subtotal)}</span>
              </div>
              
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-600">Desconto (R$)</span>
                <input
                  type="number"
                  min="0"
                  max={subtotal}
                  value={discount === 0 ? '' : discount}
                  onChange={e => setDiscount(Number(e.target.value) || 0)}
                  className="w-24 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-sm text-right focus:outline-none focus:border-amber-400"
                  placeholder="0,00"
                />
              </div>
              
              <div className="pt-3 border-t border-slate-200 flex justify-between items-center">
                <span className="text-lg font-bold text-slate-800">Total a Pagar</span>
                <span className="text-2xl font-extrabold text-emerald-600">{fmtCurrency(total)}</span>
              </div>
            </div>
            
            <div className="space-y-3 pt-4 border-t border-slate-100">
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-2">Forma de Pagamento</label>
                <div className="grid grid-cols-2 gap-2">
                  {['PIX', 'Cartão de Crédito', 'Cartão de Débito', 'Dinheiro', 'Boleto'].map(m => (
                    <button
                      key={m}
                      onClick={() => setPaymentMethod(m)}
                      className={`p-2 rounded-lg text-xs font-semibold border transition-all ${paymentMethod === m ? 'bg-amber-500 text-white border-amber-500 shadow-md shadow-amber-500/20' : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-amber-300'}`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>
              
              <div className="pt-2">
                <label className="text-xs font-semibold text-slate-600 block mb-2">Status do Pagamento</label>
                <div className="flex bg-slate-100 rounded-xl p-1">
                  <button
                    onClick={() => setStatusFinanceiro('Pago')}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${statusFinanceiro === 'Pago' ? 'bg-emerald-500 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    Pago
                  </button>
                  <button
                    onClick={() => setStatusFinanceiro('Pendente')}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${statusFinanceiro === 'Pendente' ? 'bg-amber-500 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    Pendente
                  </button>
                </div>
              </div>
            </div>
          </div>
          
          {/* Ações Finais */}
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={handleCancelEdit}
                className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 py-3 rounded-xl font-bold transition-colors flex items-center justify-center gap-2"
              >
                <FilePlus2 size={18} /> Novo Orçamento
              </button>
              
              <button
                onClick={handleSaveBudgetOnly}
                disabled={saving || cart.length === 0}
                className="w-full bg-blue-50 hover:bg-blue-100 border-2 border-blue-200 disabled:opacity-50 text-blue-700 py-3 rounded-xl font-bold transition-colors flex items-center justify-center gap-2"
              >
                {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                Salvar Orçamento
              </button>
            </div>

            <button
              onClick={handleGenerateBudget}
              disabled={generatingPdf || cart.length === 0}
              className="w-full bg-white hover:bg-slate-50 border-2 border-slate-300 disabled:opacity-50 text-slate-700 py-3 rounded-xl font-bold transition-colors flex items-center justify-center gap-2"
            >
              {generatingPdf ? <Loader2 size={18} className="animate-spin" /> : <FileText size={18} />}
              Gerar Orçamento (PDF)
            </button>
            
            <button
              onClick={handleSaveSale}
              disabled={saving || cart.length === 0}
              className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white py-4 rounded-xl font-extrabold text-lg shadow-lg shadow-emerald-600/30 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
            >
              {saving ? <Loader2 size={24} className="animate-spin" /> : <DollarSign size={24} />}
              Concluir Venda
            </button>
          </div>
          
        </div>
      </div>

      {/* MODAL: Orçamentos Salvos */}
      {showBudgetsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <FolderOpen className="text-amber-500" /> Orçamentos Salvos
              </h3>
              <button onClick={() => setShowBudgetsModal(false)} className="text-slate-400 hover:text-slate-600 p-2 rounded-lg hover:bg-slate-100 transition-colors">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1">
              {budgetLoading && <div className="text-center py-4"><Loader2 className="animate-spin text-amber-500 mx-auto" /></div>}
              
              {!budgetLoading && savedBudgets.length === 0 && (
                <div className="text-center py-10 text-slate-400">
                  <FolderOpen size={48} className="mx-auto mb-4 opacity-20" />
                  <p>Nenhum orçamento salvo no momento.</p>
                </div>
              )}

              <div className="space-y-3">
                {savedBudgets.map(b => (
                  <div key={b.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 border border-slate-200 rounded-xl hover:border-amber-300 transition-colors bg-white">
                    <div>
                      <h4 className="font-bold text-slate-800">{b.customer_name}</h4>
                      <p className="text-xs text-slate-500">{formatDateTime(b.created_at)}</p>
                      <p className="text-sm font-semibold text-amber-600 mt-1">{fmtCurrency(b.total)}</p>
                    </div>
                    
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleEditBudget(b)}
                        className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-blue-50 hover:bg-blue-100 text-blue-600 px-3 py-2 rounded-lg text-sm font-semibold transition-colors"
                      >
                        <Edit size={16} /> Editar
                      </button>
                      <button
                        onClick={() => handleDeleteBudget(b.id)}
                        className="flex items-center justify-center bg-slate-50 hover:bg-red-50 text-slate-400 hover:text-red-500 px-3 py-2 rounded-lg transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
