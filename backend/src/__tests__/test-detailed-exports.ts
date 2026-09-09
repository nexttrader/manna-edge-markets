import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { initializeDatabase, queryDb } from '../db/database';
import { loadDetailedTradeExcursions, buildSequenceExcursionCSV, buildCandleReplayCSV } from '../analytics/candle-excursion-service';

console.log('🧪 Testing Detailed Excursion Sequence & Candle Replay Export...\n');

const yesterday = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
const exitYesterday = new Date(Date.now() - 22 * 3600 * 1000).toISOString();

(async () => {
  await initializeDatabase();

  const testSetupId = 'snd_test_trade_01';
  const testOutcomeId = 'out_snd_test_trade_01';

  // Seed sample Manna SnD setup in edge_setups
  await queryDb(`
    INSERT INTO edge_setups (
      id, instrument, market, killzone_origin, bias,
      entry_zone_low, entry_zone_high, entry_zone_mid,
      entry_price_recorded, initial_stop, stop, tp1, tp2,
      r_multiple_1, r_multiple_2, signal_state, tradable,
      conviction_score, strategy_id, strategy_tier,
      entry_triggered_at, resolved_at, created_at
    ) VALUES (
      ?, 'NQ=F', 'futures', 'ny_am', 'long',
      29500, 29510, 29505,
      29505, 29405, 29405, 29705, 29805,
      2.0, 3.0, 'resolved', 0,
      95, 'manna_snd', 'pro',
      ?, ?, ?
    ) ON CONFLICT (id) DO UPDATE SET entry_triggered_at = ?, resolved_at = ?
  `, [testSetupId, yesterday, exitYesterday, yesterday, yesterday, exitYesterday]);

  // Seed sample outcome
  await queryDb(`
    INSERT INTO outcomes (
      id, setup_id, setup_market, outcome_type,
      execution_price, execution_time, realized_pl,
      strategy_id, created_at
    ) VALUES (
      ?, ?, 'futures', 'tp1_hit',
      29705, ?, 2.0,
      'manna_snd', ?
    ) ON CONFLICT (id) DO UPDATE SET execution_time = ?
  `, [testOutcomeId, testSetupId, exitYesterday, exitYesterday, exitYesterday]);

  // Test loadDetailedTradeExcursions
  const trades = await loadDetailedTradeExcursions('manna_snd');
  assert(trades.length >= 1, 'Should find at least 1 Manna SnD trade');

  const trade = trades.find(t => t.setup_id === testSetupId);
  assert(trade, 'Must find the seeded test trade');

  console.log('Trade Excursion Metrics:');
  console.log('  Setup ID:', trade.setup_id);
  console.log('  Outcome ID:', trade.outcome_id);
  console.log('  Direction:', trade.direction);
  console.log('  Entry Price:', trade.entry_price);
  console.log('  Initial Stop:', trade.initial_stop_price);
  console.log('  Risk Points:', trade.risk_points);
  console.log('  Half-Floor Stop Price (-0.5R):', trade.half_floor_stop_price);
  console.log('  Recalculated TP1 (+2.0R):', trade.tp1_price);
  console.log('  Recalculated TP2 (+3.0R):', trade.tp2_price);
  console.log('  MAE (R):', trade.mae_r);
  console.log('  MAE Timestamp:', trade.mae_timestamp_utc);
  console.log('  MFE (R):', trade.mfe_r);
  console.log('  MFE Timestamp:', trade.mfe_timestamp_utc);
  console.log('  MAE Occurred Before MFE:', trade.mae_occurred_before_mfe);
  console.log('  Half-Floor Breached:', trade.half_floor_stop_breached);
  console.log('  Half-Floor Breached Before TP1:', trade.half_floor_breached_before_tp1);
  console.log('  Candles Count:', trade.total_candles_count);

  assert.strictEqual(trade.setup_id, testSetupId);
  assert.strictEqual(trade.direction, 'LONG');
  assert.strictEqual(trade.risk_points, 100);
  assert.strictEqual(trade.half_floor_stop_price, 29455); // 29505 - 0.5 * 100 = 29455
  assert.strictEqual(trade.tp1_price, 29705);
  assert.strictEqual(trade.tp2_price, 29805);
  assert(trade.total_candles_count > 0, 'Should have extracted candles from historical feed');

  // Test CSV Builders
  const seqCsv = buildSequenceExcursionCSV(trades);
  const replayCsv = buildCandleReplayCSV(trades);

  const seqLines = seqCsv.split('\n').filter(l => !l.startsWith('#') && l.trim());
  const replayLines = replayCsv.split('\n').filter(l => l.trim());

  console.log('\nSequence CSV header cols:', seqLines[0]);
  console.log('Sequence CSV data row:', seqLines[1]);
  console.log('\nCandle Replay CSV header cols:', replayLines[0]);
  console.log('Candle Replay CSV sample bar row:', replayLines[1]);

  assert(seqLines[0].includes('half_floor_stop_price'), 'Sequence CSV must have half_floor_stop_price');
  assert(seqLines[0].includes('mae_timestamp_utc'), 'Sequence CSV must have mae_timestamp_utc');
  assert(seqLines[0].includes('mfe_timestamp_utc'), 'Sequence CSV must have mfe_timestamp_utc');
  assert(replayLines.length > 1, 'Replay CSV must contain minute-by-minute bar rows');

  // Clean up test data
  await queryDb(`DELETE FROM edge_setups WHERE id = ?`, [testSetupId]);
  await queryDb(`DELETE FROM outcomes WHERE id = ?`, [testOutcomeId]);

  console.log('\n✅ All Sequence & Candle Replay Export Tests Passed Successfully!');
})();
