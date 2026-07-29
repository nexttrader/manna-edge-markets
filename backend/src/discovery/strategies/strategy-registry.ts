import { IStrategyEngine, StrategyMeta } from './strategy-interface';
import { MannaBasicStrategy } from './manna-basic';
import { MannaSndStrategy } from './manna-snd';

class StrategyRegistry {
  private strategies: Map<string, IStrategyEngine> = new Map();

  constructor() {
    // Register initial strategies
    this.register(new MannaBasicStrategy());
    this.register(new MannaSndStrategy());
  }

  public register(strategy: IStrategyEngine): void {
    this.strategies.set(strategy.meta.id, strategy);
    console.log(`[Strategy Registry] Registered strategy: ${strategy.meta.name} (${strategy.meta.id})`);
  }

  public getStrategy(id: string): IStrategyEngine | undefined {
    return this.strategies.get(id);
  }

  public getActiveStrategies(): IStrategyEngine[] {
    return Array.from(this.strategies.values()).filter(s => s.meta.enabled);
  }

  public getAllMetadata(): StrategyMeta[] {
    return Array.from(this.strategies.values()).map(s => s.meta);
  }
}

export const strategyRegistry = new StrategyRegistry();
