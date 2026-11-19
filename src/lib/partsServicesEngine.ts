import { formatLocalDateBR, toLocalDateKey } from './financeEngine';

// ─── Shared Domain Interfaces ─────────────────────────────────────────────────

export interface ProductLike {
  id: string;
  internal_code?: string | null;
  name: string;
  category?: string | null;
  manufacturer?: string | null;
  unit?: string | null;
  cost_price?: number | null;
  unit_price?: number | null;
  stock_quantity?: number | null;
  stock_min?: number | null;
  location?: string | null;
  part_notes?: string | null;
  photo_url?: string | null;
  description?: string | null;
  active?: boolean;
}

export interface ServiceLike {
  id: string;
  name: string;
  category?: string | null;
  estimated_time?: string | null;
  technician_name?: string | null;
  price?: number | null;
  notes?: string | null;
  active?: boolean;
}

export interface StockMovementLike {
  id?: string;
  product_id: string;
  product_name?: string | null;
  movement_type: string;
  quantity: number;
  quantity_before: number;
  quantity_after: number;
  reason?: string | null;
  responsible?: string | null;
  created_at: string;
}

export interface PdvCartItem {
  id: string;
  type: 'product' | 'service';
  name: string;
  unit_price: number;
  quantity: number;
  max_quantity?: number;
}

export type ManualMovementType = 'entrada' | 'saida' | 'ajuste';
export type ReportPeriod = '30d' | '90d' | 'year' | 'all';

// ─── Safe String & Photo Helpers ──────────────────────────────────────────────

export function safeLower(val: string | null | undefined): string {
  return (val ?? '').toLowerCase();
}

