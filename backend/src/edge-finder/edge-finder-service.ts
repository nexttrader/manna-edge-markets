import fs from 'fs';
import path from 'path';
import YahooFinance from 'yahoo-finance2';
import { queryDb } from '../db/database';
import { getAllActiveSetups } from '../db/queries';
import { Candle, EdgeSetup } from '../discovery/types';
import { getLiveCandles, getLiveCurrentPrice } from '../discovery/yahoo-provider';
import { EconomicEvent, newsEngine } from '../news/news-engine';

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

export interface RiskGauge {
  score: number;
  regime: 'Risk-On Expansion' | 'Balanced Rotation' | 'Risk-Off Defensive';
  drivers: Array<{ label: string; impact: 'Risk-On' | 'Risk-Off' | 'Neutral'; value: string }>;
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
    status: ReturnType<typeof newsEngine.getCalendarStatus>;
    upcomingHighImpact: EconomicEvent[];
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

const ROLLOUT_KEY = 'edge_finder_rollout';
const CONFLUENCE_ROLLOUT_KEY = 'edge_finder_confluence_analytics_rollout';
const MACRO_OVERRIDES_KEY = 'edge_finder_macro_overrides';
const SNAPSHOT_FILE = path.join(process.cwd(), 'edge_finder_settings_snapshot.json');
const CFTC_ENDPOINT = 'https://publicreporting.cftc.gov/resource/6dca-aqww.json';
const BIS_CBPOL_ENDPOINT =
  'https://stats.bis.org/api/v2/data/dataflow/BIS/WS_CBPOL/1.0/M.US+XM+GB+JP+AU+CA+CH+NZ?lastNObservations=12&format=sdmx-json';
const WB_MACRO_ENDPOINT =
  'https://api.worldbank.org/v2/country/USA;EMU;GBR;JPN;AUS;CAN;CHE;NZL/indicator/FP.CPI.TOTL.ZG;SL.UEM.TOTL.ZS;NY.GDP.MKTP.KD.ZG?source=2&mrnev=1&format=json&per_page=100';
const IMF_MACRO_ENDPOINT =
  'https://www.imf.org/external/datamapper/api/v1/NGDP_RPCH/PCPIPCH/LUR/USA/DEU/GBR/JPN/AUS/CAN/CHE/NZL';

const yahooClient = new YahooFinance({ suppressNotices: ['yahooSurvey', 'ripHistorical'] });

const YAHOO_SYMBOL_MAP: Record<string, string> = {
  // 7 Major FX
  'EUR/USD': 'EURUSD=X',
  'GBP/USD': 'GBPUSD=X',
  'USD/JPY': 'JPY=X',
  'AUD/USD': 'AUDUSD=X',
  'USD/CAD': 'CAD=X',
  'USD/CHF': 'CHF=X',
  'NZD/USD': 'NZDUSD=X',
  // 21 Cross FX
  'EUR/GBP': 'EURGBP=X',
  'EUR/JPY': 'EURJPY=X',
  'EUR/AUD': 'EURAUD=X',
  'EUR/CAD': 'EURCAD=X',
  'EUR/CHF': 'EURCHF=X',
  'EUR/NZD': 'EURNZD=X',
  'GBP/JPY': 'GBPJPY=X',
  'GBP/AUD': 'GBPAUD=X',
  'GBP/CAD': 'GBPCAD=X',
  'GBP/CHF': 'GBPCHF=X',
  'GBP/NZD': 'GBPNZD=X',
  'AUD/JPY': 'AUDJPY=X',
  'AUD/CAD': 'AUDCAD=X',
  'AUD/CHF': 'AUDCHF=X',
  'AUD/NZD': 'AUDNZD=X',
  'CAD/JPY': 'CADJPY=X',
  'CAD/CHF': 'CADCHF=X',
  'CHF/JPY': 'CHFJPY=X',
  'NZD/JPY': 'NZDJPY=X',
  'NZD/CAD': 'NZDCAD=X',
  'NZD/CHF': 'NZDCHF=X',
  // 18 Futures / Indices / Metals / Energy / Rates / Agriculture
  ES: 'ES=F',
  NQ: 'NQ=F',
  YM: 'YM=F',
  RTY: 'RTY=F',
  NKD: 'NKD=F',
  ZN: 'ZN=F',
  ZB: 'ZB=F',
  GC: 'GC=F',
  SI: 'SI=F',
  HG: 'HG=F',
  PL: 'PL=F',
  PA: 'PA=F',
  CL: 'CL=F',
  BZ: 'BZ=F',
  NG: 'NG=F',
  ZC: 'ZC=F',
  ZS: 'ZS=F',
  ZW: 'ZW=F',
  // 10 Crypto (CME + Coinbase Derivatives CFTC Regulated)
  'BTC/USD': 'BTC-USD',
  'ETH/USD': 'ETH-USD',
  'SOL/USD': 'SOL-USD',
  'XRP/USD': 'XRP-USD',
  'DOGE/USD': 'DOGE-USD',
  'ADA/USD': 'ADA-USD',
  'AVAX/USD': 'AVAX-USD',
  'LINK/USD': 'LINK-USD',
  'LTC/USD': 'LTC-USD',
  'SUI/USD': 'SUI20947-USD'
};

interface AssetDefinition {
  instrument: string;
  displayName: string;
  assetClass: 'forex' | 'futures' | 'crypto';
  category: AssetEdgeScorecard['category'];
  baseCurrency: string;
  quoteCurrency: string;
  decimals: number;
  cftcCode: string;
  baseCftcCode?: string;
  quoteCftcCode?: string;
  contractName: string;
  bestKillzone: 'ASIA' | 'LONDON' | 'NY_AM' | 'NY_PM';
  killzoneNotes: string;
}

export const EDGE_FINDER_ASSETS: AssetDefinition[] = [
  // === 7 MAJOR FX ===
  {
    instrument: 'EUR/USD',
    displayName: 'Euro / US Dollar',
    assetClass: 'forex',
    category: 'Major FX',
    baseCurrency: 'EUR',
    quoteCurrency: 'USD',
    decimals: 5,
    cftcCode: '099741',
    contractName: 'EURO FX - CHICAGO MERCANTILE EXCHANGE',
    bestKillzone: 'LONDON',
    killzoneNotes: 'Highest institutional displacement during London Open (02:00-05:00 NY) & NY AM overlap.'
  },
  {
    instrument: 'GBP/USD',
    displayName: 'British Pound / US Dollar',
    assetClass: 'forex',
    category: 'Major FX',
    baseCurrency: 'GBP',
    quoteCurrency: 'USD',
    decimals: 5,
    cftcCode: '096742',
    contractName: 'BRITISH POUND - CHICAGO MERCANTILE EXCHANGE',
    bestKillzone: 'LONDON',
    killzoneNotes: 'Sharp liquidity sweeps at 02:30-04:00 NY prior to FTSE/Gilt cash expansion.'
  },
  {
    instrument: 'USD/JPY',
    displayName: 'US Dollar / Japanese Yen',
    assetClass: 'forex',
    category: 'Major FX',
    baseCurrency: 'USD',
    quoteCurrency: 'JPY',
    decimals: 3,
    cftcCode: '097741',
    contractName: 'JAPANESE YEN - CHICAGO MERCANTILE EXCHANGE',
    bestKillzone: 'ASIA',
    killzoneNotes: 'Tokyo Fix (19:55 NY) & NY AM US10Y yield auction drive trend continuations.'
  },
  {
    instrument: 'AUD/USD',
    displayName: 'Australian Dollar / US Dollar',
    assetClass: 'forex',
    category: 'Major FX',
    baseCurrency: 'AUD',
    quoteCurrency: 'USD',
    decimals: 5,
    cftcCode: '232741',
    contractName: 'AUSTRALIAN DOLLAR - CHICAGO MERCANTILE EXCHANGE',
    bestKillzone: 'ASIA',
    killzoneNotes: 'Tracks RBA cash prints & China/Asia equity risk open at 20:00-22:30 NY.'
  },
  {
    instrument: 'USD/CAD',
    displayName: 'US Dollar / Canadian Dollar',
    assetClass: 'forex',
    category: 'Major FX',
    baseCurrency: 'USD',
    quoteCurrency: 'CAD',
    decimals: 5,
    cftcCode: '090741',
    contractName: 'CANADIAN DOLLAR - CHICAGO MERCANTILE EXCHANGE',
    bestKillzone: 'NY_AM',
    killzoneNotes: 'Dual North American 08:30 NY macro releases & WTI Crude correlation spikes.'
  },
  {
    instrument: 'USD/CHF',
    displayName: 'US Dollar / Swiss Franc',
    assetClass: 'forex',
    category: 'Major FX',
    baseCurrency: 'USD',
    quoteCurrency: 'CHF',
    decimals: 5,
    cftcCode: '092741',
    contractName: 'SWISS FRANC - CHICAGO MERCANTILE EXCHANGE',
    bestKillzone: 'LONDON',
    killzoneNotes: 'Inverse EUR/USD haven flows across Zurich/London Open and SNB intervention bands.'
  },
  {
    instrument: 'NZD/USD',
    displayName: 'New Zealand Dollar / US Dollar',
    assetClass: 'forex',
    category: 'Major FX',
    baseCurrency: 'NZD',
    quoteCurrency: 'USD',
    decimals: 5,
    cftcCode: '112741',
    contractName: 'NZ DOLLAR - CHICAGO MERCANTILE EXCHANGE',
    bestKillzone: 'ASIA',
    killzoneNotes: 'Asia session GDT dairy/RBNZ repricing with clean NY AM stop runs.'
  },
  // === 21 CROSS FX ===
  {
    instrument: 'EUR/GBP',
    displayName: 'Euro / British Pound',
    assetClass: 'forex',
    category: 'Cross FX',
    baseCurrency: 'EUR',
    quoteCurrency: 'GBP',
    decimals: 5,
    cftcCode: '099741',
    baseCftcCode: '099741',
    quoteCftcCode: '096742',
    contractName: 'EURO FX vs BRITISH POUND CFTC LEG PAIR',
    bestKillzone: 'LONDON',
    killzoneNotes: 'Tight mean-reversion sweeps between 02:00 and 05:00 NY around BoE/ECB repricing.'
  },
  {
    instrument: 'EUR/JPY',
    displayName: 'Euro / Japanese Yen',
    assetClass: 'forex',
    category: 'Cross FX',
    baseCurrency: 'EUR',
    quoteCurrency: 'JPY',
    decimals: 3,
    cftcCode: '099741',
    baseCftcCode: '099741',
    quoteCftcCode: '097741',
    contractName: 'EURO FX vs JAPANESE YEN CFTC LEG PAIR',
    bestKillzone: 'LONDON',
    killzoneNotes: 'Strong carry differential sensitivity across European & NY morning bond auctions.'
  },
  {
    instrument: 'EUR/AUD',
    displayName: 'Euro / Australian Dollar',
    assetClass: 'forex',
    category: 'Cross FX',
    baseCurrency: 'EUR',
    quoteCurrency: 'AUD',
    decimals: 5,
    cftcCode: '099741',
    baseCftcCode: '099741',
    quoteCftcCode: '232741',
    contractName: 'EURO FX vs AUSTRALIAN DOLLAR CFTC LEG PAIR',
    bestKillzone: 'LONDON',
    killzoneNotes: 'High ADR European-commodity spread trade; London Open continuation setups.'
  },
  {
    instrument: 'EUR/CAD',
    displayName: 'Euro / Canadian Dollar',
    assetClass: 'forex',
    category: 'Cross FX',
    baseCurrency: 'EUR',
    quoteCurrency: 'CAD',
    decimals: 5,
    cftcCode: '099741',
    baseCftcCode: '099741',
    quoteCftcCode: '090741',
    contractName: 'EURO FX vs CANADIAN DOLLAR CFTC LEG PAIR',
    bestKillzone: 'NY_AM',
    killzoneNotes: 'ECB rate spread vs crude oil flows peaking at 08:30-10:30 NY.'
  },
  {
    instrument: 'EUR/CHF',
    displayName: 'Euro / Swiss Franc',
    assetClass: 'forex',
    category: 'Cross FX',
    baseCurrency: 'EUR',
    quoteCurrency: 'CHF',
    decimals: 5,
    cftcCode: '099741',
    baseCftcCode: '099741',
    quoteCftcCode: '092741',
    contractName: 'EURO FX vs SWISS FRANC CFTC LEG PAIR',
    bestKillzone: 'LONDON',
    killzoneNotes: 'Core European risk sentiment barometer around SNB/ECB policy spread.'
  },
  {
    instrument: 'EUR/NZD',
    displayName: 'Euro / New Zealand Dollar',
    assetClass: 'forex',
    category: 'Cross FX',
    baseCurrency: 'EUR',
    quoteCurrency: 'NZD',
    decimals: 5,
    cftcCode: '099741',
    baseCftcCode: '099741',
    quoteCftcCode: '112741',
    contractName: 'EURO FX vs NZ DOLLAR CFTC LEG PAIR',
    bestKillzone: 'LONDON',
    killzoneNotes: 'Wide daily expansion range during London liquidity sweeps.'
  },
  {
    instrument: 'GBP/JPY',
    displayName: 'British Pound / Japanese Yen',
    assetClass: 'forex',
    category: 'Cross FX',
    baseCurrency: 'GBP',
    quoteCurrency: 'JPY',
    decimals: 3,
    cftcCode: '096742',
    baseCftcCode: '096742',
    quoteCftcCode: '097741',
    contractName: 'BRITISH POUND vs JAPANESE YEN CFTC LEG PAIR',
    bestKillzone: 'LONDON',
    killzoneNotes: 'High-beta risk proxy; London Open expansions often deliver 1.5x daily ADR.'
  },
  {
    instrument: 'GBP/AUD',
    displayName: 'British Pound / Australian Dollar',
    assetClass: 'forex',
    category: 'Cross FX',
    baseCurrency: 'GBP',
    quoteCurrency: 'AUD',
    decimals: 5,
    cftcCode: '096742',
    baseCftcCode: '096742',
    quoteCftcCode: '232741',
    contractName: 'BRITISH POUND vs AUSTRALIAN DOLLAR CFTC LEG PAIR',
    bestKillzone: 'LONDON',
    killzoneNotes: 'Explosive London Open FVG displacements after Asia range accumulation.'
  },
  {
    instrument: 'GBP/CAD',
    displayName: 'British Pound / Canadian Dollar',
    assetClass: 'forex',
    category: 'Cross FX',
    baseCurrency: 'GBP',
    quoteCurrency: 'CAD',
    decimals: 5,
    cftcCode: '096742',
    baseCftcCode: '096742',
    quoteCftcCode: '090741',
    contractName: 'BRITISH POUND vs CANADIAN DOLLAR CFTC LEG PAIR',
    bestKillzone: 'NY_AM',
    killzoneNotes: 'Clean London/NY overlap institutional imbalances around BoE & oil shocks.'
  },
  {
    instrument: 'GBP/CHF',
    displayName: 'British Pound / Swiss Franc',
    assetClass: 'forex',
    category: 'Cross FX',
    baseCurrency: 'GBP',
    quoteCurrency: 'CHF',
    decimals: 5,
    cftcCode: '096742',
    baseCftcCode: '096742',
    quoteCftcCode: '092741',
    contractName: 'BRITISH POUND vs SWISS FRANC CFTC LEG PAIR',
    bestKillzone: 'LONDON',
    killzoneNotes: 'European carry vs Swiss haven leg flow during 02:00-05:00 NY.'
  },
  {
    instrument: 'GBP/NZD',
    displayName: 'British Pound / New Zealand Dollar',
    assetClass: 'forex',
    category: 'Cross FX',
    baseCurrency: 'GBP',
    quoteCurrency: 'NZD',
    decimals: 5,
    cftcCode: '096742',
    baseCftcCode: '096742',
    quoteCftcCode: '112741',
    contractName: 'BRITISH POUND vs NZ DOLLAR CFTC LEG PAIR',
    bestKillzone: 'LONDON',
    killzoneNotes: 'Highest pip ADR major-cross; wait for strict PD array confirmation.'
  },
  {
    instrument: 'AUD/JPY',
    displayName: 'Australian Dollar / Japanese Yen',
    assetClass: 'forex',
    category: 'Cross FX',
    baseCurrency: 'AUD',
    quoteCurrency: 'JPY',
    decimals: 3,
    cftcCode: '232741',
    baseCftcCode: '232741',
    quoteCftcCode: '097741',
    contractName: 'AUSTRALIAN DOLLAR vs JAPANESE YEN CFTC LEG PAIR',
    bestKillzone: 'ASIA',
    killzoneNotes: 'Premier Asia risk-on / risk-off barometer & carry trade benchmark.'
  },
  {
    instrument: 'AUD/CAD',
    displayName: 'Australian Dollar / Canadian Dollar',
    assetClass: 'forex',
    category: 'Cross FX',
    baseCurrency: 'AUD',
    quoteCurrency: 'CAD',
    decimals: 5,
    cftcCode: '232741',
    baseCftcCode: '232741',
    quoteCftcCode: '090741',
    contractName: 'AUSTRALIAN DOLLAR vs CANADIAN DOLLAR CFTC LEG PAIR',
    bestKillzone: 'NY_AM',
    killzoneNotes: 'Metals vs Energy commodity FX relative strength divergence.'
  },
  {
    instrument: 'AUD/CHF',
    displayName: 'Australian Dollar / Swiss Franc',
    assetClass: 'forex',
    category: 'Cross FX',
    baseCurrency: 'AUD',
    quoteCurrency: 'CHF',
    decimals: 5,
    cftcCode: '232741',
    baseCftcCode: '232741',
    quoteCftcCode: '092741',
    contractName: 'AUSTRALIAN DOLLAR vs SWISS FRANC CFTC LEG PAIR',
    bestKillzone: 'ASIA',
    killzoneNotes: 'Classic carry differential trade against low-yield CHF funding.'
  },
  {
    instrument: 'AUD/NZD',
    displayName: 'Australian Dollar / New Zealand Dollar',
    assetClass: 'forex',
    category: 'Cross FX',
    baseCurrency: 'AUD',
    quoteCurrency: 'NZD',
    decimals: 5,
    cftcCode: '232741',
    baseCftcCode: '232741',
    quoteCftcCode: '112741',
    contractName: 'AUSTRALIAN DOLLAR vs NZ DOLLAR CFTC LEG PAIR',
    bestKillzone: 'ASIA',
    killzoneNotes: 'Tasman central bank divergence (RBA vs RBNZ) peaking during Wellington/Sydney hours.'
  },
  {
    instrument: 'CAD/JPY',
    displayName: 'Canadian Dollar / Japanese Yen',
    assetClass: 'forex',
    category: 'Cross FX',
    baseCurrency: 'CAD',
    quoteCurrency: 'JPY',
    decimals: 3,
    cftcCode: '090741',
    baseCftcCode: '090741',
    quoteCftcCode: '097741',
    contractName: 'CANADIAN DOLLAR vs JAPANESE YEN CFTC LEG PAIR',
    bestKillzone: 'NY_AM',
    killzoneNotes: 'Energy beta + North American yield carry expansion across NY AM.'
  },
  {
    instrument: 'CAD/CHF',
    displayName: 'Canadian Dollar / Swiss Franc',
    assetClass: 'forex',
    category: 'Cross FX',
    baseCurrency: 'CAD',
    quoteCurrency: 'CHF',
    decimals: 5,
    cftcCode: '090741',
    baseCftcCode: '090741',
    quoteCftcCode: '092741',
    contractName: 'CANADIAN DOLLAR vs SWISS FRANC CFTC LEG PAIR',
    bestKillzone: 'NY_AM',
    killzoneNotes: 'BoC vs SNB yield carry coupled with WTI crude direction.'
  },
  {
    instrument: 'CHF/JPY',
    displayName: 'Swiss Franc / Japanese Yen',
    assetClass: 'forex',
    category: 'Cross FX',
    baseCurrency: 'CHF',
    quoteCurrency: 'JPY',
    decimals: 3,
    cftcCode: '092741',
    baseCftcCode: '092741',
    quoteCftcCode: '097741',
    contractName: 'SWISS FRANC vs JAPANESE YEN CFTC LEG PAIR',
    bestKillzone: 'LONDON',
    killzoneNotes: 'Safe-haven relative rate differential sensitive to BoJ vs SNB shifts.'
  },
  {
    instrument: 'NZD/JPY',
    displayName: 'New Zealand Dollar / Japanese Yen',
    assetClass: 'forex',
    category: 'Cross FX',
    baseCurrency: 'NZD',
    quoteCurrency: 'JPY',
    decimals: 3,
    cftcCode: '112741',
    baseCftcCode: '112741',
    quoteCftcCode: '097741',
    contractName: 'NZ DOLLAR vs JAPANESE YEN CFTC LEG PAIR',
    bestKillzone: 'ASIA',
    killzoneNotes: 'Pure Asia session carry spread & global equity risk-appetite proxy.'
  },
  {
    instrument: 'NZD/CAD',
    displayName: 'New Zealand Dollar / Canadian Dollar',
    assetClass: 'forex',
    category: 'Cross FX',
    baseCurrency: 'NZD',
    quoteCurrency: 'CAD',
    decimals: 5,
    cftcCode: '112741',
    baseCftcCode: '112741',
    quoteCftcCode: '090741',
    contractName: 'NZ DOLLAR vs CANADIAN DOLLAR CFTC LEG PAIR',
    bestKillzone: 'NY_AM',
    killzoneNotes: 'Soft-commodity vs energy terms-of-trade macro divergence.'
  },
  {
    instrument: 'NZD/CHF',
    displayName: 'New Zealand Dollar / Swiss Franc',
    assetClass: 'forex',
    category: 'Cross FX',
    baseCurrency: 'NZD',
    quoteCurrency: 'CHF',
    decimals: 5,
    cftcCode: '112741',
    baseCftcCode: '112741',
    quoteCftcCode: '092741',
    contractName: 'NZ DOLLAR vs SWISS FRANC CFTC LEG PAIR',
    bestKillzone: 'LONDON',
    killzoneNotes: 'High-yield NZD funding carry spread against low-yield SNB policy.'
  },
  // === 18 FUTURES / INDICES / METALS / ENERGY / RATES / AGRICULTURE ===
  {
    instrument: 'ES',
    displayName: 'E-Mini S&P 500 Futures',
    assetClass: 'futures',
    category: 'Equity Index',
    baseCurrency: 'SPX',
    quoteCurrency: 'USD',
    decimals: 2,
    cftcCode: '13874A',
    contractName: 'E-MINI S&P 500 - CHICAGO MERCANTILE EXCHANGE',
    bestKillzone: 'NY_AM',
    killzoneNotes: '09:30 NY Cash Equities Open & 10:00 Silver Bullet windows anchor primary displacement.'
  },
  {
    instrument: 'NQ',
    displayName: 'E-Mini Nasdaq-100 Futures',
    assetClass: 'futures',
    category: 'Equity Index',
    baseCurrency: 'NDX',
    quoteCurrency: 'USD',
    decimals: 2,
    cftcCode: '209742',
    contractName: 'NASDAQ MINI - CHICAGO MERCANTILE EXCHANGE',
    bestKillzone: 'NY_AM',
    killzoneNotes: 'Mega-cap tech flows at 09:30-11:30 NY; sensitive to real yield & CPI surprises.'
  },
  {
    instrument: 'YM',
    displayName: 'E-Mini Dow Jones Futures',
    assetClass: 'futures',
    category: 'Equity Index',
    baseCurrency: 'DJI',
    quoteCurrency: 'USD',
    decimals: 0,
    cftcCode: '124603',
    contractName: 'DJIA x $5 - CHICAGO BOARD OF TRADE',
    bestKillzone: 'NY_AM',
    killzoneNotes: 'Value/cyclical sector rotation benchmark during NY AM & PM Power Hour.'
  },
  {
    instrument: 'RTY',
    displayName: 'E-Mini Russell 2000 Futures',
    assetClass: 'futures',
    category: 'Equity Index',
    baseCurrency: 'RUT',
    quoteCurrency: 'USD',
    decimals: 1,
    cftcCode: '239742',
    contractName: 'RUSSELL E-MINI - CHICAGO MERCANTILE EXCHANGE',
    bestKillzone: 'NY_PM',
    killzoneNotes: 'High sensitivity to domestic PMI, regional banking liquidity, and NY PM closing sweeps.'
  },
  {
    instrument: 'NKD',
    displayName: 'Nikkei 225 Yen-Denom Futures (CME)',
    assetClass: 'futures',
    category: 'Equity Index',
    baseCurrency: 'NKY',
    quoteCurrency: 'JPY',
    decimals: 0,
    cftcCode: '240743',
    contractName: 'NIKKEI STOCK AVERAGE YEN DENOM - CHICAGO MERCANTILE EXCHANGE',
    bestKillzone: 'ASIA',
    killzoneNotes: 'Tokyo TSE open (19:00 NY) & BoJ FX intervention sentiment drive Asia equity displacement.'
  },
  {
    instrument: 'ZN',
    displayName: '10-Year US Treasury Note Futures',
    assetClass: 'futures',
    category: 'Rates',
    baseCurrency: 'UST10',
    quoteCurrency: 'USD',
    decimals: 3,
    cftcCode: '043602',
    contractName: 'UST 10Y NOTE - CHICAGO BOARD OF TRADE',
    bestKillzone: 'NY_AM',
    killzoneNotes: '08:30 NY CPI/NFP & 13:00 NY Treasury auctions anchor macro rate volatility.'
  },
  {
    instrument: 'ZB',
    displayName: '30-Year US Treasury Bond Futures',
    assetClass: 'futures',
    category: 'Rates',
    baseCurrency: 'UST30',
    quoteCurrency: 'USD',
    decimals: 3,
    cftcCode: '020601',
    contractName: 'UST BOND - CHICAGO BOARD OF TRADE',
    bestKillzone: 'NY_AM',
    killzoneNotes: 'Long-end duration benchmark pricing Fed terminal curve & long-bond auction tails.'
  },
  {
    instrument: 'GC',
    displayName: 'Gold Futures (COMEX)',
    assetClass: 'futures',
    category: 'Metals',
    baseCurrency: 'XAU',
    quoteCurrency: 'USD',
    decimals: 2,
    cftcCode: '088691',
    contractName: 'GOLD - COMMODITY EXCHANGE INC.',
    bestKillzone: 'NY_AM',
    killzoneNotes: 'LBMA 03:00 NY & COMEX 08:20-10:30 NY opens produce textbook FVG displacement.'
  },
  {
    instrument: 'SI',
    displayName: 'Silver Futures (COMEX)',
    assetClass: 'futures',
    category: 'Metals',
    baseCurrency: 'XAG',
    quoteCurrency: 'USD',
    decimals: 3,
    cftcCode: '084691',
    contractName: 'SILVER - COMMODITY EXCHANGE INC.',
    bestKillzone: 'NY_AM',
    killzoneNotes: 'High-beta metals amplification; watch SMT divergence against GC at London/NY opens.'
  },
  {
    instrument: 'HG',
    displayName: 'High Grade Copper Futures (COMEX)',
    assetClass: 'futures',
    category: 'Metals',
    baseCurrency: 'XCU',
    quoteCurrency: 'USD',
    decimals: 4,
    cftcCode: '085692',
    contractName: 'COPPER-GRADE #1 - COMMODITY EXCHANGE INC.',
    bestKillzone: 'LONDON',
    killzoneNotes: 'Global manufacturing & China industrial demand proxy ("Dr. Copper").'
  },
  {
    instrument: 'PL',
    displayName: 'Platinum Futures (NYMEX)',
    assetClass: 'futures',
    category: 'Metals',
    baseCurrency: 'XPT',
    quoteCurrency: 'USD',
    decimals: 1,
    cftcCode: '076651',
    contractName: 'PLATINUM - NEW YORK MERCANTILE EXCHANGE',
    bestKillzone: 'NY_AM',
    killzoneNotes: 'Precious-industrial hybrid tracking Gold/Silver relative value and auto catalysts.'
  },
  {
    instrument: 'PA',
    displayName: 'Palladium Futures (NYMEX)',
    assetClass: 'futures',
    category: 'Metals',
    baseCurrency: 'XPD',
    quoteCurrency: 'USD',
    decimals: 2,
    cftcCode: '075651',
    contractName: 'PALLADIUM - NEW YORK MERCANTILE EXCHANGE',
    bestKillzone: 'NY_AM',
    killzoneNotes: 'Thin industrial metals liquidity produces sharp short-covering rallies around NY open.'
  },
  {
    instrument: 'CL',
    displayName: 'WTI Crude Oil Futures (NYMEX)',
    assetClass: 'futures',
    category: 'Energy',
    baseCurrency: 'WTI',
    quoteCurrency: 'USD',
    decimals: 2,
    cftcCode: '067651',
    contractName: 'WTI-PHYSICAL - NEW YORK MERCANTILE EXCHANGE',
    bestKillzone: 'NY_AM',
    killzoneNotes: 'NYMEX 09:00 NY pit & Wednesday 10:30 EIA inventories govern institutional liquidity.'
  },
  {
    instrument: 'BZ',
    displayName: 'Brent Crude Oil Futures (ICE/NYMEX)',
    assetClass: 'futures',
    category: 'Energy',
    baseCurrency: 'BRENT',
    quoteCurrency: 'USD',
    decimals: 2,
    cftcCode: '06765T',
    contractName: 'BRENT LAST DAY - NEW YORK MERCANTILE EXCHANGE',
    bestKillzone: 'LONDON',
    killzoneNotes: 'Global seaborne crude benchmark sensitive to London geopolitics & OPEC+ flows.'
  },
  {
    instrument: 'NG',
    displayName: 'Henry Hub Natural Gas Futures',
    assetClass: 'futures',
    category: 'Energy',
    baseCurrency: 'NGAS',
    quoteCurrency: 'USD',
    decimals: 3,
    cftcCode: '023651',
    contractName: 'HENRY HUB NATURAL GAS - NEW YORK MERCANTILE EXCHANGE',
    bestKillzone: 'NY_AM',
    killzoneNotes: 'Thursday 10:30 NY EIA gas storage release drives high-ATR trend expansions.'
  },
  {
    instrument: 'ZC',
    displayName: 'CBOT Corn Futures',
    assetClass: 'futures',
    category: 'Agriculture',
    baseCurrency: 'CORN',
    quoteCurrency: 'USD',
    decimals: 2,
    cftcCode: '002602',
    contractName: 'CORN - CHICAGO BOARD OF TRADE',
    bestKillzone: 'NY_AM',
    killzoneNotes: 'CBOT 09:30 NY day pit open & USDA WASDE noon releases anchor grain flow.'
  },
  {
    instrument: 'ZS',
    displayName: 'CBOT Soybeans Futures',
    assetClass: 'futures',
    category: 'Agriculture',
    baseCurrency: 'SOYB',
    quoteCurrency: 'USD',
    decimals: 2,
    cftcCode: '005602',
    contractName: 'SOYBEANS - CHICAGO BOARD OF TRADE',
    bestKillzone: 'NY_AM',
    killzoneNotes: 'Biofuel/crush demand & export sales prints drive directional sweep moves.'
  },
  {
    instrument: 'ZW',
    displayName: 'CBOT SRW Wheat Futures',
    assetClass: 'futures',
    category: 'Agriculture',
    baseCurrency: 'WHEAT',
    quoteCurrency: 'USD',
    decimals: 2,
    cftcCode: '001602',
    contractName: 'WHEAT-SRW - CHICAGO BOARD OF TRADE',
    bestKillzone: 'NY_AM',
    killzoneNotes: 'Black Sea export shocks & commercial hedger extremes fuel multi-day reversals.'
  },
  // === 10 CRYPTOASSETS (CME + COINBASE DERIVATIVES CFTC COT) ===
  {
    instrument: 'BTC/USD',
    displayName: 'Bitcoin / US Dollar (CME COT)',
    assetClass: 'crypto',
    category: 'Crypto',
    baseCurrency: 'BTC',
    quoteCurrency: 'USD',
    decimals: 0,
    cftcCode: '133741',
    contractName: 'BITCOIN - CHICAGO MERCANTILE EXCHANGE',
    bestKillzone: 'NY_AM',
    killzoneNotes: 'Spot ETF & CME Bitcoin institutional liquidity peaks around 09:30-11:30 NY equities open.'
  },
  {
    instrument: 'ETH/USD',
    displayName: 'Ethereum / US Dollar (CME COT)',
    assetClass: 'crypto',
    category: 'Crypto',
    baseCurrency: 'ETH',
    quoteCurrency: 'USD',
    decimals: 2,
    cftcCode: '146021',
    contractName: 'ETHER CASH SETTLED - CHICAGO MERCANTILE EXCHANGE',
    bestKillzone: 'NY_AM',
    killzoneNotes: 'High-beta digital asset tracking BTC SMT divergence & US real liquidity conditions.'
  },
  {
    instrument: 'SOL/USD',
    displayName: 'Solana / US Dollar (CME COT)',
    assetClass: 'crypto',
    category: 'Crypto',
    baseCurrency: 'SOL',
    quoteCurrency: 'USD',
    decimals: 2,
    cftcCode: '177741',
    contractName: 'SOL - CHICAGO MERCANTILE EXCHANGE',
    bestKillzone: 'NY_AM',
    killzoneNotes: 'High-beta Layer-1 momentum leader; tracks NQ risk appetite & NY equities liquidity.'
  },
  {
    instrument: 'XRP/USD',
    displayName: 'XRP / US Dollar (CME COT)',
    assetClass: 'crypto',
    category: 'Crypto',
    baseCurrency: 'XRP',
    quoteCurrency: 'USD',
    decimals: 4,
    cftcCode: '176740',
    contractName: 'XRP - CHICAGO MERCANTILE EXCHANGE',
    bestKillzone: 'ASIA',
    killzoneNotes: 'Strong Asia/Tokyo retail volume followed by NY AM CME futures institutional flows.'
  },
  {
    instrument: 'DOGE/USD',
    displayName: 'Dogecoin / US Dollar (Coinbase Perp COT)',
    assetClass: 'crypto',
    category: 'Crypto',
    baseCurrency: 'DOGE',
    quoteCurrency: 'USD',
    decimals: 5,
    cftcCode: '168LM2',
    contractName: 'DOGECOIN PERP STYLE - COINBASE DERIVATIVES, LLC',
    bestKillzone: 'NY_AM',
    killzoneNotes: 'Retail sentiment & speculative risk appetite beta gauge around NY cash open.'
  },
  {
    instrument: 'ADA/USD',
    displayName: 'Cardano / US Dollar (Coinbase Perp COT)',
    assetClass: 'crypto',
    category: 'Crypto',
    baseCurrency: 'ADA',
    quoteCurrency: 'USD',
    decimals: 4,
    cftcCode: '174LM2',
    contractName: 'CARDONA PERP STYLE - COINBASE DERIVATIVES, LLC',
    bestKillzone: 'LONDON',
    killzoneNotes: 'Rotates sharply with ETH/BTC ratio and broad altcoin speculative inflows.'
  },
  {
    instrument: 'AVAX/USD',
    displayName: 'Avalanche / US Dollar (Coinbase Perp COT)',
    assetClass: 'crypto',
    category: 'Crypto',
    baseCurrency: 'AVAX',
    quoteCurrency: 'USD',
    decimals: 3,
    cftcCode: '171LM2',
    contractName: 'AVALANCHE PERP STYLE - COINBASE DERIVATIVES, LLC',
    bestKillzone: 'NY_AM',
    killzoneNotes: 'Institutional RWA/subnet narrative beta reacting cleanly to US Treasury yield swings.'
  },
  {
    instrument: 'LINK/USD',
    displayName: 'Chainlink / US Dollar (Coinbase Perp COT)',
    assetClass: 'crypto',
    category: 'Crypto',
    baseCurrency: 'LINK',
    quoteCurrency: 'USD',
    decimals: 3,
    cftcCode: '170LM2',
    contractName: 'CHAINLINK PERP STYLE - COINBASE DERIVATIVES, LLC',
    bestKillzone: 'NY_AM',
    killzoneNotes: 'Oracle/DeFi infrastructure leader with strong smart-money COT extremes.'
  },
  {
    instrument: 'LTC/USD',
    displayName: 'Litecoin / US Dollar (Coinbase Perp COT)',
    assetClass: 'crypto',
    category: 'Crypto',
    baseCurrency: 'LTC',
    quoteCurrency: 'USD',
    decimals: 2,
    cftcCode: '167LM1',
    contractName: 'LITECOIN PERP STYLE - COINBASE DERIVATIVES, LLC',
    bestKillzone: 'NY_AM',
    killzoneNotes: 'Legacy PoW liquidity proxy showing clean mean-reversion sweeps at daily levels.'
  },
  {
    instrument: 'SUI/USD',
    displayName: 'Sui / US Dollar (Coinbase Perp COT)',
    assetClass: 'crypto',
    category: 'Crypto',
    baseCurrency: 'SUI',
    quoteCurrency: 'USD',
    decimals: 4,
    cftcCode: '180LM3',
    contractName: 'SUI PERP STYLE - COINBASE DERIVATIVES, LLC',
    bestKillzone: 'ASIA',
    killzoneNotes: 'High-beta Asia/NY cross-session momentum token with steep ADR velocity.'
  }
];

interface EconomyMeta {
  currency: EconomyCode;
  country: string;
  centralBank: string;
  bisCode: string;
  wbCode: string;
  nextMeeting: string;
}

const G8_METADATA: EconomyMeta[] = [
  { currency: 'USD', country: 'United States', centralBank: 'Federal Reserve (FOMC)', bisCode: 'US', wbCode: 'USA', nextMeeting: 'FOMC Scheduled' },
  { currency: 'EUR', country: 'Eurozone', centralBank: 'European Central Bank (ECB)', bisCode: 'XM', wbCode: 'EMU', nextMeeting: 'ECB Governing Council' },
  { currency: 'GBP', country: 'United Kingdom', centralBank: 'Bank of England (BoE)', bisCode: 'GB', wbCode: 'GBR', nextMeeting: 'BoE MPC Meeting' },
  { currency: 'JPY', country: 'Japan', centralBank: 'Bank of Japan (BoJ)', bisCode: 'JP', wbCode: 'JPN', nextMeeting: 'BoJ Policy Board' },
  { currency: 'AUD', country: 'Australia', centralBank: 'Reserve Bank of Australia (RBA)', bisCode: 'AU', wbCode: 'AUS', nextMeeting: 'RBA Board' },
  { currency: 'CAD', country: 'Canada', centralBank: 'Bank of Canada (BoC)', bisCode: 'CA', wbCode: 'CAN', nextMeeting: 'BoC Policy Decision' },
  { currency: 'CHF', country: 'Switzerland', centralBank: 'Swiss National Bank (SNB)', bisCode: 'CH', wbCode: 'CHE', nextMeeting: 'SNB Quarterly Assessment' },
  { currency: 'NZD', country: 'New Zealand', centralBank: 'Reserve Bank of New Zealand (RBNZ)', bisCode: 'NZ', wbCode: 'NZL', nextMeeting: 'RBNZ OCR Review' }
];

interface CotWeeklyRow {
  reportDate: string;
  noncommLong: number;
  noncommShort: number;
  noncommNet: number;
  commLong: number;
  commShort: number;
  commNet: number;
  nonreptLong: number;
  nonreptShort: number;
  openInterest: number;
}

interface CachedCotRaw {
  fetchedAt: number;
  byCode: Record<string, CotWeeklyRow[]>;
}

interface CachedSeasonalityEntry {
  fetchedAt: number;
  monthlyReturns10Y: number[];
  monthlyWinRate10Y: number[];
}

interface CachedDailyMarketEntry {
  fetchedAt: number;
  candles: Candle[];
  livePrice: number | null;
  isLive: boolean;
}

interface CachedLiveMacro {
  fetchedAt: number;
  source: 'LIVE_BIS_WORLDBANK' | 'BASELINE';
  bisRates: Partial<Record<EconomyCode, { rate: number; prevRate: number; history: Array<{ date: string; value: number }> }>>;
  wbIndicators: Partial<
    Record<
      EconomyCode,
      {
        cpiYoY?: number;
        unemploymentRate?: number;
        gdpQoQ?: number;
        history: MacroEconomyData['history'];
      }
    >
  >;
}

let cotCache: CachedCotRaw | null = null;
const seasonalityCache: Record<string, CachedSeasonalityEntry> = {};
const dailyMarketCache: Record<string, CachedDailyMarketEntry> = {};
const intradayMarketCache: Record<string, CachedDailyMarketEntry> = {};
let macroExternalCache: CachedLiveMacro | null = null;
let macroInternalsCache: { fetchedAt: number; data: MacroInternalsData } | null = null;
let smartMoneyCache: { fetchedAt: number; data: SmartMoneyData } | null = null;
let snapshotCache: { data: EdgeFinderSnapshot; cachedAt: number } | null = null;
let inFlightSnapshot: Promise<EdgeFinderSnapshot> | null = null;
let backgroundRefreshTimer: NodeJS.Timeout | null = null;

const SNAPSHOT_TTL_MS = 60_000;
const SNAPSHOT_SWR_MAX_AGE_MS = 120_000;
const INTRADAY_MARKET_TTL_MS = 45_000;
const DAILY_MARKET_TTL_MS = 120_000;
const COT_TTL_MS = 30 * 60_000;
const MACRO_INTERNALS_TTL_MS = 5 * 60_000;
const SMART_MONEY_TTL_MS = 60 * 60_000;
const SEASONALITY_TTL_MS = 6 * 3600_000;
const MACRO_TTL_MS = 60 * 60_000;

async function mapWithConcurrency<T, R>(items: T[], limit: number, worker: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  async function runWorker(): Promise<void> {
    while (cursor < items.length) {
      const idx = cursor++;
      results[idx] = await worker(items[idx], idx);
    }
  }
  const runners = Array.from({ length: Math.min(limit, items.length) }, () => runWorker());
  await Promise.all(runners);
  return results;
}

const YAHOO_MAX_CONCURRENT = 18;
let yahooActiveCount = 0;
const yahooWaitQueue: Array<() => void> = [];

async function runYahooLimited<T>(fn: () => Promise<T>, timeoutMs = 10_000): Promise<T | null> {
  if (yahooActiveCount >= YAHOO_MAX_CONCURRENT) {
    await new Promise<void>((resolve) => yahooWaitQueue.push(resolve));
  }
  yahooActiveCount += 1;
  try {
    return await Promise.race([
      fn(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs))
    ]);
  } catch {
    return null;
  } finally {
    yahooActiveCount -= 1;
    const next = yahooWaitQueue.shift();
    if (next) next();
  }
}

