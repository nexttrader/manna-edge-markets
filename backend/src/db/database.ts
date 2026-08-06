import path from 'path';
import fs from 'fs';
import Database from 'better-sqlite3';
import { Pool } from 'pg';
import { ensureActiveSignalsRestored } from './signal-snapshot-restore';

let sqliteDb: Database.Database | null = null;
let pgPool: Pool | null = null;
let isPgAvailable = false;

export function isPg(): boolean {
    return !!process.env.DATABASE_URL && isPgAvailable;
}

export function getSqliteDb(): Database.Database {
    if (!sqliteDb) {
        const defaultPath = path.resolve(__dirname, '../../../killzone.db');
        const dbPath = process.env.SQLITE_DB_PATH || defaultPath;
        sqliteDb = new Database(dbPath);
        sqliteDb.pragma('journal_mode = WAL');
        sqliteDb.pragma('foreign_keys = ON');
    }
    return sqliteDb;
}

export function getPgPool(): Pool {
    if (!pgPool) {
        let connectionString = process.env.DATABASE_URL || '';
        pgPool = new Pool({
            connectionString,
            ssl: connectionString.includes('localhost') ? false : { rejectUnauthorized: false }
        });
    }
    return pgPool;
}

// Unified query runner supporting both PostgreSQL and SQLite seamlessly
export async function queryDb<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    if (isPg()) {
        const pool = getPgPool();
        let index = 1;
        const pgSql = sql.replace(/\?/g, () => `$${index++}`);
        const res = await pool.query(pgSql, params);
        return res.rows as T[];
    } else {
        const db = getSqliteDb();
        const stmt = db.prepare(sql);
        const trimmed = sql.trim().toUpperCase();
        if (trimmed.startsWith('SELECT') || trimmed.startsWith('WITH')) {
            return stmt.all(...params) as T[];
        } else {
            const info = stmt.run(...params);
            return [info as any] as T[];
        }
    }
}

export function getDb(): Database.Database {
    return getSqliteDb();
}

