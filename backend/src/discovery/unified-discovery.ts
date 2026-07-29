import { CandidateSetup, KillzoneInfo } from './types';
import { FUTURES_INSTRUMENTS, FOREX_INSTRUMENTS } from './mock-data';
import { discoverFuturesSetups } from './futures-discovery';
import { discoverForexSetups } from './forex-discovery';
import { getUnifiedMarketBiases } from './bias-engine';

export async function discoverUnifiedSetups(
  killzone: KillzoneInfo,
  runId: string,
  marketScope: 'both' | 'futures' | 'forex' = 'both',
  excludedInstruments: string[] = []
): Promise<{ futures: CandidateSetup[]; forex: CandidateSetup[] }> {
  // 1. Single Source of Truth: Compute Unified Biases ONCE for all instruments
  const allInstruments = [...FUTURES_INSTRUMENTS, ...FOREX_INSTRUMENTS];
  const targetInstruments = excludedInstruments.length > 0
    ? allInstruments.filter(inst => !excludedInstruments.includes(inst))
    : allInstruments;

  const unifiedBiases = await getUnifiedMarketBiases(targetInstruments);

  // 2. Discover candidates using synchronized biases
  let futures = (marketScope === 'both' || marketScope === 'futures')
    ? await discoverFuturesSetups(killzone, runId, unifiedBiases)
    : [];

  let forex = (marketScope === 'both' || marketScope === 'forex')
    ? await discoverForexSetups(killzone, runId, unifiedBiases)
    : [];

  if (excludedInstruments.length > 0) {
    const excludedUpper = excludedInstruments.map(s => s.toUpperCase());
    futures = futures.filter(s => !excludedUpper.includes(s.instrument.toUpperCase()));
    forex = forex.filter(s => !excludedUpper.includes(s.instrument.toUpperCase()));
  }

  return { futures, forex };
}