function isTestEnv(): boolean {
  return process.env.NODE_ENV === 'test';
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function roundTo(val: number, decimals = 2): number {
  const factor = Math.pow(10, decimals);
  return Math.round(val * factor) / factor;
}

function readDiskSnapshot(): {
  rollout?: EdgeFinderRollout;
  confluenceAnalyticsRollout?: EdgeFinderRollout;
  macroOverrides?: Partial<Record<EconomyCode, Partial<MacroEconomyData>>>;
} {
  if (isTestEnv()) return {};
  try {
    if (fs.existsSync(SNAPSHOT_FILE)) {
      return JSON.parse(fs.readFileSync(SNAPSHOT_FILE, 'utf-8'));
    }
  } catch {
    // ignore malformed snapshot
  }
  return {};
}

function writeDiskSnapshot(patch: {
  rollout?: EdgeFinderRollout;
  confluenceAnalyticsRollout?: EdgeFinderRollout;
  macroOverrides?: Partial<Record<EconomyCode, Partial<MacroEconomyData>>>;
}): void {
  if (isTestEnv()) return;
  try {
    const existing = readDiskSnapshot();
    const merged = { ...existing, ...patch };
    fs.writeFileSync(SNAPSHOT_FILE, JSON.stringify(merged, null, 2), 'utf-8');
  } catch {
    // ignore disk write issues in read-only environments
  }
}

async function ensureSettingsTable(): Promise<void> {
  try {
    await queryDb(`CREATE TABLE IF NOT EXISTS superadmin_strategy_settings (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT)`);
  } catch {
    // already exists
  }
}

async function readSettingJson<T>(key: string): Promise<T | null> {
  try {
    await ensureSettingsTable();
    const rows = await queryDb<{ value: string }>(
      `SELECT value FROM superadmin_strategy_settings WHERE key = ?`,
      [key]
    );
    if (rows.length > 0 && rows[0].value) {
      return JSON.parse(rows[0].value) as T;
    }
  } catch {
    // fallback handled by caller
  }
  return null;
}

async function writeSettingJson(key: string, payload: unknown): Promise<void> {
  await ensureSettingsTable();
  const now = new Date().toISOString();
  const serialized = JSON.stringify(payload);
  await queryDb(`DELETE FROM superadmin_strategy_settings WHERE key = ?`, [key]);
  await queryDb(
    `INSERT INTO superadmin_strategy_settings (key, value, updated_at) VALUES (?, ?, ?)`,
    [key, serialized, now]
  );
}

export async function getEdgeFinderRollout(): Promise<EdgeFinderRollout> {
  const dbVal = await readSettingJson<EdgeFinderRollout>(ROLLOUT_KEY);
  if (dbVal && typeof dbVal.visibleToAdmins === 'boolean' && typeof dbVal.visibleToTraders === 'boolean') {
    return dbVal;
  }
  const disk = readDiskSnapshot();
  if (disk.rollout) {
    return disk.rollout;
  }
  return {
    visibleToAdmins: false,
    visibleToTraders: false,
    updatedAt: new Date().toISOString(),
    updatedBy: 'system'
  };
}

export async function updateEdgeFinderRollout(
  patch: Partial<Pick<EdgeFinderRollout, 'visibleToAdmins' | 'visibleToTraders'>>,
  updatedBy = 'super_admin'
): Promise<EdgeFinderRollout> {
  const current = await getEdgeFinderRollout();
  const next: EdgeFinderRollout = {
    visibleToAdmins: typeof patch.visibleToAdmins === 'boolean' ? patch.visibleToAdmins : current.visibleToAdmins,
    visibleToTraders: typeof patch.visibleToTraders === 'boolean' ? patch.visibleToTraders : current.visibleToTraders,
    updatedAt: new Date().toISOString(),
    updatedBy
  };
  await writeSettingJson(ROLLOUT_KEY, next);
  writeDiskSnapshot({ rollout: next });
  snapshotCache = null;
  return next;
}

export function canRoleAccessEdgeFinder(role: string | undefined | null, rollout: EdgeFinderRollout): boolean {
  const normalized = (role || '').toLowerCase().trim();
  if (normalized === 'super_admin') return true;
  if (normalized === 'admin') return rollout.visibleToAdmins === true;
  if (normalized === 'trader') return rollout.visibleToTraders === true;
  return false;
}

export async function getConfluenceAnalyticsRollout(): Promise<EdgeFinderRollout> {
  const dbVal = await readSettingJson<EdgeFinderRollout>(CONFLUENCE_ROLLOUT_KEY);
  if (dbVal && typeof dbVal.visibleToAdmins === 'boolean' && typeof dbVal.visibleToTraders === 'boolean') {
    return dbVal;
  }
  const disk = readDiskSnapshot();
  if (disk.confluenceAnalyticsRollout) {
    return disk.confluenceAnalyticsRollout;
  }
  return {
    visibleToAdmins: false,
    visibleToTraders: false,
    updatedAt: new Date().toISOString(),
    updatedBy: 'system'
  };
}

export async function updateConfluenceAnalyticsRollout(
  patch: Partial<Pick<EdgeFinderRollout, 'visibleToAdmins' | 'visibleToTraders'>>,
  updatedBy = 'super_admin'
): Promise<EdgeFinderRollout> {
  const current = await getConfluenceAnalyticsRollout();
  const next: EdgeFinderRollout = {
    visibleToAdmins: typeof patch.visibleToAdmins === 'boolean' ? patch.visibleToAdmins : current.visibleToAdmins,
    visibleToTraders: typeof patch.visibleToTraders === 'boolean' ? patch.visibleToTraders : current.visibleToTraders,
    updatedAt: new Date().toISOString(),
    updatedBy
  };
  await writeSettingJson(CONFLUENCE_ROLLOUT_KEY, next);
  writeDiskSnapshot({ confluenceAnalyticsRollout: next });
  return next;
}

export function canRoleAccessConfluenceAnalytics(
  role: string | undefined | null,
  rollout: EdgeFinderRollout
): boolean {
  const normalized = (role || '').toLowerCase().trim();
  if (normalized === 'super_admin') return true;
  if (normalized === 'admin') return rollout.visibleToAdmins === true;
  if (normalized === 'trader') return rollout.visibleToTraders === true;
  return false;
}

const BACKEND_SYMBOL_ALIAS_MAP: Record<string, string> = {
  EURUSD: 'EUR/USD', GBPUSD: 'GBP/USD', USDJPY: 'USD/JPY', AUDUSD: 'AUD/USD',
  USDCAD: 'USD/CAD', USDCHF: 'USD/CHF', NZDUSD: 'NZD/USD', EURGBP: 'EUR/GBP',
  EURJPY: 'EUR/JPY', EURAUD: 'EUR/AUD', EURCAD: 'EUR/CAD', EURCHF: 'EUR/CHF',
  EURNZD: 'EUR/NZD', GBPJPY: 'GBP/JPY', GBPAUD: 'GBP/AUD', GBPCAD: 'GBP/CAD',
  GBPCHF: 'GBP/CHF', GBPNZD: 'GBP/NZD', AUDJPY: 'AUD/JPY', AUDCAD: 'AUD/CAD',
  AUDCHF: 'AUD/CHF', AUDNZD: 'AUD/NZD', CADJPY: 'CAD/JPY', CADCHF: 'CAD/CHF',
  CHFJPY: 'CHF/JPY', NZDJPY: 'NZD/JPY', NZDCAD: 'NZD/CAD', NZDCHF: 'NZD/CHF',
  ES: 'ES', 'ES=F': 'ES', 'ES1!': 'ES', MES: 'ES', 'MES1!': 'ES', SPX: 'ES', US500: 'ES',
  NQ: 'NQ', 'NQ=F': 'NQ', 'NQ1!': 'NQ', MNQ: 'NQ', 'MNQ1!': 'NQ', NDX: 'NQ', NAS100: 'NQ', US100: 'NQ',
  YM: 'YM', 'YM=F': 'YM', 'YM1!': 'YM', MYM: 'YM', US30: 'YM', DJ30: 'YM',
  RTY: 'RTY', 'RTY=F': 'RTY', 'RTY1!': 'RTY', M2K: 'RTY', US2000: 'RTY',
  NKD: 'NKD', 'NKD=F': 'NKD', JP225: 'NKD', NIKKEI: 'NKD',
  GC: 'GC', 'GC=F': 'GC', 'GC1!': 'GC', MGC: 'GC', XAUUSD: 'GC', 'XAU/USD': 'GC', GOLD: 'GC',
  SI: 'SI', 'SI=F': 'SI', 'SI1!': 'SI', SIL: 'SI', XAGUSD: 'SI', 'XAG/USD': 'SI', SILVER: 'SI',
  HG: 'HG', 'HG=F': 'HG', COPPER: 'HG', PL: 'PL', 'PL=F': 'PL', PA: 'PA', 'PA=F': 'PA',
  CL: 'CL', 'CL=F': 'CL', 'CL1!': 'CL', MCL: 'CL', USOIL: 'CL', WTI: 'CL',
  BZ: 'BZ', 'BZ=F': 'BZ', UKOIL: 'BZ', BRENT: 'BZ',
  NG: 'NG', 'NG=F': 'NG', NATGAS: 'NG',
  ZN: 'ZN', 'ZN=F': 'ZN', US10Y: 'ZN', ZB: 'ZB', 'ZB=F': 'ZB', US30Y: 'ZB',
  ZC: 'ZC', 'ZC=F': 'ZC', ZS: 'ZS', 'ZS=F': 'ZS', ZW: 'ZW', 'ZW=F': 'ZW',
  BTC: 'BTC/USD', BTCUSD: 'BTC/USD', 'BTC-USD': 'BTC/USD', 'BTC/USD': 'BTC/USD',
  ETH: 'ETH/USD', ETHUSD: 'ETH/USD', 'ETH-USD': 'ETH/USD', 'ETH/USD': 'ETH/USD',
  SOL: 'SOL/USD', SOLUSD: 'SOL/USD', 'SOL-USD': 'SOL/USD', 'SOL/USD': 'SOL/USD',
  XRP: 'XRP/USD', XRPUSD: 'XRP/USD', 'XRP-USD': 'XRP/USD', 'XRP/USD': 'XRP/USD'
};

export function resolveEdgeFinderInstrument(rawInstrument: string): string {
  const clean = (rawInstrument || '').trim().toUpperCase().replace(/=X$/i, '');
  if (!clean) return 'EUR/USD';
  if (BACKEND_SYMBOL_ALIAS_MAP[clean]) return BACKEND_SYMBOL_ALIAS_MAP[clean];
  if (clean.includes('/')) return clean;
  if (/^[A-Z]{6}$/.test(clean)) return `${clean.slice(0, 3)}/${clean.slice(3, 6)}`;
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

function computeEconomicScore(econ: MacroEconomyData): number {
  let raw = 0;
  if (econ.rate >= 3.75) raw += 2.0;
  else if (econ.rate >= 2.5) raw += 0.5;
  else if (econ.rate <= 1.25) raw -= 1.5;

  if (econ.stance === 'Hawkish') raw += 1.5;
  else if (econ.stance === 'Dovish') raw -= 1.5;

  if (econ.gdpQoQ >= 2.0) raw += 2.0;
  else if (econ.gdpQoQ >= 1.0) raw += 0.75;
  else if (econ.gdpQoQ < 0.5) raw -= 1.5;

  if (econ.coreCpiYoY >= 3.0) raw += 1.25;
  else if (econ.coreCpiYoY <= 1.5) raw -= 1.25;

  const avgPmi = (econ.pmiManufacturing + econ.pmiServices) / 2;
  if (avgPmi >= 52.0) raw += 1.5;
  else if (avgPmi >= 50.0) raw += 0.5;
  else raw -= 1.5;

  if (econ.unemploymentRate <= 4.3) raw += 1.0;
  else if (econ.unemploymentRate >= 5.8) raw -= 1.25;

  if (econ.retailSalesMoM >= 0.3) raw += 0.75;
  else if (econ.retailSalesMoM < 0) raw -= 0.75;

  raw += clamp(econ.surpriseScore, -2, 2);
  return roundTo(clamp(raw, -10, 10), 1);
}

function parseNumericEventVal(raw?: string): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[^0-9.\-+]/g, '');
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function computeCalendarSurpriseMap(events: EconomicEvent[]): Record<EconomyCode, number> {
  const map: Record<EconomyCode, number> = {
    USD: 0, EUR: 0, GBP: 0, JPY: 0, AUD: 0, CAD: 0, CHF: 0, NZD: 0
  };
  for (const evt of events) {
    const cur = (evt.currency || '').toUpperCase() as EconomyCode;
    if (!(cur in map)) continue;
    const actual = parseNumericEventVal(evt.actual);
    const forecast = parseNumericEventVal(evt.forecast);
    if (actual === null || forecast === null) continue;
    const isUnemployment = evt.title.toLowerCase().includes('unemployment') || evt.title.toLowerCase().includes('claims');
    const diff = actual - forecast;
    if (Math.abs(diff) < 1e-6) continue;
    const weight = evt.impact === 'high' ? 0.45 : evt.impact === 'medium' ? 0.25 : 0.1;
    const signed = isUnemployment ? (diff < 0 ? weight : -weight) : (diff > 0 ? weight : -weight);
    map[cur] = clamp(map[cur] + signed, -2.5, 2.5);
  }
  return map;
}

function extractCalendarLatestIndicators(events: EconomicEvent[]): Partial<Record<EconomyCode, Partial<MacroEconomyData>>> {
  const out: Partial<Record<EconomyCode, Partial<MacroEconomyData>>> = {};
  const sortedDesc = [...events].sort((a, b) =>
    new Date(b.eventTime).getTime() - new Date(a.eventTime).getTime()
  );

  for (const evt of sortedDesc) {
    const cur = (evt.currency || '').toUpperCase() as EconomyCode;
    if (!G8_METADATA.some((m) => m.currency === cur)) continue;
    const rawStr = evt.actual || evt.previous;
    if (!rawStr || /K|M|B/i.test(rawStr)) continue;
    const val = parseNumericEventVal(rawStr);
    if (val === null) continue;

    if (!out[cur]) out[cur] = {};
    const target = out[cur]!;
    const title = evt.title.toLowerCase();

    if (target.coreCpiYoY === undefined && /core cpi y\/y|core pce.*y\/y|trimmed mean cpi/i.test(title) && val > -5 && val < 20) {
      target.coreCpiYoY = roundTo(val, 2);
    } else if (target.cpiYoY === undefined && /\bcpi y\/y\b|final cpi y\/y/i.test(title) && !title.includes('core') && val > -5 && val < 25) {
      target.cpiYoY = roundTo(val, 2);
    } else if (target.unemploymentRate === undefined && /unemployment rate/i.test(title) && val >= 1 && val <= 20) {
      target.unemploymentRate = roundTo(val, 2);
    } else if (target.retailSalesMoM === undefined && /retail sales m\/m/i.test(title) && !title.includes('core') && val > -15 && val < 15) {
      target.retailSalesMoM = roundTo(val, 2);
    } else if (target.gdpQoQ === undefined && /\bgdp (q\/q|y\/y)/i.test(title) && val > -15 && val < 20) {
      target.gdpQoQ = roundTo(val, 2);
    } else if (target.pmiManufacturing === undefined && /manufacturing pmi/i.test(title) && val >= 25 && val <= 75) {
      target.pmiManufacturing = roundTo(val, 1);
    } else if (target.pmiServices === undefined && /services pmi/i.test(title) && val >= 25 && val <= 75) {
      target.pmiServices = roundTo(val, 1);
    }
  }
  return out;
}

async function fetchLiveExternalMacro(): Promise<CachedLiveMacro> {
  if (macroExternalCache && Date.now() - macroExternalCache.fetchedAt < MACRO_TTL_MS) {
    return macroExternalCache;
  }

  const bisRates: CachedLiveMacro['bisRates'] = {};
  const wbIndicators: CachedLiveMacro['wbIndicators'] = {};

  const bisToCur: Record<string, EconomyCode> = {
    US: 'USD', XM: 'EUR', GB: 'GBP', JP: 'JPY', AU: 'AUD', CA: 'CAD', CH: 'CHF', NZ: 'NZD'
  };
  const wbToCur: Record<string, EconomyCode> = {
    USA: 'USD', EMU: 'EUR', GBR: 'GBP', JPN: 'JPY', AUS: 'AUD', CAN: 'CAD', CHE: 'CHF', NZL: 'NZD'
  };
  const imfToCur: Record<string, EconomyCode> = {
    USA: 'USD', DEU: 'EUR', GBR: 'GBP', JPN: 'JPY', AUS: 'AUD', CAN: 'CAD', CHE: 'CHF', NZL: 'NZD'
  };

  const [bisResult, wbResult, imfResult] = await Promise.allSettled([
    fetch(BIS_CBPOL_ENDPOINT, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(7000)
    }).then((r) => (r.ok ? (r.json() as Promise<any>) : null)),
    fetch(WB_MACRO_ENDPOINT, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(7000)
    }).then((r) => (r.ok ? (r.json() as Promise<any>) : null)),
    fetch(IMF_MACRO_ENDPOINT, {
      headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (compatible; MannaEdgeFinder/2.0)' },
      signal: AbortSignal.timeout(7000)
    }).then((r) => (r.ok ? (r.json() as Promise<any>) : null))
  ]);

  if (bisResult.status === 'fulfilled' && bisResult.value?.data?.dataSets?.[0]?.series) {
    const ds = bisResult.value.data.dataSets[0].series as Record<string, { observations: Record<string, any[]> }>;
    const seriesDims = (bisResult.value.data.structure?.dimensions?.series || []) as Array<{
      id: string;
      values: Array<{ id: string }>;
    }>;
    const obsTimeValues = (bisResult.value.data.structure?.dimensions?.observation?.[0]?.values || []) as Array<{
      id: string;
    }>;
    const areaDimIdx = seriesDims.findIndex((d) => d.id === 'REF_AREA');
    const areaDim = seriesDims[areaDimIdx];

    if (areaDimIdx >= 0 && areaDim) {
      for (const [seriesKey, val] of Object.entries(ds)) {
        const parts = seriesKey.split(':').map(Number);
        const refId = areaDim.values[parts[areaDimIdx]]?.id;
        const cur = bisToCur[refId];
        if (!cur) continue;
        const sortedObs = Object.entries(val.observations || {})
          .sort((a, b) => Number(a[0]) - Number(b[0]))
          .map(([obsIdx, obs]) => ({
            date: obsTimeValues[Number(obsIdx)]?.id || obsIdx,
            value: roundTo(Number(obs[0]), 3)
          }))
          .filter((pt) => Number.isFinite(pt.value));
        if (sortedObs.length > 0) {
          const rate = sortedObs[sortedObs.length - 1].value;
          const prevRate = sortedObs.length >= 2 ? sortedObs[sortedObs.length - 2].value : rate;
          bisRates[cur] = { rate, prevRate, history: sortedObs };
        }
      }
    }
  }

  const ensureWbBucket = (cur: EconomyCode) => {
    if (!wbIndicators[cur]) {
      wbIndicators[cur] = {
        history: { rates: [], gdp: [], cpi: [], unemployment: [] }
      };
    }
    return wbIndicators[cur]!;
  };

  if (imfResult.status === 'fulfilled' && imfResult.value?.values) {
    const vals = imfResult.value.values as Record<string, Record<string, Record<string, number>>>;
    const targetYears = ['2020', '2021', '2022', '2023', '2024', '2025', '2026'];
    const mapSeries = (
      indCode: string,
      targetField: 'gdp' | 'cpi' | 'unemployment',
      latestField: 'gdpQoQ' | 'cpiYoY' | 'unemploymentRate'
    ) => {
      const indData = vals[indCode] || {};
      for (const [countryCode, cur] of Object.entries(imfToCur)) {
        const seriesObj = indData[countryCode];
        if (!seriesObj) continue;
        const bucket = ensureWbBucket(cur);
        const pts: Array<{ year: string; value: number }> = [];
        for (const yr of targetYears) {
          const num = Number(seriesObj[yr]);
          if (Number.isFinite(num)) {
            pts.push({ year: yr, value: roundTo(num, 2) });
          }
        }
        if (pts.length > 0) {
          bucket.history[targetField] = pts;
          bucket[latestField] = pts[pts.length - 1].value;
        }
      }
    };
    mapSeries('NGDP_RPCH', 'gdp', 'gdpQoQ');
    mapSeries('PCPIPCH', 'cpi', 'cpiYoY');
    mapSeries('LUR', 'unemployment', 'unemploymentRate');
  }

  if (wbResult.status === 'fulfilled' && Array.isArray(wbResult.value) && Array.isArray(wbResult.value[1])) {
    for (const row of wbResult.value[1] as Array<any>) {
      const cur = wbToCur[row?.countryiso3code];
      const indId = row?.indicator?.id;
      const year = String(row?.date || '');
      const value = Number(row?.value);
      if (!cur || !indId || !Number.isFinite(value)) continue;
      const bucket = ensureWbBucket(cur);
      const rounded = roundTo(value, 2);
      if (indId === 'FP.CPI.TOTL.ZG') {
        bucket.cpiYoY = rounded;
        if (year && bucket.history.cpi.length === 0) bucket.history.cpi.push({ year, value: rounded });
      } else if (indId === 'SL.UEM.TOTL.ZS') {
        bucket.unemploymentRate = rounded;
        if (year && bucket.history.unemployment.length === 0) bucket.history.unemployment.push({ year, value: rounded });
      } else if (indId === 'NY.GDP.MKTP.KD.ZG') {
        bucket.gdpQoQ = rounded;
        if (year && bucket.history.gdp.length === 0) bucket.history.gdp.push({ year, value: rounded });
      }
    }
  }

  const hasBis = Object.keys(bisRates).length >= 6;
  const hasWb = Object.keys(wbIndicators).length >= 6;

  const result: CachedLiveMacro = {
    fetchedAt: Date.now(),
    source: hasBis && hasWb ? 'LIVE_BIS_WORLDBANK' : 'BASELINE',
    bisRates,
    wbIndicators
  };

  if (hasBis || hasWb) {
    macroExternalCache = result;
  }
  return result;
}

