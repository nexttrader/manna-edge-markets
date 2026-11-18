import { queryDb } from './database';
import { isPreCutoffScalpTrade, isWeekendTrade, SCALP_TRACKING_START_DAY } from '../scheduler/killzone-mapper';

export interface WeekendCleanupResult {
  outcomesRemoved: number;
  intradaySetupsRemoved: number;
  mtfSetupsRemoved: number;
  exclusiveSetupsRemoved: number;
  totalRemoved: number;
}

/**
 * Removes any Saturday/Sunday or weekend-closed-market trades and outcomes
 * across Intraday (`outcomes`, `edge_setups`, `forex_edge_setups`),
 * Scalping/Swing (`mtf_style_setups`), and Elite Fractal (`superadmin_edge_setups`).
 */
export async function purgeWeekendTradesFromDb(): Promise<WeekendCleanupResult> {
  let outcomesRemoved = 0;
  let intradaySetupsRemoved = 0;
  let mtfSetupsRemoved = 0;
  let exclusiveSetupsRemoved = 0;

  // 1. Intraday outcomes joined with parent setup metadata
  try {
    const outcomeRows = await queryDb<any>(`
      SELECT
        o.id,
        o.setup_id,
        o.setup_market,
        o.execution_time,
        o.created_at,
        COALESCE(e.instrument, f.instrument) AS instrument,
        COALESCE(e.market, f.market, o.setup_market) AS market,
        COALESCE(e.created_at, f.created_at) AS time_signaled,
        COALESCE(e.entry_triggered_at, f.entry_triggered_at) AS time_entered,
        COALESCE(e.resolved_at, f.resolved_at, o.execution_time, o.created_at) AS time_exited
      FROM outcomes o
      LEFT JOIN edge_setups e ON o.setup_id = e.id
      LEFT JOIN forex_edge_setups f ON o.setup_id = f.id
    `);

    const badOutcomeIds: string[] = [];
    const badFuturesSetupIds = new Set<string>();
    const badForexSetupIds = new Set<string>();

    for (const row of outcomeRows) {
      if (isWeekendTrade(row)) {
        badOutcomeIds.push(String(row.id));
        const mkt = String(row.market || row.setup_market || '').toLowerCase();
        if (mkt === 'forex' || (row.instrument && String(row.instrument).includes('/'))) {
          badForexSetupIds.add(String(row.setup_id));
        } else {
          badFuturesSetupIds.add(String(row.setup_id));
        }
      }
    }

    for (const id of badOutcomeIds) {
      await queryDb(`DELETE FROM outcomes WHERE id = ?`, [id]);
      outcomesRemoved++;
    }

    // Also catch any resolved/active/awaiting setups created or resolved on weekends
    for (const table of ['edge_setups', 'forex_edge_setups'] as const) {
      const setupRows = await queryDb<any>(
        `SELECT id, instrument, market, created_at, entry_triggered_at, resolved_at, signal_state FROM ${table}`
      );
      const targetSet = table === 'forex_edge_setups' ? badForexSetupIds : badFuturesSetupIds;
      for (const s of setupRows) {
        if (targetSet.has(String(s.id)) || isWeekendTrade(s)) {
          await queryDb(`DELETE FROM outcomes WHERE setup_id = ?`, [s.id]);
          await queryDb(`DELETE FROM ${table} WHERE id = ?`, [s.id]);
          intradaySetupsRemoved++;
        }
      }
    }
  } catch {
    // Tables may not exist on fresh test initialization
  }

  // 2. Scalping & Swing (`mtf_style_setups`)
  try {
    const mtfRows = await queryDb<any>(
      `SELECT id, instrument, market, created_at, entry_triggered_at, filled_at, resolved_at, updated_at, signal_state FROM mtf_style_setups`
    );
    for (const r of mtfRows) {
      const isClosedState = ['resolved', 'runner', 'tp1_hit', 'tp2_hit', 'stopped', 'expired', 'invalidated'].includes(
        String(r.signal_state || '')
      );
      const candidate = {
        instrument: r.instrument,
        market: r.market,
        time_signaled: r.created_at,
        time_entered: r.entry_triggered_at || r.filled_at,
        time_exited: isClosedState ? (r.resolved_at || r.updated_at || r.filled_at || r.created_at) : undefined
      };
      if (isWeekendTrade(candidate)) {
        await queryDb(`DELETE FROM mtf_style_setups WHERE id = ?`, [r.id]);
        mtfSetupsRemoved++;
      }
    }
  } catch {
    // Table is created lazily by MTF tracker
  }

  // 3. Elite Fractal (`superadmin_edge_setups`)
  try {
    const efRows = await queryDb<any>(
      `SELECT id, instrument, market, created_at, entry_triggered_at, resolved_at, signal_state FROM superadmin_edge_setups`
    );
    for (const s of efRows) {
      const isClosedState = ['resolved', 'invalidated', 'superseded'].includes(String(s.signal_state || ''));
      const candidate = {
        instrument: s.instrument,
        market: s.market,
        time_signaled: s.created_at,
        time_entered: s.entry_triggered_at,
        time_exited: isClosedState ? (s.resolved_at || s.created_at) : undefined
      };
      if (isWeekendTrade(candidate)) {
        await queryDb(`DELETE FROM superadmin_edge_setups WHERE id = ?`, [s.id]);
        exclusiveSetupsRemoved++;
      }
    }
  } catch {
    // Table may not exist yet
  }

  const totalRemoved = outcomesRemoved + intradaySetupsRemoved + mtfSetupsRemoved + exclusiveSetupsRemoved;
  if (totalRemoved > 0) {
    console.log(
      `🧹 Purged weekend trades from DB: outcomes=${outcomesRemoved}, intradaySetups=${intradaySetupsRemoved}, mtfSetups=${mtfSetupsRemoved}, exclusiveSetups=${exclusiveSetupsRemoved}`
    );
  }

  return {
    outcomesRemoved,
    intradaySetupsRemoved,
    mtfSetupsRemoved,
    exclusiveSetupsRemoved,
    totalRemoved
  };
}

