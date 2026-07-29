import { useState, useEffect, useCallback } from 'react';
import { API_BASE } from '../config';

export interface StrategyStat {
  id: string;
  name: string;
  tier: string;
  totalSignals: number;
  activeSignals: number;
  resolvedSignals: number;
  wins: number;
  losses: number;
  winRate: number;
  totalRealizedR: number;
}

export interface AnalyticsData {
  summary: {
    totalSetupsCreated: number;
    activeSetupsCount: number;
    totalTradesResolved: number;
    winRate: number;
    wins: number;
    losses: number;
    totalRealizedR: number;
    futuresR: number;
    forexR: number;
    profitFactor?: number;
    expectancyR?: number;
    maxDrawdownR?: number;
    maxWinsStreak?: number;
    maxLossesStreak?: number;
    avgTimeToFillMinutes?: number;
    avgHoldingDurationMinutes?: number;
  };
  strategies?: StrategyStat[];
  currentSession?: {
    activeKillzone: any;
    nextBoundary: any;
  };
  lastScheduledScan?: any;
  lastManualTrigger?: any;
  triggers?: {
    scheduled: { totalRuns: number; created: number; invalidated: number; preserved: number };
    manual: { totalRuns: number; created: number; invalidated: number; preserved: number };
  };
  markets: {
    futures: { total: number; active: number };
    forex: { total: number; active: number };
  };
  assetPerformance?: Record<string, { total: number; wins: number; losses: number; plR: number; market: string }>;
  invalidations: {
    total: number;
    byReason: Record<string, number>;
    last24h: number;
  };
  killzones: Record<string, { total: number; wins: number; losses: number; plR: number }>;
  recentOutcomes: Array<{
    id: string;
    setup_id: string;
    instrument?: string;
    market?: string;
    bias?: string;
    setup_market?: string;
    strategy_id?: string;
    outcome_type: string;
    realized_r?: number;
    realized_pl?: number;
    execution_price?: number;
    execution_time?: string;
    time_signaled?: string;
    time_entered?: string;
    time_exited?: string;
    time_to_fill_min?: number;
    holding_duration_min?: number;
    created_at?: string;
  }>;
}

export function useAnalytics(strategyId: string = 'all', pollIntervalMs: number = 10000) {
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalytics = useCallback(async () => {
    try {
      const url = strategyId && strategyId !== 'all'
        ? `${API_BASE}/api/admin/analytics?strategy_id=${encodeURIComponent(strategyId)}`
        : `${API_BASE}/api/admin/analytics`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      // Also fetch strategy matrix if not already included
      if (!data.strategies) {
        try {
          const stratRes = await fetch(`${API_BASE}/api/admin/analytics/strategies`);
          if (stratRes.ok) {
            const stratData = await stratRes.json();
            data.strategies = stratData.strategies;
          }
        } catch {}
      }

      setAnalytics(data);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch analytics');
    } finally {
      setLoading(false);
    }
  }, [strategyId]);

  useEffect(() => {
    fetchAnalytics();
    const interval = setInterval(fetchAnalytics, pollIntervalMs);
    return () => clearInterval(interval);
  }, [fetchAnalytics, pollIntervalMs]);

  return { analytics, loading, error, refetch: fetchAnalytics };
}
