import { EdgeSetup, CandidateSetup, InvalidationReason } from '../discovery/types';

export interface RevalidationResult {
  isValid: boolean;
  reason?: InvalidationReason;
  detail?: string;
}

export function isMockSetup(setup: EdgeSetup | null | undefined): boolean {
  if (!setup) return true;
  if (setup.id?.startsWith('kz_mid_') || setup.id?.includes('seed') || setup.id?.toLowerCase().includes('mock_data')) return true;
  if (setup.conviction_score === null) return true;
  if (setup.metadata && (setup.metadata.includes('"source":"mock"') || setup.metadata.includes('"seed":true'))) return true;
  return false;
}

export function revalidateSetup(
  setup: EdgeSetup,
  currentPrice: number,
  atr14: number,
  maxHigh?: number,
  minLow?: number,
  quoteDetails?: { bid: number; ask: number; spread?: number }
): RevalidationResult {
  // Rule 0: Anti-Mock Data Enforcement — Invalidate any mock/placeholder data instantly
  if (isMockSetup(setup)) {
    return {
      isValid: false,
      reason: InvalidationReason.mock_data_detected,
      detail: 'Mock or placeholder data detected — invalidating setup to force live rescan'
    };
  }

  const isLong = setup.bias === 'long';
  const spread = quoteDetails?.spread ?? (quoteDetails ? Math.max(0, quoteDetails.ask - quoteDetails.bid) : 0);

  // Institutional Bid/Ask Rule:
  // - Long trade exits (SL / TP / Invalidation) SELL to close -> evaluate on BID
  // - Short trade exits (SL / TP / Invalidation) BUY to close -> evaluate on ASK
  const evalPrice = isLong
    ? (quoteDetails?.bid ?? currentPrice)
    : (quoteDetails?.ask ?? currentPrice);

  const effectiveHigh = isLong
    ? (maxHigh !== undefined ? Math.max(evalPrice, maxHigh) : evalPrice)
    : (maxHigh !== undefined ? Math.max(evalPrice, maxHigh + spread) : evalPrice);

  const effectiveLow = isLong
    ? (minLow !== undefined ? Math.min(evalPrice, minLow) : evalPrice)
    : (minLow !== undefined ? Math.min(evalPrice, minLow + spread) : evalPrice);

  
  // Rule 1: sl_breached (active setups only)
  if (setup.signal_state === 'active') {
    if ((isLong && evalPrice <= setup.stop) || (!isLong && evalPrice >= setup.stop)) {
      return { 
        isValid: false, 
        reason: InvalidationReason.sl_breached, 
        detail: `Price ${evalPrice} (${isLong ? 'Bid' : 'Ask'}) breached SL ${setup.stop}` 
      };
    }
  }

  if (setup.signal_state === 'awaiting_entry') {

    // Rule 2a: TP reached before entry — the full move has completed without us.
    // Invalidate immediately if price reached either TP1 (+2R) or TP2 (+3R).
    if (isLong) {
      if (setup.tp1 && (effectiveHigh >= setup.tp1 || evalPrice >= setup.tp1)) {
        return {
          isValid: false,
          reason: InvalidationReason.target_reached_pre_entry,
          detail: `Price ${effectiveHigh} (Bid) reached TP1 (${setup.tp1}) without filling entry — move completed, pending order invalidated`
        };
      }
      if (setup.tp2 && (effectiveHigh >= setup.tp2 || evalPrice >= setup.tp2)) {
        return {
          isValid: false,
          reason: InvalidationReason.target_reached_pre_entry,
          detail: `Price ${effectiveHigh} (Bid) reached TP2 (${setup.tp2}) without filling entry — move completed, pending order invalidated`
        };
      }
    } else {
      if (setup.tp1 && (effectiveLow <= setup.tp1 || evalPrice <= setup.tp1)) {
        return {
          isValid: false,
          reason: InvalidationReason.target_reached_pre_entry,
          detail: `Price ${effectiveLow} (Ask) reached TP1 (${setup.tp1}) without filling entry — move completed, pending order invalidated`
        };
      }
      if (setup.tp2 && (effectiveLow <= setup.tp2 || evalPrice <= setup.tp2)) {
        return {
          isValid: false,
          reason: InvalidationReason.target_reached_pre_entry,
          detail: `Price ${effectiveLow} (Ask) reached TP2 (${setup.tp2}) without filling entry — move completed, pending order invalidated`
        };
      }
    }

    // Rule 2b: zone_consumed / stop breached before filling entry
    if (isLong) {
      if (effectiveLow <= setup.stop || evalPrice <= setup.stop) {
        return {
          isValid: false,
          reason: InvalidationReason.stop_breached_pre_entry,
          detail: `Price ${effectiveLow} (Bid) breached Stop Loss ${setup.stop} before entry fill — demand zone consumed`
        };
      }
      const blowThrough = setup.entry_zone_low - evalPrice; // positive only if price < zone bottom
      if (blowThrough > 1.5 * atr14) {
        return {
          isValid: false,
          reason: InvalidationReason.price_displaced,
          detail: `Price ${evalPrice} crashed ${blowThrough.toFixed(2)} below zone bottom ${setup.entry_zone_low} (> 1.5x ATR ${(atr14 * 1.5).toFixed(2)}) — demand zone consumed`
        };
      }
    } else {
      if (effectiveHigh >= setup.stop || evalPrice >= setup.stop) {
        return {
          isValid: false,
          reason: InvalidationReason.stop_breached_pre_entry,
          detail: `Price ${effectiveHigh} (Ask) breached Stop Loss ${setup.stop} before entry fill — supply zone consumed`
        };
      }
      const blowThrough = evalPrice - setup.entry_zone_high; // positive only if price > zone top
      if (blowThrough > 1.5 * atr14) {
        return {
          isValid: false,
          reason: InvalidationReason.price_displaced,
          detail: `Price ${evalPrice} rallied ${blowThrough.toFixed(2)} above zone top ${setup.entry_zone_high} (> 1.5x ATR ${(atr14 * 1.5).toFixed(2)}) — supply zone consumed`
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
