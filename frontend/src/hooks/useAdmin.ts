import { useState, useCallback, useEffect } from 'react';
import { type SystemStatus, type PublishRun } from '../types';
import { API_BASE } from '../config';

export function useAdmin() {
  const triggerRun = async (mode: 'live' | 'dry_run', market: 'FUTURES' | 'FOREX' | 'ALL') => {
    try {
      const scope = market === 'ALL' ? 'both' : market.toLowerCase();
      const res = await fetch(`${API_BASE}/api/admin/scheduled/session-boundary-revalidation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, market: scope })
      });
      return res.ok;
    } catch {
      return false;
    }
  };

  return { triggerRun };
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
