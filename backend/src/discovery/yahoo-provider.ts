import YahooFinance from 'yahoo-finance2';
import { Candle } from './types';
import { createLogger } from '../telemetry/logger';
import { queryDb } from '../db/database';
import { getTwelveDataCandles, getTwelveDataPrice } from './twelvedata-provider';
import { getCtraderCandles, getCtraderLivePrice, getCtraderQuoteDetails } from './ctrader-provider';
import { deriveBidAsk, QuoteDetails } from './spread-helper';

export type LiveQuoteDetails = QuoteDetails;

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
    'RTY': 'RTY=F',
    'ZN': 'ZN=F',
    'EUR/USD': 'EURUSD=X',
    'GBP/USD': 'GBPUSD=X',
    'USD/JPY': 'USDJPY=X',
    'AUD/USD': 'AUDUSD=X',
    'EUR/GBP': 'EURGBP=X',
    'GBP/JPY': 'GBPJPY=X',
    'USD/CAD': 'USDCAD=X',
    'EUR/JPY': 'EURJPY=X'
};

interface CacheEntry<T> {
    data: T;
    timestamp: number;
}

const CANDLE_CACHE_TTL_MS = 120 * 1000; // 2 minutes global cache for historical candles
const PRICE_CACHE_TTL_MS = 15 * 1000;  // 15s cache for fast live price updates

const candleCache = new Map<string, CacheEntry<Candle[]>>();
const priceCache = new Map<string, CacheEntry<number>>();
const quoteCache = new Map<string, CacheEntry<LiveQuoteDetails>>();

// In-flight deduplication to prevent cache stampedes
const inFlightCandles = new Map<string, Promise<Candle[]>>();
const inFlightPrices = new Map<string, Promise<number>>();
const inFlightQuotes = new Map<string, Promise<LiveQuoteDetails | null>>();

// Concurrency semaphore + dispatch spacing to avoid Yahoo 429s without serializing requests
const MAX_CONCURRENT_YAHOO = 6;
const YAHOO_DISPATCH_SPACING_MS = 100;
const YAHOO_TIMEOUT_MS = 8_000;
let yahooActiveCount = 0;
let lastYahooDispatchAt = 0;
const yahooWaitQueue: Array<() => void> = [];

async function runYahooLimited<T>(fn: () => Promise<T>, timeoutMs = YAHOO_TIMEOUT_MS): Promise<T> {
    if (yahooActiveCount >= MAX_CONCURRENT_YAHOO) {
        await new Promise<void>((resolve) => yahooWaitQueue.push(resolve));
    }
    yahooActiveCount += 1;
    let timer: NodeJS.Timeout | undefined;
    try {
        const now = Date.now();
        const elapsed = now - lastYahooDispatchAt;
        if (elapsed < YAHOO_DISPATCH_SPACING_MS) {
            const waitMs = YAHOO_DISPATCH_SPACING_MS - elapsed;
            lastYahooDispatchAt = now + waitMs;
            await new Promise((r) => setTimeout(r, waitMs));
        } else {
            lastYahooDispatchAt = now;
        }

        return await Promise.race([
            fn(),
            new Promise<never>((_, reject) => {
                timer = setTimeout(() => reject(new Error(`Yahoo request timed out after ${timeoutMs}ms`)), timeoutMs);
            })
        ]);
    } finally {
        if (timer) clearTimeout(timer);
        yahooActiveCount -= 1;
        const next = yahooWaitQueue.shift();
        if (next) next();
    }
}

/**
 * Aggregates hourly (or smaller) bars into UTC-aligned 4-hour OHLC candles
 * when an upstream provider (such as Yahoo) returns 1h bars for '4h'.
 */