export function stripAccents(val: string): string {
  return val.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Returns the product photo URL from `photo_url`, falling back safely to
 * legacy URLs stored inside `description` (never returning plain text descriptions).
 */
export function getProductPhotoUrl(
  product: { photo_url?: string | null; description?: string | null } | null | undefined
): string {
  if (!product) return '';
  const direct = (product.photo_url ?? '').trim();
  if (direct) return direct;
  const legacy = (product.description ?? '').trim();
  if (/^https?:\/\//i.test(legacy)) return legacy;
  return '';
}

// ─── Manual Stock Movement Math ───────────────────────────────────────────────

export type ManualMovementResult =
  | {
      ok: true;
      before: number;
      after: number;
      delta: number;
      movementQuantity: number;
    }
  | {
      ok: false;
      error: string;
    };

/**
 * Deterministic stock math for manual movements:
 * - entrada: adds positive quantity
 * - saida: subtracts quantity, blocking stock below 0
 * - ajuste: sets exact targetStock, computing real positive or negative delta
 */
export function computeManualMovement(params: {
  movementType: ManualMovementType;
  currentStock: number;
  quantity?: number;
  targetStock?: number;
}): ManualMovementResult {
  const before = Math.max(0, Math.round(Number(params.currentStock) || 0));

  if (params.movementType === 'entrada') {
    const qty = Math.round(Number(params.quantity) || 0);
    if (qty <= 0) return { ok: false, error: 'Informe uma quantidade maior que zero.' };
    return {
      ok: true,
      before,
      after: before + qty,
      delta: qty,
      movementQuantity: qty,
    };
  }

  if (params.movementType === 'saida') {
    const qty = Math.round(Number(params.quantity) || 0);
    if (qty <= 0) return { ok: false, error: 'Informe uma quantidade maior que zero.' };
    if (qty > before) {
      return {
        ok: false,
        error: `Saldo insuficiente em estoque (disponível: ${before}, solicitado: ${qty}).`,
      };
    }
    return {
      ok: true,
      before,
      after: before - qty,
      delta: -qty,
      movementQuantity: qty,
    };
  }

  // 'ajuste' -> targetStock
  if (params.targetStock === undefined || params.targetStock === null || Number.isNaN(Number(params.targetStock))) {
    return { ok: false, error: 'Informe o novo saldo físico desejado.' };
  }
  const target = Math.round(Number(params.targetStock));
  if (target < 0) {
    return { ok: false, error: 'O novo saldo físico não pode ser negativo.' };
  }
  const delta = target - before;
  if (delta === 0) {
    return { ok: false, error: 'O novo saldo é igual ao saldo atual. Nenhuma alteração necessária.' };
  }
  return {
    ok: true,
    before,
    after: target,
    delta,
    movementQuantity: Math.abs(delta),
  };
}

/**
 * Returns the real signed delta (+N or -N) for displaying any stock_movement row,
 * correctly reflecting negative adjustments and OS deductions.
 */
export function getMovementSignedDelta(
  m: Pick<StockMovementLike, 'movement_type' | 'quantity' | 'quantity_before' | 'quantity_after'>
): number {
  const before = Number(m.quantity_before);
  const after = Number(m.quantity_after);
  if (Number.isFinite(before) && Number.isFinite(after) && after !== before) {
    return after - before;
  }
  const absQty = Math.abs(Number(m.quantity) || 0);
  const type = (m.movement_type || '').toLowerCase();
  if (type === 'saida' || type === 'os') return -absQty;
  return absQty;
}

// ─── Expense Integration Classification ───────────────────────────────────────

export interface ExpenseIntegrationSpec {
  kind: 'purchase' | 'loss';
  category: string;
  label: string;
}

export function getExpenseIntegrationKind(
  movementType: string,
  reason: string | null | undefined
): ExpenseIntegrationSpec | null {
  const type = (movementType || '').toLowerCase().trim();
  const normReason = stripAccents((reason ?? '').toLowerCase().trim());

  if (type === 'entrada' && normReason === 'compra') {
    return {
      kind: 'purchase',
      category: 'Compra de Estoque',
      label: 'Compra de Estoque',
    };
  }

  if (type === 'saida' && ['perda', 'quebra', 'furto', 'roubo'].includes(normReason)) {
    return {
      kind: 'loss',
      category: 'Perda/Quebra de Estoque',
      label: 'Perda / Quebra / Furto',
    };
  }

  return null;
}

// ─── Gross Margin & Inventory Reports ─────────────────────────────────────────

export function computeGrossMarginPercent(
  unitPrice: number | null | undefined,
  costPrice: number | null | undefined
): number | null {
  const sell = Number(unitPrice) || 0;
  const cost = Number(costPrice) || 0;
  if (sell <= 0 || cost <= 0) return null;
  return ((sell - cost) / sell) * 100;
}

export function filterMovementsByPeriod<T extends Pick<StockMovementLike, 'created_at'>>(
  movements: T[],
  period: ReportPeriod,
  now: Date = new Date()
): T[] {
  if (period === 'all') return movements;

  let startDate: Date;
  if (period === '30d') {
    startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30);
  } else if (period === '90d') {
    startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 90);
  } else {
    startDate = new Date(now.getFullYear(), 0, 1);
  }

  const startKey = toLocalDateKey(startDate);
  return movements.filter(m => {
    const key = toLocalDateKey(m.created_at);
    return !key || key >= startKey;
  });
}

export interface InventoryReport {
  totalParts: number;
  totalValue: number;
  totalCost: number;
  potentialProfit: number;
  zeroStock: number;
  belowMin: number;
  zeroPriceCount: number;
  negativeMarginCount: number;
  noMovementCount: number;
  servicesCount: number;
  topUsedParts: { productId: string; name: string; qty: number }[];
  categoryValues: { category: string; value: number }[];
  topMargins: { id: string; name: string; margin: number }[];
  movementSummary: {
    type: 'entrada' | 'saida' | 'os' | 'ajuste';
    label: string;
    count: number;
    units: number;
  }[];
}

