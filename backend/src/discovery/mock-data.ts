import { Candle } from './types';

export const FUTURES_INSTRUMENTS = ['ES', 'NQ', 'YM', 'GC', 'CL', 'SI'];
export const FOREX_INSTRUMENTS = ['EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'EUR/GBP', 'GBP/JPY'];

const basePrices: Record<string, number> = {
    'ES': 5500,
    'NQ': 19000,
    'YM': 39000,
    'GC': 2400,
    'CL': 80,
    'SI': 30,
    'EUR/USD': 1.09,
    'GBP/USD': 1.27,
    'USD/JPY': 155.0,
    'AUD/USD': 0.66,
    'EUR/GBP': 0.85,
    'GBP/JPY': 197.0
};

function generateRandomWalk(startPrice: number, count: number, volatility: number): number[] {
    const prices = [startPrice];
    for (let i = 1; i < count; i++) {
        const change = (Math.random() - 0.5) * volatility;
        prices.push(prices[i - 1] + change);
    }
    return prices;
}

export function generateCandles(instrument: string, count: number, timeframeMinutes: number): Candle[] {
    const base = basePrices[instrument] || 100;
    const isForex = FOREX_INSTRUMENTS.includes(instrument);
    
    // Set appropriate volatility based on instrument type and price magnitude
    const volatility = isForex ? (base * 0.001) : (base * 0.002);
    
    const now = new Date();
    const candles: Candle[] = [];
    
    let currentPrice = base;
    
    for (let i = count - 1; i >= 0; i--) {
        const time = new Date(now.getTime() - (i * timeframeMinutes * 60 * 1000));
        
        // Random walk for OHLC
        const open = currentPrice;
        const closeChange = (Math.random() - 0.5) * volatility;
        const close = open + closeChange;
        
        const highMargin = Math.random() * (volatility / 2);
        const lowMargin = Math.random() * (volatility / 2);
        
        const high = Math.max(open, close) + highMargin;
        const low = Math.min(open, close) - lowMargin;
        
        // Volume varies by time of day roughly (higher in NY/London)
        const hour = time.getUTCHours();
        let volumeMultiplier = 1;
        if (hour >= 13 && hour <= 20) volumeMultiplier = 2.5; // NY
        else if (hour >= 7 && hour <= 12) volumeMultiplier = 1.8; // London
        
        const baseVol = isForex ? 10000 : 50000;
        const volume = Math.floor(baseVol * volumeMultiplier * (0.8 + Math.random() * 0.4));
        
        candles.push({
            open: Number(open.toFixed(5)),
            high: Number(high.toFixed(5)),
            low: Number(low.toFixed(5)),
            close: Number(close.toFixed(5)),
            volume,
            timestamp: time.toISOString()
        });
        
        currentPrice = close;
    }
    
    return candles;
}

export function getCurrentPrice(instrument: string): number {
    const base = basePrices[instrument] || 100;
    const isForex = FOREX_INSTRUMENTS.includes(instrument);
    const volatility = isForex ? (base * 0.001) : (base * 0.002);
    return Number((base + (Math.random() - 0.5) * volatility).toFixed(5));
}

export function getLatestCandles(instrument: string, timeframe: '1m' | '5m' | '15m' | '1h', count: number): Candle[] {
    let tfMinutes = 15;
    if (timeframe === '1m') tfMinutes = 1;
    else if (timeframe === '5m') tfMinutes = 5;
    else if (timeframe === '15m') tfMinutes = 15;
    else if (timeframe === '1h') tfMinutes = 60;
    
    return generateCandles(instrument, count, tfMinutes);
}
