import { supabase } from './supabase';
import {
  aggregateDesiredStockParts,
  calculateOrderFinancials,
  computeNetDeductedFromMovements,
  computeStockDeltas,
  matchesLegacyOrderReason,
  OSPartLike,
  OrderFinancialSummary,
  StockDelta,
  StockMovementRow,
} from './osCalculations';

export {
  aggregateDesiredStockParts,
  calculateOrderFinancials,
  computeNetDeductedFromMovements,
  computeStockDeltas,
  matchesLegacyOrderReason,
};
export type { OSPartLike, OrderFinancialSummary, StockDelta, StockMovementRow };

/**
 * Queries stock_movements for an OS (both by service_order_id and legacy reason fallback)
 * and returns net units currently deducted per product_id.
 */
export async function getNetDeductedStockByProduct(
  orderId: string,
  orderNumber: number
): Promise<Record<string, number>> {
  const movements: StockMovementRow[] = [];
  const seenIds = new Set<string>();

  const { data: byOrderId } = await supabase
    .from('stock_movements')
    .select('id,product_id,product_name,movement_type,quantity,reason,service_order_id')
    .eq('service_order_id', orderId);

  for (const row of (byOrderId as StockMovementRow[] | null) ?? []) {
    if (row.id) seenIds.add(row.id);
    movements.push(row);
  }

  if (orderNumber > 0) {
    const { data: byLegacyReason } = await supabase
      .from('stock_movements')
      .select('id,product_id,product_name,movement_type,quantity,reason,service_order_id')
      .is('service_order_id', null)
      .ilike('reason', `%OS #%${orderNumber}%`);

    for (const row of (byLegacyReason as StockMovementRow[] | null) ?? []) {
      if (row.id && seenIds.has(row.id)) continue;
      if (row.id) seenIds.add(row.id);
      movements.push(row);
    }
  }

  return computeNetDeductedFromMovements(movements, orderId, orderNumber);
}

/**
 * Safely reverses ONLY the stock quantities that were actually deducted by this OS.
 * If the OS was closed by a technician without stock deduction, performs zero movements.
 */
export async function reverseOrderStockDeductions(params: {
  orderId: string;
  orderNumber: number;
  responsible: string;
  reason: string;
}): Promise<number> {
  const { orderId, orderNumber, responsible, reason } = params;
  const currentNet = await getNetDeductedStockByProduct(orderId, orderNumber);
  const entries = Object.entries(currentNet).filter(([, qty]) => Math.round(qty) > 0);
  if (entries.length === 0) return 0;

  let reversedCount = 0;

  for (const [productId, rawQty] of entries) {
    const qty = Math.round(rawQty);
    if (qty <= 0) continue;

    const { data: prod } = await supabase
      .from('products')
      .select('id,name,stock_quantity')
      .eq('id', productId)
      .maybeSingle();

    if (!prod) continue;

    const before = Number(prod.stock_quantity) || 0;
    const after = before + qty;

    await supabase
      .from('products')
      .update({ stock_quantity: after })
      .eq('id', productId);

    await supabase.from('stock_movements').insert({
      product_id: productId,
      product_name: prod.name,
      movement_type: 'entrada',
      quantity: qty,
      quantity_before: before,
      quantity_after: after,
      reason,
      service_order_id: orderId,
      responsible,
    });

    reversedCount += 1;
  }

  return reversedCount;
}

/**
 * Reconciles stock deductions idempotently on OS conclusion / re-conclusion.
 * Compares desired stock parts against net already-deducted stock and applies only the delta.
 */
export async function applyOrderStockDeductions(params: {
  orderId: string;
  orderNumber: number;
  parts: OSPartLike[];
  responsible: string;
}): Promise<number> {
  const { orderId, orderNumber, parts, responsible } = params;
  const currentNet = await getNetDeductedStockByProduct(orderId, orderNumber);
  const desired = aggregateDesiredStockParts(parts);
  const deltas = computeStockDeltas(desired, currentNet);

  if (deltas.length === 0) return 0;

  let movementsApplied = 0;
  const orderLabel = `#${String(orderNumber).padStart(4, '0')}`;

  for (const { productId, delta } of deltas) {
    const { data: prod } = await supabase
      .from('products')
      .select('id,name,stock_quantity')
      .eq('id', productId)
      .maybeSingle();

    if (!prod) continue;

    const before = Number(prod.stock_quantity) || 0;
    const isDeduction = delta > 0;
    const qty = Math.abs(delta);
    const after = isDeduction ? Math.max(0, before - qty) : before + qty;

    await supabase
      .from('products')
      .update({ stock_quantity: after })
      .eq('id', productId);

    await supabase.from('stock_movements').insert({
      product_id: productId,
      product_name: prod.name,
      movement_type: isDeduction ? 'saida' : 'entrada',
      quantity: qty,
      quantity_before: before,
      quantity_after: after,
      reason: isDeduction
        ? `Uso em OS ${orderLabel}`
        : `Ajuste/estorno parcial de peças em OS ${orderLabel}`,
      service_order_id: orderId,
      responsible,
    });

    movementsApplied += 1;
  }

  return movementsApplied;
}

export async function logOsStageTransition(params: {
  orderId: string;
  fromStatus: string;
  toStatus: string;
  userName: string;
  userId?: string | null;
  notes?: string;
}): Promise<void> {
  const { error } = await supabase.from('os_stage_history').insert({
    service_order_id: params.orderId,
    from_status: params.fromStatus || '',
    to_status: params.toStatus,
    changed_by_name: params.userName || 'Sistema',
    changed_by_id: params.userId ?? null,
    notes: params.notes ?? '',
  });
  if (error) {
    console.warn('Erro ao registrar histórico de etapa da OS:', error.message);
  }
}

export async function logFinancialAudit(params: {
  actionType: 'insert' | 'update' | 'delete';
  tableName: string;
  recordId: string;
  userName: string;
  changes: Record<string, unknown>;
}): Promise<void> {
  const { error } = await supabase.from('financial_audit_logs').insert({
    action_type: params.actionType,
    table_name: params.tableName,
    record_id: params.recordId,
    user_name: params.userName || 'Sistema',
    changes: params.changes,
  });
  if (error) {
    console.warn('Erro ao registrar log de auditoria financeira:', error.message);
  }
}