function computeRateProbabilities(econ: {
  rate: number;
  prevRate: number;
  cpiYoY: number;
  coreCpiYoY: number;
  gdpQoQ: number;
  unemploymentRate: number;
  surpriseScore: number;
  rateExpectation: 'Hike' | 'Hold' | 'Cut';
}): MacroEconomyData['rateProbabilities'] {
  const rateDelta = econ.rate - econ.prevRate;
  const inflationGap = econ.coreCpiYoY - 2.2;
  const realRate = econ.rate - econ.cpiYoY;
  const pressure =
    inflationGap * 1.15 +
    (econ.gdpQoQ - 1.5) * 0.5 +
    rateDelta * 2.2 -
    (econ.unemploymentRate - 4.4) * 0.7 -
    (realRate - 1.2) * 0.45 +
    econ.surpriseScore * 0.4 +
    (econ.rateExpectation === 'Hike' ? 0.8 : econ.rateExpectation === 'Cut' ? -0.8 : 0);

  const wHike = Math.exp(clamp(pressure - 0.65, -4, 4));
  const wHold = Math.exp(clamp(1.25 - Math.abs(pressure) * 0.85, -3, 3.5));
  const wCut = Math.exp(clamp(-pressure - 0.65, -4, 4));
  const sum = wHike + wHold + wCut;

  const hikePct = Math.round((wHike / sum) * 100);
  const cutPct = Math.round((wCut / sum) * 100);
  const holdPct = Math.max(0, 100 - hikePct - cutPct);
  const impliedAction: 'Hike' | 'Hold' | 'Cut' =
    hikePct > holdPct && hikePct > cutPct ? 'Hike' : cutPct > holdPct && cutPct > hikePct ? 'Cut' : 'Hold';

  return { hikePct, holdPct, cutPct, impliedAction };
}

export async function getMacroEconomies(
  events: EconomicEvent[] = []
): Promise<{ economies: MacroEconomyData[]; macroSource: 'LIVE_BIS_WORLDBANK' | 'BASELINE' }> {
  const [liveExt, overrides] = await Promise.all([
    fetchLiveExternalMacro(),
    readSettingJson<Partial<Record<EconomyCode, Partial<MacroEconomyData>>>>(MACRO_OVERRIDES_KEY).then(
      (db) => db || readDiskSnapshot().macroOverrides || {}
    )
  ]);

  const surprises = computeCalendarSurpriseMap(events);
  const calLatest = extractCalendarLatestIndicators(events);

  const economies = G8_METADATA.map((meta) => {
    const bis = liveExt.bisRates[meta.currency];
    const wb = liveExt.wbIndicators[meta.currency] || { history: { rates: [], gdp: [], cpi: [], unemployment: [] } };
    const cal = calLatest[meta.currency] || {};
    const ov = overrides[meta.currency] || {};

    const rate = bis?.rate ?? 3.0;
    const prevRate = bis?.prevRate ?? rate;
    const rateDelta = rate - prevRate;

    const derivedExpectation: MacroEconomyData['rateExpectation'] =
      rateDelta > 0.05 ? 'Hike' : rateDelta < -0.05 ? 'Cut' : 'Hold';

    const derivedStance: MacroEconomyData['stance'] =
      rateDelta > 0.05 ? 'Hawkish' :
      rateDelta < -0.05 ? 'Dovish' :
      rate >= 3.6 ? 'Hawkish' :
      rate <= 1.5 ? 'Dovish' : 'Neutral';

    const cpiYoY = cal.cpiYoY ?? wb.cpiYoY ?? 2.2;
    const coreCpiYoY = cal.coreCpiYoY ?? roundTo(Math.max(cpiYoY - 0.15, 0.5), 2);
    const gdpQoQ = cal.gdpQoQ ?? wb.gdpQoQ ?? 1.5;
    const unemploymentRate = cal.unemploymentRate ?? wb.unemploymentRate ?? 4.5;
    const retailSalesMoM = cal.retailSalesMoM ?? 0.2;
    const pmiManufacturing = cal.pmiManufacturing ?? (gdpQoQ >= 2.0 ? 51.2 : gdpQoQ < 1.0 ? 48.2 : 50.0);
    const pmiServices = cal.pmiServices ?? (gdpQoQ >= 2.0 ? 53.5 : gdpQoQ < 1.0 ? 49.5 : 51.2);
    const surpriseScore = roundTo(clamp((ov.surpriseScore ?? 0) + (surprises[meta.currency] || 0) * 0.5, -2.5, 2.5), 2);

    const history: MacroEconomyData['history'] = {
      rates: bis?.history || [],
      gdp: wb.history?.gdp || [],
      cpi: wb.history?.cpi || [],
      unemployment: wb.history?.unemployment || []
    };

    const merged: MacroEconomyData = {
      currency: meta.currency,
      country: meta.country,
      centralBank: meta.centralBank,
      rate,
      nextMeeting: meta.nextMeeting,
      rateExpectation: derivedExpectation,
      stance: derivedStance,
      gdpQoQ,
      cpiYoY,
      coreCpiYoY,
      pmiManufacturing,
      pmiServices,
      unemploymentRate,
      retailSalesMoM,
      economicScore: 0,
      surpriseScore,
      rateProbabilities: { hikePct: 10, holdPct: 80, cutPct: 10, impliedAction: derivedExpectation },
      history,
      notes: `Live BIS policy rate (${rate.toFixed(2)}%, prev ${prevRate.toFixed(2)}%), World Bank WDI & ForexFactory NFS releases.`,
      updatedAt: new Date(liveExt.fetchedAt).toISOString(),
      ...ov
    };
    merged.currency = meta.currency;
    merged.history = history;
    merged.rateProbabilities = computeRateProbabilities({
      rate: merged.rate,
      prevRate,
      cpiYoY: merged.cpiYoY,
      coreCpiYoY: merged.coreCpiYoY,
      gdpQoQ: merged.gdpQoQ,
      unemploymentRate: merged.unemploymentRate,
      surpriseScore: merged.surpriseScore,
      rateExpectation: merged.rateExpectation
    });
    merged.economicScore = computeEconomicScore(merged);
    return merged;
  });

  return { economies, macroSource: liveExt.source };
}

export async function updateMacroEconomy(
  currency: EconomyCode,
  updates: Partial<MacroEconomyData>
): Promise<MacroEconomyData[]> {
  const existing =
    (await readSettingJson<Partial<Record<EconomyCode, Partial<MacroEconomyData>>>>(MACRO_OVERRIDES_KEY)) ||
    readDiskSnapshot().macroOverrides ||
    {};
  const sanitized: Partial<MacroEconomyData> = {};
  if (typeof updates.rate === 'number' && Number.isFinite(updates.rate)) sanitized.rate = updates.rate;
  if (typeof updates.gdpQoQ === 'number' && Number.isFinite(updates.gdpQoQ)) sanitized.gdpQoQ = updates.gdpQoQ;
  if (typeof updates.cpiYoY === 'number' && Number.isFinite(updates.cpiYoY)) sanitized.cpiYoY = updates.cpiYoY;
  if (typeof updates.coreCpiYoY === 'number' && Number.isFinite(updates.coreCpiYoY)) sanitized.coreCpiYoY = updates.coreCpiYoY;
  if (typeof updates.pmiManufacturing === 'number' && Number.isFinite(updates.pmiManufacturing)) sanitized.pmiManufacturing = updates.pmiManufacturing;
  if (typeof updates.pmiServices === 'number' && Number.isFinite(updates.pmiServices)) sanitized.pmiServices = updates.pmiServices;
  if (typeof updates.unemploymentRate === 'number' && Number.isFinite(updates.unemploymentRate)) sanitized.unemploymentRate = updates.unemploymentRate;
  if (typeof updates.retailSalesMoM === 'number' && Number.isFinite(updates.retailSalesMoM)) sanitized.retailSalesMoM = updates.retailSalesMoM;
  if (updates.stance && ['Hawkish', 'Neutral', 'Dovish'].includes(updates.stance)) sanitized.stance = updates.stance;
  if (updates.rateExpectation && ['Hike', 'Hold', 'Cut'].includes(updates.rateExpectation)) sanitized.rateExpectation = updates.rateExpectation;
  if (typeof updates.nextMeeting === 'string') sanitized.nextMeeting = updates.nextMeeting.slice(0, 32);
  if (typeof updates.notes === 'string') sanitized.notes = updates.notes.slice(0, 280);
  sanitized.updatedAt = new Date().toISOString();

  const nextOverrides = {
    ...existing,
    [currency]: {
      ...(existing[currency] || {}),
      ...sanitized
    }
  };
  await writeSettingJson(MACRO_OVERRIDES_KEY, nextOverrides);
  writeDiskSnapshot({ macroOverrides: nextOverrides });
  snapshotCache = null;
  const res = await getMacroEconomies();
  return res.economies;
}

async function fetchLiveCftcCot(): Promise<CachedCotRaw | null> {
  if (cotCache && Date.now() - cotCache.fetchedAt < COT_TTL_MS) {
    return cotCache;
  }
  try {
    const allCodes = Array.from(
      new Set(
        EDGE_FINDER_ASSETS.flatMap((a) =>
          [a.cftcCode, a.baseCftcCode, a.quoteCftcCode].filter((x): x is string => Boolean(x))
        )
      )
    );
    const inClause = allCodes.map((c) => `"${c}"`).join(',');
    const cutoffIso = `${new Date(Date.now() - 380 * 86_400_000).toISOString().slice(0, 10)}T00:00:00.000`;
    const selectFields = [
      'cftc_contract_market_code',
      'report_date_as_yyyy_mm_dd',
      'noncomm_positions_long_all',
      'noncomm_positions_short_all',
      'comm_positions_long_all',
      'comm_positions_short_all',
      'nonrept_positions_long_all',
      'nonrept_positions_short_all',
      'open_interest_all'
    ].join(',');
    const whereClause = `cftc_contract_market_code in(${inClause}) AND report_date_as_yyyy_mm_dd >= "${cutoffIso}"`;
    const url = `${CFTC_ENDPOINT}?$select=${encodeURIComponent(selectFields)}&$where=${encodeURIComponent(whereClause)}&$order=report_date_as_yyyy_mm_dd%20DESC&$limit=4000`;
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(9000)
    });
    if (!res.ok) return null;
    const rows = (await res.json()) as Array<Record<string, string>>;
    if (!Array.isArray(rows) || rows.length === 0) return null;

    const grouped: Record<string, Map<string, CotWeeklyRow>> = {};
    for (const r of rows) {
      const code = (r.cftc_contract_market_code || '').trim();
      const reportDate = (r.report_date_as_yyyy_mm_dd || '').slice(0, 10);
      if (!code || !reportDate) continue;

      const commLong = Number(r.comm_positions_long_all || 0);
      const commShort = Number(r.comm_positions_short_all || 0);
      const parsed: CotWeeklyRow = {
        reportDate,
        noncommLong: Number(r.noncomm_positions_long_all || 0),
        noncommShort: Number(r.noncomm_positions_short_all || 0),
        noncommNet: Number(r.noncomm_positions_long_all || 0) - Number(r.noncomm_positions_short_all || 0),
        commLong,
        commShort,
        commNet: commLong - commShort,
        nonreptLong: Number(r.nonrept_positions_long_all || 0),
        nonreptShort: Number(r.nonrept_positions_short_all || 0),
        openInterest: Number(r.open_interest_all || 0)
      };
      if (!grouped[code]) grouped[code] = new Map<string, CotWeeklyRow>();
      const existing = grouped[code].get(reportDate);
      if (!existing || parsed.openInterest > existing.openInterest) {
        grouped[code].set(reportDate, parsed);
      }
    }

    const byCode: CachedCotRaw['byCode'] = {};
    for (const [code, dateMap] of Object.entries(grouped)) {
      const ascending = Array.from(dateMap.values())
        .sort((a, b) => a.reportDate.localeCompare(b.reportDate))
        .slice(-52);
      if (ascending.length > 0) {
        byCode[code] = ascending;
      }
    }

    if (Object.keys(byCode).length === 0) return null;
    cotCache = { fetchedAt: Date.now(), byCode };
    return cotCache;
  } catch {
    return null;
  }
}

