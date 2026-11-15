import fs from 'fs';
import path from 'path';
import { queryDb } from '../db/database';
import { getAllActiveSetups } from '../db/queries';
import { Candle, EdgeSetup } from '../discovery/types';
import { getLiveCandles, getLiveCurrentPrice } from '../discovery/yahoo-provider';
import { EconomicEvent, newsEngine } from '../news/news-engine';

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
  netChangeWoW: number;
  longPct: number;
  shortPct: number;
  openInterest: number;
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
  category: 'Major FX' | 'Cross FX' | 'Equity Index' | 'Metals' | 'Energy' | 'Rates';
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
    ema20: number;
    ema50: number;
    rsi14: number;
    atr14: number;
    atrPct: number;
    high30d: number;
    low30d: number;
    trendDirection: 'Bullish' | 'Bearish' | 'Ranging';
    distanceFromEma20Pct: number;
  };
  cot: CotPositioningRecord;
  retailSentiment: RetailSentimentRecord;
  seasonality: SeasonalityRecord;
  killzoneAlignment: KillzoneAlignment;
  historicalSeries: HistoricalScorePoint[];
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

export interface EdgeFinderSnapshot {
  generatedAt: string;
  rollout: EdgeFinderRollout;
  scorecards: AssetEdgeScorecard[];
  economies: MacroEconomyData[];
  currencyStrength: CurrencyStrengthItem[];
  riskGauge: RiskGauge;
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
    livePriceCount: number;
    totalAssets: number;
    cacheAgeSeconds: number;
  };
}

const ROLLOUT_KEY = 'edge_finder_rollout';
const MACRO_OVERRIDES_KEY = 'edge_finder_macro_overrides';
const SNAPSHOT_FILE = path.join(process.cwd(), 'edge_finder_settings_snapshot.json');
const CFTC_ENDPOINT = 'https://publicreporting.cftc.gov/resource/6dca-aqww.json';

interface AssetDefinition {
  instrument: string;
  displayName: string;
  assetClass: 'forex' | 'futures';
  category: AssetEdgeScorecard['category'];
  baseCurrency: string;
  quoteCurrency: string;
  referencePrice: number;
  decimals: number;
  cftcCode: string;
  contractName: string;
  baseCotNet: number;
  baseCotLongPct: number;
  baseRetailLongPct: number;
  bestKillzone: 'ASIA' | 'LONDON' | 'NY_AM' | 'NY_PM';
  killzoneNotes: string;
  monthlyReturns10Y: number[];
  monthlyWinRate10Y: number[];
}

