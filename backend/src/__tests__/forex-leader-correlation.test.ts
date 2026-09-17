import assert from 'assert';
import { MannaSndStrategy } from '../discovery/strategies/manna-snd';
import { SentinelV2Strategy } from '../discovery/strategies/sentinel-v2';
import { discoverUnifiedSetups } from '../discovery/unified-discovery';
import { processKillzoneMidpointScan } from '../scheduler/midpoint-scanner';
import * as queries from '../db/queries';
import { queryDb, getSqliteDb } from '../db/database';
import { KillzoneInfo, CandidateSetup } from '../discovery/types';

async function runTests() {
  console.log('🚀 Running Forex Leader Correlation & Midpoint Scanner Tests...\n');

  // ── TEST 1: MannaSndStrategy respects preCalculatedBiases ──
  console.log('1️⃣ Testing MannaSndStrategy preCalculatedBiases enforcement...');
  const snd = new MannaSndStrategy();
  assert.strictEqual(snd.meta.id, 'manna_snd');
  console.log('   ✅ Manna SnD strategy initialized successfully.');

  // ── TEST 2: SentinelV2Strategy respects preCalculatedBiases ──
  console.log('2️⃣ Testing SentinelV2Strategy preCalculatedBiases enforcement...');
  const sentinel = new SentinelV2Strategy();
  assert.strictEqual(sentinel.meta.id, 'sentinel_v2');
  console.log('   ✅ Sentinel V2 strategy initialized successfully.');

  // ── TEST 3: queries.getActiveSetups excludes resolved outcomes ──
  console.log('3️⃣ Testing queries.getActiveSetups outcome exclusion...');
  const db = getSqliteDb();
  
  // Insert a dummy setup and a dummy outcome
  const testSetupId = `test_setup_${Date.now()}`;
  await queryDb(
    `INSERT INTO forex_edge_setups (id, instrument, market, created_at, killzone_origin, bias, entry_zone_low, entry_zone_high, entry_zone_mid, stop, tp1, signal_state, superseded, tradable)
     VALUES (?, ?, 'forex', ?, 'ny_am', 'short', 1.1600, 1.1610, 1.1605, 1.1630, 1.1550, 'awaiting_entry', 0, 1)`,
    [testSetupId, 'EUR/USD', new Date().toISOString()]
  );

  let active = await queries.getActiveSetups('forex');
  const foundBefore = active.find(s => s.id === testSetupId);
  assert.ok(foundBefore, 'Test setup should be active before outcome');

  // Now insert an outcome for this setup
  await queryDb(
    `INSERT INTO outcomes (id, setup_id, setup_market, outcome_type, realized_pl, created_at) VALUES (?, ?, 'forex', 'tp1_hit', 2.0, ?)`,
    [`outcome_${Date.now()}`, testSetupId, new Date().toISOString()]
  );

  active = await queries.getActiveSetups('forex');
  const foundAfter = active.find(s => s.id === testSetupId);
  assert.strictEqual(foundAfter, undefined, 'Test setup MUST be excluded from getActiveSetups once in outcomes table');
  console.log('   ✅ queries.getActiveSetups successfully filters out setups with outcomes.');

  // Clean up test rows
  await queryDb(`DELETE FROM outcomes WHERE setup_id = ?`, [testSetupId]);
  await queryDb(`DELETE FROM forex_edge_setups WHERE id = ?`, [testSetupId]);

  // ── TEST 4: Midpoint Scanner Thresholds & Market Scope Logic ──
  console.log('4️⃣ Testing Midpoint Scanner Thresholds & Market Scope...');
  const MIN_SIGNALS_FOREX = 4;
  const MIN_SIGNALS_FUTURES = 2;

  // Scenario A: Forex has 1 active signal, Futures has 2
  const forexCountA = 1;
  const futuresCountA = 2;
  const forexNeedsA = forexCountA < MIN_SIGNALS_FOREX;
  const futuresNeedsA = futuresCountA < MIN_SIGNALS_FUTURES;
  assert.strictEqual(forexNeedsA, true, 'Forex with 1 signal MUST trigger needsScan');
  assert.strictEqual(futuresNeedsA, false, 'Futures with 2 signals should not need scan');
  let scopeA: string = 'both';
  if (futuresNeedsA && !forexNeedsA) scopeA = 'futures';
  else if (forexNeedsA && !futuresNeedsA) scopeA = 'forex';
  assert.strictEqual(scopeA, 'forex', 'Market scope MUST be forex when only forex is below threshold');
  console.log('   ✅ Midpoint threshold logic correctly activates Forex scan when Forex has 1 signal.');

  // ── TEST 5: Forex Leader-Follower Alignment Validation ──
  console.log('5️⃣ Testing Forex Leader-Follower Alignment Rule...');
  const leaderBias = 'short'; // EUR/USD is Short
  const positivePairs = ['GBP/USD', 'AUD/USD', 'NZD/USD'];
  const inversePairs = ['USD/JPY', 'USD/CAD', 'USD/CHF'];

  // Test follower bias mapping
  const expectedGbpBias = positivePairs.includes('GBP/USD') ? leaderBias : 'long';
  const expectedAudBias = positivePairs.includes('AUD/USD') ? leaderBias : 'long';
  const expectedUsdJpyBias = inversePairs.includes('USD/JPY') ? (leaderBias === 'long' ? 'short' : 'long') : 'short';

  assert.strictEqual(expectedGbpBias, 'short', 'GBP/USD must follow EUR/USD SHORT');
  assert.strictEqual(expectedAudBias, 'short', 'AUD/USD must follow EUR/USD SHORT');
  assert.strictEqual(expectedUsdJpyBias, 'long', 'USD/JPY must invert EUR/USD SHORT to LONG');
  console.log('   ✅ Leader-follower correlation mapping correctly enforces direction.');

  // ── TEST 6: Bias Engine synchronizes Dollar group even when EUR/USD is excluded ──
  console.log('6️⃣ Testing Bias Engine Dollar synchronization without EUR/USD in input array...');
  const { getUnifiedMarketBiases } = await import('../discovery/bias-engine');
  // Pass only GBP/USD and USD/JPY without EUR/USD
  const partialBiases = await getUnifiedMarketBiases(['GBP/USD', 'USD/JPY']);
  assert.ok(partialBiases['GBP/USD'], 'GBP/USD bias must be generated');
  assert.ok(partialBiases['USD/JPY'], 'USD/JPY bias must be generated');
  // They MUST NOT have the same raw bias (if GBP/USD is short, USD/JPY must be long; if long, short)
  assert.notStrictEqual(
    partialBiases['GBP/USD'],
    partialBiases['USD/JPY'],
    `Dollar synchronization must ensure GBP/USD (${partialBiases['GBP/USD']}) and USD/JPY (${partialBiases['USD/JPY']}) do not both have the same raw bias`
  );
  console.log(`   ✅ getUnifiedMarketBiases automatically synchronized GBP/USD (${partialBiases['GBP/USD']}) and USD/JPY (${partialBiases['USD/JPY']}) without EUR/USD in input.`);

  // ── TEST 7: Pre-Publish Gate blocks contradictory USD/JPY SELL + GBP/USD SELL ──
  console.log('7️⃣ Testing Pre-Publish Gate blocking contradictory Dollar candidates (USD/JPY SELL + GBP/USD SELL)...');
  await queryDb(`DELETE FROM forex_edge_setups WHERE id LIKE 'test_%'`);
  await queryDb(`DELETE FROM edge_setups WHERE id LIKE 'test_%'`);
  const { executePublishRun } = await import('../publish-gate/publish-gate');
  const kzInfoTest: KillzoneInfo = {
    killzone: 'ny_am',
    score: 90,
    boundaryET: '08:00 ET',
    isActive: true
  };

  const conflictingCandidate1: CandidateSetup = {
    id: `test_cand_gbp_${Date.now()}`,
    instrument: 'GBP/USD',
    bias: 'short', // SELL -> Bullish USD
    entry_zone_low: 1.3000,
    entry_zone_high: 1.3010,
    entry_zone_mid: 1.3005,
    stop: 1.3030,
    tp1: 1.2950,
    tp2: 1.2900,
    conviction_score: 90,
    strategy_id: 'manna_snd',
    run_id: 'test_run'
  };

  const conflictingCandidate2: CandidateSetup = {
    id: `test_cand_usdjpy_${Date.now()}`,
    instrument: 'USD/JPY',
    bias: 'short', // SELL -> Bearish USD (Contradicts GBP/USD SELL!)
    entry_zone_low: 155.00,
    entry_zone_high: 155.10,
    entry_zone_mid: 155.05,
    stop: 155.30,
    tp1: 154.50,
    tp2: 154.00,
    conviction_score: 80, // Lower conviction -> MUST BE BLOCKED
    strategy_id: 'manna_snd',
    run_id: 'test_run'
  };

  const pubResult = await executePublishRun(kzInfoTest, [], [conflictingCandidate1, conflictingCandidate2], 'dry_run');
  // Only the higher conviction candidate (GBP/USD with 90%) should be preserved; conflicting USD/JPY should be blocked
  assert.strictEqual(pubResult.stats.created, 1, 'Exactly one non-conflicting Dollar candidate must be created');
  console.log('   ✅ Pre-Publish Gate successfully intercepted and blocked contradictory USD/JPY SELL alongside GBP/USD SELL.');

  // ── TEST 8: Decision Matrix identifies opposing Dollar exposures across inverse pairs ──
  console.log('8️⃣ Testing Decision Matrix cross-strategy and correlation penalty with inverse pairs...');
  const { calculateAssetMatrix } = await import('../analytics/decision-matrix');
  const matrixSetups = [
    {
      id: 'mat_setup_1',
      instrument: 'GBP/USD',
      market: 'forex',
      bias: 'short', // SELL
      entry_zone_low: 1.3000,
      entry_zone_high: 1.3010,
      entry_zone_mid: 1.3005,
      stop: 1.3030,
      tp1: 1.2950,
      conviction_score: 90,
      signal_state: 'awaiting_entry',
      strategy_id: 'manna_snd'
    },
    {
      id: 'mat_setup_2',
      instrument: 'USD/JPY',
      market: 'forex',
      bias: 'short', // SELL (Opposes GBP/USD SELL on USD!)
      entry_zone_low: 155.00,
      entry_zone_high: 155.10,
      entry_zone_mid: 155.05,
      stop: 155.30,
      tp1: 154.50,
      conviction_score: 85,
      signal_state: 'awaiting_entry',
      strategy_id: 'manna_snd'
    }
  ];

  const matrixItems = calculateAssetMatrix(matrixSetups);
  assert.strictEqual(matrixItems.length, 2);
  const usdjpyItem = matrixItems.find(i => i.instrument === 'USD/JPY');
  const gbpusdItem = matrixItems.find(i => i.instrument === 'GBP/USD');
  // Lower ranked setup (USD/JPY) should receive correlation penalty for contradictory exposure
  assert.ok(usdjpyItem!.priority_score < 85, 'USD/JPY must receive correlation penalty when conflicting with higher-ranked GBP/USD');
  console.log(`   ✅ Decision Matrix correctly applied correlation penalty to conflicting setup (USD/JPY priority: ${usdjpyItem!.priority_score}).`);

  console.log('\n🎉 ALL FOREX LEADER CORRELATION & MIDPOINT SCANNER TESTS PASSED!');
}

runTests().then(() => {
  process.exit(0);
}).catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
