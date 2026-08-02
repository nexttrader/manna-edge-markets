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

export function generateCandles(instrument: string, count: number, timeframeMinutes: number, anchorPrice?: number): Candle[] {
    const base = anchorPrice && anchorPrice > 0 ? anchorPrice : (basePrices[instrument] || 100);
    const isForex = FOREX_INSTRUMENTS.includes(instrument);
    
    // Set appropriate volatility based on instrument type and price magnitude
    const volatility = isForex ? (base * 0.0008) : (base * 0.0015);
    
    const now = new Date();
    const tempCandles: Candle[] = [];
    
    // Generate backwards from anchorPrice so the newest candle lands EXACTLY on anchorPrice
    let currentPrice = base;
    
    for (let i = 0; i < count; i++) {
        const time = new Date(now.getTime() - (i * timeframeMinutes * 60 * 1000));
        
        let close = currentPrice;
        let open: number;
        let high: number;
        let low: number;

        const cycle = i % 15;
        if (cycle === 5 || cycle === 6) {
          // Base candle (tight body <= 40% of range)
          const range = volatility * (0.5 + Math.random() * 0.4);
          const body = range * (0.1 + Math.random() * 0.25);
          const isUp = Math.random() > 0.5;
          open = isUp ? close - body : close + body;
          const wickUpper = (range - body) * (0.3 + Math.random() * 0.4);
          high = Math.max(open, close) + wickUpper;
          low = Math.min(open, close) - (range - body - wickUpper);
        } else if (cycle === 4) {
          // Strong leg candle preceding base
          const isLegUp = (i % 30) < 15;
          const range = volatility * (1.2 + Math.random() * 0.5);
          const body = range * (0.7 + Math.random() * 0.2);
          open = isLegUp ? close - body : close + body;
          high = Math.max(open, close) + (range - body) * 0.5;
          low = Math.min(open, close) - (range - body) * 0.5;
        } else if (cycle === 7) {
          // Strong leg departure candle following base
          const isLegUp = (i % 30) < 15;
          const range = volatility * (1.3 + Math.random() * 0.6);
          const body = range * (0.75 + Math.random() * 0.2);
          open = isLegUp ? close - body : close + body;
          high = Math.max(open, close) + (range - body) * 0.5;
          low = Math.min(open, close) - (range - body) * 0.5;
        } else {
          // Normal random walk candle
          const openChange = (Math.random() - 0.5) * volatility;
          open = close + openChange;
          const highMargin = Math.random() * (volatility / 2);
          const lowMargin = Math.random() * (volatility / 2);
          high = Math.max(open, close) + highMargin;
          low = Math.min(open, close) - lowMargin;
        }

        const hour = time.getUTCHours();
        let volumeMultiplier = 1;
        if (hour >= 13 && hour <= 20) volumeMultiplier = 2.5; // NY
        else if (hour >= 7 && hour <= 12) volumeMultiplier = 1.8; // London
        
        const baseVol = isForex ? 10000 : 50000;
        const volume = Math.floor(baseVol * volumeMultiplier * (0.8 + Math.random() * 0.4));

        tempCandles.push({
          open: Number(open.toFixed(5)),
          high: Number(high.toFixed(5)),
          low: Number(low.toFixed(5)),
          close: Number(close.toFixed(5)),
          volume,
          timestamp: time.toISOString()
        });

        currentPrice = open;
    }

    return tempCandles.reverse();
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
