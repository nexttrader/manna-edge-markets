import YahooFinance from 'yahoo-finance2';
import { Candle } from './types';
import { createLogger } from '../telemetry/logger';

const logger = createLogger('YahooProvider');

// Properly instantiate YahooFinance v3 client
const yahooFinance = new YahooFinance();

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

const CACHE_TTL_MS = 15 * 1000; // 15s cache for fast live price updates
const candleCache = new Map<string, CacheEntry<Candle[]>>();
const priceCache = new Map<string, CacheEntry<number>>();

export async function getLiveCandles(
    instrument: string,
    timeframe: '1m' | '5m' | '15m' | '1h' | '4h' | '1d',
    count: number
): Promise<Candle[]> {
    const yahooSymbol = SYMBOL_MAP[instrument];
    if (!yahooSymbol) {
        logger.warn({ instrument }, 'No Yahoo Finance ticker mapping found for instrument');
        return [];
    }

    const cacheKey = `${instrument}_${timeframe}_${count}`;
    const cached = candleCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
        return cached.data;
    }

    try {
        const now = new Date();
        // Use sufficient lookback days to span weekend & holiday market gaps
        const lookbackDays = timeframe === '1m' ? 5 : (timeframe === '5m' || timeframe === '15m') ? 7 : 30;
        const period1 = new Date(now.getTime() - lookbackDays * 24 * 60 * 60 * 1000);
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
                
                // Also update price cache with latest close
                const lastCandle = candles[candles.length - 1];
                if (lastCandle && lastCandle.close > 0) {
                    priceCache.set(instrument, { data: lastCandle.close, timestamp: Date.now() });
                }

                return candles;
            }
        }

        logger.warn({ instrument, yahooSymbol }, 'Yahoo returned 0 candles for instrument');
        return [];
    } catch (err: any) {
        logger.error({ instrument, yahooSymbol, message: err.message }, 'Failed to fetch live candles from Yahoo');
        return [];
    }
}

export async function getLiveCurrentPrice(instrument: string): Promise<number> {
    const yahooSymbol = SYMBOL_MAP[instrument];
    if (!yahooSymbol) return 0;

    const cached = priceCache.get(instrument);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
        return cached.data;
    }

    try {
        const quote: any = await yahooFinance.quote(yahooSymbol);
        const price = quote?.regularMarketPrice ?? quote?.postMarketPrice ?? quote?.bid ?? quote?.ask;
        if (price !== undefined && price !== null && price > 0) {
            const numPrice = Number(price.toFixed(5));
            priceCache.set(instrument, { data: numPrice, timestamp: Date.now() });
            return numPrice;
        }
        
        // Fallback to latest candle close from 1m chart if quote is empty
        const candles = await getLiveCandles(instrument, '1m', 2);
        if (candles.length > 0) {
            return candles[candles.length - 1].close;
        }
        return 0;
    } catch (err: any) {
        logger.error({ instrument, message: err.message }, 'Failed to fetch live price from Yahoo');
        const candles = await getLiveCandles(instrument, '1m', 2);
        if (candles.length > 0) {
            return candles[candles.length - 1].close;
        }
        return 0;
    }
}
