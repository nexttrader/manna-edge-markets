import { EventEmitter } from 'events';
import * as queries from '../db/queries';
import { KillzoneInfo, CandidateSetup, EdgeSetup, RunMode } from '../discovery/types';
import { getCurrentPrice } from '../discovery/mock-data';
import { getLatestCandles } from '../discovery/mock-data';
import { computeATR } from '../discovery/atr';
import { createLogger } from '../telemetry/logger';
import { metrics } from '../telemetry/metrics';
import { revalidateSetup } from './revalidation';
import { dedupeAndSelect } from './dedupe';
import { circuitBreaker } from './circuit-breaker';
import { hawkeyeService } from '../hawkeye/hawkeye-service';
import { v4 as uuidv4 } from 'uuid';

const logger = createLogger('PublishGate');
export const publishEvents = new EventEmitter();

export interface PublishGateResult {
  success: boolean;
  runId: string;
  mode: RunMode;
  stats: { created: number, invalidated: number, preserved: number, discarded: number };
  errors: string[];
}

export async function executePublishRun(
  killzone: KillzoneInfo,
  futuresCandidates: CandidateSetup[],
  forexCandidates: CandidateSetup[],
  mode: RunMode,
  triggerType: 'scheduled' | 'manual' = 'scheduled'
): Promise<PublishGateResult> {
  const runId = `run_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  let actualMode = mode;
  if (circuitBreaker.isTripped()) {
    logger.warn('Circuit breaker tripped. Forcing dry_run mode.');
    actualMode = 'dry_run';
  }
  
  const stats = { created: 0, invalidated: 0, preserved: 0, discarded: 0 };
  const errors: string[] = [];
  
  // Create the publish run record
  await queries.createPublishRun({
    id: runId,
    run_timestamp: new Date().toISOString(),
    killzone: killzone.killzone,
    run_mode: actualMode,
    run_state: 'running',
    trigger_type: triggerType,
    created_at: new Date().toISOString()
  });
  
  try {
    const markets = [
      { name: 'futures', candidates: futuresCandidates },
      { name: 'forex', candidates: forexCandidates }
    ];
    
    for (const market of markets) {
      const activeSetups = await queries.getActiveSetups(market.name);

      // Build list of unique (instrument, strategy_id) keys
      const keysSet = new Set<string>();
      for (const c of market.candidates) {
        const strat = c.strategy_id || 'manna_basic';
        keysSet.add(`${c.instrument}::${strat}`);
      }
      for (const s of activeSetups) {
        const strat = s.strategy_id || 'manna_basic';
        keysSet.add(`${s.instrument}::${strat}`);
      }

      for (const key of Array.from(keysSet)) {
        const [instrument, strategyId] = key.split('::');

        const instCandidates = market.candidates.filter(
          c => c.instrument === instrument && (c.strategy_id || 'manna_basic') === strategyId
        );
        const existingSetup = activeSetups.find(
          s => s.instrument === instrument && (s.strategy_id || 'manna_basic') === strategyId
        ) || null;
        
        const currentPrice = getCurrentPrice(instrument);
        const candles = getLatestCandles(instrument, '15m', 20);
        const atr14 = computeATR(candles, 14);
        
        let effectiveExisting = existingSetup;
        
        // 1. Revalidate existing setup
        if (existingSetup) {
          const revalResult = revalidateSetup(existingSetup, currentPrice, atr14);
          if (!revalResult.isValid) {
            await queries.updateSetupState(existingSetup.id, market.name, 'invalidated', {
              invalidation_reason: revalResult.reason,
              invalidation_detail: revalResult.detail,
              tradable: 0,
              resolved_at: new Date().toISOString()
            });
            
            await hawkeyeService.logInvalidation({
              setupId: existingSetup.id,
              instrument: existingSetup.instrument,
              setupMarket: market.name,
              runId: runId,
              reasonCode: revalResult.reason || 'unknown',
              detail: revalResult.detail || '',
              previousState: existingSetup.signal_state,
              newState: 'invalidated',
              createdBy: 'publish_gate'
            });
            
            stats.invalidated++;
            publishEvents.emit('setup_invalidated', { setupId: existingSetup.id, reason: revalResult.reason });
            effectiveExisting = null; 
          }
        }
        
        // 2. Dedupe and Select
        const dedupeResult = dedupeAndSelect(effectiveExisting, instCandidates, currentPrice, atr14);
        
        for (const inv of dedupeResult.invalidations) {
          if (inv.reason === 'discarded_duplicate') {
             stats.discarded++;
          } else if (effectiveExisting && inv.setupId === effectiveExisting.id) {
             await queries.updateSetupState(effectiveExisting.id, market.name, 'superseded', {
               superseded: 1,
               tradable: 0,
               invalidation_reason: inv.reason,
               invalidation_detail: inv.detail,
               resolved_at: new Date().toISOString()
             });
             
             await hawkeyeService.logInvalidation({
               setupId: effectiveExisting.id,
               instrument: effectiveExisting.instrument,
               setupMarket: market.name,
               runId: runId,
               reasonCode: inv.reason,
               detail: inv.detail,
               previousState: effectiveExisting.signal_state,
               newState: 'superseded',
               createdBy: 'publish_gate'
             });
             stats.invalidated++;
             publishEvents.emit('setup_invalidated', { setupId: effectiveExisting.id, reason: inv.reason });
          }
        }
        
        // 3. Apply Action
        if (dedupeResult.action === 'preserve') {
          stats.preserved++;
        } else if ((dedupeResult.action === 'replace' || dedupeResult.action === 'insert') && dedupeResult.selectedCandidate) {
          const newSetup: EdgeSetup = {
            id: uuidv4(),
            instrument: dedupeResult.selectedCandidate.instrument,
            market: market.name,
            created_at: new Date().toISOString(),
            created_by_run: runId,
            killzone_origin: killzone.killzone,
            killzone_origin_at: killzone.boundaryET,
            bias: dedupeResult.selectedCandidate.bias,
            entry_zone_low: dedupeResult.selectedCandidate.entry_zone_low,
            entry_zone_high: dedupeResult.selectedCandidate.entry_zone_high,
            entry_zone_mid: dedupeResult.selectedCandidate.entry_zone_mid,
            stop: dedupeResult.selectedCandidate.stop,
            tp1: dedupeResult.selectedCandidate.tp1,
            tp2: dedupeResult.selectedCandidate.tp2,
            r_multiple_1: dedupeResult.selectedCandidate.r_multiple_1,
            r_multiple_2: dedupeResult.selectedCandidate.r_multiple_2,
            signal_state: 'awaiting_entry',
            superseded: 0,
            tradable: 1,
            conviction_score: dedupeResult.selectedCandidate.conviction_score,
            liquidity_score: dedupeResult.selectedCandidate.liquidity_score,
            strategy_id: dedupeResult.selectedCandidate.strategy_id || 'manna_basic',
            strategy_tier: dedupeResult.selectedCandidate.strategy_tier || 'basic',
            metadata: dedupeResult.selectedCandidate.metadata
          };
          await queries.insertSetup(newSetup, market.name);
          stats.created++;
          publishEvents.emit('setup_created', newSetup);
        }
      }
    }
    
    // CONSTRAINT CHECK: Ensure max 1 active/non-superseded per (instrument + strategy)
    for (const market of markets) {
      const checkActive = await queries.getActiveSetups(market.name);
      const counts: Record<string, number> = {};
      for (const s of checkActive) {
        const key = `${s.instrument}_${s.strategy_id || 'manna_basic'}`;
        counts[key] = (counts[key] || 0) + 1;
        if (counts[key] > 1) {
          throw new Error(`Constraint violated: Multiple active setups for ${key} in ${market.name}`);
        }
      }
    }
    
    if (actualMode === 'dry_run') {
      throw new Error('DRY_RUN_ROLLBACK');
    }

    // Success — update run record
    await queries.updatePublishRun(runId, {
      run_state: 'committed',
      setups_created: stats.created,
      setups_invalidated: stats.invalidated,
      setups_preserved: stats.preserved,
      summary_json: JSON.stringify(stats)
    });
    metrics.increment('runs_total');
    metrics.increment('runs_success');
    
    logger.info({ runId, stats }, 'Publish run committed successfully');
    publishEvents.emit('run_complete', { runId, stats, mode: actualMode });
    
    return { success: true, runId, mode: actualMode, stats, errors };
    
  } catch (err: any) {
    if (err.message === 'DRY_RUN_ROLLBACK') {
      await queries.updatePublishRun(runId, {
        run_state: 'dry_run',
        setups_created: stats.created,
        setups_invalidated: stats.invalidated,
        setups_preserved: stats.preserved,
        summary_json: JSON.stringify(stats)
      });
      metrics.increment('runs_total');
      metrics.increment('runs_dry_run');
      logger.info({ runId, stats }, 'Dry run completed');
      return { success: true, runId, mode: actualMode, stats, errors };
    } else {
      errors.push(err.message);
      await queries.updatePublishRun(runId, {
        run_state: 'failed',
        error_detail: err.message,
        summary_json: JSON.stringify(stats)
      });
      metrics.increment('runs_total');
      metrics.increment('runs_failed');
      logger.error({ err, runId }, 'Publish run failed');
      return { success: false, runId, mode: actualMode, stats, errors };
    }
  }
}
