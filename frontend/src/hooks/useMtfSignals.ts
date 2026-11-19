import { useCallback, useEffect, useRef, useState } from 'react';
import { API_BASE } from '../config';
import { useAuth } from '../context/AuthContext';
import type { EdgeSetup } from '../types';

export type DashboardStyleTab = 'scalp' | 'intraday' | 'swing';
export type SwingPairMode = 'd1_h4' | 'h4_h1';

interface MtfApiResponse {
  success: boolean;
  style: 'scalp' | 'swing';
  swingMode?: SwingPairMode;
  contextTf: string;
  entryTf: string;
  setups: EdgeSetup[];
  runnerSetups?: EdgeSetup[];
  pastSetups?: EdgeSetup[];
  generatedAt: string;
  cached?: boolean;
  error?: string;
}

const mtfClientCache = new Map<
  string,
  {
    setups: EdgeSetup[];
    runnerSetups: EdgeSetup[];
    pastSetups: EdgeSetup[];
    contextTf: string;
    entryTf: string;
    generatedAt: string;
    ts: number;
  }
>();

export function useMtfStyleSetups(
  styleTab: DashboardStyleTab,
  swingMode: SwingPairMode
) {
  const { effectiveRole } = useAuth();
  const isMtf = styleTab === 'scalp' || styleTab === 'swing';
  const baseKey = styleTab === 'scalp' ? 'scalp' : `swing:${swingMode}`;
  const cacheKey = `${baseKey}:${effectiveRole}`;

  const [setups, setSetups] = useState<EdgeSetup[]>(() => mtfClientCache.get(cacheKey)?.setups || []);
  const [runnerSetups, setRunnerSetups] = useState<EdgeSetup[]>(() => mtfClientCache.get(cacheKey)?.runnerSetups || []);
  const [pastSetups, setPastSetups] = useState<EdgeSetup[]>(() => mtfClientCache.get(cacheKey)?.pastSetups || []);
  const [contextTf, setContextTf] = useState<string>(() =>
    styleTab === 'scalp' ? '15M' : swingMode === 'd1_h4' ? '1D' : '4H'
  );
  const [entryTf, setEntryTf] = useState<string>(() =>
    styleTab === 'scalp' ? '5M' : swingMode === 'd1_h4' ? '4H' : '1H'
  );
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const inFlightTokensRef = useRef<Map<string, symbol>>(new Map());

  // Immediately reflect cached tab data (or reset while loading) when switching styleTab / swingMode
  useEffect(() => {
    if (!isMtf) return;
    const cached = mtfClientCache.get(cacheKey);
    if (cached) {
      setSetups(cached.setups);
      setRunnerSetups(cached.runnerSetups);
      setPastSetups(cached.pastSetups);
      setContextTf(cached.contextTf);
      setEntryTf(cached.entryTf);
      setGeneratedAt(cached.generatedAt);
    } else {
      setSetups([]);
      setRunnerSetups([]);
      setPastSetups([]);
      setContextTf(styleTab === 'scalp' ? '15M' : swingMode === 'd1_h4' ? '1D' : '4H');
      setEntryTf(styleTab === 'scalp' ? '5M' : swingMode === 'd1_h4' ? '4H' : '1H');
    }
  }, [isMtf, styleTab, swingMode, cacheKey, effectiveRole]);

  const fetchDesk = useCallback(async (force = false) => {
    if (!isMtf) return;
    const cached = mtfClientCache.get(cacheKey);
    if (!force && cached && Date.now() - cached.ts < 10_000) {
      setSetups(cached.setups);
      setRunnerSetups(cached.runnerSetups);
      setPastSetups(cached.pastSetups);
      setContextTf(cached.contextTf);
      setEntryTf(cached.entryTf);
      setGeneratedAt(cached.generatedAt);
      setLoading(false);
      return;
    }

    if (!force && inFlightTokensRef.current.has(cacheKey)) {
      return;
    }

    if (!cached) {
      setLoading(true);
    }
    setError(null);
    const token = Symbol(cacheKey);
    inFlightTokensRef.current.set(cacheKey, token);
    try {
      const qs = new URLSearchParams({
        style: styleTab,
        role: effectiveRole,
        ...(styleTab === 'swing' ? { swingMode } : {}),
        ...(force ? { refresh: '1' } : {})
      });
      const res = await fetch(`${API_BASE}/api/mtf-signals?${qs.toString()}`);
      const data: MtfApiResponse = await res.json();
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      const nextSetups = Array.isArray(data.setups) ? data.setups : [];
      const nextRunners = Array.isArray(data.runnerSetups) ? data.runnerSetups : [];
      const nextPast = Array.isArray(data.pastSetups) ? data.pastSetups : [];
      mtfClientCache.set(cacheKey, {
        setups: nextSetups,
        runnerSetups: nextRunners,
        pastSetups: nextPast,
        contextTf: data.contextTf,
        entryTf: data.entryTf,
        generatedAt: data.generatedAt,
        ts: Date.now()
      });
      setSetups(nextSetups);
      setRunnerSetups(nextRunners);
      setPastSetups(nextPast);
      setContextTf(data.contextTf);
      setEntryTf(data.entryTf);
      setGeneratedAt(data.generatedAt);
    } catch (err: any) {
      setError(err?.message || 'Unable to load multi-timeframe setups');
    } finally {
      if (inFlightTokensRef.current.get(cacheKey) === token) {
        inFlightTokensRef.current.delete(cacheKey);
      }
      setLoading(false);
    }
  }, [isMtf, styleTab, swingMode, cacheKey, effectiveRole]);

  useEffect(() => {
    if (!isMtf) return;
    void fetchDesk(false);
    const interval = window.setInterval(() => void fetchDesk(false), 15_000);
    return () => window.clearInterval(interval);
  }, [isMtf, fetchDesk]);

  return {
    setups,
    runnerSetups,
    pastSetups,
    contextTf,
    entryTf,
    loading,
    error,
    generatedAt,
    refreshDesk: () => fetchDesk(true)
  };
}

export function useMtfPreview() {
  const [preview, setPreview] = useState<{ scalp: EdgeSetup | null; swing: EdgeSetup | null }>({
    scalp: null,
    swing: null
  });

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/mtf-signals/preview`);
        if (!res.ok) return;
        const data = await res.json();
        if (mounted && data?.success) {
          setPreview({
            scalp: data.scalp || null,
            swing: data.swing || null
          });
        }
      } catch {
        // Fallback sample preview renders cleanly
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  return preview;
}