export async function initializeDatabase(): Promise<void> {
    if (process.env.DATABASE_URL) {
        console.log('Initializing PostgreSQL (Supabase) database...');
        try {
            const pool = getPgPool();
            const client = await pool.connect();
            try {
                // ── Safe column migrations (idempotent, run before CREATE TABLE block) ──
                // These ADD COLUMN IF NOT EXISTS calls handle tables that existed BEFORE
                // a column was introduced. Each runs independently so one failure doesn't
                // abort the rest.
                const safeAlters = [
                    `ALTER TABLE edge_setups ADD COLUMN IF NOT EXISTS strategy_id TEXT DEFAULT 'manna_basic'`,
                    `ALTER TABLE edge_setups ADD COLUMN IF NOT EXISTS strategy_tier TEXT DEFAULT 'basic'`,
                    `ALTER TABLE edge_setups ADD COLUMN IF NOT EXISTS resolved_at TEXT`,
                    `ALTER TABLE edge_setups ADD COLUMN IF NOT EXISTS is_breakeven INTEGER DEFAULT 0`,
                    `ALTER TABLE edge_setups ADD COLUMN IF NOT EXISTS initial_stop DOUBLE PRECISION`,
                    `ALTER TABLE edge_setups ADD COLUMN IF NOT EXISTS entry_triggered_at TEXT`,
                    `ALTER TABLE forex_edge_setups ADD COLUMN IF NOT EXISTS strategy_id TEXT DEFAULT 'manna_basic'`,
                    `ALTER TABLE forex_edge_setups ADD COLUMN IF NOT EXISTS strategy_tier TEXT DEFAULT 'basic'`,
                    `ALTER TABLE forex_edge_setups ADD COLUMN IF NOT EXISTS resolved_at TEXT`,
                    `ALTER TABLE forex_edge_setups ADD COLUMN IF NOT EXISTS is_breakeven INTEGER DEFAULT 0`,
                    `ALTER TABLE forex_edge_setups ADD COLUMN IF NOT EXISTS initial_stop DOUBLE PRECISION`,
                    `ALTER TABLE forex_edge_setups ADD COLUMN IF NOT EXISTS entry_triggered_at TEXT`,
                    `ALTER TABLE outcomes ADD COLUMN IF NOT EXISTS strategy_id TEXT DEFAULT 'manna_basic'`,
                    `ALTER TABLE publish_runs ADD COLUMN IF NOT EXISTS trigger_type TEXT DEFAULT 'scheduled'`,
                    `ALTER TABLE invalidation_audit ADD COLUMN IF NOT EXISTS instrument TEXT`,
                    `ALTER TABLE performance_reports ADD COLUMN IF NOT EXISTS published_by_email TEXT`,
                    `ALTER TABLE strategy_settings ADD COLUMN IF NOT EXISTS visible_to_admins INTEGER DEFAULT 1`,
                    `ALTER TABLE strategy_settings ADD COLUMN IF NOT EXISTS visible_to_traders INTEGER DEFAULT 1`,
                    `ALTER TABLE strategy_settings ADD COLUMN IF NOT EXISTS super_admin_max_signals INTEGER DEFAULT 6`,
                    `ALTER TABLE strategy_settings ADD COLUMN IF NOT EXISTS super_admin_min_conviction DOUBLE PRECISION DEFAULT 70.0`,
                    `ALTER TABLE strategy_settings ADD COLUMN IF NOT EXISTS public_max_signals INTEGER DEFAULT 6`,
                    `ALTER TABLE strategy_settings ADD COLUMN IF NOT EXISTS public_min_conviction DOUBLE PRECISION DEFAULT 70.0`,
                    `ALTER TABLE outcomes ADD COLUMN IF NOT EXISTS was_runner INTEGER DEFAULT 0`,
                    `ALTER TABLE outcomes ADD COLUMN IF NOT EXISTS runner_realized_r DOUBLE PRECISION DEFAULT 0.0`,
                    `ALTER TABLE outcomes ADD COLUMN IF NOT EXISTS is_breakeven INTEGER DEFAULT 0`,
                    `ALTER TABLE outcomes ADD COLUMN IF NOT EXISTS mfe DOUBLE PRECISION`,
                    `ALTER TABLE outcomes ADD COLUMN IF NOT EXISTS highest_price DOUBLE PRECISION`,
                    `ALTER TABLE outcomes ADD COLUMN IF NOT EXISTS lowest_price DOUBLE PRECISION`,
                    `ALTER TABLE outcomes ADD COLUMN IF NOT EXISTS bars_held INTEGER`,
                    `ALTER TABLE outcomes ADD COLUMN IF NOT EXISTS duration_min DOUBLE PRECISION`,
                    `ALTER TABLE outcomes ADD COLUMN IF NOT EXISTS exit_reason TEXT`,
                    `CREATE INDEX IF NOT EXISTS idx_edge_setups_strategy ON edge_setups(strategy_id)`,
                    `CREATE INDEX IF NOT EXISTS idx_forex_edge_setups_strategy ON forex_edge_setups(strategy_id)`,
                    // Hard-cap PnL values in outcomes table to exact R multiples
                    `UPDATE outcomes SET realized_pl = -1.0 WHERE outcome_type = 'sl_hit' AND (realized_pl IS NULL OR realized_pl < -1.0 OR realized_pl > 0)`,
                    `UPDATE outcomes SET realized_pl = 0.0 WHERE (outcome_type = 'be_hit' OR outcome_type = 'breakeven') AND realized_pl != 0.0`,
                    `UPDATE outcomes SET realized_pl = 2.0 WHERE outcome_type = 'tp1_hit' AND (realized_pl IS NULL OR realized_pl <= 0)`,
                    `UPDATE outcomes SET realized_pl = 3.0 WHERE outcome_type = 'tp2_hit' AND (realized_pl IS NULL OR realized_pl <= 0)`,
                    // Retroactive restoration of premature outcomes & setups where trade was never filled
                    `DELETE FROM outcomes WHERE setup_id IN (SELECT id FROM edge_setups WHERE entry_triggered_at IS NULL UNION SELECT id FROM forex_edge_setups WHERE entry_triggered_at IS NULL)`,
                    `UPDATE edge_setups SET signal_state = 'awaiting_entry', tradable = 1, resolved_at = NULL, invalidation_reason = NULL, is_breakeven = 0, stop = COALESCE(initial_stop, stop) WHERE entry_triggered_at IS NULL AND superseded = 0 AND signal_state IN ('resolved', 'runner')`,
                    `UPDATE forex_edge_setups SET signal_state = 'awaiting_entry', tradable = 1, resolved_at = NULL, invalidation_reason = NULL, is_breakeven = 0, stop = COALESCE(initial_stop, stop) WHERE entry_triggered_at IS NULL AND superseded = 0 AND signal_state IN ('resolved', 'runner')`
                ];
                for (const sql of safeAlters) {
                    try { await client.query(sql); } catch (_) { /* column/index/query safe execution */ }
                }

                await client.query(`
                    CREATE TABLE IF NOT EXISTS edge_setups (
                        id TEXT PRIMARY KEY,
                        instrument TEXT NOT NULL,
                        market TEXT DEFAULT 'futures',
                        created_at TEXT NOT NULL,
                        created_by_run TEXT,
                        killzone_origin TEXT NOT NULL,
                        killzone_origin_at TEXT,
                        bias TEXT NOT NULL,
                        entry_zone_low DOUBLE PRECISION NOT NULL,
                        entry_zone_high DOUBLE PRECISION NOT NULL,
                        entry_zone_mid DOUBLE PRECISION NOT NULL,
                        entry_price_recorded DOUBLE PRECISION,
                        entry_price_executed DOUBLE PRECISION,
                        stop DOUBLE PRECISION NOT NULL,
                        tp1 DOUBLE PRECISION NOT NULL,
                        tp2 DOUBLE PRECISION,
                        r_multiple_1 DOUBLE PRECISION,
                        r_multiple_2 DOUBLE PRECISION,
                        signal_state TEXT NOT NULL DEFAULT 'awaiting_entry',
                        superseded INTEGER DEFAULT 0,
                        superseded_by TEXT,
                        invalidation_reason TEXT,
                        invalidation_detail TEXT,
                        entry_triggered_at TEXT,
                        tradable INTEGER DEFAULT 1,
                        conviction_score DOUBLE PRECISION,
                        liquidity_score DOUBLE PRECISION,
                        strategy_id TEXT DEFAULT 'manna_basic',
                        strategy_tier TEXT DEFAULT 'basic',
                        metadata TEXT,
                        resolved_at TEXT,
                        is_breakeven INTEGER DEFAULT 0,
                        initial_stop DOUBLE PRECISION
                    );
                    CREATE INDEX IF NOT EXISTS idx_edge_setups_instrument_state ON edge_setups(instrument, signal_state, superseded);
                    CREATE INDEX IF NOT EXISTS idx_edge_setups_killzone_origin ON edge_setups(killzone_origin);
                    CREATE INDEX IF NOT EXISTS idx_edge_setups_strategy ON edge_setups(strategy_id);

                    CREATE TABLE IF NOT EXISTS forex_edge_setups (
                        id TEXT PRIMARY KEY,
                        instrument TEXT NOT NULL,
                        market TEXT DEFAULT 'forex',
                        created_at TEXT NOT NULL,
                        created_by_run TEXT,
                        killzone_origin TEXT NOT NULL,
                        killzone_origin_at TEXT,
                        bias TEXT NOT NULL,
                        entry_zone_low DOUBLE PRECISION NOT NULL,
                        entry_zone_high DOUBLE PRECISION NOT NULL,
                        entry_zone_mid DOUBLE PRECISION NOT NULL,
                        entry_price_recorded DOUBLE PRECISION,
                        entry_price_executed DOUBLE PRECISION,
                        stop DOUBLE PRECISION NOT NULL,
                        tp1 DOUBLE PRECISION NOT NULL,
                        tp2 DOUBLE PRECISION,
                        r_multiple_1 DOUBLE PRECISION,
                        r_multiple_2 DOUBLE PRECISION,
                        signal_state TEXT NOT NULL DEFAULT 'awaiting_entry',
                        superseded INTEGER DEFAULT 0,
                        superseded_by TEXT,
                        invalidation_reason TEXT,
                        invalidation_detail TEXT,
                        entry_triggered_at TEXT,
                        tradable INTEGER DEFAULT 1,
                        conviction_score DOUBLE PRECISION,
                        liquidity_score DOUBLE PRECISION,
                        strategy_id TEXT DEFAULT 'manna_basic',
                        strategy_tier TEXT DEFAULT 'basic',
                        metadata TEXT,
                        resolved_at TEXT,
                        is_breakeven INTEGER DEFAULT 0,
                        initial_stop DOUBLE PRECISION
                    );
                    CREATE INDEX IF NOT EXISTS idx_forex_edge_setups_instrument_state ON forex_edge_setups(instrument, signal_state, superseded);
                    CREATE INDEX IF NOT EXISTS idx_forex_edge_setups_killzone_origin ON forex_edge_setups(killzone_origin);
                    CREATE INDEX IF NOT EXISTS idx_forex_edge_setups_strategy ON forex_edge_setups(strategy_id);

                    CREATE TABLE IF NOT EXISTS invalidation_audit (
                        id TEXT PRIMARY KEY,
                        setup_id TEXT NOT NULL,
                        instrument TEXT,
                        setup_market TEXT NOT NULL,
                        run_id TEXT,
                        timestamp TEXT NOT NULL,
                        reason_code TEXT NOT NULL,
                        detail TEXT,
                        previous_state TEXT,
                        new_state TEXT,
                        created_by TEXT
                    );

                    CREATE TABLE IF NOT EXISTS publish_runs (
                        id TEXT PRIMARY KEY,
                        run_timestamp TEXT NOT NULL,
                        killzone TEXT NOT NULL,
                        market TEXT,
                        run_mode TEXT NOT NULL,
                        run_state TEXT NOT NULL,
                        setups_created INTEGER DEFAULT 0,
                        setups_invalidated INTEGER DEFAULT 0,
                        setups_preserved INTEGER DEFAULT 0,
                        summary_json TEXT,
                        error_detail TEXT,
                        trigger_type TEXT DEFAULT 'scheduled',
                        created_at TEXT NOT NULL
                    );

                    CREATE TABLE IF NOT EXISTS outcomes (
                        id TEXT PRIMARY KEY,
                        setup_id TEXT NOT NULL,
                        setup_market TEXT NOT NULL,
                        run_id TEXT,
                        outcome_type TEXT NOT NULL,
                        execution_price DOUBLE PRECISION,
                        execution_time TEXT,
                        realized_pl DOUBLE PRECISION,
                        mae DOUBLE PRECISION,
                        mfe DOUBLE PRECISION,
                        highest_price DOUBLE PRECISION,
                        lowest_price DOUBLE PRECISION,
                        bars_held INTEGER,
                        duration_min DOUBLE PRECISION,
                        exit_reason TEXT,
                        strategy_id TEXT DEFAULT 'manna_basic',
                        was_runner INTEGER DEFAULT 0,
                        runner_realized_r DOUBLE PRECISION DEFAULT 0.0,
                        is_breakeven INTEGER DEFAULT 0,
                        notes TEXT,
                        created_at TEXT NOT NULL
                    );

                    CREATE TABLE IF NOT EXISTS analytics_archives (
                        id TEXT PRIMARY KEY,
                        archive_name TEXT NOT NULL,
                        captured_from TEXT NOT NULL,
                        captured_until TEXT NOT NULL,
                        total_setups INTEGER NOT NULL,
                        total_resolved INTEGER NOT NULL,
                        win_rate DOUBLE PRECISION NOT NULL,
                        total_realized_r DOUBLE PRECISION NOT NULL,
                        avg_fill_time_min DOUBLE PRECISION NOT NULL,
                        avg_hold_duration_min DOUBLE PRECISION NOT NULL,
                        csv_content TEXT NOT NULL,
                        summary_json TEXT NOT NULL,
                        created_at TEXT NOT NULL
                    );

                    CREATE TABLE IF NOT EXISTS performance_reports (
                        id TEXT PRIMARY KEY,
                        period_type TEXT NOT NULL,
                        period_start TEXT NOT NULL,
                        period_end TEXT NOT NULL,
                        summary_json TEXT NOT NULL,
                        admin_notes TEXT,
                        status TEXT NOT NULL DEFAULT 'draft_pending_approval',
                        created_at TEXT NOT NULL,
                        published_at TEXT,
                        published_by TEXT
                    );

                    CREATE TABLE IF NOT EXISTS strategy_settings (
                        id TEXT PRIMARY KEY,
                        name TEXT NOT NULL,
                        enabled INTEGER DEFAULT 1,
                        visible_to_admins INTEGER DEFAULT 1,
                        visible_to_traders INTEGER DEFAULT 1,
                        super_admin_max_signals INTEGER DEFAULT 6,
                        super_admin_min_conviction DOUBLE PRECISION DEFAULT 70.0,
                        public_max_signals INTEGER DEFAULT 6,
                        public_min_conviction DOUBLE PRECISION DEFAULT 70.0,
                        updated_at TEXT NOT NULL
                    );

                    ALTER TABLE strategy_settings ADD COLUMN IF NOT EXISTS visible_to_admins INTEGER DEFAULT 1;
                    ALTER TABLE strategy_settings ADD COLUMN IF NOT EXISTS visible_to_traders INTEGER DEFAULT 1;
                    ALTER TABLE strategy_settings ADD COLUMN IF NOT EXISTS super_admin_max_signals INTEGER DEFAULT 6;
                    ALTER TABLE strategy_settings ADD COLUMN IF NOT EXISTS super_admin_min_conviction DOUBLE PRECISION DEFAULT 70.0;
                    ALTER TABLE strategy_settings ADD COLUMN IF NOT EXISTS public_max_signals INTEGER DEFAULT 6;
                    ALTER TABLE strategy_settings ADD COLUMN IF NOT EXISTS public_min_conviction DOUBLE PRECISION DEFAULT 70.0;

                    CREATE TABLE IF NOT EXISTS admin_strategy_access (
                        user_email TEXT NOT NULL,
                        strategy_id TEXT NOT NULL,
                        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                        PRIMARY KEY (user_email, strategy_id)
                    );

                    CREATE TABLE IF NOT EXISTS system_maintenance (
                        id TEXT PRIMARY KEY DEFAULT 'current',
                        enabled INTEGER DEFAULT 0,
                        message TEXT DEFAULT 'Manna is currently undergoing scheduled system maintenance.',
                        estimated_return_time TEXT DEFAULT 'Asia Session Today',
                        updated_at TEXT,
                        updated_by TEXT
                    );
                    INSERT INTO system_maintenance (id, enabled, message, estimated_return_time, updated_at)
                    VALUES ('current', 0, 'Manna is currently undergoing scheduled system maintenance.', 'Asia Session Today', CURRENT_TIMESTAMP)
                    ON CONFLICT (id) DO NOTHING;

                    CREATE TABLE IF NOT EXISTS system_signal_snapshots (
                        id TEXT PRIMARY KEY DEFAULT 'current',
                        snapshot_json TEXT NOT NULL,
                        count INTEGER DEFAULT 0,
                        updated_at TEXT NOT NULL
                    );

                    CREATE TABLE IF NOT EXISTS user_profiles (
                        id TEXT PRIMARY KEY,
                        name TEXT NOT NULL,
                        email TEXT NOT NULL UNIQUE,
                        password TEXT,
                        must_change_password INTEGER DEFAULT 0,
                        role TEXT DEFAULT 'trader',
                        tier TEXT DEFAULT 'free',
                        market_access TEXT,
                        status TEXT DEFAULT 'active',
                        subscription_status TEXT DEFAULT 'active',
                        subscription_start TEXT,
                        subscription_end TEXT,
                        billing_cycle TEXT,
                        auto_renew INTEGER DEFAULT 0,
                        pause_start_date TEXT,
                        pause_resume_date TEXT,
                        paused_remaining_days INTEGER,
                        created_at TEXT NOT NULL,
                        last_active TEXT,
                        preferred_market TEXT,
                        risk_limit TEXT,
                        signals_viewed INTEGER DEFAULT 0,
                        watchlist_count INTEGER DEFAULT 0,
                        deleted_at TEXT,
                        purge_at TEXT,
                        days_remaining INTEGER,
                        is_trial INTEGER DEFAULT 0,
                        trial_started_at TEXT,
                        trial_expires_at TEXT,
                        trial_days_remaining INTEGER,
                        trial_expired INTEGER DEFAULT 0,
                        trial_extended_count INTEGER DEFAULT 0,
                        custom_features TEXT
                    );

                    CREATE TABLE IF NOT EXISTS custom_trial_templates (
                        id TEXT PRIMARY KEY,
                        name TEXT NOT NULL,
                        days INTEGER,
                        expiry_date TEXT,
                        tier TEXT,
                        strategy_access TEXT,
                        max_signals INTEGER,
                        allow_calculators INTEGER DEFAULT 1,
                        created_at TEXT NOT NULL,
                        created_by TEXT
                    );

                    CREATE TABLE IF NOT EXISTS coupons (
                        id TEXT PRIMARY KEY,
                        code TEXT NOT NULL UNIQUE,
                        discount_type TEXT NOT NULL,
                        discount_value DOUBLE PRECISION NOT NULL,
                        valid_from TEXT NOT NULL,
                        valid_until TEXT,
                        max_redemptions INTEGER NOT NULL,
                        current_redemptions INTEGER DEFAULT 0,
                        per_user_limit INTEGER DEFAULT 1,
                        applicable_tiers TEXT,
                        status TEXT DEFAULT 'active',
                        created_by TEXT,
                        created_at TEXT NOT NULL
                    );

                    CREATE TABLE IF NOT EXISTS coupon_redemptions (
                        id TEXT PRIMARY KEY,
                        coupon_id TEXT NOT NULL,
                        coupon_code TEXT NOT NULL,
                        user_id TEXT NOT NULL,
                        user_email TEXT NOT NULL,
                        discount_applied TEXT NOT NULL,
                        redeemed_at TEXT NOT NULL
                    );

                    CREATE TABLE IF NOT EXISTS user_tags (
                        id TEXT PRIMARY KEY,
                        name TEXT NOT NULL,
                        color TEXT NOT NULL,
                        description TEXT,
                        created_at TEXT NOT NULL
                    );

                    CREATE TABLE IF NOT EXISTS user_tag_mappings (
                        user_id TEXT NOT NULL,
                        tag_id TEXT NOT NULL,
                        PRIMARY KEY (user_id, tag_id)
                    );

                    CREATE TABLE IF NOT EXISTS user_groups (
                        id TEXT PRIMARY KEY,
                        name TEXT NOT NULL,
                        description TEXT,
                        tier_assignment TEXT,
                        created_at TEXT NOT NULL
                    );

                    CREATE TABLE IF NOT EXISTS user_group_mappings (
                        user_id TEXT NOT NULL,
                        group_id TEXT NOT NULL,
                        PRIMARY KEY (user_id, group_id)
                    );

                    CREATE TABLE IF NOT EXISTS notifications (
                        id TEXT PRIMARY KEY,
                        user_id TEXT NOT NULL,
                        type TEXT NOT NULL,
                        title TEXT NOT NULL,
                        message TEXT NOT NULL,
                        is_read INTEGER DEFAULT 0,
                        created_at TEXT NOT NULL
                    );

                    CREATE TABLE IF NOT EXISTS notification_triggers (
                        id TEXT PRIMARY KEY,
                        event_type TEXT NOT NULL,
                        threshold_days INTEGER NOT NULL,
                        template_title TEXT NOT NULL,
                        template_body TEXT NOT NULL,
                        enabled INTEGER DEFAULT 1,
                        updated_at TEXT NOT NULL
                    );

                    CREATE TABLE IF NOT EXISTS admin_audit_logs (
                        id TEXT PRIMARY KEY,
                        admin_email TEXT NOT NULL,
                        admin_role TEXT NOT NULL,
                        action TEXT NOT NULL,
                        target_user_id TEXT,
                        details_json TEXT,
                        created_at TEXT NOT NULL
                    );

                    CREATE TABLE IF NOT EXISTS support_tickets (
                        id TEXT PRIMARY KEY,
                        created_at TEXT NOT NULL,
                        updated_at TEXT NOT NULL,
                        user_id TEXT NOT NULL,
                        user_name TEXT NOT NULL,
                        user_email TEXT NOT NULL,
                        requested_tier TEXT,
                        current_tier TEXT,
                        type TEXT NOT NULL,
                        subject TEXT NOT NULL,
                        priority TEXT NOT NULL,
                        status TEXT NOT NULL,
                        claimed_by TEXT,
                        claimed_by_name TEXT,
                        claimed_at TEXT,
                        transfer_to_email TEXT,
                        transfer_to_name TEXT,
                        transfer_requested_at TEXT,
                        transfer_note TEXT,
                        invoice_sent INTEGER DEFAULT 0,
                        invoice_sent_at TEXT,
                        invoice_details TEXT,
                        resolved_by TEXT,
                        resolved_by_name TEXT,
                        resolved_at TEXT,
                        resolution_note TEXT
                    );

                    CREATE TABLE IF NOT EXISTS ticket_messages (
                        id TEXT PRIMARY KEY,
                        ticket_id TEXT NOT NULL,
                        at TEXT NOT NULL,
                        from_email TEXT NOT NULL,
                        from_name TEXT NOT NULL,
                        from_role TEXT NOT NULL,
                        body TEXT NOT NULL,
                        type TEXT NOT NULL,
                        invoice_details TEXT,
                        read_by_user INTEGER DEFAULT 0,
                        read_by_admin INTEGER DEFAULT 0
                    );

                    CREATE TABLE IF NOT EXISTS ticket_timeline (
                        ticket_id TEXT NOT NULL,
                        at TEXT NOT NULL,
                        actor TEXT NOT NULL,
                        actor_name TEXT NOT NULL,
                        event TEXT NOT NULL,
                        note TEXT
                    );

                    INSERT INTO strategy_settings (id, name, enabled, updated_at) VALUES
                    ('manna_snd', 'Manna SnD', 1, CURRENT_TIMESTAMP)
                    ON CONFLICT (id) DO UPDATE SET name = 'Manna SnD';

                    INSERT INTO strategy_settings (id, name, enabled, updated_at) VALUES
                    ('sentinel_v2', 'Manna Elite V1', 1, CURRENT_TIMESTAMP)
                    ON CONFLICT (id) DO UPDATE SET name = 'Manna Elite V1';

                    UPDATE outcomes SET strategy_id = 'sentinel_v2' WHERE strategy_id = 'manna_basic' OR strategy_id IS NULL;

                    UPDATE strategy_settings SET enabled = 1, visible_to_admins = 1, visible_to_traders = 1 WHERE id = 'sentinel_v2';

                    -- Restore sentinel_v2 strategy_id for Sentinel V2 setups based on metadata signature
                    UPDATE edge_setups SET strategy_id = 'sentinel_v2' WHERE metadata LIKE '%sentinel%' OR metadata LIKE '%context_tf%' OR metadata LIKE '%poi_type%';
                    UPDATE forex_edge_setups SET strategy_id = 'sentinel_v2' WHERE metadata LIKE '%sentinel%' OR metadata LIKE '%context_tf%' OR metadata LIKE '%poi_type%';
                    UPDATE outcomes SET strategy_id = 'sentinel_v2' WHERE setup_id IN (
                        SELECT id FROM edge_setups WHERE strategy_id = 'sentinel_v2' 
                        UNION 
                        SELECT id FROM forex_edge_setups WHERE strategy_id = 'sentinel_v2'
                    );
                `);
                isPgAvailable = true;
                console.log('PostgreSQL (Supabase) tables initialized successfully.');
                await ensureActiveSignalsRestored();
                return;
            } finally {
                client.release();
            }
        } catch (pgError: any) {
            console.error('⚠️ PostgreSQL connection failed:', pgError.message);
            console.error('💡 Tip: On Render, use Supabase Pooler URI on port 6543 (IPv4) instead of direct connection on port 5432 (IPv6). Falling back to local SQLite...');
            isPgAvailable = false;
        }
    }

    // SQLite setup (Fallback)
    const db = getSqliteDb();
    let schemaPath = path.join(__dirname, 'schema.sql');
    if (!fs.existsSync(schemaPath)) {
        schemaPath = path.join(__dirname, '../../src/db/schema.sql');
    }
    const schema = fs.readFileSync(schemaPath, 'utf8');
    const statements = schema.split(';').map(s => s.trim()).filter(Boolean);

    for (const stmt of statements) {
        try { db.exec(stmt + ';'); } catch (e) {}
    }

    try { db.exec(`ALTER TABLE publish_runs ADD COLUMN trigger_type TEXT DEFAULT 'scheduled'`); } catch {}
    try { db.exec(`ALTER TABLE edge_setups ADD COLUMN resolved_at TEXT`); } catch {}
    try { db.exec(`ALTER TABLE forex_edge_setups ADD COLUMN resolved_at TEXT`); } catch {}
    try { db.exec(`ALTER TABLE edge_setups ADD COLUMN is_breakeven INTEGER DEFAULT 0`); } catch {}
    try { db.exec(`ALTER TABLE forex_edge_setups ADD COLUMN is_breakeven INTEGER DEFAULT 0`); } catch {}
    try { db.exec(`ALTER TABLE edge_setups ADD COLUMN initial_stop REAL`); } catch {}
    try { db.exec(`ALTER TABLE forex_edge_setups ADD COLUMN initial_stop REAL`); } catch {}
    try { db.exec(`ALTER TABLE edge_setups ADD COLUMN entry_triggered_at TEXT`); } catch {}
    try { db.exec(`ALTER TABLE forex_edge_setups ADD COLUMN entry_triggered_at TEXT`); } catch {}
    try { db.exec(`ALTER TABLE invalidation_audit ADD COLUMN instrument TEXT`); } catch {}
    try { db.exec(`ALTER TABLE performance_reports ADD COLUMN published_by_email TEXT`); } catch {}
    try { db.exec(`ALTER TABLE edge_setups ADD COLUMN strategy_id TEXT DEFAULT 'sentinel_v2'`); } catch {}
    try { db.exec(`ALTER TABLE edge_setups ADD COLUMN strategy_tier TEXT DEFAULT 'basic'`); } catch {}
    try { db.exec(`ALTER TABLE forex_edge_setups ADD COLUMN strategy_id TEXT DEFAULT 'sentinel_v2'`); } catch {}
    try { db.exec(`ALTER TABLE forex_edge_setups ADD COLUMN strategy_tier TEXT DEFAULT 'basic'`); } catch {}
    try { db.exec(`ALTER TABLE outcomes ADD COLUMN strategy_id TEXT DEFAULT 'sentinel_v2'`); } catch {}
    try { db.exec(`ALTER TABLE outcomes ADD COLUMN was_runner INTEGER DEFAULT 0`); } catch {}
    try { db.exec(`ALTER TABLE outcomes ADD COLUMN runner_realized_r REAL DEFAULT 0.0`); } catch {}
    try { db.exec(`ALTER TABLE outcomes ADD COLUMN is_breakeven INTEGER DEFAULT 0`); } catch {}
    try { db.exec(`ALTER TABLE outcomes ADD COLUMN mfe REAL`); } catch {}
    try { db.exec(`ALTER TABLE outcomes ADD COLUMN highest_price REAL`); } catch {}
    try { db.exec(`ALTER TABLE outcomes ADD COLUMN lowest_price REAL`); } catch {}
    try { db.exec(`ALTER TABLE outcomes ADD COLUMN bars_held INTEGER`); } catch {}
    try { db.exec(`ALTER TABLE outcomes ADD COLUMN duration_min REAL`); } catch {}
    try { db.exec(`ALTER TABLE outcomes ADD COLUMN exit_reason TEXT`); } catch {}
    try { db.exec(`ALTER TABLE strategy_settings ADD COLUMN visible_to_admins INTEGER DEFAULT 1`); } catch {}
    try { db.exec(`ALTER TABLE strategy_settings ADD COLUMN visible_to_traders INTEGER DEFAULT 1`); } catch {}
    try { db.exec(`ALTER TABLE strategy_settings ADD COLUMN super_admin_max_signals INTEGER DEFAULT 6`); } catch {}
    try { db.exec(`ALTER TABLE strategy_settings ADD COLUMN super_admin_min_conviction REAL DEFAULT 70.0`); } catch {}
    try { db.exec(`ALTER TABLE strategy_settings ADD COLUMN public_max_signals INTEGER DEFAULT 6`); } catch {}
    try { db.exec(`ALTER TABLE strategy_settings ADD COLUMN public_min_conviction REAL DEFAULT 70.0`); } catch {}
    try { db.exec(`CREATE TABLE IF NOT EXISTS admin_strategy_access (user_email TEXT NOT NULL, strategy_id TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (user_email, strategy_id))`); } catch {}
    try { db.exec(`CREATE TABLE IF NOT EXISTS system_maintenance (id TEXT PRIMARY KEY DEFAULT 'current', enabled INTEGER DEFAULT 0, message TEXT DEFAULT 'Manna is currently undergoing scheduled system maintenance.', estimated_return_time TEXT DEFAULT 'Asia Session Today', updated_at TEXT, updated_by TEXT)`); } catch {}
    try { db.exec(`INSERT OR IGNORE INTO system_maintenance (id, enabled, message, estimated_return_time, updated_at) VALUES ('current', 0, 'Manna is currently undergoing scheduled system maintenance.', 'Asia Session Today', CURRENT_TIMESTAMP)`); } catch {}
    try { db.exec(`CREATE TABLE IF NOT EXISTS system_signal_snapshots (id TEXT PRIMARY KEY DEFAULT 'current', snapshot_json TEXT NOT NULL, count INTEGER DEFAULT 0, updated_at TEXT NOT NULL)`); } catch {}
    try { db.exec(`UPDATE outcomes SET strategy_id = 'sentinel_v2' WHERE strategy_id = 'manna_basic' OR strategy_id IS NULL`); } catch {}
    try { db.exec(`UPDATE edge_setups SET strategy_id = 'manna_snd', strategy_tier = 'pro' WHERE (strategy_id IS NULL OR strategy_id = 'manna_basic') AND metadata LIKE '%MANNA SND%'`); } catch {}
    try { db.exec(`UPDATE forex_edge_setups SET strategy_id = 'manna_snd', strategy_tier = 'pro' WHERE (strategy_id IS NULL OR strategy_id = 'manna_basic') AND metadata LIKE '%MANNA SND%'`); } catch {}
    try { db.exec(`UPDATE edge_setups SET conviction_score = ROUND(83.0 + (COALESCE(r_multiple_1, 2.0) * 3.5), 1) WHERE conviction_score >= 90.5 AND conviction_score <= 91.5`); } catch {}
    try { db.exec(`DELETE FROM outcomes WHERE setup_id IN (SELECT id FROM edge_setups WHERE entry_triggered_at IS NULL UNION SELECT id FROM forex_edge_setups WHERE entry_triggered_at IS NULL)`); } catch {}
    try { db.exec(`UPDATE edge_setups SET signal_state = 'awaiting_entry', tradable = 1, resolved_at = NULL, invalidation_reason = NULL, is_breakeven = 0, stop = COALESCE(initial_stop, stop) WHERE entry_triggered_at IS NULL AND superseded = 0 AND signal_state IN ('resolved', 'runner')`); } catch {}
    try { db.exec(`UPDATE forex_edge_setups SET signal_state = 'awaiting_entry', tradable = 1, resolved_at = NULL, invalidation_reason = NULL, is_breakeven = 0, stop = COALESCE(initial_stop, stop) WHERE entry_triggered_at IS NULL AND superseded = 0 AND signal_state IN ('resolved', 'runner')`); } catch {}
    try { db.exec(`UPDATE forex_edge_setups SET conviction_score = ROUND(83.0 + (COALESCE(r_multiple_1, 2.0) * 3.5), 1) WHERE conviction_score >= 90.5 AND conviction_score <= 91.5`); } catch {}
    try { db.exec(`INSERT OR IGNORE INTO strategy_settings (id, name, enabled, visible_to_admins, visible_to_traders, updated_at) VALUES ('manna_snd', 'Manna SnD', 1, 1, 1, CURRENT_TIMESTAMP), ('sentinel_v2', 'Manna Elite V1', 1, 1, 1, CURRENT_TIMESTAMP)`); } catch {}
    try { db.exec(`UPDATE strategy_settings SET enabled = 1, visible_to_admins = 1, visible_to_traders = 1 WHERE id = 'sentinel_v2'`); } catch {}
    try { db.exec(`UPDATE edge_setups SET strategy_id = 'sentinel_v2' WHERE metadata LIKE '%sentinel%' OR metadata LIKE '%context_tf%' OR metadata LIKE '%poi_type%'`); } catch {}
    try { db.exec(`UPDATE forex_edge_setups SET strategy_id = 'sentinel_v2' WHERE metadata LIKE '%sentinel%' OR metadata LIKE '%context_tf%' OR metadata LIKE '%poi_type%'`); } catch {}

    console.log('Database initialized successfully.');
    await ensureActiveSignalsRestored();
}
