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
    // Use standard UPSERT syntax compatible with both PostgreSQL and SQLite ≥ 3.24
    const nonIdKeys = keys.filter(k => k !== 'id');
    const setClause = nonIdKeys.map(k => `${k} = excluded.${k}`).join(', ');
    const query = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders}) ON CONFLICT (id) DO UPDATE SET ${setClause}`;
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

    // ── Backfill client tag outcomes ──────────────────────────────────────────
    // When a tagged signal resolves, mark its outcome so Super Admin can compute accuracy.
    try {
      const typeStr = String(outcome.outcome_type || '').toLowerCase();
      const isWin = typeStr.includes('tp1') || typeStr.includes('tp2');
      const outcomeR = outcome.realized_pl ?? (isWin ? (outcome.r_multiple_1 || 2.0) : typeStr.includes('sl') || typeStr.includes('stop') ? -1.0 : 0.0);
      await queryDb(
        `UPDATE client_signal_tags SET outcome_type = ?, outcome_r = ?, outcome_resolved_at = ?, was_correct = ? WHERE setup_id = ? AND outcome_type IS NULL`,
        [outcome.outcome_type, outcomeR, new Date().toISOString(), isWin ? 1 : 0, outcome.setup_id]
      );
    } catch { /* non-critical, never block outcome writes */ }
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

// ── Notification Feature Toggles & Multi-Market Governance ───────────────────

export interface NotificationSetting {
  key: string;
  label: string;
  description: string;
  category: 'master' | 'signal' | 'manage' | 'status' | 'report' | 'action';
  market: string; // 'all' | 'futures' | 'forex' | custom market name
  enabled: boolean;
  updated_at: string;
}

export interface RegisteredMarket {
  market: string;
  label: string;
  created_at: string;
}

const NOTIF_SNAPSHOT_PATH = path.resolve(__dirname, '../../../notification_settings_snapshot.json');

const BASE_NOTIF_DEFAULTS: Array<{ key: string; label: string; description: string; category: NotificationSetting['category']; market: string }> = [
  // ── Global Master Category Toggles ──
  { key: 'notify_all_signal',         label: 'All Signals (Global Master)',          description: 'Master switch to toggle ON/OFF all SIGNAL notifications across all markets', category: 'master', market: 'all' },
  { key: 'notify_all_manage',         label: 'All Trade Management (Global Master)',  description: 'Master switch to toggle ON/OFF all MANAGE instructions (Invalidations, BE, TP1, TP2, Cancels)', category: 'master', market: 'all' },
  { key: 'notify_all_status',         label: 'All Status Updates (Global Master)',    description: 'Master switch to toggle ON/OFF all STATUS updates (Order Filled, SL Hit, BE Exit)', category: 'master', market: 'all' },

  // ── Futures Market Category Toggles ──
  { key: 'market_futures_all',        label: 'Futures Alerts Master',                 description: 'Master switch to toggle ON/OFF all notifications for Futures trades', category: 'master', market: 'futures' },
  { key: 'futures_signals',           label: 'Futures Signals (SIGNAL)',              description: 'Send SIGNAL alerts for new Futures setups (NQ, ES, YM, GC, CL)', category: 'signal', market: 'futures' },
  { key: 'futures_manage',            label: 'Futures Management (MANAGE)',           description: 'Send all MANAGE updates for Futures trades (Invalidations, BE, TP1, TP2, Superseded)', category: 'manage', market: 'futures' },
  { key: 'futures_status',            label: 'Futures Status Updates (STATUS)',       description: 'Send STATUS lifecycle updates for Futures trades (Entry Filled, Stop Loss, BE Exit)', category: 'status', market: 'futures' },

  // ── Forex Market Category Toggles ──
  { key: 'market_forex_all',          label: 'Forex Alerts Master',                   description: 'Master switch to toggle ON/OFF all notifications for Forex trades', category: 'master', market: 'forex' },
  { key: 'forex_signals',             label: 'Forex Signals (SIGNAL)',                description: 'Send SIGNAL alerts for new Forex setups (EURUSD, GBPUSD, USDJPY, AUDUSD)', category: 'signal', market: 'forex' },
  { key: 'forex_manage',              label: 'Forex Management (MANAGE)',             description: 'Send all MANAGE updates for Forex trades (Invalidations, BE, TP1, TP2, Superseded)', category: 'manage', market: 'forex' },
  { key: 'forex_status',              label: 'Forex Status Updates (STATUS)',         description: 'Send STATUS lifecycle updates for Forex trades (Entry Filled, Stop Loss, BE Exit)', category: 'status', market: 'forex' },

  // ── Granular Event Action Toggles ──
  { key: 'notify_new_signal',         label: 'New Signal Alert',                      description: 'Send SIGNAL alert when a new high-conviction setup is published', category: 'signal', market: 'all' },
  { key: 'notify_invalidation',       label: 'Pre-Entry Invalidation (MANAGE)',       description: 'Send MANAGE instruction when zone is invalidated before order fill (price blows through)', category: 'manage', market: 'all' },
  { key: 'notify_superseded_cancel',  label: 'Signal Cancelled (MANAGE)',             description: 'Send MANAGE cancel instruction when a pending order is superseded by a fresher scan', category: 'manage', market: 'all' },
  { key: 'notify_move_to_breakeven',  label: 'Move to Breakeven (MANAGE)',            description: 'Send MANAGE instruction when trade hits +1.0R to move SL to BE', category: 'manage', market: 'all' },
  { key: 'notify_tp1_hit',            label: 'TP1 Hit (MANAGE)',                      description: 'Send MANAGE when TP1 (+2.0R) is achieved — partial close instruction', category: 'manage', market: 'all' },
  { key: 'notify_tp2_hit',            label: 'TP2 Hit (MANAGE)',                      description: 'Send MANAGE when TP2 (+3.0R) runner is achieved — full close instruction', category: 'manage', market: 'all' },
  { key: 'notify_entry_triggered',    label: 'Entry Triggered (STATUS)',              description: 'Send STATUS when price enters zone and order is filled/live', category: 'status', market: 'all' },
  { key: 'notify_sl_hit',             label: 'Stop Loss Hit (STATUS)',                description: 'Send STATUS when Stop Loss (-1.0R) is triggered', category: 'status', market: 'all' },
  { key: 'notify_be_hit',             label: 'Breakeven Exit (STATUS)',               description: 'Send STATUS when trade exits at Breakeven (0.0R)', category: 'status', market: 'all' },
  { key: 'notify_performance_report', label: 'Performance Reports',                   description: 'Broadcast weekly/monthly performance recap summaries to Telegram', category: 'report', market: 'all' },
];

function saveSnapshotToDisk(settingsMap: Record<string, boolean>): void {
  try {
    fs.writeFileSync(NOTIF_SNAPSHOT_PATH, JSON.stringify(settingsMap, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to save notification settings snapshot to disk:', err);
  }
}

function loadSnapshotFromDisk(): Record<string, boolean> {
  try {
    if (fs.existsSync(NOTIF_SNAPSHOT_PATH)) {
      const data = fs.readFileSync(NOTIF_SNAPSHOT_PATH, 'utf8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('Failed to load notification settings snapshot from disk:', err);
  }
  return {};
}

async function ensureNotifSettingsSeeded(): Promise<void> {
  try {
    await queryDb(`CREATE TABLE IF NOT EXISTS registered_markets (
      market TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);

    await queryDb(`CREATE TABLE IF NOT EXISTS notification_settings (
      key TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      description TEXT NOT NULL,
      category TEXT DEFAULT 'action',
      market TEXT DEFAULT 'all',
      enabled INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);

    try { await queryDb(`ALTER TABLE notification_settings ADD COLUMN category TEXT DEFAULT 'action'`); } catch {}
    try { await queryDb(`ALTER TABLE notification_settings ADD COLUMN market TEXT DEFAULT 'all'`); } catch {}

    // Seed default registered markets
    await queryDb(`INSERT INTO registered_markets (market, label, created_at) VALUES ('futures', 'Futures', CURRENT_TIMESTAMP) ON CONFLICT (market) DO NOTHING`);
    await queryDb(`INSERT INTO registered_markets (market, label, created_at) VALUES ('forex', 'Forex', CURRENT_TIMESTAMP) ON CONFLICT (market) DO NOTHING`);

    // Fetch all registered markets to generate dynamic toggles for any custom markets
    const markets = await queryDb<{ market: string; label: string }>(`SELECT market, label FROM registered_markets`);
    const allDefaults = [...BASE_NOTIF_DEFAULTS];

    for (const m of markets) {
      const mKey = m.market.toLowerCase().trim();
      if (mKey !== 'futures' && mKey !== 'forex') {
        const mLabel = m.label || mKey.toUpperCase();
        allDefaults.push(
          { key: `market_${mKey}_all`, label: `${mLabel} Alerts Master`, description: `Master switch to toggle ON/OFF all notifications for ${mLabel} trades`, category: 'master', market: mKey },
          { key: `${mKey}_signals`,    label: `${mLabel} Signals (SIGNAL)`, description: `Send SIGNAL alerts for new ${mLabel} setups`, category: 'signal', market: mKey },
          { key: `${mKey}_manage`,     label: `${mLabel} Management (MANAGE)`, description: `Send all MANAGE updates for ${mLabel} trades`, category: 'manage', market: mKey },
          { key: `${mKey}_status`,     label: `${mLabel} Status Updates (STATUS)`, description: `Send STATUS lifecycle updates for ${mLabel} trades`, category: 'status', market: mKey }
        );
      }
    }

    const snapshot = loadSnapshotFromDisk();

    for (const d of allDefaults) {
      const defaultVal = (d.key in snapshot) ? (snapshot[d.key] ? 1 : 0) : 1;
      await queryDb(
        `INSERT INTO notification_settings (key, label, description, category, market, enabled, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (key) DO UPDATE SET label = EXCLUDED.label, description = EXCLUDED.description, category = EXCLUDED.category, market = EXCLUDED.market`,
        [d.key, d.label, d.description, d.category, d.market, defaultVal, new Date().toISOString()]
      );
    }

    // Sync current db values to disk snapshot
    const currentRows = await queryDb<{ key: string; enabled: number }>(`SELECT key, enabled FROM notification_settings`);
    if (currentRows && currentRows.length > 0) {
      const map: Record<string, boolean> = {};
      for (const r of currentRows) map[r.key] = Boolean(r.enabled);
      saveSnapshotToDisk(map);
    }
  } catch (err) {
    console.error('Error seeding notification_settings table:', err);
  }
}

/**
 * Returns all registered markets.
 */
export async function getRegisteredMarkets(): Promise<RegisteredMarket[]> {
  try {
    await ensureNotifSettingsSeeded();
    const rows = await queryDb<RegisteredMarket>(`SELECT market, label, created_at FROM registered_markets ORDER BY created_at ASC`);
    if (rows && rows.length > 0) return rows;
  } catch (err) {
    console.error('Error fetching registered markets:', err);
  }
  return [
    { market: 'futures', label: 'Futures', created_at: new Date().toISOString() },
    { market: 'forex', label: 'Forex', created_at: new Date().toISOString() }
  ];
}

/**
 * Registers a new market dynamically and creates its stream toggles.
 */
export async function registerMarket(marketName: string, customLabel?: string): Promise<{ markets: RegisteredMarket[]; settings: NotificationSetting[] }> {
  await ensureNotifSettingsSeeded();
  const cleanMarket = marketName.toLowerCase().replace(/[^a-z0-9_-]/g, '').trim();
  if (!cleanMarket) throw new Error('Invalid market name');
  const label = customLabel?.trim() || (cleanMarket.charAt(0).toUpperCase() + cleanMarket.slice(1));
  const now = new Date().toISOString();

  await queryDb(
    `INSERT INTO registered_markets (market, label, created_at)
     VALUES (?, ?, ?)
     ON CONFLICT (market) DO UPDATE SET label = ?`,
    [cleanMarket, label, now, label]
  );

  const marketDefaults: Array<{ key: string; label: string; description: string; category: NotificationSetting['category']; market: string }> = [
    { key: `market_${cleanMarket}_all`, label: `${label} Alerts Master`, description: `Master switch to toggle ON/OFF all notifications for ${label} trades`, category: 'master', market: cleanMarket },
    { key: `${cleanMarket}_signals`,    label: `${label} Signals (SIGNAL)`, description: `Send SIGNAL alerts for new ${label} setups`, category: 'signal', market: cleanMarket },
    { key: `${cleanMarket}_manage`,     label: `${label} Management (MANAGE)`, description: `Send all MANAGE updates for ${label} trades`, category: 'manage', market: cleanMarket },
    { key: `${cleanMarket}_status`,     label: `${label} Status Updates (STATUS)`, description: `Send STATUS lifecycle updates for ${label} trades`, category: 'status', market: cleanMarket }
  ];

  for (const d of marketDefaults) {
    await queryDb(
      `INSERT INTO notification_settings (key, label, description, category, market, enabled, updated_at)
       VALUES (?, ?, ?, ?, ?, 1, ?)
       ON CONFLICT (key) DO UPDATE SET label = EXCLUDED.label, description = EXCLUDED.description, category = EXCLUDED.category, market = EXCLUDED.market`,
      [d.key, d.label, d.description, d.category, d.market, now]
    );
  }

  const [markets, settings] = await Promise.all([getRegisteredMarkets(), getNotificationSettings()]);
  return { markets, settings };
}

/**
 * Removes a custom registered market.
 */
export async function deleteRegisteredMarket(marketName: string): Promise<{ markets: RegisteredMarket[]; settings: NotificationSetting[] }> {
  const cleanMarket = marketName.toLowerCase().trim();
  if (cleanMarket === 'futures' || cleanMarket === 'forex') {
    throw new Error('Base markets (Futures and Forex) cannot be deleted');
  }

  await queryDb(`DELETE FROM registered_markets WHERE market = ?`, [cleanMarket]);
  await queryDb(`DELETE FROM notification_settings WHERE market = ? OR key LIKE ?`, [cleanMarket, `${cleanMarket}_%`]);

  const [markets, settings] = await Promise.all([getRegisteredMarkets(), getNotificationSettings()]);
  const map: Record<string, boolean> = {};
  for (const s of settings) map[s.key] = s.enabled;
  saveSnapshotToDisk(map);

  return { markets, settings };
}

/**
 * Returns all notification toggle settings.
 */
export async function getNotificationSettings(): Promise<NotificationSetting[]> {
  try {
    await ensureNotifSettingsSeeded();
    const rows = await queryDb<{ key: string; label: string; description: string; category: any; market: string; enabled: number; updated_at: string }>(
      `SELECT key, label, description, category, market, enabled, updated_at FROM notification_settings ORDER BY market ASC, category ASC, key ASC`
    );
    if (rows && rows.length > 0) {
      return rows.map(r => ({
        ...r,
        category: (r.category || 'action') as any,
        market: r.market || 'all',
        enabled: Boolean(r.enabled)
      }));
    }
  } catch (err) {
    console.error('Error fetching notification_settings:', err);
  }

  // Guaranteed fallback
  return BASE_NOTIF_DEFAULTS.map(d => ({
    key: d.key,
    label: d.label,
    description: d.description,
    category: d.category,
    market: d.market,
    enabled: true,
    updated_at: new Date().toISOString()
  }));
}

/**
 * Returns a map of key → enabled for fast lookup inside the notification service.
 */
export async function getNotificationSettingsMap(): Promise<Record<string, boolean>> {
  const rows = await getNotificationSettings();
  const map: Record<string, boolean> = {};
  for (const r of rows) map[r.key] = r.enabled;
  return map;
}

/**
 * Update a single notification toggle and persist to snapshot disk.
 */
export async function setNotificationSetting(key: string, enabled: boolean): Promise<void> {
  await ensureNotifSettingsSeeded();
  const val = enabled ? 1 : 0;
  const now = new Date().toISOString();

  await queryDb(
    `UPDATE notification_settings SET enabled = ?, updated_at = ? WHERE key = ?`,
    [val, now, key]
  );

  const map = await getNotificationSettingsMap();
  map[key] = enabled;
  saveSnapshotToDisk(map);
}

/**
 * Bulk updates notification toggles by market, category, or key list.
 */
export async function bulkSetNotificationSettings(
  filter: { market?: string; category?: string; keys?: string[] },
  enabled: boolean
): Promise<NotificationSetting[]> {
  await ensureNotifSettingsSeeded();
  const val = enabled ? 1 : 0;
  const now = new Date().toISOString();

  if (filter.keys && filter.keys.length > 0) {
    const placeholders = filter.keys.map(() => '?').join(',');
    await queryDb(
      `UPDATE notification_settings SET enabled = ?, updated_at = ? WHERE key IN (${placeholders})`,
      [val, now, ...filter.keys]
    );
  } else if (filter.market && filter.category) {
    await queryDb(
      `UPDATE notification_settings SET enabled = ?, updated_at = ? WHERE market = ? AND category = ?`,
      [val, now, filter.market, filter.category]
    );
  } else if (filter.market) {
    await queryDb(
      `UPDATE notification_settings SET enabled = ?, updated_at = ? WHERE market = ?`,
      [val, now, filter.market]
    );
  } else if (filter.category) {
    await queryDb(
      `UPDATE notification_settings SET enabled = ?, updated_at = ? WHERE category = ?`,
      [val, now, filter.category]
    );
  }

  const settings = await getNotificationSettings();
  const map: Record<string, boolean> = {};
  for (const s of settings) map[s.key] = s.enabled;
  saveSnapshotToDisk(map);
  return settings;
}

// ── Asset Display & Tracking Controls (Super Admin Only) ─────────────────────

export interface AssetSetting {
  symbol: string;
  market: string;
  name: string;
  display_enabled: boolean;
  tracking_enabled: boolean;
  created_at: string;
  updated_at: string;
}

const ASSET_SNAPSHOT_PATH = path.resolve(process.cwd(), 'asset_settings_snapshot.json');

const DEFAULT_ASSETS: Array<{ symbol: string; market: string; name: string }> = [
  { symbol: 'ES', market: 'futures', name: 'E-mini S&P 500' },
  { symbol: 'NQ', market: 'futures', name: 'E-mini Nasdaq 100' },
  { symbol: 'YM', market: 'futures', name: 'E-mini Dow Jones' },
  { symbol: 'GC', market: 'futures', name: 'Gold Futures' },
  { symbol: 'CL', market: 'futures', name: 'Crude Oil Futures' },
  { symbol: 'SI', market: 'futures', name: 'Silver Futures' },
  { symbol: 'RTY', market: 'futures', name: 'E-mini Russell 2000' },
  { symbol: 'ZN', market: 'futures', name: '10-Year T-Note Futures' },
  { symbol: 'EUR/USD', market: 'forex', name: 'Euro / US Dollar' },
  { symbol: 'GBP/USD', market: 'forex', name: 'British Pound / US Dollar' },
  { symbol: 'USD/JPY', market: 'forex', name: 'US Dollar / Japanese Yen' },
  { symbol: 'AUD/USD', market: 'forex', name: 'Australian Dollar / US Dollar' },
  { symbol: 'EUR/GBP', market: 'forex', name: 'Euro / British Pound' },
  { symbol: 'GBP/JPY', market: 'forex', name: 'British Pound / Japanese Yen' },
  { symbol: 'USD/CAD', market: 'forex', name: 'US Dollar / Canadian Dollar' },
  { symbol: 'EUR/JPY', market: 'forex', name: 'Euro / Japanese Yen' },
];

function saveAssetSnapshotToDisk(assetMap: Record<string, boolean>): void {
  try {
    fs.writeFileSync(ASSET_SNAPSHOT_PATH, JSON.stringify(assetMap, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to save asset settings snapshot to disk:', err);
  }
}

function loadAssetSnapshotFromDisk(): Record<string, boolean> {
  try {
    if (fs.existsSync(ASSET_SNAPSHOT_PATH)) {
      const data = fs.readFileSync(ASSET_SNAPSHOT_PATH, 'utf8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('Failed to load asset settings snapshot from disk:', err);
  }
  return {};
}

let isAssetSettingsTableSeeded = false;

export async function ensureAssetSettingsSeeded(): Promise<void> {
  if (isAssetSettingsTableSeeded) return;
  try {
    await queryDb(`CREATE TABLE IF NOT EXISTS asset_settings (
      symbol TEXT PRIMARY KEY,
      market TEXT NOT NULL,
      name TEXT NOT NULL,
      display_enabled INTEGER NOT NULL DEFAULT 1,
      tracking_enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);

    const snapshot = loadAssetSnapshotFromDisk();

    // Check if table has existing records
    const existing = await queryDb<{ symbol: string }>(`SELECT symbol FROM asset_settings`);
    const existingSymbols = new Set((existing || []).map(r => r.symbol));

    for (const a of DEFAULT_ASSETS) {
      if (!existingSymbols.has(a.symbol)) {
        const isDisplay = a.symbol in snapshot ? (snapshot[a.symbol] ? 1 : 0) : 1;
        await queryDb(
          `INSERT INTO asset_settings (symbol, market, name, display_enabled, tracking_enabled, created_at, updated_at)
           VALUES (?, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
           ON CONFLICT (symbol) DO NOTHING`,
          [a.symbol, a.market, a.name, isDisplay]
        );
      }
    }

    // If snapshot had items and we are initializing, sync db to snapshot
    const currentRows = await queryDb<{ symbol: string; display_enabled: any }>(`SELECT symbol, display_enabled FROM asset_settings`);
    if (currentRows && currentRows.length > 0) {
      const map: Record<string, boolean> = {};
      for (const r of currentRows) {
        map[r.symbol] = r.display_enabled === 1 || r.display_enabled === true || r.display_enabled === '1' || r.display_enabled === 't';
      }
      saveAssetSnapshotToDisk(map);
    }

    isAssetSettingsTableSeeded = true;
  } catch (err) {
    console.error('Error seeding asset_settings table:', err);
  }
}

