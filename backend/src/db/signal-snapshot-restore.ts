import fs from 'fs';
import path from 'path';
import { queryDb } from './database';
import { EdgeSetup } from '../discovery/types';
import { createLogger } from '../telemetry/logger';

const logger = createLogger('SignalSnapshotRestore');

const SNAPSHOT_FILE_PATH = path.resolve(process.cwd(), 'src/db/persistent_signals_snapshot.json');
const SNAPSHOT_TMP_PATH = '/tmp/persistent_signals_snapshot.json';

import { isMockSetup } from '../publish-gate/revalidation';

export async function saveSignalsSnapshot(setups: EdgeSetup[]): Promise<void> {
  try {
    const activeOnly = (setups || []).filter(s => s && !isMockSetup(s) && s.superseded === 0 && ['awaiting_entry', 'active'].includes(s.signal_state));
    const jsonStr = JSON.stringify(activeOnly, null, 2);
    const now = new Date().toISOString();

    // 1. Save to persistent database table
    try {
      await queryDb(
        `INSERT INTO system_signal_snapshots (id, snapshot_json, count, updated_at) VALUES ('current', ?, ?, ?) ON CONFLICT(id) DO UPDATE SET snapshot_json = EXCLUDED.snapshot_json, count = EXCLUDED.count, updated_at = EXCLUDED.updated_at`,
        [jsonStr, activeOnly.length, now]
      );
    } catch (dbErr: any) {
      logger.warn({ err: dbErr.message }, 'Could not save signal snapshot to database table');
    }

    // 2. Save to disk files
    for (const fpath of [SNAPSHOT_FILE_PATH, SNAPSHOT_TMP_PATH]) {
      try {
        fs.writeFileSync(fpath, jsonStr, 'utf8');
      } catch {}
    }

    logger.info({ count: activeOnly.length }, 'Saved active signals snapshot to database & disk');
  } catch (err: any) {
    logger.warn({ err: err.message }, 'Failed to write signals snapshot file');
  }
}

export async function loadSignalsSnapshot(): Promise<EdgeSetup[]> {
  // 1. Try loading from database table system_signal_snapshots
  try {
    const rows = await queryDb<any>(`SELECT snapshot_json FROM system_signal_snapshots WHERE id = 'current'`);
    if (rows && rows.length > 0 && rows[0].snapshot_json) {
      const parsed = JSON.parse(rows[0].snapshot_json);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const realOnly = parsed.filter((s: EdgeSetup) => !isMockSetup(s));
        logger.info({ count: realOnly.length }, 'Loaded signals snapshot from persistent database table');
        return realOnly;
      }
    }
  } catch (err: any) {
    logger.warn({ err: err.message }, 'Could not read signals snapshot from database table');
  }

  // 2. Fallback to disk snapshot files
  for (const fpath of [SNAPSHOT_FILE_PATH, SNAPSHOT_TMP_PATH]) {
    try {
      if (fs.existsSync(fpath)) {
        const content = fs.readFileSync(fpath, 'utf8');
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const realOnly = parsed.filter((s: EdgeSetup) => !isMockSetup(s));
          logger.info({ count: realOnly.length, fpath }, 'Loaded signals snapshot from disk file');
          return realOnly;
        }
      }
    } catch {}
  }

  return [];
}

export async function ensureActiveSignalsRestored(): Promise<void> {
  try {
    // 1. Clean out any legacy seed/synthetic/mock setups from database
    try {
      await queryDb(`DELETE FROM edge_setups WHERE id LIKE '%seed%' OR id LIKE 'kz_mid_%' OR id LIKE '%mock%' OR created_by_run = 'seed_init' OR conviction_score IS NULL OR metadata LIKE '%"seed":true%' OR metadata LIKE '%"source":"mock"%'`);
      await queryDb(`DELETE FROM forex_edge_setups WHERE id LIKE '%seed%' OR id LIKE 'kz_mid_%' OR id LIKE '%mock%' OR created_by_run = 'seed_init' OR conviction_score IS NULL OR metadata LIKE '%"seed":true%' OR metadata LIKE '%"source":"mock"%'`);
    } catch {}

    const futures = await queryDb<EdgeSetup>(`SELECT * FROM edge_setups WHERE superseded = 0 AND signal_state IN ('awaiting_entry', 'active')`);
    const forex = await queryDb<EdgeSetup>(`SELECT * FROM forex_edge_setups WHERE superseded = 0 AND signal_state IN ('awaiting_entry', 'active')`);
    const totalActive = futures.length + forex.length;

    if (totalActive > 0) {
      // Save current real active signals to DB snapshot table & disk
      await saveSignalsSnapshot([...futures, ...forex]);
      logger.info({ count: totalActive }, 'Active signals present in database on startup; snapshot updated.');
      return;
    }

    const snapshotSetups = await loadSignalsSnapshot();
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
        // Only restore entry_price_recorded if the signal was actually filled (active).
        // Awaiting_entry signals never filled, so their entry_price_recorded must stay NULL.
        (setup.signal_state === 'active' ? setup.entry_price_recorded : null) || null,
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
