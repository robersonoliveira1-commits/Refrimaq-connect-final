import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import {
  ProductStockMeta,
  WorkshopReportOrder,
  buildWorkshopReportWorkbook,
  computeWorkshopReportSummary,
  consolidateWorkshopMaterials,
  consolidateWorkshopServices,
  detectVoltageMismatchAlert,
  getWorkshopOrderTechnicianName,
  matchesLocalDateRange,
  matchesWorkshopOrderSearch,
  parseMultiOsQuery,
} from '../src/lib/workshopReportExport';

let passed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  PASS: ${name}`);
  } catch (err) {
    console.error(`  FAIL: ${name}`);
    throw err;
  }
}

const sampleProducts: Record<string, ProductStockMeta> = {
  p_comp: { id: 'p_comp', name: 'COMPRESSOR TECUMSEH AL4480 220V', category: 'Compressores', unit: 'un', stock_quantity: 1 },
  p_gas: { id: 'p_gas', name: 'GAS REFRIGERANTE 134A', category: 'Gases', unit: 'kg', stock_quantity: 10 },
  p_bobina: { id: 'p_bobina', name: 'BOBINA SOLENOIDE DANFOSS 220V', category: '', unit: 'un', stock_quantity: 4 },
};

const sampleOrders: WorkshopReportOrder[] = [
  {
    id: 'o1',
    order_number: 170,
    status: 'Aguardando Aprovação',
    visit_type: 'Corretiva',
    labor_cost: 350,
    equip_type: 'Chopeira Elétrica',
    equip_brand: 'MEMO',
    equip_model: 'FRX CX070',
    equip_serial: '230622-00011638',
    equip_voltage: '220V',
    diagnosis: 'COMPRESSOR QUEIMADO',
    created_at: '2026-11-13T14:00:00Z',
    customers: { name: 'Cliente A' },
    user_profiles: { full_name: 'João Silva' },
    service_order_parts: [
      { product_id: 'p_comp', part_name: 'COMPRESSOR TECUMSEH AL4480 220V', quantity: 1, unit_price: 1300 },
      { product_id: 'p_gas', part_name: 'GAS REFRIGERANTE 134A', quantity: 4.5, unit_price: 78.46 },
      { product_id: null, part_name: 'Reoperação de sistema', quantity: 1, unit_price: 350 },
    ],
  },
  {
    id: 'o2',
    order_number: 65,
    status: 'Aguardando Aprovação',
    visit_type: 'Corretiva',
    labor_cost: 200,
    equip_type: 'Chopeira Elétrica',
    equip_brand: 'MEMO',
    equip_model: 'STAR',
    equip_serial: '23061500011247',
    equip_voltage: '110V',
    diagnosis: 'BOBINA SOLENOIDE DANFOSS 110V QUEIMADA',
    created_at: '2026-08-05T18:00:00Z',
    customers: { name: 'Cliente A' },
    user_profiles: { full_name: 'Carlos Pereira' },
    service_order_parts: [
      { product_id: 'p_bobina', part_name: 'BOBINA SOLENOIDE DANFOSS 220V', quantity: 1, unit_price: 270.25 },
      { product_id: null, part_name: 'Mão de obra', quantity: 1, unit_price: 200 },
    ],
  },
  {
    id: 'o3',
    order_number: 168,
    status: 'Aguardando Aprovação',
    visit_type: 'Corretiva',
    labor_cost: 350,
    equip_type: 'Chopeira Elétrica',
    equip_brand: 'MEMO',
    equip_model: 'FRC CX 070',
    equip_serial: '250820-00067497',
    equip_voltage: '220V',
    diagnosis: 'COMPRESSOR QUEIMADO',
    created_at: '2026-11-13T16:30:00Z',
    customers: { name: 'Cliente A' },
    user_profiles: [{ full_name: '  João Silva  ' }],
    service_order_parts: [
      { product_id: 'p_comp', part_name: 'COMPRESSOR TECUMSEH AL4480 220V', quantity: 1, unit_price: 1300 },
      { product_id: 'p_gas', part_name: 'GAS REFRIGERANTE 134A', quantity: 4.5, unit_price: 78.46 },
      { product_id: null, part_name: 'Reoperação de sistema', quantity: 1, unit_price: 350 },
    ],
  },
  {
    // OS with labor_cost entered directly and NO service_order_parts lines (tests reconciliation)
    id: 'o4',
    order_number: 178,
    status: 'Aguardando Aprovação',
    visit_type: 'Corretiva',
    labor_cost: 150,
    equip_type: 'Chopeira Elétrica',
    equip_brand: 'MEMO',
    equip_model: 'STAR',
    equip_serial: 'STR02200R2',
    equip_voltage: '220V',
    diagnosis: 'EQUIPAMENTO OK, TESTE OPERACIONAL',
    created_at: '2026-11-20T12:00:00Z',
    customers: { name: 'Cliente B' },
    user_profiles: null,
    service_order_parts: [],
  },
];

console.log('Running workshopReportExport unit tests...');

test('parseMultiOsQuery handles pasted OS lists with # and separators while preserving text search', () => {
  const multi = parseMultiOsQuery('#0178 #0170\t#0065, 168');
  assert.ok(multi);
  assert.deepEqual(Array.from(multi).sort((a, b) => a - b), [65, 168, 170, 178]);

  const singleHash = parseMultiOsQuery('#0065');
  assert.ok(singleHash);
  assert.equal(singleHash.has(65), true);

  assert.equal(parseMultiOsQuery('Cliente A'), null);
  assert.equal(matchesWorkshopOrderSearch(sampleOrders[1], '#0170 #0065'), true);
  assert.equal(matchesWorkshopOrderSearch(sampleOrders[3], '#0170 #0065'), false);
  assert.equal(matchesWorkshopOrderSearch(sampleOrders[0], 'compressor'), true);
  assert.equal(matchesWorkshopOrderSearch(sampleOrders[0], 'joao'), true);
  assert.equal(matchesWorkshopOrderSearch(sampleOrders[1], 'joao'), false);
  assert.equal(getWorkshopOrderTechnicianName(sampleOrders[0]), 'João Silva');
  assert.equal(getWorkshopOrderTechnicianName(sampleOrders[2]), 'João Silva');
  assert.equal(getWorkshopOrderTechnicianName(sampleOrders[3]), '');
});

test('local date range filter works cleanly without UTC day-shift errors', () => {
  assert.equal(matchesLocalDateRange('2026-11-13T14:00:00Z', '2026-11-13', '2026-11-13'), true);
  assert.equal(matchesLocalDateRange('2026-11-13T14:00:00Z', '2026-11-14', ''), false);
  assert.equal(matchesLocalDateRange('2026-08-05T18:00:00Z', '2026-08-01', '2026-08-31'), true);
});

test('materials & services consolidation reconciles 100% with official OS totals and flags voltage mismatch', () => {
  const mats = consolidateWorkshopMaterials(sampleOrders, sampleProducts);
  const srvs = consolidateWorkshopServices(sampleOrders);
  const summary = computeWorkshopReportSummary(sampleOrders, sampleProducts);

  assert.equal(mats.length, 3);
  assert.equal(mats[0].name, 'COMPRESSOR TECUMSEH AL4480 220V');
  assert.equal(mats[0].totalQty, 2);
  assert.equal(mats[0].totalValue, 2600);
  assert.equal(mats[0].stockQuantity, 1);

  const bobina = mats.find(m => m.name.includes('BOBINA'));
  assert.ok(bobina);
  assert.equal(bobina.alerts.length, 1);
  assert.ok(bobina.alerts[0].includes('#0065'));
  assert.ok(detectVoltageMismatchAlert(sampleOrders[1], 'BOBINA SOLENOIDE DANFOSS 220V'));
  assert.equal(detectVoltageMismatchAlert(sampleOrders[0], 'COMPRESSOR TECUMSEH AL4480 220V'), null);

  // Check exact cross-sheet reconciliation: Sheet 2 == Sheet 1 parts, Sheet 3 == Sheet 1 services
  const matsSum = Math.round(mats.reduce((acc, m) => acc + m.totalValue, 0) * 100) / 100;
  const srvsSum = Math.round(srvs.reduce((acc, s) => acc + s.totalValue, 0) * 100) / 100;
  assert.equal(matsSum, summary.partsTotal);
  assert.equal(srvsSum, summary.servicesTotal);
  assert.equal(Math.round((matsSum + srvsSum) * 100) / 100, summary.grandTotal);
  assert.ok(srvs.some(s => s.name === 'Mão de obra avulsa (campo OS)' && s.totalValue === 150));
});

test('generated XLSX workbook has exact 3 sheets, valid formulas, and round-trips cleanly', () => {
  const wb = buildWorkshopReportWorkbook(sampleOrders, sampleProducts);
  assert.deepEqual(wb.SheetNames, [
    'Relatório de OS',
    'Consolidado de Materiais',
    'Consolidado de Serviços',
  ]);

  // Serialize to binary buffer and parse back to ensure valid OOXML structure
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const parsed = XLSX.read(buf, { type: 'buffer' });
  assert.deepEqual(parsed.SheetNames, [
    'Relatório de OS',
    'Consolidado de Materiais',
    'Consolidado de Serviços',
  ]);

  const ws1 = parsed.Sheets['Relatório de OS'];
  assert.equal(ws1['A1'].v, 'OS');
  assert.equal(ws1['C1'].v, 'Técnico Responsável');
  assert.equal(ws1['C2'].v, 'João Silva');
  assert.equal(ws1['C3'].v, 'Carlos Pereira');
  assert.equal(ws1['C5'].v, 'Não atribuído');
  assert.equal(ws1['M1'].v, 'Data de Criação');
  assert.equal(ws1['J6'].f, 'SUM(J2:J5)');
  assert.equal(ws1['K6'].f, 'SUM(K2:K5)');
  assert.equal(ws1['L6'].f, 'SUM(L2:L5)');
  assert.equal(ws1['L2'].f, 'J2+K2');
  assert.equal(ws1['!autofilter']?.ref, 'A1:M5');

  const ws2 = parsed.Sheets['Consolidado de Materiais'];
  assert.equal(ws2['B1'].v, 'Componente / Material');
  assert.equal(ws2['K1'].v, 'Estoque Atual');
  assert.equal(ws2['L1'].v, 'Falta Comprar');
  assert.equal(ws2['G2'].f, 'E2*F2');
  assert.equal(ws2['L2'].f, 'IF(ISNUMBER(K2),MAX(0,E2-K2),E2)');
  assert.equal(ws2['G5'].f, 'SUM(G2:G4)');

  const ws3 = parsed.Sheets['Consolidado de Serviços'];
  assert.equal(ws3['B1'].v, 'Serviço / Mão de Obra');
  assert.equal(ws3['E2'].f, 'C2*D2');
  assert.equal(ws3['E5'].f, 'SUM(E2:E4)');
});

test('empty materials/services edge case produces valid 3-sheet workbook with zero broken formulas', () => {
  const zeroOrder: WorkshopReportOrder[] = [
    {
      ...sampleOrders[3],
      labor_cost: 0,
      service_order_parts: [],
    },
  ];
  const wb = buildWorkshopReportWorkbook(zeroOrder, sampleProducts);
  assert.equal(wb.SheetNames.length, 3);
  const wsMat = wb.Sheets['Consolidado de Materiais'];
  assert.ok(String(wsMat['B2'].v).includes('Nenhum material'));
  const wsSrv = wb.Sheets['Consolidado de Serviços'];
  assert.ok(String(wsSrv['B2'].v).includes('Nenhum serviço'));
});

console.log(`\nAll ${passed} workshopReportExport tests passed!`);
