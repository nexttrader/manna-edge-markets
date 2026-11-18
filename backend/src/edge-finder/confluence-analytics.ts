import { computeBlendedRealizedR } from '../analytics/r-accounting';
import { queryDb } from '../db/database';
import {
  AssetEdgeScorecard,
  buildEdgeFinderSnapshot,
  EdgeBiasLabel,
  reconstructHistoricalScorecardsAtTimestamps,
  resolveEdgeFinderInstrument
} from './edge-finder-service';

export type ConfluenceCategoryKey =
  | 'STRONG_CONFLUENCE'
  | 'EDGEFINDER_AGREES'
  | 'PARTIAL_CONFLUENCE'
  | 'EDGEFINDER_NEUTRAL'
  | 'COUNTER_MACRO_BIAS';

export type HorizonAgreementStatus = 'AGREES' | 'NEUTRAL' | 'COUNTER';
export type EdgeConfluenceState = 'STRONG_AGREEMENT' | 'AGREES' | 'NEUTRAL' | 'COUNTER';
export type ConfluenceProvenance = 'LIVE_CAPTURED' | 'HISTORICAL_RECONSTRUCTED';

export interface SignalCardConfluenceClassification {
  categoryKey: ConfluenceCategoryKey;
  state: EdgeConfluenceState;
  badgeText: string;
  agreesWithEdgeFinder: boolean;
  agreementTier: 'FULL' | 'AGREES' | 'PARTIAL' | 'NEUTRAL' | 'COUNTER';
  biasLabel: EdgeBiasLabel;
  totalScore: number;
  scalpScore: number;
  intradayScore: number;
  swingScore: number;
  matchingHorizons: string[];
  opposingHorizons: string[];
  summaryText: string;
}

export interface ConfluenceCategoryStats {
  categoryKey: string;
  label: string;
  badgeText: string;
  description: string;
  agreesGroup: 'AGREES_FULL_OR_PART' | 'NEUTRAL' | 'COUNTER' | 'BENCHMARK';
  totalSignals: number;
  awaitingEntry: number;
  activeTrades: number;
  invalidatedSignals: number;
  supersededSignals: number;
  filledTrades: number;
  resolvedTrades: number;
  fillRatePct: number;
  wins: number;
  losses: number;
  breakevens: number;
  tp1Hits: number;
  tp2Hits: number;
  winRatePct: number;
  wilson95CiLowPct: number;
  wilson95CiHighPct: number;
  totalRealizedR: number;
  expectancyR: number;
  expectancy95CiLowR: number;
  expectancy95CiHighR: number;
  stdDevR: number;
  avgWinR: number;
  avgLossR: number;
  payoffRatio: number;
  profitFactor: number;
  breakEvenWinRatePct: number;
  edgeOverBreakEvenPct: number;
  maxDrawdownR: number;
  oneSampleTStat: number | null;
  oneSamplePValueOneSided: number | null;
  oneSamplePValueTwoSided: number | null;
  statisticallySignificantPositiveR: boolean;
  verdict: 'PROVEN_POSITIVE_EDGE' | 'DIRECTIONAL_POSITIVE' | 'NEGATIVE_OR_UNPROVEN' | 'INSUFFICIENT_SAMPLE';
  equityCurve: Array<{
    index: number;
    date: string;
    instrument: string;
    rVal: number;
    cumulativeR: number;
  }>;
}

export interface ConfluenceHeadToHeadProof {
  id: string;
  title: string;
  groupAKey: string;
  groupALabel: string;
  groupBKey: string;
  groupBLabel: string;
  nA: number;
  nB: number;
  winRateAPct: number;
  winRateBPct: number;
  winRateDeltaPct: number;
  expectancyAR: number;
  expectancyBR: number;
  expectancyDeltaR: number;
  totalRA: number;
  totalRB: number;
  twoPropZStat: number | null;
  twoPropPValue: number | null;
  fisherExactPValue: number | null;
  welchTStat: number | null;
  welchDf: number | null;
  welchPValue: number | null;
  cohensD: number | null;
  verdict: 'MATHEMATICALLY_PROVEN' | 'DIRECTIONAL_OUTPERFORMANCE' | 'NO_SIGNIFICANT_DIFFERENCE' | 'INSUFFICIENT_SAMPLE';
  proofStatement: string;
}

export interface TrackedConfluenceSignalRow {
  setupId: string;
  sourceTable: 'edge_setups' | 'forex_edge_setups' | 'mtf_style_setups';
  instrument: string;
  resolvedInstrument: string;
  market: string;
  tradingStyle: 'INTRADAY' | 'SCALP' | 'SWING';
  strategyId: string;
  bias: string;
  killzoneOrigin: string;
  convictionScore: number;
  signalState: string;
  outcomeType: string | null;
  isResolved: boolean;
  isWin: boolean;
  isLoss: boolean;
  isBreakeven: boolean;
  realizedR: number | null;
  categoryKey: ConfluenceCategoryKey;
  badgeText: string;
  confluenceState: EdgeConfluenceState;
  agreesWithEdgeFinder: boolean;
  scalpScore: number;
  intradayScore: number;
  swingScore: number;
  totalScore: number;
  biasLabel: string;
  matchingHorizons: string[];
  opposingHorizons: string[];
  summaryText: string;
  provenance: ConfluenceProvenance;
  createdAt: string;
  entryTriggeredAt: string | null;
  resolvedAt: string | null;
}

export interface ConfluenceAnalyticsFilters {
  period?: string; // 'november_2026' | 'all' | '30d' | '7d' | 'YYYY-MM'
  month?: string;  // e.g. '2026-11'
  style?: string;  // 'all' | 'INTRADAY' | 'SCALP' | 'SWING'
  market?: string; // 'all' | 'futures' | 'forex'
  strategyId?: string;
  autoBackfill?: boolean;
}

export interface ConfluencePerformanceReport {
  generatedAt: string;
  filters: {
    period: string;
    fromIso: string | null;
    untilIso: string | null;
    style: string;
    market: string;
    strategyId: string;
  };
  provenanceSummary: {
    totalTrackedSignals: number;
    liveCapturedCount: number;
    historicalReconstructedCount: number;
    unclassifiedCount: number;
  };
  categories: ConfluenceCategoryStats[];
  pooledGroups: {
    allSignals: ConfluenceCategoryStats;
    agreesFullOrPart: ConfluenceCategoryStats;
    nonAligned: ConfluenceCategoryStats;
  };
  comparisons: ConfluenceHeadToHeadProof[];
  styleBreakdown: Array<{
    style: 'INTRADAY' | 'SCALP' | 'SWING';
    agreesResolved: number;
    agreesWinRatePct: number;
    agreesTotalR: number;
    agreesExpectancyR: number;
    counterResolved: number;
    counterWinRatePct: number;
    counterTotalR: number;
    counterExpectancyR: number;
  }>;
  signals: TrackedConfluenceSignalRow[];
}

function classifyHorizonAgreement(signalIsLong: boolean, horizonScore: number): HorizonAgreementStatus {
  if (signalIsLong) {
    if (horizonScore >= 0.5) return 'AGREES';
    if (horizonScore <= -0.5) return 'COUNTER';
    return 'NEUTRAL';
  }
  if (horizonScore <= -0.5) return 'AGREES';
  if (horizonScore >= 0.5) return 'COUNTER';
  return 'NEUTRAL';
}

