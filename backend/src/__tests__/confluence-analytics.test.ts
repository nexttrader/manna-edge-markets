import assert from 'assert';
import express from 'express';
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';

// Isolate test database so repo killzone.db stays untouched
const tmpDbPath = path.join(os.tmpdir(), `confluence_test_${Date.now()}.db`);
process.env.NODE_ENV = 'test';
process.env.SQLITE_DB_PATH = tmpDbPath;

import { initializeDatabase, queryDb } from '../db/database';
import edgeFinderRoutes from '../api/edge-finder-routes';
import {
  clearEdgeFinderCaches,
  getConfluenceAnalyticsRollout,
  canRoleAccessConfluenceAnalytics,
  AssetEdgeScorecard
} from '../edge-finder/edge-finder-service';
import {
  computeSignalCardConfluence,
  fisherExactTwoSided,
  getConfluencePerformanceReport,
  studentTTwoSidedPValue,
  upsertSignalConfluenceLog,
  wilsonScoreInterval95
} from '../edge-finder/confluence-analytics';

function makeMockScorecard(
  instrument: string,
  scalpScore: number,
  intradayScore: number,
  swingScore: number
): AssetEdgeScorecard {
  const classify = (s: number) =>
    s >= 3.5 ? 'Strong Buy' : s >= 0.75 ? 'Buy' : s <= -3.5 ? 'Strong Sell' : s <= -0.75 ? 'Sell' : 'Neutral';
  const makeProf = (horizon: 'SCALP' | 'INTRADAY' | 'SWING', score: number) => ({
    horizon,
    label: horizon,
    executionTimeframes: 'M15',
    holdDuration: '2h',
    score,
    biasLabel: classify(score) as any,
    confidencePct: 80,
    trendPrimary: 'Bullish' as const,
    trendConfirm: 'Bullish' as const,
    rsi: 55,
    adrUsedPct: 40,
    adrWarning: false,
    htfConfluence: 'ALIGNED' as const,
    weightsSummary: 'test',
    actionNote: 'test action note'
  });

  return {
    instrument,
    displayName: instrument,
    assetClass: instrument.includes('/') ? 'forex' : 'futures',
    category: 'Test',
    baseCurrency: 'EUR',
    quoteCurrency: 'USD',
    currentPrice: 1.1,
    dailyChangePct: 0.1,
    priceSource: 'LIVE',
    totalScore: swingScore,
    biasLabel: classify(swingScore) as any,
    timeframes: {
      SCALP: makeProf('SCALP', scalpScore),
      INTRADAY: makeProf('INTRADAY', intradayScore),
      SWING: makeProf('SWING', swingScore)
    },
    timeframeConfluence: {
      allAligned: false,
      alignedCount: 1,
      summary: 'test',
      dominantBias: classify(intradayScore) as any
    },
    cotScore: 0,
    retailScore: 0,
    seasonalityScore: 0,
    trendScore: 0,
    fundamentalScore: 0,
    mannaFlowScore: 0,
    factors: [],
    tugOfWar: [],
    technical: {} as any,
    cot: {} as any,
    retailSentiment: {} as any,
    seasonality: {} as any,
    killzoneAlignment: {} as any,
    historicalSeries: []
  };
}

async function startTestServer(): Promise<{ server: http.Server; baseUrl: string }> {
  const app = express();
  app.use(express.json());
  app.use('/api/edge-finder', edgeFinderRoutes);

  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const addr = server.address() as { port: number };
      resolve({ server, baseUrl: `http://127.0.0.1:${addr.port}/api/edge-finder` });
    });
  });
}