export const EDGE_FINDER_ASSETS: AssetDefinition[] = [
  {
    instrument: 'EUR/USD',
    displayName: 'Euro / US Dollar',
    assetClass: 'forex',
    category: 'Major FX',
    baseCurrency: 'EUR',
    quoteCurrency: 'USD',
    referencePrice: 1.0845,
    decimals: 5,
    cftcCode: '099741',
    contractName: 'EURO FX - CHICAGO MERCANTILE EXCHANGE',
    baseCotNet: 41200,
    baseCotLongPct: 58.4,
    baseRetailLongPct: 64.2,
    bestKillzone: 'LONDON',
    killzoneNotes: 'Highest institutional displacement during London Open (02:00-05:00 NY) & NY AM overlap.',
    monthlyReturns10Y: [-0.42, -0.31, 0.28, 0.65, -0.58, 0.72, 0.54, -0.21, -0.68, -0.35, -0.18, 1.12],
    monthlyWinRate10Y: [40, 40, 60, 70, 30, 70, 60, 50, 30, 40, 50, 80]
  },
  {
    instrument: 'GBP/USD',
    displayName: 'British Pound / US Dollar',
    assetClass: 'forex',
    category: 'Major FX',
    baseCurrency: 'GBP',
    quoteCurrency: 'USD',
    referencePrice: 1.2715,
    decimals: 5,
    cftcCode: '096742',
    contractName: 'BRITISH POUND - CHICAGO MERCANTILE EXCHANGE',
    baseCotNet: 54800,
    baseCotLongPct: 63.1,
    baseRetailLongPct: 53.4,
    bestKillzone: 'LONDON',
    killzoneNotes: 'Sharp liquidity sweeps at 02:30-04:00 NY prior to FTSE/Gilt cash expansion.',
    monthlyReturns10Y: [0.34, -0.45, 0.18, 1.18, -0.62, 0.24, 0.76, -0.51, -0.84, 0.29, 0.41, 0.89],
    monthlyWinRate10Y: [60, 40, 50, 80, 30, 60, 70, 40, 30, 60, 60, 70]
  },
  {
    instrument: 'USD/JPY',
    displayName: 'US Dollar / Japanese Yen',
    assetClass: 'forex',
    category: 'Major FX',
    baseCurrency: 'USD',
    quoteCurrency: 'JPY',
    referencePrice: 152.85,
    decimals: 3,
    cftcCode: '097741',
    contractName: 'JAPANESE YEN - CHICAGO MERCANTILE EXCHANGE',
    baseCotNet: -62400,
    baseCotLongPct: 37.8,
    baseRetailLongPct: 34.6,
    bestKillzone: 'ASIA',
    killzoneNotes: 'Tokyo Fix (19:55 NY) & NY AM US10Y yield auction drive trend continuations.',
    monthlyReturns10Y: [-0.22, 0.48, 0.56, 0.71, 0.34, 0.82, -0.58, -0.44, 0.69, 0.74, 0.52, -0.64],
    monthlyWinRate10Y: [40, 60, 70, 70, 60, 70, 30, 40, 70, 70, 60, 30]
  },
  {
    instrument: 'AUD/USD',
    displayName: 'Australian Dollar / US Dollar',
    assetClass: 'forex',
    category: 'Major FX',
    baseCurrency: 'AUD',
    quoteCurrency: 'USD',
    referencePrice: 0.658,
    decimals: 5,
    cftcCode: '232741',
    contractName: 'AUSTRALIAN DOLLAR - CHICAGO MERCANTILE EXCHANGE',
    baseCotNet: 18900,
    baseCotLongPct: 54.6,
    baseRetailLongPct: 68.5,
    bestKillzone: 'ASIA',
    killzoneNotes: 'Tracks RBA cash prints & China/Asia equity risk open at 20:00-22:30 NY.',
    monthlyReturns10Y: [-0.52, 0.24, 0.31, 0.94, -0.48, 0.56, 0.44, -0.78, -0.62, 0.19, 0.68, 1.05],
    monthlyWinRate10Y: [40, 60, 50, 70, 40, 60, 60, 30, 30, 50, 70, 80]
  },
  {
    instrument: 'USD/CAD',
    displayName: 'US Dollar / Canadian Dollar',
    assetClass: 'forex',
    category: 'Major FX',
    baseCurrency: 'USD',
    quoteCurrency: 'CAD',
    referencePrice: 1.3895,
    decimals: 5,
    cftcCode: '090741',
    contractName: 'CANADIAN DOLLAR - CHICAGO MERCANTILE EXCHANGE',
    baseCotNet: -48500,
    baseCotLongPct: 39.2,
    baseRetailLongPct: 36.1,
    bestKillzone: 'NY_AM',
    killzoneNotes: 'Dual North American 08:30 NY macro releases & WTI Crude correlation spikes.',
    monthlyReturns10Y: [0.46, 0.28, -0.19, -0.78, 0.52, -0.61, -0.18, 0.64, 0.58, 0.32, 0.41, -0.49],
    monthlyWinRate10Y: [60, 60, 40, 30, 70, 30, 40, 70, 70, 60, 60, 40]
  },
  {
    instrument: 'EUR/GBP',
    displayName: 'Euro / British Pound',
    assetClass: 'forex',
    category: 'Cross FX',
    baseCurrency: 'EUR',
    quoteCurrency: 'GBP',
    referencePrice: 0.8528,
    decimals: 5,
    cftcCode: '099741',
    contractName: 'EURO FX vs BRITISH POUND CROSS',
    baseCotNet: -13600,
    baseCotLongPct: 45.2,
    baseRetailLongPct: 66.8,
    bestKillzone: 'LONDON',
    killzoneNotes: 'Tight mean-reversion sweeps between 02:00 and 05:00 NY around BoE/ECB repricing.',
    monthlyReturns10Y: [-0.62, 0.14, 0.08, -0.44, 0.19, 0.41, -0.22, 0.34, 0.18, -0.46, -0.52, 0.24],
    monthlyWinRate10Y: [30, 50, 50, 30, 60, 60, 40, 60, 50, 30, 30, 60]
  },
  {
    instrument: 'GBP/JPY',
    displayName: 'British Pound / Japanese Yen',
    assetClass: 'forex',
    category: 'Cross FX',
    baseCurrency: 'GBP',
    quoteCurrency: 'JPY',
    referencePrice: 194.35,
    decimals: 3,
    cftcCode: '096742',
    contractName: 'BRITISH POUND vs JAPANESE YEN CROSS',
    baseCotNet: 117200,
    baseCotLongPct: 69.5,
    baseRetailLongPct: 33.8,
    bestKillzone: 'LONDON',
    killzoneNotes: 'High-beta risk proxy; London Open expansions often deliver 1.5x daily ADR.',
    monthlyReturns10Y: [0.18, 0.12, 0.72, 1.64, -0.34, 0.98, 0.21, -0.89, -0.22, 0.96, 0.88, 0.26],
    monthlyWinRate10Y: [50, 50, 70, 80, 40, 70, 60, 30, 40, 70, 70, 60]
  },
  {
    instrument: 'EUR/JPY',
    displayName: 'Euro / Japanese Yen',
    assetClass: 'forex',
    category: 'Cross FX',
    baseCurrency: 'EUR',
    quoteCurrency: 'JPY',
    referencePrice: 165.75,
    decimals: 3,
    cftcCode: '099741',
    contractName: 'EURO FX vs JAPANESE YEN CROSS',
    baseCotNet: 103600,
    baseCotLongPct: 66.2,
    baseRetailLongPct: 38.4,
    bestKillzone: 'LONDON',
    killzoneNotes: 'Strong carry differential sensitivity across European & NY morning bond auctions.',
    monthlyReturns10Y: [-0.56, 0.18, 0.78, 1.28, -0.21, 1.44, -0.06, -0.62, -0.04, 0.39, 0.34, 0.48],
    monthlyWinRate10Y: [40, 50, 70, 70, 40, 80, 50, 30, 50, 60, 60, 60]
  },
  {
    instrument: 'ES',
    displayName: 'E-Mini S&P 500 Futures',
    assetClass: 'futures',
    category: 'Equity Index',
    baseCurrency: 'SPX',
    quoteCurrency: 'USD',
    referencePrice: 5985.5,
    decimals: 2,
    cftcCode: '13874A',
    contractName: 'E-MINI S&P 500 - CHICAGO MERCANTILE EXCHANGE',
    baseCotNet: 88400,
    baseCotLongPct: 61.4,
    baseRetailLongPct: 39.5,
    bestKillzone: 'NY_AM',
    killzoneNotes: '09:30 NY Cash Equities Open & 10:00 Silver Bullet windows anchor primary displacement.',
    monthlyReturns10Y: [1.45, 0.22, 1.62, 2.35, 0.92, 1.38, 2.64, -0.28, -1.85, 1.42, 3.12, 1.48],
    monthlyWinRate10Y: [60, 60, 70, 80, 70, 70, 80, 50, 30, 60, 80, 70]
  },
  {
    instrument: 'NQ',
    displayName: 'E-Mini Nasdaq-100 Futures',
    assetClass: 'futures',
    category: 'Equity Index',
    baseCurrency: 'NDX',
    quoteCurrency: 'USD',
    referencePrice: 21140.25,
    decimals: 2,
    cftcCode: '209742',
    contractName: 'NASDAQ MINI - CHICAGO MERCANTILE EXCHANGE',
    baseCotNet: 44600,
    baseCotLongPct: 60.2,
    baseRetailLongPct: 37.2,
    bestKillzone: 'NY_AM',
    killzoneNotes: 'Mega-cap tech flows at 09:30-11:30 NY; sensitive to real yield & CPI surprises.',
    monthlyReturns10Y: [2.38, 0.54, 1.94, 2.68, 1.85, 2.12, 3.42, 0.45, -2.14, 1.92, 3.85, 1.72],
    monthlyWinRate10Y: [70, 60, 70, 80, 70, 70, 90, 60, 30, 70, 80, 70]
  },
  {
    instrument: 'YM',
    displayName: 'E-Mini Dow Jones Futures',
    assetClass: 'futures',
    category: 'Equity Index',
    baseCurrency: 'DJI',
    quoteCurrency: 'USD',
    referencePrice: 43890.0,
    decimals: 0,
    cftcCode: '124603',
    contractName: 'DOW JONES INDUSTRIAL AVG - CBOT',
    baseCotNet: 21400,
    baseCotLongPct: 57.1,
    baseRetailLongPct: 44.8,
    bestKillzone: 'NY_AM',
    killzoneNotes: 'Value/cyclical sector rotation benchmark during NY AM & PM Power Hour.',
    monthlyReturns10Y: [0.94, 0.18, 1.12, 2.04, 0.48, 0.96, 2.15, -0.41, -1.62, 1.38, 2.94, 1.22],
    monthlyWinRate10Y: [60, 50, 60, 80, 60, 70, 80, 40, 30, 60, 80, 70]
  },
  {
    instrument: 'RTY',
    displayName: 'E-Mini Russell 2000 Futures',
    assetClass: 'futures',
    category: 'Equity Index',
    baseCurrency: 'RUT',
    quoteCurrency: 'USD',
    referencePrice: 2315.4,
    decimals: 1,
    cftcCode: '239742',
    contractName: 'RUSSELL E-MINI - CHICAGO MERCANTILE EXCHANGE',
    baseCotNet: -14800,
    baseCotLongPct: 45.6,
    baseRetailLongPct: 61.8,
    bestKillzone: 'NY_PM',
    killzoneNotes: 'High sensitivity to domestic PMI, regional banking liquidity, and NY PM closing sweeps.',
    monthlyReturns10Y: [0.42, 0.68, 0.44, 1.56, 0.34, 1.18, 2.42, -0.82, -2.28, 0.86, 4.18, 1.65],
    monthlyWinRate10Y: [50, 60, 50, 70, 50, 60, 80, 40, 20, 60, 80, 70]
  },
  {
    instrument: 'GC',
    displayName: 'Gold Futures (COMEX)',
    assetClass: 'futures',
    category: 'Metals',
    baseCurrency: 'XAU',
    quoteCurrency: 'USD',
    referencePrice: 2684.6,
    decimals: 2,
    cftcCode: '088691',
    contractName: 'GOLD - COMMODITY EXCHANGE INC.',
    baseCotNet: 248500,
    baseCotLongPct: 74.2,
    baseRetailLongPct: 41.2,
    bestKillzone: 'NY_AM',
    killzoneNotes: 'LBMA 03:00 NY & COMEX 08:20-10:30 NY opens produce textbook FVG displacement.',
    monthlyReturns10Y: [2.42, 0.34, 0.62, 1.38, 0.14, 0.28, 1.84, 1.12, -1.48, 0.64, -0.22, 1.94],
    monthlyWinRate10Y: [80, 60, 60, 70, 50, 50, 70, 70, 30, 60, 40, 80]
  },
  {
    instrument: 'SI',
    displayName: 'Silver Futures (COMEX)',
    assetClass: 'futures',
    category: 'Metals',
    baseCurrency: 'XAG',
    quoteCurrency: 'USD',
    referencePrice: 31.42,
    decimals: 3,
    cftcCode: '084691',
    contractName: 'SILVER - COMMODITY EXCHANGE INC.',
    baseCotNet: 52400,
    baseCotLongPct: 68.8,
    baseRetailLongPct: 65.4,
    bestKillzone: 'NY_AM',
    killzoneNotes: 'High-beta metals amplification; watch SMT divergence against GC at London/NY opens.',
    monthlyReturns10Y: [2.18, 0.16, 0.42, 1.95, -0.35, -0.18, 2.74, 0.92, -2.35, 1.14, 0.42, 2.48],
    monthlyWinRate10Y: [70, 50, 50, 70, 40, 50, 70, 60, 30, 60, 50, 70]
  },
  {
    instrument: 'CL',
    displayName: 'WTI Crude Oil Futures (NYMEX)',
    assetClass: 'futures',
    category: 'Energy',
    baseCurrency: 'WTI',
    quoteCurrency: 'USD',
    referencePrice: 70.65,
    decimals: 2,
    cftcCode: '067651',
    contractName: 'WTI FINANCIAL CRUDE OIL - NEW YORK MERCANTILE EXCHANGE',
    baseCotNet: 164200,
    baseCotLongPct: 61.5,
    baseRetailLongPct: 69.2,
    bestKillzone: 'NY_AM',
    killzoneNotes: 'NYMEX 09:00 NY pit & Wednesday 10:30 EIA inventories govern institutional liquidity.',
    monthlyReturns10Y: [1.85, 1.42, 1.24, 3.12, 1.65, 2.28, -0.94, -1.86, -1.12, -0.68, -2.42, 0.85],
    monthlyWinRate10Y: [60, 60, 60, 80, 70, 70, 40, 30, 40, 50, 30, 60]
  },
  {
    instrument: 'ZN',
    displayName: '10-Year US Treasury Note Futures',
    assetClass: 'futures',
    category: 'Rates',
    baseCurrency: 'UST10',
    quoteCurrency: 'USD',
    referencePrice: 110.28,
    decimals: 3,
    cftcCode: '043602',
    contractName: 'UST 10Y NOTE - CHICAGO BOARD OF TRADE',
    baseCotNet: -428000,
    baseCotLongPct: 34.1,
    baseRetailLongPct: 58.6,
    bestKillzone: 'NY_AM',
    killzoneNotes: '08:30 NY CPI/NFP & 13:00 NY Treasury auctions anchor macro rate volatility.',
    monthlyReturns10Y: [0.44, -0.52, 0.28, -0.34, 0.42, 0.31, 0.48, 0.36, -0.64, -0.48, 0.56, 0.18],
    monthlyWinRate10Y: [60, 30, 60, 40, 60, 60, 70, 60, 30, 40, 60, 50]
  }
];

