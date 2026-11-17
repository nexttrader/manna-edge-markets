import { isPg, queryDb } from '../db/database';
import { computeBlendedRealizedR } from '../analytics/r-accounting';
import { computeATR } from './atr';
import type { MtfStyleSetup, SwingPairMode, TradingStyleMode } from './mtf-style-signals';
import type { AssetEdgeScorecard, EdgeBiasLabel } from '../edge-finder/edge-finder-service';
import { getInstrumentDecimals } from './stop-loss-rules';
import { Bias, Candle } from './types';
import { getLiveCandles, getLiveQuoteDetails, LiveQuoteDetails } from './yahoo-provider';
import { getCurrentKillzone, isMarketOpen, mapTimestampToKillzone } from '../scheduler/killzone-mapper';

export interface EdgeFinderConfluenceDecision {
  approved: boolean;
  matchType: 'STRONG_CONFLUENCE' | 'STYLE_AND_OVERALL_AGREEMENT' | 'REJECTED';
  reason: string;
  score: number;
  biasLabel: string;
  summary: string;
}

function edgeLabelMatchesBias(label: EdgeBiasLabel, bias: Bias): boolean {
  return bias === 'long'
    ? label === 'Buy' || label === 'Strong Buy'
    : label === 'Sell' || label === 'Strong Sell';
}

function edgeLabelIsStrongForBias(label: EdgeBiasLabel, bias: Bias): boolean {
  return bias === 'long' ? label === 'Strong Buy' : label === 'Strong Sell';
}

function classifyHorizonStatus(bias: Bias, score: number): 'AGREES' | 'COUNTER' | 'NEUTRAL' {
  if (bias === 'long') {
    if (score >= 0.5) return 'AGREES';
    if (score <= -0.5) return 'COUNTER';
    return 'NEUTRAL';
  }
  if (score <= -0.5) return 'AGREES';
  if (score >= 0.5) return 'COUNTER';
  return 'NEUTRAL';
}

/**
 * Gates Scalping & Swing signals strictly on EdgeFinder Agreement OR Strong Confluence.
 * Rejects any signal that would render COUNTER MACRO BIAS or EDGEFINDER NEUTRAL (e.g. Intraday opposing).
 * Intraday signals are never filtered here and remain untouched.
 */
export function evaluateEdgeFinderConfluence(
  scorecard: AssetEdgeScorecard | null | undefined,
  style: TradingStyleMode,
  bias: Bias
): EdgeFinderConfluenceDecision {
  if (!scorecard) {
    return {
      approved: false,
      matchType: 'REJECTED',
      reason: 'Missing EdgeFinder scorecard',
      score: 0,
      biasLabel: 'Neutral',
      summary: 'No EdgeFinder data'
    };
  }

  const scalpScore = scorecard.timeframes?.SCALP?.score ?? scorecard.totalScore;
  const intraScore = scorecard.timeframes?.INTRADAY?.score ?? scorecard.totalScore;
  const swingScore = scorecard.timeframes?.SWING?.score ?? scorecard.totalScore;

  const scalpStatus = classifyHorizonStatus(bias, scalpScore);
  const intraStatus = classifyHorizonStatus(bias, intraScore);
  const swingStatus = classifyHorizonStatus(bias, swingScore);
  const opposingCount = [scalpStatus, intraStatus, swingStatus].filter(s => s === 'COUNTER').length;
  const agreesCount = [scalpStatus, intraStatus, swingStatus].filter(s => s === 'AGREES').length;

  const profile = style === 'scalp' ? scorecard.timeframes.SCALP : scorecard.timeframes.SWING;
  const conf = scorecard.timeframeConfluence;
  const overallMatches = edgeLabelMatchesBias(scorecard.biasLabel, bias);
  const profileMatches = edgeLabelMatchesBias(profile.biasLabel, bias);
  const dominantMatches = edgeLabelMatchesBias(conf.dominantBias, bias);
  const isStrongOverall = edgeLabelIsStrongForBias(scorecard.biasLabel, bias);
  const isStrongProfile = edgeLabelIsStrongForBias(profile.biasLabel, bias);
  const notCounterTrend = profile.htfConfluence !== 'COUNTER_TREND';

  // Reject immediately if Intraday or any other EdgeFinder horizon is opposing (would show COUNTER MACRO BIAS)
  if (intraStatus === 'COUNTER' || opposingCount > 0) {
    return {
      approved: false,
      matchType: 'REJECTED',
      reason: `Counter macro bias on EdgeFinder horizon (${style.toUpperCase()}: ${profile.biasLabel}, INTRADAY: ${intraScore}, ${conf.summary})`,
      score: profile.score,
      biasLabel: profile.biasLabel,
      summary: conf.summary
    };
  }

  // 1. Strong Confluence: 3/3 aligned horizons OR Strong Buy/Sell confirmed without any counter horizon
  if (
    (conf.allAligned && dominantMatches) ||
    (isStrongProfile && notCounterTrend && overallMatches) ||
    (isStrongOverall && profileMatches)
  ) {
    return {
      approved: true,
      matchType: 'STRONG_CONFLUENCE',
      reason: `Strong EdgeFinder confluence (${conf.summary})`,
      score: profile.score,
      biasLabel: profile.biasLabel,
      summary: conf.summary
    };
  }

  // 2. Agreement: Style horizon & overall EdgeFinder agree without COUNTER_TREND or opposing horizons
  if (profileMatches && overallMatches && notCounterTrend && (intraStatus === 'AGREES' || agreesCount >= 2)) {
    return {
      approved: true,
      matchType: 'STYLE_AND_OVERALL_AGREEMENT',
      reason: `EdgeFinder agrees (${style.toUpperCase()}: ${profile.biasLabel}, Overall: ${scorecard.biasLabel})`,
      score: profile.score,
      biasLabel: profile.biasLabel,
      summary: conf.summary
    };
  }

  return {
    approved: false,
    matchType: 'REJECTED',
    reason: `EdgeFinder conflict/neutral (${style.toUpperCase()}: ${profile.biasLabel} / ${profile.htfConfluence}, Overall: ${scorecard.biasLabel}, ${conf.summary})`,
    score: profile.score,
    biasLabel: profile.biasLabel,
    summary: conf.summary
  };
}

export interface StyleComparisonRow {
  style: 'SCALP' | 'INTRADAY' | 'SWING';
  label: string;
  timeframes: string;
  totalSetups: number;
  awaitingEntry: number;
  activeSetups: number;
  resolvedSetups: number;
  wins: number;
  losses: number;
  breakevens: number;
  winRate: number;
  totalRealizedR: number;
  expectancyR: number;
  avgConviction: number;
  futuresCount: number;
  forexCount: number;
}

