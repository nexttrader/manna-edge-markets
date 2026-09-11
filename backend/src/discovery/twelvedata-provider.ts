import { Candle } from './types';
import { createLogger } from '../telemetry/logger';

const logger = createLogger('TwelveDataProvider');

const TWELVE_DATA_API_KEY = process.env.TWELVE_DATA_API_KEY || '1d07d63ae2a547dbbd43c18377b85a65';

const TIMEFRAME_MAP: Record<string, string> = {
    '1m': '1min',
    '5m': '5min',
    '15m': '15min',
    '1h': '1h',
    '4h': '4h',
    '1d': '1day'
};

interface CacheEntry<T> {
    data: T;
    timestamp: number;
}

// Caching to strictly respect the 8 requests/min free tier
const candleCache = new Map<string, CacheEntry<Candle[]>>();
const priceCache = new Map<string, CacheEntry<number>>();

const inFlightCandles = new Map<string, Promise<Candle[]>>();
const inFlightPrices = new Map<string, Promise<number>>();

// Dynamic TTL based on candle timeframe:
function getCandleTTL(timeframe: string): number {
    switch (timeframe) {
        case '1m': return 60 * 1000;         // 1 minute
        case '5m': return 3 * 60 * 1000;     // 3 minutes
        case '15m': return 8 * 60 * 1000;    // 8 minutes
        case '1h': return 30 * 60 * 1000;    // 30 minutes
        case '4h': return 60 * 60 * 1000;    // 1 hour
        case '1d': return 4 * 60 * 60 * 1000;// 4 hours
        default: return 5 * 60 * 1000;
    }
}

const PRICE_CACHE_TTL_MS = 180 * 1000; // 3 minutes cache for fast live price checks (prevents rapid credit burn)

// Rate limiting: Twelve Data Free tier allows 8 requests/minute.
// We space outbound requests by at least 7.5 seconds to guarantee zero 429 errors.
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL_MS = 7600; // 7.6s spacing

async function acquireRateLimit(): Promise<void> {
    const now = Date.now();
    const elapsed = now - lastRequestTime;
    if (elapsed < MIN_REQUEST_INTERVAL_MS) {
        const waitMs = MIN_REQUEST_INTERVAL_MS - elapsed;
        await new Promise(resolve => setTimeout(resolve, waitMs));
    }
    lastRequestTime = Date.now();
}

/**
 * Fetch historical OHLC candles from Twelve Data
 */
