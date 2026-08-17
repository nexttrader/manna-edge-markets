import fs from 'fs';
import path from 'path';
import { queryDb } from './database';
import { EdgeSetup, InvalidationAudit, PublishRun, Outcome } from '../discovery/types';
import { saveSignalsSnapshot } from './signal-snapshot-restore';

// ── Active Setup Queries ──

export async function getActiveSetups(market: string): Promise<EdgeSetup[]> {
    const table = market === 'forex' ? 'forex_edge_setups' : 'edge_setups';
    return await queryDb<EdgeSetup>(`SELECT * FROM ${table} WHERE superseded = 0 AND signal_state IN ('awaiting_entry', 'active')`);
}

export async function getAllActiveSetups(): Promise<EdgeSetup[]> {
    const futures = await getActiveSetups('futures');
    const forex = await getActiveSetups('forex');
    return [...futures, ...forex];
}

export async function getSetupById(id: string, market: string): Promise<EdgeSetup | undefined> {
    const primaryTable = market === 'forex' ? 'forex_edge_setups' : 'edge_setups';
    const fallbackTable = market === 'forex' ? 'edge_setups' : 'forex_edge_setups';
    let rows = await queryDb<EdgeSetup>(`SELECT * FROM ${primaryTable} WHERE id = ?`, [id]);
    if (!rows.length) {
        rows = await queryDb<EdgeSetup>(`SELECT * FROM ${fallbackTable} WHERE id = ?`, [id]);
    }
    return rows.length > 0 ? rows[0] : undefined;
}

export async function getSetupsByInstrument(instrument: string, market: string): Promise<EdgeSetup[]> {
    const table = market === 'forex' ? 'forex_edge_setups' : 'edge_setups';
    return await queryDb<EdgeSetup>(`SELECT * FROM ${table} WHERE instrument = ? AND superseded = 0 AND signal_state IN ('awaiting_entry', 'active')`, [instrument]);
}

export async function getSetupsByState(state: string): Promise<EdgeSetup[]> {
    // Use COALESCE so the stored market column takes priority; only fall back to the literal if the column is NULL.
    const futures = await queryDb<EdgeSetup>(`SELECT *, COALESCE(market, 'futures') AS market FROM edge_setups WHERE signal_state = ?`, [state]);
    const forex = await queryDb<EdgeSetup>(`SELECT *, COALESCE(market, 'forex') AS market FROM forex_edge_setups WHERE signal_state = ?`, [state]);
    return [...futures, ...forex];
}

export async function countActiveSetupsForInstrument(instrument: string, market: string, strategyId?: string): Promise<number> {
    const table = market === 'forex' ? 'forex_edge_setups' : 'edge_setups';
    if (strategyId) {
        const rows = await queryDb<{ count: string | number }>(`SELECT COUNT(*) as count FROM ${table} WHERE instrument = ? AND (strategy_id = ? OR (strategy_id IS NULL AND ? = 'sentinel_v2')) AND superseded = 0 AND signal_state IN ('awaiting_entry', 'active')`, [instrument, strategyId, strategyId]);
        return rows.length > 0 ? Number(rows[0].count) : 0;
    }
    const rows = await queryDb<{ count: string | number }>(`SELECT COUNT(*) as count FROM ${table} WHERE instrument = ? AND superseded = 0 AND signal_state IN ('awaiting_entry', 'active')`, [instrument]);
    return rows.length > 0 ? Number(rows[0].count) : 0;
}

export async function getPastSetups(market: string, limit: number = 50): Promise<EdgeSetup[]> {
    const table = market === 'forex' ? 'forex_edge_setups' : 'edge_setups';
    return await queryDb<EdgeSetup>(`SELECT * FROM ${table} WHERE signal_state IN ('invalidated', 'superseded', 'resolved') ORDER BY created_at DESC LIMIT ?`, [limit]);
}

export async function getAllPastSetups(limit: number = 50): Promise<EdgeSetup[]> {
    const futures = await getPastSetups('futures', limit);
    const forex = await getPastSetups('forex', limit);
    return [...futures, ...forex]
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(0, limit);
}

// ── Setup Mutations ──

