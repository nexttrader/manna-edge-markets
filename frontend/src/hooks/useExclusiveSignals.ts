import { useState, useEffect, useCallback } from 'react';
import { API_BASE } from '../config';
import { type EdgeSetup } from '../types';

export interface StateMachineTelemetry {
  instrument: string;
  state: string;
  phase: string;
  stateChangedAt: string;
  phaseChangedAt: string;
  h1PoiLevel?: number;
  h1PoiType?: string;
  m15SwingHigh?: number;
  m5ConfirmationTime?: string;
  m1OcCount?: number;
  lastScannedAt: string;
  entryZoneLow?: number;
  entryZoneHigh?: number;
  stop?: number;
  tp1?: number;
  convictionScore?: number;
  invalidationReason?: string;
}

export interface InstrumentAnalytics {
  total: number;
  active: number;
  resolved: number;
  wins: number;
  losses: number;
  winRate: string | null;
}

export interface ExclusiveAnalytics {
  totalSignals: number;
  activeSignals: number;
  closedSignals: number;
  winsCount: number;
  lossesCount: number;
  winRate: string | null;
  avgConviction: string | null;
  avgRiskReward: string | null;
  avgMAE: string | null;
  avgMFE: string | null;
  totalRMultiple: string | null;
  profitFactor: string | null;
  byInstrument: Record<string, InstrumentAnalytics>;
  byKillzone: Record<string, InstrumentAnalytics>;
  resetAt: string | null;
  scope: 'since_reset' | 'all_time';
  strategyId: string;
}

export interface PhaseCount {
  scanning: number;
  candidate: number;
  validated: number;
  entryReady: number;
  rejected: number;
}

export function useExclusiveSignals() {
  const [signals, setSignals] = useState<EdgeSetup[]>([]);
  const [historySignals, setHistorySignals] = useState<EdgeSetup[]>([]);
  const [outcomes, setOutcomes] = useState<any[]>([]);
  const [telemetry, setTelemetry] = useState<StateMachineTelemetry[]>([]);
  const [analytics, setAnalytics] = useState<ExclusiveAnalytics | null>(null);
  const [phaseCount, setPhaseCount] = useState<PhaseCount>({ scanning: 0, candidate: 0, validated: 0, entryReady: 0, rejected: 0 });
  const [analyticsScope, setAnalyticsScope] = useState<'baseline' | 'all_time'>('baseline');
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const headers = {
        'Content-Type': 'application/json',
        'x-user-role': 'super_admin'
      };

      const [signalsRes, telemetryRes, analyticsRes, historyRes, outcomesRes] = await Promise.all([
        fetch(`${API_BASE}/api/super-admin/exclusive-signals`, { headers }),
        fetch(`${API_BASE}/api/super-admin/exclusive-signals/state-machine`, { headers }),
        fetch(`${API_BASE}/api/super-admin/exclusive-signals/analytics?scope=${analyticsScope}`, { headers }),
        fetch(`${API_BASE}/api/super-admin/exclusive-signals/history`, { headers }),
        fetch(`${API_BASE}/api/super-admin/exclusive-signals/outcomes`, { headers })
      ]);

      if (signalsRes.ok) {
        const data = await signalsRes.json();
        setSignals(data.signals || []);
      }
      if (telemetryRes.ok) {
        const data = await telemetryRes.json();
        setTelemetry(data.telemetry || []);
        if (data.byPhase) setPhaseCount(data.byPhase);
      }
      if (analyticsRes.ok) {
        const data = await analyticsRes.json();
        if (data.analytics) setAnalytics(data.analytics);
      }
      if (historyRes.ok) {
        const data = await historyRes.json();
        setHistorySignals(data.signals || []);
      }
      if (outcomesRes.ok) {
        const data = await outcomesRes.json();
        setOutcomes(data.outcomes || []);
      }
      setLastUpdated(new Date().toISOString());
    } catch (err) {
      console.warn('ExclusiveSignals: fetch error', err);
    } finally {
      setLoading(false);
    }
  }, [analyticsScope]);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 5000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  const triggerScan = useCallback(async (market: 'both' | 'forex' | 'futures' = 'both') => {
    setScanning(true);
    try {
      const res = await fetch(`${API_BASE}/api/super-admin/exclusive-signals/scan`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': 'super_admin'
        },
        body: JSON.stringify({ market })
      });
      const data = await res.json();
      if (res.ok) {
        await fetchAll();
        return data;
      } else {
        throw new Error(data.error || 'Scan failed');
      }
    } finally {
      setScanning(false);
    }
  }, [fetchAll]);

  const dismissSignal = useCallback(async (id: string, reason?: string) => {
    try {
      await fetch(`${API_BASE}/api/super-admin/exclusive-signals/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': 'super_admin'
        },
        body: JSON.stringify({ reason: reason || 'manual_dismiss' })
      });
      await fetchAll();
    } catch (err) {
      console.warn('Dismiss signal error', err);
    }
  }, [fetchAll]);

  const resetAnalytics = useCallback(async (action: 'set_baseline' | 'clear_baseline' | 'wipe_test_data') => {
    try {
      const res = await fetch(`${API_BASE}/api/super-admin/exclusive-signals/reset-analytics`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': 'super_admin'
        },
        body: JSON.stringify({ action })
      });
      const data = await res.json();
      await fetchAll();
      return data;
    } catch (err: any) {
      throw new Error(err.message || 'Failed to reset analytics');
    }
  }, [fetchAll]);

  const getExportUrl = useCallback((startDate?: string, endDate?: string, sinceReset?: boolean) => {
    const params = new URLSearchParams();
    if (startDate) params.set('start_date', startDate);
    if (endDate) params.set('end_date', endDate);
    if (sinceReset) params.set('since_reset', 'true');
    return `${API_BASE}/api/super-admin/exclusive-signals/export?${params.toString()}`;
  }, []);

  return {
    signals,
    historySignals,
    outcomes,
    telemetry,
    analytics,
    phaseCount,
    analyticsScope,
    setAnalyticsScope,
    loading,
    scanning,
    lastUpdated,
    refetch: fetchAll,
    triggerScan,
    dismissSignal,
    resetAnalytics,
    getExportUrl
  };
}
