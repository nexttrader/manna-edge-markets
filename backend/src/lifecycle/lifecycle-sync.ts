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
        
        let maxHigh = currentPrice;
        let minLow = currentPrice;
        try {
          const candles = await getLiveCandles(setup.instrument, '1m', 2);
          if (candles && candles.length > 0) {
            maxHigh = Math.max(currentPrice, ...candles.map(c => c.high));
            minLow = Math.min(currentPrice, ...candles.map(c => c.low));
          }
        } catch (e) {
          logger.warn({ instrument: setup.instrument }, 'Failed to fetch 1m candles for wick entry detection');
        }
        
        const isLong = (setup.bias || 'long').toLowerCase() === 'long';
        const entryPrice = setup.entry_price_recorded || setup.entry_zone_mid;

        // Entry fill check:
        // LONG (Limit Buy): Price must touch/drop down to entry (minLow <= entryPrice)
        // SHORT (Limit Sell): Price must touch/rally up to entry (maxHigh >= entryPrice)
        let isFilled = false;
        if (isLong) {
          isFilled = minLow <= setup.entry_zone_high || currentPrice <= setup.entry_zone_high;
        } else {
          isFilled = maxHigh >= setup.entry_zone_low || currentPrice >= setup.entry_zone_low;
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
