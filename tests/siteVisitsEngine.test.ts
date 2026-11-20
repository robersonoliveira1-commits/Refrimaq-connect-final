import assert from 'node:assert/strict';
import {
  SiteVisitRequestRow,
  buildClientWhatsAppReplyUrl,
  buildOsDiagnosisFromVisit,
  buildSiteVisitsCsv,
  computeSiteVisitsStats,
  extractEquipmentFromVisit,
  filterSiteVisits,
  findMatchingCustomerByPhone,
  formatVisitDateBr,
  isMissingServiceRequestsTableError,
  mapActivityToOsVisitType,
  mapUrgencyToOsPriority,
} from '../src/lib/siteVisitsEngine';

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

const sampleVisits: SiteVisitRequestRow[] = [
  {
    id: 'v1',
    protocol_code: 'VIS-20261119-1001',
    activity_type: 'corretivo',
    status: 'novo',
    urgency: 'alta',
    customer_name: 'Carlos Pereira',
    company_name: 'Bar do Centro',
    phone: '(51) 98888-7777',
    phone_digits: '51988887777',
    city: 'Canoas - RS',
    address: 'Centro',
    preferred_date: '2026-11-20',
    preferred_period: 'manha',
    questionnaire: {
      equipment: 'Chopeira elétrica',
      symptoms: ['Não gela / temperatura alta'],
      brandModel: 'Memo 70L/h',
      voltage: '220V',
    },
    summary_text: 'Protocolo: VIS-20261119-1001\nAtividade: Chamado corretivo',
    internal_notes: '',
    converted_customer_id: null,
    converted_order_id: null,
    created_at: '2026-11-19T18:00:00Z',
    updated_at: '2026-11-19T18:00:00Z',
  },
  {
    id: 'v2',
    protocol_code: 'VIS-20261119-1002',
    activity_type: 'sanitizacao',
    status: 'agendado',
    urgency: 'baixa',
    customer_name: 'Marina Costa',
    company_name: 'Cervejaria Sul',
    phone: '(51) 99123-4567',
    phone_digits: '51991234567',
    city: 'Porto Alegre - RS',
    address: '',
    preferred_date: null,
    preferred_period: 'qualquer',
    questionnaire: {
      placeType: 'Cervejaria',
      equipmentCount: '4',
      tapsRange: '5 a 8 vias',
    },
    summary_text: 'Protocolo: VIS-20261119-1002',
    internal_notes: 'Confirmado para sexta',
    converted_customer_id: null,
    converted_order_id: null,
    created_at: '2026-11-19T19:00:00Z',
    updated_at: '2026-11-19T19:00:00Z',
  },
];

console.log('Running siteVisitsEngine unit tests...');

test('activity and urgency map strictly to Workshop OS enums', () => {
  assert.equal(mapActivityToOsVisitType('corretivo'), 'Corretiva');
  assert.equal(mapActivityToOsVisitType('sanitizacao'), 'Assepsia');
  assert.equal(mapActivityToOsVisitType('projeto_instalacao'), 'Instalação');
  assert.equal(mapUrgencyToOsPriority('alta'), 'Alta');
  assert.equal(mapUrgencyToOsPriority('media'), 'Média');
  assert.equal(mapUrgencyToOsPriority('baixa'), 'Baixa');
});

test('phone deduplication finds existing customer across phone and whatsapp formats', () => {
  const customers = [
    { id: 'c1', name: 'Outro Cliente', phone: '(51) 3333-4444', whatsapp: '' },
    { id: 'c2', name: 'Bar do Centro', phone: '', whatsapp: '+55 (51) 98888-7777' },
  ];
  const found = findMatchingCustomerByPhone(customers, '51988887777');
  assert.equal(found?.id, 'c2');
  assert.equal(findMatchingCustomerByPhone(customers, '51900000000'), null);
});

test('equipment extraction, OS diagnosis, and local date formatting preserve details', () => {
  const eq = extractEquipmentFromVisit(sampleVisits[0]);
  assert.equal(eq.equip_type, 'Chopeira elétrica');
  assert.equal(eq.equip_brand, 'Memo 70L/h');
  assert.equal(eq.equip_voltage, '220V');

  const eqSan = extractEquipmentFromVisit(sampleVisits[1]);
  assert.ok(eqSan.equip_type.includes('4 equip.'));

  assert.equal(formatVisitDateBr('2026-11-20'), '20/11/2026');
  const diag = buildOsDiagnosisFromVisit(sampleVisits[0]);
  assert.ok(diag.includes('VIS-20261119-1001'));
  assert.ok(diag.includes('20/11/2026'));
});

test('filtering, stats, WhatsApp reply link, and missing table detection work accurately', () => {
  const stats = computeSiteVisitsStats(sampleVisits);
  assert.equal(stats.total, 2);
  assert.equal(stats.novos, 1);
  assert.equal(stats.urgentes, 1);
  assert.equal(stats.corretivos, 1);
  assert.equal(stats.sanitizacoes, 1);

  assert.equal(filterSiteVisits(sampleVisits, { activity: 'sanitizacao' }).length, 1);
  assert.equal(filterSiteVisits(sampleVisits, { search: 'canoas' }).length, 1);
  assert.equal(filterSiteVisits(sampleVisits, { status: 'novo' }).length, 1);

  const waUrl = buildClientWhatsAppReplyUrl(sampleVisits[0]);
  assert.ok(waUrl.startsWith('https://wa.me/5551988887777?text='));
  assert.ok(decodeURIComponent(waUrl).includes('VIS-20261119-1001'));

  assert.equal(
    isMissingServiceRequestsTableError({
      code: 'PGRST205',
      message: "Could not find the table 'public.service_requests' in the schema cache",
    }),
    true
  );
});

test('CSV export uses UTF-8 BOM and PT-BR semicolon separator', () => {
  const csv = buildSiteVisitsCsv(sampleVisits);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.ok(csv.includes('Protocolo;Data Registro;Atividade;'));
  assert.ok(csv.includes('VIS-20261119-1001'));
  assert.ok(csv.includes('Canoas - RS'));
});

console.log(`\nAll ${passed} siteVisitsEngine tests passed!`);
