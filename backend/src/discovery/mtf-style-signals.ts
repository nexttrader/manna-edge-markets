import { FOREX_INSTRUMENTS, FUTURES_INSTRUMENTS } from './mock-data';
import { getInstrumentDecimals } from './stop-loss-rules';
import { Bias, CandidateSetup } from './types';
import { getLiveQuoteDetails, prefetchLiveQuotes } from './yahoo-provider';
import { getUnifiedMarketBiasesForTimeframes } from './bias-engine';
import { MannaSndStrategy, type MannaSndTimeframeConfig } from './strategies/manna-snd';
import {
  evaluateEdgeFinderConfluence,
  getOpenMtfLeaderBias,
  syncMtfSetupsAndGetLiveBoard,
  type EdgeFinderConfluenceDecision
} from './mtf-style-tracker';
import {
  buildEdgeFinderSnapshot,
  type AssetEdgeScorecard
} from '../edge-finder/edge-finder-service';
import { getCurrentKillzone, isTradingSessionActive } from '../scheduler/killzone-mapper';
import { newsEngine } from '../news/news-engine';
import * as queries from '../db/queries';
import { createLogger } from '../telemetry/logger';

export { evaluateEdgeFinderConfluence, type EdgeFinderConfluenceDecision };

const logger = createLogger('MtfStyleSignals');
const mannaSndEngine = new MannaSndStrategy();

const POSITIVE_DOLLAR_PAIRS = ['GBP/USD', 'AUD/USD', 'NZD/USD'];
const INVERSE_DOLLAR_PAIRS = ['USD/JPY', 'USD/CAD', 'USD/CHF'];

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

const SCALP_TTL_MS = 5 * 60_000;
const SWING_TTL_MS = 15 * 60_000;

const discoveryCache = new Map<string, { ts: number }>();
const inflightRequests = new Map<string, Promise<MtfStyleSnapshot>>();

function getTimeframeConfig(style: TradingStyleMode, swingMode: SwingPairMode): MannaSndTimeframeConfig {
  if (style === 'scalp') {
    return {
      htf: '15m',
      ltf: '5m',
      htfLabel: '15M',
      ltfLabel: '5M',
      strategyId: 'manna_scalper',
      tradingStyle: 'SCALP',
      sourceTag: 'mtf_manna_snd'
    };
  }
  if (swingMode === 'h4_h1') {
    return {
      htf: '4h',
      ltf: '1h',
      htfLabel: '4H',
      ltfLabel: '1H',
      strategyId: 'manna_swing',
      tradingStyle: 'SWING',
      sourceTag: 'mtf_manna_snd'
    };
  }
  return {
    htf: '1d',
    ltf: '4h',
    htfLabel: '1D',
    ltfLabel: '4H',
    strategyId: 'manna_swing',
    tradingStyle: 'SWING',
    sourceTag: 'mtf_manna_snd'
  };
}

function isWithinHighImpactNewsWindow(now: Date): boolean {
  try {
    const newsInfo = newsEngine.hasNyAmHighImpactNews(now);
    if (!newsInfo.hasNews || !newsInfo.events || newsInfo.events.length === 0) {
      return false;
    }
    const nowMs = now.getTime();
    return newsInfo.events.some((ev) => {
      const evMs = new Date(ev.eventTime).getTime();
      return Number.isFinite(evMs) && Math.abs(nowMs - evMs) <= 30 * 60 * 1000;
    });
  } catch {
    return false;
  }
}