export function aggregateToFourHourCandles(candles: Candle[]): Candle[] {
    if (candles.length < 2) return candles;
    const t0 = new Date(candles[0].timestamp).getTime();
    const t1 = new Date(candles[1].timestamp).getTime();
    const deltaHours = Math.abs(t1 - t0) / (1000 * 60 * 60);
    if (deltaHours >= 3.5) {
        return candles;
    }

    const FOUR_HOURS_SEC = 4 * 60 * 60;
    const buckets = new Map<number, Candle>();

    for (const c of candles) {
        const unixSec = Math.floor(new Date(c.timestamp).getTime() / 1000);
        if (!Number.isFinite(unixSec) || unixSec <= 0) continue;
        const bucketSec = Math.floor(unixSec / FOUR_HOURS_SEC) * FOUR_HOURS_SEC;
        const existing = buckets.get(bucketSec);
        if (!existing) {
            buckets.set(bucketSec, {
                open: c.open,
                high: c.high,
                low: c.low,
                close: c.close,
                volume: c.volume || 0,
                timestamp: new Date(bucketSec * 1000).toISOString()
            });
        } else {
            existing.high = Math.max(existing.high, c.high);
            existing.low = Math.min(existing.low, c.low);
            existing.close = c.close;
            existing.volume = (existing.volume || 0) + (c.volume || 0);
        }
    }

    return Array.from(buckets.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([, bar]) => bar);
}