export function computeInventoryReport(
  products: ProductLike[],
  periodMovements: StockMovementLike[],
  servicesCount: number
): InventoryReport {
  let totalValue = 0;
  let totalCost = 0;
  let zeroStock = 0;
  let belowMin = 0;
  let zeroPriceCount = 0;
  let negativeMarginCount = 0;

  const catMap: Record<string, number> = {};
  const marginList: { id: string; name: string; margin: number }[] = [];

  for (const p of products) {
    const qty = Math.max(0, Number(p.stock_quantity) || 0);
    const min = Math.max(0, Number(p.stock_min) || 0);
    const sell = Number(p.unit_price) || 0;
    const cost = Number(p.cost_price) || 0;

    totalValue += sell * qty;
    totalCost += cost * qty;

    if (qty === 0) zeroStock += 1;
    else if (min > 0 && qty <= min) belowMin += 1;

    if (sell <= 0) zeroPriceCount += 1;

    const margin = computeGrossMarginPercent(sell, cost);
    if (margin !== null) {
      if (margin < 0) negativeMarginCount += 1;
      marginList.push({ id: p.id, name: p.name, margin });
    }

    const cat = (p.category ?? '').trim() || 'Outros';
    catMap[cat] = (catMap[cat] ?? 0) + sell * qty;
  }

  const movedIds = new Set(periodMovements.map(m => m.product_id));
  const noMovementCount = products.filter(p => !movedIds.has(p.id)).length;

  const usageMap: Record<string, { productId: string; name: string; qty: number }> = {};
  const typeStats: Record<'entrada' | 'saida' | 'os' | 'ajuste', { count: number; units: number }> = {
    entrada: { count: 0, units: 0 },
    saida: { count: 0, units: 0 },
    os: { count: 0, units: 0 },
    ajuste: { count: 0, units: 0 },
  };

  for (const m of periodMovements) {
    const rawType = (m.movement_type || 'ajuste').toLowerCase();
    const bucket: 'entrada' | 'saida' | 'os' | 'ajuste' =
      rawType === 'entrada' || rawType === 'saida' || rawType === 'os' || rawType === 'ajuste'
        ? rawType
        : 'ajuste';

    const absUnits = Math.abs(getMovementSignedDelta(m)) || Math.abs(Number(m.quantity) || 0);
    typeStats[bucket].count += 1;
    typeStats[bucket].units += absUnits;

    if (bucket === 'saida' || bucket === 'os') {
      const prev = usageMap[m.product_id];
      usageMap[m.product_id] = {
        productId: m.product_id,
        name: m.product_name || prev?.name || 'Peça',
        qty: (prev?.qty ?? 0) + absUnits,
      };
    }
  }

  const topUsedParts = Object.values(usageMap)
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 8);

  const categoryValues = Object.entries(catMap)
    .map(([category, value]) => ({ category, value }))
    .sort((a, b) => b.value - a.value);

  const topMargins = marginList
    .sort((a, b) => b.margin - a.margin)
    .slice(0, 8);

  const movementSummary: InventoryReport['movementSummary'] = [
    { type: 'entrada', label: 'Entradas', ...typeStats.entrada },
    { type: 'saida', label: 'Saídas', ...typeStats.saida },
    { type: 'os', label: 'Uso em OS', ...typeStats.os },
    { type: 'ajuste', label: 'Ajustes', ...typeStats.ajuste },
  ];

  return {
    totalParts: products.length,
    totalValue,
    totalCost,
    potentialProfit: totalValue - totalCost,
    zeroStock,
    belowMin,
    zeroPriceCount,
    negativeMarginCount,
    noMovementCount,
    servicesCount,
    topUsedParts,
    categoryValues,
    topMargins,
    movementSummary,
  };
}

// ─── PDV Totals & Checkout Validation ─────────────────────────────────────────

export function computePdvTotals(
  cart: PdvCartItem[],
  rawDiscount: number
): { subtotal: number; discount: number; total: number } {
  const subtotal = cart.reduce((acc, item) => {
    const price = Math.max(0, Number(item.unit_price) || 0);
    const qty = Math.max(0, Number(item.quantity) || 0);
    return acc + price * qty;
  }, 0);
  const clampedDiscount = Math.min(subtotal, Math.max(0, Number(rawDiscount) || 0));
  const total = Math.max(0, subtotal - clampedDiscount);
  return { subtotal, discount: clampedDiscount, total };
}

export type PdvCheckoutValidation =
  | { ok: true }
  | {
      ok: false;
      error: string;
      insufficientProducts?: { id: string; name: string; requested: number; available: number }[];
    };