export interface TrackedMtfSetupRow {
  id: string;
  signature: string;
  trading_style: 'SCALP' | 'SWING';
  swing_mode: string | null;
  strategy_id: string | null;
  context_tf: string;
  entry_tf: string;
  instrument: string;
  market: string;
  bias: string;
  entry_zone_low: number;
  entry_zone_high: number;
  entry_zone_mid: number;
  stop: number;
  initial_stop: number | null;
  tp1: number;
  tp2: number;
  r_multiple_1: number | null;
  r_multiple_2: number | null;
  conviction_score: number;
  liquidity_score: number;
  killzone_origin: string;
  signal_state: string;
  is_breakeven: number | null;
  realized_r: number;
  last_price: number;
  entry_price_recorded: number | null;
  entry_triggered_at: string | null;
  execution_price: number | null;
  outcome_type: string | null;
  invalidation_reason: string | null;
  invalidation_detail: string | null;
  superseded: number | null;
  superseded_by: string | null;
  metadata: string | null;
  filled_at: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MtfBoardResult {
  setups: MtfStyleSetup[];
  runnerSetups: MtfStyleSetup[];
  pastSetups: MtfStyleSetup[];
}

const OPEN_MTF_STATES = ['awaiting_entry', 'active', 'runner'];
const SCALP_RUNNER_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const SWING_RUNNER_MAX_AGE_MS = 5 * 24 * 60 * 60 * 1000;

let tableEnsured = false;
let lifecycleInterval: NodeJS.Timeout | null = null;
let isSyncingLifecycle = false;

export async function ensureMtfTrackerTable(): Promise<void> {
  if (tableEnsured) return;

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

  const extraColumns: Array<{ name: string; pgType: string; sqliteType: string }> = [
    { name: 'swing_mode', pgType: 'TEXT', sqliteType: 'TEXT' },
    { name: 'strategy_id', pgType: 'TEXT', sqliteType: 'TEXT' },
    { name: 'initial_stop', pgType: 'DOUBLE PRECISION', sqliteType: 'REAL' },
    { name: 'r_multiple_1', pgType: 'DOUBLE PRECISION DEFAULT 2.0', sqliteType: 'REAL DEFAULT 2.0' },
    { name: 'r_multiple_2', pgType: 'DOUBLE PRECISION DEFAULT 3.0', sqliteType: 'REAL DEFAULT 3.0' },
    { name: 'is_breakeven', pgType: 'INTEGER DEFAULT 0', sqliteType: 'INTEGER DEFAULT 0' },
    { name: 'entry_price_recorded', pgType: 'DOUBLE PRECISION', sqliteType: 'REAL' },
    { name: 'entry_triggered_at', pgType: 'TEXT', sqliteType: 'TEXT' },
    { name: 'execution_price', pgType: 'DOUBLE PRECISION', sqliteType: 'REAL' },
    { name: 'outcome_type', pgType: 'TEXT', sqliteType: 'TEXT' },
    { name: 'invalidation_reason', pgType: 'TEXT', sqliteType: 'TEXT' },
    { name: 'invalidation_detail', pgType: 'TEXT', sqliteType: 'TEXT' },
    { name: 'superseded', pgType: 'INTEGER DEFAULT 0', sqliteType: 'INTEGER DEFAULT 0' },
    { name: 'superseded_by', pgType: 'TEXT', sqliteType: 'TEXT' },
    { name: 'metadata', pgType: 'TEXT', sqliteType: 'TEXT' }
  ];

  if (isPg()) {
    for (const col of extraColumns) {
      try {
        await queryDb(`ALTER TABLE mtf_style_setups ADD COLUMN IF NOT EXISTS ${col.name} ${col.pgType}`);
      } catch {
        // Column may already exist
      }
    }
  } else {
    const existingCols = await queryDb<{ name: string }>(`PRAGMA table_info(mtf_style_setups)`);
    const existingSet = new Set(existingCols.map((c) => c.name));
    for (const col of extraColumns) {
      if (!existingSet.has(col.name)) {
        try {
          await queryDb(`ALTER TABLE mtf_style_setups ADD COLUMN ${col.name} ${col.sqliteType}`);
        } catch {
          // Ignore if concurrently added
        }
      }
    }
  }

  // Backfill legacy rows safely
  await queryDb(`
    UPDATE mtf_style_setups
    SET swing_mode = CASE WHEN context_tf = '4H' THEN 'h4_h1' ELSE 'd1_h4' END
    WHERE trading_style = 'SWING' AND swing_mode IS NULL
  `);
  await queryDb(`
    UPDATE mtf_style_setups
    SET strategy_id = CASE WHEN trading_style = 'SCALP' THEN 'manna_scalper' ELSE 'manna_swing' END
    WHERE strategy_id IS NULL
  `);
  await queryDb(`
    UPDATE mtf_style_setups
    SET initial_stop = stop
    WHERE initial_stop IS NULL
  `);
  await queryDb(`
    UPDATE mtf_style_setups
    SET entry_triggered_at = filled_at
    WHERE entry_triggered_at IS NULL AND filled_at IS NOT NULL
  `);

  tableEnsured = true;
}

function getDefaultSpread(instrument: string, market: string): number {
  const sym = instrument.toUpperCase();
  if (market === 'forex') {
    return sym.includes('JPY') ? 0.015 : 0.00012;
  }
  switch (sym) {
    case 'ES':
    case 'NQ':
      return 0.25;
    case 'YM':
      return 1.0;
    case 'RTY':
    case 'GC':
      return 0.10;
    case 'SI':
      return 0.005;
    case 'CL':
      return 0.01;
    case 'ZN':
      return 0.0156;
    default:
      return 0.1;
  }
}

function enrichMetadataWithEntrySession(rawMetadata: string | null, entryIso: string): string {
  let metaObj: Record<string, any> = {};
  try {
    metaObj = rawMetadata ? JSON.parse(rawMetadata) : {};
  } catch {
    metaObj = {};
  }
  if (!metaObj.entry_session) {
    const dt = new Date(entryIso);
    const entryKz = mapTimestampToKillzone(dt) || getCurrentKillzone(dt);
    metaObj.entry_session = entryKz?.killzone || 'unknown';
    metaObj.entry_session_name = entryKz?.name || 'UNKNOWN';
  }
  return JSON.stringify(metaObj);
}

export interface LifecycleEvaluationResult {
  changed: boolean;
  signal_state: string;
  stop: number;
  initial_stop: number;
  is_breakeven: number;
  realized_r: number;
  last_price: number;
  entry_price_recorded: number | null;
  entry_triggered_at: string | null;
  filled_at: string | null;
  execution_price: number | null;
  outcome_type: string | null;
  invalidation_reason: string | null;
  invalidation_detail: string | null;
  resolved_at: string | null;
  metadata: string | null;
}

/**
 * Pure chronological lifecycle evaluator for Scalping & Swing setups.
 * Mirrors Intraday LifecycleSync + OutcomeDetector + Revalidation rules:
 * - awaiting_entry -> fills on limit price touch (Bid/Ask + post-creation candle wicks), OR invalidates if TP1/SL reached pre-entry.
 * - active -> moves stop to BE at +1.5R, moves to runner at TP1 (+2R), resolves at TP2 (+3R) or SL (-1R) or BE (0R).
 * - runner -> resolves at TP2 (+3R) or BE stop (retains +2R TP1 win) or max runner age.
 */
export function evaluateMtfRowLifecycle(
  row: TrackedMtfSetupRow,
  quote: LiveQuoteDetails | null,
  candles: Candle[],
  atr14: number,
  nowIso: string
): LifecycleEvaluationResult {
  const market = (row.market || (row.instrument.includes('/') ? 'forex' : 'futures')) as 'futures' | 'forex';
  const decimals = getInstrumentDecimals(row.instrument, market);
  const round = (v: number) => Number(v.toFixed(decimals));

  const origStop = row.initial_stop && row.initial_stop > 0 ? row.initial_stop : row.stop;
  const r1 = row.r_multiple_1 && row.r_multiple_1 > 0 ? row.r_multiple_1 : 2.0;
  const r2 = row.r_multiple_2 && row.r_multiple_2 > 0 ? row.r_multiple_2 : 3.0;
  const isLong = String(row.bias).toLowerCase() === 'long';
  const defaultSpread = getDefaultSpread(row.instrument, market);
  const spread = quote?.spread && quote.spread > 0
    ? Math.min(quote.spread, defaultSpread * 2.5)
    : defaultSpread;

  const livePrice = quote?.price && quote.price > 0 ? quote.price : row.last_price || 0;
  const currentBid = quote?.bid && quote.bid > 0 ? quote.bid : livePrice;
  const currentAsk = quote?.ask && quote.ask > 0 ? quote.ask : (livePrice > 0 ? livePrice + spread : 0);

  let state = row.signal_state;
  let stop = row.stop;
  let isBreakeven = row.is_breakeven ? 1 : 0;
  let realizedR = Number(row.realized_r || 0);
  let entryPriceRecorded = row.entry_price_recorded ?? null;
  let entryTriggeredAt = row.entry_triggered_at ?? row.filled_at ?? null;
  let filledAt = row.filled_at ?? row.entry_triggered_at ?? null;
  let executionPrice = row.execution_price ?? null;
  let outcomeType = row.outcome_type ?? null;
  let invalidationReason = row.invalidation_reason ?? null;
  let invalidationDetail = row.invalidation_detail ?? null;
  let resolvedAt = row.resolved_at ?? null;
  let metadata = row.metadata ?? null;

  if (!OPEN_MTF_STATES.includes(state)) {
    return {
      changed: false,
      signal_state: state,
      stop,
      initial_stop: origStop,
      is_breakeven: isBreakeven,
      realized_r: realizedR,
      last_price: livePrice > 0 ? round(livePrice) : row.last_price,
      entry_price_recorded: entryPriceRecorded,
      entry_triggered_at: entryTriggeredAt,
      filled_at: filledAt,
      execution_price: executionPrice,
      outcome_type: outcomeType,
      invalidation_reason: invalidationReason,
      invalidation_detail: invalidationDetail,
      resolved_at: resolvedAt,
      metadata
    };
  }

  const createdMs = new Date(row.created_at).getTime();
  const sortedCandles = [...candles]
    .filter((c) => {
      const t = new Date(c.timestamp).getTime();
      return Number.isFinite(t) && t >= createdMs;
    })
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  let entryBarTimeMs = entryTriggeredAt ? new Date(entryTriggeredAt).getTime() : 0;

  const zoneLow = Math.min(row.entry_zone_low, row.entry_zone_high);
  const zoneHigh = Math.max(row.entry_zone_low, row.entry_zone_high);

  // 1. Chronological candle replay
  for (const c of sortedCandles) {
    if (!OPEN_MTF_STATES.includes(state)) break;

    const cTimeMs = new Date(c.timestamp).getTime();
    const cOpenBid = c.open;
    const cHighBid = c.high;
    const cLowBid = c.low;
    const cOpenAsk = c.open + spread;
    const cHighAsk = c.high + spread;
    const cLowAsk = c.low + spread;

    if (state === 'awaiting_entry') {
      if (isLong) {
        if (cOpenBid <= origStop) {
          state = 'invalidated';
          invalidationReason = 'stop_breached_pre_entry';
          invalidationDetail = `Price (${round(cOpenBid)}) opened below SL ${origStop} prior to entry`;
          resolvedAt = c.timestamp;
          break;
        }
        if (cLowAsk > zoneHigh && cHighBid >= row.tp1) {
          state = 'invalidated';
          invalidationReason = 'target_reached_pre_entry';
          invalidationDetail = `Price (${round(cHighBid)}) reached TP1 ${row.tp1} without filling entry`;
          resolvedAt = c.timestamp;
          break;
        }
        if (cLowAsk <= zoneHigh && cHighAsk >= zoneLow) {
          // Only fill if candle traded inside the entry zone rather than opening past the zone near SL
          if (cOpenAsk < zoneLow && cHighAsk < zoneLow) {
            continue;
          }
          const fill = round(Math.max(zoneLow, Math.min(cOpenAsk, zoneHigh)));
          if (fill <= origStop) {
            state = 'invalidated';
            invalidationReason = 'stop_breached_pre_entry';
            invalidationDetail = `Price breached SL ${origStop} before valid fill`;
            resolvedAt = c.timestamp;
            break;
          }
          state = 'active';
          entryTriggeredAt = c.timestamp;
          filledAt = c.timestamp;
          entryBarTimeMs = cTimeMs;
          entryPriceRecorded = fill;
          stop = origStop;
          metadata = enrichMetadataWithEntrySession(metadata, c.timestamp);

          // Conservative check: if the same entry bar also dumped through SL
          if (cLowBid <= origStop) {
            state = 'resolved';
            outcomeType = 'sl_hit';
            invalidationReason = 'sl_hit';
            invalidationDetail = `Stop loss ${origStop} hit on entry bar`;
            realizedR = -1.0;
            executionPrice = origStop;
            resolvedAt = c.timestamp;
            break;
          }
          continue; // Do not assume same-bar TP on the entry candle
        }
      } else {
        if (cOpenAsk >= origStop) {
          state = 'invalidated';
          invalidationReason = 'stop_breached_pre_entry';
          invalidationDetail = `Price (${round(cOpenAsk)}) opened above SL ${origStop} prior to entry`;
          resolvedAt = c.timestamp;
          break;
        }
        if (cHighBid < zoneLow && cLowAsk <= row.tp1) {
          state = 'invalidated';
          invalidationReason = 'target_reached_pre_entry';
          invalidationDetail = `Price (${round(cLowAsk)}) reached TP1 ${row.tp1} without filling entry`;
          resolvedAt = c.timestamp;
          break;
        }
        if (cHighBid >= zoneLow && cLowBid <= zoneHigh) {
          if (cOpenBid > zoneHigh && cLowBid > zoneHigh) {
            continue;
          }
          const fill = round(Math.min(zoneHigh, Math.max(cOpenBid, zoneLow)));
          if (fill >= origStop) {
            state = 'invalidated';
            invalidationReason = 'stop_breached_pre_entry';
            invalidationDetail = `Price breached SL ${origStop} before valid fill`;
            resolvedAt = c.timestamp;
            break;
          }
          state = 'active';
          entryTriggeredAt = c.timestamp;
          filledAt = c.timestamp;
          entryBarTimeMs = cTimeMs;
          entryPriceRecorded = fill;
          stop = origStop;
          metadata = enrichMetadataWithEntrySession(metadata, c.timestamp);

          if (cHighAsk >= origStop) {
            state = 'resolved';
            outcomeType = 'sl_hit';
            invalidationReason = 'sl_hit';
            invalidationDetail = `Stop loss ${origStop} hit on entry bar`;
            realizedR = -1.0;
            executionPrice = origStop;
            resolvedAt = c.timestamp;
            break;
          }
          continue;
        }
      }
      continue;
    }

    // For active / runner, only evaluate bars strictly after the bar that filled entry
    if (entryBarTimeMs > 0 && cTimeMs <= entryBarTimeMs) {
      continue;
    }

    const entryPrice = entryPriceRecorded && entryPriceRecorded > 0 ? entryPriceRecorded : row.entry_zone_mid;
    let initialRisk = Math.max(Math.abs(entryPrice - origStop), Math.abs(row.entry_zone_mid - origStop));
    if (initialRisk < 1e-6 && row.tp1) {
      initialRisk = Math.abs(row.tp1 - entryPrice) / r1;
    }

    if (state === 'active') {
      // 1. Check current stop (SL or BE) first (conservative)
      const hitStop = isLong ? cLowBid <= stop : cHighAsk >= stop;
      if (hitStop) {
        state = 'resolved';
        outcomeType = isBreakeven ? 'be_hit' : 'sl_hit';
        invalidationReason = outcomeType;
        invalidationDetail = isBreakeven
          ? `Closed at Break Even (${round(entryPrice)})`
          : `Stop Loss (${round(stop)}) hit`;
        realizedR = isBreakeven ? 0.0 : -1.0;
        executionPrice = isBreakeven ? round(entryPrice) : round(stop);
        resolvedAt = c.timestamp;
        break;
      }

      // 2. Check TP2 (+3R price level -> +2.20R blended 80/20) directly (BE locks only when TP1 hits)
      const hitTp2 = isLong ? cHighBid >= row.tp2 : cLowAsk <= row.tp2;
      if (hitTp2) {
        state = 'resolved';
        outcomeType = 'tp2_hit';
        invalidationReason = 'tp2_hit';
        realizedR = computeBlendedRealizedR({ outcomeType: 'tp2_hit', rMultiple1: r1, rMultiple2: r2 });
        invalidationDetail = `TP2 (${row.tp2}) achieved (+${realizedR.toFixed(2)}R blended 80/20)`;
        executionPrice = row.tp2;
        resolvedAt = c.timestamp;
        break;
      }

      // 4. Check TP1 (+2R price level -> +1.60R banked 80%) -> move to Runner with BE stop
      const hitTp1 = isLong ? cHighBid >= row.tp1 : cLowAsk <= row.tp1;
      if (hitTp1) {
        state = 'runner';
        isBreakeven = 1;
        stop = round(entryPrice);
        outcomeType = 'tp1_hit';
        invalidationReason = 'tp1_hit';
        realizedR = computeBlendedRealizedR({ outcomeType: 'tp1_hit', rMultiple1: r1, rMultiple2: r2 });
        continue;
      }
    } else if (state === 'runner') {
      const hitBe = isLong ? cLowBid <= stop : cHighAsk >= stop;
      const hitTp2 = isLong ? cHighBid >= row.tp2 : cLowAsk <= row.tp2;

      if (hitBe) {
        state = 'resolved';
        outcomeType = 'tp1_hit';
        invalidationReason = 'tp1_hit';
        realizedR = computeBlendedRealizedR({ outcomeType: 'tp1_hit', rMultiple1: r1, rMultiple2: r2 });
        invalidationDetail = `Runner retraced to BE (${round(stop)}); +${realizedR.toFixed(2)}R banked (80% at TP1)`;
        executionPrice = round(stop);
        resolvedAt = c.timestamp;
        break;
      }
      if (hitTp2) {
        state = 'resolved';
        outcomeType = 'tp2_hit';
        invalidationReason = 'tp2_hit';
        realizedR = computeBlendedRealizedR({ outcomeType: 'tp2_hit', rMultiple1: r1, rMultiple2: r2 });
        invalidationDetail = `Runner reached TP2 (${row.tp2}) (+${realizedR.toFixed(2)}R blended 80/20)`;
        executionPrice = row.tp2;
        resolvedAt = c.timestamp;
        break;
      }
    }
  }

  // 2. Live Quote Evaluation (for latest sub-minute tick)
  if (livePrice > 0 && OPEN_MTF_STATES.includes(state)) {
    if (state === 'awaiting_entry') {
      if (isLong) {
        if (currentAsk >= zoneLow && currentAsk <= zoneHigh && currentBid > origStop) {
          state = 'active';
          entryTriggeredAt = entryTriggeredAt || nowIso;
          filledAt = filledAt || entryTriggeredAt;
          entryPriceRecorded = round(Math.max(zoneLow, Math.min(currentAsk, zoneHigh)));
          stop = origStop;
          metadata = enrichMetadataWithEntrySession(metadata, entryTriggeredAt);
        } else if (currentBid >= row.tp1) {
          state = 'invalidated';
          invalidationReason = 'target_reached_pre_entry';
          invalidationDetail = `Live Bid (${round(currentBid)}) reached TP1 (${row.tp1}) before filling entry`;
          resolvedAt = nowIso;
        } else if (currentBid <= origStop) {
          state = 'invalidated';
          invalidationReason = 'stop_breached_pre_entry';
          invalidationDetail = `Live Bid (${round(currentBid)}) breached SL (${origStop}) before filling entry`;
          resolvedAt = nowIso;
        } else if (atr14 > 0 && (zoneLow - currentBid) > 1.0 * atr14) {
          state = 'invalidated';
          invalidationReason = 'price_displaced';
          invalidationDetail = `Price displaced > 1.0x ATR below zone (${zoneLow}) prior to entry`;
          resolvedAt = nowIso;
        }
      } else {
        if (currentBid >= zoneLow && currentBid <= zoneHigh && currentAsk < origStop) {
          state = 'active';
          entryTriggeredAt = entryTriggeredAt || nowIso;
          filledAt = filledAt || entryTriggeredAt;
          entryPriceRecorded = round(Math.min(zoneHigh, Math.max(currentBid, zoneLow)));
          stop = origStop;
          metadata = enrichMetadataWithEntrySession(metadata, entryTriggeredAt);
        } else if (currentAsk <= row.tp1) {
          state = 'invalidated';
          invalidationReason = 'target_reached_pre_entry';
          invalidationDetail = `Live Ask (${round(currentAsk)}) reached TP1 (${row.tp1}) before filling entry`;
          resolvedAt = nowIso;
        } else if (currentAsk >= origStop) {
          state = 'invalidated';
          invalidationReason = 'stop_breached_pre_entry';
          invalidationDetail = `Live Ask (${round(currentAsk)}) breached SL (${origStop}) before filling entry`;
          resolvedAt = nowIso;
        } else if (atr14 > 0 && (currentAsk - zoneHigh) > 1.0 * atr14) {
          state = 'invalidated';
          invalidationReason = 'price_displaced';
          invalidationDetail = `Price displaced > 1.0x ATR above zone (${zoneHigh}) prior to entry`;
          resolvedAt = nowIso;
        }
      }
    }

    if (state === 'active') {
      const entryPrice = entryPriceRecorded && entryPriceRecorded > 0 ? entryPriceRecorded : row.entry_zone_mid;
      if (isLong) {
        if (currentBid >= row.tp2) {
          state = 'resolved';
          outcomeType = 'tp2_hit';
          invalidationReason = 'tp2_hit';
          realizedR = computeBlendedRealizedR({ outcomeType: 'tp2_hit', rMultiple1: r1, rMultiple2: r2 });
          invalidationDetail = `TP2 (${row.tp2}) reached on live Bid (${round(currentBid)}) (+${realizedR.toFixed(2)}R blended 80/20)`;
          executionPrice = round(Math.max(currentBid, row.tp2));
          resolvedAt = nowIso;
        } else if (currentBid >= row.tp1) {
          state = 'runner';
          isBreakeven = 1;
          stop = round(entryPrice);
          outcomeType = 'tp1_hit';
          invalidationReason = 'tp1_hit';
          realizedR = computeBlendedRealizedR({ outcomeType: 'tp1_hit', rMultiple1: r1, rMultiple2: r2 });
        } else if (currentBid <= stop) {
          state = 'resolved';
          outcomeType = isBreakeven ? 'be_hit' : 'sl_hit';
          invalidationReason = outcomeType;
          invalidationDetail = isBreakeven ? `BE stop (${round(stop)}) hit` : `Stop loss (${round(stop)}) hit`;
          realizedR = isBreakeven ? 0.0 : -1.0;
          executionPrice = isBreakeven ? round(entryPrice) : round(Math.min(currentBid, stop));
          resolvedAt = nowIso;
        }
      } else {
        if (currentAsk <= row.tp2) {
          state = 'resolved';
          outcomeType = 'tp2_hit';
          invalidationReason = 'tp2_hit';
          realizedR = computeBlendedRealizedR({ outcomeType: 'tp2_hit', rMultiple1: r1, rMultiple2: r2 });
          invalidationDetail = `TP2 (${row.tp2}) reached on live Ask (${round(currentAsk)}) (+${realizedR.toFixed(2)}R blended 80/20)`;
          executionPrice = round(Math.min(currentAsk, row.tp2));
          resolvedAt = nowIso;
        } else if (currentAsk <= row.tp1) {
          state = 'runner';
          isBreakeven = 1;
          stop = round(entryPrice);
          outcomeType = 'tp1_hit';
          invalidationReason = 'tp1_hit';
          realizedR = computeBlendedRealizedR({ outcomeType: 'tp1_hit', rMultiple1: r1, rMultiple2: r2 });
        } else if (currentAsk >= stop) {
          state = 'resolved';
          outcomeType = isBreakeven ? 'be_hit' : 'sl_hit';
          invalidationReason = outcomeType;
          invalidationDetail = isBreakeven ? `BE stop (${round(stop)}) hit` : `Stop loss (${round(stop)}) hit`;
          realizedR = isBreakeven ? 0.0 : -1.0;
          executionPrice = isBreakeven ? round(entryPrice) : round(Math.max(currentAsk, stop));
          resolvedAt = nowIso;
        }
      }
    } else if (state === 'runner') {
      const entryPrice = entryPriceRecorded && entryPriceRecorded > 0 ? entryPriceRecorded : row.entry_zone_mid;
      if (isLong) {
        if (currentBid >= row.tp2) {
          state = 'resolved';
          outcomeType = 'tp2_hit';
          invalidationReason = 'tp2_hit';
          realizedR = computeBlendedRealizedR({ outcomeType: 'tp2_hit', rMultiple1: r1, rMultiple2: r2 });
          invalidationDetail = `Runner hit TP2 (${row.tp2}) on live Bid (+${realizedR.toFixed(2)}R blended 80/20)`;
          executionPrice = round(Math.max(currentBid, row.tp2));
          resolvedAt = nowIso;
        } else if (currentBid <= stop) {
          state = 'resolved';
          outcomeType = 'tp1_hit';
          invalidationReason = 'tp1_hit';
          realizedR = computeBlendedRealizedR({ outcomeType: 'tp1_hit', rMultiple1: r1, rMultiple2: r2 });
          invalidationDetail = `Runner retraced to BE (${round(stop)}); +${realizedR.toFixed(2)}R banked (80% at TP1)`;
          executionPrice = round(entryPrice);
          resolvedAt = nowIso;
        }
      } else {
        if (currentAsk <= row.tp2) {
          state = 'resolved';
          outcomeType = 'tp2_hit';
          invalidationReason = 'tp2_hit';
          realizedR = computeBlendedRealizedR({ outcomeType: 'tp2_hit', rMultiple1: r1, rMultiple2: r2 });
          invalidationDetail = `Runner hit TP2 (${row.tp2}) on live Ask (+${realizedR.toFixed(2)}R blended 80/20)`;
          executionPrice = round(Math.min(currentAsk, row.tp2));
          resolvedAt = nowIso;
        } else if (currentAsk >= stop) {
          state = 'resolved';
          outcomeType = 'tp1_hit';
          invalidationReason = 'tp1_hit';
          realizedR = computeBlendedRealizedR({ outcomeType: 'tp1_hit', rMultiple1: r1, rMultiple2: r2 });
          invalidationDetail = `Runner retraced to BE (${round(stop)}); +${realizedR.toFixed(2)}R banked (80% at TP1)`;
          executionPrice = round(entryPrice);
          resolvedAt = nowIso;
        }
      }
    }
  }

  // 3. Auto-close stale runners after max age
  if (state === 'runner') {
    const startRef = entryTriggeredAt || row.created_at;
    const startMs = startRef ? new Date(startRef).getTime() : 0;
    const maxAge = row.trading_style === 'SCALP' ? SCALP_RUNNER_MAX_AGE_MS : SWING_RUNNER_MAX_AGE_MS;
    if (startMs > 0 && Date.now() - startMs >= maxAge) {
      state = 'resolved';
      outcomeType = 'tp1_hit';
      invalidationReason = 'runner_closed_max_age';
      realizedR = computeBlendedRealizedR({ outcomeType: 'tp1_hit', rMultiple1: r1, rMultiple2: r2 });
      invalidationDetail = `Runner auto-closed after max holding window; +${realizedR.toFixed(2)}R banked (80% at TP1)`;
      executionPrice = row.tp1;
      resolvedAt = nowIso;
    }
  }

  const nextLastPrice = livePrice > 0 ? round(livePrice) : row.last_price;
  const changed =
    state !== row.signal_state ||
    stop !== row.stop ||
    isBreakeven !== (row.is_breakeven ? 1 : 0) ||
    realizedR !== Number(row.realized_r || 0) ||
    nextLastPrice !== Number(row.last_price || 0) ||
    entryTriggeredAt !== (row.entry_triggered_at ?? row.filled_at ?? null) ||
    resolvedAt !== (row.resolved_at ?? null);

  return {
    changed,
    signal_state: state,
    stop,
    initial_stop: origStop,
    is_breakeven: isBreakeven,
    realized_r: realizedR,
    last_price: nextLastPrice,
    entry_price_recorded: entryPriceRecorded,
    entry_triggered_at: entryTriggeredAt,
    filled_at: filledAt,
    execution_price: executionPrice,
    outcome_type: outcomeType,
    invalidation_reason: invalidationReason,
    invalidation_detail: invalidationDetail,
    resolved_at: resolvedAt,
    metadata
  };
}

async function persistEvaluatedRow(rowId: string, evalRes: LifecycleEvaluationResult, nowIso: string): Promise<void> {
  await queryDb(
    `UPDATE mtf_style_setups
     SET signal_state = ?, stop = ?, initial_stop = ?, is_breakeven = ?, realized_r = ?,
         last_price = ?, entry_price_recorded = ?, entry_triggered_at = ?, filled_at = ?,
         execution_price = ?, outcome_type = ?, invalidation_reason = ?, invalidation_detail = ?,
         resolved_at = ?, metadata = ?, updated_at = ?
     WHERE id = ?`,
    [
      evalRes.signal_state,
      evalRes.stop,
      evalRes.initial_stop,
      evalRes.is_breakeven,
      evalRes.realized_r,
      evalRes.last_price,
      evalRes.entry_price_recorded,
      evalRes.entry_triggered_at,
      evalRes.filled_at,
      evalRes.execution_price,
      evalRes.outcome_type,
      evalRes.invalidation_reason,
      evalRes.invalidation_detail,
      evalRes.resolved_at,
      evalRes.metadata,
      nowIso,
      rowId
    ]
  );
}

function getEvaluationCandleTf(row: Pick<TrackedMtfSetupRow, 'trading_style' | 'swing_mode' | 'entry_tf'>): '1m' | '5m' | '15m' {
  if (row.trading_style === 'SCALP') return '1m';
  if (row.swing_mode === 'h4_h1' || row.entry_tf === '1H') return '5m';
  return '15m';
}

async function evaluateAndPersistOpenRows(rows: TrackedMtfSetupRow[], nowIso: string): Promise<TrackedMtfSetupRow[]> {
  if (rows.length === 0) return [];

  // Deduplicate quote + candle fetches by instrument and candle TF
  const quoteCache = new Map<string, LiveQuoteDetails | null>();
  const candleCache = new Map<string, Candle[]>();

  const uniqueInstruments = Array.from(new Set(rows.map((r) => r.instrument)));
  await Promise.all(
    uniqueInstruments.map(async (inst) => {
      const q = await getLiveQuoteDetails(inst).catch(() => null);
      quoteCache.set(inst, q);
    })
  );

  const uniqueCandleKeys = new Map<string, { instrument: string; tf: '1m' | '5m' | '15m' }>();
  for (const r of rows) {
    const tf = getEvaluationCandleTf(r);
    uniqueCandleKeys.set(`${r.instrument}::${tf}`, { instrument: r.instrument, tf });
  }

  await Promise.all(
    Array.from(uniqueCandleKeys.entries()).map(async ([key, req]) => {
      const count = req.tf === '1m' ? 180 : req.tf === '5m' ? 240 : 240;
      const c = await getLiveCandles(req.instrument, req.tf, count).catch(() => []);
      candleCache.set(key, c);
    })
  );

  const updatedRows: TrackedMtfSetupRow[] = [];

  for (const row of rows) {
    const quote = quoteCache.get(row.instrument) ?? null;
    const tf = getEvaluationCandleTf(row);
    const candles = candleCache.get(`${row.instrument}::${tf}`) || [];
    const atr14 = candles.length >= 15 ? computeATR(candles.slice(-30), 14) : 0;

    const evalRes = evaluateMtfRowLifecycle(row, quote, candles, atr14, nowIso);
    if (evalRes.changed) {
      await persistEvaluatedRow(row.id, evalRes, nowIso);
    }

    updatedRows.push({
      ...row,
      signal_state: evalRes.signal_state,
      stop: evalRes.stop,
      initial_stop: evalRes.initial_stop,
      is_breakeven: evalRes.is_breakeven,
      realized_r: evalRes.realized_r,
      last_price: evalRes.last_price,
      entry_price_recorded: evalRes.entry_price_recorded,
      entry_triggered_at: evalRes.entry_triggered_at,
      filled_at: evalRes.filled_at,
      execution_price: evalRes.execution_price,
      outcome_type: evalRes.outcome_type,
      invalidation_reason: evalRes.invalidation_reason,
      invalidation_detail: evalRes.invalidation_detail,
      resolved_at: evalRes.resolved_at,
      metadata: evalRes.metadata,
      updated_at: evalRes.changed ? nowIso : row.updated_at
    });
  }

  return updatedRows;
}

function rowToMtfSetup(row: TrackedMtfSetupRow): MtfStyleSetup {
  const market = (row.market === 'forex' ? 'forex' : 'futures') as 'futures' | 'forex';
  const decimals = getInstrumentDecimals(row.instrument, market);
  const round = (v: number) => Number(v.toFixed(decimals));

  const isLong = String(row.bias).toLowerCase() === 'long';
  const livePrice = row.last_price > 0 ? round(row.last_price) : row.entry_zone_mid;
  const entryPrice = row.entry_price_recorded && row.entry_price_recorded > 0 ? row.entry_price_recorded : row.entry_zone_mid;
  const origStop = row.initial_stop && row.initial_stop > 0 ? row.initial_stop : row.stop;
  const r1 = row.r_multiple_1 && row.r_multiple_1 > 0 ? row.r_multiple_1 : 2.0;
  const r2 = row.r_multiple_2 && row.r_multiple_2 > 0 ? row.r_multiple_2 : 3.0;

  let risk = Math.abs(entryPrice - origStop);
  if (risk < 1e-6 && row.tp1) {
    risk = Math.abs(row.tp1 - entryPrice) / r1;
  }

  const zoneLow = Math.min(row.entry_zone_low, row.entry_zone_high);
  const zoneHigh = Math.max(row.entry_zone_low, row.entry_zone_high);
  const inZone = livePrice >= zoneLow && livePrice <= zoneHigh;

  const distanceRaw = inZone
    ? 0
    : Math.abs(livePrice - entryPrice) / Math.max(risk, 1e-6);
  const distanceR = Number(Math.min(9.99, distanceRaw).toFixed(2));

  const isLivePosition = row.signal_state === 'active' || row.signal_state === 'runner';
  const unrealizedR = isLivePosition && risk > 0
    ? Number(((isLong ? livePrice - entryPrice : entryPrice - livePrice) / risk).toFixed(2))
    : undefined;

  return {
    id: row.id,
    instrument: row.instrument,
    market,
    strategy_id: row.strategy_id || (row.trading_style === 'SCALP' ? 'manna_scalper' : 'manna_swing'),
    trading_style: row.trading_style,
    context_tf: row.context_tf,
    entry_tf: row.entry_tf,
    bias: isLong ? 'long' : 'short',
    signal_state: row.signal_state as any,
    state: row.signal_state as any,
    entry_zone_low: row.entry_zone_low,
    entry_zone_high: row.entry_zone_high,
    entry_zone_mid: row.entry_zone_mid,
    stop: row.stop,
    initial_stop: origStop,
    tp1: row.tp1,
    tp2: row.tp2,
    r_multiple_1: r1,
    r_multiple_2: r2,
    conviction_score: row.conviction_score,
    liquidity_score: row.liquidity_score,
    current_price: livePrice,
    distance_to_entry_r: distanceR,
    unrealizedR,
    is_breakeven: row.is_breakeven ? 1 : 0,
    entry_price_recorded: row.entry_price_recorded ?? undefined,
    entry_triggered_at: row.entry_triggered_at ?? row.filled_at ?? undefined,
    resolved_at: row.resolved_at ?? undefined,
    execution_price: row.execution_price ?? undefined,
    outcome_type: row.outcome_type ?? undefined,
    invalidation_reason: row.invalidation_reason ?? undefined,
    invalidation_detail: row.invalidation_detail ?? undefined,
    realized_r: computeBlendedRealizedR({
      outcomeType: row.outcome_type || (row.signal_state === 'tp2_hit' ? 'tp2_hit' : (row.signal_state === 'tp1_hit' || row.signal_state === 'runner') ? 'tp1_hit' : row.signal_state === 'stopped' ? 'sl_hit' : row.signal_state === 'expired' ? 'be_hit' : undefined),
      invalidationReason: row.invalidation_reason,
      rMultiple1: r1,
      rMultiple2: r2,
      wasRunner: row.signal_state === 'runner',
      fallbackR: row.realized_r
    }),
    created_at: row.created_at,
    killzone_origin: row.killzone_origin || 'ny_am',
    metadata: row.metadata || JSON.stringify({
      source: 'mtf_isolated_desk',
      trading_style: row.trading_style,
      htf: row.context_tf,
      ltf: row.entry_tf,
      context_tf: row.context_tf,
      entry_tf: row.entry_tf,
      order_type: isLong ? 'BUY LIMIT' : 'SELL LIMIT'
    })
  };
}

/**
 * Syncs newly discovered candidate setups against persistent `mtf_style_setups`,
 * evaluates open setups chronologically, supersedes stale pending zones when new
 * valid zones form (never superseding active/runner trades), and returns the live board.
 */
export async function syncMtfSetupsAndGetLiveBoard(
  style: TradingStyleMode,
  swingMode: SwingPairMode,
  candidates: MtfStyleSetup[],
  edgeScorecards?: Map<string, AssetEdgeScorecard>
): Promise<MtfBoardResult> {
  await ensureMtfTrackerTable();
  const nowIso = new Date().toISOString();
  const tradingStyle = style === 'scalp' ? 'SCALP' : 'SWING';

  // 1. Load currently open rows for this style + swingMode and evaluate them first
  const openRowsRaw = tradingStyle === 'SCALP'
    ? await queryDb<TrackedMtfSetupRow>(
        `SELECT * FROM mtf_style_setups
         WHERE trading_style = 'SCALP' AND signal_state IN ('awaiting_entry', 'active', 'runner')`
      )
    : await queryDb<TrackedMtfSetupRow>(
        `SELECT * FROM mtf_style_setups
         WHERE trading_style = 'SWING' AND swing_mode = ? AND signal_state IN ('awaiting_entry', 'active', 'runner')`,
        [swingMode]
      );

  const evaluatedOpen = await evaluateAndPersistOpenRows(openRowsRaw, nowIso);
  const stillOpenByInst = new Map<string, TrackedMtfSetupRow>();
  for (const r of evaluatedOpen) {
    if (OPEN_MTF_STATES.includes(r.signal_state)) {
      if (edgeScorecards && edgeScorecards.size > 0) {
        const sc = edgeScorecards.get((r.instrument || '').toUpperCase());
        const efCheck = evaluateEdgeFinderConfluence(sc, style, (r.bias || 'long') as Bias);
        const isLegacyPreGateActive =
          r.signal_state === 'active' &&
          (!r.metadata || !String(r.metadata).includes('edgefinder_confluence'));

        // Clear un-entered pending zones OR pre-gate legacy active rows if EdgeFinder does not agree
        if (!efCheck.approved && (r.signal_state === 'awaiting_entry' || isLegacyPreGateActive)) {
          await queryDb(
            `UPDATE mtf_style_setups
             SET signal_state = 'invalidated', invalidation_reason = 'edgefinder_conflict',
                 invalidation_detail = ?, resolved_at = ?, updated_at = ?
             WHERE id = ?`,
            [efCheck.reason, nowIso, nowIso, r.id]
          );
          continue;
        }
      }
      stillOpenByInst.set(r.instrument, r);
    }
  }

  // 2. Dedupe / Supersede / Insert new candidates (matching Intraday dedupeAndSelect rules)
  for (const c of candidates) {
    const existing = stillOpenByInst.get(c.instrument);

    if (existing) {
      // Never supersede an active or runner position
      if (existing.signal_state === 'active' || existing.signal_state === 'runner') {
        continue;
      }

      // Existing is awaiting_entry — check if new candidate is a different zone or opposing higher-conviction setup
      const priceEps = c.market === 'forex' ? (c.instrument.includes('JPY') ? 0.005 : 0.00005) : 0.05;
      const sameZone =
        existing.bias === c.bias &&
        Math.abs(existing.entry_zone_mid - c.entry_zone_mid) <= priceEps &&
        Math.abs(existing.stop - c.stop) <= priceEps;

      if (sameZone) {
        // Refresh conviction & live price without recreating/resetting created_at
        await queryDb(
          `UPDATE mtf_style_setups SET conviction_score = ?, last_price = ?, updated_at = ? WHERE id = ?`,
          [c.conviction_score, c.current_price, nowIso, existing.id]
        );
        existing.conviction_score = c.conviction_score;
        existing.last_price = c.current_price;
        continue;
      }

      const opposingHigher =
        existing.bias !== c.bias && (c.conviction_score || 0) >= (existing.conviction_score || 0);
      const sameDirNewerZone = existing.bias === c.bias;

      if (opposingHigher || sameDirNewerZone) {
        const reason = opposingHigher ? 'opposing_signal' : 'superseded';
        const detail = opposingHigher
          ? `Superseded by opposing ${c.bias.toUpperCase()} setup (${c.conviction_score}%)`
          : `Superseded by fresher ${c.entry_tf} zone @ ${c.entry_zone_mid}`;

        await queryDb(
          `UPDATE mtf_style_setups
           SET signal_state = 'superseded', superseded = 1, superseded_by = ?,
               invalidation_reason = ?, invalidation_detail = ?, resolved_at = ?, updated_at = ?
           WHERE id = ?`,
          [c.id, reason, detail, nowIso, nowIso, existing.id]
        );
        stillOpenByInst.delete(c.instrument);
      } else {
        continue;
      }
    }

    // Post-loss churn guard: wait 15m (Scalp) / 2h (Swing) after an SL before firing again on same asset
    if (!existing) {
      const cooldownMs = tradingStyle === 'SCALP' ? 15 * 60 * 1000 : 2 * 60 * 60 * 1000;
      const recentLosses = await queryDb<{ resolved_at: string | null }>(
        `SELECT resolved_at FROM mtf_style_setups
         WHERE trading_style = ? AND instrument = ? AND signal_state = 'resolved' AND outcome_type = 'sl_hit'
         ORDER BY resolved_at DESC LIMIT 1`,
        [tradingStyle, c.instrument]
      );
      if (recentLosses.length > 0 && recentLosses[0].resolved_at) {
        const elapsedSinceSl = Date.now() - new Date(recentLosses[0].resolved_at).getTime();
        if (elapsedSinceSl >= 0 && elapsedSinceSl < cooldownMs) {
          continue;
        }
      }
    }

    // Insert new candidate
    const isInitiallyActive = c.signal_state === 'active';
    const initialFillAt = isInitiallyActive ? (c.entry_triggered_at || nowIso) : null;
    const initialFillPrice = isInitiallyActive ? (c.entry_price_recorded || c.current_price) : null;
    const initialMeta = isInitiallyActive
      ? enrichMetadataWithEntrySession(c.metadata, initialFillAt!)
      : c.metadata;

    await queryDb(
      `INSERT INTO mtf_style_setups (
        id, signature, trading_style, swing_mode, strategy_id, context_tf, entry_tf, instrument, market, bias,
        entry_zone_low, entry_zone_high, entry_zone_mid, stop, initial_stop, tp1, tp2,
        r_multiple_1, r_multiple_2, conviction_score, liquidity_score, killzone_origin, signal_state,
        is_breakeven, realized_r, last_price, entry_price_recorded, entry_triggered_at,
        superseded, metadata, filled_at, resolved_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        c.id,
        c.id,
        c.trading_style,
        c.trading_style === 'SWING' ? swingMode : null,
        c.strategy_id,
        c.context_tf,
        c.entry_tf,
        c.instrument,
        c.market,
        c.bias,
        c.entry_zone_low,
        c.entry_zone_high,
        c.entry_zone_mid,
        c.stop,
        c.initial_stop ?? c.stop,
        c.tp1,
        c.tp2,
        c.r_multiple_1,
        c.r_multiple_2,
        c.conviction_score,
        c.liquidity_score,
        c.killzone_origin,
        c.signal_state,
        0,
        0,
        c.current_price,
        initialFillPrice,
        initialFillAt,
        0,
        initialMeta,
        initialFillAt,
        null,
        c.created_at || nowIso,
        nowIso
      ]
    );

    const insertedRows = await queryDb<TrackedMtfSetupRow>(
      `SELECT * FROM mtf_style_setups WHERE id = ?`,
      [c.id]
    );
    if (insertedRows.length > 0) {
      stillOpenByInst.set(c.instrument, insertedRows[0]);
    }
  }

  // 3. Read final live board + recent history for this style & swingMode
  const openRows = Array.from(stillOpenByInst.values());
  const activeAndPending = openRows
    .filter((r) => r.signal_state === 'awaiting_entry' || r.signal_state === 'active')
    .filter((r) => {
      if (!edgeScorecards || edgeScorecards.size === 0) return true;
      const sc = edgeScorecards.get((r.instrument || '').toUpperCase());
      return evaluateEdgeFinderConfluence(sc, style, (r.bias || 'long') as Bias).approved;
    })
    .map(rowToMtfSetup)
    .sort((a, b) => b.conviction_score - a.conviction_score);

  const runnerSetups = openRows
    .filter((r) => r.signal_state === 'runner')
    .map(rowToMtfSetup)
    .sort((a, b) => b.conviction_score - a.conviction_score);

  const pastRows = tradingStyle === 'SCALP'
    ? await queryDb<TrackedMtfSetupRow>(
        `SELECT * FROM mtf_style_setups
         WHERE trading_style = 'SCALP' AND signal_state NOT IN ('awaiting_entry', 'active', 'runner')
         ORDER BY COALESCE(resolved_at, updated_at, created_at) DESC LIMIT 40`
      )
    : await queryDb<TrackedMtfSetupRow>(
        `SELECT * FROM mtf_style_setups
         WHERE trading_style = 'SWING' AND swing_mode = ? AND signal_state NOT IN ('awaiting_entry', 'active', 'runner')
         ORDER BY COALESCE(resolved_at, updated_at, created_at) DESC LIMIT 40`,
        [swingMode]
      );

  const pastSetups = pastRows.map(rowToMtfSetup);

  return {
    setups: activeAndPending,
    runnerSetups,
    pastSetups
  };
}

/**
 * Lightweight 15-second background lifecycle ticker for open Scalping & Swing setups.
 * Only fetches market data for instruments that currently have open rows.
 */
export async function syncOpenMtfLifecycle(forceCheck = false): Promise<void> {
  if (isSyncingLifecycle) return;
  if (!forceCheck && !isMarketOpen()) return;
  isSyncingLifecycle = true;
  try {
    await ensureMtfTrackerTable();
    const openRows = await queryDb<TrackedMtfSetupRow>(
      `SELECT * FROM mtf_style_setups WHERE signal_state IN ('awaiting_entry', 'active', 'runner')`
    );
    if (openRows.length === 0) return;
    await evaluateAndPersistOpenRows(openRows, new Date().toISOString());
  } catch (err: any) {
    console.warn('[MTF-TRACKER] Background lifecycle sync failed:', err?.message);
  } finally {
    isSyncingLifecycle = false;
  }
}

export function startMtfLifecycleLoop(intervalMs = 15_000): void {
  if (lifecycleInterval) return;
  lifecycleInterval = setInterval(() => {
    void syncOpenMtfLifecycle(false);
  }, intervalMs);
  void syncOpenMtfLifecycle(true);
}

export function stopMtfLifecycleLoop(): void {
  if (lifecycleInterval) {
    clearInterval(lifecycleInterval);
    lifecycleInterval = null;
  }
}

export async function recordAndSyncMtfSetups(setups: MtfStyleSetup[]): Promise<void> {
  if (!setups.length) return;
  const first = setups[0];
  const style: TradingStyleMode = first.trading_style === 'SCALP' ? 'scalp' : 'swing';
  const swingMode: SwingPairMode = first.context_tf === '4H' ? 'h4_h1' : 'd1_h4';
  await syncMtfSetupsAndGetLiveBoard(style, swingMode, setups);
}

export function getMtfRowBlendedR(r: TrackedMtfSetupRow): number {
  const mappedOt =
    r.outcome_type ||
    (r.signal_state === 'tp2_hit'
      ? 'tp2_hit'
      : r.signal_state === 'tp1_hit' || r.signal_state === 'runner'
        ? 'tp1_hit'
        : r.signal_state === 'stopped'
          ? 'sl_hit'
          : r.signal_state === 'expired'
            ? 'be_hit'
            : undefined);
  return computeBlendedRealizedR({
    outcomeType: mappedOt,
    invalidationReason: r.invalidation_reason,
    rMultiple1: r.r_multiple_1 || 2.0,
    rMultiple2: r.r_multiple_2 || 3.0,
    wasRunner: r.signal_state === 'runner',
    fallbackR: r.realized_r
  });
}

/**
 * Returns all closed/runner Scalping & Swing setups formatted as Calendar Outcomes
 * so the Session Performance Calendar can toggle between Intraday, Scalping, and Swing.
 */
export async function getMtfCalendarOutcomes(): Promise<any[]> {
  await ensureMtfTrackerTable();
  const rows = await queryDb<TrackedMtfSetupRow>(
    `SELECT * FROM mtf_style_setups
     WHERE signal_state IN ('resolved', 'runner', 'tp1_hit', 'tp2_hit', 'stopped', 'expired')
     ORDER BY COALESCE(resolved_at, updated_at, created_at) DESC`
  );

  return rows.map((r) => {
    const mappedOutcomeType =
      r.outcome_type ||
      (r.signal_state === 'tp2_hit'
        ? 'tp2_hit'
        : r.signal_state === 'tp1_hit' || r.signal_state === 'runner'
          ? 'tp1_hit'
          : r.signal_state === 'stopped'
            ? 'sl_hit'
            : r.signal_state === 'expired'
              ? 'be_hit'
              : 'resolved');

    const realizedR = getMtfRowBlendedR(r);
    const entryPx = r.entry_price_recorded || r.entry_zone_mid;
    const origStop = r.initial_stop || r.stop;
    const exitPx =
      r.execution_price ||
      (mappedOutcomeType === 'tp2_hit'
        ? r.tp2
        : mappedOutcomeType === 'tp1_hit'
          ? r.tp1
          : mappedOutcomeType === 'sl_hit'
            ? origStop
            : entryPx);

    const timeSignaled = r.created_at;
    const timeEntered = r.entry_triggered_at || r.filled_at || r.created_at;
    const timeExited = r.resolved_at || r.updated_at || r.filled_at || r.created_at;

    let timeToFillMin: number | undefined;
    if (timeSignaled && timeEntered) {
      const diff = (new Date(timeEntered).getTime() - new Date(timeSignaled).getTime()) / 60000;
      if (Number.isFinite(diff) && diff >= 0) timeToFillMin = Number(diff.toFixed(1));
    }

    let holdMin: number | undefined;
    if (timeEntered && timeExited) {
      const diff = (new Date(timeExited).getTime() - new Date(timeEntered).getTime()) / 60000;
      if (Number.isFinite(diff) && diff >= 0) holdMin = Number(diff.toFixed(1));
    }

    return {
      id: `mtf_out_${r.id}`,
      setup_id: r.id,
      trading_style: r.trading_style, // 'SCALP' | 'SWING'
      swing_mode: r.swing_mode || undefined,
      context_tf: r.context_tf,
      entry_tf: r.entry_tf,
      instrument: r.instrument,
      market: r.market || (r.instrument.includes('/') ? 'forex' : 'futures'),
      setup_market: r.market || (r.instrument.includes('/') ? 'forex' : 'futures'),
      bias: r.bias,
      strategy_id: r.strategy_id || (r.trading_style === 'SCALP' ? 'manna_scalper' : 'manna_swing'),
      conviction_score: r.conviction_score,
      outcome_type: mappedOutcomeType,
      realized_r: realizedR,
      realized_pl: realizedR,
      entry_price: entryPx,
      entry_price_recorded: r.entry_price_recorded || entryPx,
      entry_zone_low: r.entry_zone_low,
      entry_zone_high: r.entry_zone_high,
      entry_zone_mid: r.entry_zone_mid,
      initial_stop: origStop,
      stop: r.stop,
      tp1: r.tp1,
      tp2: r.tp2,
      r_multiple_1: r.r_multiple_1 || 2.0,
      r_multiple_2: r.r_multiple_2 || 3.0,
      execution_price: exitPx,
      execution_time: timeExited,
      time_signaled: timeSignaled,
      time_entered: timeEntered,
      time_exited: timeExited,
      time_to_fill_min: timeToFillMin,
      holding_duration_min: holdMin,
      duration_min: holdMin,
      killzone_origin: r.killzone_origin || 'ny_am',
      created_at: timeExited,
      invalidation_reason: r.invalidation_reason || mappedOutcomeType,
      invalidation_detail: r.invalidation_detail || undefined,
      trade_id: r.id,
      metadata: r.metadata
    };
  });
}

export async function getTradingStyleComparisonReport(): Promise<{
  generatedAt: string;
  styles: StyleComparisonRow[];
  recentMtfSetups: TrackedMtfSetupRow[];
}> {
  await ensureMtfTrackerTable();

  const mtfRows = await queryDb<TrackedMtfSetupRow>(
    `SELECT * FROM mtf_style_setups ORDER BY created_at DESC LIMIT 500`
  );

  const normalizedMtfRows = mtfRows.map((r) => ({
    ...r,
    realized_r: getMtfRowBlendedR(r)
  }));

  const buildMtfStats = (
    style: 'SCALP' | 'SWING',
    label: string,
    timeframes: string
  ): StyleComparisonRow => {
    const rows = normalizedMtfRows.filter((r) => r.trading_style === style);
    const awaitingEntry = rows.filter((r) => r.signal_state === 'awaiting_entry').length;
    const activeSetups = rows.filter((r) => r.signal_state === 'active' || r.signal_state === 'runner').length;

    const isWinRow = (r: TrackedMtfSetupRow) =>
      r.signal_state === 'tp1_hit' ||
      r.signal_state === 'tp2_hit' ||
      r.signal_state === 'runner' ||
      (r.signal_state === 'resolved' && (r.outcome_type === 'tp1_hit' || r.outcome_type === 'tp2_hit'));
    const isLossRow = (r: TrackedMtfSetupRow) =>
      r.signal_state === 'stopped' ||
      (r.signal_state === 'resolved' && r.outcome_type === 'sl_hit');
    const isBeRow = (r: TrackedMtfSetupRow) =>
      r.signal_state === 'expired' ||
      (r.signal_state === 'resolved' && r.outcome_type === 'be_hit');

    const wins = rows.filter(isWinRow).length;
    const losses = rows.filter(isLossRow).length;
    const breakevens = rows.filter(isBeRow).length;
    const resolvedSetups = wins + losses + breakevens;
    const winRate = wins + losses > 0 ? Number(((wins / (wins + losses)) * 100).toFixed(1)) : 0;
    const totalRealizedR = Number(rows.reduce((sum, r) => sum + (Number(r.realized_r) || 0), 0).toFixed(2));
    const expectancyR = resolvedSetups > 0 ? Number((totalRealizedR / resolvedSetups).toFixed(2)) : 0;
    const avgConviction = rows.length > 0
      ? Number((rows.reduce((sum, r) => sum + (Number(r.conviction_score) || 0), 0) / rows.length).toFixed(1))
      : 0;

    return {
      style,
      label,
      timeframes,
      totalSetups: rows.length,
      awaitingEntry,
      activeSetups,
      resolvedSetups,
      wins,
      losses,
      breakevens,
      winRate,
      totalRealizedR,
      expectancyR,
      avgConviction,
      futuresCount: rows.filter((r) => r.market === 'futures').length,
      forexCount: rows.filter((r) => r.market === 'forex').length
    };
  };

  // Intraday stats from existing edge_setups + forex_edge_setups + outcomes (read-only)
  const [futuresSetups, forexSetups, outcomes] = await Promise.all([
    queryDb<any>(`SELECT id, signal_state, conviction_score, r_multiple_1, r_multiple_2 FROM edge_setups WHERE superseded = 0`),
    queryDb<any>(`SELECT id, signal_state, conviction_score, r_multiple_1, r_multiple_2 FROM forex_edge_setups WHERE superseded = 0`),
    queryDb<any>(`SELECT setup_id, outcome_type, was_runner, realized_pl FROM outcomes`)
  ]);

  const allIntraday = [...futuresSetups, ...forexSetups];
  const setupMap = new Map<string, any>();
  for (const s of allIntraday) setupMap.set(String(s.id), s);

  let intraWins = 0;
  let intraLosses = 0;
  let intraBe = 0;
  let intraTotalR = 0;

  for (const o of outcomes) {
    const parent = setupMap.get(String(o.setup_id));
    const typeStr = String(o.outcome_type || '').toLowerCase();
    const tradeR = computeBlendedRealizedR({
      outcomeType: o.outcome_type,
      rMultiple1: parent?.r_multiple_1 || 2.0,
      rMultiple2: parent?.r_multiple_2 || 3.0,
      wasRunner: o.was_runner,
      fallbackR: o.realized_pl
    });
    if (typeStr.includes('tp') || ((typeStr.includes('be') || typeStr.includes('breakeven')) && o.was_runner)) {
      intraWins++;
    } else if (typeStr.includes('sl') || typeStr.includes('stop')) {
      intraLosses++;
    } else if (typeStr.includes('be') || typeStr.includes('breakeven')) {
      intraBe++;
    } else if (tradeR > 0) {
      intraWins++;
    } else if (tradeR < 0) {
      intraLosses++;
    } else {
      intraBe++;
    }
    intraTotalR += tradeR;
  }

  intraTotalR = Number(intraTotalR.toFixed(2));
  const intraResolved = intraWins + intraLosses + intraBe;
  const intraWinRate = intraWins + intraLosses > 0 ? Number(((intraWins / (intraWins + intraLosses)) * 100).toFixed(1)) : 0;
  const intraExpectancy = intraResolved > 0 ? Number((intraTotalR / intraResolved).toFixed(2)) : 0;
  const intraAvgConv = allIntraday.length > 0
    ? Number((allIntraday.reduce((sum: number, s: any) => sum + (Number(s.conviction_score) || 0), 0) / allIntraday.length).toFixed(1))
    : 0;

  const intradayRow: StyleComparisonRow = {
    style: 'INTRADAY',
    label: 'Intraday (Core Engine)',
    timeframes: '1H · 15M',
    totalSetups: allIntraday.length,
    awaitingEntry: allIntraday.filter((s: any) => s.signal_state === 'awaiting_entry').length,
    activeSetups: allIntraday.filter((s: any) => s.signal_state === 'active').length,
    resolvedSetups: intraResolved,
    wins: intraWins,
    losses: intraLosses,
    breakevens: intraBe,
    winRate: intraWinRate,
    totalRealizedR: intraTotalR,
    expectancyR: intraExpectancy,
    avgConviction: intraAvgConv,
    futuresCount: futuresSetups.length,
    forexCount: forexSetups.length
  };

  return {
    generatedAt: new Date().toISOString(),
    styles: [
      buildMtfStats('SCALP', 'Scalping Desk', '15M · 5M'),
      intradayRow,
      buildMtfStats('SWING', 'Swing Desk', 'D1 · 4H / 4H · 1H')
    ],
    recentMtfSetups: normalizedMtfRows.slice(0, 40)
  };
}
