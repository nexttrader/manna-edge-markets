import { useCallback, useEffect, useRef, useState } from 'react';
import { API_BASE } from '../config';
import { useAuth } from '../context/AuthContext';

export type EconomyCode = 'USD' | 'EUR' | 'GBP' | 'JPY' | 'AUD' | 'CAD' | 'CHF' | 'NZD';
export type EdgeBiasLabel = 'Strong Buy' | 'Buy' | 'Neutral' | 'Sell' | 'Strong Sell';
export type TraderHorizon = 'SCALP' | 'INTRADAY' | 'SWING';

export interface TimeframeEdgeProfile {
  horizon: TraderHorizon;
  label: string;
  executionTimeframes: string;
  holdDuration: string;
  score: number;
  biasLabel: EdgeBiasLabel;
  confidencePct: number;
  trendPrimary: 'Bullish' | 'Bearish' | 'Flat';
  trendConfirm: 'Bullish' | 'Bearish' | 'Flat';
  rsi: number;
  adrUsedPct: number;
  adrWarning: boolean;
  htfConfluence: 'ALIGNED' | 'COUNTER_TREND' | 'NEUTRAL';
  weightsSummary: string;
  actionNote: string;
}

export interface FeedCadenceItem {
  key: string;
  name: string;
  provider: string;
  pollCadence: string;
  upstreamFrequency: string;
  status: 'LIVE' | 'PARTIAL' | 'BASELINE';
  lastUpdated: string;
}

export interface EdgeFinderRollout {
  visibleToAdmins: boolean;
  visibleToTraders: boolean;
  updatedAt: string;
  updatedBy: string;
}

export interface MacroEconomyData {
  currency: EconomyCode;
  country: string;
  centralBank: string;
  rate: number;
  nextMeeting: string;
  rateExpectation: 'Hike' | 'Hold' | 'Cut';
  stance: 'Hawkish' | 'Neutral' | 'Dovish';
  gdpQoQ: number;
  cpiYoY: number;
  coreCpiYoY: number;
  pmiManufacturing: number;
  pmiServices: number;
  unemploymentRate: number;
  retailSalesMoM: number;
  economicScore: number;
  surpriseScore: number;
  rateProbabilities: {
    hikePct: number;
    holdPct: number;
    cutPct: number;
    impliedAction: 'Hike' | 'Hold' | 'Cut';
  };
  history: {
    rates: Array<{ date: string; value: number }>;
    gdp: Array<{ year: string; value: number }>;
    cpi: Array<{ year: string; value: number }>;
    unemployment: Array<{ year: string; value: number }>;
  };
  notes: string;
  updatedAt: string;
}

export interface CotPositioningRecord {
  instrument: string;
  cftcCode: string;
  contractName: string;
  reportDate: string;
  source: 'CFTC_LIVE' | 'INSTITUTIONAL_MODEL';
  nonCommercialLong: number;
  nonCommercialShort: number;
  nonCommercialNet: number;
  commercialLong: number;
  commercialShort: number;
  commercialNet: number;
  commercialLongPct: number;
  netChangeWoW: number;
  longPct: number;
  shortPct: number;
  openInterest: number;
  cotIndex52w: number;
  cotZScore52w: number;
  extremeFlag: 'BULLISH_EXTREME' | 'BEARISH_EXTREME' | 'NONE';
  sentimentLabel: 'Strongly Bullish' | 'Bullish' | 'Neutral' | 'Bearish' | 'Strongly Bearish';
  cotScore: -1 | 0 | 1;
  history12w: Array<{ date: string; net: number; longPct: number }>;
}

export interface RetailSentimentRecord {
  instrument: string;
  longPct: number;
  shortPct: number;
  contrarianBias: 'Bullish' | 'Bearish' | 'Neutral';
  crowdedWarning: boolean;
  sentimentScore: -1 | 0 | 1;
  source: string;
}

export interface SeasonalityRecord {
  instrument: string;
  monthlyReturns10Y: number[];
  monthlyWinRate10Y: number[];
  currentMonthIndex: number;
  currentMonthAvgReturn: number;
  currentMonthWinRate: number;
  nextMonthAvgReturn: number;
  seasonalityBias: 'Bullish' | 'Bearish' | 'Neutral';
  seasonalityScore: -1 | 0 | 1;
  bestKillzone: 'ASIA' | 'LONDON' | 'NY_AM' | 'NY_PM';
  killzoneAffinityNotes: string;
}

export interface FactorBreakdownItem {
  key: string;
  label: string;
  category: 'Sentiment' | 'Statistical' | 'Technical' | 'Fundamental' | 'Manna Flow';
  signal: -1 | 0 | 1;
  weight: number;
  contribution: number;
  detail: string;
}

export interface TugOfWarRow {
  metric: string;
  baseValue: string;
  quoteValue: string;
  advantage: 'BASE' | 'QUOTE' | 'EVEN';
}

