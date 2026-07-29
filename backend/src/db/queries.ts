import { getDb } from './database';
import { EdgeSetup, InvalidationAudit, PublishRun, Outcome } from '../discovery/types';

// ── Active Setup Queries ──

export function getActiveSetups(market: string): EdgeSetup[] {
    const db = getDb();
    const table = market === 'forex' ? 'forex_edge_setups' : 'edge_setups';
    const stmt = db.prepare(`SELECT * FROM ${table} WHERE superseded = 0 AND signal_state IN ('awaiting_entry', 'active')`);
    return stmt.all() as EdgeSetup[];
}

export function getAllActiveSetups(): EdgeSetup[] {
    return [...getActiveSetups('futures'), ...getActiveSetups('forex')];
}

export function getSetupById(id: string, market: string): EdgeSetup | undefined {
    const db = getDb();
    const table = market === 'forex' ? 'forex_edge_setups' : 'edge_setups';
    const stmt = db.prepare(`SELECT * FROM ${table} WHERE id = ?`);
    return stmt.get(id) as EdgeSetup | undefined;
}

export function getSetupsByInstrument(instrument: string, market: string): EdgeSetup[] {
    const db = getDb();
    const table = market === 'forex' ? 'forex_edge_setups' : 'edge_setups';
    const stmt = db.prepare(`SELECT * FROM ${table} WHERE instrument = ? AND superseded = 0 AND signal_state IN ('awaiting_entry', 'active')`);
    return stmt.all(instrument) as EdgeSetup[];
}

export function getSetupsByState(state: string): EdgeSetup[] {
    const db = getDb();
    const futuresStmt = db.prepare(`SELECT *, 'futures' as market FROM edge_setups WHERE signal_state = ?`);
    const forexStmt = db.prepare(`SELECT *, 'forex' as market FROM forex_edge_setups WHERE signal_state = ?`);
    return [...futuresStmt.all(state) as EdgeSetup[], ...forexStmt.all(state) as EdgeSetup[]];
}

export function countActiveSetupsForInstrument(instrument: string, market: string): number {
    const db = getDb();
    const table = market === 'forex' ? 'forex_edge_setups' : 'edge_setups';
    const stmt = db.prepare(`SELECT COUNT(*) as count FROM ${table} WHERE instrument = ? AND superseded = 0 AND signal_state IN ('awaiting_entry', 'active')`);
    const row = stmt.get(instrument) as { count: number };
    return row.count;
}

export function getPastSetups(market: string, limit: number = 50): EdgeSetup[] {
    const db = getDb();
    const table = market === 'forex' ? 'forex_edge_setups' : 'edge_setups';
    const stmt = db.prepare(`SELECT * FROM ${table} WHERE signal_state IN ('invalidated', 'superseded', 'resolved') ORDER BY created_at DESC LIMIT ?`);
    return stmt.all(limit) as EdgeSetup[];
}

export function getAllPastSetups(limit: number = 50): EdgeSetup[] {
    return [...getPastSetups('futures', limit), ...getPastSetups('forex', limit)]
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(0, limit);
}

// ── Setup Mutations ──

