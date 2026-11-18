import { useState, useMemo, useEffect } from 'react';
import type { EdgeSetup } from '../types';
import { API_BASE } from '../config';
import { SetupChartModal } from './SetupChartModal';
import { AssetPerformanceModal } from './AssetPerformanceModal';
import { formatTelegramTradeId } from '../utils/tradeId';
import {
  buildMacroEventsMap,
  formatPlainDateHeading,
  getTodayPlainDateStr,
  type LiveFeedEventLike,
  type MacroCalendarEvent,
} from '../data/macroCalendarDates';
import {
  getAccurateRealizedR,
  estimateTradeFeeR,
  getEffectiveRealizedR,
  getTradeStyleCategory,
  getETTradingDayAndSession,
  isHiddenCalendarMonthTrade,
  isPreCutoffScalpTrade,
  isWeekendTrade,
  useFeesToggle,
  type ExitProfile,
  type SessionType,
  type TradingStyleFilter,
} from '../utils/rAccounting';
import './ExpandableCalendar.css';

export { getAccurateRealizedR };

interface Outcome {
  id: string;
  setup_id: string;
  instrument?: string;
  market?: string;
  bias?: string;
  strategy_id?: string;
  trading_style?: string;
  timeframe?: string;
  htf_timeframe?: string;
  entry_timeframe?: string;
  was_runner?: boolean | number;
  conviction_score?: number;
  outcome_type: string;
  realized_r?: number;
  realized_pl?: number;
  entry_price?: number;
  entry_price_recorded?: number;
  entry_price_executed?: number;
  entry_zone_low?: number;
  entry_zone_high?: number;
  entry_zone_mid?: number;
  initial_stop?: number;
  stop?: number;
  tp1?: number;
  tp2?: number;
  r_multiple_1?: number;
  r_multiple_2?: number;
  execution_price?: number;
  execution_time?: string;
  time_signaled?: string;
  time_entered?: string;
  time_exited?: string;
  time_to_fill_min?: number;
  holding_duration_min?: number;
  duration_min?: number;
  killzone_origin?: string;
  created_at?: string;
  setup_market?: string;
  invalidation_reason?: string;
  invalidation_detail?: string;
  trade_id?: string;
  metadata?: any;
}

const EXIT_PROFILE_OPTIONS: Array<{ id: ExitProfile; label: string; title: string }> = [
  {
    id: 'all_2r',
    label: '🎯 All 2R',
    title: 'Simulate closing 100% of every TP1/TP2 winner at 2R (TP1)',
  },
  {
    id: '80_20',
    label: '⚖️ 80/20',
    title: 'Live scale-out rule: 80% off at 2R (TP1) + 20% runner to 3R (TP2) or BE',
  },
  {
    id: 'all_3r',
    label: '🚀 All 3R',
    title: 'Simulate holding 100% for 3R (TP2); TP1-only trades close at 0R BE',
  },
];

function convertOutcomeToSetup(
  trade: Outcome,
  includeFees: boolean,
  exitProfile: ExitProfile = '80_20'
): EdgeSetup {
  const entryPrice = trade.entry_price || trade.entry_price_executed || trade.entry_price_recorded || trade.entry_zone_mid || trade.execution_price || 0;
  const initialStop = trade.initial_stop || trade.stop || 0;
  const currentStop = trade.stop || initialStop;
  const exitPrice = trade.execution_price || (
    trade.outcome_type?.includes('tp1') ? trade.tp1 :
    trade.outcome_type?.includes('tp2') ? (trade.tp2 || trade.tp1) :
    trade.outcome_type?.includes('sl') ? initialStop :
    trade.outcome_type?.includes('be') ? entryPrice : undefined
  );
  const calculatedR = getEffectiveRealizedR(trade, includeFees, exitProfile);

  return {
    id: trade.setup_id || trade.id,
    instrument: trade.instrument || 'UNKNOWN',
    market: trade.market || trade.setup_market || 'futures',
    bias: trade.bias || 'long',
    conviction_score: trade.conviction_score || 85,
    conviction: trade.conviction_score || 85,
    strategy_id: trade.strategy_id || 'manna_snd',
    trading_style: (trade.trading_style as EdgeSetup['trading_style']) || undefined,
    timeframe: trade.timeframe,
    htf_timeframe: trade.htf_timeframe,
    entry_timeframe: trade.entry_timeframe,
    signal_state: 'resolved',
    entry_zone_low: trade.entry_zone_low || (entryPrice ? entryPrice * 0.999 : 0),
    entry_zone_high: trade.entry_zone_high || (entryPrice ? entryPrice * 1.001 : 0),
    entry_zone_mid: trade.entry_zone_mid || entryPrice,
    entry_price_recorded: trade.entry_price_recorded || entryPrice,
    entry_price_executed: trade.entry_price_executed || entryPrice,
    initial_stop: initialStop,
    stop: currentStop,
    tp1: trade.tp1,
    tp2: trade.tp2,
    r_multiple_1: trade.r_multiple_1 || 2.0,
    r_multiple_2: trade.r_multiple_2 || 3.0,
    created_at: trade.time_signaled || trade.created_at,
    entry_triggered_at: trade.time_entered || trade.time_signaled,
    resolved_at: trade.time_exited || trade.execution_time || trade.created_at,
    invalidation_reason: trade.outcome_type || trade.invalidation_reason || 'resolved',
    invalidation_detail: trade.invalidation_detail,
    killzone_origin: trade.killzone_origin,
    execution_price: exitPrice,
    realized_r: calculatedR,
    realized_pl: calculatedR,
    time_to_fill_min: trade.time_to_fill_min,
    holding_duration_min: trade.holding_duration_min || trade.duration_min,
    duration_min: trade.duration_min || trade.holding_duration_min,
    trade_id: trade.setup_id,
    metadata: typeof trade.metadata === 'object' ? JSON.stringify(trade.metadata) : trade.metadata,
  };
}

interface ExpandableCalendarProps {
  outcomes: Outcome[];
  mtfOutcomes?: Outcome[];
  strategyFilter: string;
  marketFilter?: 'all' | 'forex' | 'futures';
  onMarketFilterChange?: (market: 'all' | 'forex' | 'futures') => void;
  enableStyleToggle?: boolean;
  includeFees?: boolean;
  onToggleFees?: () => void;
}

function getOutcomeMarket(trade: Outcome): 'forex' | 'futures' {
  const m = (trade.market || trade.setup_market || '').toLowerCase();
  if (m === 'forex') return 'forex';
  if (m === 'futures') return 'futures';
  return (trade.instrument && trade.instrument.includes('/')) ? 'forex' : 'futures';
}

interface DaySessionData {
  trades: Outcome[];
  totalR: number;
}

interface DayData {
  dateStr: string; // YYYY-MM-DD
  dayNum: number;
  isCurrentMonth: boolean;
  totalR: number;
  futuresR: number;
  forexR: number;
  sessions: Record<SessionType, DaySessionData>;
  hasActivity: boolean;
  macroEvents: MacroCalendarEvent[];
}

