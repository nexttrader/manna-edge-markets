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

  console.log('2. Testing full EdgeFinder snapshot generation across 16 assets & G8 economies...');
  const snapshot = await buildEdgeFinderSnapshot(true);
  assert.strictEqual(snapshot.scorecards.length, EDGE_FINDER_ASSETS.length, 'Should compute all 16 core assets');
  assert.strictEqual(snapshot.economies.length, 8, 'Should include all G8 economies');
  assert.strictEqual(snapshot.currencyStrength.length, 8, 'Should rank all G8 currencies');
  assert(snapshot.riskGauge.score >= 5 && snapshot.riskGauge.score <= 95, 'Risk gauge out of bounds');

  for (const sc of snapshot.scorecards) {
    assert(sc.totalScore >= -10 && sc.totalScore <= 10, `${sc.instrument} score out of [-10, 10]: ${sc.totalScore}`);
    assert.strictEqual(sc.factors.length, 11, `${sc.instrument} must include all 11 weighted pillars`);
    const weightSum = sc.factors.reduce((sum, f) => sum + f.weight, 0);
    assert(Math.abs(weightSum - 10) < 0.01, `${sc.instrument} pillar weights must sum to 10.0, got ${weightSum}`);
    assert.strictEqual(sc.cot.history12w.length, 12, `${sc.instrument} COT must include 12 weeks history`);
    assert(Math.abs((sc.retailSentiment.longPct + sc.retailSentiment.shortPct) - 100) < 0.3, 'Retail split must sum to 100%');
    assert.strictEqual(sc.seasonality.monthlyReturns10Y.length, 12, 'Seasonality must span 12 months');
    assert(sc.historicalSeries.length >= 25, `${sc.instrument} must include historical score vs price points`);
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
