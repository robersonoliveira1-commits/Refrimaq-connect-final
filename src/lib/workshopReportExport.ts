import * as XLSX from 'xlsx';
import { calculateOrderFinancials, OrderFinancialSummary, OSPartLike } from './osCalculations';

export interface WorkshopReportPart {
  product_id: string | null;
  part_name?: string | null;
  quantity: number;
  unit_price: number;
}

export function calculateWorkshopOrderFinancials(
  order: Pick<WorkshopReportOrder, 'service_order_parts' | 'labor_cost'>
): OrderFinancialSummary {
  const parts: OSPartLike[] = (order.service_order_parts ?? []).map(p => ({
    product_id: p.product_id,
    part_name: p.part_name ?? undefined,
    quantity: p.quantity,
    unit_price: p.unit_price,
  }));
  return calculateOrderFinancials(parts, order.labor_cost, true);
}

export interface WorkshopReportOrder {
  id: string;
  order_number: number;
  status: string;
  visit_type: string;
  labor_cost: number | null;
  technician_id?: string | null;
  equip_type: string | null;
  equip_brand?: string | null;
  equip_model: string | null;
  equip_serial: string | null;
  equip_voltage?: string | null;
  diagnosis: string | null;
  created_at: string;
  customers: { name: string } | null;
  user_profiles?: { full_name: string | null } | Array<{ full_name: string | null }> | null;
  service_order_parts: WorkshopReportPart[];
}

export function getWorkshopOrderTechnicianName(
  order: Pick<WorkshopReportOrder, 'user_profiles'>
): string {
  const rel = order.user_profiles;
  if (Array.isArray(rel)) {
    return (rel[0]?.full_name ?? '').trim();
  }
  return (rel?.full_name ?? '').trim();
}

export interface ProductStockMeta {
  id: string;
  name?: string | null;
  category?: string | null;
  unit?: string | null;
  stock_quantity?: number | null;
}

export interface ConsolidatedMaterialRow {
  name: string;
  category: string;
  unit: string;
  totalQty: number;
  unitPrice: number;
  totalValue: number;
  osTags: string[];
  stockQuantity: number | null;
  alerts: string[];
}

export interface ConsolidatedServiceRow {
  name: string;
  totalQty: number;
  unitPrice: number;
  totalValue: number;
  osTags: string[];
}

export interface WorkshopReportSummary {
  ordersCount: number;
  materialsDistinctCount: number;
  servicesDistinctCount: number;
  voltageAlertsCount: number;
  partsTotal: number;
  servicesTotal: number;
  grandTotal: number;
}

const BRL_NUM_FMT = '"R$ "#,##0.00';
const QTY_NUM_FMT = '#,##0.##';
const INT_NUM_FMT = '#,##0';
const PCT_NUM_FMT = '0.0%';

export function formatOsTag(orderNumber: number): string {
  return `#${String(orderNumber).padStart(4, '0')}`;
}

/**
 * Formats an ISO timestamp or YYYY-MM-DD date string to local YYYY-MM-DD key
 * without UTC -03:00 day-shift bugs.
 */
