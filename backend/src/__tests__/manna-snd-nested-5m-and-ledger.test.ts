import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';

// Isolate test database in os.tmpdir() before importing database modules
const tempDbPath = path.join(os.tmpdir(), `manna-snd-t4-ledger-test-${Date.now()}.db`);
process.env.SQLITE_DB_PATH = tempDbPath;
delete process.env.DATABASE_URL;

import { initializeDatabase, queryDb } from '../db/database';
import { MannaSndStrategy } from '../discovery/strategies/manna-snd';
import type { Candle, KillzoneInfo } from '../discovery/types';
import { ensureMtfTrackerTable } from '../discovery/mtf-style-tracker';
import {
  formatDailyLedgerCsv,
  getDailyLedgerDays,
  getDailyTradeLedger,
  getPublicRecordWall,
  getPublicRecordWallDay,
  publishDayToRecordWall,
  resetDailyRecordWallCache,
  setRecordWallGlobalConfig,
  unpublishDayFromRecordWall,
} from '../analytics/daily-ledger-service';

function make1hCurveCandles(): Candle[] {
  const candles: Candle[] = [];
  const baseTs = Date.parse('2026-11-18T00:00:00.000Z') - 40 * 3600_000;

  // Build 30 1H candles with a strong 1H Demand zone around 1.0950-1.0965
  // and a strong 1H Supply zone around 1.1150-1.1165
  for (let i = 0; i < 30; i++) {
    const ts = new Date(baseTs + i * 3600_000).toISOString();
    if (i === 2) {
      // Leg down into 1H demand base
      candles.push({ timestamp: ts, open: 1.1020, high: 1.1025, low: 1.0955, close: 1.0960, volume: 1000 });
    } else if (i === 3) {
      // 1H base candle (Demand distal=1.0950, proximal=1.0962)
      candles.push({ timestamp: ts, open: 1.0958, high: 1.0965, low: 1.0950, close: 1.0962, volume: 900 });
    } else if (i === 4) {
      // Strong bullish leg-out (> 1.0x base range)
      candles.push({ timestamp: ts, open: 1.0962, high: 1.1045, low: 1.0960, close: 1.1040, volume: 2200 });
    } else if (i === 12) {
      // Rally into 1H supply base
      candles.push({ timestamp: ts, open: 1.1080, high: 1.1160, low: 1.1075, close: 1.1155, volume: 1500 });
    } else if (i === 13) {
      // 1H supply base (Supply proximal=1.1152, distal=1.1168)
      candles.push({ timestamp: ts, open: 1.1155, high: 1.1168, low: 1.1150, close: 1.1152, volume: 900 });
    } else if (i === 14) {
      // Strong bearish leg-out from 1H supply
      candles.push({ timestamp: ts, open: 1.1152, high: 1.1155, low: 1.1010, close: 1.1015, volume: 2100 });
    } else {
      // Neutral candles strictly inside [1.0970, 1.1030] so both 1H demand and 1H supply stay fresh
      candles.push({
        timestamp: ts,
        open: 1.0995,
        high: 1.1008,
        low: 1.0990,
        close: 1.1002,
        volume: 1100,
      });
    }
  }
  return candles;
}

function make15mBullishCandles(): Candle[] {
  const candles: Candle[] = [];
  const baseTs = Date.parse('2026-11-18T08:00:00.000Z');

  // 25 15M candles in an uptrend with a fresh RBR Demand Zone at index 18:
  // baseLow (distal) = 1.09950, bodyProximal = 1.10000, baseHigh = 1.10020
  for (let i = 0; i < 25; i++) {
    const ts = new Date(baseTs + i * 15 * 60_000).toISOString();
    if (i < 17) {
      const level = 1.09750 + i * 0.00010;
      candles.push({
        timestamp: ts,
        open: level,
        high: level + 0.00070,
        low: level - 0.00020,
        close: level + 0.00050,
        volume: 1000,
      });
    } else if (i === 17) {
      // Leg-up candle before base (close > open, body > 50% range)
      candles.push({
        timestamp: ts,
        open: 1.09910,
        high: 1.09995,
        low: 1.09905,
        close: 1.09990,
        volume: 1300,
      });
    } else if (i === 18) {
      // Base candle (body <= 50% of range):
      // range = 1.10020 - 1.09950 = 0.00070 (7 pips), body = 1.10000 - 1.09980 = 0.00020 (28.5% <= 50%)
      // bodyProximal = 1.10000, distal = 1.09950
      candles.push({
        timestamp: ts,
        open: 1.09980,
        high: 1.10020,
        low: 1.09950,
        close: 1.10000,
        volume: 900,
      });
    } else if (i === 19) {
      // Departure leg-out candle: gain from baseHigh (1.10020) > 1.0 * 0.00070 -> high = 1.10110
      candles.push({
        timestamp: ts,
        open: 1.10000,
        high: 1.10110,
        low: 1.09995,
        close: 1.10100,
        volume: 1800,
      });
    } else {
      // Subsequent candles stay above 1.10040 so 15M zone [1.09950, 1.10000] remains 100% fresh
      // and higher highs / higher lows maintain 15M uptrend
      const step = (i - 20) * 0.00010;
      candles.push({
        timestamp: ts,
        open: 1.10090 + step,
        high: 1.10150 + step,
        low: 1.10075 + step,
        close: 1.10135 + step,
        volume: 1200,
      });
    }
  }
  return candles;
}

