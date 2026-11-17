import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';

// Isolate SQLite test database in OS temp dir before importing DB modules
const tempDbPath = path.join(os.tmpdir(), `mtf_test_${Date.now()}.db`);
process.env.SQLITE_DB_PATH = tempDbPath;
delete process.env.DATABASE_URL;

import { getTimeframeStopDistance } from '../discovery/stop-loss-rules';
import { aggregateToFourHourCandles } from '../discovery/yahoo-provider';
import {
  ensureMtfTrackerTable,
  evaluateMtfRowLifecycle,
  syncMtfSetupsAndGetLiveBoard,
  getMtfCalendarOutcomes,
  TrackedMtfSetupRow
} from '../discovery/mtf-style-tracker';
import { computeBlendedRealizedR } from '../analytics/r-accounting';
import { queryDb } from '../db/database';
import type { Candle } from '../discovery/types';
import type { MtfStyleSetup } from '../discovery/mtf-style-signals';

function makeRow(overrides: Partial<TrackedMtfSetupRow> = {}): TrackedMtfSetupRow {
  return {
    id: 'test-scalp-nq-1',
    signature: 'test-scalp-nq-1',
    trading_style: 'SCALP',
    swing_mode: null,
    strategy_id: 'manna_scalper',
    context_tf: '15M',
    entry_tf: '5M',
    instrument: 'NQ',
    market: 'futures',
    bias: 'long',
    entry_zone_low: 21000,
    entry_zone_high: 21010,
    entry_zone_mid: 21005,
    stop: 20985,
    initial_stop: 20985,
    tp1: 21045, // +2R (risk = 20)
    tp2: 21065, // +3R
    r_multiple_1: 2.0,
    r_multiple_2: 3.0,
    conviction_score: 86,
    liquidity_score: 95,
    killzone_origin: 'ny_am',
    signal_state: 'awaiting_entry',
    is_breakeven: 0,
    realized_r: 0,
    last_price: 21020,
    entry_price_recorded: null,
    entry_triggered_at: null,
    execution_price: null,
    outcome_type: null,
    invalidation_reason: null,
    invalidation_detail: null,
    superseded: 0,
    superseded_by: null,
    metadata: null,
    filled_at: null,
    resolved_at: null,
    created_at: '2026-11-16T14:00:00.000Z',
    updated_at: '2026-11-16T14:00:00.000Z',
    ...overrides
  };
}

