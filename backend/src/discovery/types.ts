export enum SignalState {
    awaiting_entry = 'awaiting_entry',
    active = 'active',
    invalidated = 'invalidated',
    superseded = 'superseded',
    resolved = 'resolved'
}

export type Bias = 'long' | 'short';
export type Market = 'futures' | 'forex';
export type Killzone = 'asia' | 'london' | 'ny_am' | 'ny_pm';
export type RunMode = 'dry_run' | 'live' | 'forced';

export enum InvalidationReason {
    price_displaced = 'price_displaced',
    structure_broken = 'structure_broken',
    sl_breached = 'sl_breached',
    entry_expired = 'entry_expired',
    structure_displaced = 'structure_displaced',
    opposing_signal = 'opposing_signal',
    discarded_duplicate = 'discarded_duplicate',
    manual = 'manual',
    mock_data_detected = 'mock_data_detected'
}

export interface EdgeSetup {
    id: string;
    instrument: string;
    market: string;
    created_at: string;
    created_by_run?: string;
    killzone_origin: string;
    killzone_origin_at?: string;
    bias: Bias;
    entry_zone_low: number;
    entry_zone_high: number;
    entry_zone_mid: number;
    entry_price_recorded?: number;
    entry_price_executed?: number;
    stop: number;
    tp1: number;
    tp2?: number;
    r_multiple_1?: number;
    r_multiple_2?: number;
    signal_state: string;
    superseded: number;
    superseded_by?: string;
    invalidation_reason?: string;
    invalidation_detail?: string;
    entry_triggered_at?: string;
    resolved_at?: string;
    is_breakeven?: number;
    initial_stop?: number;
    tradable: number;
    conviction_score?: number;
    liquidity_score?: number;
    strategy_id?: string;
    strategy_tier?: string;
    metadata?: string;
}

export interface CandidateSetup extends Omit<EdgeSetup, 'id' | 'created_at' | 'signal_state' | 'superseded' | 'tradable'> {}

export interface InvalidationAudit {
    id: string;
    setup_id: string;
    instrument?: string;
    setup_market: string;
    run_id?: string;
    timestamp: string;
    reason_code: string;
    detail?: string;
    previous_state?: string;
    new_state?: string;
    created_by?: string;
}

export interface PublishRun {
    id: string;
    run_timestamp: string;
    killzone: string;
    market?: string;
    run_mode: RunMode;
    run_state: string;
    setups_created: number;
    setups_invalidated: number;
    setups_preserved: number;
    summary_json?: string;
    error_detail?: string;
    created_at: string;
}

export interface Outcome {
    id: string;
    setup_id: string;
    setup_market: string;
    run_id?: string;
    outcome_type: string;
    execution_price?: number;
    execution_time?: string;
    realized_pl?: number;
    mae?: number;
    mfe?: number;
    highest_price?: number;
    lowest_price?: number;
    bars_held?: number;
    duration_min?: number;
    exit_reason?: string;
    strategy_id?: string;
    was_runner?: number;
    notes?: string;
    created_at: string;
}

export interface Candle {
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    timestamp: string;
}

export interface KillzoneInfo {
    killzone: Killzone;
    name: string;
    boundaryET: string;
    boundaryUTC: string;
}
