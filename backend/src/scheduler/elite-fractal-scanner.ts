import cron = require('node-cron');
import { strategyRegistry } from '../discovery/strategies/strategy-registry';
import { getUnifiedMarketBiases } from '../discovery/bias-engine';
import { FUTURES_INSTRUMENTS, FOREX_INSTRUMENTS } from '../discovery/mock-data';
import { mapTimestampToKillzone, isForexMarketOpen, isFuturesMarketOpen } from './killzone-mapper';
import { queryDb } from '../db/database';
import { createLogger } from '../telemetry/logger';
import { getLiveQuoteDetails, getLiveCurrentPrice, getLiveCandles } from '../discovery/yahoo-provider';
import { calculateTradeExcursion } from '../analytics/candle-excursion-service';

const logger = createLogger('EliteFractalScanner');

let scanTask: cron.ScheduledTask | null = null;
let outcomeInterval: NodeJS.Timeout | null = null;
let isRunning = false;
let isEvaluatingOutcomes = false;

/**
 * Evaluates active and runner setups in superadmin_edge_setups against live prices.
 * - Detects TP1 (+2.0R), TP2 (+3.5R), Stop Loss (-1.0R), and Break-Even (0.0R).
 * - Computes MAE (Maximum Adverse Excursion) and MFE (Maximum Favorable Excursion).
 * - All Elite Fractal setups are SELL (short).
 * - When TP1 is hit, moves setup to 'runner' with stop moved to Break Even (entry_price_recorded).
 * - When TP2 is hit, marks setup as 'resolved' with outcome_type = 'tp2_hit'.
 * - When Stop is hit, marks setup as 'resolved' with outcome_type = 'sl_hit' (or 'be_hit' if at BE).
 */