async function runTests() {
  console.log('🧪 Running Scalping, Swing & Chart Lifecycle Tests...\n');

  // ── TEST 1: Timeframe-Calibrated Stop Floors ──
  const scalpStopEur = getTimeframeStopDistance('EUR/USD', 0.0003, 0.0002, 'forex', '5m');
  const intradayStopEur = getTimeframeStopDistance('EUR/USD', 0.0006, 0.0004, 'forex', '15m');
  const swing1hStopEur = getTimeframeStopDistance('EUR/USD', 0.0012, 0.0008, 'forex', '1h');
  const swing4hStopEur = getTimeframeStopDistance('EUR/USD', 0.0024, 0.0016, 'forex', '4h');

  assert.strictEqual(scalpStopEur, 0.00085, 'EUR/USD 5M scalp floor should be 8.5 pips (0.00085)');
  assert.strictEqual(intradayStopEur, 0.001, 'EUR/USD 15M intraday floor should be 10 pips (0.0010)');
  assert.strictEqual(swing1hStopEur, 0.0025, 'EUR/USD 1H swing floor should be 25 pips (0.0025)');
  assert.strictEqual(swing4hStopEur, 0.0045, 'EUR/USD 4H swing floor should be 45 pips (0.0045)');
  assert.ok(scalpStopEur < intradayStopEur && intradayStopEur < swing1hStopEur && swing1hStopEur < swing4hStopEur);

  const scalpStopNq = getTimeframeStopDistance('NQ', 8.0, 5.0, 'futures', '5m');
  const swing4hStopNq = getTimeframeStopDistance('NQ', 60.0, 40.0, 'futures', '4h');
  assert.strictEqual(scalpStopNq, 19.25, 'NQ 5M scalp floor should be 19.25 pts');
  assert.strictEqual(swing4hStopNq, 157.5, 'NQ 4H swing floor should be 157.5 pts');
  console.log('✅ TEST 1: Timeframe-calibrated stop loss floors (5M < 15M < 1H < 4H) passed');

  // ── TEST 2: UTC-Aligned 4H Candle Aggregation ──
  const hourlyBars: Candle[] = [
    { open: 100, high: 102, low: 99, close: 101, volume: 10, timestamp: '2026-11-16T00:00:00.000Z' },
    { open: 101, high: 105, low: 100, close: 104, volume: 15, timestamp: '2026-11-16T01:00:00.000Z' },
    { open: 104, high: 104, low: 98, close: 99, volume: 20, timestamp: '2026-11-16T02:00:00.000Z' },
    { open: 99, high: 103, low: 99, close: 102, volume: 25, timestamp: '2026-11-16T03:00:00.000Z' },
    { open: 102, high: 108, low: 101, close: 107, volume: 30, timestamp: '2026-11-16T04:00:00.000Z' },
  ];
  const fourHourBars = aggregateToFourHourCandles(hourlyBars);
  assert.strictEqual(fourHourBars.length, 2, 'Should produce 2 aligned 4H buckets');
  assert.strictEqual(fourHourBars[0].timestamp, '2026-11-16T00:00:00.000Z');
  assert.strictEqual(fourHourBars[0].open, 100);
  assert.strictEqual(fourHourBars[0].high, 105);
  assert.strictEqual(fourHourBars[0].low, 98);
  assert.strictEqual(fourHourBars[0].close, 102);
  assert.strictEqual(fourHourBars[0].volume, 70);
  assert.strictEqual(fourHourBars[1].timestamp, '2026-11-16T04:00:00.000Z');
  console.log('✅ TEST 2: UTC-aligned 4H candle aggregation passed');

  // ── TEST 3: Scalp Entry -> BE (+1.5R) -> TP1 (+2R Runner) -> TP2 (+3R Resolved) ──
  const rowLong = makeRow();
  const candlesFillToTp2: Candle[] = [
    // Before creation — must be ignored!
    { open: 21000, high: 21090, low: 20950, close: 21020, volume: 100, timestamp: '2026-11-16T13:59:00.000Z' },
    // At 14:02: wicks down to fill BUY LIMIT at 21010 (Ask = low + 0.25 = 21008.25 <= 21010)
    { open: 21015, high: 21018, low: 21008, close: 21014, volume: 100, timestamp: '2026-11-16T14:02:00.000Z' },
    // At 14:05: hits +1.5R (21010 + 1.5*25? wait fill=21010, origStop=20985 -> risk=25, +1.5R=21047.5) and TP1 (21045)
    { open: 21014, high: 21048, low: 21013, close: 21046, volume: 100, timestamp: '2026-11-16T14:05:00.000Z' },
  ];
  const afterTp1 = evaluateMtfRowLifecycle(
    rowLong,
    { price: 21046, bid: 21046, ask: 21046.25, spread: 0.25 },
    candlesFillToTp2,
    5.0,
    '2026-11-16T14:05:30.000Z'
  );
  assert.strictEqual(afterTp1.signal_state, 'runner', 'Scalp hitting TP1 after entry must transition to runner');
  assert.strictEqual(afterTp1.entry_triggered_at, '2026-11-16T14:02:00.000Z', 'Entry time must capture the exact fill candle');
  assert.strictEqual(afterTp1.entry_price_recorded, 21010, 'Limit fill price should clamp to entry_zone_high');
  assert.strictEqual(afterTp1.is_breakeven, 1, 'Stop must move to BE on TP1');
  assert.strictEqual(afterTp1.stop, 21010, 'Stop price must move to recorded entry price');
  assert.strictEqual(afterTp1.realized_r, 1.6, 'Runner must lock 80% @ 2R = +1.60R');

  // Now TP2 hits at 14:08
  const runnerRow = makeRow({
    signal_state: afterTp1.signal_state,
    stop: afterTp1.stop,
    initial_stop: afterTp1.initial_stop,
    is_breakeven: afterTp1.is_breakeven,
    realized_r: afterTp1.realized_r,
    entry_price_recorded: afterTp1.entry_price_recorded,
    entry_triggered_at: afterTp1.entry_triggered_at,
    filled_at: afterTp1.filled_at
  });
  const tp2Result = evaluateMtfRowLifecycle(
    runnerRow,
    { price: 21066, bid: 21066, ask: 21066.25, spread: 0.25 },
    [{ open: 21050, high: 21067, low: 21049, close: 21066, volume: 100, timestamp: '2026-11-16T14:08:00.000Z' }],
    5.0,
    '2026-11-16T14:08:15.000Z'
  );
  assert.strictEqual(tp2Result.signal_state, 'resolved', 'Runner hitting TP2 must close as resolved');
  assert.strictEqual(tp2Result.outcome_type, 'tp2_hit');
  assert.strictEqual(tp2Result.realized_r, 2.2, 'TP2 hit must blend 80%@2R + 20%@3R = +2.20R');
  assert.strictEqual(tp2Result.resolved_at, '2026-11-16T14:08:00.000Z');
  console.log('✅ TEST 3: Scalp Entry -> BE -> TP1 Runner -> TP2 Resolved chronological lifecycle passed');

  // ── TEST 4: Missed Entry that Went Past TP2 Must Invalidate (target_reached_pre_entry) ──
  const missedRow = makeRow({ id: 'test-missed-tp2' });
  const missedCandles: Candle[] = [
    { open: 21020, high: 21075, low: 21018, close: 21072, volume: 100, timestamp: '2026-11-16T14:03:00.000Z' }
  ];
  const missedRes = evaluateMtfRowLifecycle(
    missedRow,
    { price: 21072, bid: 21072, ask: 21072.25, spread: 0.25 },
    missedCandles,
    5.0,
    '2026-11-16T14:03:10.000Z'
  );
  assert.strictEqual(missedRes.signal_state, 'invalidated', 'Unentered scalp that ran past TP1/TP2 must invalidate');
  assert.strictEqual(missedRes.invalidation_reason, 'target_reached_pre_entry');
  assert.strictEqual(missedRes.entry_triggered_at, null, 'Must never record an entry time when unentered');
  console.log('✅ TEST 4: Missed entry reaching TP1/TP2 pre-entry invalidation passed');

  // ── TEST 5: Swing Short Lifecycle (D1 · 4H) ──
  const swingShort = makeRow({
    id: 'test-swing-eurusd',
    trading_style: 'SWING',
    swing_mode: 'd1_h4',
    strategy_id: 'manna_swing',
    context_tf: '1D',
    entry_tf: '4H',
    instrument: 'EUR/USD',
    market: 'forex',
    bias: 'short',
    entry_zone_low: 1.08000,
    entry_zone_high: 1.08200,
    entry_zone_mid: 1.08100,
    stop: 1.08600,
    initial_stop: 1.08600,
    tp1: 1.07000,
    tp2: 1.06500,
    created_at: '2026-11-15T08:00:00.000Z'
  });
  const swingCandles: Candle[] = [
    { open: 1.07800, high: 1.08050, low: 1.07700, close: 1.07900, volume: 1000, timestamp: '2026-11-15T12:00:00.000Z' },
    { open: 1.07900, high: 1.07950, low: 1.06950, close: 1.07100, volume: 1000, timestamp: '2026-11-15T16:00:00.000Z' },
    { open: 1.07100, high: 1.08020, low: 1.07050, close: 1.07990, volume: 1000, timestamp: '2026-11-15T20:00:00.000Z' }
  ];
  const swingRes = evaluateMtfRowLifecycle(
    swingShort,
    { price: 1.0799, bid: 1.0799, ask: 1.08002, spread: 0.00012 },
    swingCandles,
    0.003,
    '2026-11-15T20:05:00.000Z'
  );
  assert.strictEqual(swingRes.signal_state, 'resolved', 'Runner hitting BE stop must close as resolved keeping TP1');
  assert.strictEqual(swingRes.outcome_type, 'tp1_hit');
  assert.strictEqual(swingRes.realized_r, 1.6, 'Runner stopped at BE must realize 80%@2R + 20%@0R = +1.60R');
  assert.strictEqual(swingRes.entry_triggered_at, '2026-11-15T12:00:00.000Z');
  assert.strictEqual(swingRes.resolved_at, '2026-11-15T20:00:00.000Z');
  console.log('✅ TEST 5: Swing Short (D1 · 4H) Entry -> Runner -> BE Retrace (+2R) passed');

  // ── TEST 6: Superseding Pending Zones While Preserving Active Trades ──
  await ensureMtfTrackerTable();
  const baseTime = new Date().toISOString();
  const pendingCandidate1: MtfStyleSetup = {
    id: 'mtf-scalp-TESTINST-1',
    instrument: 'TESTINST',
    market: 'futures',
    strategy_id: 'manna_scalper',
    trading_style: 'SCALP',
    context_tf: '15M',
    entry_tf: '5M',
    bias: 'long',
    signal_state: 'awaiting_entry',
    state: 'awaiting_entry',
    entry_zone_low: 7400,
    entry_zone_high: 7405,
    entry_zone_mid: 7402.5,
    stop: 7395,
    initial_stop: 7395,
    tp1: 7417.5,
    tp2: 7425,
    r_multiple_1: 2.0,
    r_multiple_2: 3.0,
    conviction_score: 85,
    liquidity_score: 90,
    current_price: 7412,
    distance_to_entry_r: 1.27,
    created_at: baseTime,
    killzone_origin: 'ny_am',
    metadata: '{}'
  };

  await queryDb(
    `INSERT INTO mtf_style_setups (
      id, signature, trading_style, swing_mode, strategy_id, context_tf, entry_tf, instrument, market, bias,
      entry_zone_low, entry_zone_high, entry_zone_mid, stop, initial_stop, tp1, tp2,
      r_multiple_1, r_multiple_2, conviction_score, liquidity_score, killzone_origin, signal_state,
      is_breakeven, realized_r, last_price, superseded, created_at, updated_at
    ) VALUES (?, ?, 'SCALP', NULL, 'manna_scalper', '15M', '5M', 'TESTINST', 'futures', 'long', 7400, 7405, 7402.5, 7395, 7395, 7417.5, 7425, 2, 3, 85, 90, 'ny_am', 'awaiting_entry', 0, 0, 7412, 0, ?, ?)`,
    [pendingCandidate1.id, pendingCandidate1.id, baseTime, baseTime]
  );

  // Now a fresher zone forms at 7408 (still awaiting_entry -> old should be superseded)
  const pendingCandidate2: MtfStyleSetup = {
    ...pendingCandidate1,
    id: 'mtf-scalp-TESTINST-2',
    entry_zone_low: 7406,
    entry_zone_high: 7410,
    entry_zone_mid: 7408,
    stop: 7400,
    initial_stop: 7400,
    tp1: 7424,
    tp2: 7432
  };

  const board1 = await syncMtfSetupsAndGetLiveBoard('scalp', 'd1_h4', [pendingCandidate2]);
  const oldRowRows = await queryDb<TrackedMtfSetupRow>(`SELECT * FROM mtf_style_setups WHERE id = ?`, ['mtf-scalp-TESTINST-1']);
  assert.strictEqual(oldRowRows[0].signal_state, 'superseded', 'Old awaiting_entry zone must be superseded by newer zone');
  assert.strictEqual(oldRowRows[0].superseded, 1);
  assert.strictEqual(oldRowRows[0].superseded_by, 'mtf-scalp-TESTINST-2');
  assert.ok(board1.setups.some((s) => s.id === 'mtf-scalp-TESTINST-2'), 'New candidate should appear in active board');

  // Verify active setups are preserved and NEVER superseded
  await queryDb(`UPDATE mtf_style_setups SET signal_state = 'active', entry_triggered_at = ? WHERE id = ?`, [baseTime, 'mtf-scalp-TESTINST-2']);
  const pendingCandidate3: MtfStyleSetup = {
    ...pendingCandidate1,
    id: 'mtf-scalp-TESTINST-3',
    entry_zone_low: 7412,
    entry_zone_high: 7416,
    entry_zone_mid: 7414,
    stop: 7405,
    initial_stop: 7405,
    tp1: 7432,
    tp2: 7441
  };
  const board2 = await syncMtfSetupsAndGetLiveBoard('scalp', 'd1_h4', [pendingCandidate3]);
  assert.ok(board2.setups.some((s) => s.id === 'mtf-scalp-TESTINST-2'), 'Active setup must be preserved');
  assert.ok(!board2.setups.some((s) => s.id === 'mtf-scalp-TESTINST-3'), 'New candidate must not supersede active setup');
  console.log('✅ TEST 6: Pending zone superseding & active trade preservation passed');

  // TEST 7: True 80/20 Blended R Accounting & Calendar MTF Outcomes
  assert.strictEqual(computeBlendedRealizedR({ outcomeType: 'tp1_hit', rMultiple1: 2.0, rMultiple2: 3.0 }), 1.6);
  assert.strictEqual(computeBlendedRealizedR({ outcomeType: 'tp2_hit', rMultiple1: 2.0, rMultiple2: 3.0 }), 2.2);
  assert.strictEqual(computeBlendedRealizedR({ outcomeType: 'be_hit', rMultiple1: 2.0, rMultiple2: 3.0, wasRunner: false }), 0.0);
  assert.strictEqual(computeBlendedRealizedR({ outcomeType: 'be_hit', rMultiple1: 2.0, rMultiple2: 3.0, wasRunner: true }), 1.6);
  assert.strictEqual(computeBlendedRealizedR({ outcomeType: 'sl_hit', rMultiple1: 2.0, rMultiple2: 3.0 }), -1.0);
  assert.strictEqual(computeBlendedRealizedR({ outcomeType: 'tp2_hit', rMultiple1: 2.5, rMultiple2: 4.0 }), 2.8);

  const calRowId = 'mtf-swing-CALTEST-1';
  await queryDb(
    `INSERT INTO mtf_style_setups (
      id, signature, trading_style, swing_mode, strategy_id, context_tf, entry_tf,
      instrument, market, bias, entry_zone_low, entry_zone_high, entry_zone_mid,
      stop, initial_stop, tp1, tp2, r_multiple_1, r_multiple_2, conviction_score, liquidity_score,
      killzone_origin, signal_state, is_breakeven, realized_r, last_price,
      entry_triggered_at, resolved_at, outcome_type, invalidation_reason, created_at, updated_at
    ) VALUES (?, ?, 'SWING', 'd1_h4', 'manna_swing', '1D', '4H', 'EUR/USD', 'forex', 'long', 1.0800, 1.0810, 1.0805, 1.0770, 1.0770, 1.0875, 1.0910, 2, 3, 88, 92, 'london', 'resolved', 1, 2.2, 1.0912, ?, ?, 'tp2_hit', 'tp2_hit', ?, ?)`,
    [calRowId, calRowId, baseTime, baseTime, baseTime, baseTime]
  );
  const calOutcomes = await getMtfCalendarOutcomes();
  const calTrade = calOutcomes.find(o => o.setup_id === calRowId);
  assert.ok(calTrade, 'Resolved MTF trade must appear in calendar outcomes');
  assert.strictEqual(calTrade!.trading_style, 'SWING');
  assert.strictEqual(calTrade!.realized_r, 2.2, 'Calendar MTF outcome must carry blended +2.2R');
  console.log('✅ TEST 7: 80/20 Blended R Accounting & Calendar MTF Outcomes passed');

  // TEST 8: Inside-zone fill guard, TP1-only BE protection, FX 5M/Swing stop floors, and post-SL cooldown
  const eurusd5mFloor = getTimeframeStopDistance('EUR/USD', 0.0002, 0.0002, 'forex', '5m');
  assert.ok(eurusd5mFloor >= 0.00085, `FX 5M floor must protect spread (>=8.5p, got ${eurusd5mFloor})`);
  const gbpusd1hFloor = getTimeframeStopDistance('GBP/USD', 0.0008, 0.0010, 'forex', '1h');
  assert.ok(gbpusd1hFloor >= 0.0030, `Swing 1H GBP/USD floor must be >=30p (got ${gbpusd1hFloor})`);

  const outsideZoneRow = makeRow({ id: 'test-outside-zone' });
  const slightlyBelowRes = evaluateMtfRowLifecycle(
    outsideZoneRow,
    { price: 20997, bid: 20997, ask: 20997.25, spread: 0.25 },
    [{ open: 20998, high: 20999, low: 20996, close: 20997, volume: 100, timestamp: '2026-11-16T14:02:00.000Z' }],
    5.0,
    '2026-11-16T14:02:30.000Z'
  );
  assert.strictEqual(slightlyBelowRes.signal_state, 'awaiting_entry', 'Price strictly below zoneLow must NOT fill Long near SL');
  assert.strictEqual(slightlyBelowRes.entry_price_recorded, null);

  const displacedRes = evaluateMtfRowLifecycle(
    outsideZoneRow,
    { price: 20992, bid: 20992, ask: 20992.25, spread: 0.25 },
    [{ open: 20995, high: 20998, low: 20991, close: 20992, volume: 100, timestamp: '2026-11-16T14:02:00.000Z' }],
    5.0,
    '2026-11-16T14:02:30.000Z'
  );
  assert.strictEqual(displacedRes.signal_state, 'invalidated', 'Price displaced > 1x ATR below zone must invalidate pre-entry');
  assert.strictEqual(displacedRes.invalidation_reason, 'price_displaced');

  // Reaching +1.5R before TP1 must NOT choke active trade with premature BE stop
  const activeNoPrematureBe = makeRow({
    id: 'test-no-early-be',
    signal_state: 'active',
    entry_price_recorded: 21010,
    entry_triggered_at: '2026-11-16T14:02:00.000Z',
    filled_at: '2026-11-16T14:02:00.000Z',
    stop: 20985,
    initial_stop: 20985,
    tp1: 21060,
    tp2: 21085
  });
  const noEarlyBeRes = evaluateMtfRowLifecycle(
    activeNoPrematureBe,
    { price: 21012, bid: 21012, ask: 21012.25, spread: 0.25 },
    [
      // Rallies +1.6R (21010 + 40 = 21050 < tp1 21060), then pulls back near 21010 without hitting SL
      { open: 21015, high: 21050, low: 21009, close: 21012, volume: 100, timestamp: '2026-11-16T14:05:00.000Z' }
    ],
    5.0,
    '2026-11-16T14:05:30.000Z'
  );
  assert.strictEqual(noEarlyBeRes.signal_state, 'active', 'Pullback after +1.6R (pre-TP1) must remain active, not choke at BE');
  assert.strictEqual(noEarlyBeRes.is_breakeven, 0);

  // Cooldown guard after recent sl_hit on same instrument
  const recentSlAt = new Date(Date.now() - 3 * 60 * 1000).toISOString();
  await queryDb(
    `INSERT INTO mtf_style_setups (
      id, signature, trading_style, swing_mode, strategy_id, context_tf, entry_tf,
      instrument, market, bias, entry_zone_low, entry_zone_high, entry_zone_mid,
      stop, initial_stop, tp1, tp2, r_multiple_1, r_multiple_2, conviction_score, liquidity_score,
      killzone_origin, signal_state, is_breakeven, realized_r, last_price,
      entry_triggered_at, resolved_at, outcome_type, invalidation_reason, created_at, updated_at
    ) VALUES ('mtf-scalp-COOL-sl', 'mtf-scalp-COOL-sl', 'SCALP', NULL, 'manna_scalper', '15M', '5M', 'COOLINST', 'futures', 'long', 100, 101, 100.5, 95, 95, 111.5, 117, 2, 3, 85, 90, 'ny_am', 'resolved', 0, -1, 94.9, ?, ?, 'sl_hit', 'sl_hit', ?, ?)`,
    [recentSlAt, recentSlAt, recentSlAt, recentSlAt]
  );
  const cooldownCandidate: MtfStyleSetup = {
    ...pendingCandidate1,
    id: 'mtf-scalp-COOL-new',
    instrument: 'COOLINST'
  };
  const boardCooldown = await syncMtfSetupsAndGetLiveBoard('scalp', 'd1_h4', [cooldownCandidate]);
  assert.ok(!boardCooldown.setups.some((s) => s.id === 'mtf-scalp-COOL-new'), 'Cooldown must block immediate churn re-entry after sl_hit');
  console.log('✅ TEST 8: Inside-zone fills, TP1-only BE, FX/Swing stop floors, and post-SL cooldown passed');

  console.log('\n🎉 All Scalping, Swing & Chart Lifecycle tests passed!');
}

runTests()
  .catch((err) => {
    console.error('❌ Test failed:', err);
    process.exit(1);
  })
  .finally(() => {
    for (const suffix of ['', '-wal', '-shm']) {
      try {
        if (fs.existsSync(tempDbPath + suffix)) fs.unlinkSync(tempDbPath + suffix);
      } catch {}
    }
  });