export function validatePdvCheckout(params: {
  cart: PdvCartItem[];
  statusFinanceiro: 'Pago' | 'Pendente';
  selectedCustomerId: string;
  liveStockByProductId: Record<string, number>;
}): PdvCheckoutValidation {
  if (params.cart.length === 0) {
    return { ok: false, error: 'Adicione pelo menos um item ao carrinho.' };
  }

  for (const item of params.cart) {
    if ((Number(item.quantity) || 0) <= 0) {
      return { ok: false, error: `Quantidade inválida para "${item.name}".` };
    }
    if ((Number(item.unit_price) || 0) < 0) {
      return { ok: false, error: `Preço inválido para "${item.name}".` };
    }
  }

  if (params.statusFinanceiro === 'Pendente' && !params.selectedCustomerId.trim()) {
    return {
      ok: false,
      error: 'Vendas com status Pendente exigem um cliente cadastrado (não permitido para Cliente Avulso).',
    };
  }

  // Aggregate requested quantities per product id
  const requestedByProduct: Record<string, { name: string; qty: number }> = {};
  for (const item of params.cart) {
    if (item.type !== 'product') continue;
    const prev = requestedByProduct[item.id];
    requestedByProduct[item.id] = {
      name: item.name,
      qty: (prev?.qty ?? 0) + Math.round(Number(item.quantity) || 0),
    };
  }

  const insufficientProducts: { id: string; name: string; requested: number; available: number }[] = [];
  for (const [id, req] of Object.entries(requestedByProduct)) {
    const available = Math.max(0, Math.round(Number(params.liveStockByProductId[id] ?? 0)));
    if (req.qty > available) {
      insufficientProducts.push({
        id,
        name: req.name,
        requested: req.qty,
        available,
      });
    }
  }

  if (insufficientProducts.length > 0) {
    const details = insufficientProducts
      .map(p => `${p.name} (disponível: ${p.available}, no carrinho: ${p.requested})`)
      .join('; ');
    return {
      ok: false,
      error: `Estoque insuficiente para concluir a venda: ${details}.`,
      insufficientProducts,
    };
  }

  return { ok: true };
}

// ─── Robust PT-BR Number & CSV Parsing / Export ───────────────────────────────

export function parseBrNumber(raw: string | number | null | undefined): number {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : 0;
  if (!raw) return 0;
  const cleaned = String(raw).trim().replace(/[^\d.,-]/g, '');
  if (!cleaned) return 0;

  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');

  let normalized = cleaned;
  if (lastComma !== -1 && lastDot !== -1) {
    if (lastComma > lastDot) {
      // PT-BR: 1.250,50
      normalized = cleaned.replace(/\./g, '').replace(',', '.');
    } else {
      // EN-US: 1,250.50
      normalized = cleaned.replace(/,/g, '');
    }
  } else if (lastComma !== -1) {
    normalized = cleaned.replace(',', '.');
  }

  const val = parseFloat(normalized);
  return Number.isFinite(val) ? val : 0;
}

export function parseCsvLine(line: string, sep: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === sep) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

export interface ParsedProductImportRow {
  name: string;
  internal_code: string;
  category: string;
  manufacturer: string;
  unit: string;
  cost_price: number;
  unit_price: number;
  stock_quantity: number;
  stock_min: number;
  location: string;
  part_notes: string;
}

