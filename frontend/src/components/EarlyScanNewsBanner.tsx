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
}

export const EarlyScanNewsBanner: React.FC = () => {
  const [status, setStatus] = useState<EarlyScanStatus | null>(null);

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
        // Silently catch network errors
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

  const { hasCompletedToday, earlyScanTimeET, standardScanTimeET, firstEvent, scheduledTimeET } = status;

  return (
    <div className={`early-scan-news-banner ${hasCompletedToday ? 'completed' : 'pending'}`}>
      <div className="container early-scan-banner-container">
        <div className="banner-badge-wrapper">
          <span className="pulse-beacon"></span>
          <span className="banner-badge">
            {hasCompletedToday ? '✅ FOREX EARLY SCAN COMPLETE' : '⚡ HIGH-IMPACT NEWS: FOREX SCAN RESCHEDULED'}
          </span>
        </div>

        <div className="banner-message-content">
          <div className="banner-headline">
            {hasCompletedToday ? (
              <span>
                Early Forex scan executed at <strong>{earlyScanTimeET}</strong> ahead of high-impact news. Standard Futures scan remains at <strong>{standardScanTimeET}</strong>.
              </span>
            ) : (
              <span>
                High-impact economic release scheduled: <strong>{firstEvent?.currency} {firstEvent?.title}</strong> at <strong>{scheduledTimeET}</strong>.
              </span>
            )}
          </div>
          <div className="banner-subtext">
            {hasCompletedToday ? (
              <span>Double-scan protection active: Forex market will not be rescanned at {standardScanTimeET}.</span>
            ) : (
              <span>
                Forex scanner will execute <strong>30 minutes earlier at {earlyScanTimeET}</strong> (standard: {standardScanTimeET}). Futures scanner remains scheduled at {standardScanTimeET}.
              </span>
            )}
          </div>
        </div>

        <div className="banner-timing-pill font-mono">
          <span className="timing-label">{hasCompletedToday ? 'STATUS' : 'FOREX SCAN'}</span>
          <span className="timing-value">{hasCompletedToday ? 'EXECUTED' : earlyScanTimeET}</span>
        </div>
      </div>
    </div>
  );
};
