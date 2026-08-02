import React, { useState, useEffect } from 'react';
import './MarketClosedBanner.css';
import { API_BASE } from '../config';

export const MarketClosedBanner: React.FC = () => {
  const [isClosed, setIsClosed] = useState<boolean>(false);
  const [countdownStr, setCountdownStr] = useState<string>('');
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);

  useEffect(() => {
    const checkMarketStatus = async () => {
      const now = new Date();

      // Check client ET time
      const formatOptions: Intl.DateTimeFormatOptions = {
        timeZone: 'America/New_York',
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      };
      const formatter = new Intl.DateTimeFormat('en-US', formatOptions);
      const parts = formatter.formatToParts(now);
      const weekday = parts.find(p => p.type === 'weekday')?.value;
      const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
      const minute = parseInt(parts.find(p => p.type === 'minute')?.value || '0', 10);
      const second = parseInt(parts.find(p => p.type === 'second')?.value || '0', 10);

      // Market close: Friday 17:00 ET to Sunday 17:00 ET
      let closed = false;
      if (weekday === 'Fri' && hour >= 17) closed = true;
      else if (weekday === 'Sat') closed = true;
      else if (weekday === 'Sun' && hour < 17) closed = true;

      // Try syncing with backend API if available
      try {
        const res = await fetch(`${API_BASE}/api/admin/system-status`);
        if (res.ok) {
          const data = await res.json();
          if (typeof data.isMarketOpen === 'boolean') {
            closed = !data.isMarketOpen;
          }
        }
      } catch {}

      setIsClosed(closed);

      if (closed) {
        // Calculate remaining time until next Sunday 17:00 ET
        // Find next Sunday 17:00 ET target timestamp
        // For simplicity: calculate hours remaining to Sunday 17:00 ET
        let daysUntilSunday = 0;
        if (weekday === 'Fri') daysUntilSunday = 2;
        else if (weekday === 'Sat') daysUntilSunday = 1;
        else if (weekday === 'Sun') daysUntilSunday = 0;

        const targetHour = 17;
        let totalSecondsRemaining = 0;

        if (weekday === 'Sun') {
          const currentTotalSec = hour * 3600 + minute * 60 + second;
          const targetTotalSec = targetHour * 3600;
          totalSecondsRemaining = Math.max(0, targetTotalSec - currentTotalSec);
        } else {
          const hoursLeftToday = 24 - hour - 1;
          const minutesLeftToday = 60 - minute - 1;
          const secondsLeftToday = 60 - second;
          const todaySecRemaining = hoursLeftToday * 3600 + minutesLeftToday * 60 + secondsLeftToday;
          
          const interimDays = Math.max(0, daysUntilSunday - 1);
          const interimSec = interimDays * 24 * 3600;

          const sundaySecBefore17 = 17 * 3600;
          totalSecondsRemaining = todaySecRemaining + interimSec + sundaySecBefore17;
        }

        const hrs = Math.floor(totalSecondsRemaining / 3600);
        const mins = Math.floor((totalSecondsRemaining % 3600) / 60);
        const secs = totalSecondsRemaining % 60;

        const formatted = `${String(hrs).padStart(2, '0')}h ${String(mins).padStart(2, '0')}m ${String(secs).padStart(2, '0')}s`;
        setCountdownStr(formatted);
      }
    };

    checkMarketStatus();
    const interval = setInterval(checkMarketStatus, 1000);
    return () => clearInterval(interval);
  }, []);

  if (!isClosed) return null;

  if (isCollapsed) {
    return (
      <div className="market-closed-bar-collapsed font-mono" onClick={() => setIsCollapsed(false)}>
        <span className="market-closed-pulse-dot"></span>
        <strong>🔴 MARKETS CLOSED (WEEKEND PAUSE)</strong>
        <span className="market-closed-timer-mini">Reopens in {countdownStr}</span>
        <button type="button" className="market-closed-expand-btn">Expand ↗</button>
      </div>
    );
  }

  return (
    <div className="market-closed-banner glass-card font-mono">
      <div className="market-closed-content">
        <div className="market-closed-header">
          <div className="market-closed-badge">
            <span className="market-closed-pulse-dot"></span>
            <span>🔴 GLOBAL MARKETS PAUSED</span>
          </div>
          <button 
            type="button" 
            className="market-closed-close-btn"
            onClick={() => setIsCollapsed(true)}
            title="Minimize Banner"
          >
            Minimize ✖
          </button>
        </div>

        <div className="market-closed-body">
          <div className="market-closed-title">
            Futures &amp; Forex Markets Closed for Weekend Pause
          </div>
          <p className="market-closed-subtitle">
            Global exchanges (CME &amp; Forex) are currently closed. Live market scanning and new signal discovery are paused until trading resumes on <strong>Sunday at 17:00 ET (5:00 PM ET)</strong>.
          </p>

          <div className="market-closed-timer-box">
            <span className="timer-label">⏱️ MARKET REOPEN COUNTDOWN:</span>
            <span className="timer-value">{countdownStr || 'Calculating...'}</span>
            <span className="timer-subtext">(Sunday 17:00 ET Globex / Asia Open)</span>
          </div>
        </div>
      </div>
    </div>
  );
};
