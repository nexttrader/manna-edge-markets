import { useCallback, useEffect, useState } from 'react';
import { API_BASE } from '../config';
import { useAuth } from '../context/AuthContext';

export type EconomyCode = 'USD' | 'EUR' | 'GBP' | 'JPY' | 'AUD' | 'CAD' | 'CHF' | 'NZD';
export type EdgeBiasLabel = 'Strong Buy' | 'Buy' | 'Neutral' | 'Sell' | 'Strong Sell';

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
  assetClass: 'forex' | 'futures';
  category: 'Major FX' | 'Cross FX' | 'Equity Index' | 'Metals' | 'Energy' | 'Rates' | 'Crypto';
  baseCurrency: string;
  quoteCurrency: string;
  currentPrice: number;
  dailyChangePct: number;
  priceSource: 'LIVE' | 'REFERENCE';
  totalScore: number;
  biasLabel: EdgeBiasLabel;
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
    atr14: number;
    atrPct: number;
    high30d: number;
    low30d: number;
    trendDirection: 'Bullish' | 'Bearish' | 'Ranging';
    distanceFromEma20Pct: number;
    dayRangePctOfAtr: number;
    volatilityPercentile30d: number;
    return5dPct: number;
    return20dPct: number;
    mtfAlignment: {
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
  baseCurrency: EconomyCode;
  quoteCurrency: EconomyCode;
  baseRate: number;
  quoteRate: number;
  rateSpreadPct: number;
  rateSpreadBps: number;
  carryDirection: 'LONG' | 'SHORT' | 'NEUTRAL';
  carryAtrRatio: number;
  assetTotalScore: number;
  biasLabel: EdgeBiasLabel;
  alignedWithEdge: boolean;
  technicalTrend: 'Bullish' | 'Bearish' | 'Ranging';
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
    smartMoneyCount: number;
    livePriceCount: number;
    totalAssets: number;
    cacheAgeSeconds: number;
  };
}

const DEFAULT_ROLLOUT: EdgeFinderRollout = {
  visibleToAdmins: false,
  visibleToTraders: false,
  updatedAt: new Date().toISOString(),
  updatedBy: 'system'
};

const ROLLOUT_SYNC_EVENT = 'edge-finder-rollout-updated';

export function useEdgeFinderAccess() {
  const { user, originalAdmin, isImpersonating } = useAuth();
  const effectiveRole = isImpersonating
    ? (user?.role || 'trader')
    : user?.role === 'super_admin' || originalAdmin?.role === 'super_admin'
      ? 'super_admin'
      : (user?.role || 'guest');

  const isSuperAdmin = effectiveRole === 'super_admin';
  const isAdmin = effectiveRole === 'admin';

  const [rollout, setRollout] = useState<EdgeFinderRollout>(DEFAULT_ROLLOUT);
  const [canAccessEdgeFinder, setCanAccessEdgeFinder] = useState<boolean>(effectiveRole === 'super_admin');
  const [loading, setLoading] = useState<boolean>(true);
  const [updatingRollout, setUpdatingRollout] = useState<boolean>(false);

  const buildHeaders = useCallback(() => ({
    'Content-Type': 'application/json',
    'x-user-role': effectiveRole,
    'x-user-email': user?.email || originalAdmin?.email || ''
  }), [effectiveRole, user?.email, originalAdmin?.email]);

  const fetchAccessStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/edge-finder/access-status?role=${encodeURIComponent(effectiveRole)}`, {
        headers: buildHeaders()
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data?.rollout) {
        setRollout(data.rollout);
      }
      if (typeof data?.canAccess === 'boolean') {
        setCanAccessEdgeFinder(data.canAccess);
      } else {
        setCanAccessEdgeFinder(effectiveRole === 'super_admin');
      }
    } catch {
      // Keep local fail-safe state on transient network errors
      setCanAccessEdgeFinder(effectiveRole === 'super_admin');
    } finally {
      setLoading(false);
    }
  }, [effectiveRole, buildHeaders]);

  useEffect(() => {
    setCanAccessEdgeFinder(effectiveRole === 'super_admin');
    setLoading(true);
    fetchAccessStatus();

    const onSyncEvent = (evt: Event) => {
      const detail = (evt as CustomEvent<EdgeFinderRollout>).detail;
      if (detail) {
        setRollout(detail);
        if (effectiveRole === 'super_admin') setCanAccessEdgeFinder(true);
        else if (effectiveRole === 'admin') setCanAccessEdgeFinder(detail.visibleToAdmins);
        else if (effectiveRole === 'trader') setCanAccessEdgeFinder(detail.visibleToTraders);
        else setCanAccessEdgeFinder(false);
      } else {
        fetchAccessStatus();
      }
    };

    window.addEventListener(ROLLOUT_SYNC_EVENT, onSyncEvent);
    const interval = window.setInterval(fetchAccessStatus, 30_000);
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
        setRollout(data.rollout);
        window.dispatchEvent(new CustomEvent(ROLLOUT_SYNC_EVENT, { detail: data.rollout }));
        return data.rollout as EdgeFinderRollout;
      } finally {
        setUpdatingRollout(false);
      }
    },
    [buildHeaders]
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
    refetchAccess: fetchAccessStatus
  };
}

export function useEdgeFinderData(enabled = true) {
  const { user, originalAdmin, isImpersonating } = useAuth();
  const effectiveRole = isImpersonating
    ? (user?.role || 'trader')
    : user?.role === 'super_admin' || originalAdmin?.role === 'super_admin'
      ? 'super_admin'
      : (user?.role || 'guest');

  const [snapshot, setSnapshot] = useState<EdgeFinderSnapshot | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const buildHeaders = useCallback(() => ({
    'Content-Type': 'application/json',
    'x-user-role': effectiveRole,
    'x-user-email': user?.email || originalAdmin?.email || ''
  }), [effectiveRole, user?.email, originalAdmin?.email]);

  const fetchSnapshot = useCallback(async (force = false) => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    if (force) setRefreshing(true);
    else setLoading((prev) => (snapshot ? prev : true));

    try {
      const res = await fetch(
        `${API_BASE}/api/edge-finder/snapshot${force ? '?refresh=true' : ''}`,
        { headers: buildHeaders() }
      );
      const data = await res.json();
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      setSnapshot(data as EdgeFinderSnapshot);
      setError(null);
    } catch (err: any) {
      setError(err?.message || 'Unable to load Manna EdgeFinder Pro terminal');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [enabled, buildHeaders, snapshot]);

  useEffect(() => {
    fetchSnapshot(false);
  }, [enabled, effectiveRole]);

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
      setSnapshot(data as EdgeFinderSnapshot);
      setError(null);
      return data as EdgeFinderSnapshot;
    } catch (err: any) {
      setError(err?.message || 'Live sync failed');
      return null;
    } finally {
      setRefreshing(false);
    }
  }, [buildHeaders]);

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
        setSnapshot(data as EdgeFinderSnapshot);
        setError(null);
        return true;
      } catch (err: any) {
        setError(err?.message || 'Failed to save macro economy override');
        return false;
      } finally {
        setRefreshing(false);
      }
    },
    [buildHeaders]
  );

  return {
    snapshot,
    loading,
    refreshing,
    error,
    refreshData,
    refetch: () => fetchSnapshot(false),
    updateMacroEconomy
  };
}
