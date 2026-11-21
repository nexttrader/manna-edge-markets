import assert from 'assert';
import { evaluateSignalCardConfluenceGate } from '../edge-finder/confluence-analytics';
import type { AssetEdgeScorecard, EdgeBiasLabel } from '../edge-finder/edge-finder-service';
import { MannaSndStrategy } from '../discovery/strategies/manna-snd';
import type { Candle, KillzoneInfo } from '../discovery/types';

function makeScorecard(params: {
  instrument?: string;
  scalpScore: number;
  intradayScore: number;
  swingScore: number;
  biasLabel?: EdgeBiasLabel;
}): AssetEdgeScorecard {
  const toLabel = (s: number): EdgeBiasLabel =>
    s >= 4 ? 'Strong Buy' : s >= 0.5 ? 'Buy' : s <= -4 ? 'Strong Sell' : s <= -0.5 ? 'Sell' : 'Neutral';
  return {
    instrument: params.instrument || 'NQ',
    totalScore: params.intradayScore,
    biasLabel: params.biasLabel || toLabel(params.intradayScore),
    timeframes: {
      SCALP: { score: params.scalpScore, biasLabel: toLabel(params.scalpScore), htfConfluence: 'ALIGNED' },
      INTRADAY: { score: params.intradayScore, biasLabel: toLabel(params.intradayScore), htfConfluence: 'ALIGNED' },
      SWING: { score: params.swingScore, biasLabel: toLabel(params.swingScore), htfConfluence: 'ALIGNED' }
    },
    timeframeConfluence: {
      allAligned: false,
      alignedCount: 2,
      summary: 'Test',
      dominantBias: toLabel(params.intradayScore)
    }
  } as unknown as AssetEdgeScorecard;
}

function makeSeries(
  bars: Array<[number, number, number, number]>,
  startMs: number,
  stepMs: number
): Candle[] {
  return bars.map(([open, high, low, close], idx) => ({
    open,
    high,
    low,
    close,
    volume: 1500,
    timestamp: new Date(startMs + idx * stepMs).toISOString()
  }));
}

