import { Bias, Candle } from './types';
import { getLiveCandles } from './yahoo-provider';
import { computeATR } from './atr';

export interface MarketStructureResult {
  bias: Bias;
  structureType: 'higher_highs_lows' | 'lower_highs_lows' | 'demand_zone_reaction' | 'supply_zone_reaction' | 'range_equilibrium';
  confidence: number;
}

/**
 * Single Source of Truth Bias Engine
 * Evaluates Market Structure (Higher Highs / Higher Lows vs Lower Highs / Lower Lows)
 * and Zone Proximity (Demand = Long, Supply = Short)
 */
export function calculateRawStructureBias(candles1h: Candle[], candles15m: Candle[]): MarketStructureResult {
  if (!candles1h || candles1h.length < 5) {
    return { bias: 'long', structureType: 'range_equilibrium', confidence: 0.5 };
  }

  // 1. Zone Proximity Rule (The Zone is the Edge, not the Trend)
  const currentPrice = candles15m.length > 0 ? candles15m[candles15m.length - 1].close : candles1h[candles1h.length - 1].close;
  const atr14 = computeATR(candles15m.length >= 14 ? candles15m : candles1h, 14);

  const swingLow15m = Math.min(...candles15m.slice(-15).map(c => c.low));
  const swingHigh15m = Math.max(...candles15m.slice(-15).map(c => c.high));

  // If sitting within 0.5x ATR of Demand Zone (support)
  if (Math.abs(currentPrice - swingLow15m) <= atr14 * 0.5) {
    return { bias: 'long', structureType: 'demand_zone_reaction', confidence: 0.90 };
  }

  // If sitting within 0.5x ATR of Supply Zone (resistance)
  if (Math.abs(currentPrice - swingHigh15m) <= atr14 * 0.5) {
    return { bias: 'short', structureType: 'supply_zone_reaction', confidence: 0.90 };
  }

  // 2. 1H Market Structure Analysis (Higher Highs & Higher Lows vs Lower Highs & Lower Lows)
  const recent1h = candles1h.slice(-12); // Last 12 hours
  let higherHighCount = 0;
  let lowerLowCount = 0;

  for (let i = 1; i < recent1h.length; i++) {
    if (recent1h[i].high > recent1h[i - 1].high && recent1h[i].low > recent1h[i - 1].low) {
      higherHighCount++;
    } else if (recent1h[i].high < recent1h[i - 1].high && recent1h[i].low < recent1h[i - 1].low) {
      lowerLowCount++;
    }
  }

  if (higherHighCount > lowerLowCount) {
    return { bias: 'long', structureType: 'higher_highs_lows', confidence: 0.85 };
  } else if (lowerLowCount > higherHighCount) {
    return { bias: 'short', structureType: 'lower_highs_lows', confidence: 0.85 };
  }

  // 3. Equilibrium Fallback (First-quarter open vs Current close)
  const openPrice = recent1h[0].open;
  const bias: Bias = currentPrice >= openPrice ? 'long' : 'short';
  return { bias, structureType: 'range_equilibrium', confidence: 0.60 };
}

/**
 * Unified Intermarket Correlation Synchronization
 * Ensures Equity Indices (ES, NQ, YM), Metals (GC, SI), and Dollar Pairs (EUR/USD, GBP/USD, USD/JPY)
 * share a single unified source of truth directional bias.
 */
export async function getUnifiedMarketBiases(instruments: string[]): Promise<Record<string, Bias>> {
  const rawBiases: Record<string, Bias> = {};

  // Fetch candles for all requested instruments
  for (const inst of instruments) {
    try {
      const candles15m = await getLiveCandles(inst, '15m', 50);
      const candles1h = await getLiveCandles(inst, '1h', 24);
      const result = calculateRawStructureBias(candles1h, candles15m);
      rawBiases[inst] = result.bias;
    } catch {
      rawBiases[inst] = 'long';
    }
  }

  const unifiedBiases: Record<string, Bias> = { ...rawBiases };

  // ── 1. Equity Indices Group Synchronization (Anchor to ES - S&P 500 Benchmark) ──
  if (instruments.includes('ES')) {
    const equityMarketIsBullish = rawBiases['ES'] === 'long';
    if (instruments.includes('NQ')) unifiedBiases['NQ'] = equityMarketIsBullish ? 'long' : 'short';
    if (instruments.includes('YM')) unifiedBiases['YM'] = equityMarketIsBullish ? 'long' : 'short';
    if (instruments.includes('RTY')) unifiedBiases['RTY'] = equityMarketIsBullish ? 'long' : 'short';
  }

  // ── 2. Metals Group Synchronization (Anchor to GC - Gold Benchmark) ──
  if (instruments.includes('GC')) {
    const metalsAreBullish = rawBiases['GC'] === 'long';
    if (instruments.includes('SI')) unifiedBiases['SI'] = metalsAreBullish ? 'long' : 'short';
  }

  // ── 3. Dollar Correlation Group (DXY vs EUR/USD, GBP/USD, AUD/USD, USD/JPY, USD/CAD) ──
  // Anchor to EUR/USD (inverse of Dollar strength)
  if (instruments.includes('EUR/USD')) {
    const dollarStrengthIsBullish = rawBiases['EUR/USD'] === 'short'; // If EUR/USD is short, Dollar is bullish
    
    if (instruments.includes('GBP/USD')) unifiedBiases['GBP/USD'] = dollarStrengthIsBullish ? 'short' : 'long';
    if (instruments.includes('AUD/USD')) unifiedBiases['AUD/USD'] = dollarStrengthIsBullish ? 'short' : 'long';
    if (instruments.includes('USD/JPY')) unifiedBiases['USD/JPY'] = dollarStrengthIsBullish ? 'long' : 'short';
    if (instruments.includes('USD/CAD')) unifiedBiases['USD/CAD'] = dollarStrengthIsBullish ? 'long' : 'short';
  }

  return unifiedBiases;
}
