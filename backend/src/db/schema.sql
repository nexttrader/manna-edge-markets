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
    metadata TEXT,
    resolved_at TEXT,
    is_breakeven INTEGER DEFAULT 0,
    initial_stop REAL
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
    metadata TEXT,
    resolved_at TEXT,
    is_breakeven INTEGER DEFAULT 0,
    initial_stop REAL
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
    execution_price REAL,
    execution_time TEXT,
    realized_pl REAL,
    mae REAL,
    mfe REAL,
    highest_price REAL,
    lowest_price REAL,
    bars_held INTEGER,
    duration_min REAL,
    exit_reason TEXT,
    strategy_id TEXT DEFAULT 'manna_basic',
    was_runner INTEGER DEFAULT 0,
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
    visible_to_admins INTEGER DEFAULT 1,
    visible_to_traders INTEGER DEFAULT 1,
    super_admin_max_signals INTEGER DEFAULT 6,
    super_admin_min_conviction REAL DEFAULT 70.0,
    public_max_signals INTEGER DEFAULT 6,
    public_min_conviction REAL DEFAULT 70.0,
    updated_at TEXT NOT NULL
);
