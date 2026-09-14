import { Candle } from './types';
import { createLogger } from '../telemetry/logger';

const logger = createLogger('cTraderProvider');

export const CTRADER_SYMBOL_MAP: Record<string, string> = {
    'EUR/USD': 'EURUSD',
    'GBP/USD': 'GBPUSD',
    'USD/JPY': 'USDJPY',
    'AUD/USD': 'AUDUSD',
    'EUR/GBP': 'EURGBP',
    'GBP/JPY': 'GBPJPY',
    'USD/CAD': 'USDCAD',
    'EUR/JPY': 'EURJPY',
    'XAU/USD': 'XAUUSD',
    'EURUSD': 'EURUSD',
    'GBPUSD': 'GBPUSD',
    'USDJPY': 'USDJPY',
    'AUDUSD': 'AUDUSD',
    'EURGBP': 'EURGBP',
    'GBPJPY': 'GBPJPY',
    'USDCAD': 'USDCAD',
    'EURJPY': 'EURJPY',
    'XAUUSD': 'XAUUSD',
};

const DEFAULT_DIGITS: Record<string, number> = {
    'EURUSD': 5,
    'GBPUSD': 5,
    'USDJPY': 3,
    'AUDUSD': 5,
    'EURGBP': 5,
    'GBPJPY': 3,
    'USDCAD': 5,
    'EURJPY': 3,
    'XAUUSD': 2,
};

// Numeric TrendbarPeriod enum values in cTrader Open API
const TIMEFRAME_PERIOD_MAP: Record<string, number> = {
    '1m': 1,   // M1
    '5m': 5,   // M5
    '15m': 7,  // M15
    '1h': 9,   // H1
    '4h': 10,  // H4
    '1d': 12,  // D1
};

export interface CTraderLiveQuote {
    symbol: string;
    bid: number;
    ask: number;
    price: number;
    spread: number;
    timestamp: number;
}

let ctClient: any = null;
let isConnected = false;
let isStarting = false;
let spotUnsubscribe: (() => Promise<void>) | null = null;

const spotCache = new Map<string, CTraderLiveQuote>();
const symbolDigits = new Map<string, number>(Object.entries(DEFAULT_DIGITS));

// Global in-memory candle cache to protect against rapid burst calls
const candleCache = new Map<string, { data: Candle[]; timestamp: number }>();
const inFlightCandles = new Map<string, Promise<Candle[]>>();
const CANDLE_CACHE_TTL_MS = 30 * 1000; // 30s cache for historical bars

async function getCtraderLib(): Promise<any> {
    return Function('return import("ctrader-ts")')();
}

export function isCtraderConnected(): boolean {
    return isConnected && ctClient !== null;
}

export function resolveCtraderSymbol(instrument: string): string | null {
    return CTRADER_SYMBOL_MAP[instrument] || null;
}

export async function startCtraderProvider(): Promise<void> {
    if (isConnected || isStarting) return;

    const clientId = process.env.CTRADER_CLIENT_ID;
    const clientSecret = process.env.CTRADER_CLIENT_SECRET;
    const accessToken = process.env.CTRADER_ACCESS_TOKEN;
    const accountIdStr = process.env.CTRADER_ACCOUNT_ID;
    const environment = (process.env.CTRADER_ENVIRONMENT as 'demo' | 'live') || 'demo';

    if (!clientId || !clientSecret || !accessToken || !accountIdStr) {
        logger.warn('cTrader credentials not fully configured in environment. cTrader provider inactive.');
        return;
    }

    isStarting = true;
    try {
        logger.info({ environment, accountId: accountIdStr }, 'Connecting to cTrader Open API...');
        const { connect } = await getCtraderLib();

        const ct = await connect({
            clientId,
            clientSecret,
            accessToken,
            accountId: Number(accountIdStr),
            environment,
        });

        ctClient = ct;
        isConnected = true;
        isStarting = false;
        logger.info('🟢 Successfully connected and authorized with cTrader Open API (IC Markets)!');

        // Query symbol details to ensure accurate digits
        const watchSymbolNames = Object.keys(DEFAULT_DIGITS);

        try {
            for (const sym of watchSymbolNames) {
                const info = await ct.getSymbolInfo(sym).catch(() => null);
                if (info && info.digits) {
                    symbolDigits.set(sym, info.digits);
                }
            }
        } catch (err: any) {
            logger.warn({ err: err.message }, 'Failed to query dynamic symbol info, using default digits.');
        }

        // Seed initial prices from latest M1 trendbar so prices are immediately available
        for (const sym of watchSymbolNames) {
            ct.getTrendbars(sym, { period: 1, count: 1 }).then((res: any) => {
                if (res?.trendbars?.length > 0) {
                    const b = res.trendbars[0];
                    const digits = symbolDigits.get(sym) ?? 5;
                    const factor = Math.pow(10, digits);
                    const close = Number(((b.low + (b.deltaClose || 0)) / factor).toFixed(digits));
                    const existing = spotCache.get(sym) || {
                        symbol: sym,
                        bid: close,
                        ask: close,
                        price: close,
                        spread: 0.0001,
                        timestamp: Date.now(),
                    };
                    if (existing.price === 0) {
                        existing.price = close;
                        existing.bid = close;
                        existing.ask = close;
                        existing.timestamp = Date.now();
                        spotCache.set(sym, existing);
                    }
                }
            }).catch(() => {});
        }

        // Subscribe to live spot prices over persistent WebSocket
        try {
            spotUnsubscribe = await ct.watchSpots(watchSymbolNames, (price: any) => {
                const sym = price.symbol;
                const existing = spotCache.get(sym) || {
                    symbol: sym,
                    bid: 0,
                    ask: 0,
                    price: 0,
                    spread: 0,
                    timestamp: 0,
                };

                if (price.bidDecimal !== undefined && price.bidDecimal > 0) {
                    existing.bid = price.bidDecimal;
                }
                if (price.askDecimal !== undefined && price.askDecimal > 0) {
                    existing.ask = price.askDecimal;
                }

                if (existing.bid > 0 && existing.ask > 0) {
                    existing.price = Number(((existing.bid + existing.ask) / 2).toFixed(5));
                    existing.spread = Number(Math.abs(existing.ask - existing.bid).toFixed(5));
                } else if (existing.bid > 0) {
                    existing.price = existing.bid;
                } else if (existing.ask > 0) {
                    existing.price = existing.ask;
                }

                existing.timestamp = Date.now();
                spotCache.set(sym, existing);
            });
            logger.info({ watchedSymbols: watchSymbolNames.length }, '📡 Subscribed to real-time spot stream from IC Markets.');
        } catch (subErr: any) {
            logger.error({ err: subErr.message }, 'Failed to subscribe to cTrader spot stream.');
        }

        // Attach disconnect handler
        ct.onClientDisconnect((e: any) => {
            logger.warn({ reason: e?.reason }, 'cTrader connection dropped. Auto-reconnect will restore state.');
            isConnected = false;
        });

        ct.onTokenInvalidated(() => {
            logger.error('cTrader access token invalidated or expired.');
            isConnected = false;
        });
    } catch (err: any) {
        isStarting = false;
        isConnected = false;
        logger.error({ err: err.message }, 'Failed to initialize cTrader Open API connection.');
    }
}

