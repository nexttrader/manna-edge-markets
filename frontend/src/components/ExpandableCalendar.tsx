import { useState, useMemo } from 'react';
import './ExpandableCalendar.css';

interface Outcome {
  id: string;
  setup_id: string;
  instrument?: string;
  market?: string;
  bias?: string;
  strategy_id?: string;
  conviction_score?: number;
  outcome_type: string;
  realized_r?: number;
  realized_pl?: number;
  execution_price?: number;
  execution_time?: string;
  time_signaled?: string;
  time_entered?: string;
  time_exited?: string;
  time_to_fill_min?: number;
  holding_duration_min?: number;
  killzone_origin?: string;
  created_at?: string;
}

interface ExpandableCalendarProps {
  outcomes: Outcome[];
  strategyFilter: string;
}

// Session definitions matching backend mapTimestampToKillzone
type SessionType = 'asia' | 'london' | 'ny_am' | 'ny_pm';

interface DaySessionData {
  trades: Outcome[];
  totalR: number;
}

interface DayData {
  dateStr: string; // YYYY-MM-DD
  dayNum: number;
  isCurrentMonth: boolean;
  totalR: number;
  sessions: Record<SessionType, DaySessionData>;
  hasActivity: boolean;
}

/**
 * Robust helper to map an outcome's exit time to a NY ET Trading Day and Session.
 * Since sessions span across midnight:
 * - Asia: 20:00 - 02:00 ET (20:00 of Day N-1 to 02:00 of Day N maps to Trading Day N)
 * - London: 02:00 - 08:00 ET of Day N maps to Trading Day N
 * - NY AM: 08:00 - 14:00 ET of Day N maps to Trading Day N
 * - NY PM: 14:00 - 20:00 ET of Day N maps to Trading Day N
 */
function getTradingDayAndSession(timeStr: string): { tradingDay: string; session: SessionType } {
  const exitTime = new Date(timeStr);
  
  // Format to America/New_York parts
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false
  });
  
  try {
    const parts = formatter.formatToParts(exitTime);
    const year = parts.find(p => p.type === 'year')!.value;
    const month = parts.find(p => p.type === 'month')!.value;
    const day = parts.find(p => p.type === 'day')!.value;
    const hour = parseInt(parts.find(p => p.type === 'hour')!.value, 10);
    
    let session: SessionType;
    let tradingDayDate = new Date(`${year}-${month}-${day}T12:00:00`); // Noon base to avoid offset drift
    
    if (hour >= 20) {
      session = 'asia';
      // Concludes in next day's session
      tradingDayDate.setDate(tradingDayDate.getDate() + 1);
    } else if (hour < 2) {
      session = 'asia';
    } else if (hour >= 2 && hour < 8) {
      session = 'london';
    } else if (hour >= 8 && hour < 14) {
      session = 'ny_am';
    } else {
      session = 'ny_pm';
    }
    
    const tYear = tradingDayDate.getFullYear();
    const tMonth = String(tradingDayDate.getMonth() + 1).padStart(2, '0');
    const tDay = String(tradingDayDate.getDate()).padStart(2, '0');
    
    return {
      tradingDay: `${tYear}-${tMonth}-${tDay}`,
      session
    };
  } catch (e) {
    // Fallback if parsing fails
    const isoDate = exitTime.toISOString().split('T')[0];
    return {
      tradingDay: isoDate,
      session: 'ny_am'
    };
  }
}

