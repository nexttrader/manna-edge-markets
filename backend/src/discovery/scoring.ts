import { Bias, Candle } from './types';

export interface ConvictionFactors {
    supportResistanceStrength: number;     // Weight: 20%
    structureAlignment: number;            // Weight: 20%
    volumeProfile: number;                 // Weight: 15%
    killzoneTiming?: number;               // Weight: 10%
    multiTimeframeAlignment?: number;      // Weight: 10%
    liquidityPoolMagnet?: number;          // Weight: 10%
    fvgDisbalance?: number;                // Weight: 5%
    relativeStrength?: number;             // Weight: 5%
    atrAlignment?: number;                 // Weight: 5%
    momentumConfluence?: number;           // Fallback modifier
    newsProximityModifier?: number;        // Penalty / Boost (-0.15 to +0.10)
}

export function computeConvictionScore(factors: ConvictionFactors): number {
    const kzTiming = factors.killzoneTiming !== undefined ? factors.killzoneTiming : 0.85;
    const mtfAlign = factors.multiTimeframeAlignment !== undefined ? factors.multiTimeframeAlignment : factors.structureAlignment;
    const liqMagnet = factors.liquidityPoolMagnet !== undefined ? factors.liquidityPoolMagnet : 0.80;
    const fvgScore = factors.fvgDisbalance !== undefined ? factors.fvgDisbalance : 0.80;
    const relStrength = factors.relativeStrength !== undefined ? factors.relativeStrength : 0.82;
    const atrScore = factors.atrAlignment !== undefined ? factors.atrAlignment : 0.85;
    const newsModifier = factors.newsProximityModifier !== undefined ? factors.newsProximityModifier : 0;

    const baseScore = 
        (factors.supportResistanceStrength * 0.20) +
        (factors.structureAlignment * 0.20) +
        (factors.volumeProfile * 0.15) +
        (kzTiming * 0.10) +
        (mtfAlign * 0.10) +
        (liqMagnet * 0.10) +
        (fvgScore * 0.05) +
        (relStrength * 0.05) +
        (atrScore * 0.05);
        
    const finalScore = (baseScore + newsModifier) * 100;
    return Number(Math.min(99.5, Math.max(65.0, finalScore)).toFixed(1));
}

export function computeKillzoneTimingScore(hourET: number, _minuteET: number = 0): number {
    // Peak opening window (London 02:00-03:00 ET, NY AM 08:00-09:00 ET, NY PM 13:00-14:00 ET)
    if (hourET === 2 || hourET === 8 || hourET === 13) return 0.98;
    // Core session window (London 03:00-05:00 ET, NY AM 09:00-11:00 ET)
    if ((hourET >= 3 && hourET < 5) || (hourET >= 9 && hourET < 11)) return 0.88;
    // Off-peak / late session
    return 0.75;
}

export function computeMultiTimeframeScore(candles1h: Candle[], candles15m: Candle[], bias: Bias): number {
    if (!candles1h || candles1h.length < 3) return 0.85;

    const recent1h = candles1h.slice(-6);
    const is1hBull = recent1h[recent1h.length - 1].close > recent1h[0].open;
    const is1hBear = recent1h[recent1h.length - 1].close < recent1h[0].open;

    const recent15m = candles15m.slice(-4);
    const is15mBull = recent15m[recent15m.length - 1].close > recent15m[0].open;
    const is15mBear = recent15m[recent15m.length - 1].close < recent15m[0].open;

    if (bias === 'long' && is1hBull && is15mBull) return 0.97;
    if (bias === 'short' && is1hBear && is15mBear) return 0.97;

    if ((bias === 'long' && is1hBull) || (bias === 'short' && is1hBear)) return 0.86;
    return 0.72;
}

export function computeLiquidityMagnetScore(candles15m: Candle[], tp1: number, bias: Bias): number {
    if (!candles15m || candles15m.length < 10) return 0.80;

    const recentHighs = candles15m.slice(-15).map(c => c.high);
    const recentLows = candles15m.slice(-15).map(c => c.low);

    if (bias === 'long') {
        // Look for Equal Highs (EQH) near TP1 target
        const nearHighs = recentHighs.filter(h => Math.abs(h - tp1) / tp1 <= 0.003);
        if (nearHighs.length >= 2) return 0.96;
    } else {
        // Look for Equal Lows (EQL) near TP1 target
        const nearLows = recentLows.filter(l => Math.abs(l - tp1) / tp1 <= 0.003);
        if (nearLows.length >= 2) return 0.96;
    }

    return 0.82;
}

export function computeFVGScore(candles15m: Candle[], bias: Bias): number {
    if (!candles15m || candles15m.length < 4) return 0.80;

    // Check last 3 candles for Fair Value Gap (imbalance)
    const len = candles15m.length;
    const c1 = candles15m[len - 3];
    const c3 = candles15m[len - 1];

    if (bias === 'long') {
        // Bullish FVG: Low of c3 > High of c1
        if (c3.low > c1.high) return 0.95;
    } else {
        // Bearish FVG: High of c3 < Low of c1
        if (c3.high < c1.low) return 0.95;
    }

    return 0.78;
}

export function computeRelativeStrengthScore(candles15m: Candle[], bias: Bias): number {
    if (!candles15m || candles15m.length < 3) return 0.82;

    const last = candles15m[candles15m.length - 1];
    const body = Math.abs(last.close - last.open);
    const range = last.high - last.low;

    if (range > 0 && body / range >= 0.6) {
        if ((bias === 'long' && last.close > last.open) || (bias === 'short' && last.close < last.open)) {
            return 0.94;
        }
    }
    return 0.81;
}

export function computeNewsProximityModifier(timestamp: Date = new Date()): number {
    const formatOptions: Intl.DateTimeFormatOptions = { 
        timeZone: 'America/New_York', 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: false 
    };
    const formatter = new Intl.DateTimeFormat('en-US', formatOptions);
    const parts = formatter.formatToParts(timestamp);
    const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
    const minute = parseInt(parts.find(p => p.type === 'minute')?.value || '0', 10);

    // Tier 1 High Impact Release Windows (08:30 ET NFP/CPI, 14:00 ET FOMC)
    // 30 mins BEFORE high impact news: -0.12 penalty
    if ((hour === 8 && minute >= 0 && minute < 30) || (hour === 13 && minute >= 30)) {
        return -0.12;
    }

    // 15-45 mins AFTER high impact news (Liquidity cleared): +0.06 boost
    if ((hour === 8 && minute >= 45) || (hour === 9 && minute <= 15) || (hour === 14 && minute >= 15 && minute <= 45)) {
        return 0.06;
    }

    return 0;
}

export function computeRMultiple(entry: number, target: number, stop: number, bias: Bias): number {
    const risk = Math.abs(entry - stop);
    if (risk === 0) return 0;
    
    const reward = bias === 'long' ? target - entry : entry - target;
    return Number((reward / risk).toFixed(2));
}

export function computeLiquidityScore(volume: number, avgVolume: number, spread: number): number {
    const volScore = Math.min(1, volume / (avgVolume || 1));
    return Math.min(100, Math.max(0, volScore * 100 - (spread * 10)));
}