const DEFAULT_MACRO_ECONOMIES: MacroEconomyData[] = [
  {
    currency: 'USD',
    country: 'United States',
    centralBank: 'Federal Reserve (FOMC)',
    rate: 4.50,
    nextMeeting: 'Dec 18',
    rateExpectation: 'Hold',
    stance: 'Hawkish',
    gdpQoQ: 2.8,
    cpiYoY: 2.6,
    coreCpiYoY: 3.3,
    pmiManufacturing: 48.5,
    pmiServices: 56.0,
    unemploymentRate: 4.1,
    retailSalesMoM: 0.4,
    economicScore: 4.5,
    surpriseScore: 0.5,
    notes: 'Resilient labor & services consumption keep real yields elevated vs G8 peers.',
    updatedAt: new Date().toISOString()
  },
  {
    currency: 'EUR',
    country: 'Eurozone',
    centralBank: 'European Central Bank (ECB)',
    rate: 3.25,
    nextMeeting: 'Dec 12',
    rateExpectation: 'Cut',
    stance: 'Dovish',
    gdpQoQ: 0.9,
    cpiYoY: 2.0,
    coreCpiYoY: 2.7,
    pmiManufacturing: 46.0,
    pmiServices: 51.6,
    unemploymentRate: 6.3,
    retailSalesMoM: 0.5,
    economicScore: -2.0,
    surpriseScore: -0.3,
    notes: 'Core industrial softness favors gradual ECB easing cycle toward neutral.',
    updatedAt: new Date().toISOString()
  },
  {
    currency: 'GBP',
    country: 'United Kingdom',
    centralBank: 'Bank of England (BoE)',
    rate: 4.75,
    nextMeeting: 'Dec 19',
    rateExpectation: 'Hold',
    stance: 'Hawkish',
    gdpQoQ: 1.1,
    cpiYoY: 2.3,
    coreCpiYoY: 3.3,
    pmiManufacturing: 49.9,
    pmiServices: 52.0,
    unemploymentRate: 4.3,
    retailSalesMoM: 0.3,
    economicScore: 3.0,
    surpriseScore: 0.3,
    notes: 'Sticky services inflation supports higher UK terminal carry relative to EUR.',
    updatedAt: new Date().toISOString()
  },
  {
    currency: 'JPY',
    country: 'Japan',
    centralBank: 'Bank of Japan (BoJ)',
    rate: 0.25,
    nextMeeting: 'Dec 19',
    rateExpectation: 'Hike',
    stance: 'Hawkish',
    gdpQoQ: 0.9,
    cpiYoY: 2.5,
    coreCpiYoY: 2.3,
    pmiManufacturing: 49.2,
    pmiServices: 49.7,
    unemploymentRate: 2.4,
    retailSalesMoM: 0.1,
    economicScore: 1.0,
    surpriseScore: 0.2,
    notes: 'Shunto wage momentum builds case for incremental normalization despite wide rate gap.',
    updatedAt: new Date().toISOString()
  },
  {
    currency: 'AUD',
    country: 'Australia',
    centralBank: 'Reserve Bank of Australia (RBA)',
    rate: 4.35,
    nextMeeting: 'Dec 10',
    rateExpectation: 'Hold',
    stance: 'Neutral',
    gdpQoQ: 1.0,
    cpiYoY: 2.8,
    coreCpiYoY: 3.5,
    pmiManufacturing: 47.3,
    pmiServices: 51.0,
    unemploymentRate: 4.1,
    retailSalesMoM: 0.1,
    economicScore: 1.5,
    surpriseScore: 0.0,
    notes: 'Trimmed-mean CPI remains above band; tightly levered to global metals & China beta.',
    updatedAt: new Date().toISOString()
  },
  {
    currency: 'CAD',
    country: 'Canada',
    centralBank: 'Bank of Canada (BoC)',
    rate: 3.75,
    nextMeeting: 'Dec 11',
    rateExpectation: 'Cut',
    stance: 'Dovish',
    gdpQoQ: 1.0,
    cpiYoY: 2.0,
    coreCpiYoY: 2.4,
    pmiManufacturing: 51.1,
    pmiServices: 50.4,
    unemploymentRate: 6.5,
    retailSalesMoM: 0.4,
    economicScore: -1.5,
    surpriseScore: -0.2,
    notes: 'Slack in Canadian unemployment keeps BoC ahead of Fed on rate-cut pace.',
    updatedAt: new Date().toISOString()
  },
  {
    currency: 'CHF',
    country: 'Switzerland',
    centralBank: 'Swiss National Bank (SNB)',
    rate: 1.00,
    nextMeeting: 'Dec 12',
    rateExpectation: 'Cut',
    stance: 'Dovish',
    gdpQoQ: 1.8,
    cpiYoY: 0.6,
    coreCpiYoY: 0.8,
    pmiManufacturing: 49.9,
    pmiServices: 51.4,
    unemploymentRate: 2.6,
    retailSalesMoM: 0.2,
    economicScore: -0.5,
    surpriseScore: 0.0,
    notes: 'Disinflation allows low policy rate; demand surges mainly during global Risk-Off.',
    updatedAt: new Date().toISOString()
  },
  {
    currency: 'NZD',
    country: 'New Zealand',
    centralBank: 'Reserve Bank of New Zealand (RBNZ)',
    rate: 4.75,
    nextMeeting: 'Nov 27',
    rateExpectation: 'Cut',
    stance: 'Dovish',
    gdpQoQ: -0.2,
    cpiYoY: 2.2,
    coreCpiYoY: 2.9,
    pmiManufacturing: 45.8,
    pmiServices: 46.0,
    unemploymentRate: 4.8,
    retailSalesMoM: -0.3,
    economicScore: -3.5,
    surpriseScore: -0.4,
    notes: 'Soft domestic activity & PMI contraction incentivize front-loaded RBNZ easing.',
    updatedAt: new Date().toISOString()
  }
];

