import assert from 'node:assert/strict';
import {
  computeAutoFitPlan,
  IMAGE_FIT_PRESETS,
} from '../src/lib/imageAutoFit';

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  PASS: ${name}`);
}

console.log('Running imageAutoFit unit tests...');

test('square 1080x1080 Canva graphic in full-bleed 1920x580 desktop auto-switches to blur_backdrop_contain (zero clipping)', () => {
  const plan = computeAutoFitPlan(1080, 1080, 'banner_desktop', 'auto');
  assert.equal(plan.strategy, 'blur_backdrop_contain');
  assert.equal(plan.targetWidth, 1920);
  assert.equal(plan.targetHeight, 580);
  assert.equal(plan.fgRect.height, 580);
  assert.equal(plan.fgRect.width, 580);
  assert.equal(plan.fgRect.x, 670);
  assert.equal(plan.fgRect.y, 0);
  assert.ok(plan.bgRect.width > 1920 && plan.bgRect.height > 580);
});

test('square 1080x1080 graphic in 750x820 mobile auto-uses edge-to-edge cover (natural ratio match)', () => {
  const plan = computeAutoFitPlan(1080, 1080, 'banner_mobile', 'auto');
  assert.equal(plan.strategy, 'cover');
  assert.equal(plan.targetWidth, 750);
  assert.equal(plan.targetHeight, 820);
  assert.ok(plan.fgRect.width >= 750 && plan.fgRect.height >= 820);
});

test('widescreen 1920x600 banner in 1920x580 desktop auto-uses cover edge-to-edge', () => {
  const plan = computeAutoFitPlan(1920, 600, 'banner_desktop', 'auto');
  assert.equal(plan.strategy, 'cover');
  assert.ok(plan.ratioDiff <= 1.05);
});

test('wide 1440x520 desktop banner in 750x820 mobile auto-switches to blur_backdrop_contain', () => {
  const plan = computeAutoFitPlan(1440, 520, 'banner_mobile', 'auto');
  assert.equal(plan.strategy, 'blur_backdrop_contain');
  assert.equal(plan.fgRect.width, 750);
  assert.ok(plan.fgRect.y > 0);
});

test('explicit cover mode respects top, center, and bottom focalY alignment', () => {
  const topPlan = computeAutoFitPlan(1080, 1080, 'banner_desktop', 'cover', 'top');
  const centerPlan = computeAutoFitPlan(1080, 1080, 'banner_desktop', 'cover', 'center');
  const bottomPlan = computeAutoFitPlan(1080, 1080, 'banner_desktop', 'cover', 'bottom');

  assert.equal(topPlan.strategy, 'cover');
  assert.equal(topPlan.fgRect.y, 0);
  assert.ok(centerPlan.fgRect.y < 0);
  assert.ok(bottomPlan.fgRect.y < centerPlan.fgRect.y);
});

test('product preset always uses contain_white with comfortable studio padding', () => {
  const plan = computeAutoFitPlan(1200, 1600, 'product', 'auto');
  assert.equal(plan.strategy, 'contain_white');
  assert.equal(plan.targetWidth, IMAGE_FIT_PRESETS.product.width);
  assert.equal(plan.targetHeight, IMAGE_FIT_PRESETS.product.height);
  assert.ok(plan.fgRect.x > 0 && plan.fgRect.y > 0);
  assert.ok(plan.fgRect.y + plan.fgRect.height < plan.targetHeight);
});

console.log(`\nAll ${passed} imageAutoFit tests passed!`);
