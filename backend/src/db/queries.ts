import { queryDb } from './database';
import { EdgeSetup, InvalidationAudit, PublishRun, Outcome } from '../discovery/types';

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
    const table = market === 'forex' ? 'forex_edge_setups' : 'edge_setups';
    const rows = await queryDb<EdgeSetup>(`SELECT * FROM ${table} WHERE id = ?`, [id]);
    return rows.length > 0 ? rows[0] : undefined;
}

export async function getSetupsByInstrument(instrument: string, market: string): Promise<EdgeSetup[]> {
    const table = market === 'forex' ? 'forex_edge_setups' : 'edge_setups';
    return await queryDb<EdgeSetup>(`SELECT * FROM ${table} WHERE instrument = ? AND superseded = 0 AND signal_state IN ('awaiting_entry', 'active')`, [instrument]);
}

export async function getSetupsByState(state: string): Promise<EdgeSetup[]> {
    const futures = await queryDb<EdgeSetup>(`SELECT *, 'futures' as market FROM edge_setups WHERE signal_state = ?`, [state]);
    const forex = await queryDb<EdgeSetup>(`SELECT *, 'forex' as market FROM forex_edge_setups WHERE signal_state = ?`, [state]);
    return [...futures, ...forex];
}

export async function countActiveSetupsForInstrument(instrument: string, market: string): Promise<number> {
    const table = market === 'forex' ? 'forex_edge_setups' : 'edge_setups';
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
    const query = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`;
    await queryDb(query, values);
}

export const createSetup = async (setup: EdgeSetup, market?: string): Promise<void> => {
    const m = market || setup.market || 'futures';
    await insertSetup(setup, m);
};

export async function updateSetupState(id: string, market: string, state: string, fields?: Partial<EdgeSetup>): Promise<void> {
    const table = market === 'forex' ? 'forex_edge_setups' : 'edge_setups';
    const updates: Record<string, any> = { signal_state: state, ...fields };
    const keys = Object.keys(updates);
    const values = Object.values(updates);
    const setClause = keys.map(k => `${k} = ?`).join(', ');
    await queryDb(`UPDATE ${table} SET ${setClause} WHERE id = ?`, [...values, id]);
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
    await queryDb(`INSERT INTO outcomes (id, setup_id, setup_market, run_id, outcome_type, execution_price, execution_time, realized_pl, mae, strategy_id, notes, created_at) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
        outcome.id, outcome.setup_id, outcome.setup_market, outcome.run_id || null,
        outcome.outcome_type, outcome.execution_price || null, outcome.execution_time || null,
        outcome.realized_pl || null, outcome.mae || null, outcome.strategy_id || 'manna_basic',
        outcome.notes || null, outcome.created_at
    ]);
}

export const createOutcome = async (outcome: any): Promise<void> => {
    const o: Outcome = {
        id: outcome.id,
        setup_id: outcome.setup_id,
        setup_market: outcome.setup_market || 'futures',
        strategy_id: outcome.strategy_id || 'manna_basic',
        outcome_type: outcome.outcome_type,
        execution_price: outcome.execution_price,
        execution_time: outcome.execution_time || outcome.resolved_at || new Date().toISOString(),
        realized_pl: outcome.realized_pl,
        mae: outcome.mae,
        notes: outcome.notes,
        created_at: outcome.created_at || new Date().toISOString()
    };
    await insertOutcome(o);
};

export async function getOutcomesBySetup(setupId: string): Promise<Outcome[]> {
    return await queryDb<Outcome>(`SELECT * FROM outcomes WHERE setup_id = ?`, [setupId]);
}

export async function getOutcomesByRun(runId: string): Promise<Outcome[]> {
    return await queryDb<Outcome>(`SELECT * FROM outcomes WHERE run_id = ?`, [runId]);
}

// ── Strategy Settings ──

export async function getStrategySettings(role?: string): Promise<{ id: string, name: string, enabled: boolean, visibleToAdmins: boolean }[]> {
    try {
        const rows = await queryDb<{ id: string, name: string, enabled: number, visible_to_admins?: number }>(`SELECT * FROM strategy_settings ORDER BY id ASC`);
        const mapped = rows.map(r => ({
            id: r.id,
            name: r.name,
            enabled: Boolean(r.enabled),
            visibleToAdmins: r.visible_to_admins !== undefined ? Boolean(r.visible_to_admins) : true
        }));

        if (role !== 'super_admin') {
            return mapped.filter(s => s.visibleToAdmins);
        }
        return mapped;
    } catch {
        return [
            { id: 'manna_basic', name: 'Manna Basic', enabled: true, visibleToAdmins: true },
            { id: 'manna_snd', name: 'Manna SnD', enabled: true, visibleToAdmins: true }
        ];
    }
}

export async function updateStrategyEnabled(id: string, enabled: boolean): Promise<void> {
    const val = enabled ? 1 : 0;
    await queryDb(`UPDATE strategy_settings SET enabled = ?, updated_at = ? WHERE id = ?`, [val, new Date().toISOString(), id]);
}

export async function updateStrategyVisibility(id: string, visibleToAdmins: boolean): Promise<void> {
    const val = visibleToAdmins ? 1 : 0;
    try {
        await queryDb(`UPDATE strategy_settings SET visible_to_admins = ?, updated_at = ? WHERE id = ?`, [val, new Date().toISOString(), id]);
    } catch {}
}

export async function deleteStrategy(id: string): Promise<void> {
    await queryDb(`DELETE FROM strategy_settings WHERE id = ?`, [id]);
}

