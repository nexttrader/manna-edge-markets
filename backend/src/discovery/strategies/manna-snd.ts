import { IStrategyEngine, StrategyMeta } from './strategy-interface';
import { CandidateSetup, KillzoneInfo, Bias } from '../types';

export class MannaSndStrategy implements IStrategyEngine {
  public meta: StrategyMeta = {
    id: 'manna_snd',
    name: 'Manna SnD',
    tier: 'pro',
    description: 'Advanced Supply & Demand strategy with order block & liquidity pool validation.',
    enabled: true // Prepared for upcoming user rules prompt
  };

  public async evaluateSetups(
    killzone: KillzoneInfo,
    runId: string,
    market: 'futures' | 'forex',
    instruments: string[],
    preCalculatedBiases: Record<string, Bias>
  ): Promise<CandidateSetup[]> {
    // Strategy placeholder ready for rules to be injected via next prompt
    return [];
  }
}