export interface HistoricalScorePoint {
  date: string;
  price: number;
  score: number;
}

export interface KillzoneAlignment {
  activeSetupCount: number;
  direction: 'LONG' | 'SHORT' | 'NONE';
  maxConviction: number;
  killzone: string;
  alignmentStatus: 'ALIGNED' | 'CONFLICT' | 'STANDBY';
  activeSetupIds: string[];
}

export interface AssetEdgeScorecard {
  instrument: string;
  displayName: string;
  assetClass: 'forex' | 'futures' | 'crypto';
  category: 'Major FX' | 'Cross FX' | 'Equity Index' | 'Metals' | 'Energy' | 'Rates' | 'Agriculture' | 'Crypto';
  baseCurrency: string;
  quoteCurrency: string;
  currentPrice: number;
  dailyChangePct: number;
  priceSource: 'LIVE' | 'REFERENCE';
  totalScore: number;
  biasLabel: EdgeBiasLabel;
  timeframes: {
    SCALP: TimeframeEdgeProfile;
    INTRADAY: TimeframeEdgeProfile;
    SWING: TimeframeEdgeProfile;
  };
  timeframeConfluence: {
    allAligned: boolean;
    alignedCount: number;
    summary: string;
    dominantBias: EdgeBiasLabel;
  };
  cotScore: number;
  retailScore: number;
  seasonalityScore: number;
  trendScore: number;
  fundamentalScore: number;
  mannaFlowScore: number;
  factors: FactorBreakdownItem[];
  tugOfWar: {
    baseLabel: string;
    quoteLabel: string;
    rows: TugOfWarRow[];
  };
  technical: {
    ema5: number;
    ema20: number;
    ema50: number;
    rsi14: number;
    rsi14M15: number;
    rsi14H1: number;
    rsi14H4: number;
    atr14: number;
    atrPct: number;
    high30d: number;
    low30d: number;
    trendDirection: 'Bullish' | 'Bearish' | 'Ranging';
    distanceFromEma20Pct: number;
    dayRangePctOfAtr: number;
    volatilityPercentile30d: number;
    return1hPct: number;
    return4hPct: number;
    return5dPct: number;
    return20dPct: number;
    intradaySource: 'LIVE_15M_H1_H4' | 'DAILY_DERIVED';
    mtfAlignment: {
      m15: 'Bullish' | 'Bearish' | 'Flat';
      h1: 'Bullish' | 'Bearish' | 'Flat';
      h4: 'Bullish' | 'Bearish' | 'Flat';
      d5: 'Bullish' | 'Bearish' | 'Flat';
      d20: 'Bullish' | 'Bearish' | 'Flat';
      d50: 'Bullish' | 'Bearish' | 'Flat';
      monthly: 'Bullish' | 'Bearish' | 'Flat';
      alignedCount: number;
    };
  };
  cot: CotPositioningRecord;
  retailSentiment: RetailSentimentRecord;
  seasonality: SeasonalityRecord;
  killzoneAlignment: KillzoneAlignment;
  historicalSeries: HistoricalScorePoint[];
}

export interface CarryTradeItem {
  instrument: string;
  assetClass: 'forex' | 'futures' | 'crypto';
  category: AssetEdgeScorecard['category'];
  carryType: 'FX_RATE_DIFF' | 'FUTURES_ROLL_YIELD' | 'CRYPTO_FUNDING_BASIS';
  baseCurrency: string;
  quoteCurrency: string;
  baseRate: number;
  quoteRate: number;
  rateSpreadPct: number;
  rateSpreadBps: number;
  carryDirection: 'LONG' | 'SHORT' | 'NEUTRAL';
  carryAtrRatio: number;
  assetTotalScore: number;
  scalpScore: number;
  intradayScore: number;
  swingScore: number;
  biasLabel: EdgeBiasLabel;
  alignedWithEdge: boolean;
  technicalTrend: 'Bullish' | 'Bearish' | 'Ranging';
  regimeLabel: string;
}

export interface MacroInternalsData {
  yieldCurve: {
    m3: number;
    y2: number;
    y5: number;
    y10: number;
    y30: number;
    spread10y2y: number;
    spread10y3m: number;
    realYield10y: number;
    curveRegime: 'Normal Steepening' | 'Flat Curve' | 'Inverted Curve';
  };
  vix: number;
  dxy: number;
  dxyChangePct: number;
  sp500Price: number;
  wilshire5000Price: number;
  fredUsMacro: {
    nfpTotalK: number;
    nfpMonthlyChangeK: number;
    housingStartsK: number;
    m2Billions: number;
    nominalGdpBillions: number;
    buffettIndicatorPct: number;
    updatedAt: string;
  };
  dxySeries30d: Array<{ date: string; close: number }>;
  yieldsSource: 'LIVE_FRED_YAHOO' | 'PARTIAL';
}

