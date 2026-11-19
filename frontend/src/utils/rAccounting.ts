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

export type ExitProfile = '80_20' | 'all_2r' | 'all_3r';

const EXIT_PROFILE_WEIGHTS: Record<ExitProfile, { w1: number; w2: number }> = {
  '80_20': { w1: 0.8, w2: 0.2 },
  all_2r: { w1: 1.0, w2: 0.0 },
  all_3r: { w1: 0.0, w2: 1.0 },
};

/**
 * Computes realized R under the selected exit profile:
 * - '80_20' (canonical): 80% closed at r1 (2R), 20% runner closed at r2 (3R) or BE (0R)
 * - 'all_2r': 100% closed at r1 (2R) on any TP1/TP2 win
 * - 'all_3r': 100% held for r2 (3R); TP1-only trades close at BE (0R)
 */
export function getAccurateRealizedR(trade: TradeLike, exitProfile: ExitProfile = '80_20'): number {
  const ot = String(trade.outcome_type || trade.outcomeType || trade.invalidation_reason || '').toLowerCase();
  const r1 = trade.r_multiple_1 && Number(trade.r_multiple_1) > 0 ? Number(trade.r_multiple_1) : 2.0;
  const r2 = trade.r_multiple_2 && Number(trade.r_multiple_2) > 0 ? Number(trade.r_multiple_2) : 3.0;
  const { w1, w2 } = EXIT_PROFILE_WEIGHTS[exitProfile];

  if (ot.includes('tp2')) {
    return Number((w1 * r1 + w2 * r2).toFixed(2));
  }
  if (ot.includes('tp1') || ot === 'tp' || ot.includes('tp_hit')) {
    return Number((w1 * r1).toFixed(2));
  }
  if (ot.includes('sl') || ot.includes('stop')) {
    return -1.0;
  }
  if (ot.includes('be') || ot.includes('breakeven')) {
    if (Boolean(trade.was_runner)) {
      return Number((w1 * r1).toFixed(2));
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

export function getEffectiveRealizedR(
  trade: TradeLike,
  includeFees: boolean,
  exitProfile: ExitProfile = '80_20'
): number {
  const grossR = getAccurateRealizedR(trade, exitProfile);
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
  metadata?: string | Record<string, unknown> | null;
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

export const SCALP_TRACKING_START_DAY = '2026-11-19';
export const SCALP_TRACKING_START_ISO = '2026-11-19T16:15:00.000Z';
export const MTF_ALIGNMENT_START_ISO = SCALP_TRACKING_START_ISO;

function matchesPreCutoffMtfRule(trade: WeekendCheckableTrade, cutoff: string): boolean {
  if (trade.metadata) {
    const metaStr = typeof trade.metadata === 'string'
      ? trade.metadata
      : JSON.stringify(trade.metadata);
    if (
      metaStr.includes('mtf_isolated_desk') &&
      !metaStr.includes('"engine":"manna_snd"') &&
      !metaStr.includes('mtf_manna_snd')
    ) {
      return true;
    }
  }

  const exitTs = trade.time_exited || trade.execution_time || trade.resolved_at || trade.created_at;
  const sigTs = trade.time_signaled || trade.created_at;

  if (cutoff.includes('T')) {
    const cutoffMs = new Date(cutoff).getTime();
    if (Number.isFinite(cutoffMs)) {
      if (exitTs) {
        const exitMs = new Date(exitTs).getTime();
        if (Number.isFinite(exitMs) && exitMs < cutoffMs) return true;
      }
      if (sigTs) {
        const sigMs = new Date(sigTs).getTime();
        if (Number.isFinite(sigMs) && sigMs < cutoffMs) return true;
      }
    }
  } else {
    if (exitTs) {
      const td = getETTradingDayAndSession(exitTs);
      if (td.tradingDay && td.tradingDay < cutoff) return true;
    }

    if (sigTs) {
      const td = getETTradingDayAndSession(sigTs);
      if (td.tradingDay && td.tradingDay < cutoff) return true;
    }
  }

  return false;
}

/**
 * Excludes historical Scalping and Swing trade records before the Manna SnD parameter
 * alignment cutoff (`2026-11-19T16:15:00.000Z`) or with legacy pre-alignment
 * `mtf_isolated_desk` metadata. Never excludes Intraday trades.
 */
export function isPreCutoffMtfTrade(
  trade: WeekendCheckableTrade,
  cutoff: string = MTF_ALIGNMENT_START_ISO
): boolean {
  const style = getTradeStyleCategory(trade);
  if (style !== 'scalp' && style !== 'swing') return false;
  return matchesPreCutoffMtfRule(trade, cutoff);
}

/**
 * Excludes historical Scalping trade records before the Manna SnD parameter
 * alignment cutoff (`2026-11-19T16:15:00.000Z`) or with legacy pre-alignment
 * `mtf_isolated_desk` metadata, allowing Scalping calendar tracking cleanly onwards.
 */
export function isPreCutoffScalpTrade(
  trade: WeekendCheckableTrade,
  cutoff: string = SCALP_TRACKING_START_ISO
): boolean {
  if (getTradeStyleCategory(trade) !== 'scalp') return false;
  return matchesPreCutoffMtfRule(trade, cutoff);
}

export const HIDDEN_CALENDAR_YEAR = '2026';
export const HIDDEN_CALENDAR_MONTHS: ReadonlySet<string> = new Set(['08', '09', '10']);

/**
 * Returns true if a trade's ET calendar trading day falls in August, September, or
 * October 2026 (`2026-08`, `2026-09`, `2026-10`). Used to remove those months from
 * the calendar UI while keeping all underlying records saved on the backend.
 */
export function isHiddenCalendarMonthTrade(trade: WeekendCheckableTrade): boolean {
  const exitTs =
    trade.time_exited ||
    trade.execution_time ||
    trade.resolved_at ||
    trade.created_at ||
    trade.time_signaled;
  if (!exitTs) return false;

  const { tradingDay } = getETTradingDayAndSession(exitTs);
  if (!tradingDay || tradingDay.length < 7) return false;

  const year = tradingDay.slice(0, 4);
  const month = tradingDay.slice(5, 7);
  return year === HIDDEN_CALENDAR_YEAR && HIDDEN_CALENDAR_MONTHS.has(month);
}
