import { computeATR } from './atr';
import { FOREX_INSTRUMENTS, FUTURES_INSTRUMENTS } from './mock-data';
import { computeConvictionScore, computeLiquidityScore, computeRMultiple } from './scoring';
import { getInstrumentDecimals, getTimeframeStopDistance } from './stop-loss-rules';
import { Bias, Candle } from './types';
import { aggregateToFourHourCandles, getLiveCandles, getLiveCurrentPrice, getLiveQuoteDetails } from './yahoo-provider';
import {
  evaluateEdgeFinderConfluence,
  syncMtfSetupsAndGetLiveBoard,
  type EdgeFinderConfluenceDecision
} from './mtf-style-tracker';
import {
  buildEdgeFinderSnapshot,
  type AssetEdgeScorecard
} from '../edge-finder/edge-finder-service';
import { isTradingSessionActive } from '../scheduler/killzone-mapper';

export { evaluateEdgeFinderConfluence, type EdgeFinderConfluenceDecision };

export type TradingStyleMode = 'scalp' | 'swing';
export type SwingPairMode = 'd1_h4' | 'h4_h1';

export interface MtfStyleSetup {
  id: string;
  instrument: string;
  market: 'futures' | 'forex';
  strategy_id: string;
  trading_style: 'SCALP' | 'SWING';
  context_tf: string;
  entry_tf: string;
  bias: Bias;
  signal_state: 'active' | 'awaiting_entry' | 'runner' | 'resolved' | 'invalidated' | 'superseded';
  state: 'active' | 'awaiting_entry' | 'runner' | 'resolved' | 'invalidated' | 'superseded';
  entry_zone_low: number;
  entry_zone_high: number;
  entry_zone_mid: number;
  stop: number;
  initial_stop?: number;
  tp1: number;
  tp2: number;
  r_multiple_1: number;
  r_multiple_2: number;
  conviction_score: number;
  liquidity_score: number;
  current_price: number;
  distance_to_entry_r: number;
  unrealizedR?: number;
  is_breakeven?: number;
  entry_price_recorded?: number;
  entry_triggered_at?: string;
  resolved_at?: string;
  execution_price?: number;
  outcome_type?: string;
  invalidation_reason?: string;
  invalidation_detail?: string;
  realized_r?: number;
  created_at: string;
  killzone_origin: string;
  metadata: string;
}

export interface MtfStyleSnapshot {
  style: TradingStyleMode;
  swingMode?: SwingPairMode;
  contextTf: string;
  entryTf: string;
  setups: MtfStyleSetup[];
  runnerSetups: MtfStyleSetup[];
  pastSetups: MtfStyleSetup[];
  generatedAt: string;
  cached: boolean;
}

const SCALP_TTL_MS = 60_000;
const SWING_TTL_MS = 120_000;

const discoveryCache = new Map<string, { ts: number }>();
const inflightRequests = new Map<string, Promise<MtfStyleSnapshot>>();

function computeEma(values: number[], period: number): number {
  if (values.length === 0) return 0;
  const k = 2 / (period + 1);
  let ema = values[0];
  for (let i = 1; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k);
  }
  return ema;
}

function getActiveSessionNameUTC(): string {
  const now = new Date();
  const etHour = Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      hour: '2-digit',
      hour12: false
    }).format(now)
  );
  if (etHour >= 2 && etHour < 8) return 'london';
  if (etHour >= 8 && etHour < 14) return 'ny_am';
  if (etHour >= 14 && etHour < 20) return 'ny_pm';
  return 'asia';
}