async function convertCandidateToMtfSetup(
  c: CandidateSetup,
  style: TradingStyleMode,
  swingMode: SwingPairMode,
  contextLabel: string,
  entryLabel: string,
  nowIso: string
): Promise<MtfStyleSetup | null> {
  const quote = await getLiveQuoteDetails(c.instrument).catch(() => null);
  const market = c.market === 'forex' ? 'forex' : 'futures';
  const decimals = getInstrumentDecimals(c.instrument, market);
  const round = (v: number) => Number(v.toFixed(decimals));

  const currentPrice = quote?.price && quote.price > 0 ? quote.price : c.entry_zone_mid;
  if (!currentPrice || currentPrice <= 0) return null;

  const currentBid = quote?.bid && quote.bid > 0 ? quote.bid : currentPrice;
  const currentAsk = quote?.ask && quote.ask > 0 ? quote.ask : currentPrice;

  const defaultSpread = market === 'forex' ? (c.instrument.includes('JPY') ? 0.015 : 0.00012) : 0.25;
  const effectiveSpread = quote?.spread && quote.spread > 0
    ? Math.min(quote.spread, defaultSpread * 2.5)
    : defaultSpread;

  const publishedRisk = Math.abs(c.entry_zone_mid - c.stop);
  if (publishedRisk <= 0) return null;

  // Never allow spread cost to exceed 22% of the stop distance
  if (effectiveSpread / publishedRisk > 0.22) return null;

  const isLong = c.bias === 'long';
  // Pre-publish Bid/Ask gate: discard setups whose SL is already breached or TP1 already hit
  const isInvalidLivePrice = isLong
    ? (currentBid <= c.stop || currentBid >= c.tp1)
    : (currentAsk >= c.stop || currentAsk <= c.tp1);
  if (isInvalidLivePrice) return null;

  const zoneLow = Math.min(c.entry_zone_low, c.entry_zone_high);
  const zoneHigh = Math.max(c.entry_zone_low, c.entry_zone_high);
  const inZone = currentPrice >= zoneLow && currentPrice <= zoneHigh;
  const distanceRaw = inZone
    ? 0
    : Math.abs(currentPrice - c.entry_zone_mid) / Math.max(publishedRisk, 1e-6);
  const distanceR = Number(Math.min(9.99, distanceRaw).toFixed(2));

  const r1 = c.r_multiple_1 ?? 2.0;
  const r2 = c.r_multiple_2 ?? 3.0;
  const tp2 = c.tp2 ?? round(isLong ? c.entry_zone_mid + publishedRisk * 3.0 : c.entry_zone_mid - publishedRisk * 3.0);
  const uniqueId = `mtf-${style}-${style === 'swing' ? swingMode + '-' : ''}${c.instrument.replace('/', '')}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  // Pending Limit Orders ONLY at creation (matching Intraday PublishGate)
  return {
    id: uniqueId,
    instrument: c.instrument,
    market,
    strategy_id: style === 'scalp' ? 'manna_scalper' : 'manna_swing',
    trading_style: style === 'scalp' ? 'SCALP' : 'SWING',
    context_tf: contextLabel,
    entry_tf: entryLabel,
    bias: c.bias,
    signal_state: 'awaiting_entry',
    state: 'awaiting_entry',
    entry_zone_low: c.entry_zone_low,
    entry_zone_high: c.entry_zone_high,
    entry_zone_mid: c.entry_zone_mid,
    stop: c.stop,
    initial_stop: c.stop,
    tp1: c.tp1,
    tp2,
    r_multiple_1: r1,
    r_multiple_2: r2,
    conviction_score: c.conviction_score ?? 85,
    liquidity_score: c.liquidity_score ?? 85,
    current_price: round(currentPrice),
    distance_to_entry_r: distanceR,
    unrealizedR: undefined,
    is_breakeven: 0,
    entry_price_recorded: undefined,
    entry_triggered_at: undefined,
    created_at: nowIso,
    killzone_origin: c.killzone_origin || 'ny_am',
    metadata: c.metadata || '{}'
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
    const tfConfig = getTimeframeConfig(style, swingMode);
    const contextTf = tfConfig.htfLabel || (style === 'scalp' ? '15M' : swingMode === 'd1_h4' ? '1D' : '4H');
    const entryTf = tfConfig.ltfLabel || (style === 'scalp' ? '5M' : swingMode === 'd1_h4' ? '4H' : '1H');

    let discoveredCandidates: MtfStyleSetup[] = [];
    let didDiscover = false;

    if (shouldDiscover && (canScanFutures || canScanForex)) {
      didDiscover = true;
      const killzone = getCurrentKillzone(now);
      const runId = `mtf_${style}_${swingMode}_${Date.now()}`;
      const disabledAssets = await queries.getDisabledDisplayAssets(killzone.killzone);

      const targetFutures = canScanFutures
        ? FUTURES_INSTRUMENTS.filter((i) => !disabledAssets.includes(i))
        : [];
      const targetForex = canScanForex
        ? FOREX_INSTRUMENTS.filter((i) => !disabledAssets.includes(i))
        : [];
      const allTargets = [...targetFutures, ...targetForex];

      if (allTargets.length > 0) {
        await prefetchLiveQuotes(allTargets);
        const unifiedBiases = await getUnifiedMarketBiasesForTimeframes(allTargets, tfConfig.htf, tfConfig.ltf);

        const futuresCandidates = targetFutures.length > 0
          ? await mannaSndEngine.evaluateSetupsForTimeframes(
              killzone,
              runId,
              'futures',
              targetFutures,
              unifiedBiases,
              tfConfig
            )
          : [];

        const forexCandidates: CandidateSetup[] = [];
        if (targetForex.length > 0) {
          const isPreLondonFilterActive = await queries.isPreLondonFilterEnabled('manna_snd');
          const currentUtcHour = now.getUTCHours();
          const isPreLondonWindow = killzone.killzone !== 'london' && (currentUtcHour >= 4 && currentUtcHour < 7);
          const inNewsWindow = isWithinHighImpactNewsWindow(now);

          if (isPreLondonFilterActive && isPreLondonWindow) {
            logger.info(
              { style, swingMode, utcHour: currentUtcHour, killzone: killzone.killzone },
              'Pre-London Forex Filter active: suppressing MTF Forex discovery during pre-session rollover.'
            );
          } else if (inNewsWindow) {
            logger.info(
              { style, swingMode },
              'High-impact news window (±30m): suppressing MTF Forex discovery until post-release stabilization.'
            );
          } else {
            // 1. Evaluate EUR/USD first as Macro Dollar Leader
            let leaderBias: Bias | null = null;
            const eurCandidates = targetForex.includes('EUR/USD')
              ? await mannaSndEngine.evaluateSetupsForTimeframes(
                  killzone,
                  runId,
                  'forex',
                  ['EUR/USD'],
                  unifiedBiases,
                  tfConfig
                )
              : [];

            if (eurCandidates.length > 0) {
              leaderBias = eurCandidates[0].bias;
            }

            if (!leaderBias) {
              leaderBias = await getOpenMtfLeaderBias(style, swingMode);
            }
            if (!leaderBias) {
              if (unifiedBiases['EUR/USD']) {
                leaderBias = unifiedBiases['EUR/USD'];
              } else {
                const directEur = await getUnifiedMarketBiasesForTimeframes(['EUR/USD'], tfConfig.htf, tfConfig.ltf);
                leaderBias = directEur['EUR/USD'] || 'long';
              }
            }

            // 2. Align Follower Biases with EUR/USD Dollar Leader
            const followerBiases: Record<string, Bias> = { ...unifiedBiases };
            if (leaderBias) {
              for (const inst of targetForex) {
                const upper = inst.toUpperCase();
                if (POSITIVE_DOLLAR_PAIRS.includes(upper)) {
                  followerBiases[inst] = leaderBias;
                } else if (INVERSE_DOLLAR_PAIRS.includes(upper)) {
                  followerBiases[inst] = leaderBias === 'long' ? 'short' : 'long';
                }
              }
            }

            // 3. Evaluate non-EUR/USD Forex pairs
            const nonEurForex = targetForex.filter((i) => i.toUpperCase() !== 'EUR/USD');
            const rawFollowerCandidates = nonEurForex.length > 0
              ? await mannaSndEngine.evaluateSetupsForTimeframes(
                  killzone,
                  runId,
                  'forex',
                  nonEurForex,
                  followerBiases,
                  tfConfig
                )
              : [];

            // 4. Strict Leader-Correlation Enforcement + Aligned Re-scan
            const finalFollowerCandidates: CandidateSetup[] = [];
            for (const cand of rawFollowerCandidates) {
              const upper = cand.instrument.toUpperCase();
              const isPositive = POSITIVE_DOLLAR_PAIRS.includes(upper);
              const isInverse = INVERSE_DOLLAR_PAIRS.includes(upper);

              if (leaderBias && (isPositive || isInverse)) {
                const expectedBias: Bias = isPositive ? leaderBias : (leaderBias === 'long' ? 'short' : 'long');
                if (cand.bias !== expectedBias) {
                  const reevaluated = await mannaSndEngine.evaluateSetupsForTimeframes(
                    killzone,
                    runId,
                    'forex',
                    [cand.instrument],
                    { [cand.instrument]: expectedBias },
                    tfConfig
                  );
                  const aligned = reevaluated.find((s) => s.bias === expectedBias);
                  if (aligned) {
                    finalFollowerCandidates.push(aligned);
                  }
                  continue;
                }
              }
              finalFollowerCandidates.push(cand);
            }

            forexCandidates.push(...eurCandidates, ...finalFollowerCandidates);
          }
        }

        const nowIso = now.toISOString();
        const converted = await Promise.all(
          [...futuresCandidates, ...forexCandidates].map((c) =>
            convertCandidateToMtfSetup(c, style, swingMode, contextTf, entryTf, nowIso)
          )
        );

        discoveredCandidates = converted
          .filter((s): s is MtfStyleSetup => s !== null)
          .sort((a, b) => b.conviction_score - a.conviction_score);
      }

      discoveryCache.set(cacheKey, { ts: Date.now() });
    }

    // Always evaluate open tracked setups against live prices & intra-bar candles and return persisted state
    const board = await syncMtfSetupsAndGetLiveBoard(
      style,
      swingMode,
      discoveredCandidates,
      hasEdgeData ? edgeByInst : undefined,
      didDiscover
    );

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

let mtfWarmupInitTimer: NodeJS.Timeout | null = null;
let mtfScalpWarmupTimer: NodeJS.Timeout | null = null;
let mtfSwingWarmupTimer: NodeJS.Timeout | null = null;

function runMtfWarmupCycle(style: TradingStyleMode, swingMode: SwingPairMode = 'd1_h4'): void {
  const now = new Date();
  if (!isTradingSessionActive('futures', now) && !isTradingSessionActive('forex', now)) return;
  const cacheKey = style === 'scalp' ? 'scalp' : `swing:${swingMode}`;
  if (inflightRequests.has(cacheKey)) return;
  void getMtfStyleSignals(style, swingMode, true).catch(() => {});
}

export function startMtfDiscoveryWarmup(): void {
  if (process.env.NODE_ENV === 'test') return;
  if (mtfWarmupInitTimer || mtfScalpWarmupTimer || mtfSwingWarmupTimer) return;

  mtfWarmupInitTimer = setTimeout(() => {
    mtfWarmupInitTimer = null;
    runMtfWarmupCycle('scalp', 'd1_h4');
    runMtfWarmupCycle('swing', 'd1_h4');
    runMtfWarmupCycle('swing', 'h4_h1');
  }, 4_000);

  mtfScalpWarmupTimer = setInterval(() => {
    runMtfWarmupCycle('scalp', 'd1_h4');
  }, 5 * 60_000);

  mtfSwingWarmupTimer = setInterval(() => {
    runMtfWarmupCycle('swing', 'd1_h4');
    runMtfWarmupCycle('swing', 'h4_h1');
  }, 15 * 60_000);
}

export function stopMtfDiscoveryWarmup(): void {
  if (mtfWarmupInitTimer) {
    clearTimeout(mtfWarmupInitTimer);
    mtfWarmupInitTimer = null;
  }
  if (mtfScalpWarmupTimer) {
    clearInterval(mtfScalpWarmupTimer);
    mtfScalpWarmupTimer = null;
  }
  if (mtfSwingWarmupTimer) {
    clearInterval(mtfSwingWarmupTimer);
    mtfSwingWarmupTimer = null;
  }
}