export function insertSetup(setup: EdgeSetup, market: string): void {
    const db = getDb();
    const table = market === 'forex' ? 'forex_edge_setups' : 'edge_setups';
    const keys = Object.keys(setup).filter(k => setup[k as keyof EdgeSetup] !== undefined);
    const values = keys.map(k => setup[k as keyof EdgeSetup]);
    const placeholders = keys.map(() => '?').join(', ');
    const query = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`;
    db.prepare(query).run(...values);
}

// Alias for cross-agent compat
export const createSetup = (setup: EdgeSetup, market?: string): void => {
    const m = market || setup.market || 'futures';
    insertSetup(setup, m);
};

export function updateSetupState(id: string, market: string, state: string, fields?: Partial<EdgeSetup>): void {
    const db = getDb();
    const table = market === 'forex' ? 'forex_edge_setups' : 'edge_setups';
    const updates: Record<string, any> = { signal_state: state, ...fields };
    const keys = Object.keys(updates);
    const values = Object.values(updates);
    const setClause = keys.map(k => `${k} = ?`).join(', ');
    db.prepare(`UPDATE ${table} SET ${setClause} WHERE id = ?`).run(...values, id);
}

// Generic update for a full setup object (used by lifecycle/outcome)
export function updateSetup(setup: EdgeSetup): void {
    const market = setup.market || 'futures';
    const table = market === 'forex' ? 'forex_edge_setups' : 'edge_setups';
    const db = getDb();
    db.prepare(`UPDATE ${table} SET 
        signal_state = ?, entry_triggered_at = ?, entry_price_recorded = ?,
        entry_price_executed = ?, superseded = ?, superseded_by = ?,
        invalidation_reason = ?, invalidation_detail = ?, tradable = ?,
        metadata = ?
        WHERE id = ?`).run(
        setup.signal_state, setup.entry_triggered_at || null, setup.entry_price_recorded || null,
        setup.entry_price_executed || null, setup.superseded, setup.superseded_by || null,
        setup.invalidation_reason || null, setup.invalidation_detail || null, setup.tradable,
        setup.metadata || null, setup.id
    );
}

// ── Invalidation Audit ──

export function insertInvalidationAudit(audit: InvalidationAudit): void {
    const db = getDb();
    db.prepare(`INSERT INTO invalidation_audit (id, setup_id, instrument, setup_market, run_id, timestamp, reason_code, detail, previous_state, new_state, created_by) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        audit.id, audit.setup_id, audit.instrument || null, audit.setup_market, audit.run_id || null,
        audit.timestamp, audit.reason_code, audit.detail || null,
        audit.previous_state || null, audit.new_state || null, audit.created_by || null
    );
}

// Alias
export const createInvalidationAudit = insertInvalidationAudit;

export function getRecentInvalidations(limit: number = 50): any[] {
    const db = getDb();
    const records = db.prepare(`SELECT * FROM invalidation_audit ORDER BY timestamp DESC LIMIT ?`).all(limit) as any[];
    return records.map(r => {
        let setup = getSetupById(r.setup_id, r.setup_market || 'futures');
        if (!setup) setup = getSetupById(r.setup_id, 'forex');
        const symbol = r.instrument || setup?.instrument;
        return {
            ...r,
            instrument: symbol || (r.setup_market === 'forex' ? 'EUR/USD' : 'NQ'),
            bias: setup?.bias
        };
    });
}

export function getSetupHistory(setupId: string, market: string): InvalidationAudit[] {
    const db = getDb();
    return db.prepare(`SELECT * FROM invalidation_audit WHERE setup_id = ? AND setup_market = ? ORDER BY timestamp ASC`).all(setupId, market) as InvalidationAudit[];
}

export function getInvalidationsByRun(runId: string): InvalidationAudit[] {
    const db = getDb();
    return db.prepare(`SELECT * FROM invalidation_audit WHERE run_id = ? ORDER BY timestamp ASC`).all(runId) as InvalidationAudit[];
}

export function getInvalidationStats(): { total: number, byReason: Record<string, number>, last24h: number } {
    const db = getDb();
    const total = (db.prepare(`SELECT COUNT(*) as c FROM invalidation_audit`).get() as any).c;
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const last24h = (db.prepare(`SELECT COUNT(*) as c FROM invalidation_audit WHERE timestamp > ?`).get(cutoff) as any).c;
    const reasons = db.prepare(`SELECT reason_code, COUNT(*) as c FROM invalidation_audit GROUP BY reason_code`).all() as any[];
    const byReason: Record<string, number> = {};
    for (const r of reasons) { byReason[r.reason_code] = r.c; }
    return { total, byReason, last24h };
}

// ── Publish Runs ──

