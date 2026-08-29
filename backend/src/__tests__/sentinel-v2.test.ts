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

  console.log('✅ Risk Management & Target calculations validated');
}

testSentinelV2Engine().then(() => {
  console.log('🎉 All Sentinel V2 Unit Tests Passed Successfully!');
}).catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
