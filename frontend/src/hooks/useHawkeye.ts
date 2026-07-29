import { useState, useEffect, useCallback } from 'react';
import { SignalState, Market, type InvalidationAudit } from '../types';
import { API_BASE } from '../config';

const MOCK_INVALIDATIONS: InvalidationAudit[] = [
  {
    id: 'inv-1',
    setupId: 'setup-3',
    instrument: 'GBPUSD',
    market: Market.FOREX,
    oldState: SignalState.AWAITING_ENTRY,
    newState: SignalState.INVALIDATED,
    reasonCode: 'TIME_DECAY',
    detail: 'Setup failed to trigger before killzone close.',
    timestamp: new Date(Date.now() - 1000000).toISOString(),
    runId: 'run-1042'
  },
  {
    id: 'inv-2',
    setupId: 'setup-4',
    instrument: 'ES',
    market: Market.FUTURES,
    oldState: SignalState.ACTIVE,
    newState: SignalState.SUPERSEDED,
    reasonCode: 'NEW_OPPOSING_SIGNAL',
    detail: 'Stronger counter-trend signal detected on M15 timeframe.',
    timestamp: new Date(Date.now() - 3600000).toISOString(),
    runId: 'run-1041'
  }
];

export function useHawkeye() {
  const [invalidations, setInvalidations] = useState<InvalidationAudit[]>(MOCK_INVALIDATIONS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchInvalidations = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/api/hawkeye/recent-invalidations`);
      if (!res.ok) throw new Error('Failed to fetch hawkeye data');
      const data = await res.json();
      setInvalidations(data.invalidations);
      setError(null);
    } catch (err) {
      console.warn('Backend unavailable, using mock hawkeye data.');
      setInvalidations(MOCK_INVALIDATIONS);
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
    // In a real scenario, fetch specific setup history
    // For now, filter mock data or simulate API call
    setLoading(true);
    setTimeout(() => {
      setHistory(MOCK_INVALIDATIONS.filter(inv => inv.setupId === setupId));
      setLoading(false);
    }, 500);
  }, [setupId, market]);

  return { history, loading };
}
