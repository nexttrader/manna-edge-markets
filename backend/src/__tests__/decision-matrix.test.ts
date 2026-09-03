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
  historical_winrate: 80,
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

// Test 4: Forex Divergence correctly awards priority to Manna SnD over Manna Elite
const forexSndShort = {
  id: 'snd-eurusd-short',
  instrument: 'EUR/USD',
  market: 'forex',
  strategy_id: 'manna_snd',
  bias: 'short',
  conviction_score: 85,
  historical_winrate: 80,
  entry_zone_low: 1.1650,
  entry_zone_high: 1.1655,
  entry_zone_mid: 1.16525,
  stop: 1.1665,
  tp1: 1.1630,
  r_multiple_1: 2.0,
  signal_state: 'awaiting_entry',
  metadata: JSON.stringify({ curveLocation: 'high', formation: 'Drop-Base-Drop' })
};

const forexEliteLong = {
  id: 'elite-eurusd-long',
  instrument: 'EUR/USD',
  market: 'forex',
  strategy_id: 'sentinel_v2',
  bias: 'long',
  conviction_score: 88,
  historical_winrate: 75,
  entry_zone_low: 1.1645,
  entry_zone_high: 1.1650,
  entry_zone_mid: 1.16475,
  stop: 1.1635,
  tp1: 1.1670,
  r_multiple_1: 2.0,
  signal_state: 'awaiting_entry',
  poi_type: 'FVG'
};

const forexDivergenceMatrix = calculateAssetMatrix([forexEliteLong, forexSndShort], { 'EUR/USD': 1.1652 }, [], '2026-08-26T13:30:00Z');
assert.strictEqual(forexDivergenceMatrix[0].id, 'snd-eurusd-short', 'Manna SnD should win divergence on Forex');
assert.strictEqual(forexDivergenceMatrix[0].rank, 1, 'Manna SnD should be rank 1');
assert(forexDivergenceMatrix[0].priority_score > forexDivergenceMatrix[1].priority_score, 'SnD priority score should exceed Elite');
console.log('✓ Test 4 Passed: Forex Strategy Divergence correctly prioritizes Manna SnD over Manna Elite.');

// Test 5: Index Futures Momentum in NY AM correctly prioritizes Manna Elite FVG over Manna SnD Fade
const indexEliteLong = {
  id: 'elite-nq-long',
  instrument: 'NQ',
  market: 'futures',
  strategy_id: 'sentinel_v2',
  bias: 'long',
  conviction_score: 90,
  historical_winrate: 80,
  entry_zone_low: 29500,
  entry_zone_high: 29520,
  entry_zone_mid: 29510,
  stop: 29470,
  tp1: 29590,
  r_multiple_1: 2.0,
  signal_state: 'awaiting_entry',
  poi_type: 'FVG'
};

const indexSndFade = {
  id: 'snd-nq-short',
  instrument: 'NQ',
  market: 'futures',
  strategy_id: 'manna_snd',
  bias: 'short',
  conviction_score: 86,
  historical_winrate: 75,
  entry_zone_low: 29550,
  entry_zone_high: 29570,
  entry_zone_mid: 29560,
  stop: 29600,
  tp1: 29480,
  r_multiple_1: 2.0,
  signal_state: 'awaiting_entry'
};

const indexDivergenceMatrix = calculateAssetMatrix([indexSndFade, indexEliteLong], { NQ: 29515 }, [], '2026-08-26T14:00:00Z'); // 10:00 AM ET (NY AM)
assert.strictEqual(indexDivergenceMatrix[0].id, 'elite-nq-long', 'Manna Elite FVG should win divergence on Index during NY AM');
assert.strictEqual(indexDivergenceMatrix[0].rank, 1, 'Manna Elite should be rank 1 on NY AM Index trend');
console.log('✓ Test 5 Passed: Index Futures Momentum during NY AM correctly prioritizes Manna Elite.');

// Test 6: Cross-Strategy Consensus Confluence Boost
const consensusElite = { ...forexSndShort, id: 'consensus-snd', bias: 'short' };
const consensusSnD = { ...forexEliteLong, id: 'consensus-elite', bias: 'short', strategy_id: 'sentinel_v2' };
const consensusMatrix = calculateAssetMatrix([consensusElite, consensusSnD], { 'EUR/USD': 1.1652 }, [], '2026-08-28T14:00:00Z');
assert(consensusMatrix[0].priority_score >= 88, 'Consensus trade should receive high priority score');
console.log('✓ Test 6 Passed: Cross-Strategy Consensus receives confluence boost.');

console.log('--- ALL DECISION MATRIX UNIT TESTS PASSED SUCCESSFULLY! ---');
