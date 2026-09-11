import React, { useEffect, useState } from 'react';
import { API_BASE } from '../config';
import './EarlyScanNewsBanner.css';

interface EconomicEvent {
  id: string;
  title: string;
  currency: string;
  impact: string;
  eventTime: string;
  forecast?: string;
  previous?: string;
  actual?: string;
}

interface EarlyScanStatus {
  hasEarlyScanToday: boolean;
  hasCompletedToday: boolean;
  noticeSentToday: boolean;
  earlyScanTimeET: string;
  standardScanTimeET: string;
  targetMarket: string;
  events: EconomicEvent[];
  firstEvent: EconomicEvent | null;
  scheduledTimeET: string;
  bannerText: string;
  isEarlyScanNeeded?: boolean;
}

function formatET(isoStr: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    }).format(new Date(isoStr)) + ' ET';
  } catch {
    return 'NY AM';
  }
}

export const EarlyScanNewsBanner: React.FC = () => {
  const [status, setStatus] = useState<EarlyScanStatus | null>(null);
  const [isMinimized, setIsMinimized] = useState<boolean>(() => {
    try {
      return localStorage.getItem('early_scan_banner_minimized') === 'true';
    } catch {
      return false;
    }
  });

  const toggleMinimized = () => {
    setIsMinimized(prev => {
      const next = !prev;
      try {
        localStorage.setItem('early_scan_banner_minimized', String(next));
      } catch {}
      return next;
    });
  };

  useEffect(() => {
    let isMounted = true;
    const fetchStatus = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/news/early-scan-status`);
        if (!res.ok) return;
        const data = await res.json();
        if (isMounted) {
          setStatus(data);
        }
      } catch {
        // Silently catch fetch errors
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 30000); // Poll every 30 seconds
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  if (!status || !status.hasEarlyScanToday) {
    return null;
  }

  const { hasCompletedToday, earlyScanTimeET, standardScanTimeET, events = [], isEarlyScanNeeded, scheduledTimeET } = status;
  const isEarly = isEarlyScanNeeded ?? (earlyScanTimeET !== standardScanTimeET);

  // Compact event titles summary (e.g., "USD Core CPI, CPI m/m +2 more")
  const summaryEventTitles = events.length > 0
    ? events.map(e => e.currency ? `${e.currency} ${e.title}` : e.title).slice(0, 2).join(', ') + (events.length > 2 ? ` +${events.length - 2} more` : '')
    : '';

  return (
    <div className={`early-scan-news-banner ${hasCompletedToday ? 'completed' : 'pending'} ${isMinimized ? 'is-minimized' : ''}`}>
      <div className="container early-scan-banner-container">
        
        {/* Top Header / Summary Bar */}
        <div className="banner-top-row">
          <div className="banner-badge-group">
            <span className="pulse-beacon"></span>
            <span className="banner-badge">
              {hasCompletedToday
                ? (isEarly ? '✅ FOREX EARLY SCAN EXECUTED' : '✅ FOREX NEWS SCAN EXECUTED')
                : (isEarly ? '⚡ HIGH-IMPACT NEWS: FOREX SCAN RESCHEDULED' : '⚡ HIGH-IMPACT NEWS: PRE-NEWS FOREX SCAN')}
            </span>

            {/* Small summary displayed in-line when minimized */}
            {isMinimized && (
              <div className="banner-minimized-summary">
                {hasCompletedToday ? (
                  <span>Executed at <strong>{earlyScanTimeET}</strong> ahead of high-impact news</span>
                ) : (
                  <span>
                    Forex scan at <strong>{earlyScanTimeET}</strong> (30m pre-news)
                    {summaryEventTitles && (
                      <span className="banner-summary-events"> &bull; {events.length} Event{events.length > 1 ? 's' : ''}: <em>{summaryEventTitles}</em></span>
                    )}
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="banner-actions-group">
            <div className="banner-timing-pill font-mono">
              <span className="timing-label">
                {hasCompletedToday ? 'STATUS' : (isEarly ? 'RESCHEDULED' : 'PRE-NEWS')}
              </span>
              <span className="timing-value">{hasCompletedToday ? `COMPLETED ${earlyScanTimeET}` : earlyScanTimeET}</span>
            </div>

            <button
              type="button"
              className="banner-toggle-btn"
              onClick={toggleMinimized}
              aria-expanded={!isMinimized}
              title={isMinimized ? 'Expand full details' : 'Minimize to small summary'}
            >
              <span className="toggle-btn-text">{isMinimized ? 'Details' : 'Minimize'}</span>
              <svg
                className={`toggle-chevron ${isMinimized ? 'collapsed' : 'expanded'}`}
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points={isMinimized ? "6 9 12 15 18 9" : "18 15 12 9 6 15"}></polyline>
              </svg>
            </button>
          </div>
        </div>

        {/* Narrative Description & Full Events (Expanded Mode Only) */}
        {!isMinimized && (
          <>
            <div className="banner-narrative">
              {hasCompletedToday ? (
                isEarly ? (
                  <span>
                    The Forex scanner executed 30 minutes prior to news at <strong>{earlyScanTimeET}</strong> ahead of high-impact economic releases. Standard Futures scanner remains scheduled at <strong>{standardScanTimeET}</strong> (Double-scan protection active: Forex market will not be rescanned).
                  </span>
                ) : (
                  <span>
                    The Forex scanner executed 30 minutes prior to news at <strong>{earlyScanTimeET}</strong> ahead of high-impact economic releases along with the standard session scan.
                  </span>
                )
              ) : (
                isEarly ? (
                  <span>
                    Real high-impact economic news is scheduled during today's New York AM session. The <strong>Forex Scanner</strong> will execute <strong>30 minutes prior to news at {earlyScanTimeET}</strong> (standard: {standardScanTimeET}). The Futures scanner remains scheduled at <strong>{standardScanTimeET}</strong>.
                  </span>
                ) : (
                  <span>
                    Real high-impact economic news is scheduled during today's New York AM session ({scheduledTimeET}). The <strong>Forex Scanner</strong> will execute <strong>30 minutes prior to news at {earlyScanTimeET}</strong> (aligned with standard session open). Both Forex and Futures will scan at <strong>{standardScanTimeET}</strong>.
                  </span>
                )
              )}
            </div>

            {/* Real News Events List */}
            {events.length > 0 && (
              <div className="banner-events-section font-mono">
                <div className="banner-events-label">
                  <span>📰 SCHEDULED HIGH-IMPACT NEWS RELEASES:</span>
                </div>
                <div className="banner-events-grid">
                  {events.map((ev, idx) => {
                    const timeET = formatET(ev.eventTime);
                    const curLower = (ev.currency || 'usd').toLowerCase();
                    return (
                      <div key={ev.id || idx} className="banner-event-item">
                        <span className="event-time">{timeET}</span>
                        <span className={`event-curr-badge cur-${curLower}`}>{ev.currency}</span>
                        <span className="event-title">{ev.title}</span>
                        {ev.forecast && (
                          <span className="event-metrics">
                            Exp: <strong>{ev.forecast}</strong> {ev.previous ? `| Prev: ${ev.previous}` : ''}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}

      </div>
    </div>
  );
};