export interface GoldScorecardData {
  gcPrice: number;
  gcChangePct: number;
  silverPrice: number;
  goldSilverRatio: number;
  realYield10y: number;
  dxy: number;
  vix: number;
  cotIndex52w: number;
  totalScore: number;
  biasLabel: EdgeBiasLabel;
  drivers: FactorBreakdownItem[];
  series30d: Array<{ date: string; goldPrice: number; dxyPrice: number }>;
}

export interface InsiderTradeItem {
  ticker: string;
  filerName: string;
  relation: string;
  transactionText: string;
  direction: 'BUY' | 'SELL' | 'OTHER';
  shares: number;
  valueUsd: number;
  date: string;
}

export interface InstitutionalWhaleItem {
  ticker: string;
  holder: string;
  pctHeld: number;
  position: number;
  valueUsd: number;
  pctChange: number;
  reportDate: string;
}

export interface AnalystTargetItem {
  ticker: string;
  name: string;
  currentPrice: number;
  targetLow: number;
  targetMean: number;
  targetHigh: number;
  upsidePct: number;
  recommendationKey: string;
  analystsCount: number;
}

export interface SmartMoneyData {
  insiders: InsiderTradeItem[];
  whales: InstitutionalWhaleItem[];
  bankAndStreetTargets: AnalystTargetItem[];
  updatedAt: string;
}

export interface FuturesStrengthItem {
  sector: 'Equity Index' | 'Metals' | 'Energy' | 'Rates' | 'Agriculture';
  strengthScore: number;
  dailyMomentumPct: number;
  rank: number;
  topContract: string;
  weakestContract: string;
  cotNetLongPct: number;
  contractCount: number;
  regime: string;
}

export interface CryptoStrengthItem {
  symbol: string;
  instrument: string;
  displayName: string;
  strengthScore: number;
  dailyMomentumPct: number;
  rank: number;
  currentPrice: number;
  cotLongPct: number;
  scalpBias: EdgeBiasLabel;
  intradayBias: EdgeBiasLabel;
  swingBias: EdgeBiasLabel;
}

export interface CurrencyStrengthItem {
  currency: EconomyCode;
  strengthScore: number;
  dailyMomentumPct: number;
  macroRank: number;
  policyRate: number;
  stance: 'Hawkish' | 'Neutral' | 'Dovish';
  bestLongPair: string;
  bestShortPair: string;
}

export interface RiskGauge {
  score: number;
  regime: 'Risk-On Expansion' | 'Balanced Rotation' | 'Risk-Off Defensive';
  drivers: Array<{ label: string; impact: 'Risk-On' | 'Risk-Off' | 'Neutral'; value: string }>;
}

export interface CalendarEconomicEvent {
  id: string;
  title: string;
  country: string;
  currency: string;
  impact: 'high' | 'medium' | 'low';
  eventTime: string;
  forecast?: string;
  previous?: string;
  actual?: string;
  unit?: string;
}

export interface EdgeFinderSnapshot {
  generatedAt: string;
  rollout: EdgeFinderRollout;
  scorecards: AssetEdgeScorecard[];
  economies: MacroEconomyData[];
  currencyStrength: CurrencyStrengthItem[];
  futuresStrength: FuturesStrengthItem[];
  cryptoStrength: CryptoStrengthItem[];
  riskGauge: RiskGauge;
  carryTrades: CarryTradeItem[];
  goldScorecard: GoldScorecardData;
  macroInternals: MacroInternalsData;
  smartMoney: SmartMoneyData;
  correlations: {
    assets: string[];
    matrix: Record<string, Record<string, number>>;
  };
  calendar: {
    status: {
      activeCount?: number;
      nextHighImpact?: CalendarEconomicEvent | null;
      [key: string]: any;
    };
    upcomingHighImpact: CalendarEconomicEvent[];
    allEventsCount: number;
  };
  syncStatus: {
    cftcSource: 'CFTC_LIVE' | 'INSTITUTIONAL_MODEL';
    macroSource?: 'LIVE_BIS_WORLDBANK' | 'BASELINE';
    yieldsSource: 'LIVE_FRED_YAHOO' | 'PARTIAL';
    intradaySource: 'LIVE_15M_H1_H4' | 'PARTIAL';
    smartMoneyCount: number;
    livePriceCount: number;
    totalAssets: number;
    cacheAgeSeconds: number;
    refreshIntervalSeconds: number;
    feedCadences: FeedCadenceItem[];
  };
}

const DEFAULT_ROLLOUT: EdgeFinderRollout = {
  visibleToAdmins: false,
  visibleToTraders: false,
  updatedAt: new Date().toISOString(),
  updatedBy: 'system'
};