function make5mContinuationCandles(includeFreshZone: boolean): Candle[] {
  const candles: Candle[] = [];
  // End 20 minutes in the past so all bars are closed
  const baseTs = Date.parse('2026-11-18T11:00:00.000Z');

  for (let i = 0; i < 20; i++) {
    const ts = new Date(baseTs + i * 5 * 60_000).toISOString();
    if (!includeFreshZone) {
      // Flat chop with no valid leg-out imbalance
      candles.push({
        timestamp: ts,
        open: 1.10110,
        high: 1.10118,
        low: 1.10105,
        close: 1.10112,
        volume: 500,
      });
      continue;
    }

    if (i < 12) {
      const lvl = 1.10010 + i * 0.00004;
      candles.push({
        timestamp: ts,
        open: lvl,
        high: lvl + 0.00025,
        low: lvl - 0.00010,
        close: lvl + 0.00015,
        volume: 600,
      });
    } else if (i === 12) {
      // Bullish leg-in candle (body > 50% range)
      candles.push({
        timestamp: ts,
        open: 1.10050,
        high: 1.10085,
        low: 1.10048,
        close: 1.10082,
        volume: 850,
      });
    } else if (i === 13) {
      // 5M base candle:
      // baseLow (distal) = 1.10055, bodyProximal = 1.10080, baseHigh (wick proximal) = 1.10095
      // range = 0.00040 (4 pips), body = 1.10080 - 1.10070 = 0.00010 (25% <= 50%)
      candles.push({
        timestamp: ts,
        open: 1.10070,
        high: 1.10095,
        low: 1.10055,
        close: 1.10080,
        volume: 500,
      });
    } else if (i === 14) {
      // Bullish leg-out candle (> 1.0x 0.00040 above 1.10095 -> high 1.10150)
      candles.push({
        timestamp: ts,
        open: 1.10082,
        high: 1.10150,
        low: 1.10080,
        close: 1.10142,
        volume: 1400,
      });
    } else {
      // Subsequent candles hold above 1.10115 so 5M zone stays fresh
      candles.push({
        timestamp: ts,
        open: 1.10125,
        high: 1.10145,
        low: 1.10118,
        close: 1.10132,
        volume: 700,
      });
    }
  }
  return candles;
}

