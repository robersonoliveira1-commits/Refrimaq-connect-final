import assert from 'node:assert/strict';
import {
  slugifySiteProduct,
  parseSitePriceInput,
  formatSitePrice,
  suggestSiteSpecs,
  isMissingSiteProductsTableError,
  filterSiteProducts,
  buildSiteCatalogCsv,
  SiteProductRow,
} from '../src/lib/siteCatalogEngine';

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  PASS: ${name}`);
}

console.log('Running siteCatalogEngine unit tests...');

test('slugifySiteProduct normalizes accents and punctuation', () => {
  assert.equal(
    slugifySiteProduct('Chopeira Elétrica Memo 50L/h — 2 Torneiras!'),
    'chopeira-eletrica-memo-50l-h-2-torneiras'
  );
});

test('parseSitePriceInput supports BR decimal, dot decimal, and empty (sob consulta)', () => {
  assert.equal(parseSitePriceInput('4.490,00'), 4490);
  assert.equal(parseSitePriceInput('R$ 1.455,50'), 1455.5);
  assert.equal(parseSitePriceInput('210.00'), 210);
  assert.equal(parseSitePriceInput(''), null);
  assert.equal(parseSitePriceInput('0'), null);
  assert.equal(formatSitePrice(null), 'Valor sob consulta');
  assert.ok(formatSitePrice(4490).includes('4.490,00'));
});

test('suggestSiteSpecs extracts flow, taps, and voltage cleanly', () => {
  assert.equal(suggestSiteSpecs('Chopeira Elétrica Advantage 70L/h - 2 Torneiras'), '70 L/h · 2 vias');
  assert.equal(suggestSiteSpecs('Barril 30L Slim'), '30 L');
});

test('isMissingSiteProductsTableError detects PostgREST and Postgres missing-table errors', () => {
  assert.equal(
    isMissingSiteProductsTableError({
      message: "Could not find the table 'public.site_products' in the schema cache",
      code: 'PGRST205',
    }),
    true
  );
  assert.equal(isMissingSiteProductsTableError({ message: 'permission denied', code: '42501' }), false);
});

test('filterSiteProducts and buildSiteCatalogCsv work cleanly', () => {
  const sample: SiteProductRow[] = [
    {
      id: '1',
      slug: 'chopeira-small-50',
      title: 'Chopeira Elétrica Small 50L/h',
      category_id: 'chopeiras-eletricas',
      category_label: 'Chopeiras Elétricas',
      brand: 'Memo',
      price: 4490,
      specs: '50 L/h · 2 vias',
      description: 'Compacta em inox.',
      image_url: '/media/products/small.jpg',
      featured: true,
      active: true,
      sort_order: 1,
    },
    {
      id: '2',
      slug: 'barril-30l',
      title: 'Barril 30L Slim',
      category_id: 'barris',
      category_label: 'Barris Kegsbrasil',
      brand: 'Kegsbrasil',
      price: null,
      specs: '30 L',
      description: 'Inox 304.',
      image_url: '/media/products/barril.png',
      featured: false,
      active: false,
      sort_order: 2,
    },
  ];

  assert.equal(filterSiteProducts(sample, { search: 'eletrica' }).length, 1);
  assert.equal(filterSiteProducts(sample, { status: 'hidden' }).length, 1);
  assert.equal(filterSiteProducts(sample, { status: 'featured' }).length, 1);
  assert.equal(filterSiteProducts(sample, { status: 'priced' }).length, 1);

  const csv = buildSiteCatalogCsv(sample);
  assert.ok(csv.startsWith('\uFEFFSlug;Título;Categoria;'));
  assert.ok(csv.includes('4490,00'));
  assert.ok(csv.includes('Sob consulta'));
});

console.log(`\nAll ${passed} siteCatalogEngine tests passed!`);
