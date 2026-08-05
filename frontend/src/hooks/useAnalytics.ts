import { useState, useEffect, useCallback } from 'react';
import { API_BASE } from '../config';
import { useAuth } from '../context/AuthContext';

export interface StrategyStat {
  id: string;
  name: string;
  tier: string;
  totalSignals: number;
  activeSignals: number;
  resolvedSignals: number;
  wins: number;
  losses: number;
  breakevens?: number;
  winRate: number;
  totalRealizedR: number;
  runnerCount?: number;
  runnerRealizedR?: number;
  tp1Hits?: number;
  tp2Hits?: number;
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
  collective?: StrategyStat;
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
  assetPerformance?: Record<string, { instrument: string; strategy_id?: string; total: number; wins: number; losses: number; plR: number; market: string }>;
  convictionPerformance?: Record<string, { label: string; min: number; max: number; total: number; wins: number; losses: number; winRate: number; plR: number }>;
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
    conviction_score?: number;
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
  const { user } = useAuth();

  const fetchAnalytics = useCallback(async () => {
    try {
      const role = user?.role || 'admin';
      const email = encodeURIComponent(user?.email || '');
      const baseUrl = strategyId && strategyId !== 'all'
        ? `${API_BASE}/api/admin/analytics?strategy_id=${encodeURIComponent(strategyId)}&role=${role}&email=${email}`
        : `${API_BASE}/api/admin/analytics?role=${role}&email=${email}`;
      const res = await fetch(baseUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      // Also fetch strategy matrix if not already included
      try {
        const stratRes = await fetch(`${API_BASE}/api/admin/analytics/strategies?role=${role}&email=${email}`);
        if (stratRes.ok) {
          const stratData = await stratRes.json();
          data.collective = stratData.collective;
          data.strategies = stratData.strategies;
        }
      } catch {}

      setAnalytics(data);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch analytics');
    } finally {
      setLoading(false);
    }
  }, [strategyId, user]);

  useEffect(() => {
    fetchAnalytics();
    const interval = setInterval(fetchAnalytics, pollIntervalMs);
    return () => clearInterval(interval);
  }, [fetchAnalytics, pollIntervalMs]);

  return { analytics, loading, error, refetch: fetchAnalytics };
}