export async function insertSetup(setup: EdgeSetup, market: string): Promise<void> {
    const table = market === 'forex' ? 'forex_edge_setups' : 'edge_setups';
    const keys = Object.keys(setup).filter(k => setup[k as keyof EdgeSetup] !== undefined);
    const values = keys.map(k => setup[k as keyof EdgeSetup]);
    const placeholders = keys.map(() => '?').join(', ');
    const query = `INSERT OR REPLACE INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`;
    await queryDb(query, values);
    
    // Auto update snapshot
    try {
        const active = await getAllActiveSetups();
        await saveSignalsSnapshot(active);
    } catch {}
}

export const createSetup = async (setup: EdgeSetup, market?: string): Promise<void> => {
    const m = market || setup.market || 'futures';
    await insertSetup(setup, m);
};

export async function updateSetupState(id: string, market: string, state: string, fields?: Partial<EdgeSetup>): Promise<void> {
    const primaryTable = market === 'forex' ? 'forex_edge_setups' : 'edge_setups';
    const fallbackTable = market === 'forex' ? 'edge_setups' : 'forex_edge_setups';
    const updates: Record<string, any> = { signal_state: state, ...fields };
    const keys = Object.keys(updates);
    const values = Object.values(updates);
    const setClause = keys.map(k => `${k} = ?`).join(', ');
    await queryDb(`UPDATE ${primaryTable} SET ${setClause} WHERE id = ?`, [...values, id]);
    await queryDb(`UPDATE ${fallbackTable} SET ${setClause} WHERE id = ?`, [...values, id]);

    // Auto update snapshot
    try {
        const active = await getAllActiveSetups();
        await saveSignalsSnapshot(active);
    } catch {}
}

export async function updateSetup(setup: EdgeSetup): Promise<void> {
    const market = setup.market || 'futures';
    const table = market === 'forex' ? 'forex_edge_setups' : 'edge_setups';
    await queryDb(`UPDATE ${table} SET 
        signal_state = ?, entry_triggered_at = ?, entry_price_recorded = ?,
        entry_price_executed = ?, superseded = ?, superseded_by = ?,
        invalidation_reason = ?, invalidation_detail = ?, tradable = ?,
        metadata = ?
        WHERE id = ?`, [
        setup.signal_state, setup.entry_triggered_at || null, setup.entry_price_recorded || null,
        setup.entry_price_executed || null, setup.superseded, setup.superseded_by || null,
        setup.invalidation_reason || null, setup.invalidation_detail || null, setup.tradable,
        setup.metadata || null, setup.id
    ]);

    // Auto update snapshot
    try {
        const active = await getAllActiveSetups();
        await saveSignalsSnapshot(active);
    } catch {}
}

// ── Invalidation Audit ──

