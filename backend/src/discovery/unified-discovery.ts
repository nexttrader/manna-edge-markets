import { CandidateSetup, KillzoneInfo } from './types';
import { FUTURES_INSTRUMENTS, FOREX_INSTRUMENTS } from './mock-data';
import { getUnifiedMarketBiases } from './bias-engine';
import { strategyRegistry } from './strategies/strategy-registry';

export async function discoverUnifiedSetups(
  killzone: KillzoneInfo,
  runId: string,
  marketScope: 'both' | 'futures' | 'forex' = 'both',
  excludedInstruments: string[] = [],
  targetStrategyId?: string
): Promise<{ futures: CandidateSetup[]; forex: CandidateSetup[] }> {
  // 1. Single Source of Truth: Compute Unified Biases ONCE for all target instruments
  const allInstruments = [...FUTURES_INSTRUMENTS, ...FOREX_INSTRUMENTS];
  const targetInstruments = excludedInstruments.length > 0
    ? allInstruments.filter(inst => !excludedInstruments.includes(inst))
    : allInstruments;

  const unifiedBiases = await getUnifiedMarketBiases(targetInstruments);

  const futuresCandidates: CandidateSetup[] = [];
  const forexCandidates: CandidateSetup[] = [];

  let activeStrategies = await strategyRegistry.getActiveStrategiesAsync();

  if (targetStrategyId && targetStrategyId !== 'all') {
    const specificStrat = strategyRegistry.getStrategy(targetStrategyId);
    if (specificStrat) {
      activeStrategies = [specificStrat];
    } else {
      activeStrategies = activeStrategies.filter(s => s.meta.id === targetStrategyId);
    }
  }

  const targetFutures = FUTURES_INSTRUMENTS.filter(i => !excludedInstruments.includes(i));
  const targetForex = FOREX_INSTRUMENTS.filter(i => !excludedInstruments.includes(i));

  // 2. Execute selected strategy engines
  for (const strategy of activeStrategies) {
    if (marketScope === 'both' || marketScope === 'futures') {
      const futuresSetups = await strategy.evaluateSetups(killzone, runId, 'futures', targetFutures, unifiedBiases);
      futuresCandidates.push(...futuresSetups);
    }

    if (marketScope === 'both' || marketScope === 'forex') {
      const forexSetups = await strategy.evaluateSetups(killzone, runId, 'forex', targetForex, unifiedBiases);
      forexCandidates.push(...forexSetups);
    }
  }

  let futures = futuresCandidates;
  let forex = forexCandidates;

  if (excludedInstruments.length > 0) {
    const excludedUpper = excludedInstruments.map(s => s.toUpperCase());
    futures = futures.filter(s => !excludedUpper.includes(s.instrument.toUpperCase()));
    forex = forex.filter(s => !excludedUpper.includes(s.instrument.toUpperCase()));
  }

  // Final strategy guard: if a target was requested, strip any candidates that
  // don't carry the correct strategy_id (defence-in-depth against edge cases).
  if (targetStrategyId && targetStrategyId !== 'all') {
    futures = futures.filter(c => (c.strategy_id || 'manna_basic') === targetStrategyId);
    forex   = forex.filter(c => (c.strategy_id || 'manna_basic') === targetStrategyId);
  }

  return { futures, forex };
}
