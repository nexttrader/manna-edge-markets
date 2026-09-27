import { IStrategyEngine, StrategyMeta } from './strategy-interface';
import { MannaSndStrategy } from './manna-snd';
import { SentinelV2Strategy } from './sentinel-v2';
import { EliteFractalStrategy } from './elite-fractal';
import * as queries from '../../db/queries';

class StrategyRegistry {
  private strategies: Map<string, IStrategyEngine> = new Map();

  constructor() {
    this.register(new MannaSndStrategy());
    this.register(new SentinelV2Strategy());
    this.register(new EliteFractalStrategy());
  }

  public register(strategy: IStrategyEngine): void {
    this.strategies.set(strategy.meta.id, strategy);
  }

  public getStrategy(id: string): IStrategyEngine | undefined {
    return this.strategies.get(id);
  }

  /**
   * Returns strategies allowed in the PUBLIC/ADMIN discovery pipeline.
   * CRITICAL: superadmin_only strategies are ALWAYS excluded.
   * They are only executed via the dedicated super-admin exclusive endpoint.
   */
  public async getActiveStrategiesAsync(): Promise<IStrategyEngine[]> {
    try {
      const dbSettings = await queries.getStrategySettings();
      const enabledMap = new Map(dbSettings.map(s => [s.id, s.enabled]));
      return Array.from(this.strategies.values()).filter(s => {
        if (s.meta.visibility === 'superadmin_only') return false;
        const isDbEnabled = enabledMap.has(s.meta.id) ? enabledMap.get(s.meta.id) : s.meta.enabled;
        return isDbEnabled;
      });
    } catch {
      return Array.from(this.strategies.values()).filter(s =>
        s.meta.visibility !== 'superadmin_only' && s.meta.enabled
      );
    }
  }

  public getActiveStrategies(): IStrategyEngine[] {
    return Array.from(this.strategies.values()).filter(s =>
      s.meta.visibility !== 'superadmin_only' && s.meta.enabled
    );
  }

  /**
   * Returns ONLY superadmin_only strategies. Used exclusively by the super-admin endpoint.
   */
  public getSuperAdminExclusiveStrategies(): IStrategyEngine[] {
    return Array.from(this.strategies.values()).filter(s =>
      s.meta.visibility === 'superadmin_only' && s.meta.enabled
    );
  }

  public getAllMetadata(): StrategyMeta[] {
    return Array.from(this.strategies.values()).map(s => s.meta);
  }
}

export const strategyRegistry = new StrategyRegistry();