const ROLLOUT_SYNC_EVENT = 'edge-finder-rollout-updated';
const SNAPSHOT_SYNC_EVENT = 'edge-finder-snapshot-updated';
const ACCESS_CACHE_TTL_MS = 20_000;
const SNAPSHOT_CACHE_TTL_MS = 55_000;

interface CachedAccessEntry {
  rollout: EdgeFinderRollout;
  canAccess: boolean;
  ts: number;
}

const accessCacheByRole = new Map<string, CachedAccessEntry>();
const accessInflightByRole = new Map<string, Promise<CachedAccessEntry | null>>();

let sharedSnapshotCache: {
  data: EdgeFinderSnapshot | null;
  syncedAt: string | null;
  ts: number;
} = { data: null, syncedAt: null, ts: 0 };
let sharedSnapshotInflight: Promise<EdgeFinderSnapshot | null> | null = null;

function computeRoleAccess(role: string, rolloutData: EdgeFinderRollout): boolean {
  if (role === 'super_admin') return true;
  if (role === 'admin') return Boolean(rolloutData.visibleToAdmins);
  if (role === 'trader') return Boolean(rolloutData.visibleToTraders);
  return false;
}

export function useEdgeFinderAccess() {
  const { user, originalAdmin, isImpersonating } = useAuth();
  const effectiveRole = isImpersonating
    ? (user?.role || 'trader')
    : user?.role === 'super_admin' || originalAdmin?.role === 'super_admin'
      ? 'super_admin'
      : (user?.role || 'guest');

  const isSuperAdmin = effectiveRole === 'super_admin';
  const isAdmin = effectiveRole === 'admin';

  const cachedInit = accessCacheByRole.get(effectiveRole);
  const [rollout, setRollout] = useState<EdgeFinderRollout>(cachedInit?.rollout || DEFAULT_ROLLOUT);
  const [canAccessEdgeFinder, setCanAccessEdgeFinder] = useState<boolean>(
    cachedInit ? cachedInit.canAccess : effectiveRole === 'super_admin'
  );
  const [loading, setLoading] = useState<boolean>(!cachedInit);
  const [updatingRollout, setUpdatingRollout] = useState<boolean>(false);

  const buildHeaders = useCallback(() => ({
    'Content-Type': 'application/json',
    'x-user-role': effectiveRole,
    'x-user-email': user?.email || originalAdmin?.email || ''
  }), [effectiveRole, user?.email, originalAdmin?.email]);

  const fetchAccessStatus = useCallback(async (force = false) => {
    const cached = accessCacheByRole.get(effectiveRole);
    if (!force && cached && Date.now() - cached.ts < ACCESS_CACHE_TTL_MS) {
      setRollout(cached.rollout);
      setCanAccessEdgeFinder(cached.canAccess);
      setLoading(false);
      return;
    }

    try {
      let inflight = !force ? accessInflightByRole.get(effectiveRole) : undefined;
      if (!inflight) {
        inflight = (async () => {
          const res = await fetch(
            `${API_BASE}/api/edge-finder/access-status?role=${encodeURIComponent(effectiveRole)}`,
            { headers: buildHeaders() }
          );
          if (!res.ok) return null;
          const data = await res.json();
          const nextRollout: EdgeFinderRollout = data?.rollout || DEFAULT_ROLLOUT;
          const nextCanAccess =
            typeof data?.canAccess === 'boolean'
              ? data.canAccess
              : computeRoleAccess(effectiveRole, nextRollout);
          const entry: CachedAccessEntry = {
            rollout: nextRollout,
            canAccess: nextCanAccess,
            ts: Date.now()
          };
          accessCacheByRole.set(effectiveRole, entry);
          return entry;
        })().finally(() => {
          accessInflightByRole.delete(effectiveRole);
        });
        accessInflightByRole.set(effectiveRole, inflight);
      }

      const entry = await inflight;
      if (entry) {
        setRollout(entry.rollout);
        setCanAccessEdgeFinder(entry.canAccess);
      }
    } catch {
      setCanAccessEdgeFinder(effectiveRole === 'super_admin');
    } finally {
      setLoading(false);
    }
  }, [effectiveRole, buildHeaders]);

  useEffect(() => {
    const cached = accessCacheByRole.get(effectiveRole);
    if (cached && Date.now() - cached.ts < ACCESS_CACHE_TTL_MS) {
      setRollout(cached.rollout);
      setCanAccessEdgeFinder(cached.canAccess);
      setLoading(false);
    } else {
      setCanAccessEdgeFinder(effectiveRole === 'super_admin');
      setLoading(true);
    }
    void fetchAccessStatus(false);

    const onSyncEvent = (evt: Event) => {
      const detail = (evt as CustomEvent<EdgeFinderRollout>).detail;
      if (detail) {
        const nextCan = computeRoleAccess(effectiveRole, detail);
        accessCacheByRole.set(effectiveRole, {
          rollout: detail,
          canAccess: nextCan,
          ts: Date.now()
        });
        setRollout(detail);
        setCanAccessEdgeFinder(nextCan);
      } else {
        void fetchAccessStatus(true);
      }
    };

    window.addEventListener(ROLLOUT_SYNC_EVENT, onSyncEvent);
    const interval = window.setInterval(() => void fetchAccessStatus(false), 30_000);
    return () => {
      window.removeEventListener(ROLLOUT_SYNC_EVENT, onSyncEvent);
      window.clearInterval(interval);
    };
  }, [effectiveRole, fetchAccessStatus]);

  const updateRollout = useCallback(
    async (patch: Partial<Pick<EdgeFinderRollout, 'visibleToAdmins' | 'visibleToTraders'>>) => {
      setUpdatingRollout(true);
      try {
        const res = await fetch(`${API_BASE}/api/edge-finder/rollout`, {
          method: 'POST',
          headers: buildHeaders(),
          body: JSON.stringify(patch)
        });
        const data = await res.json();
        if (!res.ok || !data?.success) {
          throw new Error(data?.error || 'Failed to update EdgeFinder rollout state');
        }
        const updatedRollout = data.rollout as EdgeFinderRollout;
        accessCacheByRole.clear();
        accessCacheByRole.set(effectiveRole, {
          rollout: updatedRollout,
          canAccess: computeRoleAccess(effectiveRole, updatedRollout),
          ts: Date.now()
        });
        setRollout(updatedRollout);
        window.dispatchEvent(new CustomEvent(ROLLOUT_SYNC_EVENT, { detail: updatedRollout }));
        return updatedRollout;
      } finally {
        setUpdatingRollout(false);
      }
    },
    [buildHeaders, effectiveRole]
  );

  return {
    canAccessEdgeFinder,
    loading,
    updatingRollout,
    rollout,
    effectiveRole,
    isSuperAdmin,
    isAdmin,
    updateRollout,
    refetchAccess: () => fetchAccessStatus(true)
  };
}

