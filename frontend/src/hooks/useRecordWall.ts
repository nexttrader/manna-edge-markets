import { useCallback, useEffect, useState } from 'react';
import { API_BASE } from '../config';

export interface DailyLedgerTrade {
  id: string;
  tradeId: string;
  sourceTable: 'edge_setups' | 'forex_edge_setups' | 'mtf_style_setups';
  instrument: string;
  market: 'futures' | 'forex';
  tradingStyle: 'INTRADAY' | 'SCALP' | 'SWING';
  strategyId: string;
  strategyName: string;
  bias: 'long' | 'short';
  killzoneOrigin: string;
  tradingDay: string;
  createdAt: string;
  filledAt: string | null;
  resolvedAt: string | null;
  entryZoneLow: number;
  entryZoneHigh: number;
  entryZoneMid: number;
  entryPrice: number | null;
  stop: number;
  tp1: number;
  tp2: number | null;
  rMultiple1: number;
  rMultiple2: number;
  signalState: string;
  statusCategory: 'won' | 'lost' | 'breakeven' | 'superseded' | 'invalidated' | 'live' | 'pending';
  outcomeType: string | null;
  outcomeLabel: string;
  realizedR: number | null;
  superseded: boolean;
  supersededBy: string | null;
  supersededByTradeId: string | null;
  supersededByInstrument: string | null;
  invalidationReason: string | null;
  invalidationDetail: string | null;
  convictionScore: number | null;
  zoneTimeframe: string | null;
  nested5mUpgrade: boolean;
  wasRunner: boolean;
  executionPrice: number | null;
  durationMin: number | null;
  notes: string | null;
}

export interface DailyLedgerSummary {
  tradingDay: string;
  totalPublished: number;
  resolvedTrades: number;
  wins: number;
  losses: number;
  breakevens: number;
  supersededCount: number;
  invalidatedCount: number;
  liveCount: number;
  pendingCount: number;
  winRate: number;
  totalRealizedR: number;
  avgRealizedR: number;
  profitFactor: number | null;
  supersededBreakdown: Record<string, number>;
  invalidationBreakdown: Record<string, number>;
  byStyle: Record<
    'INTRADAY' | 'SCALP' | 'SWING',
    {
      total: number;
      resolved: number;
      wins: number;
      losses: number;
      breakevens: number;
      superseded: number;
      realizedR: number;
    }
  >;
}

export interface RecordWallPublication {
  tradingDay: string;
  status: 'published' | 'unpublished' | 'not_published';
  title: string | null;
  adminNotes: string | null;
  publishedBy: string | null;
  publishedAt: string | null;
  updatedAt: string | null;
}

export interface RecordWallDayItem extends RecordWallPublication {
  summary: DailyLedgerSummary;
}

export interface RecordWallOverallStats {
  daysPublished: number;
  totalPublished: number;
  resolvedTrades: number;
  wins: number;
  losses: number;
  breakevens: number;
  supersededCount: number;
  invalidatedCount: number;
  winRate: number;
  totalRealizedR: number;
}

export interface PublicRecordWallData {
  enabled: boolean;
  publishedDayCount: number;
  days: RecordWallDayItem[];
  overallStats: RecordWallOverallStats;
  selectedDay: string | null;
  ledger: {
    tradingDay: string;
    summary: DailyLedgerSummary;
    trades: DailyLedgerTrade[];
    publication: RecordWallPublication;
  } | null;
}

export function useRecordWall(options?: {
  day?: string;
  market?: 'all' | 'futures' | 'forex';
  style?: 'all' | 'intraday' | 'scalp' | 'swing';
  status?: string;
  summaryOnly?: boolean;
}) {
  const [data, setData] = useState<PublicRecordWallData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const day = options?.day;
  const market = options?.market || 'all';
  const style = options?.style || 'all';
  const status = options?.status || 'all';

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (day) qs.set('day', day);
      if (market !== 'all') qs.set('market', market);
      if (style !== 'all') qs.set('style', style);
      if (status !== 'all') qs.set('status', status);

      const res = await fetch(`${API_BASE}/api/record-wall?${qs.toString()}`);
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to load Verified Record Wall');
      }
      setData(json);
    } catch (err: any) {
      setError(err?.message || 'Unable to load Verified Record Wall');
    } finally {
      setLoading(false);
    }
  }, [day, market, style, status]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    data,
    loading,
    error,
    refresh,
    isAvailable: Boolean(data?.enabled && (data?.publishedDayCount ?? 0) > 0),
    publishedDayCount: data?.publishedDayCount ?? 0,
  };
}
