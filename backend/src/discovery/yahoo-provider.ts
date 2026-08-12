import YahooFinance from 'yahoo-finance2';
import { Candle } from './types';
import { createLogger } from '../telemetry/logger';
import { queryDb } from '../db/database';

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

const CANDLE_CACHE_TTL_MS = 120 * 1000; // 2 minutes global cache for historical candles
const PRICE_CACHE_TTL_MS = 15 * 1000;  // 15s cache for fast live price updates

const candleCache = new Map<string, CacheEntry<Candle[]>>();
const priceCache = new Map<string, CacheEntry<number>>();

// In-flight deduplication to prevent cache stampedes
const inFlightCandles = new Map<string, Promise<Candle[]>>();
const inFlightPrices = new Map<string, Promise<number>>();

// Rate limiting to prevent 429 Too Many Requests
let lastYahooRequestTime = 0;
const YAHOO_MIN_DELAY_MS = 1500; // 1.5s delay between outbound Yahoo requests

async function acquireYahooRateLimit() {
    const now = Date.now();
    const timeSinceLast = now - lastYahooRequestTime;
    if (timeSinceLast < YAHOO_MIN_DELAY_MS) {
        await new Promise(r => setTimeout(r, YAHOO_MIN_DELAY_MS - timeSinceLast));
    }
    lastYahooRequestTime = Date.now();
}

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

    const cacheKey = `${instrument}_${timeframe}`;
    const cached = candleCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CANDLE_CACHE_TTL_MS && cached.data.length > 0) {
        return cached.data.slice(-count);
    }

    if (inFlightCandles.has(cacheKey)) {
        const candles = await inFlightCandles.get(cacheKey)!;
        return candles.slice(-count);
    }

    const fetchPromise = (async () => {
        try {
            await acquireYahooRateLimit();
            const now = new Date();
            const lookbackDays = timeframe === '1m' ? 1 : (timeframe === '5m' || timeframe === '15m') ? 30 : timeframe === '1h' ? 120 : timeframe === '4h' ? 365 : 1825;
            const period1 = new Date(now.getTime() - lookbackDays * 24 * 60 * 60 * 1000);
            const intervalStr = (timeframe === '4h' ? '1h' : timeframe === '1d' ? '1d' : timeframe);
            const rangeStr = lookbackDays <= 1 ? '1d' : lookbackDays <= 5 ? '5d' : lookbackDays <= 30 ? '1mo' : lookbackDays <= 90 ? '3mo' : '1y';

            const url = `https://query2.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?interval=${intervalStr}&range=${rangeStr}`;
            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`Yahoo HTTP ${response.status} ${response.statusText}`);
            }

            const chartResult: any = await response.json();
            const result = chartResult?.chart?.result?.[0];

            if (result && result.indicators && result.indicators.quote && result.indicators.quote.length > 0) {
                const quoteObj = result.indicators.quote[0];
                const timestamps = result.timestamp || [];
                
                const candles: Candle[] = [];
                for (let i = 0; i < timestamps.length; i++) {
                    if (quoteObj.open[i] !== null && quoteObj.close[i] !== null) {
                        candles.push({
                            open: Number(quoteObj.open[i].toFixed(5)),
                            high: Number(quoteObj.high[i].toFixed(5)),
                            low: Number(quoteObj.low[i].toFixed(5)),
                            close: Number(quoteObj.close[i].toFixed(5)),
                            volume: Number(quoteObj.volume?.[i] || 10000),
                            timestamp: new Date(timestamps[i] * 1000).toISOString()
                        });
                    }
                }

                if (candles.length > 0) {
                    candleCache.set(cacheKey, { data: candles, timestamp: Date.now() });
                    
                    const lastCandle = candles[candles.length - 1];
                    if (lastCandle && lastCandle.close > 0) {
                        priceCache.set(instrument, { data: lastCandle.close, timestamp: Date.now() });
                    }

                    return candles;
                }
            }

            logger.warn({ instrument, yahooSymbol }, 'Yahoo returned 0 live candles for instrument');
            return cached ? cached.data : [];
        } catch (err: any) {
            logger.error({ instrument, yahooSymbol, message: err.message }, 'Failed to fetch live candles from Yahoo');
            if (cached && cached.data.length > 0) {
                return cached.data;
            }
            return [];
        } finally {
            inFlightCandles.delete(cacheKey);
        }
    })();

    inFlightCandles.set(cacheKey, fetchPromise);
    const candles = await fetchPromise;
    return candles.slice(-count);
}

export async function getLiveCurrentPrice(instrument: string): Promise<number> {
    const isForex = instrument.includes('/');
    // 1. Check if IBKR is configured as the active provider (futures only)
    if (process.env.MARKET_DATA_PROVIDER === 'ibkr' && !isForex) {
        try {
            const rows = await queryDb('SELECT price, updated_at FROM instrument_prices WHERE instrument = ?', [instrument]);
            if (rows && rows.length > 0) {
                const lastUpdate = new Date(rows[0].updated_at).getTime();
                const now = Date.now();
                // If the price was updated less than 30 seconds ago, consider it valid and fresh
                if (now - lastUpdate < 30 * 1000) {
                    return rows[0].price;
                }
                logger.warn({ instrument, lastUpdate: rows[0].updated_at }, 'IBKR price in database is stale (>30s). Falling back to Yahoo.');
            } else {
                logger.warn({ instrument }, 'No IBKR price found in database. Falling back to Yahoo.');
            }
        } catch (err: any) {
            logger.error({ instrument, err: err.message }, 'Failed to query instrument_prices from DB. Falling back to Yahoo.');
        }
    }

    const yahooSymbol = SYMBOL_MAP[instrument];

    const cached = priceCache.get(instrument);
    if (cached && Date.now() - cached.timestamp < PRICE_CACHE_TTL_MS) {
        return cached.data;
    }

    if (!yahooSymbol) return 0;

    if (inFlightPrices.has(instrument)) {
        return inFlightPrices.get(instrument)!;
    }

    const fetchPromise = (async () => {
        try {
            await acquireYahooRateLimit();
            const quote: any = await yahooFinance.quote(yahooSymbol).catch(() => null);
            const price = quote?.regularMarketPrice ?? quote?.postMarketPrice ?? quote?.bid ?? quote?.ask;
            if (price !== undefined && price !== null && price > 0) {
                const numPrice = Number(price.toFixed(5));
                priceCache.set(instrument, { data: numPrice, timestamp: Date.now() });
                return numPrice;
            }
            
            const candles = await getLiveCandles(instrument, '1m', 2);
            if (candles.length > 0) {
                const cPrice = candles[candles.length - 1].close;
                priceCache.set(instrument, { data: cPrice, timestamp: Date.now() });
                return cPrice;
            }
            return 0;
        } catch (err: any) {
            logger.error({ instrument, message: err.message }, 'Failed to fetch live price from Yahoo');
            const candles = await getLiveCandles(instrument, '1m', 2);
            if (candles.length > 0) {
                const cPrice = candles[candles.length - 1].close;
                return cPrice;
            }
            return 0;
        } finally {
            inFlightPrices.delete(instrument);
        }
    })();

    inFlightPrices.set(instrument, fetchPromise);
    return fetchPromise;
}
