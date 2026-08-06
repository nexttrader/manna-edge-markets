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
    // Rule 2: zone_consumed — price has blown THROUGH the zone without triggering a fill.
    // For LONG (limit buy waiting for price to DROP into zone):
    //   The demand zone sits BELOW current price. Price being above is NORMAL — we're waiting.
    //   Only invalidate if price crashes BELOW the zone bottom (entry_zone_low = zone.distal)
    //   by more than 1.5x ATR — meaning the demand zone was consumed/destroyed.
    // For SHORT (limit sell waiting for price to RALLY into zone):
    //   The supply zone sits ABOVE current price. Price being below is NORMAL — we're waiting.
    //   Only invalidate if price rallies ABOVE the zone top (entry_zone_high = zone.distal)
    //   by more than 1.5x ATR — meaning the supply zone was consumed/destroyed.
    if (isLong) {
      const blowThrough = setup.entry_zone_low - currentPrice; // positive only if price < zone bottom
      if (blowThrough > 1.5 * atr14) {
        return {
          isValid: false,
          reason: InvalidationReason.price_displaced,
          detail: `Price ${currentPrice} crashed ${blowThrough.toFixed(2)} below zone bottom ${setup.entry_zone_low} (> 1.5x ATR ${(atr14 * 1.5).toFixed(2)}) — demand zone consumed`
        };
      }
    } else {
      const blowThrough = currentPrice - setup.entry_zone_high; // positive only if price > zone top
      if (blowThrough > 1.5 * atr14) {
        return {
          isValid: false,
          reason: InvalidationReason.price_displaced,
          detail: `Price ${currentPrice} rallied ${blowThrough.toFixed(2)} above zone top ${setup.entry_zone_high} (> 1.5x ATR ${(atr14 * 1.5).toFixed(2)}) — supply zone consumed`
        };
      }
    }

    // NOTE: Rule 3 (12-hour expiration) removed to ensure active signals are NEVER automatically cleared or expired from the trader dashboard.
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
