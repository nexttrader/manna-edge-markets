import { useState, useEffect, useCallback, useRef } from 'react';
import { SignalState, Bias, Market, Killzone, type EdgeSetup } from '../types';
import { useVoice } from '../context/VoiceContext';
import { useAuth } from '../context/AuthContext';
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
    strategy_id: 'sentinel_v2',
    strategy_tier: 'elite',
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
    strategy_id: 'manna_snd',
    strategy_tier: 'pro',
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
  },
  {
    id: 'setup-3',
    instrument: 'ES',
    market: Market.FUTURES,
    bias: Bias.SHORT,
    conviction: 88,
    state: SignalState.AWAITING_ENTRY,
    killzone: Killzone.NY_AM,
    strategy_id: 'manna_snd',
    strategy_tier: 'pro',
    createdAt: new Date(Date.now() - 1800000).toISOString(),
    validatedAt: new Date(Date.now() - 1500000).toISOString(),
    unrealizedR: 0,
    levels: {
      entryMin: 5520,
      entryMax: 5525,
      stopLoss: 5535,
      takeProfit1: 5490,
      takeProfit2: 5470
    },
    pips: { stopLoss: -15, takeProfit1: 30, takeProfit2: 50 }
  }
];

export function useSetups() {
  const [setups, setSetups] = useState<EdgeSetup[]>([]);
  const [runnerSetups, setRunnerSetups] = useState<EdgeSetup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { speak } = useVoice();
  const { user } = useAuth();
  const knownSetupIdsRef = useRef<Set<string>>(new Set());
  const isInitialFetchRef = useRef<boolean>(true);

  const fetchSetups = useCallback(async () => {
    if (!user || !user.email) {
      setSetups([]);
      setRunnerSetups([]);
      setLoading(false);
      setError('Authentication required');
      return;
    }

    try {
      const role = user.role || 'trader';
      const email = encodeURIComponent(user.email);
      const res = await fetch(`${API_BASE}/api/accelerate/active-setups?role=${role}&email=${email}`);
      if (!res.ok) throw new Error('Failed to fetch setups');
      const data = await res.json();
      const currentList: EdgeSetup[] = Array.isArray(data.setups) ? data.setups : [];

      // Fetch active runners
      try {
        const runnersRes = await fetch(`${API_BASE}/api/accelerate/runner-setups?role=${role}&email=${email}`);
        if (runnersRes.ok) {
          const runnersData = await runnersRes.json();
          if (Array.isArray(runnersData.setups)) {
            setRunnerSetups(runnersData.setups);
          }
        }
      } catch (rErr) {
        console.warn('Failed to fetch runner setups:', rErr);
      }

      // Check for newly discovered signals
      if (!isInitialFetchRef.current && currentList.length > 0) {
        currentList.forEach(setup => {
          if (!knownSetupIdsRef.current.has(setup.id)) {
            const biasStr = (setup.bias || 'long').toUpperCase();
            const inst = setup.instrument || 'Asset';
            speak(`New ${biasStr} signal discovered for ${inst}.`);
          }
        });
      }

      // Update known set
      currentList.forEach(s => knownSetupIdsRef.current.add(s.id));
      isInitialFetchRef.current = false;

      setSetups(currentList);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setSetups([]);
    } finally {
      setLoading(false);
    }
  }, [speak, user]);

  useEffect(() => {
    fetchSetups();
    const interval = setInterval(fetchSetups, 3000);
    return () => clearInterval(interval);
  }, [fetchSetups]);

  return { setups: Array.isArray(setups) ? setups : [], runnerSetups, loading, error, refetch: fetchSetups };
}
