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
    macroSource?: 'LIVE_BIS_WORLDBANK' | 'BASELINE';
    livePriceCount: number;
    totalAssets: number;
    cacheAgeSeconds: number;
  };
}

const ROLLOUT_KEY = 'edge_finder_rollout';
const MACRO_OVERRIDES_KEY = 'edge_finder_macro_overrides';
const SNAPSHOT_FILE = path.join(process.cwd(), 'edge_finder_settings_snapshot.json');
const CFTC_ENDPOINT = 'https://publicreporting.cftc.gov/resource/6dca-aqww.json';
const BIS_CBPOL_ENDPOINT =
  'https://stats.bis.org/api/v2/data/dataflow/BIS/WS_CBPOL/1.0/M.US+XM+GB+JP+AU+CA+CH+NZ?lastNObservations=3&format=sdmx-json';
const WB_MACRO_ENDPOINT =
  'https://api.worldbank.org/v2/country/USA;EMU;GBR;JPN;AUS;CAN;CHE;NZL/indicator/FP.CPI.TOTL.ZG;SL.UEM.TOTL.ZS;NY.GDP.MKTP.KD.ZG?source=2&mrnev=1&format=json&per_page=100';

const yahooClient = new YahooFinance({ suppressNotices: ['yahooSurvey', 'ripHistorical'] });

const YAHOO_SYMBOL_MAP: Record<string, string> = {
  'EUR/USD': 'EURUSD=X',
  'GBP/USD': 'GBPUSD=X',
  'USD/JPY': 'JPY=X',
  'AUD/USD': 'AUDUSD=X',
  'USD/CAD': 'CAD=X',
  'EUR/GBP': 'EURGBP=X',
  'GBP/JPY': 'GBPJPY=X',
  'EUR/JPY': 'EURJPY=X',
  ES: 'ES=F',
  NQ: 'NQ=F',
  YM: 'YM=F',
  RTY: 'RTY=F',
  GC: 'GC=F',
  SI: 'SI=F',
  CL: 'CL=F',
  ZN: 'ZN=F'
};

interface AssetDefinition {
  instrument: string;
  displayName: string;
  assetClass: 'forex' | 'futures';
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
  }
];

const EXTRA_G8_CFTC_CODES = ['092741', '112741'];

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

interface CachedLiveMacro {
  fetchedAt: number;
  source: 'LIVE_BIS_WORLDBANK' | 'BASELINE';
  bisRates: Partial<Record<EconomyCode, { rate: number; prevRate: number }>>;
  wbIndicators: Partial<Record<EconomyCode, { cpiYoY?: number; unemploymentRate?: number; gdpQoQ?: number }>>;
}

let cotCache: CachedCotRaw | null = null;
const seasonalityCache: Record<string, CachedSeasonalityEntry> = {};
let macroExternalCache: CachedLiveMacro | null = null;
let snapshotCache: { data: EdgeFinderSnapshot; cachedAt: number } | null = null;