export function useEdgeFinderData(enabled = true) {
  const { user, originalAdmin, isImpersonating } = useAuth();
  const effectiveRole = isImpersonating
    ? (user?.role || 'trader')
    : user?.role === 'super_admin' || originalAdmin?.role === 'super_admin'
      ? 'super_admin'
      : (user?.role || 'guest');

  const [snapshot, setSnapshot] = useState<EdgeFinderSnapshot | null>(() =>
    enabled ? sharedSnapshotCache.data : null
  );
  const [loading, setLoading] = useState<boolean>(() => enabled && !sharedSnapshotCache.data);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);
  const [secondsUntilRefresh, setSecondsUntilRefresh] = useState<number>(60);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(() =>
    enabled ? sharedSnapshotCache.syncedAt : null
  );
  const hasSnapshotRef = useRef<boolean>(Boolean(enabled && sharedSnapshotCache.data));

  const buildHeaders = useCallback(() => ({
    'Content-Type': 'application/json',
    'x-user-role': effectiveRole,
    'x-user-email': user?.email || originalAdmin?.email || ''
  }), [effectiveRole, user?.email, originalAdmin?.email]);

  const applySnapshot = useCallback((nextData: EdgeFinderSnapshot, syncedAtIso: string) => {
    hasSnapshotRef.current = true;
    setSnapshot(nextData);
    setLastSyncedAt(syncedAtIso);
    setSecondsUntilRefresh(nextData?.syncStatus?.refreshIntervalSeconds || 60);
    setError(null);
    setLoading(false);
    setRefreshing(false);
  }, []);

  const fetchSnapshot = useCallback(async (force = false) => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    const cacheFresh = sharedSnapshotCache.data && Date.now() - sharedSnapshotCache.ts < SNAPSHOT_CACHE_TTL_MS;
    if (!force && cacheFresh && sharedSnapshotCache.data) {
      applySnapshot(sharedSnapshotCache.data, sharedSnapshotCache.syncedAt || new Date().toISOString());
      return;
    }

    if (force || hasSnapshotRef.current) setRefreshing(true);
    else setLoading(true);

    try {
      let inflight = !force ? sharedSnapshotInflight : null;
      if (!inflight) {
        inflight = (async () => {
          const res = await fetch(
            `${API_BASE}/api/edge-finder/snapshot${force ? '?refresh=true' : ''}`,
            { headers: buildHeaders() }
          );
          const data = await res.json();
          if (!res.ok || !data?.success) {
            throw new Error(data?.error || `HTTP ${res.status}`);
          }
          const snap = data as EdgeFinderSnapshot;
          const syncedIso = new Date().toISOString();
          sharedSnapshotCache = {
            data: snap,
            syncedAt: syncedIso,
            ts: Date.now()
          };
          window.dispatchEvent(
            new CustomEvent(SNAPSHOT_SYNC_EVENT, { detail: { snapshot: snap, syncedAt: syncedIso } })
          );
          return snap;
        })().finally(() => {
          sharedSnapshotInflight = null;
        });
        sharedSnapshotInflight = inflight;
      }

      const snap = await inflight;
      if (snap) {
        applySnapshot(snap, sharedSnapshotCache.syncedAt || new Date().toISOString());
      }
    } catch (err: any) {
      setError(err?.message || 'Unable to load Manna EdgeFinder Pro terminal');
      setLoading(false);
      setRefreshing(false);
    }
  }, [enabled, buildHeaders, applySnapshot]);

  useEffect(() => {
    const onSnapshotSync = (evt: Event) => {
      if (!enabled) return;
      const detail = (evt as CustomEvent<{ snapshot: EdgeFinderSnapshot; syncedAt: string }>).detail;
      if (detail?.snapshot) {
        applySnapshot(detail.snapshot, detail.syncedAt);
      }
    };
    window.addEventListener(SNAPSHOT_SYNC_EVENT, onSnapshotSync);
    return () => window.removeEventListener(SNAPSHOT_SYNC_EVENT, onSnapshotSync);
  }, [enabled, applySnapshot]);

  useEffect(() => {
    void fetchSnapshot(false);
  }, [enabled, effectiveRole, fetchSnapshot]);

  useEffect(() => {
    if (!enabled || !autoRefresh) return;
    const timer = window.setInterval(() => {
      setSecondsUntilRefresh((prev) => {
        if (prev <= 1) {
          void fetchSnapshot(false);
          return 60;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [enabled, autoRefresh, fetchSnapshot]);

  const refreshData = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch(`${API_BASE}/api/edge-finder/refresh`, {
        method: 'POST',
        headers: buildHeaders()
      });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || 'Live sync failed');
      }
      const snap = data as EdgeFinderSnapshot;
      const syncedIso = new Date().toISOString();
      sharedSnapshotCache = { data: snap, syncedAt: syncedIso, ts: Date.now() };
      window.dispatchEvent(
        new CustomEvent(SNAPSHOT_SYNC_EVENT, { detail: { snapshot: snap, syncedAt: syncedIso } })
      );
      applySnapshot(snap, syncedIso);
      return snap;
    } catch (err: any) {
      setError(err?.message || 'Live sync failed');
      return null;
    } finally {
      setRefreshing(false);
    }
  }, [buildHeaders, applySnapshot]);

  const updateMacroEconomy = useCallback(
    async (currency: EconomyCode, updates: Partial<MacroEconomyData>) => {
      setRefreshing(true);
      try {
        const res = await fetch(`${API_BASE}/api/edge-finder/macro/${currency}`, {
          method: 'PUT',
          headers: buildHeaders(),
          body: JSON.stringify(updates)
        });
        const data = await res.json();
        if (!res.ok || !data?.success) {
          throw new Error(data?.error || 'Failed to save macro economy override');
        }
        const snap = data as EdgeFinderSnapshot;
        const syncedIso = new Date().toISOString();
        sharedSnapshotCache = { data: snap, syncedAt: syncedIso, ts: Date.now() };
        window.dispatchEvent(
          new CustomEvent(SNAPSHOT_SYNC_EVENT, { detail: { snapshot: snap, syncedAt: syncedIso } })
        );
        applySnapshot(snap, syncedIso);
        return true;
      } catch (err: any) {
        setError(err?.message || 'Failed to save macro economy override');
        return false;
      } finally {
        setRefreshing(false);
      }
    },
    [buildHeaders, applySnapshot]
  );

  return {
    snapshot,
    loading,
    refreshing,
    error,
    autoRefresh,
    setAutoRefresh,
    secondsUntilRefresh,
    lastSyncedAt,
    refreshData,
    refetch: () => fetchSnapshot(false),
    updateMacroEconomy
  };
}