export function ExpandableCalendar({
  outcomes = [],
  mtfOutcomes = [],
  strategyFilter = 'all',
  marketFilter: propsMarketFilter,
  onMarketFilterChange,
  enableStyleToggle = true,
  includeFees: propsIncludeFees,
  onToggleFees: propsOnToggleFees,
}: ExpandableCalendarProps) {
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [internalMarketFilter, setInternalMarketFilter] = useState<'all' | 'forex' | 'futures'>(propsMarketFilter || 'all');
  const [styleFilter, setStyleFilter] = useState<TradingStyleFilter>('intraday');
  const [exitProfile, setExitProfile] = useState<ExitProfile>('80_20');
  const [internalIncludeFees, toggleInternalFees] = useFeesToggle();
  const activeIncludeFees = propsIncludeFees !== undefined ? propsIncludeFees : internalIncludeFees;
  const handleToggleFees = propsOnToggleFees || toggleInternalFees;
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [selectedDayStr, setSelectedDayStr] = useState<string | null>(null);
  const [selectedReviewSetup, setSelectedReviewSetup] = useState<EdgeSetup | null>(null);
  const [showAssetPerfModal, setShowAssetPerfModal] = useState<boolean>(false);
  const [copiedTradeId, setCopiedTradeId] = useState<string | null>(null);
  const [riskPerR, setRiskPerR] = useState<number>(100); // User adjustable risk size in USD
  const [liveMacroEvents, setLiveMacroEvents] = useState<LiveFeedEventLike[]>([]);

  useEffect(() => {
    if (!isExpanded) return;
    let cancelled = false;
    fetch(`${API_BASE}/api/news/calendar?currency=USD&impact=high`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data && Array.isArray(data.events)) {
          setLiveMacroEvents(data.events);
        }
      })
      .catch(() => {
        // Static 2025-2027 BLS/Fed macro schedule remains active offline
      });
    return () => {
      cancelled = true;
    };
  }, [isExpanded]);

  const macroEventsByDate = useMemo(
    () => buildMacroEventsMap(liveMacroEvents),
    [liveMacroEvents]
  );

  const currentMarketFilter = propsMarketFilter !== undefined ? propsMarketFilter : internalMarketFilter;
  const handleMarketFilterChange = (m: 'all' | 'forex' | 'futures') => {
    setInternalMarketFilter(m);
    if (onMarketFilterChange) onMarketFilterChange(m);
  };

  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth(); // 0-indexed

  // Months labels
  const monthNames = [
    'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
    'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'
  ];
  const shortMonthNames = [
    'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
    'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'
  ];

  // Formatting helpers declared early to be used in calculations
  const formatPNLString = (rVal: number) => {
    const sign = rVal > 0 ? '+' : '';
    return `${sign}${rVal.toFixed(2)}R`;
  };

  const formatCurrency = (rVal: number) => {
    const value = rVal * riskPerR;
    const sign = value > 0 ? '+$' : value < 0 ? '-$' : '$';
    return `${sign}${Math.abs(value).toFixed(2)}`;
  };

  const getPnlClass = (rVal: number) => {
    if (rVal > 0.01) return 'text-green';
    if (rVal < -0.01) return 'text-red';
    return 'text-muted';
  };

  const matchesStrategy = (stratId?: string) => {
    if (strategyFilter === 'all') return true;
    if (!stratId) return false;
    if (strategyFilter === 'elite_fractal' || strategyFilter === 'sentinel_v2') {
      return stratId === 'elite_fractal' || stratId === 'sentinel_v2';
    }
    return stratId === strategyFilter;
  };

  // Combine core Intraday outcomes with resolved/runner Scalp & Swing outcomes
  // (excluding weekend trades, pre-2026-11-18 Scalping dev records, and Aug-Oct 2026 calendar display)
  const { combinedOutcomes, styleCounts } = useMemo(() => {
    const taggedIntraday = outcomes.map(o => ({
      ...o,
      trading_style: o.trading_style || 'INTRADAY',
    }));
    const rawMerged: Outcome[] = enableStyleToggle ? [...taggedIntraday, ...mtfOutcomes] : taggedIntraday;
    const merged: Outcome[] = rawMerged.filter(
      o => !isWeekendTrade(o) && !isPreCutoffScalpTrade(o) && !isHiddenCalendarMonthTrade(o)
    );
    const counts = { intraday: 0, scalp: 0, swing: 0, all: 0 };

    merged.forEach(o => {
      const style = getTradeStyleCategory(o);
      if (style === 'intraday' && !matchesStrategy(o.strategy_id)) return;
      counts[style]++;
      counts.all++;
    });

    return { combinedOutcomes: merged, styleCounts: counts };
  }, [outcomes, mtfOutcomes, enableStyleToggle, strategyFilter]);

  const activeStyleFilter: TradingStyleFilter = enableStyleToggle ? styleFilter : 'intraday';

  const matchesActiveStyleAndStrategy = (o: Outcome) => {
    const style = getTradeStyleCategory(o);
    if (activeStyleFilter !== 'all' && style !== activeStyleFilter) return false;
    if (style === 'intraday' && !matchesStrategy(o.strategy_id)) return false;
    return true;
  };

  // 1. Calculate overall Forex vs Futures realized R splits (respecting Style, Exit Profile + Fees toggle)
  const {
    totalFuturesR,
    totalForexR,
    totalCombinedR,
    baselineDeltaR,
    totalFeesR,
    forexCount,
    futuresCount,
  } = useMemo(() => {
    let fut = 0;
    let fx = 0;
    let baseFut = 0;
    let baseFx = 0;
    let feesSum = 0;
    let fCount = 0;
    let futCount = 0;
    combinedOutcomes.forEach(o => {
      if (!matchesActiveStyleAndStrategy(o)) return;
      const feeR = estimateTradeFeeR(o);
      const r = getEffectiveRealizedR(o, activeIncludeFees, exitProfile);
      const baseR = getEffectiveRealizedR(o, activeIncludeFees, '80_20');
      const mkt = getOutcomeMarket(o);
      if (mkt === 'forex') {
        fx += r;
        baseFx += baseR;
        fCount++;
      } else {
        fut += r;
        baseFut += baseR;
        futCount++;
      }
      if (currentMarketFilter === 'all' || mkt === currentMarketFilter) {
        feesSum += feeR;
      }
    });
    const activeTotal =
      currentMarketFilter === 'forex' ? fx : currentMarketFilter === 'futures' ? fut : fut + fx;
    const baseTotal =
      currentMarketFilter === 'forex'
        ? baseFx
        : currentMarketFilter === 'futures'
        ? baseFut
        : baseFut + baseFx;

    return {
      totalFuturesR: fut,
      totalForexR: fx,
      totalCombinedR: fut + fx,
      baselineDeltaR: Number((activeTotal - baseTotal).toFixed(2)),
      totalFeesR: feesSum,
      forexCount: fCount,
      futuresCount: futCount
    };
  }, [combinedOutcomes, strategyFilter, activeStyleFilter, activeIncludeFees, currentMarketFilter, exitProfile]);

  // 2. Filter outcomes by the selected style, strategy and market, mapping them to trading days and sessions
  const filteredOutcomesList = useMemo(() => {
    return combinedOutcomes.filter(o => {
      if (!matchesActiveStyleAndStrategy(o)) return false;
      if (currentMarketFilter !== 'all') {
        if (getOutcomeMarket(o) !== currentMarketFilter) return false;
      }
      return true;
    });
  }, [combinedOutcomes, strategyFilter, activeStyleFilter, currentMarketFilter]);

  const processedOutcomes = useMemo(() => {
    // Group by Trading Day
    const grouped: Record<string, Record<SessionType, Outcome[]>> = {};

    filteredOutcomesList.forEach(o => {
      // Use time_exited, execution_time, or created_at
      const timeToUse = o.time_exited || o.execution_time || o.created_at;
      if (!timeToUse) return;

      const { tradingDay, isWeekend, session } = getETTradingDayAndSession(timeToUse);
      if (!tradingDay || isWeekend) return;
      
      if (!grouped[tradingDay]) {
        grouped[tradingDay] = {
          asia: [],
          london: [],
          ny_am: [],
          ny_pm: []
        };
      }
      
      grouped[tradingDay][session].push(o);
    });

    return grouped;
  }, [filteredOutcomesList]);

  // 2b. Compute Monthly P&L breakdown across all 12 months of the active year (respecting Style, Market & Fees toggles)
  const { monthlyReturns, yearTotalR, yearTradesCount } = useMemo(() => {
    const months = shortMonthNames.map((label, monthIndex) => ({
      monthIndex,
      label,
      netR: 0,
      trades: 0,
    }));
    let yrTotal = 0;
    let yrCount = 0;

    Object.entries(processedOutcomes).forEach(([tradingDay, daySessions]) => {
      const yearStr = tradingDay.slice(0, 4);
      if (Number(yearStr) !== currentYear) return;
      const monthIdx = Number(tradingDay.slice(5, 7)) - 1;
      if (monthIdx < 0 || monthIdx > 11) return;

      (['asia', 'london', 'ny_am', 'ny_pm'] as SessionType[]).forEach((sk) => {
        daySessions[sk].forEach((t) => {
          const r = getEffectiveRealizedR(t, activeIncludeFees, exitProfile);
          months[monthIdx].netR += r;
          months[monthIdx].trades += 1;
          yrTotal += r;
          yrCount += 1;
        });
      });
    });

    months.forEach((m) => {
      m.netR = Number(m.netR.toFixed(2));
    });

    return {
      monthlyReturns: months,
      yearTotalR: Number(yrTotal.toFixed(2)),
      yearTradesCount: yrCount,
    };
  }, [processedOutcomes, currentYear, activeIncludeFees, exitProfile]);

  // 3. Generate Calendar Month Grid Cells
  const calendarCells = useMemo(() => {
    const cells: DayData[] = [];
    
    // First day of current month
    const firstDayIndex = new Date(currentYear, currentMonth, 1).getDay();
    // Days in current month
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    // Days in previous month
    const daysInPrevMonth = new Date(currentYear, currentMonth, 0).getDate();

    // Padding from previous month
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const day = daysInPrevMonth - i;
      const prevDate = new Date(currentYear, currentMonth - 1, day);
      const dateStr = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      cells.push({
        dateStr,
        dayNum: day,
        isCurrentMonth: false,
        totalR: 0,
        futuresR: 0,
        forexR: 0,
        sessions: {
          asia: { trades: [], totalR: 0 },
          london: { trades: [], totalR: 0 },
          ny_am: { trades: [], totalR: 0 },
          ny_pm: { trades: [], totalR: 0 }
        },
        hasActivity: false,
        macroEvents: macroEventsByDate[dateStr] || []
      });
    }

    // Days of current month
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const dayTradingData = processedOutcomes[dateStr];
      
      const sessionsData: Record<SessionType, DaySessionData> = {
        asia: { trades: [], totalR: 0 },
        london: { trades: [], totalR: 0 },
        ny_am: { trades: [], totalR: 0 },
        ny_pm: { trades: [], totalR: 0 }
      };

      let dayTotalR = 0;
      let dayFuturesR = 0;
      let dayForexR = 0;
      let dayTradesCount = 0;
      let hasActivity = false;

      if (dayTradingData) {
        Object.keys(dayTradingData).forEach((sKey) => {
          const session = sKey as SessionType;
          const trades = dayTradingData[session];
          const sessionTotalR = trades.reduce((acc, t) => acc + getEffectiveRealizedR(t, activeIncludeFees, exitProfile), 0);
          sessionsData[session] = {
            trades,
            totalR: sessionTotalR
          };
          dayTotalR += sessionTotalR;
          trades.forEach(t => {
            dayTradesCount++;
            const r = getEffectiveRealizedR(t, activeIncludeFees, exitProfile);
            const mkt = getOutcomeMarket(t);
            if (mkt === 'forex') {
              dayForexR += r;
            } else {
              dayFuturesR += r;
            }
          });
        });
        hasActivity = dayTradesCount > 0;
      }

      const activeDayTotalR = currentMarketFilter === 'forex' 
        ? dayForexR 
        : currentMarketFilter === 'futures' 
          ? dayFuturesR 
          : dayTotalR;

      cells.push({
        dateStr,
        dayNum: day,
        isCurrentMonth: true,
        totalR: activeDayTotalR,
        futuresR: dayFuturesR,
        forexR: dayForexR,
        sessions: sessionsData,
        hasActivity,
        macroEvents: macroEventsByDate[dateStr] || []
      });
    }

    // Padding for next month to fill grid (42 cells = 6 rows)
    const remainingCells = 42 - cells.length;
    for (let day = 1; day <= remainingCells; day++) {
      const nextDate = new Date(currentYear, currentMonth + 1, day);
      const dateStr = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      cells.push({
        dateStr,
        dayNum: day,
        isCurrentMonth: false,
        totalR: 0,
        futuresR: 0,
        forexR: 0,
        sessions: {
          asia: { trades: [], totalR: 0 },
          london: { trades: [], totalR: 0 },
          ny_am: { trades: [], totalR: 0 },
          ny_pm: { trades: [], totalR: 0 }
        },
        hasActivity: false,
        macroEvents: macroEventsByDate[dateStr] || []
      });
    }

    return cells;
  }, [currentYear, currentMonth, processedOutcomes, currentMarketFilter, activeIncludeFees, exitProfile, macroEventsByDate]);

  const monthMacroDays = useMemo(
    () => calendarCells.filter((c) => c.isCurrentMonth && c.macroEvents.length > 0),
    [calendarCells]
  );

  const todayStr = getTodayPlainDateStr();

  // Navigate Months
  const handlePrevMonth = () => {
    setSelectedDayStr(null);
    setCurrentDate(new Date(currentYear, currentMonth - 1, 1));
  };

  const handleNextMonth = () => {
    setSelectedDayStr(null);
    setCurrentDate(new Date(currentYear, currentMonth + 1, 1));
  };

  // Find selected day data
  const selectedDayData = useMemo(() => {
    if (!selectedDayStr) return null;
    return calendarCells.find(c => c.dateStr === selectedDayStr && c.isCurrentMonth) || null;
  }, [selectedDayStr, calendarCells]);

  // Calculate day-specific splits for the selected day details drawer
  const { dayFuturesR, dayForexR } = useMemo(() => {
    let fut = 0;
    let fx = 0;
    if (selectedDayData) {
      const allTrades = [
        ...selectedDayData.sessions.asia.trades,
        ...selectedDayData.sessions.london.trades,
        ...selectedDayData.sessions.ny_am.trades,
        ...selectedDayData.sessions.ny_pm.trades
      ];
      allTrades.forEach(t => {
        const r = getEffectiveRealizedR(t, activeIncludeFees, exitProfile);
        const mkt = getOutcomeMarket(t);
        if (mkt === 'forex') {
          fx += r;
        } else {
          fut += r;
        }
      });
    }
    return { dayFuturesR: fut, dayForexR: fx };
  }, [selectedDayData, activeIncludeFees, exitProfile]);

  const handleDayClick = (cell: DayData) => {
    if (!cell.isCurrentMonth) return;
    if (selectedDayStr === cell.dateStr) {
      setSelectedDayStr(null); // Close if clicked again
    } else {
      setSelectedDayStr(cell.dateStr);
    }
  };

  const weekdayNames = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

  const renderExitProfileToggle = (stopPropagation = false) => (
    <div
      className="calendar-exit-toggle"
      role="group"
      aria-label="Exit target simulation"
      onClick={stopPropagation ? (e) => e.stopPropagation() : undefined}
    >
      {EXIT_PROFILE_OPTIONS.map((opt) => (
        <button
          key={opt.id}
          type="button"
          className="calendar-exit-btn"
          data-profile={opt.id}
          aria-pressed={exitProfile === opt.id}
          title={opt.title}
          onClick={() => setExitProfile(opt.id)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );

  const renderBaselineDelta = () => {
    if (exitProfile === '80_20') return null;
    const modeLabel = exitProfile === 'all_2r' ? 'All 2R' : 'All 3R';
    return (
      <>
        <span style={{ color: 'rgba(255,255,255,0.2)' }}>|</span>
        <span className="calendar-sim-badge">
          SIM ({modeLabel}):{' '}
          <strong className={getPnlClass(baselineDeltaR)}>
            {formatPNLString(baselineDeltaR)} ({formatCurrency(baselineDeltaR)})
          </strong>{' '}
          vs 80/20
        </span>
      </>
    );
  };

  // Render Minimized State
  if (!isExpanded) {
    return (
      <div className="session-calendar-wrapper font-mono">
        <div className="calendar-header-card glass-card" style={{ padding: '14px 20px', borderRadius: '10px', border: '1px solid rgba(255, 255, 255, 0.08)', background: 'rgba(255, 255, 255, 0.02)' }}>
          <div className="calendar-title-group" onClick={() => setIsExpanded(true)} style={{ cursor: 'pointer' }}>
            <span>📅</span>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                <h2 style={{ fontSize: '1.15rem' }}>Session Performance Calendar</h2>
                {enableStyleToggle && (
                  <div className="calendar-style-toggle" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      className={`calendar-style-btn ${activeStyleFilter === 'intraday' ? 'active intraday' : ''}`}
                      onClick={() => { setStyleFilter('intraday'); setSelectedDayStr(null); }}
                    >
                      📊 Intraday ({styleCounts.intraday})
                    </button>
                    <button
                      type="button"
                      className={`calendar-style-btn ${activeStyleFilter === 'scalp' ? 'active scalp' : ''}`}
                      onClick={() => { setStyleFilter('scalp'); setSelectedDayStr(null); }}
                    >
                      ⚡ Scalping ({styleCounts.scalp})
                    </button>
                    <button
                      type="button"
                      className={`calendar-style-btn ${activeStyleFilter === 'swing' ? 'active swing' : ''}`}
                      onClick={() => { setStyleFilter('swing'); setSelectedDayStr(null); }}
                    >
                      🌊 Swing ({styleCounts.swing})
                    </button>
                    <button
                      type="button"
                      className={`calendar-style-btn ${activeStyleFilter === 'all' ? 'active all' : ''}`}
                      onClick={() => { setStyleFilter('all'); setSelectedDayStr(null); }}
                    >
                      🌐 All ({styleCounts.all})
                    </button>
                  </div>
                )}
                <div className="calendar-market-toggle" onClick={(e) => e.stopPropagation()}>
                  <button 
                    type="button" 
                    className={`calendar-market-btn ${currentMarketFilter === 'all' ? 'active' : ''}`}
                    onClick={() => handleMarketFilterChange('all')}
                  >
                    🌐 All ({forexCount + futuresCount})
                  </button>
                  <button 
                    type="button" 
                    className={`calendar-market-btn forex ${currentMarketFilter === 'forex' ? 'active' : ''}`}
                    onClick={() => handleMarketFilterChange('forex')}
                  >
                    💱 Forex ({forexCount})
                  </button>
                  <button 
                    type="button" 
                    className={`calendar-market-btn futures ${currentMarketFilter === 'futures' ? 'active' : ''}`}
                    onClick={() => handleMarketFilterChange('futures')}
                  >
                    📈 Futures ({futuresCount})
                  </button>
                </div>
                <button
                  type="button"
                  className={`calendar-fees-toggle ${activeIncludeFees ? 'on' : 'off'}`}
                  onClick={(e) => { e.stopPropagation(); handleToggleFees(); }}
                  title="Toggle estimated broker round-turn fees & commissions on/off"
                >
                  💸 Fees: {activeIncludeFees ? 'ON' : 'OFF'}
                </button>
                {renderExitProfileToggle(true)}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '0.78rem', marginTop: '4px', flexWrap: 'wrap' }}>
                {currentMarketFilter === 'all' ? (
                  <>
                    <span className="market-split-label" style={{ color: 'var(--kdt-gold, #ffd700)' }}>CUMULATIVE:</span>
                    <span style={{ color: '#ccc' }}>Futures: <strong className={getPnlClass(totalFuturesR)}>{formatPNLString(totalFuturesR)} ({formatCurrency(totalFuturesR)})</strong></span>
                    <span style={{ color: 'rgba(255,255,255,0.2)' }}>|</span>
                    <span style={{ color: '#ccc' }}>Forex: <strong className={getPnlClass(totalForexR)}>{formatPNLString(totalForexR)} ({formatCurrency(totalForexR)})</strong></span>
                    <span style={{ color: 'rgba(255,255,255,0.2)' }}>|</span>
                    <span style={{ color: '#ccc' }}>Net: <strong className={getPnlClass(totalCombinedR)}>{formatPNLString(totalCombinedR)} ({formatCurrency(totalCombinedR)})</strong></span>
                  </>
                ) : currentMarketFilter === 'forex' ? (
                  <>
                    <span className="market-split-label" style={{ color: '#38bdf8' }}>FOREX CUMULATIVE:</span>
                    <span style={{ color: '#ccc' }}><strong className={getPnlClass(totalForexR)}>{formatPNLString(totalForexR)} ({formatCurrency(totalForexR)})</strong> across {forexCount} trades</span>
                  </>
                ) : (
                  <>
                    <span className="market-split-label" style={{ color: '#fbbf24' }}>FUTURES CUMULATIVE:</span>
                    <span style={{ color: '#ccc' }}><strong className={getPnlClass(totalFuturesR)}>{formatPNLString(totalFuturesR)} ({formatCurrency(totalFuturesR)})</strong> across {futuresCount} trades</span>
                  </>
                )}
                {renderBaselineDelta()}
                {activeIncludeFees && totalFeesR > 0 && (
                  <>
                    <span style={{ color: 'rgba(255,255,255,0.2)' }}>|</span>
                    <span style={{ color: '#f59e0b', fontSize: '0.74rem' }}>
                      Fees Deducted: -{totalFeesR.toFixed(2)}R (-${(totalFeesR * riskPerR).toFixed(2)})
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
          <button 
            type="button" 
            className="nav-btn" 
            onClick={() => setIsExpanded(true)} 
            style={{ width: 'auto', padding: '0 16px', fontSize: '0.8rem', whiteSpace: 'nowrap' }}
          >
            Expand Calendar &darr;
          </button>
        </div>
      </div>
    );
  }

  // Render Full Calendar View
  return (
    <div className="session-calendar-wrapper font-mono">
      {/* Calendar Header */}
      <div className="calendar-header-card glass-card" style={{ padding: '16px 20px', borderRadius: '10px', border: '1px solid rgba(255, 255, 255, 0.08)', background: 'rgba(255, 255, 255, 0.02)' }}>
        <div className="calendar-title-group">
          <span>📅</span>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <h2>Session Performance Calendar</h2>
              <button 
                type="button" 
                className="nav-btn" 
                onClick={() => {
                  setSelectedDayStr(null);
                  setIsExpanded(false);
                }} 
                style={{ width: 'auto', height: '24px', padding: '0 10px', fontSize: '0.7rem' }}
              >
                Collapse &uarr;
              </button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.78rem', marginTop: '6px', flexWrap: 'wrap' }}>
              {currentMarketFilter === 'all' ? (
                <>
                  <span className="market-split-label" style={{ color: 'var(--kdt-gold, #ffd700)' }}>CUMULATIVE PERFORMANCE:</span>
                  <span style={{ color: '#ccc' }}>Futures: <strong className={getPnlClass(totalFuturesR)}>{formatPNLString(totalFuturesR)} ({formatCurrency(totalFuturesR)})</strong></span>
                  <span style={{ color: 'rgba(255,255,255,0.2)' }}>|</span>
                  <span style={{ color: '#ccc' }}>Forex: <strong className={getPnlClass(totalForexR)}>{formatPNLString(totalForexR)} ({formatCurrency(totalForexR)})</strong></span>
                  <span style={{ color: 'rgba(255,255,255,0.2)' }}>|</span>
                  <span style={{ color: '#ccc' }}>Net: <strong className={getPnlClass(totalCombinedR)}>{formatPNLString(totalCombinedR)} ({formatCurrency(totalCombinedR)})</strong></span>
                </>
              ) : currentMarketFilter === 'forex' ? (
                <>
                  <span className="market-split-label" style={{ color: '#38bdf8' }}>FOREX CUMULATIVE:</span>
                  <span style={{ color: '#ccc' }}><strong className={getPnlClass(totalForexR)}>{formatPNLString(totalForexR)} ({formatCurrency(totalForexR)})</strong> across {forexCount} trades</span>
                </>
              ) : (
                <>
                  <span className="market-split-label" style={{ color: '#fbbf24' }}>FUTURES CUMULATIVE:</span>
                  <span style={{ color: '#ccc' }}><strong className={getPnlClass(totalFuturesR)}>{formatPNLString(totalFuturesR)} ({formatCurrency(totalFuturesR)})</strong> across {futuresCount} trades</span>
                </>
              )}
              {renderBaselineDelta()}
              {activeIncludeFees && totalFeesR > 0 && (
                <>
                  <span style={{ color: 'rgba(255,255,255,0.2)' }}>|</span>
                  <span style={{ color: '#f59e0b', fontSize: '0.74rem' }}>
                    Fees Deducted: -{totalFeesR.toFixed(2)}R (-${(totalFeesR * riskPerR).toFixed(2)})
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* 12-Month Yearly P&L Strip */}
        <div className="monthly-returns-strip">
          <div className="monthly-strip-header">
            <span className="monthly-strip-title">📆 {currentYear} MONTHLY RETURNS</span>
            <span className="monthly-strip-ytd">
              {currentYear} Total ({yearTradesCount} trades):{' '}
              <strong className={getPnlClass(yearTotalR)}>
                {formatPNLString(yearTotalR)} ({formatCurrency(yearTotalR)})
              </strong>
            </span>
          </div>
          <div className="monthly-strip-grid">
            {monthlyReturns.map((m) => {
              const isSelectedMonth = m.monthIndex === currentMonth;
              const hasTrades = m.trades > 0;
              const toneClass = !hasTrades
                ? 'empty'
                : m.netR > 0.01
                ? 'positive'
                : m.netR < -0.01
                ? 'negative'
                : 'flat';

              return (
                <button
                  key={m.label}
                  type="button"
                  className={`monthly-pill ${toneClass} ${isSelectedMonth ? 'active' : ''}`}
                  onClick={() => {
                    setSelectedDayStr(null);
                    setCurrentDate(new Date(currentYear, m.monthIndex, 1));
                  }}
                  title={`${monthNames[m.monthIndex]} ${currentYear}: ${m.trades} trades (${formatPNLString(m.netR)})`}
                >
                  <span className="monthly-pill-name">{m.label}</span>
                  <span className={`monthly-pill-r ${hasTrades ? getPnlClass(m.netR) : 'text-muted'}`}>
                    {hasTrades ? formatPNLString(m.netR) : '—'}
                  </span>
                  <span className="monthly-pill-usd">
                    {hasTrades ? formatCurrency(m.netR).replace('.00', '') : '0 trades'}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="calendar-controls" style={{ width: '100%', justifyContent: 'space-between', flexWrap: 'wrap' }}>
          {enableStyleToggle && (
            <div className="calendar-style-toggle">
              <button
                type="button"
                className={`calendar-style-btn ${activeStyleFilter === 'intraday' ? 'active intraday' : ''}`}
                onClick={() => { setStyleFilter('intraday'); setSelectedDayStr(null); }}
              >
                📊 Intraday ({styleCounts.intraday})
              </button>
              <button
                type="button"
                className={`calendar-style-btn ${activeStyleFilter === 'scalp' ? 'active scalp' : ''}`}
                onClick={() => { setStyleFilter('scalp'); setSelectedDayStr(null); }}
              >
                ⚡ Scalping ({styleCounts.scalp})
              </button>
              <button
                type="button"
                className={`calendar-style-btn ${activeStyleFilter === 'swing' ? 'active swing' : ''}`}
                onClick={() => { setStyleFilter('swing'); setSelectedDayStr(null); }}
              >
                🌊 Swing ({styleCounts.swing})
              </button>
              <button
                type="button"
                className={`calendar-style-btn ${activeStyleFilter === 'all' ? 'active all' : ''}`}
                onClick={() => { setStyleFilter('all'); setSelectedDayStr(null); }}
              >
                🌐 All ({styleCounts.all})
              </button>
            </div>
          )}

          {/* Market Toggle in Main Header Controls */}
          <div className="calendar-market-toggle">
            <button 
              type="button" 
              className={`calendar-market-btn ${currentMarketFilter === 'all' ? 'active' : ''}`}
              onClick={() => handleMarketFilterChange('all')}
            >
              🌐 All ({forexCount + futuresCount})
            </button>
            <button 
              type="button" 
              className={`calendar-market-btn forex ${currentMarketFilter === 'forex' ? 'active' : ''}`}
              onClick={() => handleMarketFilterChange('forex')}
            >
              💱 Forex ({forexCount})
            </button>
            <button 
              type="button" 
              className={`calendar-market-btn futures ${currentMarketFilter === 'futures' ? 'active' : ''}`}
              onClick={() => handleMarketFilterChange('futures')}
            >
              📈 Futures ({futuresCount})
            </button>
          </div>

          <button
            type="button"
            className={`calendar-fees-toggle ${activeIncludeFees ? 'on' : 'off'}`}
            onClick={handleToggleFees}
            title="Toggle estimated broker round-turn fees & commissions on/off"
          >
            💸 Fees: {activeIncludeFees ? 'ON' : 'OFF'}
          </button>

          {renderExitProfileToggle(false)}

          {/* Risk unit size selection */}
          <div className="risk-input-group">
            <span>Risk/Trade:</span>
            <input 
              type="number" 
              className="risk-input" 
              value={riskPerR} 
              onChange={(e) => setRiskPerR(Math.max(0, parseFloat(e.target.value) || 0))}
              min="0"
              step="10"
            />
            <span>USD</span>
          </div>

          {/* Month Navigator */}
          <div className="month-navigator">
            <button type="button" className="nav-btn" onClick={handlePrevMonth}>&larr;</button>
            <span className="current-month-display">{monthNames[currentMonth]} {currentYear}</span>
            <button type="button" className="nav-btn" onClick={handleNextMonth}>&rarr;</button>
          </div>
        </div>
      </div>

      {/* Macro Catalyst Legend & Month Quick-Jump Bar */}
      <div className="calendar-macro-legend-bar glass-card">
        <div className="macro-legend-keys">
          <span className="macro-legend-heading">MACRO CATALYSTS:</span>
          <span className="macro-key-item" title="US Consumer Price Index (08:30 AM ET)">
            <span className="day-macro-badge macro-cpi">CPI</span>
            <span className="macro-key-desc">08:30 ET</span>
          </span>
          <span className="macro-key-item" title="US Non-Farm Payrolls (08:30 AM ET)">
            <span className="day-macro-badge macro-nfp">NFP</span>
            <span className="macro-key-desc">08:30 ET</span>
          </span>
          <span className="macro-key-item" title="FOMC Rate Decision & Statement (02:00 PM ET)">
            <span className="day-macro-badge macro-fomc">FOMC</span>
            <span className="macro-key-desc">14:00 ET</span>
          </span>
          <span className="macro-legend-divider">|</span>
          <span className="session-legend-group">
            <span className="session-legend-item"><span className="session-dot asia" />Asia</span>
            <span className="session-legend-item"><span className="session-dot london" />London</span>
            <span className="session-legend-item"><span className="session-dot ny_am" />NY AM</span>
            <span className="session-legend-item"><span className="session-dot ny_pm" />NY PM</span>
          </span>
        </div>

        <div className="macro-legend-right">
          {monthMacroDays.length > 0 && (
            <div className="macro-month-chips">
              <span className="macro-legend-heading">{shortMonthNames[currentMonth]} RELEASES:</span>
              {monthMacroDays.map((dayCell) => {
                const primaryType = dayCell.macroEvents[0].type;
                const combinedLabel = dayCell.macroEvents.map((e) => e.label).join('/');
                const isSelected = selectedDayStr === dayCell.dateStr;
                return (
                  <button
                    key={dayCell.dateStr}
                    type="button"
                    className={`macro-month-chip macro-${primaryType.toLowerCase()} ${isSelected ? 'active' : ''}`}
                    onClick={() => handleDayClick(dayCell)}
                    title={dayCell.macroEvents.map((e) => `${e.title} (${e.timeET})`).join(' · ')}
                  >
                    <span>{shortMonthNames[currentMonth]} {dayCell.dayNum}</span>
                    <span className="macro-chip-type">{combinedLabel}</span>
                    {dayCell.hasActivity && (
                      <span className={`macro-chip-r ${getPnlClass(dayCell.totalR)}`}>
                        {formatPNLString(dayCell.totalR)}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
          <button
            type="button"
            className="asset-perf-trigger-btn"
            onClick={() => setShowAssetPerfModal(true)}
            title="Compare top performing vs worst performing assets over the last 7 or 30 days"
          >
            <span aria-hidden="true">📊</span>
            <span>Top vs Worst Assets</span>
          </button>
        </div>
      </div>

      {/* Weekdays Header */}
      <div className="calendar-grid">
        {weekdayNames.map(dayName => (
          <div key={dayName} className="weekday-header">
            {dayName}
          </div>
        ))}

        {/* Days Grid */}
        {calendarCells.map((cell, idx) => {
          const isToday = cell.dateStr === todayStr;
          const primaryMacroClass = cell.macroEvents.length > 0
            ? `has-macro-event macro-${cell.macroEvents[0].type.toLowerCase()}`
            : '';
          const cellClasses = [
            'calendar-day-cell',
            !cell.isCurrentMonth ? 'outside-month' : '',
            isToday ? 'today' : '',
            cell.hasActivity ? 'has-trades' : '',
            primaryMacroClass,
            selectedDayStr === cell.dateStr ? 'selected' : ''
          ].filter(Boolean).join(' ');

          const showR = cell.hasActivity ? formatPNLString(cell.totalR) : '';
          const showPL = cell.hasActivity ? formatCurrency(cell.totalR) : '';
          const pnlClass = getPnlClass(cell.totalR);

          return (
            <div 
              key={`${cell.dateStr}-${idx}`} 
              className={cellClasses}
              onClick={() => handleDayClick(cell)}
              style={selectedDayStr === cell.dateStr ? { borderColor: 'var(--kdt-gold, #ffd700)', background: 'rgba(255,215,0,0.08)' } : {}}
            >
              <div className="day-cell-header">
                <div className="day-number">{cell.dayNum}</div>
                {cell.macroEvents.length > 0 && (
                  <div className="day-macro-badges">
                    {cell.macroEvents.map((ev) => (
                      <span
                        key={`${cell.dateStr}-${ev.type}`}
                        className={`day-macro-badge macro-${ev.type.toLowerCase()}`}
                        title={`${ev.title} (${ev.timeET}) — ${ev.impactNote}`}
                      >
                        {ev.label}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              
              {cell.hasActivity && (
                <div className="day-pnl-summary">
                  <div className="day-combined-pnl">
                    <span className={`r-pnl-pill ${pnlClass}`} style={{ fontWeight: 900 }}>
                      {showR}
                    </span>
                    <span className="dollar-pnl-sub">
                      {showPL}
                    </span>
                  </div>

                  <div className="day-market-splits">
                    <span className="day-split-tag" title="Futures Realized R">
                      <span className="day-split-label">FUT</span>
                      <span className={`day-split-val ${getPnlClass(cell.futuresR)}`}>
                        {formatPNLString(cell.futuresR)}
                      </span>
                    </span>
                    <span className="day-split-divider">•</span>
                    <span className="day-split-tag" title="Forex Realized R">
                      <span className="day-split-label">FX</span>
                      <span className={`day-split-val ${getPnlClass(cell.forexR)}`}>
                        {formatPNLString(cell.forexR)}
                      </span>
                    </span>
                  </div>
                </div>
              )}

              {/* Dots representing active sessions on that day */}
              <div className="day-session-dots">
                {cell.sessions.asia.trades.length > 0 && <span className="session-dot asia" title="Asia Session" />}
                {cell.sessions.london.trades.length > 0 && <span className="session-dot london" title="London Session" />}
                {cell.sessions.ny_am.trades.length > 0 && <span className="session-dot ny_am" title="NY AM Session" />}
                {cell.sessions.ny_pm.trades.length > 0 && <span className="session-dot ny_pm" title="NY PM Session" />}
              </div>
            </div>
          );
        })}
      </div>

      {/* Expanded Details Drawer */}
      {selectedDayData && (
        <div className="calendar-details-drawer glass-card">
          <div className="drawer-header">
            <span className="drawer-title">
              🔍 PERFORMANCE DETAILS: {formatPlainDateHeading(selectedDayData.dateStr)}
            </span>
            <div className="drawer-summary-stats" style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <span className="drawer-stat-pill">
                Net Result: <strong className={getPnlClass(selectedDayData.totalR)}>{formatPNLString(selectedDayData.totalR)} ({formatCurrency(selectedDayData.totalR)})</strong>
              </span>
              <span className="drawer-stat-pill">
                Futures: <strong className={getPnlClass(dayFuturesR)}>{formatPNLString(dayFuturesR)}</strong>
              </span>
              <span className="drawer-stat-pill">
                Forex: <strong className={getPnlClass(dayForexR)}>{formatPNLString(dayForexR)}</strong>
              </span>
              <button type="button" className="close-drawer-btn" onClick={() => setSelectedDayStr(null)} style={{ marginLeft: '10px' }}>&times;</button>
            </div>
          </div>

          {selectedDayData.macroEvents.length > 0 && (
            <div className="drawer-macro-banner">
              {selectedDayData.macroEvents.map((ev) => (
                <div key={`${selectedDayData.dateStr}-${ev.type}`} className={`drawer-macro-item macro-${ev.type.toLowerCase()}`}>
                  <div className="drawer-macro-item-head">
                    <span className={`day-macro-badge macro-${ev.type.toLowerCase()}`}>{ev.label}</span>
                    <strong className="drawer-macro-title">{ev.title}</strong>
                    <span className="drawer-macro-time">{ev.timeET}</span>
                    {(ev.actual || ev.forecast || ev.previous) && (
                      <span className="drawer-macro-figures">
                        {ev.actual && <span>Actual: <strong>{ev.actual}</strong></span>}
                        {ev.forecast && <span>Forecast: <strong>{ev.forecast}</strong></span>}
                        {ev.previous && <span>Prev: <strong>{ev.previous}</strong></span>}
                      </span>
                    )}
                  </div>
                  <p className="drawer-macro-note">{ev.impactNote}</p>
                </div>
              ))}
            </div>
          )}

          <div className="sessions-details-grid">
            {/* 4 Sessions */}
            {(['asia', 'london', 'ny_am', 'ny_pm'] as SessionType[]).map((sessionKey) => {
              const sessionData = selectedDayData.sessions[sessionKey];
              const sessionNameFormatted = sessionKey === 'ny_am' ? 'NY AM' : sessionKey === 'ny_pm' ? 'NY PM' : sessionKey.toUpperCase();
              const hasActivity = sessionData.trades.length > 0;
              const cardClass = `session-detail-card ${sessionKey}-session-card ${hasActivity ? 'has-activity' : ''}`;
              const sessionPnlStr = formatPNLString(sessionData.totalR);
              const sessionDolStr = formatCurrency(sessionData.totalR);

              return (
                <div key={sessionKey} className={cardClass}>
                  <div className="session-card-header">
                    <span className="session-card-title">
                      <span className={`session-dot ${sessionKey}`} style={{ width: '8px', height: '8px' }}></span>
                      {sessionNameFormatted} SESSION
                    </span>
                    {hasActivity && (
                      <span className={`session-card-pnl ${getPnlClass(sessionData.totalR)}`}>
                        {sessionPnlStr} ({sessionDolStr})
                      </span>
                    )}
                  </div>

                  <div className="session-trades-list">
                    {hasActivity ? (
                      sessionData.trades.map((trade) => {
                        const isTp2 = Boolean(trade.outcome_type?.includes('tp2'));
                        const isTpWinner = Boolean(
                          trade.outcome_type?.includes('tp') ||
                            (trade.outcome_type?.includes('be') && trade.was_runner)
                        );
                        const isWin = isTpWinner;
                        const isLoss = trade.outcome_type?.includes('sl');
                        const r1Val = trade.r_multiple_1 && Number(trade.r_multiple_1) > 0 ? Number(trade.r_multiple_1) : 2;
                        const r2Val = trade.r_multiple_2 && Number(trade.r_multiple_2) > 0 ? Number(trade.r_multiple_2) : 3;
                        const grossR = getAccurateRealizedR(trade, exitProfile);
                        const feeR = estimateTradeFeeR(trade);
                        const tradeR = getEffectiveRealizedR(trade, activeIncludeFees, exitProfile);
                        const tradePnlClass = getPnlClass(tradeR);
                        const tradeStyle = getTradeStyleCategory(trade);
                        const telegramId = formatTelegramTradeId({ id: trade.setup_id || trade.id, instrument: trade.instrument });
                        const isCopied = copiedTradeId === trade.id || copiedTradeId === trade.setup_id;

                        const entryPrice = trade.entry_price || trade.entry_price_executed || trade.entry_price_recorded || trade.entry_zone_mid || 0;
                        const initialStop = trade.initial_stop || trade.stop || 0;
                        const exitPrice = trade.execution_price || (
                          trade.outcome_type?.includes('tp1') ? trade.tp1 :
                          trade.outcome_type?.includes('tp2') ? (trade.tp2 || trade.tp1) :
                          trade.outcome_type?.includes('sl') ? initialStop :
                          trade.outcome_type?.includes('be') ? entryPrice : undefined
                        );

                        return (
                          <div 
                            key={trade.id} 
                            className="session-trade-item"
                            onClick={() => setSelectedReviewSetup(convertOutcomeToSetup(trade, activeIncludeFees, exitProfile))}
                            title="Click to review trade audit and open chart view"
                          >
                            <div className="trade-item-header">
                              <span className="trade-symbol-bias">
                                {trade.instrument || 'SETUP'}
                                <span
                                  className="trade-strat-badge"
                                  style={{
                                    background: tradeStyle === 'scalp'
                                      ? 'rgba(245, 158, 11, 0.16)'
                                      : tradeStyle === 'swing'
                                      ? 'rgba(16, 185, 129, 0.16)'
                                      : 'rgba(99, 102, 241, 0.16)',
                                    border: `1px solid ${tradeStyle === 'scalp' ? '#f59e0b' : tradeStyle === 'swing' ? '#10b981' : '#818cf8'}`,
                                    color: tradeStyle === 'scalp' ? '#fbbf24' : tradeStyle === 'swing' ? '#34d399' : '#a5b4fc',
                                    fontSize: '0.6rem',
                                    fontWeight: 800,
                                    padding: '1px 5px',
                                    borderRadius: '4px',
                                  }}
                                >
                                  {tradeStyle === 'scalp' ? '⚡ SCALP' : tradeStyle === 'swing' ? '🌊 SWING' : '📊 INTRADAY'}
                                </span>
                                <span 
                                  className="trade-strat-badge" 
                                  style={{ 
                                    background: getOutcomeMarket(trade) === 'forex' ? 'rgba(56, 189, 248, 0.15)' : 'rgba(168, 85, 247, 0.15)',
                                    border: `1px solid ${getOutcomeMarket(trade) === 'forex' ? '#38bdf8' : '#a855f7'}`,
                                    color: getOutcomeMarket(trade) === 'forex' ? '#38bdf8' : '#c084fc',
                                    fontSize: '0.62rem',
                                    fontWeight: 800,
                                    padding: '1px 5px',
                                    borderRadius: '4px'
                                  }}
                                >
                                  {getOutcomeMarket(trade) === 'forex' ? '💱 FX' : '📈 FUT'}
                                </span>
                                <span className={`trade-strat-badge ${trade.bias}`}>
                                  {trade.bias?.toUpperCase()}
                                </span>
                                <span 
                                  className="trade-card-id-badge font-mono"
                                  title={`Trade ID: ${trade.setup_id || trade.id}\nClick to copy Trade ID`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigator.clipboard.writeText(telegramId);
                                    setCopiedTradeId(trade.id);
                                    setTimeout(() => setCopiedTradeId(null), 2000);
                                  }}
                                >
                                  {isCopied ? '✓ COPIED' : telegramId}
                                </span>
                              </span>
                              <span 
                                className="trade-outcome-pill" 
                                style={{
                                  background: isWin ? 'rgba(0, 230, 118, 0.15)' : isLoss ? 'rgba(255, 82, 82, 0.15)' : 'rgba(255, 255, 255, 0.08)',
                                  color: isWin ? '#00e676' : isLoss ? '#ff5252' : '#ccc'
                                }}
                              >
                                {trade.outcome_type?.toUpperCase()}
                              </span>
                            </div>

                            {/* Execution & Levels Grid */}
                            <div className="trade-levels-grid font-mono">
                              <div className="trade-level-col">
                                <span className="trade-level-label">Entry → Exit</span>
                                <span className="trade-level-val">
                                  {entryPrice > 0 ? entryPrice : '--'} → {exitPrice !== undefined && exitPrice > 0 ? exitPrice : '--'}
                                </span>
                              </div>
                              <div className="trade-level-col">
                                <span className="trade-level-label">Initial Stop</span>
                                <span className="trade-level-val" style={{ color: '#ff5252' }}>
                                  {initialStop > 0 ? initialStop : '--'}
                                </span>
                              </div>
                              <div className="trade-level-col">
                                <span className="trade-level-label">Target 1</span>
                                <span className="trade-level-val" style={{ color: '#00e676' }}>
                                  {trade.tp1 ? `${trade.tp1} (+${trade.r_multiple_1 || 2}R)` : '--'}
                                </span>
                              </div>
                              <div className="trade-level-col">
                                <span className="trade-level-label">Target 2</span>
                                <span className="trade-level-val" style={{ color: '#ffd700' }}>
                                  {trade.tp2 ? `${trade.tp2} (+${trade.r_multiple_2 || 3}R)` : '--'}
                                </span>
                              </div>
                            </div>
                            
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: '0.78rem', gap: '8px', flexWrap: 'wrap' }}>
                              <span style={{ color: 'var(--kdt-text-muted, #888)' }}>
                                Strategy: <span style={{ color: '#fff' }}>{trade.strategy_id || 'manna_snd'}</span>
                                {activeIncludeFees && (
                                  <span style={{ color: '#f59e0b', marginLeft: '6px', fontSize: '0.7rem' }}>
                                    (Gross {formatPNLString(grossR)} · Fee -{feeR.toFixed(2)}R)
                                  </span>
                                )}
                              </span>
                              <span className={`trade-pnl-value ${tradePnlClass}`}>
                                {formatPNLString(tradeR)} ({formatCurrency(tradeR)})
                              </span>
                            </div>

                            {isWin && (
                              <div style={{ fontSize: '0.67rem', color: '#a78bfa', background: 'rgba(167,139,250,0.1)', padding: '3px 8px', borderRadius: '4px', border: '1px solid rgba(167,139,250,0.25)', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                                <span>
                                  {exitProfile === 'all_2r'
                                    ? '🎯 All 2R Sim:'
                                    : exitProfile === 'all_3r'
                                    ? '🚀 All 3R Sim:'
                                    : '⚡ 80/20 Scale-Out:'}
                                </span>
                                <strong>
                                  {exitProfile === 'all_2r'
                                    ? `100% @ ${r1Val}R (+${r1Val.toFixed(2)}R)`
                                    : exitProfile === 'all_3r'
                                    ? isTp2
                                      ? `100% @ ${r2Val}R (+${r2Val.toFixed(2)}R)`
                                      : `100% @ BE (+0.00R) — hit ${r1Val}R, missed ${r2Val}R`
                                    : isTp2
                                    ? `80% @ ${r1Val}R (+${(r1Val * 0.8).toFixed(2)}R) + 20% @ ${r2Val}R (+${(r2Val * 0.2).toFixed(2)}R) = +${((r1Val * 0.8) + (r2Val * 0.2)).toFixed(2)}R`
                                    : `80% @ ${r1Val}R (+${(r1Val * 0.8).toFixed(2)}R) + 20% @ BE (+0.00R) = +${(r1Val * 0.8).toFixed(2)}R`}
                                </strong>
                              </div>
                            )}

                            <div className="trade-item-footer">
                              <span>Conviction: {trade.conviction_score || 85}%</span>
                              <span>
                                {trade.holding_duration_min !== undefined ? `${trade.holding_duration_min}m · ` : ''}
                                {trade.time_exited ? new Date(trade.time_exited).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'America/New_York' }) + ' ET' : ''}
                              </span>
                            </div>

                            <button
                              type="button"
                              className="trade-review-btn font-mono"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedReviewSetup(convertOutcomeToSetup(trade, activeIncludeFees, exitProfile));
                              }}
                            >
                              📊 Review Trade & Chart View
                            </button>
                          </div>
                        );
                      })
                    ) : (
                      <div className="no-trades-placeholder">No Concluded Trades</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Full Trade Review & Interactive Chart View Modal */}
      {selectedReviewSetup && (
        <SetupChartModal
          setup={selectedReviewSetup}
          onClose={() => setSelectedReviewSetup(null)}
        />
      )}

      {/* Top vs Worst Performing Assets Modal (7D / 30D) */}
      {showAssetPerfModal && (
        <AssetPerformanceModal
          outcomes={filteredOutcomesList}
          includeFees={activeIncludeFees}
          exitProfile={exitProfile}
          riskPerR={riskPerR}
          styleLabel={
            !enableStyleToggle || activeStyleFilter === 'intraday'
              ? 'Intraday'
              : activeStyleFilter === 'scalp'
              ? 'Scalping'
              : activeStyleFilter === 'swing'
              ? 'Swing'
              : 'All Styles'
          }
          marketLabel={
            currentMarketFilter === 'forex'
              ? 'Forex'
              : currentMarketFilter === 'futures'
              ? 'Futures'
              : 'All Markets'
          }
          onClose={() => setShowAssetPerfModal(false)}
        />
      )}
    </div>
  );
}