const SNAPSHOT_TTL_MS = 90_000;
const COT_TTL_MS = 30 * 60_000;
const SEASONALITY_TTL_MS = 6 * 3600_000;
const MACRO_TTL_MS = 60 * 60_000;

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

  const [bisResult, wbResult] = await Promise.allSettled([
    fetch(BIS_CBPOL_ENDPOINT, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(6000)
    }).then((r) => (r.ok ? (r.json() as Promise<any>) : null)),
    fetch(WB_MACRO_ENDPOINT, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(6000)
    }).then((r) => (r.ok ? (r.json() as Promise<any>) : null))
  ]);

  if (bisResult.status === 'fulfilled' && bisResult.value?.data?.dataSets?.[0]?.series) {
    const ds = bisResult.value.data.dataSets[0].series as Record<string, { observations: Record<string, any[]> }>;
    const seriesDims = (bisResult.value.data.structure?.dimensions?.series || []) as Array<{
      id: string;
      values: Array<{ id: string }>;
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
          .map(([, obs]) => Number(obs[0]))
          .filter((n) => Number.isFinite(n));
        if (sortedObs.length > 0) {
          const rate = sortedObs[sortedObs.length - 1];
          const prevRate = sortedObs.length >= 2 ? sortedObs[sortedObs.length - 2] : rate;
          bisRates[cur] = { rate: roundTo(rate, 3), prevRate: roundTo(prevRate, 3) };
        }
      }
    }
  }

  if (wbResult.status === 'fulfilled' && Array.isArray(wbResult.value) && Array.isArray(wbResult.value[1])) {
    for (const row of wbResult.value[1] as Array<any>) {
      const cur = wbToCur[row?.countryiso3code];
      const indId = row?.indicator?.id;
      const value = Number(row?.value);
      if (!cur || !indId || !Number.isFinite(value)) continue;
      if (!wbIndicators[cur]) wbIndicators[cur] = {};
      if (indId === 'FP.CPI.TOTL.ZG') wbIndicators[cur]!.cpiYoY = roundTo(value, 2);
      if (indId === 'SL.UEM.TOTL.ZS') wbIndicators[cur]!.unemploymentRate = roundTo(value, 2);
      if (indId === 'NY.GDP.MKTP.KD.ZG') wbIndicators[cur]!.gdpQoQ = roundTo(value, 2);
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
    const wb = liveExt.wbIndicators[meta.currency] || {};
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
      surpriseScore: roundTo(clamp((ov.surpriseScore ?? 0) + (surprises[meta.currency] || 0) * 0.5, -2.5, 2.5), 2),
      notes: `Live BIS policy rate (${rate.toFixed(2)}%, prev ${prevRate.toFixed(2)}%), World Bank WDI & ForexFactory NFS releases.`,
      updatedAt: new Date(liveExt.fetchedAt).toISOString(),
      ...ov
    };
    // Always preserve explicit currency code and recompute score after overrides
    merged.currency = meta.currency;
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
      new Set([...EDGE_FINDER_ASSETS.map((a) => a.cftcCode), ...EXTRA_G8_CFTC_CODES])
    );
    const inClause = allCodes.map((c) => `"${c}"`).join(',');
    const url = `${CFTC_ENDPOINT}?$where=cftc_contract_market_code%20in(${encodeURIComponent(inClause)})&$order=report_date_as_yyyy_mm_dd%20DESC&$limit=400`;
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(7000)
    });
    if (!res.ok) return null;
    const rows = (await res.json()) as Array<Record<string, string>>;
    if (!Array.isArray(rows) || rows.length === 0) return null;

    const grouped: Record<string, Map<string, CotWeeklyRow>> = {};
    for (const r of rows) {
      const code = (r.cftc_contract_market_code || '').trim();
      const reportDate = (r.report_date_as_yyyy_mm_dd || '').slice(0, 10);
      if (!code || !reportDate) continue;

      const parsed: CotWeeklyRow = {
        reportDate,
        noncommLong: Number(r.noncomm_positions_long_all || 0),
        noncommShort: Number(r.noncomm_positions_short_all || 0),
        noncommNet: Number(r.noncomm_positions_long_all || 0) - Number(r.noncomm_positions_short_all || 0),
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
        .slice(-12);
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
      paired.push({
        reportDate: b.reportDate >= q.reportDate ? b.reportDate : q.reportDate,
        noncommLong,
        noncommShort,
        noncommNet: noncommLong - noncommShort,
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

  // Invert IMM foreign currency futures (e.g. JPY/USD -> USD/JPY, CAD/USD -> USD/CAD)
  return single.map((w) => ({
    reportDate: w.reportDate,
    noncommLong: w.noncommShort,
    noncommShort: w.noncommLong,
    noncommNet: -w.noncommNet,
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
        netChangeWoW: latest.noncommNet - prev.noncommNet,
        longPct: cotLongPct,
        shortPct: cotShortPct,
        openInterest: latest.openInterest,
        sentimentLabel,
        cotScore,
        history12w: paired.map((w) => {
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
      netChangeWoW: 0,
      longPct: 50,
      shortPct: 50,
      openInterest: 0,
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
      const chart = await Promise.race([
        yahooClient.chart(yahooSym, { period1: start10y, interval: '1mo' }),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 6500))
      ]);
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

async function fetchAssetMarketData(asset: AssetDefinition): Promise<{
  candles: Candle[];
  livePrice: number | null;
  isLive: boolean;
  monthlyReturns10Y: number[];
  monthlyWinRate10Y: number[];
}> {
  const yahooSym = YAHOO_SYMBOL_MAP[asset.instrument];
  const dailyPromise = (async (): Promise<{ candles: Candle[]; livePrice: number | null; isLive: boolean }> => {
    if (yahooSym) {
      try {
        const start55d = new Date(Date.now() - 60 * 86_400_000);
        const chart = await Promise.race([
          yahooClient.chart(yahooSym, { period1: start55d, interval: '1d' }),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 6500))
        ]);
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
        return { candles, livePrice, isLive: true };
      }
    } catch {
      // no synthetic prices
    }
    return { candles: [], livePrice: null, isLive: false };
  })();

  const [daily, seasonal] = await Promise.all([
    dailyPromise,
    fetchYahooMonthlySeasonality(asset)
  ]);

  return {
    ...daily,
    ...seasonal
  };
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
  const isRates = asset.category === 'Rates';
  const isTechOrIndex = asset.category === 'Equity Index';

  const rateSignal: -1 | 0 | 1 =
    isMetal || isRates ? (usd.stance === 'Dovish' || usd.rateExpectation === 'Cut' ? 1 : usd.rate >= 4.25 ? -1 : 0) :
    isTechOrIndex ? (usd.rateExpectation === 'Cut' ? 1 : usd.stance === 'Hawkish' && usd.rate >= 4.5 ? -1 : 0) :
    0;

  const gdpSignal: -1 | 0 | 1 =
    isRates ? (usd.gdpQoQ >= 2.3 ? -1 : 1) :
    usd.gdpQoQ >= 1.8 ? 1 : usd.gdpQoQ < 0.8 ? -1 : 0;

  const cpiSignal: -1 | 0 | 1 =
    isMetal || isEnergy ? (usd.coreCpiYoY >= 2.6 ? 1 : -1) :
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
      detail: `US GDP Growth ${usd.gdpQoQ.toFixed(1)}% (${isRates ? 'Bond inverse' : 'Risk sensitivity'})`
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

  const allEvents = newsEngine.getAllEvents();
  const upcomingHighImpact = newsEngine.getUpcomingHighImpactEvents().slice(0, 14);
  const calendarStatus = newsEngine.getCalendarStatus();

  const [rollout, liveCot, activeSetups, macroRes, marketDataList] = await Promise.all([
    getEdgeFinderRollout(),
    fetchLiveCftcCot(),
    getAllActiveSetups().catch(() => [] as EdgeSetup[]),
    getMacroEconomies(allEvents),
    Promise.all(EDGE_FINDER_ASSETS.map((asset) => fetchAssetMarketData(asset)))
  ]);

  const { economies, macroSource } = macroRes;
  const econByCode = economies.reduce((acc, e) => {
    acc[e.currency] = e;
    return acc;
  }, {} as Record<EconomyCode, MacroEconomyData>);

  let livePriceCount = 0;
  let hasLiveCot = false;

  const scorecards: AssetEdgeScorecard[] = EDGE_FINDER_ASSETS.map((asset, idx) => {
    const { candles, livePrice, isLive, monthlyReturns10Y, monthlyWinRate10Y } = marketDataList[idx];
    if (isLive && livePrice !== null) livePriceCount += 1;

    const closes = candles.map((c) => c.close);
    const currentPrice = livePrice ?? closes[closes.length - 1] ?? 0;
    const prevClose = closes.length >= 2 ? closes[closes.length - 2] : currentPrice;
    const dailyChangePct = prevClose > 0 ? roundTo(((currentPrice - prevClose) / prevClose) * 100, 2) : 0;

    const ema20 = closes.length > 0 ? roundTo(calcEma(closes, Math.min(20, closes.length)), asset.decimals) : 0;
    const ema50 = closes.length > 0 ? roundTo(calcEma(closes, Math.min(50, closes.length)), asset.decimals) : 0;
    const rsi14 = closes.length > 14 ? calcRsi(closes, 14) : 50;
    const atr14 = candles.length > 1 ? roundTo(calcAtr(candles, 14), asset.decimals) : 0;
    const atrPct = currentPrice > 0 ? roundTo((atr14 / currentPrice) * 100, 2) : 0;
    const high30d = candles.length > 0 ? roundTo(Math.max(...candles.slice(-30).map((c) => c.high)), asset.decimals) : currentPrice;
    const low30d = candles.length > 0 ? roundTo(Math.min(...candles.slice(-30).map((c) => c.low)), asset.decimals) : currentPrice;
    const distanceFromEma20Pct = ema20 > 0 ? roundTo(((currentPrice - ema20) / ema20) * 100, 2) : 0;

    const trendScoreRaw: -1 | 0 | 1 =
      currentPrice > 0 && currentPrice > ema20 && ema20 >= ema50 ? 1 :
      currentPrice > 0 && currentPrice < ema20 && ema20 <= ema50 ? -1 : 0;
    const trendDirection: AssetEdgeScorecard['technical']['trendDirection'] =
      trendScoreRaw === 1 ? 'Bullish' : trendScoreRaw === -1 ? 'Bearish' : 'Ranging';

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
        detail: `${cot.longPct.toFixed(1)}% Non-Comm Long (WoW ${cot.netChangeWoW >= 0 ? '+' : ''}${cot.netChangeWoW.toLocaleString()}) [${cot.reportDate}]`
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
      cotScore: cotContrib,
      retailScore: retailContrib,
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
      macroSource,
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
  macroExternalCache = null;
  for (const k of Object.keys(seasonalityCache)) {
    delete seasonalityCache[k];
  }
}
