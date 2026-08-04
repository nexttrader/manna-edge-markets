import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { API_BASE } from '../config';

export interface DecisionMatrixFactors {
  conviction: number;
  winrate?: number;
  liquiditySweep?: number;
  riskReward: number;
  timing?: number;
  proximity: number;
}

export interface DecisionMatrixItem {
  id: string;
  instrument: string;
  market: string;
  bias: string;
  signal_state: string;
  conviction_score: number;
  entry_zone_low: number;
  entry_zone_high: number;
  entry_zone_mid: number;
  stop: number;
  tp1: number;
  r_multiple_1: number;
  current_price?: number;
  distance_in_r?: number;
  is_in_zone: boolean;
  priority_score: number;
  priority_tier: 'IMMINENT_FOCUS' | 'HIGH_ATTENTION' | 'MONITORING' | 'LOW_PRIORITY';
  actionable_recommendation: 'EXECUTE_OR_ARM' | 'ARM_ORDER' | 'MONITOR_STRUCTURE' | 'STAND_BY';
  status_label: string;
  rank: number;
  factors: DecisionMatrixFactors;
  killzone_origin?: string;
  opposing_strategy_warning?: string;
}

export function useDecisionMatrix() {
  const [matrix, setMatrix] = useState<DecisionMatrixItem[]>([]);
  const [topFocus, setTopFocus] = useState<DecisionMatrixItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();
  const prevTopIdRef = useRef<string | null>(null);

  const fetchMatrix = useCallback(async () => {
    try {
      const role = user?.role || 'trader';
      const email = encodeURIComponent(user?.email || '');
      const res = await fetch(`${API_BASE}/api/accelerate/decision-matrix?role=${role}&email=${email}`);
      if (!res.ok) throw new Error('Failed to fetch decision matrix');
      
      const data = await res.json();
      const items: DecisionMatrixItem[] = Array.isArray(data.matrix) ? data.matrix : [];
      setMatrix(items);
      const top = data.topFocus || (items.length > 0 ? items[0] : null);
      setTopFocus(top);

      if (top && top.id !== prevTopIdRef.current) {
        prevTopIdRef.current = top.id;
      }

      setError(null);
    } catch (err) {
      console.warn('Using client-side fallback decision matrix evaluation:', err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchMatrix();
    const interval = setInterval(fetchMatrix, 10000);
    return () => clearInterval(interval);
  }, [fetchMatrix]);

  return { matrix, topFocus, loading, error, refetch: fetchMatrix };
}
