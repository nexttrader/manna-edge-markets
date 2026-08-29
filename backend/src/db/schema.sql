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
    strategy_id TEXT DEFAULT 'sentinel_v2',
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
    strategy_id TEXT DEFAULT 'sentinel_v2',
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
    strategy_id TEXT DEFAULT 'sentinel_v2',
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
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_strategy_access (
    user_email TEXT NOT NULL,
    strategy_id TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_email, strategy_id)
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
    discount_value REAL NOT NULL,
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

-- Client Signal Tagging: tracks which signals users personally select for demo trading
CREATE TABLE IF NOT EXISTS client_signal_tags (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    user_email TEXT NOT NULL,
    setup_id TEXT NOT NULL,
    setup_market TEXT NOT NULL DEFAULT 'futures',
    instrument TEXT NOT NULL,
    strategy_id TEXT,
    bias TEXT,
    conviction_score REAL,
    tagged_at TEXT NOT NULL,
    outcome_type TEXT,
    outcome_r REAL,
    outcome_resolved_at TEXT,
    was_correct INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_client_signal_tags_user ON client_signal_tags(user_id);
CREATE INDEX IF NOT EXISTS idx_client_signal_tags_setup ON client_signal_tags(setup_id);

CREATE TABLE IF NOT EXISTS asset_settings (
    symbol TEXT PRIMARY KEY,
    market TEXT NOT NULL,
    name TEXT NOT NULL,
    display_enabled INTEGER NOT NULL DEFAULT 1,
    tracking_enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

