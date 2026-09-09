import { Candle } from '../discovery/types';
import { SYMBOL_MAP } from '../discovery/yahoo-provider';
import { createLogger } from '../telemetry/logger';
import { queryDb } from '../db/database';
import * as queries from '../db/queries';

const logger = createLogger('CandleExcursionService');

export interface ExcursionInput {
  instrument: string;
  bias: 'long' | 'short' | string;
  entryPrice: number;
  initialStop: number;
  candles: Candle[];
  exitPrice?: number;
}

export interface ExcursionResult {
  highestPrice: number;
  lowestPrice: number;
  maePoints: number;
  maeR: number;
  maeTimestamp: string | null;
  mfePoints: number;
  mfeR: number;
  mfeTimestamp: string | null;
  maeBeforeMfe: boolean;
  halfFloorBreached: boolean;
  barsHeld: number;
  timeframeUsed: string;
  candles: Candle[];
}

export interface TradeTimeWindow {
  instrument: string;
  bias: 'long' | 'short' | string;
  entryPrice: number;
  initialStop: number;
  entryTime: string | number | Date;
  exitTime?: string | number | Date;
  exitPrice?: number;
}

export interface DetailedTradeExcursion {
  setup_id: string;
  outcome_id?: string;
  strategy_id: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  entry_price: number;
  initial_stop_price: number;
  risk_points: number;
  half_floor_stop_price: number;
  tp1_price: number;
  tp2_price: number;
  final_exit_price: number;
  entry_timestamp_utc: string;
  exit_timestamp_utc: string;
  trade_duration_minutes: number;
  mae_points: number;
  mae_r: number;
  mae_timestamp_utc: string | null;
  mfe_points: number;
  mfe_r: number;
  mfe_timestamp_utc: string | null;
  mae_occurred_before_mfe: boolean;
  half_floor_stop_breached: boolean;
  half_floor_breached_before_tp1: boolean;
  tp1_reached_on_mfe: boolean;
  tp2_reached_on_mfe: boolean;
  lowest_price_during_trade: number;
  highest_price_during_trade: number;
  actual_realized_r: number;
  exit_reason: string;
  total_candles_count: number;
  candles?: Candle[];
}

// In-memory cache for historical range candles to avoid duplicate network calls
const rangeCandleCache = new Map<string, { candles: Candle[]; timestamp: number }>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// Bulk store for preloaded symbol history
const symbolCandleStore = new Map<string, Candle[]>();

