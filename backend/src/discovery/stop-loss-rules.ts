/**
 * Institutional Stop Loss Rule Engine
 * Ensures stop losses are placed at logical, market-compatible distances outside
 * price noise and tick fluctuations on CME Futures and FX pairs.
 */

export const MIN_STOP_FLOORS: Record<string, number> = {
  // CME Futures (Index & Commodity Points)
  'NQ': 18.0,        // Min 18 NQ points ($360/contract)
  'ES': 4.5,         // Min 4.5 ES points ($225/contract)
  'YM': 35.0,        // Min 35 YM points ($175/contract)
  'RTY': 2.5,        // Min 2.5 RTY points ($125/contract)
  'GC': 4.0,         // Min $4.00 Gold points ($400/contract)
  'CL': 0.35,        // Min $0.35 Crude Oil points ($350/contract)
  'SI': 0.18,        // Min $0.18 Silver points ($900/contract)
  'ZN': 0.15,        // Min 0.15 10Y T-Note points ($150/contract)

  // Forex Pairs (Pips / Quote Units)
  'EUR/USD': 0.0010, // Min 10 pips
  'GBP/USD': 0.0012, // Min 12 pips
  'USD/JPY': 0.15,   // Min 15 pips (0.15 JPY)
  'AUD/USD': 0.0010, // Min 10 pips
  'EUR/GBP': 0.0008, // Min 8 pips
  'GBP/JPY': 0.20,   // Min 20 pips (0.20 JPY)
  'USD/CAD': 0.0010, // Min 10 pips
  'EUR/JPY': 0.15    // Min 15 pips (0.15 JPY)
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
 * Calculates a logical stop loss distance for an instrument based on 15M ATR,
 * target risk multiplier, and institutional minimum stop loss floors.
 * Guaranteed to return a non-zero distance.
 */
export function getLogicalStopDistance(
  instrument: string,
  atr14: number,
  rawCalculatedRisk: number,
  market: 'futures' | 'forex'
): number {
  const safeAtr = (isNaN(atr14) || atr14 <= 0) ? (market === 'futures' ? 2.0 : 0.0010) : atr14;
  const safeRaw = (isNaN(rawCalculatedRisk) || rawCalculatedRisk <= 0) ? safeAtr * 1.25 : rawCalculatedRisk;
  const atrRiskDistance = Math.max(safeRaw, safeAtr * 1.25);
  
  // Instrument-specific logical minimum floor
  const floor = MIN_STOP_FLOORS[instrument] !== undefined
    ? MIN_STOP_FLOORS[instrument]
    : (market === 'futures' ? 1.0 : (instrument.includes('JPY') ? 0.10 : 0.00050));

  const distance = Math.max(atrRiskDistance, floor);
  const decimals = getInstrumentDecimals(instrument, market);
  const rounded = Number(distance.toFixed(decimals));

  // Ensure stop distance is strictly non-zero
  const minNonZero = market === 'futures' ? 0.25 : (instrument.includes('JPY') ? 0.05 : 0.00020);
  return Math.max(rounded, minNonZero);
}

