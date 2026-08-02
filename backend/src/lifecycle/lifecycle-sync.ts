import { getDb } from '../db/database';
import * as queries from '../db/queries';
import { getLiveCurrentPrice, getLiveCandles } from '../discovery/yahoo-provider';
import { createLogger } from '../telemetry/logger';
import { publishEvents } from '../publish-gate/publish-gate';
import { isMarketOpen } from '../scheduler/killzone-mapper';

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
      if (!isMarketOpen()) {
        logger.debug('Skipping LifecycleSync tick: Market is closed for the weekend');
        return;
      }

      const setups = await queries.getSetupsByState('awaiting_entry');
      
      for (const setup of setups) {
        const currentPrice = await getLiveCurrentPrice(setup.instrument);
        
        // Skip if price data unavailable — never fill a trade on a bad price feed
        if (!currentPrice || currentPrice <= 0) {
          logger.warn({ instrument: setup.instrument }, 'Skipping entry check: live price unavailable');
          continue;
        }
        
        const createdTimeMs = new Date(setup.created_at).getTime();
        let maxHigh = currentPrice;
        let minLow = currentPrice;
        try {
          const candles = await getLiveCandles(setup.instrument, '1m', 5);
          if (candles && candles.length > 0) {
            // Filter ONLY candles that opened strictly AFTER this setup was created.
            // The -5000ms window was including the current in-progress candle (opened before setup
            // creation), whose wick instantly satisfied fill conditions. Strict >= createdTimeMs ensures
            // only NEW price action (formed after the setup was published) triggers entry fills.
            const postCreationCandles = candles.filter(c => {
              const candleTime = new Date(c.timestamp).getTime();
              return candleTime >= createdTimeMs;
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

        const secondsSinceCreation = createdTimeMs > 0 ? (Date.now() - createdTimeMs) / 1000 : 999;

        // Entry fill check:
        // Require at least 15 seconds after setup publication before checking limit order fills,
        // ensuring new pending limit setups remain in awaiting_entry state for user visibility.
        let isFilled = false;
        if (secondsSinceCreation >= 15) {
          if (isLong) {
            isFilled = minLow <= setup.entry_zone_high && currentPrice > setup.stop;
          } else {
            isFilled = maxHigh >= setup.entry_zone_low && currentPrice < setup.stop;
          }
        }

        if (isFilled) {
          let executionPrice = currentPrice;
          if (isLong && currentPrice > setup.entry_zone_high) executionPrice = setup.entry_zone_high;
          if (!isLong && currentPrice < setup.entry_zone_low) executionPrice = setup.entry_zone_low;

          const nowTime = new Date();
          const entryTriggeredAt = nowTime;

          const market = setup.market || 'futures';
          await queries.updateSetupState(setup.id, market, 'active', {
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
