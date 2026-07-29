import { useState, useEffect, useCallback } from 'react';
import { Market, type InvalidationAudit } from '../types';
import { API_BASE } from '../config';

export function useHawkeye() {
  const [invalidations, setInvalidations] = useState<InvalidationAudit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchInvalidations = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/api/hawkeye/recent-invalidations`);
      if (!res.ok) throw new Error('Failed to fetch hawkeye data');
      const data = await res.json();
      setInvalidations(data.invalidations || []);
      setError(null);
    } catch (err) {
      console.warn('Backend unavailable, retrying hawkeye sync.');
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInvalidations();
    const interval = setInterval(fetchInvalidations, 10000);
    return () => clearInterval(interval);
  }, [fetchInvalidations]);

  return { invalidations, loading, error, refetch: fetchInvalidations };
}

export function useSetupHistory(setupId: string, market: Market) {
  const [history, setHistory] = useState<InvalidationAudit[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    async function fetchHistory() {
      try {
        setLoading(true);
        const res = await fetch(`${API_BASE}/api/hawkeye/setup/${setupId}/history?market=${market}`);
        if (!res.ok) return;
        const data = await res.json();
        if (isMounted) {
          setHistory(data.history || []);
        }
      } catch {
        // Fallback gracefully
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    fetchHistory();
    return () => { isMounted = false; };
  }, [setupId, market]);

  return { history, loading };
}
