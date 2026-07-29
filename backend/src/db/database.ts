import path from 'path';
import fs from 'fs';
import Database from 'better-sqlite3';

let db: Database.Database | null = null;

export function initializeDatabase(): void {
    const dbPath = path.resolve(__dirname, '../../../killzone.db');
    db = new Database(dbPath);
    
    // Enable WAL mode and foreign keys
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    // Read and execute schema
    let schemaPath = path.join(__dirname, 'schema.sql');
    if (!fs.existsSync(schemaPath)) {
        schemaPath = path.join(__dirname, '../../src/db/schema.sql');
    }
    
    const schema = fs.readFileSync(schemaPath, 'utf8');
    db.exec(schema);

    try {
        db.exec(`ALTER TABLE publish_runs ADD COLUMN trigger_type TEXT DEFAULT 'scheduled'`);
    } catch {}
    try {
        db.exec(`ALTER TABLE edge_setups ADD COLUMN resolved_at TEXT`);
    } catch {}
    try {
        db.exec(`ALTER TABLE forex_edge_setups ADD COLUMN resolved_at TEXT`);
    } catch {}
    try {
        db.exec(`ALTER TABLE edge_setups ADD COLUMN is_breakeven INTEGER DEFAULT 0`);
    } catch {}
    try {
        db.exec(`ALTER TABLE forex_edge_setups ADD COLUMN is_breakeven INTEGER DEFAULT 0`);
    } catch {}
    try {
        db.exec(`ALTER TABLE edge_setups ADD COLUMN initial_stop REAL`);
    } catch {}
    try {
        db.exec(`ALTER TABLE forex_edge_setups ADD COLUMN initial_stop REAL`);
    } catch {}
    try {
        db.exec(`ALTER TABLE invalidation_audit ADD COLUMN instrument TEXT`);
    } catch {}
    try {
        db.exec(`ALTER TABLE edge_setups ADD COLUMN strategy_id TEXT DEFAULT 'manna_basic'`);
    } catch {}
    try {
        db.exec(`ALTER TABLE edge_setups ADD COLUMN strategy_tier TEXT DEFAULT 'basic'`);
    } catch {}
    try {
        db.exec(`ALTER TABLE forex_edge_setups ADD COLUMN strategy_id TEXT DEFAULT 'manna_basic'`);
    } catch {}
    try {
        db.exec(`ALTER TABLE forex_edge_setups ADD COLUMN strategy_tier TEXT DEFAULT 'basic'`);
    } catch {}
    try {
        db.exec(`ALTER TABLE outcomes ADD COLUMN strategy_id TEXT DEFAULT 'manna_basic'`);
    } catch {}

    // Analytics archives table for resetting and exporting dataset epochs
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
    `);

    console.log('Database initialized successfully.');
}

export function getDb(): Database.Database {
    if (!db) {
        initializeDatabase();
    }
    return db as Database.Database;
}
