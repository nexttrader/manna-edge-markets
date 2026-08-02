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
  'GC': 4.0,         // Min $4.00 Gold points ($400/contract)
  'CL': 0.35,        // Min $0.35 Crude Oil points ($350/contract)
  'SI': 0.18,        // Min $0.18 Silver points ($900/contract)

  // Forex Pairs (Pips / Quote Units)
  'EUR/USD': 0.0010, // Min 10 pips
  'GBP/USD': 0.0012, // Min 12 pips
  'USD/JPY': 0.15,   // Min 15 pips (0.15 JPY)
  'AUD/USD': 0.0010, // Min 10 pips
  'EUR/GBP': 0.0008, // Min 8 pips
  'GBP/JPY': 0.20    // Min 20 pips (0.20 JPY)
};

/**
 * Calculates a logical stop loss distance for an instrument based on 15M ATR,
 * target risk multiplier, and institutional minimum stop loss floors.
 */
export function getLogicalStopDistance(
  instrument: string,
  atr14: number,
  rawCalculatedRisk: number,
  market: 'futures' | 'forex'
): number {
  // Default ATR risk distance (e.g. 1.25x ATR) if raw risk is insufficient
  const atrRiskDistance = Math.max(rawCalculatedRisk, atr14 * 1.25);
  
  // Instrument-specific logical minimum floor
  const floor = MIN_STOP_FLOORS[instrument] !== undefined
    ? MIN_STOP_FLOORS[instrument]
    : (market === 'futures' ? 5.0 : 0.0010);

  return Number(Math.max(atrRiskDistance, floor).toFixed(market === 'futures' ? 2 : 5));
}