function determineDirectionalBias(
  contextCandles: Candle[],
  fastPeriod: number,
  slowPeriod: number,
  style: TradingStyleMode
): { bias: Bias; strength: number } | null {
  const closes = contextCandles.map((c) => c.close);
  const emaFast = computeEma(closes, fastPeriod);
  const emaSlow = computeEma(closes, slowPeriod);
  const latestClose = closes[closes.length - 1] || 1;
  const spreadPct = Math.abs(emaFast - emaSlow) / Math.max(latestClose, 1e-6);

  // Reject flat/choppy regimes where fast/slow EMAs have no meaningful separation
  const minSpreadPct = style === 'scalp' ? 0.0003 : 0.0008;
  if (spreadPct < minSpreadPct) {
    return null;
  }

  const bias: Bias = emaFast >= emaSlow ? 'long' : 'short';

  // Higher-timeframe structure confluence check (HH/HL vs LH/LL over recent 10 bars)
  const recentCtx = contextCandles.slice(-10);
  let hhHlCount = 0;
  let lhLlCount = 0;
  for (let i = 1; i < recentCtx.length; i++) {
    if (recentCtx[i].high > recentCtx[i - 1].high && recentCtx[i].low >= recentCtx[i - 1].low) {
      hhHlCount++;
    } else if (recentCtx[i].low < recentCtx[i - 1].low && recentCtx[i].high <= recentCtx[i - 1].high) {
      lhLlCount++;
    }
  }

  // Never trade against strict opposing context structure
  if (bias === 'long' && lhLlCount > hhHlCount) {
    return null;
  }
  if (bias === 'short' && hhHlCount > lhLlCount) {
    return null;
  }

  const strength = Math.min(1, 0.74 + Math.min(0.24, spreadPct * 80));
  return { bias, strength };
}

