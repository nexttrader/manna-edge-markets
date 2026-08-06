import fs from 'fs';
import path from 'path';
import { queryDb } from './database';
import { EdgeSetup } from '../discovery/types';
import { createLogger } from '../telemetry/logger';

const logger = createLogger('SignalSnapshotRestore');

const SNAPSHOT_FILE_PATH = path.resolve(process.cwd(), 'src/db/persistent_signals_snapshot.json');

export async function saveSignalsSnapshot(setups: EdgeSetup[]): Promise<void> {
  try {
    if (!setups || setups.length === 0) return;
    const activeOnly = setups.filter(s => s.superseded === 0 && ['awaiting_entry', 'active'].includes(s.signal_state));
    if (activeOnly.length > 0) {
      fs.writeFileSync(SNAPSHOT_FILE_PATH, JSON.stringify(activeOnly, null, 2), 'utf8');
      logger.info({ count: activeOnly.length }, 'Saved active signals snapshot to disk');
    }
  } catch (err: any) {
    logger.warn({ err: err.message }, 'Failed to write signals snapshot file');
  }
}

export function loadSignalsSnapshot(): EdgeSetup[] {
  try {
    if (fs.existsSync(SNAPSHOT_FILE_PATH)) {
      const content = fs.readFileSync(SNAPSHOT_FILE_PATH, 'utf8');
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (err: any) {
    logger.warn({ err: err.message }, 'Failed to read signals snapshot file');
  }
  return [];
}

export async function ensureActiveSignalsRestored(): Promise<void> {
  try {
    // 1. Clean out any legacy seed/synthetic setups from database
    try {
      await queryDb(`DELETE FROM edge_setups WHERE id LIKE '%seed%' OR created_by_run = 'seed_init' OR metadata LIKE '%"seed":true%'`);
      await queryDb(`DELETE FROM forex_edge_setups WHERE id LIKE '%seed%' OR created_by_run = 'seed_init' OR metadata LIKE '%"seed":true%'`);
    } catch {}

    const futures = await queryDb<EdgeSetup>(`SELECT * FROM edge_setups WHERE superseded = 0 AND signal_state IN ('awaiting_entry', 'active')`);
    const forex = await queryDb<EdgeSetup>(`SELECT * FROM forex_edge_setups WHERE superseded = 0 AND signal_state IN ('awaiting_entry', 'active')`);
    const totalActive = futures.length + forex.length;

    if (totalActive > 0) {
      // Save current real active signals to disk snapshot
      await saveSignalsSnapshot([...futures, ...forex]);
      logger.info({ count: totalActive }, 'Active signals present in database on startup; snapshot updated.');
      return;
    }

    const snapshotSetups = loadSignalsSnapshot();
    if (snapshotSetups.length === 0) {
      logger.info('Database initialized with 0 active signals; waiting for next live market scan.');
      return;
    }

    logger.warn(`⚠️ Activating failsafe restoration of ${snapshotSetups.length} previously saved real signals...`);

    for (const setup of snapshotSetups) {
      const table = (setup.market || '').toLowerCase() === 'forex' ? 'forex_edge_setups' : 'edge_setups';
      const mkt = (setup.market || '').toLowerCase() === 'forex' ? 'forex' : 'futures';
      
      const insertSql = `
        INSERT INTO ${table} (
          id, instrument, market, created_at, created_by_run, killzone_origin, bias,
          entry_zone_low, entry_zone_high, entry_zone_mid, entry_price_recorded, stop, initial_stop,
          tp1, tp2, r_multiple_1, r_multiple_2, signal_state, superseded, tradable,
          conviction_score, liquidity_score, strategy_id, strategy_tier, metadata
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, ?, ?, ?, ?, ?
        ) ON CONFLICT (id) DO UPDATE SET
          signal_state = EXCLUDED.signal_state,
          superseded = 0,
          tradable = 1
      `;

      await queryDb(insertSql, [
        setup.id,
        setup.instrument,
        mkt,
        setup.created_at || new Date().toISOString(),
        setup.created_by_run || 'failsafe_restore',
        setup.killzone_origin || 'ny_am',
        setup.bias,
        setup.entry_zone_low,
        setup.entry_zone_high,
        setup.entry_zone_mid,
        setup.entry_price_recorded || setup.entry_zone_mid,
        setup.stop,
        setup.initial_stop || setup.stop,
        setup.tp1,
        setup.tp2 || null,
        setup.r_multiple_1 || 2.0,
        setup.r_multiple_2 || 3.5,
        setup.signal_state || 'awaiting_entry',
        setup.conviction_score || 90.0,
        setup.liquidity_score || 90.0,
        setup.strategy_id || 'sentinel_v2',
        setup.strategy_tier || 'basic',
        setup.metadata || '{}'
      ]);
    }

    logger.info(`🛡️ FAILSAFE ACTIVATED: Restored ${snapshotSetups.length} real active trade setups into database on server restart!`);
  } catch (err: any) {
    logger.error({ err: err.message }, 'Failed to restore signals snapshot on startup');
  }
}
