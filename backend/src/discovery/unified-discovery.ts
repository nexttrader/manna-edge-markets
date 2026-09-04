import { CandidateSetup, KillzoneInfo, Bias } from './types';
import { FUTURES_INSTRUMENTS, FOREX_INSTRUMENTS } from './mock-data';
import { getUnifiedMarketBiases } from './bias-engine';
import { strategyRegistry } from './strategies/strategy-registry';
import { createLogger } from '../telemetry/logger';
import * as queries from '../db/queries';

const logger = createLogger('UnifiedDiscovery');

const POSITIVE_DOLLAR_PAIRS = ['GBP/USD', 'AUD/USD', 'NZD/USD'];
const INVERSE_DOLLAR_PAIRS = ['USD/JPY', 'USD/CAD', 'USD/CHF'];

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
  if (marketScope === 'both' || marketScope === 'futures') {
    for (const strategy of activeStrategies) {
      const futuresSetups = await strategy.evaluateSetups(killzone, runId, 'futures', targetFutures, unifiedBiases);
      futuresCandidates.push(...futuresSetups);
    }
  }

  if (marketScope === 'both' || marketScope === 'forex') {
    // 1. Evaluate EUR/USD first as Macro Dollar Leader
    let leaderBias: Bias | null = null;
    let eurCandidates: CandidateSetup[] = [];

    if (targetForex.includes('EUR/USD')) {
      for (const strategy of activeStrategies) {
        const eurSetups = await strategy.evaluateSetups(killzone, runId, 'forex', ['EUR/USD'], unifiedBiases);
        eurCandidates.push(...eurSetups);
      }
      if (eurCandidates.length > 0) {
        leaderBias = eurCandidates[0].bias;
      }
    }

    // If EUR/USD was excluded from targetForex (e.g. already in trade/active) or didn't trigger, check active setups or unified bias
    if (!leaderBias) {
      try {
        const activeForex = await queries.getActiveSetups('forex');
        const activeEur = activeForex.find(s => s.instrument.toUpperCase() === 'EUR/USD');
        if (activeEur) {
          leaderBias = activeEur.bias;
        } else if (unifiedBiases['EUR/USD']) {
          leaderBias = unifiedBiases['EUR/USD'];
        }
      } catch (err) {
        if (unifiedBiases['EUR/USD']) {
          leaderBias = unifiedBiases['EUR/USD'];
        }
      }
    }

    logger.info(
      { leaderBias, eurCandidatesFound: eurCandidates.length },
      `Forex Discovery: EUR/USD Leader bias established as ${leaderBias ? leaderBias.toUpperCase() : 'NEUTRAL/UNCONSTRAINED'}`
    );

    // 2. Prepare Follower Biases aligned with EUR/USD Leader
    const followerBiases: Record<string, Bias> = { ...unifiedBiases };
    if (leaderBias) {
      for (const inst of targetForex) {
        const upper = inst.toUpperCase();
        if (POSITIVE_DOLLAR_PAIRS.includes(upper)) {
          followerBiases[inst] = leaderBias;
        } else if (INVERSE_DOLLAR_PAIRS.includes(upper)) {
          followerBiases[inst] = leaderBias === 'long' ? 'short' : 'long';
        }
      }
    }

    // 3. Evaluate non-EUR/USD Forex Instruments
    const nonEurForex = targetForex.filter(i => i.toUpperCase() !== 'EUR/USD');
    const rawFollowerCandidates: CandidateSetup[] = [];

    for (const strategy of activeStrategies) {
      const setups = await strategy.evaluateSetups(killzone, runId, 'forex', nonEurForex, followerBiases);
      rawFollowerCandidates.push(...setups);
    }

    // 4. Strict Leader-Correlation Enforcement:
    // If a follower candidate diverges from leader, discard it and attempt re-scan in leader's direction.
    // Only post if a valid setup exists in the leader's direction.
    const finalFollowerCandidates: CandidateSetup[] = [];

    for (const cand of rawFollowerCandidates) {
      const upper = cand.instrument.toUpperCase();
      const isPositive = POSITIVE_DOLLAR_PAIRS.includes(upper);
      const isInverse = INVERSE_DOLLAR_PAIRS.includes(upper);

      if (leaderBias && (isPositive || isInverse)) {
        const expectedBias: Bias = isPositive ? leaderBias : (leaderBias === 'long' ? 'short' : 'long');
        if (cand.bias !== expectedBias) {
          logger.warn(
            { instrument: cand.instrument, candidateBias: cand.bias, expectedBias, leaderBias },
            `🚨 DIVERGENT CANDIDATE: ${cand.instrument} produced ${cand.bias.toUpperCase()} opposing EUR/USD leader (${leaderBias.toUpperCase()}). Discarding and rescanning in leader direction.`
          );

          // Force re-scan strictly in leader direction
          let alignedReplacement: CandidateSetup | null = null;
          for (const strategy of activeStrategies) {
            const forcedBias = { [cand.instrument]: expectedBias };
            const reevaluated = await strategy.evaluateSetups(killzone, runId, 'forex', [cand.instrument], forcedBias);
            const valid = reevaluated.find(s => s.bias === expectedBias);
            if (valid) {
              alignedReplacement = valid;
              break;
            }
          }

          if (alignedReplacement) {
            logger.info(
              { instrument: cand.instrument, newBias: alignedReplacement.bias },
              `✅ RE-SCAN SUCCESS: Found valid aligned setup for ${cand.instrument} in leader direction (${expectedBias.toUpperCase()}).`
            );
            finalFollowerCandidates.push(alignedReplacement);
          } else {
            logger.warn(
              { instrument: cand.instrument, expectedBias },
              `❌ RE-SCAN EXHAUSTED: No valid setup found for ${cand.instrument} in leader direction (${expectedBias.toUpperCase()}). Discarding signal.`
            );
          }
          continue;
        }
      }

      // Aligned setup or cross pair (e.g. EUR/JPY, EUR/GBP)
      finalFollowerCandidates.push(cand);
    }

    forexCandidates.push(...eurCandidates, ...finalFollowerCandidates);
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
    futures = futures.filter(c => (c.strategy_id || 'sentinel_v2') === targetStrategyId);
    forex   = forex.filter(c => (c.strategy_id || 'sentinel_v2') === targetStrategyId);
  }

  return { futures, forex };
}
