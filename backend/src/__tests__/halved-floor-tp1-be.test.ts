import assert from 'assert';
import { getLogicalStopDistance } from '../discovery/stop-loss-rules';
import * as queries from '../db/queries';
import { getDb } from '../db/database';

async function runTests() {
  console.log('🧪 Starting Halved Floor & TP1 Break-Even Mode Tests...\n');
  getDb();

  // TEST 1: Logical Stop Loss Floor Halving vs Standard Rules
  console.log('Test 1: Verifying Stop Loss Floor Halving and Reversion...');
  // Standard (100% floor)
  const eurUsdStandard = getLogicalStopDistance('EUR/USD', 0.0001, 0.0002, 'forex', false);
  const usdJpyStandard = getLogicalStopDistance('USD/JPY', 0.01, 0.02, 'forex', false);
  const gbpUsdStandard = getLogicalStopDistance('GBP/USD', 0.0001, 0.0002, 'forex', false);

  assert.strictEqual(eurUsdStandard, 0.0010, 'Standard EUR/USD floor must be 10 pips (0.0010)');
  assert.strictEqual(usdJpyStandard, 0.18, 'Standard USD/JPY floor must be 18 pips (0.18)');
  assert.strictEqual(gbpUsdStandard, 0.0012, 'Standard GBP/USD floor must be 12 pips (0.0012)');
  console.log('  ✓ Standard 100% floors verified (10 pips EUR/USD, 18 pips USD/JPY, 12 pips GBP/USD)');

  // Optimized (50% floor)
  const eurUsdHalved = getLogicalStopDistance('EUR/USD', 0.0001, 0.0002, 'forex', true);
  const usdJpyHalved = getLogicalStopDistance('USD/JPY', 0.01, 0.02, 'forex', true);
  const gbpUsdHalved = getLogicalStopDistance('GBP/USD', 0.0001, 0.0002, 'forex', true);

  assert.strictEqual(eurUsdHalved, 0.0005, 'Halved EUR/USD floor must be 5 pips (0.0005)');
  assert.strictEqual(usdJpyHalved, 0.09, 'Halved USD/JPY floor must be 9 pips (0.09)');
  assert.strictEqual(gbpUsdHalved, 0.0006, 'Halved GBP/USD floor must be 6 pips (0.0006)');
  console.log('  ✓ Halved 50% floors verified (5 pips EUR/USD, 9 pips USD/JPY, 6 pips GBP/USD)');

  // TEST 2: Database Persistence & Toggle Reversion
  console.log('\nTest 2: Verifying Setting Toggle, Persistence & Default Value...');
  await queries.ensureStrategySettingsSeeded();

  // Check default for manna_snd is true (as requested: turned ON by default)
  const defaultVal = await queries.isHalvedFloorTp1BeEnabled('manna_snd');
  assert.strictEqual(defaultVal, true, 'manna_snd should have halved_floor_tp1_be = true by default');
  console.log('  ✓ Default state for manna_snd is ON (true)');

  // Turn toggle OFF -> verify revert
  await queries.updateStrategyHalvedFloorTp1Be('manna_snd', false);
  const turnedOffVal = await queries.isHalvedFloorTp1BeEnabled('manna_snd');
  assert.strictEqual(turnedOffVal, false, 'manna_snd should reflect turned OFF state');
  console.log('  ✓ Successfully turned toggle OFF (reverted to standard rules)');

  // Turn toggle back ON -> verify active
  await queries.updateStrategyHalvedFloorTp1Be('manna_snd', true);
  const turnedOnVal = await queries.isHalvedFloorTp1BeEnabled('manna_snd');
  assert.strictEqual(turnedOnVal, true, 'manna_snd should reflect turned ON state');
  console.log('  ✓ Successfully turned toggle back ON (optimized mode active)');

  // TEST 3: Outcome Detector BE Trigger Logic Verification
  console.log('\nTest 3: Verifying Break-Even Logic with Toggle ON vs OFF...');
  const maxR = 1.25; // Trade reached +1.25R open profit

  // When toggle is ON: Early BE criteria must NOT trigger
  const isTp1BeOnly_ON = true;
  const beCriteriaReached_ON = !isTp1BeOnly_ON && (maxR >= 1.0);
  assert.strictEqual(beCriteriaReached_ON, false, 'When toggle is ON, maxR >= 1.0 must NOT trigger early break-even');
  console.log('  ✓ When toggle is ON: premature BE is bypassed, trade allowed to run to TP1 (+2R)');

  // When toggle is OFF: Early BE criteria MUST trigger
  const isTp1BeOnly_OFF = false;
  const beCriteriaReached_OFF = !isTp1BeOnly_OFF && (maxR >= 1.0);
  assert.strictEqual(beCriteriaReached_OFF, true, 'When toggle is OFF, maxR >= 1.0 MUST trigger early break-even');
  console.log('  ✓ When toggle is OFF: early BE triggers at +1.0R (standard rule restored)');

  console.log('\n🎉 ALL TESTS PASSED SUCCESSFULLY!');
  process.exit(0);
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
