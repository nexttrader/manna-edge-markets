import { useState, useEffect, useCallback, useRef } from 'react';
import { type EdgeSetup } from '../types';
import { useVoice } from '../context/VoiceContext';
import { useAuth } from '../context/AuthContext';
import { API_BASE } from '../config';

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
