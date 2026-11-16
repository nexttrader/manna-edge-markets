import assert from 'assert';
import express from 'express';
import http from 'http';
import { initializeDatabase, queryDb } from '../db/database';
import edgeFinderRoutes from '../api/edge-finder-routes';
import {
  buildEdgeFinderSnapshot,
  canRoleAccessEdgeFinder,
  clearEdgeFinderCaches,
  EDGE_FINDER_ASSETS,
  getEdgeFinderRollout,
  updateEdgeFinderRollout,
  updateMacroEconomy
} from '../edge-finder/edge-finder-service';

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
  process.env.NODE_ENV = 'test';
  await initializeDatabase();

  // Ensure clean starting state for test keys
  await queryDb(`DELETE FROM superadmin_strategy_settings WHERE key IN ('edge_finder_rollout', 'edge_finder_macro_overrides')`);
  clearEdgeFinderCaches();

  console.log('1. Testing default rollout state (Super Admin only)...');
  const defaultRollout = await getEdgeFinderRollout();
  assert.strictEqual(defaultRollout.visibleToAdmins, false, 'Admins must be disabled by default');
  assert.strictEqual(defaultRollout.visibleToTraders, false, 'Clients must be disabled by default');
  assert.strictEqual(canRoleAccessEdgeFinder('super_admin', defaultRollout), true);
  assert.strictEqual(canRoleAccessEdgeFinder('admin', defaultRollout), false);
  assert.strictEqual(canRoleAccessEdgeFinder('trader', defaultRollout), false);

  console.log('2. Testing full live EdgeFinder snapshot generation across 56 assets, 3 Trader Horizons & G8 economies...');
  const snapshot = await buildEdgeFinderSnapshot(true);
  assert.strictEqual(EDGE_FINDER_ASSETS.length, 56, 'Universe must cover all 56 institutional assets (28 FX + 18 Futures + 10 Crypto)');
  assert.strictEqual(snapshot.scorecards.length, 56, 'Should compute all 56 assets');
  assert.strictEqual(snapshot.scorecards.filter((s) => s.assetClass === 'forex').length, 28, 'Must include 28 FX pairs');
  assert.strictEqual(snapshot.scorecards.filter((s) => s.assetClass === 'futures').length, 18, 'Must include 18 Futures contracts');
  assert.strictEqual(snapshot.scorecards.filter((s) => s.assetClass === 'crypto').length, 10, 'Must include 10 Crypto contracts');
  assert.strictEqual(snapshot.economies.length, 8, 'Should include all G8 economies');
  assert.strictEqual(snapshot.currencyStrength.length, 8, 'Should rank all G8 currencies');
  assert.strictEqual(snapshot.futuresStrength.length, 5, 'Should rank all 5 Futures sectors');
  assert.strictEqual(snapshot.cryptoStrength.length, 10, 'Should rank all 10 Crypto contracts');
  assert.strictEqual(snapshot.carryTrades.length, 56, 'Carry/Roll/Funding scanner must cover all 56 assets');
  assert.strictEqual(snapshot.syncStatus.cftcSource, 'CFTC_LIVE', 'CFTC COT feed must be live');
  assert.strictEqual(snapshot.syncStatus.macroSource, 'LIVE_BIS_WORLDBANK', 'Macro feed must be live BIS + World Bank');
  assert.strictEqual(snapshot.syncStatus.yieldsSource, 'LIVE_FRED_YAHOO', 'Yield curve & FRED macro feed must be live');
  assert.strictEqual(snapshot.syncStatus.intradaySource, 'LIVE_15M_H1_H4', 'Intraday M15/H1/H4 candles must be live');
  assert.strictEqual(snapshot.syncStatus.livePriceCount, 56, 'All 56 assets must have live Yahoo price feeds');
  assert.strictEqual(snapshot.syncStatus.refreshIntervalSeconds, 60, 'Auto-poll interval must be 60 seconds');
  assert.strictEqual(snapshot.syncStatus.feedCadences.length, 8, 'Must report exact update cadences for all 8 data streams');
  assert(snapshot.riskGauge.score >= 5 && snapshot.riskGauge.score <= 95, 'Risk gauge out of bounds');

  // Verify live US Treasury Yield Curve, VIX, DXY, and FRED US Macro Valuation
  const yc = snapshot.macroInternals.yieldCurve;
  assert(yc.m3 > 0 && yc.y2 > 0 && yc.y5 > 0 && yc.y10 > 0 && yc.y30 > 0, `Yield curve maturities must all be positive live rates: ${JSON.stringify(yc)}`);
  assert(yc.realYield10y > 0, `10Y TIPS Real Yield must be positive live FRED DFII10: ${yc.realYield10y}`);
  assert(snapshot.macroInternals.vix > 0 && snapshot.macroInternals.dxy > 0, 'VIX and DXY must be live positive quotes');
  assert(snapshot.macroInternals.fredUsMacro.nfpTotalK > 100000, 'FRED PAYEMS must reflect live payrolls');
  assert(snapshot.macroInternals.fredUsMacro.nominalGdpBillions > 20000, 'FRED GDP must reflect live nominal GDP');
  assert(snapshot.macroInternals.fredUsMacro.buffettIndicatorPct > 100, 'Buffett Indicator must reflect live W5K / GDP');

  // Verify Dedicated 7-Pillar Gold Scorecard
  assert(snapshot.goldScorecard.gcPrice > 1000 && snapshot.goldScorecard.silverPrice > 10, 'Gold & Silver prices must be live');
  assert(snapshot.goldScorecard.goldSilverRatio > 20, 'Gold/Silver ratio must be live');
  assert.strictEqual(snapshot.goldScorecard.drivers.length, 7, 'Gold scorecard must contain all 7 live pillars');
  assert(snapshot.goldScorecard.series30d.length >= 20, 'Gold vs DXY chart must have >= 20 daily points');

  // Verify Smart Money Tracker (SEC Form 4, 13F Whales, Wall Street Targets)
  assert(snapshot.smartMoney.bankAndStreetTargets.length >= 6, 'Must load live Wall Street consensus targets');
  assert(snapshot.smartMoney.insiders.length > 0, 'Must load live SEC Form 4 insider filings');
  assert(snapshot.smartMoney.whales.length > 0, 'Must load live 13F institutional whale holdings');

  // Verify G8 Central Bank Probabilities & Multi-Year History
  for (const econ of snapshot.economies) {
    const probSum = econ.rateProbabilities.hikePct + econ.rateProbabilities.holdPct + econ.rateProbabilities.cutPct;
    assert.strictEqual(probSum, 100, `${econ.currency} rate probabilities must sum to 100, got ${probSum}`);
    assert(econ.history.rates.length >= 6, `${econ.currency} must have BIS rate history`);
    assert(econ.history.gdp.length >= 3, `${econ.currency} must have World Bank multi-year GDP history`);
  }

  for (const sc of snapshot.scorecards) {
    assert.strictEqual(sc.priceSource, 'LIVE', `${sc.instrument} must use LIVE market pricing`);
    assert.strictEqual(sc.cot.source, 'CFTC_LIVE', `${sc.instrument} COT must be live CFTC data`);
    assert(sc.retailSentiment.source.includes('CFTC'), `${sc.instrument} retail sentiment must come from live CFTC non-reportables`);
    assert(sc.totalScore >= -10 && sc.totalScore <= 10, `${sc.instrument} score out of [-10, 10]: ${sc.totalScore}`);
    assert.strictEqual(sc.technical.intradaySource, 'LIVE_15M_H1_H4', `${sc.instrument} must compute M15/H1/H4 from live 15m candles`);
    for (const h of ['SCALP', 'INTRADAY', 'SWING'] as const) {
      const prof = sc.timeframes[h];
      assert(prof, `${sc.instrument} missing timeframe profile ${h}`);
      assert(prof.score >= -10 && prof.score <= 10, `${sc.instrument} ${h} score out of bounds: ${prof.score}`);
      assert(prof.confidencePct >= 30 && prof.confidencePct <= 100, `${sc.instrument} ${h} confidence invalid`);
      assert(prof.actionNote.length > 10, `${sc.instrument} ${h} missing actionNote`);
    }
    assert(sc.timeframeConfluence.alignedCount >= 0 && sc.timeframeConfluence.alignedCount <= 3, 'TF confluence out of bounds');
    assert.strictEqual(sc.factors.length, 11, `${sc.instrument} must include all 11 weighted pillars`);
    const weightSum = sc.factors.reduce((sum, f) => sum + f.weight, 0);
    assert(Math.abs(weightSum - 10) < 0.01, `${sc.instrument} pillar weights must sum to 10.0, got ${weightSum}`);
    assert.strictEqual(sc.cot.history12w.length, 12, `${sc.instrument} COT must include 12 weeks live history`);
    assert(sc.cot.cotIndex52w >= 0 && sc.cot.cotIndex52w <= 100, `${sc.instrument} 52W COT index out of range`);
    assert(Number.isFinite(sc.cot.cotZScore52w), `${sc.instrument} 52W COT Z-score must be finite`);
    assert(['Bullish', 'Bearish', 'Flat'].includes(sc.technical.mtfAlignment.m15), `${sc.instrument} M15 invalid`);
    assert(['Bullish', 'Bearish', 'Flat'].includes(sc.technical.mtfAlignment.h1), `${sc.instrument} H1 invalid`);
    assert(['Bullish', 'Bearish', 'Flat'].includes(sc.technical.mtfAlignment.h4), `${sc.instrument} H4 invalid`);
    assert(sc.technical.mtfAlignment.alignedCount >= 0 && sc.technical.mtfAlignment.alignedCount <= 7, 'MTF count out of range (0-7)');
    assert(sc.technical.volatilityPercentile30d >= 0 && sc.technical.volatilityPercentile30d <= 100, 'Vol percentile out of range');
    assert(Math.abs((sc.retailSentiment.longPct + sc.retailSentiment.shortPct) - 100) < 0.3, 'Retail split must sum to 100%');
    assert.strictEqual(sc.seasonality.monthlyReturns10Y.length, 12, 'Seasonality must span 12 months');
    assert(sc.seasonality.monthlyReturns10Y.some((v) => v !== 0), `${sc.instrument} seasonality must contain real monthly return values`);
    assert(sc.historicalSeries.length >= 20, `${sc.instrument} must include live daily price history`);
    assert.strictEqual(snapshot.correlations.matrix[sc.instrument][sc.instrument], 1.0, 'Self-correlation must be 1.0');
  }

  console.log('3. Testing Super Admin macro override recalculation...');
  const eurBefore = snapshot.scorecards.find((s) => s.instrument === 'EUR/USD')!;
  await updateMacroEconomy('EUR', {
    rate: 6.25,
    stance: 'Hawkish',
    rateExpectation: 'Hike',
    gdpQoQ: 3.4,
    coreCpiYoY: 4.1
  });
  const afterMacroSnapshot = await buildEdgeFinderSnapshot(true);
  const eurAfter = afterMacroSnapshot.scorecards.find((s) => s.instrument === 'EUR/USD')!;
  assert(
    eurAfter.totalScore > eurBefore.totalScore,
    `Hiking EUR rates/growth should raise EUR/USD score (before=${eurBefore.totalScore}, after=${eurAfter.totalScore})`
  );

  console.log('4. Testing HTTP role-gating & staged rollout (Super Admin -> Admin -> All Clients)...');
  const { server, baseUrl } = await startTestServer();
  try {
    // Stage 0: Super Admin allowed, Admin & Trader denied
    const saRes0 = await fetch(`${baseUrl}/snapshot`, { headers: { 'x-user-role': 'super_admin' } });
    assert.strictEqual(saRes0.status, 200, 'Super Admin must access EdgeFinder immediately');

    const admRes0 = await fetch(`${baseUrl}/snapshot`, { headers: { 'x-user-role': 'admin' } });
    assert.strictEqual(admRes0.status, 403, 'Admin must receive 403 when visibleToAdmins=false');

    const trdRes0 = await fetch(`${baseUrl}/snapshot`, { headers: { 'x-user-role': 'trader' } });
    assert.strictEqual(trdRes0.status, 403, 'Trader must receive 403 when visibleToTraders=false');

    // Non-Super-Admin cannot mutate rollout or macro settings
    const badMutate = await fetch(`${baseUrl}/rollout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-user-role': 'admin' },
      body: JSON.stringify({ visibleToAdmins: true })
    });
    assert.strictEqual(badMutate.status, 403, 'Admin must not be allowed to change EdgeFinder rollout');

    // Stage 1: Super Admin enables Admin access
    const enableAdminsRes = await fetch(`${baseUrl}/rollout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-user-role': 'super_admin', 'x-user-email': 'boss@mannaedge.com' },
      body: JSON.stringify({ visibleToAdmins: true })
    });
    assert.strictEqual(enableAdminsRes.status, 200);
    const stage1 = await enableAdminsRes.json();
    assert.strictEqual(stage1.rollout.visibleToAdmins, true);
    assert.strictEqual(stage1.rollout.visibleToTraders, false);

    const admRes1 = await fetch(`${baseUrl}/snapshot`, { headers: { 'x-user-role': 'admin' } });
    assert.strictEqual(admRes1.status, 200, 'Admin must access EdgeFinder once visibleToAdmins=true');

    const trdRes1 = await fetch(`${baseUrl}/snapshot`, { headers: { 'x-user-role': 'trader' } });
    assert.strictEqual(trdRes1.status, 403, 'Trader must still receive 403 when visibleToTraders=false');

    // Stage 2: Super Admin enables All Clients access
    const enableClientsRes = await fetch(`${baseUrl}/rollout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-user-role': 'super_admin' },
      body: JSON.stringify({ visibleToTraders: true })
    });
    assert.strictEqual(enableClientsRes.status, 200);
    const stage2 = await enableClientsRes.json();
    assert.strictEqual(stage2.rollout.visibleToTraders, true);

    const trdRes2 = await fetch(`${baseUrl}/snapshot`, { headers: { 'x-user-role': 'trader' } });
    assert.strictEqual(trdRes2.status, 200, 'Trader must access EdgeFinder once visibleToTraders=true');

    // Test URL-encoded asset endpoint
    const assetRes = await fetch(`${baseUrl}/asset/EUR%2FUSD`, { headers: { 'x-user-role': 'trader' } });
    assert.strictEqual(assetRes.status, 200, 'Asset detail endpoint should resolve EUR%2FUSD');
    const assetJson = await assetRes.json();
    assert.strictEqual(assetJson.scorecard.instrument, 'EUR/USD');

    // Reset back to locked defaults for clean state
    await updateEdgeFinderRollout({ visibleToAdmins: false, visibleToTraders: false }, 'test_cleanup');
    await queryDb(`DELETE FROM superadmin_strategy_settings WHERE key IN ('edge_finder_rollout', 'edge_finder_macro_overrides')`);
  } finally {
    server.close();
  }

  console.log('ALL MANNA EDGEFINDER PRO TESTS PASSED SUCCESSFULLY!');
  process.exit(0);
}

runTests().catch((err) => {
  console.error('EDGEFINDER TEST FAILED:', err);
  process.exit(1);
});