export function ExpandableCalendar({ outcomes = [], strategyFilter = 'all' }: ExpandableCalendarProps) {
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [selectedDayStr, setSelectedDayStr] = useState<string | null>(null);
  const [riskPerR, setRiskPerR] = useState<number>(100); // User adjustable risk size in USD

  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth(); // 0-indexed

  // Months labels
  const monthNames = [
    'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
    'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'
  ];

  // 1. Filter outcomes by the selected strategy and map them to trading days and sessions
  const processedOutcomes = useMemo(() => {
    // Filter by strategy
    const filtered = strategyFilter === 'all'
      ? outcomes
      : outcomes.filter(o => o.strategy_id === strategyFilter);

    // Group by Trading Day
    const grouped: Record<string, Record<SessionType, Outcome[]>> = {};

    filtered.forEach(o => {
      // Use time_exited, execution_time, or created_at
      const timeToUse = o.time_exited || o.execution_time || o.created_at;
      if (!timeToUse) return;

      const { tradingDay, session } = getTradingDayAndSession(timeToUse);
      
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
  }, [outcomes, strategyFilter]);

  // 2. Generate Calendar Month Grid Cells
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
        sessions: {
          asia: { trades: [], totalR: 0 },
          london: { trades: [], totalR: 0 },
          ny_am: { trades: [], totalR: 0 },
          ny_pm: { trades: [], totalR: 0 }
        },
        hasActivity: false
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
      let hasActivity = false;

      if (dayTradingData) {
        hasActivity = true;
        Object.keys(dayTradingData).forEach((sKey) => {
          const session = sKey as SessionType;
          const trades = dayTradingData[session];
          const sessionTotalR = trades.reduce((acc, t) => acc + (t.realized_r ?? 0), 0);
          sessionsData[session] = {
            trades,
            totalR: sessionTotalR
          };
          dayTotalR += sessionTotalR;
        });
      }

      cells.push({
        dateStr,
        dayNum: day,
        isCurrentMonth: true,
        totalR: dayTotalR,
        sessions: sessionsData,
        hasActivity
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
        sessions: {
          asia: { trades: [], totalR: 0 },
          london: { trades: [], totalR: 0 },
          ny_am: { trades: [], totalR: 0 },
          ny_pm: { trades: [], totalR: 0 }
        },
        hasActivity: false
      });
    }

    return cells;
  }, [currentYear, currentMonth, processedOutcomes]);

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

  const handleDayClick = (cell: DayData) => {
    if (!cell.isCurrentMonth) return;
    if (selectedDayStr === cell.dateStr) {
      setSelectedDayStr(null); // Close if clicked again
    } else {
      setSelectedDayStr(cell.dateStr);
    }
  };

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

  const weekdayNames = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

  return (
    <div className="session-calendar-wrapper font-mono">
      {/* Calendar Header */}
      <div className="calendar-header-card glass-card" style={{ padding: '16px 20px', borderRadius: '10px', border: '1px solid rgba(255, 255, 255, 0.08)', background: 'rgba(255, 255, 255, 0.02)' }}>
        <div className="calendar-title-group">
          <span>📅</span>
          <div>
            <h2>Session Performance Calendar</h2>
            <span style={{ fontSize: '0.78rem', color: 'var(--kdt-text-muted, #888)' }}>
              Tracks realized R & P&L aggregated by trading session daily (NY Time)
            </span>
          </div>
        </div>

        <div className="calendar-controls">
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

      {/* Weekdays Header */}
      <div className="calendar-grid">
        {weekdayNames.map(dayName => (
          <div key={dayName} className="weekday-header">
            {dayName}
          </div>
        ))}

        {/* Days Grid */}
        {calendarCells.map((cell, idx) => {
          const isToday = new Date().toDateString() === new Date(cell.dateStr).toDateString();
          const cellClasses = [
            'calendar-day-cell',
            !cell.isCurrentMonth ? 'outside-month' : '',
            isToday ? 'today' : '',
            cell.hasActivity ? 'has-trades' : '',
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
              <div className="day-number">{cell.dayNum}</div>
              
              {cell.hasActivity && (
                <div className="day-pnl-summary">
                  <span className={`r-pnl-pill ${pnlClass}`} style={{ fontWeight: 900 }}>
                    {showR}
                  </span>
                  <span className="dollar-pnl-sub">
                    {showPL}
                  </span>
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
              🔍 PERFORMANCE DETAILS: {new Date(selectedDayData.dateStr + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </span>
            <div className="drawer-summary-stats">
              <span className="drawer-stat-pill">
                Net Result: <strong className={getPnlClass(selectedDayData.totalR)}>{formatPNLString(selectedDayData.totalR)} ({formatCurrency(selectedDayData.totalR)})</strong>
              </span>
              <button type="button" className="close-drawer-btn" onClick={() => setSelectedDayStr(null)}>&times;</button>
            </div>
          </div>

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
                        const isWin = trade.outcome_type?.includes('tp');
                        const isLoss = trade.outcome_type?.includes('sl');
                        const tradeR = trade.realized_r ?? 0;
                        const tradePnlClass = getPnlClass(tradeR);

                        return (
                          <div key={trade.id} className="session-trade-item">
                            <div className="trade-item-header">
                              <span className="trade-symbol-bias">
                                {trade.instrument || 'SETUP'}
                                <span className={`trade-strat-badge ${trade.bias}`}>
                                  {trade.bias?.toUpperCase()}
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
                            
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: '0.78rem' }}>
                              <span style={{ color: 'var(--kdt-text-muted, #888)' }}>
                                Strategy: <span style={{ color: '#fff' }}>{trade.strategy_id || 'sentinel_v2'}</span>
                              </span>
                              <span className={`trade-pnl-value ${tradePnlClass}`}>
                                {formatPNLString(tradeR)}
                              </span>
                            </div>

                            <div className="trade-item-footer">
                              <span>Conviction: {trade.conviction_score || 85}%</span>
                              <span>
                                {trade.time_exited ? new Date(trade.time_exited).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'America/New_York' }) + ' ET' : ''}
                              </span>
                            </div>
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
    </div>
  );
}