const SYMBOL_ALIAS_MAP: Record<string, string> = {
  // Equity Index Futures aliases
  NQ: 'NQ',
  MNQ: 'NQ',
  'NQ=F': 'NQ',
  'NQ1!': 'NQ',
  NAS100: 'NQ',
  NQ100: 'NQ',
  NDX: 'NQ',
  USTEC: 'NQ',
  ES: 'ES',
  MES: 'ES',
  'ES=F': 'ES',
  'ES1!': 'ES',
  US500: 'ES',
  SPX: 'ES',
  SPX500: 'ES',
  YM: 'YM',
  MYM: 'YM',
  'YM=F': 'YM',
  'YM1!': 'YM',
  US30: 'YM',
  DJ30: 'YM',
  DJI: 'YM',
  RTY: 'RTY',
  M2K: 'RTY',
  'RTY=F': 'RTY',
  US2000: 'RTY',
  RUT: 'RTY',
  NKD: 'NKD',
  'NKD=F': 'NKD',
  JP225: 'NKD',
  NI225: 'NKD',
  // Metals & Energy & Rates & Ags
  GC: 'GC',
  MGC: 'GC',
  'GC=F': 'GC',
  'XAU/USD': 'GC',
  XAUUSD: 'GC',
  GOLD: 'GC',
  SI: 'SI',
  'SI=F': 'SI',
  'XAG/USD': 'SI',
  XAGUSD: 'SI',
  SILVER: 'SI',
  HG: 'HG',
  'HG=F': 'HG',
  COPPER: 'HG',
  PL: 'PL',
  'PL=F': 'PL',
  PA: 'PA',
  'PA=F': 'PA',
  CL: 'CL',
  'CL=F': 'CL',
  WTI: 'CL',
  'WTI/USD': 'CL',
  USOIL: 'CL',
  BZ: 'BZ',
  'BZ=F': 'BZ',
  UKOIL: 'BZ',
  BRENT: 'BZ',
  NG: 'NG',
  'NG=F': 'NG',
  NATGAS: 'NG',
  ZN: 'ZN',
  'ZN=F': 'ZN',
  US10Y: 'ZN',
  ZB: 'ZB',
  'ZB=F': 'ZB',
  US30Y: 'ZB',
  ZC: 'ZC',
  'ZC=F': 'ZC',
  ZS: 'ZS',
  'ZS=F': 'ZS',
  ZW: 'ZW',
  'ZW=F': 'ZW',
  // Crypto aliases
  BTC: 'BTC/USD',
  BTCUSD: 'BTC/USD',
  'BTC-USD': 'BTC/USD',
  'BTC/USD': 'BTC/USD',
  ETH: 'ETH/USD',
  ETHUSD: 'ETH/USD',
  'ETH-USD': 'ETH/USD',
  'ETH/USD': 'ETH/USD',
  SOL: 'SOL/USD',
  SOLUSD: 'SOL/USD',
  'SOL-USD': 'SOL/USD',
  'SOL/USD': 'SOL/USD',
  XRP: 'XRP/USD',
  XRPUSD: 'XRP/USD',
  'XRP-USD': 'XRP/USD',
  'XRP/USD': 'XRP/USD',
  DOGE: 'DOGE/USD',
  DOGEUSD: 'DOGE/USD',
  'DOGE-USD': 'DOGE/USD',
  'DOGE/USD': 'DOGE/USD',
  ADA: 'ADA/USD',
  ADAUSD: 'ADA/USD',
  'ADA-USD': 'ADA/USD',
  'ADA/USD': 'ADA/USD',
  AVAX: 'AVAX/USD',
  AVAXUSD: 'AVAX/USD',
  'AVAX-USD': 'AVAX/USD',
  'AVAX/USD': 'AVAX/USD',
  LINK: 'LINK/USD',
  LINKUSD: 'LINK/USD',
  'LINK-USD': 'LINK/USD',
  'LINK/USD': 'LINK/USD',
  LTC: 'LTC/USD',
  LTCUSD: 'LTC/USD',
  'LTC-USD': 'LTC/USD',
  'LTC/USD': 'LTC/USD',
  SUI: 'SUI/USD',
  SUIUSD: 'SUI/USD',
  'SUI-USD': 'SUI/USD',
  'SUI/USD': 'SUI/USD'
};