export async function stopCtraderProvider(): Promise<void> {
    if (spotUnsubscribe) {
        try {
            await spotUnsubscribe();
        } catch {
            // ignore
        }
        spotUnsubscribe = null;
    }
    ctClient = null;
    isConnected = false;
    isStarting = false;
    logger.info('cTrader provider stopped.');
}

export function getCtraderLivePrice(instrument: string): number {
    const sym = resolveCtraderSymbol(instrument);
    if (!sym) return 0;

    const cached = spotCache.get(sym);
    if (cached && cached.price > 0) {
        return cached.price;
    }
    return 0;
}

export function getCtraderQuoteDetails(instrument: string): { price: number; bid: number; ask: number; spread: number; timestamp: string } | null {
    const sym = resolveCtraderSymbol(instrument);
    if (!sym) return null;

    const cached = spotCache.get(sym);
    if (cached && cached.price > 0) {
        const digits = symbolDigits.get(sym) ?? 5;
        let bid = cached.bid || cached.price;
        let ask = cached.ask || cached.price;
        let spread = cached.spread;

        if (ask <= bid || spread <= 0) {
            const defaultSpread = sym.includes('JPY') ? 0.012 : (sym.includes('XAU') ? 0.15 : 0.00010);
            spread = defaultSpread;
            bid = Number((cached.price - defaultSpread / 2).toFixed(digits));
            ask = Number((cached.price + defaultSpread / 2).toFixed(digits));
        }

        return {
            price: cached.price,
            bid,
            ask,
            spread: Number((ask - bid).toFixed(digits)),
            timestamp: new Date(cached.timestamp).toISOString(),
        };
    }
    return null;
}

export async function getCtraderCandles(
    instrument: string,
    timeframe: '1m' | '5m' | '15m' | '1h' | '4h' | '1d',
    count: number
): Promise<Candle[]> {
    const sym = resolveCtraderSymbol(instrument);
    if (!sym) return [];

    if (!isConnected || !ctClient) {
        if (!isStarting) {
            startCtraderProvider().catch(() => {});
        }
        return [];
    }

    const period = TIMEFRAME_PERIOD_MAP[timeframe];
    if (period === undefined) return [];

    const cacheKey = `${sym}_${timeframe}`;
    const cached = candleCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CANDLE_CACHE_TTL_MS && cached.data.length >= count) {
        return cached.data.slice(-count);
    }

    if (inFlightCandles.has(cacheKey)) {
        const inFlight = await inFlightCandles.get(cacheKey)!;
        return inFlight.slice(-count);
    }

    const fetchPromise = (async () => {
        try {
            const digits = symbolDigits.get(sym) ?? 5;
            const factor = Math.pow(10, digits);

            const fetchCount = Math.max(count + 5, 20);
            const res = await ctClient.getTrendbars(sym, {
                period,
                count: fetchCount,
            });

            if (!res || !res.trendbars || res.trendbars.length === 0) {
                return cached ? cached.data : [];
            }

            const candles: Candle[] = res.trendbars.map((b: any) => {
                const low = Number((b.low / factor).toFixed(digits));
                const open = Number(((b.low + (b.deltaOpen || 0)) / factor).toFixed(digits));
                const high = Number(((b.low + (b.deltaHigh || 0)) / factor).toFixed(digits));
                const close = Number(((b.low + (b.deltaClose || 0)) / factor).toFixed(digits));
                const timestamp = new Date(b.utcTimestampInMinutes * 60 * 1000).toISOString();
                return {
                    timestamp,
                    open,
                    high,
                    low,
                    close,
                    volume: b.volume || 0,
                };
            });

            // Sort ascending by time
            candles.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

            candleCache.set(cacheKey, { data: candles, timestamp: Date.now() });
            return candles;
        } catch (err: any) {
            logger.warn({ instrument, sym, timeframe, err: err.message }, 'Failed to fetch trendbars from cTrader');
            if (cached && cached.data.length > 0) {
                return cached.data;
            }
            return [];
        } finally {
            inFlightCandles.delete(cacheKey);
        }
    })();

    inFlightCandles.set(cacheKey, fetchPromise);
    const result = await fetchPromise;
    return result.slice(-count);
}
