import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { Customer, Product, SalesBudget } from '../lib/types';
import { fetchCompanyConfig, CompanyConfig, EMPTY_CONFIG } from '../lib/companyConfig';
import { useAuth } from '../lib/auth';
import { logFinancialAudit } from '../lib/osStockSync';
import {
  PdvCartItem,
  safeLower,
  computePdvTotals,
  validatePdvCheckout,
} from '../lib/partsServicesEngine';
import { formatLocalDateBR } from '../lib/financeEngine';
import {
  Search, Plus, Minus, Trash2, CheckCircle2, FileText, ShoppingCart, Loader2,
  Tag, User, Package, Calculator, DollarSign, FolderOpen, X, Edit, Save,
  FilePlus2, AlertTriangle, Printer,
} from 'lucide-react';
import { printHtml } from '../utils/print';

// ─── Local Types ──────────────────────────────────────────────────────────────

interface ServiceItem {
  id: string;
  name: string;
  category?: string;
  price: number;
  description?: string;
}

type ProductWithCode = Product & { internal_code?: string | null; manufacturer?: string | null; unit?: string | null };

interface CompletedSaleReceipt {
  id: string;
  customerName: string;
  customerPhone?: string;
  customerCity?: string;
  customerState?: string;
  items: PdvCartItem[];
  subtotal: number;
  discount: number;
  total: number;
  paymentMethod: string;
  statusFinanceiro: 'Pago' | 'Pendente';
  sellerName: string;
  createdAt: string;
}

const PDV_PAYMENT_METHODS = [
  'Pix',
  'Cartão de Crédito',
  'Cartão de Débito',
  'Dinheiro',
  'Boleto',
  'Transferência',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtCurrency(val: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);
}

function formatDateTime(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleString('pt-BR');
}

function daysSinceIso(iso: string | null | undefined): number {
  if (!iso) return 0;
  const diff = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
}

async function fetchAllPages<T>(
  queryPage: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>,
  pageSize = 1000,
  maxPages = 20
): Promise<T[]> {
  const all: T[] = [];
  for (let p = 0; p < maxPages; p++) {
    const from = p * pageSize;
    const to = from + pageSize - 1;
    const { data, error } = await queryPage(from, to);
    if (error || !data || data.length === 0) break;
    all.push(...(data as T[]));
    if (data.length < pageSize) break;
  }
  return all;
}

