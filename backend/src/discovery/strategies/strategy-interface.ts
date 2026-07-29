import { CandidateSetup, KillzoneInfo, Bias } from '../types';

export interface StrategyMeta {
  id: string;
  name: string;
  tier: 'basic' | 'pro' | 'elite';
  description: string;
  enabled: boolean;
}

export interface IStrategyEngine {
  meta: StrategyMeta;

  /**
   * Discover candidate trade setups for a specific market (futures or forex)
   */
  evaluateSetups(
    killzone: KillzoneInfo,
    runId: string,
    market: 'futures' | 'forex',
    instruments: string[],
    preCalculatedBiases: Record<string, Bias>
  ): Promise<CandidateSetup[]>;
}