export async function getAssetSettings(): Promise<AssetSetting[]> {
  await ensureAssetSettingsSeeded();
  try {
    const rows = await queryDb<{
      symbol: string;
      market: string;
      name: string;
      display_enabled: number | boolean | string;
      tracking_enabled: number | boolean | string;
      created_at: string;
      updated_at: string;
    }>(
      `SELECT symbol, market, name, display_enabled, tracking_enabled, created_at, updated_at
       FROM asset_settings ORDER BY market ASC, symbol ASC`
    );
    return rows.map(r => ({
      symbol: r.symbol,
      market: r.market,
      name: r.name,
      display_enabled: r.display_enabled === 1 || r.display_enabled === true || r.display_enabled === '1' || r.display_enabled === 't',
      tracking_enabled: r.tracking_enabled === 1 || r.tracking_enabled === true || r.tracking_enabled === '1' || r.tracking_enabled === 't',
      created_at: r.created_at,
      updated_at: r.updated_at,
    }));
  } catch (err) {
    console.error('Error fetching asset_settings:', err);
    return DEFAULT_ASSETS.map(a => ({
      symbol: a.symbol,
      market: a.market,
      name: a.name,
      display_enabled: true,
      tracking_enabled: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));
  }
}

export async function getDisabledDisplayAssets(): Promise<string[]> {
  try {
    await ensureAssetSettingsSeeded();
    const rows = await queryDb<{ symbol: string; display_enabled: any }>(
      `SELECT symbol, display_enabled FROM asset_settings`
    );
    return rows
      .filter(r => r.display_enabled === 0 || r.display_enabled === false || r.display_enabled === '0' || r.display_enabled === 'f')
      .map(r => r.symbol);
  } catch {
    return [];
  }
}

export async function setAssetDisplay(symbol: string, displayEnabled: boolean): Promise<AssetSetting[]> {
  await ensureAssetSettingsSeeded();
  const val = displayEnabled ? 1 : 0;
  const now = new Date().toISOString();
  await queryDb(
    `UPDATE asset_settings SET display_enabled = ?, updated_at = ? WHERE symbol = ?`,
    [val, now, symbol.trim()]
  );
  const all = await getAssetSettings();
  const map: Record<string, boolean> = {};
  for (const a of all) map[a.symbol] = a.display_enabled;
  saveAssetSnapshotToDisk(map);
  return all;
}

export async function bulkSetAssetDisplay(
  filter: { market?: string; symbols?: string[] },
  displayEnabled: boolean
): Promise<AssetSetting[]> {
  await ensureAssetSettingsSeeded();
  const val = displayEnabled ? 1 : 0;
  const now = new Date().toISOString();

  if (filter.symbols && filter.symbols.length > 0) {
    const placeholders = filter.symbols.map(() => '?').join(',');
    await queryDb(
      `UPDATE asset_settings SET display_enabled = ?, updated_at = ? WHERE symbol IN (${placeholders})`,
      [val, now, ...filter.symbols]
    );
  } else if (filter.market) {
    await queryDb(
      `UPDATE asset_settings SET display_enabled = ?, updated_at = ? WHERE LOWER(market) = LOWER(?)`,
      [val, now, filter.market.trim()]
    );
  } else {
    await queryDb(
      `UPDATE asset_settings SET display_enabled = ?, updated_at = ?`,
      [val, now]
    );
  }

  const all = await getAssetSettings();
  const map: Record<string, boolean> = {};
  for (const a of all) map[a.symbol] = a.display_enabled;
  saveAssetSnapshotToDisk(map);
  return all;
}

export async function registerCustomAsset(symbol: string, market: string, name: string): Promise<AssetSetting[]> {
  await ensureAssetSettingsSeeded();
  const cleanSym = symbol.trim().toUpperCase();
  const cleanMarket = market.trim().toLowerCase();
  const cleanName = (name || cleanSym).trim();
  const now = new Date().toISOString();

  await queryDb(
    `INSERT INTO asset_settings (symbol, market, name, display_enabled, tracking_enabled, created_at, updated_at)
     VALUES (?, ?, ?, 1, 1, ?, ?)
     ON CONFLICT (symbol) DO UPDATE SET name = ?, market = ?, updated_at = ?`,
    [cleanSym, cleanMarket, cleanName, now, now, cleanName, cleanMarket, now]
  );

  const all = await getAssetSettings();
  const map: Record<string, boolean> = {};
  for (const a of all) map[a.symbol] = a.display_enabled;
  saveAssetSnapshotToDisk(map);
  return all;
}

