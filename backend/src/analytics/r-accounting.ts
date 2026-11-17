/**
 * Canonical Risk-Reward (R) & Partial Scale-Out Accounting Engine
 *
 * Institutional 80/20 scale-out rule:
 *   - TP1 hit (80% closed at r1, 20% runner stopped at Breakeven 0R): 0.80 * r1  (+1.60R when r1 = 2.0)
 *   - TP2 hit (80% closed at r1, 20% runner closed at r2):          0.80 * r1 + 0.20 * r2 (+2.20R when r1 = 2.0, r2 = 3.0)
 *   - Break Even (non-runner):                                       0.00R
 *   - Stop Loss:                                                    -1.00R
 */

export interface BlendedRParams {
  outcomeType?: string | null;
  invalidationReason?: string | null;
  rMultiple1?: number | null;
  rMultiple2?: number | null;
  wasRunner?: boolean | number | null;
  fallbackR?: number | null;
}

export function computeBlendedRealizedR({
  outcomeType,
  invalidationReason,
  rMultiple1,
  rMultiple2,
  wasRunner,
  fallbackR
}: BlendedRParams): number {
  const ot = String(outcomeType || invalidationReason || '').toLowerCase();
  const r1 = rMultiple1 && Number(rMultiple1) > 0 ? Number(rMultiple1) : 2.0;
  const r2 = rMultiple2 && Number(rMultiple2) > 0 ? Number(rMultiple2) : 3.0;

  if (ot.includes('tp2')) {
    return Number((0.80 * r1 + 0.20 * r2).toFixed(2));
  }
  if (ot.includes('tp1') || ot === 'tp' || ot.includes('tp_hit')) {
    return Number((0.80 * r1).toFixed(2));
  }
  if (ot.includes('sl') || ot.includes('stop')) {
    return -1.0;
  }
  if (ot.includes('be') || ot.includes('breakeven')) {
    if (Boolean(wasRunner)) {
      return Number((0.80 * r1).toFixed(2));
    }
    return 0.0;
  }

  if (fallbackR !== undefined && fallbackR !== null && Number.isFinite(Number(fallbackR))) {
    return Math.max(-1.0, Number(Number(fallbackR).toFixed(2)));
  }

  return 0.0;
}
