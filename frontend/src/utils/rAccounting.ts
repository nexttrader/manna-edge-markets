import { useCallback, useState } from 'react';

export interface TradeLike {
  instrument?: string;
  market?: string;
  setup_market?: string;
  strategy_id?: string;
  trading_style?: string;
  outcome_type?: string;
  outcomeType?: string;
  invalidation_reason?: string;
  was_runner?: boolean | number;
  realized_r?: number;
  realizedR?: number;
  realized_pl?: number;
  entry_price?: number;
  entryPrice?: number;
  entry_price_recorded?: number;
  entry_price_executed?: number;
  entry_zone_mid?: number;
  initial_stop?: number;
  stop?: number;
  stopLoss?: number;
  r_multiple_1?: number;
  r_multiple_2?: number;
}

export type TradingStyleFilter = 'all' | 'intraday' | 'scalp' | 'swing';

export function getTradeStyleCategory(trade: TradeLike): 'scalp' | 'intraday' | 'swing' {
  const style = (trade.trading_style || '').toUpperCase();
  const strat = (trade.strategy_id || '').toLowerCase();
  if (style === 'SCALP' || strat === 'manna_scalper') return 'scalp';
  if (style === 'SWING' || strat === 'manna_swing') return 'swing';
  return 'intraday';
}

export function getTradeMarketCategory(trade: TradeLike): 'forex' | 'futures' {
  const m = (trade.market || trade.setup_market || '').toLowerCase();
  if (m === 'forex') return 'forex';
  if (m === 'futures') return 'futures';
  return trade.instrument && trade.instrument.includes('/') ? 'forex' : 'futures';
}

/**
 * Canonical 80/20 Partial Scale-Out Accounting:
 * - TP1 hit (80% at r1, 20% runner stopped at BE 0R) => 0.80 * r1 (+1.60R at 2R)
 * - TP2 hit (80% at r1, 20% runner closed at r2)     => 0.80 * r1 + 0.20 * r2 (+2.20R at 2R/3R)
 * - Break Even (non-runner)                          => 0.00R
 * - Stop Loss                                        => -1.00R
 */
export function getAccurateRealizedR(trade: TradeLike): number {
  const ot = String(trade.outcome_type || trade.outcomeType || trade.invalidation_reason || '').toLowerCase();
  const r1 = trade.r_multiple_1 && Number(trade.r_multiple_1) > 0 ? Number(trade.r_multiple_1) : 2.0;
  const r2 = trade.r_multiple_2 && Number(trade.r_multiple_2) > 0 ? Number(trade.r_multiple_2) : 3.0;

  if (ot.includes('tp2')) {
    return Number((0.80 * r1 + 0.20 * r2).toFixed(2));
  }
  if (ot.includes('tp1') || ot === 'tp' || ot.includes('tp_hit')) {
    return Number((0.80 * r1).toFixed(2));
  }
  if (ot.includes('sl') || ot.includes('stop')) {
    return -1.0;
  }
  if (ot.includes('be') || ot.includes('breakeven')) {
    if (Boolean(trade.was_runner)) {
      return Number((0.80 * r1).toFixed(2));
    }
    return 0.0;
  }

  const rawFallback = trade.realized_r ?? trade.realizedR ?? trade.realized_pl;
  if (rawFallback !== undefined && rawFallback !== null && Number.isFinite(Number(rawFallback))) {
    return Math.max(-1.0, Number(Number(rawFallback).toFixed(2)));
  }

  return 0.0;
}

const FUTURES_POINT_VALUES: Record<string, number> = {
  NQ: 20,
  ES: 50,
  YM: 5,
  RTY: 50,
  GC: 100,
  CL: 1000,
  SI: 5000,
  ZN: 1000,
};

/**
 * Estimates round-turn trading commissions/fees expressed in R-multiples so
 * fee drag scales identically regardless of account size or Risk/Trade ($).
 *
 * - Forex (IC Markets Raw ECN): $7.00 / standard lot round-turn.
 * - Futures (CME standard E-mini + clearing): $4.50 / contract round-turn.
 */
export function estimateTradeFeeR(trade: TradeLike): number {
  const market = getTradeMarketCategory(trade);
  const style = getTradeStyleCategory(trade);
  const entry = Number(
    trade.entry_price ||
      trade.entryPrice ||
      trade.entry_price_executed ||
      trade.entry_price_recorded ||
      trade.entry_zone_mid ||
      0
  );
  const stop = Number(trade.initial_stop || trade.stop || trade.stopLoss || 0);
  const priceRisk = entry > 0 && stop > 0 ? Math.abs(entry - stop) : 0;

  if (market === 'forex') {
    if (priceRisk > 0) {
      const sym = (trade.instrument || '').toUpperCase();
      const isJpy = sym.includes('JPY');
      const pipsRisk = priceRisk * (isJpy ? 100 : 10000);
      const pipValuePerLot = isJpy && entry > 0 ? 1000 / Math.max(entry, 1) : 10;
      const riskPerLotUsd = pipsRisk * pipValuePerLot;
      if (riskPerLotUsd > 0) {
        const feeR = 7.0 / riskPerLotUsd;
        return Number(Math.min(0.30, Math.max(0.01, feeR)).toFixed(3));
      }
    }
    return style === 'scalp' ? 0.12 : style === 'swing' ? 0.02 : 0.07;
  }

  // Futures
  const sym = (trade.instrument || '').toUpperCase().replace('=F', '');
  const pointValue = FUTURES_POINT_VALUES[sym] ?? 20;
  if (priceRisk > 0) {
    const riskPerContractUsd = priceRisk * pointValue;
    if (riskPerContractUsd > 0) {
      const feeR = 4.5 / riskPerContractUsd;
      return Number(Math.min(0.25, Math.max(0.005, feeR)).toFixed(3));
    }
  }
  return style === 'scalp' ? 0.03 : style === 'swing' ? 0.006 : 0.015;
}