interface CachedCotRaw {
  fetchedAt: number;
  byCode: Record<string, {
    reportDate: string;
    long: number;
    short: number;
    net: number;
    prevNet: number;
    openInterest: number;
    history: Array<{ date: string; net: number; longPct: number }>;
  }>;
}

let cotCache: CachedCotRaw | null = null;
let snapshotCache: { data: EdgeFinderSnapshot; cachedAt: number } | null = null;
const SNAPSHOT_TTL_MS = 90_000;
const COT_TTL_MS = 30 * 60_000;

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

function readDiskSnapshot(): { rollout?: EdgeFinderRollout; macroOverrides?: Partial<Record<EconomyCode, Partial<MacroEconomyData>>> } {
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

function writeDiskSnapshot(patch: { rollout?: EdgeFinderRollout; macroOverrides?: Partial<Record<EconomyCode, Partial<MacroEconomyData>>> }): void {
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

function computeEconomicScore(econ: MacroEconomyData): number {
  let raw = 0;
  // Policy rate & stance
  if (econ.rate >= 4.25) raw += 2.0;
  else if (econ.rate >= 3.0) raw += 0.5;
  else if (econ.rate <= 1.5) raw -= 1.5;

  if (econ.stance === 'Hawkish') raw += 1.5;
  else if (econ.stance === 'Dovish') raw -= 1.5;

  // GDP QoQ annualized
  if (econ.gdpQoQ >= 2.0) raw += 2.0;
  else if (econ.gdpQoQ >= 1.0) raw += 0.75;
  else if (econ.gdpQoQ < 0.5) raw -= 1.5;

  // Core CPI proximity to central bank tightening pressure
  if (econ.coreCpiYoY >= 3.0) raw += 1.25;
  else if (econ.coreCpiYoY <= 1.5) raw -= 1.25;

  // PMI composite
  const avgPmi = (econ.pmiManufacturing + econ.pmiServices) / 2;
  if (avgPmi >= 52.0) raw += 1.5;
  else if (avgPmi >= 50.0) raw += 0.5;
  else raw -= 1.5;

  // Unemployment
  if (econ.unemploymentRate <= 4.2) raw += 1.0;
  else if (econ.unemploymentRate >= 5.5) raw -= 1.25;

  // Retail sales
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

export async function getMacroEconomies(events: EconomicEvent[] = []): Promise<MacroEconomyData[]> {
  const overrides =
    (await readSettingJson<Partial<Record<EconomyCode, Partial<MacroEconomyData>>>>(MACRO_OVERRIDES_KEY)) ||
    readDiskSnapshot().macroOverrides ||
    {};
  const surprises = computeCalendarSurpriseMap(events);

  return DEFAULT_MACRO_ECONOMIES.map((base) => {
    const merged: MacroEconomyData = {
      ...base,
      ...(overrides[base.currency] || {}),
      currency: base.currency
    };
    const liveSurprise = surprises[base.currency] || 0;
    merged.surpriseScore = roundTo(clamp((overrides[base.currency]?.surpriseScore ?? base.surpriseScore) + liveSurprise * 0.5, -2.5, 2.5), 2);
    merged.economicScore = computeEconomicScore(merged);
    return merged;
  });
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
  return getMacroEconomies();
}

async function fetchLiveCftcCot(): Promise<CachedCotRaw | null> {
  if (cotCache && Date.now() - cotCache.fetchedAt < COT_TTL_MS) {
    return cotCache;
  }
  if (isTestEnv()) {
    return null;
  }
  try {
    const codes = Array.from(new Set(EDGE_FINDER_ASSETS.map((a) => `'${a.cftcCode}'`))).join(',');
    const url = `${CFTC_ENDPOINT}?$where=cftc_contract_market_code%20in(${codes})&$order=report_date_as_yyyy_mm_dd%20DESC&$limit=180`;
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(4500)
    });
    if (!res.ok) return null;
    const rows = (await res.json()) as Array<Record<string, string>>;
    if (!Array.isArray(rows) || rows.length === 0) return null;

    const grouped: Record<string, Array<Record<string, string>>> = {};
    for (const row of rows) {
      const code = (row.cftc_contract_market_code || '').trim();
      if (!code) continue;
      if (!grouped[code]) grouped[code] = [];
      grouped[code].push(row);
    }

    const byCode: CachedCotRaw['byCode'] = {};
    for (const [code, list] of Object.entries(grouped)) {
      const sorted = [...list].sort((a, b) =>
        (b.report_date_as_yyyy_mm_dd || '').localeCompare(a.report_date_as_yyyy_mm_dd || '')
      );
      const latest = sorted[0];
      const prev = sorted[1] || latest;
      const long = Number(latest.noncomm_positions_long_all || 0);
      const short = Number(latest.noncomm_positions_short_all || 0);
      const prevNet = Number(prev.noncomm_positions_long_all || 0) - Number(prev.noncomm_positions_short_all || 0);
      const openInterest = Number(latest.open_interest_all || Math.max(long + short, 1));
      const history = sorted.slice(0, 12).reverse().map((r) => {
        const l = Number(r.noncomm_positions_long_all || 0);
        const s = Number(r.noncomm_positions_short_all || 0);
        const denom = Math.max(l + s, 1);
        return {
          date: (r.report_date_as_yyyy_mm_dd || '').slice(0, 10),
          net: l - s,
          longPct: roundTo((l / denom) * 100, 1)
        };
      });
      byCode[code] = {
        reportDate: (latest.report_date_as_yyyy_mm_dd || '').slice(0, 10),
        long,
        short,
        net: long - short,
        prevNet,
        openInterest,
        history
      };
    }

    if (Object.keys(byCode).length === 0) return null;
    cotCache = { fetchedAt: Date.now(), byCode };
    return cotCache;
  } catch {
    return null;
  }
}

function buildFallback12WeekDates(): string[] {
  const dates: string[] = [];
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 7 * 86_400_000);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

function buildCotRecord(asset: AssetDefinition, liveCot: CachedCotRaw | null): CotPositioningRecord {
  const live = liveCot?.byCode[asset.cftcCode];
  if (live && asset.category !== 'Cross FX') {
    const denom = Math.max(live.long + live.short, 1);
    const longPct = roundTo((live.long / denom) * 100, 1);
    const shortPct = roundTo(100 - longPct, 1);
    const isUsdBase = asset.baseCurrency === 'USD';
    const effectiveLongPct = isUsdBase ? shortPct : longPct;
    const effectiveNet = isUsdBase ? -live.net : live.net;
    const effectiveChange = isUsdBase ? -(live.net - live.prevNet) : (live.net - live.prevNet);
    const cotScore: -1 | 0 | 1 = effectiveLongPct >= 56 ? 1 : effectiveLongPct <= 44 ? -1 : 0;
    const sentimentLabel: CotPositioningRecord['sentimentLabel'] =
      effectiveLongPct >= 66 ? 'Strongly Bullish' :
      effectiveLongPct >= 56 ? 'Bullish' :
      effectiveLongPct <= 34 ? 'Strongly Bearish' :
      effectiveLongPct <= 44 ? 'Bearish' : 'Neutral';
    return {
      instrument: asset.instrument,
      cftcCode: asset.cftcCode,
      contractName: asset.contractName,
      reportDate: live.reportDate,
      source: 'CFTC_LIVE',
      nonCommercialLong: isUsdBase ? live.short : live.long,
      nonCommercialShort: isUsdBase ? live.long : live.short,
      nonCommercialNet: effectiveNet,
      netChangeWoW: effectiveChange,
      longPct: effectiveLongPct,
      shortPct: roundTo(100 - effectiveLongPct, 1),
      openInterest: live.openInterest,
      sentimentLabel,
      cotScore,
      history12w: live.history.map((h) => ({
        date: h.date,
        net: isUsdBase ? -h.net : h.net,
        longPct: isUsdBase ? roundTo(100 - h.longPct, 1) : h.longPct
      }))
    };
  }

  // Deterministic 12-week institutional positioning baseline (also used for FX crosses)
  const dates = buildFallback12WeekDates();
  const effectiveLongPct = asset.baseCurrency === 'USD' ? roundTo(100 - asset.baseCotLongPct, 1) : asset.baseCotLongPct;
  const effectiveNet = asset.baseCurrency === 'USD' ? -asset.baseCotNet : asset.baseCotNet;
  const totalVol = Math.max(Math.abs(effectiveNet) * 2.6, 85_000);
  const long = Math.round(totalVol * (effectiveLongPct / 100));
  const short = Math.round(totalVol - long);
  const net = long - short;
  const history12w = dates.map((date, idx) => {
    const wave = Math.sin((idx + asset.instrument.length) * 0.55) * 0.14;
    const histNet = Math.round(net * (0.76 + (idx / 11) * 0.24 + wave * 0.4));
    const histLongPct = roundTo(clamp(effectiveLongPct + wave * 6, 18, 84), 1);
    return { date, net: histNet, longPct: histLongPct };
  });
  const wow = history12w[history12w.length - 1].net - history12w[history12w.length - 2].net;
  const cotScore: -1 | 0 | 1 = effectiveLongPct >= 56 ? 1 : effectiveLongPct <= 44 ? -1 : 0;
  const sentimentLabel: CotPositioningRecord['sentimentLabel'] =
    effectiveLongPct >= 66 ? 'Strongly Bullish' :
    effectiveLongPct >= 56 ? 'Bullish' :
    effectiveLongPct <= 34 ? 'Strongly Bearish' :
    effectiveLongPct <= 44 ? 'Bearish' : 'Neutral';

  return {
    instrument: asset.instrument,
    cftcCode: asset.cftcCode,
    contractName: asset.contractName,
    reportDate: dates[dates.length - 1],
    source: 'INSTITUTIONAL_MODEL',
    nonCommercialLong: long,
    nonCommercialShort: short,
    nonCommercialNet: net,
    netChangeWoW: wow,
    longPct: effectiveLongPct,
    shortPct: roundTo(100 - effectiveLongPct, 1),
    openInterest: Math.round(totalVol * 1.45),
    sentimentLabel,
    cotScore,
    history12w
  };
}

function buildSyntheticCandles(asset: AssetDefinition, count = 35): Candle[] {
  const candles: Candle[] = [];
  const seed = asset.instrument.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const now = Date.now();
  let price = asset.referencePrice * (1 - ((seed % 7) - 3) * 0.004);
  const driftBias = asset.baseCotLongPct > 55 ? 0.0007 : asset.baseCotLongPct < 45 ? -0.0007 : 0.0001;

  for (let i = count; i >= 1; i--) {
    const wave = Math.sin((seed + count - i) * 0.45) * 0.0038;
    const change = driftBias + wave;
    const open = price;
    const close = open * (1 + change);
    const high = Math.max(open, close) * 1.0025;
    const low = Math.min(open, close) * 0.9975;
    price = close;
    candles.push({
      open: roundTo(open, asset.decimals),
      high: roundTo(high, asset.decimals),
      low: roundTo(low, asset.decimals),
      close: roundTo(close, asset.decimals),
      volume: 12000 + ((seed * (i + 3)) % 8000),
      timestamp: new Date(now - i * 86_400_000).toISOString()
    });
  }
  return candles;
}

async function fetchAssetCandlesWithTimeout(asset: AssetDefinition): Promise<{ candles: Candle[]; livePrice: number | null; isLive: boolean }> {
  if (isTestEnv()) {
    const candles = buildSyntheticCandles(asset, 35);
    return { candles, livePrice: candles[candles.length - 1].close, isLive: false };
  }
  try {
    const result = await Promise.race([
      Promise.all([
        getLiveCandles(asset.instrument, '1d', 35),
        getLiveCurrentPrice(asset.instrument)
      ]),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 2600))
    ]);
    if (result && Array.isArray(result[0]) && result[0].length >= 15) {
      const candles = result[0];
      const livePrice = result[1] && result[1] > 0 ? result[1] : candles[candles.length - 1].close;
      return { candles, livePrice, isLive: true };
    }
  } catch {
    // fallback to reference series
  }
  const candles = buildSyntheticCandles(asset, 35);
  return { candles, livePrice: candles[candles.length - 1].close, isLive: false };
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

