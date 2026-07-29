-- Killzone Discovery Engine Schema

CREATE TABLE IF NOT EXISTS edge_setups (
    id TEXT PRIMARY KEY,
    instrument TEXT NOT NULL,
    market TEXT DEFAULT 'futures',
    created_at TEXT NOT NULL,
    created_by_run TEXT,
    killzone_origin TEXT NOT NULL,
    killzone_origin_at TEXT,
    bias TEXT NOT NULL,
    entry_zone_low REAL NOT NULL,
    entry_zone_high REAL NOT NULL,
    entry_zone_mid REAL NOT NULL,
    entry_price_recorded REAL,
    entry_price_executed REAL,
    stop REAL NOT NULL,
    tp1 REAL NOT NULL,
    tp2 REAL,
    r_multiple_1 REAL,
    r_multiple_2 REAL,
    signal_state TEXT NOT NULL DEFAULT 'awaiting_entry',
    superseded INTEGER DEFAULT 0,
    superseded_by TEXT,
    invalidation_reason TEXT,
    invalidation_detail TEXT,
    entry_triggered_at TEXT,
    tradable INTEGER DEFAULT 1,
    conviction_score REAL,
    liquidity_score REAL,
    strategy_id TEXT DEFAULT 'manna_basic',
    strategy_tier TEXT DEFAULT 'basic',
    metadata TEXT
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
    entry_zone_low REAL NOT NULL,
    entry_zone_high REAL NOT NULL,
    entry_zone_mid REAL NOT NULL,
    entry_price_recorded REAL,
    entry_price_executed REAL,
    stop REAL NOT NULL,
    tp1 REAL NOT NULL,
    tp2 REAL,
    r_multiple_1 REAL,
    r_multiple_2 REAL,
    signal_state TEXT NOT NULL DEFAULT 'awaiting_entry',
    superseded INTEGER DEFAULT 0,
    superseded_by TEXT,
    invalidation_reason TEXT,
    invalidation_detail TEXT,
    entry_triggered_at TEXT,
    tradable INTEGER DEFAULT 1,
    conviction_score REAL,
    liquidity_score REAL,
    strategy_id TEXT DEFAULT 'manna_basic',
    strategy_tier TEXT DEFAULT 'basic',
    metadata TEXT
);

CREATE INDEX IF NOT EXISTS idx_forex_edge_setups_instrument_state ON forex_edge_setups(instrument, signal_state, superseded);
CREATE INDEX IF NOT EXISTS idx_forex_edge_setups_killzone_origin ON forex_edge_setups(killzone_origin);
CREATE INDEX IF NOT EXISTS idx_forex_edge_setups_strategy ON forex_edge_setups(strategy_id);

CREATE TABLE IF NOT EXISTS invalidation_audit (
    id TEXT PRIMARY KEY,
    setup_id TEXT NOT NULL,
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
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS outcomes (
    id TEXT PRIMARY KEY,
    setup_id TEXT NOT NULL,
    setup_market TEXT NOT NULL,
    run_id TEXT,
    outcome_type TEXT NOT NULL,
    execution_price REAL,
    execution_time TEXT,
    realized_pl REAL,
    mae REAL,
    strategy_id TEXT DEFAULT 'manna_basic',
    notes TEXT,
    created_at TEXT NOT NULL
);