async function runTests() {
  await initializeDatabase();
  clearEdgeFinderCaches();

  console.log('1. Testing all 5 Signal Card EdgeFinder Confluence badge classifications...');
  const strongSc = makeMockScorecard('EUR/USD', 2.4, 2.1, 1.8);
  const strongRes = computeSignalCardConfluence('long', strongSc);
  assert.strictEqual(strongRes.categoryKey, 'STRONG_CONFLUENCE');
  assert.strictEqual(strongRes.badgeText, 'STRONG CONFLUENCE (3/3 TF)');
  assert.strictEqual(strongRes.agreesWithEdgeFinder, true);

  const agreesSc = makeMockScorecard('ES', 0.1, 1.4, 1.1);
  const agreesRes = computeSignalCardConfluence('long', agreesSc);
  assert.strictEqual(agreesRes.categoryKey, 'EDGEFINDER_AGREES');
  assert.strictEqual(agreesRes.badgeText, 'EDGEFINDER AGREES');
  assert.strictEqual(agreesRes.agreesWithEdgeFinder, true);

  const partialSc = makeMockScorecard('NQ', 1.2, 0.1, 0.0);
  const partialRes = computeSignalCardConfluence('long', partialSc);
  assert.strictEqual(partialRes.categoryKey, 'PARTIAL_CONFLUENCE');
  assert.strictEqual(partialRes.badgeText, 'PARTIAL CONFLUENCE');
  assert.strictEqual(partialRes.agreesWithEdgeFinder, true);

  const neutralSc = makeMockScorecard('GC', 0.2, 0.0, -0.1);
  const neutralRes = computeSignalCardConfluence('long', neutralSc);
  assert.strictEqual(neutralRes.categoryKey, 'EDGEFINDER_NEUTRAL');
  assert.strictEqual(neutralRes.badgeText, 'EDGEFINDER NEUTRAL');
  assert.strictEqual(neutralRes.agreesWithEdgeFinder, false);

  const counterSc = makeMockScorecard('GBP/USD', -1.8, -2.0, -1.5);
  const counterRes = computeSignalCardConfluence('long', counterSc);
  assert.strictEqual(counterRes.categoryKey, 'COUNTER_MACRO_BIAS');
  assert.strictEqual(counterRes.badgeText, 'COUNTER MACRO BIAS');
  assert.strictEqual(counterRes.agreesWithEdgeFinder, false);

  console.log('2. Testing statistical & mathematical proof primitives (Wilson CI, Student t, Fisher Exact)...');
  const wCi = wilsonScoreInterval95(15, 20);
  assert(wCi.lowPct > 50 && wCi.highPct < 92, `Unexpected Wilson CI for 15/20: ${JSON.stringify(wCi)}`);
  const tP = studentTTwoSidedPValue(2.262, 9); // t_{0.025, 9} ≈ 2.262
  assert(Math.abs(tP - 0.05) < 0.002, `Expected Student t p ≈ 0.05, got ${tP}`);
  const fP = fisherExactTwoSided(12, 2, 2, 12);
  assert(fP !== null && fP < 0.001, `Expected Fisher p < 0.001 for 12/14 vs 2/14, got ${fP}`);

  console.log('3. Seeding controlled November 2026 signals + outcomes and verifying comparative mathematical proof...');
  // Insert 12 Strong Confluence wins + 2 losses (in edge_setups / forex_edge_setups / mtf_style_setups)
  for (let i = 0; i < 14; i++) {
    const id = `nov_strong_${i}`;
    const isWin = i < 12;
    const day = String(2 + (i % 15)).padStart(2, '0');
    const createdAt = `2026-11-${day}T13:30:00.000Z`;
    await queryDb(
      `INSERT INTO edge_setups (id, instrument, market, created_at, killzone_origin, bias, entry_zone_low, entry_zone_high, entry_zone_mid, stop, tp1, tp2, r_multiple_1, r_multiple_2, signal_state, entry_triggered_at, resolved_at, strategy_id)
       VALUES (?, 'ES', 'futures', ?, 'ny_am', 'long', 5900, 5905, 5902.5, 5890, 5927.5, 5940, 2.0, 3.0, 'resolved', ?, ?, 'sentinel_v2')`,
      [id, createdAt, createdAt, `2026-11-${day}T16:00:00.000Z`]
    );
    await queryDb(
      `INSERT INTO outcomes (id, setup_id, setup_market, outcome_type, realized_pl, strategy_id, created_at)
       VALUES (?, ?, 'futures', ?, ?, 'sentinel_v2', ?)`,
      [`out_${id}`, id, isWin ? 'tp1_hit' : 'sl_hit', isWin ? 1.6 : -1.0, `2026-11-${day}T16:00:00.000Z`]
    );
    await upsertSignalConfluenceLog({
      setupId: id,
      sourceTable: 'edge_setups',
      instrument: 'ES',
      resolvedInstrument: 'ES',
      market: 'futures',
      tradingStyle: 'INTRADAY',
      strategyId: 'sentinel_v2',
      bias: 'long',
      classification: strongRes,
      provenance: 'LIVE_CAPTURED',
      signalCreatedAt: createdAt
    });
  }

  // Insert 10 Counter Macro Bias signals: 2 wins, 8 losses (in forex_edge_setups & mtf_style_setups)
  for (let i = 0; i < 10; i++) {
    const id = `nov_counter_${i}`;
    const isWin = i < 2;
    const day = String(3 + i).padStart(2, '0');
    const createdAt = `2026-11-${day}T09:00:00.000Z`;
    await queryDb(
      `INSERT INTO forex_edge_setups (id, instrument, market, created_at, killzone_origin, bias, entry_zone_low, entry_zone_high, entry_zone_mid, stop, tp1, tp2, r_multiple_1, r_multiple_2, signal_state, entry_triggered_at, resolved_at, strategy_id)
       VALUES (?, 'GBP/USD', 'forex', ?, 'london', 'long', 1.28, 1.281, 1.2805, 1.275, 1.2915, 1.297, 2.0, 3.0, 'resolved', ?, ?, 'manna_snd')`,
      [id, createdAt, createdAt, `2026-11-${day}T14:00:00.000Z`]
    );
    await queryDb(
      `INSERT INTO outcomes (id, setup_id, setup_market, outcome_type, realized_pl, strategy_id, created_at)
       VALUES (?, ?, 'forex', ?, ?, 'manna_snd', ?)`,
      [`out_${id}`, id, isWin ? 'tp1_hit' : 'sl_hit', isWin ? 1.6 : -1.0, `2026-11-${day}T14:00:00.000Z`]
    );
    await upsertSignalConfluenceLog({
      setupId: id,
      sourceTable: 'forex_edge_setups',
      instrument: 'GBP/USD',
      resolvedInstrument: 'GBP/USD',
      market: 'forex',
      tradingStyle: 'INTRADAY',
      strategyId: 'manna_snd',
      bias: 'long',
      classification: counterRes,
      provenance: 'LIVE_CAPTURED',
      signalCreatedAt: createdAt
    });
  }

  console.log('4. Testing November historical point-in-time backfill on unclassified November signals...');
  await queryDb(`
    CREATE TABLE IF NOT EXISTS mtf_style_setups (
      id TEXT PRIMARY KEY,
      signature TEXT UNIQUE,
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
      conviction_score REAL NOT NULL,
      liquidity_score REAL NOT NULL,
      killzone_origin TEXT,
      signal_state TEXT NOT NULL,
      is_breakeven INTEGER DEFAULT 0,
      realized_r REAL DEFAULT 0,
      last_price REAL DEFAULT 0,
      entry_price_recorded REAL,
      entry_triggered_at TEXT,
      execution_price REAL,
      outcome_type TEXT,
      invalidation_reason TEXT,
      invalidation_detail TEXT,
      superseded INTEGER DEFAULT 0,
      superseded_by TEXT,
      metadata TEXT,
      filled_at TEXT,
      resolved_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  // Insert an unclassified November MTF signal (no signal_confluence_logs entry!) to test causal reconstruction
  await queryDb(
    `INSERT INTO mtf_style_setups (
      id, signature, trading_style, swing_mode, strategy_id, context_tf, entry_tf, instrument, market, bias,
      entry_zone_low, entry_zone_high, entry_zone_mid, stop, initial_stop, tp1, tp2,
      r_multiple_1, r_multiple_2, conviction_score, liquidity_score, killzone_origin, signal_state,
      realized_r, outcome_type, entry_triggered_at, resolved_at, created_at, updated_at
    ) VALUES (
      'nov_hist_eur_1', 'sig_hist_1', 'SWING', 'd1_h4', 'mtf_swing', 'D1', '4H', 'EUR/USD', 'forex', 'long',
      1.0600, 1.0620, 1.0610, 1.0550, 1.0550, 1.0730, 1.0790,
      2.0, 3.0, 82, 90, 'london', 'resolved',
      1.6, 'tp1_hit', '2026-11-05T08:00:00.000Z', '2026-11-06T12:00:00.000Z', '2026-11-05T07:30:00.000Z', '2026-11-06T12:00:00.000Z'
    )`
  );

  const report = await getConfluencePerformanceReport({ period: 'november_2026', autoBackfill: true });
  assert.strictEqual(report.provenanceSummary.totalTrackedSignals, 25, `Expected 25 tracked Nov signals, got ${report.provenanceSummary.totalTrackedSignals}`);
  assert.strictEqual(report.provenanceSummary.liveCapturedCount, 24, '24 live-captured signals must remain LIVE_CAPTURED');
  assert.strictEqual(report.provenanceSummary.historicalReconstructedCount, 1, '1 historical November signal must be reconstructed');

  const histRow = report.signals.find((s) => s.setupId === 'nov_hist_eur_1');
  assert(histRow, 'Historical November signal must appear in report');
  assert.strictEqual(histRow!.provenance, 'HISTORICAL_RECONSTRUCTED');
  assert.strictEqual(histRow!.realizedR, 1.6);

  const agreesVsCounter = report.comparisons.find((c) => c.id === 'agrees_vs_counter');
  assert(agreesVsCounter, 'Must include agrees_vs_counter head-to-head proof');
  assert.strictEqual(agreesVsCounter!.verdict, 'MATHEMATICALLY_PROVEN', `Expected MATHEMATICALLY_PROVEN, got ${agreesVsCounter!.verdict}`);
  assert(agreesVsCounter!.welchPValue !== null && agreesVsCounter!.welchPValue < 0.01, 'Welch p-value must prove statistical significance');
  assert(agreesVsCounter!.fisherExactPValue !== null && agreesVsCounter!.fisherExactPValue < 0.01, 'Fisher exact p-value must prove WR significance');

  console.log('5. Testing Super Admin ON/OFF role gating for Admins and Clients...');
  const defaultRollout = await getConfluenceAnalyticsRollout();
  assert.strictEqual(defaultRollout.visibleToAdmins, false);
  assert.strictEqual(defaultRollout.visibleToTraders, false);
  assert.strictEqual(canRoleAccessConfluenceAnalytics('super_admin', defaultRollout), true);
  assert.strictEqual(canRoleAccessConfluenceAnalytics('admin', defaultRollout), false);
  assert.strictEqual(canRoleAccessConfluenceAnalytics('trader', defaultRollout), false);

  const { server, baseUrl } = await startTestServer();
  try {
    // Stage 0: Super Admin allowed, Admin & Client denied
    assert.strictEqual((await fetch(`${baseUrl}/confluence-analytics/report`, { headers: { 'x-user-role': 'super_admin' } })).status, 200);
    assert.strictEqual((await fetch(`${baseUrl}/confluence-analytics/report`, { headers: { 'x-user-role': 'admin' } })).status, 403);
    assert.strictEqual((await fetch(`${baseUrl}/confluence-analytics/report`, { headers: { 'x-user-role': 'trader' } })).status, 403);

    // Non-Super-Admin cannot toggle visibility
    const adminMutate = await fetch(`${baseUrl}/confluence-analytics/rollout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-user-role': 'admin' },
      body: JSON.stringify({ visibleToAdmins: true })
    });
    assert.strictEqual(adminMutate.status, 403);

    // Super Admin turns ON for Admins
    const toggleAdminOn = await fetch(`${baseUrl}/confluence-analytics/rollout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-user-role': 'super_admin', 'x-user-email': 'boss@manna.com' },
      body: JSON.stringify({ visibleToAdmins: true })
    });
    assert.strictEqual(toggleAdminOn.status, 200);
    assert.strictEqual((await fetch(`${baseUrl}/confluence-analytics/report`, { headers: { 'x-user-role': 'admin' } })).status, 200);
    assert.strictEqual((await fetch(`${baseUrl}/confluence-analytics/report`, { headers: { 'x-user-role': 'trader' } })).status, 403);

    // Super Admin turns ON for Clients
    const toggleClientOn = await fetch(`${baseUrl}/confluence-analytics/rollout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-user-role': 'super_admin' },
      body: JSON.stringify({ visibleToTraders: true })
    });
    assert.strictEqual(toggleClientOn.status, 200);
    assert.strictEqual((await fetch(`${baseUrl}/confluence-analytics/report`, { headers: { 'x-user-role': 'trader' } })).status, 200);

    // CSV export works when authorized
    const csvRes = await fetch(`${baseUrl}/confluence-analytics/export-csv?period=november_2026`, {
      headers: { 'x-user-role': 'trader' }
    });
    assert.strictEqual(csvRes.status, 200);
    const csvText = await csvRes.text();
    assert(csvText.includes('setup_id,created_at,instrument'), 'CSV export missing header row');
    assert(csvText.includes('nov_strong_0'), 'CSV export missing tracked signal');

    // Super Admin turns OFF for both Admins and Clients
    await fetch(`${baseUrl}/confluence-analytics/rollout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-user-role': 'super_admin' },
      body: JSON.stringify({ visibleToAdmins: false, visibleToTraders: false })
    });
    assert.strictEqual((await fetch(`${baseUrl}/confluence-analytics/report`, { headers: { 'x-user-role': 'super_admin' } })).status, 200);
    assert.strictEqual((await fetch(`${baseUrl}/confluence-analytics/report`, { headers: { 'x-user-role': 'admin' } })).status, 403);
    assert.strictEqual((await fetch(`${baseUrl}/confluence-analytics/report`, { headers: { 'x-user-role': 'trader' } })).status, 403);

    console.log('✅ ALL SIGNAL CARD CONFLUENCE PERFORMANCE & MATHEMATICAL PROOF TESTS PASSED!');
  } finally {
    server.close();
    try { fs.unlinkSync(tmpDbPath); } catch {}
    try { fs.unlinkSync(`${tmpDbPath}-shm`); } catch {}
    try { fs.unlinkSync(`${tmpDbPath}-wal`); } catch {}
  }
  process.exit(0);
}

runTests().catch((err) => {
  console.error('❌ Confluence Analytics tests failed:', err);
  process.exit(1);
});