export async function insertInvalidationAudit(audit: InvalidationAudit): Promise<void> {
    await queryDb(`INSERT INTO invalidation_audit (id, setup_id, instrument, setup_market, run_id, timestamp, reason_code, detail, previous_state, new_state, created_by) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
        audit.id, audit.setup_id, audit.instrument || null, audit.setup_market, audit.run_id || null,
        audit.timestamp, audit.reason_code, audit.detail || null,
        audit.previous_state || null, audit.new_state || null, audit.created_by || null
    ]);
}

export const createInvalidationAudit = insertInvalidationAudit;

export async function getRecentInvalidations(limit: number = 50): Promise<any[]> {
    const records = await queryDb<any>(`SELECT * FROM invalidation_audit ORDER BY timestamp DESC LIMIT ?`, [limit]);
    return await Promise.all(records.map(async r => {
        let setup = await getSetupById(r.setup_id, r.setup_market || 'futures');
        if (!setup) setup = await getSetupById(r.setup_id, 'forex');
        const symbol = r.instrument || setup?.instrument;
        return {
            ...r,
            instrument: symbol || (r.setup_market === 'forex' ? 'EUR/USD' : 'NQ'),
            bias: setup?.bias
        };
    }));
}

export async function getSetupHistory(setupId: string, market: string): Promise<InvalidationAudit[]> {
    return await queryDb<InvalidationAudit>(`SELECT * FROM invalidation_audit WHERE setup_id = ? AND setup_market = ? ORDER BY timestamp ASC`, [setupId, market]);
}

export async function getInvalidationsByRun(runId: string): Promise<InvalidationAudit[]> {
    return await queryDb<InvalidationAudit>(`SELECT * FROM invalidation_audit WHERE run_id = ? ORDER BY timestamp ASC`, [runId]);
}

export async function getInvalidationStats(): Promise<{ total: number, byReason: Record<string, number>, last24h: number }> {
    const totalRows = await queryDb<{ c: string | number }>(`SELECT COUNT(*) as c FROM invalidation_audit`);
    const total = totalRows.length > 0 ? Number(totalRows[0].c) : 0;
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const last24hRows = await queryDb<{ c: string | number }>(`SELECT COUNT(*) as c FROM invalidation_audit WHERE timestamp > ?`, [cutoff]);
    const last24h = last24hRows.length > 0 ? Number(last24hRows[0].c) : 0;
    const reasons = await queryDb<{ reason_code: string, c: string | number }>(`SELECT reason_code, COUNT(*) as c FROM invalidation_audit GROUP BY reason_code`);
    const byReason: Record<string, number> = {};
    for (const r of reasons) { byReason[r.reason_code] = Number(r.c); }
    return { total, byReason, last24h };
}

// ── Publish Runs ──

export async function insertPublishRun(run: any): Promise<void> {
    await queryDb(`INSERT INTO publish_runs (id, run_timestamp, killzone, market, run_mode, run_state, setups_created, setups_invalidated, setups_preserved, summary_json, error_detail, trigger_type, created_at) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
        run.id, run.run_timestamp, run.killzone, run.market || null,
        run.run_mode, run.run_state, run.setups_created || 0, run.setups_invalidated || 0,
        run.setups_preserved || 0, run.summary_json || null, run.error_detail || null,
        run.trigger_type || 'scheduled', run.created_at
    ]);
}

export const createPublishRun = async (run: any): Promise<void> => {
    const pr: any = {
        id: run.id,
        run_timestamp: run.run_timestamp || run.created_at || new Date().toISOString(),
        killzone: run.killzone || run.killzone_id || 'unknown',
        market: run.market,
        run_mode: run.run_mode || run.mode || 'live',
        run_state: run.run_state || run.state || 'running',
        setups_created: run.setups_created || 0,
        setups_invalidated: run.setups_invalidated || 0,
        setups_preserved: run.setups_preserved || 0,
        summary_json: run.summary_json,
        error_detail: run.error_detail,
        trigger_type: run.trigger_type || 'scheduled',
        created_at: run.created_at || new Date().toISOString()
    };
    await insertPublishRun(pr);
};

export async function updatePublishRun(idOrRun: string | any, updates?: Partial<PublishRun>): Promise<void> {
    if (typeof idOrRun === 'string' && updates) {
        const keys = Object.keys(updates);
        const values = Object.values(updates);
        const setClause = keys.map(k => `${k} = ?`).join(', ');
        await queryDb(`UPDATE publish_runs SET ${setClause} WHERE id = ?`, [...values, idOrRun]);
    } else if (typeof idOrRun === 'object') {
        const run = idOrRun;
        await queryDb(`UPDATE publish_runs SET run_state = ?, setups_created = ?, setups_invalidated = ?, setups_preserved = ?, summary_json = ?, error_detail = ? WHERE id = ?`, [
            run.run_state || run.state || 'completed',
            run.setups_created || run.stats?.created || 0,
            run.setups_invalidated || run.stats?.invalidated || 0,
            run.setups_preserved || run.stats?.preserved || 0,
            run.summary_json || (run.stats ? JSON.stringify(run.stats) : null),
            run.error_detail || null,
            run.id
        ]);
    }
}

export async function getPublishRun(id: string): Promise<PublishRun | undefined> {
    const rows = await queryDb<PublishRun>(`SELECT * FROM publish_runs WHERE id = ?`, [id]);
    return rows.length > 0 ? rows[0] : undefined;
}

export async function getRecentPublishRuns(limit: number = 20): Promise<PublishRun[]> {
    return await queryDb<PublishRun>(`SELECT * FROM publish_runs ORDER BY created_at DESC LIMIT ?`, [limit]);
}

