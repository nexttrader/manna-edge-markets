import cron = require('node-cron');
import { strategyRegistry } from '../discovery/strategies/strategy-registry';
import { getUnifiedMarketBiases } from '../discovery/bias-engine';
import { FUTURES_INSTRUMENTS, FOREX_INSTRUMENTS } from '../discovery/mock-data';
import { mapTimestampToKillzone, isForexMarketOpen, isFuturesMarketOpen } from './killzone-mapper';
import { queryDb } from '../db/database';
import { createLogger } from '../telemetry/logger';

const logger = createLogger('EliteFractalScanner');

let scanTask: cron.ScheduledTask | null = null;
let isRunning = false;

/**
 * Run a single Elite Fractal scan cycle across all markets.
 * Writes results to superadmin_edge_setups table.
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
        // Dedup: skip if active signal already exists for this instrument
        const existing = await queryDb<{ id: string }>(
          `SELECT id FROM superadmin_edge_setups WHERE instrument = ? AND signal_state IN ('awaiting_entry','active') AND superseded = 0`,
          [candidate.instrument]
        );
        if (existing.length > 0) continue;

        const id = `ef_${candidate.instrument.replace(/[^a-z0-9]/gi, '_')}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const ts = new Date().toISOString();

        await queryDb(
          `INSERT INTO superadmin_edge_setups (
            id, instrument, market, created_at, created_by_run,
            killzone_origin, killzone_origin_at, bias,
            entry_zone_low, entry_zone_high, entry_zone_mid,
            stop, tp1, tp2, r_multiple_1, r_multiple_2,
            conviction_score, liquidity_score,
            strategy_id, strategy_tier, metadata,
            signal_state, superseded, tradable,
            state_machine_state, state_machine_phase, state_changed_at
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'awaiting_entry',0,1,?,?,?)`,
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
            'ENTRY_READY',
            'ENTRY_READY',
            ts
          ]
        );

        created++;
        logger.info(
          { instrument: candidate.instrument, market, conviction: candidate.conviction_score },
          `🛡️ EliteFractal: New exclusive signal published for ${candidate.instrument}`
        );
      }
    }

    if (created > 0 || scanned > 0) {
      logger.info(
        { runId, scanned, created, markets: marketsToScan },
        `🔄 EliteFractal continuous scan cycle complete`
      );
    }

  } catch (err: any) {
    logger.error({ err: err.message }, 'EliteFractal: Scan cycle error');
  } finally {
    isRunning = false;
  }

  return { scanned, created };
}

/**
 * Start the Elite Fractal continuous scanner.
 * Runs every 5 minutes, 24/7.
 * The scan itself checks market hours and skips gracefully if both markets are closed.
 */
export function startEliteFractalContinuousScanner(): void {
  if (scanTask) {
    logger.warn('EliteFractal: Continuous scanner already running — ignoring duplicate start.');
    return;
  }

  // Every 5 minutes
  scanTask = cron.schedule('*/5 * * * *', async () => {
    try {
      await runEliteFractalScanCycle();
    } catch (err: any) {
      logger.error({ err: err.message }, 'EliteFractal: Unhandled error in cron job');
    }
  });

  logger.info('🛡️ EliteFractal Continuous Scanner started — running every 5 minutes.');

  // Fire an initial scan 30 seconds after startup so the dashboard has data immediately
  setTimeout(async () => {
    try {
      logger.info('🛡️ EliteFractal: Running initial startup scan...');
      await runEliteFractalScanCycle();
    } catch (err: any) {
      logger.error({ err: err.message }, 'EliteFractal: Initial startup scan error');
    }
  }, 30000);
}

/**
 * Stop the continuous scanner (used during graceful shutdown).
 */
export function stopEliteFractalContinuousScanner(): void {
  if (scanTask) {
    scanTask.stop();
    scanTask = null;
    logger.info('🛡️ EliteFractal Continuous Scanner stopped.');
  }
}
