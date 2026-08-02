import YahooFinance from 'yahoo-finance2';
import { Candle } from './types';
import { generateCandles, getCurrentPrice as getMockCurrentPrice } from './mock-data';
import { createLogger } from '../telemetry/logger';

const logger = createLogger('YahooProvider');

const yahooFinance = typeof YahooFinance === 'function' 
    ? new (YahooFinance as any)() 
    : (YahooFinance as any).default 
        ? new ((YahooFinance as any).default)() 
        : YahooFinance;

export const SYMBOL_MAP: Record<string, string> = {
    'ES': 'ES=F',
    'NQ': 'NQ=F',
    'YM': 'YM=F',
    'GC': 'GC=F',
    'CL': 'CL=F',
    'SI': 'SI=F',
    'EUR/USD': 'EURUSD=X',
    'GBP/USD': 'GBPUSD=X',
    'USD/JPY': 'USDJPY=X',
    'AUD/USD': 'AUDUSD=X',
    'EUR/GBP': 'EURGBP=X',
    'GBP/JPY': 'GBPJPY=X'
};

interface CacheEntry<T> {
    data: T;
    timestamp: number;
}

const CACHE_TTL_MS = 60 * 1000; // 60s cache
const candleCache = new Map<string, CacheEntry<Candle[]>>();
const priceCache = new Map<string, CacheEntry<number>>();

export async function getLiveCandles(
    instrument: string,
    timeframe: '1m' | '5m' | '15m' | '1h' | '4h' | '1d',
    count: number
): Promise<Candle[]> {
    const yahooSymbol = SYMBOL_MAP[instrument];
    if (!yahooSymbol) {
        logger.warn({ instrument }, 'No Yahoo Finance ticker mapping found; using fallback');
        return getFallbackCandles(instrument, timeframe, count);
    }

    const cacheKey = `${instrument}_${timeframe}_${count}`;
    const cached = candleCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
        return cached.data;
    }

    try {
        // Calculate period1 start date based on timeframe & count (capped to Yahoo API limits)
        const now = new Date();
        const timeframeMinutes = timeframe === '1m' ? 1 : timeframe === '5m' ? 5 : timeframe === '15m' ? 15 : timeframe === '1h' ? 60 : timeframe === '4h' ? 240 : 1440;
        let lookbackMs = (count + 20) * timeframeMinutes * 60 * 1000;
        
        // Yahoo API max lookback limits: 1m (7d), 5m/15m (55d), 1h (29d)
        const maxDays = timeframe === '1m' ? 7 : (timeframe === '5m' || timeframe === '15m') ? 55 : timeframe === '1h' ? 29 : 365;
        lookbackMs = Math.min(lookbackMs, maxDays * 24 * 60 * 60 * 1000);
        
        const period1 = new Date(now.getTime() - lookbackMs);

        const interval = (timeframe === '4h' ? '1h' : timeframe === '1d' ? '1d' : timeframe) as any;

        const chartResult: any = await yahooFinance.chart(yahooSymbol, {
            period1,
            interval
        });

        if (chartResult && chartResult.quotes && chartResult.quotes.length > 0) {
            const candles: Candle[] = chartResult.quotes
                .filter((q: any) => q.open !== null && q.close !== null && q.high !== null && q.low !== null)
                .slice(-count)
                .map((q: any) => ({
                    open: Number(q.open.toFixed(5)),
                    high: Number(q.high.toFixed(5)),
                    low: Number(q.low.toFixed(5)),
                    close: Number(q.close.toFixed(5)),
                    volume: Number(q.volume || 10000),
                    timestamp: new Date(q.date).toISOString()
                }));

            if (candles.length > 0) {
                candleCache.set(cacheKey, { data: candles, timestamp: Date.now() });
                return candles;
            }
        }

        logger.warn({ instrument, yahooSymbol }, 'Yahoo returned empty candles; using fallback');
        return getFallbackCandles(instrument, timeframe, count);
    } catch (err: any) {
        logger.error({ instrument, yahooSymbol, message: err.message }, 'Failed to fetch live candles from Yahoo; using fallback');
        return getFallbackCandles(instrument, timeframe, count);
    }
}

export async function getLiveCurrentPrice(instrument: string): Promise<number> {
    const yahooSymbol = SYMBOL_MAP[instrument];
    if (!yahooSymbol) {
        return getMockCurrentPrice(instrument);
    }

    const cached = priceCache.get(instrument);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
        return cached.data;
    }

    try {
        const quote: any = await yahooFinance.quote(yahooSymbol);
        const price = quote?.regularMarketPrice ?? quote?.postMarketPrice ?? quote?.bid;
        if (price !== undefined && price !== null) {
            const numPrice = Number(price.toFixed(5));
            priceCache.set(instrument, { data: numPrice, timestamp: Date.now() });
            return numPrice;
        }
        return getMockCurrentPrice(instrument);
    } catch (err: any) {
        logger.error({ instrument, message: err.message }, 'Failed to fetch live price from Yahoo; using fallback');
        return getMockCurrentPrice(instrument);
    }
}

function getFallbackCandles(instrument: string, timeframe: '1m' | '5m' | '15m' | '1h' | '4h' | '1d', count: number): Candle[] {
    const tfMinutes = timeframe === '1m' ? 1 : timeframe === '5m' ? 5 : timeframe === '15m' ? 15 : timeframe === '1h' ? 60 : timeframe === '4h' ? 240 : 1440;
    return generateCandles(instrument, count, tfMinutes);
}
