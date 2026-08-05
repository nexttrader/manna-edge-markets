import path from 'path';
import fs from 'fs';
import Database from 'better-sqlite3';
import { Pool } from 'pg';

let sqliteDb: Database.Database | null = null;
let pgPool: Pool | null = null;
let isPgAvailable = false;

export function isPg(): boolean {
    return !!process.env.DATABASE_URL && isPgAvailable;
}

export function getSqliteDb(): Database.Database {
    if (!sqliteDb) {
        const dbPath = path.resolve(__dirname, '../../../killzone.db');
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
                    `ALTER TABLE outcomes ADD COLUMN IF NOT EXISTS was_runner INTEGER DEFAULT 0`,
                    `ALTER TABLE outcomes ADD COLUMN IF NOT EXISTS runner_realized_r DOUBLE PRECISION DEFAULT 0.0`,
                    `ALTER TABLE outcomes ADD COLUMN IF NOT EXISTS is_breakeven INTEGER DEFAULT 0`,
                    `CREATE INDEX IF NOT EXISTS idx_edge_setups_strategy ON edge_setups(strategy_id)`,
                    `CREATE INDEX IF NOT EXISTS idx_forex_edge_setups_strategy ON forex_edge_setups(strategy_id)`,
                    // ── Backfill: sync outcome strategy_ids from their parent setup rows ──
                    // Sentinel V2 outcomes → merge into manna_basic for analytics
                    `UPDATE outcomes SET strategy_id = 'manna_basic' WHERE strategy_id = 'sentinel_v2'`,
                    // Fix outcomes whose strategy_id is NULL or the old default but setup is manna_snd
                    `UPDATE outcomes SET strategy_id = e.strategy_id FROM edge_setups e WHERE outcomes.setup_id = e.id AND e.strategy_id = 'manna_snd' AND (outcomes.strategy_id IS NULL OR outcomes.strategy_id = 'manna_basic')`,
                    `UPDATE outcomes SET strategy_id = f.strategy_id FROM forex_edge_setups f WHERE outcomes.setup_id = f.id AND f.strategy_id = 'manna_snd' AND (outcomes.strategy_id IS NULL OR outcomes.strategy_id = 'manna_basic')`,
                ];
                for (const sql of safeAlters) {
                    try { await client.query(sql); } catch (_) { /* column/index already exists — safe to ignore */ }
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

                    INSERT INTO strategy_settings (id, name, enabled, updated_at) VALUES
                    ('manna_basic', 'Manna Elite V1', 1, CURRENT_TIMESTAMP),
                    ('manna_snd', 'Manna SnD', 1, CURRENT_TIMESTAMP)
                    ON CONFLICT (id) DO NOTHING;

                    INSERT INTO strategy_settings (id, name, enabled, updated_at) VALUES
                    ('sentinel_v2', 'Sentinel V2', 1, CURRENT_TIMESTAMP)
                    ON CONFLICT (id) DO NOTHING;

                    UPDATE strategy_settings SET visible_to_admins = 0, visible_to_traders = 0 WHERE id = 'sentinel_v2' AND visible_to_admins IS NULL;

                    UPDATE edge_setups SET strategy_id = 'manna_snd', strategy_tier = 'pro' WHERE (strategy_id IS NULL OR strategy_id = 'manna_basic') AND metadata LIKE '%MANNA SND%';
                    UPDATE forex_edge_setups SET strategy_id = 'manna_snd', strategy_tier = 'pro' WHERE (strategy_id IS NULL OR strategy_id = 'manna_basic') AND metadata LIKE '%MANNA SND%';

                    UPDATE outcomes SET strategy_id = 'manna_snd' WHERE setup_id IN (
                        SELECT id FROM edge_setups WHERE strategy_id = 'manna_snd' 
                        UNION 
                        SELECT id FROM forex_edge_setups WHERE strategy_id = 'manna_snd'
                    );

                    UPDATE edge_setups SET entry_triggered_at = created_at WHERE signal_state IN ('active', 'resolved', 'invalidated') AND entry_triggered_at IS NULL;
                    UPDATE forex_edge_setups SET entry_triggered_at = created_at WHERE signal_state IN ('active', 'resolved', 'invalidated') AND entry_triggered_at IS NULL;

                    UPDATE edge_setups SET conviction_score = ROUND(CAST(83.0 + (COALESCE(r_multiple_1, 2.0) * 3.5) AS NUMERIC), 1) WHERE conviction_score >= 90.5 AND conviction_score <= 91.5;
                    UPDATE forex_edge_setups SET conviction_score = ROUND(CAST(83.0 + (COALESCE(r_multiple_1, 2.0) * 3.5) AS NUMERIC), 1) WHERE conviction_score >= 90.5 AND conviction_score <= 91.5;

                    -- Auto-resolve any open setups in Supabase that already have an outcome logged
                    UPDATE edge_setups SET signal_state = 'resolved', tradable = 0, resolved_at = COALESCE(resolved_at, created_at) WHERE signal_state IN ('active', 'runner', 'awaiting_entry') AND id IN (SELECT setup_id FROM outcomes);
                    UPDATE forex_edge_setups SET signal_state = 'resolved', tradable = 0, resolved_at = COALESCE(resolved_at, created_at) WHERE signal_state IN ('active', 'runner', 'awaiting_entry') AND id IN (SELECT setup_id FROM outcomes);

                    -- Merge sentinel_v2 setups & outcomes into manna_basic (Manna Elite V1)
                    UPDATE edge_setups SET strategy_id = 'manna_basic' WHERE strategy_id = 'sentinel_v2';
                    UPDATE forex_edge_setups SET strategy_id = 'manna_basic' WHERE strategy_id = 'sentinel_v2';
                    UPDATE outcomes SET strategy_id = 'manna_basic' WHERE strategy_id = 'sentinel_v2';
                `);
                isPgAvailable = true;
                console.log('PostgreSQL (Supabase) tables initialized successfully.');
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
    try { db.exec(`ALTER TABLE edge_setups ADD COLUMN strategy_id TEXT DEFAULT 'manna_basic'`); } catch {}
    try { db.exec(`ALTER TABLE edge_setups ADD COLUMN strategy_tier TEXT DEFAULT 'basic'`); } catch {}
    try { db.exec(`ALTER TABLE forex_edge_setups ADD COLUMN strategy_id TEXT DEFAULT 'manna_basic'`); } catch {}
    try { db.exec(`ALTER TABLE forex_edge_setups ADD COLUMN strategy_tier TEXT DEFAULT 'basic'`); } catch {}
    try { db.exec(`ALTER TABLE outcomes ADD COLUMN strategy_id TEXT DEFAULT 'manna_basic'`); } catch {}
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
    try { db.exec(`UPDATE edge_setups SET strategy_id = 'manna_snd', strategy_tier = 'pro' WHERE (strategy_id IS NULL OR strategy_id = 'manna_basic') AND metadata LIKE '%MANNA SND%'`); } catch {}
    try { db.exec(`UPDATE forex_edge_setups SET strategy_id = 'manna_snd', strategy_tier = 'pro' WHERE (strategy_id IS NULL OR strategy_id = 'manna_basic') AND metadata LIKE '%MANNA SND%'`); } catch {}
    try { db.exec(`UPDATE edge_setups SET conviction_score = ROUND(83.0 + (COALESCE(r_multiple_1, 2.0) * 3.5), 1) WHERE conviction_score >= 90.5 AND conviction_score <= 91.5`); } catch {}
    try { db.exec(`UPDATE forex_edge_setups SET conviction_score = ROUND(83.0 + (COALESCE(r_multiple_1, 2.0) * 3.5), 1) WHERE conviction_score >= 90.5 AND conviction_score <= 91.5`); } catch {}
    try { db.exec(`UPDATE edge_setups SET signal_state = 'resolved', tradable = 0, resolved_at = COALESCE(resolved_at, created_at) WHERE signal_state IN ('active', 'runner', 'awaiting_entry') AND id IN (SELECT setup_id FROM outcomes)`); } catch {}
    try { db.exec(`UPDATE forex_edge_setups SET signal_state = 'resolved', tradable = 0, resolved_at = COALESCE(resolved_at, created_at) WHERE signal_state IN ('active', 'runner', 'awaiting_entry') AND id IN (SELECT setup_id FROM outcomes)`); } catch {}
    try { db.exec(`UPDATE edge_setups SET strategy_id = 'manna_basic' WHERE strategy_id = 'sentinel_v2'`); } catch {}
    try { db.exec(`UPDATE forex_edge_setups SET strategy_id = 'manna_basic' WHERE strategy_id = 'sentinel_v2'`); } catch {}
    try { db.exec(`UPDATE outcomes SET strategy_id = 'manna_basic' WHERE strategy_id = 'sentinel_v2'`); } catch {}

    db.exec(`
        CREATE TABLE IF NOT EXISTS analytics_archives (
            id TEXT PRIMARY KEY,
            archive_name TEXT NOT NULL,
            captured_from TEXT NOT NULL,
            captured_until TEXT NOT NULL,
            total_setups INTEGER NOT NULL,
            total_resolved INTEGER NOT NULL,
            win_rate REAL NOT NULL,
            total_realized_r REAL NOT NULL,
            avg_fill_time_min REAL NOT NULL,
            avg_hold_duration_min REAL NOT NULL,
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
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS admin_strategy_access (
            user_email TEXT NOT NULL,
            strategy_id TEXT NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (user_email, strategy_id)
        );

        INSERT INTO strategy_settings (id, name, enabled, updated_at) VALUES
        ('manna_basic', 'Manna Elite V1', 1, CURRENT_TIMESTAMP),
        ('manna_snd', 'Manna SnD', 1, CURRENT_TIMESTAMP)
        ON CONFLICT (id) DO NOTHING;

        INSERT INTO strategy_settings (id, name, enabled, updated_at) VALUES
        ('sentinel_v2', 'Sentinel V2', 1, CURRENT_TIMESTAMP)
        ON CONFLICT (id) DO NOTHING;
    `);

    try { db.exec(`UPDATE strategy_settings SET visible_to_admins = 0, visible_to_traders = 0 WHERE id = 'sentinel_v2'`); } catch {}

    console.log('Database initialized successfully.');
}