export function getEffectiveRealizedR(trade: TradeLike, includeFees: boolean): number {
  const grossR = getAccurateRealizedR(trade);
  if (!includeFees) return grossR;
  const feeR = estimateTradeFeeR(trade);
  return Number((grossR - feeR).toFixed(2));
}

const FEES_LS_KEY = 'manna_analytics_include_fees';

export function useFeesToggle(): [boolean, () => void] {
  const [includeFees, setIncludeFees] = useState<boolean>(() => {
    try {
      return localStorage.getItem(FEES_LS_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const toggleFees = useCallback(() => {
    setIncludeFees((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(FEES_LS_KEY, String(next));
      } catch {
        // ignore storage errors
      }
      return next;
    });
  }, []);

  return [includeFees, toggleFees];
}

export type SessionType = 'asia' | 'london' | 'ny_am' | 'ny_pm';

const ET_PARTS_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function getETDateParts(date: Date) {
  const parts = ET_PARTS_FORMATTER.formatToParts(date);
  const getVal = (type: string) => parts.find((p) => p.type === type)?.value || '';
  return {
    year: parseInt(getVal('year'), 10),
    month: parseInt(getVal('month'), 10),
    day: parseInt(getVal('day'), 10),
    weekday: getVal('weekday'),
    hour: parseInt(getVal('hour'), 10) % 24,
    minute: parseInt(getVal('minute'), 10),
  };
}

/**
 * Maps a timestamp to its America/New_York Trading Day (YYYY-MM-DD) and Killzone session.
 * Hours >= 20:00 ET roll forward into the next calendar day's Asia session.
 */
export function getETTradingDayAndSession(timeStr: string): {
  tradingDay: string;
  weekdayNum: number;
  isWeekend: boolean;
  session: SessionType;
} {
  const exitTime = new Date(timeStr);
  if (Number.isNaN(exitTime.getTime())) {
    return { tradingDay: '', weekdayNum: -1, isWeekend: false, session: 'ny_am' };
  }

  try {
    const { year, month, day, hour } = getETDateParts(exitTime);
    const tradingDayDate = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));

    let session: SessionType;
    if (hour >= 20) {
      session = 'asia';
      tradingDayDate.setUTCDate(tradingDayDate.getUTCDate() + 1);
    } else if (hour < 2) {
      session = 'asia';
    } else if (hour >= 2 && hour < 8) {
      session = 'london';
    } else if (hour >= 8 && hour < 14) {
      session = 'ny_am';
    } else {
      session = 'ny_pm';
    }

    const tYear = tradingDayDate.getUTCFullYear();
    const tMonth = String(tradingDayDate.getUTCMonth() + 1).padStart(2, '0');
    const tDay = String(tradingDayDate.getUTCDate()).padStart(2, '0');
    const weekdayNum = tradingDayDate.getUTCDay();

    return {
      tradingDay: `${tYear}-${tMonth}-${tDay}`,
      weekdayNum,
      isWeekend: weekdayNum === 0 || weekdayNum === 6,
      session,
    };
  } catch {
    const isoDate = exitTime.toISOString().split('T')[0];
    const weekdayNum = exitTime.getUTCDay();
    return {
      tradingDay: isoDate,
      weekdayNum,
      isWeekend: weekdayNum === 0 || weekdayNum === 6,
      session: 'ny_am',
    };
  }
}

export function isWeekendMarketClosed(
  market: string | undefined,
  timeStr: string | null | undefined
): boolean {
  if (!timeStr) return false;
  const dt = new Date(timeStr);
  if (Number.isNaN(dt.getTime())) return false;
  const { weekday, hour } = getETDateParts(dt);
  const isFx = (market || '').toLowerCase() === 'forex';
  if (weekday === 'Fri' && hour >= 17) return true;
  if (weekday === 'Sat') return true;
  if (weekday === 'Sun' && hour < (isFx ? 17 : 18)) return true;
  return false;
}

export interface WeekendCheckableTrade extends TradeLike {
  time_exited?: string;
  execution_time?: string;
  resolved_at?: string;
  time_entered?: string;
  entry_triggered_at?: string;
  time_signaled?: string;
  created_at?: string;
}

/**
 * Returns true if the trade belongs to Saturday/Sunday on the calendar or was
 * signaled, entered, or exited during weekend market-closed hours.
 */
export function isWeekendTrade(trade: WeekendCheckableTrade): boolean {
  const market = getTradeMarketCategory(trade);

  const exitTs = trade.time_exited || trade.execution_time || trade.resolved_at || trade.created_at;
  if (exitTs) {
    const td = getETTradingDayAndSession(exitTs);
    if (td.isWeekend) return true;
    if (isWeekendMarketClosed(market, exitTs)) return true;
  }

  const signalTs = trade.time_signaled || trade.created_at;
  if (signalTs && isWeekendMarketClosed(market, signalTs)) return true;

  const entryTs = trade.time_entered || trade.entry_triggered_at;
  if (entryTs && isWeekendMarketClosed(market, entryTs)) return true;

  return false;
}
