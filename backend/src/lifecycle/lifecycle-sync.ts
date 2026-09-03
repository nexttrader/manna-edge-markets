import { getDb } from '../db/database';
import * as queries from '../db/queries';
import { getLiveCurrentPrice, getLiveCandles } from '../discovery/yahoo-provider';
import { createLogger } from '../telemetry/logger';
import { publishEvents } from '../publish-gate/publish-gate';
import { isMarketOpen, mapTimestampToKillzone, getCurrentKillzone } from '../scheduler/killzone-mapper';
import { calculateAssetMatrix } from '../analytics/decision-matrix';

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

        // Entry fill check (Limit order execution on live price):
        // LONG (Limit Buy):  Price must touch/retrace to demand zone top (currentPrice <= setup.entry_zone_high)
        // SHORT (Limit Sell): Price must touch/retrace to supply zone bottom (currentPrice >= setup.entry_zone_low)
        let isFilled = false;
        if (isLong) {
          isFilled = currentPrice <= setup.entry_zone_high && currentPrice > setup.stop;
        } else {
          isFilled = currentPrice >= setup.entry_zone_low && currentPrice < setup.stop;
        }

        if (isFilled) {
          let executionPrice = currentPrice;
          if (isLong && currentPrice > setup.entry_zone_high) executionPrice = setup.entry_zone_high;
          if (!isLong && currentPrice < setup.entry_zone_low) executionPrice = setup.entry_zone_low;

          const nowTime = new Date();
          const entryTriggeredAt = nowTime;

          const entryKz = mapTimestampToKillzone(entryTriggeredAt) || getCurrentKillzone(entryTriggeredAt);
          let metaObj: any = {};
          try {
            metaObj = typeof setup.metadata === 'string' ? JSON.parse(setup.metadata) : (setup.metadata || {});
          } catch {}
          metaObj.entry_session = entryKz?.killzone || 'unknown';
          metaObj.entry_session_name = entryKz?.name || 'UNKNOWN';

          // Calculate entry time decision matrix to rank the setup
          let entryRank = 99;
          let entryPriorityScore = 0;
          try {
            const rawActiveSetups = await queries.getAllActiveSetups();
            const priceMap: Record<string, number> = {};
            const enriched = await Promise.all(
              rawActiveSetups.map(async (s) => {
                const price = s.id === setup.id ? executionPrice : (await getLiveCurrentPrice(s.instrument) || (s as any).current_price || 0);
                if (price) priceMap[s.instrument] = price;
                return { ...s, current_price: price } as any;
              })
            );
            const matrix = calculateAssetMatrix(enriched, priceMap);
            const index = matrix.findIndex(m => m.id === setup.id);
            if (index !== -1) {
              entryRank = index + 1;
              entryPriorityScore = matrix[index].priority_score;
            }
          } catch (e) {
            logger.warn({ err: e }, 'Failed to compute entry decision matrix rank');
          }
          
          metaObj.entry_matrix_rank = entryRank;
          metaObj.entry_priority_score = entryPriorityScore;
          metaObj.is_best_trade_at_entry = entryRank === 1;
          metaObj.matrix_engine_version = 'v2_strategy_differentiated';

          const market = setup.market || 'futures';
          await queries.updateSetupState(setup.id, market, 'active', {
            entry_triggered_at: entryTriggeredAt.toISOString(),
            entry_price_recorded: executionPrice,
            metadata: JSON.stringify(metaObj)
          });
          
          logger.info({ setupId: setup.id, price: executionPrice, instrument: setup.instrument, entrySession: metaObj.entry_session_name, entryRank }, 'Setup filled');
          publishEvents.emit('setup_entered', { ...setup, signal_state: 'active', entry_triggered_at: entryTriggeredAt.toISOString(), metadata: JSON.stringify(metaObj) });
        }
      }
    } catch (err) {
      logger.error({ err }, 'Error during LifecycleSync tick');
    }
  }
}

export const lifecycleSync = new LifecycleSync();
