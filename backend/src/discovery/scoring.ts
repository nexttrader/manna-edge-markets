import { Bias } from './types';

export interface ConvictionFactors {
    supportResistanceStrength: number;
    volumeProfile: number;
    atrAlignment: number;
    structureAlignment: number;
    momentumConfluence: number;
}

export function computeConvictionScore(factors: ConvictionFactors): number {
    const score = 
        (factors.supportResistanceStrength * 0.25) +
        (factors.volumeProfile * 0.20) +
        (factors.atrAlignment * 0.15) +
        (factors.structureAlignment * 0.25) +
        (factors.momentumConfluence * 0.15);
        
    return Math.min(100, Math.max(0, score * 100));
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