async function runTests() {
  console.log('🧪 Running Confluence Gate + Verified Scalping Rules Tests...\n');

  // ── 1. Signal Card Confluence Gate Tests ─────────────────────────────────────
  // 1a. STRONG_CONFLUENCE (3/3 TF aligned) -> APPROVED
  const scStrong = makeScorecard({ scalpScore: -4.5, intradayScore: -6.0, swingScore: -5.2 });
  const rStrong = evaluateSignalCardConfluenceGate('short', scStrong);
  assert.strictEqual(rStrong.approved, true, 'STRONG_CONFLUENCE must be approved');
  assert.strictEqual(rStrong.categoryKey, 'STRONG_CONFLUENCE');

  // 1b. EDGEFINDER_AGREES when Scalp + Intraday agree even if Swing is slightly opposite (+19.20R real Futures case) -> APPROVED
  const scAgreesSwingOpp = makeScorecard({ instrument: 'NQ', scalpScore: -4.92, intradayScore: -5.04, swingScore: 2.0 });
  const rAgreesSwingOpp = evaluateSignalCardConfluenceGate('short', scAgreesSwingOpp);
  assert.strictEqual(rAgreesSwingOpp.approved, true, 'EDGEFINDER_AGREES (Scalp+Intraday agree, Swing opposite) must be approved');
  assert.strictEqual(rAgreesSwingOpp.categoryKey, 'EDGEFINDER_AGREES');

  // 1c. PARTIAL_CONFLUENCE (Scalp agrees, Intraday neutral, Swing opposite) -> REJECTED
  const scPartial = makeScorecard({ instrument: 'ZN', scalpScore: 3.58, intradayScore: -0.21, swingScore: -3.5 });
  const rPartial = evaluateSignalCardConfluenceGate('long', scPartial);
  assert.strictEqual(rPartial.approved, false, 'PARTIAL_CONFLUENCE must be rejected');
  assert.strictEqual(rPartial.categoryKey, 'PARTIAL_CONFLUENCE');

  // 1d. EDGEFINDER_NEUTRAL -> REJECTED
  const scNeutral = makeScorecard({ scalpScore: 0.1, intradayScore: 0.0, swingScore: -0.2 });
  const rNeutral = evaluateSignalCardConfluenceGate('long', scNeutral);
  assert.strictEqual(rNeutral.approved, false, 'EDGEFINDER_NEUTRAL must be rejected');
  assert.strictEqual(rNeutral.categoryKey, 'EDGEFINDER_NEUTRAL');

  // 1e. COUNTER_MACRO_BIAS (even when Scalp agrees, Intraday opposes -> Friday -8.60R case) -> REJECTED
  const scCounterScalpAgree = makeScorecard({ instrument: 'CL', scalpScore: 3.5, intradayScore: -1.75, swingScore: 2.0 });
  const rCounterScalpAgree = evaluateSignalCardConfluenceGate('long', scCounterScalpAgree);
  assert.strictEqual(rCounterScalpAgree.approved, false, 'COUNTER_MACRO_BIAS must be rejected even if Scalp agrees');
  assert.strictEqual(rCounterScalpAgree.categoryKey, 'COUNTER_MACRO_BIAS');

  // 1f. COUNTER_MACRO_BIAS (both Scalp and Intraday oppose) -> REJECTED
  const scCounterFull = makeScorecard({ instrument: 'NQ', scalpScore: -4.33, intradayScore: -4.79, swingScore: 2.0 });
  const rCounterFull = evaluateSignalCardConfluenceGate('long', scCounterFull);
  assert.strictEqual(rCounterFull.approved, false, 'COUNTER_MACRO_BIAS must be rejected');
  assert.strictEqual(rCounterFull.categoryKey, 'COUNTER_MACRO_BIAS');

  console.log('✅ TEST 1: Signal Card Confluence Gate (STRONG_CONFLUENCE + EDGEFINDER_AGREES ONLY) passed');

  // ── 2. Scalping Rule 2: 5M LTF Trend Must Agree with Bias ────────────────────
  const snd = new MannaSndStrategy();
  const kz: KillzoneInfo = {
    killzone: 'ny_am',
    name: 'NY_AM',
    boundaryET: '08:00',
    boundaryUTC: '2026-11-19T13:00:00.000Z'
  };
  const baseMs = new Date('2026-11-19T14:00:00.000Z').getTime();

  // HTF 15M curve: Demand proximal 21020 (distal 21000), Supply proximal 21205 (distal 21220)
  const htf15m = makeSeries(
    [
      [21060, 21062, 21015, 21020],
      [21020, 21024, 21000, 21016], // HTF Demand
      [21016, 21090, 21015, 21088],
      [21088, 21110, 21085, 21108],
      [21108, 21130, 21105, 21125],
      [21125, 21150, 21120, 21145],
      [21145, 21165, 21140, 21160],
      [21160, 21180, 21155, 21175],
      [21175, 21185, 21170, 21180],
      [21180, 21210, 21178, 21208],
      [21208, 21220, 21202, 21205], // HTF Supply
      [21205, 21206, 21150, 21154],
      [21154, 21156, 21120, 21125],
      [21125, 21128, 21090, 21095],
      [21095, 21100, 21060, 21065],
      [21065, 21070, 21040, 21045]
    ],
    baseMs,
    15 * 60_000
  );

  // 5M LTF with UP trend + valid Demand zone (proximal 21030, distal 21020)
  const ltf5mUpDemand = makeSeries(
    [
      [21060, 21065, 21055, 21062],
      [21062, 21068, 21058, 21064],
      [21064, 21070, 21060, 21066],
      [21066, 21072, 21062, 21068],
      [21068, 21074, 21064, 21070],
      [21070, 21076, 21066, 21072],
      [21072, 21078, 21068, 21074],
      [21074, 21080, 21070, 21072],
      [21072, 21074, 21064, 21066],
      [21066, 21068, 21060, 21062],
      [21062, 21064, 21058, 21060],
      [21060, 21062, 21026, 21028], // leg_down
      [21028, 21032, 21020, 21030], // base (DBR demand)
      [21030, 21065, 21029, 21062], // leg_up
      [21062, 21064, 21042, 21045],
      [21045, 21052, 21040, 21045]
    ],
    baseMs,
    5 * 60_000
  );

  // 5M LTF with DOWN trend + same Demand zone at end (forced Long against 5M downtrend)
  const ltf5mDownDemand = makeSeries(
    [
      [21140, 21145, 21135, 21136],
      [21136, 21138, 21128, 21130],
      [21130, 21132, 21120, 21122],
      [21122, 21124, 21112, 21114],
      [21114, 21116, 21104, 21106],
      [21106, 21108, 21096, 21098],
      [21098, 21100, 21088, 21090],
      [21090, 21092, 21080, 21082],
      [21082, 21084, 21072, 21074],
      [21074, 21076, 21064, 21066],
      [21066, 21068, 21056, 21058],
      [21058, 21060, 21026, 21028], // leg_down
      [21028, 21032, 21020, 21030], // base (DBR demand)
      [21030, 21065, 21029, 21062], // leg_up
      [21062, 21064, 21042, 21045],
      [21045, 21052, 21040, 21045]
    ],
    baseMs,
    5 * 60_000
  );

  const scalpUpRes = await snd.evaluateSetupsForTimeframes(
    kz,
    'test_scalp_up',
    'futures',
    ['NQ'],
    { NQ: 'long' },
    {
      htf: '15m',
      ltf: '5m',
      htfLabel: '15M',
      ltfLabel: '5M',
      strategyId: 'manna_scalper',
      tradingStyle: 'SCALP',
      sourceTag: 'mtf_manna_snd',
      candleFetcher: async (_i, tf) => (tf === '15m' ? htf15m : ltf5mUpDemand),
      priceFetcher: async () => 21045
    }
  );
  assert.strictEqual(scalpUpRes.length, 1, 'SCALP Long with 5M UP trend must pass');

  const scalpDownRes = await snd.evaluateSetupsForTimeframes(
    kz,
    'test_scalp_down_opposed',
    'futures',
    ['NQ'],
    { NQ: 'long' },
    {
      htf: '15m',
      ltf: '5m',
      htfLabel: '15M',
      ltfLabel: '5M',
      strategyId: 'manna_scalper',
      tradingStyle: 'SCALP',
      sourceTag: 'mtf_manna_snd',
      candleFetcher: async (_i, tf) => (tf === '15m' ? htf15m : ltf5mDownDemand),
      priceFetcher: async () => 21045
    }
  );
  assert.strictEqual(scalpDownRes.length, 0, 'SCALP Long with opposing 5M DOWN trend must be rejected');

  console.log('✅ TEST 2: Scalping Rule 2 (5M LTF Trend Alignment) passed');

  // ── 3. Scalping Rule 3: Block Rally-Base-Drop Short at Bottom of 15M Curve (curve=low) ─
  // Current price 21045 is inside bottom 33% of 15M curve [21020..21205] -> curveLocation === 'low'
  // Create a 5M DOWN trend ending in a Rally-Base-Drop Supply zone at proximal 21065
  const ltf5mDownRbdLowCurve = makeSeries(
    [
      [21170, 21175, 21165, 21166],
      [21166, 21168, 21158, 21160],
      [21160, 21162, 21150, 21152],
      [21152, 21154, 21142, 21144],
      [21144, 21146, 21134, 21136],
      [21136, 21138, 21126, 21128],
      [21128, 21130, 21118, 21120],
      [21120, 21122, 21110, 21112],
      [21112, 21114, 21102, 21104],
      [21104, 21106, 21094, 21096],
      [21096, 21098, 21065, 21068],
      [21050, 21072, 21049, 21070], // leg_up (Rally)
      [21070, 21076, 21066, 21068], // base (proximal=21068, distal=21076)
      [21068, 21069, 21035, 21038], // leg_down (Drop -> Rally-Base-Drop)
      [21038, 21052, 21036, 21048],
      [21048, 21054, 21042, 21045]
    ],
    baseMs,
    5 * 60_000
  );

  // Same 5M DOWN trend ending in a Drop-Base-Drop Supply continuation zone at proximal 21068
  const ltf5mDownDbdLowCurve = makeSeries(
    [
      [21170, 21175, 21165, 21166],
      [21166, 21168, 21158, 21160],
      [21160, 21162, 21150, 21152],
      [21152, 21154, 21142, 21144],
      [21144, 21146, 21134, 21136],
      [21136, 21138, 21126, 21128],
      [21128, 21130, 21118, 21120],
      [21120, 21122, 21110, 21112],
      [21112, 21114, 21102, 21104],
      [21104, 21106, 21094, 21096],
      [21096, 21098, 21088, 21090],
      [21090, 21092, 21069, 21070], // leg_down (Drop)
      [21070, 21076, 21066, 21068], // base (proximal=21068, distal=21076)
      [21068, 21069, 21035, 21038], // leg_down (Drop -> Drop-Base-Drop)
      [21038, 21052, 21036, 21048],
      [21048, 21054, 21042, 21045]
    ],
    baseMs,
    5 * 60_000
  );

  const scalpRbdLowRes = await snd.evaluateSetupsForTimeframes(
    kz,
    'test_scalp_rbd_low',
    'futures',
    ['NQ'],
    { NQ: 'short' },
    {
      htf: '15m',
      ltf: '5m',
      htfLabel: '15M',
      ltfLabel: '5M',
      strategyId: 'manna_scalper',
      tradingStyle: 'SCALP',
      sourceTag: 'mtf_manna_snd',
      candleFetcher: async (_i, tf) => (tf === '15m' ? htf15m : ltf5mDownRbdLowCurve),
      priceFetcher: async () => 21045
    }
  );
  assert.strictEqual(scalpRbdLowRes.length, 0, 'SCALP Short Rally-Base-Drop at curve=low must be rejected');

  const scalpDbdLowRes = await snd.evaluateSetupsForTimeframes(
    kz,
    'test_scalp_dbd_low',
    'futures',
    ['NQ'],
    { NQ: 'short' },
    {
      htf: '15m',
      ltf: '5m',
      htfLabel: '15M',
      ltfLabel: '5M',
      strategyId: 'manna_scalper',
      tradingStyle: 'SCALP',
      sourceTag: 'mtf_manna_snd',
      candleFetcher: async (_i, tf) => (tf === '15m' ? htf15m : ltf5mDownDbdLowCurve),
      priceFetcher: async () => 21045
    }
  );
  assert.strictEqual(scalpDbdLowRes.length, 1, 'SCALP Short Drop-Base-Drop continuation at curve=low with 5M DOWN trend must pass');
  assert.strictEqual(JSON.parse(scalpDbdLowRes[0].metadata || '{}').entry_zone_formation, 'Drop-Base-Drop');

  console.log('✅ TEST 3: Scalping Rule 3 (Block Rally-Base-Drop Short @ curve=low, allow Drop-Base-Drop continuation) passed');
  console.log('\n🎉 All Confluence Gate + Verified Scalping Rules tests passed!');
}

runTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Test failed:', err);
    process.exit(1);
  });
