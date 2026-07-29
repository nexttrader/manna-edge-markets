import { useState, useEffect } from 'react';
import { API_BASE } from '../config';

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

export function useAnalytics(pollIntervalMs: number = 10000) {
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalytics = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/admin/analytics`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setAnalytics(data);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch analytics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
    const interval = setInterval(fetchAnalytics, pollIntervalMs);
    return () => clearInterval(interval);
  }, [pollIntervalMs]);

  return { analytics, loading, error, refetch: fetchAnalytics };
}
