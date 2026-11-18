export interface OSPartLike {
  product_id: string | null;
  part_name?: string;
  quantity: number;
  unit_price: number;
}

export interface OrderFinancialSummary {
  partsTotal: number;
  servicesTotal: number;
  laborCost: number;
  grandTotal: number;
}

export interface StockMovementRow {
  id?: string;
  product_id: string;
  product_name?: string;
  movement_type: string;
  quantity: number;
  reason?: string | null;
  service_order_id?: string | null;
}

export interface StockDelta {
  productId: string;
  /** Positive = need to deduct ('saida'); Negative = need to return ('entrada') */
  delta: number;
}

/**
 * Unified OS financial calculation across Workshop and Finance modules.
 * - Stock parts: rows with product_id != null
 * - Services / labor: rows with product_id == null
 * When `useMaxLabor` is true (read-only finance views), preserves legacy `labor_cost`
 * while guaranteeing newly recorded service rows are never lost or double-counted.
 */
export function calculateOrderFinancials(
  parts: OSPartLike[],
  fallbackLaborCost?: number | null,
  useMaxLabor = false
): OrderFinancialSummary {
  let partsTotal = 0;
  let servicesTotal = 0;

  for (const p of parts) {
    const lineTotal = (Number(p.quantity) || 0) * (Number(p.unit_price) || 0);
    if (p.product_id) {
      partsTotal += lineTotal;
    } else {
      servicesTotal += lineTotal;
    }
  }

  const laborCost = useMaxLabor
    ? Math.max(Number(fallbackLaborCost) || 0, servicesTotal)
    : servicesTotal;

  return {
    partsTotal,
    servicesTotal,
    laborCost,
    grandTotal: partsTotal + laborCost,
  };
}

/**
 * Matches legacy stock_movements reasons created before service_order_id was populated
 * (e.g., "Uso em OS #12" or "Uso em OS #0012"), while avoiding false matches like "OS #120".
 */
export function matchesLegacyOrderReason(reason: string, orderNumber: number): boolean {
  if (!reason || !orderNumber || orderNumber <= 0) return false;
  const pattern = new RegExp(`OS\\s*#0*${orderNumber}(?!\\d)`, 'i');
  return pattern.test(reason);
}

/**
 * Computes net deducted quantity per product_id for a specific OS from movement rows.
 * Positive values represent units currently deducted from stock by this OS.
 */
export function computeNetDeductedFromMovements(
  movements: StockMovementRow[],
  orderId: string,
  orderNumber: number
): Record<string, number> {
  const netByProduct: Record<string, number> = {};

  for (const m of movements) {
    if (!m.product_id) continue;
    const belongsToOrder =
      m.service_order_id === orderId ||
      (!m.service_order_id && matchesLegacyOrderReason(m.reason ?? '', orderNumber));

    if (!belongsToOrder) continue;

    const qty = Number(m.quantity) || 0;
    if (qty <= 0) continue;

    const type = (m.movement_type || '').toLowerCase();
    if (type === 'saida' || type === 'os') {
      netByProduct[m.product_id] = (netByProduct[m.product_id] ?? 0) + qty;
    } else if (type === 'entrada') {
      netByProduct[m.product_id] = (netByProduct[m.product_id] ?? 0) - qty;
    }
  }

  return netByProduct;
}

/**
 * Aggregates desired stock quantities by product_id from current OS parts.
 */
export function aggregateDesiredStockParts(parts: OSPartLike[]): Record<string, number> {
  const desired: Record<string, number> = {};
  for (const p of parts) {
    if (!p.product_id) continue;
    const qty = Math.round(Number(p.quantity) || 0);
    if (qty <= 0) continue;
    desired[p.product_id] = (desired[p.product_id] ?? 0) + qty;
  }
  return desired;
}

/**
 * Calculates idempotent stock deltas between desired OS parts and already-deducted stock.
 */
export function computeStockDeltas(
  desiredByProduct: Record<string, number>,
  currentNetDeducted: Record<string, number>
): StockDelta[] {
  const productIds = new Set([
    ...Object.keys(desiredByProduct),
    ...Object.keys(currentNetDeducted),
  ]);

  const deltas: StockDelta[] = [];
  for (const productId of productIds) {
    const desired = Math.max(0, Math.round(desiredByProduct[productId] ?? 0));
    const current = Math.max(0, Math.round(currentNetDeducted[productId] ?? 0));
    const delta = desired - current;
    if (delta !== 0) {
      deltas.push({ productId, delta });
    }
  }
  return deltas;
}
