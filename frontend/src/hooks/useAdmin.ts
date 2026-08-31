import { useState, useCallback, useEffect } from 'react';
import { type SystemStatus, type PublishRun } from '../types';
import { API_BASE } from '../config';
import { useAuth } from '../context/AuthContext';

export function useAdmin() {
  const triggerRun = async (mode: 'live' | 'dry_run', market: 'FUTURES' | 'FOREX' | 'ALL', strategyId?: string) => {
    try {
      const scope = market === 'ALL' ? 'both' : market.toLowerCase();
      const res = await fetch(`${API_BASE}/api/admin/scheduled/session-boundary-revalidation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, market: scope, strategyId })
      });
      return res.ok;
    } catch {
      return false;
    }
  };

  const disableSignal = async (signalId: string, market: string = 'futures', reason?: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/admin/signals/${signalId}/invalidate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ market, reason })
      });
      return res.ok;
    } catch {
      return false;
    }
  };

  const cancelUnwantedBatch = async (ids?: string[], reason?: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/admin/signals/cancel-unwanted-batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, reason })
      });
      return res.ok;
    } catch {
      return false;
    }
  };

  const cancelRebootSignals = async (sinceTimestamp?: string, reason?: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/admin/signals/cancel-reboot-signals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sinceTimestamp, reason })
      });
      if (res.ok) {
        return await res.json();
      }
      return null;
    } catch {
      return null;
    }
  };

  return { triggerRun, disableSignal, cancelUnwantedBatch, cancelRebootSignals };
}



export function useStrategies() {
  const [strategies, setStrategies] = useState<{ id: string; name: string; enabled: boolean }[]>([]);
  const { user } = useAuth();

  const fetchStrategies = useCallback(async () => {
    try {
      const role = user?.role || 'admin';
      const email = encodeURIComponent(user?.email || '');
      const res = await fetch(`${API_BASE}/api/admin/strategies/status?role=${role}&email=${email}`);
      if (res.ok) {
        const data = await res.json();
        setStrategies(data.strategies || []);
      }
    } catch {
      // Fallback
    }
  }, [user]);

  const toggleStrategy = async (strategyId: string, enabled: boolean) => {
    try {
      const res = await fetch(`${API_BASE}/api/admin/strategies/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ strategyId, enabled })
      });
      if (res.ok) {
        const data = await res.json();
        setStrategies(data.strategies || []);
        return true;
      }
    } catch {
      // Fallback
    }
    return false;
  };

  useEffect(() => {
    fetchStrategies();
  }, [fetchStrategies]);

  return { strategies, toggleStrategy, refetch: fetchStrategies };
}

export function useSystemStatus() {
  const [status, setStatus] = useState<SystemStatus>({ status: 'ok', failureCount: 0 });

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/admin/system-status`);
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      }
    } catch {
      // Fallback
    }
  }, []);

  const resetCircuitBreaker = async () => {
    try {
      await fetch(`${API_BASE}/api/admin/circuit-breaker/reset`, { method: 'POST' });
      await fetchStatus();
    } catch {
      // Fallback
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  return { status, resetCircuitBreaker, refetch: fetchStatus };
}

export function usePublishRuns(limit: number = 10) {
  const [runs, setRuns] = useState<PublishRun[]>([]);
  
  const fetchRuns = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/admin/publish-runs?limit=${limit}`);
      if (res.ok) {
        const data = await res.json();
        setRuns(data.runs || []);
      }
    } catch {
      // Fallback
    }
  }, [limit]);

  useEffect(() => {
    fetchRuns();
    const interval = setInterval(fetchRuns, 5000);
    return () => clearInterval(interval);
  }, [fetchRuns]);

  return { runs, refetch: fetchRuns };
}
