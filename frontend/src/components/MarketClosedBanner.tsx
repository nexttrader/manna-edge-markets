import React, { useState, useEffect } from 'react';
import './MarketClosedBanner.css';
import { API_BASE } from '../config';

export const MarketClosedBanner: React.FC = () => {
  const [isClosed, setIsClosed] = useState<boolean>(false);
  const [forexClosed, setForexClosed] = useState<boolean>(false);
  const [futuresClosed, setFuturesClosed] = useState<boolean>(false);
  const [forexReopen, setForexReopen] = useState<string>('');
  const [futuresReopen, setFuturesReopen] = useState<string>('');
  const [forexCountdown, setForexCountdown] = useState<string>('');
  const [futuresCountdown, setFuturesCountdown] = useState<string>('');
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);

  // Helper to format remaining time
  const formatCountdown = (targetTimeStr: string) => {
    if (!targetTimeStr) return '';
    const target = new Date(targetTimeStr).getTime();
    const now = Date.now();
    const diff = target - now;
    if (diff <= 0) return 'Opening soon...';
    
    const totalSecs = Math.floor(diff / 1000);
    const days = Math.floor(totalSecs / 86400);
    const hrs = Math.floor((totalSecs % 86400) / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;
    
    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    parts.push(`${String(hrs).padStart(2, '0')}h`);
    parts.push(`${String(mins).padStart(2, '0')}m`);
    parts.push(`${String(secs).padStart(2, '0')}s`);
    return parts.join(' ');
  };

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/admin/system-status`);
        if (res.ok) {
          const data = await res.json();
          // Fallback checks
          const fxClosed = typeof data.isForexMarketOpen === 'boolean' ? !data.isForexMarketOpen : false;
          const futClosed = typeof data.isFuturesMarketOpen === 'boolean' ? !data.isFuturesMarketOpen : false;
          
          setForexClosed(fxClosed);
          setFuturesClosed(futClosed);
          setIsClosed(fxClosed || futClosed);
          
          if (data.forexReopenTime) setForexReopen(data.forexReopenTime);
          if (data.futuresReopenTime) setFuturesReopen(data.futuresReopenTime);
        }
      } catch (err) {
        console.error('Failed to sync market status with backend API:', err);
      }
    };

    fetchStatus();
    // Poll API status every 10 seconds
    const apiInterval = setInterval(fetchStatus, 10000);

    return () => clearInterval(apiInterval);
  }, []);

  // Update countdown timers every second
  useEffect(() => {
    if (!isClosed) return;

    const updateCountdowns = () => {
      if (forexClosed && forexReopen) {
        setForexCountdown(formatCountdown(forexReopen));
      }
      if (futuresClosed && futuresReopen) {
        setFuturesCountdown(formatCountdown(futuresReopen));
      }
    };

    updateCountdowns();
    const secInterval = setInterval(updateCountdowns, 1000);

    return () => clearInterval(secInterval);
  }, [isClosed, forexClosed, futuresClosed, forexReopen, futuresReopen]);

  // Format reopen date string nicely for label
  const formatReopenLabel = (isoStr: string) => {
    if (!isoStr) return '';
    try {
      const date = new Date(isoStr);
      return date.toLocaleTimeString('en-US', {
        timeZone: 'America/New_York',
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
        timeZoneName: 'short'
      });
    } catch {
      return '';
    }
  };

  if (!isClosed) return null;

  if (isCollapsed) {
    return (
      <div className="market-closed-bar-collapsed font-mono" onClick={() => setIsCollapsed(false)}>
        <div className="collapsed-left">
          <span className="market-closed-pulse-dot"></span>
          <strong>⚠️ MARKET TRADING PAUSE ACTIVE</strong>
          <span className="market-collapsed-status-badges">
            Forex: <span className={forexClosed ? "status-tag-closed" : "status-tag-open"}>{forexClosed ? "CLOSED" : "OPEN"}</span>
            {" | "}
            Futures: <span className={futuresClosed ? "status-tag-closed" : "status-tag-open"}>{futuresClosed ? "CLOSED" : "OPEN"}</span>
          </span>
        </div>
        <div className="collapsed-right">
          {forexClosed && <span className="mini-timer">Forex reopens in {forexCountdown}</span>}
          {futuresClosed && <span className="mini-timer">Futures reopens in {futuresCountdown}</span>}
          <button type="button" className="market-closed-expand-btn">Expand ↗</button>
        </div>
      </div>
    );
  }

  return (
    <div className="market-closed-banner glass-card font-mono">
      <div className="market-closed-content">
        <div className="market-closed-header">
          <div className="market-closed-badge">
            <span className="market-closed-pulse-dot"></span>
            <span>🔴 MARKET PAUSE DETECTED</span>
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
            Financial Exchange Operational Hours Status
          </div>
          <p className="market-closed-subtitle">
            Discovery scans are automatically blocked for closed markets to align with real-world trading times. Existing signals remain active.
          </p>

          <div className="market-cards-container">
            {/* Forex Market Card */}
            <div className={`market-status-card ${forexClosed ? 'card-closed' : 'card-open'}`}>
              <div className="market-card-header">
                <span className="market-card-title">Forex Market (24/5)</span>
                <span className={`status-pill ${forexClosed ? 'pill-closed' : 'pill-open'}`}>
                  {forexClosed ? 'CLOSED' : 'OPEN'}
                </span>
              </div>
              {forexClosed ? (
                <div className="market-card-timer">
                  <span className="card-timer-label">⏱️ REOPENS IN:</span>
                  <span className="card-timer-value">{forexCountdown || 'Calculating...'}</span>
                  <span className="card-timer-subtext">Resumes: {formatReopenLabel(forexReopen)}</span>
                </div>
              ) : (
                <div className="market-card-timer live-running">
                  <span className="running-dot"></span>
                  <span className="running-text">Scanning & discovery active</span>
                </div>
              )}
            </div>

            {/* Futures Market Card */}
            <div className={`market-status-card ${futuresClosed ? 'card-closed' : 'card-open'}`}>
              <div className="market-card-header">
                <span className="market-card-title">CME Futures Market</span>
                <span className={`status-pill ${futuresClosed ? 'pill-closed' : 'pill-open'}`}>
                  {futuresClosed ? 'CLOSED' : 'OPEN'}
                </span>
              </div>
              {futuresClosed ? (
                <div className="market-card-timer">
                  <span className="card-timer-label">⏱️ REOPENS IN:</span>
                  <span className="card-timer-value">{futuresCountdown || 'Calculating...'}</span>
                  <span className="card-timer-subtext">Resumes: {formatReopenLabel(futuresReopen)}</span>
                </div>
              ) : (
                <div className="market-card-timer live-running">
                  <span className="running-dot"></span>
                  <span className="running-text">Scanning & discovery active</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