async function runTests() {
  console.log('🧪 Starting Manna SnD Option A (T4) & Daily Ledger / Record Wall Verification...');

  await initializeDatabase();
  await ensureMtfTrackerTable();
  resetDailyRecordWallCache();

  const strategy = new MannaSndStrategy();
  const killzone: KillzoneInfo = {
    killzone: 'ny_am',
    name: 'NY_AM',
    boundaryET: '08:00',
    boundaryUTC: '2026-11-18T13:00:00.000Z',
  };

  const candles1h = make1hCurveCandles();
  const candles15m = make15mBullishCandles();
  const candles5mWithZone = make5mContinuationCandles(true);
  const candles5mEmpty = make5mContinuationCandles(false);

  // =========================================================================
  // 1. TEST CASE A: Close 15M Zone (< 0.50 progress to TP1) is protected untouched
  // =========================================================================
  {
    const closeCandidates = await strategy.evaluateSetupsForTimeframes(
      killzone,
      'run-close-15m',
      'forex',
      ['EUR/USD'],
      { 'EUR/USD': 'long' },
      {
        htf: '1h',
        ltf: '15m',
        candleFetcher: async (_inst, tf) => {
          if (tf === '1h') return candles1h;
          if (tf === '15m') return candles15m;
          return candles5mWithZone;
        },
        // 15M entry is 1.10000, risk is ~0.00100 -> TP1 is ~1.10200.
        // At currentPrice = 1.10045, progress to TP1 is ~22.5% (< 50%).
        priceFetcher: async () => 1.10045,
      }
    );

    assert.strictEqual(closeCandidates.length, 1, 'Close 15M zone should be published');
    const c = closeCandidates[0];
    const meta = JSON.parse(c.metadata || '{}');
    assert.strictEqual(c.entry_zone_mid, 1.1, 'Close 15M setup must preserve 15M body proximal (1.10000)');
    assert.strictEqual(meta.nested_5m_upgrade, false, 'Close 15M setup must NOT trigger 5M upgrade');
    assert.strictEqual(meta.zone_timeframe, '15M', 'Zone timeframe must remain 15M');
    console.log('  ✅ Case 1 passed: Close 15M zone (< 50% progress to TP1) preserved at 15M body proximal.');
  }

  // =========================================================================
  // 2. TEST CASE B: Extended 15M Zone (>= 0.50 progress to TP1) upgrades to 5M Wick + Spread
  // =========================================================================
  {
    const upgradedCandidates = await strategy.evaluateSetupsForTimeframes(
      killzone,
      'run-upgrade-5m',
      'forex',
      ['EUR/USD'],
      { 'EUR/USD': 'long' },
      {
        htf: '1h',
        ltf: '15m',
        candleFetcher: async (_inst, tf) => {
          if (tf === '1h') return candles1h;
          if (tf === '15m') return candles15m;
          return candles5mWithZone;
        },
        // At currentPrice = 1.10135, 15M progress to TP1 (~1.10200) is > 50%,
        // triggering 5M continuation upgrade (5M baseHigh = 1.10095 + 0.00010 EUR/USD spread = 1.10105)
        priceFetcher: async () => 1.10135,
      }
    );

    assert.strictEqual(upgradedCandidates.length, 1, 'Upgraded 5M continuation setup should qualify and pass <= 0.55 gate');
    const c = upgradedCandidates[0];
    const meta = JSON.parse(c.metadata || '{}');
    // 5M wick proximal = 1.10095 + EUR/USD spread 0.00008 = 1.10103
    assert.strictEqual(c.entry_zone_mid, 1.10103, 'Upgraded Long setup must use 5M wick proximal (1.10095) + spread (0.00008)');
    assert.strictEqual(c.entry_zone_high, 1.10103, 'Entry zone high must match padded 5M wick proximal');
    assert.strictEqual(c.entry_zone_low, 1.10055, 'Entry zone low must match 5M distal (1.10055)');
    assert.strictEqual(meta.nested_5m_upgrade, true, 'Metadata must flag nested_5m_upgrade = true');
    assert.strictEqual(meta.zone_timeframe, '5M', 'Metadata zone_timeframe must be 5M');
    assert.strictEqual(meta.ltf, '5M', 'Metadata ltf must be 5M so chart modal plots 5M candles');
    assert.strictEqual(meta.parent_15m_proximal, 1.1, 'Metadata must record parent 15M proximal');
    assert.strictEqual(meta.spread_pad_applied, 0.00008, 'Metadata must record spread pad applied');
    assert.ok(meta.progress_to_tp1_pct <= 55, `Upgraded progress (${meta.progress_to_tp1_pct}%) must be <= 55%`);
    console.log('  ✅ Case 2 passed: Extended 15M setup (>= 50% to TP1) upgraded to 5M wick proximal + spread.');
  }

  // =========================================================================
  // 3. TEST CASE C: Over-extended 15M Zone (> 0.55 to TP1) without 5M zone is dropped
  // =========================================================================
  {
    const droppedCandidates = await strategy.evaluateSetupsForTimeframes(
      killzone,
      'run-drop-extended',
      'forex',
      ['EUR/USD'],
      { 'EUR/USD': 'long' },
      {
        htf: '1h',
        ltf: '15m',
        candleFetcher: async (_inst, tf) => {
          if (tf === '1h') return candles1h;
          if (tf === '15m') return candles15m;
          return candles5mEmpty;
        },
        // At 1.10150 without a 5M continuation zone, progress to TP1 is > 55% -> dropped!
        priceFetcher: async () => 1.10150,
      }
    );

    assert.strictEqual(
      droppedCandidates.length,
      0,
      'Over-extended setup (> 55% to TP1) with no 5M continuation zone must be filtered out before publish'
    );
    console.log('  ✅ Case 3 passed: Over-extended setup (> 55% to TP1) without 5M zone dropped cleanly.');
  }

  // =========================================================================
  // 4. TEST CASE D: Daily Published Trades Ledger, Superseded Chains & Record Wall
  // =========================================================================
  {
    const dayIso = '2026-11-18T14:30:00.000Z'; // 09:30 ET on 2026-11-18

    // 1) Forex Winner (TP2 Hit -> +2.20R) that superseded an earlier EUR/USD setup
    await queryDb(
      `INSERT INTO forex_edge_setups
        (id, instrument, market, created_at, killzone_origin, bias, entry_zone_low, entry_zone_high, entry_zone_mid, entry_price_executed, stop, tp1, tp2, r_multiple_1, r_multiple_2, signal_state, superseded, conviction_score, strategy_id, metadata, resolved_at)
       VALUES (?, 'EUR/USD', 'forex', ?, 'NY Morning', 'long', 1.10055, 1.10105, 1.10105, 1.10105, 1.10005, 1.10305, 1.10405, 2.0, 3.0, 'resolved', 0, 88, 'manna_snd', ?, '2026-11-18T16:10:00.000Z')`,
      [
        'f9a1b2c3-1111-4444-8888-000000000001',
        dayIso,
        JSON.stringify({ strategy_name: 'Manna SnD', zone_timeframe: '5M', nested_5m_upgrade: true }),
      ]
    );
    await queryDb(
      `INSERT INTO outcomes (id, setup_id, setup_market, outcome_type, execution_price, execution_time, realized_pl, was_runner, created_at)
       VALUES ('out-1', 'f9a1b2c3-1111-4444-8888-000000000001', 'forex', 'tp2_hit', 1.10405, '2026-11-18T16:10:00.000Z', 2.2, 1, '2026-11-18T16:10:00.000Z')`
    );

    // 2) Earlier EUR/USD setup that was SUPERSEDED by f9a1b2c3-1111-4444-8888-000000000001
    await queryDb(
      `INSERT INTO forex_edge_setups
        (id, instrument, market, created_at, killzone_origin, bias, entry_zone_low, entry_zone_high, entry_zone_mid, stop, tp1, tp2, r_multiple_1, r_multiple_2, signal_state, superseded, superseded_by, invalidation_reason, invalidation_detail, conviction_score, strategy_id, metadata, resolved_at)
       VALUES (?, 'EUR/USD', 'forex', '2026-11-18T13:15:00.000Z', 'NY Morning', 'long', 1.09950, 1.10000, 1.10000, 1.09900, 1.10200, 1.10300, 2.0, 3.0, 'invalidated', 1, 'f9a1b2c3-1111-4444-8888-000000000001', 'superseded', 'Replaced by 5M continuation zone', 81, 'manna_snd', '{}', '2026-11-18T14:30:00.000Z')`,
      ['a1b2c3d4-0000-4444-8888-000000000002']
    );

    // 3) Futures Winner (TP1 Hit -> +1.60R)
    await queryDb(
      `INSERT INTO edge_setups
        (id, instrument, market, created_at, killzone_origin, bias, entry_zone_low, entry_zone_high, entry_zone_mid, entry_price_executed, stop, tp1, tp2, r_multiple_1, r_multiple_2, signal_state, superseded, conviction_score, strategy_id, metadata, resolved_at)
       VALUES ('c3d4e5f6-2222-4444-8888-000000000003', 'NQ', 'futures', ?, 'NY Morning', 'long', 20500, 20510, 20510, 20510, 20475, 20580, 20615, 2.0, 3.0, 'resolved', 0, 91, 'manna_snd', '{}', '2026-11-18T15:40:00.000Z')`,
      [dayIso]
    );
    await queryDb(
      `INSERT INTO outcomes (id, setup_id, setup_market, outcome_type, execution_price, execution_time, realized_pl, was_runner, created_at)
       VALUES ('out-3', 'c3d4e5f6-2222-4444-8888-000000000003', 'futures', 'tp1_hit', 20580, '2026-11-18T15:40:00.000Z', 1.6, 0, '2026-11-18T15:40:00.000Z')`
    );

    // 4) Forex Stop-Loss (SL Hit -> -1.00R)
    await queryDb(
      `INSERT INTO forex_edge_setups
        (id, instrument, market, created_at, killzone_origin, bias, entry_zone_low, entry_zone_high, entry_zone_mid, entry_price_executed, stop, tp1, tp2, r_multiple_1, r_multiple_2, signal_state, superseded, conviction_score, strategy_id, metadata, resolved_at)
       VALUES ('d4e5f6a7-3333-4444-8888-000000000004', 'GBP/USD', 'forex', ?, 'London Open', 'short', 1.26500, 1.26550, 1.26500, 1.26500, 1.26620, 1.26260, 1.26140, 2.0, 3.0, 'resolved', 0, 77, 'manna_snd', '{}', '2026-11-18T15:00:00.000Z')`,
      [dayIso]
    );
    await queryDb(
      `INSERT INTO outcomes (id, setup_id, setup_market, outcome_type, execution_price, execution_time, realized_pl, was_runner, created_at)
       VALUES ('out-4', 'd4e5f6a7-3333-4444-8888-000000000004', 'forex', 'sl_hit', 1.26620, '2026-11-18T15:00:00.000Z', -1.0, 0, '2026-11-18T15:00:00.000Z')`
    );

    // 5) Futures Pre-Entry Invalidated (non-superseded)
    await queryDb(
      `INSERT INTO edge_setups
        (id, instrument, market, created_at, killzone_origin, bias, entry_zone_low, entry_zone_high, entry_zone_mid, stop, tp1, tp2, r_multiple_1, r_multiple_2, signal_state, superseded, invalidation_reason, conviction_score, strategy_id, metadata, resolved_at)
       VALUES ('e5f6a7b8-4444-4444-8888-000000000005', 'ES', 'futures', ?, 'NY Morning', 'long', 5910, 5912, 5912, 5902, 5932, 5942, 2.0, 3.0, 'invalidated', 0, 'target_reached_pre_entry', 75, 'manna_snd', '{}', '2026-11-18T15:20:00.000Z')`,
      [dayIso]
    );

    // 6) MTF Scalp Winner (+1.60R)
    await queryDb(
      `INSERT INTO mtf_style_setups
        (id, signature, trading_style, strategy_id, context_tf, entry_tf, instrument, market, bias, entry_zone_low, entry_zone_high, entry_zone_mid, stop, tp1, tp2, r_multiple_1, r_multiple_2, conviction_score, liquidity_score, killzone_origin, signal_state, realized_r, outcome_type, superseded, created_at, updated_at, resolved_at)
       VALUES ('b7c8d9e0-5555-4444-8888-000000000006', 'sig-gc-scalp-1', 'SCALP', 'manna_snd_scalp', '15m', '5m', 'GC', 'futures', 'long', 2650.0, 2651.5, 2651.5, 2644.0, 2666.5, 2674.0, 2.0, 3.0, 86, 80, 'NY Morning', 'resolved', 1.6, 'tp1_hit', 0, ?, ?, '2026-11-18T15:55:00.000Z')`,
      [dayIso, dayIso]
    );

    const ledger = await getDailyTradeLedger({ day: '2026-11-18' });
    assert.strictEqual(ledger.tradingDay, '2026-11-18');
    assert.strictEqual(ledger.summary.totalPublished, 6, 'Should include all 6 published setups');
    assert.strictEqual(ledger.summary.resolvedTrades, 4, 'Should have 4 filled & resolved trades');
    assert.strictEqual(ledger.summary.wins, 3, 'Should have 3 wins');
    assert.strictEqual(ledger.summary.losses, 1, 'Should have 1 loss');
    assert.strictEqual(ledger.summary.winRate, 75.0, 'Win rate should be 75.0%');
    assert.strictEqual(ledger.summary.totalRealizedR, 4.4, 'Total Realized R should be 2.2 + 1.6 - 1.0 + 1.6 = +4.40R');
    assert.strictEqual(ledger.summary.supersededCount, 1, 'Should track 1 superseded trade');
    assert.strictEqual(ledger.summary.invalidatedCount, 1, 'Should track 1 non-superseded pre-entry invalidated trade');

    const supTrade = ledger.trades.find((t) => t.id === 'a1b2c3d4-0000-4444-8888-000000000002');
    assert.ok(supTrade, 'Superseded trade must be present in ledger');
    assert.strictEqual(supTrade!.statusCategory, 'superseded');
    assert.strictEqual(supTrade!.superseded, true);
    assert.strictEqual(
      supTrade!.supersededByTradeId,
      '#EURUSD-F9A1',
      'Superseded trade must resolve superseded_by to #EURUSD-F9A1'
    );

    // Filter strictly by superseded
    const supOnly = await getDailyTradeLedger({ day: '2026-11-18', status: 'superseded' });
    assert.strictEqual(supOnly.trades.length, 1);
    assert.strictEqual(supOnly.trades[0].id, 'a1b2c3d4-0000-4444-8888-000000000002');

    // CSV export check
    const csv = formatDailyLedgerCsv(ledger);
    const csvLines = csv.trim().split('\n');
    assert.strictEqual(csvLines.length, 7, 'CSV must have 1 header line + 6 trade rows');
    assert.ok(csv.includes('#EURUSD-F9A1'), 'CSV must include replacement Trade ID #EURUSD-F9A1');
    assert.ok(csv.includes('-1.00'), 'CSV must preserve negative realized R (-1.00) as numeric');

    // Record Wall Governance: unpublished by default
    const wallBefore = await getPublicRecordWall();
    assert.strictEqual(wallBefore.publishedDayCount, 0, 'No days published on Record Wall initially');
    assert.strictEqual(wallBefore.days.length, 0);

    // Publish 2026-11-18 to Record Wall
    const pubRes = await publishDayToRecordWall({
      day: '2026-11-18',
      adminEmail: 'chadwinsolomon@gmail.com',
      title: 'Verified NY & London Session Ledger',
      adminNotes: 'Includes 5M continuation upgrade on EUR/USD (+2.20R)',
    });
    assert.strictEqual(pubRes.publication.status, 'published');

    const wallLive = await getPublicRecordWall();
    assert.strictEqual(wallLive.enabled, true);
    assert.strictEqual(wallLive.publishedDayCount, 1);
    assert.strictEqual(wallLive.overallStats.totalRealizedR, 4.4);
    assert.strictEqual(wallLive.overallStats.supersededCount, 1);
    assert.strictEqual(wallLive.ledger?.trades.length, 6);
    assert.strictEqual(wallLive.ledger?.publication.adminNotes, 'Includes 5M continuation upgrade on EUR/USD (+2.20R)');

    // Global Record Wall OFF switch hides public wall
    await setRecordWallGlobalConfig(false, 'chadwinsolomon@gmail.com');
    const wallDisabled = await getPublicRecordWall();
    assert.strictEqual(wallDisabled.enabled, false);
    assert.strictEqual(wallDisabled.days.length, 0);

    // Re-enable global wall, then unpublish the specific day
    await setRecordWallGlobalConfig(true, 'chadwinsolomon@gmail.com');
    await unpublishDayFromRecordWall('2026-11-18', 'chadwinsolomon@gmail.com');
    const dayAfterUnpub = await getPublicRecordWallDay('2026-11-18');
    assert.strictEqual(dayAfterUnpub.published, false);
    assert.strictEqual(dayAfterUnpub.ledger, null);

    const daysIdx = await getDailyLedgerDays(30);
    const nov18 = daysIdx.days.find((d) => d.tradingDay === '2026-11-18');
    assert.ok(nov18);
    assert.strictEqual(nov18!.publicationStatus, 'unpublished');

    console.log('  ✅ Case 4 passed: Daily Ledger, Superseded Chain Resolution, CSV Export & Record Wall Governance verified.');
  }

  console.log('🎉 ALL MANNA SND OPTION A (T4) & DAILY LEDGER / RECORD WALL TESTS PASSED!');
}

runTests()
  .catch((err) => {
    console.error('❌ Test failed:', err);
    process.exitCode = 1;
  })
  .finally(() => {
    try {
      if (fs.existsSync(tempDbPath)) fs.unlinkSync(tempDbPath);
    } catch {
      // ignore temp cleanup errors
    }
  });
