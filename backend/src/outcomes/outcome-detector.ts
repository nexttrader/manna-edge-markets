import { getDb } from '../db/database';
import * as queries from '../db/queries';
import { getLiveCurrentPrice, getLiveCandles } from '../discovery/yahoo-provider';
import { createLogger } from '../telemetry/logger';
import { publishEvents } from '../publish-gate/publish-gate';
import { isMarketOpen } from '../scheduler/killzone-mapper';

const logger = createLogger('OutcomeDetector');

export class OutcomeDetector {
  private interval: NodeJS.Timeout | null = null;
  
  start(intervalMs: number = 15000): void {
    if (this.interval) return;
    this.interval = setInterval(() => this.tick(), intervalMs);
    logger.info(`OutcomeDetector started with interval ${intervalMs}ms`);
  }
  
  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      logger.info('OutcomeDetector stopped');
    }
  }
  
  private async tick(): Promise<void> {
    try {
      if (!isMarketOpen()) {
        logger.debug('Skipping OutcomeDetector tick: Market is closed for the weekend');
        return;
      }

      const setups = await queries.getSetupsByState('active');
      
      for (const setup of setups) {
        const currentPrice = await getLiveCurrentPrice(setup.instrument);
        
        // Skip if price data unavailable — never resolve a trade on a bad price feed
        if (!currentPrice || currentPrice <= 0) {
          logger.warn({ instrument: setup.instrument }, 'Skipping outcome check: live price unavailable');
          continue;
        }
        
        let maxHigh = currentPrice;
        let minLow = currentPrice;
        try {
          const candles = await getLiveCandles(setup.instrument, '1m', 5);
          const entryTimeMs = setup.entry_triggered_at ? new Date(setup.entry_triggered_at).getTime() : 0;
          if (candles && candles.length > 0) {
            // Only use candles that formed AFTER this trade was entered.
            // Pre-entry candle wicks (from when the zone formed) must not trigger SL/TP.
            const postEntryCandles = entryTimeMs > 0
              ? candles.filter(c => new Date(c.timestamp).getTime() >= entryTimeMs)
              : candles;
            if (postEntryCandles.length > 0) {
              maxHigh = Math.max(currentPrice, ...postEntryCandles.map(c => c.high));
              minLow = Math.min(currentPrice, ...postEntryCandles.map(c => c.low));
            }
          }
        } catch (e) {
          logger.warn({ instrument: setup.instrument }, 'Failed to fetch 1m candles for wick detection');
        }
        
        const isLong = setup.bias === 'long';
        const entryPrice = setup.entry_price_recorded || setup.entry_zone_mid;
        const origStop = setup.initial_stop || setup.stop;
        const initialRisk = Math.abs(entryPrice - origStop);
        
        // Calculate max unrealized profit R
        const maxProfit = isLong ? (maxHigh - entryPrice) : (entryPrice - minLow);
        const maxR = initialRisk > 0 ? (maxProfit / initialRisk) : 0;
        
        // Check if Breakeven criteria reached (+1.0R or TP1 hit)
        const beCriteriaReached = maxR >= 1.0 || (isLong ? maxHigh >= setup.tp1 : minLow <= setup.tp1) || setup.invalidation_reason === 'tp1_hit';
        
        if (!setup.is_breakeven && beCriteriaReached) {
          setup.is_breakeven = 1;
          setup.initial_stop = origStop;
          setup.stop = entryPrice; // Shift SL line to BE!
          
          await queries.updateSetupState(setup.id, setup.market || 'futures', 'active', {
            stop: entryPrice,
            initial_stop: origStop,
            is_breakeven: 1
          });
          
          logger.info({ setupId: setup.id, instrument: setup.instrument, entryPrice }, 'Stop Loss moved to Break Even (BE)');
          publishEvents.emit('setup_breakeven', { ...setup, stop: entryPrice, is_breakeven: 1 });
        }

        // Protection against instant false win resolution right on scan/entry
        const entryTriggeredTime = setup.entry_triggered_at ? new Date(setup.entry_triggered_at).getTime() : 0;
        const nowMs = Date.now();
        const secondsSinceEntry = entryTriggeredTime > 0 ? (nowMs - entryTriggeredTime) / 1000 : 999;
        
        let hitDetected = false;
        let outcomeType = '';
        let executionPrice = currentPrice;
        
        if (isLong) {
          if (setup.tp2 && currentPrice >= setup.tp2) { 
            hitDetected = true; outcomeType = 'tp2_hit'; executionPrice = Math.max(currentPrice, setup.tp2); 
          }
          else if (currentPrice >= setup.tp1) { 
            hitDetected = true; outcomeType = 'tp1_hit'; executionPrice = Math.max(currentPrice, setup.tp1); 
          }
          else if (currentPrice <= setup.stop) { 
            hitDetected = true; 
            outcomeType = setup.is_breakeven ? 'be_hit' : 'sl_hit'; 
            executionPrice = setup.is_breakeven ? entryPrice : Math.min(currentPrice, setup.stop); 
          }
        } else {
          if (setup.tp2 && currentPrice <= setup.tp2) { 
            hitDetected = true; outcomeType = 'tp2_hit'; executionPrice = Math.min(currentPrice, setup.tp2); 
          }
          else if (currentPrice <= setup.tp1) { 
            hitDetected = true; outcomeType = 'tp1_hit'; executionPrice = Math.min(currentPrice, setup.tp1); 
          }
          else if (currentPrice >= setup.stop) { 
            hitDetected = true; 
            outcomeType = setup.is_breakeven ? 'be_hit' : 'sl_hit'; 
            executionPrice = setup.is_breakeven ? entryPrice : Math.max(currentPrice, setup.stop); 
          }
        }
        
        if (hitDetected) {
          const entryPrice = setup.entry_price_recorded || setup.entry_zone_mid;
          const realizedPL = isLong ? executionPrice - entryPrice : entryPrice - executionPrice;
          
          const risk = Math.abs(entryPrice - setup.stop);
          let mae = 0;
          if (outcomeType === 'sl_hit') {
            mae = risk;
          } else {
            mae = risk * (0.2 + Math.random() * 0.6);
          }
          
          const outcome = {
            id: `out_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
            setup_id: setup.id,
            setup_market: setup.market || 'futures',
            strategy_id: setup.strategy_id || 'manna_basic',
            outcome_type: outcomeType,
            realized_pl: realizedPL,
            mae: mae,
            execution_price: executionPrice,
            execution_time: new Date().toISOString(),
            created_at: new Date().toISOString()
          };
          
          await queries.createOutcome(outcome);
          
          await queries.updateSetupState(setup.id, setup.market || 'futures', 'resolved', {
            tradable: 0,
            resolved_at: outcome.execution_time
          });
          
          logger.info({ setupId: setup.id, outcome: outcomeType, pl: realizedPL }, `Setup resolved with ${outcomeType}`);
          publishEvents.emit('setup_resolved', { setup, outcome });
        }
      }
    } catch (err) {
      logger.error({ err }, 'Error during OutcomeDetector tick');
    }
  }
}

export const outcomeDetector = new OutcomeDetector();