export async function preloadCandlesForSymbols(instruments: string[]): Promise<void> {
  const uniqueSymbols = Array.from(new Set(instruments.map(resolveYahooSymbol)));
  for (const sym of uniqueSymbols) {
    if (symbolCandleStore.has(sym)) continue;
    try {
      const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=5m&range=60d`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Accept': 'application/json' }
      });
      if (!res.ok) continue;
      const data: any = await res.json();
      const resObj = data?.chart?.result?.[0];
      const q = resObj?.indicators?.quote?.[0];
      const ts: number[] = resObj?.timestamp || [];
      const candles: Candle[] = [];
      for (let i = 0; i < ts.length; i++) {
        if (q?.open?.[i] !== null && q?.close?.[i] !== null && !isNaN(q.close[i])) {
          candles.push({
            open: Number(q.open[i].toFixed(5)),
            high: Number(q.high[i].toFixed(5)),
            low: Number(q.low[i].toFixed(5)),
            close: Number(q.close[i].toFixed(5)),
            volume: Number(q.volume?.[i] || 0),
            timestamp: new Date(ts[i] * 1000).toISOString()
          });
        }
      }
      symbolCandleStore.set(sym, candles);
    } catch {
      // Continue to next symbol
    }
  }
}

/**
 * Normalizes an instrument symbol (e.g. 'NQ', 'NQ=F', 'EUR/USD') to Yahoo Finance ticker.
 */
export function resolveYahooSymbol(instrument: string): string {
  const clean = instrument.trim().toUpperCase();
  if (SYMBOL_MAP[clean]) return SYMBOL_MAP[clean];

  if (clean.includes('=F') || clean.includes('=X')) return clean;

  if (clean.length === 6 && !clean.includes('/')) {
    const withSlash = `${clean.slice(0, 3)}/${clean.slice(3)}`;
    if (SYMBOL_MAP[withSlash]) return SYMBOL_MAP[withSlash];
    return `${clean}=X`;
  }

  if (['ES', 'NQ', 'YM', 'RTY', 'GC', 'CL', 'SI', 'ZN'].includes(clean)) {
    return `${clean}=F`;
  }

  return clean;
}

/**
 * Fetches accurate historical OHLC candles for an exact date range.
 * Prioritizes 1m candles if trade age < 29 days, falling back to 5m, then 15m.
 */
export async function fetchHistoricalCandlesRange(
  instrument: string,
  startMs: number,
  endMs: number
): Promise<{ candles: Candle[]; timeframe: string }> {
  const yahooSymbol = resolveYahooSymbol(instrument);
  const safeStartMs = Math.min(startMs, endMs);
  const safeEndMs = Math.max(startMs, endMs);

  // Check preloaded bulk store first for instant zero-latency retrieval
  const stored = symbolCandleStore.get(yahooSymbol);
  if (stored && stored.length > 0) {
    const toleranceMs = 300 * 1000;
    const windowCandles = stored.filter(c => {
      const cTime = new Date(c.timestamp).getTime();
      return cTime >= (safeStartMs - toleranceMs) && cTime <= (safeEndMs + toleranceMs);
    });
    if (windowCandles.length > 0) {
      return { candles: windowCandles, timeframe: '5m' };
    }
  }

  const now = Date.now();
  const ageDays = (now - startMs) / (24 * 60 * 60 * 1000);

  let timeframe: '1m' | '5m' | '15m' = '1m';
  if (ageDays > 28) {
    timeframe = ageDays <= 58 ? '5m' : '15m';
  }

  const period1 = Math.max(0, Math.floor(safeStartMs / 1000) - 120);
  const period2 = Math.ceil(safeEndMs / 1000) + 120;

  const cacheKey = `${yahooSymbol}_${timeframe}_${period1}_${period2}`;
  const cached = rangeCandleCache.get(cacheKey);
  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    return { candles: cached.candles, timeframe };
  }

  try {
    const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=${timeframe}&period1=${period1}&period2=${period2}`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      if (timeframe === '1m') {
        logger.warn({ instrument, yahooSymbol }, '1m range fetch returned status ' + response.status + ', falling back to 5m');
        return await fetchFallbackRange(yahooSymbol, safeStartMs, safeEndMs, '5m');
      }
      throw new Error(`Yahoo HTTP ${response.status} ${response.statusText}`);
    }

    const chartResult: any = await response.json();
    const result = chartResult?.chart?.result?.[0];

    if (!result || !result.indicators || !result.indicators.quote || !result.indicators.quote[0]) {
      return { candles: [], timeframe };
    }

    const quoteObj = result.indicators.quote[0];
    const timestamps: number[] = result.timestamp || [];
    const candles: Candle[] = [];

    for (let i = 0; i < timestamps.length; i++) {
      const cOpen = quoteObj.open[i];
      const cHigh = quoteObj.high[i];
      const cLow = quoteObj.low[i];
      const cClose = quoteObj.close[i];

      if (cOpen !== null && cHigh !== null && cLow !== null && cClose !== null && !isNaN(cClose)) {
        candles.push({
          open: Number(cOpen.toFixed(5)),
          high: Number(cHigh.toFixed(5)),
          low: Number(cLow.toFixed(5)),
          close: Number(cClose.toFixed(5)),
          volume: Number(quoteObj.volume?.[i] || 0),
          timestamp: new Date(timestamps[i] * 1000).toISOString()
        });
      }
    }

    const toleranceMs = (timeframe === '1m' ? 60 : timeframe === '5m' ? 300 : 900) * 1000;
    const windowCandles = candles.filter(c => {
      const cTime = new Date(c.timestamp).getTime();
      return cTime >= (safeStartMs - toleranceMs) && cTime <= (safeEndMs + toleranceMs);
    });

    const finalCandles = windowCandles.length > 0 ? windowCandles : candles;
    rangeCandleCache.set(cacheKey, { candles: finalCandles, timestamp: now });

    return { candles: finalCandles, timeframe };
  } catch (err: any) {
    logger.error({ instrument, yahooSymbol, error: err.message }, 'Failed to fetch historical candles range');
    return { candles: [], timeframe };
  }
}

