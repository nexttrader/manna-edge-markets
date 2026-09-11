/**
 * Institutional Stop Loss Rule Engine
 * Ensures stop losses are placed at logical, market-compatible distances outside
 * price noise and tick fluctuations on CME Futures and FX pairs.
 */

export const MIN_STOP_FLOORS: Record<string, number> = {
  // CME Futures (Index & Commodity Points - scaled to match 1.2x-1.5x 15M ATR like Forex)
  'NQ': 35.0,        // Min 35 NQ points ($700/contract)
  'ES': 10.0,        // Min 10 ES points ($500/contract)
  'YM': 65.0,        // Min 65 YM points ($325/contract)
  'RTY': 5.5,        // Min 5.5 RTY points ($275/contract)
  'GC': 7.5,         // Min $7.50 Gold points ($750/contract)
  'CL': 0.65,        // Min $0.65 Crude Oil points ($650/contract)
  'SI': 0.35,        // Min $0.35 Silver points ($1750/contract)
  'ZN': 0.25,        // Min 0.25 10Y T-Note points ($250/contract)

  // Forex Pairs (Pips / Quote Units)
  'EUR/USD': 0.0010, // Min 10 pips
  'GBP/USD': 0.0012, // Min 12 pips
  'USD/JPY': 0.18,   // Min 18 pips (0.18 JPY) - buffered for spread & wicks
  'AUD/USD': 0.0010, // Min 10 pips
  'EUR/GBP': 0.0008, // Min 8 pips
  'GBP/JPY': 0.25,   // Min 25 pips (0.25 JPY) - buffered for volatility & spread
  'USD/CAD': 0.0010, // Min 10 pips
  'EUR/JPY': 0.22    // Min 22 pips (0.22 JPY) - buffered for volatility & spread
};

/**
 * Returns exact decimal places required for formatting prices of a given instrument
 */
export function getInstrumentDecimals(instrument: string, market: 'futures' | 'forex'): number {
  if (instrument.includes('JPY')) return 3;
  if (instrument === 'SI' || instrument === 'ZN') return 3;
  if (market === 'futures') return 2;
  return 5;
}

/**
 * Data-backed floor scaling factors when halvedFloor (optimized floor mode) is active.
 * Based on empirical excursion audits across August-September live trades:
 * - EUR/USD: 0.60 factor (6.0 pips / 40% reduction) yields +17.0R vs +11.0R at 5.0 pips,
 *   preventing premature stop-out on routine 6.2-pip session pullbacks while accelerating TP hits.
 * - GBP/USD: 1.00 factor (12.0 pips / 0% reduction) preserves +5.0R net performance; Cable's
 *   higher volatility causes sharp drawdowns and negative returns when forced below 10 pips.
 * - EUR/GBP: 1.00 factor (8.0 pips / 0% reduction) avoids broker spread friction and protects
 *   cross-pair trailing break-even targets.
 * - All other instruments default to 0.50 (50% halved floor), which proved optimal for USD/JPY (+5R), AUD/USD (+4R), etc.
 */
export const OPTIMIZED_FLOOR_FACTORS: Record<string, number> = {
  'EUR/USD': 0.60, // 6.0 pips floor (was 5.0 pips)
  'GBP/USD': 1.00, // 12.0 pips floor (preserved, was 6.0 pips)
  'EUR/GBP': 1.00, // 8.0 pips floor (preserved, was 4.0 pips)
};

/**
 * Calculates a logical stop loss distance for an instrument based on 15M ATR,
 * target risk multiplier, and institutional minimum stop loss floors.
 * Guaranteed to return a non-zero distance.
 */
export function getLogicalStopDistance(
  instrument: string,
  atr14: number,
  rawCalculatedRisk: number,
  market: 'futures' | 'forex',
  halvedFloor: boolean = false
): number {
  const isJpy = instrument.includes('JPY');
  const safeAtr = (isNaN(atr14) || atr14 <= 0) ? (market === 'futures' ? 2.0 : (isJpy ? 0.20 : 0.0010)) : atr14;
  const atrMultiplier = isJpy ? 1.4 : 1.25; // JPY crosses have wider spread and wick noise
  const safeRaw = (isNaN(rawCalculatedRisk) || rawCalculatedRisk <= 0) ? safeAtr * atrMultiplier : rawCalculatedRisk;
  const atrRiskDistance = Math.max(safeRaw, safeAtr * atrMultiplier);
  
  // Instrument-specific logical minimum floor
  const baseFloor = MIN_STOP_FLOORS[instrument] !== undefined
    ? MIN_STOP_FLOORS[instrument]
    : (market === 'futures' ? 1.0 : (isJpy ? 0.20 : 0.00050));

  const factor = OPTIMIZED_FLOOR_FACTORS[instrument] !== undefined
    ? OPTIMIZED_FLOOR_FACTORS[instrument]
    : 0.50;

  const floor = halvedFloor ? (baseFloor * factor) : baseFloor;

  const distance = Math.max(atrRiskDistance, floor);
  const decimals = getInstrumentDecimals(instrument, market);
  const rounded = Number(distance.toFixed(decimals));

  // Ensure stop distance is strictly non-zero
  const baseMinNonZero = market === 'futures' ? 0.25 : (isJpy ? 0.08 : 0.00020);
  const minNonZero = halvedFloor ? (baseMinNonZero * factor) : baseMinNonZero;
  return Math.max(rounded, minNonZero);
}

