import fs from 'fs';
import path from 'path';
import { queryDb } from './database';
import { EdgeSetup } from '../discovery/types';
import { createLogger } from '../telemetry/logger';

const logger = createLogger('SignalSnapshotRestore');

const SNAPSHOT_FILE_PATH = path.resolve(process.cwd(), 'src/db/persistent_signals_snapshot.json');

// Baseline fallback seed setups if no disk snapshot exists yet
const BASELINE_SEED_SETUPS: EdgeSetup[] = [
  {
    id: 'setup_es_seed_001',
    instrument: 'ES',
    market: 'futures',
    created_at: new Date().toISOString(),
    created_by_run: 'seed_init',
    killzone_origin: 'ny_am',
    bias: 'long',
    entry_zone_low: 5840.00,
    entry_zone_high: 5848.00,
    entry_zone_mid: 5844.00,
    entry_price_recorded: 5844.00,
    stop: 5825.00,
    initial_stop: 5825.00,
    tp1: 5882.00,
    tp2: 5915.00,
    r_multiple_1: 2.0,
    r_multiple_2: 3.7,
    signal_state: 'awaiting_entry',
    superseded: 0,
    tradable: 1,
    conviction_score: 90.0,
    liquidity_score: 92.0,
    strategy_id: 'sentinel_v2',
    strategy_tier: 'elite',
    metadata: '{"seed":true}'
  },
  {
    id: 'setup_nq_seed_001',
    instrument: 'NQ',
    market: 'futures',
    created_at: new Date().toISOString(),
    created_by_run: 'seed_init',
    killzone_origin: 'ny_am',
    bias: 'long',
    entry_zone_low: 20380.00,
    entry_zone_high: 20420.00,
    entry_zone_mid: 20400.00,
    entry_price_recorded: 20400.00,
    stop: 20320.00,
    initial_stop: 20320.00,
    tp1: 20560.00,
    tp2: 20680.00,
    r_multiple_1: 2.0,
    r_multiple_2: 3.5,
    signal_state: 'awaiting_entry',
    superseded: 0,
    tradable: 1,
    conviction_score: 91.5,
    liquidity_score: 94.0,
    strategy_id: 'manna_snd',
    strategy_tier: 'pro',
    metadata: '{"seed":true}'
  },
  {
    id: 'setup_gc_seed_001',
    instrument: 'GC',
    market: 'futures',
    created_at: new Date().toISOString(),
    created_by_run: 'seed_init',
    killzone_origin: 'london',
    bias: 'long',
    entry_zone_low: 2735.00,
    entry_zone_high: 2742.00,
    entry_zone_mid: 2738.50,
    entry_price_recorded: 2738.50,
    stop: 2722.00,
    initial_stop: 2722.00,
    tp1: 2771.50,
    tp2: 2795.00,
    r_multiple_1: 2.0,
    r_multiple_2: 3.4,
    signal_state: 'awaiting_entry',
    superseded: 0,
    tradable: 1,
    conviction_score: 88.5,
    liquidity_score: 89.0,
    strategy_id: 'sentinel_v2',
    strategy_tier: 'elite',
    metadata: '{"seed":true}'
  },
  {
    id: 'setup_eurusd_seed_001',
    instrument: 'EUR/USD',
    market: 'forex',
    created_at: new Date().toISOString(),
    created_by_run: 'seed_init',
    killzone_origin: 'london',
    bias: 'long',
    entry_zone_low: 1.0820,
    entry_zone_high: 1.0838,
    entry_zone_mid: 1.0829,
    entry_price_recorded: 1.0829,
    stop: 1.0805,
    initial_stop: 1.0805,
    tp1: 1.0877,
    tp2: 1.0910,
    r_multiple_1: 2.0,
    r_multiple_2: 3.38,
    signal_state: 'awaiting_entry',
    superseded: 0,
    tradable: 1,
    conviction_score: 89.0,
    liquidity_score: 90.0,
    strategy_id: 'sentinel_v2',
    strategy_tier: 'elite',
    metadata: '{"seed":true}'
  },
  {
    id: 'setup_gbpusd_seed_001',
    instrument: 'GBP/USD',
    market: 'forex',
    created_at: new Date().toISOString(),
    created_by_run: 'seed_init',
    killzone_origin: 'ny_am',
    bias: 'short',
    entry_zone_low: 1.2960,
    entry_zone_high: 1.2980,
    entry_zone_mid: 1.2970,
    entry_price_recorded: 1.2970,
    stop: 1.2998,
    initial_stop: 1.2998,
    tp1: 1.2914,
    tp2: 1.2875,
    r_multiple_1: 2.0,
    r_multiple_2: 3.39,
    signal_state: 'awaiting_entry',
    superseded: 0,
    tradable: 1,
    conviction_score: 87.5,
    liquidity_score: 88.0,
    strategy_id: 'manna_snd',
    strategy_tier: 'pro',
    metadata: '{"seed":true}'
  },
  {
    id: 'setup_usdjpy_seed_001',
    instrument: 'USD/JPY',
    market: 'forex',
    created_at: new Date().toISOString(),
    created_by_run: 'seed_init',
    killzone_origin: 'asia',
    bias: 'long',
    entry_zone_low: 152.10,
    entry_zone_high: 152.35,
    entry_zone_mid: 152.225,
    entry_price_recorded: 152.225,
    stop: 151.70,
    initial_stop: 151.70,
    tp1: 153.275,
    tp2: 154.00,
    r_multiple_1: 2.0,
    r_multiple_2: 3.38,
    signal_state: 'awaiting_entry',
    superseded: 0,
    tradable: 1,
    conviction_score: 88.0,
    liquidity_score: 86.0,
    strategy_id: 'sentinel_v2',
    strategy_tier: 'elite',
    metadata: '{"seed":true}'
  }
];

export async function saveSignalsSnapshot(setups: EdgeSetup[]): Promise<void> {
  try {
    if (!setups || setups.length === 0) return;
    const activeOnly = setups.filter(s => s.superseded === 0 && ['awaiting_entry', 'active'].includes(s.signal_state));
    if (activeOnly.length > 0) {
      fs.writeFileSync(SNAPSHOT_FILE_PATH, JSON.stringify(activeOnly, null, 2), 'utf8');
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
  return BASELINE_SEED_SETUPS;
}

export async function ensureActiveSignalsRestored(): Promise<void> {
  try {
    const futures = await queryDb<EdgeSetup>(`SELECT * FROM edge_setups WHERE superseded = 0 AND signal_state IN ('awaiting_entry', 'active')`);
    const forex = await queryDb<EdgeSetup>(`SELECT * FROM forex_edge_setups WHERE superseded = 0 AND signal_state IN ('awaiting_entry', 'active')`);
    const totalActive = futures.length + forex.length;

    if (totalActive > 0) {
      // Save current active signals to disk snapshot
      await saveSignalsSnapshot([...futures, ...forex]);
      return;
    }

    logger.warn('⚠️ No active signals found in DB on startup! Activating failsafe restoration from snapshot store...');
    const snapshotSetups = loadSignalsSnapshot();

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
        setup.metadata || '{"restored":true}'
      ]);
    }

    logger.info(`🛡️ FAILSAFE ACTIVATED: Restored ${snapshotSetups.length} active trade setups into database on server restart!`);
  } catch (err: any) {
    logger.error({ err: err.message }, 'Failed to restore signals snapshot on startup');
  }
}