async function fetchFallbackRange(yahooSymbol: string, safeStartMs: number, safeEndMs: number, timeframe: '5m' | '15m') {
  const period1 = Math.max(0, Math.floor(safeStartMs / 1000) - 300);
  const period2 = Math.ceil(safeEndMs / 1000) + 300;
  try {
    const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=${timeframe}&period1=${period1}&period2=${period2}`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json'
      }
    });
    if (!response.ok) return { candles: [], timeframe };
    const chartResult: any = await response.json();
    const result = chartResult?.chart?.result?.[0];
    if (!result || !result.indicators || !result.indicators.quote || !result.indicators.quote[0]) return { candles: [], timeframe };
    const quoteObj = result.indicators.quote[0];
    const timestamps: number[] = result.timestamp || [];
    const candles: Candle[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      if (quoteObj.open[i] !== null && quoteObj.close[i] !== null) {
        candles.push({
          open: Number(quoteObj.open[i].toFixed(5)),
          high: Number(quoteObj.high[i].toFixed(5)),
          low: Number(quoteObj.low[i].toFixed(5)),
          close: Number(quoteObj.close[i].toFixed(5)),
          volume: Number(quoteObj.volume?.[i] || 0),
          timestamp: new Date(timestamps[i] * 1000).toISOString()
        });
      }
    }
    return { candles, timeframe };
  } catch {
    return { candles: [], timeframe };
  }
}

/**
 * Calculates accurate MAE, MFE, Highest Price, Lowest Price, Timestamps, and Flags from candle data.
 */
export function calculateExcursionFromCandles(input: ExcursionInput, timeframe: string = '1m'): ExcursionResult {
  const { bias, entryPrice, initialStop, candles, exitPrice } = input;
  const isLong = String(bias).toLowerCase() === 'long';

  const risk = Math.abs(entryPrice - initialStop);
  const safeRisk = risk > 0 ? risk : (entryPrice * 0.005);

  if (!candles || candles.length === 0) {
    const finalPrice = exitPrice !== undefined ? exitPrice : entryPrice;
    const peak = Math.max(entryPrice, finalPrice);
    const trough = Math.min(entryPrice, finalPrice);

    const maePts = isLong ? Math.max(0, entryPrice - trough) : Math.max(0, peak - entryPrice);
    const mfePts = isLong ? Math.max(0, peak - entryPrice) : Math.max(0, entryPrice - trough);
    const maeR = Number((maePts / safeRisk).toFixed(2));
    const mfeR = Number((mfePts / safeRisk).toFixed(2));

    return {
      highestPrice: Number(peak.toFixed(5)),
      lowestPrice: Number(trough.toFixed(5)),
      maePoints: Number(maePts.toFixed(5)),
      maeR,
      maeTimestamp: null,
      mfePoints: Number(mfePts.toFixed(5)),
      mfeR,
      mfeTimestamp: null,
      maeBeforeMfe: true,
      halfFloorBreached: maeR >= 0.50,
      barsHeld: 1,
      timeframeUsed: 'none',
      candles: []
    };
  }

  const highPoints = candles.map(c => c.high);
  const lowPoints = candles.map(c => c.low);

  if (exitPrice !== undefined) {
    highPoints.push(exitPrice);
    lowPoints.push(exitPrice);
  }
  highPoints.push(entryPrice);
  lowPoints.push(entryPrice);

  const highestPrice = Math.max(...highPoints);
  const lowestPrice = Math.min(...lowPoints);

  let maePoints = 0;
  let mfePoints = 0;
  let maeTimestamp: string | null = null;
  let mfeTimestamp: string | null = null;

  if (isLong) {
    maePoints = Math.max(0, entryPrice - lowestPrice);
    mfePoints = Math.max(0, highestPrice - entryPrice);

    const adverseCandle = candles.find(c => c.low === lowestPrice);
    maeTimestamp = adverseCandle ? adverseCandle.timestamp : candles[0].timestamp;

    const favCandle = candles.find(c => c.high === highestPrice);
    mfeTimestamp = favCandle ? favCandle.timestamp : candles[0].timestamp;
  } else {
    maePoints = Math.max(0, highestPrice - entryPrice);
    mfePoints = Math.max(0, entryPrice - lowestPrice);

    const adverseCandle = candles.find(c => c.high === highestPrice);
    maeTimestamp = adverseCandle ? adverseCandle.timestamp : candles[0].timestamp;

    const favCandle = candles.find(c => c.low === lowestPrice);
    mfeTimestamp = favCandle ? favCandle.timestamp : candles[0].timestamp;
  }

  const maeR = Number((maePoints / safeRisk).toFixed(2));
  const mfeR = Number((mfePoints / safeRisk).toFixed(2));

  const maeBeforeMfe = (maeTimestamp && mfeTimestamp)
    ? new Date(maeTimestamp).getTime() <= new Date(mfeTimestamp).getTime()
    : true;

  const halfFloorBreached = maeR >= 0.50;

  return {
    highestPrice: Number(highestPrice.toFixed(5)),
    lowestPrice: Number(lowestPrice.toFixed(5)),
    maePoints: Number(maePoints.toFixed(5)),
    maeR,
    maeTimestamp,
    mfePoints: Number(mfePoints.toFixed(5)),
    mfeR,
    mfeTimestamp,
    maeBeforeMfe,
    halfFloorBreached,
    barsHeld: candles.length,
    timeframeUsed: timeframe,
    candles
  };
}

/**
 * End-to-end convenience method: Given trade parameters and timestamps,
 * fetches the historical candles and calculates exact excursion metrics.
 */
export async function calculateTradeExcursion(trade: TradeTimeWindow): Promise<ExcursionResult> {
  const entryMs = new Date(trade.entryTime).getTime();
  const exitMs = trade.exitTime ? new Date(trade.exitTime).getTime() : Date.now();

  const validStart = isNaN(entryMs) ? Date.now() - 3600000 : entryMs;
  const validEnd = isNaN(exitMs) ? Date.now() : exitMs;

  const { candles, timeframe } = await fetchHistoricalCandlesRange(trade.instrument, validStart, validEnd);

  return calculateExcursionFromCandles(
    {
      instrument: trade.instrument,
      bias: trade.bias,
      entryPrice: trade.entryPrice,
      initialStop: trade.initialStop,
      candles,
      exitPrice: trade.exitPrice
    },
    timeframe
  );
}

/**
 * Generates the Trade-Level Sequence & Excursion CSV matching all user requirements.
 */
export function buildSequenceExcursionCSV(trades: DetailedTradeExcursion[]): string {
  const headers = [
    '# ==============================================================================',
    '# MANNA SND - EXCURSION SEQUENCE & REVISED RULES VALIDATION DATASET',
    `# Export Generated: ${new Date().toISOString()}`,
    `# Total Trades Analyzed: ${trades.length}`,
    `# Half-Floor Stop Breached (< -0.5R MAE): ${trades.filter(t => t.half_floor_stop_breached).length} / ${trades.length}`,
    `# Reached TP1 (>= 2.0R MFE): ${trades.filter(t => t.tp1_reached_on_mfe).length} / ${trades.length}`,
    `# Reached TP2 (>= 3.0R MFE): ${trades.filter(t => t.tp2_reached_on_mfe).length} / ${trades.length}`,
    '# =============================================================================='
  ];

  const columns = [
    'setup_id',
    'outcome_id',
    'strategy_id',
    'symbol',
    'trade_direction',
    'entry_price',
    'initial_stop_price',
    'risk_points',
    'half_floor_stop_price',
    'recalculated_tp1_price',
    'recalculated_tp2_price',
    'final_exit_price',
    'entry_timestamp_utc',
    'exit_timestamp_utc',
    'trade_duration_minutes',
    'maximum_adverse_excursion_mae_r',
    'mae_points',
    'mae_timestamp_utc',
    'maximum_favourable_excursion_mfe_r',
    'mfe_points',
    'mfe_timestamp_utc',
    'mae_occurred_before_mfe',
    'half_floor_stop_breached',
    'half_floor_breached_before_tp1',
    'tp1_reached_on_mfe',
    'tp2_reached_on_mfe',
    'lowest_price_during_trade',
    'highest_price_during_trade',
    'actual_realized_r',
    'exit_reason',
    'total_candles_count'
  ];

  const rows: string[] = [...headers, columns.join(',')];

  for (const t of trades) {
    const row = [
      t.setup_id,
      t.outcome_id || '',
      t.strategy_id,
      t.symbol,
      t.direction,
      t.entry_price,
      t.initial_stop_price,
      t.risk_points,
      t.half_floor_stop_price,
      t.tp1_price,
      t.tp2_price,
      t.final_exit_price,
      t.entry_timestamp_utc,
      t.exit_timestamp_utc,
      t.trade_duration_minutes,
      t.mae_r,
      t.mae_points,
      t.mae_timestamp_utc || '',
      t.mfe_r,
      t.mfe_points,
      t.mfe_timestamp_utc || '',
      t.mae_occurred_before_mfe ? 'TRUE' : 'FALSE',
      t.half_floor_stop_breached ? 'TRUE' : 'FALSE',
      t.half_floor_breached_before_tp1 ? 'TRUE' : 'FALSE',
      t.tp1_reached_on_mfe ? 'TRUE' : 'FALSE',
      t.tp2_reached_on_mfe ? 'TRUE' : 'FALSE',
      t.lowest_price_during_trade,
      t.highest_price_during_trade,
      t.actual_realized_r,
      t.exit_reason,
      t.total_candles_count
    ];
    rows.push(row.map(v => (v === null || v === undefined) ? '' : v).join(','));
  }

  return rows.join('\n');
}