/**
 * Removes all historical Scalping (`SCALP` / `manna_scalper`) trade records before
 * `SCALP_TRACKING_START_DAY` (2026-11-18 ET) while keeping Scalping trades from today onwards.
 */
export async function purgePreCutoffScalpTradesFromDb(
  cutoffDay: string = SCALP_TRACKING_START_DAY
): Promise<{ scalpMtfRemoved: number; scalpOutcomesRemoved: number }> {
  let scalpMtfRemoved = 0;
  let scalpOutcomesRemoved = 0;

  try {
    const mtfScalpRows = await queryDb<any>(
      `SELECT id, trading_style, strategy_id, created_at, updated_at, resolved_at, filled_at, signal_state
       FROM mtf_style_setups
       WHERE trading_style = 'SCALP' OR strategy_id = 'manna_scalper'`
    );
    for (const r of mtfScalpRows) {
      if (isPreCutoffScalpTrade({
        trading_style: r.trading_style,
        strategy_id: r.strategy_id,
        time_signaled: r.created_at,
        time_exited: r.resolved_at || r.updated_at || r.filled_at || r.created_at
      }, cutoffDay)) {
        await queryDb(`DELETE FROM mtf_style_setups WHERE id = ?`, [r.id]);
        scalpMtfRemoved++;
      }
    }
  } catch {
    // Table may not exist yet
  }

  try {
    const legacyScalpOutcomes = await queryDb<any>(
      `SELECT id, setup_id, strategy_id, execution_time, created_at FROM outcomes WHERE strategy_id = 'manna_scalper'`
    );
    for (const o of legacyScalpOutcomes) {
      if (isPreCutoffScalpTrade({
        strategy_id: o.strategy_id,
        time_signaled: o.created_at,
        time_exited: o.execution_time || o.created_at
      }, cutoffDay)) {
        await queryDb(`DELETE FROM outcomes WHERE id = ?`, [o.id]);
        scalpOutcomesRemoved++;
      }
    }
  } catch {
    // Table may not exist yet
  }

  if (scalpMtfRemoved + scalpOutcomesRemoved > 0) {
    console.log(
      `🧹 Purged pre-${cutoffDay} Scalping records: mtf_style_setups=${scalpMtfRemoved}, outcomes=${scalpOutcomesRemoved}`
    );
  }

  return { scalpMtfRemoved, scalpOutcomesRemoved };
}