export function computeSignalCardConfluence(
  signalBias: string,
  scorecard: AssetEdgeScorecard
): SignalCardConfluenceClassification {
  const isLong = (signalBias || 'long').toLowerCase() === 'long';
  const dirLabel = isLong ? 'LONG' : 'SHORT';

  const scalpScore = scorecard.timeframes?.SCALP?.score ?? scorecard.totalScore;
  const intradayScore = scorecard.timeframes?.INTRADAY?.score ?? scorecard.totalScore;
  const swingScore = scorecard.timeframes?.SWING?.score ?? scorecard.totalScore;

  const horizons = [
    { key: 'SCALP', label: 'Scalp', score: scalpScore, status: classifyHorizonAgreement(isLong, scalpScore) },
    { key: 'INTRADAY', label: 'Intraday', score: intradayScore, status: classifyHorizonAgreement(isLong, intradayScore) },
    { key: 'SWING', label: 'Swing', score: swingScore, status: classifyHorizonAgreement(isLong, swingScore) }
  ];

  const matchingHorizons = horizons.filter((h) => h.status === 'AGREES').map((h) => h.label);
  const opposingHorizons = horizons.filter((h) => h.status === 'COUNTER').map((h) => h.label);
  const intradayStatus = horizons[1].status;

  let categoryKey: ConfluenceCategoryKey = 'EDGEFINDER_NEUTRAL';
  let state: EdgeConfluenceState = 'NEUTRAL';
  let badgeText = 'EDGEFINDER NEUTRAL';
  let agreesWithEdgeFinder = false;
  let agreementTier: SignalCardConfluenceClassification['agreementTier'] = 'NEUTRAL';
  let summaryText = `EdgeFinder macro & flow signals on ${scorecard.instrument} are currently balanced / Neutral.`;

  if (matchingHorizons.length === 3) {
    categoryKey = 'STRONG_CONFLUENCE';
    state = 'STRONG_AGREEMENT';
    badgeText = 'STRONG CONFLUENCE (3/3 TF)';
    agreesWithEdgeFinder = true;
    agreementTier = 'FULL';
    summaryText = `EdgeFinder Scalp, Intraday & Swing views all align ${dirLabel} with this signal.`;
  } else if (intradayStatus === 'AGREES' || (matchingHorizons.length >= 2 && opposingHorizons.length === 0)) {
    categoryKey = 'EDGEFINDER_AGREES';
    state = 'AGREES';
    badgeText = 'EDGEFINDER AGREES';
    agreesWithEdgeFinder = true;
    agreementTier = 'AGREES';
    summaryText = `${matchingHorizons.join(' & ')} EdgeFinder ${matchingHorizons.length > 1 ? 'views agree' : 'view agrees'} ${dirLabel} with this setup.`;
  } else if (
    intradayStatus === 'COUNTER' ||
    (opposingHorizons.length >= 2 && matchingHorizons.length === 0)
  ) {
    categoryKey = 'COUNTER_MACRO_BIAS';
    state = 'COUNTER';
    badgeText = 'COUNTER MACRO BIAS';
    agreesWithEdgeFinder = false;
    agreementTier = 'COUNTER';
    summaryText = `Wider EdgeFinder bias leans opposite (${scorecard.biasLabel}) — trade strictly by your Manna levels.`;
  } else if (matchingHorizons.length === 1) {
    categoryKey = 'PARTIAL_CONFLUENCE';
    state = 'AGREES';
    badgeText = 'PARTIAL CONFLUENCE';
    agreesWithEdgeFinder = true;
    agreementTier = 'PARTIAL';
    summaryText = `${matchingHorizons[0]} EdgeFinder agrees ${dirLabel}; wider timeframe factors remain mixed.`;
  }

  return {
    categoryKey,
    state,
    badgeText,
    agreesWithEdgeFinder,
    agreementTier,
    biasLabel: scorecard.timeframes?.INTRADAY?.biasLabel ?? scorecard.biasLabel,
    totalScore: scorecard.totalScore,
    scalpScore,
    intradayScore,
    swingScore,
    matchingHorizons,
    opposingHorizons,
    summaryText
  };
}

let tableEnsured = false;