export function resolveEdgeFinderInstrument(rawInstrument: string): string {
  const clean = (rawInstrument || '').trim().toUpperCase().replace(/=X$/i, '');
  if (!clean) return 'EUR/USD';
  if (SYMBOL_ALIAS_MAP[clean]) return SYMBOL_ALIAS_MAP[clean];
  if (clean.includes('/')) return clean;
  if (/^[A-Z]{6}$/.test(clean)) {
    return `${clean.slice(0, 3)}/${clean.slice(3, 6)}`;
  }
  return clean;
}

export function findEdgeFinderScorecard(
  rawInstrument: string,
  scorecards: AssetEdgeScorecard[] | undefined | null
): AssetEdgeScorecard | null {
  if (!scorecards || scorecards.length === 0) return null;
  const resolved = resolveEdgeFinderInstrument(rawInstrument);
  const direct = scorecards.find((sc) => sc.instrument.toUpperCase() === resolved);
  if (direct) return direct;
  const normalizedRaw = resolved.replace(/[^A-Z0-9]/g, '');
  return (
    scorecards.find((sc) => sc.instrument.toUpperCase().replace(/[^A-Z0-9]/g, '') === normalizedRaw) || null
  );
}

export type HorizonAgreementStatus = 'AGREES' | 'NEUTRAL' | 'COUNTER';
export type EdgeConfluenceState = 'STRONG_AGREEMENT' | 'AGREES' | 'NEUTRAL' | 'COUNTER';