export async function getTwelveDataCandles(
    instrument: string,
    timeframe: '1m' | '5m' | '15m' | '1h' | '4h' | '1d',
    count: number
): Promise<Candle[]> {
    const cacheKey = `${instrument}_${timeframe}`;
    const cached = candleCache.get(cacheKey);
    const ttl = getCandleTTL(timeframe);

    if (cached && Date.now() - cached.timestamp < ttl && cached.data.length > 0) {
        return cached.data.slice(-count);
    }

    if (inFlightCandles.has(cacheKey)) {
        const candles = await inFlightCandles.get(cacheKey)!;
        return candles.slice(-count);
    }

    const fetchPromise = (async () => {
        try {
            await acquireRateLimit();

            const interval = TIMEFRAME_MAP[timeframe] || '5min';
            // Request slightly more to cover calculations like ATR, capped at 2000 for deep review charts
            const outputSize = Math.min(Math.max(count, 30), 2000);
            const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(instrument)}&interval=${interval}&outputsize=${outputSize}&timezone=UTC&apikey=${TWELVE_DATA_API_KEY}`;

            const res = await fetch(url);
            if (!res.ok) {
                throw new Error(`Twelve Data HTTP ${res.status}: ${res.statusText}`);
            }

            const data: any = await res.json();
            if (data.status === 'error' || !data.values) {
                logger.warn({ instrument, error: data.message }, 'Twelve Data returned error for time_series');
                return cached ? cached.data : [];
            }

            // Twelve Data returns newest first -> reverse to chronological order (oldest to newest)
            const candles: Candle[] = [...data.values].reverse().map((v: any) => ({
                open: parseFloat(v.open),
                high: parseFloat(v.high),
                low: parseFloat(v.low),
                close: parseFloat(v.close),
                volume: parseInt(v.volume || '1000', 10),
                timestamp: new Date(v.datetime.replace(' ', 'T') + 'Z').toISOString()
            }));

            if (candles.length > 0) {
                candleCache.set(cacheKey, { data: candles, timestamp: Date.now() });

                // Update live price cache with the latest candle close for free!
                const latest = candles[candles.length - 1];
                if (latest && latest.close > 0) {
                    priceCache.set(instrument, { data: latest.close, timestamp: Date.now() });
                }

                logger.info({ instrument, timeframe, count: candles.length }, 'Fetched live candles from Twelve Data');
                return candles;
            }

            return cached ? cached.data : [];
        } catch (err: any) {
            logger.error({ instrument, timeframe, error: err.message }, 'Failed to fetch candles from Twelve Data');
            return cached ? cached.data : [];
        } finally {
            inFlightCandles.delete(cacheKey);
        }
    })();

    inFlightCandles.set(cacheKey, fetchPromise);
    const result = await fetchPromise;
    return result.slice(-count);
}

/**
 * Fetch current live spot price from Twelve Data (or from fresh candle cache)
 */
export async function getTwelveDataPrice(instrument: string): Promise<number> {
    const cached = priceCache.get(instrument);
    if (cached && Date.now() - cached.timestamp < PRICE_CACHE_TTL_MS) {
        return cached.data;
    }

    // If we have any cached candles from the last 15 minutes, use the last close (saves API calls!)
    for (const tf of ['1m', '5m', '15m']) {
        const cEntry = candleCache.get(`${instrument}_${tf}`);
        if (cEntry && Date.now() - cEntry.timestamp < 15 * 60 * 1000 && cEntry.data.length > 0) {
            const price = cEntry.data[cEntry.data.length - 1].close;
            priceCache.set(instrument, { data: price, timestamp: Date.now() });
            return price;
        }
    }

    if (inFlightPrices.has(instrument)) {
        return inFlightPrices.get(instrument)!;
    }

    const fetchPromise = (async () => {
        try {
            await acquireRateLimit();
            const url = `https://api.twelvedata.com/price?symbol=${encodeURIComponent(instrument)}&apikey=${TWELVE_DATA_API_KEY}`;
            const res = await fetch(url);
            if (!res.ok) throw new Error(`Twelve Data HTTP ${res.status}`);

            const data: any = await res.json();
            if (data.price) {
                const price = parseFloat(data.price);
                priceCache.set(instrument, { data: price, timestamp: Date.now() });
                return price;
            }
            return cached ? cached.data : 0;
        } catch (err: any) {
            logger.error({ instrument, error: err.message }, 'Failed to fetch live price from Twelve Data');
            return cached ? cached.data : 0;
        } finally {
            inFlightPrices.delete(instrument);
        }
    })();

    inFlightPrices.set(instrument, fetchPromise);
    return fetchPromise;
}

export interface TwelveDataUsage {
    timestamp: string;
    current_usage: number;        // usage in current minute (limit 8)
    plan_limit: number;           // limit per minute (8)
    daily_usage: number;          // usage today
    plan_daily_limit: number;     // limit per day (800)
    credits_left_today: number;   // remaining credits today
    plan_category: string;
}

// In-memory cache for API usage so checking credits doesn't burn credits!
let cachedUsage: TwelveDataUsage | null = null;
let lastUsageFetchTime = 0;
const USAGE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes cache

/**
 * Query live API usage metrics directly from Twelve Data (cached for 5 minutes)
 */
export async function getTwelveDataUsage(forceRefresh = false): Promise<TwelveDataUsage | null> {
    const now = Date.now();
    if (!forceRefresh && cachedUsage && (now - lastUsageFetchTime < USAGE_CACHE_TTL_MS)) {
        return cachedUsage;
    }

    try {
        const url = `https://api.twelvedata.com/api_usage?apikey=${TWELVE_DATA_API_KEY}`;
        const res = await fetch(url);
        if (!res.ok) return cachedUsage;
        const data: any = await res.json();
        const dailyLimit = data.plan_daily_limit || 800;
        const dailyUsage = data.daily_usage || 0;
        cachedUsage = {
            timestamp: data.timestamp || new Date().toISOString(),
            current_usage: data.current_usage || 0,
            plan_limit: data.plan_limit || 8,
            daily_usage: dailyUsage,
            plan_daily_limit: dailyLimit,
            credits_left_today: Math.max(0, dailyLimit - dailyUsage),
            plan_category: data.plan_category || 'basic'
        };
        lastUsageFetchTime = now;
        return cachedUsage;
    } catch {
        return cachedUsage;
    }
}
