import React, { useEffect, useState } from 'react';
import { API_BASE } from '../config';
import './NewsWarningBanner.css';

interface NewsEvent {
  id: string;
  title: string;
  currency: string;
  impact: string;
  eventTime: string;
  forecast?: string;
  previous?: string;
}

export const NewsWarningBanner: React.FC = () => {
  const [isLive, setIsLive] = useState<boolean | null>(null);
  const [nearestEvent, setNearestEvent] = useState<NewsEvent | null>(null);
  const [minutesUntil, setMinutesUntil] = useState<number | null>(null);

  useEffect(() => {
    const fetchNews = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/news/events`);
        if (!res.ok) return;
        const data = await res.json();
        setIsLive(data.isLive ?? false);
        if (data.nearestEvent) {
          setNearestEvent(data.nearestEvent);
          const diffMs = new Date(data.nearestEvent.eventTime).getTime() - Date.now();
          setMinutesUntil(Math.round(diffMs / 60000));
        } else {
          setNearestEvent(null);
        }
      } catch {
        setIsLive(false);
      }
    };

    fetchNews();
    const interval = setInterval(fetchNews, 30000); // refresh every 30s
    return () => clearInterval(interval);
  }, []);

  if (isLive === false) {
    return (
      <div className="news-warning-banner news-offline-banner">
        <div className="container news-banner-content">
          <span className="news-badge" style={{ background: 'rgba(255, 171, 0, 0.15)', color: '#ffb74d', borderColor: 'rgba(255, 183, 77, 0.4)' }}>
            ⚠️ CALENDAR FEED OFFLINE
          </span>
          <span className="news-title">
            Live economic calendar stream unavailable. Please check <strong>ForexFactory</strong> for live high-impact releases.
          </span>
          <a
            href="https://www.forexfactory.com/calendar"
            target="_blank"
            rel="noopener noreferrer"
            className="news-meta"
            style={{ textDecoration: 'underline', color: '#00e5ff', marginLeft: '8px' }}
          >
            Open ForexFactory.com ↗
          </a>
        </div>
      </div>
    );
  }

  if (!nearestEvent || minutesUntil === null || minutesUntil > 60 || minutesUntil < -30) {
    return null;
  }

  const isImminent = minutesUntil <= 30 && minutesUntil >= -15;

  return (
    <div className={`news-warning-banner ${isImminent ? 'imminent' : ''}`}>
      <div className="container news-banner-content">
        <span className="news-badge">⚠️ HIGH IMPACT NEWS ALERT</span>
        <span className="news-title">
          <strong>{nearestEvent.currency} {nearestEvent.title}</strong>
        </span>
        <span className="news-timer font-mono">
          {minutesUntil > 0
            ? `Releasing in ${minutesUntil} min`
            : `Released ${Math.abs(minutesUntil)} min ago (Volatility Active)`}
        </span>
        {nearestEvent.forecast && (
          <span className="news-meta">
            Forecast: {nearestEvent.forecast} | Prev: {nearestEvent.previous}
          </span>
        )}
      </div>
    </div>
  );
};