export function toLocalCalendarKey(isoOrDate: string | null | undefined): string {
  if (!isoOrDate) return '';
  const trimmed = isoOrDate.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return '';
  const y = parsed.getFullYear();
  const m = String(parsed.getMonth() + 1).padStart(2, '0');
  const d = String(parsed.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function formatOrderDateBr(isoOrDate: string | null | undefined): string {
  const key = toLocalCalendarKey(isoOrDate);
  if (!key) return '';
  const [y, m, d] = key.split('-');
  return `${d}/${m}/${y}`;
}

export function matchesLocalDateRange(
  createdAt: string,
  startDate: string,
  endDate: string
): boolean {
  if (!startDate && !endDate) return true;
  const orderKey = toLocalCalendarKey(createdAt);
  if (!orderKey) return false;
  if (startDate && orderKey < startDate) return false;
  if (endDate && orderKey > endDate) return false;
  return true;
}

/**
 * Parses a multi-OS search input such as "#0178 #0170 #0168" or "178, 170, 58".
 * Returns a Set of numeric order numbers when the query consists exclusively of
 * 2+ OS numbers (or a single #-prefixed OS number like "#0178"); otherwise null.
 */
export function parseMultiOsQuery(search: string): Set<number> | null {
  const trimmed = search.trim();
  if (!trimmed) return null;

  const tokens = trimmed.split(/[\s,;|]+/).filter(Boolean);
  if (tokens.length === 0) return null;

  const isSingleHashOs = tokens.length === 1 && /^#\d+$/.test(tokens[0]);
  const isMultiNumericOs = tokens.length >= 2 && tokens.every(t => /^#?\d+$/.test(t));

  if (!isSingleHashOs && !isMultiNumericOs) {
    return null;
  }

  const nums = new Set<number>();
  for (const token of tokens) {
    const num = parseInt(token.replace(/^#/, ''), 10);
    if (Number.isFinite(num) && num > 0) {
      nums.add(num);
    }
  }
  return nums.size > 0 ? nums : null;
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function matchesWorkshopOrderSearch(order: WorkshopReportOrder, search: string): boolean {
  const trimmed = search.trim();
  if (!trimmed) return true;

  const multiOs = parseMultiOsQuery(trimmed);
  if (multiOs) {
    return multiOs.has(order.order_number);
  }

  const q = normalizeText(trimmed);
  const qDigits = q.replace(/^#/, '');
  if (String(order.order_number).includes(qDigits)) return true;
  if (formatOsTag(order.order_number).toLowerCase().includes(q)) return true;

  const partsNames = (order.service_order_parts ?? [])
    .map(p => p.part_name ?? '')
    .join(' ');

  const technicianName = getWorkshopOrderTechnicianName(order);
  const hay = normalizeText(
    `${order.customers?.name ?? ''} ${technicianName} ${order.equip_brand ?? ''} ${order.equip_model ?? ''} ${
      order.equip_serial ?? ''
    } ${order.visit_type ?? ''} ${order.equip_type ?? ''} ${order.diagnosis ?? ''} ${partsNames}`
  );
  return hay.includes(q);
}

export function classifyMaterialCategoryAndUnit(
  partName: string,
  productMeta?: ProductStockMeta | null
): { category: string; unit: string } {
  const u = (partName || '').toUpperCase();
  let inferredCategory = 'Peças e Componentes';
  let inferredUnit = 'un';

  if (u.includes('COMPRESSOR')) {
    inferredCategory = 'Compressor';
  } else if (u.includes('GAS REFRIGERANTE') || u.includes('GÁS REFRIGERANTE') || /\bR134A\b|\bR22\b|\bR404A\b|\bR290\b/.test(u) && u.includes('GAS')) {
    inferredCategory = 'Gás Refrigerante';
    inferredUnit = 'kg';
  } else if (u.includes('FILTRO SECADOR') || u.includes('FILTRO')) {
    inferredCategory = 'Filtro Secador';
  } else if (u.includes('BOBINA') || u.includes('SOLENOIDE') || u.includes('VALVULA') || u.includes('VÁLVULA')) {
    inferredCategory = 'Válvula / Bobina Solenoide';
  } else if (u.includes('VENTILADOR') || u.includes('MICROMOTOR') || u.includes('MOTOR')) {
    inferredCategory = 'Ventilação / Micromotor';
  } else if (u.includes('PRESSOSTATO') || u.includes('TERMOSTATO') || u.includes('CONTROLADOR') || u.includes('SENSOR')) {
    inferredCategory = 'Controle / Pressão';
  } else if (u.includes('CABO') || u.includes('FIO') || u.includes('RELE') || u.includes('RELÉ') || u.includes('CAPACITOR')) {
    inferredCategory = 'Material Elétrico';
    if (u.includes('CABO')) inferredUnit = 'm/un';
  }

  const dbCat = (productMeta?.category ?? '').trim();
  const dbUnit = (productMeta?.unit ?? '').trim();

  const category =
    dbCat && !['outros', 'peças de chopeira', 'pecas de chopeira', 'geral'].includes(dbCat.toLowerCase())
      ? dbCat
      : inferredCategory;

  const unit =
    inferredUnit === 'kg'
      ? 'kg'
      : dbUnit || inferredUnit;

  return { category, unit };
}

export function detectVoltageMismatchAlert(
  order: Pick<WorkshopReportOrder, 'order_number' | 'equip_voltage' | 'diagnosis'>,
  partName: string
): string | null {
  const eqVolt = (order.equip_voltage ?? '').toUpperCase();
  const diag = (order.diagnosis ?? '').toUpperCase();
  const pn = (partName ?? '').toUpperCase();

  const partIs220 = /\b220\s*V\b/.test(pn);
  const partIs110 = /\b(110|127)\s*V\b/.test(pn);
  const equipIs110 = /\b(110|127)\s*V\b/.test(eqVolt) || /\b(110|127)\s*V\b/.test(diag);
  const equipIs220 = /\b220\s*V\b/.test(eqVolt) && !/\b(110|127)\s*V\b/.test(diag);

  if (partIs220 && equipIs110) {
    return `${formatOsTag(order.order_number)} (Equip./Diag. 110V × peça 220V)`;
  }
  if (partIs110 && equipIs220) {
    return `${formatOsTag(order.order_number)} (Equip. 220V × peça 110V/127V)`;
  }
  return null;
}

export function consolidateWorkshopMaterials(
  orders: WorkshopReportOrder[],
  productsById: Record<string, ProductStockMeta> = {}
): ConsolidatedMaterialRow[] {
  const map = new Map<
    string,
    {
      name: string;
      category: string;
      unit: string;
      totalQty: number;
      unitPrice: number;
      totalValue: number;
      osTags: string[];
      osSet: Set<string>;
      stockQuantity: number | null;
      alerts: string[];
      alertSet: Set<string>;
    }
  >();

  for (const order of orders) {
    const osTag = formatOsTag(order.order_number);
    for (const part of order.service_order_parts ?? []) {
      if (part.product_id === null || part.product_id === undefined) continue;

      const qty = Number(part.quantity) || 0;
      const unitPrice = Number(part.unit_price) || 0;
      if (qty <= 0) continue;

      const prodMeta = productsById[part.product_id] ?? null;
      const rawName = (part.part_name ?? prodMeta?.name ?? 'Material sem descrição').trim();
      const key = `${normalizeText(rawName)}::${unitPrice.toFixed(2)}`;

      let bucket = map.get(key);
      if (!bucket) {
        const { category, unit } = classifyMaterialCategoryAndUnit(rawName, prodMeta);
        const stockRaw = prodMeta?.stock_quantity;
        bucket = {
          name: rawName,
          category,
          unit,
          totalQty: 0,
          unitPrice,
          totalValue: 0,
          osTags: [],
          osSet: new Set<string>(),
          stockQuantity:
            stockRaw !== null && stockRaw !== undefined && Number.isFinite(Number(stockRaw))
              ? Number(stockRaw)
              : null,
          alerts: [],
          alertSet: new Set<string>(),
        };
        map.set(key, bucket);
      }

      bucket.totalQty += qty;
      bucket.totalValue += qty * unitPrice;
      if (!bucket.osSet.has(osTag)) {
        bucket.osSet.add(osTag);
        bucket.osTags.push(osTag);
      }

      const vAlert = detectVoltageMismatchAlert(order, rawName);
      if (vAlert && !bucket.alertSet.has(vAlert)) {
        bucket.alertSet.add(vAlert);
        bucket.alerts.push(vAlert);
      }
    }
  }

  return Array.from(map.values())
    .map(b => ({
      name: b.name,
      category: b.category,
      unit: b.unit,
      totalQty: Math.round(b.totalQty * 1000) / 1000,
      unitPrice: b.unitPrice,
      totalValue: Math.round(b.totalValue * 100) / 100,
      osTags: b.osTags,
      stockQuantity: b.stockQuantity,
      alerts: b.alerts,
    }))
    .sort((a, b) => {
      if (b.totalValue !== a.totalValue) return b.totalValue - a.totalValue;
      return a.name.localeCompare(b.name, 'pt-BR');
    });
}

export function consolidateWorkshopServices(
  orders: WorkshopReportOrder[]
): ConsolidatedServiceRow[] {
  const map = new Map<
    string,
    {
      name: string;
      totalQty: number;
      unitPrice: number;
      totalValue: number;
      osTags: string[];
      osSet: Set<string>;
    }
  >();

  const addServiceEntry = (name: string, qty: number, unitPrice: number, osTag: string) => {
    const cleanName = name.trim() || 'Mão de obra / Serviço';
    const key = `${normalizeText(cleanName)}::${unitPrice.toFixed(2)}`;
    let bucket = map.get(key);
    if (!bucket) {
      bucket = {
        name: cleanName,
        totalQty: 0,
        unitPrice,
        totalValue: 0,
        osTags: [],
        osSet: new Set<string>(),
      };
      map.set(key, bucket);
    }
    bucket.totalQty += qty;
    bucket.totalValue += qty * unitPrice;
    if (!bucket.osSet.has(osTag)) {
      bucket.osSet.add(osTag);
      bucket.osTags.push(osTag);
    }
  };

  for (const order of orders) {
    const osTag = formatOsTag(order.order_number);
    let listedServicesSum = 0;

    for (const part of order.service_order_parts ?? []) {
      if (part.product_id !== null && part.product_id !== undefined) continue;
      const qty = Number(part.quantity) || 0;
      const unitPrice = Number(part.unit_price) || 0;
      if (qty <= 0) continue;
      listedServicesSum += qty * unitPrice;
      addServiceEntry(part.part_name ?? 'Serviço / Mão de obra', qty, unitPrice, osTag);
    }

    // Reconcile against official OS financial rule: servicesTotal = max(labor_cost, listedServicesSum)
    const { laborCost } = calculateWorkshopOrderFinancials(order);
    const laborDiff = Math.round((laborCost - listedServicesSum) * 100) / 100;
    if (laborDiff > 0.009) {
      addServiceEntry('Mão de obra avulsa (campo OS)', 1, laborDiff, osTag);
    }
  }

  return Array.from(map.values())
    .map(b => ({
      name: b.name,
      totalQty: Math.round(b.totalQty * 1000) / 1000,
      unitPrice: b.unitPrice,
      totalValue: Math.round(b.totalValue * 100) / 100,
      osTags: b.osTags,
    }))
    .sort((a, b) => {
      if (b.totalValue !== a.totalValue) return b.totalValue - a.totalValue;
      return a.name.localeCompare(b.name, 'pt-BR');
    });
}

export function computeWorkshopReportSummary(
  orders: WorkshopReportOrder[],
  productsById: Record<string, ProductStockMeta> = {}
): WorkshopReportSummary {
  const materials = consolidateWorkshopMaterials(orders, productsById);
  const services = consolidateWorkshopServices(orders);

  let partsTotal = 0;
  let servicesTotal = 0;
  let grandTotal = 0;
  for (const o of orders) {
    const fin = calculateWorkshopOrderFinancials(o);
    partsTotal += fin.partsTotal;
    servicesTotal += fin.laborCost;
    grandTotal += fin.grandTotal;
  }

  const voltageAlertsCount = materials.reduce((acc, m) => acc + m.alerts.length, 0);

  return {
    ordersCount: orders.length,
    materialsDistinctCount: materials.length,
    servicesDistinctCount: services.length,
    voltageAlertsCount,
    partsTotal: Math.round(partsTotal * 100) / 100,
    servicesTotal: Math.round(servicesTotal * 100) / 100,
    grandTotal: Math.round(grandTotal * 100) / 100,
  };
}

function setFormulaCell(
  ws: XLSX.WorkSheet,
  addr: string,
  formula: string,
  numFmt: string,
  cachedValue?: number
) {
  ws[addr] = {
    t: 'n',
    f: formula,
    z: numFmt,
    ...(cachedValue !== undefined ? { v: cachedValue } : {}),
  };
}

function setNumFormat(ws: XLSX.WorkSheet, addr: string, numFmt: string) {
  if (ws[addr] && ws[addr].t === 'n') {
    ws[addr].z = numFmt;
  }
}

/**
 * Builds the 3-sheet Excel workbook (.xlsx) for Oficina -> Relatório de OS:
 *  Sheet 1: "Relatório de OS" (13 columns including Técnico Responsável + dynamic totals row)
 *  Sheet 2: "Consolidado de Materiais" (stock parts grouped with category, unit, qty, unit price, total, %, OSs, stock, deficit & voltage alerts)
 *  Sheet 3: "Consolidado de Serviços" (labor/services grouped and reconciled 100% with Sheet 1)
 */
export function buildWorkshopReportWorkbook(
  orders: WorkshopReportOrder[],
  productsById: Record<string, ProductStockMeta> = {}
): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();

  // =========================================================================
  // SHEET 1: Relatório de OS (13 columns including Técnico Responsável + totals)
  // =========================================================================
  const osHeaders = [
    'OS',
    'Cliente',
    'Técnico Responsável',
    'Tipo Visita',
    'Tipo Equipamento',
    'Modelo',
    'Nº Série',
    'Status',
    'Diagnóstico',
    'Total Peças',
    'Total Serviços',
    'Valor Total OS',
    'Data de Criação',
  ];

  const osAoa: (string | number)[][] = [osHeaders];
  let sumPartsSheet1 = 0;
  let sumServicesSheet1 = 0;
  let sumGrandSheet1 = 0;

  for (const o of orders) {
    const fin = calculateWorkshopOrderFinancials(o);
    const cleanDiag = (o.diagnosis || '').replace(/[\r\n\t]+/g, ' ').trim();
    const technicianName = getWorkshopOrderTechnicianName(o) || 'Não atribuído';
    sumPartsSheet1 += fin.partsTotal;
    sumServicesSheet1 += fin.laborCost;
    sumGrandSheet1 += fin.grandTotal;

    osAoa.push([
      formatOsTag(o.order_number),
      o.customers?.name || '',
      technicianName,
      o.visit_type || '',
      o.equip_type || '',
      o.equip_model || '',
      o.equip_serial || '',
      o.status || '',
      cleanDiag,
      // Keep 6-decimal numeric precision (formatted to 2 decimals via BRL_NUM_FMT)
      // so Sheet 1 =SUM(J2:J{n}) matches Sheet 2 consolidated fractional totals to the exact cent.
      Math.round(fin.partsTotal * 1e6) / 1e6,
      Math.round(fin.laborCost * 1e6) / 1e6,
      Math.round(fin.grandTotal * 1e6) / 1e6,
      formatOrderDateBr(o.created_at),
    ]);
  }

  const osLastDataRow = orders.length + 1;
  const osTotalRow = osLastDataRow + 1;
  osAoa.push([
    'TOTAL',
    `${orders.length} OS(s)`,
    '',
    '',
    '',
    '',
    '',
    '',
    'TOTAL GERAL DAS OSs EXPORTADAS',
    Math.round(sumPartsSheet1 * 1e6) / 1e6,
    Math.round(sumServicesSheet1 * 1e6) / 1e6,
    Math.round(sumGrandSheet1 * 1e6) / 1e6,
    '',
  ]);

  const wsOs = XLSX.utils.aoa_to_sheet(osAoa);
  for (let r = 2; r <= osLastDataRow; r++) {
    setNumFormat(wsOs, `J${r}`, BRL_NUM_FMT);
    setNumFormat(wsOs, `K${r}`, BRL_NUM_FMT);
    const rowVal = (osAoa[r - 1][11] as number) ?? 0;
    setFormulaCell(wsOs, `L${r}`, `J${r}+K${r}`, BRL_NUM_FMT, rowVal);
  }
  if (orders.length > 0) {
    setFormulaCell(wsOs, `J${osTotalRow}`, `SUM(J2:J${osLastDataRow})`, BRL_NUM_FMT, Math.round(sumPartsSheet1 * 1e6) / 1e6);
    setFormulaCell(wsOs, `K${osTotalRow}`, `SUM(K2:K${osLastDataRow})`, BRL_NUM_FMT, Math.round(sumServicesSheet1 * 1e6) / 1e6);
    setFormulaCell(wsOs, `L${osTotalRow}`, `SUM(L2:L${osLastDataRow})`, BRL_NUM_FMT, Math.round(sumGrandSheet1 * 1e6) / 1e6);
    wsOs['!autofilter'] = { ref: `A1:M${osLastDataRow}` };
  }
  wsOs['!cols'] = [
    { wch: 10 }, // OS
    { wch: 28 }, // Cliente
    { wch: 24 }, // Técnico Responsável
    { wch: 14 }, // Tipo Visita
    { wch: 18 }, // Tipo Equipamento
    { wch: 18 }, // Modelo
    { wch: 24 }, // Nº Série
    { wch: 22 }, // Status
    { wch: 44 }, // Diagnóstico
    { wch: 15 }, // Total Peças
    { wch: 15 }, // Total Serviços
    { wch: 16 }, // Valor Total OS
    { wch: 15 }, // Data de Criação
  ];
  XLSX.utils.book_append_sheet(wb, wsOs, 'Relatório de OS');

  // =========================================================================
  // SHEET 2: Consolidado de Materiais (Stock Components)
  // =========================================================================
  const materials = consolidateWorkshopMaterials(orders, productsById);
  const matHeaders = [
    '#',
    'Componente / Material',
    'Categoria',
    'Unid.',
    'Qtd. Total',
    'Unitário (R$)',
    'Total (R$)',
    '% Materiais',
    'Qtd. OSs',
    'OSs',
    'Estoque Atual',
    'Falta Comprar',
    'Alerta Técnico',
  ];

  const matAoa: (string | number)[][] = [matHeaders];
  const matGrandTotal = materials.reduce((acc, m) => acc + m.totalValue, 0);
  const matTotalQty = materials.reduce((acc, m) => acc + m.totalQty, 0);

  if (materials.length === 0) {
    matAoa.push([
      '',
      'Nenhum material / componente de estoque lançado nas OSs selecionadas',
      '',
      '',
      0,
      0,
      0,
      0,
      0,
      '',
      '',
      0,
      'OK',
    ]);
  } else {
    materials.forEach((m, idx) => {
      const deficit =
        m.stockQuantity !== null ? Math.max(0, Math.round((m.totalQty - m.stockQuantity) * 1000) / 1000) : m.totalQty;
      matAoa.push([
        idx + 1,
        m.name,
        m.category,
        m.unit,
        m.totalQty,
        m.unitPrice,
        m.totalValue,
        matGrandTotal > 0 ? m.totalValue / matGrandTotal : 0,
        m.osTags.length,
        m.osTags.join(', '),
        m.stockQuantity !== null ? m.stockQuantity : '—',
        deficit,
        m.alerts.length > 0 ? `CONFERIR TENSÃO: ${m.alerts.join(' | ')}` : 'OK',
      ]);
    });

    matAoa.push([
      '',
      'TOTAL GERAL DE MATERIAIS / COMPONENTES',
      '',
      '',
      Math.round(matTotalQty * 1000) / 1000,
      '',
      Math.round(matGrandTotal * 100) / 100,
      1,
      materials.reduce((acc, m) => acc + m.osTags.length, 0),
      `${orders.filter(o => (o.service_order_parts ?? []).some(p => p.product_id !== null)).length} OS(s) com peças`,
      '',
      materials.reduce(
        (acc, m) =>
          acc + (m.stockQuantity !== null ? Math.max(0, m.totalQty - m.stockQuantity) : m.totalQty),
        0
      ),
      `${materials.reduce((acc, m) => acc + m.alerts.length, 0)} alerta(s) de tensão`,
    ]);
  }

  const wsMat = XLSX.utils.aoa_to_sheet(matAoa);
  if (materials.length > 0) {
    const matLastDataRow = materials.length + 1;
    const matTotalRow = matLastDataRow + 1;

    for (let r = 2; r <= matLastDataRow; r++) {
      const m = materials[r - 2];
      setNumFormat(wsMat, `E${r}`, QTY_NUM_FMT);
      setNumFormat(wsMat, `F${r}`, BRL_NUM_FMT);
      setFormulaCell(wsMat, `G${r}`, `E${r}*F${r}`, BRL_NUM_FMT, m.totalValue);
      setFormulaCell(
        wsMat,
        `H${r}`,
        `IF($G$${matTotalRow}=0,0,G${r}/$G$${matTotalRow})`,
        PCT_NUM_FMT,
        matGrandTotal > 0 ? m.totalValue / matGrandTotal : 0
      );
      setNumFormat(wsMat, `I${r}`, INT_NUM_FMT);
      if (m.stockQuantity !== null) {
        setNumFormat(wsMat, `K${r}`, QTY_NUM_FMT);
      }
      const deficit =
        m.stockQuantity !== null ? Math.max(0, Math.round((m.totalQty - m.stockQuantity) * 1000) / 1000) : m.totalQty;
      setFormulaCell(
        wsMat,
        `L${r}`,
        `IF(ISNUMBER(K${r}),MAX(0,E${r}-K${r}),E${r})`,
        QTY_NUM_FMT,
        deficit
      );
    }

    setFormulaCell(wsMat, `E${matTotalRow}`, `SUM(E2:E${matLastDataRow})`, QTY_NUM_FMT, Math.round(matTotalQty * 1000) / 1000);
    setFormulaCell(wsMat, `G${matTotalRow}`, `SUM(G2:G${matLastDataRow})`, BRL_NUM_FMT, Math.round(matGrandTotal * 100) / 100);
    setFormulaCell(wsMat, `H${matTotalRow}`, `SUM(H2:H${matLastDataRow})`, PCT_NUM_FMT, 1);
    setFormulaCell(wsMat, `I${matTotalRow}`, `SUM(I2:I${matLastDataRow})`, INT_NUM_FMT, materials.reduce((acc, m) => acc + m.osTags.length, 0));
    const totalDeficit = Math.round(
      materials.reduce(
        (acc, m) =>
          acc + (m.stockQuantity !== null ? Math.max(0, m.totalQty - m.stockQuantity) : m.totalQty),
        0
      ) * 1000
    ) / 1000;
    setFormulaCell(wsMat, `L${matTotalRow}`, `SUM(L2:L${matLastDataRow})`, QTY_NUM_FMT, totalDeficit);
    wsMat['!autofilter'] = { ref: `A1:M${matLastDataRow}` };
  }

  wsMat['!cols'] = [
    { wch: 6 },  // #
    { wch: 54 }, // Componente / Material
    { wch: 24 }, // Categoria
    { wch: 8 },  // Unid.
    { wch: 12 }, // Qtd. Total
    { wch: 15 }, // Unitário
    { wch: 16 }, // Total
    { wch: 12 }, // % Materiais
    { wch: 10 }, // Qtd. OSs
    { wch: 36 }, // OSs
    { wch: 14 }, // Estoque Atual
    { wch: 14 }, // Falta Comprar
    { wch: 42 }, // Alerta Técnico
  ];
  XLSX.utils.book_append_sheet(wb, wsMat, 'Consolidado de Materiais');

  // =========================================================================
  // SHEET 3: Consolidado de Serviços (Labor & Services — Reconciled 100%)
  // =========================================================================
  const services = consolidateWorkshopServices(orders);
  const srvHeaders = [
    '#',
    'Serviço / Mão de Obra',
    'Qtd. Total',
    'Unitário (R$)',
    'Total (R$)',
    '% Serviços',
    'Qtd. OSs',
    'OSs Atendidas',
  ];

  const srvAoa: (string | number)[][] = [srvHeaders];
  const srvGrandTotal = services.reduce((acc, s) => acc + s.totalValue, 0);
  const srvTotalQty = services.reduce((acc, s) => acc + s.totalQty, 0);

  if (services.length === 0) {
    srvAoa.push([
      '',
      'Nenhum serviço ou mão de obra lançado nas OSs selecionadas',
      0,
      0,
      0,
      0,
      0,
      '',
    ]);
  } else {
    services.forEach((s, idx) => {
      srvAoa.push([
        idx + 1,
        s.name,
        s.totalQty,
        s.unitPrice,
        s.totalValue,
        srvGrandTotal > 0 ? s.totalValue / srvGrandTotal : 0,
        s.osTags.length,
        s.osTags.join(', '),
      ]);
    });

    srvAoa.push([
      '',
      'TOTAL GERAL DE SERVIÇOS / MÃO DE OBRA',
      Math.round(srvTotalQty * 1000) / 1000,
      '',
      Math.round(srvGrandTotal * 100) / 100,
      1,
      services.reduce((acc, s) => acc + s.osTags.length, 0),
      `${orders.filter(o => calculateWorkshopOrderFinancials(o).laborCost > 0).length} OS(s) com serviço`,
    ]);
  }

  const wsSrv = XLSX.utils.aoa_to_sheet(srvAoa);
  if (services.length > 0) {
    const srvLastDataRow = services.length + 1;
    const srvTotalRow = srvLastDataRow + 1;

    for (let r = 2; r <= srvLastDataRow; r++) {
      const s = services[r - 2];
      setNumFormat(wsSrv, `C${r}`, QTY_NUM_FMT);
      setNumFormat(wsSrv, `D${r}`, BRL_NUM_FMT);
      setFormulaCell(wsSrv, `E${r}`, `C${r}*D${r}`, BRL_NUM_FMT, s.totalValue);
      setFormulaCell(
        wsSrv,
        `F${r}`,
        `IF($E$${srvTotalRow}=0,0,E${r}/$E$${srvTotalRow})`,
        PCT_NUM_FMT,
        srvGrandTotal > 0 ? s.totalValue / srvGrandTotal : 0
      );
      setNumFormat(wsSrv, `G${r}`, INT_NUM_FMT);
    }

    setFormulaCell(wsSrv, `C${srvTotalRow}`, `SUM(C2:C${srvLastDataRow})`, QTY_NUM_FMT, Math.round(srvTotalQty * 1000) / 1000);
    setFormulaCell(wsSrv, `E${srvTotalRow}`, `SUM(E2:E${srvLastDataRow})`, BRL_NUM_FMT, Math.round(srvGrandTotal * 100) / 100);
    setFormulaCell(wsSrv, `F${srvTotalRow}`, `SUM(F2:F${srvLastDataRow})`, PCT_NUM_FMT, 1);
    setFormulaCell(wsSrv, `G${srvTotalRow}`, `SUM(G2:G${srvLastDataRow})`, INT_NUM_FMT, services.reduce((acc, s) => acc + s.osTags.length, 0));
    wsSrv['!autofilter'] = { ref: `A1:H${srvLastDataRow}` };
  }

  wsSrv['!cols'] = [
    { wch: 6 },  // #
    { wch: 36 }, // Serviço / Mão de Obra
    { wch: 12 }, // Qtd. Total
    { wch: 15 }, // Unitário
    { wch: 16 }, // Total
    { wch: 12 }, // % Serviços
    { wch: 10 }, // Qtd. OSs
    { wch: 46 }, // OSs Atendidas
  ];
  XLSX.utils.book_append_sheet(wb, wsSrv, 'Consolidado de Serviços');

  return wb;
}
