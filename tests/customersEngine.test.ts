import assert from 'node:assert/strict';
import {
  getCustomerContactStatus,
  getCustomerStatusLabel,
  getCustomerStatusRangeLabel,
  formatDaysSince,
  formatLocalDate,
  toLocalDateTimeInput,
  localDateTimeInputToIso,
  extractCustomerSegment,
  stripSegmentTagFromNotes,
  composeNotesWithSegment,
  buildCustomerWritePayload,
  isMissingColumnSchemaError,
  findPotentialCustomerDuplicates,
  buildWhatsAppHref,
  buildGoogleMapsHref,
  computeCustomerMetrics,
  filterAndSortCustomers,
  coerceCellToString,
  parseSpreadsheetCsv,
  buildCustomersCsv,
  isSameCustomerImportMatch,
  mergeImportNotes,
  summarizeCustomerDependencies,
  computeLatestContactAt,
  matchesEquipmentOrder,
  CustomerLike,
} from '../src/lib/customersEngine';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-11-19T15:00:00.000Z').getTime();

function isoDaysAgo(days: number): string {
  return new Date(NOW - days * DAY_MS).toISOString();
}

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  PASS: ${name}`);
}

console.log('Running customersEngine unit tests...');

// 1. Recency thresholds: 0-90 green, 91-180 yellow, >180 red, null gray
test('contact recency thresholds (0-90d / 91-180d / +180d / Novo)', () => {
  assert.equal(getCustomerContactStatus(null, NOW), 'gray');
  assert.equal(getCustomerContactStatus(undefined, NOW), 'gray');
  assert.equal(getCustomerContactStatus('invalid-date', NOW), 'gray');
  assert.equal(getCustomerContactStatus(isoDaysAgo(-2), NOW), 'green'); // future timestamp clamped
  assert.equal(getCustomerContactStatus(isoDaysAgo(0), NOW), 'green');
  assert.equal(getCustomerContactStatus(isoDaysAgo(30), NOW), 'green');
  assert.equal(getCustomerContactStatus(isoDaysAgo(89), NOW), 'green');
  assert.equal(getCustomerContactStatus(isoDaysAgo(90), NOW), 'green');
  assert.equal(getCustomerContactStatus(isoDaysAgo(91), NOW), 'yellow');
  assert.equal(getCustomerContactStatus(isoDaysAgo(180), NOW), 'yellow');
  assert.equal(getCustomerContactStatus(isoDaysAgo(181), NOW), 'red');

  assert.equal(getCustomerStatusLabel('green'), 'Em dia');
  assert.equal(getCustomerStatusRangeLabel('green'), 'Em dia (até 90 dias)');
  assert.equal(getCustomerStatusRangeLabel('yellow'), 'Atenção (91–180 dias)');
  assert.equal(getCustomerStatusRangeLabel('red', true), 'Urgente (+180d)');
});

// 2. daysSince never returns negative
test('formatDaysSince clamps future timestamps to Hoje', () => {
  assert.equal(formatDaysSince(null, NOW), 'Nunca');
  assert.equal(formatDaysSince(isoDaysAgo(-3), NOW), 'Hoje');
  assert.equal(formatDaysSince(isoDaysAgo(0), NOW), 'Hoje');
  assert.equal(formatDaysSince(isoDaysAgo(1), NOW), 'Ontem');
  assert.equal(formatDaysSince(isoDaysAgo(45), NOW), '45 dias atrás');
});

// 3. Local date formatting & datetime-local conversion without UTC shift
test('formatLocalDate avoids -1 day UTC shift on YYYY-MM-DD', () => {
  assert.equal(formatLocalDate('2026-11-19'), '19/11/2026');
  assert.equal(formatLocalDate('2025-01-01'), '01/01/2025');
  assert.equal(formatLocalDate(null), '—');
});

test('localDateTimeInputToIso round-trips cleanly with toLocalDateTimeInput', () => {
  const sample = new Date(2026, 10, 19, 21, 45, 0, 0);
  const inputVal = toLocalDateTimeInput(sample);
  assert.equal(inputVal, '2026-11-19T21:45');
  const iso = localDateTimeInputToIso(inputVal);
  assert.ok(iso);
  const restored = new Date(iso);
  assert.equal(restored.getFullYear(), 2026);
  assert.equal(restored.getMonth(), 10);
  assert.equal(restored.getDate(), 19);
  assert.equal(restored.getHours(), 21);
  assert.equal(restored.getMinutes(), 45);
});

// 4. Segment extraction & schema-safe payload
test('segment extraction and schema-safe payload fallback', () => {
  assert.equal(extractCustomerSegment({ segment: 'Bar', notes: '[Segmento: Outro]\nObs' }), 'Bar');
  assert.equal(extractCustomerSegment({ notes: '[Segmento: Restaurante]\nBom pagador' }), 'Restaurante');
  assert.equal(stripSegmentTagFromNotes('[Segmento: Restaurante]\nBom pagador'), 'Bom pagador');
  assert.equal(composeNotesWithSegment('[Segmento: Antigo]\nObs', 'Bar'), '[Segmento: Bar]\nObs');

  const input = {
    name: ' Chopp Sul ',
    phone: '41999990000',
    whatsapp: '',
    email: '',
    address: 'Rua A, 10',
    city: 'Curitiba',
    state: 'pr',
    zip_code: '80000-000',
    document: '12.345.678/0001-90',
    segment: 'Choperia',
    notes: '[Segmento: Velho]\nCliente VIP',
    equipment_types: ['Torre Naja'],
    latitude: -25.43,
    longitude: -49.27,
  };

  const withCols = buildCustomerWritePayload(input, {
    includeSegmentColumn: true,
    includeEquipmentTypesColumn: true,
  });
  assert.equal(withCols.segment, 'Choperia');
  assert.equal(withCols.notes, 'Cliente VIP');
  assert.equal(withCols.state, 'PR');
  assert.deepEqual(withCols.equipment_types, ['Torre Naja']);

  const withoutCols = buildCustomerWritePayload(input, {
    includeSegmentColumn: false,
    includeEquipmentTypesColumn: false,
  });
  assert.equal('segment' in withoutCols, false);
  assert.equal('equipment_types' in withoutCols, false);
  assert.equal(withoutCols.notes, '[Segmento: Choperia]\nCliente VIP');

  assert.equal(
    isMissingColumnSchemaError(
      { message: "Could not find the 'segment' column of 'customers' in the schema cache" },
      'segment'
    ),
    true
  );
  assert.equal(
    isMissingColumnSchemaError({ message: 'permission denied' }, 'segment'),
    false
  );
});

// 5. Duplicate detection, WhatsApp fallback & Maps URL
test('duplicate detection matches formatted vs unformatted CPF/CNPJ, phone, and accents', () => {
  const existing: CustomerLike[] = [
    {
      id: 'c1',
      name: 'Bar do João',
      document: '12.345.678/0001-90',
      phone: '(41) 99888-7766',
      whatsapp: '',
    },
    {
      id: 'c2',
      name: 'Padaria Central',
      document: '111.222.333-44',
      phone: '',
      whatsapp: '(41) 98765-4321',
    },
  ];

  const byDoc = findPotentialCustomerDuplicates(existing, { document: '12345678000190' });
  assert.equal(byDoc.length, 1);
  assert.equal(byDoc[0].customer.id, 'c1');
  assert.ok(byDoc[0].reasons.includes('Mesmo CPF/CNPJ'));

  const byNameAndPhone = findPotentialCustomerDuplicates(existing, {
    name: 'bar do joao',
    whatsapp: '41998887766',
  });
  assert.equal(byNameAndPhone.length, 1);
  assert.equal(byNameAndPhone[0].reasons.length, 2);

  // Exclude self during edit
  const excluded = findPotentialCustomerDuplicates(existing, { document: '12345678000190' }, 'c1');
  assert.equal(excluded.length, 0);

  // Quick links
  assert.equal(buildWhatsAppHref({ phone: '(41) 99888-7766', whatsapp: '' }), 'https://wa.me/5541998887766');
  assert.equal(buildWhatsAppHref({ whatsapp: '+55 (41) 99888-7766' }), 'https://wa.me/5541998887766');
  assert.equal(
    buildGoogleMapsHref({ latitude: -25.43, longitude: -49.27 }),
    'https://www.google.com/maps/search/?api=1&query=-25.43,-49.27'
  );
  assert.ok(
    buildGoogleMapsHref({ address: 'Rua XV, 100', city: 'Curitiba', state: 'PR' })?.includes('Curitiba')
  );
});

// 6. Filtering, sorting & metrics
test('filterAndSortCustomers searches document, segment, notes, whatsapp, GPS, and sorts', () => {
  const list: CustomerLike[] = [
    {
      id: '1',
      name: 'Zeta Bar',
      document: '98.765.432/0001-11',
      notes: '[Segmento: Pub]\nPrefere visita de manhã',
      city: 'Curitiba',
      last_contact_at: isoDaysAgo(200),
      latitude: -25.4,
      longitude: -49.2,
      created_at: '2026-01-01T10:00:00Z',
    },
    {
      id: '2',
      name: 'Alfa Chopperia',
      whatsapp: '(41) 99111-2233',
      segment: 'Restaurante',
      city: 'Pinhais',
      last_contact_at: isoDaysAgo(50),
      latitude: null,
      longitude: null,
      created_at: '2026-10-01T10:00:00Z',
    },
    {
      id: '3',
      name: 'Beta Eventos',
      city: 'Curitiba',
      last_contact_at: null,
      latitude: -25.5,
      longitude: -49.3,
      created_at: '2026-11-01T10:00:00Z',
    },
  ];

  const metrics = computeCustomerMetrics(list, NOW);
  assert.deepEqual(metrics, { total: 3, green: 1, yellow: 0, red: 1, gray: 1 });

  assert.equal(filterAndSortCustomers(list, { search: '98765432000111' }, NOW).length, 1);
  assert.equal(filterAndSortCustomers(list, { search: 'pub' }, NOW)[0].id, '1');
  assert.equal(filterAndSortCustomers(list, { search: '991112233' }, NOW)[0].id, '2');
  assert.equal(filterAndSortCustomers(list, { gps: 'without_gps' }, NOW)[0].id, '2');
  assert.equal(filterAndSortCustomers(list, { gps: 'with_gps' }, NOW).length, 2);

  const byOldest = filterAndSortCustomers(list, { sortBy: 'oldest_contact' }, NOW);
  assert.deepEqual(byOldest.map(c => c.id), ['3', '1', '2']);

  const byNewest = filterAndSortCustomers(list, { sortBy: 'newest_created' }, NOW);
  assert.deepEqual(byNewest.map(c => c.id), ['3', '2', '1']);
});

// 7. Excel coercion, CSV parsing (BOM + multiline + ;), PT-BR CSV export, idempotent merge
test('CSV parser handles BOM, semicolon, multiline quotes; coerceCellToString handles Excel numbers', () => {
  assert.equal(coerceCellToString(80010000), '80010000');
  assert.equal(coerceCellToString(null), '');
  assert.equal(coerceCellToString('  41999990000  '), '41999990000');

  const csv = '\uFEFFNome;Telefone;Observações\r\n"Bar ""Sul""";41999990000;"Linha 1\nLinha 2"\r\nMaria;41988887777;Simples';
  const parsed = parseSpreadsheetCsv(csv);
  assert.equal(parsed.length, 3);
  assert.deepEqual(parsed[0], ['Nome', 'Telefone', 'Observações']);
  assert.deepEqual(parsed[1], ['Bar "Sul"', '41999990000', 'Linha 1\nLinha 2']);
  assert.deepEqual(parsed[2], ['Maria', '41988887777', 'Simples']);

  const exported = buildCustomersCsv([
    {
      id: '1',
      name: 'Bar; Teste',
      notes: '[Segmento: Bar]\nNota normal',
      equipment_types: ['Torre Naja', 'Chopeira Balcão'],
      latitude: -25.43,
      longitude: -49.27,
      last_contact_at: '2026-11-19T12:00:00Z',
      created_at: '2026-05-10T12:00:00Z',
    },
  ]);
  assert.ok(exported.startsWith('\uFEFFNome;Telefone;WhatsApp;E-mail;Segmento;'));
  assert.ok(exported.includes('"Bar; Teste"'));
  assert.ok(exported.includes(';Bar;'));
  assert.ok(exported.includes('Torre Naja, Chopeira Balcão'));
});

test('import matching is null-safe and mergeImportNotes is idempotent', () => {
  assert.equal(
    isSameCustomerImportMatch(
      { name: 'Empresa X', document: '11.222.333/0001-44', email: null },
      { name: 'Outro', document: '11222333000144', email: 'a@b.com' }
    ),
    true
  );
  assert.equal(
    isSameCustomerImportMatch(
      { name: 'Empresa X', document: null, email: null },
      { name: 'empresa x', document: '', email: '' }
    ),
    true
  );

  const first = mergeImportNotes('', 'Entregar tarde', 'Bar', false);
  assert.equal(first, '[Segmento: Bar]\nEntregar tarde');
  const second = mergeImportNotes(first, 'Entregar tarde', 'Bar', false);
  assert.equal(second, '[Segmento: Bar]\nEntregar tarde'); // no duplication!
  const updatedSeg = mergeImportNotes(first, '', 'Restaurante', false);
  assert.equal(updatedSeg, '[Segmento: Restaurante]\nEntregar tarde');
});

// 8. Deletion dependency guard
test('summarizeCustomerDependencies separates blocked vs deletable customers accurately', () => {
  const analysis = summarizeCustomerDependencies(
    ['c1', 'c2', 'c3'],
    { c1: 'Cliente Com OS', c2: 'Cliente Livre', c3: 'Cliente Rota' },
    {
      c1: { serviceOrders: 2, boletos: 1, sales: 1 },
      c3: { routeStops: 3, equipments: 1 },
    }
  );
  assert.deepEqual(analysis.deletableIds, ['c2']);
  assert.equal(analysis.blocked.length, 2);
  assert.equal(analysis.blocked[0].customerId, 'c1');
  assert.deepEqual(analysis.blocked[0].reasons, ['2 OS(s)', '1 venda(s)', '1 boleto(s)']);
  assert.equal(analysis.blocked[1].customerId, 'c3');
  assert.deepEqual(analysis.blocked[1].reasons, ['3 parada(s) em rota', '1 equipamento(s)']);
});

// 9. Latest contact recalculation & equipment order matching
test('computeLatestContactAt and matchesEquipmentOrder handle edge cases', () => {
  assert.equal(computeLatestContactAt([]), null);
  assert.equal(
    computeLatestContactAt([
      { contacted_at: '2026-01-10T10:00:00Z' },
      { contacted_at: '2026-11-15T14:30:00Z' },
      { contacted_at: '2026-06-01T08:00:00Z' },
    ]),
    '2026-11-15T14:30:00Z'
  );

  // Empty serial must NOT match another equipment with empty serial!
  assert.equal(
    matchesEquipmentOrder({ equipment_id: null, equip_serial: '' }, { id: 'e1', equip_serial: '' }),
    false
  );
  assert.equal(
    matchesEquipmentOrder({ equipment_id: null, equip_serial: '   ' }, { id: 'e1', equip_serial: '   ' }),
    false
  );
  assert.equal(
    matchesEquipmentOrder({ equipment_id: 'e1', equip_serial: '' }, { id: 'e1', equip_serial: '' }),
    true
  );
  assert.equal(
    matchesEquipmentOrder({ equipment_id: null, equip_serial: 'SN-123' }, { id: 'e1', equip_serial: 'sn-123 ' }),
    true
  );
});

console.log(`\nAll ${passed} customersEngine tests passed!`);
