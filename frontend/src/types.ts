export const SignalState = {
  ACTIVE: 'active',
  AWAITING_ENTRY: 'awaiting_entry',
  RUNNER: 'runner',
  INVALIDATED: 'invalidated',
  SUPERSEDED: 'superseded',
  RESOLVED: 'resolved'
} as const;

export type SignalState = typeof SignalState[keyof typeof SignalState] | 'ACTIVE' | 'AWAITING_ENTRY' | 'RUNNER' | 'INVALIDATED' | 'SUPERSEDED' | 'RESOLVED';

export const Bias = {
  LONG: 'long',
  SHORT: 'short'
} as const;

export type Bias = typeof Bias[keyof typeof Bias] | 'LONG' | 'SHORT';

export const Market = {
  FUTURES: 'futures',
  FOREX: 'forex'
} as const;

export type Market = typeof Market[keyof typeof Market] | 'FUTURES' | 'FOREX';

export const Killzone = {
  ASIA: 'asia',
  LONDON: 'london',
  NY_AM: 'ny_am',
  NY_PM: 'ny_pm',
  ASIAN: 'ASIAN'
} as const;

export type Killzone = typeof Killzone[keyof typeof Killzone] | 'ASIAN' | 'LONDON' | 'NY_AM' | 'NY_PM';

export interface EdgeSetup {
  id: string;
  instrument: string;
  market: string;
  bias: string;
  conviction_score?: number;
  conviction?: number;
  
  entry_zone_low?: number;
  entry_zone_high?: number;
  entry_zone_mid?: number;
  stop?: number;
  tp1?: number;
  tp2?: number;
  r_multiple_1?: number;
  r_multiple_2?: number;

  levels?: {
    entryMin: number;
    entryMax: number;
    stopLoss: number;
    takeProfit1: number;
    takeProfit2?: number;
  };
  
  signal_state?: string;
  state?: string;
  
  killzone_origin?: string;
  killzone_origin_at?: string;
  killzone?: string;
  
  created_at?: string;
  createdAt?: string;
  
  validatedAt?: string;
  entry_triggered_at?: string;
  resolved_at?: string;
  entryAt?: string;
  invalidation_reason?: string;
  invalidation_detail?: string;
  
  current_price?: number;
  ibkr_price?: number | null;
  is_ibkr_fresh?: boolean;
  unrealized_pl?: number;
  unrealizedR?: number;
  distance_to_entry_r?: number;
  pips?: {
    stopLoss: number;
    takeProfit1: number;
    takeProfit2?: number;
  };
  liquidity_score?: number;
  entry_price_recorded?: number;
  entry_price_executed?: number;
  is_breakeven?: boolean | number;
  initial_stop?: number;
  order_type?: string;
  strategy_id?: string;
  strategy_tier?: string;
  metadata?: string;
  opposing_strategy_warning?: string;
  correlation_note?: string;
  correlation_penalty_applied?: boolean;
  trade_id?: string;
  execution_price?: number;
  outcome_type?: string;
  exit_reason?: string;
  realized_r?: number;
  realized_pl?: number;
  time_to_fill_min?: number;
  holding_duration_min?: number;
  duration_min?: number;
  mae?: number;
  mfe?: number;
}

export interface InvalidationAudit {
  id: string;
  setup_id?: string;
  setupId?: string;
  setup_market?: string;
  instrument?: string;
  market?: string;
  previous_state?: string;
  oldState?: string;
  new_state?: string;
  newState?: string;
  reason_code?: string;
  reasonCode?: string;
  detail?: string;
  timestamp?: string;
  created_at?: string;
  run_id?: string;
  runId?: string;
}

export interface PublishRun {
  id: string;
  run_timestamp?: string;
  timestamp?: string;
  killzone: string;
  run_mode?: string;
  mode?: string;
  run_state?: string;
  state?: string;
  setups_created?: number;
  created?: number;
  setups_invalidated?: number;
  invalidated?: number;
  setups_preserved?: number;
  preserved?: number;
  summary_json?: any;
}

export interface Outcome {
  id: string;
  setup_id: string;
  setup_market?: string;
  outcome_type: string;
  execution_price?: number;
  execution_time?: string;
  realized_pl?: number;
  pnlR?: number;
  mae?: number;
  maeR?: number;
  executionDetails?: string;
  was_runner?: boolean | number;
  notes?: string;
  created_at?: string;
}

export interface SystemStatus {
  circuitBreaker?: {
    tripped: boolean;
    failureCount: number;
    windowMinutes: number;
    lastFailure?: string;
    resetsAt?: string;
    timeRemainingMs?: number;
  };
  status?: string;
  failureCount?: number;
  lastFailureAt?: string;
  resetsAt?: string;
  timeRemainingMs?: number;
  isMarketOpen?: boolean;
  isForexMarketOpen?: boolean;
  isFuturesMarketOpen?: boolean;
  forexReopenTime?: string;
  futuresReopenTime?: string;
}