export async function getLiveCandles(
    instrument: string,
    timeframe: '1m' | '5m' | '15m' | '1h' | '4h' | '1d',
    count: number
): Promise<Candle[]> {
    const isForex = instrument.includes('/');

    // 1. Primary Forex Feed: IC Markets (cTrader Open API)
    // Unlimited, real-time broker-grade candles across all timeframes.
    if (isForex) {
        try {
            const ctCandles = await getCtraderCandles(instrument, timeframe, count);
            if (ctCandles && ctCandles.length > 0) {
                return ctCandles;
            }
        } catch (ctErr: any) {
            logger.warn({ instrument, err: ctErr.message }, 'cTrader failed for forex candles, falling back to Twelve Data');
        }
    }

    // 2. Secondary Forex Feed: Twelve Data (shielded from high-frequency 1m background polling)
    const isBackground1mPoll = timeframe === '1m' && count <= 10;
    if (isForex && !isBackground1mPoll) {
        try {
            const tdCandles = await getTwelveDataCandles(instrument, timeframe, count);
            if (tdCandles && tdCandles.length > 0) {
                return tdCandles;
            }
        } catch (tdErr: any) {
            logger.warn({ instrument, err: tdErr.message }, 'Twelve Data failed for forex candles, falling back to Yahoo');
        }
    }

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
            const lookbackDays = timeframe === '1m' ? 1 : (timeframe === '5m' || timeframe === '15m') ? 30 : timeframe === '1h' ? 120 : timeframe === '4h' ? 365 : 1825;
            const intervalStr = (timeframe === '4h' ? '1h' : timeframe === '1d' ? '1d' : timeframe);
            const rangeStr = lookbackDays <= 1 ? '1d' : lookbackDays <= 5 ? '5d' : lookbackDays <= 30 ? '1mo' : lookbackDays <= 90 ? '3mo' : '1y';

            const url = `https://query2.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?interval=${intervalStr}&range=${rangeStr}`;
            const response = await runYahooLimited(() =>
                fetch(url, {
                    signal: AbortSignal.timeout(YAHOO_TIMEOUT_MS),
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Accept': 'application/json'
                    }
                })
            );

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
                        const openVal = Number(quoteObj.open[i].toFixed(5));
                        const closeVal = Number(quoteObj.close[i].toFixed(5));
                        const highRaw = quoteObj.high?.[i] ?? Math.max(openVal, closeVal);
                        const lowRaw = quoteObj.low?.[i] ?? Math.min(openVal, closeVal);
                        candles.push({
                            open: openVal,
                            high: Number(Number(highRaw).toFixed(5)),
                            low: Number(Number(lowRaw).toFixed(5)),
                            close: closeVal,
                            volume: Number(quoteObj.volume?.[i] || 10000),
                            timestamp: new Date(timestamps[i] * 1000).toISOString()
                        });
                    }
                }

                const normalizedCandles = timeframe === '4h' ? aggregateToFourHourCandles(candles) : candles;

                if (normalizedCandles.length > 0) {
                    candleCache.set(cacheKey, { data: normalizedCandles, timestamp: Date.now() });
                    
                    const lastCandle = normalizedCandles[normalizedCandles.length - 1];
                    if (lastCandle && lastCandle.close > 0) {
                        priceCache.set(instrument, { data: lastCandle.close, timestamp: Date.now() });
                    }

                    return normalizedCandles;
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

function cacheQuoteDetails(instrument: string, details: LiveQuoteDetails): void {
    const now = Date.now();
    priceCache.set(instrument, { data: details.price, timestamp: now });
    quoteCache.set(instrument, { data: details, timestamp: now });
}

function extractYahooQuoteDetails(instrument: string, quote: any): LiveQuoteDetails | null {
    const rawPrice = quote?.regularMarketPrice ?? quote?.postMarketPrice ?? quote?.bid ?? quote?.ask;
    if (typeof rawPrice !== 'number' || !Number.isFinite(rawPrice) || rawPrice <= 0) {
        return null;
    }
    const numPrice = Number(rawPrice.toFixed(5));
    const rawBid = typeof quote?.bid === 'number' && quote.bid > 0 ? quote.bid : undefined;
    const rawAsk = typeof quote?.ask === 'number' && quote.ask > 0 ? quote.ask : undefined;
    return deriveBidAsk(numPrice, instrument, rawBid, rawAsk);
}

/**
 * Batch-fetches live quotes for a list of instruments in a single Yahoo request
 * (skipping instruments already served by cTrader, fresh 15s cache, or fresh IBKR DB ticks).
 */
export async function prefetchLiveQuotes(instruments: string[]): Promise<void> {
    const unique = Array.from(new Set(instruments.filter(Boolean)));
    if (unique.length === 0) return;

    const now = Date.now();
    const existingPromises: Array<Promise<LiveQuoteDetails | null>> = [];
    const needLookup: string[] = [];

    for (const inst of unique) {
        const isForex = inst.includes('/');
        if (isForex) {
            const ctQuote = getCtraderQuoteDetails(inst);
            if (ctQuote && ctQuote.price > 0) continue;
        }

        const cachedQuote = quoteCache.get(inst);
        if (cachedQuote && now - cachedQuote.timestamp < PRICE_CACHE_TTL_MS) continue;

        const inFlight = inFlightQuotes.get(inst);
        if (inFlight) {
            existingPromises.push(inFlight);
            continue;
        }

        if (SYMBOL_MAP[inst] || (process.env.MARKET_DATA_PROVIDER === 'ibkr' && !isForex)) {
            needLookup.push(inst);
        }
    }

    if (needLookup.length === 0) {
        if (existingPromises.length > 0) {
            await Promise.allSettled(existingPromises);
        }
        return;
    }

    // Batch-check IBKR DB prices if configured
    const remainingForYahoo: string[] = [];
    if (process.env.MARKET_DATA_PROVIDER === 'ibkr') {
        const nonForex = needLookup.filter((inst) => !inst.includes('/'));
        const forexList = needLookup.filter((inst) => inst.includes('/'));
        remainingForYahoo.push(...forexList);

        if (nonForex.length > 0) {
            try {
                const placeholders = nonForex.map(() => '?').join(', ');
                const rows = await queryDb<{ instrument: string; price: number; updated_at: string }>(
                    `SELECT instrument, price, updated_at FROM instrument_prices WHERE instrument IN (${placeholders})`,
                    nonForex
                );
                const freshSet = new Set<string>();
                for (const row of rows || []) {
                    const lastUpdate = new Date(row.updated_at).getTime();
                    const p = Number(row.price);
                    if (Date.now() - lastUpdate < 30 * 1000 && Number.isFinite(p) && p > 0) {
                        cacheQuoteDetails(row.instrument, deriveBidAsk(Number(p.toFixed(5)), row.instrument));
                        freshSet.add(row.instrument);
                    }
                }
                for (const inst of nonForex) {
                    if (!freshSet.has(inst) && SYMBOL_MAP[inst]) {
                        remainingForYahoo.push(inst);
                    }
                }
            } catch (err: any) {
                logger.error({ err: err.message }, 'Failed batch IBKR instrument_prices lookup; falling back to Yahoo');
                for (const inst of nonForex) {
                    if (SYMBOL_MAP[inst]) remainingForYahoo.push(inst);
                }
            }
        }
    } else {
        for (const inst of needLookup) {
            if (SYMBOL_MAP[inst]) remainingForYahoo.push(inst);
        }
    }

    const batchInsts = remainingForYahoo.filter((inst) => !inFlightQuotes.has(inst));
    if (batchInsts.length > 0) {
        const yahooToInsts = new Map<string, string[]>();
        for (const inst of batchInsts) {
            const ySym = SYMBOL_MAP[inst];
            if (!ySym) continue;
            const key = ySym.toUpperCase();
            const list = yahooToInsts.get(key) || [];
            list.push(inst);
            yahooToInsts.set(key, list);
        }
        const uniqueYahooSyms = Array.from(new Set(batchInsts.map((i) => SYMBOL_MAP[i]).filter(Boolean)));

        const resolvers = new Map<string, (val: LiveQuoteDetails | null) => void>();
        const batchPromises: Array<Promise<LiveQuoteDetails | null>> = [];
        for (const inst of batchInsts) {
            let resolveFn!: (val: LiveQuoteDetails | null) => void;
            const p = new Promise<LiveQuoteDetails | null>((resolve) => {
                resolveFn = resolve;
            });
            resolvers.set(inst, resolveFn);
            inFlightQuotes.set(inst, p);
            batchPromises.push(p);
        }

        try {
            const rawQuotes: any = await runYahooLimited(() =>
                yahooFinance.quote(uniqueYahooSyms, {}, { validateResult: false })
            ).catch(() => null);

            const quoteList: any[] = Array.isArray(rawQuotes)
                ? rawQuotes
                : rawQuotes
                    ? [rawQuotes]
                    : [];

            const quotesBySymbol = new Map<string, any>();
            for (const q of quoteList) {
                if (q && typeof q.symbol === 'string') {
                    quotesBySymbol.set(q.symbol.toUpperCase(), q);
                }
            }

            for (const inst of batchInsts) {
                const ySym = SYMBOL_MAP[inst]?.toUpperCase();
                const q = ySym ? quotesBySymbol.get(ySym) : null;
                const details = q ? extractYahooQuoteDetails(inst, q) : null;
                if (details) {
                    cacheQuoteDetails(inst, details);
                }
                resolvers.get(inst)?.(details);
            }
        } catch (err: any) {
            logger.warn({ err: err.message, count: uniqueYahooSyms.length }, 'Batch Yahoo quote prefetch failed');
            for (const inst of batchInsts) {
                resolvers.get(inst)?.(null);
            }
        } finally {
            for (const inst of batchInsts) {
                inFlightQuotes.delete(inst);
            }
        }
        existingPromises.push(...batchPromises);
    }

    if (existingPromises.length > 0) {
        await Promise.allSettled(existingPromises);
    }
}

export async function getLiveQuoteDetails(instrument: string, bypassCache = false): Promise<LiveQuoteDetails | null> {
    const isForex = instrument.includes('/');

    // 1. Primary Forex Feed: IC Markets (cTrader Open API)
    // Return exact institutional Bid, Ask, and Raw ECN Spread
    if (isForex) {
        const ctQuote = getCtraderQuoteDetails(instrument);
        if (ctQuote && ctQuote.price > 0) {
            return ctQuote;
        }
    }

    // 2. Short-TTL fresh quote cache (15s) — skipped when publish-gate / discovery requires a fresh tick
    if (!bypassCache) {
        const cachedQuote = quoteCache.get(instrument);
        if (cachedQuote && Date.now() - cachedQuote.timestamp < PRICE_CACHE_TTL_MS) {
            return cachedQuote.data;
        }
    }

    // 3. Coalesce onto existing in-flight quote request
    if (!bypassCache) {
        const existingInFlight = inFlightQuotes.get(instrument);
        if (existingInFlight) {
            return existingInFlight;
        }
    }

    // 4. Check if IBKR is configured as the active provider (futures only)
    if (process.env.MARKET_DATA_PROVIDER === 'ibkr' && !isForex) {
        try {
            const rows = await queryDb('SELECT price, updated_at FROM instrument_prices WHERE instrument = ?', [instrument]);
            if (rows && rows.length > 0) {
                const lastUpdate = new Date(rows[0].updated_at).getTime();
                if (Date.now() - lastUpdate < 30 * 1000 && Number(rows[0].price) > 0) {
                    const numPrice = Number(Number(rows[0].price).toFixed(5));
                    const details = deriveBidAsk(numPrice, instrument);
                    cacheQuoteDetails(instrument, details);
                    return details;
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
    if (!yahooSymbol) return null;

    const fetchPromise = (async (): Promise<LiveQuoteDetails | null> => {
        try {
            const quote: any = await runYahooLimited(() =>
                yahooFinance.quote(yahooSymbol, {}, { validateResult: false })
            ).catch(() => null);
            const details = quote ? extractYahooQuoteDetails(instrument, quote) : null;
            if (details) {
                cacheQuoteDetails(instrument, details);
                return details;
            }

            const candles = await getLiveCandles(instrument, '1m', 2);
            if (candles.length > 0) {
                const cPrice = candles[candles.length - 1].close;
                if (cPrice > 0) {
                    const fallbackDetails = deriveBidAsk(cPrice, instrument);
                    cacheQuoteDetails(instrument, fallbackDetails);
                    return fallbackDetails;
                }
            }
            return null;
        } catch (err: any) {
            logger.error({ instrument, message: err.message }, 'Failed to fetch live quote from Yahoo');
            return null;
        } finally {
            inFlightQuotes.delete(instrument);
        }
    })();

    inFlightQuotes.set(instrument, fetchPromise);
    return fetchPromise;
}

export async function getLiveCurrentPrice(instrument: string, bypassCache = false): Promise<number> {
    const isForex = instrument.includes('/');

    // 1. Primary Forex Feed: IC Markets (cTrader Open API)
    // Instant sub-second price ticks from in-memory WebSocket cache.
    if (isForex) {
        const ctPrice = getCtraderLivePrice(instrument);
        if (ctPrice > 0) {
            return ctPrice;
        }
    }

    if (!bypassCache) {
        const cached = priceCache.get(instrument);
        if (cached && Date.now() - cached.timestamp < PRICE_CACHE_TTL_MS) {
            return cached.data;
        }

        const cachedQuote = quoteCache.get(instrument);
        if (cachedQuote && Date.now() - cachedQuote.timestamp < PRICE_CACHE_TTL_MS) {
            return cachedQuote.data.price;
        }

        if (inFlightPrices.has(instrument)) {
            return inFlightPrices.get(instrument)!;
        }
    }

    const fetchPromise = getLiveQuoteDetails(instrument, bypassCache)
        .then((q) => q?.price ?? 0)
        .finally(() => {
            inFlightPrices.delete(instrument);
        });

    if (!bypassCache) {
        inFlightPrices.set(instrument, fetchPromise);
    }
    return fetchPromise;
}