function escapeHtml(val: string | null | undefined): string {
  return String(val ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PartsServicesPDVTab() {
  const { profile } = useAuth();
  const sellerName = profile?.full_name || 'PDV';

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<ProductWithCode[]>([]);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [config, setConfig] = useState<CompanyConfig>(EMPTY_CONFIG);
  const [loading, setLoading] = useState(true);

  // PDV State
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [cart, setCart] = useState<PdvCartItem[]>([]);
  const [paymentMethod, setPaymentMethod] = useState('Pix');
  const [statusFinanceiro, setStatusFinanceiro] = useState<'Pago' | 'Pendente'>('Pago');
  const [rawDiscount, setRawDiscount] = useState<number>(0);

  // Search States
  const [customerSearch, setCustomerSearch] = useState('');
  const [itemSearch, setItemSearch] = useState('');

  // Processing & Feedback States
  const [saving, setSaving] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [completedSale, setCompletedSale] = useState<CompletedSaleReceipt | null>(null);

  // Budget States
  const [savedBudgets, setSavedBudgets] = useState<SalesBudget[]>([]);
  const [editingBudgetId, setEditingBudgetId] = useState<string | null>(null);
  const [showBudgetsModal, setShowBudgetsModal] = useState(false);
  const [budgetLoading, setBudgetLoading] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [custList, prodList, svcList, cfg, budgList] = await Promise.all([
      fetchAllPages<Customer>((from, to) =>
        supabase.from('customers').select('*').order('name').range(from, to)
      ),
      fetchAllPages<ProductWithCode>((from, to) =>
        supabase.from('products').select('*').eq('active', true).order('name').range(from, to)
      ),
      fetchAllPages<ServiceItem>((from, to) =>
        supabase.from('services').select('*').eq('active', true).order('name').range(from, to)
      ),
      fetchCompanyConfig(),
      fetchAllPages<SalesBudget>((from, to) =>
        supabase.from('sales_budgets').select('*').order('created_at', { ascending: false }).range(from, to)
      ),
    ]);

    setCustomers(custList);
    setProducts(prodList);
    setServices(svcList);
    setSavedBudgets(budgList);
    setConfig(cfg);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const productById = useMemo(
    () => Object.fromEntries(products.map(p => [p.id, p])),
    [products]
  );

  // ─── Filtering ──────────────────────────────────────────────────────────────

  const filteredCustomers = useMemo(() => {
    if (!customerSearch.trim()) return customers.slice(0, 50);
    const q = safeLower(customerSearch.trim());
    return customers.filter(c =>
      safeLower(c.name).includes(q) ||
      safeLower(c.phone).includes(q) ||
      safeLower(c.document).includes(q) ||
      safeLower(c.city).includes(q)
    ).slice(0, 50);
  }, [customers, customerSearch]);

  const filteredItems = useMemo(() => {
    if (!itemSearch.trim()) return [];
    const q = safeLower(itemSearch.trim());

    const pMatched = products.filter(p =>
      safeLower(p.name).includes(q) ||
      safeLower(p.internal_code).includes(q) ||
      safeLower(p.manufacturer).includes(q)
    );
    const sMatched = services.filter(s =>
      safeLower(s.name).includes(q) ||
      safeLower(s.category).includes(q)
    );

    return [
      ...pMatched.map(p => ({ ...p, _type: 'product' as const })),
      ...sMatched.map(s => ({ ...s, _type: 'service' as const })),
    ].slice(0, 50);
  }, [products, services, itemSearch]);

  // ─── Cart Logic ─────────────────────────────────────────────────────────────

  function addProductToCart(prod: ProductWithCode) {
    setErrorBanner(null);
    const available = Math.max(0, Number(prod.stock_quantity) || 0);
    if (available <= 0) {
      setErrorBanner(`A peça "${prod.name}" está com estoque zerado.`);
      return;
    }

    setCart(prev => {
      const existing = prev.find(i => i.id === prod.id && i.type === 'product');
      if (existing) {
        if (existing.quantity >= available) {
          setErrorBanner(`Quantidade máxima em estoque atingida para "${prod.name}" (${available} disponível).`);
          return prev;
        }
        return prev.map(i =>
          i.id === prod.id && i.type === 'product'
            ? { ...i, quantity: i.quantity + 1, max_quantity: available }
            : i
        );
      }
      return [
        ...prev,
        {
          id: prod.id,
          type: 'product',
          name: prod.name,
          unit_price: Number(prod.unit_price) || 0,
          quantity: 1,
          max_quantity: available,
        },
      ];
    });
    setItemSearch('');
  }

  function addServiceToCart(svc: ServiceItem) {
    setErrorBanner(null);
    setCart(prev => {
      const existing = prev.find(i => i.id === svc.id && i.type === 'service');
      if (existing) {
        return prev.map(i =>
          i.id === svc.id && i.type === 'service'
            ? { ...i, quantity: i.quantity + 1 }
            : i
        );
      }
      return [
        ...prev,
        {
          id: svc.id,
          type: 'service',
          name: svc.name,
          unit_price: Number(svc.price) || 0,
          quantity: 1,
        },
      ];
    });
    setItemSearch('');
  }

  function updateQuantity(idx: number, delta: number) {
    setErrorBanner(null);
    setCart(prev => {
      const copy = [...prev];
      const item = copy[idx];
      if (!item) return prev;
      const newQ = item.quantity + delta;

      if (newQ <= 0) return copy.filter((_, i) => i !== idx);
      if (item.type === 'product') {
        const liveAvail = productById[item.id]?.stock_quantity ?? item.max_quantity ?? 0;
        if (newQ > liveAvail) {
          setErrorBanner(`Quantidade máxima em estoque atingida para "${item.name}" (${liveAvail} disponível).`);
          return copy;
        }
        copy[idx] = { ...item, quantity: newQ, max_quantity: liveAvail };
      } else {
        copy[idx] = { ...item, quantity: newQ };
      }
      return copy;
    });
  }

  function updateUnitPrice(idx: number, newPrice: number) {
    setCart(prev =>
      prev.map((item, i) =>
        i === idx ? { ...item, unit_price: Math.max(0, Number.isFinite(newPrice) ? newPrice : 0) } : item
      )
    );
  }

  function removeFromCart(idx: number) {
    setErrorBanner(null);
    setCart(prev => prev.filter((_, i) => i !== idx));
  }

  const { subtotal, discount, total } = useMemo(
    () => computePdvTotals(cart, rawDiscount),
    [cart, rawDiscount]
  );

  const pendingNeedsCustomer = statusFinanceiro === 'Pendente' && !selectedCustomerId;

  const cartStockIssues = useMemo(() => {
    const issues: Record<string, number> = {};
    for (const item of cart) {
      if (item.type !== 'product') continue;
      const liveProd = productById[item.id];
      const avail = liveProd ? Math.max(0, Number(liveProd.stock_quantity) || 0) : 0;
      if (item.quantity > avail) {
        issues[item.id] = avail;
      }
    }
    return issues;
  }, [cart, productById]);

  const hasCartStockIssues = Object.keys(cartStockIssues).length > 0;

  // ─── Save Sale (Live Stock Check + Audit + Receipt) ─────────────────────────

  async function handleSaveSale() {
    setErrorBanner(null);
    if (cart.length === 0) {
      setErrorBanner('Adicione pelo menos um item ao carrinho.');
      return;
    }

    if (pendingNeedsCustomer) {
      setErrorBanner('Vendas com status Pendente exigem um cliente cadastrado (não permitido para Cliente Avulso).');
      return;
    }

    setSaving(true);
    try {
      // 1. Fetch LIVE stock for all product items in cart to prevent stale/concurrent overwrites
      const productIds = Array.from(
        new Set(cart.filter(i => i.type === 'product').map(i => i.id))
      );

      const liveStockByProductId: Record<string, number> = {};
      const liveNameByProductId: Record<string, string> = {};

      if (productIds.length > 0) {
        const { data: liveProds, error: liveErr } = await supabase
          .from('products')
          .select('id,name,stock_quantity')
          .in('id', productIds);

        if (liveErr) {
          throw new Error(`Falha ao validar estoque atual: ${liveErr.message}`);
        }

        for (const p of (liveProds as { id: string; name: string; stock_quantity: number }[] | null) ?? []) {
          liveStockByProductId[p.id] = Math.max(0, Number(p.stock_quantity) || 0);
          liveNameByProductId[p.id] = p.name;
        }
      }

      const validation = validatePdvCheckout({
        cart,
        statusFinanceiro,
        selectedCustomerId,
        liveStockByProductId,
      });

      if (!validation.ok) {
        setErrorBanner(validation.error);
        // Refresh catalog so the user immediately sees updated stock
        await loadData();
        setSaving(false);
        return;
      }

      const customer = customers.find(c => c.id === selectedCustomerId);
      const nowIso = new Date().toISOString();
      const discountNote = discount > 0 ? ` | Desconto: ${fmtCurrency(discount)}` : '';
      const itemsSummary = cart.map(c => `${c.quantity}x ${c.name}`).join(', ');

      // 2. Create Sale Record
      const salePayload = {
        customer_id: customer?.id || null,
        customer_name: customer?.name || 'Cliente Avulso',
        payment_method: paymentMethod,
        subtotal,
        tax: discount, // Existing sales schema stores discount in `tax`
        total,
        paid_amount: statusFinanceiro === 'Pago' ? total : 0,
        change: 0,
        notes: `Venda via PDV (${sellerName}). Itens: ${itemsSummary}${discountNote}`,
        created_at: nowIso,
      };

      const { data: createdSale, error: saleErr } = await supabase
        .from('sales')
        .insert(salePayload)
        .select('id')
        .single();

      if (saleErr || !createdSale) {
        throw new Error(saleErr?.message || 'Não foi possível gravar a venda.');
      }

      // 3. Aggregate product quantities and apply stock deductions against LIVE stock
      const qtyByProduct: Record<string, number> = {};
      for (const item of cart) {
        if (item.type !== 'product') continue;
        qtyByProduct[item.id] = (qtyByProduct[item.id] ?? 0) + Math.round(item.quantity);
      }

      const stockWarnings: string[] = [];
      for (const [productId, qty] of Object.entries(qtyByProduct)) {
        const before = liveStockByProductId[productId] ?? 0;
        const after = Math.max(0, before - qty);
        const prodName = liveNameByProductId[productId] || productById[productId]?.name || 'Peça';

        const { error: updErr } = await supabase
          .from('products')
          .update({ stock_quantity: after, updated_at: nowIso })
          .eq('id', productId);

        if (updErr) {
          stockWarnings.push(`Erro ao baixar estoque de ${prodName}: ${updErr.message}`);
          continue;
        }

        const { error: movErr } = await supabase.from('stock_movements').insert({
          product_id: productId,
          product_name: prodName,
          movement_type: 'saida',
          quantity: qty,
          quantity_before: before,
          quantity_after: after,
          reason: `Venda via PDV #${String(createdSale.id).slice(0, 8).toUpperCase()}`,
          responsible: sellerName,
          created_at: nowIso,
        });

        if (movErr) {
          stockWarnings.push(`Erro ao gravar movimentação de ${prodName}: ${movErr.message}`);
        }
      }

      // 4. Financial audit log
      await logFinancialAudit({
        actionType: 'insert',
        tableName: 'sales',
        recordId: String(createdSale.id),
        userName: sellerName,
        changes: {
          action: 'pdv_sale',
          customer_name: customer?.name || 'Cliente Avulso',
          subtotal,
          discount,
          total,
          payment_method: paymentMethod,
          status: statusFinanceiro,
          items_count: cart.length,
        },
      });

      // 5. Remove converted saved budget if applicable
      if (editingBudgetId) {
        await supabase.from('sales_budgets').delete().eq('id', editingBudgetId);
        setEditingBudgetId(null);
      }

      // 6. Store receipt snapshot and reset form
      setCompletedSale({
        id: String(createdSale.id),
        customerName: customer?.name || 'Cliente Avulso',
        customerPhone: customer?.phone,
        customerCity: customer?.city,
        customerState: customer?.state,
        items: [...cart],
        subtotal,
        discount,
        total,
        paymentMethod,
        statusFinanceiro,
        sellerName,
        createdAt: nowIso,
      });

      if (stockWarnings.length > 0) {
        setErrorBanner(`Venda registrada, mas houve alertas no estoque: ${stockWarnings.join(' | ')}`);
      }

      setCart([]);
      setRawDiscount(0);
      setSelectedCustomerId('');
      setCustomerSearch('');
      setStatusFinanceiro('Pago');
      await loadData();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido ao registrar venda.';
      console.error(err);
      setErrorBanner(`Erro ao registrar venda: ${msg}`);
    } finally {
      setSaving(false);
    }
  }

  // ─── Print Sale Receipt PDF ─────────────────────────────────────────────────

  function printSaleReceipt(receipt: CompletedSaleReceipt) {
    const logoHtml = config.logo_url
      ? `<img src="${config.logo_url}" alt="Logo" style="height:54px;object-fit:contain;margin-bottom:8px;" />`
      : '';
    const cnpjStr = config.cnpj ? ` · CNPJ: ${escapeHtml(config.cnpj)}` : '';
    const address = config.address ? `<p style="color:#64748b;font-size:12px;">${escapeHtml(config.address)}</p>` : '';
    const itemsHtml = receipt.items.map(item => `
      <tr>
        <td style="padding:9px;border-bottom:1px solid #e2e8f0;">
          ${escapeHtml(item.name)}
          <span style="font-size:11px;color:#94a3b8;margin-left:5px;">(${item.type === 'product' ? 'Peça' : 'Serviço'})</span>
        </td>
        <td style="padding:9px;border-bottom:1px solid #e2e8f0;text-align:center;">${item.quantity}</td>
        <td style="padding:9px;border-bottom:1px solid #e2e8f0;text-align:right;">${fmtCurrency(item.unit_price)}</td>
        <td style="padding:9px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:bold;">${fmtCurrency(item.quantity * item.unit_price)}</td>
      </tr>
    `).join('');

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <title>Recibo de Venda #${receipt.id.slice(0, 8).toUpperCase()}</title>
  <style>
    body { font-family: 'Segoe UI', system-ui, sans-serif; padding: 28px; color: #1e293b; line-height: 1.5; }
    .header { text-align: center; border-bottom: 2px solid #e2e8f0; padding-bottom: 16px; }
    .title { font-size: 22px; font-weight: 800; color: #0f172a; margin: 8px 0 4px; text-transform: uppercase; }
    .badge { display: inline-block; padding: 3px 10px; border-radius: 999px; font-size: 11px; font-weight: 700;
      background: ${receipt.statusFinanceiro === 'Pago' ? '#d1fae5' : '#fef3c7'};
      color: ${receipt.statusFinanceiro === 'Pago' ? '#065f46' : '#92400e'}; }
    .box { margin-top: 18px; padding: 14px; border: 1px solid #e2e8f0; border-radius: 8px; background: #f8fafc; }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
    th { text-align: left; background: #f1f5f9; padding: 9px; font-size: 11px; text-transform: uppercase; color: #475569; border-bottom: 2px solid #cbd5e1; }
    .totals { margin-top: 24px; width: 300px; float: right; border-top: 2px solid #0f172a; padding-top: 12px; }
    .totals-row { display: flex; justify-content: space-between; margin-bottom: 6px; font-size: 13px; }
    .totals-row.final { font-size: 17px; font-weight: 800; color: #0f172a; margin-top: 8px; padding-top: 8px; border-top: 1px dashed #cbd5e1; }
    .footer { clear: both; margin-top: 56px; padding-top: 16px; border-top: 1px solid #e2e8f0; text-align: center; font-size: 12px; color: #94a3b8; }
  </style>
</head>
<body>
  <div class="header">
    ${logoHtml}
    <div style="font-size:16px;font-weight:bold;">${escapeHtml(config.company_name || 'Refrimaq')}${cnpjStr}</div>
    ${address}
    <div class="title">Comprovante de Venda #${receipt.id.slice(0, 8).toUpperCase()}</div>
    <div style="font-size:13px;color:#64748b;">
      ${formatLocalDateBR(receipt.createdAt)} · Forma: <strong>${escapeHtml(receipt.paymentMethod)}</strong> ·
      <span class="badge">${receipt.statusFinanceiro.toUpperCase()}</span>
    </div>
  </div>
  <div class="box">
    <div style="font-size:11px;color:#64748b;text-transform:uppercase;font-weight:700;">Cliente</div>
    <div style="font-size:15px;font-weight:700;margin-top:2px;">${escapeHtml(receipt.customerName)}</div>
    <div style="font-size:12px;color:#64748b;">
      ${[receipt.customerPhone, receipt.customerCity, receipt.customerState].filter(Boolean).map(escapeHtml).join(' · ')}
    </div>
    <div style="font-size:11px;color:#94a3b8;margin-top:4px;">Atendente: ${escapeHtml(receipt.sellerName)}</div>
  </div>
  <table>
    <thead>
      <tr>
        <th>Item</th>
        <th style="text-align:center;">Qtd</th>
        <th style="text-align:right;">V. Unitário</th>
        <th style="text-align:right;">Subtotal</th>
      </tr>
    </thead>
    <tbody>${itemsHtml}</tbody>
  </table>
  <div class="totals">
    <div class="totals-row"><span>Subtotal</span><span>${fmtCurrency(receipt.subtotal)}</span></div>
    ${receipt.discount > 0 ? `<div class="totals-row" style="color:#ef4444;"><span>Desconto</span><span>- ${fmtCurrency(receipt.discount)}</span></div>` : ''}
    <div class="totals-row final"><span>TOTAL</span><span>${fmtCurrency(receipt.total)}</span></div>
  </div>
  <div class="footer">
    <p>Obrigado pela preferência!</p>
  </div>
</body>
</html>`;

    printHtml(html, `Recibo_Venda_${receipt.id.slice(0, 8)}.pdf`);
  }

  // ─── Save Budget to DB ──────────────────────────────────────────────────────

  async function saveBudgetToDB() {
    const customer = customers.find(c => c.id === selectedCustomerId);
    setErrorBanner(null);

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
        const { error } = await supabase.from('sales_budgets').update(payload).eq('id', editingBudgetId);
        if (error) throw error;
      } else {
        const { data: newBudget, error } = await supabase.from('sales_budgets').insert(payload).select().single();
        if (error) throw error;
        if (newBudget) setEditingBudgetId(newBudget.id);
      }

      const budgList = await fetchAllPages<SalesBudget>((from, to) =>
        supabase.from('sales_budgets').select('*').order('created_at', { ascending: false }).range(from, to)
      );
      setSavedBudgets(budgList);
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido';
      console.error('Error saving budget', err);
      setErrorBanner(`Erro ao salvar orçamento: ${msg}`);
      return false;
    }
  }

  async function handleSaveBudgetOnly() {
    if (cart.length === 0) {
      setErrorBanner('Carrinho vazio para salvar orçamento.');
      return;
    }
    setSaving(true);
    const success = await saveBudgetToDB();
    setSaving(false);
    if (success) {
      alert('Orçamento salvo com sucesso!');
    }
  }

  // ─── Generate Budget PDF ────────────────────────────────────────────────────

  async function handleGenerateBudget() {
    if (cart.length === 0) {
      setErrorBanner('Carrinho vazio para gerar orçamento.');
      return;
    }

    setGeneratingPdf(true);
    const customer = customers.find(c => c.id === selectedCustomerId);
    await saveBudgetToDB();

    const dateStr = formatLocalDateBR(new Date().toISOString());
    const logoHtml = config.logo_url
      ? `<img src="${config.logo_url}" alt="Logo" style="height:60px;object-fit:contain;margin-bottom:10px;" />`
      : '';
    const address = config.address ? `<p style="color:#666;font-size:12px;">${escapeHtml(config.address)}</p>` : '';
    const cnpjStr = config.cnpj ? ` · CNPJ: ${escapeHtml(config.cnpj)}` : '';

    const clientHtml = customer ? `
      <div style="margin-top:20px;padding:15px;border:1px solid #e2e8f0;border-radius:8px;background:#f8fafc;">
        <h4 style="margin:0 0 8px 0;color:#334155;font-size:12px;text-transform:uppercase;">Dados do Cliente</h4>
        <p style="margin:0;font-weight:bold;font-size:16px;">${escapeHtml(customer.name)}</p>
        <p style="margin:4px 0 0 0;color:#64748b;">
          ${escapeHtml(customer.phone || '')} ${customer.phone && customer.city ? '·' : ''} ${escapeHtml(customer.city || '')} ${customer.state ? '- ' + escapeHtml(customer.state) : ''}
        </p>
      </div>
    ` : `
      <div style="margin-top:20px;padding:15px;border:1px solid #e2e8f0;border-radius:8px;background:#f8fafc;">
        <p style="margin:0;color:#64748b;">Cliente Avulso (Não identificado)</p>
      </div>
    `;

    const itemsHtml = cart.map(item => `
      <tr>
        <td style="padding:10px;border-bottom:1px solid #e2e8f0;">${escapeHtml(item.name)} <span style="font-size:11px;color:#94a3b8;margin-left:5px;">(${item.type === 'product' ? 'Peça' : 'Serviço'})</span></td>
        <td style="padding:10px;border-bottom:1px solid #e2e8f0;text-align:center;">${item.quantity}</td>
        <td style="padding:10px;border-bottom:1px solid #e2e8f0;text-align:right;">${fmtCurrency(item.unit_price)}</td>
        <td style="padding:10px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:bold;">${fmtCurrency(item.quantity * item.unit_price)}</td>
      </tr>
    `).join('');

    const html = `<!DOCTYPE html>
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
    <div style="font-size:16px;font-weight:bold;">${escapeHtml(config.company_name || 'Nossa Empresa')}${cnpjStr}</div>
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
    <tbody>${itemsHtml}</tbody>
  </table>
  <div class="totals">
    <div class="totals-row"><span style="color:#64748b;">Subtotal</span><span>${fmtCurrency(subtotal)}</span></div>
    ${discount > 0 ? `<div class="totals-row"><span style="color:#ef4444;">Desconto</span><span style="color:#ef4444;">- ${fmtCurrency(discount)}</span></div>` : ''}
    <div class="totals-row final"><span>TOTAL A PAGAR</span><span>${fmtCurrency(total)}</span></div>
  </div>
  <div class="footer">
    <p>Este orçamento é válido por 7 dias. Os valores estão sujeitos a alteração sem aviso prévio.</p>
    <p>Dúvidas? Entre em contato conosco.</p>
  </div>
</body>
</html>`;

    printHtml(html, `Orcamento_${customer?.name?.replace(/\s+/g, '_') || 'Avulso'}.pdf`)
      .finally(() => setGeneratingPdf(false));
  }

  // ─── Load / Delete Budget ───────────────────────────────────────────────────

  function handleEditBudget(b: SalesBudget) {
    setErrorBanner(null);
    const rawItems = Array.isArray(b.items) ? (b.items as PdvCartItem[]) : [];
    const syncedItems: PdvCartItem[] = rawItems.map(item => {
      if (item.type !== 'product') return item;
      const liveProd = productById[item.id];
      const liveStock = liveProd ? Math.max(0, Number(liveProd.stock_quantity) || 0) : 0;
      return {
        ...item,
        max_quantity: liveStock,
      };
    });

    setCart(syncedItems);
    setRawDiscount(Number(b.discount) || 0);
    setSelectedCustomerId(b.customer_id || '');
    setEditingBudgetId(b.id);
    setShowBudgetsModal(false);
  }

  async function handleDeleteBudget(id: string) {
    if (!confirm('Deseja realmente apagar este orçamento?')) return;
    setBudgetLoading(true);
    try {
      const { error } = await supabase.from('sales_budgets').delete().eq('id', id);
      if (error) throw error;
      setSavedBudgets(prev => prev.filter(b => b.id !== id));
      if (editingBudgetId === id) {
        setEditingBudgetId(null);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido';
      alert(`Erro ao apagar orçamento: ${msg}`);
    } finally {
      setBudgetLoading(false);
    }
  }

  function handleCancelEdit() {
    setCart([]);
    setRawDiscount(0);
    setSelectedCustomerId('');
    setEditingBudgetId(null);
    setErrorBanner(null);
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 size={32} className="text-amber-500 animate-spin" />
      </div>
    );
  }

  const selectedCustomer = customers.find(c => c.id === selectedCustomerId);

  return (
    <div className="p-4 sm:p-6 bg-slate-50 min-h-full space-y-4">
      {errorBanner && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm flex items-start gap-2.5">
          <AlertTriangle size={16} className="flex-shrink-0 mt-0.5 text-red-500" />
          <span className="flex-1">{errorBanner}</span>
          <button onClick={() => setErrorBanner(null)} className="text-red-400 hover:text-red-600">
            <X size={16} />
          </button>
        </div>
      )}

      {completedSale && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <CheckCircle2 size={20} className="text-emerald-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-emerald-900 text-sm">
                Venda #{completedSale.id.slice(0, 8).toUpperCase()} concluída com sucesso!
              </p>
              <p className="text-xs text-emerald-700">
                {completedSale.customerName} · {fmtCurrency(completedSale.total)} · {completedSale.paymentMethod} ({completedSale.statusFinanceiro}) — Estoque baixado e lançado no Financeiro.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={() => printSaleReceipt(completedSale)}
              className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-2 rounded-lg text-xs font-bold transition-colors"
            >
              <Printer size={14} />
              Imprimir Recibo (PDF)
            </button>
            <button
              type="button"
              onClick={() => setCompletedSale(null)}
              className="p-2 text-emerald-600 hover:bg-emerald-100 rounded-lg transition-colors"
              title="Fechar aviso"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* Lado Esquerdo - Busca e Carrinho */}
        <div className="lg:col-span-7 xl:col-span-8 space-y-6">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <Package size={20} className="text-amber-500" />
                Busca de Peças e Serviços
              </h2>
              <button
                type="button"
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
                placeholder="Busque pelo nome, código ou fabricante da peça / serviço..."
                value={itemSearch}
                onChange={e => setItemSearch(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-400 transition-all"
              />
            </div>

            {itemSearch.trim() && (
              <div className="mt-3 max-h-[320px] overflow-y-auto border border-slate-100 rounded-xl divide-y divide-slate-100">
                {filteredItems.length === 0 ? (
                  <div className="p-4 text-center text-sm text-slate-500">Nenhum item encontrado.</div>
                ) : (
                  filteredItems.map(item => {
                    if (item._type === 'product') {
                      const avail = Math.max(0, Number(item.stock_quantity) || 0);
                      const outOfStock = avail <= 0;
                      return (
                        <div key={`p-${item.id}`} className="p-3 hover:bg-slate-50 flex items-center justify-between gap-2 transition-colors">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className={`p-2 rounded-lg flex-shrink-0 ${outOfStock ? 'bg-red-50 text-red-500' : 'bg-emerald-100 text-emerald-600'}`}>
                              <Package size={16} />
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-slate-800 truncate">{item.name}</p>
                              <div className="flex flex-wrap items-center gap-2 text-xs">
                                {item.internal_code && <span className="font-mono text-slate-400">{item.internal_code}</span>}
                                {outOfStock ? (
                                  <span className="text-red-600 font-bold">Sem estoque</span>
                                ) : (
                                  <span className="text-slate-500">
                                    Estoque: <strong className="text-emerald-600">{avail} {item.unit || 'un'}</strong>
                                  </span>
                                )}
                                <span className="text-slate-300">|</span>
                                <span className="text-slate-700 font-semibold">{fmtCurrency(item.unit_price)}</span>
                              </div>
                            </div>
                          </div>
                          <button
                            type="button"
                            disabled={outOfStock}
                            onClick={() => addProductToCart(item)}
                            className="p-2 bg-amber-50 hover:bg-amber-100 disabled:bg-slate-100 disabled:text-slate-400 text-amber-600 rounded-lg transition-colors font-medium text-sm flex items-center gap-1 flex-shrink-0"
                          >
                            <Plus size={16} /> Adicionar
                          </button>
                        </div>
                      );
                    }

                    return (
                      <div key={`s-${item.id}`} className="p-3 hover:bg-slate-50 flex items-center justify-between gap-2 transition-colors">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="p-2 rounded-lg bg-blue-100 text-blue-600 flex-shrink-0">
                            <Tag size={16} />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-800 truncate">{item.name}</p>
                            <div className="flex items-center gap-2 text-xs">
                              <span className="text-slate-500">Serviço{item.category ? ` · ${item.category}` : ''}</span>
                              <span className="text-slate-300">|</span>
                              <span className="text-slate-700 font-semibold">{fmtCurrency(item.price)}</span>
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => addServiceToCart(item)}
                          className="p-2 bg-amber-50 hover:bg-amber-100 text-amber-600 rounded-lg transition-colors font-medium text-sm flex items-center gap-1 flex-shrink-0"
                        >
                          <Plus size={16} /> Adicionar
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>

          {/* Carrinho de Compras */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex-1 min-h-[380px] flex flex-col relative">
            {editingBudgetId && (
              <div className="absolute -top-3 left-4 bg-amber-500 text-white text-xs font-bold px-3 py-1 rounded-full shadow-sm flex items-center gap-2">
                Editando Orçamento Salvo
                <button type="button" onClick={handleCancelEdit} className="hover:bg-amber-600 rounded-full p-0.5" title="Cancelar edição">
                  <X size={12} />
                </button>
              </div>
            )}

            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <ShoppingCart size={20} className="text-amber-500" />
                Carrinho ({cart.length} {cart.length === 1 ? 'item' : 'itens'})
              </h2>
              {hasCartStockIssues && (
                <span className="text-xs font-bold text-red-600 bg-red-50 border border-red-200 px-2.5 py-1 rounded-lg flex items-center gap-1">
                  <AlertTriangle size={13} /> Estoque insuficiente em item(ns)
                </span>
              )}
            </div>

            {cart.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-400 py-12">
                <ShoppingCart size={48} className="mb-4 opacity-20" />
                <p>Nenhum item adicionado à venda.</p>
                <p className="text-sm mt-1">Busque peças ou serviços acima para começar.</p>
              </div>
            ) : (
              <div className="space-y-3 flex-1 overflow-auto">
                {cart.map((item, idx) => {
                  const stockShortage = item.type === 'product' ? cartStockIssues[item.id] : undefined;
                  return (
                    <div
                      key={`${item.type}-${item.id}-${idx}`}
                      className={`flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 p-3 border rounded-xl transition-colors ${
                        stockShortage !== undefined
                          ? 'border-red-300 bg-red-50/40'
                          : 'border-slate-100 hover:border-slate-200'
                      }`}
                    >
                      <div className="flex-1 min-w-[160px]">
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                            item.type === 'product' ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'
                          }`}>
                            {item.type === 'product' ? 'Peça' : 'Serviço'}
                          </span>
                          <p className="text-sm font-semibold text-slate-800 truncate">{item.name}</p>
                        </div>
                        <div className="flex items-center gap-2 mt-1.5">
                          <span className="text-[11px] text-slate-500">V. Unit (R$):</span>
                          <input
                            type="number"
                            min={0}
                            step={0.01}
                            value={item.unit_price}
                            onChange={e => updateUnitPrice(idx, parseFloat(e.target.value))}
                            className="w-24 bg-slate-50 border border-slate-200 rounded-md px-2 py-0.5 text-xs font-semibold text-slate-700 focus:outline-none focus:border-amber-400"
                          />
                          {stockShortage !== undefined && (
                            <span className="text-[11px] font-bold text-red-600">
                              Disponível agora: {stockShortage}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-1.5 bg-slate-50 p-1 rounded-lg border border-slate-200">
                          <button type="button" onClick={() => updateQuantity(idx, -1)} className="p-1 hover:bg-white rounded text-slate-600 hover:shadow-sm">
                            <Minus size={14} />
                          </button>
                          <span className="w-8 text-center text-sm font-bold text-slate-800">{item.quantity}</span>
                          <button type="button" onClick={() => updateQuantity(idx, 1)} className="p-1 hover:bg-white rounded text-slate-600 hover:shadow-sm">
                            <Plus size={14} />
                          </button>
                        </div>

                        <div className="w-24 text-right font-bold text-slate-800 text-sm">
                          {fmtCurrency(item.unit_price * item.quantity)}
                        </div>

                        <button type="button" onClick={() => removeFromCart(idx)} className="p-2 text-red-400 hover:bg-red-50 hover:text-red-600 rounded-lg transition-colors">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Lado Direito - Cliente, Pagamento e Conclusão */}
        <div className="lg:col-span-5 xl:col-span-4 space-y-6">

          {/* Cliente */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                <User size={16} className="text-slate-400" /> Vender para
              </h3>
              <span className="text-[11px] text-slate-400">{customers.length} clientes</span>
            </div>

            {!selectedCustomer ? (
              <div className="space-y-3">
                <input
                  type="text"
                  placeholder="Busque cliente por nome, CPF/CNPJ ou celular..."
                  value={customerSearch}
                  onChange={e => setCustomerSearch(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                />

                {customerSearch.trim() && (
                  <div className="max-h-[200px] overflow-y-auto border border-slate-100 rounded-xl divide-y divide-slate-100">
                    {filteredCustomers.length === 0 ? (
                      <div className="p-3 text-center text-xs text-slate-500">Cliente não encontrado.</div>
                    ) : (
                      filteredCustomers.map(c => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => { setSelectedCustomerId(c.id); setCustomerSearch(''); setErrorBanner(null); }}
                          className="w-full text-left p-3 hover:bg-blue-50 transition-colors flex justify-between items-center"
                        >
                          <div>
                            <p className="text-sm font-semibold text-slate-800">{c.name}</p>
                            <p className="text-xs text-slate-500">
                              {[c.document, c.city, c.phone].filter(Boolean).join(' - ')}
                            </p>
                          </div>
                          <CheckCircle2 size={16} className="text-blue-500 opacity-60" />
                        </button>
                      ))
                    )}
                  </div>
                )}
                <div className="text-xs text-slate-500 text-center">
                  {statusFinanceiro === 'Pendente'
                    ? <span className="text-amber-700 font-semibold">Obrigatório selecionar cliente para vendas Pendentes.</span>
                    : 'Deixe vazio para Venda Avulsa (somente Pago).'}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between p-3 bg-blue-50 border border-blue-200 rounded-xl gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-blue-900 truncate">{selectedCustomer.name}</p>
                  <p className="text-xs text-blue-700 truncate">
                    {[selectedCustomer.document, selectedCustomer.city, selectedCustomer.phone].filter(Boolean).join(' - ') || 'Sem detalhes adicionais'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedCustomerId('')}
                  className="px-2.5 py-1.5 hover:bg-blue-100 text-blue-600 rounded-lg text-xs font-semibold flex-shrink-0"
                >
                  Remover
                </button>
              </div>
            )}
          </div>

          {/* Pagamento */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-5">
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
                  min={0}
                  max={subtotal}
                  step={0.01}
                  value={rawDiscount === 0 ? '' : rawDiscount}
                  onChange={e => {
                    const v = parseFloat(e.target.value);
                    setRawDiscount(Number.isFinite(v) ? Math.max(0, Math.min(subtotal, v)) : 0);
                  }}
                  className="w-28 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-sm text-right focus:outline-none focus:border-amber-400"
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
                  {PDV_PAYMENT_METHODS.map(m => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setPaymentMethod(m)}
                      className={`p-2 rounded-lg text-xs font-semibold border transition-all ${
                        paymentMethod === m
                          ? 'bg-amber-500 text-white border-amber-500 shadow-md shadow-amber-500/20'
                          : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-amber-300'
                      }`}
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
                    type="button"
                    onClick={() => { setStatusFinanceiro('Pago'); setErrorBanner(null); }}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      statusFinanceiro === 'Pago' ? 'bg-emerald-500 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    Pago
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatusFinanceiro('Pendente')}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      statusFinanceiro === 'Pendente' ? 'bg-amber-500 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    Pendente
                  </button>
                </div>

                {pendingNeedsCustomer && (
                  <p className="mt-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2 flex items-start gap-1.5">
                    <AlertTriangle size={13} className="flex-shrink-0 mt-0.5 text-amber-600" />
                    <span>Selecione um cliente cadastrado acima para registrar venda a receber (Pendente).</span>
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Ações Finais */}
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={handleCancelEdit}
                className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 py-3 rounded-xl font-bold text-sm transition-colors flex items-center justify-center gap-2"
              >
                <FilePlus2 size={16} /> Novo Orçamento
              </button>

              <button
                type="button"
                onClick={handleSaveBudgetOnly}
                disabled={saving || cart.length === 0}
                className="w-full bg-blue-50 hover:bg-blue-100 border-2 border-blue-200 disabled:opacity-50 text-blue-700 py-3 rounded-xl font-bold text-sm transition-colors flex items-center justify-center gap-2"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                Salvar Orçamento
              </button>
            </div>

            <button
              type="button"
              onClick={handleGenerateBudget}
              disabled={generatingPdf || cart.length === 0}
              className="w-full bg-white hover:bg-slate-50 border-2 border-slate-300 disabled:opacity-50 text-slate-700 py-3 rounded-xl font-bold transition-colors flex items-center justify-center gap-2"
            >
              {generatingPdf ? <Loader2 size={18} className="animate-spin" /> : <FileText size={18} />}
              Gerar Orçamento (PDF)
            </button>

            <button
              type="button"
              onClick={handleSaveSale}
              disabled={saving || cart.length === 0 || pendingNeedsCustomer || hasCartStockIssues}
              className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white py-4 rounded-xl font-extrabold text-lg shadow-lg shadow-emerald-600/30 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
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
                <FolderOpen className="text-amber-500" /> Orçamentos Salvos ({savedBudgets.length})
              </h3>
              <button type="button" onClick={() => setShowBudgetsModal(false)} className="text-slate-400 hover:text-slate-600 p-2 rounded-lg hover:bg-slate-100 transition-colors">
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
                {savedBudgets.map(b => {
                  const ageDays = daysSinceIso(b.created_at);
                  const itemCount = Array.isArray(b.items) ? b.items.length : 0;
                  return (
                    <div key={b.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 border border-slate-200 rounded-xl hover:border-amber-300 transition-colors bg-white">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-bold text-slate-800">{b.customer_name || 'Cliente Avulso'}</h4>
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                            {itemCount} {itemCount === 1 ? 'item' : 'itens'}
                          </span>
                          {ageDays > 7 && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                              {ageDays} dias (validade expirada)
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">{formatDateTime(b.created_at)}</p>
                        <p className="text-sm font-semibold text-amber-600 mt-1">{fmtCurrency(b.total)}</p>
                      </div>

                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => handleEditBudget(b)}
                          className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-blue-50 hover:bg-blue-100 text-blue-600 px-3 py-2 rounded-lg text-sm font-semibold transition-colors"
                        >
                          <Edit size={16} /> Carregar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteBudget(b.id)}
                          className="flex items-center justify-center bg-slate-50 hover:bg-red-50 text-slate-400 hover:text-red-500 px-3 py-2 rounded-lg transition-colors"
                          title="Excluir orçamento"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