export async function evaluateEliteFractalOutcomes(): Promise<{ evaluated: number; resolved: number }> {
  if (isEvaluatingOutcomes) {
    return { evaluated: 0, resolved: 0 };
  }
  isEvaluatingOutcomes = true;
  let evaluated = 0;
  let resolved = 0;

  try {
    const activeSetups = await queryDb<any>(
      `SELECT * FROM superadmin_edge_setups WHERE signal_state IN ('active', 'runner', 'awaiting_entry') AND superseded = 0`
    );

    if (!activeSetups || activeSetups.length === 0) {
      return { evaluated: 0, resolved: 0 };
    }

    evaluated = activeSetups.length;

    for (const setup of activeSetups) {
      // Auto-heal any lingering awaiting_entry setups to active with market execution
      if (setup.signal_state === 'awaiting_entry') {
        const fillTime = setup.created_at || new Date().toISOString();
        const execPrice = setup.entry_zone_mid;
        await queryDb(
          `UPDATE superadmin_edge_setups SET signal_state = 'active', entry_triggered_at = ?, entry_price_recorded = ?, initial_stop = COALESCE(initial_stop, ?) WHERE id = ?`,
          [fillTime, execPrice, setup.stop, setup.id]
        );
        setup.signal_state = 'active';
        setup.entry_triggered_at = fillTime;
        setup.entry_price_recorded = execPrice;
        setup.initial_stop = setup.stop;
        logger.info({ instrument: setup.instrument, execPrice }, 'EliteFractal: Synced pending setup to ACTIVE via market execution');
      }

      const quote = await getLiveQuoteDetails(setup.instrument);
      let currentPrice = quote?.price || await getLiveCurrentPrice(setup.instrument);
      if (!currentPrice || currentPrice <= 0) continue;

      const currentBid = quote?.bid || currentPrice;
      const currentAsk = quote?.ask || currentPrice;

      // Comprehensive multi-candle wick analysis across the entire life of the trade since entry
      let maxHigh = currentAsk;
      let minLow = currentBid;
      try {
        const entryTime = setup.entry_triggered_at || setup.created_at;
        const entryMs = entryTime ? new Date(entryTime).getTime() : (Date.now() - 3600000);
        const elapsedMinutes = Math.max(1, Math.ceil((Date.now() - entryMs) / 60000));

        let candles: any[] = [];
        if (elapsedMinutes <= 180) {
          // Up to 3 hours: fetch 1m candles
          const count = Math.min(200, Math.max(20, elapsedMinutes + 5));
          candles = await getLiveCandles(setup.instrument, '1m', count);
        } else if (elapsedMinutes <= 720) {
          // Up to 12 hours: fetch 5m candles
          const count = Math.min(150, Math.max(20, Math.ceil(elapsedMinutes / 5) + 5));
          candles = await getLiveCandles(setup.instrument, '5m', count);
        } else {
          // Over 12 hours: fetch 15m candles
          const count = Math.min(100, Math.max(20, Math.ceil(elapsedMinutes / 15) + 5));
          candles = await getLiveCandles(setup.instrument, '15m', count);
        }

        if (candles && candles.length > 0) {
          // Only include candles from entry time onward — not before!
          // Using entryMs - 60000 was pulling in pre-entry candle wicks which falsely triggered SL checks.
          const post = candles.filter((c: any) => new Date(c.timestamp).getTime() >= entryMs);
          const candlesToCheck = post.length > 0 ? post : candles.slice(-3); // fallback: last 3 candles only
          maxHigh = Math.max(currentAsk, ...candlesToCheck.map((c: any) => c.high));
          minLow = Math.min(currentBid, ...candlesToCheck.map((c: any) => c.low));
        }
      } catch {}

      const entryPrice = Number(setup.entry_price_recorded || setup.entry_zone_mid || 0);
      const isRunner = setup.signal_state === 'runner';
      const isBE = Boolean(setup.is_breakeven);
      const currentStop = Number(setup.stop || 0);

      // Robust initial stop & risk derivation:
      let initialStop = setup.initial_stop ? Number(setup.initial_stop) : null;
      let risk = (initialStop && Math.abs(entryPrice - initialStop) > 0)
        ? Math.abs(entryPrice - initialStop)
        : (currentStop && Math.abs(entryPrice - currentStop) > 0)
          ? Math.abs(entryPrice - currentStop)
          : 0;

      // If risk is 0 (because initial_stop was null and stop was moved to BE entryPrice):
      // Derive risk from TP1: tp1 = entryPrice - 2.0 * risk
      if (risk <= 0 && setup.tp1 && Math.abs(entryPrice - Number(setup.tp1)) > 0) {
        risk = Math.abs(entryPrice - Number(setup.tp1)) / (setup.r_multiple_1 || 2.0);
      }

      // If risk is still 0 (extreme edge case): fallback to standard tick/pip risk
      if (risk <= 0) {
        risk = setup.market === 'forex' ? 0.0020 : 10.0;
      }

      if (!initialStop || initialStop === entryPrice) {
        initialStop = Number((entryPrice + risk).toFixed(setup.market === 'forex' ? 5 : 2));
      }

      const tp1 = setup.tp1 ? Number(setup.tp1) : Number((entryPrice - 2.0 * risk).toFixed(setup.market === 'forex' ? 5 : 2));
      const tp2 = setup.tp2 ? Number(setup.tp2) : Number((entryPrice - (setup.r_multiple_2 || 3.5) * risk).toFixed(setup.market === 'forex' ? 5 : 2));
      const r1 = setup.r_multiple_1 || 2.0;
      const r2 = setup.r_multiple_2 || 3.5;

      // Identify lowest price reached (downward profit for short setups)
      const lowestObserved = Math.min(
        currentPrice > 0 ? currentPrice : Infinity,
        currentBid > 0 ? currentBid : Infinity,
        minLow > 0 ? minLow : Infinity
      );

      // Identify highest price reached (upward drawdown for short setups)
      const highestObserved = Math.max(
        currentPrice > 0 ? currentPrice : 0,
        currentAsk > 0 ? currentAsk : 0,
        maxHigh > 0 ? maxHigh : 0
      );

      // Unrealized R multiple reached (positive when lowest price dropped below entry)
      const maxExcursionR = (risk > 0 && lowestObserved !== Infinity)
        ? Number(((entryPrice - lowestObserved) / risk).toFixed(2))
        : 0;

      let hit = false;
      let outcomeType = '';
      let exitPrice = currentAsk;
      let realizedR = 0;

      // Bearish SELL setups:
      // Profit is downward: lowest price drops to/below TP2 / TP1 OR excursion R exceeds target R.
      // Loss is upward: highest price rises to/above Stop.

      // 1. TP2 HIT: applies to both active setups and runners!
      if (lowestObserved <= tp2 || maxExcursionR >= r2 || (setup.mfe && setup.mfe >= r2)) {
        hit = true;
        outcomeType = 'tp2_hit';
        exitPrice = tp2;
        realizedR = r2;
      }
      // 2. TP1 HIT: only for active setups that have not become runners yet
      else if (!isRunner && (lowestObserved <= tp1 || maxExcursionR >= r1 || (setup.mfe && setup.mfe >= r1))) {
        // First time hitting TP1 → Move to runner with Stop at BE!
        const now = new Date().toISOString();
        let metaObj: any = {};
        try { metaObj = JSON.parse(setup.metadata || '{}'); } catch {}
        metaObj.outcome_type = 'tp1_hit';
        metaObj.tp1_hit_at = now;
        metaObj.realized_r = r1;
        metaObj.mfe_r = Math.max(r1, maxExcursionR);

        // Lock stop at BE (entryPrice), preserve original stop in initial_stop
        await queryDb(
          `UPDATE superadmin_edge_setups SET signal_state = 'runner', stop = ?, initial_stop = COALESCE(initial_stop, ?), is_breakeven = 1, mfe = ?, metadata = ? WHERE id = ?`,
          [entryPrice, initialStop, Math.max(r1, maxExcursionR), JSON.stringify(metaObj), setup.id]
        );

        logger.info(
          { instrument: setup.instrument, tp1, entryPrice, initialStop },
          '🎯 EliteFractal: TP1 (+2.0R) hit! Moved to RUNNER with Stop at BE targeting TP2'
        );
        continue;
      }
      // 3. STOP LOSS / BREAKEVEN HIT
      else if (highestObserved >= currentStop || currentAsk >= currentStop || currentPrice >= currentStop) {
        hit = true;
        exitPrice = currentStop;
        if (isBE || isRunner) {
          outcomeType = 'be_hit';
          realizedR = 0.0;
        } else {
          outcomeType = 'sl_hit';
          realizedR = -1.0;
        }
      }

      if (hit) {
        const now = new Date().toISOString();
        let metaObj: any = {};
        try { metaObj = JSON.parse(setup.metadata || '{}'); } catch {}

        const entryTime = setup.entry_triggered_at || setup.created_at || now;
        const entryMs = new Date(entryTime).getTime();
        const exitMs = new Date(now).getTime();
        const durationMin = Number((Math.max(1, exitMs - entryMs) / 60000).toFixed(1));

        let maeR: number | null = null;
        let mfeR: number | null = null;
        let highestPrice: number | null = maxHigh;
        let lowestPrice: number | null = minLow;

        // `risk` already computed above from initialStop
        try {
          const excursion = await calculateTradeExcursion({
            instrument: setup.instrument,
            bias: 'short',
            entryPrice,
            initialStop: initialStop,
            entryTime,
            exitTime: now,
            exitPrice
          });
          if (excursion) {
            maeR = excursion.maeR;
            mfeR = excursion.mfeR;
            highestPrice = excursion.highestPrice;
            lowestPrice = excursion.lowestPrice;
          }
        } catch {
          // Fallback excursion calculation from recorded wick extremes
          if (risk > 0) {
            const maxAdverse = Math.max(0, maxHigh - entryPrice);
            const maxFavorable = Math.max(0, entryPrice - minLow);
            maeR = Number((maxAdverse / risk).toFixed(2));
            mfeR = Number((maxFavorable / risk).toFixed(2));
          }
        }

        metaObj.outcome_type = outcomeType;
        metaObj.exit_price = exitPrice;
        metaObj.exit_time = now;
        metaObj.realized_r = realizedR;
        metaObj.mae_r = maeR;
        metaObj.mfe_r = mfeR;
        metaObj.highest_price = highestPrice;
        metaObj.lowest_price = lowestPrice;
        metaObj.duration_min = durationMin;

        // Capture exit session using killzone mapping
        try {
          const { mapTimestampToKillzone } = await import('./killzone-mapper');
          const exitKz = mapTimestampToKillzone(new Date(now));
          metaObj.session_exited = exitKz?.killzone || 'unknown';
          metaObj.session_exited_at = now;
        } catch {}

        await queryDb(
          `UPDATE superadmin_edge_setups 
           SET signal_state = 'resolved', 
               resolved_at = ?, 
               invalidation_reason = ?, 
               exit_price = ?, 
               realized_r = ?, 
               mae = ?, 
               mfe = ?, 
               duration_min = ?, 
               exit_reason = ?, 
               metadata = ? 
           WHERE id = ?`,
          [
            now,
            outcomeType,
            exitPrice,
            realizedR,
            maeR,
            mfeR,
            durationMin,
            outcomeType,
            JSON.stringify(metaObj),
            setup.id
          ]
        );

        resolved++;
        logger.info(
          { instrument: setup.instrument, outcomeType, realizedR, exitPrice, maeR, mfeR, durationMin },
          `🏁 EliteFractal: Signal resolved with ${outcomeType} (${realizedR}R) [MAE: ${maeR}R, MFE: ${mfeR}R, ${durationMin}m]`
        );
      }
    }
  } catch (err: any) {
    logger.error({ err: err.message }, 'EliteFractal: Outcome evaluation error');
  } finally {
    isEvaluatingOutcomes = false;
  }

  return { evaluated, resolved };
}

