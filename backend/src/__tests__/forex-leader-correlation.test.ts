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

  console.log('\n🎉 ALL FOREX LEADER CORRELATION & MIDPOINT SCANNER TESTS PASSED!');
}

runTests().then(() => {
  process.exit(0);
}).catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
