import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.NODE_ENV = 'test';
const tmpDbPath = path.join(os.tmpdir(), `kz_weekend_guard_${Date.now()}.db`);
process.env.SQLITE_DB_PATH = tmpDbPath;
delete process.env.DATABASE_URL;

import { initializeDatabase, queryDb } from '../db/database';
import {
  getETTradingDayAndSession,
  isForexMarketOpen,
  isFuturesMarketOpen,
  isPreCutoffMtfTrade,
  isPreCutoffScalpTrade,
  isTradingSessionActive,
  isWeekendTrade,
  mapTimestampToKillzone,
} from '../scheduler/killzone-mapper';
import {
  purgePreCutoffMtfTradesFromDb,
  purgePreCutoffScalpTradesFromDb,
  purgeWeekendTradesFromDb,
} from '../db/weekend-cleanup';
import { computeBlendedRealizedR } from '../analytics/r-accounting';

async function runTests() {
  console.log('🧪 Starting Weekend Trade Guard & Calendar Sanitization Tests...\n');

  await initializeDatabase();

  // Ensure mtf_style_setups exists for cleanup test
  await queryDb(`
    CREATE TABLE IF NOT EXISTS mtf_style_setups (
      id TEXT PRIMARY KEY,
      signature TEXT,
      trading_style TEXT NOT NULL,
      swing_mode TEXT,
      strategy_id TEXT,
      context_tf TEXT NOT NULL,
      entry_tf TEXT NOT NULL,
      instrument TEXT NOT NULL,
      market TEXT NOT NULL,
      bias TEXT NOT NULL,
      entry_zone_low REAL NOT NULL,
      entry_zone_high REAL NOT NULL,
      entry_zone_mid REAL NOT NULL,
      stop REAL NOT NULL,
      initial_stop REAL,
      tp1 REAL NOT NULL,
      tp2 REAL NOT NULL,
      r_multiple_1 REAL DEFAULT 2.0,
      r_multiple_2 REAL DEFAULT 3.0,
      conviction_score REAL DEFAULT 85,
      liquidity_score REAL DEFAULT 80,
      killzone_origin TEXT DEFAULT 'ny_am',
      signal_state TEXT NOT NULL DEFAULT 'awaiting_entry',
      is_breakeven INTEGER DEFAULT 0,
      realized_r REAL DEFAULT 0,
      last_price REAL DEFAULT 0,
      entry_price_recorded REAL,
      entry_triggered_at TEXT,
      superseded INTEGER DEFAULT 0,
      superseded_by TEXT,
      invalidation_reason TEXT,
      invalidation_detail TEXT,
      execution_price REAL,
      outcome_type TEXT,
      metadata TEXT,
      filled_at TEXT,
      resolved_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  // 1. Exchange market-open vs active trading session window
  const fri1655 = new Date('2026-10-09T20:55:00Z'); // Fri 16:55 EDT
  const fri1705 = new Date('2026-10-09T21:05:00Z'); // Fri 17:05 EDT (closed)
  const sat1200 = new Date('2026-10-10T16:00:00Z'); // Sat 12:00 EDT (closed)
  const sun1200 = new Date('2026-10-11T16:00:00Z'); // Sun 12:00 EDT (closed)
  const sun1715 = new Date('2026-10-11T21:15:00Z'); // Sun 17:15 EDT (FX open, pre-Asia gap)
  const sun1830 = new Date('2026-10-11T22:30:00Z'); // Sun 18:30 EDT (FX+Futures open, pre-Asia gap)
  const sun2005 = new Date('2026-10-12T00:05:00Z'); // Sun 20:05 EDT (Monday Asia Killzone open)
  const mon1730 = new Date('2026-10-12T21:30:00Z'); // Mon 17:30 EDT (Futures daily halt)

  assert.strictEqual(isForexMarketOpen(fri1655), true);
  assert.strictEqual(isForexMarketOpen(fri1705), false);
  assert.strictEqual(isForexMarketOpen(sat1200), false);
  assert.strictEqual(isForexMarketOpen(sun1200), false);
  assert.strictEqual(isForexMarketOpen(sun1715), true);
  assert.strictEqual(isFuturesMarketOpen(sun1715), false);
  assert.strictEqual(isFuturesMarketOpen(sun1830), true);
  assert.strictEqual(isFuturesMarketOpen(mon1730), false);

  assert.strictEqual(isTradingSessionActive('both', fri1655), true, 'Fri 16:55 ET should be active');
  assert.strictEqual(isTradingSessionActive('both', fri1705), false, 'Fri 17:05 ET must be inactive');
  assert.strictEqual(isTradingSessionActive('both', sat1200), false, 'Sat 12:00 ET must be inactive');
  assert.strictEqual(isTradingSessionActive('both', sun1200), false, 'Sun 12:00 ET must be inactive');
  assert.strictEqual(isTradingSessionActive('forex', sun1715), false, 'Sun 17:15 ET pre-Asia rollover must be inactive');
  assert.strictEqual(isTradingSessionActive('both', sun1830), false, 'Sun 18:30 ET pre-Asia rollover must be inactive');
  assert.strictEqual(isTradingSessionActive('both', sun2005), true, 'Sun 20:05 ET Asia open must be active');
  assert.strictEqual(isTradingSessionActive('futures', mon1730), false, 'Mon 17:30 ET Futures halt must be inactive');
  assert.strictEqual(isTradingSessionActive('forex', mon1730), true, 'Mon 17:30 ET Forex must be active');
  console.log('✅ Test 1: Market hours & active trading session windows verified');

  // 2. Killzone mapping never labels Sunday evening as ny_pm
  assert.strictEqual(mapTimestampToKillzone(sun1715)?.killzone, 'asia', 'Sun 17:15 ET must map to asia, not ny_pm');
  assert.strictEqual(mapTimestampToKillzone(sun1830)?.killzone, 'asia', 'Sun 18:30 ET must map to asia, not ny_pm');
  assert.strictEqual(getETTradingDayAndSession(sun2005)?.tradingDay, '2026-10-12', 'Sun 20:05 ET maps to Monday 2026-10-12');
  assert.strictEqual(getETTradingDayAndSession(sun2005)?.isWeekend, false);
  assert.strictEqual(getETTradingDayAndSession(sat1200)?.isWeekend, true);
  assert.strictEqual(getETTradingDayAndSession(sun1830)?.isWeekend, true);
  console.log('✅ Test 2: Killzone & ET Trading Day mapping verified');

  // 3. Weekend trade classification
  assert.strictEqual(
    isWeekendTrade({
      instrument: 'EUR/USD',
      market: 'forex',
      time_signaled: '2026-10-10T14:00:00Z', // Sat
      time_exited: '2026-10-10T15:00:00Z',
    }),
    true,
    'Saturday Forex trade must be flagged'
  );
  assert.strictEqual(
    isWeekendTrade({
      instrument: 'NQ',
      market: 'futures',
      time_signaled: '2026-10-09T14:55:00Z', // Fri 10:55 ET
      time_entered: '2026-10-09T14:55:00Z',
      time_exited: '2026-10-11T22:39:00Z', // Sun 18:39 ET -> Sun NY PM calendar cell
    }),
    true,
    'Sunday pre-Asia exit trade must be flagged'
  );
  assert.strictEqual(
    isWeekendTrade({
      instrument: 'ES',
      market: 'futures',
      time_signaled: '2026-10-10T16:00:00Z', // Sat stale scan
      time_entered: '2026-10-10T16:00:00Z',
      time_exited: '2026-10-12T13:00:00Z', // Mon 09:00 ET
    }),
    true,
    'Trade created during Saturday closed market must be flagged even if closed Monday'
  );
  assert.strictEqual(
    isWeekendTrade({
      instrument: 'YM',
      market: 'futures',
      time_signaled: '2026-10-09T14:55:00Z', // Fri 10:55 ET
      time_entered: '2026-10-09T14:55:00Z',
      time_exited: '2026-10-12T01:21:00Z', // Sun 21:21 ET -> Mon Asia
    }),
    false,
    'Legitimate Fri entry -> Mon Asia exit trade must be preserved'
  );
  console.log('✅ Test 3: Weekend trade detection verified');

  // 4. DB Purge & Result Recomputation across Intraday, MTF, and Exclusive setups
  // Insert 1 valid Mon-Fri Intraday win (+1.60R) + 1 Saturday Intraday loss (-1.00R)
  await queryDb(
    `INSERT INTO edge_setups (id, instrument, market, created_at, killzone_origin, bias, entry_zone_low, entry_zone_high, entry_zone_mid, stop, tp1, tp2, r_multiple_1, r_multiple_2, signal_state, entry_triggered_at, resolved_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['intraday_valid', 'ES', 'futures', '2026-10-09T13:00:00Z', 'ny_am', 'long', 5800, 5802, 5801, 5790, 5823, 5834, 2.0, 3.0, 'resolved', '2026-10-09T13:10:00Z', '2026-10-09T16:00:00Z']
  );
  await queryDb(
    `INSERT INTO outcomes (id, setup_id, setup_market, outcome_type, execution_price, execution_time, realized_pl, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ['out_valid', 'intraday_valid', 'futures', 'tp1_hit', 5823, '2026-10-09T16:00:00Z', 1.6, '2026-10-09T16:00:00Z']
  );

  await queryDb(
    `INSERT INTO forex_edge_setups (id, instrument, market, created_at, killzone_origin, bias, entry_zone_low, entry_zone_high, entry_zone_mid, stop, tp1, tp2, r_multiple_1, r_multiple_2, signal_state, entry_triggered_at, resolved_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['intraday_sat_bad', 'EUR/USD', 'forex', '2026-10-10T14:00:00Z', 'ny_am', 'short', 1.10, 1.101, 1.1005, 1.102, 1.0975, 1.096, 2.0, 3.0, 'resolved', '2026-10-10T14:00:00Z', '2026-10-10T15:00:00Z']
  );
  await queryDb(
    `INSERT INTO outcomes (id, setup_id, setup_market, outcome_type, execution_price, execution_time, realized_pl, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ['out_sat_bad', 'intraday_sat_bad', 'forex', 'sl_hit', 1.102, '2026-10-10T15:00:00Z', -1.0, '2026-10-10T15:00:00Z']
  );

  // Insert 1 valid MTF trade + 1 Sunday MTF trade
  await queryDb(
    `INSERT INTO mtf_style_setups (id, trading_style, context_tf, entry_tf, instrument, market, bias, entry_zone_low, entry_zone_high, entry_zone_mid, stop, tp1, tp2, signal_state, outcome_type, realized_r, entry_triggered_at, resolved_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['mtf_valid', 'SCALP', '15M', '5M', 'NQ', 'futures', 'long', 20000, 20010, 20005, 19985, 20045, 20065, 'resolved', 'tp2_hit', 2.2, '2026-10-12T14:00:00Z', '2026-10-12T15:00:00Z', '2026-10-12T13:50:00Z', '2026-10-12T15:00:00Z']
  );
  await queryDb(
    `INSERT INTO mtf_style_setups (id, trading_style, context_tf, entry_tf, instrument, market, bias, entry_zone_low, entry_zone_high, entry_zone_mid, stop, tp1, tp2, signal_state, outcome_type, realized_r, entry_triggered_at, resolved_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['mtf_sun_bad', 'SCALP', '15M', '5M', 'GBP/USD', 'forex', 'short', 1.30, 1.301, 1.3005, 1.302, 1.2975, 1.296, 'resolved', 'sl_hit', -1.0, '2026-10-11T22:10:00Z', '2026-10-11T22:30:00Z', '2026-10-11T22:05:00Z', '2026-10-11T22:30:00Z']
  );

  // Insert 1 valid Elite Fractal trade + 1 Sunday Elite Fractal trade
  await queryDb(
    `INSERT INTO superadmin_edge_setups (id, instrument, market, created_at, killzone_origin, bias, entry_zone_low, entry_zone_high, entry_zone_mid, stop, tp1, tp2, r_multiple_1, r_multiple_2, signal_state, invalidation_reason, entry_triggered_at, resolved_at, realized_r)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['ef_valid', 'GC', 'futures', '2026-10-12T13:00:00Z', 'ny_am', 'short', 2650, 2652, 2651, 2655, 2643, 2639, 2.0, 3.0, 'resolved', 'tp1_hit', '2026-10-12T13:00:00Z', '2026-10-12T15:30:00Z', 1.6]
  );
  await queryDb(
    `INSERT INTO superadmin_edge_setups (id, instrument, market, created_at, killzone_origin, bias, entry_zone_low, entry_zone_high, entry_zone_mid, stop, tp1, tp2, r_multiple_1, r_multiple_2, signal_state, invalidation_reason, entry_triggered_at, resolved_at, realized_r)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['ef_sun_bad', 'AUD/USD', 'forex', '2026-10-11T22:05:00Z', 'ny_pm', 'short', 0.67, 0.671, 0.6705, 0.672, 0.6675, 0.666, 2.0, 3.0, 'resolved', 'sl_hit', '2026-10-11T22:05:00Z', '2026-10-11T23:08:00Z', -1.0]
  );

  const cleanup = await purgeWeekendTradesFromDb();
  assert.strictEqual(cleanup.outcomesRemoved, 1, 'Should remove 1 Saturday outcome');
  assert.strictEqual(cleanup.intradaySetupsRemoved, 1, 'Should remove 1 Saturday intraday setup');
  assert.strictEqual(cleanup.mtfSetupsRemoved, 1, 'Should remove 1 Sunday MTF setup');
  assert.strictEqual(cleanup.exclusiveSetupsRemoved, 1, 'Should remove 1 Sunday Elite Fractal setup');

  const remainingOutcomes = await queryDb<any>(`SELECT * FROM outcomes`);
  assert.strictEqual(remainingOutcomes.length, 1);
  assert.strictEqual(remainingOutcomes[0].setup_id, 'intraday_valid');
  const recomputedIntradayR = remainingOutcomes.reduce(
    (sum: number, o: any) => sum + computeBlendedRealizedR({ outcomeType: o.outcome_type, fallbackR: o.realized_pl }),
    0
  );
  assert.strictEqual(Number(recomputedIntradayR.toFixed(2)), 1.6, 'Recomputed Intraday R after weekend removal must be +1.60R');

  const remainingMtf = await queryDb<any>(`SELECT * FROM mtf_style_setups`);
  assert.strictEqual(remainingMtf.length, 1);
  assert.strictEqual(remainingMtf[0].id, 'mtf_valid');

  const remainingEf = await queryDb<any>(`SELECT * FROM superadmin_edge_setups`);
  assert.strictEqual(remainingEf.length, 1);
  assert.strictEqual(remainingEf[0].id, 'ef_valid');

  console.log('✅ Test 4: Weekend DB cleanup & recomputed results verified');

  // 5. Pre-Manna-SnD-alignment Scalping & Swing trade purge (keeps post-2026-11-19T16:15Z Manna SnD & all Intraday)
  assert.strictEqual(
    isPreCutoffMtfTrade({
      trading_style: 'SCALP',
      strategy_id: 'manna_scalper',
      time_signaled: '2026-11-18T14:00:00Z',
      time_exited: '2026-11-18T15:00:00Z',
    }),
    true,
    '2026-11-18 Scalping trade must be flagged'
  );
  assert.strictEqual(
    isPreCutoffMtfTrade({
      trading_style: 'SCALP',
      strategy_id: 'manna_scalper',
      time_signaled: '2026-11-19T14:00:00Z',
      time_exited: '2026-11-19T15:00:00Z',
    }),
    true,
    'Pre-alignment 2026-11-19T14:00Z Scalping trade must be flagged'
  );
  assert.strictEqual(
    isPreCutoffMtfTrade({
      trading_style: 'SWING',
      strategy_id: 'manna_swing',
      time_signaled: '2026-11-16T23:24:00Z',
      time_exited: '2026-11-19T09:14:00Z',
    }),
    true,
    'Pre-alignment Swing trade (Nov 16–19 before 16:15Z) must be flagged'
  );
  assert.strictEqual(
    isPreCutoffMtfTrade({
      trading_style: 'SWING',
      strategy_id: 'manna_swing',
      metadata: JSON.stringify({ source: 'mtf_isolated_desk' }),
      time_signaled: '2026-11-19T16:30:00Z',
      time_exited: '2026-11-19T16:45:00Z',
    }),
    true,
    'Legacy mtf_isolated_desk Swing trade must be flagged regardless of timestamp'
  );
  assert.strictEqual(
    isPreCutoffScalpTrade({
      trading_style: 'SCALP',
      strategy_id: 'manna_scalper',
      metadata: JSON.stringify({ source: 'mtf_isolated_desk' }),
      time_signaled: '2026-11-19T16:30:00Z',
      time_exited: '2026-11-19T16:45:00Z',
    }),
    true,
    'Legacy mtf_isolated_desk Scalping trade must be flagged by isPreCutoffScalpTrade'
  );
  assert.strictEqual(
    isPreCutoffMtfTrade({
      trading_style: 'SCALP',
      strategy_id: 'manna_scalper',
      metadata: JSON.stringify({ source: 'mtf_manna_snd', engine: 'manna_snd' }),
      time_signaled: '2026-11-19T16:25:00Z',
      time_exited: '2026-11-19T16:40:00Z',
    }),
    false,
    'Post-alignment Manna SnD Scalping trade must be preserved'
  );
  assert.strictEqual(
    isPreCutoffMtfTrade({
      trading_style: 'SWING',
      strategy_id: 'manna_swing',
      metadata: JSON.stringify({ source: 'mtf_manna_snd', engine: 'manna_snd' }),
      time_signaled: '2026-11-19T16:25:00Z',
      time_exited: '2026-11-19T18:00:00Z',
    }),
    false,
    'Post-alignment Manna SnD Swing trade must be preserved'
  );
  assert.strictEqual(
    isPreCutoffMtfTrade({
      trading_style: 'INTRADAY',
      strategy_id: 'manna_snd',
      time_signaled: '2026-10-09T13:00:00Z',
      time_exited: '2026-10-09T16:00:00Z',
    }),
    false,
    'Intraday trades before cutoff must NEVER be flagged'
  );
  assert.strictEqual(
    isPreCutoffMtfTrade({
      strategy_id: 'sentinel_v2',
      time_signaled: '2026-11-18T13:00:00Z',
      time_exited: '2026-11-18T16:00:00Z',
    }),
    false,
    'Intraday sentinel_v2 trades must NEVER be flagged'
  );

  // Add pre-alignment SCALP, legacy mtf_isolated_desk SCALP, pre-alignment SWING, plus post-alignment Manna SnD SCALP & SWING
  await queryDb(
    `INSERT INTO mtf_style_setups (id, trading_style, context_tf, entry_tf, instrument, market, bias, entry_zone_low, entry_zone_high, entry_zone_mid, stop, tp1, tp2, signal_state, outcome_type, realized_r, entry_triggered_at, resolved_at, metadata, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['mtf_scalp_pre_today', 'SCALP', '15M', '5M', 'ES', 'futures', 'long', 5900, 5902, 5901, 5895, 5913, 5919, 'resolved', 'sl_hit', -1.0, '2026-11-19T14:05:00Z', '2026-11-19T14:45:00Z', null, '2026-11-19T14:00:00Z', '2026-11-19T14:45:00Z']
  );
  await queryDb(
    `INSERT INTO mtf_style_setups (id, trading_style, context_tf, entry_tf, instrument, market, bias, entry_zone_low, entry_zone_high, entry_zone_mid, stop, tp1, tp2, signal_state, outcome_type, realized_r, entry_triggered_at, resolved_at, metadata, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['mtf_scalp_legacy_meta', 'SCALP', '15M', '5M', 'NQ', 'futures', 'long', 21000, 21005, 21002, 20980, 21046, 21068, 'resolved', 'sl_hit', -1.0, '2026-11-19T16:20:00Z', '2026-11-19T16:35:00Z', JSON.stringify({ source: 'mtf_isolated_desk' }), '2026-11-19T16:18:00Z', '2026-11-19T16:35:00Z']
  );
  await queryDb(
    `INSERT INTO mtf_style_setups (id, trading_style, swing_mode, context_tf, entry_tf, instrument, market, bias, entry_zone_low, entry_zone_high, entry_zone_mid, stop, tp1, tp2, signal_state, outcome_type, realized_r, entry_triggered_at, resolved_at, metadata, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['mtf_swing_pre_old', 'SWING', 'd1_h4', '1D', '4H', 'EUR/USD', 'forex', 'long', 1.08, 1.081, 1.0805, 1.077, 1.0875, 1.091, 'resolved', 'tp1_hit', 1.6, '2026-11-16T23:30:00Z', '2026-11-18T10:00:00Z', JSON.stringify({ source: 'mtf_isolated_desk' }), '2026-11-16T23:24:00Z', '2026-11-18T10:00:00Z']
  );
  await queryDb(
    `INSERT INTO mtf_style_setups (id, trading_style, swing_mode, context_tf, entry_tf, instrument, market, bias, entry_zone_low, entry_zone_high, entry_zone_mid, stop, tp1, tp2, signal_state, outcome_type, realized_r, entry_triggered_at, resolved_at, metadata, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['mtf_swing_pre_today', 'SWING', 'h4_h1', '4H', '1H', 'EUR/GBP', 'forex', 'short', 0.8342, 0.8345, 0.8343, 0.8365, 0.8299, 0.8277, 'resolved', 'sl_hit', -1.0, '2026-11-17T08:00:00Z', '2026-11-19T09:14:00Z', JSON.stringify({ source: 'mtf_isolated_desk' }), '2026-11-16T23:24:00Z', '2026-11-19T09:14:00Z']
  );
  await queryDb(
    `INSERT INTO mtf_style_setups (id, trading_style, context_tf, entry_tf, instrument, market, bias, entry_zone_low, entry_zone_high, entry_zone_mid, stop, tp1, tp2, signal_state, outcome_type, realized_r, entry_triggered_at, resolved_at, metadata, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['mtf_scalp_post_aligned', 'SCALP', '15M', '5M', 'ES', 'futures', 'long', 5910, 5912, 5911, 5905, 5923, 5929, 'resolved', 'tp1_hit', 1.6, '2026-11-19T16:28:00Z', '2026-11-19T16:50:00Z', JSON.stringify({ source: 'mtf_manna_snd', engine: 'manna_snd' }), '2026-11-19T16:25:00Z', '2026-11-19T16:50:00Z']
  );
  await queryDb(
    `INSERT INTO mtf_style_setups (id, trading_style, swing_mode, context_tf, entry_tf, instrument, market, bias, entry_zone_low, entry_zone_high, entry_zone_mid, stop, tp1, tp2, signal_state, outcome_type, realized_r, entry_triggered_at, resolved_at, metadata, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['mtf_swing_post_aligned', 'SWING', 'd1_h4', '1D', '4H', 'GBP/USD', 'forex', 'long', 1.2600, 1.2610, 1.2605, 1.2560, 1.2695, 1.2740, 'resolved', 'tp1_hit', 1.6, '2026-11-19T16:30:00Z', '2026-11-19T18:00:00Z', JSON.stringify({ source: 'mtf_manna_snd', engine: 'manna_snd' }), '2026-11-19T16:25:00Z', '2026-11-19T18:00:00Z']
  );

  // Also test purgePreCutoffScalpTradesFromDb backward-compat keeps working for SCALP-only
  const scalpOnlyCleanup = await purgePreCutoffScalpTradesFromDb();
  assert.strictEqual(scalpOnlyCleanup.scalpMtfRemoved, 3, 'Should remove 3 pre-alignment SCALP rows (mtf_valid, mtf_scalp_pre_today, mtf_scalp_legacy_meta)');

  const mtfCleanup = await purgePreCutoffMtfTradesFromDb();
  assert.strictEqual(mtfCleanup.swingMtfRemoved, 2, 'Should remove both pre-alignment SWING rows (mtf_swing_pre_old, mtf_swing_pre_today)');
  const mtfAfterCleanup = await queryDb<any>(`SELECT id FROM mtf_style_setups ORDER BY id`);
  assert.deepStrictEqual(
    mtfAfterCleanup.map((r: any) => r.id),
    ['mtf_scalp_post_aligned', 'mtf_swing_post_aligned'],
    'Must preserve post-alignment Manna SnD SCALP & SWING trades'
  );
  const intradayAfterCleanup = await queryDb<any>(`SELECT id FROM edge_setups`);
  assert.strictEqual(intradayAfterCleanup.length, 1, 'Intraday setup must remain untouched');
  const intradayOutcomesAfterCleanup = await queryDb<any>(`SELECT id FROM outcomes`);
  assert.strictEqual(intradayOutcomesAfterCleanup.length, 1, 'Intraday outcome must remain untouched');
  console.log('✅ Test 5: Pre-alignment Scalping & Swing purge + post-alignment & Intraday preservation verified');
  console.log('\n🎉 ALL WEEKEND TRADE GUARD TESTS PASSED!');
}

runTests()
  .catch((err) => {
    console.error('❌ Test failed:', err);
    process.exitCode = 1;
  })
  .finally(() => {
    for (const f of [tmpDbPath, `${tmpDbPath}-wal`, `${tmpDbPath}-shm`]) {
      if (fs.existsSync(f)) {
        try { fs.unlinkSync(f); } catch {}
      }
    }
  });