/**
 * Run a single Elite Fractal scan cycle across all markets.
 * Writes results to superadmin_edge_setups table with INSTANT MARKET EXECUTION.
 * Skips if a scan is already in progress to prevent overlapping runs.
 */
export async function runEliteFractalScanCycle(): Promise<{ scanned: number; created: number }> {
  if (isRunning) {
    logger.info('EliteFractal: Scan cycle already in progress — skipping overlap.');
    return { scanned: 0, created: 0 };
  }

  isRunning = true;
  let scanned = 0;
  let created = 0;

  try {
    const strategy = strategyRegistry.getSuperAdminExclusiveStrategies()[0];
    if (!strategy) {
      logger.warn('EliteFractal: No exclusive strategy registered — skipping cycle.');
      return { scanned: 0, created: 0 };
    }

    const now = new Date();
    const kzInfo = mapTimestampToKillzone(now);

    // Use a fallback killzone if we're between sessions (edge case)
    const killzone = kzInfo || {
      killzone: 'asia' as const,
      name: 'ASIA',
      boundaryET: '20:00',
      boundaryUTC: now.toISOString()
    };

    const runId = `ef_auto_${Date.now()}`;

    // Compute biases once for all instruments
    const allInstruments = [...FUTURES_INSTRUMENTS, ...FOREX_INSTRUMENTS];
    const allBiases = await getUnifiedMarketBiases(allInstruments);

    const marketsToScan: Array<'futures' | 'forex'> = [];
    if (isFuturesMarketOpen(now)) marketsToScan.push('futures');
    if (isForexMarketOpen(now)) marketsToScan.push('forex');

    // Always scan both during live hours — if both markets closed (rare), still attempt
    // so telemetry data is kept fresh for the dashboard
    if (marketsToScan.length === 0) {
      marketsToScan.push('forex', 'futures');
    }

    for (const market of marketsToScan) {
      const instruments = market === 'forex' ? FOREX_INSTRUMENTS : FUTURES_INSTRUMENTS;
      scanned += instruments.length;

      const candidates = await strategy.evaluateSetups(killzone, runId, market, instruments, allBiases);

      for (const candidate of candidates) {
        // Dedup: skip if active/awaiting_entry signal already exists for this instrument.
        // IMPORTANT: 'runner' state means TP1 was already hit — scanner IS ALLOWED to
        // find a fresh new setup for the same instrument while the runner is riding to TP2.
        const existing = await queryDb<{ id: string }>(
          `SELECT id FROM superadmin_edge_setups WHERE instrument = ? AND signal_state IN ('awaiting_entry','active') AND superseded = 0`,
          [candidate.instrument]
        );
        if (existing.length > 0) continue;

        // POST-STOP COOLDOWN: skip if this instrument took a stop loss within the last 60 minutes
        // Prevents entering repeatedly into adverse momentum
        const recentLoss = await queryDb<{ id: string }>(
          `SELECT id FROM superadmin_edge_setups 
           WHERE instrument = ? 
             AND signal_state = 'resolved' 
             AND (invalidation_reason = 'sl_hit' OR metadata LIKE '%sl_hit%')
             AND resolved_at >= ?`,
          [candidate.instrument, new Date(Date.now() - 60 * 60 * 1000).toISOString()]
        );
        if (recentLoss.length > 0) {
          logger.info({ instrument: candidate.instrument }, 'EliteFractal: Skipping setup — instrument in 60-minute post-stop cooldown');
          continue;
        }

        // Validate live current price before executing trade
        let currentPrice = 0;
        try {
          const quote = await getLiveQuoteDetails(candidate.instrument);
          currentPrice = quote?.price || await getLiveCurrentPrice(candidate.instrument) || 0;
        } catch {}

        if (currentPrice <= 0) {
          logger.warn({ instrument: candidate.instrument }, 'EliteFractal: No live price available — skipping execution');
          continue;
        }

        // BEARISH SELL SAFETY GUARDS:
        // 1. Current price must NEVER be at or above the stop loss!
        if (currentPrice >= candidate.stop) {
          logger.warn(
            { instrument: candidate.instrument, currentPrice, stop: candidate.stop },
            'EliteFractal: REJECTED — current price is already at/above Stop Loss'
          );
          continue;
        }

        // 2. Current price must not have already reached TP1
        if (currentPrice <= candidate.tp1) {
          logger.warn(
            { instrument: candidate.instrument, currentPrice, tp1: candidate.tp1 },
            'EliteFractal: REJECTED — current price has already reached or passed TP1'
          );
          continue;
        }

        // 3. Current price must be AT or very near the OC entry zone (SHORT: we sell INTO the zone)
        //    Old: 0.15% slack allowed entries 27 pips above the zone on EUR/JPY — too wide, causes
        //    near-zero stops when price is above the OC zone but still below the stop.
        //    New: per-instrument pip slack — JPY 0.030 (3 pips), regular forex 0.0003 (3 pips)
        const isJPYInstrument = candidate.instrument.includes('JPY');
        const entrySlack = candidate.market === 'futures'
          ? candidate.entry_zone_high * 0.001  // 0.1% for futures
          : isJPYInstrument ? 0.030             // 3 JPY pips (0.01 each)
          : 0.0003;                             // 3 standard pips (0.0001 each)
        const entryMax = candidate.entry_zone_high + entrySlack;
        if (currentPrice > entryMax) {
          logger.warn(
            { instrument: candidate.instrument, currentPrice, entryMax, entryZoneHigh: candidate.entry_zone_high },
            'EliteFractal: REJECTED — price is above entry zone threshold'
          );
          continue;
        }

        const execPrice = currentPrice;
        const initialStop = candidate.stop;
        const risk = Math.abs(execPrice - initialStop);

        // Fix D: Minimum risk floor per instrument type.
        // Old floor (0.0003) was essentially 0 for JPY pairs (price ~178 × 0.0003 = 0.054 pip).
        // New: JPY pairs min 10 pips (0.100), regular forex min 5 pips (0.0005), futures $2.0
        const minRisk = candidate.market === 'futures' ? 2.0
          : isJPYInstrument ? 0.100   // 10 JPY pips minimum risk distance
          : 0.0005;                   // 5 standard pips minimum risk distance

        if (risk < minRisk) {
          logger.warn({ instrument: candidate.instrument, risk }, 'EliteFractal: Risk too small — skipping');
          continue;
        }

        const tp1 = Number((execPrice - 2.0 * risk).toFixed(candidate.market === 'forex' ? 5 : 2));
        const tp2 = Number((execPrice - 3.5 * risk).toFixed(candidate.market === 'forex' ? 5 : 2));

        const id = `ef_${candidate.instrument.replace(/[^a-z0-9]/gi, '_')}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const ts = new Date().toISOString();

        // Enrich metadata with session_found (which killzone the signal was discovered in)
        let metaObj: any = {};
        try { metaObj = JSON.parse(candidate.metadata || '{}'); } catch {}
        metaObj.session_found = killzone.killzone;
        metaObj.session_found_at = ts;
        metaObj.trade_id = id;
        const enrichedMetadata = JSON.stringify(metaObj);

        // INSTANT MARKET EXECUTION: Trade enters immediately at current market price
        await queryDb(
          `INSERT INTO superadmin_edge_setups (
            id, instrument, market, created_at, created_by_run,
            killzone_origin, killzone_origin_at, bias,
            entry_zone_low, entry_zone_high, entry_zone_mid,
            stop, tp1, tp2, r_multiple_1, r_multiple_2,
            conviction_score, liquidity_score,
            strategy_id, strategy_tier, metadata,
            signal_state, superseded, tradable,
            entry_triggered_at, entry_price_recorded, initial_stop,
            state_machine_state, state_machine_phase, state_changed_at
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'active',0,1,?,?,?,?,?,?)`,
          [
            id,
            candidate.instrument,
            candidate.market,
            ts,
            runId,
            candidate.killzone_origin,
            candidate.killzone_origin_at,
            candidate.bias,
            candidate.entry_zone_low,
            candidate.entry_zone_high,
            execPrice, // entry_zone_mid anchored to execPrice
            initialStop,
            tp1,
            tp2,
            2.0,
            3.5,
            candidate.conviction_score ?? null,
            candidate.liquidity_score ?? null,
            candidate.strategy_id ?? 'elite_fractal',
            candidate.strategy_tier ?? 'elite',
            enrichedMetadata,
            ts, // entry_triggered_at: filled immediately
            execPrice, // entry_price_recorded: executed at live market price
            initialStop, // initial_stop
            'ENTRY_READY',
            'ENTRY_READY',
            ts
          ]
        );

        created++;
        logger.info(
          { id, instrument: candidate.instrument, market, conviction: candidate.conviction_score, execPrice, stop: initialStop, tp1, tp2, sessionFound: killzone.killzone },
          `🛡️ EliteFractal: New exclusive signal published with verified MARKET EXECUTION entry for ${candidate.instrument}`
        );
      }
    }

    if (created > 0 || scanned > 0) {
      logger.info(
        { runId, scanned, created, markets: marketsToScan },
        `🔄 EliteFractal continuous scan cycle complete`
      );
    }

    // Evaluate outcomes immediately after scan
    await evaluateEliteFractalOutcomes();

  } catch (err: any) {
    logger.error({ err: err.message }, 'EliteFractal: Scan cycle error');
  } finally {
    isRunning = false;
  }

  return { scanned, created };
}

/**
 * Start the Elite Fractal continuous scanner.
 * Runs every 5 minutes for new setups, and every 30 seconds for outcome evaluation.
 */
export function startEliteFractalContinuousScanner(): void {
  if (scanTask) {
    logger.warn('EliteFractal: Continuous scanner already running — ignoring duplicate start.');
    return;
  }

  // 1. Scan task: Every 5 minutes
  scanTask = cron.schedule('*/5 * * * *', async () => {
    try {
      await runEliteFractalScanCycle();
    } catch (err: any) {
      logger.error({ err: err.message }, 'EliteFractal: Unhandled error in cron job');
    }
  });

  // 2. Outcome tracking interval: Every 30 seconds
  if (!outcomeInterval) {
    outcomeInterval = setInterval(async () => {
      try {
        await evaluateEliteFractalOutcomes();
      } catch (err: any) {
        logger.error({ err: err.message }, 'EliteFractal: Error in outcome tracking loop');
      }
    }, 30000);
  }

  logger.info('🛡️ EliteFractal Continuous Scanner started — scan every 5m, outcome tracking every 30s.');

  // Fire an initial scan and outcome evaluation 10 seconds after startup
  setTimeout(async () => {
    try {
      logger.info('🛡️ EliteFractal: Running initial startup scan and outcome check...');
      await evaluateEliteFractalOutcomes();
      await runEliteFractalScanCycle();
    } catch (err: any) {
      logger.error({ err: err.message }, 'EliteFractal: Initial startup scan error');
    }
  }, 10000);
}

/**
 * Stop the continuous scanner (used during graceful shutdown).
 */
export function stopEliteFractalContinuousScanner(): void {
  if (scanTask) {
    scanTask.stop();
    scanTask = null;
  }
  if (outcomeInterval) {
    clearInterval(outcomeInterval);
    outcomeInterval = null;
  }
  logger.info('🛡️ EliteFractal Continuous Scanner stopped.');
}