export function parseProductsCsv(rawText: string): {
  rows: ParsedProductImportRow[];
  errors: string[];
} {
  const cleanText = rawText.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = cleanText.split('\n').filter(l => l.trim().length > 0);
  if (lines.length < 2) {
    return { rows: [], errors: ['Arquivo CSV vazio ou sem linhas de dados.'] };
  }

  const firstLine = lines[0];
  const sep = (firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';
  const rawHeaders = parseCsvLine(firstLine, sep);
  const headers = rawHeaders.map(h =>
    stripAccents(h.toLowerCase()).replace(/["'\s_-]/g, '')
  );

  const findCol = (aliases: string[]) => {
    for (const alias of aliases) {
      const idx = headers.indexOf(alias);
      if (idx >= 0) return idx;
    }
    return -1;
  };

  const colName  = findCol(['nome', 'name', 'descricao', 'peca', 'produto']);
  const colCode  = findCol(['codigo', 'code', 'internalcode', 'codigointerno', 'sku', 'ean']);
  const colCat   = findCol(['categoria', 'category']);
  const colMfr   = findCol(['fabricante', 'manufacturer', 'marca']);
  const colUnit  = findCol(['unidade', 'unit', 'un']);
  const colCost  = findCol(['custo', 'cost', 'costprice', 'precocusto', 'precodecusto']);
  const colSell  = findCol(['venda', 'unitprice', 'preco', 'precodevenda', 'precovenda']);
  const colStock = findCol(['estoque', 'stock', 'stockquantity', 'quantidade', 'qtd']);
  const colMin   = findCol(['minimo', 'stockmin', 'estoqueminimo']);
  const colLoc   = findCol(['localizacao', 'location', 'prateleira']);
  const colNotes = findCol(['observacoes', 'observacao', 'obs', 'partnotes', 'notas']);

  if (colName < 0) {
    return { rows: [], errors: ['Coluna obrigatória "Nome" não encontrada no cabeçalho do CSV.'] };
  }

  const rows: ParsedProductImportRow[] = [];
  const errors: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i], sep);
    const get = (idx: number) => (idx >= 0 ? (cells[idx] ?? '').trim() : '');
    const name = get(colName);
    if (!name) {
      errors.push(`Linha ${i + 1}: nome vazio (ignorada).`);
      continue;
    }

    rows.push({
      name,
      internal_code: get(colCode),
      category: get(colCat) || 'Outros',
      manufacturer: get(colMfr),
      unit: get(colUnit) || 'un',
      cost_price: Math.max(0, parseBrNumber(get(colCost))),
      unit_price: Math.max(0, parseBrNumber(get(colSell))),
      stock_quantity: Math.max(0, Math.round(parseBrNumber(get(colStock)))),
      stock_min: Math.max(0, Math.round(parseBrNumber(get(colMin)))),
      location: get(colLoc),
      part_notes: get(colNotes),
    });
  }

  return { rows, errors };
}

function csvEscape(val: string | number | null | undefined): string {
  const s = String(val ?? '').replace(/[\r\n]+/g, ' ').replace(/"/g, '""');
  return `"${s}"`;
}

function fmtBrDecimal(val: number | null | undefined): string {
  return (Number(val) || 0).toFixed(2).replace('.', ',');
}

export function buildProductsCsv(products: ProductLike[]): string {
  const header = [
    'Código',
    'Nome',
    'Categoria',
    'Fabricante',
    'Unidade',
    'Custo',
    'Venda',
    'Margem (%)',
    'Estoque',
    'Mínimo',
    'Localização',
    'Observações',
  ].join(';');

  const rows = products.map(p => {
    const margin = computeGrossMarginPercent(p.unit_price, p.cost_price);
    return [
      csvEscape(p.internal_code),
      csvEscape(p.name),
      csvEscape(p.category),
      csvEscape(p.manufacturer),
      csvEscape(p.unit || 'un'),
      fmtBrDecimal(p.cost_price),
      fmtBrDecimal(p.unit_price),
      margin === null ? '' : fmtBrDecimal(margin),
      String(Number(p.stock_quantity) || 0),
      String(Number(p.stock_min) || 0),
      csvEscape(p.location),
      csvEscape(p.part_notes),
    ].join(';');
  });

  return '\uFEFF' + [header, ...rows].join('\r\n');
}

export function buildServicesCsv(services: ServiceLike[]): string {
  const header = ['Nome', 'Categoria', 'Tempo Estimado', 'Técnico', 'Valor', 'Observações'].join(';');
  const rows = services.map(s =>
    [
      csvEscape(s.name),
      csvEscape(s.category),
      csvEscape(s.estimated_time),
      csvEscape(s.technician_name),
      fmtBrDecimal(s.price),
      csvEscape(s.notes),
    ].join(';')
  );
  return '\uFEFF' + [header, ...rows].join('\r\n');
}

export function buildMovementsCsv(movements: StockMovementLike[]): string {
  const header = [
    'Data',
    'Peça',
    'Tipo',
    'Delta',
    'Antes',
    'Depois',
    'Motivo',
    'Responsável',
  ].join(';');

  const rows = movements.map(m => {
    const delta = getMovementSignedDelta(m);
    return [
      csvEscape(formatLocalDateBR(m.created_at)),
      csvEscape(m.product_name),
      csvEscape(m.movement_type),
      delta > 0 ? `+${delta}` : String(delta),
      String(m.quantity_before ?? 0),
      String(m.quantity_after ?? 0),
      csvEscape(m.reason),
      csvEscape(m.responsible),
    ].join(';');
  });

  return '\uFEFF' + [header, ...rows].join('\r\n');
}
