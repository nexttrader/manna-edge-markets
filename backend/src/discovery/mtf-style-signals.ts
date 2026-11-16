import { computeATR } from './atr';
import { FOREX_INSTRUMENTS, FUTURES_INSTRUMENTS } from './mock-data';
import { computeConvictionScore, computeLiquidityScore, computeRMultiple } from './scoring';
import { getLogicalStopDistance } from './stop-loss-rules';
import { Bias, Candle } from './types';
import { getLiveCandles, getLiveCurrentPrice } from './yahoo-provider';
import { recordAndSyncMtfSetups } from './mtf-style-tracker';

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
  signal_state: 'active' | 'awaiting_entry';
  state: 'active' | 'awaiting_entry';
  entry_zone_low: number;
  entry_zone_high: number;
  entry_zone_mid: number;
  stop: number;
  tp1: number;
  tp2: number;
  r_multiple_1: number;
  r_multiple_2: number;
  conviction_score: number;
  liquidity_score: number;
  current_price: number;
  distance_to_entry_r: number;
  unrealizedR?: number;
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
  generatedAt: string;
  cached: boolean;
}

const SCALP_TTL_MS = 60_000;
const SWING_TTL_MS = 120_000;

const snapshotCache = new Map<string, { data: MtfStyleSnapshot; ts: number }>();
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

/**
 * Aggregates hourly (or smaller) bars into true 4-hour OHLC candles
 * when an upstream provider (like Yahoo fallback) returns 1h bars for '4h'.
 */
