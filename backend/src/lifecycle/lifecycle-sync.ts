import { getDb } from '../db/database';
import * as queries from '../db/queries';
import { getLiveCurrentPrice, getLiveCandles } from '../discovery/yahoo-provider';
import { createLogger } from '../telemetry/logger';
import { publishEvents } from '../publish-gate/publish-gate';

const logger = createLogger('LifecycleSync');

export class LifecycleSync {
  private interval: NodeJS.Timeout | null = null;
  
  start(intervalMs: number = 15000): void {
    if (this.interval) return;
    this.interval = setInterval(() => this.tick(), intervalMs);
    logger.info(`LifecycleSync started with interval ${intervalMs}ms`);
  }
  
  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      logger.info('LifecycleSync stopped');
    }
  }
  
  private async tick(): Promise<void> {
    try {
      const setups = queries.getSetupsByState('awaiting_entry');
      
      for (const setup of setups) {
        const currentPrice = await getLiveCurrentPrice(setup.instrument);
        
        const createdTimeMs = new Date(setup.created_at).getTime();
        let maxHigh = currentPrice;
        let minLow = currentPrice;
        try {
          const candles = await getLiveCandles(setup.instrument, '1m', 5);
          if (candles && candles.length > 0) {
            // Filter ONLY candles that formed after setup creation
            const postCreationCandles = candles.filter(c => {
              const candleTime = new Date(c.timestamp).getTime();
              return candleTime >= (createdTimeMs - 5000);
            });

            if (postCreationCandles.length > 0) {
              maxHigh = Math.max(currentPrice, ...postCreationCandles.map(c => c.high));
              minLow = Math.min(currentPrice, ...postCreationCandles.map(c => c.low));
            }
          }
        } catch (e) {
          logger.warn({ instrument: setup.instrument }, 'Failed to fetch 1m candles for wick entry detection');
        }
        
        const isLong = (setup.bias || 'long').toLowerCase() === 'long';
        const entryPrice = setup.entry_price_recorded || setup.entry_zone_mid;

        // Entry fill check:
        // LONG (Limit Buy): Price must drop down to touch entry zone, AND current price must be at/near entry
        // SHORT (Limit Sell): Price must rally up to touch entry zone, AND current price must be at/near entry
        let isFilled = false;
        if (isLong) {
          isFilled = minLow <= setup.entry_zone_high && currentPrice <= (setup.entry_zone_high * 1.002);
        } else {
          isFilled = maxHigh >= setup.entry_zone_low && currentPrice >= (setup.entry_zone_low * 0.998);
        }

        if (isFilled) {
          let executionPrice = currentPrice;
          if (isLong && currentPrice > setup.entry_zone_high) executionPrice = setup.entry_zone_high;
          if (!isLong && currentPrice < setup.entry_zone_low) executionPrice = setup.entry_zone_low;

          const nowTime = new Date();
          const entryTriggeredAt = nowTime;

          const market = setup.market || 'futures';
          queries.updateSetupState(setup.id, market, 'active', {
            entry_triggered_at: entryTriggeredAt.toISOString(),
            entry_price_recorded: executionPrice
          });
          
          logger.info({ setupId: setup.id, price: executionPrice, instrument: setup.instrument }, 'Setup filled');
          publishEvents.emit('setup_entered', { ...setup, signal_state: 'active', entry_triggered_at: entryTriggeredAt.toISOString() });
        }
      }
    } catch (err) {
      logger.error({ err }, 'Error during LifecycleSync tick');
    }
  }
}

export const lifecycleSync = new LifecycleSync();
