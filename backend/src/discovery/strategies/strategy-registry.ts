import { IStrategyEngine, StrategyMeta } from './strategy-interface';
import { MannaBasicStrategy } from './manna-basic';
import { MannaSndStrategy } from './manna-snd';
import * as queries from '../../db/queries';

class StrategyRegistry {
  private strategies: Map<string, IStrategyEngine> = new Map();

  constructor() {
    this.register(new MannaBasicStrategy());
    this.register(new MannaSndStrategy());
  }

  public register(strategy: IStrategyEngine): void {
    this.strategies.set(strategy.meta.id, strategy);
  }

  public getStrategy(id: string): IStrategyEngine | undefined {
    return this.strategies.get(id);
  }

  public async getActiveStrategiesAsync(): Promise<IStrategyEngine[]> {
    try {
      const dbSettings = await queries.getStrategySettings();
      const enabledMap = new Map(dbSettings.map(s => [s.id, s.enabled]));
      return Array.from(this.strategies.values()).filter(s => {
        const isDbEnabled = enabledMap.has(s.meta.id) ? enabledMap.get(s.meta.id) : s.meta.enabled;
        return isDbEnabled;
      });
    } catch {
      return Array.from(this.strategies.values()).filter(s => s.meta.enabled);
    }
  }

  public getActiveStrategies(): IStrategyEngine[] {
    return Array.from(this.strategies.values()).filter(s => s.meta.enabled);
  }

  public getAllMetadata(): StrategyMeta[] {
    return Array.from(this.strategies.values()).map(s => s.meta);
  }
}

export const strategyRegistry = new StrategyRegistry();
