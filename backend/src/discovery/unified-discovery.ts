import { CandidateSetup, KillzoneInfo } from './types';
import { FUTURES_INSTRUMENTS, FOREX_INSTRUMENTS } from './mock-data';
import { discoverFuturesSetups } from './futures-discovery';
import { discoverForexSetups } from './forex-discovery';
import { getUnifiedMarketBiases } from './bias-engine';

export async function discoverUnifiedSetups(
  killzone: KillzoneInfo,
  runId: string,
  marketScope: 'both' | 'futures' | 'forex' = 'both'
): Promise<{ futures: CandidateSetup[]; forex: CandidateSetup[] }> {
  // 1. Single Source of Truth: Compute Unified Biases ONCE for all instruments
  const allInstruments = [...FUTURES_INSTRUMENTS, ...FOREX_INSTRUMENTS];
  const unifiedBiases = await getUnifiedMarketBiases(allInstruments);

  // 2. Discover candidates using synchronized biases
  const futures = (marketScope === 'both' || marketScope === 'futures')
    ? await discoverFuturesSetups(killzone, runId, unifiedBiases)
    : [];

  const forex = (marketScope === 'both' || marketScope === 'forex')
    ? await discoverForexSetups(killzone, runId, unifiedBiases)
    : [];

  return { futures, forex };
}
