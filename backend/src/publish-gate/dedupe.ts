import { EdgeSetup, CandidateSetup, InvalidationReason } from '../discovery/types';
import { shouldInvalidateForOpposingSignal } from './revalidation';

export interface DedupeResult {
  action: 'preserve' | 'replace' | 'insert' | 'no_action';
  selectedCandidate?: CandidateSetup;
  invalidations: Array<{ setupId: string, reason: string, detail: string }>;
}

export function selectBestCandidate(candidates: CandidateSetup[]): { selected: CandidateSetup; discarded: CandidateSetup[] } {
  if (!candidates || candidates.length === 0) {
    throw new Error("No candidates provided to selectBestCandidate");
  }
  
  const sorted = [...candidates].sort((a, b) => {
    if ((b.conviction_score || 0) !== (a.conviction_score || 0)) return (b.conviction_score || 0) - (a.conviction_score || 0);
    if ((b.r_multiple_1 || 0) !== (a.r_multiple_1 || 0)) return (b.r_multiple_1 || 0) - (a.r_multiple_1 || 0);
    return (b.liquidity_score || 0) - (a.liquidity_score || 0);
  });
  
  const selected = sorted[0];
  const discarded = sorted.slice(1);
  
  return { selected, discarded };
}

export function dedupeAndSelect(
  existingSetup: EdgeSetup | null,
  candidates: CandidateSetup[],
  currentPrice: number,
  atr14: number
): DedupeResult {
  const invalidations: Array<{ setupId: string, reason: string, detail: string }> = [];

  if (candidates.length === 0 && !existingSetup) {
    return { action: 'no_action', invalidations };
  }
  
  if (candidates.length === 0 && existingSetup) {
    return { action: 'preserve', invalidations };
  }

  const { selected, discarded } = selectBestCandidate(candidates);
  
  for (const d of discarded) {
    invalidations.push({
      setupId: 'candidate',
      reason: InvalidationReason.discarded_duplicate,
      detail: 'Lower ranked candidate discarded in dedupe'
    });
  }

  if (existingSetup && existingSetup.signal_state !== 'invalidated' && existingSetup.signal_state !== 'resolved') {
    // 1. ACTIVE trades currently live in market MUST be preserved and never auto-superseded by new candidates
    if (existingSetup.signal_state === 'active') {
      return { action: 'preserve', invalidations };
    }

    // 2. Stale awaiting_entry setups: if older than 30 minutes, replace unconditionally.
    //    Setups created under a broken discovery run (bad zone data, instant-fill bug, etc.)
    //    should not block fresh signals from the current scan.
    const ageMs = existingSetup.created_at
      ? Date.now() - new Date(existingSetup.created_at).getTime()
      : Infinity;
    if (ageMs > 30 * 60 * 1000) {
      invalidations.push({
        setupId: existingSetup.id,
        reason: 'stale_replaced',
        detail: `Awaiting_entry setup was older than 30 minutes (${Math.round(ageMs / 60000)} min) — replaced by fresh discovery`
      });
      return { action: 'replace', selectedCandidate: selected, invalidations };
    }

    // 3. Pending AWAITING_ENTRY setups: Check for opposing signal
    if (shouldInvalidateForOpposingSignal(existingSetup, selected)) {
       invalidations.push({
         setupId: existingSetup.id,
         reason: 'opposing_signal',
         detail: 'Opposing candidate has higher conviction'
       });
       return { action: 'replace', selectedCandidate: selected, invalidations };
    }
    
    // 4. Pending AWAITING_ENTRY setups: Check for significantly higher conviction (>15 points)
    if ((selected.conviction_score || 0) > (existingSetup.conviction_score || 0) + 15) {
       invalidations.push({
         setupId: existingSetup.id,
         reason: 'superseded',
         detail: 'New candidate has significantly higher conviction (>15 points)'
       });
       return { action: 'replace', selectedCandidate: selected, invalidations };
    }
    
    // Existing is still valid and no significantly better candidate
    return { action: 'preserve', invalidations };
  }
  
  // No existing setup — insert the new candidate
  return { action: 'insert', selectedCandidate: selected, invalidations };
}