/**
 * Generates the Candle-Level Replay CSV supporting true simulation and bar-by-bar backtest of revised rules.
 */
export function buildCandleReplayCSV(trades: DetailedTradeExcursion[]): string {
  const columns = [
    'setup_id',
    'outcome_id',
    'strategy_id',
    'symbol',
    'trade_direction',
    'entry_price',
    'initial_stop_price',
    'half_floor_stop_price',
    'tp1_price',
    'tp2_price',
    'candle_index',
    'candle_timestamp_utc',
    'open',
    'high',
    'low',
    'close',
    'volume',
    'candle_mae_points',
    'candle_mae_r',
    'candle_mfe_points',
    'candle_mfe_r',
    'cum_lowest_price',
    'cum_highest_price',
    'cum_mae_points',
    'cum_mae_r',
    'cum_mfe_points',
    'cum_mfe_r',
    'half_floor_breached_this_bar',
    'tp1_reached_this_bar',
    'tp2_reached_this_bar'
  ];

  const rows: string[] = [columns.join(',')];

  for (const t of trades) {
    if (!t.candles || t.candles.length === 0) continue;

    const isLong = t.direction === 'LONG';
    const risk = t.risk_points > 0 ? t.risk_points : (t.entry_price * 0.005);

    let cumLowest = t.entry_price;
    let cumHighest = t.entry_price;

    t.candles.forEach((c, idx) => {
      cumLowest = Math.min(cumLowest, c.low);
      cumHighest = Math.max(cumHighest, c.high);

      const barMaePts = isLong ? Math.max(0, t.entry_price - c.low) : Math.max(0, c.high - t.entry_price);
      const barMaeR = Number((barMaePts / risk).toFixed(2));

      const barMfePts = isLong ? Math.max(0, c.high - t.entry_price) : Math.max(0, t.entry_price - c.low);
      const barMfeR = Number((barMfePts / risk).toFixed(2));

      const cumMaePts = isLong ? Math.max(0, t.entry_price - cumLowest) : Math.max(0, cumHighest - t.entry_price);
      const cumMaeR = Number((cumMaePts / risk).toFixed(2));

      const cumMfePts = isLong ? Math.max(0, cumHighest - t.entry_price) : Math.max(0, t.entry_price - cumLowest);
      const cumMfeR = Number((cumMfePts / risk).toFixed(2));

      const halfFloorBreached = isLong ? (c.low <= t.half_floor_stop_price) : (c.high >= t.half_floor_stop_price);
      const tp1Reached = isLong ? (c.high >= t.tp1_price) : (c.low <= t.tp1_price);
      const tp2Reached = isLong ? (c.high >= t.tp2_price) : (c.low <= t.tp2_price);

      const row = [
        t.setup_id,
        t.outcome_id || '',
        t.strategy_id,
        t.symbol,
        t.direction,
        t.entry_price,
        t.initial_stop_price,
        t.half_floor_stop_price,
        t.tp1_price,
        t.tp2_price,
        idx + 1,
        c.timestamp,
        c.open,
        c.high,
        c.low,
        c.close,
        c.volume,
        Number(barMaePts.toFixed(5)),
        barMaeR,
        Number(barMfePts.toFixed(5)),
        barMfeR,
        Number(cumLowest.toFixed(5)),
        Number(cumHighest.toFixed(5)),
        Number(cumMaePts.toFixed(5)),
        cumMaeR,
        Number(cumMfePts.toFixed(5)),
        cumMfeR,
        halfFloorBreached ? 'TRUE' : 'FALSE',
        tp1Reached ? 'TRUE' : 'FALSE',
        tp2Reached ? 'TRUE' : 'FALSE'
      ];
      rows.push(row.join(','));
    });
  }

  return rows.join('\n');
}

