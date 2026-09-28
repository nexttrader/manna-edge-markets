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

      // Intra-minute wicks
      let maxHigh = currentAsk;
      let minLow = currentBid;
      try {
        const candles = await getLiveCandles(setup.instrument, '1m', 15);
        const entryMs = setup.entry_triggered_at ? new Date(setup.entry_triggered_at).getTime() : 0;
        if (candles && candles.length > 0) {
          const post = entryMs > 0 ? candles.filter(c => new Date(c.timestamp).getTime() >= entryMs) : candles;
          if (post.length > 0) {
            maxHigh = Math.max(currentAsk, ...post.map(c => c.high));
            minLow = Math.min(currentBid, ...post.map(c => c.low));
          }
        }
      } catch {}

      const entryPrice = setup.entry_price_recorded || setup.entry_zone_mid;
      const stopPrice = setup.stop;
      const tp1 = setup.tp1;
      const tp2 = setup.tp2;
      const isRunner = setup.signal_state === 'runner';
      const isBE = Boolean(setup.is_breakeven);

      let hit = false;
      let outcomeType = '';
      let exitPrice = currentAsk;
      let realizedR = 0;

      // Bearish SELL setups:
      // Profit is downward: currentBid or minLow drops to/below TP2 / TP1
      // Loss is upward: currentAsk or maxHigh rises to/above Stop
      if (tp2 && (minLow <= tp2 || currentBid <= tp2)) {
        hit = true;
        outcomeType = 'tp2_hit';
        exitPrice = tp2;
        realizedR = setup.r_multiple_2 || 3.5;
      } else if (!isRunner && (minLow <= tp1 || currentBid <= tp1)) {
        // First time hitting TP1 -> Move to runner with Stop at BE!
        const now = new Date().toISOString();
        let metaObj: any = {};
        try { metaObj = JSON.parse(setup.metadata || '{}'); } catch {}
        metaObj.outcome_type = 'tp1_hit';
        metaObj.tp1_hit_at = now;
        metaObj.realized_r = setup.r_multiple_1 || 2.0;
        metaObj.mfe_r = setup.r_multiple_1 || 2.0;

        await queryDb(
          `UPDATE superadmin_edge_setups SET signal_state = 'runner', stop = ?, initial_stop = COALESCE(initial_stop, ?), is_breakeven = 1, mfe = ?, metadata = ? WHERE id = ?`,
          [entryPrice, stopPrice, setup.r_multiple_1 || 2.0, JSON.stringify(metaObj), setup.id]
        );

        logger.info(
          { instrument: setup.instrument, tp1, entryPrice },
          '🎯 EliteFractal: TP1 (+2.0R) hit! Moved to RUNNER with Stop at BE targeting TP2'
        );
        continue;
      } else if (maxHigh >= stopPrice || currentAsk >= stopPrice) {
        // Stop hit!
        hit = true;
        exitPrice = stopPrice;
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

        const risk = Math.abs(entryPrice - (setup.initial_stop || stopPrice));

        try {
          const excursion = await calculateTradeExcursion({
            instrument: setup.instrument,
            bias: 'short',
            entryPrice,
            initialStop: setup.initial_stop || stopPrice,
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
        // Dedup: skip if active/runner signal already exists for this instrument
        const existing = await queryDb<{ id: string }>(
          `SELECT id FROM superadmin_edge_setups WHERE instrument = ? AND signal_state IN ('awaiting_entry','active','runner') AND superseded = 0`,
          [candidate.instrument]
        );
        if (existing.length > 0) continue;

        const id = `ef_${candidate.instrument.replace(/[^a-z0-9]/gi, '_')}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const ts = new Date().toISOString();

        // INSTANT MARKET EXECUTION: Trade enters immediately upon M1 confirmation close
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
            candidate.entry_zone_mid,
            candidate.stop,
            candidate.tp1,
            candidate.tp2 ?? null,
            candidate.r_multiple_1 ?? null,
            candidate.r_multiple_2 ?? null,
            candidate.conviction_score ?? null,
            candidate.liquidity_score ?? null,
            candidate.strategy_id ?? 'elite_fractal',
            candidate.strategy_tier ?? 'elite',
            candidate.metadata ?? null,
            ts, // entry_triggered_at: filled immediately
            candidate.entry_zone_mid, // entry_price_recorded: executed at market
            candidate.stop, // initial_stop
            'ENTRY_READY',
            'ENTRY_READY',
            ts
          ]
        );

        created++;
        logger.info(
          { instrument: candidate.instrument, market, conviction: candidate.conviction_score, execPrice: candidate.entry_zone_mid },
          `🛡️ EliteFractal: New exclusive signal published with MARKET EXECUTION entry for ${candidate.instrument}`
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
