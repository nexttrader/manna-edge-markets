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
    this.evaluateAllSetups(true).catch(err => {
      logger.error({ err }, 'Startup OutcomeDetector evaluation failed');
    });
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
    if (!isMarketOpen()) {
      logger.debug('Skipping OutcomeDetector tick: Market is closed for the weekend');
      return;
    }
    await this.evaluateAllSetups(false);
  }

  public async evaluateAllSetups(forceCheck: boolean = false): Promise<void> {
    try {
      if (!forceCheck && !isMarketOpen()) {
        return;
      }

      // 1. PROCESS AWAITING_ENTRY SETUPS — STATE-SYNC ONLY
      // OutcomeDetector must NOT evaluate TP/SL/BE for setups that have never been
      // entered. Doing so caused trades to open and close in the same 15-second tick,
      // appearing as "instantly resolved" or "closed at break even" with 0–1 bar held.
      // Entry fills are the exclusive responsibility of LifecycleSync. Once a setup
      // transitions to 'active', the block below (section 2) handles outcome detection.
      const pendingSetups = await queries.getSetupsByState('awaiting_entry');
      for (const setup of pendingSetups) {
        // Pre-check only: if an outcome already exists (e.g. from a previous run or
        // manual intervention), sync the setup state to 'resolved' so it doesn't linger.
        const existingOutcomes = await queries.getOutcomesBySetup(setup.id);
        if (existingOutcomes.length > 0) {
          await queries.updateSetupState(setup.id, setup.market || 'futures', 'resolved', {
            tradable: 0,
            resolved_at: existingOutcomes[0].created_at || new Date().toISOString(),
            invalidation_reason: existingOutcomes[0].outcome_type
          });
          logger.info({ setupId: setup.id }, 'awaiting_entry setup synced to resolved: outcome already existed');
        }
        // Do NOT evaluate price against TP/SL/BE here. No outcome creation for pending setups.
      }

      // 2. PROCESS ACTIVE SETUPS
      const activeSetups = await queries.getSetupsByState('active');
      
      for (const setup of activeSetups) {
        // Pre-check: Sync state if an outcome already exists for this setup
        const existingOutcomes = await queries.getOutcomesBySetup(setup.id);
        if (existingOutcomes.length > 0) {
          await queries.updateSetupState(setup.id, setup.market || 'futures', 'resolved', {
            tradable: 0,
            resolved_at: existingOutcomes[0].created_at || new Date().toISOString(),
            invalidation_reason: existingOutcomes[0].outcome_type
          });
          continue;
        }

        let currentPrice = await getLiveCurrentPrice(setup.instrument);
        if (!currentPrice || currentPrice <= 0) {
          const createdTimeMs = setup.created_at ? new Date(setup.created_at).getTime() : 0;
          const ageHours = createdTimeMs > 0 ? (Date.now() - createdTimeMs) / 3600000 : 0;
          if (ageHours > 12) {
            currentPrice = setup.entry_price_recorded || setup.entry_zone_mid;
          } else {
            continue;
          }
        }
        
        let maxHigh = currentPrice;
        let minLow = currentPrice;
        try {
          const candles = await getLiveCandles(setup.instrument, '1m', 5);
          const entryTimeMs = setup.entry_triggered_at ? new Date(setup.entry_triggered_at).getTime() : 0;
          if (candles && candles.length > 0) {
            const postEntryCandles = entryTimeMs > 0
              ? candles.filter(c => new Date(c.timestamp).getTime() >= entryTimeMs)
              : candles;
            if (postEntryCandles.length > 0) {
              maxHigh = Math.max(currentPrice, ...postEntryCandles.map(c => c.high));
              minLow = Math.min(currentPrice, ...postEntryCandles.map(c => c.low));
            }
          }
        } catch { /* ignore candle fetch error */ }
        
        const isLong = (setup.bias || 'long').toLowerCase() === 'long';
        const entryPrice = setup.entry_price_recorded || setup.entry_zone_mid;
        const origStop = setup.initial_stop || setup.stop;
        let initialRisk = Math.abs(entryPrice - origStop);
        // Infer risk from TP1 if stop moved to BE or initial_stop is missing
        if (initialRisk < 0.00001 && setup.tp1) {
          initialRisk = Math.abs(setup.tp1 - entryPrice) / (setup.r_multiple_1 || 2.0);
        }
        if (initialRisk < 0.00001) initialRisk = Math.abs(entryPrice * 0.005);
        const tp1 = setup.tp1 || (isLong ? (entryPrice + initialRisk * 2.0) : (entryPrice - initialRisk * 2.0));
        const tp2 = setup.tp2 || (isLong ? (entryPrice + initialRisk * 3.0) : (entryPrice - initialRisk * 3.0));
        
        const maxProfit = isLong ? (maxHigh - entryPrice) : (entryPrice - minLow);
        const maxR = initialRisk > 0 ? (maxProfit / initialRisk) : 0;
        
        const beCriteriaReached = maxR >= 1.0;
        if (!setup.is_breakeven && beCriteriaReached) {
          setup.is_breakeven = 1;
          setup.initial_stop = origStop;
          setup.stop = entryPrice;
          
          await queries.updateSetupState(setup.id, setup.market || 'futures', 'active', {
            stop: entryPrice,
            initial_stop: origStop,
            is_breakeven: 1
          });
          
          logger.info({ setupId: setup.id, instrument: setup.instrument, entryPrice }, 'Stop Loss moved to Break Even (BE) at +1.0R Open PnL');
          publishEvents.emit('setup_breakeven', { ...setup, stop: entryPrice, is_breakeven: 1 });
        }
        
        let hitDetected = false;
        let outcomeType = '';
        let executionPrice = currentPrice;
        
        // Determine if stop is effectively at break-even.
        // Only use the explicit is_breakeven flag set by the BE-move logic above.
        // The old proximity check (stop within 0.01% of entry) was incorrectly flagging
        // new setups with tight stops as BE — causing SL hits to log as 0R (Break Even)
        // instead of -1R (Stop Loss).
        const isEffectivelyBEActive = Boolean(setup.is_breakeven);
        const targetR1Active = setup.r_multiple_1 || 2.0;
        const targetR2Active = setup.r_multiple_2 || 3.0;

        if (isLong) {
          if (currentPrice >= tp2 || maxHigh >= tp2 || maxR >= targetR2Active) {
            hitDetected = true; outcomeType = 'tp2_hit'; executionPrice = Math.max(currentPrice, tp2);
          } else if (currentPrice >= tp1 || maxHigh >= tp1 || maxR >= targetR1Active) {
            hitDetected = true; outcomeType = 'tp1_hit'; executionPrice = Math.max(currentPrice, tp1);
          } else if (currentPrice <= setup.stop || minLow <= setup.stop) {
            hitDetected = true;
            outcomeType = isEffectivelyBEActive ? 'be_hit' : 'sl_hit';
            executionPrice = isEffectivelyBEActive ? entryPrice : Math.min(currentPrice, setup.stop);
          }
        } else {
          if (currentPrice <= tp2 || minLow <= tp2 || maxR >= targetR2Active) {
            hitDetected = true; outcomeType = 'tp2_hit'; executionPrice = Math.min(currentPrice, tp2);
          } else if (currentPrice <= tp1 || minLow <= tp1 || maxR >= targetR1Active) {
            hitDetected = true; outcomeType = 'tp1_hit'; executionPrice = Math.min(currentPrice, tp1);
          } else if (currentPrice >= setup.stop || maxHigh >= setup.stop) {
            hitDetected = true;
            outcomeType = isEffectivelyBEActive ? 'be_hit' : 'sl_hit';
            executionPrice = isEffectivelyBEActive ? entryPrice : Math.max(currentPrice, setup.stop);
          }
        }
        
        if (hitDetected) {
          // Hard-cap: SL always -1R, BE always 0R, never more or less
          const realizedPL = outcomeType === 'tp2_hit'
            ? (setup.r_multiple_2 || 3.0)
            : outcomeType === 'tp1_hit'
              ? (setup.r_multiple_1 || 2.0)
              : outcomeType === 'be_hit'
                ? 0.0
                : -1.0; // sl_hit hard-capped at -1.0R
          
          const risk = Math.abs(entryPrice - origStop);
          let mae = outcomeType === 'sl_hit' ? risk : risk * 0.3;
          let mfe = outcomeType === 'tp2_hit' ? (isLong ? (tp2 - entryPrice) : (entryPrice - tp2)) : outcomeType === 'tp1_hit' ? (isLong ? (tp1 - entryPrice) : (entryPrice - tp1)) : (maxHigh - entryPrice);
          const entryTime = setup.entry_triggered_at ? new Date(setup.entry_triggered_at).getTime() : new Date().getTime();
          const exitTime = new Date().getTime();
          const durationMin = Number(Math.max(0.1, (exitTime - entryTime) / 60000).toFixed(1));
          const barsHeld = Math.max(1, Math.round(durationMin));
          const exitReason = outcomeType === 'tp2_hit' ? 'TP2' : outcomeType === 'tp1_hit' ? 'TP1' : outcomeType === 'sl_hit' ? 'Stop Loss' : outcomeType === 'be_hit' ? 'Break Even' : 'Manual Exit';

          const outcome = {
            id: `out_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
            setup_id: setup.id,
            setup_market: setup.market || 'futures',
            strategy_id: setup.strategy_id || 'sentinel_v2',
            outcome_type: outcomeType,
            realized_pl: realizedPL,
            mae: Number(mae.toFixed(4)),
            mfe: Number(mfe.toFixed(4)),
            highest_price: maxHigh,
            lowest_price: minLow,
            bars_held: barsHeld,
            duration_min: durationMin,
            exit_reason: exitReason,
            execution_price: executionPrice,
            execution_time: new Date().toISOString(),
            created_at: new Date().toISOString()
          };
          
          await queries.createOutcome(outcome);
          
          if (outcomeType === 'tp1_hit') {
            await queries.updateSetupState(setup.id, setup.market || 'futures', 'runner', {
              stop: entryPrice,
              initial_stop: origStop,
              is_breakeven: 1,
              invalidation_reason: 'tp1_hit'
            });
            logger.info({ setupId: setup.id, instrument: setup.instrument }, 'TP1 (2R) hit: Logged 2R, moved to RUNNERS tab');
            publishEvents.emit('setup_runner_started', { setup: { ...setup, signal_state: 'runner', stop: entryPrice, is_breakeven: 1 }, outcome });
          } else {
            await queries.updateSetupState(setup.id, setup.market || 'futures', 'resolved', {
              tradable: 0,
              resolved_at: outcome.execution_time,
              invalidation_reason: outcomeType
            });
            logger.info({ setupId: setup.id, outcome: outcomeType, pl: realizedPL }, `Setup resolved with ${outcomeType}`);
            publishEvents.emit('setup_resolved', { setup, outcome });
          }
        }
      }

      // 3. PROCESS RUNNER SETUPS
      const runnerSetups = await queries.getSetupsByState('runner');
      
      for (const setup of runnerSetups) {
        const currentPrice = await getLiveCurrentPrice(setup.instrument);
        if (!currentPrice || currentPrice <= 0) continue;
        
        let maxHigh = currentPrice;
        let minLow = currentPrice;
        try {
          const candles = await getLiveCandles(setup.instrument, '1m', 5);
          if (candles && candles.length > 0) {
            maxHigh = Math.max(currentPrice, ...candles.map(c => c.high));
            minLow = Math.min(currentPrice, ...candles.map(c => c.low));
          }
        } catch { /* ignore candle fetch error */ }

        const isLong = (setup.bias || 'long').toLowerCase() === 'long';
        const entryPrice = setup.entry_price_recorded || setup.entry_zone_mid;
        const origStop = setup.initial_stop || setup.stop;
        const risk = Math.abs(entryPrice - origStop);
        const tp2Target = setup.tp2 || (isLong ? (entryPrice + risk * 3.0) : (entryPrice - risk * 3.0));
        
        let tp2Hit = false;
        let beHit = false;
        
        if (isLong) {
          if (currentPrice >= tp2Target || maxHigh >= tp2Target) tp2Hit = true;
          else if (currentPrice <= setup.stop || minLow <= setup.stop) beHit = true;
        } else {
          if (currentPrice <= tp2Target || minLow <= tp2Target) tp2Hit = true;
          else if (currentPrice >= setup.stop || maxHigh >= setup.stop) beHit = true;
        }
        
        if (tp2Hit) {
          const execPrice = isLong ? Math.max(currentPrice, tp2Target) : Math.min(currentPrice, tp2Target);
          const newRealizedR = setup.r_multiple_2 || 3.0;
          
          await queries.updateOutcomeBySetupId(setup.id, {
            outcome_type: 'tp2_hit',
            execution_price: execPrice,
            execution_time: new Date().toISOString(),
            realized_pl: newRealizedR,
            was_runner: 1
          });
          
          await queries.updateSetupState(setup.id, setup.market || 'futures', 'resolved', {
            tradable: 0,
            resolved_at: new Date().toISOString(),
            invalidation_reason: 'tp2_hit'
          });
          
          logger.info({ setupId: setup.id, instrument: setup.instrument, newRealizedR }, 'Runner reached TP2 (3R)! Analytics upgraded to 3R');
          publishEvents.emit('setup_resolved', { setup, outcome: { setup_id: setup.id, outcome_type: 'tp2_hit', realized_pl: newRealizedR, was_runner: 1 } });
        } else if (beHit) {
          await queries.updateSetupState(setup.id, setup.market || 'futures', 'resolved', {
            tradable: 0,
            resolved_at: new Date().toISOString(),
            invalidation_reason: 'be_hit'
          });
          
          logger.info({ setupId: setup.id, instrument: setup.instrument }, 'Runner retraced to Break Even after TP1. Initial 2R log retained.');
          publishEvents.emit('setup_resolved', { setup, outcome: { setup_id: setup.id, outcome_type: 'tp1_hit', realized_pl: setup.r_multiple_1 || 2.0 } });
        }
      }
    } catch (err) {
      logger.error({ err }, 'Error during OutcomeDetector evaluateAllSetups');
    }
  }
}

export const outcomeDetector = new OutcomeDetector();
