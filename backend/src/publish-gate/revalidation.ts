import { EdgeSetup, CandidateSetup, InvalidationReason } from '../discovery/types';

export interface RevalidationResult {
  isValid: boolean;
  reason?: InvalidationReason;
  detail?: string;
}

export function revalidateSetup(setup: EdgeSetup, currentPrice: number, atr14: number): RevalidationResult {
  const isLong = setup.bias === 'long';
  
  // Rule 1: sl_breached (active setups only)
  if (setup.signal_state === 'active') {
    if ((isLong && currentPrice <= setup.stop) || (!isLong && currentPrice >= setup.stop)) {
      return { 
        isValid: false, 
        reason: InvalidationReason.sl_breached, 
        detail: `Price ${currentPrice} breached SL ${setup.stop}` 
      };
    }
  }

  if (setup.signal_state === 'awaiting_entry') {
    const mid = setup.entry_zone_mid || (setup.entry_zone_low + setup.entry_zone_high) / 2;
    
    // Rule 2: price_displaced — price has moved too far PAST the zone entry edge to be viable.
    // For LONG (Limit Buy): zone is below current price, we want price to come DOWN to the zone.
    //   Invalidate only if price has moved UP (away from zone) by > 3x ATR above the zone high.
    // For SHORT (Limit Sell): zone is above current price, we want price to go UP to the zone.
    //   Invalidate only if price has moved DOWN (away from zone) by > 3x ATR below the zone low.
    const zoneEdge = isLong ? setup.entry_zone_high : setup.entry_zone_low;
    const displacement = isLong ? (currentPrice - zoneEdge) : (zoneEdge - currentPrice);
    if (displacement > 3.0 * atr14) {
      return { 
        isValid: false, 
        reason: InvalidationReason.price_displaced, 
        detail: `Price ${currentPrice} displaced > 3x ATR (${(atr14 * 3.0).toFixed(2)}) from zone edge ${zoneEdge}` 
      };
    }

    // Rule 3: structure_displaced — price has blown THROUGH the zone in the entry direction
    // without triggering a fill, meaning the zone has been consumed and is no longer fresh.
    const zonePenetrated = isLong ? currentPrice < setup.entry_zone_low : currentPrice > setup.entry_zone_high;
    if (zonePenetrated && Math.abs(currentPrice - mid) > 1.5 * atr14) {
      return { 
        isValid: false, 
        reason: InvalidationReason.structure_displaced, 
        detail: `Price ${currentPrice} blew through zone (low=${setup.entry_zone_low}, high=${setup.entry_zone_high}) by > 1.5x ATR` 
      };
    }

    // Rule 4: entry_expired (> 12 hours = ~2 killzone cycles)
    const now = new Date();
    const createdTime = new Date(setup.created_at);
    const diffHours = (now.getTime() - createdTime.getTime()) / (1000 * 60 * 60);
    if (diffHours > 12) {
      return { 
        isValid: false, 
        reason: InvalidationReason.entry_expired, 
        detail: `Setup older than 12 hours (2 killzone cycles)` 
      };
    }
  }

  return { isValid: true };
}

export function shouldInvalidateForOpposingSignal(existing: EdgeSetup, newCandidate: CandidateSetup): boolean {
  if (existing.bias !== newCandidate.bias) {
    if ((newCandidate.conviction_score || 0) > (existing.conviction_score || 0)) {
      return true;
    }
  }
  return false;
}