async function buildSetupForInstrument(
  instrument: string,
  market: 'futures' | 'forex',
  style: TradingStyleMode,
  swingMode: SwingPairMode,
  edgeScorecard?: AssetEdgeScorecard | null,
  enforceEdgeFinder = false
): Promise<MtfStyleSetup | null> {
  const contextTfCode: '15m' | '4h' | '1d' =
    style === 'scalp' ? '15m' : swingMode === 'd1_h4' ? '1d' : '4h';
  const entryTfCode: '5m' | '4h' | '1h' =
    style === 'scalp' ? '5m' : swingMode === 'd1_h4' ? '4h' : '1h';

  const contextLabel =
    style === 'scalp' ? '15M' : swingMode === 'd1_h4' ? '1D' : '4H';
  const entryLabel =
    style === 'scalp' ? '5M' : swingMode === 'd1_h4' ? '4H' : '1H';

  const [rawContext, rawEntry, quote, fallbackPrice] = await Promise.all([
    getLiveCandles(instrument, contextTfCode, contextTfCode === '4h' ? 120 : 60),
    getLiveCandles(instrument, entryTfCode, entryTfCode === '4h' ? 120 : 60),
    getLiveQuoteDetails(instrument).catch(() => null),
    getLiveCurrentPrice(instrument).catch(() => 0)
  ]);

  const contextCandles = contextTfCode === '4h' ? aggregateToFourHourCandles(rawContext) : rawContext;
  const entryCandles = entryTfCode === '4h' ? aggregateToFourHourCandles(rawEntry) : rawEntry;

  if (contextCandles.length < 15 || entryCandles.length < 15) {
    return null;
  }

  const currentPrice = (quote?.price && quote.price > 0)
    ? quote.price
    : (fallbackPrice > 0 ? fallbackPrice : entryCandles[entryCandles.length - 1].close);
  if (!currentPrice || currentPrice <= 0) return null;

  const currentBid = quote?.bid && quote.bid > 0 ? quote.bid : currentPrice;
  const currentAsk = quote?.ask && quote.ask > 0 ? quote.ask : currentPrice;

  const atr14 = computeATR(entryCandles, 14);
  if (!atr14 || atr14 <= 0) return null;

  const biasRes = determineDirectionalBias(
    contextCandles,
    style === 'scalp' ? 9 : 12,
    style === 'scalp' ? 21 : 26,
    style
  );
  if (!biasRes) return null;
  const { bias, strength } = biasRes;

  const efDecision = enforceEdgeFinder
    ? evaluateEdgeFinderConfluence(edgeScorecard, style, bias)
    : null;
  if (efDecision && !efDecision.approved) {
    return null;
  }

  // Reject falling-knife / vertical-squeeze entries where latest completed entry bar closed strongly against bias
  const prevBar = entryCandles[entryCandles.length - 2] || entryCandles[entryCandles.length - 1];
  const barBody = Math.abs(prevBar.close - prevBar.open);
  if (bias === 'long' && prevBar.close < prevBar.open && barBody > atr14 * 0.75) {
    return null;
  }
  if (bias === 'short' && prevBar.close > prevBar.open && barBody > atr14 * 0.75) {
    return null;
  }

  const decimals = getInstrumentDecimals(instrument, market);
  const round = (v: number) => Number(v.toFixed(decimals));

  const zoneOffsetMult = style === 'scalp' ? 0.35 : 0.45;
  const stopPadMult = style === 'scalp' ? 0.15 : 0.25;
  const zoneHalfWidthMult = style === 'scalp' ? 0.14 : 0.18;

  // Search true structural swing lookbacks so stops protect beyond real swings, never micro 5-bar noise
  const candidateLookbacks = style === 'scalp' ? [10, 16, 22] : [8, 14, 20];
  let selectedZone: {
    entryLow: number;
    entryHigh: number;
    entryMid: number;
    stop: number;
    tp1: number;
    tp2: number;
    r1: number;
    r2: number;
    risk: number;
    anchorTime: string;
  } | null = null;

  const defaultSpread = market === 'forex' ? (instrument.includes('JPY') ? 0.015 : 0.00012) : 0.25;
  const effectiveSpread = quote?.spread && quote.spread > 0
    ? Math.min(quote.spread, defaultSpread * 2.5)
    : defaultSpread;

  for (const lookback of candidateLookbacks) {
    const recentBars = entryCandles.slice(-lookback);
    if (recentBars.length === 0) continue;

    let anchorBar = recentBars[0];
    if (bias === 'long') {
      for (const b of recentBars) {
        if (b.low < anchorBar.low) anchorBar = b;
      }
    } else {
      for (const b of recentBars) {
        if (b.high > anchorBar.high) anchorBar = b;
      }
    }

    const swingLow = Math.min(...recentBars.map((c) => c.low));
    const swingHigh = Math.max(...recentBars.map((c) => c.high));

    const rawEntryMid = bias === 'long'
      ? swingLow + atr14 * zoneOffsetMult
      : swingHigh - atr14 * zoneOffsetMult;
    const rawStop = bias === 'long'
      ? swingLow - atr14 * stopPadMult
      : swingHigh + atr14 * stopPadMult;

    const rawRisk = Math.abs(rawEntryMid - rawStop);
    const risk = getTimeframeStopDistance(instrument, atr14, rawRisk, market, entryTfCode);

    const entryMid = round(rawEntryMid);
    const entryLow = round(rawEntryMid - atr14 * zoneHalfWidthMult);
    const entryHigh = round(rawEntryMid + atr14 * zoneHalfWidthMult);
    const stop = round(bias === 'long' ? entryMid - risk : entryMid + risk);
    const publishedRisk = Math.abs(entryMid - stop);
    if (publishedRisk <= 0) continue;

    // Never allow spread cost to exceed 22% of the stop distance
    if (effectiveSpread / publishedRisk > 0.22) continue;

    const tp1 = round(bias === 'long' ? entryMid + publishedRisk * 2.0 : entryMid - publishedRisk * 2.0);
    const tp2 = round(bias === 'long' ? entryMid + publishedRisk * 3.0 : entryMid - publishedRisk * 3.0);

    // Pre-publish gate: discard setups whose zone is already penetrated past its far edge, TP1 already reached, or SL breached
    const isValidPrice = bias === 'long'
      ? (currentBid >= entryLow && currentBid > stop && currentBid < tp1 && (currentPrice - entryHigh) <= atr14 * 3.0)
      : (currentAsk <= entryHigh && currentAsk < stop && currentAsk > tp1 && (entryLow - currentPrice) <= atr14 * 3.0);

    if (!isValidPrice) continue;

    const r1 = computeRMultiple(entryMid, tp1, stop, bias);
    const r2 = computeRMultiple(entryMid, tp2, stop, bias);
    if (r1 < 1.95) continue;

    selectedZone = {
      entryLow,
      entryHigh,
      entryMid,
      stop,
      tp1,
      tp2,
      r1,
      r2,
      risk: publishedRisk,
      anchorTime: anchorBar.timestamp
    };
    break;
  }

  if (!selectedZone) {
    return null;
  }

  const { entryLow, entryHigh, entryMid, stop, tp1, tp2, r1, r2, risk, anchorTime } = selectedZone;
  const nowIso = new Date().toISOString();

  // Limit fill check at creation: strictly inside [entryLow, entryHigh] so full planned risk stays intact
  const filledAtCreation = bias === 'long'
    ? (currentAsk >= entryLow && currentAsk <= entryHigh && currentBid > stop)
    : (currentBid >= entryLow && currentBid <= entryHigh && currentAsk < stop);

  const signalState: 'active' | 'awaiting_entry' = filledAtCreation ? 'active' : 'awaiting_entry';
  const entryPriceRecorded = filledAtCreation
    ? round(Math.max(entryLow, Math.min(entryHigh, bias === 'long' ? currentAsk : currentBid)))
    : undefined;
  const entryTriggeredAt = filledAtCreation ? nowIso : undefined;

  const inZone = currentPrice >= entryLow && currentPrice <= entryHigh;
  const distanceRaw = inZone
    ? 0
    : Math.abs(currentPrice - entryMid) / Math.max(risk, 1e-6);
  const distanceR = Number(Math.min(9.99, distanceRaw).toFixed(2));

  const unrealizedR = filledAtCreation
    ? Number(
        ((bias === 'long' ? currentPrice - (entryPriceRecorded || entryMid) : (entryPriceRecorded || entryMid) - currentPrice) / Math.max(risk, 1e-6)).toFixed(2)
      )
    : undefined;

  const lastVol = entryCandles[entryCandles.length - 1].volume || 10000;
  const avgVol =
    entryCandles.reduce((acc, c) => acc + (c.volume || 10000), 0) / entryCandles.length;
  const spread = quote?.spread && quote.spread > 0
    ? quote.spread
    : currentPrice * (market === 'forex' ? 0.0002 : 0.0001);
  const liquidityScore = computeLiquidityScore(lastVol, avgVol, spread);

  const convictionScore = computeConvictionScore({
    supportResistanceStrength: 0.84,
    structureAlignment: strength,
    volumeProfile: Math.min(0.95, 0.75 + (lastVol / Math.max(avgVol, 1)) * 0.1),
    killzoneTiming: 0.88,
    multiTimeframeAlignment: strength,
    liquidityPoolMagnet: 0.83,
    fvgDisbalance: 0.81,
    relativeStrength: 0.84,
    atrAlignment: 0.85
  });

  const killzone = getActiveSessionNameUTC();
  const styleLabel = style === 'scalp' ? 'Scalping' : 'Swing';
  const efSuffix = efDecision
    ? ` EdgeFinder: ${efDecision.biasLabel} (${efDecision.score > 0 ? '+' : ''}${efDecision.score}) · ${efDecision.summary}.`
    : '';
  const selectionRationale = `${styleLabel} desk (${contextLabel} Context + ${entryLabel} Entry). ${bias.toUpperCase()} structural alignment detected on ${contextLabel} with ${entryLabel} liquidity retrace zone at ${entryMid}. Risk floor calibrated to ${entryLabel} ATR with ${r1.toFixed(2)}R TP1 / ${r2.toFixed(2)}R TP2.${efSuffix}`;

  const uniqueId = `mtf-${style}-${style === 'swing' ? swingMode + '-' : ''}${instrument.replace('/', '')}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  return {
    id: uniqueId,
    instrument,
    market,
    strategy_id: style === 'scalp' ? 'manna_scalper' : 'manna_swing',
    trading_style: style === 'scalp' ? 'SCALP' : 'SWING',
    context_tf: contextLabel,
    entry_tf: entryLabel,
    bias,
    signal_state: signalState,
    state: signalState,
    entry_zone_low: entryLow,
    entry_zone_high: entryHigh,
    entry_zone_mid: entryMid,
    stop,
    initial_stop: stop,
    tp1,
    tp2,
    r_multiple_1: r1,
    r_multiple_2: r2,
    conviction_score: convictionScore,
    liquidity_score: liquidityScore,
    current_price: round(currentPrice),
    distance_to_entry_r: distanceR,
    unrealizedR,
    is_breakeven: 0,
    entry_price_recorded: entryPriceRecorded,
    entry_triggered_at: entryTriggeredAt,
    created_at: nowIso,
    killzone_origin: killzone,
    metadata: JSON.stringify({
      source: 'mtf_isolated_desk',
      trading_style: style.toUpperCase(),
      htf: contextLabel,
      ltf: entryLabel,
      context_tf: contextLabel,
      entry_tf: entryLabel,
      entry_zone_base_time: anchorTime,
      order_type: filledAtCreation ? 'MARKET ORDER' : (bias === 'long' ? 'BUY LIMIT' : 'SELL LIMIT'),
      edgefinder_confluence: efDecision ? {
        matchType: efDecision.matchType,
        score: efDecision.score,
        biasLabel: efDecision.biasLabel,
        summary: efDecision.summary
      } : undefined,
      selection_rationale: selectionRationale
    })
  };
}

export async function getMtfStyleSignals(
  style: TradingStyleMode,
  swingMode: SwingPairMode = 'd1_h4',
  forceRefresh = false
): Promise<MtfStyleSnapshot> {
  const cacheKey = style === 'scalp' ? 'scalp' : `swing:${swingMode}`;
  const ttl = style === 'scalp' ? SCALP_TTL_MS : SWING_TTL_MS;

  const inflight = inflightRequests.get(cacheKey);
  if (!forceRefresh && inflight) {
    return inflight;
  }

  const promise = (async (): Promise<MtfStyleSnapshot> => {
    const existingScan = discoveryCache.get(cacheKey);
    const shouldDiscover = forceRefresh || !existingScan || Date.now() - existingScan.ts >= ttl;

    const edgeSnapshot = await buildEdgeFinderSnapshot(false).catch(() => null);
    const edgeByInst = new Map<string, AssetEdgeScorecard>();
    if (edgeSnapshot?.scorecards) {
      for (const sc of edgeSnapshot.scorecards) {
        edgeByInst.set(sc.instrument.toUpperCase(), sc);
      }
    }
    const hasEdgeData = edgeByInst.size > 0;

    const now = new Date();
    const enforceSessionWindow = process.env.NODE_ENV !== 'test';
    const canScanFutures = !enforceSessionWindow || isTradingSessionActive('futures', now);
    const canScanForex = !enforceSessionWindow || isTradingSessionActive('forex', now);

    let discoveredCandidates: MtfStyleSetup[] = [];
    if (shouldDiscover && (canScanFutures || canScanForex)) {
      const targets: Array<{ instrument: string; market: 'futures' | 'forex' }> = [
        ...(canScanFutures ? FUTURES_INSTRUMENTS.map((instrument) => ({ instrument, market: 'futures' as const })) : []),
        ...(canScanForex ? FOREX_INSTRUMENTS.map((instrument) => ({ instrument, market: 'forex' as const })) : [])
      ];

      const settled = await Promise.allSettled(
        targets.map((t) =>
          buildSetupForInstrument(
            t.instrument,
            t.market,
            style,
            swingMode,
            edgeByInst.get(t.instrument.toUpperCase()) || null,
            hasEdgeData
          )
        )
      );

      discoveredCandidates = settled
        .filter((r): r is PromiseFulfilledResult<MtfStyleSetup | null> => r.status === 'fulfilled' && r.value !== null)
        .map((r) => r.value!)
        .sort((a, b) => b.conviction_score - a.conviction_score);

      discoveryCache.set(cacheKey, { ts: Date.now() });
    }

    // Always evaluate open tracked setups against live prices & intra-bar candles and return persisted state
    const board = await syncMtfSetupsAndGetLiveBoard(
      style,
      swingMode,
      discoveredCandidates,
      hasEdgeData ? edgeByInst : undefined
    );

    const contextTf = style === 'scalp' ? '15M' : swingMode === 'd1_h4' ? '1D' : '4H';
    const entryTf = style === 'scalp' ? '5M' : swingMode === 'd1_h4' ? '4H' : '1H';

    return {
      style,
      swingMode: style === 'swing' ? swingMode : undefined,
      contextTf,
      entryTf,
      setups: board.setups,
      runnerSetups: board.runnerSetups,
      pastSetups: board.pastSetups,
      generatedAt: new Date().toISOString(),
      cached: !shouldDiscover
    };
  })().finally(() => {
    inflightRequests.delete(cacheKey);
  });

  inflightRequests.set(cacheKey, promise);
  return promise;
}
