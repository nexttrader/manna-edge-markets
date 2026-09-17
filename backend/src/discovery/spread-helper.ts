/**
 * Institutional Spread & Bid/Ask Derivation Engine
 * Provides standard ECN/CME institutional spreads and Bid/Ask derivation utilities.
 */

export const INSTITUTIONAL_SPREADS: Record<string, number> = {
  // Forex Pairs (IC Markets cTrader Raw ECN typical spreads)
  'EUR/USD': 0.00008, // 0.8 pips
  'GBP/USD': 0.00010, // 1.0 pips
  'USD/JPY': 0.010,   // 1.0 pips (0.010 JPY)
  'AUD/USD': 0.00010, // 1.0 pips
  'USD/CAD': 0.00012, // 1.2 pips
  'EUR/GBP': 0.00015, // 1.5 pips
  'EUR/JPY': 0.020,   // 2.0 pips
  'GBP/JPY': 0.025,   // 2.5 pips
  'USD/CHF': 0.00012, // 1.2 pips
  'NZD/USD': 0.00012, // 1.2 pips

  // CME Futures (Standard 1-tick minimum bid/ask spread on CME / NYMEX / CBOT)
  'ES': 0.25,         // 1 tick (0.25 pt)
  'NQ': 0.25,         // 1 tick (0.25 pt)
  'YM': 1.0,          // 1 tick (1.0 pt)
  'RTY': 0.10,        // 1 tick (0.10 pt)
  'GC': 0.10,         // 1 tick ($0.10)
  'CL': 0.01,         // 1 tick ($0.01)
  'SI': 0.005,        // 1 tick ($0.005)
  'ZN': 0.015625      // 1/64 point
};

/**
 * Returns default institutional spread for a given instrument
 */
export function getInstrumentSpread(instrument: string): number {
  const upper = instrument.toUpperCase();
  if (INSTITUTIONAL_SPREADS[upper] !== undefined) {
    return INSTITUTIONAL_SPREADS[upper];
  }
  // Generic fallbacks
  if (upper.includes('JPY')) return 0.015;
  if (upper.includes('/')) return 0.00015; // 1.5 pips generic forex
  return 0.25; // generic futures
}

export interface QuoteDetails {
  price: number;
  bid: number;
  ask: number;
  spread: number;
  timestamp?: string;
}

/**
 * Derives accurate Bid and Ask prices from a given price or raw quotes.
 * If rawBid and rawAsk are available, uses them directly.
 * Otherwise, symmetrically derives Bid and Ask centered around the price using the instrument's spread.
 */
export function deriveBidAsk(
  price: number,
  instrument: string,
  rawBid?: number,
  rawAsk?: number,
  timestamp?: string
): QuoteDetails {
  const digits = instrument.includes('JPY') ? 3 : (instrument.includes('/') ? 5 : 2);
  const spread = getInstrumentSpread(instrument);

  if (rawBid !== undefined && rawAsk !== undefined && rawBid > 0 && rawAsk > 0 && rawAsk >= rawBid) {
    const calculatedSpread = Number((rawAsk - rawBid).toFixed(digits));
    const effectiveSpread = calculatedSpread > 0 ? calculatedSpread : spread;
    const mid = Number(((rawBid + rawAsk) / 2).toFixed(digits));
    return {
      price: mid,
      bid: Number(rawBid.toFixed(digits)),
      ask: Number(rawAsk.toFixed(digits)),
      spread: effectiveSpread,
      timestamp: timestamp || new Date().toISOString()
    };
  }

  const halfSpread = spread / 2;
  const derivedBid = Number((price - halfSpread).toFixed(digits));
  const derivedAsk = Number((price + halfSpread).toFixed(digits));

  return {
    price: Number(price.toFixed(digits)),
    bid: derivedBid,
    ask: derivedAsk,
    spread: Number((derivedAsk - derivedBid).toFixed(digits)) || spread,
    timestamp: timestamp || new Date().toISOString()
  };
}