export function insertPublishRun(run: any): void {
    const db = getDb();
    db.prepare(`INSERT INTO publish_runs (id, run_timestamp, killzone, market, run_mode, run_state, setups_created, setups_invalidated, setups_preserved, summary_json, error_detail, trigger_type, created_at) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        run.id, run.run_timestamp, run.killzone, run.market || null,
        run.run_mode, run.run_state, run.setups_created || 0, run.setups_invalidated || 0,
        run.setups_preserved || 0, run.summary_json || null, run.error_detail || null,
        run.trigger_type || 'scheduled', run.created_at
    );
}

// Alias
export const createPublishRun = (run: any): void => {
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
    insertPublishRun(pr);
};

export function updatePublishRun(idOrRun: string | any, updates?: Partial<PublishRun>): void {
    const db = getDb();
    if (typeof idOrRun === 'string' && updates) {
        const keys = Object.keys(updates);
        const values = Object.values(updates);
        const setClause = keys.map(k => `${k} = ?`).join(', ');
        db.prepare(`UPDATE publish_runs SET ${setClause} WHERE id = ?`).run(...values, idOrRun);
    } else if (typeof idOrRun === 'object') {
        const run = idOrRun;
        db.prepare(`UPDATE publish_runs SET run_state = ?, setups_created = ?, setups_invalidated = ?, setups_preserved = ?, summary_json = ?, error_detail = ? WHERE id = ?`).run(
            run.run_state || run.state || 'completed',
            run.setups_created || run.stats?.created || 0,
            run.setups_invalidated || run.stats?.invalidated || 0,
            run.setups_preserved || run.stats?.preserved || 0,
            run.summary_json || (run.stats ? JSON.stringify(run.stats) : null),
            run.error_detail || null,
            run.id
        );
    }
}

export function getPublishRun(id: string): PublishRun | undefined {
    const db = getDb();
    return db.prepare(`SELECT * FROM publish_runs WHERE id = ?`).get(id) as PublishRun | undefined;
}

export function getRecentPublishRuns(limit: number = 20): PublishRun[] {
    const db = getDb();
    return db.prepare(`SELECT * FROM publish_runs ORDER BY created_at DESC LIMIT ?`).all(limit) as PublishRun[];
}

export function getSetupsByRun(runId: string): EdgeSetup[] {
    const db = getDb();
    const futures = db.prepare(`SELECT * FROM edge_setups WHERE created_by_run = ?`).all(runId) as EdgeSetup[];
    const forex = db.prepare(`SELECT * FROM forex_edge_setups WHERE created_by_run = ?`).all(runId) as EdgeSetup[];
    return [...futures, ...forex];
}

// ── Outcomes ──

export function insertOutcome(outcome: Outcome): void {
    const db = getDb();
    db.prepare(`INSERT INTO outcomes (id, setup_id, setup_market, run_id, outcome_type, execution_price, execution_time, realized_pl, mae, strategy_id, notes, created_at) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        outcome.id, outcome.setup_id, outcome.setup_market, outcome.run_id || null,
        outcome.outcome_type, outcome.execution_price || null, outcome.execution_time || null,
        outcome.realized_pl || null, outcome.mae || null, outcome.strategy_id || 'manna_basic',
        outcome.notes || null, outcome.created_at
    );
}

// Alias
export const createOutcome = (outcome: any): void => {
    const o: Outcome = {
        id: outcome.id,
        setup_id: outcome.setup_id,
        setup_market: outcome.setup_market || 'futures',
        outcome_type: outcome.outcome_type,
        execution_price: outcome.execution_price,
        execution_time: outcome.execution_time || outcome.resolved_at || new Date().toISOString(),
        realized_pl: outcome.realized_pl,
        mae: outcome.mae,
        notes: outcome.notes,
        created_at: outcome.created_at || new Date().toISOString()
    };
    insertOutcome(o);
};

export function getOutcomesBySetup(setupId: string): Outcome[] {
    const db = getDb();
    return db.prepare(`SELECT * FROM outcomes WHERE setup_id = ?`).all(setupId) as Outcome[];
}

export function getOutcomesByRun(runId: string): Outcome[] {
    const db = getDb();
    return db.prepare(`SELECT * FROM outcomes WHERE run_id = ?`).all(runId) as Outcome[];
}
