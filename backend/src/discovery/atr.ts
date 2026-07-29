import { Candle } from './types';

export function computeATR(candles: Candle[], period: number = 14): number {
    if (candles.length === 0 || period <= 0) return 0;
    
    const trueRanges: number[] = [];
    
    for (let i = 0; i < candles.length; i++) {
        const high = candles[i].high;
        const low = candles[i].low;
        
        if (i === 0) {
            trueRanges.push(high - low);
        } else {
            const prevClose = candles[i - 1].close;
            const tr = Math.max(
                high - low,
                Math.abs(high - prevClose),
                Math.abs(low - prevClose)
            );
            trueRanges.push(tr);
        }
    }
    
    const startIdx = Math.max(0, trueRanges.length - period);
    const periodRanges = trueRanges.slice(startIdx);
    
    const sumTrueRange = periodRanges.reduce((sum, tr) => sum + tr, 0);
    return periodRanges.length > 0 ? sumTrueRange / periodRanges.length : 0;
}
