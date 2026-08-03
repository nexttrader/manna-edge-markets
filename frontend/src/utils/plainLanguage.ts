/**
 * 8th-Grade Plain-Language Translator Utility
 * Converts technical ICT/SND trading jargon and system reason codes into
 * simple, crystal-clear sentences that anyone can understand instantly.
 */

export function translateRationaleToPlainEnglish(rationale: string | undefined, bias: string, instrument: string): string {
  if (!rationale) {
    return `Looking for a strong ${bias.toUpperCase()} entry for ${instrument}.`;
  }

  const upper = rationale.toUpperCase();

  if (upper.includes('MANNA SND') || upper.includes('DEMAND CURVE') || upper.includes('SUPPLY CURVE')) {
    if (bias.toLowerCase() === 'long') {
      return `Price touched a strong buyer zone on the 1-hour chart where big institutions bought earlier.`;
    } else {
      return `Price touched a strong seller zone on the 1-hour chart where big institutions sold earlier.`;
    }
  }

  if (upper.includes('ORDER BLOCK') || upper.includes('SWEEP')) {
    if (bias.toLowerCase() === 'long') {
      return `Big buyers swept liquidity and set up a strong buy zone on the 15-minute chart.`;
    } else {
      return `Big sellers swept liquidity and set up a strong sell zone on the 15-minute chart.`;
    }
  }

  if (upper.includes('FVG') || upper.includes('FAIR VALUE GAP')) {
    return `An imbalance gap was spotted on the 15-minute chart, pointing toward a solid trade entry.`;
  }

  return rationale;
}

export function translateInvalidationToPlainEnglish(reason: string | undefined): string {
  if (!reason) return 'Signal condition updated.';

  const lower = reason.toLowerCase();

  if (lower.includes('displaced') || lower.includes('displacement')) {
    return 'Price ran away too quickly before filling our limit order. Order cancelled to keep your account safe from chasing!';
  }

  if (lower.includes('structure') || lower.includes('broken')) {
    return 'Market direction changed on smaller timeframes. Signal cancelled to prevent taking unnecessary risk.';
  }

  if (lower.includes('sl_breached') || lower.includes('stop')) {
    return 'Price touched the stop loss level. Trade closed cleanly to protect your account balance.';
  }

  if (lower.includes('replaced') || lower.includes('superseded')) {
    return 'Admin or scanner found a higher-conviction setup for this market, so the old signal was replaced with a better one!';
  }

  if (lower.includes('tp1') || lower.includes('tp2')) {
    return 'Target price reached! Profit locked in.';
  }

  if (lower.includes('be') || lower.includes('breakeven')) {
    return 'Stop loss moved to entry price. Trade is 100% risk-free ($0 loss if price turns back).';
  }

  return reason;
}

export function translateStateToPlainEnglish(state: string | undefined, isBreakeven?: boolean): string {
  const s = (state || '').toLowerCase();

  if (isBreakeven) {
    return '🛡️ Risk Free (Stop loss moved to entry price)';
  }

  switch (s) {
    case 'awaiting_entry':
      return '⏳ Awaiting Entry (Waiting for price to touch limit order zone)';
    case 'active':
      return '⚡ Active Trade (Limit order filled & position is live)';
    case 'resolved':
      return '🏁 Trade Closed (Target reached or exit triggered)';
    case 'invalidated':
      return '🏃 Cancelled (Safety rule triggered before fill)';
    case 'superseded':
      return '🔄 Replaced (Replaced by a higher conviction setup)';
    default:
      return s.toUpperCase();
  }
}
