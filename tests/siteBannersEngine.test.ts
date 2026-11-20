import assert from 'node:assert/strict';
import {
  BANNER_QUICK_TEMPLATES,
  BLANK_BANNER_DRAFT,
  formatBannerDateBr,
  getBannerScheduleStatus,
  isMissingSiteBannersTableError,
  validateBannerDraft,
} from '../src/lib/siteBannersEngine';

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

console.log('Running siteBannersEngine unit tests...');

test('schedule status classifies inactive, scheduled, live, and expired without UTC drift', () => {
  assert.equal(
    getBannerScheduleStatus({ active: false, starts_on: '2026-11-20', ends_on: '2026-11-30' }, '2026-11-25'),
    'inactive'
  );
  assert.equal(
    getBannerScheduleStatus({ active: true, starts_on: '2026-11-20', ends_on: '2026-11-30' }, '2026-11-19'),
    'scheduled'
  );
  assert.equal(
    getBannerScheduleStatus({ active: true, starts_on: '2026-11-20', ends_on: '2026-11-30' }, '2026-11-20'),
    'live'
  );
  assert.equal(
    getBannerScheduleStatus({ active: true, starts_on: '2026-11-20', ends_on: '2026-11-30' }, '2026-11-30'),
    'live'
  );
  assert.equal(
    getBannerScheduleStatus({ active: true, starts_on: '2026-11-20', ends_on: '2026-11-30' }, '2026-12-01'),
    'expired'
  );
  assert.equal(
    getBannerScheduleStatus({ active: true, starts_on: null, ends_on: null }, '2026-11-20'),
    'live'
  );
});

test('validateBannerDraft enforces artwork image, editorial headline, and valid date range', () => {
  assert.ok(validateBannerDraft(BLANK_BANNER_DRAFT));

  const artworkMissingImg = {
    ...BLANK_BANNER_DRAFT,
    name: 'Arte Black Friday',
    mode: 'artwork' as const,
    desktop_image_url: '',
  };
  assert.ok(validateBannerDraft(artworkMissingImg));

  const artworkValid = {
    ...artworkMissingImg,
    desktop_image_url: 'https://cdn.example/bf.jpg',
  };
  assert.equal(validateBannerDraft(artworkValid), null);

  const badDates = {
    ...BLANK_BANNER_DRAFT,
    name: 'Natal',
    headline: 'Natal Refrimaq',
    starts_on: '2026-12-25',
    ends_on: '2026-12-01',
  };
  assert.ok(validateBannerDraft(badDates));
});

test('quick templates are valid when populated and date/error helpers work cleanly', () => {
  const bf = BANNER_QUICK_TEMPLATES.find(t => t.key === 'black_friday');
  assert.ok(bf);
  assert.equal(validateBannerDraft({ ...BLANK_BANNER_DRAFT, ...bf!.draft }), null);
  assert.equal(formatBannerDateBr('2026-11-20'), '20/11/2026');
  assert.equal(formatBannerDateBr(null), '—');
  assert.equal(
    isMissingSiteBannersTableError({
      code: 'PGRST205',
      message: "Could not find the table 'public.site_banners' in the schema cache",
    }),
    true
  );
});

console.log(`\nAll ${passed} siteBannersEngine tests passed!`);