function pairWeeklyCotLegs(
  asset: AssetDefinition,
  liveCot: CachedCotRaw
): CotWeeklyRow[] | null {
  if (asset.baseCftcCode && asset.quoteCftcCode) {
    const baseSeries = liveCot.byCode[asset.baseCftcCode];
    const quoteSeries = liveCot.byCode[asset.quoteCftcCode];
    if (!baseSeries || !quoteSeries || baseSeries.length === 0 || quoteSeries.length === 0) {
      return null;
    }
    const len = Math.min(baseSeries.length, quoteSeries.length);
    const paired: CotWeeklyRow[] = [];
    for (let i = 0; i < len; i++) {
      const b = baseSeries[baseSeries.length - len + i];
      const q = quoteSeries[quoteSeries.length - len + i];
      const noncommLong = b.noncommLong + q.noncommShort;
      const noncommShort = b.noncommShort + q.noncommLong;
      const commLong = b.commLong + q.commShort;
      const commShort = b.commShort + q.commLong;
      paired.push({
        reportDate: b.reportDate >= q.reportDate ? b.reportDate : q.reportDate,
        noncommLong,
        noncommShort,
        noncommNet: noncommLong - noncommShort,
        commLong,
        commShort,
        commNet: commLong - commShort,
        nonreptLong: b.nonreptLong + q.nonreptShort,
        nonreptShort: b.nonreptShort + q.nonreptLong,
        openInterest: b.openInterest + q.openInterest
      });
    }
    return paired;
  }

  const single = liveCot.byCode[asset.cftcCode];
  if (!single || single.length === 0) return null;
  const isUsdBase = asset.baseCurrency === 'USD';
  if (!isUsdBase) return single;

  // Invert IMM foreign currency futures (e.g. JPY/USD -> USD/JPY, CAD/USD -> USD/CAD, CHF/USD -> USD/CHF)
  return single.map((w) => ({
    reportDate: w.reportDate,
    noncommLong: w.noncommShort,
    noncommShort: w.noncommLong,
    noncommNet: -w.noncommNet,
    commLong: w.commShort,
    commShort: w.commLong,
    commNet: -w.commNet,
    nonreptLong: w.nonreptShort,
    nonreptShort: w.nonreptLong,
    openInterest: w.openInterest
  }));
}

function buildCotAndRetailFromLive(
  asset: AssetDefinition,
  liveCot: CachedCotRaw | null
): {
  cot: CotPositioningRecord;
  retailSentiment: RetailSentimentRecord;
  weeklySeries: CotWeeklyRow[];
} {
  const paired = liveCot ? pairWeeklyCotLegs(asset, liveCot) : null;
  if (paired && paired.length > 0) {
    const latest = paired[paired.length - 1];
    const prev = paired.length >= 2 ? paired[paired.length - 2] : latest;

    const cotDenom = Math.max(latest.noncommLong + latest.noncommShort, 1);
    const cotLongPct = roundTo((latest.noncommLong / cotDenom) * 100, 1);
    const cotShortPct = roundTo(100 - cotLongPct, 1);
    const commDenom = Math.max(latest.commLong + latest.commShort, 1);
    const commLongPct = roundTo((latest.commLong / commDenom) * 100, 1);

    // 52-Week Percentile COT Index (0-100%) and 52W Z-Score
    const nets52 = paired.map((w) => w.noncommNet);
    const min52 = Math.min(...nets52);
    const max52 = Math.max(...nets52);
    const cotIndex52w = max52 > min52 ? roundTo(((latest.noncommNet - min52) / (max52 - min52)) * 100, 1) : 50;
    const mean52 = nets52.reduce((s, v) => s + v, 0) / nets52.length;
    const variance52 = nets52.reduce((s, v) => s + (v - mean52) ** 2, 0) / Math.max(nets52.length, 1);
    const std52 = Math.sqrt(variance52);
    const cotZScore52w = std52 > 1e-6 ? roundTo((latest.noncommNet - mean52) / std52, 2) : 0;
    const extremeFlag: CotPositioningRecord['extremeFlag'] =
      cotIndex52w >= 80 || cotZScore52w >= 1.5
        ? 'BULLISH_EXTREME'
        : cotIndex52w <= 20 || cotZScore52w <= -1.5
        ? 'BEARISH_EXTREME'
        : 'NONE';

    const cotScore: -1 | 0 | 1 = cotLongPct >= 55 ? 1 : cotLongPct <= 45 ? -1 : 0;
    const sentimentLabel: CotPositioningRecord['sentimentLabel'] =
      cotLongPct >= 66 ? 'Strongly Bullish' :
      cotLongPct >= 55 ? 'Bullish' :
      cotLongPct <= 34 ? 'Strongly Bearish' :
      cotLongPct <= 45 ? 'Bearish' : 'Neutral';

    const retailDenom = Math.max(latest.nonreptLong + latest.nonreptShort, 1);
    const retailLongPct = roundTo((latest.nonreptLong / retailDenom) * 100, 1);
    const retailShortPct = roundTo(100 - retailLongPct, 1);
    const contrarianBias: RetailSentimentRecord['contrarianBias'] =
      retailLongPct >= 56 ? 'Bearish' : retailShortPct >= 56 ? 'Bullish' : 'Neutral';
    const retailScore: -1 | 0 | 1 =
      contrarianBias === 'Bullish' ? 1 : contrarianBias === 'Bearish' ? -1 : 0;

    return {
      cot: {
        instrument: asset.instrument,
        cftcCode: asset.cftcCode,
        contractName: asset.contractName,
        reportDate: latest.reportDate,
        source: 'CFTC_LIVE',
        nonCommercialLong: latest.noncommLong,
        nonCommercialShort: latest.noncommShort,
        nonCommercialNet: latest.noncommNet,
        commercialLong: latest.commLong,
        commercialShort: latest.commShort,
        commercialNet: latest.commNet,
        commercialLongPct: commLongPct,
        netChangeWoW: latest.noncommNet - prev.noncommNet,
        longPct: cotLongPct,
        shortPct: cotShortPct,
        openInterest: latest.openInterest,
        cotIndex52w,
        cotZScore52w,
        extremeFlag,
        sentimentLabel,
        cotScore,
        history12w: paired.slice(-12).map((w) => {
          const d = Math.max(w.noncommLong + w.noncommShort, 1);
          return {
            date: w.reportDate,
            net: w.noncommNet,
            longPct: roundTo((w.noncommLong / d) * 100, 1)
          };
        })
      },
      retailSentiment: {
        instrument: asset.instrument,
        longPct: retailLongPct,
        shortPct: retailShortPct,
        contrarianBias,
        crowdedWarning: retailLongPct >= 65 || retailShortPct >= 65,
        sentimentScore: retailScore,
        source: 'CFTC Non-Reportable (Small Speculators Live)'
      },
      weeklySeries: paired
    };
  }

  // Emergency zero-data structural fallback if CFTC endpoint is offline
  const today = new Date().toISOString().slice(0, 10);
  return {
    cot: {
      instrument: asset.instrument,
      cftcCode: asset.cftcCode,
      contractName: asset.contractName,
      reportDate: today,
      source: 'INSTITUTIONAL_MODEL',
      nonCommercialLong: 0,
      nonCommercialShort: 0,
      nonCommercialNet: 0,
      commercialLong: 0,
      commercialShort: 0,
      commercialNet: 0,
      commercialLongPct: 50,
      netChangeWoW: 0,
      longPct: 50,
      shortPct: 50,
      openInterest: 0,
      cotIndex52w: 50,
      cotZScore52w: 0,
      extremeFlag: 'NONE',
      sentimentLabel: 'Neutral',
      cotScore: 0,
      history12w: []
    },
    retailSentiment: {
      instrument: asset.instrument,
      longPct: 50,
      shortPct: 50,
      contrarianBias: 'Neutral',
      crowdedWarning: false,
      sentimentScore: 0,
      source: 'CFTC Non-Reportable (Unavailable)'
    },
    weeklySeries: []
  };
}

async function fetchYahooMonthlySeasonality(asset: AssetDefinition): Promise<{ monthlyReturns10Y: number[]; monthlyWinRate10Y: number[] }> {
  const cached = seasonalityCache[asset.instrument];
  if (cached && Date.now() - cached.fetchedAt < SEASONALITY_TTL_MS) {
    return { monthlyReturns10Y: cached.monthlyReturns10Y, monthlyWinRate10Y: cached.monthlyWinRate10Y };
  }

  const yahooSym = YAHOO_SYMBOL_MAP[asset.instrument];
  const sums = new Array<number>(12).fill(0);
  const wins = new Array<number>(12).fill(0);
  const counts = new Array<number>(12).fill(0);

  if (yahooSym) {
    try {
      const start10y = new Date(Date.now() - 10 * 365.25 * 86_400_000);
      const chart = await runYahooLimited(
        () => yahooClient.chart(yahooSym, { period1: start10y, interval: '1mo' }),
        10_000
      );
      const quotes = chart?.quotes || [];
      for (const q of quotes) {
        if (!q || q.open == null || q.close == null || q.open <= 0 || q.close <= 0 || !q.date) continue;
        const m = new Date(q.date).getUTCMonth();
        const retPct = ((q.close - q.open) / q.open) * 100;
        if (!Number.isFinite(retPct)) continue;
        sums[m] += retPct;
        if (q.close > q.open) wins[m] += 1;
        counts[m] += 1;
      }
    } catch {
      // fall through cleanly with whatever buckets resolved
    }
  }

  const monthlyReturns10Y = sums.map((sum, idx) =>
    counts[idx] > 0 ? roundTo(sum / counts[idx], 2) : 0
  );
  const monthlyWinRate10Y = wins.map((w, idx) =>
    counts[idx] > 0 ? Math.round((w / counts[idx]) * 100) : 50
  );

  if (counts.some((c) => c > 0)) {
    seasonalityCache[asset.instrument] = {
      fetchedAt: Date.now(),
      monthlyReturns10Y,
      monthlyWinRate10Y
    };
  }
  return { monthlyReturns10Y, monthlyWinRate10Y };
}

async function fetchYahooIntraday15m(asset: AssetDefinition): Promise<{
  candles15m: Candle[];
  livePrice: number | null;
  isLive: boolean;
}> {
  const cached = intradayMarketCache[asset.instrument];
  if (cached && Date.now() - cached.fetchedAt < INTRADAY_MARKET_TTL_MS) {
    return {
      candles15m: cached.candles,
      livePrice: cached.livePrice,
      isLive: cached.isLive
    };
  }

  const yahooSym = YAHOO_SYMBOL_MAP[asset.instrument];
  if (yahooSym) {
    try {
      const start14d = new Date(Date.now() - 14 * 86_400_000);
      const chart = await runYahooLimited(
        () => yahooClient.chart(yahooSym, { period1: start14d, interval: '15m' }),
        10_000
      );
      const quotes = (chart?.quotes || []).filter(
        (q) => q && q.open != null && q.high != null && q.low != null && q.close != null && q.date
      );
      if (quotes.length >= 20) {
        const candles15m: Candle[] = quotes.map((q) => ({
          open: roundTo(q.open!, asset.decimals),
          high: roundTo(q.high!, asset.decimals),
          low: roundTo(q.low!, asset.decimals),
          close: roundTo(q.close!, asset.decimals),
          volume: q.volume || 0,
          timestamp: new Date(q.date).toISOString()
        }));
        const metaPrice = chart?.meta?.regularMarketPrice;
        const livePrice = typeof metaPrice === 'number' && metaPrice > 0
          ? roundTo(metaPrice, asset.decimals)
          : candles15m[candles15m.length - 1].close;
        intradayMarketCache[asset.instrument] = {
          fetchedAt: Date.now(),
          candles: candles15m,
          livePrice,
          isLive: true
        };
        return { candles15m, livePrice, isLive: true };
      }
    } catch {
      // fall through cleanly to fallback
    }
  }

  return { candles15m: [], livePrice: null, isLive: false };
}

async function fetchAssetMarketData(asset: AssetDefinition): Promise<{
  candles: Candle[];
  candles15m: Candle[];
  livePrice: number | null;
  isLive: boolean;
  monthlyReturns10Y: number[];
  monthlyWinRate10Y: number[];
}> {
  const yahooSym = YAHOO_SYMBOL_MAP[asset.instrument];
  const cachedDaily = dailyMarketCache[asset.instrument];
  const dailyPromise = (async (): Promise<{ candles: Candle[]; livePrice: number | null; isLive: boolean }> => {
    if (cachedDaily && Date.now() - cachedDaily.fetchedAt < DAILY_MARKET_TTL_MS) {
      return {
        candles: cachedDaily.candles,
        livePrice: cachedDaily.livePrice,
        isLive: cachedDaily.isLive
      };
    }

    if (yahooSym) {
      try {
        const start55d = new Date(Date.now() - 60 * 86_400_000);
        const chart = await runYahooLimited(
          () => yahooClient.chart(yahooSym, { period1: start55d, interval: '1d' }),
          10_000
        );
        const quotes = (chart?.quotes || []).filter(
          (q) => q && q.open != null && q.high != null && q.low != null && q.close != null && q.date
        );
        if (quotes.length >= 10) {
          const candles: Candle[] = quotes.map((q) => ({
            open: roundTo(q.open!, asset.decimals),
            high: roundTo(q.high!, asset.decimals),
            low: roundTo(q.low!, asset.decimals),
            close: roundTo(q.close!, asset.decimals),
            volume: q.volume || 0,
            timestamp: new Date(q.date).toISOString()
          }));
          const metaPrice = chart?.meta?.regularMarketPrice;
          const livePrice = typeof metaPrice === 'number' && metaPrice > 0
            ? roundTo(metaPrice, asset.decimals)
            : candles[candles.length - 1].close;
          dailyMarketCache[asset.instrument] = {
            fetchedAt: Date.now(),
            candles,
            livePrice,
            isLive: true
          };
          return { candles, livePrice, isLive: true };
        }
      } catch {
        // try existing provider fallback below
      }
    }

    try {
      const result = await Promise.race([
        Promise.all([
          getLiveCandles(asset.instrument, '1d', 35),
          getLiveCurrentPrice(asset.instrument)
        ]),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 4000))
      ]);
      if (result && Array.isArray(result[0]) && result[0].length >= 10) {
        const candles = result[0];
        const livePrice = result[1] && result[1] > 0 ? roundTo(result[1], asset.decimals) : candles[candles.length - 1].close;
        dailyMarketCache[asset.instrument] = {
          fetchedAt: Date.now(),
          candles,
          livePrice,
          isLive: true
        };
        return { candles, livePrice, isLive: true };
      }
    } catch {
      // no synthetic prices
    }
    return { candles: [], livePrice: null, isLive: false };
  })();

  const [daily, intraday, seasonal] = await Promise.all([
    dailyPromise,
    fetchYahooIntraday15m(asset),
    fetchYahooMonthlySeasonality(asset)
  ]);

  const livePrice = intraday.livePrice ?? daily.livePrice;
  const isLive = (intraday.isLive || daily.isLive) && livePrice !== null;

  return {
    candles: daily.candles,
    candles15m: intraday.candles15m,
    livePrice,
    isLive,
    ...seasonal
  };
}

