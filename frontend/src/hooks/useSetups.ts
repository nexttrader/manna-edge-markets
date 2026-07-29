import { useState, useEffect, useCallback, useRef } from 'react';
import { SignalState, Bias, Market, Killzone, type EdgeSetup } from '../types';
import { useVoice } from '../context/VoiceContext';
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
  
  const { speak } = useVoice();
  const prevSetupsRef = useRef<Map<string, EdgeSetup>>(new Map());
  const isInitialLoad = useRef(true);

  const fetchSetups = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/accelerate/active-setups`);
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      const currentList: EdgeSetup[] = data.setups || [];
      
      const newMap = new Map<string, EdgeSetup>();
      currentList.forEach(s => newMap.set(s.id, s));

      // Skip voice alerts on initial page load
      if (!isInitialLoad.current) {
        // 1. Check current setups against previous state
        for (const setup of currentList) {
          const prev = prevSetupsRef.current.get(setup.id);
          const biasText = setup.bias ? setup.bias.toUpperCase() : 'LONG';

          if (!prev) {
            // Brand new signal discovered
            speak(`New Signal Discovered. ${biasText} ${setup.instrument}.`);
          } else {
            const prevState = prev.signal_state || prev.state;
            const currState = setup.signal_state || setup.state;

            // 2. Check for entry filled (awaiting_entry -> active)
            if (prevState === 'awaiting_entry' && currState === 'active') {
              speak(`Entry Triggered for ${setup.instrument}. Position Filled.`);
            }

            // 3. Check for Breakeven threshold (+1.0R reached)
            const prevR = prev.unrealizedR ?? 0;
            const currR = setup.unrealizedR ?? 0;
            if (currR >= 1.0 && prevR < 1.0 && currState === 'active') {
              speak(`Move Stop Loss to Break Even for ${setup.instrument}. Profit locked.`);
            }

            // 4. Check for resolved outcomes
            if (prevState !== 'resolved' && currState === 'resolved') {
              if (setup.invalidation_reason === 'tp2_hit') {
                speak(`Take Profit 2 Reached for ${setup.instrument} in Full Profit.`);
              } else if (setup.invalidation_reason === 'tp1_hit') {
                speak(`Take Profit 1 Reached for ${setup.instrument} in Profit. Move Stop Loss to Break Even.`);
              } else if (setup.invalidation_reason === 'sl_hit') {
                speak(`Stop Loss Hit for ${setup.instrument} in Loss.`);
              }
            }

            // 5. Check for invalidations / removals
            if (prevState !== 'invalidated' && currState === 'invalidated') {
              const reason = setup.invalidation_reason || '';
              if (reason.includes('displaced')) {
                speak(`Signal Cancelled for ${setup.instrument} due to Price Displacement.`);
              } else if (reason.includes('expired')) {
                speak(`Entry Expired for ${setup.instrument}.`);
              } else {
                speak(`Signal Invalidated for ${setup.instrument}.`);
              }
            }
          }
        }
      } else {
        isInitialLoad.current = false;
      }

      prevSetupsRef.current = newMap;
      setSetups(currentList);
      setError(null);
    } catch (err) {
      console.warn('Backend unavailable, using mock setups.');
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [speak]);

  useEffect(() => {
    fetchSetups();
    const interval = setInterval(fetchSetups, 5000);
    return () => clearInterval(interval);
  }, [fetchSetups]);

  return { setups, loading, error, refetch: fetchSetups };
}