function ensureFourHourCandles(candles: Candle[]): Candle[] {
  if (candles.length < 8) return candles;
  const t0 = new Date(candles[0].timestamp).getTime();
  const t1 = new Date(candles[1].timestamp).getTime();
  const deltaHours = Math.abs(t1 - t0) / (1000 * 60 * 60);
  if (deltaHours >= 3.5) {
    return candles;
  }

  const grouped: Candle[] = [];
  for (let i = 0; i + 3 < candles.length; i += 4) {
    const slice = candles.slice(i, i + 4);
    grouped.push({
      open: slice[0].open,
      high: Math.max(...slice.map((c) => c.high)),
      low: Math.min(...slice.map((c) => c.low)),
      close: slice[slice.length - 1].close,
      volume: slice.reduce((acc, c) => acc + (c.volume || 0), 0),
      timestamp: slice[slice.length - 1].timestamp
    });
  }
  return grouped;
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

function determineDirectionalBias(contextCandles: Candle[], fastPeriod: number, slowPeriod: number): { bias: Bias; strength: number } {
  const closes = contextCandles.map((c) => c.close);
  const emaFast = computeEma(closes, fastPeriod);
  const emaSlow = computeEma(closes, slowPeriod);
  const latestClose = closes[closes.length - 1] || 1;
  const spreadPct = Math.abs(emaFast - emaSlow) / Math.max(latestClose, 1e-6);

  const recentSlice = contextCandles.slice(-6);
  const netMove = recentSlice.length >= 2
    ? recentSlice[recentSlice.length - 1].close - recentSlice[0].open
    : 0;

  let bias: Bias = emaFast >= emaSlow ? 'long' : 'short';
  if (spreadPct < 0.0002 && netMove !== 0) {
    bias = netMove >= 0 ? 'long' : 'short';
  }

  const strength = Math.min(1, 0.72 + Math.min(0.24, spreadPct * 80));
  return { bias, strength };
}

async function buildSetupForInstrument(
  instrument: string,
  market: 'futures' | 'forex',
  style: TradingStyleMode,
  swingMode: SwingPairMode
): Promise<MtfStyleSetup | null> {
  const contextTfCode: '15m' | '4h' | '1d' =
    style === 'scalp' ? '15m' : swingMode === 'd1_h4' ? '1d' : '4h';
  const entryTfCode: '5m' | '4h' | '1h' =
    style === 'scalp' ? '5m' : swingMode === 'd1_h4' ? '4h' : '1h';

  const contextLabel =
    style === 'scalp' ? '15M' : swingMode === 'd1_h4' ? '1D' : '4H';
  const entryLabel =
    style === 'scalp' ? '5M' : swingMode === 'd1_h4' ? '4H' : '1H';

  const [rawContext, rawEntry, livePrice] = await Promise.all([
    getLiveCandles(instrument, contextTfCode, contextTfCode === '4h' ? 160 : 60),
    getLiveCandles(instrument, entryTfCode, entryTfCode === '4h' ? 160 : 60),
    getLiveCurrentPrice(instrument)
  ]);

  const contextCandles = contextTfCode === '4h' ? ensureFourHourCandles(rawContext) : rawContext;
  const entryCandles = entryTfCode === '4h' ? ensureFourHourCandles(rawEntry) : rawEntry;

  if (contextCandles.length < 15 || entryCandles.length < 15) {
    return null;
  }

  const currentPrice = livePrice > 0 ? livePrice : entryCandles[entryCandles.length - 1].close;
  const atr14 = computeATR(entryCandles, 14);
  if (!atr14 || atr14 <= 0) return null;

  const { bias, strength } = determineDirectionalBias(
    contextCandles,
    style === 'scalp' ? 9 : 12,
    style === 'scalp' ? 21 : 26
  );

  const recentLookback = style === 'scalp' ? 12 : 10;
  const recentBars = entryCandles.slice(-recentLookback);
  const swingLow = Math.min(...recentBars.map((c) => c.low));
  const swingHigh = Math.max(...recentBars.map((c) => c.high));

  const zoneOffsetMult = style === 'scalp' ? 0.35 : 0.45;
  const stopPadMult = style === 'scalp' ? 0.12 : 0.20;
  const zoneHalfWidthMult = style === 'scalp' ? 0.14 : 0.18;

  let entryMid = currentPrice;
  let rawStop = currentPrice;

  if (bias === 'long') {
    entryMid = swingLow + atr14 * zoneOffsetMult;
    rawStop = swingLow - atr14 * stopPadMult;
  } else {
    entryMid = swingHigh - atr14 * zoneOffsetMult;
    rawStop = swingHigh + atr14 * stopPadMult;
  }

  const entryLow = entryMid - atr14 * zoneHalfWidthMult;
  const entryHigh = entryMid + atr14 * zoneHalfWidthMult;

  const rawRisk = Math.abs(entryMid - rawStop);
  const risk =
    market === 'forex'
      ? getLogicalStopDistance(instrument, atr14, rawRisk, 'forex', false)
      : Math.max(rawRisk, atr14 * 0.45);

  const stop = bias === 'long' ? entryMid - risk : entryMid + risk;
  const tp1 = bias === 'long' ? entryMid + risk * 2 : entryMid - risk * 2;
  const tp2 = bias === 'long' ? entryMid + risk * 3 : entryMid - risk * 3;

  const r1 = computeRMultiple(entryMid, tp1, stop, bias);
  const r2 = computeRMultiple(entryMid, tp2, stop, bias);

  const decimals = market === 'forex' ? (instrument.includes('JPY') ? 3 : 5) : 2;
  const round = (v: number) => Number(v.toFixed(decimals));

  const inZone = currentPrice >= entryLow && currentPrice <= entryHigh;
  const distanceRaw =
    inZone
      ? 0
      : bias === 'long'
        ? Math.max(0, (currentPrice - entryHigh) / Math.max(risk, 1e-6))
        : Math.max(0, (entryLow - currentPrice) / Math.max(risk, 1e-6));

  const distanceR = Number(Math.min(9.99, distanceRaw).toFixed(2));
  const signalState: 'active' | 'awaiting_entry' = inZone ? 'active' : 'awaiting_entry';
  const unrealizedR = inZone
    ? Number(
        ((bias === 'long' ? currentPrice - entryMid : entryMid - currentPrice) / Math.max(risk, 1e-6)).toFixed(2)
      )
    : undefined;

  const lastVol = entryCandles[entryCandles.length - 1].volume || 10000;
  const avgVol =
    entryCandles.reduce((acc, c) => acc + (c.volume || 10000), 0) / entryCandles.length;
  const spread = currentPrice * (market === 'forex' ? 0.0002 : 0.0001);
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
  const selectionRationale = `${styleLabel} desk (${contextLabel} Context + ${entryLabel} Entry). ${bias.toUpperCase()} structural alignment detected on ${contextLabel} with ${entryLabel} liquidity retrace zone at ${round(entryMid)}. Risk floor calibrated with ${r1.toFixed(2)}R TP1 / ${r2.toFixed(2)}R TP2.`;

  const nowIso = new Date().toISOString();

  return {
    id: `mtf-${style}-${style === 'swing' ? swingMode + '-' : ''}${instrument.replace('/', '')}`,
    instrument,
    market,
    strategy_id: style === 'scalp' ? 'manna_scalper' : 'manna_swing',
    trading_style: style === 'scalp' ? 'SCALP' : 'SWING',
    context_tf: contextLabel,
    entry_tf: entryLabel,
    bias,
    signal_state: signalState,
    state: signalState,
    entry_zone_low: round(entryLow),
    entry_zone_high: round(entryHigh),
    entry_zone_mid: round(entryMid),
    stop: round(stop),
    tp1: round(tp1),
    tp2: round(tp2),
    r_multiple_1: r1,
    r_multiple_2: r2,
    conviction_score: convictionScore,
    liquidity_score: liquidityScore,
    current_price: round(currentPrice),
    distance_to_entry_r: distanceR,
    unrealizedR,
    created_at: nowIso,
    killzone_origin: killzone,
    metadata: JSON.stringify({
      source: 'mtf_isolated_desk',
      trading_style: style.toUpperCase(),
      htf: contextLabel,
      ltf: entryLabel,
      context_tf: contextLabel,
      entry_tf: entryLabel,
      order_type: bias === 'long' ? 'BUY LIMIT' : 'SELL LIMIT',
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

  const existing = snapshotCache.get(cacheKey);
  if (!forceRefresh && existing && Date.now() - existing.ts < ttl) {
    return { ...existing.data, cached: true };
  }

  const inflight = inflightRequests.get(cacheKey);
  if (!forceRefresh && inflight) {
    return inflight;
  }

  const promise = (async (): Promise<MtfStyleSnapshot> => {
    const targets: Array<{ instrument: string; market: 'futures' | 'forex' }> = [
      ...FUTURES_INSTRUMENTS.map((instrument) => ({ instrument, market: 'futures' as const })),
      ...FOREX_INSTRUMENTS.map((instrument) => ({ instrument, market: 'forex' as const }))
    ];

    const settled = await Promise.allSettled(
      targets.map((t) => buildSetupForInstrument(t.instrument, t.market, style, swingMode))
    );

    const setups: MtfStyleSetup[] = settled
      .filter((r): r is PromiseFulfilledResult<MtfStyleSetup | null> => r.status === 'fulfilled' && r.value !== null)
      .map((r) => r.value!)
      .sort((a, b) => b.conviction_score - a.conviction_score);

    const contextTf = style === 'scalp' ? '15M' : swingMode === 'd1_h4' ? '1D' : '4H';
    const entryTf = style === 'scalp' ? '5M' : swingMode === 'd1_h4' ? '4H' : '1H';

    const snapshot: MtfStyleSnapshot = {
      style,
      swingMode: style === 'swing' ? swingMode : undefined,
      contextTf,
      entryTf,
      setups,
      generatedAt: new Date().toISOString(),
      cached: false
    };

    await recordAndSyncMtfSetups(setups);
    snapshotCache.set(cacheKey, { data: snapshot, ts: Date.now() });
    return snapshot;
  })().finally(() => {
    inflightRequests.delete(cacheKey);
  });

  inflightRequests.set(cacheKey, promise);
  return promise;
}