export interface SignalEdgeConfluence {
  state: EdgeConfluenceState;
  badgeText: string;
  biasLabel: EdgeBiasLabel;
  intradayScore: number;
  scalpScore: number;
  swingScore: number;
  horizons: Array<{
    key: TraderHorizon;
    label: string;
    score: number;
    biasLabel: EdgeBiasLabel;
    status: HorizonAgreementStatus;
  }>;
  matchingHorizons: string[];
  opposingHorizons: string[];
  summaryText: string;
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

export function computeSignalEdgeConfluence(
  signalBias: string,
  scorecard: AssetEdgeScorecard
): SignalEdgeConfluence {
  const isLong = (signalBias || 'long').toLowerCase() === 'long';
  const dirLabel = isLong ? 'LONG' : 'SHORT';

  const scalpScore = scorecard.timeframes?.SCALP?.score ?? scorecard.totalScore;
  const intradayScore = scorecard.timeframes?.INTRADAY?.score ?? scorecard.totalScore;
  const swingScore = scorecard.timeframes?.SWING?.score ?? scorecard.totalScore;

  const horizons: SignalEdgeConfluence['horizons'] = [
    {
      key: 'SCALP',
      label: 'Scalp',
      score: scalpScore,
      biasLabel: scorecard.timeframes?.SCALP?.biasLabel ?? scorecard.biasLabel,
      status: classifyHorizonAgreement(isLong, scalpScore)
    },
    {
      key: 'INTRADAY',
      label: 'Intraday',
      score: intradayScore,
      biasLabel: scorecard.timeframes?.INTRADAY?.biasLabel ?? scorecard.biasLabel,
      status: classifyHorizonAgreement(isLong, intradayScore)
    },
    {
      key: 'SWING',
      label: 'Swing',
      score: swingScore,
      biasLabel: scorecard.timeframes?.SWING?.biasLabel ?? scorecard.biasLabel,
      status: classifyHorizonAgreement(isLong, swingScore)
    }
  ];

  const matchingHorizons = horizons.filter((h) => h.status === 'AGREES').map((h) => h.label);
  const opposingHorizons = horizons.filter((h) => h.status === 'COUNTER').map((h) => h.label);
  const intradayStatus = horizons[1].status;

  let state: EdgeConfluenceState = 'NEUTRAL';
  let badgeText = 'EDGEFINDER NEUTRAL';
  let summaryText = `EdgeFinder macro & flow signals on ${scorecard.instrument} are currently balanced / Neutral.`;

  if (matchingHorizons.length === 3) {
    state = 'STRONG_AGREEMENT';
    badgeText = 'STRONG CONFLUENCE (3/3 TF)';
    summaryText = `EdgeFinder Scalp, Intraday & Swing views all align ${dirLabel} with this signal.`;
  } else if (intradayStatus === 'AGREES' || (matchingHorizons.length >= 2 && opposingHorizons.length === 0)) {
    state = 'AGREES';
    badgeText = 'EDGEFINDER AGREES';
    summaryText = `${matchingHorizons.join(' & ')} EdgeFinder ${matchingHorizons.length > 1 ? 'views agree' : 'view agrees'} ${dirLabel} with this setup.`;
  } else if (
    intradayStatus === 'COUNTER' ||
    (opposingHorizons.length >= 2 && matchingHorizons.length === 0)
  ) {
    state = 'COUNTER';
    badgeText = 'COUNTER MACRO BIAS';
    summaryText = `Wider EdgeFinder bias leans opposite (${scorecard.biasLabel}) — trade strictly by your Manna levels.`;
  } else if (matchingHorizons.length === 1) {
    state = 'AGREES';
    badgeText = 'PARTIAL CONFLUENCE';
    summaryText = `${matchingHorizons[0]} EdgeFinder agrees ${dirLabel}; wider timeframe factors remain mixed.`;
  }

  return {
    state,
    badgeText,
    biasLabel: scorecard.timeframes?.INTRADAY?.biasLabel ?? scorecard.biasLabel,
    intradayScore,
    scalpScore,
    swingScore,
    horizons,
    matchingHorizons,
    opposingHorizons,
    summaryText
  };
}

export function useEdgeFinderSignalConfluence(instrument: string, signalBias: string) {
  const { canAccessEdgeFinder, isSuperAdmin, loading: accessLoading } = useEdgeFinderAccess();
  const { snapshot, loading: dataLoading } = useEdgeFinderData(canAccessEdgeFinder);

  const resolvedSymbol = resolveEdgeFinderInstrument(instrument);
  const scorecard = canAccessEdgeFinder
    ? findEdgeFinderScorecard(instrument, snapshot?.scorecards)
    : null;
  const confluence = scorecard ? computeSignalEdgeConfluence(signalBias, scorecard) : null;

  return {
    canAccessEdgeFinder,
    isSuperAdmin,
    loading: accessLoading || (canAccessEdgeFinder && dataLoading),
    resolvedSymbol,
    scorecard,
    confluence
  };
}
