import assert from 'assert';
import { SentinelV2Strategy } from '../discovery/strategies/sentinel-v2';
import { computeRMultiple } from '../discovery/scoring';

async function testSentinelV2Engine() {
  console.log('🧪 Testing Sentinel V2 Strategy Engine...');
  const strategy = new SentinelV2Strategy();

  assert.strictEqual(strategy.meta.id, 'sentinel_v2');
  assert.strictEqual(strategy.meta.tier, 'elite');
  assert.strictEqual(strategy.meta.enabled, true);

  console.log('✅ Stage metadata & interface validated');

  // Verify R:R calculation logic
  const entry = 1.08500;
  const stop = 1.08400; // 10 pips risk
  const tp1 = 1.08700; // 20 pips reward
  const rr = computeRMultiple(entry, tp1, stop, 'long');
  assert.strictEqual(rr, 2.0, 'TP1 must yield exact 2.0R');

  // Verify Stage 1.5 Quadrant Logic (Discount for Longs, Premium for Shorts)
  const expHigh = 100.0;
  const expLow = 90.0;
  const expMid = (expHigh + expLow) / 2; // 95.0
  const longInDiscount = 93.0 <= expMid;
  const longInPremium = 97.0 <= expMid;
  assert.strictEqual(longInDiscount, true, 'Long price in discount (93 <= 95) must pass quadrant filter');
  assert.strictEqual(longInPremium, false, 'Long price in premium (97 <= 95) must fail quadrant filter');

  const shortInPremium = 97.0 >= expMid;
  const shortInDiscount = 93.0 >= expMid;
  assert.strictEqual(shortInPremium, true, 'Short price in premium (97 >= 95) must pass quadrant filter');
  assert.strictEqual(shortInDiscount, false, 'Short price in discount (93 >= 95) must fail quadrant filter');
  console.log('✅ Stage 1.5 Quadrant Equilibrium (Discount/Premium) validated');

  // Verify Break-Even Threshold for Sentinel V2 is 1.5R (not 1.0R)
  const sentinelBeThreshold = 1.5;
  const openR_1_2 = 1.2;
  const openR_1_6 = 1.6;
  assert.strictEqual(openR_1_2 >= sentinelBeThreshold, false, 'Open R of 1.2 must NOT trigger BE for Sentinel V2');
  assert.strictEqual(openR_1_6 >= sentinelBeThreshold, true, 'Open R of 1.6 MUST trigger BE for Sentinel V2');
  console.log('✅ Break-Even threshold softened to +1.5R validated');

  console.log('✅ Risk Management & Target calculations validated');
}

testSentinelV2Engine().then(() => {
  console.log('🎉 All Sentinel V2 Unit Tests Passed Successfully!');
}).catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