/**
 * Loads all trades (optionally filtered by strategy) and calculates detailed excursions with historical candles.
 */
export async function loadDetailedTradeExcursions(strategyFilter?: string): Promise<DetailedTradeExcursion[]> {
  let sql = `SELECT * FROM outcomes`;
  const params: any[] = [];
  if (strategyFilter && strategyFilter !== 'all') {
    sql += ` WHERE strategy_id = ?`;
    params.push(strategyFilter);
  }
  sql += ` ORDER BY created_at ASC`;

  const outcomes = await queryDb(sql, params);
  const results: DetailedTradeExcursion[] = [];

  for (const o of outcomes) {
    try {
      const setup = await queries.getSetupById(o.setup_id, o.setup_market || 'futures');
      const stratId = o.strategy_id || setup?.strategy_id || 'manna_snd';
      const instrument = setup?.instrument || o.instrument || 'NQ=F';
      const bias = (setup?.bias || o.bias || 'long').toUpperCase() === 'SHORT' ? 'SHORT' : 'LONG';
      const entryPrice = setup?.entry_price_recorded || setup?.entry_zone_mid || o.execution_price || 1.0;
      const initialStop = setup?.initial_stop || setup?.stop || (bias === 'LONG' ? entryPrice * 0.995 : entryPrice * 1.005);
      const riskPoints = Math.abs(entryPrice - initialStop);

      const halfFloorStopPrice = bias === 'LONG'
        ? Number((entryPrice - 0.5 * riskPoints).toFixed(5))
        : Number((entryPrice + 0.5 * riskPoints).toFixed(5));

      const tp1Price = setup?.tp1 || (bias === 'LONG' ? Number((entryPrice + 2.0 * riskPoints).toFixed(5)) : Number((entryPrice - 2.0 * riskPoints).toFixed(5)));
      const tp2Price = setup?.tp2 || (bias === 'LONG' ? Number((entryPrice + 3.0 * riskPoints).toFixed(5)) : Number((entryPrice - 3.0 * riskPoints).toFixed(5)));
      const exitPrice = o.execution_price || (o.outcome_type === 'tp1_hit' ? tp1Price : o.outcome_type === 'tp2_hit' ? tp2Price : initialStop);

      const entryIso = setup?.entry_triggered_at || setup?.created_at || o.created_at;
      const exitIso = setup?.resolved_at || o.execution_time || o.created_at;
      const entryTimeMs = new Date(entryIso).getTime();
      const exitTimeMs = new Date(exitIso).getTime();
      const durMin = Math.max(1, Math.round((exitTimeMs - entryTimeMs) / 60000));

      const excursion = await calculateTradeExcursion({
        instrument,
        bias: bias.toLowerCase(),
        entryPrice,
        initialStop,
        entryTime: entryIso,
        exitTime: exitIso,
        exitPrice
      });

      // Check whether half floor was breached BEFORE reaching TP1
      let halfFloorBreachedBeforeTp1 = false;
      if (excursion.candles && excursion.candles.length > 0) {
        for (const c of excursion.candles) {
          const isBreached = bias === 'LONG' ? (c.low <= halfFloorStopPrice) : (c.high >= halfFloorStopPrice);
          const isTp1 = bias === 'LONG' ? (c.high >= tp1Price) : (c.low <= tp1Price);
          if (isBreached && !isTp1) {
            halfFloorBreachedBeforeTp1 = true;
            break;
          }
          if (isTp1 && !isBreached) {
            halfFloorBreachedBeforeTp1 = false;
            break;
          }
        }
      }

      results.push({
        setup_id: o.setup_id,
        outcome_id: o.id,
        strategy_id: stratId,
        symbol: instrument,
        direction: bias,
        entry_price: entryPrice,
        initial_stop_price: initialStop,
        risk_points: Number(riskPoints.toFixed(5)),
        half_floor_stop_price: halfFloorStopPrice,
        tp1_price: tp1Price,
        tp2_price: tp2Price,
        final_exit_price: exitPrice,
        entry_timestamp_utc: entryIso,
        exit_timestamp_utc: exitIso,
        trade_duration_minutes: durMin,
        mae_points: excursion.maePoints,
        mae_r: excursion.maeR,
        mae_timestamp_utc: excursion.maeTimestamp,
        mfe_points: excursion.mfePoints,
        mfe_r: excursion.mfeR,
        mfe_timestamp_utc: excursion.mfeTimestamp,
        mae_occurred_before_mfe: excursion.maeBeforeMfe,
        half_floor_stop_breached: excursion.halfFloorBreached,
        half_floor_breached_before_tp1: halfFloorBreachedBeforeTp1,
        tp1_reached_on_mfe: excursion.mfeR >= 2.0,
        tp2_reached_on_mfe: excursion.mfeR >= 3.0,
        lowest_price_during_trade: excursion.lowestPrice,
        highest_price_during_trade: excursion.highestPrice,
        actual_realized_r: o.realized_pl ?? 0,
        exit_reason: o.exit_reason || o.outcome_type,
        total_candles_count: excursion.barsHeld,
        candles: excursion.candles
      });
    } catch (err: any) {
      logger.error({ outcomeId: o.id, err: err.message }, 'Failed to compute detailed excursion for trade');
    }
  }

  return results;
}

