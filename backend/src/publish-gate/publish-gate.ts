import { EventEmitter } from 'events';
import * as queries from '../db/queries';
import { KillzoneInfo, CandidateSetup, EdgeSetup, RunMode } from '../discovery/types';
import { getLiveCurrentPrice, getLiveCandles } from '../discovery/yahoo-provider';
import { computeATR } from '../discovery/atr';
import { createLogger } from '../telemetry/logger';
import { metrics } from '../telemetry/metrics';
import { revalidateSetup } from './revalidation';
import { dedupeAndSelect } from './dedupe';
import { circuitBreaker } from './circuit-breaker';
import { hawkeyeService } from '../hawkeye/hawkeye-service';
import { saveSignalsSnapshot } from '../db/signal-snapshot-restore';
import { v4 as uuidv4 } from 'uuid';

const logger = createLogger('PublishGate');
export const publishEvents = new EventEmitter();
publishEvents.setMaxListeners(100);

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
    // ── EUR/USD LEADER PRE-PUBLISH GATE ──
    // Absolute guarantee: Drop any Dollar follower setup that contradicts EUR/USD
    let filteredForexCandidates = [...forexCandidates];
    const eurInCandidates = filteredForexCandidates.find(c => c.instrument.toUpperCase() === 'EUR/USD');
    let eurLeaderBias = eurInCandidates ? eurInCandidates.bias : null;

    if (!eurLeaderBias) {
      const activeForex = await queries.getActiveSetups('forex');
      const activeEur = activeForex.find(s => s.instrument.toUpperCase() === 'EUR/USD');
      if (activeEur) eurLeaderBias = activeEur.bias;
    }

    if (eurLeaderBias) {
      const positivePairs = ['GBP/USD', 'AUD/USD', 'NZD/USD'];
      const inversePairs = ['USD/JPY', 'USD/CAD', 'USD/CHF'];
      filteredForexCandidates = filteredForexCandidates.filter(c => {
        const inst = c.instrument.toUpperCase();
        if (positivePairs.includes(inst) && c.bias !== eurLeaderBias) {
          logger.warn({ instrument: c.instrument, bias: c.bias, eurLeaderBias }, 'PublishGate Pre-Insertion: Blocking divergent positive Dollar pair candidate.');
          return false;
        }
        if (inversePairs.includes(inst) && c.bias === eurLeaderBias) {
          logger.warn({ instrument: c.instrument, bias: c.bias, eurLeaderBias }, 'PublishGate Pre-Insertion: Blocking divergent inverse Dollar pair candidate.');
          return false;
        }
        return true;
      });
    }

    const markets = [
      { name: 'futures', candidates: futuresCandidates },
      { name: 'forex', candidates: filteredForexCandidates }
    ];
    
    for (const market of markets) {
      const activeSetups = await queries.getActiveSetups(market.name);

      // Build list of unique (instrument, strategy_id) keys
      const keysSet = new Set<string>();
      for (const c of market.candidates) {
        const strat = c.strategy_id || 'sentinel_v2';
        keysSet.add(`${c.instrument}::${strat}`);
      }
      for (const s of activeSetups) {
        const strat = s.strategy_id || 'sentinel_v2';
        keysSet.add(`${s.instrument}::${strat}`);
      }

      for (const key of Array.from(keysSet)) {
        const [instrument, strategyId] = key.split('::');

        const instCandidates = market.candidates.filter(
          c => c.instrument === instrument && (c.strategy_id || 'sentinel_v2') === strategyId
        );
        const existingSetup = activeSetups.find(
          s => s.instrument === instrument && (s.strategy_id || 'sentinel_v2') === strategyId
        ) || null;
        
        const currentPrice = await getLiveCurrentPrice(instrument);
        const candles = await getLiveCandles(instrument, '15m', 20);
        const atr14 = candles.length > 0 ? computeATR(candles, 14) : 3.0;
        
        let effectiveExisting = existingSetup;
        
        // 1. Revalidate existing setup (ONLY when valid live price > 0 is fetched)
        if (existingSetup && currentPrice > 0) {
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
            publishEvents.emit('setup_invalidated', { setupId: existingSetup.id, reason: revalResult.reason, setup: existingSetup, superseded: false });
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
             // superseded=true → telegram will send MANAGE cancel message before the new signal fires
             publishEvents.emit('setup_invalidated', { setupId: effectiveExisting.id, reason: inv.reason, setup: effectiveExisting, superseded: true });
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
            strategy_id: dedupeResult.selectedCandidate.strategy_id || 'sentinel_v2',
            strategy_tier: dedupeResult.selectedCandidate.strategy_tier || 'basic',
            metadata: dedupeResult.selectedCandidate.metadata
          };
          await queries.insertSetup(newSetup, market.name);
          stats.created++;
          publishEvents.emit('setup_created', newSetup);
        }
      }
    }
    
    // CONSTRAINT RECONCILIATION: Ensure max 1 active setup per (instrument + strategy)
    for (const market of markets) {
      const checkActive = await queries.getActiveSetups(market.name);
      const groups: Record<string, typeof checkActive> = {};
      for (const s of checkActive) {
        const key = `${s.instrument}_${s.strategy_id || 'sentinel_v2'}`;
        if (!groups[key]) groups[key] = [];
        groups[key].push(s);
      }

      for (const [key, setupsList] of Object.entries(groups)) {
        if (setupsList.length > 1) {
          logger.warn({ key, count: setupsList.length }, 'Reconciling multiple active setups for key');
          setupsList.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
          const toSupersede = setupsList.slice(1);
          for (const dup of toSupersede) {
            await queries.updateSetupState(dup.id, market.name, 'superseded', {
              superseded: 1,
              tradable: 0,
              invalidation_reason: 'duplicate_reconciled',
              invalidation_detail: 'Automatically superseded by PublishGate constraint reconciler',
              resolved_at: new Date().toISOString()
            });
            stats.invalidated++;
          }
        }
      }
    }

    // ── CORRELATED OUTLIER CONVICTION PENALTY PASS (FUTURES INDICES) ──
    for (const marketName of ['futures']) {
      try {
        const activeSetups = await queries.getActiveSetups(marketName);
        const groups: Record<string, typeof activeSetups> = {};
        groups['indices'] = activeSetups.filter(s => ['ES', 'NQ', 'YM', 'RTY'].includes(s.instrument.toUpperCase()));

        for (const [groupName, groupSetups] of Object.entries(groups)) {
          if (groupSetups.length < 2) continue;

          const normalizedLongCount = groupSetups.filter(s => {
            const inst = s.instrument.toUpperCase();
            if (inst === 'USD/JPY' || inst === 'USD/CAD') return s.bias === 'short';
            return s.bias === 'long';
          }).length;

          const normalizedShortCount = groupSetups.length - normalizedLongCount;
          if (normalizedLongCount === normalizedShortCount) continue;

          const majorityNormalizedBias = normalizedLongCount > normalizedShortCount ? 'long' : 'short';

          for (const setup of groupSetups) {
            const inst = setup.instrument.toUpperCase();
            const setupNormalizedBias = (inst === 'USD/JPY' || inst === 'USD/CAD') ? (setup.bias === 'short' ? 'long' : 'short') : setup.bias;
            const isOutlier = setupNormalizedBias !== majorityNormalizedBias;

            let metaObj: any = {};
            try { metaObj = typeof setup.metadata === 'string' ? JSON.parse(setup.metadata) : (setup.metadata || {}); } catch {}

            if (isOutlier) {
              const groupLabel = groupName === 'indices' ? 'Index Futures (ES, NQ, YM, RTY)' : 'Dollar pairs (EUR/USD, GBP/USD, USD/JPY, USD/CAD)';
              const plainNote = `Conviction score reduced by 15%: This ${setup.bias.toUpperCase()} signal does not align with the general ${majorityNormalizedBias.toUpperCase()} direction of other correlated ${groupLabel}.`;
              
              if (!metaObj.correlation_penalty_applied) {
                const baseScore = setup.conviction_score || 85;
                const penalizedScore = Math.max(60, Number((baseScore - 15).toFixed(1)));

                metaObj.correlation_penalty_applied = true;
                metaObj.correlation_note = plainNote;

                await queries.updateSetupState(setup.id, marketName, setup.signal_state, {
                  conviction_score: penalizedScore,
                  metadata: JSON.stringify(metaObj)
                });
              }
            } else if (metaObj.correlation_penalty_applied) {
              delete metaObj.correlation_penalty_applied;
              delete metaObj.correlation_note;
              await queries.updateSetupState(setup.id, marketName, setup.signal_state, {
                metadata: JSON.stringify(metaObj)
              });
            }
          }
        }
      } catch (err: any) {
        logger.error({ err: err?.message || String(err) }, 'Error in correlated outlier conviction penalty pass');
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
    
    try {
      const activeFutures = await queries.getActiveSetups('futures');
      const activeForex = await queries.getActiveSetups('forex');
      await saveSignalsSnapshot([...activeFutures, ...activeForex]);
    } catch {}

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
