import { getDb } from '../db/database';
import * as queries from '../db/queries';
import { getLiveCurrentPrice, getLiveCandles, getLiveQuoteDetails } from '../discovery/yahoo-provider';
import { computeATR } from '../discovery/atr';
import { createLogger } from '../telemetry/logger';
import { publishEvents } from '../publish-gate/publish-gate';
import { revalidateSetup } from '../publish-gate/revalidation';
import { hawkeyeService } from '../hawkeye/hawkeye-service';
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
        const quote = await getLiveQuoteDetails(setup.instrument);
        const currentPrice = quote?.price || await getLiveCurrentPrice(setup.instrument);
        
        // Skip if price data unavailable — never fill a trade on a bad price feed
        if (!currentPrice || currentPrice <= 0) {
          logger.warn({ instrument: setup.instrument }, 'Skipping entry check: live price unavailable');
          continue;
        }

        const currentBid = quote?.bid || currentPrice;
        const currentAsk = quote?.ask || currentPrice;
        const spread = quote?.spread || 0;
        
        const createdTimeMs = new Date(setup.created_at).getTime();
        let maxHigh = currentBid;
        let minLow = currentBid;
        let recentCandles: any[] = [];
        try {
          const candles = await getLiveCandles(setup.instrument, '1m', 15);
          if (candles && candles.length > 0) {
            recentCandles = candles;
            // Filter ONLY candles that opened strictly AFTER this setup was created.
            const postCreationCandles = candles.filter(c => {
              const candleTime = new Date(c.timestamp).getTime();
              return candleTime >= createdTimeMs;
            });

            if (postCreationCandles.length > 0) {
              maxHigh = Math.max(currentBid, ...postCreationCandles.map(c => c.high));
              minLow = Math.min(currentBid, ...postCreationCandles.map(c => c.low));
            }
          }
        } catch (e) {
          logger.warn({ instrument: setup.instrument }, 'Failed to fetch 1m candles for wick entry detection');
        }

        const isForex = (setup.market || '').toLowerCase() === 'forex';
        const defaultAtr = isForex ? 0.0020 : 3.0;
        const atr14 = recentCandles.length >= 14 ? computeATR(recentCandles, 14) : defaultAtr;

        // 1. PRE-ENTRY INVALIDATION CHECK (Institutional Bid/Ask)
        // If price reached TP1/TP2 or breached SL before ever entering, the move completed or zone failed.
        const revalResult = revalidateSetup(setup, currentPrice, atr14, maxHigh, minLow, quote || undefined);
        if (!revalResult.isValid) {
          const market = setup.market || 'futures';
          await queries.updateSetupState(setup.id, market, 'invalidated', {
            invalidation_reason: revalResult.reason,
            invalidation_detail: revalResult.detail,
            tradable: 0,
            resolved_at: new Date().toISOString()
          });

          await hawkeyeService.logInvalidation({
            setupId: setup.id,
            instrument: setup.instrument,
            setupMarket: market,
            runId: `lifecycle_invalidation_${Date.now()}`,
            reasonCode: revalResult.reason || 'price_displaced',
            detail: revalResult.detail || 'Pre-entry target reached or structure breached',
            previousState: setup.signal_state,
            newState: 'invalidated',
            createdBy: 'lifecycle_sync'
          });

          logger.info(
            { setupId: setup.id, instrument: setup.instrument, reason: revalResult.reason, detail: revalResult.detail },
            'Pre-entry setup invalidated by LifecycleSync — pending order cancelled'
          );

          publishEvents.emit('setup_invalidated', {
            setupId: setup.id,
            reason: revalResult.reason,
            setup: { ...setup, signal_state: 'invalidated' },
            superseded: false
          });

          // Skip fill check; move to next setup
          continue;
        }
        
        const isLong = (setup.bias || 'long').toLowerCase() === 'long';

        // Entry fill check (Limit order execution on live price & wicks):
        // LONG (Limit Buy): Buying at ASK. Touch demand zone top (Ask <= entry_zone_high)
        // SHORT (Limit Sell): Selling at BID. Touch supply zone bottom (Bid >= entry_zone_low)
        let isFilled = false;
        const minLowAsk = minLow + spread;
        const maxHighBid = maxHigh;

        if (isLong) {
          const askHit = currentAsk <= setup.entry_zone_high && currentAsk > setup.stop;
          const wickHit = minLowAsk <= setup.entry_zone_high && minLowAsk > setup.stop;
          isFilled = askHit || wickHit;
        } else {
          const bidHit = currentBid >= setup.entry_zone_low && currentBid < setup.stop;
          const wickHit = maxHighBid >= setup.entry_zone_low && maxHighBid < setup.stop;
          isFilled = bidHit || wickHit;
        }

        if (isFilled) {
          let executionPrice = isLong ? currentAsk : currentBid;
          if (isLong && executionPrice > setup.entry_zone_high) executionPrice = setup.entry_zone_high;
          if (!isLong && executionPrice < setup.entry_zone_low) executionPrice = setup.entry_zone_low;

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
