import assert from 'assert';
import { calculateAssetMatrix, calculateAssetMatrixItem } from '../analytics/decision-matrix';

console.log('--- RUNNING DECISION MATRIX UNIT TESTS ---');

// Test 1: Active Setup inside entry zone receives IMMINENT_FOCUS tier
const setupInZone = {
  id: 'setup-in-zone',
  instrument: 'ES',
  market: 'futures',
  bias: 'long',
  conviction_score: 92,
  entry_zone_low: 5400,
  entry_zone_high: 5410,
  entry_zone_mid: 5405,
  stop: 5385,
  tp1: 5445,
  r_multiple_1: 2.0,
  signal_state: 'active'
};

const itemInZone = calculateAssetMatrixItem(setupInZone, 5405, [], '2026-08-03T13:30:00Z'); // NY AM KZ
assert.strictEqual(itemInZone.is_in_zone, true, 'Should mark as inside entry zone');
assert.strictEqual(itemInZone.factors.proximity, 100, 'Proximity factor should be 100');
assert.strictEqual(itemInZone.priority_tier, 'IMMINENT_FOCUS', 'Should belong to IMMINENT_FOCUS tier');
assert.strictEqual(itemInZone.actionable_recommendation, 'EXECUTE_OR_ARM', 'Recommendation should be EXECUTE_OR_ARM');
assert(itemInZone.priority_score >= 90, `Priority score should be >= 90, got ${itemInZone.priority_score}`);
console.log('✓ Test 1 Passed: Setup in entry zone receives IMMINENT_FOCUS tier.');

// Test 2: Distant setup degrades proximity score and receives lower priority
const setupDistant = {
  id: 'setup-distant',
  instrument: 'NQ',
  market: 'futures',
  bias: 'short',
  conviction_score: 80,
  entry_zone_low: 19500,
  entry_zone_high: 19520,
  entry_zone_mid: 19510,
  stop: 19560,
  tp1: 19410,
  r_multiple_1: 2.0,
  signal_state: 'awaiting_entry'
};

// Current price is 200 points away (4 R away since risk is 50 points)
const itemDistant = calculateAssetMatrixItem(setupDistant, 19720, [], '2026-08-03T13:30:00Z');
assert.strictEqual(itemDistant.is_in_zone, false, 'Should NOT be in entry zone');
assert.strictEqual(itemDistant.factors.proximity, 0, 'Proximity factor should drop to 0');
assert.notStrictEqual(itemDistant.priority_tier, 'IMMINENT_FOCUS', 'Should NOT be IMMINENT_FOCUS');
console.log('✓ Test 2 Passed: Distant setup correctly penalizes proximity score.');

// Test 3: Matrix correctly sorts multiple setups by priority score
const setups = [setupDistant, setupInZone];
const matrix = calculateAssetMatrix(setups, { ES: 5405, NQ: 19720 }, [], '2026-08-03T13:30:00Z');
assert.strictEqual(matrix.length, 2, 'Matrix should contain 2 items');
assert.strictEqual(matrix[0].id, 'setup-in-zone', 'Top asset (#1 rank) should be setup-in-zone');
assert.strictEqual(matrix[0].rank, 1, 'Top asset rank should be 1');
assert.strictEqual(matrix[1].rank, 2, 'Second asset rank should be 2');
console.log('✓ Test 3 Passed: Matrix correctly ranks top focus asset #1.');

console.log('--- ALL DECISION MATRIX UNIT TESTS PASSED SUCCESSFULLY! ---');
