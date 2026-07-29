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
    
    // Rule 2: price_displaced
    if (Math.abs(currentPrice - mid) > 1.5 * atr14) {
      return { 
        isValid: false, 
        reason: InvalidationReason.price_displaced, 
        detail: `Price ${currentPrice} displaced > 1.5x ATR (${(atr14 * 1.5).toFixed(2)}) from entry mid ${mid}` 
      };
    }

    // Rule 3: structure_displaced
    const beyondZone = isLong ? currentPrice > setup.entry_zone_high : currentPrice < setup.entry_zone_low;
    const structureShift = isLong ? currentPrice - mid : mid - currentPrice;
    if (structureShift > 1.5 * atr14 && beyondZone) {
      return { 
        isValid: false, 
        reason: InvalidationReason.structure_displaced, 
        detail: `Structure displaced > 1.5x ATR in bias direction beyond entry zone` 
      };
    }

    // Rule 4: entry_expired (>12 hours = ~2 killzone cycles)
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