async function fetchFredSeriesLastTwo(seriesId: string): Promise<{ latest: number | null; prev: number | null; date: string }> {
  try {
    const res = await fetch(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${encodeURIComponent(seriesId)}`, {
      signal: AbortSignal.timeout(6500)
    });
    if (!res.ok) return { latest: null, prev: null, date: '' };
    const text = await res.text();
    const lines = text.trim().split('\n');
    const valid: Array<{ date: string; val: number }> = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const [date, rawVal] = line.split(',');
      if (!rawVal || rawVal === '.') continue;
      const num = Number(rawVal);
      if (Number.isFinite(num)) {
        valid.push({ date, val: num });
      }
    }
    if (valid.length === 0) return { latest: null, prev: null, date: '' };
    const last = valid[valid.length - 1];
    const prev = valid.length >= 2 ? valid[valid.length - 2] : last;
    return { latest: last.val, prev: prev.val, date: last.date };
  } catch {
    return { latest: null, prev: null, date: '' };
  }
}

async function fetchYahooMacroSeries(symbol: string, days = 45): Promise<{
  latest: number | null;
  prevClose: number | null;
  series: Array<{ date: string; close: number }>;
}> {
  try {
    const start = new Date(Date.now() - days * 86_400_000);
    const chart = await runYahooLimited(
      () => yahooClient.chart(symbol, { period1: start, interval: '1d' }),
      10_000
    );
    const quotes = (chart?.quotes || []).filter((q) => q && q.close != null && q.date);
    const series = quotes.map((q) => ({
      date: new Date(q.date).toISOString().slice(0, 10),
      close: Number(q.close)
    }));
    const metaPrice = chart?.meta?.regularMarketPrice;
    const latest =
      typeof metaPrice === 'number' && Number.isFinite(metaPrice) && metaPrice > 0
        ? metaPrice
        : series.length > 0
        ? series[series.length - 1].close
        : null;
    const prevClose = series.length >= 2 ? series[series.length - 2].close : latest;
    return { latest, prevClose, series };
  } catch {
    return { latest: null, prevClose: null, series: [] };
  }
}

async function fetchMacroInternals(): Promise<MacroInternalsData> {
  if (macroInternalsCache && Date.now() - macroInternalsCache.fetchedAt < MACRO_INTERNALS_TTL_MS) {
    return macroInternalsCache.data;
  }

  const [
    irx,
    fvx,
    tnx,
    tyx,
    vixRes,
    dxyRes,
    spxRes,
    w5kRes,
    dgs2,
    dfii10,
    t10y2y,
    payems,
    houst,
    m2sl,
    gdp
  ] = await Promise.all([
    fetchYahooMacroSeries('^IRX', 15),
    fetchYahooMacroSeries('^FVX', 15),
    fetchYahooMacroSeries('^TNX', 15),
    fetchYahooMacroSeries('^TYX', 15),
    fetchYahooMacroSeries('^VIX', 15),
    fetchYahooMacroSeries('DX-Y.NYB', 45),
    fetchYahooMacroSeries('^GSPC', 15),
    fetchYahooMacroSeries('^W5000', 15),
    fetchFredSeriesLastTwo('DGS2'),
    fetchFredSeriesLastTwo('DFII10'),
    fetchFredSeriesLastTwo('T10Y2Y'),
    fetchFredSeriesLastTwo('PAYEMS'),
    fetchFredSeriesLastTwo('HOUST'),
    fetchFredSeriesLastTwo('M2SL'),
    fetchFredSeriesLastTwo('GDP')
  ]);

  const m3 = irx.latest !== null ? roundTo(irx.latest, 2) : 0;
  const y5 = fvx.latest !== null ? roundTo(fvx.latest, 2) : 0;
  const y10 = tnx.latest !== null ? roundTo(tnx.latest, 2) : 0;
  const y30 = tyx.latest !== null ? roundTo(tyx.latest, 2) : 0;
  const y2 = dgs2.latest !== null ? roundTo(dgs2.latest, 2) : y10 > 0 && t10y2y.latest !== null ? roundTo(y10 - t10y2y.latest, 2) : 0;
  const spread10y2y = t10y2y.latest !== null ? roundTo(t10y2y.latest, 2) : roundTo(y10 - y2, 2);
  const spread10y3m = m3 > 0 && y10 > 0 ? roundTo(y10 - m3, 2) : 0;
  const realYield10y = dfii10.latest !== null ? roundTo(dfii10.latest, 2) : 0;
  const curveRegime: MacroInternalsData['yieldCurve']['curveRegime'] =
    spread10y2y < -0.05 || spread10y3m < -0.05
      ? 'Inverted Curve'
      : spread10y2y >= 0.25 && spread10y3m >= 0.15
      ? 'Normal Steepening'
      : 'Flat Curve';

  const vix = vixRes.latest !== null ? roundTo(vixRes.latest, 2) : 0;
  const dxy = dxyRes.latest !== null ? roundTo(dxyRes.latest, 2) : 0;
  const dxyChangePct =
    dxy > 0 && dxyRes.prevClose && dxyRes.prevClose > 0
      ? roundTo(((dxy - dxyRes.prevClose) / dxyRes.prevClose) * 100, 2)
      : 0;
  const sp500Price = spxRes.latest !== null ? roundTo(spxRes.latest, 2) : 0;
  const wilshire5000Price = w5kRes.latest !== null ? roundTo(w5kRes.latest, 1) : 0;
  const nominalGdpBillions = gdp.latest !== null ? roundTo(gdp.latest, 1) : 0;
  const buffettIndicatorPct =
    wilshire5000Price > 0 && nominalGdpBillions > 0
      ? roundTo((wilshire5000Price / nominalGdpBillions) * 100, 1)
      : 0;
  const nfpTotalK = payems.latest !== null ? Math.round(payems.latest) : 0;
  const nfpMonthlyChangeK =
    payems.latest !== null && payems.prev !== null ? Math.round(payems.latest - payems.prev) : 0;
  const housingStartsK = houst.latest !== null ? roundTo(houst.latest, 1) : 0;
  const m2Billions = m2sl.latest !== null ? roundTo(m2sl.latest, 1) : 0;

  const liveFredCount = [dgs2.latest, dfii10.latest, payems.latest, houst.latest, m2sl.latest, gdp.latest].filter(
    (v) => v !== null
  ).length;
  const liveYahooCount = [irx.latest, fvx.latest, tnx.latest, tyx.latest, vixRes.latest, dxyRes.latest].filter(
    (v) => v !== null
  ).length;

  const data: MacroInternalsData = {
    yieldCurve: {
      m3,
      y2,
      y5,
      y10,
      y30,
      spread10y2y,
      spread10y3m,
      realYield10y,
      curveRegime
    },
    vix,
    dxy,
    dxyChangePct,
    sp500Price,
    wilshire5000Price,
    fredUsMacro: {
      nfpTotalK,
      nfpMonthlyChangeK,
      housingStartsK,
      m2Billions,
      nominalGdpBillions,
      buffettIndicatorPct,
      updatedAt: payems.date || gdp.date || new Date().toISOString().slice(0, 10)
    },
    dxySeries30d: dxyRes.series.slice(-30).map((p) => ({ date: p.date, close: roundTo(p.close, 2) })),
    yieldsSource: liveFredCount >= 4 && liveYahooCount >= 4 ? 'LIVE_FRED_YAHOO' : 'PARTIAL'
  };

  if (liveFredCount > 0 || liveYahooCount > 0) {
    macroInternalsCache = { fetchedAt: Date.now(), data };
  }
  return data;
}

const SMART_MONEY_UNIVERSE = ['NVDA', 'AAPL', 'MSFT', 'AMZN', 'TSLA', 'JPM', 'GS', 'XOM', 'NEM', 'FCX', 'COIN', 'MSTR'];

async function fetchSmartMoneyAndTargets(): Promise<SmartMoneyData> {
  if (smartMoneyCache && Date.now() - smartMoneyCache.fetchedAt < SMART_MONEY_TTL_MS) {
    return smartMoneyCache.data;
  }

  const insiders: InsiderTradeItem[] = [];
  const whales: InstitutionalWhaleItem[] = [];
  const bankAndStreetTargets: AnalystTargetItem[] = [];

  await mapWithConcurrency(SMART_MONEY_UNIVERSE, 5, async (ticker) => {
    try {
      const qs: any = await runYahooLimited(
        () =>
          yahooClient.quoteSummary(ticker, {
            modules: ['insiderTransactions', 'institutionOwnership', 'financialData', 'price']
          }),
        10_000
      );
      if (!qs) return;

      const fin = qs.financialData;
      const priceObj = qs.price;
      const curPrice = Number(fin?.currentPrice || priceObj?.regularMarketPrice || 0);
      const targetMean = Number(fin?.targetMeanPrice || 0);
      if (curPrice > 0 && targetMean > 0) {
        const targetLow = Number(fin?.targetLowPrice || targetMean);
        const targetHigh = Number(fin?.targetHighPrice || targetMean);
        bankAndStreetTargets.push({
          ticker,
          name: String(priceObj?.shortName || ticker),
          currentPrice: roundTo(curPrice, 2),
          targetLow: roundTo(targetLow, 2),
          targetMean: roundTo(targetMean, 2),
          targetHigh: roundTo(targetHigh, 2),
          upsidePct: roundTo(((targetMean - curPrice) / curPrice) * 100, 1),
          recommendationKey: String(fin?.recommendationKey || 'hold').replace(/_/g, ' '),
          analystsCount: Number(fin?.numberOfAnalystOpinions || 0)
        });
      }

      const txns: any[] = qs.insiderTransactions?.transactions || [];
      for (const tx of txns.slice(0, 6)) {
        const shares = Number(tx?.shares || 0);
        if (!shares || shares <= 0) continue;
        const text = String(tx?.transactionText || '');
        const lower = text.toLowerCase();
        const direction: InsiderTradeItem['direction'] =
          lower.includes('purchase') || lower.includes('buy') || lower.includes('acquisition')
            ? 'BUY'
            : lower.includes('sale') || lower.includes('sell') || lower.includes('disposition')
            ? 'SELL'
            : 'OTHER';
        const val = Number(tx?.value || 0);
        const dateStr = tx?.startDate ? new Date(tx.startDate).toISOString().slice(0, 10) : '';
        if (!dateStr) continue;
        insiders.push({
          ticker,
          filerName: String(tx?.filerName || 'Corporate Insider'),
          relation: String(tx?.filerRelation || 'Officer / Director'),
          transactionText: text || direction,
          direction,
          shares,
          valueUsd: Number.isFinite(val) ? val : 0,
          date: dateStr
        });
      }

      const instList: any[] = qs.institutionOwnership?.ownershipList || [];
      for (const inst of instList.slice(0, 3)) {
        const pos = Number(inst?.position || 0);
        const val = Number(inst?.value || 0);
        if (!inst?.organization || pos <= 0) continue;
        whales.push({
          ticker,
          holder: String(inst.organization),
          pctHeld: roundTo(Number(inst.pctHeld || 0) * 100, 2),
          position: pos,
          valueUsd: Number.isFinite(val) ? val : 0,
          pctChange: roundTo(Number(inst.pctChange || 0) * 100, 2),
          reportDate: inst.reportDate ? new Date(inst.reportDate).toISOString().slice(0, 10) : ''
        });
      }
    } catch {
      // skip failing symbol cleanly without dropping the batch
    }
  });

  insiders.sort((a, b) => b.date.localeCompare(a.date));
  whales.sort((a, b) => b.valueUsd - a.valueUsd);
  bankAndStreetTargets.sort((a, b) => Math.abs(b.upsidePct) - Math.abs(a.upsidePct));

  const data: SmartMoneyData = {
    insiders: insiders.slice(0, 35),
    whales: whales.slice(0, 24),
    bankAndStreetTargets,
    updatedAt: new Date().toISOString()
  };

  if (bankAndStreetTargets.length > 0 || insiders.length > 0) {
    smartMoneyCache = { fetchedAt: Date.now(), data };
  }
  return data;
}

function calcEma(values: number[], period: number): number {
  if (values.length === 0) return 0;
  const k = 2 / (period + 1);
  let ema = values[0];
  for (let i = 1; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k);
  }
  return ema;
}

function calcRsi(closes: number[], period = 14): number {
  if (closes.length <= period) return 50;
  let gains = 0;
  let losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const delta = closes[i] - closes[i - 1];
    if (delta >= 0) gains += delta;
    else losses += Math.abs(delta);
  }
  if (losses === 0) return 100;
  const rs = gains / losses;
  return roundTo(100 - 100 / (1 + rs), 1);
}

function calcAtr(candles: Candle[], period = 14): number {
  if (candles.length < 2) return 0;
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    const prevClose = candles[i - 1].close;
    trs.push(Math.max(c.high - c.low, Math.abs(c.high - prevClose), Math.abs(c.low - prevClose)));
  }
  const slice = trs.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / Math.max(slice.length, 1);
}

function aggregateCandles(candles: Candle[], groupSize: number): Candle[] {
  if (candles.length === 0 || groupSize <= 1) return candles;
  const result: Candle[] = [];
  for (let i = 0; i < candles.length; i += groupSize) {
    const slice = candles.slice(i, i + groupSize);
    if (slice.length === 0) continue;
    let high = slice[0].high;
    let low = slice[0].low;
    let vol = 0;
    for (const c of slice) {
      if (c.high > high) high = c.high;
      if (c.low < low) low = c.low;
      vol += c.volume || 0;
    }
    result.push({
      open: slice[0].open,
      high,
      low,
      close: slice[slice.length - 1].close,
      volume: vol,
      timestamp: slice[slice.length - 1].timestamp
    });
  }
  return result;
}

function deriveSeasonality(
  asset: AssetDefinition,
  monthlyReturns10Y: number[],
  monthlyWinRate10Y: number[]
): SeasonalityRecord {
  const monthIdx = new Date().getUTCMonth();
  const nextIdx = (monthIdx + 1) % 12;
  const curRet = monthlyReturns10Y[monthIdx] ?? 0;
  const curWin = monthlyWinRate10Y[monthIdx] ?? 50;
  const nextRet = monthlyReturns10Y[nextIdx] ?? 0;
  const seasonalityScore: -1 | 0 | 1 =
    curRet >= 0.35 && curWin >= 55 ? 1 : curRet <= -0.35 && curWin <= 45 ? -1 : 0;
  const seasonalityBias: SeasonalityRecord['seasonalityBias'] =
    seasonalityScore === 1 ? 'Bullish' : seasonalityScore === -1 ? 'Bearish' : 'Neutral';

  return {
    instrument: asset.instrument,
    monthlyReturns10Y,
    monthlyWinRate10Y,
    currentMonthIndex: monthIdx,
    currentMonthAvgReturn: curRet,
    currentMonthWinRate: curWin,
    nextMonthAvgReturn: nextRet,
    seasonalityBias,
    seasonalityScore,
    bestKillzone: asset.bestKillzone,
    killzoneAffinityNotes: asset.killzoneNotes
  };
}

function signalFromDiff(diff: number, threshold: number): -1 | 0 | 1 {
  if (diff >= threshold) return 1;
  if (diff <= -threshold) return -1;
  return 0;
}

function buildMacroTugOfWar(
  asset: AssetDefinition,
  econByCode: Record<EconomyCode, MacroEconomyData>,
  cot: CotPositioningRecord,
  assetTechTrend: 'Bullish' | 'Bearish' | 'Ranging'
): {
  factors: Array<Pick<FactorBreakdownItem, 'key' | 'label' | 'category' | 'signal' | 'weight' | 'detail'>>;
  tugOfWar: AssetEdgeScorecard['tugOfWar'];
} {
  const usd = econByCode.USD;
  if (asset.assetClass === 'forex') {
    const base = econByCode[asset.baseCurrency as EconomyCode];
    const quote = econByCode[asset.quoteCurrency as EconomyCode];

    const rateDiff = base.rate - quote.rate;
    const gdpDiff = base.gdpQoQ - quote.gdpQoQ;
    const cpiDiff = base.coreCpiYoY - quote.coreCpiYoY;
    const empDiff = quote.unemploymentRate - base.unemploymentRate;
    const pmiDiff = ((base.pmiManufacturing + base.pmiServices) / 2) - ((quote.pmiManufacturing + quote.pmiServices) / 2);
    const retailDiff = (base.retailSalesMoM + base.surpriseScore) - (quote.retailSalesMoM + quote.surpriseScore);

    const factors: Array<Pick<FactorBreakdownItem, 'key' | 'label' | 'category' | 'signal' | 'weight' | 'detail'>> = [
      {
        key: 'interestRates',
        label: 'Interest Rate Diff',
        category: 'Fundamental',
        signal: signalFromDiff(rateDiff + (base.stance === 'Hawkish' ? 0.35 : base.stance === 'Dovish' ? -0.35 : 0) - (quote.stance === 'Hawkish' ? 0.35 : quote.stance === 'Dovish' ? -0.35 : 0), 0.45),
        weight: 1.25,
        detail: `${base.currency} ${base.rate.toFixed(2)}% (${base.stance}) vs ${quote.currency} ${quote.rate.toFixed(2)}% (${quote.stance})`
      },
      {
        key: 'gdp',
        label: 'GDP Growth Diff',
        category: 'Fundamental',
        signal: signalFromDiff(gdpDiff, 0.4),
        weight: 0.75,
        detail: `${base.currency} ${base.gdpQoQ.toFixed(1)}% vs ${quote.currency} ${quote.gdpQoQ.toFixed(1)}%`
      },
      {
        key: 'cpi',
        label: 'Inflation / Core CPI',
        category: 'Fundamental',
        signal: signalFromDiff(cpiDiff, 0.35),
        weight: 0.75,
        detail: `${base.currency} ${base.coreCpiYoY.toFixed(1)}% vs ${quote.currency} ${quote.coreCpiYoY.toFixed(1)}%`
      },
      {
        key: 'unemployment',
        label: 'Employment Advantage',
        category: 'Fundamental',
        signal: signalFromDiff(empDiff, 0.5),
        weight: 0.75,
        detail: `${base.currency} ${base.unemploymentRate.toFixed(1)}% vs ${quote.currency} ${quote.unemploymentRate.toFixed(1)}%`
      },
      {
        key: 'pmi',
        label: 'PMI Momentum',
        category: 'Fundamental',
        signal: signalFromDiff(pmiDiff, 1.2),
        weight: 0.75,
        detail: `${base.currency} avg ${((base.pmiManufacturing + base.pmiServices) / 2).toFixed(1)} vs ${quote.currency} avg ${((quote.pmiManufacturing + quote.pmiServices) / 2).toFixed(1)}`
      },
      {
        key: 'retailSales',
        label: 'Retail & News Surprise',
        category: 'Fundamental',
        signal: signalFromDiff(retailDiff, 0.25),
        weight: 0.5,
        detail: `${base.currency} ${base.retailSalesMoM >= 0 ? '+' : ''}${base.retailSalesMoM.toFixed(1)}% vs ${quote.currency} ${quote.retailSalesMoM >= 0 ? '+' : ''}${quote.retailSalesMoM.toFixed(1)}%`
      }
    ];

    const rows: TugOfWarRow[] = [
      {
        metric: 'Policy Rate',
        baseValue: `${base.rate.toFixed(2)}% (${base.rateExpectation})`,
        quoteValue: `${quote.rate.toFixed(2)}% (${quote.rateExpectation})`,
        advantage: rateDiff > 0.25 ? 'BASE' : rateDiff < -0.25 ? 'QUOTE' : 'EVEN'
      },
      {
        metric: 'GDP Growth',
        baseValue: `${base.gdpQoQ.toFixed(1)}%`,
        quoteValue: `${quote.gdpQoQ.toFixed(1)}%`,
        advantage: gdpDiff > 0.3 ? 'BASE' : gdpDiff < -0.3 ? 'QUOTE' : 'EVEN'
      },
      {
        metric: 'Core CPI YoY',
        baseValue: `${base.coreCpiYoY.toFixed(1)}%`,
        quoteValue: `${quote.coreCpiYoY.toFixed(1)}%`,
        advantage: cpiDiff > 0.3 ? 'BASE' : cpiDiff < -0.3 ? 'QUOTE' : 'EVEN'
      },
      {
        metric: 'Unemployment',
        baseValue: `${base.unemploymentRate.toFixed(1)}%`,
        quoteValue: `${quote.unemploymentRate.toFixed(1)}%`,
        advantage: empDiff > 0.4 ? 'BASE' : empDiff < -0.4 ? 'QUOTE' : 'EVEN'
      },
      {
        metric: 'Macro Economy Score',
        baseValue: `${base.economicScore >= 0 ? '+' : ''}${base.economicScore.toFixed(1)}`,
        quoteValue: `${quote.economicScore >= 0 ? '+' : ''}${quote.economicScore.toFixed(1)}`,
        advantage: base.economicScore - quote.economicScore > 0.5 ? 'BASE' : quote.economicScore - base.economicScore > 0.5 ? 'QUOTE' : 'EVEN'
      },
      {
        metric: 'COT Smart Flow',
        baseValue: `${cot.longPct.toFixed(1)}% Long`,
        quoteValue: `${cot.shortPct.toFixed(1)}% Short`,
        advantage: cot.cotScore > 0 ? 'BASE' : cot.cotScore < 0 ? 'QUOTE' : 'EVEN'
      }
    ];

    return {
      factors,
      tugOfWar: { baseLabel: base.currency, quoteLabel: quote.currency, rows }
    };
  }

  const isMetal = asset.category === 'Metals';
  const isEnergy = asset.category === 'Energy';
  const isAgri = asset.category === 'Agriculture';
  const isRates = asset.category === 'Rates';
  const isTechOrIndex = asset.category === 'Equity Index';
  const isCrypto = asset.category === 'Crypto';

  const rateSignal: -1 | 0 | 1 =
    isMetal || isRates || isAgri ? (usd.stance === 'Dovish' || usd.rateExpectation === 'Cut' ? 1 : usd.rate >= 4.25 ? -1 : 0) :
    isTechOrIndex || isCrypto ? (usd.rateExpectation === 'Cut' ? 1 : usd.stance === 'Hawkish' && usd.rate >= 4.5 ? -1 : 0) :
    usd.stance === 'Dovish' ? 1 : 0;

  const gdpSignal: -1 | 0 | 1 =
    isRates ? (usd.gdpQoQ >= 2.3 ? -1 : 1) :
    usd.gdpQoQ >= 1.8 ? 1 : usd.gdpQoQ < 0.8 ? -1 : 0;

  const cpiSignal: -1 | 0 | 1 =
    isMetal || isEnergy || isAgri || isCrypto ? (usd.coreCpiYoY >= 2.6 ? 1 : -1) :
    isRates ? (usd.coreCpiYoY >= 2.8 ? -1 : 1) :
    usd.coreCpiYoY <= 2.7 ? 1 : -1;

  const empSignal: -1 | 0 | 1 =
    isRates ? (usd.unemploymentRate >= 4.5 ? 1 : -1) :
    usd.unemploymentRate <= 4.4 ? 1 : -1;

  const pmiComposite = (usd.pmiManufacturing + usd.pmiServices) / 2;
  const pmiSignal: -1 | 0 | 1 =
    isRates ? (pmiComposite < 49.5 ? 1 : -1) :
    pmiComposite >= 50.8 ? 1 : pmiComposite < 49.0 ? -1 : 0;

  const retailSignal: -1 | 0 | 1 =
    isRates ? (usd.retailSalesMoM < 0 ? 1 : -1) :
    usd.retailSalesMoM + usd.surpriseScore >= 0.3 ? 1 : usd.retailSalesMoM < 0 ? -1 : 0;

  const factors: Array<Pick<FactorBreakdownItem, 'key' | 'label' | 'category' | 'signal' | 'weight' | 'detail'>> = [
    {
      key: 'interestRates',
      label: isCrypto ? 'USD Liquidity & Fed Policy' : 'Real Yield / Fed Policy',
      category: 'Fundamental',
      signal: rateSignal,
      weight: 1.25,
      detail: `Fed Funds ${usd.rate.toFixed(2)}% (${usd.stance} · Next: ${usd.rateExpectation})`
    },
    {
      key: 'gdp',
      label: 'US Growth Backdrop',
      category: 'Fundamental',
      signal: gdpSignal,
      weight: 0.75,
      detail: `US GDP Growth ${usd.gdpQoQ.toFixed(1)}% (${isRates ? 'Bond inverse' : 'Demand / Risk sensitivity'})`
    },
    {
      key: 'cpi',
      label: 'Inflation Regime',
      category: 'Fundamental',
      signal: cpiSignal,
      weight: 0.75,
      detail: `US Core CPI ${usd.coreCpiYoY.toFixed(1)}% (${isMetal || isEnergy || isAgri || isCrypto ? 'Hard/Monetary hedge' : isRates ? 'Duration pressure' : 'Multiple pressure'})`
    },
    {
      key: 'unemployment',
      label: 'US Labor Market',
      category: 'Fundamental',
      signal: empSignal,
      weight: 0.75,
      detail: `US Unemployment ${usd.unemploymentRate.toFixed(1)}%`
    },
    {
      key: 'pmi',
      label: 'US Activity / PMI',
      category: 'Fundamental',
      signal: pmiSignal,
      weight: 0.75,
      detail: `Mfg ${usd.pmiManufacturing.toFixed(1)} · Svc ${usd.pmiServices.toFixed(1)}`
    },
    {
      key: 'retailSales',
      label: 'Consumer & Macro Surprise',
      category: 'Fundamental',
      signal: retailSignal,
      weight: 0.5,
      detail: `US Retail ${usd.retailSalesMoM >= 0 ? '+' : ''}${usd.retailSalesMoM.toFixed(1)}% · Surprise ${usd.surpriseScore >= 0 ? '+' : ''}${usd.surpriseScore.toFixed(2)}`
    }
  ];

  const rows: TugOfWarRow[] = [
    {
      metric: 'Fed Liquidity Stance',
      baseValue: assetTechTrend,
      quoteValue: `${usd.rate.toFixed(2)}% (${usd.stance})`,
      advantage: rateSignal > 0 ? 'BASE' : rateSignal < 0 ? 'QUOTE' : 'EVEN'
    },
    {
      metric: 'Growth / Yield Impulse',
      baseValue: `${asset.baseCurrency} Beta`,
      quoteValue: `GDP ${usd.gdpQoQ.toFixed(1)}%`,
      advantage: gdpSignal > 0 ? 'BASE' : gdpSignal < 0 ? 'QUOTE' : 'EVEN'
    },
    {
      metric: 'Inflation Hedging',
      baseValue: `${asset.category}`,
      quoteValue: `Core CPI ${usd.coreCpiYoY.toFixed(1)}%`,
      advantage: cpiSignal > 0 ? 'BASE' : cpiSignal < 0 ? 'QUOTE' : 'EVEN'
    },
    {
      metric: 'Activity Cycle',
      baseValue: `${pmiComposite.toFixed(1)} Avg PMI`,
      quoteValue: `Unemp ${usd.unemploymentRate.toFixed(1)}%`,
      advantage: pmiSignal > 0 ? 'BASE' : pmiSignal < 0 ? 'QUOTE' : 'EVEN'
    },
    {
      metric: 'COT Managed Money',
      baseValue: `${cot.longPct.toFixed(1)}% Long`,
      quoteValue: `${cot.shortPct.toFixed(1)}% Short`,
      advantage: cot.cotScore > 0 ? 'BASE' : cot.cotScore < 0 ? 'QUOTE' : 'EVEN'
    }
  ];

  return {
    factors,
    tugOfWar: { baseLabel: asset.baseCurrency, quoteLabel: 'USD Regime', rows }
  };
}

function classifyBiasLabel(score: number): EdgeBiasLabel {
  if (score >= 5.0) return 'Strong Buy';
  if (score >= 2.0) return 'Buy';
  if (score <= -5.0) return 'Strong Sell';
  if (score <= -2.0) return 'Sell';
  return 'Neutral';
}

function computeKillzoneAlignment(
  instrument: string,
  setups: EdgeSetup[],
  coreBiasScore: number
): { signal: -1 | 0 | 1; killzoneAlignment: KillzoneAlignment } {
  const normalizedTarget = instrument.toUpperCase();
  const matched = setups.filter((s) => (s.instrument || '').toUpperCase() === normalizedTarget);
  if (matched.length === 0) {
    return {
      signal: 0,
      killzoneAlignment: {
        activeSetupCount: 0,
        direction: 'NONE',
        maxConviction: 0,
        killzone: 'STANDBY',
        alignmentStatus: 'STANDBY',
        activeSetupIds: []
      }
    };
  }

  const sorted = [...matched].sort((a, b) => (b.conviction_score ?? 0) - (a.conviction_score ?? 0));
  const top = sorted[0];
  const rawBias = (top.bias || '').toUpperCase();
  const direction: 'LONG' | 'SHORT' | 'NONE' = rawBias === 'LONG' ? 'LONG' : rawBias === 'SHORT' ? 'SHORT' : 'NONE';
  const maxConviction = roundTo(top.conviction_score ?? 75, 1);
  const killzone = String(top.killzone_origin || 'NY_AM').toUpperCase();
  const signal: -1 | 0 | 1 = direction === 'LONG' ? 1 : direction === 'SHORT' ? -1 : 0;

  let alignmentStatus: KillzoneAlignment['alignmentStatus'] = 'STANDBY';
  if (direction === 'LONG' && coreBiasScore >= 0) alignmentStatus = 'ALIGNED';
  else if (direction === 'SHORT' && coreBiasScore <= 0) alignmentStatus = 'ALIGNED';
  else if (direction !== 'NONE') alignmentStatus = 'CONFLICT';

  return {
    signal,
    killzoneAlignment: {
      activeSetupCount: matched.length,
      direction,
      maxConviction,
      killzone,
      alignmentStatus,
      activeSetupIds: matched.map((s) => s.id)
    }
  };
}

function computeCurrencyStrength(
  economies: MacroEconomyData[],
  scorecards: AssetEdgeScorecard[]
): CurrencyStrengthItem[] {
  const byCurrency: Record<EconomyCode, { sum: number; count: number; momSum: number }> = {
    USD: { sum: 0, count: 0, momSum: 0 },
    EUR: { sum: 0, count: 0, momSum: 0 },
    GBP: { sum: 0, count: 0, momSum: 0 },
    JPY: { sum: 0, count: 0, momSum: 0 },
    AUD: { sum: 0, count: 0, momSum: 0 },
    CAD: { sum: 0, count: 0, momSum: 0 },
    CHF: { sum: 0, count: 0, momSum: 0 },
    NZD: { sum: 0, count: 0, momSum: 0 }
  };

  for (const sc of scorecards) {
    if (sc.assetClass !== 'forex') continue;
    const base = sc.baseCurrency as EconomyCode;
    const quote = sc.quoteCurrency as EconomyCode;
    if (base in byCurrency) {
      byCurrency[base].sum += sc.totalScore;
      byCurrency[base].momSum += sc.dailyChangePct;
      byCurrency[base].count += 1;
    }
    if (quote in byCurrency) {
      byCurrency[quote].sum -= sc.totalScore;
      byCurrency[quote].momSum -= sc.dailyChangePct;
      byCurrency[quote].count += 1;
    }
  }

  const rawItems = economies.map((econ) => {
    const fxBucket = byCurrency[econ.currency];
    const fxAvg = fxBucket.count > 0 ? fxBucket.sum / fxBucket.count : 0;
    const strengthScore = roundTo(clamp(econ.economicScore * 0.6 + fxAvg * 0.4, -10, 10), 1);
    const dailyMomentumPct = fxBucket.count > 0 ? roundTo(fxBucket.momSum / fxBucket.count, 2) : roundTo(econ.surpriseScore * 0.15, 2);
    return {
      currency: econ.currency,
      strengthScore,
      dailyMomentumPct,
      policyRate: econ.rate,
      stance: econ.stance
    };
  });

  rawItems.sort((a, b) => b.strengthScore - a.strengthScore);
  const strongest = rawItems[0]?.currency || 'USD';
  const weakest = rawItems[rawItems.length - 1]?.currency || 'NZD';

  return rawItems.map((item, idx) => ({
    ...item,
    macroRank: idx + 1,
    bestLongPair: item.currency === weakest ? `${strongest}/${weakest}` : `${item.currency}/${weakest}`,
    bestShortPair: item.currency === strongest ? `${weakest}/${strongest}` : `${strongest}/${item.currency}`
  }));
}

function computeRiskGauge(scorecards: AssetEdgeScorecard[]): RiskGauge {
  const byInst = new Map(scorecards.map((s) => [s.instrument, s]));
  const es = byInst.get('ES');
  const nq = byInst.get('NQ');
  const gc = byInst.get('GC');
  const gj = byInst.get('GBP/JPY');
  const zn = byInst.get('ZN');

  let score = 50;
  const drivers: RiskGauge['drivers'] = [];

  if (es) {
    score += es.totalScore * 2.2;
    drivers.push({
      label: 'ES Equity Breadth',
      impact: es.totalScore > 1 ? 'Risk-On' : es.totalScore < -1 ? 'Risk-Off' : 'Neutral',
      value: `${es.totalScore >= 0 ? '+' : ''}${es.totalScore.toFixed(1)} Score`
    });
  }
  if (nq) {
    score += nq.totalScore * 1.5;
    drivers.push({
      label: 'NQ Growth Appetite',
      impact: nq.totalScore > 1 ? 'Risk-On' : nq.totalScore < -1 ? 'Risk-Off' : 'Neutral',
      value: `${nq.totalScore >= 0 ? '+' : ''}${nq.totalScore.toFixed(1)} Score`
    });
  }
  if (gj) {
    score += gj.totalScore * 1.6;
    drivers.push({
      label: 'GBP/JPY Carry Beta',
      impact: gj.totalScore > 1 ? 'Risk-On' : gj.totalScore < -1 ? 'Risk-Off' : 'Neutral',
      value: `${gj.totalScore >= 0 ? '+' : ''}${gj.totalScore.toFixed(1)} Score`
    });
  }
  if (gc) {
    score -= gc.dailyChangePct * 2.2;
    drivers.push({
      label: 'Gold Haven Flow',
      impact: gc.dailyChangePct > 0.6 ? 'Risk-Off' : gc.dailyChangePct < -0.5 ? 'Risk-On' : 'Neutral',
      value: `${gc.dailyChangePct >= 0 ? '+' : ''}${gc.dailyChangePct.toFixed(2)}% 1D`
    });
  }
  if (zn) {
    score -= zn.dailyChangePct * 3.0;
    drivers.push({
      label: '10Y Treasury Bid',
      impact: zn.dailyChangePct > 0.35 ? 'Risk-Off' : zn.dailyChangePct < -0.35 ? 'Risk-On' : 'Neutral',
      value: `${zn.dailyChangePct >= 0 ? '+' : ''}${zn.dailyChangePct.toFixed(2)}% 1D`
    });
  }

  const finalScore = Math.round(clamp(score, 5, 95));
  const regime: RiskGauge['regime'] =
    finalScore >= 60 ? 'Risk-On Expansion' :
    finalScore <= 40 ? 'Risk-Off Defensive' : 'Balanced Rotation';

  return { score: finalScore, regime, drivers };
}

function computeFuturesStrength(scorecards: AssetEdgeScorecard[]): FuturesStrengthItem[] {
  const sectors: FuturesStrengthItem['sector'][] = ['Equity Index', 'Metals', 'Energy', 'Rates', 'Agriculture'];
  const items: FuturesStrengthItem[] = sectors.map((sector) => {
    const group = scorecards.filter((sc) => sc.assetClass === 'futures' && sc.category === sector);
    if (group.length === 0) {
      return {
        sector,
        strengthScore: 0,
        dailyMomentumPct: 0,
        rank: 0,
        topContract: '—',
        weakestContract: '—',
        cotNetLongPct: 50,
        contractCount: 0,
        regime: 'No Contracts'
      };
    }
    const sorted = [...group].sort((a, b) => b.totalScore - a.totalScore);
    const strengthScore = roundTo(group.reduce((s, x) => s + x.totalScore, 0) / group.length, 1);
    const dailyMomentumPct = roundTo(group.reduce((s, x) => s + x.dailyChangePct, 0) / group.length, 2);
    const cotNetLongPct = roundTo(group.reduce((s, x) => s + x.cot.longPct, 0) / group.length, 1);
    const regime =
      strengthScore >= 2.0 ? 'Institutional Accumulation' :
      strengthScore <= -2.0 ? 'Institutional Distribution' : 'Mixed Sector Rotation';

    return {
      sector,
      strengthScore,
      dailyMomentumPct,
      rank: 0,
      topContract: sorted[0].instrument,
      weakestContract: sorted[sorted.length - 1].instrument,
      cotNetLongPct,
      contractCount: group.length,
      regime
    };
  });

  items.sort((a, b) => b.strengthScore - a.strengthScore || b.dailyMomentumPct - a.dailyMomentumPct);
  return items.map((item, idx) => ({ ...item, rank: idx + 1 }));
}

function computeCryptoStrength(scorecards: AssetEdgeScorecard[]): CryptoStrengthItem[] {
  const cryptos = scorecards
    .filter((sc) => sc.assetClass === 'crypto')
    .map((sc) => ({
      symbol: sc.baseCurrency,
      instrument: sc.instrument,
      displayName: sc.displayName,
      strengthScore: roundTo(sc.totalScore, 1),
      dailyMomentumPct: roundTo(sc.dailyChangePct, 2),
      rank: 0,
      currentPrice: sc.currentPrice,
      cotLongPct: roundTo(sc.cot.longPct, 1),
      scalpBias: sc.timeframes.SCALP.biasLabel,
      intradayBias: sc.timeframes.INTRADAY.biasLabel,
      swingBias: sc.timeframes.SWING.biasLabel
    }))
    .sort((a, b) => b.strengthScore - a.strengthScore || b.dailyMomentumPct - a.dailyMomentumPct);

  return cryptos.map((item, idx) => ({ ...item, rank: idx + 1 }));
}

function computeCarryTrades(
  scorecards: AssetEdgeScorecard[],
  econByCode: Record<EconomyCode, MacroEconomyData>,
  macroInternals: MacroInternalsData
): CarryTradeItem[] {
  const usdBill3m = macroInternals.yieldCurve.m3 > 0 ? macroInternals.yieldCurve.m3 : (econByCode.USD?.rate ?? 4.0);

  const items: CarryTradeItem[] = scorecards.map((sc) => {
    let carryType: CarryTradeItem['carryType'] = 'FX_RATE_DIFF';
    let baseRate = 0;
    let quoteRate = usdBill3m;
    let rateSpreadPct = 0;
    let regimeLabel = 'Neutral Yield Spread';

    if (sc.assetClass === 'forex') {
      carryType = 'FX_RATE_DIFF';
      baseRate = econByCode[sc.baseCurrency as EconomyCode]?.rate ?? 0;
      quoteRate = econByCode[sc.quoteCurrency as EconomyCode]?.rate ?? 0;
      rateSpreadPct = roundTo(baseRate - quoteRate, 3);
      regimeLabel =
        rateSpreadPct >= 1.5 ? 'High Positive FX Carry' :
        rateSpreadPct >= 0.25 ? 'Positive FX Carry' :
        rateSpreadPct <= -1.5 ? 'Deep Negative FX Carry' :
        rateSpreadPct <= -0.25 ? 'Negative FX Carry' : 'Balanced Policy Spread';
    } else if (sc.assetClass === 'futures') {
      carryType = 'FUTURES_ROLL_YIELD';
      if (sc.category === 'Rates') {
        const bondYield = sc.instrument === 'ZB' ? macroInternals.yieldCurve.y30 : macroInternals.yieldCurve.y10;
        baseRate = roundTo(bondYield, 3);
        quoteRate = roundTo(usdBill3m, 3);
        rateSpreadPct = roundTo(baseRate - quoteRate, 3);
        regimeLabel = rateSpreadPct >= 0 ? 'Positive Duration Curve Roll' : 'Inverted Repo Funding Drag';
      } else {
        const commTilt = (sc.cot.commercialLongPct - 50) * 0.14;
        const curveMomentum = clamp(sc.technical.return20dPct * 0.35, -3.5, 4.5);
        baseRate = roundTo(usdBill3m + commTilt + curveMomentum, 3);
        quoteRate = roundTo(usdBill3m, 3);
        rateSpreadPct = roundTo(baseRate - quoteRate, 3);
        regimeLabel =
          rateSpreadPct >= 0.6 ? 'Backwardation / Tight Supply Roll' :
          rateSpreadPct <= -0.6 ? 'Contango / Cost-of-Carry Drag' : 'Flat Futures Term Structure';
      }
    } else {
      carryType = 'CRYPTO_FUNDING_BASIS';
      const specSkew = (sc.cot.longPct - 50) * 0.22;
      const smallSpecHeat = (sc.retailSentiment.longPct - 50) * 0.14;
      const momBasis = clamp(sc.technical.return5dPct * 0.45, -4.0, 6.0);
      baseRate = roundTo(usdBill3m + specSkew + smallSpecHeat + momBasis, 3);
      quoteRate = roundTo(usdBill3m, 3);
      rateSpreadPct = roundTo(baseRate - quoteRate, 3);
      regimeLabel =
        rateSpreadPct >= 3.0 ? 'Elevated Long Perp / CME Basis' :
        rateSpreadPct >= 0.5 ? 'Positive Contango Basis' :
        rateSpreadPct <= -1.0 ? 'Negative Funding / Backwardation' : 'Balanced Perp Basis';
    }

    const rateSpreadBps = Math.round(rateSpreadPct * 100);
    const carryDirection: CarryTradeItem['carryDirection'] =
      rateSpreadPct >= 0.25 ? 'LONG' : rateSpreadPct <= -0.25 ? 'SHORT' : 'NEUTRAL';
    const carryAtrRatio =
      sc.technical.atrPct > 0 ? roundTo(Math.abs(rateSpreadPct) / sc.technical.atrPct, 2) : 0;
    const alignedWithEdge =
      (carryDirection === 'LONG' && sc.totalScore >= 1.5) ||
      (carryDirection === 'SHORT' && sc.totalScore <= -1.5);

    return {
      instrument: sc.instrument,
      assetClass: sc.assetClass,
      category: sc.category,
      carryType,
      baseCurrency: sc.baseCurrency,
      quoteCurrency: sc.quoteCurrency,
      baseRate,
      quoteRate,
      rateSpreadPct,
      rateSpreadBps,
      carryDirection,
      carryAtrRatio,
      assetTotalScore: sc.totalScore,
      scalpScore: sc.timeframes.SCALP.score,
      intradayScore: sc.timeframes.INTRADAY.score,
      swingScore: sc.timeframes.SWING.score,
      biasLabel: sc.biasLabel,
      alignedWithEdge,
      technicalTrend: sc.technical.trendDirection,
      regimeLabel
    };
  });

  items.sort((a, b) => b.carryAtrRatio - a.carryAtrRatio || Math.abs(b.rateSpreadBps) - Math.abs(a.rateSpreadBps));
  return items;
}

function computeGoldScorecard(
  scorecards: AssetEdgeScorecard[],
  econByCode: Record<EconomyCode, MacroEconomyData>,
  macroInternals: MacroInternalsData
): GoldScorecardData {
  const byInst = new Map(scorecards.map((s) => [s.instrument, s]));
  const gc = byInst.get('GC');
  const si = byInst.get('SI');
  const usd = econByCode.USD;

  const gcPrice = gc?.currentPrice ?? 0;
  const gcChangePct = gc?.dailyChangePct ?? 0;
  const silverPrice = si?.currentPrice ?? 0;
  const goldSilverRatio = silverPrice > 0 && gcPrice > 0 ? roundTo(gcPrice / silverPrice, 2) : 0;
  const realYield10y = macroInternals.yieldCurve.realYield10y;
  const dxy = macroInternals.dxy;
  const vix = macroInternals.vix;
  const cotIndex52w = gc?.cot.cotIndex52w ?? 50;

  const realYieldSig: -1 | 0 | 1 =
    realYield10y > 0 && realYield10y <= 1.2 ? 1 : realYield10y >= 2.2 ? -1 : 0;
  const dxySig: -1 | 0 | 1 =
    macroInternals.dxyChangePct <= -0.2 || (dxy > 0 && dxy <= 99) ? 1 : macroInternals.dxyChangePct >= 0.25 || dxy >= 105 ? -1 : 0;
  const vixSig: -1 | 0 | 1 = vix >= 21 ? 1 : vix > 0 && vix <= 13 ? -1 : 0;
  const gsrSig: -1 | 0 | 1 = goldSilverRatio >= 85 ? -1 : goldSilverRatio > 0 && goldSilverRatio <= 65 ? 1 : 0;
  const cotSig: -1 | 0 | 1 = cotIndex52w >= 60 ? 1 : cotIndex52w <= 35 ? -1 : gc?.cot.cotScore ?? 0;
  const seasonSig: -1 | 0 | 1 = gc?.seasonality.seasonalityScore ?? 0;
  const fedSig: -1 | 0 | 1 =
    usd.stance === 'Dovish' || usd.rateExpectation === 'Cut' ? 1 : usd.stance === 'Hawkish' && usd.rate >= 4.25 ? -1 : 0;

  const rawDrivers: Array<Pick<FactorBreakdownItem, 'key' | 'label' | 'category' | 'signal' | 'weight' | 'detail'>> = [
    {
      key: 'realYield10y',
      label: 'US 10Y TIPS Real Yield',
      category: 'Fundamental',
      signal: realYieldSig,
      weight: 2.25,
      detail: `FRED DFII10 at ${realYield10y.toFixed(2)}% (${realYield10y >= 2.2 ? 'Elevated real yield headwind' : realYield10y <= 1.2 ? 'Accommodative real rate tailwind' : 'Neutral real rate'})`
    },
    {
      key: 'dxyInverse',
      label: 'DXY Inverse Dollar Flow',
      category: 'Technical',
      signal: dxySig,
      weight: 1.75,
      detail: `DXY ${dxy.toFixed(2)} (${macroInternals.dxyChangePct >= 0 ? '+' : ''}${macroInternals.dxyChangePct.toFixed(2)}% 1D)`
    },
    {
      key: 'vixHaven',
      label: 'VIX Safe-Haven Demand',
      category: 'Sentiment',
      signal: vixSig,
      weight: 1.25,
      detail: `CBOE VIX ${vix.toFixed(2)} (${vix >= 21 ? 'Fear hedge active' : vix <= 13 ? 'Low volatility complacency' : 'Normal volatility regime'})`
    },
    {
      key: 'goldSilverRatio',
      label: 'Gold / Silver Ratio',
      category: 'Statistical',
      signal: gsrSig,
      weight: 1.0,
      detail: `GC/SI Ratio ${goldSilverRatio.toFixed(1)}x (GC $${gcPrice.toFixed(1)} / SI $${silverPrice.toFixed(2)})`
    },
    {
      key: 'goldCot52w',
      label: 'COMEX Gold 52W COT Index',
      category: 'Sentiment',
      signal: cotSig,
      weight: 1.75,
      detail: `52W Percentile ${cotIndex52w.toFixed(1)}% (${gc?.cot.longPct.toFixed(1) ?? '50.0'}% Spec Long · Z ${(gc?.cot.cotZScore52w ?? 0).toFixed(2)})`
    },
    {
      key: 'goldSeasonality',
      label: '10Y Gold Seasonality',
      category: 'Statistical',
      signal: seasonSig,
      weight: 1.0,
      detail: `Month avg ${(gc?.seasonality.currentMonthAvgReturn ?? 0) >= 0 ? '+' : ''}${(gc?.seasonality.currentMonthAvgReturn ?? 0).toFixed(2)}% (${gc?.seasonality.currentMonthWinRate ?? 50}% Win)`
    },
    {
      key: 'fedPolicy',
      label: 'Fed Rate & Inflation Regime',
      category: 'Fundamental',
      signal: fedSig,
      weight: 1.0,
      detail: `Fed ${usd.rate.toFixed(2)}% (${usd.stance}) · Core CPI ${usd.coreCpiYoY.toFixed(1)}%`
    }
  ];

  const drivers: FactorBreakdownItem[] = rawDrivers.map((d) => ({
    ...d,
    contribution: roundTo(d.signal * d.weight, 2)
  }));
  const totalScore = roundTo(clamp(drivers.reduce((s, d) => s + d.contribution, 0), -10, 10), 2);

  const dxyByDate = new Map(macroInternals.dxySeries30d.map((d) => [d.date, d.close]));
  const series30d = (gc?.historicalSeries || []).map((pt) => ({
    date: pt.date,
    goldPrice: pt.price,
    dxyPrice: dxyByDate.get(pt.date) ?? dxy
  }));

  return {
    gcPrice,
    gcChangePct,
    silverPrice,
    goldSilverRatio,
    realYield10y,
    dxy,
    vix,
    cotIndex52w,
    totalScore,
    biasLabel: classifyBiasLabel(totalScore),
    drivers,
    series30d
  };
}

function pearsonCorrelation(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 5) return 0;
  const xa = a.slice(-n);
  const xb = b.slice(-n);
  const meanA = xa.reduce((s, v) => s + v, 0) / n;
  const meanB = xb.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let denA = 0;
  let denB = 0;
  for (let i = 0; i < n; i++) {
    const da = xa[i] - meanA;
    const db = xb[i] - meanB;
    num += da * db;
    denA += da * da;
    denB += db * db;
  }
  const denom = Math.sqrt(denA * denB);
  if (denom < 1e-12) return 0;
  return roundTo(clamp(num / denom, -1, 1), 2);
}

function computeCorrelations(scorecards: AssetEdgeScorecard[]): { assets: string[]; matrix: Record<string, Record<string, number>> } {
  const returnsMap: Record<string, number[]> = {};
  const assets = scorecards.map((s) => s.instrument);

  for (const sc of scorecards) {
    const prices = sc.historicalSeries.map((p) => p.price);
    const rets: number[] = [];
    for (let i = 1; i < prices.length; i++) {
      if (prices[i - 1] > 0) rets.push((prices[i] - prices[i - 1]) / prices[i - 1]);
    }
    returnsMap[sc.instrument] = rets;
  }

  const matrix: Record<string, Record<string, number>> = {};
  for (const rowAsset of assets) {
    matrix[rowAsset] = {};
    for (const colAsset of assets) {
      matrix[rowAsset][colAsset] = rowAsset === colAsset
        ? 1.0
        : pearsonCorrelation(returnsMap[rowAsset], returnsMap[colAsset]);
    }
  }
  return { assets, matrix };
}

function cotSignalsForDate(weeklySeries: CotWeeklyRow[], dateStr: string, fallbackCot: number, fallbackRetail: number): { cot: number; retail: number } {
  if (!weeklySeries || weeklySeries.length === 0) {
    return { cot: fallbackCot, retail: fallbackRetail };
  }
  let chosen = weeklySeries[0];
  for (const w of weeklySeries) {
    if (w.reportDate <= dateStr) chosen = w;
  }
  const cotDenom = Math.max(chosen.noncommLong + chosen.noncommShort, 1);
  const cotLongPct = (chosen.noncommLong / cotDenom) * 100;
  const cotSig = cotLongPct >= 55 ? 1.5 : cotLongPct <= 45 ? -1.5 : 0;

  const retDenom = Math.max(chosen.nonreptLong + chosen.nonreptShort, 1);
  const retLongPct = (chosen.nonreptLong / retDenom) * 100;
  const retSig = retLongPct >= 56 ? -1.0 : retLongPct <= 44 ? 1.0 : 0;
  return { cot: cotSig, retail: retSig };
}

function dirVal(dir: 'Bullish' | 'Bearish' | 'Flat'): -1 | 0 | 1 {
  return dir === 'Bullish' ? 1 : dir === 'Bearish' ? -1 : 0;
}

function emaTrendSignal(price: number, fast: number, slow: number): 'Bullish' | 'Bearish' | 'Flat' {
  if (price <= 0 || fast <= 0 || slow <= 0) return 'Flat';
  if (price > fast && fast >= slow) return 'Bullish';
  if (price < fast && fast <= slow) return 'Bearish';
  return 'Flat';
}

function rsiZoneSignal(rsi: number): -1 | 0 | 1 {
  if (rsi >= 54 && rsi <= 72) return 1;
  if (rsi <= 46 && rsi >= 28) return -1;
  return 0;
}

function directionFromScore(score: number): 'LONG' | 'SHORT' | 'NEUTRAL' {
  if (score >= 2.0) return 'LONG';
  if (score <= -2.0) return 'SHORT';
  return 'NEUTRAL';
}

function computeIntradayMetrics(
  candles15m: Candle[],
  currentPrice: number,
  fallbackTrend: 'Bullish' | 'Bearish' | 'Ranging',
  fallbackRsi: number,
  fallbackReturn5d: number
): {
  m15Sig: 'Bullish' | 'Bearish' | 'Flat';
  h1Sig: 'Bullish' | 'Bearish' | 'Flat';
  h4Sig: 'Bullish' | 'Bearish' | 'Flat';
  rsi14M15: number;
  rsi14H1: number;
  rsi14H4: number;
  return1hPct: number;
  return4hPct: number;
  intradaySource: 'LIVE_15M_H1_H4' | 'DAILY_DERIVED';
} {
  if (candles15m.length >= 25 && currentPrice > 0) {
    const closes15 = candles15m.map((c) => c.close);
    const m15Ema9 = calcEma(closes15, Math.min(9, closes15.length));
    const m15Ema21 = calcEma(closes15, Math.min(21, closes15.length));
    const m15Sig = emaTrendSignal(currentPrice, m15Ema9, m15Ema21);
    const rsi14M15 = calcRsi(closes15, Math.min(14, Math.max(2, closes15.length - 1)));

    const c1h = closes15.length >= 5 ? closes15[closes15.length - 5] : closes15[0];
    const c4h = closes15.length >= 17 ? closes15[closes15.length - 17] : closes15[0];
    const return1hPct = c1h > 0 ? roundTo(((currentPrice - c1h) / c1h) * 100, 2) : 0;
    const return4hPct = c4h > 0 ? roundTo(((currentPrice - c4h) / c4h) * 100, 2) : 0;

    const h1Candles = aggregateCandles(candles15m, 4);
    const h1Closes = h1Candles.map((c) => c.close);
    const h1Fast = calcEma(h1Closes, Math.min(20, Math.max(2, h1Closes.length)));
    const h1Slow = calcEma(h1Closes, Math.min(50, Math.max(4, h1Closes.length)));
    const h1Sig = h1Closes.length >= 8 ? emaTrendSignal(currentPrice, h1Fast, h1Slow) : m15Sig;
    const rsi14H1 = h1Closes.length >= 5 ? calcRsi(h1Closes, Math.min(14, h1Closes.length - 1)) : rsi14M15;

    const h4Candles = aggregateCandles(candles15m, 16);
    const h4Closes = h4Candles.map((c) => c.close);
    const h4Fast = calcEma(h4Closes, Math.min(12, Math.max(2, h4Closes.length)));
    const h4Slow = calcEma(h4Closes, Math.min(26, Math.max(3, h4Closes.length)));
    const h4Sig = h4Closes.length >= 6 ? emaTrendSignal(currentPrice, h4Fast, h4Slow) : h1Sig;
    const rsi14H4 = h4Closes.length >= 5 ? calcRsi(h4Closes, Math.min(14, h4Closes.length - 1)) : rsi14H1;

    return {
      m15Sig,
      h1Sig,
      h4Sig,
      rsi14M15,
      rsi14H1,
      rsi14H4,
      return1hPct,
      return4hPct,
      intradaySource: 'LIVE_15M_H1_H4'
    };
  }

  const derivedDir: 'Bullish' | 'Bearish' | 'Flat' =
    fallbackTrend === 'Ranging' ? 'Flat' : fallbackTrend;
  return {
    m15Sig: derivedDir,
    h1Sig: derivedDir,
    h4Sig: derivedDir,
    rsi14M15: fallbackRsi,
    rsi14H1: fallbackRsi,
    rsi14H4: fallbackRsi,
    return1hPct: roundTo(fallbackReturn5d / 15, 2),
    return4hPct: roundTo(fallbackReturn5d / 5, 2),
    intradaySource: 'DAILY_DERIVED'
  };
}

function buildTimeframeProfiles(params: {
  asset: AssetDefinition;
  swingScore: number;
  fundamentalScore: number;
  trendScoreRaw: -1 | 0 | 1;
  mannaSignal: -1 | 0 | 1;
  cot: CotPositioningRecord;
  retailSentiment: RetailSentimentRecord;
  seasonality: SeasonalityRecord;
  killzoneAlignment: KillzoneAlignment;
  m15Sig: 'Bullish' | 'Bearish' | 'Flat';
  h1Sig: 'Bullish' | 'Bearish' | 'Flat';
  h4Sig: 'Bullish' | 'Bearish' | 'Flat';
  d5Sig: 'Bullish' | 'Bearish' | 'Flat';
  d20Sig: 'Bullish' | 'Bearish' | 'Flat';
  d50Sig: 'Bullish' | 'Bearish' | 'Flat';
  monthlySig: 'Bullish' | 'Bearish' | 'Flat';
  rsi14M15: number;
  rsi14H1: number;
  rsi14D1: number;
  return1hPct: number;
  return4hPct: number;
  atrPct: number;
  dayRangePctOfAtr: number;
}): {
  timeframes: AssetEdgeScorecard['timeframes'];
  timeframeConfluence: AssetEdgeScorecard['timeframeConfluence'];
} {
  const {
    asset,
    swingScore,
    fundamentalScore,
    trendScoreRaw,
    mannaSignal,
    cot,
    retailSentiment,
    seasonality,
    killzoneAlignment,
    m15Sig,
    h1Sig,
    h4Sig,
    d50Sig,
    monthlySig,
    rsi14M15,
    rsi14H1,
    rsi14D1,
    return1hPct,
    return4hPct,
    atrPct,
    dayRangePctOfAtr
  } = params;

  const m15Dir = dirVal(m15Sig);
  const h1Dir = dirVal(h1Sig);
  const h4Dir = dirVal(h4Sig);
  const swingDir = directionFromScore(swingScore);

  const mom1hSig = signalFromDiff(return1hPct, Math.max(0.04, atrPct * 0.08));
  const mom4hSig = signalFromDiff(return4hPct, Math.max(0.08, atrPct * 0.18));
  const macroGuard = clamp(fundamentalScore / 3.0, -1, 1);

  // 1. SCALP PROFILE (M5 - M15)
  const rawScalp =
    m15Dir * 2.5 +
    h1Dir * 1.75 +
    mom1hSig * 1.0 +
    mom4hSig * 0.75 +
    mannaSignal * 1.5 +
    rsiZoneSignal(rsi14M15) * 0.75 +
    retailSentiment.sentimentScore * 0.75 +
    macroGuard * 1.0;

  const scalpAdrWarn = dayRangePctOfAtr >= 95 || rsi14M15 >= 75 || rsi14M15 <= 25;
  const scalpScore = roundTo(clamp(scalpAdrWarn ? rawScalp * 0.72 : rawScalp, -10, 10), 2);
  const scalpDir = directionFromScore(scalpScore);
  const scalpHtfConfluence: TimeframeEdgeProfile['htfConfluence'] =
    scalpDir === 'NEUTRAL' || swingDir === 'NEUTRAL'
      ? 'NEUTRAL'
      : scalpDir === swingDir
      ? 'ALIGNED'
      : 'COUNTER_TREND';

  const scalpAgree =
    (m15Dir !== 0 && m15Dir === h1Dir ? 1 : 0) +
    (mom1hSig !== 0 && mom1hSig === m15Dir ? 1 : 0) +
    (scalpHtfConfluence === 'ALIGNED' ? 1 : 0);
  const scalpConfidence = Math.round(clamp(44 + Math.abs(scalpScore) * 3.4 + scalpAgree * 6 - (scalpAdrWarn ? 12 : 0), 32, 95));

  const scalpActionNote = scalpAdrWarn
    ? `ADR/RSI stretched (${dayRangePctOfAtr.toFixed(0)}% Daily ADR · M15 RSI ${rsi14M15.toFixed(0)}) — wait for M5/M15 pullback to EMA9/21.`
    : scalpHtfConfluence === 'COUNTER_TREND'
    ? `Counter-trend M15 ${scalpDir} vs ${swingDir} Swing — tight TP targets only during ${asset.bestKillzone} session.`
    : scalpDir === 'NEUTRAL'
    ? `M15/H1 consolidating (${dayRangePctOfAtr.toFixed(0)}% ADR used) — wait for ${asset.bestKillzone} Killzone liquidity sweep.`
    : `${scalpDir} M5–M15 setup aligned with H1 & Swing bias · ${killzoneAlignment.activeSetupCount > 0 ? `${killzoneAlignment.killzone} Killzone active` : `Best window: ${asset.bestKillzone}`}.`;

  const SCALP: TimeframeEdgeProfile = {
    horizon: 'SCALP',
    label: 'Scalper',
    executionTimeframes: 'M1 / M5 / M15 (H1 Filter)',
    holdDuration: '15m – 2h',
    score: scalpScore,
    biasLabel: classifyBiasLabel(scalpScore),
    confidencePct: scalpConfidence,
    trendPrimary: m15Sig,
    trendConfirm: h1Sig,
    rsi: rsi14M15,
    adrUsedPct: dayRangePctOfAtr,
    adrWarning: scalpAdrWarn,
    htfConfluence: scalpHtfConfluence,
    weightsSummary: '70% M15/H1 Structure & Killzone Flow · 30% Retail Liquidity & Macro Guard',
    actionNote: scalpActionNote
  };

  // 2. INTRADAY PROFILE (H1 - H4)
  const macroIntra = clamp(fundamentalScore / 3.5, -1, 1);
  const rawIntra =
    h1Dir * 2.0 +
    h4Dir * 2.0 +
    trendScoreRaw * 1.0 +
    mom4hSig * 0.75 +
    rsiZoneSignal(rsi14H1) * 0.5 +
    mannaSignal * 1.0 +
    cot.cotScore * 0.75 +
    retailSentiment.sentimentScore * 0.75 +
    macroIntra * 1.25;

  const intraAdrWarn = dayRangePctOfAtr >= 115 || rsi14H1 >= 76 || rsi14H1 <= 24;
  const intraScore = roundTo(clamp(intraAdrWarn ? rawIntra * 0.78 : rawIntra, -10, 10), 2);
  const intraDir = directionFromScore(intraScore);
  const intraHtfConfluence: TimeframeEdgeProfile['htfConfluence'] =
    intraDir === 'NEUTRAL' || swingDir === 'NEUTRAL'
      ? 'NEUTRAL'
      : intraDir === swingDir
      ? 'ALIGNED'
      : 'COUNTER_TREND';

  const intraAgree =
    (h1Dir !== 0 && h1Dir === h4Dir ? 1 : 0) +
    (h4Dir !== 0 && h4Dir === trendScoreRaw ? 1 : 0) +
    (intraHtfConfluence === 'ALIGNED' ? 1 : 0);
  const intraConfidence = Math.round(clamp(46 + Math.abs(intraScore) * 3.5 + intraAgree * 6 - (intraAdrWarn ? 10 : 0), 35, 96));

  const intraActionNote = intraAdrWarn
    ? `Extended intraday expansion (${dayRangePctOfAtr.toFixed(0)}% ADR · H1 RSI ${rsi14H1.toFixed(0)}) — favor H1 FVG retracement entries.`
    : intraHtfConfluence === 'COUNTER_TREND'
    ? `Intraday H1/H4 ${intraDir} counter to Swing macro — target nearest H4 liquidity pool.`
    : intraDir === 'NEUTRAL'
    ? `H1/H4 structure neutral — watch ${asset.bestKillzone} session displacement before committing.`
    : `Session H1–H4 ${intraDir} aligned with D1 macro flow · H1 RSI ${rsi14H1.toFixed(0)} · Optimal window: ${asset.bestKillzone}.`;

  const INTRADAY: TimeframeEdgeProfile = {
    horizon: 'INTRADAY',
    label: 'Intraday / Day Trade',
    executionTimeframes: 'M15 / H1 / H4 (D1 Bias)',
    holdDuration: '2h – 24h',
    score: intraScore,
    biasLabel: classifyBiasLabel(intraScore),
    confidencePct: intraConfidence,
    trendPrimary: h1Sig,
    trendConfirm: h4Sig,
    rsi: rsi14H1,
    adrUsedPct: dayRangePctOfAtr,
    adrWarning: intraAdrWarn,
    htfConfluence: intraHtfConfluence,
    weightsSummary: '55% H1/H4/D1 Trend & Killzones · 25% COT/Retail Flow · 20% Macro Diff',
    actionNote: intraActionNote
  };

  // 3. SWING PROFILE (D1 - W1)
  const swingAgree =
    (trendScoreRaw !== 0 && trendScoreRaw === cot.cotScore ? 1 : 0) +
    (cot.cotScore !== 0 && Math.sign(fundamentalScore) === cot.cotScore ? 1 : 0) +
    (seasonality.seasonalityScore !== 0 && seasonality.seasonalityScore === dirVal(d50Sig) ? 1 : 0);
  const swingConfidence = Math.round(clamp(48 + Math.abs(swingScore) * 3.6 + swingAgree * 6, 36, 97));
  const swingActionNote =
    swingDir === 'NEUTRAL'
      ? `Multi-factor Swing balance neutral — wait for D1/W1 breakout or 52W COT extreme shift.`
      : `Multi-day ${swingDir} position bias · 52W COT ${cot.cotIndex52w.toFixed(0)}% · 10Y Seasonality ${seasonality.currentMonthWinRate}% win rate.`;

  const SWING: TimeframeEdgeProfile = {
    horizon: 'SWING',
    label: 'Swing / Position',
    executionTimeframes: 'H4 / D1 / W1 (10Y Macro)',
    holdDuration: '3d – 4w',
    score: swingScore,
    biasLabel: classifyBiasLabel(swingScore),
    confidencePct: swingConfidence,
    trendPrimary: d50Sig,
    trendConfirm: monthlySig,
    rsi: rsi14D1,
    adrUsedPct: dayRangePctOfAtr,
    adrWarning: false,
    htfConfluence: swingDir === 'NEUTRAL' ? 'NEUTRAL' : 'ALIGNED',
    weightsSummary: '47.5% Macro & Rates · 25% COT & Retail Fade · 20% D1/W1 Trend & 10Y Seasonal · 7.5% Killzone',
    actionNote: swingActionNote
  };

  const dirs = [scalpDir, intraDir, swingDir];
  const longs = dirs.filter((d) => d === 'LONG').length;
  const shorts = dirs.filter((d) => d === 'SHORT').length;
  const alignedCount = Math.max(longs, shorts);
  const allAligned = longs === 3 || shorts === 3;
  const avgScore = roundTo((scalpScore + intraScore + swingScore) / 3, 2);

  let summary = 'NEUTRAL CONSOLIDATION';
  if (longs === 3) summary = '3/3 ALIGNED BULLISH (Scalp + Intra + Swing)';
  else if (shorts === 3) summary = '3/3 ALIGNED BEARISH (Scalp + Intra + Swing)';
  else if (longs === 2) summary = '2/3 BULLISH (Partial Pullback)';
  else if (shorts === 2) summary = '2/3 BEARISH (Partial Pullback)';
  else if (longs >= 1 && shorts >= 1) summary = 'CONFLICTING HORIZONS (Counter-Trend)';

  return {
    timeframes: { SCALP, INTRADAY, SWING },
    timeframeConfluence: {
      allAligned,
      alignedCount,
      summary,
      dominantBias: classifyBiasLabel(avgScore)
    }
  };
}

async function executeEdgeFinderSnapshotBuild(): Promise<EdgeFinderSnapshot> {
  const allEvents = newsEngine.getAllEvents();
  const upcomingHighImpact = newsEngine.getUpcomingHighImpactEvents().slice(0, 14);
  const calendarStatus = newsEngine.getCalendarStatus();

  const [rollout, liveCot, activeSetups, macroRes, macroInternals, smartMoney, marketDataList] = await Promise.all([
    getEdgeFinderRollout(),
    fetchLiveCftcCot(),
    getAllActiveSetups().catch(() => [] as EdgeSetup[]),
    getMacroEconomies(allEvents),
    fetchMacroInternals(),
    fetchSmartMoneyAndTargets(),
    mapWithConcurrency(EDGE_FINDER_ASSETS, 16, (asset) => fetchAssetMarketData(asset))
  ]);

  const { economies, macroSource } = macroRes;
  const econByCode = economies.reduce((acc, e) => {
    acc[e.currency] = e;
    return acc;
  }, {} as Record<EconomyCode, MacroEconomyData>);

  let livePriceCount = 0;
  let liveIntradayCount = 0;
  let hasLiveCot = false;

  const scorecards: AssetEdgeScorecard[] = EDGE_FINDER_ASSETS.map((asset, idx) => {
    const { candles, candles15m, livePrice, isLive, monthlyReturns10Y, monthlyWinRate10Y } = marketDataList[idx];
    if (isLive && livePrice !== null) livePriceCount += 1;

    const closes = candles.map((c) => c.close);
    const currentPrice = livePrice ?? closes[closes.length - 1] ?? 0;
    const prevClose = closes.length >= 2 ? closes[closes.length - 2] : currentPrice;
    const dailyChangePct = prevClose > 0 ? roundTo(((currentPrice - prevClose) / prevClose) * 100, 2) : 0;

    const ema5 = closes.length > 0 ? roundTo(calcEma(closes, Math.min(5, closes.length)), asset.decimals) : 0;
    const ema20 = closes.length > 0 ? roundTo(calcEma(closes, Math.min(20, closes.length)), asset.decimals) : 0;
    const ema50 = closes.length > 0 ? roundTo(calcEma(closes, Math.min(50, closes.length)), asset.decimals) : 0;
    const rsi14 = closes.length > 14 ? calcRsi(closes, 14) : 50;
    const atr14 = candles.length > 1 ? roundTo(calcAtr(candles, 14), asset.decimals) : 0;
    const atrPct = currentPrice > 0 ? roundTo((atr14 / currentPrice) * 100, 2) : 0;
    const high30d = candles.length > 0 ? roundTo(Math.max(...candles.slice(-30).map((c) => c.high)), asset.decimals) : currentPrice;
    const low30d = candles.length > 0 ? roundTo(Math.min(...candles.slice(-30).map((c) => c.low)), asset.decimals) : currentPrice;
    const distanceFromEma20Pct = ema20 > 0 ? roundTo(((currentPrice - ema20) / ema20) * 100, 2) : 0;

    const close5Ago = closes.length >= 6 ? closes[closes.length - 6] : closes[0] || currentPrice;
    const close20Ago = closes.length >= 21 ? closes[closes.length - 21] : closes[0] || currentPrice;
    const close22Ago = closes.length >= 23 ? closes[closes.length - 23] : closes[0] || currentPrice;
    const return5dPct = close5Ago > 0 ? roundTo(((currentPrice - close5Ago) / close5Ago) * 100, 2) : 0;
    const return20dPct = close20Ago > 0 ? roundTo(((currentPrice - close20Ago) / close20Ago) * 100, 2) : 0;
    const returnMonthlyPct = close22Ago > 0 ? ((currentPrice - close22Ago) / close22Ago) * 100 : return20dPct;

    const latestCandle = candles[candles.length - 1];
    const todayRange = latestCandle ? Math.max(latestCandle.high - latestCandle.low, 0) : 0;
    const dayRangePctOfAtr = atr14 > 0 ? roundTo((todayRange / atr14) * 100, 1) : 0;
    const recent30 = candles.slice(-30);
    const trList30 = recent30.slice(1).map((c, rIdx) => {
      const prevC = recent30[rIdx].close;
      return Math.max(c.high - c.low, Math.abs(c.high - prevC), Math.abs(c.low - prevC));
    });
    const trUnderOrEq = trList30.filter((tr) => tr <= todayRange).length;
    const volatilityPercentile30d = trList30.length > 0 ? Math.round((trUnderOrEq / trList30.length) * 100) : 50;

    const d5Sig: 'Bullish' | 'Bearish' | 'Flat' =
      return5dPct >= 0.25 && currentPrice > ema5 ? 'Bullish' : return5dPct <= -0.25 && currentPrice < ema5 ? 'Bearish' : 'Flat';
    const d20Sig: 'Bullish' | 'Bearish' | 'Flat' =
      currentPrice > ema20 && return20dPct >= 0.4 ? 'Bullish' : currentPrice < ema20 && return20dPct <= -0.4 ? 'Bearish' : 'Flat';
    const d50Sig: 'Bullish' | 'Bearish' | 'Flat' =
      currentPrice > ema50 && ema20 > ema50 ? 'Bullish' : currentPrice < ema50 && ema20 < ema50 ? 'Bearish' : 'Flat';
    const monthlySig: 'Bullish' | 'Bearish' | 'Flat' =
      returnMonthlyPct >= 0.5 && currentPrice > ema50 ? 'Bullish' : returnMonthlyPct <= -0.5 && currentPrice < ema50 ? 'Bearish' : 'Flat';

    const trendScoreRaw: -1 | 0 | 1 =
      currentPrice > 0 && currentPrice > ema20 && ema20 >= ema50 ? 1 :
      currentPrice > 0 && currentPrice < ema20 && ema20 <= ema50 ? -1 : 0;
    const trendDirection: AssetEdgeScorecard['technical']['trendDirection'] =
      trendScoreRaw === 1 ? 'Bullish' : trendScoreRaw === -1 ? 'Bearish' : 'Ranging';

    const intraday = computeIntradayMetrics(candles15m, currentPrice, trendDirection, rsi14, return5dPct);
    if (intraday.intradaySource === 'LIVE_15M_H1_H4') liveIntradayCount += 1;

    const allTfs = [intraday.m15Sig, intraday.h1Sig, intraday.h4Sig, d5Sig, d20Sig, d50Sig, monthlySig];
    const alignedCount = Math.max(
      allTfs.filter((t) => t === 'Bullish').length,
      allTfs.filter((t) => t === 'Bearish').length
    );

    const { cot, retailSentiment, weeklySeries } = buildCotAndRetailFromLive(asset, liveCot);
    if (cot.source === 'CFTC_LIVE') hasLiveCot = true;

    const seasonality = deriveSeasonality(asset, monthlyReturns10Y, monthlyWinRate10Y);
    const { factors: macroFactors, tugOfWar } = buildMacroTugOfWar(asset, econByCode, cot, trendDirection);

    const baseFactorsWithoutManna: FactorBreakdownItem[] = [
      {
        key: 'cot',
        label: 'COT Smart Money',
        category: 'Sentiment',
        signal: cot.cotScore,
        weight: 1.5,
        contribution: roundTo(cot.cotScore * 1.5, 2),
        detail: `${cot.longPct.toFixed(1)}% Non-Comm Long · 52W Idx ${cot.cotIndex52w.toFixed(0)}% (WoW ${cot.netChangeWoW >= 0 ? '+' : ''}${cot.netChangeWoW.toLocaleString()}) [${cot.reportDate}]`
      },
      {
        key: 'retailSentiment',
        label: 'Retail Contrarian',
        category: 'Sentiment',
        signal: retailSentiment.sentimentScore,
        weight: 1.0,
        contribution: roundTo(retailSentiment.sentimentScore * 1.0, 2),
        detail: `CFTC Small Spec ${retailSentiment.longPct.toFixed(1)}% Long → Contrarian ${retailSentiment.contrarianBias}`
      },
      {
        key: 'seasonality',
        label: '10Y Live Seasonality',
        category: 'Statistical',
        signal: seasonality.seasonalityScore,
        weight: 0.75,
        contribution: roundTo(seasonality.seasonalityScore * 0.75, 2),
        detail: `Month avg ${seasonality.currentMonthAvgReturn >= 0 ? '+' : ''}${seasonality.currentMonthAvgReturn.toFixed(2)}% (${seasonality.currentMonthWinRate}% Win)`
      },
      {
        key: 'trend',
        label: 'Daily EMA & RSI Trend',
        category: 'Technical',
        signal: trendScoreRaw,
        weight: 1.25,
        contribution: roundTo(trendScoreRaw * 1.25, 2),
        detail: `${trendDirection} vs EMA20/50 · RSI ${rsi14.toFixed(1)} · MTF ${alignedCount}/7`
      },
      ...macroFactors.map((mf) => ({
        ...mf,
        contribution: roundTo(mf.signal * mf.weight, 2)
      }))
    ];

    const preMannaScore = baseFactorsWithoutManna.reduce((s, f) => s + f.contribution, 0);
    const { signal: mannaSignal, killzoneAlignment } = computeKillzoneAlignment(
      asset.instrument,
      activeSetups,
      preMannaScore
    );

    const mannaFactor: FactorBreakdownItem = {
      key: 'mannaKillzone',
      label: 'Manna Killzone Order-Flow',
      category: 'Manna Flow',
      signal: mannaSignal,
      weight: 0.75,
      contribution: roundTo(mannaSignal * 0.75, 2),
      detail: killzoneAlignment.activeSetupCount > 0
        ? `${killzoneAlignment.activeSetupCount} Active ${killzoneAlignment.direction} (${killzoneAlignment.killzone} · ${killzoneAlignment.maxConviction}% Conv)`
        : `No active Killzone signal · Best window: ${asset.bestKillzone}`
    };

    const factors = [...baseFactorsWithoutManna, mannaFactor];
    const totalScore = roundTo(clamp(factors.reduce((s, f) => s + f.contribution, 0), -10, 10), 2);
    const fundamentalScore = roundTo(macroFactors.reduce((s, f) => s + f.signal * f.weight, 0), 2);

    const { timeframes, timeframeConfluence } = buildTimeframeProfiles({
      asset,
      swingScore: totalScore,
      fundamentalScore,
      trendScoreRaw,
      mannaSignal,
      cot,
      retailSentiment,
      seasonality,
      killzoneAlignment,
      m15Sig: intraday.m15Sig,
      h1Sig: intraday.h1Sig,
      h4Sig: intraday.h4Sig,
      d5Sig,
      d20Sig,
      d50Sig,
      monthlySig,
      rsi14M15: intraday.rsi14M15,
      rsi14H1: intraday.rsi14H1,
      rsi14D1: rsi14,
      return1hPct: intraday.return1hPct,
      return4hPct: intraday.return4hPct,
      atrPct,
      dayRangePctOfAtr
    });

    const cotContrib = roundTo(cot.cotScore * 1.5, 2);
    const retailContrib = roundTo(retailSentiment.sentimentScore * 1.0, 2);
    const fixedOtherScore = totalScore - trendScoreRaw * 1.25 - cotContrib - retailContrib;
    const recentCandles = candles.slice(-30);
    const offsetStart = candles.length - recentCandles.length;

    const historicalSeries: HistoricalScorePoint[] = recentCandles.map((c, cIdx) => {
      const sliceEnd = Math.max(1, offsetStart + cIdx + 1);
      const lookbackCloses = candles.slice(0, sliceEnd).map((x) => x.close);
      const localEma20 = calcEma(lookbackCloses, Math.min(20, lookbackCloses.length));
      const localEma50 = calcEma(lookbackCloses, Math.min(50, lookbackCloses.length));
      const localTrend =
        c.close > localEma20 && localEma20 >= localEma50 ? 1.25 :
        c.close < localEma20 && localEma20 <= localEma50 ? -1.25 : 0;
      const dateStr = c.timestamp.slice(0, 10);
      const cotHist = cotSignalsForDate(weeklySeries, dateStr, cotContrib, retailContrib);
      const pointScore = roundTo(clamp(fixedOtherScore + localTrend + cotHist.cot + cotHist.retail, -10, 10), 2);
      return {
        date: dateStr,
        price: c.close,
        score: pointScore
      };
    });

    return {
      instrument: asset.instrument,
      displayName: asset.displayName,
      assetClass: asset.assetClass,
      category: asset.category,
      baseCurrency: asset.baseCurrency,
      quoteCurrency: asset.quoteCurrency,
      currentPrice,
      dailyChangePct,
      priceSource: isLive && livePrice !== null ? 'LIVE' : 'REFERENCE',
      totalScore,
      biasLabel: classifyBiasLabel(totalScore),
      timeframes,
      timeframeConfluence,
      cotScore: cotContrib,
      retailScore: retailContrib,
      seasonalityScore: roundTo(seasonality.seasonalityScore * 0.75, 2),
      trendScore: roundTo(trendScoreRaw * 1.25, 2),
      fundamentalScore,
      mannaFlowScore: roundTo(mannaSignal * 0.75, 2),
      factors,
      tugOfWar,
      technical: {
        ema5,
        ema20,
        ema50,
        rsi14,
        rsi14M15: intraday.rsi14M15,
        rsi14H1: intraday.rsi14H1,
        rsi14H4: intraday.rsi14H4,
        atr14,
        atrPct,
        high30d,
        low30d,
        trendDirection,
        distanceFromEma20Pct,
        dayRangePctOfAtr,
        volatilityPercentile30d,
        return1hPct: intraday.return1hPct,
        return4hPct: intraday.return4hPct,
        return5dPct,
        return20dPct,
        intradaySource: intraday.intradaySource,
        mtfAlignment: {
          m15: intraday.m15Sig,
          h1: intraday.h1Sig,
          h4: intraday.h4Sig,
          d5: d5Sig,
          d20: d20Sig,
          d50: d50Sig,
          monthly: monthlySig,
          alignedCount
        }
      },
      cot,
      retailSentiment,
      seasonality,
      killzoneAlignment,
      historicalSeries
    };
  });

  scorecards.sort((a, b) => Math.abs(b.totalScore) - Math.abs(a.totalScore));

  const currencyStrength = computeCurrencyStrength(economies, scorecards);
  const futuresStrength = computeFuturesStrength(scorecards);
  const cryptoStrength = computeCryptoStrength(scorecards);
  const riskGauge = computeRiskGauge(scorecards);
  const carryTrades = computeCarryTrades(scorecards, econByCode, macroInternals);
  const goldScorecard = computeGoldScorecard(scorecards, econByCode, macroInternals);
  const correlations = computeCorrelations(scorecards);
  const nowIso = new Date().toISOString();

  const feedCadences: FeedCadenceItem[] = [
    {
      key: 'intraday_price',
      name: 'Spot, Futures & Crypto Quotes',
      provider: 'Yahoo Finance 15m + Meta Quote',
      pollCadence: 'Every 60s (Auto-Poll)',
      upstreamFrequency: 'Live Exchange Ticks',
      status: livePriceCount >= EDGE_FINDER_ASSETS.length - 2 ? 'LIVE' : 'PARTIAL',
      lastUpdated: nowIso
    },
    {
      key: 'intraday_mtf',
      name: 'Scalp & Intraday (M15 / H1 / H4)',
      provider: 'Yahoo Finance 15m OHLC Candles',
      pollCadence: 'Every 60s',
      upstreamFrequency: 'Live 15-Min Session Bars',
      status: liveIntradayCount >= EDGE_FINDER_ASSETS.length - 4 ? 'LIVE' : 'PARTIAL',
      lastUpdated: nowIso
    },
    {
      key: 'daily_trend',
      name: 'Daily Trend, ADR & 30D History',
      provider: 'Yahoo Finance Daily Bars',
      pollCadence: 'Every 2m',
      upstreamFrequency: 'Rolling Daily Session',
      status: livePriceCount > 0 ? 'LIVE' : 'PARTIAL',
      lastUpdated: nowIso
    },
    {
      key: 'yields_dxy_vix',
      name: 'US Treasury Curve, DXY & VIX',
      provider: 'Yahoo Yields + St. Louis FRED',
      pollCadence: 'Every 5m',
      upstreamFrequency: 'Intraday Yields + Daily TIPS',
      status: macroInternals.yieldsSource === 'LIVE_FRED_YAHOO' ? 'LIVE' : 'PARTIAL',
      lastUpdated: macroInternals.fredUsMacro.updatedAt || nowIso
    },
    {
      key: 'cftc_cot',
      name: 'CFTC Commitments of Traders',
      provider: 'CFTC Socrata API (6dca-aqww)',
      pollCadence: 'Every 30m',
      upstreamFrequency: 'Weekly (Fridays 15:30 ET)',
      status: hasLiveCot ? 'LIVE' : 'BASELINE',
      lastUpdated: scorecards[0]?.cot.reportDate || nowIso
    },
    {
      key: 'central_banks',
      name: 'G8 Policy Rates & Macro Releases',
      provider: 'BIS SDMX + World Bank + IMF + Calendar',
      pollCadence: 'Every 60m (+ Calendar Surprises)',
      upstreamFrequency: 'Central Bank Meetings & Releases',
      status: macroSource === 'LIVE_BIS_WORLDBANK' ? 'LIVE' : 'BASELINE',
      lastUpdated: economies[0]?.updatedAt || nowIso
    },
    {
      key: 'smart_money',
      name: 'SEC Insiders, 13F & Bank Targets',
      provider: 'SEC Form 4 / 13F / Street Consensus',
      pollCadence: 'Every 60m',
      upstreamFrequency: 'Daily Filings & Ratings',
      status: smartMoney.bankAndStreetTargets.length > 0 ? 'LIVE' : 'PARTIAL',
      lastUpdated: smartMoney.updatedAt || nowIso
    },
    {
      key: 'seasonality',
      name: '10-Year Monthly Seasonality',
      provider: 'Yahoo Finance 10Y Monthly Closes',
      pollCadence: 'Every 6h',
      upstreamFrequency: 'Monthly Window Close',
      status: 'LIVE',
      lastUpdated: nowIso
    }
  ];

  const snapshot: EdgeFinderSnapshot = {
    generatedAt: nowIso,
    rollout,
    scorecards,
    economies,
    currencyStrength,
    futuresStrength,
    cryptoStrength,
    riskGauge,
    carryTrades,
    goldScorecard,
    macroInternals,
    smartMoney,
    correlations,
    calendar: {
      status: calendarStatus,
      upcomingHighImpact,
      allEventsCount: allEvents.length
    },
    syncStatus: {
      cftcSource: hasLiveCot ? 'CFTC_LIVE' : 'INSTITUTIONAL_MODEL',
      macroSource,
      yieldsSource: macroInternals.yieldsSource,
      intradaySource: liveIntradayCount >= EDGE_FINDER_ASSETS.length - 4 ? 'LIVE_15M_H1_H4' : 'PARTIAL',
      smartMoneyCount: smartMoney.insiders.length + smartMoney.whales.length + smartMoney.bankAndStreetTargets.length,
      livePriceCount,
      totalAssets: EDGE_FINDER_ASSETS.length,
      cacheAgeSeconds: 0,
      refreshIntervalSeconds: 60,
      feedCadences
    }
  };

  snapshotCache = { data: snapshot, cachedAt: Date.now() };
  return snapshot;
}

function runEdgeFinderSnapshotBuild(): Promise<EdgeFinderSnapshot> {
  const buildPromise = executeEdgeFinderSnapshotBuild().finally(() => {
    if (inFlightSnapshot === buildPromise) {
      inFlightSnapshot = null;
    }
  });
  inFlightSnapshot = buildPromise;
  return buildPromise;
}

export async function buildEdgeFinderSnapshot(forceRefresh = false): Promise<EdgeFinderSnapshot> {
  if (!forceRefresh && snapshotCache) {
    const ageMs = Date.now() - snapshotCache.cachedAt;
    if (ageMs < SNAPSHOT_TTL_MS) {
      return {
        ...snapshotCache.data,
        syncStatus: {
          ...snapshotCache.data.syncStatus,
          cacheAgeSeconds: Math.round(ageMs / 1000)
        }
      };
    }
    if (ageMs < SNAPSHOT_SWR_MAX_AGE_MS && !isTestEnv()) {
      if (!inFlightSnapshot) {
        void runEdgeFinderSnapshotBuild().catch(() => {});
      }
      return {
        ...snapshotCache.data,
        syncStatus: {
          ...snapshotCache.data.syncStatus,
          cacheAgeSeconds: Math.round(ageMs / 1000)
        }
      };
    }
  }

  if (!forceRefresh && inFlightSnapshot) {
    return inFlightSnapshot;
  }

  return runEdgeFinderSnapshotBuild();
}

export function startEdgeFinderBackgroundRefresh(intervalMs = 50_000): void {
  if (isTestEnv() || backgroundRefreshTimer) return;
  void buildEdgeFinderSnapshot(false).catch(() => {});
  backgroundRefreshTimer = setInterval(() => {
    if (!inFlightSnapshot) {
      void runEdgeFinderSnapshotBuild().catch(() => {});
    }
  }, intervalMs);
}

export function stopEdgeFinderBackgroundRefresh(): void {
  if (backgroundRefreshTimer) {
    clearInterval(backgroundRefreshTimer);
    backgroundRefreshTimer = null;
  }
}

export function clearEdgeFinderCaches(): void {
  snapshotCache = null;
  inFlightSnapshot = null;
  cotCache = null;
  macroExternalCache = null;
  macroInternalsCache = null;
  smartMoneyCache = null;
  for (const k of Object.keys(seasonalityCache)) {
    delete seasonalityCache[k];
  }
  for (const k of Object.keys(dailyMarketCache)) {
    delete dailyMarketCache[k];
  }
  for (const k of Object.keys(intradayMarketCache)) {
    delete intradayMarketCache[k];
  }
  historicalCandleCache.clear();
}

const historicalCandleCache = new Map<
  string,
  { fetchedAt: number; daily: Candle[]; intraday15m: Candle[]; intraday1h: Candle[]; monthlyReturns10Y: number[]; monthlyWinRate10Y: number[] }
>();

export interface HistoricalScorecardRequest {
  key: string;
  instrument: string;
  timestampIso: string;
  bias: string;
  convictionScore?: number;
  killzoneOrigin?: string;
}

export interface HistoricalScorecardResult {
  scorecard: AssetEdgeScorecard;
  dataSource: 'LIVE_15M_H1_H4' | 'HISTORICAL_1H' | 'DAILY_DERIVED';
}

async function fetchHistoricalAssetCandles(asset: AssetDefinition, earliestSignalMs: number) {
  const cached = historicalCandleCache.get(asset.instrument);
  if (cached && Date.now() - cached.fetchedAt < 10 * 60_000) {
    return cached;
  }

  const yahooSym = YAHOO_SYMBOL_MAP[asset.instrument];
  let daily: Candle[] = [];
  let intraday15m: Candle[] = [];
  let intraday1h: Candle[] = [];

  if (yahooSym) {
    const start150d = new Date(Math.min(Date.now() - 150 * 86_400_000, earliestSignalMs - 90 * 86_400_000));
    const max15mLookback = Date.now() - 57 * 86_400_000;
    const start15m = new Date(Math.max(max15mLookback, earliestSignalMs - 7 * 86_400_000));
    const need1hFallback = earliestSignalMs < max15mLookback;
    const start1h = new Date(Math.min(Date.now() - 180 * 86_400_000, earliestSignalMs - 14 * 86_400_000));

    const [dailyChart, m15Chart, h1Chart] = await Promise.all([
      runYahooLimited(() => yahooClient.chart(yahooSym, { period1: start150d, interval: '1d' }), 12_000).catch(() => null),
      runYahooLimited(() => yahooClient.chart(yahooSym, { period1: start15m, interval: '15m' }), 12_000).catch(() => null),
      need1hFallback
        ? runYahooLimited(() => yahooClient.chart(yahooSym, { period1: start1h, interval: '1h' }), 12_000).catch(() => null)
        : Promise.resolve(null)
    ]);

    const parseQuotes = (quotes: any[]): Candle[] =>
      (quotes || [])
        .filter((q) => q && q.open != null && q.high != null && q.low != null && q.close != null && q.date)
        .map((q) => ({
          open: roundTo(q.open, asset.decimals),
          high: roundTo(q.high, asset.decimals),
          low: roundTo(q.low, asset.decimals),
          close: roundTo(q.close, asset.decimals),
          volume: q.volume || 0,
          timestamp: new Date(q.date).toISOString()
        }))
        .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    daily = parseQuotes(dailyChart?.quotes || []);
    intraday15m = parseQuotes(m15Chart?.quotes || []);
    if (h1Chart?.quotes) {
      intraday1h = parseQuotes(h1Chart.quotes);
    }
  }

  const seasonal = await fetchYahooMonthlySeasonality(asset).catch(() => ({
    monthlyReturns10Y: new Array(12).fill(0),
    monthlyWinRate10Y: new Array(12).fill(50)
  }));

  const entry = {
    fetchedAt: Date.now(),
    daily,
    intraday15m,
    intraday1h,
    monthlyReturns10Y: seasonal.monthlyReturns10Y,
    monthlyWinRate10Y: seasonal.monthlyWinRate10Y
  };
  historicalCandleCache.set(asset.instrument, entry);
  return entry;
}

/**
 * Reconstructs strictly causal (zero look-ahead) point-in-time EdgeFinder scorecards
 * for historical signals using candles, CFTC COT reports, macro policy, and 10Y seasonality
 * sliced strictly <= each signal's creation timestamp.
 */
export async function reconstructHistoricalScorecardsAtTimestamps(
  requests: HistoricalScorecardRequest[]
): Promise<Map<string, HistoricalScorecardResult>> {
  const results = new Map<string, HistoricalScorecardResult>();
  if (!requests || requests.length === 0) return results;

  const allEvents = newsEngine.getAllEvents();
  const [liveCot, macroRes] = await Promise.all([
    fetchLiveCftcCot(),
    getMacroEconomies(allEvents)
  ]);

  const econByCode = macroRes.economies.reduce((acc, e) => {
    acc[e.currency] = e;
    return acc;
  }, {} as Record<EconomyCode, MacroEconomyData>);

  // Group requests by resolved EdgeFinder asset
  const byInstrument = new Map<string, { asset: AssetDefinition; items: HistoricalScorecardRequest[]; minMs: number }>();
  for (const req of requests) {
    const resolved = resolveEdgeFinderInstrument(req.instrument);
    const asset = EDGE_FINDER_ASSETS.find(
      (a) => a.instrument.toUpperCase() === resolved || a.instrument.toUpperCase().replace(/[^A-Z0-9]/g, '') === resolved.replace(/[^A-Z0-9]/g, '')
    );
    if (!asset) continue;
    const tsMs = new Date(req.timestampIso).getTime();
    if (!Number.isFinite(tsMs)) continue;
    const existing = byInstrument.get(asset.instrument);
    if (!existing) {
      byInstrument.set(asset.instrument, { asset, items: [req], minMs: tsMs });
    } else {
      existing.items.push(req);
      if (tsMs < existing.minMs) existing.minMs = tsMs;
    }
  }

  const assetGroups = Array.from(byInstrument.values());
  await mapWithConcurrency(assetGroups, 8, async (group) => {
    const { asset, items, minMs } = group;
    const histData = await fetchHistoricalAssetCandles(asset, minMs);
    const { cot: baseCot, retailSentiment: baseRetail, weeklySeries } = buildCotAndRetailFromLive(asset, liveCot);
    const baseSeasonality = deriveSeasonality(asset, histData.monthlyReturns10Y, histData.monthlyWinRate10Y);

    for (const item of items) {
      const targetMs = new Date(item.timestampIso).getTime();
      const targetDateStr = item.timestampIso.slice(0, 10);

      // Strictly causal candle slicing <= signal timestamp
      const candles = histData.daily.filter((c) => c.timestamp.slice(0, 10) <= targetDateStr);
      const candles15m = histData.intraday15m.filter((c) => new Date(c.timestamp).getTime() <= targetMs);
      const candles1h = histData.intraday1h.filter((c) => new Date(c.timestamp).getTime() <= targetMs);

      const closes = candles.map((c) => c.close);
      const last15mClose = candles15m.length > 0 ? candles15m[candles15m.length - 1].close : null;
      const last1hClose = candles1h.length > 0 ? candles1h[candles1h.length - 1].close : null;
      const currentPrice = last15mClose ?? last1hClose ?? closes[closes.length - 1] ?? 0;

      const ema5 = closes.length > 0 ? roundTo(calcEma(closes, Math.min(5, closes.length)), asset.decimals) : 0;
      const ema20 = closes.length > 0 ? roundTo(calcEma(closes, Math.min(20, closes.length)), asset.decimals) : 0;
      const ema50 = closes.length > 0 ? roundTo(calcEma(closes, Math.min(50, closes.length)), asset.decimals) : 0;
      const rsi14 = closes.length > 14 ? calcRsi(closes, 14) : 50;
      const atr14 = candles.length > 1 ? roundTo(calcAtr(candles, 14), asset.decimals) : 0;
      const atrPct = currentPrice > 0 ? roundTo((atr14 / currentPrice) * 100, 2) : 0;
      const high30d = candles.length > 0 ? roundTo(Math.max(...candles.slice(-30).map((c) => c.high)), asset.decimals) : currentPrice;
      const low30d = candles.length > 0 ? roundTo(Math.min(...candles.slice(-30).map((c) => c.low)), asset.decimals) : currentPrice;
      const distanceFromEma20Pct = ema20 > 0 ? roundTo(((currentPrice - ema20) / ema20) * 100, 2) : 0;

      const close5Ago = closes.length >= 6 ? closes[closes.length - 6] : closes[0] || currentPrice;
      const close20Ago = closes.length >= 21 ? closes[closes.length - 21] : closes[0] || currentPrice;
      const close22Ago = closes.length >= 23 ? closes[closes.length - 23] : closes[0] || currentPrice;
      const return5dPct = close5Ago > 0 ? roundTo(((currentPrice - close5Ago) / close5Ago) * 100, 2) : 0;
      const return20dPct = close20Ago > 0 ? roundTo(((currentPrice - close20Ago) / close20Ago) * 100, 2) : 0;
      const returnMonthlyPct = close22Ago > 0 ? ((currentPrice - close22Ago) / close22Ago) * 100 : return20dPct;

      const latestCandle = candles[candles.length - 1];
      const todayRange = latestCandle ? Math.max(latestCandle.high - latestCandle.low, 0) : 0;
      const dayRangePctOfAtr = atr14 > 0 ? roundTo((todayRange / atr14) * 100, 1) : 0;
      const recent30 = candles.slice(-30);
      const trList30 = recent30.slice(1).map((c, rIdx) => {
        const prevC = recent30[rIdx].close;
        return Math.max(c.high - c.low, Math.abs(c.high - prevC), Math.abs(c.low - prevC));
      });
      const trUnderOrEq = trList30.filter((tr) => tr <= todayRange).length;
      const volatilityPercentile30d = trList30.length > 0 ? Math.round((trUnderOrEq / trList30.length) * 100) : 50;

      const d5Sig: 'Bullish' | 'Bearish' | 'Flat' =
        return5dPct >= 0.25 && currentPrice > ema5 ? 'Bullish' : return5dPct <= -0.25 && currentPrice < ema5 ? 'Bearish' : 'Flat';
      const d20Sig: 'Bullish' | 'Bearish' | 'Flat' =
        currentPrice > ema20 && return20dPct >= 0.4 ? 'Bullish' : currentPrice < ema20 && return20dPct <= -0.4 ? 'Bearish' : 'Flat';
      const d50Sig: 'Bullish' | 'Bearish' | 'Flat' =
        currentPrice > ema50 && ema20 > ema50 ? 'Bullish' : currentPrice < ema50 && ema20 < ema50 ? 'Bearish' : 'Flat';
      const monthlySig: 'Bullish' | 'Bearish' | 'Flat' =
        returnMonthlyPct >= 0.5 && currentPrice > ema50 ? 'Bullish' : returnMonthlyPct <= -0.5 && currentPrice < ema50 ? 'Bearish' : 'Flat';

      const trendScoreRaw: -1 | 0 | 1 =
        currentPrice > 0 && currentPrice > ema20 && ema20 >= ema50 ? 1 :
        currentPrice > 0 && currentPrice < ema20 && ema20 <= ema50 ? -1 : 0;
      const trendDirection: AssetEdgeScorecard['technical']['trendDirection'] =
        trendScoreRaw === 1 ? 'Bullish' : trendScoreRaw === -1 ? 'Bearish' : 'Ranging';

      // Point-in-time intraday metrics (15m preferred, 1h fallback if signal >57d old, else daily)
      let intraday = computeIntradayMetrics(candles15m, currentPrice, trendDirection, rsi14, return5dPct);
      let dataSource: HistoricalScorecardResult['dataSource'] =
        intraday.intradaySource === 'LIVE_15M_H1_H4' ? 'LIVE_15M_H1_H4' : 'DAILY_DERIVED';
      if (intraday.intradaySource !== 'LIVE_15M_H1_H4' && candles1h.length >= 16 && currentPrice > 0) {
        const h1Closes = candles1h.map((c) => c.close);
        const h1Fast = calcEma(h1Closes, Math.min(20, h1Closes.length));
        const h1Slow = calcEma(h1Closes, Math.min(50, h1Closes.length));
        const h1Sig = emaTrendSignal(currentPrice, h1Fast, h1Slow);
        const h4Candles = aggregateCandles(candles1h, 4);
        const h4Closes = h4Candles.map((c) => c.close);
        const h4Fast = calcEma(h4Closes, Math.min(12, Math.max(2, h4Closes.length)));
        const h4Slow = calcEma(h4Closes, Math.min(26, Math.max(3, h4Closes.length)));
        const h4Sig = h4Closes.length >= 6 ? emaTrendSignal(currentPrice, h4Fast, h4Slow) : h1Sig;
        const c1h = h1Closes.length >= 2 ? h1Closes[h1Closes.length - 2] : h1Closes[0];
        const c4h = h1Closes.length >= 5 ? h1Closes[h1Closes.length - 5] : h1Closes[0];
        intraday = {
          m15Sig: h1Sig,
          h1Sig,
          h4Sig,
          rsi14M15: calcRsi(h1Closes, Math.min(14, Math.max(2, h1Closes.length - 1))),
          rsi14H1: calcRsi(h1Closes, Math.min(14, Math.max(2, h1Closes.length - 1))),
          rsi14H4: h4Closes.length >= 5 ? calcRsi(h4Closes, Math.min(14, h4Closes.length - 1)) : 50,
          return1hPct: c1h > 0 ? roundTo(((currentPrice - c1h) / c1h) * 100, 2) : 0,
          return4hPct: c4h > 0 ? roundTo(((currentPrice - c4h) / c4h) * 100, 2) : 0,
          intradaySource: 'DAILY_DERIVED'
        };
        dataSource = 'HISTORICAL_1H';
      }

      // Causal CFTC COT & Retail Contrarian as of targetDateStr
      const cotHist = cotSignalsForDate(weeklySeries, targetDateStr, baseCot.cotScore * 1.5, baseRetail.sentimentScore * 1.0);
      const histCotScore: -1 | 0 | 1 = cotHist.cot > 0 ? 1 : cotHist.cot < 0 ? -1 : 0;
      const histRetailScore: -1 | 0 | 1 = cotHist.retail > 0 ? 1 : cotHist.retail < 0 ? -1 : 0;
      const cot: CotPositioningRecord = { ...baseCot, cotScore: histCotScore };
      const retailSentiment: RetailSentimentRecord = { ...baseRetail, sentimentScore: histRetailScore };

      // Point-in-time month seasonality
      const targetMonthIdx = new Date(item.timestampIso).getUTCMonth();
      const monthAvg = histData.monthlyReturns10Y[targetMonthIdx] ?? baseSeasonality.currentMonthAvgReturn;
      const monthWr = histData.monthlyWinRate10Y[targetMonthIdx] ?? baseSeasonality.currentMonthWinRate;
      const seasonalityScore: -1 | 0 | 1 = monthAvg >= 0.35 && monthWr >= 55 ? 1 : monthAvg <= -0.35 && monthWr <= 45 ? -1 : 0;
      const seasonality: SeasonalityRecord = {
        ...baseSeasonality,
        currentMonthIndex: targetMonthIdx,
        currentMonthAvgReturn: monthAvg,
        currentMonthWinRate: monthWr,
        seasonalityScore
      };

      const { factors: macroFactors, tugOfWar } = buildMacroTugOfWar(asset, econByCode, cot, trendDirection);

      const synthSetup: EdgeSetup = {
        id: item.key,
        instrument: asset.instrument,
        market: asset.assetClass === 'forex' ? 'forex' : 'futures',
        created_at: item.timestampIso,
        killzone_origin: item.killzoneOrigin || 'NY_AM',
        bias: (item.bias || 'long').toLowerCase() === 'short' ? 'short' : 'long',
        entry_zone_low: currentPrice,
        entry_zone_high: currentPrice,
        entry_zone_mid: currentPrice,
        stop: currentPrice,
        tp1: currentPrice,
        signal_state: 'active',
        superseded: 0,
        tradable: 1,
        conviction_score: item.convictionScore ?? 80
      };

      const preMannaScore =
        cotHist.cot +
        cotHist.retail +
        seasonalityScore * 0.75 +
        trendScoreRaw * 1.25 +
        macroFactors.reduce((s, f) => s + f.signal * f.weight, 0);

      const { signal: mannaSignal, killzoneAlignment } = computeKillzoneAlignment(
        asset.instrument,
        [synthSetup],
        preMannaScore
      );

      const factors: FactorBreakdownItem[] = [
        { key: 'cot', label: 'COT Smart Money', category: 'Sentiment', signal: histCotScore, weight: 1.5, contribution: roundTo(cotHist.cot, 2), detail: `COT ${targetDateStr}` },
        { key: 'retailSentiment', label: 'Retail Contrarian', category: 'Sentiment', signal: histRetailScore, weight: 1.0, contribution: roundTo(cotHist.retail, 2), detail: `Retail ${targetDateStr}` },
        { key: 'seasonality', label: '10Y Live Seasonality', category: 'Statistical', signal: seasonalityScore, weight: 0.75, contribution: roundTo(seasonalityScore * 0.75, 2), detail: `Month ${targetMonthIdx + 1}` },
        { key: 'trend', label: 'Daily EMA & RSI Trend', category: 'Technical', signal: trendScoreRaw, weight: 1.25, contribution: roundTo(trendScoreRaw * 1.25, 2), detail: trendDirection },
        ...macroFactors.map((mf) => ({ ...mf, contribution: roundTo(mf.signal * mf.weight, 2) })),
        { key: 'mannaKillzone', label: 'Manna Killzone Order-Flow', category: 'Manna Flow', signal: mannaSignal, weight: 0.75, contribution: roundTo(mannaSignal * 0.75, 2), detail: 'Signal active' }
      ];

      const totalScore = roundTo(clamp(factors.reduce((s, f) => s + f.contribution, 0), -10, 10), 2);
      const fundamentalScore = roundTo(macroFactors.reduce((s, f) => s + f.signal * f.weight, 0), 2);

      const { timeframes, timeframeConfluence } = buildTimeframeProfiles({
        asset,
        swingScore: totalScore,
        fundamentalScore,
        trendScoreRaw,
        mannaSignal,
        cot,
        retailSentiment,
        seasonality,
        killzoneAlignment,
        m15Sig: intraday.m15Sig,
        h1Sig: intraday.h1Sig,
        h4Sig: intraday.h4Sig,
        d5Sig,
        d20Sig,
        d50Sig,
        monthlySig,
        rsi14M15: intraday.rsi14M15,
        rsi14H1: intraday.rsi14H1,
        rsi14D1: rsi14,
        return1hPct: intraday.return1hPct,
        return4hPct: intraday.return4hPct,
        atrPct,
        dayRangePctOfAtr
      });

      const allTfs = [intraday.m15Sig, intraday.h1Sig, intraday.h4Sig, d5Sig, d20Sig, d50Sig, monthlySig];
      const alignedCount = Math.max(
        allTfs.filter((t) => t === 'Bullish').length,
        allTfs.filter((t) => t === 'Bearish').length
      );

      const scorecard: AssetEdgeScorecard = {
        instrument: asset.instrument,
        displayName: asset.displayName,
        assetClass: asset.assetClass,
        category: asset.category,
        baseCurrency: asset.baseCurrency,
        quoteCurrency: asset.quoteCurrency,
        currentPrice,
        dailyChangePct: 0,
        priceSource: 'LIVE',
        totalScore,
        biasLabel: classifyBiasLabel(totalScore),
        timeframes,
        timeframeConfluence,
        cotScore: cotHist.cot,
        retailScore: cotHist.retail,
        seasonalityScore: roundTo(seasonalityScore * 0.75, 2),
        trendScore: roundTo(trendScoreRaw * 1.25, 2),
        fundamentalScore,
        mannaFlowScore: roundTo(mannaSignal * 0.75, 2),
        factors,
        tugOfWar,
        technical: {
          ema5, ema20, ema50, rsi14,
          rsi14M15: intraday.rsi14M15, rsi14H1: intraday.rsi14H1, rsi14H4: intraday.rsi14H4,
          atr14, atrPct, high30d, low30d, trendDirection, distanceFromEma20Pct,
          dayRangePctOfAtr, volatilityPercentile30d,
          return1hPct: intraday.return1hPct, return4hPct: intraday.return4hPct, return5dPct, return20dPct,
          intradaySource: intraday.intradaySource,
          mtfAlignment: {
            m15: intraday.m15Sig, h1: intraday.h1Sig, h4: intraday.h4Sig,
            d5: d5Sig, d20: d20Sig, d50: d50Sig, monthly: monthlySig, alignedCount
          }
        },
        cot,
        retailSentiment,
        seasonality,
        killzoneAlignment,
        historicalSeries: []
      };

      results.set(item.key, { scorecard, dataSource });
    }
  });

  return results;
}