export async function ensureSignalConfluenceTable(): Promise<void> {
  if (tableEnsured) return;
  await queryDb(`
    CREATE TABLE IF NOT EXISTS signal_confluence_logs (
      setup_id TEXT PRIMARY KEY,
      source_table TEXT NOT NULL,
      instrument TEXT NOT NULL,
      resolved_instrument TEXT NOT NULL,
      market TEXT NOT NULL,
      trading_style TEXT NOT NULL,
      strategy_id TEXT,
      bias TEXT NOT NULL,
      category_key TEXT NOT NULL,
      badge_text TEXT NOT NULL,
      confluence_state TEXT NOT NULL,
      scalp_score REAL NOT NULL,
      intraday_score REAL NOT NULL,
      swing_score REAL NOT NULL,
      total_score REAL NOT NULL,
      bias_label TEXT NOT NULL,
      matching_horizons TEXT NOT NULL,
      opposing_horizons TEXT NOT NULL,
      summary_text TEXT NOT NULL,
      provenance TEXT NOT NULL,
      signal_created_at TEXT NOT NULL,
      captured_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  try {
    await queryDb(`CREATE INDEX IF NOT EXISTS idx_scl_category ON signal_confluence_logs(category_key)`);
    await queryDb(`CREATE INDEX IF NOT EXISTS idx_scl_created ON signal_confluence_logs(signal_created_at)`);
  } catch {
    // ignore index creation quirks
  }
  tableEnsured = true;
}

export async function upsertSignalConfluenceLog(params: {
  setupId: string;
  sourceTable: 'edge_setups' | 'forex_edge_setups' | 'mtf_style_setups';
  instrument: string;
  resolvedInstrument: string;
  market: string;
  tradingStyle: 'INTRADAY' | 'SCALP' | 'SWING';
  strategyId?: string | null;
  bias: string;
  classification: SignalCardConfluenceClassification;
  provenance: ConfluenceProvenance;
  signalCreatedAt: string;
  preserveLiveCaptured?: boolean;
}): Promise<void> {
  await ensureSignalConfluenceTable();
  const {
    setupId,
    sourceTable,
    instrument,
    resolvedInstrument,
    market,
    tradingStyle,
    strategyId,
    bias,
    classification,
    provenance,
    signalCreatedAt,
    preserveLiveCaptured = true
  } = params;

  if (preserveLiveCaptured) {
    const existing = await queryDb<{ provenance: string }>(
      `SELECT provenance FROM signal_confluence_logs WHERE setup_id = ?`,
      [setupId]
    );
    if (existing.length > 0 && existing[0].provenance === 'LIVE_CAPTURED' && provenance !== 'LIVE_CAPTURED') {
      return;
    }
  }

  const now = new Date().toISOString();
  await queryDb(
    `INSERT INTO signal_confluence_logs (
      setup_id, source_table, instrument, resolved_instrument, market, trading_style, strategy_id, bias,
      category_key, badge_text, confluence_state, scalp_score, intraday_score, swing_score, total_score,
      bias_label, matching_horizons, opposing_horizons, summary_text, provenance, signal_created_at, captured_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (setup_id) DO UPDATE SET
      source_table = excluded.source_table,
      instrument = excluded.instrument,
      resolved_instrument = excluded.resolved_instrument,
      market = excluded.market,
      trading_style = excluded.trading_style,
      strategy_id = excluded.strategy_id,
      bias = excluded.bias,
      category_key = excluded.category_key,
      badge_text = excluded.badge_text,
      confluence_state = excluded.confluence_state,
      scalp_score = excluded.scalp_score,
      intraday_score = excluded.intraday_score,
      swing_score = excluded.swing_score,
      total_score = excluded.total_score,
      bias_label = excluded.bias_label,
      matching_horizons = excluded.matching_horizons,
      opposing_horizons = excluded.opposing_horizons,
      summary_text = excluded.summary_text,
      provenance = excluded.provenance,
      signal_created_at = excluded.signal_created_at,
      updated_at = excluded.updated_at`,
    [
      setupId,
      sourceTable,
      instrument,
      resolvedInstrument,
      market,
      tradingStyle,
      strategyId || 'sentinel_v2',
      bias,
      classification.categoryKey,
      classification.badgeText,
      classification.state,
      classification.scalpScore,
      classification.intradayScore,
      classification.swingScore,
      classification.totalScore,
      classification.biasLabel,
      JSON.stringify(classification.matchingHorizons),
      JSON.stringify(classification.opposingHorizons),
      classification.summaryText,
      provenance,
      signalCreatedAt,
      now,
      now
    ]
  );
}

/**
 * Captures and persists the exact EdgeFinder Signal Card Confluence at signal creation time.
 * Runs safely with a non-blocking fallback so signal insertion is never delayed by external HTTP calls.
 */
export async function captureLiveSignalConfluence(params: {
  setupId: string;
  sourceTable: 'edge_setups' | 'forex_edge_setups' | 'mtf_style_setups';
  instrument: string;
  market: string;
  tradingStyle: 'INTRADAY' | 'SCALP' | 'SWING';
  strategyId?: string | null;
  bias: string;
  createdAt: string;
  scorecard?: AssetEdgeScorecard | null;
}): Promise<SignalCardConfluenceClassification | null> {
  try {
    let scorecard = params.scorecard || null;
    const resolved = resolveEdgeFinderInstrument(params.instrument);
    if (!scorecard) {
      const snap = await Promise.race([
        buildEdgeFinderSnapshot(false),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 2500))
      ]).catch(() => null);
      if (snap?.scorecards) {
        scorecard =
          snap.scorecards.find(
            (sc) =>
              sc.instrument.toUpperCase() === resolved ||
              sc.instrument.toUpperCase().replace(/[^A-Z0-9]/g, '') === resolved.replace(/[^A-Z0-9]/g, '')
          ) || null;
      }
    }
    if (!scorecard) return null;

    const classification = computeSignalCardConfluence(params.bias, scorecard);
    await upsertSignalConfluenceLog({
      setupId: params.setupId,
      sourceTable: params.sourceTable,
      instrument: params.instrument,
      resolvedInstrument: scorecard.instrument,
      market: params.market,
      tradingStyle: params.tradingStyle,
      strategyId: params.strategyId,
      bias: params.bias,
      classification,
      provenance: 'LIVE_CAPTURED',
      signalCreatedAt: params.createdAt,
      preserveLiveCaptured: false
    });
    return classification;
  } catch {
    return null;
  }
}

// ── Mathematical & Statistical Proof Helpers ─────────────────────────────────

function roundNum(val: number, decimals = 2): number {
  if (!Number.isFinite(val)) return 0;
  const factor = Math.pow(10, decimals);
  return Math.round(val * factor) / factor;
}

/** Standard Normal CDF Φ(z) using Abramowitz & Stegun 7.1.26 (error < 1.5e-7) */
export function normalCdf(z: number): number {
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1.0 / (1.0 + 0.3275911 * x);
  const erf =
    1.0 -
    (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t) *
      Math.exp(-x * x);
  return 0.5 * (1.0 + sign * erf);
}

function logGamma(z: number): number {
  const p = [
    676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012,
    9.9843695780195716e-6, 1.5056327351493116e-7
  ];
  if (z < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * z)) - logGamma(1 - z);
  }
  const zm = z - 1;
  let x = 0.99999999999980993;
  for (let i = 0; i < p.length; i++) {
    x += p[i] / (zm + i + 1);
  }
  const t = zm + p.length - 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (zm + 0.5) * Math.log(t) - t + Math.log(x);
}

function betaContinuedFraction(a: number, b: number, x: number): number {
  const MAXIT = 200;
  const EPS = 3e-12;
  const FPMIN = 1e-30;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

function regularizedIncompleteBeta(a: number, b: number, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(
    logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x)
  );
  if (x < (a + 1) / (a + b + 2)) {
    return (bt * betaContinuedFraction(a, b, x)) / a;
  }
  return 1 - (bt * betaContinuedFraction(b, a, 1 - x)) / b;
}

/** Exact two-sided p-value for Student's t distribution with df > 0 */
export function studentTTwoSidedPValue(tStat: number, df: number): number {
  if (!Number.isFinite(tStat) || !Number.isFinite(df) || df <= 0) return 1;
  if (tStat === 0) return 1;
  const x = df / (df + tStat * tStat);
  return Math.min(1, Math.max(0, regularizedIncompleteBeta(df / 2, 0.5, x)));
}

/** Inverse two-sided t quantile t_{0.025, df} via bisection for exact 95% CI */
function tCritical95(df: number): number {
  if (df <= 0) return 1.96;
  if (df > 500) return 1.96;
  let lo = 1.9;
  let hi = 12.8;
  for (let i = 0; i < 40; i++) {
    const mid = 0.5 * (lo + hi);
    const p = studentTTwoSidedPValue(mid, df);
    if (p > 0.05) lo = mid;
    else hi = mid;
  }
  return 0.5 * (lo + hi);
}

/** Exact Wilson Score 95% confidence interval for binomial proportion (returned in %) */
export function wilsonScoreInterval95(wins: number, total: number): { lowPct: number; highPct: number } {
  if (total <= 0) return { lowPct: 0, highPct: 0 };
  const z = 1.95996398454;
  const z2 = z * z;
  const p = wins / total;
  const denom = 1 + z2 / total;
  const center = (p + z2 / (2 * total)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / total + z2 / (4 * total * total))) / denom;
  return {
    lowPct: roundNum(Math.max(0, center - half) * 100, 1),
    highPct: roundNum(Math.min(1, center + half) * 100, 1)
  };
}

function logFactorial(n: number): number {
  if (n <= 1) return 0;
  return logGamma(n + 1);
}

function hypergeometricProb(k: number, n1: number, n2: number, t: number): number {
  const N = n1 + n2;
  return Math.exp(
    logFactorial(n1) - logFactorial(k) - logFactorial(n1 - k) +
    logFactorial(n2) - logFactorial(t - k) - logFactorial(n2 - (t - k)) -
    (logFactorial(N) - logFactorial(t) - logFactorial(N - t))
  );
}

/** Two-sided Fisher's Exact Test p-value for 2x2 win/loss contingency table */
export function fisherExactTwoSided(winsA: number, lossesA: number, winsB: number, lossesB: number): number | null {
  const n1 = winsA + lossesA;
  const n2 = winsB + lossesB;
  if (n1 <= 0 || n2 <= 0) return null;
  const t = winsA + winsB;
  const minK = Math.max(0, t - n2);
  const maxK = Math.min(n1, t);
  const pObs = hypergeometricProb(winsA, n1, n2, t);
  let pTotal = 0;
  for (let k = minK; k <= maxK; k++) {
    const p = hypergeometricProb(k, n1, n2, t);
    if (p <= pObs + 1e-12) {
      pTotal += p;
    }
  }
  return Math.min(1, Math.max(0, roundNum(pTotal, 5)));
}

// ── Unified Signal & Outcome Loading ─────────────────────────────────────────

interface RawUnifiedSignal {
  setupId: string;
  sourceTable: 'edge_setups' | 'forex_edge_setups' | 'mtf_style_setups';
  instrument: string;
  market: string;
  tradingStyle: 'INTRADAY' | 'SCALP' | 'SWING';
  strategyId: string;
  bias: string;
  killzoneOrigin: string;
  convictionScore: number;
  signalState: string;
  rMultiple1: number;
  rMultiple2: number;
  invalidationReason: string | null;
  metadataStr: string | null;
  createdAt: string;
  entryTriggeredAt: string | null;
  resolvedAt: string | null;
  // Outcome fields
  outcomeType: string | null;
  realizedR: number | null;
  wasRunner: boolean;
}

function resolveDateBounds(periodInput?: string, monthInput?: string): { periodLabel: string; fromIso: string | null; untilIso: string | null } {
  const rawMonth = (monthInput || '').trim();
  const rawPeriod = (periodInput || 'november_2026').trim().toLowerCase();

  if (/^\d{4}-\d{2}$/.test(rawMonth)) {
    const [y, m] = rawMonth.split('-').map(Number);
    const start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0));
    const end = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));
    return { periodLabel: rawMonth, fromIso: start.toISOString(), untilIso: end.toISOString() };
  }

  if (/^\d{4}-\d{2}$/.test(rawPeriod)) {
    const [y, m] = rawPeriod.split('-').map(Number);
    const start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0));
    const end = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));
    return { periodLabel: rawPeriod, fromIso: start.toISOString(), untilIso: end.toISOString() };
  }

  if (rawPeriod === 'november_2026' || rawPeriod === 'november' || rawPeriod === 'nov_2026') {
    return {
      periodLabel: 'november_2026',
      fromIso: '2026-11-01T00:00:00.000Z',
      untilIso: '2026-11-30T23:59:59.999Z'
    };
  }

  if (rawPeriod === '30d') {
    return {
      periodLabel: '30d',
      fromIso: new Date(Date.now() - 30 * 86_400_000).toISOString(),
      untilIso: null
    };
  }

  if (rawPeriod === '7d') {
    return {
      periodLabel: '7d',
      fromIso: new Date(Date.now() - 7 * 86_400_000).toISOString(),
      untilIso: null
    };
  }

  return { periodLabel: 'all', fromIso: null, untilIso: null };
}

async function loadUnifiedSignals(fromIso: string | null, untilIso: string | null): Promise<RawUnifiedSignal[]> {
  const [futuresRows, forexRows, outcomeRows] = await Promise.all([
    queryDb<any>(`SELECT * FROM edge_setups ORDER BY created_at DESC`).catch(() => []),
    queryDb<any>(`SELECT * FROM forex_edge_setups ORDER BY created_at DESC`).catch(() => []),
    queryDb<any>(`SELECT * FROM outcomes ORDER BY created_at ASC`).catch(() => [])
  ]);

  let mtfRows: any[] = [];
  try {
    mtfRows = await queryDb<any>(`SELECT * FROM mtf_style_setups ORDER BY created_at DESC`);
  } catch {
    mtfRows = [];
  }

  const outcomeBySetupId = new Map<string, any>();
  for (const o of outcomeRows) {
    if (!outcomeBySetupId.has(String(o.setup_id))) {
      outcomeBySetupId.set(String(o.setup_id), o);
    }
  }

  const deduped = new Map<string, RawUnifiedSignal>();
  const withinBounds = (iso: string): boolean => {
    if (!iso) return false;
    if (fromIso && iso < fromIso) return false;
    if (untilIso && iso > untilIso) return false;
    return true;
  };

  const ingestCoreRow = (row: any, sourceTable: 'edge_setups' | 'forex_edge_setups') => {
    const id = String(row.id);
    if (deduped.has(id)) return;
    const createdAt = String(row.created_at || '');
    if (!withinBounds(createdAt)) return;

    const outcome = outcomeBySetupId.get(id);
    const state = String(row.signal_state || 'awaiting_entry').toLowerCase();
    const outcomeType = outcome?.outcome_type
      ? String(outcome.outcome_type)
      : state === 'resolved' && row.invalidation_reason
      ? String(row.invalidation_reason)
      : null;

    let realizedR: number | null = null;
    if (outcomeType || state === 'resolved' || state === 'runner') {
      realizedR = computeBlendedRealizedR({
        outcomeType,
        invalidationReason: row.invalidation_reason,
        rMultiple1: row.r_multiple_1,
        rMultiple2: row.r_multiple_2,
        wasRunner: outcome?.was_runner || state === 'runner',
        fallbackR: outcome?.realized_pl
      });
    }

    deduped.set(id, {
      setupId: id,
      sourceTable,
      instrument: String(row.instrument || ''),
      market: String(row.market || (sourceTable === 'forex_edge_setups' ? 'forex' : 'futures')).toLowerCase(),
      tradingStyle: 'INTRADAY',
      strategyId: String(row.strategy_id || 'sentinel_v2'),
      bias: String(row.bias || 'long').toLowerCase(),
      killzoneOrigin: String(row.killzone_origin || 'NY_AM'),
      convictionScore: Number(row.conviction_score || 0),
      signalState: state,
      rMultiple1: Number(row.r_multiple_1 || 2.0),
      rMultiple2: Number(row.r_multiple_2 || 3.0),
      invalidationReason: row.invalidation_reason || null,
      metadataStr: row.metadata || null,
      createdAt,
      entryTriggeredAt: row.entry_triggered_at || null,
      resolvedAt: row.resolved_at || outcome?.created_at || null,
      outcomeType,
      realizedR,
      wasRunner: Boolean(outcome?.was_runner || state === 'runner')
    });
  };

  for (const r of futuresRows) ingestCoreRow(r, 'edge_setups');
  for (const r of forexRows) ingestCoreRow(r, 'forex_edge_setups');

  for (const r of mtfRows) {
    const id = String(r.id);
    if (deduped.has(id)) continue;
    const createdAt = String(r.created_at || '');
    if (!withinBounds(createdAt)) continue;

    const styleUpper = String(r.trading_style || 'SCALP').toUpperCase();
    const tradingStyle: 'SCALP' | 'SWING' = styleUpper === 'SWING' ? 'SWING' : 'SCALP';
    const state = String(r.signal_state || 'awaiting_entry').toLowerCase();
    const outcomeType = r.outcome_type ? String(r.outcome_type) : null;

    let realizedR: number | null = null;
    if (outcomeType || state === 'resolved' || state === 'runner') {
      realizedR = computeBlendedRealizedR({
        outcomeType,
        invalidationReason: r.invalidation_reason,
        rMultiple1: r.r_multiple_1,
        rMultiple2: r.r_multiple_2,
        wasRunner: state === 'runner',
        fallbackR: r.realized_r
      });
    }

    deduped.set(id, {
      setupId: id,
      sourceTable: 'mtf_style_setups',
      instrument: String(r.instrument || ''),
      market: String(r.market || 'forex').toLowerCase(),
      tradingStyle,
      strategyId: String(r.strategy_id || (tradingStyle === 'SCALP' ? 'mtf_scalp' : 'mtf_swing')),
      bias: String(r.bias || 'long').toLowerCase(),
      killzoneOrigin: String(r.killzone_origin || 'NY_AM'),
      convictionScore: Number(r.conviction_score || 0),
      signalState: state,
      rMultiple1: Number(r.r_multiple_1 || 2.0),
      rMultiple2: Number(r.r_multiple_2 || 3.0),
      invalidationReason: r.invalidation_reason || null,
      metadataStr: r.metadata || null,
      createdAt,
      entryTriggeredAt: r.entry_triggered_at || null,
      resolvedAt: r.resolved_at || null,
      outcomeType,
      realizedR,
      wasRunner: state === 'runner'
    });
  }

  return Array.from(deduped.values()).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function backfillHistoricalSignalConfluence(options?: {
  period?: string;
  month?: string;
  forceRecompute?: boolean;
}): Promise<{ processed: number; reconstructed: number; skippedExisting: number }> {
  await ensureSignalConfluenceTable();
  const bounds = resolveDateBounds(options?.period || 'november_2026', options?.month);
  const signals = await loadUnifiedSignals(bounds.fromIso, bounds.untilIso);
  if (signals.length === 0) {
    return { processed: 0, reconstructed: 0, skippedExisting: 0 };
  }

  const existingLogs = await queryDb<{ setup_id: string; provenance: string }>(
    `SELECT setup_id, provenance FROM signal_confluence_logs`
  );
  const existingMap = new Map(existingLogs.map((r) => [r.setup_id, r.provenance]));

  const needsReconstruct = signals.filter((s) => {
    const prov = existingMap.get(s.setupId);
    if (!prov) return true;
    if (options?.forceRecompute && prov !== 'LIVE_CAPTURED') return true;
    return false;
  });

  if (needsReconstruct.length === 0) {
    return { processed: signals.length, reconstructed: 0, skippedExisting: signals.length };
  }

  const reconstructedScorecards = await reconstructHistoricalScorecardsAtTimestamps(
    needsReconstruct.map((s) => ({
      key: s.setupId,
      instrument: s.instrument,
      timestampIso: s.createdAt,
      bias: s.bias,
      convictionScore: s.convictionScore,
      killzoneOrigin: s.killzoneOrigin
    }))
  );

  let reconstructedCount = 0;
  for (const sig of needsReconstruct) {
    const res = reconstructedScorecards.get(sig.setupId);
    if (!res) continue;
    const classification = computeSignalCardConfluence(sig.bias, res.scorecard);
    await upsertSignalConfluenceLog({
      setupId: sig.setupId,
      sourceTable: sig.sourceTable,
      instrument: sig.instrument,
      resolvedInstrument: res.scorecard.instrument,
      market: sig.market,
      tradingStyle: sig.tradingStyle,
      strategyId: sig.strategyId,
      bias: sig.bias,
      classification,
      provenance: 'HISTORICAL_RECONSTRUCTED',
      signalCreatedAt: sig.createdAt,
      preserveLiveCaptured: !options?.forceRecompute
    });
    reconstructedCount += 1;
  }

  return {
    processed: signals.length,
    reconstructed: reconstructedCount,
    skippedExisting: signals.length - needsReconstruct.length
  };
}

// ── Category Aggregation & Statistical Proof Computation ─────────────────────

const CATEGORY_META: Array<{
  key: ConfluenceCategoryKey;
  label: string;
  badgeText: string;
  description: string;
  agreesGroup: ConfluenceCategoryStats['agreesGroup'];
}> = [
  {
    key: 'STRONG_CONFLUENCE',
    label: 'Strong Confluence (3/3 TF)',
    badgeText: 'STRONG CONFLUENCE (3/3 TF)',
    description: 'Technical signal aligns with ALL 3 EdgeFinder horizons (Scalp + Intraday + Swing).',
    agreesGroup: 'AGREES_FULL_OR_PART'
  },
  {
    key: 'EDGEFINDER_AGREES',
    label: 'EdgeFinder Agrees',
    badgeText: 'EDGEFINDER AGREES',
    description: 'Intraday EdgeFinder agrees (or 2+ horizons agree with 0 opposing).',
    agreesGroup: 'AGREES_FULL_OR_PART'
  },
  {
    key: 'PARTIAL_CONFLUENCE',
    label: 'Partial Confluence',
    badgeText: 'PARTIAL CONFLUENCE',
    description: '1 EdgeFinder horizon agrees with technical signal while wider horizons are mixed.',
    agreesGroup: 'AGREES_FULL_OR_PART'
  },
  {
    key: 'EDGEFINDER_NEUTRAL',
    label: 'EdgeFinder Neutral',
    badgeText: 'EDGEFINDER NEUTRAL',
    description: 'EdgeFinder macro & flow scores are neutral/balanced or evenly split.',
    agreesGroup: 'NEUTRAL'
  },
  {
    key: 'COUNTER_MACRO_BIAS',
    label: 'Counter Macro Bias',
    badgeText: 'COUNTER MACRO BIAS',
    description: 'Technical signal opposes Intraday EdgeFinder or 2+ horizons without support.',
    agreesGroup: 'COUNTER'
  }
];

function computeCategoryStats(
  meta: {
    key: string;
    label: string;
    badgeText: string;
    description: string;
    agreesGroup: ConfluenceCategoryStats['agreesGroup'];
  },
  rows: TrackedConfluenceSignalRow[]
): ConfluenceCategoryStats {
  let awaitingEntry = 0;
  let activeTrades = 0;
  let invalidatedSignals = 0;
  let supersededSignals = 0;
  let filledTrades = 0;
  let wins = 0;
  let losses = 0;
  let breakevens = 0;
  let tp1Hits = 0;
  let tp2Hits = 0;

  const rValues: number[] = [];
  const winRs: number[] = [];
  const lossRs: number[] = [];
  const equityCurve: ConfluenceCategoryStats['equityCurve'] = [];

  let cumulativeR = 0;
  let peakR = 0;
  let maxDrawdownR = 0;

  const chronological = [...rows].sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  for (const row of chronological) {
    if (row.entryTriggeredAt || row.isResolved || row.signalState === 'active' || row.signalState === 'runner') {
      filledTrades++;
    }
    if (row.signalState === 'awaiting_entry') awaitingEntry++;
    else if (row.signalState === 'active' || row.signalState === 'runner') activeTrades++;
    else if (row.signalState === 'invalidated') invalidatedSignals++;
    else if (row.signalState === 'superseded') supersededSignals++;

    if (row.isResolved && row.realizedR !== null) {
      const r = row.realizedR;
      rValues.push(r);
      const ot = String(row.outcomeType || '').toLowerCase();
      if (row.isWin) {
        wins++;
        winRs.push(r);
        if (ot.includes('tp2')) tp2Hits++;
        else tp1Hits++;
      } else if (row.isLoss) {
        losses++;
        lossRs.push(Math.abs(r));
      } else {
        breakevens++;
      }

      cumulativeR = roundNum(cumulativeR + r, 2);
      if (cumulativeR > peakR) peakR = cumulativeR;
      const dd = roundNum(peakR - cumulativeR, 2);
      if (dd > maxDrawdownR) maxDrawdownR = dd;

      equityCurve.push({
        index: equityCurve.length + 1,
        date: row.resolvedAt || row.createdAt,
        instrument: row.instrument,
        rVal: roundNum(r, 2),
        cumulativeR
      });
    }
  }

  const resolvedTrades = rValues.length;
  const totalSignals = rows.length;
  const fillRatePct = totalSignals > 0 ? roundNum((filledTrades / totalSignals) * 100, 1) : 0;

  // Win rate uses decided outcomes (or total resolved; matches standard institutional win rate wins / resolvedTrades)
  const winRatePct = resolvedTrades > 0 ? roundNum((wins / resolvedTrades) * 100, 1) : 0;
  const wilson = wilsonScoreInterval95(wins, resolvedTrades);

  const totalRealizedR = roundNum(rValues.reduce((s, r) => s + r, 0), 2);
  const expectancyR = resolvedTrades > 0 ? roundNum(totalRealizedR / resolvedTrades, 3) : 0;

  let stdDevR = 0;
  let expectancy95CiLowR = expectancyR;
  let expectancy95CiHighR = expectancyR;
  let oneSampleTStat: number | null = null;
  let oneSamplePValueOneSided: number | null = null;
  let oneSamplePValueTwoSided: number | null = null;

  if (resolvedTrades >= 2) {
    const mean = totalRealizedR / resolvedTrades;
    const sqDiffs = rValues.reduce((s, r) => s + (r - mean) ** 2, 0);
    stdDevR = roundNum(Math.sqrt(sqDiffs / (resolvedTrades - 1)), 3);
    const se = stdDevR / Math.sqrt(resolvedTrades);
    const df = resolvedTrades - 1;
    const tCrit = tCritical95(df);
    expectancy95CiLowR = roundNum(mean - tCrit * se, 3);
    expectancy95CiHighR = roundNum(mean + tCrit * se, 3);
    if (se > 0) {
      const t = mean / se;
      oneSampleTStat = roundNum(t, 3);
      const pTwo = studentTTwoSidedPValue(t, df);
      oneSamplePValueTwoSided = roundNum(pTwo, 5);
      oneSamplePValueOneSided = roundNum(t >= 0 ? pTwo / 2 : 1 - pTwo / 2, 5);
    }
  }

  const winningRSum = winRs.reduce((s, r) => s + r, 0);
  const losingRSum = lossRs.reduce((s, r) => s + r, 0);
  const avgWinR = winRs.length > 0 ? roundNum(winningRSum / winRs.length, 2) : 0;
  const avgLossR = lossRs.length > 0 ? roundNum(losingRSum / lossRs.length, 2) : 1.0;
  const payoffRatio = avgLossR > 0 && avgWinR > 0 ? roundNum(avgWinR / avgLossR, 2) : 0;
  const profitFactor =
    losingRSum > 0 ? roundNum(winningRSum / losingRSum, 2) : winningRSum > 0 ? 99.9 : 0;

  const breakEvenWinRatePct =
    avgWinR > 0 ? roundNum((avgLossR / (avgWinR + avgLossR)) * 100, 1) : 50.0;
  const edgeOverBreakEvenPct = resolvedTrades > 0 ? roundNum(winRatePct - breakEvenWinRatePct, 1) : 0;

  const statisticallySignificantPositiveR =
    resolvedTrades >= 5 &&
    expectancyR > 0 &&
    oneSamplePValueOneSided !== null &&
    oneSamplePValueOneSided < 0.05;

  let verdict: ConfluenceCategoryStats['verdict'] = 'INSUFFICIENT_SAMPLE';
  if (resolvedTrades < 5) {
    verdict = 'INSUFFICIENT_SAMPLE';
  } else if (statisticallySignificantPositiveR) {
    verdict = 'PROVEN_POSITIVE_EDGE';
  } else if (expectancyR > 0) {
    verdict = 'DIRECTIONAL_POSITIVE';
  } else {
    verdict = 'NEGATIVE_OR_UNPROVEN';
  }

  return {
    categoryKey: meta.key,
    label: meta.label,
    badgeText: meta.badgeText,
    description: meta.description,
    agreesGroup: meta.agreesGroup,
    totalSignals,
    awaitingEntry,
    activeTrades,
    invalidatedSignals,
    supersededSignals,
    filledTrades,
    resolvedTrades,
    fillRatePct,
    wins,
    losses,
    breakevens,
    tp1Hits,
    tp2Hits,
    winRatePct,
    wilson95CiLowPct: wilson.lowPct,
    wilson95CiHighPct: wilson.highPct,
    totalRealizedR,
    expectancyR,
    expectancy95CiLowR,
    expectancy95CiHighR,
    stdDevR,
    avgWinR,
    avgLossR,
    payoffRatio,
    profitFactor,
    breakEvenWinRatePct,
    edgeOverBreakEvenPct,
    maxDrawdownR,
    oneSampleTStat,
    oneSamplePValueOneSided,
    oneSamplePValueTwoSided,
    statisticallySignificantPositiveR,
    verdict,
    equityCurve
  };
}

function compareGroupsMathematically(params: {
  id: string;
  title: string;
  statsA: ConfluenceCategoryStats;
  rowsA: TrackedConfluenceSignalRow[];
  statsB: ConfluenceCategoryStats;
  rowsB: TrackedConfluenceSignalRow[];
}): ConfluenceHeadToHeadProof {
  const { id, title, statsA, rowsA, statsB, rowsB } = params;
  const rA = rowsA.filter((r) => r.isResolved && r.realizedR !== null).map((r) => r.realizedR!);
  const rB = rowsB.filter((r) => r.isResolved && r.realizedR !== null).map((r) => r.realizedR!);
  const nA = rA.length;
  const nB = rB.length;

  const winRateDeltaPct = roundNum(statsA.winRatePct - statsB.winRatePct, 1);
  const expectancyDeltaR = roundNum(statsA.expectancyR - statsB.expectancyR, 3);

  let twoPropZStat: number | null = null;
  let twoPropPValue: number | null = null;
  let fisherExactPValue: number | null = null;
  let welchTStat: number | null = null;
  let welchDf: number | null = null;
  let welchPValue: number | null = null;
  let cohensD: number | null = null;

  if (nA > 0 && nB > 0) {
    const pPool = (statsA.wins + statsB.wins) / (nA + nB);
    const seProp = Math.sqrt(pPool * (1 - pPool) * (1 / nA + 1 / nB));
    if (seProp > 0) {
      const z = (statsA.wins / nA - statsB.wins / nB) / seProp;
      twoPropZStat = roundNum(z, 3);
      twoPropPValue = roundNum(2 * (1 - normalCdf(Math.abs(z))), 5);
    }
    fisherExactPValue = fisherExactTwoSided(
      statsA.wins,
      nA - statsA.wins,
      statsB.wins,
      nB - statsB.wins
    );
  }

  if (nA >= 2 && nB >= 2) {
    const meanA = rA.reduce((s, v) => s + v, 0) / nA;
    const meanB = rB.reduce((s, v) => s + v, 0) / nB;
    const varA = rA.reduce((s, v) => s + (v - meanA) ** 2, 0) / (nA - 1);
    const varB = rB.reduce((s, v) => s + (v - meanB) ** 2, 0) / (nB - 1);

    const seWelch = Math.sqrt(varA / nA + varB / nB);
    if (seWelch > 0) {
      const t = (meanA - meanB) / seWelch;
      const num = (varA / nA + varB / nB) ** 2;
      const den = (varA / nA) ** 2 / (nA - 1) + (varB / nB) ** 2 / (nB - 1);
      const df = den > 0 ? num / den : nA + nB - 2;
      welchTStat = roundNum(t, 3);
      welchDf = roundNum(df, 1);
      welchPValue = roundNum(studentTTwoSidedPValue(t, df), 5);
    }

    const pooledSd = Math.sqrt(((nA - 1) * varA + (nB - 1) * varB) / (nA + nB - 2));
    if (pooledSd > 0) {
      cohensD = roundNum((meanA - meanB) / pooledSd, 3);
    }
  }

  let verdict: ConfluenceHeadToHeadProof['verdict'] = 'INSUFFICIENT_SAMPLE';
  let proofStatement = `Need at least 5 resolved trades in both ${statsA.label} (n=${nA}) and ${statsB.label} (n=${nB}) for formal hypothesis testing.`;

  if (nA >= 5 && nB >= 5) {
    const sigR = welchPValue !== null && welchPValue < 0.05 && expectancyDeltaR > 0;
    const sigWr =
      ((fisherExactPValue !== null && fisherExactPValue < 0.05) ||
        (twoPropPValue !== null && twoPropPValue < 0.05)) &&
      winRateDeltaPct > 0;

    if (sigR || sigWr) {
      verdict = 'MATHEMATICALLY_PROVEN';
      proofStatement = `${statsA.label} statistically outperforms ${statsB.label} at 95% confidence (ΔWR ${winRateDeltaPct >= 0 ? '+' : ''}${winRateDeltaPct}%, ΔE[R] ${expectancyDeltaR >= 0 ? '+' : ''}${expectancyDeltaR}R, Fisher p=${fisherExactPValue ?? 'N/A'}, Welch p=${welchPValue ?? 'N/A'}).`;
    } else if (expectancyDeltaR > 0 || winRateDeltaPct > 0) {
      verdict = 'DIRECTIONAL_OUTPERFORMANCE';
      proofStatement = `${statsA.label} shows positive empirical lift over ${statsB.label} (ΔWR ${winRateDeltaPct >= 0 ? '+' : ''}${winRateDeltaPct}%, ΔE[R] ${expectancyDeltaR >= 0 ? '+' : ''}${expectancyDeltaR}R), p=${welchPValue ?? fisherExactPValue ?? 'N/A'} (needs larger n for p<0.05).`;
    } else {
      verdict = 'NO_SIGNIFICANT_DIFFERENCE';
      proofStatement = `No positive outperformance observed yet between ${statsA.label} and ${statsB.label} in this window (ΔE[R] ${expectancyDeltaR}R).`;
    }
  }

  return {
    id,
    title,
    groupAKey: statsA.categoryKey,
    groupALabel: statsA.label,
    groupBKey: statsB.categoryKey,
    groupBLabel: statsB.label,
    nA,
    nB,
    winRateAPct: statsA.winRatePct,
    winRateBPct: statsB.winRatePct,
    winRateDeltaPct,
    expectancyAR: statsA.expectancyR,
    expectancyBR: statsB.expectancyR,
    expectancyDeltaR,
    totalRA: statsA.totalRealizedR,
    totalRB: statsB.totalRealizedR,
    twoPropZStat,
    twoPropPValue,
    fisherExactPValue,
    welchTStat,
    welchDf,
    welchPValue,
    cohensD,
    verdict,
    proofStatement
  };
}

export async function getConfluencePerformanceReport(
  filters: ConfluenceAnalyticsFilters = {}
): Promise<ConfluencePerformanceReport> {
  await ensureSignalConfluenceTable();
  const bounds = resolveDateBounds(filters.period || 'november_2026', filters.month);

  if (filters.autoBackfill !== false) {
    await backfillHistoricalSignalConfluence({
      period: bounds.periodLabel,
      month: filters.month,
      forceRecompute: false
    }).catch(() => null);
  }

  const styleFilter = (filters.style || 'all').toUpperCase();
  const marketFilter = (filters.market || 'all').toLowerCase();
  const strategyFilter = (filters.strategyId || 'all').toLowerCase();

  const [rawSignals, logRows] = await Promise.all([
    loadUnifiedSignals(bounds.fromIso, bounds.untilIso),
    queryDb<any>(`SELECT * FROM signal_confluence_logs`)
  ]);

  const logBySetupId = new Map<string, any>(logRows.map((l: any) => [String(l.setup_id), l]));

  let liveCapturedCount = 0;
  let historicalReconstructedCount = 0;
  let unclassifiedCount = 0;

  const trackedRows: TrackedConfluenceSignalRow[] = [];

  for (const sig of rawSignals) {
    if (styleFilter !== 'ALL' && sig.tradingStyle !== styleFilter) continue;
    if (marketFilter !== 'all' && sig.market !== marketFilter) continue;
    if (strategyFilter !== 'all' && sig.strategyId.toLowerCase() !== strategyFilter) continue;

    const log = logBySetupId.get(sig.setupId);
    if (!log) {
      unclassifiedCount++;
      continue;
    }

    const prov: ConfluenceProvenance =
      log.provenance === 'LIVE_CAPTURED' ? 'LIVE_CAPTURED' : 'HISTORICAL_RECONSTRUCTED';
    if (prov === 'LIVE_CAPTURED') liveCapturedCount++;
    else historicalReconstructedCount++;

    const categoryKey = (log.category_key || 'EDGEFINDER_NEUTRAL') as ConfluenceCategoryKey;
    const agreesWithEdgeFinder =
      categoryKey === 'STRONG_CONFLUENCE' ||
      categoryKey === 'EDGEFINDER_AGREES' ||
      categoryKey === 'PARTIAL_CONFLUENCE';

    const ot = String(sig.outcomeType || '').toLowerCase();
    const isResolved =
      sig.realizedR !== null &&
      (sig.signalState === 'resolved' || sig.signalState === 'runner' || Boolean(sig.outcomeType));

    let isWin = false;
    let isLoss = false;
    let isBreakeven = false;
    if (isResolved && sig.realizedR !== null) {
      if (ot.includes('tp2') || ot.includes('tp1') || ot === 'tp' || ot.includes('tp_hit') || (ot.includes('be') && sig.wasRunner) || sig.realizedR > 0) {
        isWin = true;
      } else if (ot.includes('sl') || ot.includes('stop') || sig.realizedR < 0) {
        isLoss = true;
      } else {
        isBreakeven = true;
      }
    }

    let matchingHorizons: string[] = [];
    let opposingHorizons: string[] = [];
    try { matchingHorizons = JSON.parse(log.matching_horizons || '[]'); } catch {}
    try { opposingHorizons = JSON.parse(log.opposing_horizons || '[]'); } catch {}

    trackedRows.push({
      setupId: sig.setupId,
      sourceTable: sig.sourceTable,
      instrument: sig.instrument,
      resolvedInstrument: String(log.resolved_instrument || sig.instrument),
      market: sig.market,
      tradingStyle: sig.tradingStyle,
      strategyId: sig.strategyId,
      bias: sig.bias,
      killzoneOrigin: sig.killzoneOrigin,
      convictionScore: sig.convictionScore,
      signalState: sig.signalState,
      outcomeType: sig.outcomeType,
      isResolved,
      isWin,
      isLoss,
      isBreakeven,
      realizedR: isResolved ? sig.realizedR : null,
      categoryKey,
      badgeText: String(log.badge_text || 'EDGEFINDER NEUTRAL'),
      confluenceState: (log.confluence_state || 'NEUTRAL') as EdgeConfluenceState,
      agreesWithEdgeFinder,
      scalpScore: Number(log.scalp_score || 0),
      intradayScore: Number(log.intraday_score || 0),
      swingScore: Number(log.swing_score || 0),
      totalScore: Number(log.total_score || 0),
      biasLabel: String(log.bias_label || 'Neutral'),
      matchingHorizons,
      opposingHorizons,
      summaryText: String(log.summary_text || ''),
      provenance: prov,
      createdAt: sig.createdAt,
      entryTriggeredAt: sig.entryTriggeredAt,
      resolvedAt: sig.resolvedAt
    });
  }

  const categories: ConfluenceCategoryStats[] = CATEGORY_META.map((meta) => {
    const subset = trackedRows.filter((r) => r.categoryKey === meta.key);
    return computeCategoryStats(meta, subset);
  });

  const agreesRows = trackedRows.filter((r) => r.agreesWithEdgeFinder);
  const nonAlignedRows = trackedRows.filter((r) => !r.agreesWithEdgeFinder);
  const strongRows = trackedRows.filter((r) => r.categoryKey === 'STRONG_CONFLUENCE');
  const partialOrAgreesRows = trackedRows.filter(
    (r) => r.categoryKey === 'EDGEFINDER_AGREES' || r.categoryKey === 'PARTIAL_CONFLUENCE'
  );
  const neutralRows = trackedRows.filter((r) => r.categoryKey === 'EDGEFINDER_NEUTRAL');
  const counterRows = trackedRows.filter((r) => r.categoryKey === 'COUNTER_MACRO_BIAS');

  const agreesFullOrPart = computeCategoryStats(
    {
      key: 'AGREES_FULL_OR_PART',
      label: 'Technical + EdgeFinder Agrees (Full or Part)',
      badgeText: 'AGREES (STRONG + AGREES + PARTIAL)',
      description: 'All signals where Technical setup agrees in full or in part with EdgeFinder confluence.',
      agreesGroup: 'AGREES_FULL_OR_PART'
    },
    agreesRows
  );

  const allSignalsStats = computeCategoryStats(
    {
      key: 'ALL_SIGNALS',
      label: 'All Signal Cards (Baseline)',
      badgeText: 'ALL TRACKED SIGNALS',
      description: 'Unfiltered baseline across every tracked signal card.',
      agreesGroup: 'BENCHMARK'
    },
    trackedRows
  );

  const nonAlignedStats = computeCategoryStats(
    {
      key: 'NON_ALIGNED',
      label: 'Non-Aligned (Neutral + Counter)',
      badgeText: 'NEUTRAL + COUNTER',
      description: 'Signals without directional EdgeFinder agreement.',
      agreesGroup: 'COUNTER'
    },
    nonAlignedRows
  );

  const strongStats = categories.find((c) => c.categoryKey === 'STRONG_CONFLUENCE')!;
  const neutralStats = categories.find((c) => c.categoryKey === 'EDGEFINDER_NEUTRAL')!;
  const counterStats = categories.find((c) => c.categoryKey === 'COUNTER_MACRO_BIAS')!;
  const partialOrAgreesStats = computeCategoryStats(
    {
      key: 'PARTIAL_OR_STANDARD_AGREES',
      label: 'Partial / Standard Agreement',
      badgeText: 'EDGEFINDER AGREES + PARTIAL',
      description: 'Signals with partial or intraday agreement (excluding 3/3 Strong Confluence).',
      agreesGroup: 'AGREES_FULL_OR_PART'
    },
    partialOrAgreesRows
  );

  const comparisons: ConfluenceHeadToHeadProof[] = [
    compareGroupsMathematically({
      id: 'agrees_vs_counter',
      title: 'Technical Agrees (Full or Part) vs Counter Macro Bias',
      statsA: agreesFullOrPart,
      rowsA: agreesRows,
      statsB: counterStats,
      rowsB: counterRows
    }),
    compareGroupsMathematically({
      id: 'strong_vs_counter',
      title: 'Strong Confluence (3/3 TF) vs Counter Macro Bias',
      statsA: strongStats,
      rowsA: strongRows,
      statsB: counterStats,
      rowsB: counterRows
    }),
    compareGroupsMathematically({
      id: 'agrees_vs_non_aligned',
      title: 'Technical Agrees (Full or Part) vs Non-Aligned (Neutral + Counter)',
      statsA: agreesFullOrPart,
      rowsA: agreesRows,
      statsB: nonAlignedStats,
      rowsB: nonAlignedRows
    }),
    compareGroupsMathematically({
      id: 'strong_vs_partial',
      title: 'Strong Confluence (3/3 TF) vs Partial / Standard Agrees',
      statsA: strongStats,
      rowsA: strongRows,
      statsB: partialOrAgreesStats,
      rowsB: partialOrAgreesRows
    }),
    compareGroupsMathematically({
      id: 'agrees_vs_neutral',
      title: 'Technical Agrees (Full or Part) vs EdgeFinder Neutral',
      statsA: agreesFullOrPart,
      rowsA: agreesRows,
      statsB: neutralStats,
      rowsB: neutralRows
    })
  ];

  const styleBreakdown = (['INTRADAY', 'SCALP', 'SWING'] as const).map((st) => {
    const stAgree = agreesRows.filter((r) => r.tradingStyle === st && r.isResolved);
    const stCounter = counterRows.filter((r) => r.tradingStyle === st && r.isResolved);
    const aWins = stAgree.filter((r) => r.isWin).length;
    const cWins = stCounter.filter((r) => r.isWin).length;
    const aR = roundNum(stAgree.reduce((s, r) => s + (r.realizedR || 0), 0), 2);
    const cR = roundNum(stCounter.reduce((s, r) => s + (r.realizedR || 0), 0), 2);
    return {
      style: st,
      agreesResolved: stAgree.length,
      agreesWinRatePct: stAgree.length > 0 ? roundNum((aWins / stAgree.length) * 100, 1) : 0,
      agreesTotalR: aR,
      agreesExpectancyR: stAgree.length > 0 ? roundNum(aR / stAgree.length, 3) : 0,
      counterResolved: stCounter.length,
      counterWinRatePct: stCounter.length > 0 ? roundNum((cWins / stCounter.length) * 100, 1) : 0,
      counterTotalR: cR,
      counterExpectancyR: stCounter.length > 0 ? roundNum(cR / stCounter.length, 3) : 0
    };
  });

  // Sort signal rows newest first for display ledger
  const signalsDesc = [...trackedRows].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return {
    generatedAt: new Date().toISOString(),
    filters: {
      period: bounds.periodLabel,
      fromIso: bounds.fromIso,
      untilIso: bounds.untilIso,
      style: styleFilter,
      market: marketFilter,
      strategyId: strategyFilter
    },
    provenanceSummary: {
      totalTrackedSignals: trackedRows.length,
      liveCapturedCount,
      historicalReconstructedCount,
      unclassifiedCount
    },
    categories,
    pooledGroups: {
      allSignals: allSignalsStats,
      agreesFullOrPart,
      nonAligned: nonAlignedStats
    },
    comparisons,
    styleBreakdown,
    signals: signalsDesc
  };
}