function deriveRetailSentiment(asset: AssetDefinition, rsi14: number, trendDirection: 'Bullish' | 'Bearish' | 'Ranging'): RetailSentimentRecord {
  // Adjust baseline retail positioning slightly with RSI extremes (retail chases moves / fades breakouts)
  const rsiOffset = (rsi14 - 50) * -0.18;
  const longPct = roundTo(clamp(asset.baseRetailLongPct + rsiOffset, 18, 84), 1);
  const shortPct = roundTo(100 - longPct, 1);
  const contrarianBias: RetailSentimentRecord['contrarianBias'] =
    longPct >= 58 ? 'Bearish' : shortPct >= 58 ? 'Bullish' : 'Neutral';
  const sentimentScore: -1 | 0 | 1 =
    contrarianBias === 'Bullish' ? 1 : contrarianBias === 'Bearish' ? -1 : 0;

  return {
    instrument: asset.instrument,
    longPct,
    shortPct,
    contrarianBias,
    crowdedWarning: longPct >= 70 || shortPct >= 70,
    sentimentScore,
    source: trendDirection === 'Ranging' ? 'Manna Contrarian Book (Range Fade)' : 'Manna Institutional Contrarian Book'
  };
}

function deriveSeasonality(asset: AssetDefinition): SeasonalityRecord {
  const monthIdx = new Date().getUTCMonth();
  const nextIdx = (monthIdx + 1) % 12;
  const curRet = asset.monthlyReturns10Y[monthIdx];
  const curWin = asset.monthlyWinRate10Y[monthIdx];
  const nextRet = asset.monthlyReturns10Y[nextIdx];
  const seasonalityScore: -1 | 0 | 1 =
    curRet >= 0.4 && curWin >= 60 ? 1 : curRet <= -0.4 && curWin <= 40 ? -1 : 0;
  const seasonalityBias: SeasonalityRecord['seasonalityBias'] =
    seasonalityScore === 1 ? 'Bullish' : seasonalityScore === -1 ? 'Bearish' : 'Neutral';

  return {
    instrument: asset.instrument,
    monthlyReturns10Y: asset.monthlyReturns10Y,
    monthlyWinRate10Y: asset.monthlyWinRate10Y,
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
    const empDiff = quote.unemploymentRate - base.unemploymentRate; // lower unemployment is stronger
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
        metric: 'GDP QoQ Growth',
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

  // Futures & Commodities macro mapping against US Treasury / USD Regime
  const isMetal = asset.category === 'Metals';
  const isEnergy = asset.category === 'Energy';
  const isRates = asset.category === 'Rates';
  const isTechOrIndex = asset.category === 'Equity Index';

  const rateSignal: -1 | 0 | 1 =
    isMetal || isRates ? (usd.stance === 'Dovish' || usd.rateExpectation === 'Cut' ? 1 : usd.rate >= 4.5 ? -1 : 0) :
    isTechOrIndex ? (usd.rateExpectation === 'Cut' ? 1 : usd.stance === 'Hawkish' && usd.rate >= 4.75 ? -1 : 0) :
    0;

  const gdpSignal: -1 | 0 | 1 =
    isRates ? (usd.gdpQoQ >= 2.5 ? -1 : 1) :
    usd.gdpQoQ >= 2.0 ? 1 : usd.gdpQoQ < 0.8 ? -1 : 0;

  const cpiSignal: -1 | 0 | 1 =
    isMetal || isEnergy ? (usd.coreCpiYoY >= 2.8 ? 1 : -1) :
    isRates ? (usd.coreCpiYoY >= 3.0 ? -1 : 1) :
    usd.coreCpiYoY <= 2.6 ? 1 : -1;

  const empSignal: -1 | 0 | 1 =
    isRates ? (usd.unemploymentRate >= 4.5 ? 1 : -1) :
    usd.unemploymentRate <= 4.3 ? 1 : -1;

  const pmiComposite = (usd.pmiManufacturing + usd.pmiServices) / 2;
  const pmiSignal: -1 | 0 | 1 =
    isRates ? (pmiComposite < 49.5 ? 1 : -1) :
    pmiComposite >= 51.0 ? 1 : pmiComposite < 49.0 ? -1 : 0;

  const retailSignal: -1 | 0 | 1 =
    isRates ? (usd.retailSalesMoM < 0 ? 1 : -1) :
    usd.retailSalesMoM + usd.surpriseScore >= 0.35 ? 1 : usd.retailSalesMoM < 0 ? -1 : 0;

  const factors: Array<Pick<FactorBreakdownItem, 'key' | 'label' | 'category' | 'signal' | 'weight' | 'detail'>> = [
    {
      key: 'interestRates',
      label: 'Real Yield / Fed Policy',
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
      detail: `US GDP QoQ ${usd.gdpQoQ.toFixed(1)}% (${isRates ? 'Bond inverse' : 'Risk sensitivity'})`
    },
    {
      key: 'cpi',
      label: 'Inflation Regime',
      category: 'Fundamental',
      signal: cpiSignal,
      weight: 0.75,
      detail: `US Core CPI ${usd.coreCpiYoY.toFixed(1)}% (${isMetal || isEnergy ? 'Inflation hedge' : 'Multiple pressure'})`
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
      label: 'US ISM PMI',
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
      metric: 'ISM Business Cycle',
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

export async function buildEdgeFinderSnapshot(forceRefresh = false): Promise<EdgeFinderSnapshot> {
  if (!forceRefresh && snapshotCache && Date.now() - snapshotCache.cachedAt < SNAPSHOT_TTL_MS) {
    return {
      ...snapshotCache.data,
      syncStatus: {
        ...snapshotCache.data.syncStatus,
        cacheAgeSeconds: Math.round((Date.now() - snapshotCache.cachedAt) / 1000)
      }
    };
  }

  const [rollout, liveCot, activeSetups] = await Promise.all([
    getEdgeFinderRollout(),
    fetchLiveCftcCot(),
    getAllActiveSetups().catch(() => [] as EdgeSetup[])
  ]);

  const allEvents = newsEngine.getAllEvents();
  const upcomingHighImpact = newsEngine.getUpcomingHighImpactEvents().slice(0, 14);
  const calendarStatus = newsEngine.getCalendarStatus();
  const economies = await getMacroEconomies(allEvents);

  const econByCode = economies.reduce((acc, e) => {
    acc[e.currency] = e;
    return acc;
  }, {} as Record<EconomyCode, MacroEconomyData>);

  // Fetch all 16 asset price histories concurrently with timeouts
  const candleResults = await Promise.all(
    EDGE_FINDER_ASSETS.map((asset) => fetchAssetCandlesWithTimeout(asset))
  );

  let livePriceCount = 0;
  let hasLiveCot = false;

  const scorecards: AssetEdgeScorecard[] = EDGE_FINDER_ASSETS.map((asset, idx) => {
    const { candles, livePrice, isLive } = candleResults[idx];
    if (isLive) livePriceCount += 1;

    const closes = candles.map((c) => c.close);
    const currentPrice = roundTo(livePrice ?? closes[closes.length - 1] ?? asset.referencePrice, asset.decimals);
    const prevClose = closes.length >= 2 ? closes[closes.length - 2] : currentPrice;
    const dailyChangePct = prevClose > 0 ? roundTo(((currentPrice - prevClose) / prevClose) * 100, 2) : 0;

    const ema20 = roundTo(calcEma(closes, 20), asset.decimals);
    const ema50 = roundTo(calcEma(closes, Math.min(50, closes.length)), asset.decimals);
    const rsi14 = calcRsi(closes, 14);
    const atr14 = roundTo(calcAtr(candles, 14), asset.decimals);
    const atrPct = currentPrice > 0 ? roundTo((atr14 / currentPrice) * 100, 2) : 0;
    const high30d = roundTo(Math.max(...candles.map((c) => c.high)), asset.decimals);
    const low30d = roundTo(Math.min(...candles.map((c) => c.low)), asset.decimals);
    const distanceFromEma20Pct = ema20 > 0 ? roundTo(((currentPrice - ema20) / ema20) * 100, 2) : 0;

    const trendScoreRaw: -1 | 0 | 1 =
      currentPrice > ema20 && ema20 >= ema50 ? 1 :
      currentPrice < ema20 && ema20 <= ema50 ? -1 : 0;
    const trendDirection: AssetEdgeScorecard['technical']['trendDirection'] =
      trendScoreRaw === 1 ? 'Bullish' : trendScoreRaw === -1 ? 'Bearish' : 'Ranging';

    const cot = buildCotRecord(asset, liveCot);
    if (cot.source === 'CFTC_LIVE') hasLiveCot = true;

    const retailSentiment = deriveRetailSentiment(asset, rsi14, trendDirection);
    const seasonality = deriveSeasonality(asset);
    const { factors: macroFactors, tugOfWar } = buildMacroTugOfWar(asset, econByCode, cot, trendDirection);

    const baseFactorsWithoutManna: FactorBreakdownItem[] = [
      {
        key: 'cot',
        label: 'COT Smart Money',
        category: 'Sentiment',
        signal: cot.cotScore,
        weight: 1.5,
        contribution: roundTo(cot.cotScore * 1.5, 2),
        detail: `${cot.longPct.toFixed(1)}% Non-Comm Long (WoW ${cot.netChangeWoW >= 0 ? '+' : ''}${cot.netChangeWoW.toLocaleString()})`
      },
      {
        key: 'retailSentiment',
        label: 'Retail Contrarian',
        category: 'Sentiment',
        signal: retailSentiment.sentimentScore,
        weight: 1.0,
        contribution: roundTo(retailSentiment.sentimentScore * 1.0, 2),
        detail: `Crowd ${retailSentiment.longPct.toFixed(1)}% Long → Contrarian ${retailSentiment.contrarianBias}`
      },
      {
        key: 'seasonality',
        label: '10Y Seasonality',
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
        detail: `${trendDirection} vs EMA20/50 · RSI ${rsi14.toFixed(1)}`
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

    // Build 30-day Historical Score vs Price series (using static macro/sentiment base + evolving rolling trend)
    const staticBaseScore = totalScore - trendScoreRaw * 1.25;
    const recentCandles = candles.slice(-30);
    const historicalSeries: HistoricalScorePoint[] = recentCandles.map((c, cIdx) => {
      const lookbackCloses = candles.slice(0, Math.max(1, candles.length - recentCandles.length + cIdx + 1)).map((x) => x.close);
      const localEma20 = calcEma(lookbackCloses, Math.min(20, lookbackCloses.length));
      const localSlope = c.close > localEma20 * 1.002 ? 1.25 : c.close < localEma20 * 0.998 ? -1.25 : 0;
      const pointScore = roundTo(clamp(staticBaseScore + localSlope, -10, 10), 2);
      return {
        date: c.timestamp.slice(0, 10),
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
      priceSource: isLive ? 'LIVE' : 'REFERENCE',
      totalScore,
      biasLabel: classifyBiasLabel(totalScore),
      cotScore: roundTo(cot.cotScore * 1.5, 2),
      retailScore: roundTo(retailSentiment.sentimentScore * 1.0, 2),
      seasonalityScore: roundTo(seasonality.seasonalityScore * 0.75, 2),
      trendScore: roundTo(trendScoreRaw * 1.25, 2),
      fundamentalScore,
      mannaFlowScore: roundTo(mannaSignal * 0.75, 2),
      factors,
      tugOfWar,
      technical: {
        ema20,
        ema50,
        rsi14,
        atr14,
        atrPct,
        high30d,
        low30d,
        trendDirection,
        distanceFromEma20Pct
      },
      cot,
      retailSentiment,
      seasonality,
      killzoneAlignment,
      historicalSeries
    };
  });

  // Sort highest absolute institutional conviction first (Top Setups Matrix default)
  scorecards.sort((a, b) => Math.abs(b.totalScore) - Math.abs(a.totalScore));

  const currencyStrength = computeCurrencyStrength(economies, scorecards);
  const riskGauge = computeRiskGauge(scorecards);
  const correlations = computeCorrelations(scorecards);

  const snapshot: EdgeFinderSnapshot = {
    generatedAt: new Date().toISOString(),
    rollout,
    scorecards,
    economies,
    currencyStrength,
    riskGauge,
    correlations,
    calendar: {
      status: calendarStatus,
      upcomingHighImpact,
      allEventsCount: allEvents.length
    },
    syncStatus: {
      cftcSource: hasLiveCot ? 'CFTC_LIVE' : 'INSTITUTIONAL_MODEL',
      livePriceCount,
      totalAssets: EDGE_FINDER_ASSETS.length,
      cacheAgeSeconds: 0
    }
  };

  snapshotCache = { data: snapshot, cachedAt: Date.now() };
  return snapshot;
}

export function clearEdgeFinderCaches(): void {
  snapshotCache = null;
  cotCache = null;
}
