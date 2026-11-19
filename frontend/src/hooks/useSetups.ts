import { useState, useEffect, useCallback, useRef } from 'react';
import { type EdgeSetup } from '../types';
import { useVoice } from '../context/VoiceContext';
import { useAuth } from '../context/AuthContext';
import { API_BASE } from '../config';
import { fetchActiveSetupsDeduped, invalidateActiveSetupsCache } from '../utils/activeSetupsClient';

export function useSetups() {
  const [setups, setSetups] = useState<EdgeSetup[]>([]);
  const [runnerSetups, setRunnerSetups] = useState<EdgeSetup[]>([]);
  const [allRunnerSetups, setAllRunnerSetups] = useState<EdgeSetup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { speak } = useVoice();
  const { user, effectiveRole } = useAuth();
  const knownSetupIdsRef = useRef<Set<string>>(new Set());
  const isInitialFetchRef = useRef<boolean>(true);
  const lastRoleRef = useRef<string>(effectiveRole);
  const isFetchingActiveRef = useRef<boolean>(false);
  const isFetchingRunnersRef = useRef<boolean>(false);

  if (lastRoleRef.current !== effectiveRole) {
    lastRoleRef.current = effectiveRole;
    isInitialFetchRef.current = true;
    knownSetupIdsRef.current.clear();
    invalidateActiveSetupsCache();
  }

  const fetchSetups = useCallback(async (force = false) => {
    if (!user || !user.email) {
      setSetups([]);
      setRunnerSetups([]);
      setAllRunnerSetups([]);
      setLoading(false);
      setError('Authentication required');
      return;
    }

    const role = effectiveRole || user.role || 'trader';
    const email = encodeURIComponent(user.email);

    const activeTask = (async () => {
      if (!force && isFetchingActiveRef.current) return;
      isFetchingActiveRef.current = true;
      try {
        const res = await fetchActiveSetupsDeduped(role, user.email, force);
        if (!res.ok) throw new Error('Failed to fetch setups');
        const currentList: EdgeSetup[] = Array.isArray(res.data?.setups) ? res.data.setups : [];

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
        isFetchingActiveRef.current = false;
        setLoading(false);
      }
    })();

    const runnersTask = (async () => {
      if (!force && isFetchingRunnersRef.current) return;
      isFetchingRunnersRef.current = true;
      try {
        const [runnersRes, mtfRunnersRes] = await Promise.all([
          fetch(`${API_BASE}/api/accelerate/runner-setups?role=${role}&email=${email}`),
          fetch(`${API_BASE}/api/mtf-signals/runners?role=${role}`).catch(() => null),
        ]);

        let intraRunners: EdgeSetup[] = [];
        if (runnersRes.ok) {
          const runnersData = await runnersRes.json();
          if (Array.isArray(runnersData.setups)) {
            intraRunners = runnersData.setups.map((s: EdgeSetup) => ({
              ...s,
              trading_style: s.trading_style || 'INTRADAY',
            }));
            setRunnerSetups(intraRunners);
          }
        }

        let mtfRunners: EdgeSetup[] = [];
        if (mtfRunnersRes && mtfRunnersRes.ok) {
          const mtfData = await mtfRunnersRes.json();
          if (Array.isArray(mtfData.setups)) {
            mtfRunners = mtfData.setups;
          }
        }

        const merged = [...intraRunners];
        mtfRunners.forEach((m) => {
          if (!merged.some((existing) => existing.id === m.id)) {
            merged.push(m);
          }
        });
        setAllRunnerSetups(merged);
      } catch (rErr) {
        console.warn('Failed to fetch runner setups:', rErr);
      } finally {
        isFetchingRunnersRef.current = false;
      }
    })();

    await Promise.all([activeTask, runnersTask]);
  }, [speak, user, effectiveRole]);

  const refetch = useCallback(() => fetchSetups(true), [fetchSetups]);

  useEffect(() => {
    void fetchSetups(false);
    const interval = setInterval(() => void fetchSetups(false), 3000);
    return () => clearInterval(interval);
  }, [fetchSetups]);

  return { setups: Array.isArray(setups) ? setups : [], runnerSetups, allRunnerSetups, loading, error, refetch };
}
