import { useState, useEffect, useCallback } from 'react';
import { SignalState, Bias, Market, Killzone, type EdgeSetup } from '../types';
import { API_BASE } from '../config';

const MOCK_SETUPS: EdgeSetup[] = [
  {
    id: 'setup-1',
    instrument: 'EUR/USD',
    market: Market.FOREX,
    bias: Bias.LONG,
    conviction: 82,
    state: SignalState.ACTIVE,
    killzone: Killzone.NY_AM,
    createdAt: new Date(Date.now() - 3600000).toISOString(),
    validatedAt: new Date(Date.now() - 3000000).toISOString(),
    entryAt: new Date(Date.now() - 2800000).toISOString(),
    unrealizedR: 1.2,
    levels: {
      entryMin: 1.0920,
      entryMax: 1.0935,
      stopLoss: 1.0885,
      takeProfit1: 1.0970,
      takeProfit2: 1.1020
    },
    pips: { stopLoss: -35, takeProfit1: 50, takeProfit2: 100 }
  },
  {
    id: 'setup-2',
    instrument: 'NQ',
    market: Market.FUTURES,
    bias: Bias.SHORT,
    conviction: 95,
    state: SignalState.AWAITING_ENTRY,
    killzone: Killzone.LONDON,
    createdAt: new Date(Date.now() - 7200000).toISOString(),
    validatedAt: new Date(Date.now() - 7000000).toISOString(),
    unrealizedR: 0,
    levels: {
      entryMin: 18050,
      entryMax: 18075,
      stopLoss: 18120,
      takeProfit1: 17950,
      takeProfit2: 17800
    },
    pips: { stopLoss: -70, takeProfit1: 100, takeProfit2: 250 }
  }
];

export function useSetups() {
  const [setups, setSetups] = useState<EdgeSetup[]>(MOCK_SETUPS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSetups = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/accelerate/active-setups`);
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      const currentList: EdgeSetup[] = data.setups || [];
      
      setSetups(currentList);
      setError(null);
    } catch (err) {
      console.warn('Backend unavailable, using mock setups.');
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSetups();
    const interval = setInterval(fetchSetups, 5000);
    return () => clearInterval(interval);
  }, [fetchSetups]);

  return { setups, loading, error, refetch: fetchSetups };
}