export async function getSetupsByRun(runId: string): Promise<EdgeSetup[]> {
    const futures = await queryDb<EdgeSetup>(`SELECT * FROM edge_setups WHERE created_by_run = ?`, [runId]);
    const forex = await queryDb<EdgeSetup>(`SELECT * FROM forex_edge_setups WHERE created_by_run = ?`, [runId]);
    return [...futures, ...forex];
}

// ── Outcomes ──

export async function insertOutcome(outcome: Outcome): Promise<void> {
    await queryDb(`INSERT INTO outcomes (id, setup_id, setup_market, run_id, outcome_type, execution_price, execution_time, realized_pl, mae, mfe, highest_price, lowest_price, bars_held, duration_min, exit_reason, strategy_id, was_runner, runner_realized_r, is_breakeven, notes, created_at) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
        outcome.id, outcome.setup_id, outcome.setup_market, outcome.run_id || null,
        outcome.outcome_type, outcome.execution_price || null, outcome.execution_time || null,
        outcome.realized_pl || null, outcome.mae || null, outcome.mfe || null,
        outcome.highest_price || null, outcome.lowest_price || null,
        outcome.bars_held || null, outcome.duration_min || null, outcome.exit_reason || null,
        outcome.strategy_id || 'sentinel_v2',
        (outcome as any).was_runner || 0,
        (outcome as any).runner_realized_r || 0.0,
        (outcome as any).is_breakeven || 0,
        outcome.notes || null, outcome.created_at
    ]);
}

export const createOutcome = async (outcome: any): Promise<void> => {
    const rawStratId = outcome.strategy_id || 'sentinel_v2';
    const analyticsStratId = rawStratId;
    const o: Outcome = {
        id: outcome.id,
        setup_id: outcome.setup_id,
        setup_market: outcome.setup_market || 'futures',
        strategy_id: analyticsStratId,
        outcome_type: outcome.outcome_type,
        execution_price: outcome.execution_price,
        execution_time: outcome.execution_time || outcome.resolved_at || new Date().toISOString(),
        realized_pl: outcome.realized_pl,
        mae: outcome.mae,
        mfe: outcome.mfe,
        highest_price: outcome.highest_price,
        lowest_price: outcome.lowest_price,
        bars_held: outcome.bars_held,
        duration_min: outcome.duration_min,
        exit_reason: outcome.exit_reason,
        notes: outcome.notes,
        created_at: outcome.created_at || new Date().toISOString()
    };
    (o as any).was_runner = outcome.was_runner || 0;
    (o as any).runner_realized_r = outcome.runner_realized_r || 0.0;
    (o as any).is_breakeven = outcome.is_breakeven || 0;
    await insertOutcome(o);
};

export async function updateOutcomeBySetupId(setupId: string, updates: Partial<Outcome>): Promise<void> {
    const keys = Object.keys(updates);
    const values = Object.values(updates);
    const setClause = keys.map(k => `${k} = ?`).join(', ');
    await queryDb(`UPDATE outcomes SET ${setClause} WHERE setup_id = ?`, [...values, setupId]);
}

export async function getOutcomesBySetup(setupId: string): Promise<Outcome[]> {
    return await queryDb<Outcome>(`SELECT * FROM outcomes WHERE setup_id = ?`, [setupId]);
}

export async function getOutcomesByRun(runId: string): Promise<Outcome[]> {
    return await queryDb<Outcome>(`SELECT * FROM outcomes WHERE run_id = ?`, [runId]);
}

// ── Strategy Settings ──

export async function getStrategySettings(role?: string, userEmail?: string): Promise<{ id: string, name: string, enabled: boolean, visibleToAdmins: boolean, visibleToTraders: boolean }[]> {
    try {
        let rows = await queryDb<{ id: string, name: string, enabled: number, visible_to_admins?: number, visible_to_traders?: number }>(`SELECT * FROM strategy_settings WHERE id != 'manna_basic' ORDER BY id ASC`);
        
        if (!rows || rows.length === 0) {
            try {
                await queryDb(`INSERT INTO strategy_settings (id, name, enabled, visible_to_admins, visible_to_traders, updated_at) VALUES
                    ('manna_snd', 'Manna SnD', 1, 1, 1, CURRENT_TIMESTAMP),
                    ('sentinel_v2', 'Manna Elite V1', 1, 1, 1, CURRENT_TIMESTAMP)
                    ON CONFLICT (id) DO NOTHING`);
                rows = await queryDb<{ id: string, name: string, enabled: number, visible_to_admins?: number, visible_to_traders?: number }>(`SELECT * FROM strategy_settings WHERE id != 'manna_basic' ORDER BY id ASC`);
            } catch {}
        }

        const mapped = rows.map(r => ({
            id: r.id,
            name: r.name,
            enabled: Boolean(r.enabled),
            visibleToAdmins: r.visible_to_admins !== undefined ? Boolean(r.visible_to_admins) : true,
            visibleToTraders: r.visible_to_traders !== undefined ? Boolean(r.visible_to_traders) : true
        }));

        if (role === 'super_admin') {
            return mapped;
        }

        const hiddenIds = await getHiddenStrategyIdsForRole(role || 'trader', userEmail);
        return mapped.filter(s => !hiddenIds.includes(s.id));
    } catch {
        return [
            { id: 'manna_snd', name: 'Manna SnD', enabled: true, visibleToAdmins: true, visibleToTraders: true },
            { id: 'sentinel_v2', name: 'Manna Elite V1', enabled: true, visibleToAdmins: true, visibleToTraders: true }
        ];
    }
}

export async function updateStrategyEnabled(id: string, enabled: boolean): Promise<void> {
    const val = enabled ? 1 : 0;
    await queryDb(`UPDATE strategy_settings SET enabled = ?, updated_at = ? WHERE id = ?`, [val, new Date().toISOString(), id]);
}

export async function updateStrategyVisibility(id: string, visibleToAdmins: boolean): Promise<void> {
    const val = visibleToAdmins ? 1 : 0;
    await queryDb(`UPDATE strategy_settings SET visible_to_admins = ?, updated_at = ? WHERE id = ?`, [val, new Date().toISOString(), id]);
}

export async function deleteStrategy(id: string): Promise<void> {
    await queryDb(`DELETE FROM strategy_settings WHERE id = ?`, [id]);
}

export async function getAdminStrategyAccess(strategyId: string): Promise<string[]> {
    try {
        const rows = await queryDb<{ user_email: string }>(`SELECT user_email FROM admin_strategy_access WHERE strategy_id = ?`, [strategyId]);
        return rows.map(r => r.user_email.toLowerCase());
    } catch {
        return [];
    }
}

export async function setAdminStrategyAccess(strategyId: string, allowedEmails: string[]): Promise<void> {
    try {
        await queryDb(`DELETE FROM admin_strategy_access WHERE strategy_id = ?`, [strategyId]);
        for (const email of allowedEmails) {
            if (email && email.trim()) {
                await queryDb(`INSERT INTO admin_strategy_access (user_email, strategy_id) VALUES (?, ?) ON CONFLICT DO NOTHING`, [email.trim().toLowerCase(), strategyId]);
            }
        }
    } catch {}
}

export async function grantAdminStrategyAccess(userEmail: string, strategyId: string): Promise<void> {
    try {
        await queryDb(`INSERT INTO admin_strategy_access (user_email, strategy_id) VALUES (?, ?) ON CONFLICT DO NOTHING`, [userEmail.trim().toLowerCase(), strategyId]);
    } catch {}
}

export async function revokeAdminStrategyAccess(userEmail: string, strategyId: string): Promise<void> {
    try {
        await queryDb(`DELETE FROM admin_strategy_access WHERE user_email = ? AND strategy_id = ?`, [userEmail.trim().toLowerCase(), strategyId]);
    } catch {}
}

export async function getHiddenStrategyIdsForRole(role: string, userEmail?: string): Promise<string[]> {
    try {
        let rows = await queryDb<{ id: string, enabled?: number, visible_to_admins?: number, visible_to_traders?: number }>(`SELECT * FROM strategy_settings WHERE id != 'manna_basic'`);
        if (!rows || rows.length === 0) {
            await getStrategySettings('super_admin');
            rows = await queryDb<{ id: string, enabled?: number, visible_to_admins?: number, visible_to_traders?: number }>(`SELECT * FROM strategy_settings WHERE id != 'manna_basic'`);
        }
        const emailLower = userEmail ? userEmail.trim().toLowerCase() : '';
        
        let grantedAccessMap: Record<string, string[]> = {};
        if (role === 'admin' && emailLower) {
            const accessRows = await queryDb<{ strategy_id: string, user_email: string }>(`SELECT strategy_id, user_email FROM admin_strategy_access`);
            for (const r of accessRows) {
                if (!grantedAccessMap[r.strategy_id]) grantedAccessMap[r.strategy_id] = [];
                grantedAccessMap[r.strategy_id].push(r.user_email.toLowerCase());
            }
        }

        const hiddenRows = rows.filter(r => {
            // Disabled strategies are hidden for all non-super-admin users
            if (r.enabled === 0 || (r.enabled as any) === false) return true;
            if (role === 'super_admin') return false; // super admin sees all enabled strategies
            if (role === 'admin') {
                const isGloballyVisibleToAdmins = r.visible_to_admins === undefined ? true : Boolean(r.visible_to_admins);
                if (isGloballyVisibleToAdmins) return false;
                // If not globally visible to all admins, check if this specific admin was granted explicit access
                const allowedAdmins = grantedAccessMap[r.id] || [];
                return !allowedAdmins.includes(emailLower);
            }
            // trader or default
            return !(r.visible_to_traders === undefined ? true : Boolean(r.visible_to_traders));
        });

        return hiddenRows.map(r => r.id);
    } catch {
        return [];
    }
}

export async function getStrategyTuning(strategyId: string = 'sentinel_v2') {
    try {
        const rows = await queryDb<{
            super_admin_max_signals?: number,
            super_admin_min_conviction?: number,
            public_max_signals?: number,
            public_min_conviction?: number
        }>(`SELECT super_admin_max_signals, super_admin_min_conviction, public_max_signals, public_min_conviction FROM strategy_settings WHERE id = ?`, [strategyId]);
        
        const row = rows[0] || {};
        return {
            superAdminMaxSignals: row.super_admin_max_signals ?? 6,
            superAdminMinConviction: row.super_admin_min_conviction ?? 70.0,
            publicMaxSignals: row.public_max_signals ?? 6,
            publicMinConviction: row.public_min_conviction ?? 70.0
        };
    } catch {
        return { superAdminMaxSignals: 6, superAdminMinConviction: 70.0, publicMaxSignals: 6, publicMinConviction: 70.0 };
    }
}

export async function updateStrategyTuning(
    strategyId: string = 'sentinel_v2',
    superAdminMaxSignals: number,
    superAdminMinConviction: number,
    publicMaxSignals: number,
    publicMinConviction: number
) {
    const rows = await queryDb<{ id: string }>(`SELECT id FROM strategy_settings WHERE id = ?`, [strategyId]);
    if (!rows || rows.length === 0) {
        await queryDb(`INSERT INTO strategy_settings (id, name, enabled, visible_to_admins, visible_to_traders, super_admin_max_signals, super_admin_min_conviction, public_max_signals, public_min_conviction, updated_at) VALUES (?, ?, 1, 1, 1, ?, ?, ?, ?, CURRENT_TIMESTAMP)`, [
            strategyId,
            strategyId === 'sentinel_v2' ? 'Manna Elite V1' : 'Manna SnD',
            superAdminMaxSignals,
            superAdminMinConviction,
            publicMaxSignals,
            publicMinConviction
        ]);
    } else {
        await queryDb(`UPDATE strategy_settings SET 
            super_admin_max_signals = ?,
            super_admin_min_conviction = ?,
            public_max_signals = ?,
            public_min_conviction = ?,
            updated_at = CURRENT_TIMESTAMP
            WHERE id = ?`, [superAdminMaxSignals, superAdminMinConviction, publicMaxSignals, publicMinConviction, strategyId]);
    }
}

export async function updateStrategyTraderVisibility(id: string, visibleToTraders: boolean): Promise<void> {
    const val = visibleToTraders ? 1 : 0;
    try {
        await queryDb(`INSERT INTO strategy_settings (id, name, enabled, visible_to_traders, updated_at) VALUES (?, ?, 1, ?, ?) ON CONFLICT(id) DO UPDATE SET visible_to_traders = EXCLUDED.visible_to_traders, updated_at = EXCLUDED.updated_at`, [id, id === 'sentinel_v2' ? 'Manna Elite V1' : 'Manna SnD', val, new Date().toISOString()]);
    } catch {
        await queryDb(`UPDATE strategy_settings SET visible_to_traders = ?, updated_at = ? WHERE id = ?`, [val, new Date().toISOString(), id]);
    }
}

export interface MaintenanceState {
  enabled: boolean;
  message: string;
  estimatedReturnTime: string;
  updatedAt: string;
  updatedBy?: string;
}

const MAINTENANCE_FILE_PATH = path.resolve(process.cwd(), 'src/db/system_maintenance_state.json');
const MAINTENANCE_FILE_TMP = '/tmp/system_maintenance_state.json';

export async function getMaintenanceState(): Promise<MaintenanceState> {
  try {
    const rows = await queryDb<any>(`SELECT * FROM system_maintenance WHERE id = 'current'`);
    if (rows && rows.length > 0) {
      const r = rows[0];
      const state = {
        enabled: Boolean(r.enabled === 1 || r.enabled === true),
        message: r.message || 'Manna is currently undergoing scheduled system maintenance.',
        estimatedReturnTime: r.estimated_return_time || 'Asia Session Today',
        updatedAt: r.updated_at || new Date().toISOString(),
        updatedBy: r.updated_by || 'admin'
      };
      try {
        fs.writeFileSync(MAINTENANCE_FILE_PATH, JSON.stringify(state, null, 2), 'utf8');
        fs.writeFileSync(MAINTENANCE_FILE_TMP, JSON.stringify(state, null, 2), 'utf8');
      } catch {}
      return state;
    }
  } catch {}

  for (const fpath of [MAINTENANCE_FILE_PATH, MAINTENANCE_FILE_TMP]) {
    try {
      if (fs.existsSync(fpath)) {
        const parsed = JSON.parse(fs.readFileSync(fpath, 'utf8'));
        if (parsed && typeof parsed.enabled === 'boolean') {
          return parsed;
        }
      }
    } catch {}
  }

  return {
    enabled: false,
    message: 'Manna is currently undergoing scheduled system maintenance.',
    estimatedReturnTime: 'Asia Session Today',
    updatedAt: new Date().toISOString(),
    updatedBy: 'admin'
  };
}

export async function setMaintenanceState(enabled: boolean, message: string, estimatedReturnTime: string, updatedBy: string = 'admin'): Promise<MaintenanceState> {
  const val = enabled ? 1 : 0;
  const now = new Date().toISOString();
  const msg = message || 'Manna is currently undergoing scheduled system maintenance.';
  const est = estimatedReturnTime || 'Asia Session Today';
  const state = { enabled, message: msg, estimatedReturnTime: est, updatedAt: now, updatedBy };

  try {
    const rows = await queryDb<any>(`SELECT id FROM system_maintenance WHERE id = 'current'`);
    if (!rows || rows.length === 0) {
      await queryDb(
        `INSERT INTO system_maintenance (id, enabled, message, estimated_return_time, updated_at, updated_by) VALUES ('current', ?, ?, ?, ?, ?)`,
        [val, msg, est, now, updatedBy]
      );
    } else {
      await queryDb(
        `UPDATE system_maintenance SET enabled = ?, message = ?, estimated_return_time = ?, updated_at = ?, updated_by = ? WHERE id = 'current'`,
        [val, msg, est, now, updatedBy]
      );
    }
  } catch (err) {
    console.error('Error updating system maintenance:', err);
  }

  try {
    fs.writeFileSync(MAINTENANCE_FILE_PATH, JSON.stringify(state, null, 2), 'utf8');
    fs.writeFileSync(MAINTENANCE_FILE_TMP, JSON.stringify(state, null, 2), 'utf8');
  } catch {}

  return state;
}
